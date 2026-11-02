/* _probe_rowsmeta.cjs —— 「功能2 输入框限制规则搬到 4 和 5」验收
 *
 *   node debug/_probe_rowsmeta.cjs <产物.html>
 *
 * 口径（全部照抄 02 区 ocrApply / lists() / slotRow，不发明新模型）：
 *   internal = 派系 ? (v−1)×100 : sign×|v|×dirOf(row)；internal<0 进负面槽（第 4 行）。
 *   「加后坐力」读数为正 → internal 为负 → 天然落负面（总则 A-1：后坐力方向相反）。
 *   04/05 都没有正负切换按钮（02 同构），行标恒为「正面词条 1/2/3 · 负面词条」。
 *   04 固定 4 槽：符号由槽位定（第 4 格恒负面）；负面格排除永正（融合/近战远程永正表）、
 *   正面格排除永负(30)；基础元素 ≤2；每卡融合 ≤1；不重复。
 */
'use strict';
const path = require('path');
const { openPage, toFileUrl } = require('./cdp.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const TXT = ['武器名称：拉托', 'Mod 等级：5',
  '+120.5% 伤害', '+85.3% 暴击伤害', '-40.2% 范围'].join('\n');

(async () => {
  const html = process.argv[2] || require('./cdp.cjs').latestProduct();
  const p = await openPage(toFileUrl(path.resolve(html)));
  const out = [];
  let pass = 0, fail = 0;
  const ck = (msg, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; out.push((ok ? '  ✓ ' : '  ✗ ') + msg + ' = ' + JSON.stringify(got) + (ok ? '' : '（期望 ' + JSON.stringify(want) + '）')); };
  const ev = async expr => p.cdp.eval(expr);

  try {
    await sleep(4000);

    /* ========== 05 侧 ========== */
    await ev("(function(){location.hash='#/choose';return 1;})()");
    await sleep(800);
    let eng = '';
    for (let i = 0; i < 40; i++) {
      eng = (await ev("(document.getElementById('eng')||{}).textContent")) || '';
      if (/引擎就绪/.test(eng)) break;
      await sleep(500);
    }
    ck('05 引擎就绪', /引擎就绪/.test(eng), true);

    /* 先手选武器（同 _probe_fixw 链路：粘贴前 wq 不能空） */
    await ev(`(function(){
      var q=document.getElementById('wq');
      q.value='麦格努斯';
      q.dispatchEvent(new Event('input',{bubbles:true}));
      return 1;
    })()`);
    await sleep(600);
    await ev(`(function(){
      var b=document.querySelector('#wlist button[data-k]');
      if(b) b.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
      return !!b;
    })()`);
    await sleep(400);

    await ev(`(function(){
      var ta=document.getElementById('txA');
      ta.value=${JSON.stringify(TXT)};
      document.getElementById('txgoA').click();
      return 1;
    })()`);
    await sleep(800);

    const r05 = await ev(`(function(){
      var host=document.getElementById('rowsA');
      if(!host) return {err:'no rowsA'};
      var slots=[].slice.call(host.querySelectorAll('.rslot'));
      var vis=slots.map(function(s){
        var ri=s.querySelector('.ri');
        if(!ri) return 'NO_RI';
        var h=ri.getBoundingClientRect().height;
        return (h>0?'VIS':'HID')+':'+ri.textContent.trim();
      });
      var metas=[].slice.call(host.querySelectorAll('.rslot .meta')).map(function(m){
        return m.textContent;
      }).join(' || ');
      var sgn = slots.map(function(s){ return !!s.querySelector('.sg'); });
      return { n:slots.length, vis:vis, sgn:sgn,
        man:/满值/.test(metas), flo:/浮动/.test(metas), old:/占上限/.test(metas) };
    })()`);
    ck('05 行槽 4 条', r05.n, 4);
    ck('05 无符号按钮（sg 已删）', r05.sgn, [false, false, false, false]);
    ck('05 行标依次 = 正面词条 1/2/3/负面词条', r05.vis,
      ['VIS:正面词条 1','VIS:正面词条 2','VIS:正面词条 3','VIS:负面词条']);
    ck('05 meta 出现「满值」', r05.man, true);
    ck('05 meta 出现「浮动」', r05.flo, true);
    ck('05 旧文案「占上限」已消失', r05.old, false);

    /* 后坐力方向（总则 A-1）：+49.48% 后坐力 = 坏事 → 第 4 行；input 显示正读数 */
    await ev(`(function(){
      var ta=document.getElementById('txA');
      ta.value='武器名称：拉托\\nMod 等级：5\\n+120.5% 伤害\\n+85.3% 暴击伤害\\n+49.48% 武器后坐力';
      document.getElementById('txgoA').click();
      return 1;
    })()`);
    await sleep(800);
    const r05r = await ev(`(function(){
      return [].slice.call(document.querySelectorAll('#rowsA .rslot')).map(function(s){
        return { ri:(s.querySelector('.ri')||{}).textContent,
                 sel:(s.querySelector('select')||{}).value,
                 inp:(s.querySelector('input')||{}).value };
      });
    })()`);
    console.log('      [dump] 05 recoil+ = ' + JSON.stringify(r05r));
    ck('05 「加后坐力」落第 4 行负面槽（总则 A-1）',
      [r05r[3].ri, +r05r[3].sel, +r05r[3].inp], ['负面词条', 25, 49.48]);
    ck('05 正面行不受 recoil 挤占', [r05r[0].ri, r05r[1].ri],
      ['正面词条 1', '正面词条 2']);

    /* 派系负：-38% → ×0.62 进第 4 行 */
    await ev(`(function(){
      var ta=document.getElementById('txA');
      ta.value='武器名称：拉托\\nMod 等级：5\\n+120.5% 伤害\\n+85.3% 暴击伤害\\n-38% 对Grineer 的伤害';
      document.getElementById('txgoA').click();
      return 1;
    })()`);
    await sleep(800);
    const r05f = await ev(`(function(){
      return [].slice.call(document.querySelectorAll('#rowsA .rslot')).map(function(s){
        return { ri:(s.querySelector('.ri')||{}).textContent,
                 inp:(s.querySelector('input')||{}).value };
      });
    })()`);
    ck('05 派系负 −38% → ×0.62 落第 4 行', r05f[3], { ri: '负面词条', inp: '0.6200' });

    /* ========== 04 侧 ========== */
    await ev("(function(){location.hash='#/dmg';return 1;})()");
    await sleep(1000);
    const r04 = await ev(`(function(){
      var pill=document.querySelector('#g-quick .g-pill[data-q="crit"]');
      if(pill && !document.querySelector('#g-boxes .g-box:not(.empty)')) pill.click();
      var boxes=[].slice.call(document.querySelectorAll('#g-boxes .g-box'));
      var labs=boxes.map(function(b){
        var ri=b.querySelector('.g-ri');
        if(!ri) return 'NO_LAB';
        var h=ri.getBoundingClientRect().height;
        return (h>0?'VIS':'HID')+':'+ri.textContent.trim();
      });
      var sgn=boxes.map(function(b){ return !!b.querySelector('.g-sgn'); });
      var cm=[].slice.call(document.querySelectorAll('#g-boxes .g-cmeta')).map(function(e){
        return e.textContent; }).join(' || ');
      return { n:boxes.length, labs:labs, sgn:sgn, man:/满值/.test(cm), flo:/浮动/.test(cm) };
    })()`);
    ck('04 g-box 渲染 ≥ 2 条', r04.n >= 2, true);
    ck('04 无符号按钮（g-sgn 已删）', r04.sgn.slice(0, 2), [false, false]);
    ck('04 行标 = 正面词条 1/2（固定位置）',
      [r04.labs[0], r04.labs[1]], ['VIS:正面词条 1', 'VIS:正面词条 2']);
    ck('04 cmeta 出现「满值」「浮动」', [r04.man, r04.flo], [true, true]);

    /* 04 后坐力方向：负面格选 recoil → s.v 正（加后坐力=坏事）；正面格选 recoil → s.v 负 */
    const r04r = await ev(`(function(){
      function setK(b, v){
        var sel=document.querySelector('#g-boxes .g-box[data-b="'+b+'"] .g-k');
        if(!sel) return 'NO_SEL';
        var has=[].slice.call(sel.options).some(function(o){ return o.value === String(v); });
        if(!has) return 'NO_OPT';
        sel.value = String(v);
        sel.dispatchEvent(new Event('change',{bubbles:true}));
        return 'OK';
      }
      function rd(b){
        var box = document.querySelector('#g-boxes .g-box[data-b="'+b+'"] .g-vwrap input');
        return box ? box.value : null;
      }
      var a = setK(3, 25);    /* 负面格：武器后坐力 */
      var va = rd(3);         /* 加后坐力 = 坏事 → 落负面格应显正读数 */
      setK(3, 0);             /* 清掉负面格（不重复闸门会挡第二把 recoil） */
      var b = setK(0, 25);    /* 正面格：武器后坐力 */
      var vb = rd(0);         /* 减后坐力 = 好事 → 落正面格应显负读数 */
      return { a:a, negRowV: va === null ? null : +va,
               b:b, posRowV: vb === null ? null : +vb,
               posInp: vb };
    })()`);
    console.log('      [dump] 04 recoil = ' + JSON.stringify(r04r));
    ck('04 负面格收后坐力：引擎值 s.v > 0（加后坐力）', [r04r.a, r04r.negRowV > 0], ['OK', true]);
    ck('04 正面格收后坐力：引擎值 s.v < 0（减后坐力）+ 输入框显负读数',
      [r04r.b, r04r.posRowV < 0, /^-/.test(r04r.posInp || '')], ['OK', true, true]);

    /* 04 负面格池子排除永正（融合 35-52），正面格排除永负 30 */
    const r04p = await ev(`(function(){
      function optRows(b){
        var sel=document.querySelector('#g-boxes .g-box[data-b="'+b+'"] .g-k');
        return sel ? [].slice.call(sel.options).map(function(o){ return +o.value; }).filter(function(v){ return v > 0; }) : [];
      }
      var neg = optRows(3), pos = optRows(0);
      var negHasFuse = neg.some(function(r){ return r >= 35 && r <= 52; });
      var posHas30 = pos.indexOf(30) >= 0;
      return { negHasFuse: negHasFuse, posHas30: posHas30 };
    })()`);
    ck('04 负面格下拉无融合词条（永正）', r04p.negHasFuse, false);
    ck('04 正面格下拉无「概率不获得连击数」(30)', r04p.posHas30, false);

    console.log(out.join('\n'));
    console.log('\n' + (fail === 0 ? '✅ 全部通过' : '❌ 失败 ' + fail + ' 条') + '（' + pass + '/' + (pass + fail) + '）');
  } catch (e) {
    console.log(out.join('\n'));
    console.log('ERR ' + e.message); fail++;
  }
  const errs = (p.cdp.logs || []).filter(l => l.type === 'exception' || l.type === 'error');
  if (errs.length) { console.log('页面异常:'); errs.slice(-5).forEach(l => console.log('  ' + (l.text || '').slice(0, 200))); fail++; }
  else console.log('页面异常: none');
  p.kill();
  process.exit(fail ? 1 : 0);
})();
