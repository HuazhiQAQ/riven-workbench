/* lang_e2e.cjs —— 语言切换回归（合并原 lang_e2e / lang_e2e2，两轮覆盖合一）
 *
 *   node debug/lang_e2e.cjs [产物.html]
 *
 * 一次跑三档（国服 / 国际服 / English），逐档验四组：
 *   ① 引擎取名：属性 / 敌种 / 流派 / 槽位 / 段位 / 面板行 / 异常元素
 *   ② ZKMB 取名：MOD / 赋能 / 稀有度 / MOD 池 / 属性短名 / 触发条件
 *   ③ DOM：④ 区目标档按钮（敌种名 + 说明）、进阶微调元素下拉
 *   ④ 串语言检查：English 档下整页不得残留中文数据名
 *   ⑤ 卡面侧（原 lang_e2e）：词条下拉 行16 / 行18、洗 N 次候选词条名、区间表
 */
'use strict';
const path = require('path');
const { toFileUrl, openPage, sleep, latestProduct } = require('./cdp.cjs');

const DEFAULT_HTML = latestProduct();
const LANGS = ['国服', '国际服', 'English'];

/* 期望值：中文档用中文，English 档用英文 */
const EXP = {
  stat:      { cn: '伤害', en: 'Damage' },
  statElem:  { cn: '火焰伤害', en: 'Heat Damage' },
  target:    { cn: '克隆尼 · 枪兵', en: 'Grineer · Rifleman' },
  targetSub: { cn: '普通图 · 减伤 49% · 成群', en: 'Normal · damage reduction 49% · swarm' },
  arch:      { cn: '神威触染', en: 'Exodia Contagion' },
  slot:      { cn: '主武器', en: 'Primary' },
  grade:     { cn: '可用', en: 'Usable' },
  panelRow:  { cn: '总伤害', en: 'Total Damage' },
  panelGrp:  { cn: '构成', en: 'Composition' },
  procEl:    { cn: '病毒增殖', en: 'Viral Proliferation' },
  modName:   { cn: '牺牲 压迫点', en: 'Sacrificial Pressure' },
  arcane:    { cn: '主要·准星', en: 'Primary Crux' },
  pol:       { cn: '马杜莱', en: 'Madurai' },
  rar:       { cn: '优良', en: 'Uncommon' },
  pool:      { cn: '步枪专用', en: 'Assault Rifle' },
  statShort: { cn: '多重', en: 'Multishot' },
  trig:      { cn: '弱点命中', en: 'Weakpoint Hit' },
  cond:      { cn: '空中', en: 'Airborne' },
  elemDrop:  { cn: '火焰', en: 'Heat' },
};

/* 行 18 / 行 16 在三套语言下的名字（数据表 data.json 的 stats[row]） */
const ROW18 = { 0: '对异变体的伤害', 1: '对Infested的伤害', 2: 'Damage vs. Infested' };
const ROW16 = { 0: '对科普斯的伤害', 1: '对Corpus的伤害', 2: 'Damage vs. Corpus' };

function pick(L, k) { return L === 2 ? EXP[k].en : EXP[k].cn; }

async function main() {
  const htmlPath = process.argv[2] || DEFAULT_HTML;
  const page = await openPage(toFileUrl(htmlPath, '#/dmg'));
  const cdp = page.cdp;
  let bad = 0;
  const fail = (msg) => { console.log('   ✗ ' + msg); bad++; };
  const ok = (msg) => console.log('   ✓ ' + msg);

  try {
    for (let i = 0; i < 120; i++) {
      const v = await cdp.eval('document.readyState === "complete" && !!window.ZKDATA && !!window.RIVEN_ROUTER && !!window.ZKMB');
      if (v === true) break;
      await sleep(500);
    }

    /* 卡面侧准备：开一张卡 + 洗一次，让 #c2wrap 有词条可选 */
    await cdp.eval('location.hash = "#/open"; true');
    await sleep(800);
    await cdp.eval('document.querySelector(\'[data-a="open"]\').click(); true');
    await sleep(1000);
    await cdp.eval('document.querySelector(\'[data-a="rerollActive"]\').click(); true');
    await sleep(1000);
    await cdp.eval('location.hash = "#/dmg"; true');
    await sleep(600);

    for (let L = 0; L < 3; L++) {
      console.log('\n══ 语言 ' + LANGS[L] + ' (data-i=' + L + ') ══');
      await cdp.eval('document.querySelector(\'[data-a="lang"][data-i="' + L + '"]\').click(); true');
      await sleep(600);
      const cur = await cdp.eval('window.ZKLANGI()');
      if (cur !== L) fail('当前语言下标 = ' + cur + '，期望 ' + L);
      else ok('语言下标 = ' + cur);

      /* ① 引擎取名 */
      const eng = JSON.parse(await cdp.eval(`JSON.stringify({
        stat: window.RIVEN_ROUTER.statNameOf('dmg', ${L}),
        statElem: window.RIVEN_ROUTER.statNameOf('heat', ${L}),
        target: window.RIVEN_ROUTER.targetNameOf('g_mob', ${L}),
        targetSub: window.RIVEN_ROUTER.targetSubOf(window.RIVEN_ROUTER.TARGET_BY_K['g_mob'], ${L}),
        arch: window.RIVEN_ROUTER.archNameOf('m_contagion', ${L}),
        slot: window.RIVEN_ROUTER.slotNameOf('p', ${L}),
        grade: window.RIVEN_ROUTER.gradeNameOf('B', ${L}),
        panelRow: window.RIVEN_ROUTER.panelRowName({n:'总伤害'}, ${L}),
        panelGrp: window.RIVEN_ROUTER.panelGrpName('构成', ${L}),
        procEl: window.RIVEN_ROUTER.PROC_EL_EN['viral']
      })`));
      const pairs = [['stat', 'stat'], ['statElem', 'statElem'], ['target', 'target'], ['targetSub', 'targetSub'],
                     ['arch', 'arch'], ['slot', 'slot'], ['grade', 'grade'], ['panelRow', 'panelRow'], ['panelGrp', 'panelGrp']];
      pairs.forEach(([key, exp]) => {
        const want = pick(L, exp);
        if (eng[key] === want) ok('engine ' + key + ' = ' + want);
        else fail('engine ' + key + ' = ' + eng[key] + '，期望 ' + want);
      });
      if (L === 2) {
        if (eng.procEl === EXP.procEl.en) ok('engine procEl = ' + eng.procEl);
        else fail('engine procEl = ' + eng.procEl + '，期望 ' + EXP.procEl.en);
      }

      /* ② ZKMB 取名 */
      const mb = JSON.parse(await cdp.eval(`(() => {
        const Z = window.ZKMB;
        const mods = window.ZKMODS || [];
        const arcs = window.ZKARCS || [];
        const m = mods.find(x => x.i === 'sacrificial_pressure');
        const a = arcs.find(x => x.i === 'primary_crux');
        const trigMod = mods.find(x => (x.bg||[]).some(b => b.tr === 'headshot'));
        const condMod = mods.find(x => (x.bg||[]).some(b => b.cd === 'airborne'));
        return JSON.stringify({
          mod: Z.nm(m), arcane: Z.nm(a),
          rar: Z.rarLabel('c'), pool: Z.poolLabel('assault_rifle'),
          short: Z.statShort('ms'),
          trig: trigMod ? Z.condLabel(trigMod) : '',
          cond: condMod ? Z.condLabel(condMod) : ''
        });
      })()`));
      const mbPairs = [['mod', 'modName'], ['arcane', 'arcane'], ['rar', 'rar'], ['pool', 'pool'], ['short', 'statShort']];
      mbPairs.forEach(([key, exp]) => {
        const want = pick(L, exp);
        if (mb[key] === want) ok('ZKMB ' + key + ' = ' + want);
        else fail('ZKMB ' + key + ' = ' + mb[key] + '，期望 ' + want);
      });
      if (mb.trig) {
        const want = pick(L, 'trig');
        if (mb.trig.indexOf(want) >= 0) ok('ZKMB 触发标签含「' + want + '」');
        else fail('ZKMB 触发标签 = ' + mb.trig + '，应含 ' + want);
      }
      if (mb.cond) {
        const want = pick(L, 'cond');
        if (mb.cond.indexOf(want) >= 0) ok('ZKMB 条件标签含「' + want + '」');
        else fail('ZKMB 条件标签 = ' + mb.cond + '，应含 ' + want);
      }

      /* ③ DOM：④ 区目标档按钮 + 进阶微调元素下拉 */
      const tg = JSON.parse(await cdp.eval(`(() => {
        const bs = [...document.querySelectorAll('#g-tg button')];
        if (!bs.length) return '[]';
        const b = bs.find(x => x.getAttribute('data-k') === 'g_mob') || bs[0];
        return JSON.stringify({
          n: (b.childNodes[0] && b.childNodes[0].textContent || '').trim(),
          sub: (b.querySelector('small') || {}).textContent || ''
        });
      })()`));
      if (tg.n === pick(L, 'target')) ok('DOM 目标档名 = ' + tg.n);
      else fail('DOM 目标档名 = ' + tg.n + '，期望 ' + pick(L, 'target'));
      const subWant = (L === 2) ? 'damage reduction' : '减伤';
      if (tg.sub.indexOf(subWant) >= 0) ok('DOM 目标档说明 = ' + tg.sub);
      else fail('DOM 目标档说明 = ' + tg.sub + '，应含 ' + subWant);

      const el = JSON.parse(await cdp.eval(`(() => {
        const s = document.querySelector('#g-advmods select[data-ak="e1"]');
        if (!s) return '[]';
        return JSON.stringify([...s.options].map(o => o.textContent.trim()));
      })()`));
      const wantEl = pick(L, 'elemDrop');
      if (el.indexOf(wantEl) >= 0) ok('DOM 元素下拉含「' + wantEl + '」');
      else fail('DOM 元素下拉 = ' + JSON.stringify(el) + '，应含 ' + wantEl);

      /* ④ 串语言检查：English 档下这些中文数据名一个都不许出现在整页里 */
      if (L === 2) {
        const leak = await cdp.eval(`(() => {
          const s = (document.body.innerText || '');
          const R = window.RIVEN_ROUTER;
          const bad = [];
          R.TARGETS.forEach(t => { if (s.indexOf(t.n) >= 0) bad.push('敌种:' + t.n); });
          R.ARCHS.forEach(a => { if (s.indexOf(a.n) >= 0) bad.push('流派:' + a.n); });
          ['神威触染','平砍直伤','侵染','震地','滑砍','投掷'].forEach(x => {
            if (s.indexOf(x) >= 0) bad.push('流派:' + x);
          });
          ['暴击几率','暴击伤害','多重射击','弱点伤害','弱点暴击几率','触发持续时间','攻击速度',
           '初始连击','重击伤害','震地攻击伤害','滑砍暴击几率','连击持续时间','重击效率']
            .forEach(x => { if (s.indexOf(x) >= 0) bad.push('属性:' + x); });
          ['牺牲 压迫点','肢解','热病打击 Prime','邪恶蓄力','震波','急进猛突']
            .forEach(x => { if (s.indexOf(x) >= 0) bad.push('MOD:' + x); });
          return JSON.stringify(bad);
        })()`);
        const leaks = JSON.parse(leak);
        if (!leaks.length) ok('整页无中文数据名残留');
        else fail('整页残留中文数据名 ' + leaks.length + ' 个: ' + leaks.slice(0, 8).join('、'));
      }

      /* ⑤ 卡面侧：词条下拉 行16/18 → 洗 N 次候选 → 区间表 */
      await cdp.eval('location.hash = "#/open"; true');
      await sleep(700);
      const opts = JSON.parse(await cdp.eval(`(() => {
        const w = document.getElementById('c2wrap');
        const s = w && w.querySelector('select[data-a="slot"][data-i="0"]');
        if (!s) return '[]';
        const out = [];
        [...s.options].forEach(o => { if (o.value) out.push({ row: +o.value, t: o.text.trim() }); });
        return JSON.stringify(out);
      })()`));
      const n18 = (opts.find(o => o.row === 18) || {}).t || '';
      const n16 = (opts.find(o => o.row === 16) || {}).t || '';
      if (n18) {
        if (n18 === ROW18[L]) ok('词条下拉 行18 = ' + n18);
        else fail('词条下拉 行18 = ' + n18 + '，期望 ' + ROW18[L]);
      }
      if (n16) {
        if (n16 === ROW16[L]) ok('词条下拉 行16 = ' + n16);
        else fail('词条下拉 行16 = ' + n16 + '，期望 ' + ROW16[L]);
      }
      if (!n18 && !n16) console.log('   · 该武器类别没有行16/18，跳过词条下拉');

      await cdp.eval(`(() => { const n = document.getElementById('rnN'); if (n) n.value = '60'; document.getElementById('rnRun').click(); return 1; })()`);
      await sleep(1200);
      const rows = JSON.parse(await cdp.eval(`JSON.stringify([...document.querySelectorAll('#rnList .on-row')].map(r => ({
        aff: [...r.querySelectorAll('.on-afs .af')].map(a => a.textContent.trim())
      })))`));
      const rowNames = rows.flatMap(r => r.aff).map(a => a.replace(/^[-+−×]?[\d.,%×\s]+/, '').trim());
      const badCn = rowNames.filter(n => n && (n === ROW18[0] || n === ROW18[1] || n === ROW18[2]) && n !== ROW18[L]);
      console.log('   洗 N 次 候选 ' + rows.length + ' 行；串到别种语言的词条名 = ' + badCn.length
        + (badCn.length ? ' ✗ ' + badCn.slice(0, 3).join('、') : ' ✓'));
      if (badCn.length) fail('洗 N 次候选混入别种语言词条名');

      await cdp.eval('location.hash = "#/ranges"; true');
      await sleep(800);
      const hasRange = await cdp.eval(`(() => {
        const h = document.querySelector('#ranges') || document.body;
        return (h.innerText || '').indexOf('${ROW18[L]}') >= 0;
      })()`);
      console.log('   区间表出现「' + ROW18[L] + '」= ' + (hasRange ? '有 ✓' : '没有（该表不一定含这条，属正常）'));
    }

    const errs = cdp.logs.filter(l => /exception|\[console\.error\]/.test(l));
    console.log('\n页面报错 ' + errs.length + ' 条');
    errs.slice(0, 6).forEach(l => console.log('  ' + l.slice(0, 260)));
    if (errs.length) bad += errs.length;
    console.log(bad ? ('\n✗ 共 ' + bad + ' 项不对') : '\n✓ 三套语言的数据名与词条名全对');
    if (bad) process.exitCode = 1;
  } catch (e) {
    console.error('\n✗ 失败: ' + (e && e.stack || e));
    process.exitCode = 1;
  } finally {
    page.kill();
  }
}
main();
