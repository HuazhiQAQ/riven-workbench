'use strict';
/* _probe_advscope6.cjs —— 05 有真实卡时，04 的微调会不会改 05 的数字
 *   node debug/_probe_advscope6.cjs <产物.html>
 */
const path = require('path');
const { openPage, toFileUrl } = require('./cdp.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FILE = process.argv[2] || require('./cdp.cjs').latestProduct();

const PICKW = `(function(){
  var W = window.ZKDATA.weapons, i = -1;
  for (var k = 0; k < W.length; k++) if (W[k].intl === 'Torid' || W[k].cn === '托里德') { i = k; break; }
  var inp = document.getElementById('wq'); if (!inp || i < 0) return 'noq';
  inp.value = W[i].intl || W[i].cn;
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  var b = document.querySelector('#wlist button[data-k]');
  if (!b) return 'nobtn';
  b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  return 'ok';
})()`;

const PARSE = `(function(){
  var ta = document.getElementById('txA'); if (!ta) return 'nota';
  ta.value = '+91.9% 触发几率\\n+133.2% 暴击几率\\n+2.8 穿透\\n-40.8% 弹匣容量';
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  var b = document.getElementById('txgoA'); if (!b) return 'nobtn';
  b.click(); return 'ok';
})()`;

const READ05 = `(function(){
  var g = function(id){ var e = document.getElementById(id); return e ? (e.innerText||'').replace(/\\s+/g,' ').trim() : null; };
  return {
    conc: (g('repConc')||'').slice(0, 260),
    rep: (g('repBody')||'').slice(0, 260),
    panA: (g('cpA')||'').slice(0, 200),
    tkey: (window.__DM && window.__DM.tkey) ? window.__DM.tkey() : null,
    advhint: g('advhint')
  };
})()`;

const FILL04 = `(function(){
  var set=function(sel,v){ var e=document.querySelector(sel); if(!e) return 'no'; e.value=v;
    e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return 'ok'; };
  return [set('#g-advenemy [data-ak="armor"]','600'), set('#g-advmods [data-ak="dmg"]','250')];
})()`;

(async () => {
  setTimeout(function () { console.error('WATCHDOG'); process.exit(3); }, 220000);
  const p = await openPage(toFileUrl(path.resolve(FILE), '#/choose'));
  const q = async e => { try { return await p.cdp.eval(e); } catch (err) { return 'ERR:' + err.message; } };
  const go = async h => { await q(`location.hash = '${h}'`); await sleep(1100); };
  try {
    await p.cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }).catch(() => {});
    await sleep(2400);
    for (let i = 0; i < 40; i++) {
      const t = await q(`(document.querySelector('#eng')||{}).textContent||''`);
      if (String(t).indexOf('引擎就绪') >= 0) break;
      await sleep(250);
    }
    await go('#/dmg');            /* 先让 04 渲染出来（05 要 attach 它） */
    await go('#/choose');
    console.log('  · 05 选武器 = ' + await q(PICKW));
    await sleep(900);
    console.log('  · 05 解析文字卡 = ' + await q(PARSE));
    await sleep(1600);
    const a0 = await q(READ05);
    console.log('  【基线】05 tkey = ' + JSON.stringify(a0.tkey));
    console.log('     05 结论 = ' + JSON.stringify(a0.conc));
    console.log('     05 报告 = ' + JSON.stringify(a0.rep));

    await go('#/dmg');
    console.log('  · 04 填微调（护甲 600 / 基伤 250） = ' + JSON.stringify(await q(FILL04)));
    await sleep(1100);
    await go('#/choose');
    await sleep(1200);
    const a1 = await q(READ05);
    console.log('  【之后】05 tkey = ' + JSON.stringify(a1.tkey));
    console.log('     05 结论 = ' + JSON.stringify(a1.conc));
    console.log('     05 报告 = ' + JSON.stringify(a1.rep));
    console.log('     05 自己的微调提示 = ' + JSON.stringify(a1.advhint));
    console.log('  → 05 的 tkey 被 04 顶掉了？ ' + (a0.tkey !== a1.tkey ? '是（' + a0.tkey + ' → ' + a1.tkey + '）' : '否'));
    console.log('  → 05 结论被改？ ' + (JSON.stringify(a0.conc) !== JSON.stringify(a1.conc) ? '是（串了）' : '否'));
    console.log('  → 05 报告被改？ ' + (JSON.stringify(a0.rep) !== JSON.stringify(a1.rep) ? '是（串了）' : '否'));
  } finally {
    try { p.kill(); } catch (e) {}
  }
  console.log('诊断结束');
  process.exit(0);
})();
