'use strict';
/* _probe_advscope4.cjs —— 真实流程：02 选卡 → 导入 04 → 05 填进阶微调 → 回 04 看面板/伤害数字
 *   node debug/_probe_advscope4.cjs <产物.html>
 */
const path = require('path');
const { openPage, toFileUrl } = require('./cdp.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FILE = process.argv[2] || require('./cdp.cjs').latestProduct();

const PICKW = `(function(){
  var W = window.ZKDATA.weapons, i = -1;
  for (var k = 0; k < W.length; k++) if (W[k].intl === 'Torid' || W[k].cn === '托里德') { i = k; break; }
  if (i < 0) return 'noweapon';
  var inp = document.getElementById('q'); if (!inp) return 'noq';
  inp.value = W[i].intl || W[i].cn;
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  var el = document.querySelector('#cands [data-a="pick"][data-i="' + i + '"]');
  if (!el) return 'nocand';
  el.click(); return 'ok:' + (W[i].intl || W[i].cn);
})()`;

const FILLROWS = `(function(){
  var rows = [4, 5, 37, 26], vals = [200.9, 145.5, 119.8, -62.9], out = [];
  for (var i = 0; i < 4; i++) {
    var s = document.querySelector('#calc-body [data-a="krow"][data-i="' + i + '"]');
    if (s) { s.value = String(rows[i]); s.dispatchEvent(new Event('change', { bubbles: true })); }
    var v = document.querySelector('#calc-body [data-a="kval"][data-i="' + i + '"]');
    if (v) { v.value = String(vals[i]); v.dispatchEvent(new Event('input', { bubbles: true }));
             v.dispatchEvent(new Event('change', { bubbles: true })); }
    out.push([s && s.value, v && v.value]);
  }
  return out;
})()`;

const IMPORT = `(function(){
  var b = document.querySelector('[data-a="kdmg"]');
  if (!b) return 'nobtn';
  b.click(); return 'ok';
})()`;

const READ04 = `(function(){
  var tiles = [];
  var ts = document.querySelectorAll('#g-panel .wtile');
  for (var i = 0; i < ts.length; i++) tiles.push((ts[i].textContent || '').replace(/\\s+/g, ' ').trim());
  var big = document.getElementById('g-big');
  var arch = document.getElementById('g-archs');
  return {
    tiles: tiles,
    big: big ? (big.innerText || big.textContent || '').replace(/\\s+/g, ' ').slice(0, 200) : null,
    arch1: arch ? (arch.innerText || '').replace(/\\s+/g, ' ').slice(0, 160) : null,
    advhint: (document.getElementById('g-advhint') || {}).textContent
  };
})()`;

(async () => {
  setTimeout(function () { console.error('WATCHDOG'); process.exit(3); }, 220000);
  const p = await openPage(toFileUrl(path.resolve(FILE), '#/calc'));
  const q = async e => { try { return await p.cdp.eval(e); } catch (err) { return 'ERR:' + err.message; } };
  const go = async h => { await q(`location.hash = '${h}'`); await sleep(1000); };
  const line = (t, o) => console.log('  · ' + t + ' = ' + JSON.stringify(o));
  try {
    await p.cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }).catch(() => {});
    await sleep(2400);
    for (let i = 0; i < 40; i++) {
      const t = await q(`(document.querySelector('#eng')||{}).textContent||''`);
      if (String(t).indexOf('引擎就绪') >= 0) break;
      await sleep(250);
    }

    line('02 选武器', await q(PICKW));
    await sleep(700);
    line('02 填 4 行词条', await q(FILLROWS));
    await sleep(700);
    line('点「导入收益计算」', await q(IMPORT));
    await sleep(1500);
    const s0 = await q(READ04);
    console.log('  [导入后 04 面板] ' + JSON.stringify(s0.tiles));
    console.log('  [导入后 04 big]  ' + JSON.stringify(s0.big));

    await go('#/choose');
    await sleep(1000);
    line('05 武器（是否自动同步）', await q(`(document.getElementById('wq')||{}).value`));
    line('05 按流派装填', await q(`(function(){ var b=document.getElementById('afgo'); if(!b) return 'nobtn'; b.click(); return 'ok'; })()`));
    await sleep(1200);
    line('05 填进阶微调', await q(`(function(){
      var set=function(sel,v){ var e=document.querySelector(sel); if(!e) return 'no'; e.value=v;
        e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return 'ok'; };
      return [set('#advenemy [data-ak="armor"]','3000'), set('#advenemy [data-ak="strip"]','50'),
              set('#advmods [data-ak="dmg"]','100'), set('#advmods [data-ak="cc"]','180')]; })()`));
    await sleep(1200);
    line('05 微调提示', await q(`(document.getElementById('advhint')||{}).textContent`));

    await go('#/dmg');
    await sleep(1200);
    const s1 = await q(READ04);
    console.log('  [05 微调后 04 面板] ' + JSON.stringify(s1.tiles));
    console.log('  [05 微调后 04 big]  ' + JSON.stringify(s1.big));
    const sameTiles = JSON.stringify(s0.tiles) === JSON.stringify(s1.tiles);
    const sameBig = JSON.stringify(s0.big) === JSON.stringify(s1.big);
    const sameArch = JSON.stringify(s0.arch1) === JSON.stringify(s1.arch1);
    console.log((sameTiles ? '  ✓ ' : '  ✗ ') + '04 武器面板未变 = ' + sameTiles);
    console.log((sameBig ? '  ✓ ' : '  ✗ ') + '04 主数字未变 = ' + sameBig);
    console.log((sameArch ? '  ✓ ' : '  ✗ ') + '04 流派对照未变 = ' + sameArch);
    line('04 微调提示', s1.advhint);
  } finally {
    try { p.kill(); } catch (e) {}
  }
  console.log('诊断结束');
  process.exit(0);
})();
