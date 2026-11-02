'use strict';
/* _probe_kfus.cjs —— 02 区词条行的「融」浮框
 *   node debug/_probe_kfus.cjs <绝对路径产物.html>
 *
 * 断言：
 *   [1] 四条词条行都在下拉后面带「融」按钮，且下拉确实收窄了
 *   [2] 没选词条时按钮禁用，点不动也不出浮框
 *   [3] 选中「电击伤害」后点开：浮框出现，列出全部可融合产物（腐蚀/磁力…）
 *   [4] 数值是卡面读数（带 + 和 %），并附产物满值
 *   [5] 数值 / 满值 = 本条词条的浮动比（与 03 区 doFusion 同口径）
 *   [6] 关闭按钮能关；点外面也能关
 *   [7] 改数值触发重算时浮框自动收起（读数不过期）
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

const popDump = `(function(){
  var el=document.getElementById('fusPop');
  if(!el) return null;
  return {
    on: el.classList.contains('on'),
    disp: getComputedStyle(el).display,
    hd: ((el.querySelector('.hd')||{}).textContent||'').trim(),
    prods: [].slice.call(el.querySelectorAll('td.prod')).map(function(td){return td.textContent.trim();}),
    mats: [].slice.call(el.querySelectorAll('td.mat')).map(function(td){return td.textContent.trim();}),
    vals: [].slice.call(el.querySelectorAll('td.val')).map(function(td){return td.textContent.trim();}),
    tip: ((el.querySelector('.tip')||{}).textContent||'').trim()
  };
})()`;

(async () => {
  setTimeout(function () { console.error('WATCHDOG'); process.exit(3); }, 180000);
  const p = await openPage(toFileUrl(path.resolve(FILE), '#/calc'));
  const q = async e => { try { return await p.cdp.eval(e); } catch (err) { return 'ERR:' + err.message; } };
  try {
    /* 无头 Chrome 默认 764×485，浮框上下翻转会失真；按真机桌面视口量 */
    await p.cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(600);
    await sleep(2200);
    for (let i = 0; i < 40; i++) {
      const t = await q(`(document.querySelector('#eng')||{}).textContent||''`);
      if (String(t).indexOf('引擎就绪') >= 0) break;
      await sleep(250);
    }

    /* 选武器：搜索框 → 第一个候选 */
    await q(`(function(){var i=document.getElementById('q'); i.value='拉托';
      i.dispatchEvent(new Event('input',{bubbles:true})); return true;})()`);
    await sleep(400);
    const picked = await q(`(function(){var c=document.querySelector('#cands .cand');
      if(!c) return false; c.click(); return true;})()`);
    ck('能用搜索选中武器', picked, true);
    await sleep(700);

    /* [1] 四行都有按钮，下拉收窄 */
    const layout = await q(`(function(){
      var bs=[].slice.call(document.querySelectorAll('#calc-body [data-a="kfus"]'));
      var s=document.querySelector('#calc-body select[data-a="krow"]');
      return {
        btn: bs.length,
        dis: bs.filter(function(b){return b.disabled;}).length,
        selW: s ? Math.round(s.getBoundingClientRect().width) : 0,
        btnW: bs[0] ? Math.round(bs[0].getBoundingClientRect().width) : 0,
        btnH: bs[0] ? Math.round(bs[0].getBoundingClientRect().height) : 0,
        label: bs[0] ? (bs[0].textContent||'').trim() : ''
      };
    })()`);
    ck('四条词条行都有「融」按钮', layout.btn, 4);
    ck('按钮文字是「融」', layout.label, '融');
    ck('词条下拉已收窄（< 150px）', layout.selW > 0 && layout.selW < 150, true);
    ck('按钮可见（有宽高）', layout.btnW > 0 && layout.btnH > 0, true);
    console.log('     下拉宽 ' + layout.selW + 'px · 按钮 ' + layout.btnW + '×' + layout.btnH + 'px');

    /* [2] 没选词条：按钮禁用，点了也不出浮框 */
    ck('没选词条时按钮全禁用', layout.dis, 4);
    await q(`(function(){var b=document.querySelector('#calc-body [data-a="kfus"][data-i="0"]');
      if(b) b.click(); return true;})()`);
    await sleep(200);
    ck('禁用状态下点不出浮框', await q(`(document.getElementById('fusPop').classList.contains('on'))`), false);

    /* 选「电击伤害」 */
    const sel = await q(`(function(){
      var r=ZKDATA.stats.filter(function(s){return s.cn==='电击伤害';})[0].row;
      var s=document.querySelector('#calc-body select[data-a="krow"][data-i="0"]');
      s.value=String(r); s.dispatchEvent(new Event('change',{bubbles:true}));
      var b=document.querySelector('#calc-body [data-a="kfus"][data-i="0"]');
      return { row:r, dis:!!b.disabled, val:(document.querySelector('#calc-body input[data-a="kval"][data-i="0"]')||{}).value };
    })()`);
    ck('选了词条后按钮可用', sel.dis, false);
    console.log('     词条行 = 电击伤害（row ' + sel.row + '）· 当前值 ' + sel.val);

    /* [3] 点开浮框（先把这一行滚进视口，跟真人对齐） */
    await q(`(function(){var b=document.querySelector('#calc-body [data-a="kfus"][data-i="0"]');
      if(b.scrollIntoView) b.scrollIntoView({block:'center'}); return true;})()`);
    await sleep(250);
    await q(`document.querySelector('#calc-body [data-a="kfus"][data-i="0"]').click()`);
    await sleep(300);
    const pop = await q(popDump);
    ck('浮框打开', pop.on, true);
    ck('浮框可见（display）', pop.disp, 'flex');
    const box = await q(`(function(){
      var r=document.getElementById('fusPop').getBoundingClientRect();
      var b=document.querySelector('#calc-body [data-a="kfus"][data-i="0"]').getBoundingClientRect();
      return { l:Math.round(r.left), t:Math.round(r.top), rt:Math.round(r.right), b:Math.round(r.bottom),
               w:Math.round(r.width), vw:innerWidth, vh:innerHeight,
               bl:Math.round(b.left), br:Math.round(b.right), bb:Math.round(b.bottom) };
    })()`);
    ck('浮框完整落在视口内（不贴边/不出界）',
      box.l >= 0 && box.t >= 0 && box.rt <= box.vw && box.b <= box.vh, true);
    ck('浮框在按钮右侧展开（不是压在表格左边）', box.l >= box.br, true);
    ck('浮框在按钮下方（不挡按钮本身）', box.t >= box.bb, true);
    console.log('     按钮右缘 ' + box.br + ' → 浮框 ' + box.w + 'px @ (' + box.l + ',' + box.t + ') · 视口 ' + box.vw + '×' + box.vh);
    ck('标题带词条名', pop.hd.indexOf('电击伤害') >= 0, true);
    ck('列出了融合产物', pop.prods.length >= 2, true);
    ck('产物含「腐蚀」「磁力」「辐射」', ['腐蚀', '磁力', '辐射'].every(s => pop.prods.join('|').indexOf(s) >= 0), true);
    ck('材料列非空', pop.mats.length === pop.prods.length && pop.mats.every(s => s.length > 0), true);
    console.log('     材料 → 产物：' + pop.mats.map((m, k) => m + '→' + pop.prods[k]).join(' | '));
    console.log('     数值：' + pop.vals.join(' | '));

    /* [4] 数值是卡面读数 + 满值 */
    ck('数值带正号和百分号', pop.vals.every(v => /\+[\d.]+%/.test(v)), true);
    ck('每行都附产物满值', pop.vals.every(v => /满值/.test(v)), true);
    ck('脚注说明按本条浮动折算', /浮动 [\d.]+% 折算/.test(pop.tip), true);

    /* [5] 数值 / 满值 = 本条浮动比（选了词条后默认落在最小值 P.lo=0.9） */
    const ratio = await q(`(function(){
      var lo=ZKDATA.params.lo;
      var vs=[].slice.call(document.querySelectorAll('#fusPop td.val')).map(function(td){
        var n=(td.textContent||'').match(/[+-][\\d.]+/g)||[];
        return n.length>=2 ? parseFloat(n[0])/parseFloat(n[1].replace('-','')) : null;
      });
      return { lo:lo, ok: vs.every(function(x){return x!=null && Math.abs(x-lo)<0.005;}), vs:vs };
    })()`);
    ck('数值 / 满值 = 本条浮动比（0.9）', ratio.ok, true);
    console.log('     实际比值：' + ratio.vs.map(v => v && v.toFixed(4)).join(' / '));

    /* [6] 关闭按钮 */
    await q(`document.querySelector('#fusPop .x').click()`);
    await sleep(200);
    ck('关闭按钮收起浮框', await q(`document.getElementById('fusPop').classList.contains('on')`), false);

    /* 点外面也能关 */
    await q(`document.querySelector('#calc-body [data-a="kfus"][data-i="0"]').click()`);
    await sleep(250);
    ck('再点能打开（开关正常）', await q(`document.getElementById('fusPop').classList.contains('on')`), true);
    await q(`document.body.click()`);
    await sleep(200);
    ck('点页面空白处收起浮框', await q(`document.getElementById('fusPop').classList.contains('on')`), false);

    /* [7] 实时跟随：边打字（input）数字就变，提交（change）也不收 */
    await q(`document.querySelector('#calc-body [data-a="kfus"][data-i="0"]').click()`);
    await sleep(250);
    const before = await q(popDump);
    /* 打一个必定落在浮动区间里的值：直接用浮框里的「满值」（= 100% 浮动）。
       写死 100 会因各武器倾向不同被夹到 0.9/1.1，主版与倾向版表现就会不一致。 */
    const fullNum = await q(`(function(){
      var v=(document.querySelector('#fusPop td.val')||{}).textContent||'';
      var m=v.match(/满值\\s*([+\\-]?[\\d.]+)/);
      return m ? m[1].replace('+','') : '';
    })()`);
    await q(`(function(){
      var inp=document.querySelector('#calc-body input[data-a="kval"][data-i="0"]');
      inp.value=${JSON.stringify(fullNum)}; inp.dispatchEvent(new Event('input',{bubbles:true}));
      return true;
    })()`);
    await sleep(250);
    const live = await q(popDump);
    ck('边打字浮框不关', live.on, true);
    ck('边打字数值立刻变（不用重开）', live.vals.join('|') !== before.vals.join('|'), true);
    ck('浮动比跟着打字变到 100%', /浮动 100\.0% 折算/.test(live.tip), true);
    ck('打满值 → 产物数值就是满值', live.vals.every(v => {
      const m = v.match(/([+\-][\d.]+)[^+\-]*?满值\s*([+\-][\d.]+)/);
      return m && m[1] === m[2];
    }), true);
    console.log('     打字前 ' + before.vals[0].replace(/\s+/g, ' '));
    console.log('     打字后 ' + live.vals[0].replace(/\s+/g, ' '));

    await q(`(function(){
      var inp=document.querySelector('#calc-body input[data-a="kval"][data-i="0"]');
      inp.dispatchEvent(new Event('change',{bubbles:true}));
      return true;
    })()`);
    await sleep(400);
    const done = await q(popDump);
    ck('提交（失焦/回车）后浮框仍在', done.on, true);
    ck('提交后数值与打字时一致', done.vals.join('|'), live.vals.join('|'));

    /* 换词条 → 浮框挂到新词条上重算；换成没融合对象的词条则自动收起 */
    const swap = await q(`(function(){
      var s=document.querySelector('#calc-body select[data-a="krow"][data-i="0"]');
      var o=[].slice.call(s.options).filter(function(x){return /火焰/.test(x.textContent);})[0];
      s.value=o.value; s.dispatchEvent(new Event('change',{bubbles:true}));
      var el=document.getElementById('fusPop');
      return { on:el.classList.contains('on'), hd:((el.querySelector('.hd')||{}).textContent||'').trim(),
               prods:[].slice.call(el.querySelectorAll('td.prod')).map(function(td){return td.textContent.trim();}) };
    })()`);
    ck('换词条后浮框跟着换标题', swap.hd.indexOf('火焰') >= 0, true);
    ck('换词条后产物表重算（火焰→辐射/爆炸/毒气）',
      /辐射|爆炸/.test((swap.prods || []).join('|')), true);
    console.log('     换成火焰后：' + (swap.prods || []).join(' | '));

    /* 换成没有融合对象的词条 → 浮框自己收掉、按钮变灰 */
    const toNone = await q(`(function(){
      var s=document.querySelector('#calc-body select[data-a="krow"][data-i="0"]');
      var o=[].slice.call(s.options).filter(function(x){return /穿透/.test(x.textContent);})[0];
      if(!o) return { skip:true };
      s.value=o.value; s.dispatchEvent(new Event('change',{bubbles:true}));
      var b=document.querySelector('#calc-body [data-a="kfus"][data-i="0"]');
      return { skip:false, on:document.getElementById('fusPop').classList.contains('on'), dis:!!(b&&b.disabled) };
    })()`);
    if (toNone.skip) console.log('     （没有「穿透」选项，跳过换词条收起用例）');
    else {
      ck('换成没有融合对象的词条 → 浮框自动收起', toNone.on, false);
      ck('同时按钮变灰', toNone.dis, true);
    }

    /* 负面词条行：基础伤害在负面列表里也能选，且 基础伤害+变焦=弱点伤害 → 按钮要能点 */
    const neg = await q(`(function(){
      var s=document.querySelector('#calc-body select[data-a="krow"][data-i="3"]');
      var o=[].slice.call(s.options).filter(function(x){return /基础伤害/.test(x.textContent);})[0];
      if(!o) return { ok:false, why:'no option' };
      s.value=o.value; s.dispatchEvent(new Event('change',{bubbles:true}));
      var b=document.querySelector('#calc-body [data-a="kfus"][data-i="3"]');
      if(!b||b.disabled) return { ok:false, why:'disabled' };
      b.click();
      var el=document.getElementById('fusPop');
      return { ok:el.classList.contains('on'),
        prods:[].slice.call(el.querySelectorAll('td.prod')).map(function(td){return td.textContent.trim();}) };
    })()`);
    ck('负面词条行也能看融合产物', neg.ok, true);
    ck('负面行产物含「弱点伤害」', (neg.prods || []).join('|').indexOf('弱点伤害') >= 0, true);
    console.log('     负面行产物：' + (neg.prods || []).join(' | '));

    /* 没有融合对象的词条 → 按钮禁用 + title 说明（上一段已经把 row 0 换成穿透了） */
    const none = await q(`(function(){
      var bs=[].slice.call(document.querySelectorAll('#calc-body [data-a="kfus"]'));
      var b=bs.filter(function(x){return x.disabled;})[0];
      if(!b) return { skip:true };
      return { skip:false, dis:true, ttl:b.getAttribute('title')||'' };
    })()`);
    if (none.skip) console.log('     （当前没有灰掉的「融」按钮，跳过）');
    else {
      ck('没有融合对象的词条 → 按钮禁用', none.dis, true);
      ck('禁用原因写在 title 里', none.ttl, '这条词条没有可融合的产物');
    }

    /* 窄屏兜底：右侧真放不下时不能把自己顶出视口 */
    await p.cdp.send('Emulation.setDeviceMetricsOverride', { width: 560, height: 700, deviceScaleFactor: 1, mobile: false });
    await sleep(500);
    await q(`(function(){
      var b=document.querySelector('#calc-body [data-a="kfus"][data-i="0"]');
      if(b && b.scrollIntoView) b.scrollIntoView({block:'center'});
      if(b) b.click();
      return true;
    })()`);
    await sleep(350);
    const nar = await q(`(function(){
      var el=document.getElementById('fusPop');
      if(!el.classList.contains('on')) return null;
      var r=el.getBoundingClientRect();
      return { l:Math.round(r.left), t:Math.round(r.top), rt:Math.round(r.right), b:Math.round(r.bottom),
               vw:innerWidth, vh:innerHeight };
    })()`);
    ck('窄屏（560px）下浮框仍开得出来', !!nar, true);
    if (nar) ck('窄屏下不出界', nar.l >= 0 && nar.rt <= nar.vw && nar.t >= 0 && nar.b <= nar.vh, true);

    /* 切到别的功能页 → 浮框不能留在屏幕上 */
    await q(`(function(){var x=document.querySelector('#fusPop .x'); if(x) x.click(); return true;})()`);
    await sleep(200);
    await q(`(function(){
      var s=document.querySelector('#calc-body select[data-a="krow"][data-i="0"]');
      var r=ZKDATA.stats.filter(function(x){return x.cn==='电击伤害';})[0].row;
      s.value=String(r); s.dispatchEvent(new Event('change',{bubbles:true}));
      document.querySelector('#calc-body [data-a="kfus"][data-i="0"]').click();
      return true;
    })()`);
    await sleep(300);
    ck('重新打开（换回路程检查）', await q(`document.getElementById('fusPop').classList.contains('on')`), true);
    await q(`(function(){ location.hash='#/open'; return true; })()`);
    await sleep(400);
    ck('切到别的功能页浮框自动收', await q(`document.getElementById('fusPop').classList.contains('on')`), false);
    await q(`(function(){ location.hash='#/calc'; return true; })()`);
    await sleep(600);

    const exc = (p.cdp.logs || []).filter(s => s.indexOf('[exception]') === 0);
    ck('全程无页面异常', exc.length, 0);
    if (exc.length) console.log('     ' + exc.join('\n     '));
  } catch (e) {
    console.log('  ✗ 异常：' + e.message);
    fail++;
  }
  console.log(fail ? `\n❌ 有 ${fail} 条失败` : `\n✅ 全部通过（${pass}/${pass + fail}）`);
  p.kill();
  process.exit(fail ? 1 : 0);
})();
