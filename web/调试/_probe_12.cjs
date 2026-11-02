'use strict';
/* #12 专属强化卡越权 —— 界面级验收（v2）
   判据：专属强化卡 sentient 涌现只对「视使之触」生效，不得出现在其它手枪的可装列表里。

   验收思路：同一把手枪池里，用「名单含谁」做正反交叉，证明过滤依据是 ex 名单而不是武器类别。
        Sentient 涌现  ex=[ocucor]           → 视使之触 有 / 拉托 无 / 麦格努斯 无
        致命机动      ex=[magnus,magnus_p]   → 麦格努斯 有 / 视使之触 无
   四条一起过，才算「按专属名单过滤」，只测一条有可能是「整池都没了」。

   ★ 卡片真实容器 = #g-mblist（#g-mbpool 只是「当前武器…」提示行，读错会假绿）
   ★ picker 在 #dmg 分区内，不切路由高度恒为 0（头号假绿来源）⇒ 先 location.hash='#/dmg'
   ★ 选中后 #g-q 会被清空，武器名看 #g-wsum */
const path = require('path');
const { openPage, toFileUrl } = require('./cdp.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
function chk(name, got, want) {
  const ok = String(got) === String(want);
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + ' = ' + got + (ok ? '' : '（期望 ' + want + '）'));
  ok ? pass++ : fail++;
}

(async () => {
  const file = path.resolve(process.argv[2] || require('./cdp.cjs').latestProduct());
  const p = await openPage(toFileUrl(file));
  const q = async (e) => { try { return await p.cdp.eval(e); } catch (err) { return 'ERR:' + err.message; } };

  const openWeapon = async (weapon) => {
    await q(`(function(){var b=document.querySelector('[data-a="mbclr"]'); if(b) b.click(); return true;})()`);
    await sleep(180);
    await q(`(function(){var q=document.getElementById('g-q'); q.value=${JSON.stringify(weapon)}; q.dispatchEvent(new Event('input',{bubbles:true})); return true;})()`);
    await sleep(480);
    await q(`(function(){var it=document.querySelector('#g-hits .g-hit'); if(it) it.click(); return !!it;})()`);
    await sleep(1200);
    await q(`(function(){var s=document.querySelector('#g-mbslots [data-mbs]'); if(s) s.click(); return !!s;})()`);
    await sleep(600);
  };

  const search = async (kw, expectText) => {
    await q(`(function(){var i=document.getElementById('g-mbq'); if(!i) return false; i.value=${JSON.stringify(kw)}; i.dispatchEvent(new Event('input',{bubbles:true})); return true;})()`);
    await sleep(700);
    const rows = await q(`document.querySelectorAll('#g-mblist .mrow').length`);
    const hit = await q(`(function(){var l=document.getElementById('g-mblist'); return !!l && l.textContent.indexOf(${JSON.stringify(expectText)})>=0;})()`);
    const vis = await q(`(function(){var r=document.querySelector('#g-mblist .mrow'); if(!r) return 'no-row';
      var h=r.getBoundingClientRect().height, d=getComputedStyle(r).display;
      return h.toFixed(1)+'px/'+d+(h>20&&d!=='none'?'/VISIBLE':'/HIDDEN');})()`);
    const wsum = await q(`(function(){var e=document.getElementById('g-wsum'); return e?e.textContent.replace(/\\s+/g,' ').trim().slice(0,24):'-';})()`);
    return { rows, hit, vis, wsum };
  };

  const caseOf = async (label, weapon, kw, expectText, wantRows, wantHit) => {
    await openWeapon(weapon);
    const r = await search(kw, expectText);
    console.log('[' + label + '] ' + weapon + ' + ' + kw);
    chk('  已选中武器', r.wsum.indexOf(weapon) === 0, true);
    chk('  命中「' + expectText + '」', r.hit, wantHit);
    chk('  行数 ' + (wantRows === 0 ? '= 0' : '≥ 1'), wantRows === 0 ? r.rows : (r.rows >= 1), wantRows === 0 ? 0 : true);
    if (wantHit) {
      chk('  行可见（非 0 高 / 非 none）', /VISIBLE/.test(r.vis), true);
      console.log('      可见性实测: ' + r.vis);
    }
    return r;
  };

  try {
    await sleep(2200);
    await q(`location.hash='#/dmg'`);
    await sleep(800);
    chk('路由已切到 dmg', await q(`document.documentElement.getAttribute('data-route')`), 'dmg');

    await caseOf('A 正', '视使之触', 'sentient', 'Sentient', 1, true);
    await caseOf('B 反', '拉托', 'sentient', 'Sentient', 0, false);
    await caseOf('C 反', '麦格努斯', 'sentient', 'Sentient', 0, false);
    await caseOf('D 反', '视使之触', '致命机动', '致命机动', 0, false);
    await caseOf('E 正', '麦格努斯', '致命机动', '致命机动', 1, true);

    console.log('\n' + (fail === 0 ? '✅ 全部通过' : '❌ 失败 ' + fail + ' 条') + '（' + pass + '/' + (pass + fail) + '）');
  } catch (e) { console.log('ERR ' + e.message); fail++; }
  const errs = (p.cdp.logs || []).filter(l => l.type === 'exception' || l.type === 'error');
  if (errs.length) { console.log('页面异常:'); errs.slice(-5).forEach(l => console.log('  ' + (l.text || '').slice(0, 200))); fail++; }
  else console.log('页面异常: none');
  p.kill();
  process.exit(fail ? 1 : 0);
})();
