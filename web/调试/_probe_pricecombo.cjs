'use strict';
/* 价值表「词条组合价格排名」探针：页签渲染与文案 / 默认中位价降序 / 表头排序 / 搜索 / 语言切换标签 / 主表无扰 */
const path = require('path');
const { openPage, toFileUrl } = require('./cdp.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const file = process.argv[2] || require('./cdp.cjs').latestProduct();
  const p = await openPage(toFileUrl(path.resolve(file)));
  const out = [];
  const ev = async e => p.cdp.eval(e);
  try {
    await sleep(2500);
    await ev(`location.hash = '#price'`);
    await sleep(1200);
    out.push('VISIBLE: ' + await ev(`(function(){var b=document.getElementById('priceCombo');return b&&!b.hidden;})()`));
    out.push('TABS: ' + await ev(`(function(){var n=document.querySelectorAll('#priceComboCats .sgx-cat'),s=[];for(var i=0;i<n.length;i++)s.push(n[i].textContent+(n[i].classList.contains('on')?'*':''));return s.join('|');})()`));
    out.push('ROWS: ' + await ev(`document.querySelectorAll('#priceComboTb tr').length`));
    out.push('POSMAX: ' + await ev(`(function(){var rows=document.querySelectorAll('#priceComboTb tr'),max=0,bad=0;for(var i=0;i<rows.length;i++){var t=(rows[i].cells[1]||{}).textContent||'';var n=t?t.split(' + ').length:0;if(n>max)max=n;if(n>3)bad++;}return max+'/'+bad;})()`));
    out.push('FIRST: ' + await ev(`(function(){var r=document.querySelector('#priceComboTb tr');return r?r.textContent.slice(0,90):'?';})()`));
    out.push('MEDDESC: ' + await ev(`(function(){var t=[],n=document.querySelectorAll('#priceComboTb tr td:nth-child(6) b');for(var i=0;i<n.length&&i<5;i++)t.push(+n[i].textContent.replace(/,/g,''));for(var i=1;i<t.length;i++)if(t[i]>t[i-1])return 'BAD '+t.join(',');return 'desc ok '+t.join(',');})()`));
    /* 派系词条名跟数据服走（组合榜半边）：国服「对科普斯」/ 国际服「对Corpus」 */
    const fac = () => ev(`(function(){var t=(document.getElementById('priceComboTb')||{}).textContent||'';return 'cn='+(t.indexOf('对科普斯')>=0)+',intl='+(t.indexOf('对Corpus')>=0);})()`);
    out.push('FAC-GROUPS: ' + await ev(`(function(){var D=window.ZKPRICEDB||{},S=D.stats||{},F={},hit=0,tot=0,i;for(var s in S){if(S[s]===16||S[s]===17||S[s]===18)F[s]=1;}['intl','cn'].forEach(function(k){((D.combos||{})[k]||[]).forEach(function(d){tot++;var a=(d.ks||[]).concat(d.gk?[d.gk]:[]);for(i=0;i<a.length;i++)if(F[a[i]]){hit++;break;}});});return 'groups='+tot+',withFaction='+hit;})()`));
    for (let i = 0; i < 5; i++) {
      await ev(`(document.querySelector('#priceComboCats .sgx-cat[data-i="${i}"]')||{click:function(){}}).click()`);
      await sleep(150);
      out.push('FAC-INTL#' + i + ': ' + await fac());
    }
    await ev(`document.querySelector('#priceStore .prx-sbtn[data-s="cn"]').click()`);
    await sleep(600);
    for (let i = 0; i < 5; i++) {
      await ev(`(document.querySelector('#priceComboCats .sgx-cat[data-i="${i}"]')||{click:function(){}}).click()`);
      await sleep(150);
      out.push('FAC-CN#' + i + ': ' + await fac());
    }
    await ev(`document.querySelector('#priceStore .prx-sbtn[data-s="intl"]').click()`);
    await sleep(600);
    // 切「近战」页签（index 4）
    await ev(`document.querySelector('#priceComboCats .sgx-cat[data-i="4"]').click()`);
    await sleep(200);
    out.push('MELEE: ' + await ev(`(function(){var r=document.querySelector('#priceComboTb tr');return (r?r.textContent.slice(0,60):'?')+' / '+document.getElementById('priceComboStat').textContent;})()`));
    out.push('MELEE-POS: ' + await ev(`(function(){var r=document.querySelector('#priceComboTb tr td:nth-child(2)');return r?/近战伤害|基础伤害/.test(r.textContent):false;})()`));
    // 表头排序：点「挂单数」
    await ev(`document.querySelector('#priceComboTh th[data-k="n"]').click()`);
    await sleep(200);
    out.push('SORT-N: ' + await ev(`(function(){var t=[],n=document.querySelectorAll('#priceComboTb tr td:nth-child(4)');for(var i=0;i<n.length&&i<4;i++)t.push(+n[i].textContent.replace(/,/g,''));for(var i=1;i<t.length;i++)if(t[i]>t[i-1])return 'BAD '+t.join(',');return 'desc ok '+t.join(',');})()`));
    // 搜索
    await ev(`(function(){var q=document.getElementById('priceComboQ');q.value='多重';q.dispatchEvent(new Event('input'));})()`);
    await sleep(200);
    out.push('SEARCH: ' + await ev(`document.getElementById('priceComboStat').textContent`));
    // 语言切换：页签文案应变（切到 英文 idx2 → Melee·Zaw）
    await ev(`(function(){var q=document.getElementById('priceComboQ');q.value='';q.dispatchEvent(new Event('input'));})()`);
    const lab0 = await ev(`(document.querySelector('#priceComboCats .sgx-cat[data-i="4"]')||{textContent:''}).textContent`);
    await ev(`(function(){var b=document.querySelector('#langFloatPanel button[data-i="2"]')||document.querySelector('[data-a="lang"][data-i="2"]');if(b)b.click();})()`);
    await sleep(400);
    out.push('LANG: ' + lab0 + ' -> ' + await ev(`(document.querySelector('#priceComboCats .sgx-cat[data-i="4"]')||{textContent:''}).textContent`));
    await ev(`(function(){var b=document.querySelector('#langFloatPanel button[data-i="1"]')||document.querySelector('[data-a="lang"][data-i="1"]');if(b)b.click();})()`);
    await sleep(300);
    // 主表无扰
    out.push('MAINTB: ' + await ev(`document.querySelectorAll('#priceTb tr').length > 0`));
    out.push('EXC: ' + (p.cdp.logs.filter(x => x.indexOf('exception') >= 0 || x.indexOf('console.error') >= 0).join(' || ') || 'none'));
  } catch (e) { out.push('ERR ' + e.message); }
  p.kill();
  console.log(out.join('\n'));
})();
