'use strict';
/* _probe_sgxfollow.cjs —— 01 属性数值速查「跟着玩家选的武器改倾向」
 *   node debug/_probe_sgxfollow.cjs <产物.html> <main|variant>
 *
 * 断言：
 *   [1] 统一版（main）行为不变：选武器后表不切类别、数值仍 1.2、chip 不出现
 *   [2] 倾向版（variant）选武器 → 表自动切到该武器类别、按它自己的倾向算
 *   [3] 顶栏 chip 写明「按 <武器> · 倾向 x.xx」；换成 1.2 的武器则收起
 *   [4] 手动切到别的类别 → chip 收起、按默认 1.2（不串用别人的倾向）
 *   [5] 05 配卡面板选武器也会跟着变
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
const FILE = process.argv[2] || require('./cdp.cjs').latestProduct();
const MODE = process.argv[3] === 'main' ? 'main' : 'variant';

/* 找一把「cn 唯一」的武器，pred 由调用方给 */
const findW = pred => `(function(){
  var W=window.ZKDATA.weapons, dup={};
  for(var i=0;i<W.length;i++) dup[W[i].cn]=(dup[W[i].cn]||0)+1;
  for(var j=0;j<W.length;j++){ var w=W[j]; if(dup[w.cn]!==1) continue; if(${pred}) return w.cn; }
  return null;
})()`;

const pick02 = name => `(function(){
  var W=window.ZKDATA.weapons, idx=-1;
  for(var k=0;k<W.length;k++) if(W[k].cn===${JSON.stringify(name)}){idx=k;break;}
  if(idx<0) return 'noindex';
  var inp=document.getElementById('q'); if(!inp) return 'noq';
  inp.value=${JSON.stringify(name)};
  inp.dispatchEvent(new Event('input',{bubbles:true}));
  var el=document.querySelector('#cands [data-a="pick"][data-i="'+idx+'"]');
  if(!el) return 'nocand';
  el.click(); return 'ok';
})()`;

const pick05 = name => `(function(){
  var W=window.ZKDATA.weapons, idx=-1;
  for(var k=0;k<W.length;k++) if(W[k].cn===${JSON.stringify(name)}){idx=k;break;}
  if(idx<0) return 'noindex';
  var wq=document.getElementById('wq'); if(!wq) return 'nowq';
  wq.value=W[idx].intl||W[idx].cn||W[idx].en;
  wq.dispatchEvent(new Event('input',{bubbles:true}));
  var list=document.getElementById('wlist'); if(!list) return 'nolist';
  var b=list.querySelector('button[data-k="'+idx+'"]');
  if(!b) return 'nohit';
  b.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true}));
  return 'ok';
})()`;

const goRanges = `(function(){ location.hash='#/ranges'; return 1; })()`;
const goCalc = `(function(){ location.hash='#/calc'; return 1; })()`;
const goChoose = `(function(){ location.hash='#/choose'; return 1; })()`;

const state = `(function(){
  var sel=document.getElementById('sgxSel');
  var on=document.querySelector('#sgxCats .sgx-cat.on');
  var tr=document.querySelector('#sgxBodyN tr[data-r="2"]');
  var w=window.ZK_SEL;
  return {
    cat: on?on.getAttribute('data-cat'):null,
    chipHidden: sel?!!sel.hidden:null,
    chip: sel?(sel.textContent||''):'',
    cell: tr?(tr.children[1].textContent||'').replace(/\\s+/g,''):null,
    zsel: w?(w.cn||w.en):null,
    disp: w?ZKC.disp(w):null,
    wcat: w?w.cat:null
  };
})()`;

/* 独立复算：基础伤害 row2 的 3+1 正列首值（只算 lo 那一端） */
const expect2 = disp => `(function(){
  var D=window.ZKDATA,P=D.params;
  var st=null; for(var i=0;i<D.stats.length;i++) if(D.stats[i].row===2) st=D.stats[i];
  var cat=document.querySelector('#sgxCats .sgx-cat.on').getAttribute('data-cat');
  var COL={'步枪':0,'霰弹':1,'手枪':2,'曲翼':3,'近战':4};
  var base=st.v[COL[cat]];
  if(base===null||base===undefined) return null;
  var f=base*P.combo[3].gain*(${disp})*((P.maxRank+1)/9);
  var s=Math.round(f*P.lo*100)/100;
  return (s<0?'':'+')+s.toFixed(2)+'%';
})()`;

const first = s => String(s || '').split('\u2014')[0];

(async () => {
  setTimeout(function () { console.error('WATCHDOG'); process.exit(3); }, 200000);
  const p = await openPage(toFileUrl(path.resolve(FILE), '#/ranges'));
  const q = async e => { try { return await p.cdp.eval(e); } catch (err) { return 'ERR:' + err.message; } };
  try {
    await p.cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 900, deviceScaleFactor: 1, mobile: false
    }).catch(() => {});
    await sleep(2400);
    for (let i = 0; i < 40; i++) {
      const t = await q(`(document.querySelector('#eng')||{}).textContent||''`);
      if (String(t).indexOf('引擎就绪') >= 0) break;
      await sleep(250);
    }

    ck('window.ZKSGXAPI.follow 存在', await q(`typeof (window.ZKSGXAPI||{}).follow`), 'function');
    ck('window.ZKSGW 存在（选武器统一入口）', await q(`typeof window.ZKSGW`), 'function');
    ck('window.ZK_SEL 初始即 01 默认武器', await q(`!!(window.ZK_SEL && window.ZK_SEL.cat)`), true);

    const s0 = await q(state);
    console.log('     初始：' + JSON.stringify(s0));
    ck('初始 chip 显示默认武器', s0.chipHidden === false && s0.chip.indexOf('「') >= 0
      && s0.chip.indexOf('1.20（统一）') >= 0, true);
    ck('初始按 1.2 算', first(s0.cell), await q(expect2(1.2)));

    /* ① 选一把低倾向（0.5）武器；统一版没有这种武器，就随便选一把 1.2 的 */
    let lowName = await q(findW(`Math.abs(w.disp-0.5)<1e-9`));
    if (!lowName) lowName = await q(findW(`Math.abs(w.disp-1.2)<1e-9`));
    ck('找到测试武器', !!lowName, true);
    await q(goCalc); await sleep(400);
    const r1 = await q(pick02(lowName));
    ck('02 选中 ' + lowName, r1, 'ok');
    await sleep(500);
    await q(goRanges);
    await sleep(400);
    const s1 = await q(state);
    console.log('     选 ' + lowName + ' 后：' + JSON.stringify(s1));
    ck('ZK_SEL 记下了这把', s1.zsel, lowName);

    if (MODE === 'main') {
      ck('[main] 倾向值仍是 1.2', s1.disp, 1.2);
      ck('[main] 类别跟武器走', s1.cat, s1.wcat);
      ck('[main] chip 显示武器与统一倾向', s1.chipHidden === false && /^按「.+」· 倾向 1\.20（统一）$/.test(s1.chip), true);
      ck('[main] 数值仍按 1.2（统一版行为不变）', first(s1.cell), await q(expect2(1.2)));
    } else {
      /* 单构建时代：先点目录底「倾向口径 → 倾向版」，weapons[*].disp 才是各武器快照值 */
      const toVariant = `(function(){
        var b=document.querySelector('.sb-seg [data-zk-d="v"]');
        if(!b) return 'NO-BTN';
        b.click(); return 'ok';
      })()`;
      ck('[variant] 切到倾向版', await q(toVariant), 'ok');
      await sleep(700);
      lowName = await q(findW(`Math.abs(w.disp-0.5)<1e-9`));
      ck('[variant] 找到 0.5 倾向武器', !!lowName, true);
      await q(goCalc); await sleep(400);
      const rv = await q(pick02(lowName));
      ck('[variant] 02 选中 ' + lowName, rv, 'ok');
      await sleep(500);
      await q(goRanges);
      await sleep(400);
      const s1 = await q(state);
      console.log('     [variant] 选 ' + lowName + ' 后：' + JSON.stringify(s1));
      ck('倾向值 = 0.5', s1.disp, 0.5);
      ck('[variant] 表自动切到该武器类别', s1.cat, s1.wcat);
      ck('[variant] chip 出现', s1.chipHidden, false);
      ck('[variant] chip 文案带武器名与 0.50',
        /^按「.+」· 倾向 0\.50$/.test(s1.chip), true);
      ck('[variant] 数值按 0.50 算', first(s1.cell), await q(expect2(0.5)));
      const v12 = Number(String(await q(expect2(1.2))).replace(/[+%]/g, ''));
      ck('[variant] 0.5 的数值确实比 1.2 小',
        Number(String(first(s1.cell)).replace(/[+%]/g, '')) < v12, true);

      /* ② 换成倾向 1.2 的武器 → chip 收起 */
      const n12 = await q(findW(`Math.abs(w.disp-1.2)<1e-9`));
      ck('找到 1.2 倾向的武器', !!n12, true);
      await q(goCalc); await sleep(400);
      const r2 = await q(pick02(n12));
      ck('02 选中 ' + n12, r2, 'ok');
      await sleep(500);
      await q(goRanges);
      await sleep(400);
      const s2 = await q(state);
      console.log('     选 ' + n12 + ' 后：' + JSON.stringify(s2));
      ck('[variant] 切到该武器类别', s2.cat, s2.wcat);
      ck('[variant] 倾向 1.2 → chip 仍在但不带「统一」', s2.chipHidden === false
        && s2.chip.indexOf('1.20') >= 0 && s2.chip.indexOf('（统一）') < 0, true);
      ck('[variant] 数值回到 1.2 口径', first(s2.cell), await q(expect2(1.2)));

      /* ③ 手动切到别的类别 → chip 收起、按默认 1.2 */
      await q(`(function(){var b=document.querySelector('#sgxCats .sgx-cat[data-cat="手枪"]');if(b)b.click();return !!b;})()`);
      await sleep(250);
      const s3 = await q(state);
      ck('[variant] 手动切手枪 → chip 收起', s3.chipHidden, true);
      ck('[variant] 手枪表按默认 1.2', first(s3.cell), await q(expect2(1.2)));

      /* ④ 05 配卡面板选武器也要跟 */
      await q(goChoose); await sleep(600);
      const r4 = await q(pick05(lowName));
      ck('05 选中 ' + lowName, r4, 'ok');
      await sleep(600);
      await q(goRanges);
      await sleep(400);
      const s4 = await q(state);
      console.log('     05 选 ' + lowName + ' 后：' + JSON.stringify(s4));
      ck('[variant] 05 选武器也会跟（类别/倾向）', [s4.cat, s4.disp], [s4.wcat, 0.5]);
      ck('[variant] 05 选后 chip 一致', s4.chip, '按「' + lowName + '」· 倾向 0.50');
      ck('[variant] 05 选后数值按 0.50', first(s4.cell), await q(expect2(0.5)));
    }

    ck('全程无页面异常', await q(`(window.__zkErrs||[]).length`), 0);
  } finally {
    try { p.kill(); } catch (e) { /* 关不掉不影响结论 */ }
  }
  console.log(fail ? ('❌ 失败 ' + fail + ' 条 （' + pass + '/' + (pass + fail) + '）') : ('✅ 全部通过（' + pass + '/' + pass + '）'));
  process.exit(fail ? 1 : 0);
})();
