'use strict';
/* _probe_typenames.cjs —— 武器类型名全站统一为：霰弹 / 曲翼 / Zaw
 *   node debug/_probe_typenames.cjs <产物.html>
 *
 * 断言：
 *   [1] 03 开卡类别下拉：label 是 霰弹 / 曲翼 / Zaw，没有 霰弹枪 / 天工造武；value 不变
 *   [2] 02 计算器「武器类型」：霰弹枪武器显示「霰弹」、曲翼武器显示「曲翼」
 *   [3] 05 配卡面板类别行（.cl）：同样不出现「霰弹枪」
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

/* 找一把指定 cat 的武器（取 intl 名做搜索词） */
const findCat = cat => `(function(){
  var W = window.ZKDATA.weapons;
  for (var i = 0; i < W.length; i++) if (W[i].cat === ${JSON.stringify(cat)} && W[i].var !== '变体·有本体')
    return { i: i, intl: W[i].intl || W[i].cn };
  return null;
})()`;

const pickCalc = (idx, name) => `(function(){
  var inp = document.getElementById('q'); if (!inp) return 'noq';
  inp.value = ${JSON.stringify(name)};
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  var el = document.querySelector('#cands [data-a="pick"][data-i="' + ${idx} + '"]');
  if (!el) return 'nocand';
  el.click(); return 'ok';
})()`;

/* 02「武器类型」那一格的右值 */
const calcType = `(function(){
  var kvs = document.querySelectorAll('#calc-body .kv');
  for (var i = 0; i < kvs.length; i++) {
    var l = kvs[i].querySelector('label');
    if (l && l.textContent.trim() === '武器类型') {
      var b = kvs[i].querySelector('b');
      return b ? b.textContent.trim() : null;
    }
  }
  return null;
})()`;

(async () => {
  setTimeout(function () { console.error('WATCHDOG'); process.exit(3); }, 200000);
  const p = await openPage(toFileUrl(path.resolve(FILE), '#/calc'));
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

    /* [1] 03 开卡类别下拉 */
    await q(`(function(){ location.hash='#/open'; return 1; })()`);
    await sleep(600);
    const opts = await q(`(function(){
      var s = document.getElementById('openCatSel'); if (!s) return null;
      return [].slice.call(s.options).map(function (o) {
        return { v: o.value, t: o.textContent.trim() };
      });
    })()`);
    ck('03 类别下拉存在', Array.isArray(opts) && opts.length > 4, true);
    const labels = opts.map(o => o.t);
    ck('03 下拉里没有「霰弹枪」', labels.filter(t => t.indexOf('霰弹枪') >= 0), []);
    ck('03 下拉里没有「天工造武」', labels.filter(t => t.indexOf('天工造武') >= 0), []);
    const shot = opts.filter(o => o.v === '霰弹')[0] || {};
    ck('03「霰弹」value=霰弹、label=霰弹', [shot.v, shot.t], ['霰弹', '霰弹']);
    const zaw = opts.filter(o => o.v === 'Zaw')[0] || {};
    ck('03「Zaw」value=Zaw、label=Zaw', [zaw.v, zaw.t], ['Zaw', 'Zaw']);
    ck('03 下拉有「曲翼」', labels.indexOf('曲翼') >= 0, true);

    /* [2] 02 武器类型 */
    await q(`(function(){ location.hash='#/calc'; return 1; })()`);
    await sleep(600);
    const sg = await q(findCat('霰弹'));
    ck('找到霰弹武器', !!sg, true);
    ck('选中霰弹武器', await q(pickCalc(sg.i, sg.intl)), 'ok');
    await sleep(450);
    const t1 = await q(calcType);
    ck('02 霰弹武器类型显示「霰弹」', t1, '霰弹');

    const ar = await q(findCat('曲翼'));
    ck('找到曲翼武器', !!ar, true);
    ck('选中曲翼武器', await q(pickCalc(ar.i, ar.intl)), 'ok');
    await sleep(450);
    const t2 = await q(calcType);
    ck('02 曲翼武器类型显示「曲翼」', t2, '曲翼');

    /* [3] 05 配卡面板类别行 */
    await q(`(function(){ location.hash='#/choose'; return 1; })()`);
    await sleep(900);
    ck('05 先搜索再点列表', await q(`(function(){
      var wq = document.getElementById('wq'); if (!wq) return 'nowq';
      wq.value = ${JSON.stringify(sg.intl)};
      wq.dispatchEvent(new Event('input', { bubbles: true }));
      var list = document.getElementById('wlist'); if (!list) return 'nolist';
      var b = list.querySelector('button[data-k="' + ${sg.i} + '"]');
      if (!b) return 'nobtn';
      b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      return 'ok';
    })()`), 'ok');
    await sleep(1000);
    const cl = await q(`(function(){
      var el = document.querySelector('#mbpanel .cl') || document.querySelector('.cl');
      return el ? el.textContent.trim() : null;
    })()`);
    console.log('     05 类别行：' + cl);
    ck('05 类别行不出现「霰弹枪」', String(cl || '').indexOf('霰弹枪') < 0, true);
    ck('05 类别行写了「霰弹」', String(cl || '').indexOf('霰弹') >= 0, true);

    ck('全程无页面异常', await q(`(window.__zkErrs||window.__errs||[]).length`), 0);
  } finally {
    try { p.kill(); } catch (e) { /* 关不掉不影响结论 */ }
  }
  console.log(fail ? ('❌ 失败 ' + fail + ' 条 （' + pass + '/' + (pass + fail) + '）')
                   : ('✅ 全部通过（' + pass + '/' + pass + '）'));
  process.exit(fail ? 1 : 0);
})();
