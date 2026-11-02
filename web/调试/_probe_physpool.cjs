'use strict';
/* _probe_physpool.cjs —— 物理词条（冲击/切割/穿刺）进池判据：武器自带该类型才可能洗出
 *   node debug/_probe_physpool.cjs <产物.html>
 *
 * 断言：
 *   [1] 有冲击但占比 <25% 的步枪 → 词条下拉里有「冲击伤害」（旧规则会挡掉）
 *   [2] 完全没有冲击的步枪 → 下拉里没有「冲击伤害」
 *   [3] 完全没有切割的步枪 → 下拉里没有「切割伤害」
 *   [4] 有切割的同一把 → 下拉里有「切割伤害」
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

/* 在页面里按条件挑步枪：mode = thin（有该类型但占比 <0.25） / none（完全没有该类型） */
const findW = (mode, key) => `(function(){
  var W = window.ZKDATA.weapons, DB = window.WEAPON_DB || [];
  var byEn = {}, byZ = {};
  DB.forEach(function (x) {
    if (x.n) byEn[String(x.n).toLowerCase()] = x;
    if (x.z) byZ[x.z] = x;
  });
  function db(w) {
    return byEn[String(w.en || '').toLowerCase()] || byZ[w.cn] ||
           byEn[String(w.intl || '').toLowerCase()] || null;
  }
  function share(w) {
    var d = db(w); if (!d || !d.at) return null;
    var g = d.at.dmg || {}, tot = 0, k;
    for (k in g) if (Object.prototype.hasOwnProperty.call(g, k)) tot += g[k];
    if (!(tot > 0)) return null;
    return { impact: (g.impact || 0) / tot, slash: (g.slash || 0) / tot, puncture: (g.puncture || 0) / tot };
  }
  var key = ${JSON.stringify(key)}, mode = ${JSON.stringify(mode)};
  for (var i = 0; i < W.length; i++) {
    var w = W[i];
    if (w.cat !== '步枪' || w.var === '变体·有本体') continue;
    var s = share(w);
    if (!s) continue;
    if (mode === 'thin' && s[key] > 0 && s[key] < 0.25) return { i: i, intl: w.intl || w.cn, share: s[key] };
    if (mode === 'none' && !(s[key] > 0)) return { i: i, intl: w.intl || w.cn, share: s[key] };
    if (mode === 'has' && s[key] > 0) return { i: i, intl: w.intl || w.cn, share: s[key] };
  }
  return null;
})()`;

const pickCalc = (idx, name) => `(function(){
  var inp = document.getElementById('q'); if (!inp) return 'noq';
  inp.value = ${JSON.stringify(name)};
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  var el = document.querySelector('#cands [data-a="pick"][data-i="' + ${idx} + '"]');
  if (!el) return 'nocand';
  el.click(); return 'ok';
})()`;

const rowsOf = i => `(function(){
  var s = document.querySelector('#calc-body [data-a="krow"][data-i="${i}"]');
  if (!s) return null;
  return [].slice.call(s.options).map(function (o) { return +o.value; });
})()`;

async function typeRows(q, w) {
  await q(`(function(){ location.hash='#/calc'; return 1; })()`);
  await sleep(500);
  const r = await q(pickCalc(w.i, w.intl));
  await sleep(450);
  return { ok: r, rows: await q(rowsOf(0)) };
}

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

    /* [1] 有冲击但占比很低的武器 → 现在能选冲击 */
    const thin = await q(findW('thin', 'impact'));
    ck('找到「有冲击但占比 <25%」的步枪', !!thin, true);
    if (thin) {
      console.log('     低占比冲击：' + thin.intl + '（占比 ' + (thin.share * 100).toFixed(2) + '%）');
      const a = await typeRows(q, thin);
      ck('选中它', a.ok, 'ok');
      ck('下拉里有「冲击伤害」（旧规则会挡掉）', a.rows.indexOf(13) >= 0, true);
    }

    /* [2] 完全没有冲击 → 没有冲击 */
    const noImp = await q(findW('none', 'impact'));
    ck('找到「没有冲击」的步枪', !!noImp, true);
    if (noImp) {
      console.log('     无冲击：' + noImp.intl);
      const b = await typeRows(q, noImp);
      ck('选中它', b.ok, 'ok');
      ck('下拉里没有「冲击伤害」', b.rows.indexOf(13), -1);
    }

    /* [3] 完全没有切割 → 没有切割 */
    const noSlash = await q(findW('none', 'slash'));
    ck('找到「没有切割」的步枪', !!noSlash, true);
    if (noSlash) {
      console.log('     无切割：' + noSlash.intl);
      const c = await typeRows(q, noSlash);
      ck('选中它', c.ok, 'ok');
      ck('下拉里没有「切割伤害」', c.rows.indexOf(14), -1);
    }

    /* [4] 有切割的武器 → 有切割 */
    const hasSlash = await q(findW('has', 'slash'));
    ck('找到「有切割」的步枪', !!hasSlash, true);
    if (hasSlash) {
      const d = await typeRows(q, hasSlash);
      ck('选中它', d.ok, 'ok');
      ck('下拉里有「切割伤害」', d.rows.indexOf(14) >= 0, true);
    }

    ck('全程无页面异常', await q(`(window.__zkErrs||window.__errs||[]).length`), 0);
  } finally {
    try { p.kill(); } catch (e) { /* 关不掉不影响结论 */ }
  }
  console.log(fail ? ('❌ 失败 ' + fail + ' 条 （' + pass + '/' + (pass + fail) + '）')
                   : ('✅ 全部通过（' + pass + '/' + pass + '）'));
  process.exit(fail ? 1 : 0);
})();
