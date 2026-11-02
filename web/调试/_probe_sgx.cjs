'use strict';
/* _probe_sgx.cjs —— 01 区底部「属性数值速查」表
 *   node debug/_probe_sgx.cjs <产物.html>   （按 cwd 解析，相对路径也行）
 *
 * 断言：
 *   [1] 模块在 #/ranges 路由下真的可见（不是 textContent 假绿）
 *   [2] 5 个武器类按钮、默认步枪、切换后表格跟着变
 *   [3] 普通表 / 融合表 分开，行数与 ZKDATA 真实口径一致
 *   [4] 6 列表头（3+1 / 2+1 / 3+0 / 2+0 / 两列负词条）
 *   [5] 数值口径与 02 区同一套：派系写 ×、NON_PCT 不带 %、后坐力带 %、
 *       永正行在负列为「—」（与 app.js rgCell / rgRange 独立复算对比）
 *   [6] 三套语言文案跟随顶部语言切换
 */
const path = require('path');
const { openPage, toFileUrl } = require('./cdp.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ck(n, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? '  ✓ ' : '  ✗ ') + n + ' = ' + JSON.stringify(got) + (ok ? '' : '（期望 ' + JSON.stringify(want) + '）'));
  ok ? pass++ : fail++;
}
function ckre(n, got, re) {
  const ok = typeof got === 'string' && re.test(got);
  console.log((ok ? '  ✓ ' : '  ✗ ') + n + ' = ' + JSON.stringify(got) + (ok ? '' : '（期望 ' + re + '）'));
  ok ? pass++ : fail++;
}
const FILE = process.argv[2] || require('./cdp.cjs').latestProduct();
/* 页内：独立按 ZKDATA 复算一遍（不复用 ZKSGXAPI，避免自证） */
const EXPECT = `
window.__sgxExpect = function(row, cat, nPos, nNeg, gain){
  var D = window.ZKDATA, P = D.params, R = window.RULES || {};
  var NON_PCT = R.NON_PCT || [20,27,28,34];
  var FACTION = R.FACTION_DROWS || [16,17,18,42,43,44];
  var COL = {'步枪':0,'霰弹':1,'手枪':2,'曲翼':3,'近战':4,'近战·天工造武':4};
  var st = null;
  for (var i=0;i<D.stats.length;i++) if (D.stats[i].row===row) st=D.stats[i];
  if (!st || !st.v) return null;
  var base = st.v[COL[cat]];
  if (base===null||base===undefined||!isFinite(base)) return null;
  var k = P.combo[nPos>=3?(nNeg?3:2):(nNeg?1:0)];
  var coef = gain ? k.gain : Math.abs(k.neg);
  var isFac = FACTION.indexOf(row)>=0;
  var b = isFac ? (base-1)*100 : base;
  var f = b*coef*1.2*((P.maxRank+1)/9);
  if (row===25 && gain) f=-f;
  var lo=f*P.lo, hi=f*P.hi;
  if (!gain && isFac) { var t=lo; lo=hi; hi=t; }
  function cell(v){
    var s = Math.round(v*100)/100;
    if (isFac) return '\\u00d7' + (gain ? 1+s/100 : 1-s/100).toFixed(2);
    if (row===25) return (s>=0?'+':'') + s.toFixed(2) + '%';
    var sg = s<0 ? '' : (gain?'+':'-');
    return sg + s.toFixed(2) + (NON_PCT.indexOf(row)>=0 ? '' : '%');
  }
  return cell(lo) + '\\u2014' + cell(hi);
};
window.__sgxRows = function(cat, fuse){
  var D = window.ZKDATA, Z = window.ZKC;
  var COL = {'步枪':0,'霰弹':1,'手枪':2,'曲翼':3,'近战':4};
  var out = [];
  for (var i=0;i<D.stats.length;i++){
    var s = D.stats[i], row = s.row;
    var isF = row>=Z.FUSE_FROM && row<=Z.FUSE_TO;
    if (isF !== !!fuse) continue;
    var v = s.v && s.v[COL[cat]];
    if (v===null||v===undefined||!isFinite(v)) continue;
    out.push(row);
  }
  return out.sort(function(a,b){return a-b;});
};
window.__sgxCells = function(sel){
  var tr = document.querySelector(sel);
  if (!tr) return null;
  return [].slice.call(tr.children).map(function(td){
    return (td.textContent||'').replace(/\\s+/g,'').trim();
  });
};
'true'`;

const vis = `(function(){
  var el = document.getElementById('sgx');
  if (!el) return null;
  var r = el.getBoundingClientRect(), cs = getComputedStyle(el);
  return { h:Math.round(r.height), w:Math.round(r.width), disp:cs.display, vis:cs.visibility };
})()`;

const catsDump = `(function(){
  var bs = document.querySelectorAll('#sgxCats .sgx-cat');
  return [].slice.call(bs).map(function(b){
    return { t:(b.textContent||'').trim(), on: b.className.indexOf('on')>=0 };
  });
})()`;

(async () => {
  setTimeout(function () { console.error('WATCHDOG'); process.exit(3); }, 180000);
  const p = await openPage(toFileUrl(path.resolve(FILE), '#/ranges'));
  const q = async e => { try { return await p.cdp.eval(e); } catch (err) { return 'ERR:' + err.message; } };
  try {
    /* 显式视口：无头默认 764×485 会让横向滚动与可见性断言失真 */
    await p.cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 900, deviceScaleFactor: 1, mobile: false
    }).catch(() => {});
    await sleep(2400);
    for (let i = 0; i < 40; i++) {
      const t = await q(`(document.querySelector('#eng')||{}).textContent||''`);
      if (String(t).indexOf('引擎就绪') >= 0) break;
      await sleep(250);
    }
    await q(`(function(){ location.hash='#/ranges'; return 1; })()`);
    await sleep(400);
    await q(EXPECT);

    /* [1] 可见性 —— 不认 textContent 假绿 */
    const v = await q(vis);
    console.log('     模块矩形：' + JSON.stringify(v));
    ck('#sgx 存在', !!v, true);
    ck('#sgx 高度 > 0（真渲染出来了）', v && v.h > 200, true);
    ck('#sgx display 不是 none', v && v.disp !== 'none', true);
    ck('#sgx 在 01 区内（#ranges 下）',
      await q(`!!document.querySelector('#ranges #sgx')`), true);

    /* [2] 类别按钮 */
    const cats = await q(catsDump);
    console.log('     类别：' + (cats || []).map(c => c.t).join(' / '));
    ck('武器类按钮 5 个', (cats || []).length, 5);
    ck('默认选中步枪', (cats || []).filter(c => c.on).map(c => c.t), ['步枪']);
    ck('默认档类别名 = 武器类别（国际服译名）',
      (cats || []).map(c => c.t), ['步枪', '霰弹', '手枪', '曲翼', '近战·Zaw']);

    /* [3] 步枪 行数与 ZKDATA 口径一致 */
    const rnR = await q(`window.__sgxRows('步枪', false).length`);
    const rfR = await q(`window.__sgxRows('步枪', true).length`);
    const doneN = await q(`document.querySelectorAll('#sgxBodyN tr').length`);
    const doneF = await q(`document.querySelectorAll('#sgxBodyF tr').length`);
    console.log('     步枪：普通 ' + rnR + ' 行 / 融合 ' + rfR + ' 行（页面 ' + doneN + ' / ' + doneF + '）');
    ck('普通表行数 = ZKDATA 步枪可洗行数', doneN, rnR);
    ck('融合表行数 = ZKDATA 步枪融合行数', doneF, rfR);
    ck('普通表与融合表不重叠（都非空）', rnR > 10 && rfR > 5, true);
    ck('计数文案', await q(`(document.getElementById('sgxCnt')||{}).textContent`),
      '步枪 · ' + rnR + ' + ' + rfR + ' 条');

    /* [4] 表头 */
    ck('普通表头 7 列（词条 + 6 列）',
      await q(`document.querySelectorAll('#sgxHeadN th').length`), 7);
    ck('融合表头 7 列',
      await q(`document.querySelectorAll('#sgxHeadF th').length`), 7);
    ck('末两列标负词条（mal）',
      await q(`[].slice.call(document.querySelectorAll('#sgxHeadN th')).map(function(t){return t.className.indexOf('mal')>=0;})`),
      [false, false, false, false, false, true, true]);

    /* [5] 数值口径：与独立复算逐格比对 */
    const cellOf = (row, fuse) => `window.__sgxCells('#sgxBody${fuse ? 'F' : 'N'} tr[data-r="${row}"]')`;
    const hasDataR = await q(`!!document.querySelector('#sgxBodyN tr[data-r]')`);
    ck('行带 data-r（便于定位）', hasDataR, true);

    /* 基础伤害 row 2：普通行，四正列一致、负列带负号 */
    const c2 = await q(cellOf(2, false));
    const e2 = await q(`window.__sgxExpect(2,'步枪',3,1,true)`);
    console.log('     基础伤害：' + JSON.stringify(c2) + ' 期望首列 ' + e2);
    ck('基础伤害 3+1 列 = 独立复算', (c2 || [])[1], e2);
    ck('基础伤害单元格带 %', /%$/.test(String((c2 || [])[1])), true);
    ck('基础伤害负列是负值', /^-/.test(String((c2 || [])[5])), true);
    ck('基础伤害 3+1 与 2+1 正列不同（系数 0.9375 vs 1.2375）', (c2 || [])[1] !== (c2 || [])[2], true);

    /* 派系 row 16：×1.xx */
    const c16 = await q(cellOf(16, false));
    const e16 = await q(`window.__sgxExpect(16,'步枪',3,1,true)`);
    console.log('     对Grineer：' + JSON.stringify(c16));
    ck('派系行写 ×（不是百分比）', /^×/.test(String((c16 || [])[1])), true);
    ck('派系行 3+1 列 = 独立复算', (c16 || [])[1], e16);
    ck('派系负列 < 1（减伤）',
      parseFloat(String((c16 || [])[5]).replace('×', '')) < 1, true);

    /* NON_PCT row 20（穿透）：不带 % */
    const c20 = await q(cellOf(20, false));
    console.log('     穿透：' + JSON.stringify(c20));
    ck('穿透不带 %', /%/.test(String((c20 || [])[1])), false);

    /* 后坐力 row 25：带 % 且取正负翻转后的值 */
    const c25 = await q(cellOf(25, false));
    console.log('     后坐力：' + JSON.stringify(c25));
    ck('后坐力带 %', /%$/.test(String((c25 || [])[1])), true);

    /* 融合行（row 35 起）：负列全「—」 */
    const f35 = await q(`window.__sgxRows('步枪', true)[0]`);
    const c35 = await q(cellOf(f35, true));
    console.log('     融合首行 row ' + f35 + '：' + JSON.stringify(c35));
    ck('融合行负列全部「—」（永正词条扣不了）',
      (c35 || []).slice(5, 7), ['—', '—']);
    ck('融合行正列有值', (c35 || []).slice(1, 5).every(x => x && x !== '—'), true);

    /* 负列不出现正号（后坐力例外：负面后坐力本来就是「加后坐力」= 正号） */
    const negAll = await q(`[].slice.call(document.querySelectorAll('#sgxBodyN tr')).map(function(tr){
      var td = tr.children[5];
      return { r: tr.getAttribute('data-r'), t: td ? (td.textContent||'').replace(/\\s+/g,'') : '' };
    }).filter(function(x){ return x.t && x.t!=='\\u2014' && x.r!=='25'; })`);
    ck('负列没有正号值（后坐力除外）', (negAll || []).filter(x => /^\\+/.test(x.t)).map(x => x.r + ':' + x.t), []);
    ck('负列确实有值（不是整列空白）', (negAll || []).length > 5, true);

    /* [6] 切类别 */
    const clickCat = c => `(function(){
      var b = document.querySelector('#sgxCats .sgx-cat[data-cat="'+${JSON.stringify(c)}+'"]');
      if (b) b.click(); return !!b;
    })()`;
    await q(clickCat('近战'));
    await sleep(250);
    const meleeN = await q(`document.querySelectorAll('#sgxBodyN tr').length`);
    const meleeF = await q(`document.querySelectorAll('#sgxBodyF tr').length`);
    const expMN = await q(`window.__sgxRows('近战', false).length`);
    const expMF = await q(`window.__sgxRows('近战', true).length`);
    console.log('     近战：' + meleeN + ' / ' + meleeF + '（期望 ' + expMN + ' / ' + expMF + '）');
    ck('切近战：普通表行数跟着变', meleeN, expMN);
    ck('切近战：融合表行数跟着变', meleeF, expMF);
    ck('切近战：只有近战按钮亮', await q(catsDump + `.filter(function(c){return c.on;}).length`), 1);
    ck('切近战：计数文案用近战译名（国际服档 = 近战·Zaw）',
      (await q(`(document.getElementById('sgxCnt')||{}).textContent`) || '').indexOf('近战·Zaw') === 0, true);

    await q(clickCat('霰弹'));
    await sleep(200);
    ck('切霰弹：行数 = 霰弹列口径',
      await q(`document.querySelectorAll('#sgxBodyN tr').length`),
      await q(`window.__sgxRows('霰弹', false).length`));

    /* [7] 语言 */
    await q(`(function(){ var b=document.querySelector('[data-a="lang"][data-i="2"]'); if(b) b.click(); return 1; })()`);
    await sleep(600);
    const enTitle = await q(`(document.getElementById('sgxTitle')||{}).textContent`);
    console.log('     EN 标题：' + enTitle);
    ck('EN 档标题', enTitle, 'Stat Value Reference');
    ck('EN 档类别名', await q(catsDump + `.map(function(c){return c.t;})`),
      ['Rifle', 'Shotgun', 'Pistol', 'Archgun', 'Melee·Zaw']);
    ck('EN 档词条名跟着换', await q(`(document.querySelector('#sgxBodyN .sgx-nm b')||{}).textContent`), 'Base Damage');

    await q(`(function(){ var b=document.querySelector('[data-a="lang"][data-i="0"]'); if(b) b.click(); return 1; })()`);
    await sleep(600);
    ck('国服档标题回中文', await q(`(document.getElementById('sgxTitle')||{}).textContent`), '属性数值速查');
    await q(`(function(){ var b=document.querySelector('#sgxCats .sgx-cat[data-cat="近战"]'); if(b) b.click(); return !!b; })()`);
    await sleep(250);
    ck('国服档近战叫「近战·天工造武」',
      await q(catsDump + `.map(function(c){return c.t;})`),
      ['步枪', '霰弹', '手枪', '曲翼', '近战·天工造武']);
    ck('国服档近战词条名也不带 Zaw 后缀',
      (await q(`(document.getElementById('sgxCnt')||{}).textContent`) || '').indexOf('近战·天工造武') === 0, true);
    await q(`(function(){ var b=document.querySelector('[data-a="lang"][data-i="1"]'); if(b) b.click(); return 1; })()`);
    await sleep(400);

    /* [8] 对外接口 */
    ck('window.ZKSGXAPI 存在', await q(`!!(window.ZKSGXAPI && window.ZKSGXAPI.redraw)`), true);
    ck('ZKSGXAPI 暴露 range/rowList/cell',
      await q(`['range','rowList','cell'].every(function(k){return typeof window.ZKSGXAPI[k]==='function';})`), true);
    ck('ZKSGXAPI.range 与表格口径一致',
      await q(`(function(){
        var r = window.ZKSGXAPI.range(2,'步枪',{p:3,n:1,gain:true});
        return r ? (r.a+'\\u2014'+r.b) : null;
      })()`),
      await q(`window.__sgxExpect(2,'步枪',3,1,true)`));

    /* [9] 基础数值表：一律按武器类型取各自那一列 */
    ck('基础数值表 vs 游戏实测值（01 自检）', await q(`(window.ZKRGSELF ? ZKRGSELF() : 'no-api')`), []);

    ck('引擎基础值 ≡ 基础数值表（逐词条 × 逐类型）', await q(`(function(){
      var R=window.RIVEN_ROUTER, K2R=window.RULES.STAT_KEY_ROW, Z=window.ZKDATA;
      var SL=[['p',0],['shotgun',1],['s',2],['a',3],['m',4]];
      function cell(key,col){
        var rows=K2R[key]; if(rows==null) return undefined;
        if(!(rows instanceof Array)) rows=[rows];
        for(var i=0;i<rows.length;i++)for(var j=0;j<Z.stats.length;j++){
          var rc=Z.stats[j];
          if(rc.row!==rows[i]||!rc.v) continue;
          var v=rc.v[col]; if(v==null) continue;
          if(RULES.FACTION_DROWS.indexOf(rc.row)>=0) return (v-1)*100;
          if(key==='recoil') return -Math.abs(v);
          return v;
        }
        return null;
      }
      var bad=0, fb=0;
      Object.keys(K2R).forEach(function(k){
        SL.forEach(function(sl){
          var c=cell(k,sl[1]), e=R.baseValue(k,sl[0]);
          if(c===null||c===undefined){ if(e!=null) fb++; return; }
          if(e==null||Math.abs(e-c)>1e-9) bad++;
        });
      });
      return bad+'/'+fb;
    })()`), '0/0');

    ckre('02 满值 与 05 满值 逐武器 × 逐词条同源', await q(`(function(){
      var R=window.RIVEN_ROUTER, tier=R.tierOf(3,1), bad=[], n=0;
      function nmq(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]/g,''); }
      var idx={};
      ZKDATA.weapons.forEach(function(w){
        [w.en,w.intl,w.cn].forEach(function(k){ var q=nmq(k); if(q && !idx[q]) idx[q]=w; });
      });
      var KEYS=['cc','cd','sc','dmg','ms','fr','recoil'], skip=0;
      /* 组合枪裸名 → 表里 (Primary)/(Secondary) 两条（与 ZKC.dispRec 同一条回落规则） */
      function findW(d){
        var k=nmq(d.n), w=idx[k];
        if(w) return w;
        var a=(d.s==='s')?'secondary':'primary', b=(a==='primary')?'secondary':'primary';
        return idx[k+a]||idx[k+b]||null;
      }
      R.DB.forEach(function(d){
        var w=findW(d);
        if(!w){ skip++; return; }
        if(ZKC.CAT_COL[w.cat]==null){ skip++; return; }
        var col=ZKC.CAT_COL[w.cat];
        KEYS.forEach(function(k){
          var rows=RULES.STAT_KEY_ROW[k]; if(rows==null) return;
          if(!(rows instanceof Array)) rows=[rows];
          var b=null;
          for(var i=0;i<rows.length && b===null;i++){
            for(var j=0;j<ZKDATA.stats.length;j++){
              var rc=ZKDATA.stats[j];
              if(rc.row!==rows[i] || !rc.v || rc.v[col]==null) continue;
              var v=rc.v[col];
              b = RULES.FACTION_DROWS.indexOf(rc.row)>=0 ? (v-1)*100 : (k==='recoil' ? -Math.abs(v) : v);
              break;
            }
          }
          if(b===null) return;
          n++;
          var mine=Math.abs(b)*ZKC.disp(w)*tier.t.pos*1.1;
          var eng=R.statCap(d,k,1,tier);
          if(eng===null || Math.abs(mine-eng)>1e-6) bad.push(d.n+'/'+k+' 表='+mine.toFixed(2)+' 引擎='+(eng===null?'null':eng.toFixed(2)));
        });
      });
      return bad.length ? ('BAD '+bad.length+'/'+n+' '+bad.slice(0,4).join(' , '))
        : ('0/'+n+(skip ? '  (未入表 '+skip+' 把，05 按战斗槽位取列)' : ''));
    })()`), /^0\/\d+/);

    /* 两个维度不能混：紫卡一律按表类目取列（组合枪=手枪列），配卡/mod 池按引擎战斗类型（主手霰弹=霰弹池） */
    ck('主手组合枪：紫卡用手枪列 / 配卡仍按霰弹·步枪池', await q(`(function(){
      var R=window.RIVEN_ROUTER, eng=null, out=[];
      R.DB.forEach(function(d){ if(!eng && d.n==='Sporelacer' && d.s==='p') eng=d; });
      if(!eng) return ['no-engine-record'];
      var zk=ZKC.dispRec(eng);
      if(!zk) return ['no-zk-record'];
      var col=ZKC.catCol(zk.cat);
      var tier=R.tierOf(3,1);
      var rec=null; ZKDATA.stats.forEach(function(s){ if(!rec && s.row===4) rec=s; });
      var pistCap=Math.abs(rec.v[2])*ZKC.disp(zk)*tier.t.pos*1.1;
      return [col, zk.cat, eng.s, eng.c, Math.abs(pistCap-R.statCap(eng,'cc',1,tier))<1e-6];
    })()`), [2, '手枪', 'p', 'shotgun', true]);

    ck('全程无页面异常', await q(`(window.__zkErrs||[]).length`), 0);
  } finally {
    try { p.kill(); } catch (e) { /* 关不掉不影响结论 */ }
  }
  console.log(fail ? ('❌ 失败 ' + fail + ' 条 （' + pass + '/' + (pass + fail) + '）') : ('✅ 全部通过（' + pass + '/' + pass + '）'));
  process.exit(fail ? 1 : 0);
})();
