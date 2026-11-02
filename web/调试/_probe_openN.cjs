'use strict';
/* _probe_openN.cjs —— 03「开 N 次」验收：抽卡等概率、榜单按「分数 × 国际服中位价」排
 * 关键口径：
 *   1) 抽卡仍是等概率（榜单不被单一贵武器霸屏，靠「同一把武器只留一张」+ 覆盖面判断）；
 *   2) 榜单降序 = score × max(中位价, 1)；
 *   3) 每行显示国际服中位价，没价的显示 —；
 *   4) 同一把武器只出现一次；
 *   5) 点一行会连武器一起套过去。 */
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

(async () => {
  setTimeout(function () { console.error('WATCHDOG'); process.exit(3); }, 180000);
  const p = await openPage(toFileUrl(path.resolve(FILE), '#/open'));
  const q = async (e) => { try { return await p.cdp.eval(e); } catch (err) { return 'ERR:' + err.message; } };

  /* 榜单快照：名字 / 价格文本 / 分数 */
  const snap = `(function(){
    var a=[];
    [].slice.call(document.querySelectorAll('#onList .on-row')).forEach(function(r){
      var pr=r.querySelector('.on-pr'), sc=r.querySelector('.on-sc');
      var pt=pr?(pr.textContent||'').replace(/[^0-9]/g,''):'';
      a.push({ w:(r.querySelector('.on-w')||{}).textContent||'',
               price: pt===''?0:(+pt),
               hasPrice: !!pr && !pr.classList.contains('none'),
               score: sc?parseFloat(sc.textContent)||0:0 });
    });
    return a;
  })()`;

  try {
    await sleep(2600);
    await q(`location.hash='#/open';`); await sleep(700);

    /* ---- 1) 中位价映射：托里德在国际服是 400白金（数据自检，防止价表没接上） ---- */
    ck('国际服价表可读', await q(`!!(window.ZKPRICE && window.ZKPRICE.intl && window.ZKPRICE.intl.rows.length)`), true);
    ck('托里德国际服中位价=400', await q(`(function(){
      var r=window.ZKPRICE.intl.rows.filter(function(x){return x.zh==='托里德';})[0];
      return r?r.med:null;
    })()`), 400);

    /* ---- 2) 跑一次 2000 次 ---- */
    await q(`(function(){var i=document.getElementById('onN'); i.value=2000; return 1;})()`);
    await q(`document.getElementById('onRun').click();`);
    for (let i = 0; i < 120; i++) {
      const t = await q(`(document.getElementById('onStat')||{}).textContent||''`);
      const busy = await q(`document.getElementById('onRun').disabled`);
      if (t && t.indexOf('开了') >= 0 && !busy) break;
      await sleep(250);
    }
    const stat = await q(`(document.getElementById('onStat')||{}).textContent||''`);
    ck('榜单已生成', stat.indexOf('开了') >= 0, true);
    ck('说明里写明按「分数 × 国际服中位价」排', stat.indexOf('分数 × 国际服中位价') >= 0, true);

    const rows = await q(snap);
    ck('榜单 1–10 行', [rows.length > 0, rows.length <= 10], [true, true]);

    /* ---- 3) 每行都有价格位；价格与名字对得上 ---- */
    ck('每行都有价格位', rows.every(r => typeof r.hasPrice === 'boolean'), true);
    const named = rows.filter(r => r.hasPrice);
    ck('有价的行价格都 > 0', named.every(r => r.price > 0), true);

    /* ---- 4) 降序：score × max(price,1) 非递增 ----
     * 卡面分数只有整数位（界面四舍五入），排序用的是未取整的原始分，
     * 所以相邻两行允许 ±0.5 分带来的价差：tol = 0.5×(本行价 + 上一行价)。 */
    const vals = rows.map(r => r.score * (r.price > 0 ? r.price : 1));
    const prc = rows.map(r => (r.price > 0 ? r.price : 1));
    let mono = true, worst = 0;
    for (let i = 1; i < vals.length; i++) {
      const tol = 0.5 * (prc[i] + prc[i - 1]) + 1e-6;
      const over = vals[i] - vals[i - 1];
      if (over > tol) mono = false;
      if (over - tol > worst) worst = over - tol;
    }
    ck('榜单按「分数 × 中位价」降序', mono, true);
    if (!mono) console.log('     超差最大 = ' + worst.toFixed(1));
    console.log('     ' + rows.map((r, i) => r.w + ' ' + (r.hasPrice ? r.price + 'p' : '—') + ' ' + r.score + '分').join(' | '));

    /* ---- 5) 同一把武器不重复 ---- */
    const names = rows.map(r => r.w);
    ck('同一把武器只出现一次', names.length === [...new Set(names)].length, true);

    /* ---- 6) 抽卡仍是等概率：2000 次应覆盖绝大多数武器池 ---- */
    const uniq = (stat.match(/出现 (\d+) 把不同武器/) || [])[1];
    ck('抽卡覆盖面（2000 次 ≥ 300 把，说明没被少数贵武器垄断）', +uniq >= 300, true);

    /* ---- 7) 价格确实参与了排序：按纯分数排出来的顺序应当不同 ---- */
    const byScore = rows.slice().sort((a, b) => b.score - a.score).map(r => r.w);
    ck('价格参与了排序（榜单 ≠ 纯分数排序）', names.join('|') !== byScore.join('|'), true);
    const byPrice = rows.slice().sort((a, b) => b.price - a.price).map(r => r.w);
    ck('也不是纯价格排序（分数仍起作用）', names.join('|') !== byPrice.join('|'), true);

    /* ---- 8) 换类别后只在指定类别里抽 ---- */
    await q(`(function(){var s=document.getElementById('openCatSel'); s.value='近战'; s.dispatchEvent(new Event('change',{bubbles:true})); return 1;})()`);
    await sleep(300);
    await q(`document.getElementById('onRun').click();`);
    for (let i = 0; i < 120; i++) {
      const busy = await q(`document.getElementById('onRun').disabled`);
      if (!busy) break;
      await sleep(250);
    }
    await sleep(300);
    const melee = await q(`(function(){
      var a=[]; [].slice.call(document.querySelectorAll('#onList .on-row .on-ct')).forEach(function(t){a.push(t.textContent.trim());});
      return a;
    })()`);
    ck('选「近战」后榜单全是近战', melee.length > 0 && melee.every(t => t === '近战'), true);

    /* ---- 9) 点一行：武器跟着换（含紫卡整套） ---- */
    const before = await q(`(function(){var e=document.querySelector('#c2 .wtitle, #c2 .wname'); return e?e.textContent.trim():'';})()`);
    const first = await q(`(function(){var r=document.querySelector('#onList .on-row'); var n=(r.querySelector('.on-w')||{}).textContent||''; r.click(); return n;})()`);
    await sleep(700);
    const after = await q(`(function(){var e=document.querySelector('#c2 .wtitle, #c2 .wname'); return e?e.textContent.trim():'';})()`);
    ck('点一行后卡面武器变成该行武器', after.indexOf(first.trim()) >= 0, true);

    const exc = await q(`(window.__errs||[]).length`);
    ck('无页面异常', exc, 0);
    const logs = p.cdp.logs.filter(x => /exception|console\.error/i.test(x));
    ck('控制台无异常日志', logs.slice(0, 2), []);

    /* ---- 10) 版式：价格与分数都在行内、不溢出、名字不被挤没 ---- */
    const box = await q(`(function(){
      var r=document.querySelector('#onList .on-row');
      if(!r) return null;
      var rr=r.getBoundingClientRect();
      var pw=r.querySelector('.on-pw').getBoundingClientRect();
      var nm=r.querySelector('.on-w').getBoundingClientRect();
      return { rowR:Math.round(rr.right), pwR:Math.round(pw.right), nmW:Math.round(nm.width),
               overflow: Math.round(pw.right - rr.right) };
    })()`);
    ck('价格/分数不溢出卡片', box && box.overflow <= 1, true);
    ck('武器名有可见宽度', box && box.nmW > 20, true);
  } finally {
    p.kill();
  }
  console.log(fail ? ('❌ 失败 ' + fail + ' 条') : '✅ 全部通过', '（' + pass + '/' + (pass + fail) + '）');
  process.exit(fail ? 1 : 0);
})();
