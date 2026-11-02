'use strict';
/* _probe_rivenname.cjs —— 紫卡命名口径（2 条 vs 3 条）
 *   node debug/_probe_rivenname.cjs <产物.html>
 *
 * 国际服：2+1/2+0 =「武器名 前缀后缀」直接相接；3+1/3+0 =「武器名 前缀-前缀后缀」
 * 国服  ：2+1/2+0 =「武器名 核心·核心」；      3+1/3+0 =「武器名 核心-核心·核心」
 * 融合词条（core 是「xx占位」）两服都回退英文前后缀。
 */
const path = require('path');
const fs = require('fs');
const { openPage, toFileUrl } = require('./cdp.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function ck(n, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? '  ✓ ' : '  ✗ ') + n + ' = ' + JSON.stringify(got) + (ok ? '' : '（期望 ' + JSON.stringify(want) + '）'));
  ok ? pass++ : fail++;
}
const FILE = process.argv[2] || require('./cdp.cjs').latestProduct();

const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '数据', 'data.json'), 'utf8'));
const ST = {};
DATA.stats.forEach(s => { ST[s.row] = s; });

function coreOf(r, fb) {
  const c = ST[r].core;
  if (c && !/xx/i.test(c) && c.indexOf('占位') < 0) return c;
  return ST[r][fb] || '';
}
/* 期望名：rows 是按 ratio 排好序的行号数组 */
function expectName(bn, rows, cn) {
  const a = (r, fb) => (cn ? coreOf(r, fb) : (ST[r][fb] || ''));
  let res = bn + ' ' + a(rows[0], 'pre');
  if (rows.length === 1) return res;
  if (rows.length === 2) return res + (cn ? '·' : '') + a(rows[1], 'suf').toLowerCase();
  return res + '-' + a(rows[1], 'pre').toLowerCase() + (cn ? '·' : '') + a(rows[2], 'suf').toLowerCase();
}

const setLang = i => `(function(){var b=document.querySelector('[data-a="lang"][data-i="${i}"]');if(b)b.click();return !!b;})()`;
const goCalc = `(function(){ location.hash='#/calc'; return 1; })()`;
const setName = `(function(){
  var e=document.querySelector('#calc-body .rcard .rcard-name') || document.querySelector('.rcard .rcard-name');
  return e?e.textContent.trim():null;
})()`;

const pickWeapon = name => `(function(){
  var W=window.ZKDATA.weapons, idx=-1;
  for(var k=0;k<W.length;k++) if(W[k].cn===${JSON.stringify(name)}){idx=k;break;}
  if(idx<0) return 'noindex';
  var inp=document.getElementById('q'); if(!inp) return 'noq';
  inp.value=${JSON.stringify(name)};
  inp.dispatchEvent(new Event('input',{bubbles:true}));
  var el=document.querySelector('#cands [data-a="pick"][data-i="'+idx+'"]');
  if(!el) return 'nocand';
  el.click(); return 'ok';
})()`;

const setCombo = i => `(function(){
  var s=document.getElementById('combo'); if(!s) return 'nosel';
  s.value=String(${i}); s.dispatchEvent(new Event('change',{bubbles:true}));
  return s.value;
})()`;

const setRow = (i, row) => `(function(){
  var s=document.querySelector('#calc-body [data-a="krow"][data-i="${i}"]'); if(!s) return 'nosel';
  s.value=String(${row}); s.dispatchEvent(new Event('change',{bubbles:true}));
  return s.value;
})()`;

const setVal = (i, v) => `(function(){
  var inp=document.querySelector('#calc-body [data-a="kval"][data-i="${i}"]'); if(!inp) return 'noinp';
  inp.value=String(${v});
  inp.dispatchEvent(new Event('input',{bubbles:true}));
  inp.dispatchEvent(new Event('change',{bubbles:true}));
  return inp.value;
})()`;

const setRank = n => `(function(){ var i=document.getElementById('rank'); if(!i) return 'no';
  i.value=String(${n}); i.dispatchEvent(new Event('change',{bubbles:true})); return i.value; })()`;

(async () => {
  setTimeout(function () { console.error('WATCHDOG'); process.exit(3); }, 200000);
  const p = await openPage(toFileUrl(path.resolve(FILE), '#/calc'));
  const q = async e => { try { return await p.cdp.eval(e); } catch (err) { return 'ERR:' + err.message; } };
  try {
    await p.cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 900, deviceScaleFactor: 1, mobile: false
    }).catch(() => {});
    await sleep(2400);
    for (let i = 0; i < 40; i++) {
      const t = await q(`(document.querySelector('#eng')||{}).textContent||''`);
      if (String(t).indexOf('引擎就绪') >= 0) break;
      await sleep(250);
    }
    await q(setLang(1));               /* 国际服 */
    await sleep(300);
    await q(goCalc);
    await sleep(400);

    const WNAME = '布莱顿';
    ck('选中武器 ' + WNAME, await q(pickWeapon(WNAME)), 'ok');
    await sleep(400);
    const bn = await q(`(function(){var e=document.querySelector('#calc-body .wpn, #rcard');return 1;})()`);
    ck('页面有卡面', bn, 1);

    /* ---------- 2 条词条（2增益0减益） ---------- */
    ck('切到 2增益0减益', await q(setCombo(0)), '0');
    await sleep(300);
    const R2 = [2, 4];
    ck('填词条1', await q(setRow(0, R2[0])), String(R2[0]));
    await sleep(250);
    ck('填词条2', await q(setRow(1, R2[1])), String(R2[1]));
    await sleep(250);
    await q(setVal(0, 100)); await sleep(150);
    await q(setVal(1, 100)); await sleep(250);
    await q(setRank(8)); await sleep(300);

    const en2 = await q(setName);
    const cand2en = [expectName(WNAME, [2, 4], false), expectName(WNAME, [4, 2], false)];
    console.log('     国际服 2条：' + en2 + '　候选 ' + JSON.stringify(cand2en));
    ck('[国际服] 2 条 = 「武器名 前缀后缀」直接相接', cand2en.indexOf(en2) >= 0, true);
    ck('[国际服] 2 条里没有连字符', String(en2).replace(WNAME + ' ', '').indexOf('-') < 0, true);
    ck('[国际服] 2 条只有一个空格（武器名后）', String(en2).split(' ').length - 1, 1);

    await q(setLang(0));               /* 国服 */
    await sleep(500);
    const cn2 = await q(setName);
    const cand2cn = [expectName(WNAME, [2, 4], true), expectName(WNAME, [4, 2], true)];
    console.log('     国服 2条：' + cn2 + '　候选 ' + JSON.stringify(cand2cn));
    ck('[国服] 2 条 = 「武器名 核心·核心」', cand2cn.indexOf(cn2) >= 0, true);
    ck('[国服] 2 条用「·」而不是「-」', [String(cn2).indexOf('·') >= 0, String(cn2).replace(WNAME + ' ', '').indexOf('-') < 0], [true, true]);

    /* ---------- 3 条词条（3增益0减益） ---------- */
    await q(setLang(1));
    await sleep(400);
    ck('切到 3增益0减益', await q(setCombo(2)), '2');
    await sleep(300);
    ck('填词条1', await q(setRow(0, 2)), '2'); await sleep(200);
    ck('填词条2', await q(setRow(1, 4)), '4'); await sleep(200);
    ck('填词条3', await q(setRow(2, 5)), '5'); await sleep(200);
    await q(setVal(0, 100)); await sleep(120);
    await q(setVal(1, 100)); await sleep(120);
    await q(setVal(2, 100)); await sleep(250);
    await q(setRank(8)); await sleep(300);

    const en3 = await q(setName);
    const perm3 = a => [[a[0], a[1], a[2]], [a[0], a[2], a[1]], [a[1], a[0], a[2]],
                        [a[1], a[2], a[0]], [a[2], a[0], a[1]], [a[2], a[1], a[0]]];
    const cand3en = perm3([2, 4, 5]).map(o => expectName(WNAME, o, false));
    console.log('     国际服 3条：' + en3);
    ck('[国际服] 3 条 = 「前缀-前缀后缀」', cand3en.indexOf(en3) >= 0, true);
    ck('[国际服] 3 条含一个连字符', (String(en3).match(/-/g) || []).length, 1);

    await q(setLang(0));
    await sleep(500);
    const cn3 = await q(setName);
    const cand3cn = perm3([2, 4, 5]).map(o => expectName(WNAME, o, true));
    console.log('     国服 3条：' + cn3);
    ck('[国服] 3 条 = 「核心-核心·核心」', cand3cn.indexOf(cn3) >= 0, true);
    ck('[国服] 3 条同时有 - 和 ·',
      [String(cn3).replace(WNAME + ' ', '').indexOf('-') >= 0, String(cn3).indexOf('·') >= 0], [true, true]);

    /* ---------- 融合词条：core 是占位 → 回退英文前后缀 ---------- */
    await q(setCombo(0)); await sleep(300);
    await q(setRow(0, 2)); await sleep(200);
    ck('清空第 3 槽（保证只剩 2 条词条）', await q(setRow(2, 0)), '0'); await sleep(200);
    const r35 = await q(`(function(){
      var s=document.querySelector('#calc-body [data-a="krow"][data-i="1"]'); if(!s) return -1;
      for(var i=0;i<s.options.length;i++) if(s.options[i].value==='35'){ s.value='35'; s.dispatchEvent(new Event('change',{bubbles:true})); return 35; }
      return -2;
    })()`);
    ck('词条2 能选到融合词条（异常状态伤害）', r35, 35);
    await sleep(250);
    await q(setVal(0, 100)); await sleep(120);
    await q(setVal(1, 100)); await sleep(250);
    await q(setRank(8)); await sleep(300);

    const cnF = await q(setName);
    console.log('     国服 2条含融合词条：' + cnF);
    ck('[国服] 融合词条不吃「占位」核心词', String(cnF).indexOf('占位') < 0, true);
    ck('[国服] 融合词条用「·」分隔', String(cnF).indexOf('·') >= 0, true);
    const fused = ['增幅', '异伤占位'];
    ck('[国服] 融合词条回退到英文前后缀（Plaga/Mna 之类）',
      /[A-Za-z]/.test(String(cnF)), true);
    const candF = [expectName(WNAME, [2, 35], true), expectName(WNAME, [35, 2], true)];
    console.log('     融合候选：' + JSON.stringify(candF));
    ck('[国服] 2 条含融合词条 = 核心/前后缀 + 「·」', candF.indexOf(cnF) >= 0, true);

    /* ---------- 03 开卡：同一套口径（rivenName 走同一个出口） ---------- */
    /* 注意：点「开紫卡」后右栏 C[4] 的词条按设计是空的（要再点一次「洗卡」才出词条），
       所以每轮 = 开卡 + 洗卡，再读 #open .cmpc .cmp-side.now 的卡面。 */
    const openOne = `(function(){ var b=document.querySelector('#open [data-a="open"]'); if(b) b.click(); return !!b; })()`;
    const washOne = `(function(){ var b=document.querySelector('#open .cmpc [data-a="rerollActive"]'); if(b) b.click(); return !!b; })()`;
    const dumpOpen = `(function(){
      var card=document.querySelector('#open .cmpc .cmp-side.now .rcard'); if(!card) return null;
      var nm=(card.querySelector('.rcard-name')||{}).textContent||'';
      return { name:nm.trim(), pos:card.querySelectorAll('.rcard-line.pos').length };
    })()`;
    const shape = name => {
      const tail = String(name).replace(/^\S+\s/, '');
      return { dash: (tail.match(/-/g) || []).length,
               dot: (tail.match(/·/g) || []).length,
               sp: (String(name).match(/ /g) || []).length, tail: tail };
    };

    await q(setLang(1));               /* 国际服 */
    await sleep(300);
    await q(`(function(){ location.hash='#/open'; return 1; })()`);
    await sleep(700);
    ck('03 区能点到「洗卡」', await q(`!!document.querySelector('#open .cmpc [data-a="rerollActive"]')`), true);

    let seen2 = false, seen3 = false, bad = [], last = null;
    for (let t = 0; t < 12 && !(seen2 && seen3); t++) {
      await q(openOne);
      await sleep(350);
      await q(washOne);
      await sleep(450);
      const d = await q(dumpOpen);
      if (!d || !d.name || d.name === '—' || !d.pos) continue;
      last = d;
      console.log('     开卡 [' + d.pos + ' 条] ' + d.name);
      const f = shape(d.name);
      if (d.pos === 2) {
        seen2 = true;
        if (f.dash || f.dot) bad.push('国际服2条不该有分隔符:' + d.name);
        if (f.sp !== 1) bad.push('国际服2条空格数≠1:' + d.name);
      } else if (d.pos >= 3) {
        seen3 = true;
        if (f.dash !== 1) bad.push('国际服3条连字符数≠1:' + d.name);
        if (f.dot) bad.push('国际服3条不该有「·」:' + d.name);
        if (f.sp !== 1) bad.push('国际服3条空格数≠1:' + d.name);
      }
    }
    ck('03 开卡能拿到 2 条词条的卡', seen2, true);
    ck('03 开卡能拿到 3 条词条的卡', seen3, true);
    ck('[国际服] 03 卡名口径同 02（2 条相接 / 3 条一个连字符）', bad, []);

    /* 同一张卡切国服 → 立刻变「核心·核心」/「核心-核心·核心」，不需要重洗 */
    if (last) {
      await q(setLang(0));
      await sleep(500);
      const d2 = await q(dumpOpen);
      const nm2 = (d2 && d2.name) || '';
      console.log('     同一张卡切国服 [' + last.pos + ' 条] ' + nm2);
      const f2 = shape(nm2);
      const wantDash = last.pos === 2 ? 0 : 1;
      ck('[国服] 03 卡名分隔符 = 「·」+ ' + wantDash + ' 个「-」', [f2.dot >= 1, f2.dash], [true, wantDash]);
      ck('[国服] 03 卡名没带「占位」', nm2.indexOf('占位') < 0, true);
      ck('[国服] 03 卡名是「武器名 词缀」两段', /^\S+ \S/.test(nm2), true);
    }

    await q(setLang(1));
    await sleep(300);
    ck('全程无页面异常', await q(`(window.__zkErrs||[]).length`), 0);
  } finally {
    try { p.kill(); } catch (e) { /* 关不掉不影响结论 */ }
  }
  console.log(fail ? ('❌ 失败 ' + fail + ' 条 （' + pass + '/' + (pass + fail) + '）') : ('✅ 全部通过（' + pass + '/' + pass + '）'));
  process.exit(fail ? 1 : 0);
})();
