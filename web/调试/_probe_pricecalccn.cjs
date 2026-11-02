'use strict';
/* 计算器「市场行情参考」双服：切到国服后必须用国服在售挂单重新给价（上限 300），
   切回国际服要还原；国服没有挂单的武器要明说。 */
const path = require('path');
const { openPage, toFileUrl } = require('./cdp.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PAGE = process.argv[2] || require('./cdp.cjs').latestProduct();
let fail = 0;
function ck(msg, ok, extra) {
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + msg + (extra ? ' | ' + extra : ''));
  if (!ok) fail++;
}
(async () => {
  setTimeout(function () { console.error('WATCHDOG'); process.exit(3); }, 240000);
  const p = await openPage(toFileUrl(path.resolve(PAGE)));
  const ev = e => p.cdp.eval(e);
  const fill = async (w, rows, vals) => {
    await ev(`(function(){var q=document.getElementById('q');q.value=${JSON.stringify(w)};
      q.dispatchEvent(new Event('input',{bubbles:true}));
      var c=document.querySelector('#cands [data-i], #cands .cand, #cands li, #cands button');
      if(c)c.click(); return !!c;})()`);
    await sleep(450);
    await ev(`(function(){
      var setRow=function(i,r){var s=document.querySelector('select[data-a="krow"][data-i="'+i+'"]');
        if(!s)return false;s.value=String(r);s.dispatchEvent(new Event('change',{bubbles:true}));return true;};
      var setVal=function(i,v){var e=document.querySelector('input[data-a="kval"][data-i="'+i+'"]');
        if(!e)return false;e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));return true;};
      [0,1,2,3].forEach(function(i){setRow(i,0);setVal(i,'');});
      ${JSON.stringify(rows)}.forEach(function(r,i){setRow(i,r);});
      ${JSON.stringify(vals)}.forEach(function(v,i){if(v!=='')setVal(i,v);});
      return 1;})()`);
    await sleep(500);
  };
  const read = () => ev(`(function(){
    var card=document.querySelector('#calc .pr-card'); if(!card) return null;
    var em=card.querySelector('h3 em'), vs=card.querySelectorAll('.pr-cell .pr-v');
    var out=[]; for(var i=0;i<vs.length;i++) out.push((vs[i].textContent||'').replace(/[^0-9]/g,''));
    return { em: em?em.textContent:'', p: out,
             meta: (card.querySelector('.pr-meta')||{}).textContent||'',
             tip: (card.querySelector('.pr-tip')||{}).textContent||'',
             empty: (card.querySelector('.pr-empty')||{}).textContent||'' };
  })()`);
  const setStore = async s => {
    await ev(`(function(){var b=document.querySelector('#priceStore .prx-sbtn[data-s="${s}"]');if(b)b.click();return !!b;})()`);
    await sleep(700);
  };
  try {
    await p.cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false });
    await sleep(2500);
    await ev(`location.hash='#calc'`);
    await sleep(700);

    /* 1) 国际服基准 */
    await setStore('intl');
    await fill('托里德', [5, 19, 4, 25], ['150', '100', '160', '40']);
    const A = await read();
    ck('国际服：标题写明国际服', /国际服/.test(A.em), A.em);
    ck('国际服：三档价有数且不封 300', A.p.length === 3 && +A.p[1] > 300, A.p.join('/'));

    /* 2) 切国服 —— 同一个计算器，价格块要自己换源 */
    await setStore('cn');
    const B = await read();
    ck('国服：标题跟着换', /国服/.test(B.em) && !/国际服/.test(B.em), B.em);
    ck('国服：三档价都 ≤ 300（交易中心上限）', B.p.length === 3 && B.p.every(x => +x <= 300), B.p.join('/'));
    ck('国服：价格与国际服不同（不是照抄）', B.p.join('/') !== A.p.join('/'), A.p.join('/') + ' -> ' + B.p.join('/'));
    ck('国服：注明上限 300', /300/.test(B.meta), B.meta.slice(0, 80));
    ck('国服：说明里提到样本少/只当档位', /国服/.test(B.tip) || /档位/.test(B.tip), B.tip.slice(0, 60));

    /* 3) 切回国际服要还原 */
    await setStore('intl');
    const C = await read();
    ck('切回国际服：还原同样的价', C.p.join('/') === A.p.join('/'), C.p.join('/'));

    /* 4) 国服没有挂单的武器（兰卡）：不能瞎给价 */
    await setStore('cn');
    await fill('兰卡', [5, 19, 0, 0], ['150', '90', '', '']);
    const D = await read();
    ck('无国服挂单：明确说给不了国服价', /国服/.test(D.empty) && /没有/.test(D.empty), D.empty);

    /* 5) 语言切到国服（0）也要跟着换 */
    await setStore('intl');
    await fill('托里德', [5, 19, 4, 25], ['150', '100', '160', '40']);
    const E0 = await read();
    await ev(`(function(){var b=document.querySelector('#langFloatPanel button[data-i="0"]');if(b)b.click();return !!b;})()`);
    await sleep(900);
    const E1 = await read();
    ck('语言切国服：价格块跟着换成国服价', E1.p.join('/') !== E0.p.join('/') && E1.p.every(x => +x <= 300),
      E0.p.join('/') + ' -> ' + E1.p.join('/'));

    const err = p.cdp.logs.filter(x => x.indexOf('exception') >= 0 || x.indexOf('console.error') >= 0);
    ck('无 JS 异常', err.length === 0, err.join(' | ').slice(0, 200));
  } catch (e) {
    ck('执行异常 ' + e.message, false);
  }
  console.log(fail ? ('FAILED ' + fail) : 'ALL PASS');
  p.kill();
  process.exit(fail ? 1 : 0);
})();
