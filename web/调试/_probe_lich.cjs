'use strict';
/* _probe_lich.cjs —— 玄骸武器（赤毒 / 信条 / 终幕）组装台：额外元素 7 选 1，固定 60%
 *   node debug/_probe_lich.cjs <产物.html>
 *
 * 断言：
 *   04 区（#dmg）选到玄骸武器 → 组装台出现，只有「额外元素」一格，7 项，默认火焰
 *   选中的元素按「基础伤害 × 60%」加进自带伤害桶；换元素立刻重算
 *   非玄骸武器 → 组装台不出
 *   05 区（#choose）同理，走自己的 #asmbox
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
function ckind(n, got, needle) {
  const ok = String(got).indexOf(needle) >= 0;
  console.log((ok ? '  ✓ ' : '  ✗ ') + n + ' = ' + JSON.stringify(String(got).slice(0, 150)) + (ok ? '' : '（期望含 ' + JSON.stringify(needle) + '）'));
  ok ? pass++ : fail++;
}
const FILE = process.argv[2] || path.join(__dirname, '..', 'dist', '20261029-riven-workbench-v8.html');

const WANT = ['impact', 'cold', 'heat', 'toxin', 'electricity', 'radiation', 'magnetic'];

/* 04 区：填 #g-q → 点候选（引擎武器走 data-id） */
const pick04 = name => `(function(){
  var inp = document.getElementById('g-q'); if (!inp) return 'noq';
  inp.value = ${JSON.stringify(name)};
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  var el = document.querySelector('#g-hits .g-hit[data-id]');
  if (!el) return 'nocand';
  el.click(); return 'ok';
})()`;

const asm04 = `(function(){
  var card = document.getElementById('g-asmcard');
  if (!card) return { no: 'nocard' };
  var sel = document.querySelector('#g-asm select[data-ak="elem"]');
  var wsel = document.querySelector('#g-asm select[data-ak="strike"]') ||
             document.querySelector('#g-asm select[data-ak="chamber"]');
  var hint = document.getElementById('g-asmhint');
  return {
    shown: !card.hidden,
    sub: (document.getElementById('g-asmsub') || {}).textContent || '',
    keys: sel ? [].slice.call(sel.options).map(function (o) { return o.value; }) : null,
    cur: sel ? sel.value : null,
    hasPart: !!wsel,
    hint: hint ? hint.textContent.replace(/\\s+/g, ' ').trim() : ''
  };
})()`;

const set04 = k => `(function(){
  var sel = document.querySelector('#g-asm select[data-ak="elem"]');
  if (!sel) return 'nosel';
  sel.value = ${JSON.stringify(k)};
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  return 'ok';
})()`;

/* 期望值：拿引擎库里那把武器自己算一遍 */
const expect = name => `(function(){
  var DB = window.WEAPON_DB || [], n = ${JSON.stringify(name)};
  var w = null;
  for (var i = 0; i < DB.length; i++) if (DB[i].n === n) { w = DB[i]; break; }
  if (!w) return null;
  var out = {};
  ['heat','toxin','impact'].forEach(function (k) {
    var d = window.ZKC.lichAdd(w, k).at.dmg, t = 0, kk;
    for (kk in d) if (Object.prototype.hasOwnProperty.call(d, kk)) t += d[kk];
    out[k] = { v: d[k], tot: Math.round(t * 100) / 100 };
  });
  return out;
})()`;

/* 05 区：先填 #wq，再 mousedown 点 #wlist 第一个 */
const pick05 = name => `(function(){
  var inp = document.getElementById('wq'); if (!inp) return 'noq';
  inp.value = ${JSON.stringify(name)};
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  var b = document.querySelector('#wlist button[data-k]');
  if (!b) return 'nobtn';
  b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  return 'ok:' + b.getAttribute('data-k');
})()`;

const asm05 = `(function(){
  var box = document.getElementById('asmbox');
  if (!box) return { no: 'nobox' };
  var sel = box.querySelector('select[data-ak="elem"]');
  var sum = box.querySelector('.asm-sum');
  return {
    shown: !box.hidden,
    head: (box.querySelector('.asm-h') || {}).textContent || '',
    keys: sel ? [].slice.call(sel.options).map(function (o) { return o.value; }) : null,
    cur: sel ? sel.value : null,
    sum: sum ? sum.textContent.replace(/\\s+/g, ' ').trim() : ''
  };
})()`;

const set05 = k => `(function(){
  var sel = document.querySelector('#asmbox select[data-ak="elem"]');
  if (!sel) return 'nosel';
  sel.value = ${JSON.stringify(k)};
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  return 'ok';
})()`;

(async () => {
  setTimeout(function () { console.error('WATCHDOG'); process.exit(3); }, 200000);
  const p = await openPage(toFileUrl(path.resolve(FILE), '#/dmg'));
  const q = async e => { try { return await p.cdp.eval(e); } catch (err) { return 'ERR:' + err.message; } };
  const go = async h => { await q(`location.hash = '${h}'`); await sleep(900); };
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

    /* ---------- 04 区 ---------- */
    console.log('\n[04 区 · 组装台]');
    ck('玄骸武器：选中赤毒努寇微波枪', await q(pick04('Kuva Nukor')), 'ok');
    await sleep(600);
    let a = await q(asm04);
    ck('组装台出现', a.shown, true);
    ckind('副标题写明玄骸 + 60%', a.sub, '60%');
    ckind('副标题点名玄骸武器', a.sub, '玄骸武器');
    ck('只有额外元素一格（没有刀刃/枪膛）', a.hasPart, false);
    ck('额外元素 7 项且顺序对', a.keys, WANT);
    ck('默认火焰', a.cur, 'heat');
    const exp = await q(expect('Kuva Nukor'));
    ck('拿到期望值（基础 21 辐射）', !!exp, true);
    if (exp) {
      ckind('火焰：面板里出现该元素数值 ' + exp.heat.v, a.hint, String(exp.heat.v));
      ckind('火焰：基础伤害合计 ' + exp.heat.tot, a.hint, String(exp.heat.tot));
    }
    ck('切换到毒素', await q(set04('toxin')), 'ok');
    await sleep(600);
    a = await q(asm04);
    ck('选中项跟着变', a.cur, 'toxin');
    if (exp) ckind('毒素：数值 ' + exp.toxin.v, a.hint, String(exp.toxin.v));
    ck('切换到冲击', await q(set04('impact')), 'ok');
    await sleep(600);
    a = await q(asm04);
    if (exp) ckind('冲击：数值 ' + exp.impact.v, a.hint, String(exp.impact.v));

    /* 装上去就当自带元素：Coda Pox 自带毒素，装冲击后「冲击伤害」应进可选目录 */
    console.log('\n[装上去 = 自带元素]');
    ck('选中终幕脓痘（自带毒素 55）', await q(pick04('Coda Pox')), 'ok');
    await sleep(600);
    ck('先把额外元素切回火焰', await q(set04('heat')), 'ok');
    await sleep(600);
    const rows14 = async () => q(`(function(){
      var s = document.querySelector('#g-boxes select.g-k');
      if (!s) return null;
      return [].slice.call(s.options).map(function (o) { return +o.value; });
    })()`);
    ck('装火焰时没有「冲击伤害」词条', (await rows14()).indexOf(13), -1);
    ck('装冲击', await q(set04('impact')), 'ok');
    await sleep(600);
    const rImp = await rows14();
    ck('装冲击后「冲击伤害」进可选目录（当自带元素处理）', rImp.indexOf(13) >= 0, true);
    a = await q(asm04);
    ckind('冲击 33.0（= 55 × 60%）', a.hint, '33.0');

    console.log('\n[04 区 · 非玄骸不该出组装台]');
    ck('换回普通武器', await q(pick04('Torid')), 'ok');
    await sleep(600);
    a = await q(asm04);
    ck('组装台隐藏', a.shown, false);

    /* ---------- 05 区 ---------- */
    console.log('\n[05 区 · 组装台]');
    await go('#/choose');
    await sleep(700);
    const r5 = await q(pick05('Kuva Nukor'));
    ckind('05 选中玄骸武器', r5, 'ok');
    await sleep(700);
    let b = await q(asm05);
    ck('05 组装台出现', b.shown, true);
    ck('05 额外元素 7 项', b.keys, WANT);
    ck('05 默认火焰', b.cur, 'heat');
    ckind('05 标题点名玄骸', b.head, '玄骸武器');
    const sum0 = b.sum;
    ck('05 切换到毒素', await q(set05('toxin')), 'ok');
    await sleep(700);
    b = await q(asm05);
    ck('05 选中项跟着变', b.cur, 'toxin');
    ck('05 面板重算（摘要变了）', b.sum !== sum0 && b.sum.length > 0, true);
    if (exp) ckind('05 毒素数值 ' + exp.toxin.v, b.sum, String(exp.toxin.v));

    console.log('\n[05 区 · 非玄骸不该出组装台]');
    const r6 = await q(pick05('Torid'));
    ckind('05 换回普通武器', r6, 'ok');
    await sleep(700);
    b = await q(asm05);
    ck('05 组装台隐藏', b.shown, false);

    ck('全程无页面异常', await q(`(window.__zkErrs||window.__errs||[]).length`), 0);
  } finally {
    try { p.kill(); } catch (e) { /* 关不掉不影响结论 */ }
  }
  console.log(fail ? ('❌ 失败 ' + fail + ' 条 （' + pass + '/' + (pass + fail) + '）')
                   : ('✅ 全部通过（' + pass + '/' + pass + '）'));
  process.exit(fail ? 1 : 0);
})();
