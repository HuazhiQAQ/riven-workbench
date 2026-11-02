'use strict';
/* 组合榜分类纯净度探针：五页签的「常见武器」必须与模拟器五类一致
   （WM 的 riven_type 与模拟器五类不是一个体系，分类以 ZKDATA.weapons.cat 为准）。 */
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
    // 每个页签的常见武器全集（直接读渲染后的表格，等价于用户看到的内容）
    const namesOf = async i => await ev(`(function(){
      var b=document.querySelector('#priceComboCats .sgx-cat[data-i="${i}"]');
      if(!b) return 'NO TAB';
      b.click();
      var ws=[];
      var tb=document.getElementById('priceComboTb');
      var last=tb.rows.length?tb.rows[tb.rows.length-1].cells.length:0;
      for(var r=0;r<tb.rows.length;r++){var cs=tb.rows[r].cells;if(cs.length>=9)ws.push(cs[8].textContent);}
      return ws.join('、');
    })()`);
    // 等渲染
    const all = [];
    for (let i = 0; i < 5; i++) { const s = await namesOf(i); await sleep(150); all.push(s); }
    const kit = ['捕月', '凝目', '响胆', '墓指', '虫置', '孢射'];
    const arch = ['葛拉特勒', '凯旋将军', '菲德菈', '巨浪', '惩戒者', '合成燃气炮', '翠雀', '什长双枪', '极速电磁步枪', '置灵者'];
    const has = (s, arr) => arr.some(w => s.indexOf(w) >= 0);
    out.push('RIFLE-NO-KIT: ' + !has(all[0], kit));
    out.push('RIFLE-NO-ARCH: ' + !has(all[0], arch));
    out.push('SHOTGUN-NO-KIT: ' + !has(all[1], kit));
    out.push('PISTOL-HAS-KIT: ' + has(all[2], kit));
    out.push('ARCH-HAS-ARCH: ' + has(all[3], arch));
    out.push('ARCH-NO-KIT: ' + !has(all[3], kit));
    out.push('ARCH-NO-RIFLE: ' + !has(all[3], ['伯斯顿', '兰卡', '冰凇', '凤殁', 'AX-52']));
    out.push('EXC: ' + (p.cdp.logs.filter(x => x.indexOf('exception') >= 0).join(' || ') || 'none'));
  } catch (e) { out.push('ERR ' + e.message); }
  p.kill();
  console.log(out.join('\n'));
})();
