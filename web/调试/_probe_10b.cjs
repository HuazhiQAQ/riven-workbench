'use strict';
/* #10 导入洗卡模拟器时预判定并自动上锁 —— 界面级验收
   需求：从其它入口导入洗卡模拟器时，先预判定哪些是锁定词条，并自动上锁。

   判据（prejudgeLocks）：
     · 融合词条（FUSE_FROM..FUSE_TO）无条件上锁，且不占「普通词条」名额
     · 普通词条按来源锁，一次最多认 1 条（基础词条只能锁一条）

   流程：开卡 → 复制到计算器 → 把第 0 槽改成融合词条 35 → 「再洗一次」回填 #c2wrap
        ⇒ 期望 卡槽 0=35、锁定列 0=1 / 1=0、提示位 #msg2 有「已导入并自动锁定」

   ★ 锁定列只在 blk≠1 的卡上有（#c2 是 blk=1，没有锁列）⇒ 必须在 #c2wrap 上验
   ★ 提示位是 #msg<blk>（class="hint"），不是 .c-note */
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
  const q = async (expr) => { try { return await p.cdp.eval(expr); } catch (e) { return 'ERR:' + e.message; } };
  const slots = () => q(`(function(){var o=[];document.querySelectorAll('#c2wrap select[data-a="slot"]').forEach(function(s){o.push(s.getAttribute('data-i')+'='+s.value);});return o.join(',');})()`);
  const locks = () => q(`(function(){var o=[];document.querySelectorAll('#c2wrap select[data-a="lock"]').forEach(function(s){o.push(s.getAttribute('data-i')+'='+s.value);});return o.join(',');})()`);
  const krows = () => q(`(function(){var o=[];document.querySelectorAll('select[data-a="krow"]').forEach(function(s){o.push(s.getAttribute('data-i')+'='+s.value);});return o.join(',');})()`);

  try {
    await sleep(1900);
    await q(`location.hash='#/open'`);
    await sleep(700);
    chk('路由 open', await q(`document.documentElement.getAttribute('data-route')`), 'open');

    await q(`(function(){var b=document.querySelector('[data-a="open"]'); if(b) b.click(); return !!b;})()`);
    await sleep(900);
    console.log('  开卡后卡槽: ' + await slots());

    await q(`(function(){var bs=[].slice.call(document.querySelectorAll('[data-a="copy2calc"]')); var t=bs.filter(function(b){return b.getAttribute('data-b')==='2';})[0]||bs[0]; if(t) t.click(); return !!t;})()`);
    await sleep(800);
    const k0 = await krows();
    console.log('  计算器行: ' + k0);
    chk('计算器已拿到词条', k0.split(',').filter(x => !/=0$/.test(x)).length >= 1, true);

    /* 第 0 槽改成融合词条 35 —— 这是「融合产物」，导入后必须无条件上锁 */
    const set35 = await q(`(function(){var s=document.querySelector('select[data-a="krow"][data-i="0"]'); if(!s) return 'none'; s.value='35'; s.dispatchEvent(new Event('change',{bubbles:true})); return s.value;})()`);
    chk('第 0 槽设为融合词条 35', set35, '35');
    await sleep(600);
    chk('计算器行 0=35', (await krows()).split(',')[0], '0=35');

    /* 顺带把第 1 槽的普通词条也「手动上锁」—— 只有 krow 没有锁控件时跳过 */
    await q(`(function(){var b=document.querySelector('[data-a="gotoPick"]'); if(b) b.click(); return !!b;})()`);
    await sleep(1100);

    const s2 = await slots(), l2 = await locks();
    console.log('  回填卡: ' + s2);
    console.log('  回填锁: ' + l2);
    chk('回填 0=35（融合词条带过去了）', s2.split(',')[0], '0=35');
    chk('融合词条自动上锁（0=1）', l2.split(',')[0], '0=1');
    chk('普通词条不自动上锁（1=0）', l2.split(',')[1], '1=0');

    const msg = await q(`(function(){var e=document.getElementById('msg2'); return e?e.textContent.trim():'';})()`);
    console.log('  提示位 #msg2: ' + (msg || '(空)'));
    chk('提示位有自动上锁说明', msg.indexOf('自动锁定') >= 0, true);

    /* 反向：全是普通词条时不该锁 */
    await q(`(function(){var s=document.querySelector('select[data-a="krow"][data-i="0"]'); s.value=s.options[1]?s.options[1].value:'0'; s.dispatchEvent(new Event('change',{bubbles:true})); return true;})()`);
    await sleep(500);
    await q(`(function(){var b=document.querySelector('[data-a="gotoPick"]'); if(b) b.click(); return true;})()`);
    await sleep(1100);
    const l3 = await locks();
    console.log('  普通词条回填锁: ' + l3);
    chk('无融合词条时不产生锁', (l3.split(',') || []).filter(x => /=1$/.test(x)).length, 0);

    console.log('\n' + (fail === 0 ? '✅ 全部通过' : '❌ 失败 ' + fail + ' 条') + '（' + pass + '/' + (pass + fail) + '）');
  } catch (e) { console.log('ERR ' + e.message); fail++; }
  const errs = (p.cdp.logs || []).filter(l => l.type === 'exception' || l.type === 'error');
  if (errs.length) { console.log('页面异常:'); errs.slice(-5).forEach(l => console.log('  ' + (l.text || '').slice(0, 200))); fail++; }
  else console.log('页面异常: none');
  p.kill();
  process.exit(fail ? 1 : 0);
})();
