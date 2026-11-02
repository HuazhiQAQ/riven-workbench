'use strict';
/* _probe_combo.cjs —— 近战连击上限 / 赋能·渐强口径回归
 *   node debug/_probe_combo.cjs <绝对路径产物.html>
 *
 * 断言：
 *   [1] 连击上限：默认 220（11 级 · ×12），凯旋之爪 Prime 特例 240（12 级 · ×13）
 *   [2] 赋能·渐强 = 满层 220 初始连击（默认吃满，不再只给 +6）
 *   [3] 重击 / 投掷流派默认按 220 起手；震地仍走自己的 110（暴露线，不叠渐强）
 *   [4] 判据 comboInfo 与 snapPanel 的封顶同一个数
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

/* 取某把武器走某流派时的 comboInfo（走真实判据链路 advise） */
const advInfo = (cn, archId) => `(function(){
  var w=WEAPON_DB.filter(function(x){return x.z===${JSON.stringify(cn)};})[0];
  if(!w) return 'NO WEAPON';
  var r=RIVEN_ROUTER.advise(w,{},'g_mob');
  var h=(r.list||[]).filter(function(x){return x.id===${JSON.stringify(archId)};})[0];
  if(!h) return 'NO ARCH';
  if(!h.comboInfo) return 'NO COMBOINFO';
  var c=h.comboInfo;
  return {ic:Math.round(c.initCombo),lv:c.level,mu:c.mult,hf:c.heavyFactor,cap:c.cap};
})()`;

(async () => {
  setTimeout(function () { console.error('WATCHDOG'); process.exit(3); }, 150000);
  const p = await openPage(toFileUrl(path.resolve(FILE)));
  const q = async e => { try { return await p.cdp.eval(e); } catch (err) { return 'ERR:' + err.message; } };
  try {
    await q(`(function(){return new Promise(function(res){var n=0;(function t(){
      if(window.RIVEN_ROUTER&&window.WEAPON_DB&&window.ZKDATA&&ZKDATA.weapons&&ZKDATA.weapons.length>100) return res(1);
      if(++n>200) return res(0); setTimeout(t,100);})();});})()`);
    await sleep(600);

    /* ---- 1) 引擎上限：默认 220 / 特例 240 ---- */
    console.log('[1] 连击上限');
    ck('默认上限常量', await q(`[WF.COMBO_MAX, WF.COMBO_MAX_VENKA]`), [220, 240]);
    ck('220 = 11 级 = ×12', await q(`[WF.comboLevelOf(220), WF.comboMult(220)]`), [11, 12]);
    ck('240（特例口径）= 12 级 = ×13', await q(`[WF.comboLevelOf(240,240), WF.comboMult(240,240)]`), [12, 13]);
    ck('普通武器 240 仍封在 ×12', await q(`WF.comboMult(240)`), 12);
    ck('上限按武器取：凯旋之爪 Prime 240 / 拉托 220', await q(`(function(){
      var v=WEAPON_DB.filter(function(w){return w.n==='Venka Prime';})[0];
      var l=WEAPON_DB.filter(function(w){return w.z==='拉托';})[0];
      return [WF.comboCapOf(v), WF.comboCapOf(l)];
    })()`), [240, 220]);

    /* ---- 2) 赋能·渐强 = 满层 220 ---- */
    console.log('[2] 赋能·渐强');
    ck('渐强词条 = 初始连击 220', await q(`(function(){
      var a=window.ZKARCS.filter(function(x){return x.i==='melee_crescendo';})[0];
      return a ? a.p : 'NO ARC';
    })()`), [['combo', 220, 1]]);
    ck('渐强不再标「超出范围」', await q(`(function(){
      var a=window.ZKARCS.filter(function(x){return x.i==='melee_crescendo';})[0];
      return JSON.stringify(a.bg).indexOf('out_of_scope') < 0;
    })()`), true);

    /* ---- 3) 流派默认起手连击 ---- */
    console.log('[3] 流派默认');
    ck('重击默认 220 起手', await q(`RIVEN_ROUTER.ARCH_BY_ID.m_heavy.comboBase`), 220);
    ck('投掷默认 220 起手', await q(`RIVEN_ROUTER.ARCH_BY_ID.m_throw.comboBase`), 220);
    ck('震地仍是自己的 110（暴露线不叠渐强）', await q(`[RIVEN_ROUTER.ARCH_BY_ID.m_slam.comboBase, RIVEN_ROUTER.ARCH_BY_ID.m_slam.build.combo]`), [0, 110]);

    /* ---- 4) 判据实算 ---- */
    console.log('[4] 判据 comboInfo');
    ck('迦伦提恩·重击 = 220 连击 / 11 级 / ×12 / 重击 ×24', await q(advInfo('迦伦提恩', 'm_heavy')),
      { ic: 220, lv: 11, mu: 12, hf: 24, cap: 220 });
    ck('凯旋之爪 Prime·重击 = 240 连击 / 12 级 / ×13 / 重击 ×26', await q(advInfo('凯旋之爪 Prime', 'm_heavy')),
      { ic: 240, lv: 12, mu: 13, hf: 26, cap: 240 });
    ck('迦伦提恩·震地仍是 110 连击 / ×6', await q(`(function(){
      var w=WEAPON_DB.filter(function(x){return x.z==='迦伦提恩';})[0];
      var r=RIVEN_ROUTER.advise(w,{},'g_mob');
      var s=(r.list||[]).filter(function(x){return x.id==='m_slam';})[0];
      return s&&s.comboInfo ? [Math.round(s.comboInfo.initCombo), s.comboInfo.mult] : 'NO SLAM';
    })()`), [110, 6]);

    /* ---- 5) 面板封顶与判据同源 ---- */
    console.log('[5] 面板封顶');
    ck('snapPanel 把 999 初始连击封到 240（凯旋之爪 Prime）', await q(`(function(){
      var w=WEAPON_DB.filter(function(x){return x.n==='Venka Prime';})[0];
      var s=RIVEN_ROUTER.snapPanel(w,null,{combo:999},{},null);
      return [s.combo, s.comboCap];
    })()`), [240, 240]);
    ck('snapPanel 把 999 初始连击封到 220（普通武器）', await q(`(function(){
      var w=WEAPON_DB.filter(function(x){return x.z==='迦伦提恩';})[0];
      var s=RIVEN_ROUTER.snapPanel(w,null,{combo:999},{},null);
      return [s.combo, s.comboCap];
    })()`), [220, 220]);

    /* ---- 6) 05 判据面板真的把这一档写出来（数值对但没渲染=假绿） ---- */
    console.log('[6] 05 判据渲染');
    await q(`location.hash='#/choose'`); await sleep(600);
    const pickW = async name => {
      await q(`(function(){var q=document.getElementById('wq');q.value=${JSON.stringify(name)};q.dispatchEvent(new Event('input',{bubbles:true}));return 1;})()`.replace('${JSON.stringify(name)}', JSON.stringify(name)));
      await sleep(700);
      await q(`(function(){var b=document.querySelector('#wlist button[data-k]');if(b)b.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));return !!b;})()`);
      await sleep(500);
    };
    const pasteCard = async txt => {
      await q(`(function(){var ta=document.getElementById('txA');ta.value=${JSON.stringify(txt)};document.getElementById('txgoA').click();return 1;})()`);
      await sleep(900);
    };
    const panelTxt = () => q(`(document.getElementById('repBody')||{}).textContent||''`);

    await pickW('迦伦提恩');
    await pasteCard('迦伦提恩\n+120.5% 伤害\n+80% 暴击伤害\n-30% 对Infested 的伤害');
    const t1 = await panelTxt();
    ck('05 写出「起手 220 连击 = 11 级 → ×12」', /起手 220 连击 = 11 级[^×]*×12/.test(t1), true);
    ck('05 写出重击倍率 ×24', /重击伤害 ×24/.test(t1), true);

    await pickW('凯旋之爪 Prime');
    await pasteCard('凯旋之爪 Prime\n+120.5% 伤害\n+80% 暴击伤害\n-30% 对Infested 的伤害');
    const t2 = await panelTxt();
    ck('05 写出「起手 240 连击 = 12 级 → ×13」', /起手 240 连击 = 12 级[^×]*×13/.test(t2), true);
    ck('05 注明该武器上限 240', /该武器上限 240/.test(t2), true);
    ck('05 重击倍率 ×26', /重击伤害 ×26/.test(t2), true);

    ck('全程无页面异常', await q(`(window.__zkErrs||[]).length`), 0);
  } finally {
    try { p.kill(); } catch (e) { /* 关不掉不影响结论 */ }
  }
  console.log(fail ? ('❌ 失败 ' + fail + ' 条 （' + pass + '/' + (pass + fail) + '）') : ('✅ 全部通过（' + pass + '/' + pass + '）'));
  process.exit(fail ? 1 : 0);
})();
