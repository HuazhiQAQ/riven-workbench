'use strict';
/* 单词条热度探针：正/负两页签渲染 / 正面默认出现率降序 / 负面默认溢价降序 /
   表头排序 / 搜索 / 组合榜不受扰 / 无 JS 异常 */
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
    out.push('VISIBLE: ' + await ev(`(function(){var b=document.getElementById('priceSingle');return b&&!b.hidden;})()`));
    out.push('TABS: ' + await ev(`(function(){var n=document.querySelectorAll('#priceSingleCats .sgx-cat'),s=[];for(var i=0;i<n.length;i++)s.push(n[i].textContent+(n[i].classList.contains('on')?'*':''));return s.join('|');})()`));
    out.push('POSHDR: ' + await ev(`(function(){var n=document.querySelectorAll('#priceSingleTh th'),s=[];for(var i=0;i<n.length;i++)s.push(n[i].textContent);return s.join('|');})()`));
    // 正面默认出现率降序
    out.push('RATE-DESC: ' + await ev(`(function(){var t=[],n=document.querySelectorAll('#priceSingleTb tr td:nth-child(3)');for(var i=0;i<n.length&&i<6;i++)t.push(parseFloat(n[i].textContent));for(var i=1;i<t.length;i++)if(t[i]>t[i-1])return 'BAD '+t.join(',');return 'ok '+t.join(',');})()`));
    out.push('LIFT-CELL: ' + await ev(`(function(){var r=document.querySelector('#priceSingleTb tr');return r?r.cells[5].textContent:'?';})()`));
    // 切负面页签
    await ev(`document.querySelector('#priceSingleCats .sgx-cat[data-i="1"]').click()`);
    await sleep(200);
    out.push('NEGHDR: ' + await ev(`(function(){var n=document.querySelectorAll('#priceSingleTh th'),s=[];for(var i=0;i<n.length;i++)s.push(n[i].textContent);return s.join('|');})()`));
    out.push('NEG-PREM-DESC: ' + await ev(`(function(){var t=[],n=document.querySelectorAll('#priceSingleTb tr td:nth-child(4)');for(var i=0;i<n.length&&i<5;i++)t.push(parseFloat(n[i].textContent));for(var i=1;i<t.length;i++)if(t[i]>t[i-1])return 'BAD '+t.join(',');return 'ok '+t.join(',');})()`));
    out.push('NEG-NAME: ' + await ev(`(function(){var r=document.querySelector('#priceSingleTb tr td:nth-child(2)');return r?r.textContent:'?';})()`));
    // 负面按出现率排
    await ev(`document.querySelector('#priceSingleTh th[data-k="r"]').click()`);
    await sleep(200);
    out.push('NEG-SORT-R: ' + await ev(`(function(){var t=[],n=document.querySelectorAll('#priceSingleTb tr td:nth-child(3)');for(var i=0;i<n.length&&i<4;i++)t.push(parseFloat(n[i].textContent));for(var i=1;i<t.length;i++)if(t[i]>t[i-1])return 'BAD '+t.join(',');return 'desc ok '+t.join(',');})()`));
    // 搜索
    out.push('SEARCH-ALL: ' + await ev(`(function(){var q=document.getElementById('priceSingleQ');q.value='暴击';q.dispatchEvent(new Event('input'));var s=document.getElementById('priceSingleStat').textContent;q.value='';q.dispatchEvent(new Event('input'));return s;})()`));
    // 回正面确认无扰 + 组合榜仍在
    await ev(`document.querySelector('#priceSingleCats .sgx-cat[data-i="0"]').click()`);
    await sleep(150);
    out.push('COMBO-OK: ' + await ev(`(function(){var b=document.getElementById('priceCombo');return b&&!b.hidden&&document.querySelectorAll('#priceComboTb tr').length>0;})()`));
    out.push('MAINTB: ' + await ev(`document.querySelectorAll('#priceTb tr').length > 0`));
    out.push('EXC: ' + (p.cdp.logs.filter(x => x.indexOf('exception') >= 0 || x.indexOf('console.error') >= 0).join(' || ') || 'none'));
  } catch (e) { out.push('ERR ' + e.message); }
  p.kill();
  console.log(out.join('\n'));
})();
