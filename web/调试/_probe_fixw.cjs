/* _probe_fixw.cjs —— 05 识别结果接管信息栏 + 修弹窗覆盖回归
 *
 *   node debug/_probe_fixw.cjs <产物.html>
 *
 * 背景（用户报障）：手选过武器后，05 识别结果被旧选择压住 —— 信息栏不自动填入、
 *   「武器一致」分支连「修」按钮都没有、武器面板停在旧武器上。
 * 修复语义：识别完成 = 明确动作，武器 / 等级一律以识别结果为准；「修」随时可把
 *   两侧一起改成指定武器（含「武器一致但输入框被手选覆盖」的情形）。
 *
 * 用「粘贴文字」链路（generate 的 k:v 文本）驱动 applyResult，不依赖 OCR 认名：
 *   [1] 手选麦格努斯 → 武器面板 .nm = 麦格努斯
 *   [2] 粘贴「武器名称：拉托 / 等级：8 / 词条…」→ 信息栏自动填拉托（不被手选压住）
 *   [3] 等级直接填识别值（旧值 8 / 新识别 5 → 应为 5，不是 Math.max）
 *   [4] 武器面板 .nm 跟到拉托
 *   [5] #match 出现「仅一侧认出武器 + 拉托 + 修按钮」
 *   [6] 点「修」选麦格努斯 → 信息栏与武器面板一起覆盖回麦格努斯
 *   [7] 全程无页面异常
 */
'use strict';
const path = require('path');
const { openPage, toFileUrl } = require('./cdp.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const TXT = ['武器名称：拉托', 'Mod 等级：5',
  '正面词条：伤害 +120.5%', '正面词条：暴击伤害 +85.3%', '负面词条：范围 -40.2%'].join('\n');

(async () => {
  const html = process.argv[2] || require('./cdp.cjs').latestProduct();
  const p = await openPage(toFileUrl(path.resolve(html)));
  const out = [];
  let pass = 0, fail = 0;
  const ck = (ok, msg) => { ok ? pass++ : fail++; out.push((ok ? '  ✓ ' : '  ✗ ') + msg); };
  const ev = async expr => p.cdp.eval(expr);

  try {
    await sleep(4000);
    await ev("(function(){location.hash='#/choose';return 1;})()");
    await sleep(800);

    /* 等引擎就绪（WMAP / 武器面板依赖 RR.DB） */
    let eng = '';
    for (let i = 0; i < 40; i++) {
      eng = (await ev("(document.getElementById('eng')||{}).textContent")) || '';
      if (/引擎就绪/.test(eng)) break;
      await sleep(500);
    }
    ck(/引擎就绪/.test(eng) && /已载入/.test(eng), '引擎就绪 = ' + JSON.stringify(eng.slice(0, 60)));

    /* [1] 手选麦格努斯 */
    await ev(`(function(){
      var q=document.getElementById('wq');
      q.value='麦格努斯';
      q.dispatchEvent(new Event('input',{bubbles:true}));
      return 1;
    })()`);
    await sleep(600);
    const picked = await ev(`(function(){
      var b=document.querySelector('#wlist button[data-k]');
      if(!b) return 'NO_CAND';
      b.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
      return (document.getElementById('wq')||{}).value;
    })()`);
    ck(/麦格努斯/.test(picked || ''), '手选麦格努斯生效 = ' + JSON.stringify(picked));
    await sleep(400);
    const nm0 = await ev("(document.querySelector('#wpanel .wph .nm')||{}).textContent");
    ck(/麦格努斯/.test(nm0 || ''), '武器面板 .nm = 麦格努斯 = ' + JSON.stringify(nm0));

    /* [2][3][4] 粘贴文字：拉托 / 等级 5 → 信息栏与面板都跟到拉托、等级=5 */
    await ev(`(function(){
      var ta=document.getElementById('txA');
      ta.value=${JSON.stringify(TXT)};
      document.getElementById('txgoA').click();
      return 1;
    })()`);
    await sleep(600);
    const wq1 = await ev("(document.getElementById('wq')||{}).value");
    ck(/拉托/.test(wq1 || ''), '识别后信息栏自动填入拉托（不被手选压住）= ' + JSON.stringify(wq1));
    const rk1 = await ev("(document.getElementById('rk')||{}).value");
    ck(rk1 === '5', '等级直接填识别值 5（旧逻辑 Math.max 会得 8）= ' + JSON.stringify(rk1));
    const nm1 = await ev("(document.querySelector('#wpanel .wph .nm')||{}).textContent");
    ck(/拉托/.test(nm1 || ''), '武器面板跟到拉托 = ' + JSON.stringify(nm1));
    const vis1 = await ev(`(function(){
      var el=document.getElementById('wpanel'); if(!el) return {h:-1,d:'NO'};
      var r=el.getBoundingClientRect();
      return {h:Math.round(r.height), d:getComputedStyle(el).display};
    })()`);
    ck(vis1.d !== 'none' && vis1.h > 100, '武器面板「可见」（非 display:none，高 ' + vis1.h + 'px）= ' + JSON.stringify(vis1));
    const wd1 = await ev("!!document.querySelector('#wpanel .wdiff')");
    ck(wd1 === true, '武器面板无卡→有卡网格存在');
    const match1 = await ev(`(function(){
      var m=document.getElementById('match'); if(!m) return {};
      return { t:m.textContent, fix:!!m.querySelector('#fixW') };
    })()`);
    ck(/仅一侧认出武器/.test(match1.t || '') && /拉托/.test(match1.t || ''),
       '#match 显示仅一侧认出拉托 = ' + JSON.stringify((match1.t || '').slice(0, 50)));
    ck(match1.fix === true, '#match 带修按钮');

    /* [6] 点修 → 候选选麦格努斯 → 两侧识别态与信息栏/面板一起覆盖 */
    await ev(`(function(){
      var b=document.querySelector('#match #fixW');
      b.click();
      return 1;
    })()`);
    await sleep(400);
    const dlg = await ev("!!document.getElementById('fixWMask')");
    ck(dlg === true, '修弹窗打开');
    await ev(`(function(){
      var inp=document.getElementById('fixWInput');
      inp.value='麦格努斯';
      inp.dispatchEvent(new Event('input',{bubbles:true}));
      return 1;
    })()`);
    await sleep(500);
    const fixApplied = await ev(`(function(){
      var fx=document.querySelector('#fixWCands .fx[data-i]');
      if(!fx) return 'NO_CAND';
      fx.click();
      return (document.getElementById('wq')||{}).value;
    })()`);
    ck(/麦格努斯/.test(fixApplied || ''), '修之后新武器覆盖信息栏 = ' + JSON.stringify(fixApplied));
    await sleep(500);
    const nm2 = await ev("(document.querySelector('#wpanel .wph .nm')||{}).textContent");
    ck(/麦格努斯/.test(nm2 || ''), '修之后武器面板覆盖回麦格努斯 = ' + JSON.stringify(nm2));
    const vis2 = await ev(`(function(){
      var el=document.getElementById('wpanel'); if(!el) return {h:-1};
      return {h:Math.round(el.getBoundingClientRect().height)};
    })()`);
    ck(vis2.h > 100, '修之后武器面板仍可见（高 ' + vis2.h + 'px）');
    const dlgGone = await ev("!document.getElementById('fixWMask')");
    ck(dlgGone === true, '修弹窗选定后关闭');

    const exc = p.cdp.logs.filter(x => /exception|console\.error/i.test(x));
    ck(exc.length === 0, '全程无页面异常' + (exc.length ? '：' + exc[0].slice(0, 120) : ''));
  } catch (e) {
    fail++;
    out.push('  ✗ 探针本身异常：' + e.message);
  }
  p.kill();
  console.log(out.join('\n'));
  console.log('\n' + (fail ? '❌ 失败 ' + fail + ' 条' : '✅ 全部通过（' + pass + '/' + (pass + fail) + '）'));
  process.exit(fail ? 1 : 0);
})();
