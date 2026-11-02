/* _probe_import04.cjs —— 02 计算器 → 04 收益计算器 导入链路回归
 * 覆盖用户曾报的「导入后 select 全部显示 — 无词条 — 但 input 有值」 */
'use strict';
const { openPage, toFileUrl } = require('./cdp.cjs');
const path = require('path');
const FILE = process.argv[2] || require('./cdp.cjs').latestProduct();
const PAGE_URL = toFileUrl(path.resolve(__dirname, FILE), '#/');
let fail = 0;
function ck(msg, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + msg + ' | got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want));
  if (!ok) fail++;
}
(async () => {
  setTimeout(function () { console.error('WATCHDOG'); process.exit(3); }, 150000);
  const pg = await openPage(PAGE_URL);
  const cdp = pg.cdp;
  const ev = e => cdp.eval(e);
  await ev(`(function(){return new Promise(function(res){var n=0;(function p(){if(window.ZKDATA&&ZKDATA.weapons&&ZKDATA.weapons.length>100&&typeof window.switchSearch==='function')return res(1);if(++n>300)return res(0);setTimeout(p,100);})();});})()`);
  await new Promise(r => setTimeout(r, 800));

  // 1) 计算器选哈利卡（近战）
  await ev(`(function(){ window.switchSearch(525); return 1; })()`);
  await new Promise(r => setTimeout(r, 500));

  // 2) 填四条合法近战词条：5 暴击伤害 / 8 攻速 / 34 攻击范围 / 33 处决伤害(负面)
  const rows = [5, 8, 34, 33], vals = ['110.5', '88.25', '0.6', '-62.3'];   // 34 攻击范围是非百分比行（+0.6m）
  await ev(`(function(){
    var R=${JSON.stringify(rows)}, V=${JSON.stringify(vals)};
    for (var i=0;i<4;i++){
      var s=document.querySelector('[data-a="krow"][data-i="'+i+'"]');
      s.value=String(R[i]); s.dispatchEvent(new Event('change',{bubbles:true}));
    }
    for (var j=0;j<4;j++){
      var v=document.querySelector('[data-a="kval"][data-i="'+j+'"]');
      v.value=V[j]; v.dispatchEvent(new Event('change',{bubbles:true}));
    }
    return 1;
  })()`);
  await new Promise(r => setTimeout(r, 400));
  const kRows = await ev(`(function(){ return [0,1,2,3].map(function(i){ var s=document.querySelector('[data-a="krow"][data-i="'+i+'"]'); return s?s.value:null; }); })()`);
  ck('计算器四条词条已落位', kRows, rows.map(String));

  // 3) 点「导入收益计算器」
  const okImp = await ev(`(function(){
    var b=document.querySelector('[data-a="kdmg"]'); if(!b) return 'NO BTN';
    b.click(); return 'clicked';
  })()`);
  await new Promise(r => setTimeout(r, 900));
  ck('导入按钮可点', okImp, 'clicked');

  // 4) 04 面板四槽：select 值 = 行号，input 有值，cmeta 有满值
  const g = await ev(`(function(){
    function sel(b){ var s=document.querySelector('#g-boxes .g-box[data-b="'+b+'"] select.g-k'); return s?s.value:null; }
    function inp(b){ var i=document.querySelector('#g-boxes .g-box[data-b="'+b+'"] .g-vwrap input'); return i?i.value:null; }
    function meta(b){ var m=document.querySelector('#g-boxes .g-box[data-b="'+b+'"] .g-cmeta'); return m?(m.textContent||'').trim():''; }
    function lab(b){ var l=document.querySelector('#g-boxes .g-box[data-b="'+b+'"] .g-ri'); return l?(l.textContent||'').trim():''; }
    function selTxt(b){ var s=document.querySelector('#g-boxes .g-box[data-b="'+b+'"] select.g-k'); return s&&s.selectedIndex>=0?s.options[s.selectedIndex].text:''; }
    return { rows:[0,1,2,3].map(sel), vals:[0,1,2,3].map(inp), metas:[0,1,2,3].map(meta), labs:[0,1,2,3].map(lab), txts:[0,1,2,3].map(selTxt) };
  })()`);
  console.log('  04 面板:', JSON.stringify(g, null, 1));
  ck('04 四槽 select 均有词条（非无词条）', g.rows, rows.map(String));
  ck('04 四槽输入框均有值', g.vals.every(function (v) { return !!v && isFinite(parseFloat(v)); }), true);
  ck('04 行标照抄02', g.labs, ['正面词条 1', '正面词条 2', '正面词条 3', '负面词条']);
  ck('04 四槽均显示满值/浮动', g.metas.every(function (m) { return !!m; }), true);
  ck('满值保留两位小数', g.metas.every(function (m) { return /\d+\.\d{2}/.test(m); }), true);
  ck('负面槽(33处决)读数按卡面负号', parseFloat(g.vals[3]) < 0, true);

  pg.kill();
  console.log(fail ? ('RESULT: ' + fail + ' FAIL') : 'RESULT: ALL PASS');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e && e.message || e); process.exit(2); });
