/* _probe_chooseocr.cjs —— 洗卡左右建议器的「选图 → 识别」链路回归
 *
 *   node debug/_probe_chooseocr.cjs <产物.html>
 *
 * 断言：
 *   [1] 载入图片后状态行显示尺寸（说明 file input 链路通）
 *   [2] 「开始识别」在有图后可用
 *   [3] 点下后立刻盖出「识别中，请勿操作」遮罩、按钮切「正在识别…」+ 转圈
 *   [4] 识别不报「识别失败」（含解码失败 / ReferenceError）
 *   [5] 识别完成后状态行给出词条条数
 *   [6] 遮罩与按钮忙碌态在结束时收掉
 *   [7] 全程无页面异常
 *
 * 这条链路的历史故障：上传后立刻撤销 blob URL 防泄漏，识别时按 URL 重载
 * 导致「图片解码失败」；同一条路上的小写命名调用也会抛 ReferenceError。
 * 识别跑在主线程上，没有遮罩时页面会「像卡死」，所以遮罩与按钮忙碌态单独设断言。
 */
'use strict';
const path = require('path');
const { openPage, toFileUrl } = require('./cdp.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const CARD_JS = `(function(){
  var c=document.createElement('canvas'); c.width=520;c.height=700;
  var g=c.getContext('2d');
  g.fillStyle='#1b1b1f'; g.fillRect(0,0,520,700);
  g.fillStyle='#7b3fe4'; g.fillRect(18,18,484,664);
  g.fillStyle='#f2f2f5'; g.fillRect(30,30,460,640);
  g.fillStyle='#111';
  g.font='28px sans-serif'; g.fillText('8',470,90);
  g.font='34px sans-serif'; g.fillText('执法者',60,150);
  g.font='26px sans-serif';
  ['+120.5% 伤害','+85.3% 暴击伤害','+60.1% 攻击速度','-40.2% 范围'].forEach(function(t,i){ g.fillText(t,60,240+i*60); });
  g.font='22px sans-serif'; g.fillText('精通段位 8',60,560);
  c.toBlob(function(b){
    var f=new File([b],'card.png',{type:'image/png'});
    var dt=new DataTransfer(); dt.items.add(f);
    var inp=document.getElementById('fileA'); inp.files=dt.files;
    inp.dispatchEvent(new Event('change',{bubbles:true}));
  },'image/png');
  return 1;
})()`;

(async () => {
  const html = process.argv[2] || require('./cdp.cjs').latestProduct();
  const p = await openPage(toFileUrl(path.resolve(html)));
  const out = [];
  let pass = 0, fail = 0;
  const ck = (ok, msg) => { ok ? pass++ : fail++; out.push((ok ? '  ✓ ' : '  ✗ ') + msg); };

  try {
    await sleep(4000);
    await p.cdp.eval("(function(){location.hash='#/choose';return 1;})()");
    await sleep(800);

    ck(await p.cdp.eval("typeof window.RivenOCR === 'object' && typeof window.RivenOCR.recognize === 'function'")
       === true, '识别接口存在（RivenOCR.recognize）');

    /* 传图即唤醒引擎（与 02 区同口径）：包一层 spy 计数 */
    await p.cdp.eval(`(function(){
      window.__wkN = 0;
      var _w = window.__wakeOnnx;
      window.__wakeOnnx = function(){ window.__wkN++; return _w ? _w.apply(this, arguments) : undefined; };
      return 1;
    })()`);

    await p.cdp.eval(CARD_JS);
    await sleep(1500);

    const loaded = await p.cdp.eval("(document.getElementById('stA')||{}).textContent");
    ck(/已载入/.test(loaded || ''), '选图后状态行给出尺寸 = ' + JSON.stringify(loaded));
    ck(await p.cdp.eval("(document.getElementById('runAll')||{}).disabled") === false,
       '有图后「开始识别」可点');

    /* 识别可能整条在几百毫秒内跑完（引擎已热），遮罩来了又走 —— 所以要旁听 DOM 变化，
       不能在点击后隔一段时间再去查询，否则只会看到「已经收起」。 */
    await p.cdp.eval(`(function(){
      window.__mk={seen:false, txt:'', sub:'', w:0, h:0, busy:false, spin:false, btnTxt:'', subs:[]};
      function snap(){
        var m=document.querySelector('.ocr-waitmask');
        var b=document.getElementById('runAll');
        if(b && !window.__mk.busy && b.classList.contains('is-busy')){
          window.__mk.busy=true; window.__mk.spin=!!b.querySelector('.ic');
          window.__mk.btnTxt=b.textContent.trim();
        }
        if(m){
          var ss=m.querySelector('.ocr-waitbox span');
          if(ss && ss.textContent && window.__mk.subs[window.__mk.subs.length-1]!==ss.textContent)
            window.__mk.subs.push(ss.textContent);
        }
        if(m && !window.__mk.seen){
          var bb=m.querySelector('.ocr-waitbox b');
          var r=m.getBoundingClientRect();
          window.__mk.seen=true;
          window.__mk.txt=(bb?bb.textContent:''); window.__mk.sub=(ss?ss.textContent:'');
          window.__mk.w=Math.round(r.width); window.__mk.h=Math.round(r.height);
        }
      }
      window.__mo=new MutationObserver(snap);
      window.__mo.observe(document.body,{childList:true,subtree:true,attributes:true});
      document.getElementById('runAll').click();
      snap();
      return 1;
    })()`);

    let st = '';
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      st = await p.cdp.eval("(document.getElementById('stA')||{}).textContent") || '';
      if (/识别失败|识别完成/.test(st)) break;
    }
    await sleep(300);
    const mk = await p.cdp.eval("(function(){window.__mo&&window.__mo.disconnect();return window.__mk;})()");
    ck(mk.seen && /识别中，请勿操作/.test(mk.txt), '点下后盖出识别遮罩 = ' + JSON.stringify(mk.txt));
    ck(mk.w > 600 && mk.h > 400, '遮罩铺满视口（挡住误点）= ' + mk.w + '×' + mk.h);
    ck(/请勿|不要/.test(mk.sub), '遮罩副标题说明期间不要操作 = ' + JSON.stringify(mk.sub));
    ck(mk.busy && mk.spin && /正在识别/.test(mk.btnTxt),
       '按钮切「正在识别…」+ 转圈 = ' + JSON.stringify(mk.btnTxt));
    const wkN = await p.cdp.eval("window.__wkN");
    ck((wkN | 0) >= 1, '传图时唤醒引擎（__wakeOnnx 调用 ' + wkN + ' 次 ≥ 1）');
    const hasProg = (mk.subs || []).some(t => /卡面 A/.test(t));
    ck(hasProg, '遮罩文案随识别进度更新（卡面 A：…）= ' + JSON.stringify((mk.subs || []).slice(0, 3)));

    ck(!/识别失败/.test(st), '识别未报失败 = ' + JSON.stringify(st));
    ck(/识别完成/.test(st) && /\d+\s*条词条/.test(st), '识别完成且带词条数 = ' + JSON.stringify(st));

    await sleep(300);
    const after = await p.cdp.eval(`(function(){
      var b=document.getElementById('runAll');
      return {mask:!!document.querySelector('.ocr-waitmask'), busy:b.classList.contains('is-busy'),
              txt:b.textContent.trim(), dis:b.disabled};
    })()`);
    ck(!after.mask && !after.busy && !after.dis && /开始识别/.test(after.txt),
       '结束后遮罩与忙碌态收起 = ' + JSON.stringify(after));

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
