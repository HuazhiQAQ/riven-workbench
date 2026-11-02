/* _probe_fill.cjs —— 挂单侧三处新逻辑的回归探针
 *
 *   node _probe_fill.cjs            （只打印）
 *   node _probe_fill.cjs --verbose  （连填表全程日志一起打）
 *
 * 跑在 测试/wm-sim-bare.html（wm-sim.js 高保真仿真 WM 表单）上，逐个用例断言：
 *   ① checkPayload  合法载荷正常填完；正面 4 条 / 数值 0 / 超范围 一律「一个字都不写」
 *   ② nameOracle    卡名唯一候选 / 多候选 / 空 —— 三条分支
 *   ③ pruneStatRows 多余空行能删；没有删除按钮时立刻收手
 * 每个用例之间 reload 页面，互不污染。
 */
'use strict';
const path = require('path');
const { toFileUrl, openPage } = require('./cdp.cjs');

const VERBOSE = process.argv.includes('--verbose');
const PAGE = path.resolve(__dirname, '../测试/wm-sim-bare.html');

const OK4 = {
  weapon: 'Pura-manticon',
  pos: [
    { name: 'Damage to Infested', wm: 'Damage to Infested', value: 1.56, mult: true },
    { name: 'Damage to Corpus', wm: 'Damage to Corpus', value: 1.52, mult: true },
    { name: 'Damage to Grineer', wm: 'Damage to Grineer', value: 1.49, mult: true }
  ],
  neg: [{ name: 'Execution Damage', wm: 'Execution Damage', value: -103.6, mult: false }]
};
const clone = o => JSON.parse(JSON.stringify(o));

const CASES = [
  {
    name: '① 合法载荷（3 正 1 负）',
    data: clone(OK4),
    want: [
      ['没被自检拦下', r => !r.log.some(l => l.indexOf('载荷自检没过') >= 0)],
      ['预览 4 条', r => r.preview.length === 4],
      ['数值全对', r => {
        const ex = { 'Damage to Infested': 'x1.56', 'Damage to Corpus': 'x1.52', 'Damage to Grineer': 'x1.49', 'Execution Damage': '-103.60%' };
        return r.preview.every(p => ex[p.name] === p.val) && r.preview.length === 4;
      }],
      ['卡名唯一候选', r => r.log.some(l => l.indexOf('✓ WM 生成卡名：') === 0 || l.indexOf('✓ WM 生成卡名：') > 0)],
      ['词条行 3+1', r => r.rows === 5]          /* 4 行词条 + 1 行「+ Add」 */
    ]
  },
  {
    name: '② 正面 4 条 → 自检必须拦下',
    data: (() => {
      const d = clone(OK4);
      d.pos.push({ name: 'Critical Chance', wm: 'Critical Chance', value: 120, mult: false });
      return d;
    })(),
    want: [
      ['拦下', r => r.log.some(l => l.indexOf('载荷自检没过') >= 0)],
      ['报「正面词条 4 条」', r => r.log.some(l => l.indexOf('正面词条 4 条') > 0)],
      ['页面一个字没写（预览 0 条）', r => r.preview.length === 0],
      ['武器框还是空的', r => r.weapon === '']
    ]
  },
  {
    name: '③ 数值 0 / 超范围 → 自检必须拦下',
    data: (() => {
      const d = clone(OK4);
      d.pos[0].value = 0;
      d.pos[2].value = 12.5;                     /* 倍率词条上限 4 */
      return d;
    })(),
    want: [
      ['拦下', r => r.log.some(l => l.indexOf('载荷自检没过') >= 0)],
      ['报数值是 0', r => r.log.some(l => l.indexOf('数值是 0') > 0)],
      ['报超范围', r => r.log.some(l => l.indexOf('超出合理范围') > 0)],
      ['页面一个字没写', r => r.preview.length === 0]
    ]
  },
  {
    name: '④ 表单多出 2 条空行 → 应该删掉',
    prep: 'window.__WM_SIM_ADD__(3);',
    data: clone(OK4),
    want: [
      ['日志有「删掉一条多余空行」', r => r.log.filter(l => l.indexOf('删掉一条多余空行') >= 0).length === 2],
      ['确实点了 2 次删除', r => r.removed === 2],
      ['最终仍 3+1 行', r => r.rows === 5],
      ['预览仍 4 条', r => r.preview.length === 4]
    ]
  },
  {
    name: '⑤ 多余空行但找不到删除按钮 → 收手不硬来',
    prep: 'window.__WM_SIM_NO_DEL__ = true; window.__WM_SIM_ADD__(3);',
    data: clone(OK4),
    want: [
      ['报「没有删除按钮」', r => r.log.some(l => l.indexOf('没有删除按钮') > 0)],
      ['没删任何行', r => r.removed === 0],
      ['照常填完（预览 4 条）', r => r.preview.length === 4]
    ]
  },
  {
    name: '⑥ 卡名多候选 → 提示组合有歧义',
    prep: "window.__WM_SIM_SET_MODNAME__(['Pura Acri-critatis', 'Pura Acri-critatus']);",
    data: clone(OK4),
    want: [
      ['报 2 个候选', r => r.log.some(l => l.indexOf('2 个候选卡名') > 0)],
      ['提示有歧义', r => r.log.some(l => l.indexOf('组合有歧义') > 0)]
    ]
  },
  {
    name: '⑦ 卡名是空的 → 提示 WM 没认这组词条',
    prep: 'window.__WM_SIM_SET_MODNAME__([]);',
    data: clone(OK4),
    want: [
      ['报「是空的」', r => r.log.some(l => l.indexOf('裂罅Mod名称」是空的') > 0)],
      ['仍把词条填完', r => r.preview.length === 4]
    ]
  }
];

function reload(cdp) {
  return cdp.eval('location.reload(), 1').catch(() => null);
}
async function waitReady(cdp) {
  for (let i = 0; i < 40; i++) {
    try {
      if (await cdp.eval('!!(window.__WM_SIM_READY__ && window.__WM_FILL_FAST__ && document.querySelectorAll("div.auction-create__stats").length)')) return true;
    } catch (_) { /* 导航中，重试 */ }
    await new Promise(r => setTimeout(r, 150));
  }
  return false;
}

async function main() {
  const page = await openPage(toFileUrl(PAGE));
  const cdp = page.cdp;
  let fail = 0;
  try {
    if (!await waitReady(cdp)) throw new Error('仿真页没就绪');
    await cdp.eval('window.__WM_FILL_LOG__.length = 0');

    for (const c of CASES) {
      await reload(cdp);
      if (!await waitReady(cdp)) throw new Error('reload 后没就绪：' + c.name);

      const out = await cdp.eval(`(async () => {
        ${c.prep || ''}
        window.__WM_FILL_LOG__.length = 0;
        window.__WM_FILL_DATA__ = ${JSON.stringify(c.data)};
        try { await window.__WM_FILL_FAST__(); }
        catch (e) { window.__WM_FILL_LOG__.push('EXC: ' + ((e && e.message) || e)); }
        const pv = [...document.querySelectorAll('ul.riven-preview__attributes > li')].map(li => ({
          val: ((li.querySelector('b') || {}).textContent || '').trim(),
          name: ((li.querySelector('span') || {}).textContent || '').trim()
        }));
        const st = window.__WM_STATE__;
        return JSON.stringify({
          log: window.__WM_FILL_LOG__.slice(),
          preview: pv,
          weapon: (st.weaponRow.input.value || '').trim(),
          rows: document.querySelectorAll('div.auction-create__stats').length,
          removed: st.removed || 0
        });
      })()`, { awaitPromise: true });
      const r = JSON.parse(out);

      console.log('\n══ ' + c.name + ' ══');
      let bad = 0;
      c.want.forEach(([label, fn]) => {
        let pass = false;
        try { pass = !!fn(r); } catch (e) { pass = false; }
        if (!pass) bad++;
        console.log('   ' + (pass ? 'PASS' : 'FAIL') + '  ' + label);
      });
      if (VERBOSE) r.log.forEach(l => console.log('        | ' + l));
      else if (bad) r.log.slice(-14).forEach(l => console.log('        | ' + l));
      if (bad) fail++;
    }

    const exc = cdp.logs.filter(l => l.indexOf('[exception]') >= 0);
    console.log('\n（JS 报错）' + (exc.length ? '\n  ' + exc.slice(0, 5).join('\n  ') : '无'));
    console.log(fail ? '\n结果：' + fail + ' 个用例未通过' : '\n结果：全部用例通过');
  } finally {
    page.kill();
  }
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
