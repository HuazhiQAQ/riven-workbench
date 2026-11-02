/* _probe_textparse.cjs —— 文本识别（#ocrText 那个「生成」框）回归
 *
 *   node _probe_textparse.cjs [产物.html]
 *
 * 验的是 window.RivenOCR.generate 这条用户直接可用的入口：
 *   ① 卡面原样三种写法（换行 / 「/」分隔 / 空格连写）都要出同样 4 条
 *      —— 数值在前、词条在后，靠「分段 + 就近配对」认，不能错位、不能丢行
 *   ② 后坐力：卡面 -92.2% 落在正面（减后坐力是好事），识别后仍是负号
 *   ③ 负词条没有词缀：sati-visimag 的三个词根只对应三个正面词条
 *   ④ 简称 / 自由文本的老用法不能被改坏（黄金值）
 */
'use strict';
const path = require('path');
const { toFileUrl, openPage, sleep, latestProduct } = require('./cdp.cjs');

const FILE = process.argv[2] || latestProduct();

const CARD = {
  '换行': 'Boar sati-visimag\n-92.2% Weapon Recoil\n+138.9% Multishot\n+177.3% Damage\n-40.9% Reload Speed',
  '斜杠': 'Boar sati-visimag / -92.2%Weapon Recoil / +138.9%Multishot / +177.3%Damage / -40.9%Reload Speed',
  '连写': 'Boar sati-visimag -92.2% Weapon Recoil +138.9% Multishot +177.3% Damage -40.9% Reload Speed'
};
/* 行号 / 符号 / 数值 —— 与卡面一一对应 */
const WANT = [[25, '-', 92.2], [19, '+', 138.9], [2, '+', 177.3], [23, '-', 40.9]];

/* [输入, 武器, 期望词条, 是否要求条数完全相等]
   泰瑟步枪那条会多带一条推算出来的「对异变体的伤害」（改前就这样），只比前缀 */
const GOLD = [
  ['双爆多负触发的托里德', '托里德', [[4, '+', 185.6], [5, '+', 148.5], [19, '+', 111.4], [6, '-', 72.9]], 1],
  ['绝路 prime 双暴多负变焦', '圣装绝路', [[4, '+', 245], [19, '+', 147], [26, '-', 32.1]], 1],
  ['泰瑟步枪 79.7多重射击 82.1病毒伤害', '泰瑟步枪', [[19, '+', 79.7], [38, '+', 82.1]], 0]
];

(async () => {
  const p = await openPage(toFileUrl(path.resolve(FILE), '#/'));
  const cdp = p.cdp;
  const fail = [];
  let total = 0;
  try {
    for (let i = 0; i < 120; i++) {
      if (await cdp.eval('document.readyState === "complete" && !!(window.RivenOCR && window.RivenOCR.generate)')) break;
      await sleep(500);
    }
    if (!(await cdp.eval('!!(window.RivenOCR && window.RivenOCR.generate)'))) {
      console.log('✗ 页面没有 RivenOCR.generate'); process.exit(1);
    }

    const gen = txt => cdp.eval(`(() => {
      const r = window.RivenOCR.generate(${JSON.stringify(txt)});
      if (!r) return null;
      return {
        weapon: r.weapon ? (r.weapon.cn || r.weapon.en) : '',
        affixes: (r.affixes || []).map(a => ({
          row: a.drow != null ? a.drow : a.row,
          sign: a.sign,
          value: +a.value
        }))
      };
    })()`);

    const eq = (a, b) => Math.abs(a - b) < 0.051;

    /* ① 卡面三种写法 */
    for (const k of Object.keys(CARD)) {
      const r = await gen(CARD[k]);
      total++;
      if (!r) { fail.push([k, '没认出来']); continue; }
      if (r.weapon !== '野猪') fail.push([k, '武器 ' + r.weapon + '（期望 野猪）']);
      const got = r.affixes;
      if (got.length !== WANT.length) {
        fail.push([k, '词条 ' + got.length + ' 条（期望 4）：' + JSON.stringify(got)]);
        continue;
      }
      WANT.forEach((w, i) => {
        const g = got[i];
        if (g.row !== w[0]) fail.push([k, '#' + (i + 1) + ' 行号 ' + g.row + '（期望 ' + w[0] + '）']);
        if (g.sign !== w[1]) fail.push([k, '#' + (i + 1) + ' 符号 ' + g.sign + '（期望 ' + w[1] + '）']);
        if (!eq(g.value, w[2])) fail.push([k, '#' + (i + 1) + ' 数值 ' + g.value + '（期望 ' + w[2] + '）']);
      });
    }

    /* ② 后坐力落在正面时是负号（卡面 -92.2% 原样保留） */
    const rc = await gen(CARD['换行']);
    total++;
    const rcA = rc && rc.affixes.find(a => a.row === 25);
    if (!rcA) fail.push(['后坐力正面', '没认出 25 行']);
    else if (rcA.sign !== '-') fail.push(['后坐力正面', '符号 ' + rcA.sign + '（应为 -，减后坐力是好事）']);

    /* ③ 负词条没有词缀：词根只覆盖三个正面词条 */
    const pr = await cdp.eval(`(() => {
      const r = window.RivenOCR.parseRivenName('sati-visimag');
      return r && r.rows ? r.rows.slice().sort((a, b) => a - b) : null;
    })()`);
    total++;
    const wantRows = [2, 19, 25];
    if (!pr || pr.length !== 3 || pr.join(',') !== wantRows.join(',')) {
      fail.push(['词缀 -> 行号', JSON.stringify(pr) + '（期望 ' + wantRows.join(',') + '）']);
    }

    /* ④ 简称 / 自由文本黄金值 */
    for (const [txt, wpn, want, exact] of GOLD) {
      const r = await gen(txt);
      total++;
      if (!r) { fail.push([txt, '没认出来']); continue; }
      if (r.weapon !== wpn) fail.push([txt, '武器 ' + r.weapon + '（期望 ' + wpn + '）']);
      const got = r.affixes;
      if ((exact && got.length !== want.length) || got.length < want.length) {
        fail.push([txt, '词条 ' + JSON.stringify(got)]); continue;
      }
      want.forEach((w, i) => {
        const g = got[i];
        if (g.row !== w[0] || g.sign !== w[1] || !eq(g.value, w[2])) {
          fail.push([txt, '#' + (i + 1) + ' 实得 ' + JSON.stringify(g) + ' 期望 ' + JSON.stringify(w)]);
        }
      });
    }

    console.log('用例 ' + total + ' 组');
    if (fail.length) {
      console.log('✗ 失败 ' + fail.length + ' 条：');
      fail.slice(0, 20).forEach(f => console.log('  [' + f[0] + '] ' + f[1]));
      process.exit(1);
    }
    console.log('✅ 全部通过');
  } finally {
    p.kill();
  }
})().catch(e => { console.error(e); process.exit(1); });
