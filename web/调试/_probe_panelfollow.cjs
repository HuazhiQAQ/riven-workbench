'use strict';
/* _probe_panelfollow.cjs —— 04 区「武器面板」(#g-panel) 是否跟随本区配卡
 * 曾报坑：装了 7 张卡，面板仍只有一个紫卡的数值 —— 因为合并读的是 05 #mbpanel 的槽位。
 * 本探针只用 04 自己的 UI（#g-q 选武器 / #g-boxes 填词条 / #g-mbfill 装填）。 */
const path = require('path');
const { openPage, toFileUrl } = require('./cdp.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const file = path.resolve(process.argv[2] || require('./cdp.cjs').latestProduct());
const WN = process.argv[3] || '拉托';

(async () => {
  const p = await openPage(toFileUrl(file));
  const q = async (e) => { try { return await p.cdp.eval(e); } catch (err) { return 'ERR:' + err.message; } };
  const ok = (n, cond, extra) => console.log((cond ? '  ✓ ' : '  ✗ ') + n + (extra ? ' · ' + extra : ''));

  const paint = `(function(){
    var h=document.querySelector('#g-panel'); if(!h) return 'NO#g-panel';
    var o={t:{},el:[]};
    [].slice.call(h.querySelectorAll('.wtile')).forEach(function(t){
      var l=(t.querySelector('.wl')||{}).textContent||'';
      var v=(t.querySelector('.wv')||{}).textContent||'';
      o.t[l.trim()]=v.trim();
    });
    [].slice.call(h.querySelectorAll('.elegend .er')).forEach(function(r){
      o.el.push((r.querySelector('.en')||{}).textContent+' '+(r.querySelector('.ev')||{}).textContent
        +' '+(r.querySelector('.ep')||{}).textContent);
    });
    o.lab=(document.querySelector('#g-panellab')||{}).textContent||'';
    /* 「无卡→有卡」网格：每行是 k / 前 / 后 / 变化 四个兄弟节点 */
    o.grid={};
    var wd=h.querySelector('.wdiff .wd');
    if(wd){
      /* 分组标题 .grp 会打断 4 个一组的下标，所以只认 .k，再取后两个兄弟 */
      [].slice.call(wd.querySelectorAll('.k')).forEach(function(k){
        var b0=k.nextElementSibling, b1=b0&&b0.nextElementSibling;
        if(!b0||!b1) return;
        var lbl=(k.childNodes[0]&&k.childNodes[0].nodeValue||'').trim();
        o.grid[lbl]=[(b0.textContent||'').trim(),(b1.textContent||'').trim()];
      });
    }
    return JSON.stringify(o);
  })()`;

  try {
    await sleep(2200);
    for (let i = 0; i < 40; i++) {
      const t = await q(`(document.querySelector('#eng')||{}).textContent||''`);
      if (String(t).indexOf('引擎就绪') >= 0) break;
      await sleep(250);
    }
    await q(`location.hash='#/dmg';`); await sleep(700);

    /* 1) 选武器（04 自己的搜索框） */
    await q(`(function(){var e=document.querySelector('#g-q');e.value='${WN}';
      e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await sleep(450);
    const hits = await q(`[].slice.call(document.querySelectorAll('#g-hits .g-hit')).map(function(x){return (x.textContent||'').trim().slice(0,24);}).join(' | ')`);
    console.log('  搜索命中: ' + hits);
    const clicked = await q(`(function(){var b=document.querySelector('#g-hits .g-hit');
      if(!b) return 'NOHIT'; b.click(); return (b.textContent||'').trim().slice(0,24);})()`);
    await sleep(800);
    console.log('  选中: ' + clicked);
    ok('武器已选中', String(clicked) !== 'NOHIT', String(clicked));

    /* 2) 填 4 行词条：伤害 / 暴击伤害 / 多重 / 负面（射速） */
    const ROWS = [['伤害', '120.5'], ['暴击伤害', '85.3'], ['多重', '90'], ['射速', '-40.2']];
    for (let b = 0; b < ROWS.length; b++) {
      const [txt, val] = ROWS[b];
      const sv = await q(`(function(){
        var box=document.querySelector('#g-boxes .g-box[data-b="${b}"]'); if(!box) return 'NOBOX';
        var sel=box.querySelector('select.g-k'); if(!sel) return 'NOSEL';
        var opt=[].slice.call(sel.options).filter(function(o){
          return o.value!=='0' && (o.text||'').replace(/\\s+/g,'').indexOf('${txt}')>=0;});
        if(!opt.length) return 'NOOPT:'+[].slice.call(sel.options).map(function(o){return o.text;}).join('/');
        sel.value=opt[0].value; sel.dispatchEvent(new Event('change',{bubbles:true}));
        return opt[0].text;
      })()`);
      await sleep(260);
      const iv = await q(`(function(){
        var box=document.querySelector('#g-boxes .g-box[data-b="${b}"]'); if(!box) return 'NOBOX';
        var i=box.querySelector('.g-vwrap input'); if(!i) return 'NOINP';
        i.value='${val}'; i.dispatchEvent(new Event('input',{bubbles:true})); return i.value;
      })()`);
      await sleep(260);
      console.log(`    b=${b} ${txt} → 行「${sv}」值 ${iv}`);
    }

    const bare = await q(paint);
    console.log('  [裸枪+紫卡] ' + bare);

    /* 3) 按流派装填 */
    const filled = await q(`(function(){var b=document.querySelector('#g-mbfill');
      if(!b) return 'NOBTN'; b.click(); return 'clicked';})()`);
    await sleep(1600);
    const after = await q(paint);
    console.log('  [装填后]    ' + after);

    /* 4) 全部卸下 */
    await q(`(function(){var b=document.querySelector('#g-mbclr'); if(b) b.click();})()`);
    await sleep(1200);
    const cleared = await q(paint);
    console.log('  [卸下后]    ' + cleared);

    const J = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };
    const A = J(bare), B = J(after), D = J(cleared);
    ok('面板可读', !!(A && A.t && A.t['多重']), A && A.t ? JSON.stringify(A.t) : String(bare));
    ok('网格读得到「总伤害」行', !!(A && A.grid && A.grid['总伤害']), A && A.grid ? JSON.stringify(A.grid['总伤害']) : 'NO GRID');
    if (A && A.grid && A.grid['总伤害']) {
      ok('网格「有卡」= 面板「总伤害」（同一份桶，不是只有紫卡）',
        Math.abs(parseFloat(A.grid['总伤害'][1]) - parseFloat(A.t['总伤害'])) < 0.15,
        A.grid['总伤害'][1] + ' vs ' + A.t['总伤害']);
    }
    if (A && B) {
      /* 近战没有多重卡，这个 tile 恒为 1.00 —— 只要「不变小」即可 */
      if (A.t['多重'] != null) ok('装填后多重不降（枪械会变大）', parseFloat(B.t['多重']) >= parseFloat(A.t['多重']),
        A.t['多重'] + ' → ' + B.t['多重']);
      ok('装填后暴击变大', parseFloat(B.t['暴击']) > parseFloat(A.t['暴击']),
        A.t['暴击'] + ' → ' + B.t['暴击']);
      ok('装填后网格「有卡」跟着涨（不是只算紫卡）',
        parseFloat(B.grid['总伤害'][1]) > parseFloat(A.grid['总伤害'][1]) * 1.2,
        A.grid['总伤害'][1] + ' → ' + B.grid['总伤害'][1]);
      ok('装填后网格「有卡」仍等于面板「总伤害」',
        Math.abs(parseFloat(B.grid['总伤害'][1]) - parseFloat(B.t['总伤害'])) < 0.15,
        B.grid['总伤害'][1] + ' vs ' + B.t['总伤害']);
      if (A.t['射速'] != null) ok('装填后射速变化（含负词条/卡）', B.t['射速'] !== A.t['射速'],
        A.t['射速'] + ' → ' + B.t['射速']);
      ok('装填后伤害构成条变化', JSON.stringify(B.el) !== JSON.stringify(A.el),
        A.el.join(' / ') + '  ⇒  ' + B.el.join(' / '));
    }
    if (A && D) ok('卸下后回到裸枪+紫卡', JSON.stringify(A.t) === JSON.stringify(D.t));
    console.log('  fill=' + filled);
  } finally {
    try { p.kill(); } catch (e) { console.log('kill 失败 ' + e.message); }
  }
})();
