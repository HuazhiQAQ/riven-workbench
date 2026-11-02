/* 探针：执法者紫卡 引擎真实输出（无头跑，供报告 demo 取数） */
'use strict';
var path = require('path');
global.window = {};                      /* 引擎里 window.RULES 兜底用 */
global.RULES = {};                       /* 倾向统一 1.2 走引擎默认 */
var HERE = __dirname;
var WF   = require(path.join(HERE, '..', '源码', '引擎', 'riven-engine.js'));
var DB   = require(path.join(HERE, '..', '源码', '引擎', 'weapon-db.js'));
var RR   = require(path.join(HERE, '..', '源码', '引擎', 'riven-router.js'));

/* ── 卡面：执法者 Laci-acricron（R18 / 段位12 / 消耗27） ── */
var card = { cc: 194.1, slam: 151.2, cd: 111.6, impact: -120.7 };

/* 1. 找武器（卡面「执法者」= 基础版 Magistar，精确匹配） */
var w = null, wSancti = null;
RR.DB.forEach(function (x) {
  if (x.z === '执法者') w = x;
  if (x.z === '圣洁·执法者') wSancti = x;
});
if (!w) w = wSancti;
if (!w) { console.log('!! 没找到执法者'); process.exit(1); }
console.log('══ 武器 ══');
console.log(JSON.stringify(w, null, 1).slice(0, 1600));

/* 2. 词条名与合法性 */
console.log('\n══ 词条 STATS ══');
['cc', 'slam', 'cd', 'impact', 'heavyDmg'].forEach(function (k) {
  var s = RR.STAT_BY_K[k];
  console.log(k, '→', s ? JSON.stringify({ n: s.n, phys: s.phys, meta: s.meta, en: s.en }) : '(无)');
});
console.log('\nlegalStats(执法者) →', JSON.stringify(RR.legalStats(w)));

/* 3. 武器画像：形态 / 伤害构成 / 物理占比 */
var p = RR.profile(w);
console.log('\n══ profile ══');
console.log(JSON.stringify({
  isMelee: p.isMelee, isGun: p.isGun, forms: p.forms,
  physShare: p.physShare, cc: p.cc, cd: p.cd, sc: p.sc, disp: p.disp
}, null, 1));

/* 4. 全流派打分 */
console.log('\n══ advise（所有目标档） ══');
console.log('TARGETS =', RR.TARGETS.map(function (t) { return t.k + ':' + (t.n || t.id); }).join(' | '));
['m_heavy', 'm_slam', 'm_bleed', 'm_crit'].forEach(function (tk) {
  try {
    var a = RR.advise(w, card, tk);
    console.log('-- target', tk, '--');
    if (a.best) console.log('  best:', a.best.id, a.best.n, 'gain=', a.best.gain && a.best.gain.toFixed(1), 'grade=', JSON.stringify(a.best.grade || RR.gradeGain(a.best.gain)));
    if (a.natural) console.log('  natural(默认流派):', a.natural.id, a.natural.n, a.natural.score ? ('gain=' + a.natural.score.gain.toFixed(1)) : '(被拒)');
    console.log('  agrees=', a.agrees, ' 参评=', a.list.length, ' 被拒=', a.rejected.length);
  } catch (e) { console.log('  !!', tk, e.message); }
});

/* 5. 上限与分档 */
console.log('\n══ statCap（各词条该档上限） ══');
var tier = RR.tierOf(3, 1);
console.log('tier(3P1N) =', JSON.stringify(tier));
[['cc', 1], ['slam', 1], ['cd', 1], ['impact', -1]].forEach(function (pr) {
  try { console.log(pr[0], 'cap =', RR.statCap(w, pr[0], pr[1], tier)); }
  catch (e) { console.log(pr[0], 'cap !', e.message); }
});
console.log('\ngradeGain(净增幅示例) 100 →', JSON.stringify(RR.gradeGain(100)), ' 60 →', JSON.stringify(RR.gradeGain(60)));
console.log('done');
