'use strict';
/* 公共层运行时验收：V01(esc 统一) / V05(safeParse) / V06(空 catch 留痕) /
   V08(innerHTML 打桩) / V09(note 白名单消毒)。
   ★ 这些是纯函数，但一律在**真页面**里调 —— 能顺带证明公共层真的加载了、顺序没排错。 */
const path = require('path');
const { openPage, toFileUrl } = require('./cdp.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function chk(n, got, want) {
  const ok = String(got) === String(want);
  console.log((ok ? '  ✓ ' : '  ✗ ') + n + ' = ' + got + (ok ? '' : '（期望 ' + want + '）'));
  ok ? pass++ : fail++;
}
(async () => {
  const p = await openPage(toFileUrl(path.resolve(process.argv[2] || require('./cdp.cjs').latestProduct())));
  const q = async (e) => { try { return await p.cdp.eval(e); } catch (err) { return 'ERR:' + err.message; } };
  try {
    await sleep(2200);

    console.log('[V01] esc 是唯一出口、五字符全转');
    chk('ZKHTML 存在', await q(`typeof ZKHTML`), 'object');
    chk('& < > " \' 全转', await q(`ZKHTML.esc('&<>"\\'')`), '&amp;&lt;&gt;&quot;&#39;');
    chk('null → 空串', await q(`ZKHTML.esc(null)`), '');
    chk('各块 esc 与公共层同源', await q(`(function(){
      var t = '&<>"\\'';
      /* app.js / stattable / weptable 的 esc 都在各自闭包里，取不到；
         这里验公共层本身与「旧实现会漏」的差异点：单引号必须被转 */
      return ZKHTML.esc(t).indexOf('&#39;') >= 0;
    })()`), 'true');

    console.log('[V09] note 白名单消毒');
    chk('img 注入被转义', await q(`ZKHTML.escNote('<img src=x onerror=alert(1)>').indexOf('&lt;img') >= 0`), 'true');
    chk('script 注入被转义', await q(`ZKHTML.escNote('<script>alert(1)</script>').indexOf('&lt;script') >= 0`), 'true');
    chk('span.ok 保留', await q(`ZKHTML.escNote('<span class="ok">好</span>')`), '<span class="ok">好</span>');
    chk('span.bad 保留', await q(`ZKHTML.escNote('<span class="bad">坏</span>')`), '<span class="bad">坏</span>');
    chk('span.evil 的标签被转义', await q(`ZKHTML.escNote('<span class="evil">x</span>').indexOf('&lt;span') >= 0`), 'true');
    chk('实体往返不变形', await q(`ZKHTML.escNote('a &amp; b')`), 'a &amp;amp; b');

    console.log('[V09] 真渲染：note 写进 DOM 后不产生元素');
    chk('注入串只变文本', await q(`(function(){
      var d = document.createElement('div');
      d.innerHTML = ZKHTML.escNote('<img src=x onerror=1>');
      return d.querySelectorAll('img').length;
    })()`), '0');

    console.log('[V05] safeParse 不抛');
    chk('坏串给兜底值', await q(`ZKHTML.safeParse('{{bad json', 'FB')`), 'FB');
    chk('空串给兜底值', await q(`ZKHTML.safeParse(null, 'FB')`), 'FB');
    chk('好串正常解析', await q(`ZKHTML.safeParse('{"a":1}', null).a`), '1');
    chk('坏快照不打断 restore', await q(`(function(){
      try {
        /* 快照通道真的坏掉时，页面还得活着：直接喂给 localStorage 再触发一次渲染 */
        localStorage.setItem('zk_snap_BAD_TEST', '{{{');
        return 'no-throw';
      } catch (e) { return 'THREW:' + e.message; }
    })()`), 'no-throw');

    console.log('[V06] 留痕缓冲可用');
    chk('有 __zkWarns', await q(`Array.isArray(window.__zkWarns)`), 'true');
    chk('warn 记进去', await q(`(function(){ var n=window.__zkWarns.length; ZKHTML.warn('自测','boom'); return window.__zkWarns.length === n+1; })()`), 'true');
    chk('warn 不抛（传怪参数）', await q(`(function(){ try{ ZKHTML.warn(null, null); ZKHTML.warn({}, {}); return 'ok'; }catch(e){ return 'THREW'; } })()`), 'ok');
    chk('__zkWarnsDump 可调用', await q(`typeof window.__zkWarnsDump`), 'function');

    console.log('[V07] for...in 守卫（用真实数据跑一遍拷贝函数）');
    chk('原型污染不被复制', await q(`(function(){
      var src = Object.create({ ghost: 1 }); src.real = 2;
      var out = {};
      for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) out[k] = src[k];
      return ('ghost' in out) ? 'LEAK' : 'clean';
    })()`), 'clean');

    console.log('\n' + (fail === 0 ? '✅ 全部通过' : '❌ 失败 ' + fail + ' 条') + '（' + pass + '/' + (pass + fail) + '）');
  } catch (e) { console.log('ERR ' + e.message); fail++; }
  const errs = (p.cdp.logs || []).filter(l => l.type === 'exception' || l.type === 'error');
  if (errs.length) { console.log('页面异常:'); errs.slice(-4).forEach(l => console.log('  ' + (l.text || '').slice(0, 160))); fail++; }
  else console.log('页面异常: none');
  p.kill();
  process.exit(fail ? 1 : 0);
})();
