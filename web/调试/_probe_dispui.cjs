'use strict';
/* 口径切换 UI 级探针（复刻用户路径）：打开产物 → 点目录底「倾向版」→
 * 读「倾向数值区间表」模块自己的元素（rgMeta / rgList 选中项 / rgPosBody）。
 * 判定：切换后 AX-52（快照 0.85）的倾向显示必须从 1.20 变 0.85，
 *      正面表首行数值必须变化，页面零 JS 异常。
 * 用法: node _probe_dispui.cjs [产物路径或 http URL]
 */
const path = require('path');
const { openPage, toFileUrl } = require('./cdp.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const arg = process.argv[2] ||
    require('./cdp.cjs').latestProduct();
  const url = /^https?:/.test(arg) ? arg : toFileUrl(path.resolve(arg));
  const p = await openPage(url);
  await sleep(2500);
  const out = [];
  const ev = q => p.cdp.eval(q);

  out.push('BASE: unified=' + await ev('ZKC.isUnified()')
    + ' w0=' + await ev('ZKDATA.weapons[0].disp')
    + ' rgmeta=' + await ev(`(document.getElementById('rgMeta')||{textContent:''}).textContent.trim()`));

  const before = await ev(`(document.getElementById('rgPosBody')||{textContent:''}).textContent.replace(/\\s+/g,'').slice(0,80)`);
  out.push('BEFORE-TBL: ' + before);

  /* 02 区紫卡词条的「满值 / 浮动」也要跟倾向走：满值 = 基准 × 倾向 × 结构系数 × 1.10 */
  const caps = () => ev(`(function(){var n=document.querySelectorAll('#g-boxes .g-cmeta'),o=[],i;for(i=0;i<n.length;i++)o.push(n[i].textContent.replace(/\\s+/g,' ').trim());return o.join(' || ');})()`);
  await ev(`location.hash = '#calc'`);
  await sleep(1200);
  const cap0 = await caps();
  out.push('CAP-BEFORE: ' + cap0);

  const clicked = await ev(`(function(){
    var b = document.querySelector('.sb-seg [data-zk-d="v"]');
    if (!b) return 'NO-BTN';
    b.click(); return 'ok';
  })()`);
  await sleep(1500);
  out.push('CLICK: ' + clicked);

  out.push('STATE: unified=' + await ev('ZKC.isUnified()')
    + ' vcls=' + await ev(`document.body.hasAttribute('data-disp-variant')`)
    + ' on=' + await ev(`(document.querySelector('.sb-seg [data-zk-d].on')||{textContent:''}).textContent`));

  // rg 头：AX-52 快照 0.85 → 倾向必须显示 0.85
  const meta = await ev(`(document.getElementById('rgMeta')||{textContent:''}).textContent.trim()`);
  out.push('RG-META: ' + meta + ' → ' + (meta.indexOf('0.85') >= 0 ? 'PASS' : 'FAIL'));

  // rg 武器列表：选中项（AX-52）的倾向数字
  const sel = await ev(`(function(){
    var b = document.querySelector('#rgList .on .d') || document.querySelector('#rgList .on');
    return b ? b.textContent.trim() : 'NO-SEL';
  })()`);
  out.push('RG-LIST-SEL: ' + sel + ' → ' + (sel.indexOf('0.85') >= 0 ? 'PASS' : 'FAIL'));

  // rg 表格：必须变化
  const after = await ev(`(document.getElementById('rgPosBody')||{textContent:''}).textContent.replace(/\\s+/g,'').slice(0,80)`);
  out.push('AFTER-TBL: ' + after);
  out.push('RG-TBL: ' + (after && after !== before ? 'PASS' : 'FAIL'));

  // 速查表（sgx，已订阅）对照
  out.push('SGX-TBL: ' + await ev(`(document.getElementById('sgxBodyN')||{textContent:''}).textContent.replace(/\\s+/g,' ').slice(0,80)`));

  const cap1 = await caps();
  out.push('CAP-AFTER: ' + cap1);
  out.push('CAP-FOLLOW: ' + (cap0 && cap1 && cap0 !== cap1 && /满值/.test(cap1) ? 'PASS' : 'FAIL'));

  /* 04 组装台：合成出来的组合枪也要有历史倾向 —— 表里 (Primary)/(Secondary) 主副手各一条，
     不是「合成武器无倾向」。倾向版下：副手 孢射 = 0.60 / 主手 孢射 = 1.15。 */
  const asmPick = kind => ev(`(function(){
    var inp = document.getElementById('g-q'); if (!inp) return 'NO-Q';
    inp.value = '孢射'; inp.dispatchEvent(new Event('input', { bubbles: true }));
    var hs = [].slice.call(document.querySelectorAll('#g-hits .g-hit'));
    for (var i = 0; i < hs.length; i++) {
      if (hs[i].textContent.indexOf('（${kind}）') >= 0) { hs[i].click(); return 'ok'; }
    }
    return 'NO-HIT';
  })()`);
  const asmDisp = () => ev(`(function(){
    var ts = [].slice.call(document.querySelectorAll('#g-wsum .g-tag'));
    for (var i = 0; i < ts.length; i++) {
      var m = ts[i].textContent.match(/倾向\\s*([0-9.]+)/);
      if (m) return m[1];
    }
    return '-';
  })()`);
  await ev(`location.hash = '#calc'`);
  await sleep(1000);
  const asmS = await asmPick('副手'); await sleep(700);
  const aS = await asmDisp();
  const asmP = await asmPick('主手'); await sleep(700);
  const aP = await asmDisp();
  out.push('ASM-DISP: 副手=' + asmS + '/' + aS + ' 主手=' + asmP + '/' + aP
    + ' → ' + ((aS === '0.60' && aP === '1.15') ? 'PASS' : 'FAIL'));

  /* 05 洗卡建议器（modpanel）也要随口径重绘：满值 = 引擎 statCap(ew,…,tier) 现算 */
  await ev(`location.hash = '#choose'`);
  await sleep(1000);
  await ev(`(function(){
    var q = document.getElementById('wq'); if (!q) return 0;
    q.value = '执法者'; q.dispatchEvent(new Event('input'));
    var l = document.getElementById('wlist');
    var it = l ? (l.querySelector('[data-i]') || l.firstElementChild) : null;
    if (it) it.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    return 1;
  })()`);
  await sleep(900);
  const d05 = () => ev(`(function(){var t=(document.getElementById('binfo')||{}).textContent||'';var m=t.match(/倾向 ([0-9.]+)/);return m?m[1]:'-';})()`);
  const d0 = await d05();
  await ev(`document.querySelector('.sb-seg [data-zk-d="u"]').click()`);
  await sleep(800);
  const d1 = await d05();
  out.push('DMG05-FOLLOW → ' + ((d0 === '1.35' && d1 === '1.20') ? 'PASS' : 'FAIL ' + d0 + '→' + d1));

  out.push('EXC: ' + (p.cdp.logs.filter(x => x.indexOf('exception') >= 0 || x.indexOf('console.error') >= 0).join(' || ') || 'none'));

  const fails = out.filter(l => /→ FAIL|RG-TBL: FAIL|EXC: (?!none)/.test(l) || /ERR |NO-BTN/.test(l)).length;
  out.push('VERDICT: ' + (fails ? fails + ' FAIL' : 'ALL PASS'));
  p.kill();
  console.log(out.join('\n'));
  if (fails) process.exit(1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
