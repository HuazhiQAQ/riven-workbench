'use strict';
/* 双服分析版块探针：单词条热度 / 词条组合价格排名两块随「服按钮」与「语言」切换，
   国服走国服数据并标注，切回国际服能还原；无 JS 异常。 */
const path = require('path');
const { openPage, toFileUrl } = require('./cdp.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const file = process.argv[2] || require('./cdp.cjs').latestProduct();
  const p = await openPage(toFileUrl(path.resolve(file)));
  const out = [];
  const ev = e => p.cdp.eval(e);
  const snap = async tag => {
    out.push(tag + ' | single=' + await ev(`(function(){var e=document.getElementById('priceSingleStat');return e?e.textContent:'-';})()`));
    out.push(tag + ' | combo=' + await ev(`(function(){var e=document.getElementById('priceComboStat');return e?e.textContent:'-';})()`));
    out.push(tag + ' | desc=' + await ev(`(function(){var e=document.getElementById('priceSingleDesc');return e?e.textContent.slice(0,6):'-';})()`));
    out.push(tag + ' | single1=' + await ev(`(function(){var r=document.querySelector('#priceSingleTb tr');return r?[r.cells[1].textContent,r.cells[5].textContent].join('/'):'-';})()`));
    out.push(tag + ' | combo1=' + await ev(`(function(){var r=document.querySelector('#priceComboTb tr');return r?[r.cells[1].textContent,r.cells[5].textContent].join('/'):'-';})()`));
    out.push(tag + ' | combobad=' + await ev(`(function(){var c=(window.ZKPRICEDB||{}).combos||{},bad=[];for(var k in c){var a=c[k]||[];for(var i=0;i<a.length;i++){if((a[i].ks||[]).length>3)bad.push(k+':'+a[i].ks.join('+'));}}return bad.length?bad.slice(0,2).join('|'):'0';})()`));
    /* 派系词条名跟数据服走：国服「对科普斯」/ 国际服「对Corpus」/ English「vs. Corpus」 */
    out.push(tag + ' | fac=' + await ev(`(function(){var t=(document.getElementById('priceSingleTb')||{}).textContent||'';return 'cn='+(t.indexOf('对科普斯')>=0)+',intl='+(t.indexOf('对Corpus')>=0)+',en='+(t.indexOf('vs. Corpus')>=0);})()`));
    out.push(tag + ' | hidden=' + await ev(`['priceSingle','priceCombo'].map(function(i){var b=document.getElementById(i);return i+'='+(b?b.hidden:'x');}).join(',')`));
  };
  try {
    await sleep(2500);
    await ev(`location.hash = '#price'`);
    await sleep(1500);
    out.push('HDR: ' + await ev(`(function(){var n=document.querySelectorAll('#priceSingleTh th'),s=[];for(var i=0;i<n.length;i++)s.push(n[i].textContent);return s.join('|');})()`));
    out.push('STORE-BTN: ' + await ev(`(function(){var n=document.querySelectorAll('#priceStore .prx-sbtn'),s=[];for(var i=0;i<n.length;i++)s.push(n[i].getAttribute('data-s')+(n[i].classList.contains('on')?'*':''));return s.join(',');})()`));
    /* 三语取名的唯一出口：行号 16 = 对…Corpus 那一条 */
    out.push('FAC-API: ' + await ev(`(function(){if(!window.ZKC||!ZKC.statRowName)return 'no-api';return [0,1,2].map(function(l){return l+'='+ZKC.statRowName(16,l);}).join(' | ');})()`));
    await snap('INTL');

    /* 服按钮 → 国服 */
    await ev(`document.querySelector('#priceStore .prx-sbtn[data-s="cn"]').click()`);
    await sleep(900);
    await snap('CN  ');
    out.push('CN-BTN: ' + await ev(`(function(){var b=document.querySelector('#priceStore .prx-sbtn.on');return b?b.getAttribute('data-s'):'-';})()`));

    /* 单词条热度：价格列（提升 / 溢价 / 中位价）数值可读、排序可用 */
    out.push('PRICE-COLS: ' + await ev(`(function(){var r=document.querySelector('#priceSingleTb tr');if(!r)return 'none';return [r.cells[5].textContent,r.cells[6].textContent,r.cells[7].textContent].join('/');})()`));

    /* 语言 → 国际服（应连带切服，因为主表语言→store 联动） */
    await ev(`(function(){var b=document.querySelector('#langFloatPanel button[data-i="1"]')||document.querySelector('[data-a="lang"][data-i="1"]');if(b)b.click();})()`);
    await sleep(1000);
    await snap('INTL2');
    /* 语言 → 国服 */
    await ev(`(function(){var b=document.querySelector('#langFloatPanel button[data-i="0"]')||document.querySelector('[data-a="lang"][data-i="0"]');if(b)b.click();})()`);
    await sleep(1000);
    await snap('CN2 ');
    out.push('EXC: ' + (p.cdp.logs.filter(x => x.indexOf('exception') >= 0 || x.indexOf('console.error') >= 0).join(' || ') || 'none'));
  } catch (e) { out.push('ERR ' + e.message); }
  console.log(out.join('\n'));
  p.kill();
})();
