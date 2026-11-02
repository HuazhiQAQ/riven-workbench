'use strict';
/* _probe_fuseopt.cjs —— 03「融合词条」下拉里要能看见卡面读数
 *   node debug/_probe_fuseopt.cjs <绝对路径产物.html>
 *
 * 断言：
 *   [1] 融合下拉的每个材料项都带数值（+7.20 / ×1.40 这种），不是只有名字
 *   [2] option 的 value 仍是行号（改文本不能动提交值）
 *   [3] 占位项保持「— 选一个材料 —」，不硬塞数值
 *   [4] 选中后控件显示的文本同样带数值
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

const dump = `(function(){
  var s=document.querySelector('#fusewrap select[data-a="fus"]');
  if(!s) return null;
  return [].slice.call(s.options).map(function(o){
    return { v:o.value, t:(o.textContent||'').trim() };
  });
})()`;

(async () => {
  setTimeout(function () { console.error('WATCHDOG'); process.exit(3); }, 180000);
  const p = await openPage(toFileUrl(path.resolve(FILE), '#/open'));
  const q = async e => { try { return await p.cdp.eval(e); } catch (err) { return 'ERR:' + err.message; } };
  try {
    await sleep(2200);
    for (let i = 0; i < 40; i++) {
      const t = await q(`(document.querySelector('#eng')||{}).textContent||''`);
      if (String(t).indexOf('引擎就绪') >= 0) break;
      await sleep(250);
    }

    /* 反复开卡/洗卡，直到卡面上出现可融合的两条材料 */
    let opts = null;
    for (let i = 0; i < 60; i++) {
      await q(`(function(){
        var b=document.querySelector('[data-a="${i === 0 ? 'open' : 'rerollActive'}"]');
        if(b) b.click(); return !!b;
      })()`);
      await sleep(i === 0 ? 500 : 220);
      opts = await q(dump);
      if (opts && opts.length > 1) break;
    }
    if (!opts || opts.length <= 1) {
      ck('融合下拉出现（卡面有可融材料）', false, true);
      throw new Error('no fusepool');
    }
    ck('融合下拉出现（卡面有可融材料）', opts.length > 1, true);
    console.log('     选项：' + opts.map(o => o.t).join(' | '));

    const mats = opts.filter(o => o.v !== '0');
    ck('每个材料项都带数值', mats.length > 0 && mats.every(o => /[+×−-]\s?\d/.test(o.t)), true);
    ck('value 仍是行号（没被文本污染）', mats.every(o => /^\d+$/.test(o.v)), true);
    ck('占位项不塞数值', (opts[0].t || '').indexOf('选一个材料') >= 0, true);

    /* 选中第一项，确认收起后控件文本也带数值 */
    const shown = await q(`(function(){
      var s=document.querySelector('#fusewrap select[data-a="fus"]');
      var o=[].slice.call(s.options).filter(function(x){return x.value!=='0';})[0];
      s.value=o.value; s.dispatchEvent(new Event('change',{bubbles:true}));
      var s2=document.querySelector('#fusewrap select[data-a="fus"]');
      return (s2.options[s2.selectedIndex]||{}).text || '';
    })()`);
    ck('选中后显示的文本带数值', /[+×−-]\s?\d/.test(String(shown)), true);
    console.log('     选中：' + shown);

    ck('全程无页面异常', await q(`(window.__zkErrs||[]).length`), 0);
  } finally {
    try { p.kill(); } catch (e) { /* 关不掉不影响结论 */ }
  }
  console.log(fail ? ('❌ 失败 ' + fail + ' 条 （' + pass + '/' + (pass + fail) + '）') : ('✅ 全部通过（' + pass + '/' + pass + '）'));
  process.exit(fail ? 1 : 0);
})();
