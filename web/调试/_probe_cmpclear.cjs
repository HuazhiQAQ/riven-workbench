'use strict';
/* _probe_cmpclear.cjs —— 倾向版 02「对比变体倾向」：没有变体的武器必须清空
 *   node debug/_probe_cmpclear.cjs <倾向版.html>
 *
 * 断言：
 *   [1] 数据侧：嫣红 潘塔 = 变体·有本体 / 本体名 潘塔 / 不在可开卡池（源表已改）
 *   [2] 选「没有变体」的武器 → #cmp 为空、对比列也空
 *   [3] 先选有变体的武器（#cmp 有值），再切回没变体的 → #cmp 被清空（不留旧值）
 *   [4] 选「变体·有本体」武器本身 → #cmp = 它本体那一把的倾向
 */
const path = require('path');
const { openPage, toFileUrl } = require('./cdp.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ck(n, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? '  ✓ ' : '  ✗ ') + n + ' = ' + JSON.stringify(got) + (ok ? '' : '（期望 ' + JSON.stringify(want) + '）'));
  ok ? pass++ : fail++;
}
const FILE = process.argv[2] || require('./cdp.cjs').latestProduct();

const FIND = kind => `(function(){
  var W = window.ZKDATA.weapons, m = {};
  var hd = function (w) { return (window.ZKC && ZKC.dispReal) ? ZKC.dispReal(w) : w.disp; };
  W.forEach(function (w) { var b = w.bcn || w.cn; (m[b] = m[b] || []).push(w); });
  var k = ${JSON.stringify(kind)};
  for (var i = 0; i < W.length; i++) {
    var w = W[i];
    if (k === 'variant') {                       /* 变体·有本体 本身 */
      if (w.var === '变体·有本体') return { i: i, name: w.intl || w.cn, cn: w.cn, disp: w.disp, hd: hd(w) };
      continue;
    }
    if (w.var !== '本体') continue;
    var g = m[w.bcn || w.cn] || [];
    if (k === 'novar' && g.length === 1) return { i: i, name: w.intl || w.cn, cn: w.cn, hd: hd(w) };
    if (k === 'hasvar') {
      for (var j = 0; j < g.length; j++) {
        if (g[j].var === '变体·有本体')
          return { i: i, name: w.intl || w.cn, cn: w.cn, vdisp: g[j].disp, hd: hd(w), vcn: g[j].cn };
      }
    }
  }
  return null;
})()`;

const pick = (idx, name) => `(function(){
  var inp = document.getElementById('q'); if (!inp) return 'noq';
  inp.value = ${JSON.stringify(name)};
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  var el = document.querySelector('#cands [data-a="pick"][data-i="' + ${idx} + '"]');
  if (!el) return 'nocand';
  el.click(); return 'ok';
})()`;

const readCmp = `(function(){
  var i = document.getElementById('cmp');
  var rows = document.querySelectorAll('#calc-body table.res tr');
  var last = '';
  if (rows.length > 1) {
    var tds = rows[1].children;
    last = ((tds[tds.length - 1] || {}).textContent || '').trim();
  }
  return { cmp: i ? i.value : null, last: last, rows: rows.length };
})()`;

/* 对比列只在「当前值有数」时才算 —— 先给第一行填词条+数值，否则读到的空是假空 */
const fillFirst = `(function(){
  var s = document.querySelector('#calc-body [data-a="krow"][data-i="0"]');
  if (s) { s.value = '2'; s.dispatchEvent(new Event('change', { bubbles: true })); }
  var inp = document.querySelector('#calc-body [data-a="kval"][data-i="0"]');
  if (inp) {
    inp.value = '100';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return [s ? s.value : null, inp ? inp.value : null];
})()`;

(async () => {
  setTimeout(function () { console.error('WATCHDOG'); process.exit(3); }, 200000);
  const p = await openPage(toFileUrl(path.resolve(FILE), '#/calc'));
  const q = async e => { try { return await p.cdp.eval(e); } catch (err) { return 'ERR:' + err.message; } };
  try {
    await p.cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 900, deviceScaleFactor: 1, mobile: false
    }).catch(() => {});
    await sleep(2400);
    for (let i = 0; i < 40; i++) {
      const t = await q(`(document.querySelector('#eng')||{}).textContent||''`);
      if (String(t).indexOf('引擎就绪') >= 0) break;
      await sleep(250);
    }

    /* [1] 数据侧：源表改动是否落地 */
    const data = await q(`(function(){
      var W = window.ZKDATA.weapons, hit = null;
      for (var i = 0; i < W.length; i++) if (W[i].intl === '嫣红 潘塔') { hit = W[i]; break; }
      var inPool = (window.ZKOPENABLE || []).some(function (w) { return w.intl === '嫣红 潘塔'; });
      return { var: hit && hit.var, bcn: hit && hit.bcn, ben: hit && hit.ben,
               pool: (window.ZKOPENABLE || []).length, inPool: inPool };
    })()`);
    ck('嫣红 潘塔 = 变体·有本体', data.var, '变体·有本体');
    ck('嫣红 潘塔 的本体名 = 潘塔 / Penta', [data.bcn, data.ben], ['潘塔', 'Penta']);
    ck('可开卡池 419 且不含嫣红 潘塔', [data.pool, data.inPool], [419, false]);

    /* [2] 没有变体的武器 → 对比口：倾向版留空 / 统一版给历史倾向 */
    const uni = await q(`!!(window.ZKC && window.ZKC.isUnified())`);
    const novar = await q(FIND('novar'));
    ck('找到一把没有变体的武器', !!novar, true);
    console.log('     无变体武器：' + (novar && novar.cn) + '（口径 ' + (uni ? '统一 ▸ 对比历史倾向' : '倾向 ▸ 对比变体倾向') + '）');
    ck('选中它', await q(pick(novar.i, novar.name)), 'ok');
    await sleep(500);
    await q(fillFirst);
    await sleep(350);
    const c1 = await q(readCmp);
    if (uni) {
      ck('统一口径：无变体武器 → 对比口 = 它的历史倾向（不再留空）',
        [c1.cmp !== '', Math.abs(parseFloat(c1.cmp) - novar.hd) < 1e-9], [true, true]);
    } else {
      ck('没有变体的武器：对比口为空', c1.cmp, '');
      ck('没有变体的武器：对比列也为空', c1.last, '');
    }

    /* [3] 切到有变体的武器 → 再切回无变体：统一版换成这把自己的历史值，倾向版必须清空 */
    const hasvar = await q(FIND('hasvar'));
    ck('找到一把有变体的武器', !!hasvar, true);
    console.log('     有变体武器：' + (hasvar && hasvar.cn) + '（变体 ' + (hasvar && hasvar.vcn) + '）');
    ck('选中它', await q(pick(hasvar.i, hasvar.name)), 'ok');
    await sleep(500);
    await q(fillFirst);
    await sleep(350);
    const c2 = await q(readCmp);
    if (uni) {
      ck('统一口径：对比口 = 这把自己的历史倾向',
        [String(c2.cmp), Math.abs(parseFloat(c2.cmp) - hasvar.hd) < 1e-9], [String(hasvar.hd), true]);
    } else {
      ck('有变体的武器：对比口 = 变体那把的倾向',
        [String(c2.cmp), Math.abs(parseFloat(c2.cmp) - hasvar.vdisp) < 1e-9], [String(hasvar.vdisp), true]);
    }
    ck('有变体的武器：对比列有数', c2.last !== '', true);

    ck('再切回无变体武器', await q(pick(novar.i, novar.name)), 'ok');
    await sleep(500);
    await q(fillFirst);
    await sleep(350);
    const c3 = await q(readCmp);
    if (uni) {
      ck('统一口径：切回后对比口换成这把自己的历史倾向（不留上一把的值）',
        [c3.cmp !== '', Math.abs(parseFloat(c3.cmp) - novar.hd) < 1e-9,
         hasvar.hd === novar.hd || String(c3.cmp) !== String(c2.cmp)], [true, true, true]);
    } else {
      ck('切回去后对比口被清空（不留旧值）', c3.cmp, '');
      ck('切回去后对比列也空', c3.last, '');
    }

    /* [4] 变体·有本体 本身 → 对比它的本体 */
    const va = await q(FIND('variant'));
    ck('找到一把变体·有本体', !!va, true);
    ck('选中它', await q(pick(va.i, va.name)), 'ok');
    await sleep(500);
    const c4 = await q(readCmp);
    ck('变体·有本体：对比口有值（本体那把的倾向）',
      [c4.cmp !== '' && isFinite(parseFloat(c4.cmp)), true], [true, true]);

    ck('全程无页面异常', await q(`(window.__zkErrs||window.__errs||[]).length`), 0);
  } finally {
    try { p.kill(); } catch (e) { /* 关不掉不影响结论 */ }
  }
  console.log(fail ? ('❌ 失败 ' + fail + ' 条 （' + pass + '/' + (pass + fail) + '）')
                   : ('✅ 全部通过（' + pass + '/' + pass + '）'));
  process.exit(fail ? 1 : 0);
})();
