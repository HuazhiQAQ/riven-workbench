'use strict';
/* #13 连击时长 / 处决伤害真算并在面板显示 —— 界面级验收
   判据：词条收益按引擎真实算法计算，并把结果直接显示在面板上。

   根因记录：parseRiven() 只认 s.en（→buckets）或 s.meta（→meta），
   comboDur / finisher 原来两条都没有 ⇒ 紫卡写了也直接被丢掉（面板恒显示「不受影响」）。
   修法：S() 加 meta:'comboDur' / meta:'finisher'，面板读 (meta||{}).*

   断言：
     · 未加卡时 连击时长 差值为「—」（无变化）
     · 加 comboDur +8.1 ⇒ 5.00s → 13.10s，差值 +8.10s
     · 加 finisher +120 ⇒ 处决 3010 → 6623，差值 +3612，且提示里有「紫卡」归因
   ★ 面板容器 #g-panel（05 区同款 .wd 网格），行 = .k（名称+提示）+ .c 无卡 + .c 有卡 + .delta 差值 */
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
  const p = await openPage(toFileUrl(path.resolve(process.argv[2] || require('./cdp.cjs').latestProduct())));
  const q = async (e) => { try { return await p.cdp.eval(e); } catch (err) { return 'ERR:' + err.message; } };

  // 面板行 → [{label, a, b, d, tip}]
  // 2026-10-27 起 #g-panel 是 05 区同款 .wd 网格：行 = .k（名 + small 提示）+ .c（无卡）+ .c（有卡）+ .delta（差值）
  const rows = () => q(`(function(){
    var out=[], cur=null, wd=document.querySelector('#g-panel .wd');
    if(!wd) return out;
    [].slice.call(wd.children).forEach(function(el){
      if(el.classList.contains('hd')||el.classList.contains('grp')) return;
      if(el.classList.contains('k')){
        cur={label:el.textContent.replace(/\\s+/g,' ').trim(), tip:''};
        var sm=el.querySelector('small');
        if(sm) cur.tip=sm.textContent.replace(/\\s+/g,' ').trim();
        out.push(cur); return;
      }
      if(!cur) return;
      if(el.classList.contains('c')){ if(cur.a==null) cur.a=el.textContent.trim(); else cur.b=el.textContent.trim(); }
      else if(el.classList.contains('delta')) cur.d=el.textContent.trim();
    });
    return out;
  })()`);
  const find = (list, kw) => (list || []).filter(r => r.label.indexOf(kw) >= 0)[0] || null;

  const setRow = async (row, val) => {
    await q(`(function(){var s=document.querySelector('#g-boxes select.g-k[data-b="0"]'); if(!s) return 'no sel'; s.value='${row}'; s.dispatchEvent(new Event('change',{bubbles:true})); return s.value;})()`);
    await sleep(500);
    await q(`(function(){var i=document.querySelector('#g-boxes input[data-b="0"]'); if(!i) return 'no inp'; i.value='${val}'; i.dispatchEvent(new Event('input',{bubbles:true})); return i.value;})()`);
    await sleep(700);
  };

  try {
    await sleep(1900);
    await q(`location.hash='#/dmg'`);
    await sleep(700);
    await q(`(function(){var q=document.getElementById('g-q'); q.value='侍刃'; q.dispatchEvent(new Event('input',{bubbles:true})); return true;})()`);
    await sleep(450);
    await q(`(function(){var it=document.querySelector('#g-hits .g-hit'); if(it) it.click(); return !!it;})()`);
    /* 引擎慢热时选武/面板渲染晚 —— 轮询等 .wd 出现行再断言（否则基线全是空） */
    for (let i = 0; i < 30; i++) {
      const wdReady = await q(`(function(){var wd=document.querySelector('#g-panel .wd'); return !!wd && wd.textContent.indexOf('连击时长') >= 0;})()`);
      if (wdReady === true) break;
      await sleep(500);
    }
    await sleep(500);

    console.log('[1] 未加卡基线');
    let r = await rows();
    const cd0 = find(r, '连击时长'), fi0 = find(r, '处决伤害');
    chk('面板有「连击时长」行', !!cd0, true);
    chk('面板有「处决伤害」行', !!fi0, true);
    console.log('      基线: 连击 ' + (cd0 ? cd0.a + '/' + cd0.b + '/' + cd0.d : '-') + ' ｜ 处决 ' + (fi0 ? fi0.a + '→' + fi0.b : '-'));
    chk('基线连击无差值（—）', cd0 && cd0.d, '—');
    const baseFin = fi0 ? fi0.a : '';

    console.log('[2] 加「连击持续时间 +8.1」');
    await setRow(28, 8.1);
    r = await rows();
    const cd1 = find(r, '连击时长');
    console.log('      连击 ' + cd1.a + ' → ' + cd1.b + ' （' + cd1.d + '）');
    chk('无卡值 5.00s', cd1.a, '5.00s');
    chk('有卡值 13.10s', cd1.b, '13.10s');
    chk('差值 +8.10s', cd1.d, '+8.10s');
    chk('行名带解释（连击窗口）', cd1.label.indexOf('连击窗口') >= 0, true);

    console.log('[3] 加「处决伤害 +120%」');
    await setRow(33, 120);
    r = await rows();
    const fi1 = find(r, '处决伤害');
    console.log('      处决 ' + fi1.a + ' → ' + fi1.b + ' （' + fi1.d + '） tip=' + fi1.tip.slice(0, 60));
    chk('无卡值不变（' + baseFin + '）', fi1.a, baseFin);
    chk('有卡值变大', parseFloat(fi1.b.replace(/,/g, '')) > parseFloat(fi1.a.replace(/,/g, '')), true);
    chk('差值非「—」', fi1.d !== '—', true);
    chk('提示含紫卡归因', fi1.tip.indexOf('紫卡') >= 0, true);

    console.log('\n' + (fail === 0 ? '✅ 全部通过' : '❌ 失败 ' + fail + ' 条') + '（' + pass + '/' + (pass + fail) + '）');
  } catch (e) { console.log('ERR ' + e.message); fail++; }
  const errs = (p.cdp.logs || []).filter(l => l.type === 'exception' || l.type === 'error');
  if (errs.length) { console.log('页面异常:'); errs.slice(-5).forEach(l => console.log('  ' + (l.text || '').slice(0, 200))); fail++; }
  else console.log('页面异常: none');
  p.kill();
  process.exit(fail ? 1 : 0);
})();
