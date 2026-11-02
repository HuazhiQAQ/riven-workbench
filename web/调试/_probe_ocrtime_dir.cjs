'use strict';
/* _probe_ocrtime_dir.cjs —— 对目录下每张卡逐张分段计时（引擎唤醒/检测det/识别rec/字段解析）
 *   node debug/_probe_ocrtime_dir.cjs <图片目录> [<产物.html>]
 * 分段来自页内开关 window.__ocrProfile（仅当为 true 时，ocr_engine.js/onnxFullRows 与 ocr.js/finish 记录）
 * 排除单字母测试对 A.png/B.png → 跑 16 张。 */
const fs = require('fs');
const path = require('path');
const { openPage, toFileUrl } = require('./cdp.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const DIR = process.argv[2] || 'D:/桌面/紫卡测试';
const FILE = process.argv[3] || path.join(__dirname, '..', 'dist', '20261029-riven-sim-v8.html');
const SKIP = new Set(['A.png', 'B.png']); // 单字母测试对，排除

function mimeOf(n) {
  const e = n.toLowerCase().split('.').pop();
  return e === 'jpg' || e === 'jpeg' ? 'image/jpeg' : 'image/png';
}

(async () => {
  let files = fs.readdirSync(DIR).filter(f => /\.(png|jpe?g)$/i.test(f)).sort();
  files = files.filter(f => !SKIP.has(f));
  console.log('目录 ' + DIR + '，排除 ' + [...SKIP].join('/') + '，共跑 ' + files.length + ' 张');

  const p = await openPage(toFileUrl(path.resolve(FILE)));
  await sleep(4000);
  await p.cdp.eval("(function(){location.hash='#/choose';return 1;})()");
  await sleep(800);
  await p.cdp.eval('window.__ocrProfile = true;'); // 开启分段计时

  const rows = [];
  for (const name of files) {
    const full = path.join(DIR, name);
    const b64 = fs.readFileSync(full).toString('base64');
    const mime = mimeOf(name);
    await p.cdp.eval(`(function(){
      var b='${b64}'; var bin=atob(b); var len=bin.length;
      var u=new Uint8Array(len); for(var i=0;i<len;i++) u[i]=bin.charCodeAt(i);
      var f=new File([u],'${name.replace(/'/g, "\\'")}',{type:'${mime}'});
      var dt=new DataTransfer(); dt.items.add(f);
      var inp=document.getElementById('fileA'); inp.files=dt.files;
      inp.dispatchEvent(new Event('change',{bubbles:true}));
      window.__upT0 = performance.now();
      return 1;
    })()`);
    let ready = false, upMs = 0;
    for (let i = 0; i < 30; i++) {
      await sleep(300);
      ready = await p.cdp.eval("document.getElementById('runAll').disabled") === false;
      if (ready) break;
    }
    upMs = await p.cdp.eval('Math.round(performance.now() - (window.__upT0||performance.now()))');
    if (!ready) { rows.push([name, '—', null, '图片未就绪/未识别']); continue; }
    // 重置分段计数 → 点「开始识别」并计时
    await p.cdp.eval(`(function(){
      window.__ocrPhases = { wake:0, det:0, rec:0, parse:0 };
      window.__done=null; window.__start=performance.now();
      document.getElementById('runAll').click();
      window.__iv=setInterval(function(){
        var s=(document.getElementById('stA')||{}).textContent||'';
        if(/识别完成|识别失败/.test(s)){ window.__done={t:performance.now(), s:s}; clearInterval(window.__iv); }
      },100);
      return 1;
    })()`);
    let done = null;
    for (let i = 0; i < 120; i++) {
      await sleep(500);
      done = await p.cdp.eval('window.__done');
      if (done) break;
    }
    const st = done ? done.s : '(超时)';
    const ms = done ? Math.round(done.t - (await p.cdp.eval('window.__start'))) : null;
    const ph = await p.cdp.eval('window.__ocrPhases');
    const dbg = await p.cdp.eval('(window.__dbgRows||[]).map(function(r){return ((r&&r.yc)||0).toFixed(0)+\":\"+(r&&r.text||\"\");}).join(\" | \")');
    const meta = await p.cdp.eval('JSON.stringify({retry:window.__ocrRetry||"",first:window.__affixFirst||0,valid:window.__validAffix||0,name:!!window.__hasName,shaky:!!window.__shaky})');
    rows.push([name, ms, ph, st, upMs, dbg, meta]);
    await sleep(400);
  }

  const f2 = s => (s == null ? '—' : (s / 1000).toFixed(1));
  console.log('\n文件 | 传图+唤醒 | 唤醒 | 检测det | 识别rec | 解析 | 总(点→出) | 识别结果 | 重试/首趟affix/有效/武器名/shaky | 识别文本行');
  console.log('---');
  let tot = 0, n = 0, sw = 0, sd = 0, sr = 0, sp = 0;
  rows.forEach(r => {
    const ph = r[2] || {};
    console.log([r[0], (r[4] != null ? (r[4] / 1000).toFixed(1) + 's' : '—'),
      f2(ph.wake) + 's', f2(ph.det) + 's', f2(ph.rec) + 's', f2(ph.parse) + 's',
      (r[1] == null ? '—' : (r[1] / 1000).toFixed(1) + 's'), r[3], r[6] || '', r[5] || ''].join(' | '));
    if (r[1] != null) { tot += r[1]; n++; sw += ph.wake || 0; sd += ph.det || 0; sr += ph.rec || 0; sp += ph.parse || 0; }
  });
  if (n) {
    console.log('---');
    console.log('平均(有效 ' + n + ' 张)： 唤醒 ' + f2(sw / n) + 's · 检测 ' + f2(sd / n) + 's · ocr ' + f2(sr / n) + 's · 解析 ' + f2(sp / n) + 's · 总 ' + (tot / n / 1000).toFixed(1) + 's');
  }

  p.kill();
  process.exit(0);
})().catch(e => { console.error('ERR', e && e.message || e); process.exit(2); });
