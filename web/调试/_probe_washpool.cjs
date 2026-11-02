/* _probe_washpool.cjs —— 实证「洗卡1000次」给近战洗出多重(19)/装填(23)的机制漏洞
 * 1) 哈利卡在产物 ZKDATA 里的 cat 与列值；
 * 2) 用 genStats 同款闸门枚举近战可洗行；
 * 3) 复刻 openNRun 的随机洗 20000 次，统计 row19/23 是否漏出。 */
'use strict';
const { openPage, toFileUrl } = require('./cdp.cjs');

const SRC = process.argv[2] || require('./cdp.cjs').latestProduct();
const path = require('path');
const PAGE_URL = toFileUrl(path.resolve(__dirname, SRC), '#/');

(async () => {
  const pg = await openPage(PAGE_URL);
  const cdp = pg.cdp;
  const ck = (msg, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    console.log((ok ? 'PASS' : 'FAIL') + ' | ' + msg + ' | got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want));
    if (!ok) process.exitCode = 1;
    return ok;
  };

  // 等数据就绪
  await cdp.eval(`(function(){
    return new Promise(function(res){
      var n=0; (function poll(){ if (window.ZKDATA && ZKDATA.weapons && ZKDATA.weapons.length>100) return res(1);
        if (++n>200) return res(0); setTimeout(poll,100); })();
    });
  })()`);

  const info = await cdp.eval(`(function(){
    var D = window.ZKDATA, out = {};
    function findW(cn){ for (var i=0;i<D.weapons.length;i++) if (D.weapons[i].cn===cn) return {i:i,w:D.weapons[i]}; return null; }
    var hl = findW('哈利卡'), hlV = findW('红莲哈利卡');
    out.halikar = hl ? {wi:hl.i, cn:hl.w.cn, cat:hl.w.cat, keys:Object.keys(hl.w).join(',')} : null;
    out.halikarVar = hlV ? {wi:hlV.i, cn:hlV.w.cn, cat:hlV.w.cat, var:hlV.w.var} : null;
    // catCol
    var CC = window.ZKC.CAT_COL;
    out.catColMelee = CC['近战'];
    // stats: row19 / row23 / row8 / row2 的五列
    function srow(r){ for (var i=0;i<D.stats.length;i++) if (D.stats[i].row===r) return D.stats[i]; return null; }
    [2,8,19,21,23].forEach(function(r){ var s=srow(r); out['row'+r] = s ? s.v : 'MISSING'; });
    // genStats 同款闸门：近战可洗行
    function isFiniteN(x){ return typeof x==='number' && isFinite(x); }
    var rows=[];
    for (var row=2; row<=34; row++){ var s=srow(row); if (!s) continue;
      var v=s.v[CC['近战']]; if (isFiniteN(v)) rows.push(row); }
    out.meleeRollable = rows;
    out.row19InMeleePool = rows.indexOf(19)>=0;
    out.row23InMeleePool = rows.indexOf(23)>=0;
    return out;
  })()`);
  console.log(JSON.stringify(info, null, 1));
  ck('哈利卡 cat=近战', (info.halikar||{}).cat, '近战');
  ck('近战池不含 row19(多重)', info.row19InMeleePool, false);
  ck('近战池不含 row23(装填)', info.row23InMeleePool, false);

  // 复刻 openNRun：随机 20000 次洗，统计近战武器出 19/23 的次数
  const sim = await cdp.eval(`(function(){
    var D = window.ZKDATA;
    var IS_VAR='变体·有本体';
    var OPENABLE = D.weapons.filter(function(w){ return w.var !== IS_VAR; });
    var CC = window.ZKC.CAT_COL;
    function srow(r){ for (var i=0;i<D.stats.length;i++) if (D.stats[i].row===r) return D.stats[i]; return null; }
    function baseOf(row,cat){ var i=CC[cat]; if (typeof i!=='number') return NaN; var s=srow(row); if(!s) return NaN;
      var v=s.v[i]; return (v===null||v===undefined)?NaN:v; }
    var hits={r19:0,r23:0, halikarTotal:0, halikarBad:0, sample:null};
    for (var t=0;t<20000;t++){
      var w = OPENABLE[Math.floor(Math.random()*OPENABLE.length)];
      if (!w || w.cn!=='哈利卡') continue;
      hits.halikarTotal++;
      var pool=[];
      for (var row=2;row<=34;row++){ if (isFinite(baseOf(row,w.cat))) pool.push(row); }
      if (pool.indexOf(19)>=0){ hits.r19++; if(!hits.sample) hits.sample={cn:w.cn,cat:w.cat,col19:srow(19).v[CC[w.cat]]}; }
      if (pool.indexOf(23)>=0) hits.r23++;
    }
    return hits;
  })()`);
  console.log('sim:', JSON.stringify(sim));
  ck('20000次哈利卡模拟洗卡 row19 漏出=0', sim.r19, 0);
  ck('20000次哈利卡模拟洗卡 row23 漏出=0', sim.r23, 0);

  pg.kill();
  console.log('done');
})().catch(e => { console.error('ERR', e && e.message || e); process.exit(2); });
