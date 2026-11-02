var RIVEN_ROUTER = (function () {
  'use strict';
  var isNode = (typeof module !== 'undefined' && module.exports);
  var WF = isNode ? require('./riven-engine.js') : (typeof WF !== 'undefined' ? WF : window.WF);
  var DB = isNode ? require('./weapon-db.js') : (typeof WEAPON_DB !== 'undefined' ? WEAPON_DB : window.WEAPON_DB);
  var TYPE_ALIAS = { electricity: 'electric' };
  (function alignTypes() {
    var fix = function (d) {
      if (!d || typeof d !== 'object') return;
      for (var k in d) if (Object.prototype.hasOwnProperty.call(d, k)) {
        var to = TYPE_ALIAS[k];
        if (!to) continue;
        d[to] = (d[to] || 0) + d[k];
        delete d[k];
      }
    };
    DB.forEach(function (w) {
      fix(w.at && w.at.dmg);
      fix(w.at && w.at.rad && w.at.rad.dmg);
      fix(w.at && w.at.slam && w.at.slam.dmg);
      var fm = w.fm || {};
      for (var f in fm) if (Object.prototype.hasOwnProperty.call(fm, f)) {
        fix(fm[f].dmg);
        fix(fm[f].rad && fm[f].rad.dmg);
        fix(fm[f].slam && fm[f].slam.dmg);
      }
    });
  })();
  var LV_NORMAL = 40;
  var LV_STEEL = 140;
  function lvArmor(base, baseLv, lv) {
    if (!(base > 0)) return 0;
    var d = Math.max(0, lv - (baseLv || 1));
    var S = d >= 80 ? 1 : (d <= 70 ? 0 : (function (T) { return 3 * T * T - 2 * T * T * T; })((d - 70) / 10));
    var m = (1 + 0.005 * Math.pow(d, 1.75)) * (1 - S) + (1 + 0.4 * Math.pow(d, 0.75)) * S;
    return Math.round(Math.max(200, Math.min(2700, base * m)));
  }
  var ROSTER = [
    { k: 'g_mob',  n: '克隆尼 · 枪兵',     faction: 'grineer',  armor: 200, bl: 1, head: 3.0, crowd: 0.85 },
    { k: 'c_mob',  n: '科普斯 · 船员',     faction: 'corpus',   armor: 0,   bl: 1, head: 3.0, crowd: 0.85, shieldShare: 0.45 },
    { k: 'i_mob',  n: '感染体 · 冲锋者',   faction: 'infested', armor: 0,   bl: 1, head: 3.0, crowd: 0.85 },
    { k: 'g_demo', n: '克隆尼 · 爆破怪',   faction: 'grineer',  armor: 200, bl: 1, head: 3.0, crowd: 0.15, atten: 1 },
    { k: 'c_demo', n: '科普斯 · 爆破怪',   faction: 'corpus',   armor: 100, bl: 1, head: 3.0, crowd: 0.15, atten: 1, shieldShare: 0.45 },
    { k: 'i_demo', n: '感染体 · 爆破怪',   faction: 'infested', armor: 50,  bl: 1, head: 3.0, crowd: 0.15 },
    { k: 'o_gunner', n: '奥罗金 · 白富美', faction: 'orokin', armor: 500, bl: 8, head: 2.0, crowd: 0.15 },
    { k: 'o_mob',  n: '奥罗金 · 群怪',   faction: 'orokin',  armor: 200, bl: 1, head: 3.0, crowd: 0.85 },
    { k: 'hydrolyst', n: '三傻 · 夜灵水力使', faction: 'sentient', armor: 150, bl: 1, fixed: 1, lv0: 60,
      atten: 'eidolon',
      head: 2.0, crowd: 0.55, shieldOnlyVoid: true, procImmune: true, bodyMult: 2.0 },
    { k: 'orb', n: '大蜘蛛 · 利润收割者', faction: 'corpus', armor: 150, bl: 1, fixed: 1, lv0: 60,
      head: 1.6, crowd: 0.55, procImmune: true, shieldCap: 156720, shielded: true, shieldShare: 0.8,
      shieldAdaptive: ['cold', 'heat', 'electric', 'toxin'], shieldSwitches: 5 }
  ];
  var CARRY = ['shieldOnlyVoid', 'procImmune', 'bodyMult', 'shieldCap', 'shieldAdaptive', 'shieldSwitches', 'shielded', 'shieldShare'];
  var TARGETS = [], TARGET_BY_K = {};
  ROSTER.forEach(function (u) {
    [0, 1].forEach(function (steel) {
      var lv = u.fixed ? (u.lv0 || LV_NORMAL) : (steel ? LV_STEEL : LV_NORMAL);
      var armor = lvArmor(u.armor, u.bl, lv);
      var dr = armor > 0 ? WF.armorDR(armor) : 0;
      var t = {
        k: steel ? u.k + '@sp' : u.k,
        n: u.n, lv: lv, steel: !!steel,
        faction: u.faction, armor: armor, crowd: u.crowd, head: u.head,
        atten: u.atten || 0,
        sub: (u.fixed ? '' : (steel ? '钢铁 · ' : '普通图 · ')) +
             (armor ? '减伤 ' + Math.round(dr * 100) + '%' : '无甲') +
             ' · ' + (u.crowd >= 0.7 ? '成群' : '单体') + (u.note ? ' · ' + u.note : '')
      };
      for (var i = 0; i < CARRY.length; i++) {
        if (u[CARRY[i]] !== undefined) t[CARRY[i]] = u[CARRY[i]];
      }
      TARGET_BY_K[t.k] = t;
      if (!steel) TARGETS.push(t);
    });
  });
  TARGET_BY_K.normal = TARGET_BY_K.g_demo;
  TARGET_BY_K.sp = TARGET_BY_K['g_demo@sp'];
  TARGET_BY_K.flesh = TARGET_BY_K.i_mob;
  TARGET_BY_K.crowd = TARGET_BY_K.g_mob;
  var EXTRA_MODS = null;
  var EXTRA_ELEM_ORDER = null;
  function rivenElemOrder(riven) {
    var pr = parseRiven(riven || {}), out = [], i, k;
    for (i = pr.list.length - 1; i >= 0; i--) {
      k = pr.list[i].k;
      if (WF.PRIM.indexOf(k) >= 0) out.push(k);
    }
    return out;
  }
  function elemOrderNow(riven) {
    var o = EXTRA_ELEM_ORDER ? EXTRA_ELEM_ORDER.slice() : [];
    return o.concat(rivenElemOrder(riven));
  }
  function gunClassOf(w) {
    if (!w) return null;
    var s = w.s, c = w.c || '';
    if (s === 'p') return (c === 'shotgun') ? 'shotgun' : 'rifle';
    if (s === 's') return 'pistol';
    if (s === 'a') return 'archgun';
    if (s === 'm' || s === 'e') return 'melee';
    return null;
  }
  var CRITSLASH_CLS = { rifle: 1 };
  var EXTRA_REPLACE = false;
  var STANCES = (typeof window !== 'undefined' && window.ZKSTANCE) || [];
  var STANCE_BY = {};
  (function () {
    for (var i = 0; i < STANCES.length; i++) {
      var s0 = STANCES[i];
      if (!s0 || !s0.i) continue;
      STANCE_BY[s0.i] = s0;
      if (!s0.n && s0.id) s0.i = s0.id;
    }
  })();
  var STANCE = null;
  function stanceCatOK(st, w) {
    if (!st || !w) return false;
    var cat = st.cat || '', wc = w.c || '';
    var wst = w.st || '';
    return cat === wc || (wst && cat === wst) || cat === 'melee';
  }
  function stancesFor(w) {
    var out = [];
    for (var i = 0; i < STANCES.length; i++) if (stanceCatOK(STANCES[i], w)) out.push(STANCES[i]);
    out.sort(function (a, b) { return (b.neutral.per || 0) - (a.neutral.per || 0); });
    return out;
  }
  function setStance(id) {
    STANCE = id ? (STANCE_BY[id] || null) : null;
    return STANCE;
  }
  function stanceMulOf(arch) {
    if (!STANCE || !arch || !arch.light) return 1;
    var f = STANCE.forms && STANCE.forms[arch.stanceForm || 'neutral'];
    var v = f && f.per ? +f.per : (+STANCE.neutral && +STANCE.neutral.per) || 1;
    return v > 0 ? v : 1;
  }
  function stanceInfo() {
    if (!STANCE) return null;
    var n = STANCE.neutral || {};
    var sl = (STANCE.forms && STANCE.forms.slide) || null;
    var hv = (STANCE.forms && STANCE.forms.heavy) || null;
    var bk = (STANCE.forms && STANCE.forms.block) || null;
    var bf = (STANCE.forms && STANCE.forms.block_forward) || null;
    return {
      id: STANCE.i, z: STANCE.z, n: STANCE.n, cat: STANCE.cat, pol: STANCE.pol,
      per: +n.per || 1, rate: +n.rate || 0, total: +n.total || 0, secs: +n.secs || 0, rows: +n.rows || 0,
      hasSlide: !!(sl && sl.per),
      slidePer: (sl && sl.per) ? +sl.per : (+n.per || 0),
      heavy: hv && hv.total ? +hv.total : 0,
      hasBlock: !!(bk && bk.per),
      blockPer: (bk && bk.per) ? +bk.per : (+n.per || 0),
      blockSecs: (bk && bk.secs) ? +bk.secs : 0,
      blockTotal: (bk && bk.total) ? +bk.total : 0,
      hasBlockF: !!(bf && bf.per),
      blockFPer: (bf && bf.per) ? +bf.per : (+n.per || 0)
    };
  }
  var STANCE_SLOTPOL = null; // Forma 覆盖；
  var POL_FULL2KEY = { madurai: 'r', naramon: '-', vazarin: 'd', zenurik: '=', unairu: 'w' };
  function stanceSlotPolDef() {
    return (STANCE && STANCE.cat === 'sparring') ? '-' : 'r';
  }
  function stanceSlotPol() {
    return STANCE_SLOTPOL || stanceSlotPolDef();
  }
  function setStanceSlotPol(p) {
    STANCE_SLOTPOL = (p && p !== stanceSlotPolDef()) ? p : null;
    return stanceSlotPol();
  }
  function stanceCapBonusOf(st, slotPolKey) {
    if (!st) return 0;
    return (slotPolKey === 'o' || POL_FULL2KEY[st.pol] === slotPolKey) ? 10 : 4;
  }
  function stanceCapBonus() {
    return stanceCapBonusOf(STANCE, stanceSlotPol());
  }
  var EXTRA_META_K = { frate: 1, aspeed: 1, mag: 1, rel: 1, windup: 1, range: 1, punch: 1, aradius: 1 };
  function extraMetaOf(w) {
    if (!EXTRA_MODS) return null;
    var melee = isMelee(w), m = null, k, mk, v;
    for (k in EXTRA_MODS) if (Object.prototype.hasOwnProperty.call(EXTRA_MODS, k)) {
      v = +EXTRA_MODS[k] || 0;
      if (!v) continue;
      mk = (k === 'frate' && melee) ? 'aspeed' : k;
      if (!EXTRA_META_K[mk]) continue;
      if (!m) m = {};
      m[mk] = (m[mk] || 0) + v;
    }
    return m;
  }
  function buildModsOf(arch, w) {
    var mods = {}, k;
    var bld = arch.build;
    if (arch.buildBy) {
      var cls = gunClassOf(w);
      if (cls && arch.buildBy[cls]) bld = arch.buildBy[cls];
    }
    if (EXTRA_REPLACE && EXTRA_MODS) {
      for (k in EXTRA_MODS) if (Object.prototype.hasOwnProperty.call(EXTRA_MODS, k)) mods[k] = EXTRA_MODS[k];
      return slideFold(mods, arch);
    }
    for (k in bld) if (Object.prototype.hasOwnProperty.call(bld, k)) mods[k] = bld[k];
    if (EXTRA_MODS) for (var k2 in EXTRA_MODS) if (Object.prototype.hasOwnProperty.call(EXTRA_MODS, k2)) mods[k2] = (mods[k2] || 0) + EXTRA_MODS[k2];
    return slideFold(mods, arch);
  }
  function slideFold(mods, arch) {
    if (arch && arch.slide && (+mods.slideCrit || 0)) {
      mods.ccFlat = (+mods.ccFlat || 0) + (+mods.slideCrit || 0);
    }
    return mods;
  }
  function metaMerge(a, b) {
    if (!a) return b || {};
    if (!b) return a;
    var o = {}, k;
    for (k in a) if (Object.prototype.hasOwnProperty.call(a, k)) o[k] = a[k];
    for (k in b) if (Object.prototype.hasOwnProperty.call(b, k)) o[k] = (o[k] || 0) + b[k];
    return o;
  }
  function ZN(k) { return (window.ZKC && window.ZKC.statNameByKey) ? window.ZKC.statNameByKey(k, 0) : k; }
  var ELEMS = ['heat', 'cold', 'electric', 'toxin', 'blast', 'corrosive', 'gas', 'magnetic', 'radiation', 'viral'];
  var PHYS = window.RULES.PHYS;
  var STATS = [];
  function S(o) { o.byK = o.k; STATS.push(o); return o; }
  S({ k: 'dmg',   n: ZN('dmg'),        u: '%', b: { m: 165, p: 165, s: 165, a: 100 }, en: 'dmg' });
  S({ k: 'cc',    n: ZN('cc'),    u: '%', b: { m: 180, p: 150, s: 150, a: 100 }, en: 'cc',
      note: '近战在重击/震地上生效两次' });
  S({ k: 'cd',    n: ZN('cd'),    u: '%', b: { m: 90,  p: 120, s: 120, a: 80  }, en: 'cd' });
  S({ k: 'ms',    n: ZN('ms'),    u: '%', b: { p: 90,  s: 120, a: 60  },          en: 'ms', only: 'gun' });
  S({ k: 'sc',    n: ZN('sc'),    u: '%', b: { m: 90,  p: 90,  s: 90,  a: 60  }, en: 'sc' });
  S({ k: 'sd',    n: ZN('sd'),    u: '%', b: { m: 90,  p: 90,  s: 90,  a: 90  }, en: 'sd' });
  S({ k: 'fac',   n: ZN('fac'),  u: '%', b: { m: 45,  p: 45,  s: 45,  a: 45  }, en: 'fac' });
  ELEMS.forEach(function (t) {
    S({ k: t, n: ZN(t), u: '%',
        b: { m: 90, p: 90, s: 90, a: (t === 'cold' || t === 'heat' || t === 'electric' || t === 'toxin') ? 120 : 90 },
        en: t });
  });
  PHYS.forEach(function (t) {
    S({ k: t, n: ZN(t), u: '%', b: { m: 120, p: 120, s: 120, a: 90 }, en: t,
        phys: true });
  });
  S({ k: 'weak',   n: ZN('weak'),      u: '%', b: { p: 225, s: 225, a: 225 }, en: 'weak',   only: 'gun', spl: true });
  S({ k: 'weakcc', n: ZN('weakcc'),  u: '%', b: { p: 247.5, s: 247.5, a: 247.5 }, en: 'weakcc', only: 'gun', spl: true });
  S({ k: 'zoom',   n: ZN('zoom'),          u: '%', b: { p: 60, s: 80, a: 60 }, en: null, dead: '不影响任何伤害',
      only: 'gun', note: '无伤负词条' });
  S({ k: 'recoil', n: ZN('recoil'),        u: '%', b: { p: -90, s: -90, a: -90 }, en: null, dead: '不影响任何伤害', only: 'gun' });
  S({ k: 'ammo',   n: ZN('ammo'),    u: '%', b: { p: 90, s: 90, a: 100 }, en: null, dead: '不进打分', only: 'gun' });
  S({ k: 'punch',  n: ZN('punch'),          u: 'm', b: { p: 2.7, s: 2.7, a: 2.7 }, en: null, meta: 'punch', only: 'gun',
      flat: true, note: '只在群体口径里算' });
  S({ k: 'mag',    n: ZN('mag'),      u: '%', b: { p: 50, s: 50, a: 60 }, en: null, meta: 'mag', only: 'gun' });
  S({ k: 'rel',    n: ZN('rel'),      u: '%', b: { p: 50, s: 50, a: 100 }, en: null, meta: 'rel', only: 'gun' });
  S({ k: 'frate',  n: ZN('frate'),          u: '%', b: { p: 60, s: 75, a: 60 }, en: null, meta: 'frate', only: 'gun' });
  S({ k: 'aspeed',  n: ZN('aspeed'),      u: '%', b: { m: 55 }, en: null, meta: 'aspeed', only: 'melee' });
  S({ k: 'range',   n: ZN('range'),      u: 'm', b: { m: 1.94 }, en: null, meta: 'range', only: 'melee',
      flat: true, note: '只在群体口径里算' });
  S({ k: 'combo',   n: ZN('combo'),      u: '',  b: { m: 24.5 }, en: null, meta: 'combo', only: 'melee',
      flat: true, note: '只对重击/震地有用' });
  S({ k: 'slam',    n: ZN('slam'),  u: '%', b: { m: 120 }, en: 'slam', only: 'melee', spl: true });
  S({ k: 'heavyDmg',n: ZN('heavyDmg'),      u: '%', b: { m: 120 }, en: 'heavy', only: 'melee', spl: true });
  S({ k: 'windup',  n: ZN('windup'),  u: '%', b: { m: 120 }, en: null, meta: 'windup', only: 'melee', spl: true });
  S({ k: 'slideCrit', n: ZN('slideCrit'), u: '%', b: { m: 120 }, en: 'cc', only: 'melee', meta: 'slide' });
  S({ k: 'comboDur', n: ZN('comboDur'), u: 's', b: { m: 8.1 }, en: null, only: 'melee',
      meta: 'comboDur', dead: '不进 DPS', panel: 1 });
  S({ k: 'efficiency', n: ZN('efficiency'),   u: '%', b: { m: 73 }, en: null, only: 'melee' });
  S({ k: 'finisher', n: ZN('finisher'),     u: '%', b: { m: 120 }, en: null, only: 'melee',
      meta: 'finisher', dead: '不进 DPS', panel: 1 });
  S({ k: 'statusDur', n: ZN('statusDur'), u: '%', b: { m: 100, p: 100, s: 100 }, en: 'statusDur' });
  var NONROLL = { nodis: 1, en: null, b: {}, dead: '不进打分' };
  S({ k: 'tkEnable', n: ZN('tkEnable'),       u: '',  only: 'melee', ...NONROLL });
  S({ k: 'tkDmg',    n: ZN('tkDmg'),       u: '%', only: 'melee', ...NONROLL, dead: '只进气解读数' });
  S({ k: 'tkChance', n: ZN('tkChance'),   u: '%', only: 'melee', ...NONROLL, dead: '只进气解读数' });
  S({ k: 'tkWin',    n: ZN('tkWin'),   u: 's', only: 'melee', ...NONROLL, dead: '只进气解读数' });
  S({ k: 'tkEvery',  n: ZN('tkEvery'),   u: '次', only: 'melee', ...NONROLL, dead: '只进气解读数' });
  S({ k: 'tkSC',     n: ZN('tkSC'),   u: '%', only: 'melee', ...NONROLL, dead: '只进气解读数' });
  S({ k: 'tkCd',     n: ZN('tkCd'),   u: '%', only: 'melee', ...NONROLL, dead: '只进气解读数' });
  S({ k: 'parryFin',   n: ZN('parryFin'), u: '%', only: 'melee', ...NONROLL });
  S({ k: 'parryAngle', n: ZN('parryAngle'),     u: '°', only: 'melee', ...NONROLL });
  S({ k: 'airRange',   n: ZN('airRange'), u: 'm', only: 'melee', ...NONROLL });
  S({ k: 'healProc',   n: ZN('healProc'), u: '',  only: 'melee', ...NONROLL });
  S({ k: 'lifesteal',  n: ZN('lifesteal'),     u: '%', ...NONROLL });
  S({ k: 'energyConv', n: ZN('energyConv'), u: '',  only: 'melee', ...NONROLL });
  S({ k: 'slamPull',   n: ZN('slamPull'), u: 'm', only: 'melee', ...NONROLL });
  S({ k: 'magFlat',       n: ZN('magFlat'),       u: '发', only: 'gun', ...NONROLL });
  S({ k: 'explodeKill',   n: ZN('explodeKill'),   u: '',   only: 'gun', ...NONROLL });
  S({ k: 'explodeChance', n: ZN('explodeChance'),       u: '%',  only: 'gun', ...NONROLL });
  S({ k: 'djRefresh',     n: ZN('djRefresh'),     u: '次', only: 'gun', ...NONROLL });
  S({ k: 'orbDrop',       n: ZN('orbDrop'),     u: '%',  only: 'gun', ...NONROLL });
  S({ k: 'nullifier',     n: ZN('nullifier'), u: '%',  only: 'gun', ...NONROLL });
  S({ k: 'killTrap',      n: ZN('killTrap'),   u: 's',  only: 'gun', ...NONROLL });
  S({ k: 'disarm',        n: ZN('disarm'),       u: '%',  only: 'gun', ...NONROLL });
  S({ k: 'altCC',         n: ZN('altCC'), u: '%',  only: 'gun', ...NONROLL });
  S({ k: 'altCD',         n: ZN('altCD'), u: '%',  only: 'gun', ...NONROLL });
  S({ k: 'altFrate',      n: ZN('altFrate'),     u: '%',  only: 'gun', ...NONROLL });
  S({ k: 'altDmg',        n: ZN('altDmg'),     u: '%',  only: 'gun', ...NONROLL });
  S({ k: 'killRel',       n: ZN('killRel'), u: '%',  only: 'gun', ...NONROLL });
  S({ k: 'falloff',       n: ZN('falloff'),       u: '%',  only: 'gun', ...NONROLL });
  S({ k: 'sacCap',        n: ZN('sacCap'),   u: '',   only: 'gun', ...NONROLL });
  S({ k: 'massStore',     n: ZN('massStore'),   u: '%',  only: 'gun', ...NONROLL });
  S({ k: 'tether',        n: ZN('tether'),     u: '个', only: 'gun', ...NONROLL });
  S({ k: 'abEff',     n: ZN('abEff'),     u: '%',  ...NONROLL });
  S({ k: 'abDur',     n: ZN('abDur'), u: '%',  ...NONROLL });
  S({ k: 'abStr',     n: ZN('abStr'),     u: '%',  ...NONROLL });
  S({ k: 'abRegen',   n: ZN('abRegen'),     u: '/s', ...NONROLL });
  S({ k: 'allyBuff',  n: ZN('allyBuff'),     u: '%',  ...NONROLL });
  S({ k: 'allyBuffD', n: ZN('allyBuffD'), u: '%',  ...NONROLL });
  S({ k: 'syndRadial',n: ZN('syndRadial'),     u: '层', ...NONROLL });
  S({ k: 'secRel',    n: ZN('secRel'), u: '%', ...NONROLL });
  S({ k: 'secMag',    n: ZN('secMag'), u: '%', ...NONROLL });
  S({ k: 'secSC',     n: ZN('secSC'), u: '%', ...NONROLL });
  S({ k: 'secCC',     n: ZN('secCC'), u: '%', ...NONROLL });
  var STAT_BY_K = {};
  STATS.forEach(function (s) { STAT_BY_K[s.k] = s; });
  var SHOTGUN_B = {
    dmg: 164.7, cc: 90, cd: 90, ms: 119.7, sc: 90, sd: 90, statusDur: 99,
    cold: 90, toxin: 90, electric: 90, heat: 90,
    impact: 119.97, slash: 119.97, puncture: 119.97,
    fac: 45, weak: 225, weakcc: 247.5,
    zoom: 41.994, recoil: -90, ammo: 90, punch: 2.7, mag: 50, rel: 50,
    frate: 90,
    gas: 90, corrosive: 90, viral: 90, radiation: 90, blast: 90, magnetic: 90
  };
  var SLOT_COL = { p: 0, shotgun: 1, s: 2, a: 3, m: 4 };
  function baseFromData(statKey, col) {
    var K2R = window.RULES && window.RULES.STAT_KEY_ROW;
    var Z = window.ZKDATA;
    if (!K2R || !Z || !Z.stats) return undefined;
    var rows = K2R[statKey];
    if (!rows) return undefined;
    if (!(rows instanceof Array)) rows = [rows];
    for (var i = 0; i < rows.length; i++) {
      for (var j = 0; j < Z.stats.length; j++) {
        var rec = Z.stats[j];
        if (rec.row !== rows[i] || !rec.v) continue;
        var v = rec.v[col];
        if (v == null) continue;
        if (window.RULES.FACTION_DROWS.indexOf(rec.row) >= 0) return (v - 1) * 100;
        if (statKey === 'recoil') return -Math.abs(v);
        return v;
      }
    }
    return undefined;
  }
  function baseValue(statKey, slot) {
    var s = STAT_BY_K[statKey];
    if (!s) return null;
    var col = SLOT_COL[slot];
    if (col != null) {
      var dv = baseFromData(statKey, col);
      if (dv !== undefined) return dv;
    }
    var b = (slot === 'shotgun' && SHOTGUN_B.hasOwnProperty(statKey)) ? SHOTGUN_B[statKey] : s.b[slot];
    return b == null ? null : b;
  }
  var SLOT_CN = { p: '主武器', s: '副武器', m: '近战', a: '空战武器', e: '显赫武器' };
  var isMelee = function (w) {
    if (w.s === 'm') return true;
    if (w.s !== 'e') return false;
    return !!(w.fl && (w.fl.indexOf('heavy_slam') >= 0 || w.fl.indexOf('neutral') >= 0));
  };
  var isGun = function (w) {
    if (w.s === 'p' || w.s === 's' || w.s === 'a') return true;
    if (w.s !== 'e') return false;
    return !isMelee(w);
  };
  function attackOf(w, formId) {
    var at = w.at || {};
    var f = formId && w.fm ? w.fm[formId] : null;
    if (!f) return at;
    var o = {};
    for (var k in at) if (Object.prototype.hasOwnProperty.call(at, k)) o[k] = at[k];
    for (var k2 in f) if (Object.prototype.hasOwnProperty.call(f, k2)) o[k2] = f[k2];
    return o;
  }
  function physShare(w) {
    var forms = [w.at || {}].concat(Object.keys(w.fm || {}).map(function (k) { return w.fm[k]; }));
    var best = { impact: 0, puncture: 0, slash: 0 };
    forms.forEach(function (at) {
      var d = at.dmg || {}, tot = 0, k;
      for (k in d) if (Object.prototype.hasOwnProperty.call(d, k)) tot += d[k];
      if (!(tot > 0)) return;
      PHYS.forEach(function (t) { best[t] = Math.max(best[t], (d[t] || 0) / tot); });
    });
    return best;
  }
  function baseVec(at) {
    var d = at.dmg || {};
    var r = at.rad && at.rad.dmg;
    var hasD = sumDmg(d) > 0, hasR = !!r && sumDmg(r) > 0;
    if (hasD && hasR) return addVec(d, r);
    if (hasD) return d;
    if (hasR) return r;
    return d;
  }
  function isRadialBase(at) {
    return !(sumDmg(at.dmg || {}) > 0) && !!(at.rad && sumDmg(at.rad.dmg || {}) > 0);
  }
  function composition(w, formId) {
    return compOfMap(baseVec(attackOf(w, formId)));
  }
  function compOfMap(d) {
    var out = [];
    for (var k in d) if (Object.prototype.hasOwnProperty.call(d, k)) if (d[k] > 0) out.push({ t: k, v: d[k] });
    out.sort(function (a, b) { return b.v - a.v; });
    var tot = out.reduce(function (s, x) { return s + x.v; }, 0);
    out.forEach(function (x) { x.pct = tot > 0 ? x.v / tot : 0; });
    return { list: out, total: tot };
  }
  function addVec(a, b) {
    var o = {}, k;
    for (k in a) if (Object.prototype.hasOwnProperty.call(a, k)) o[k] = (o[k] || 0) + Math.max(0, +a[k] || 0);
    for (k in b) if (Object.prototype.hasOwnProperty.call(b, k)) o[k] = (o[k] || 0) + Math.max(0, +b[k] || 0);
    return o;
  }
  function profile(w) {
    var at = attackOf(w);
    var comp = composition(w, null);
    var share = physShare(w);
    var hasSlamRad = !!(w.fm && w.fm.heavy_slam && w.fm.heavy_slam.rad &&
                        Object.keys(w.fm.heavy_slam.rad.dmg || {}).length);
    var slamDmg = hasSlamRad ? sumDmg(w.fm.heavy_slam.rad.dmg) : 0;
    var baseDmg = comp.total;
    var elems = comp.list.filter(function (x) { return ELEM_IDX.indexOf(x.t) >= 0; });
    var physists = comp.list.filter(function (x) { return PHYS.indexOf(x.t) >= 0; });
    var elemPct = elems.reduce(function (s, x) { return s + x.pct; }, 0);
    var physPct = physists.reduce(function (s, x) { return s + x.pct; }, 0);
    var slashPct = share.slash;
    return {
      w: w,
      slot: w.s, isMelee: isMelee(w), isGun: isGun(w),
      isAsm: !!(w && w.i && String(w.i).indexOf('asm:') === 0),
      isZaw: !!(w && w.i && String(w.i).indexOf('asm:zaw:') === 0),
      at: at, comp: comp,
      baseDmg: baseDmg,
      physShare: share,
      physPct: physPct, elemPct: elemPct,
      dominant: comp.list.length ? comp.list[0].t : null,
      hasSlam: hasSlamRad, slamDmg: slamDmg,
      slamRatio: baseDmg > 0 ? slamDmg / baseDmg : 0,
      hasHeavy: !!(at.hv && at.hv.m),
      heavyMul: at.hv ? at.hv.m : 0,
      hasThrow: !!(w.fl && (w.fl.indexOf('throw') >= 0 || w.fl.indexOf('charged_throw') >= 0)),
      hasSlide: !!(w.fl && w.fl.indexOf('slide') >= 0),
      hasIncarnon: !!(w.fm && w.fm.incarnon),
      hasAlt: !!(w.fm && w.fm.alt_fire),
      hasCharge: !!(w.fm && w.fm.charged),
      isBeam: !!(at.beam),
      radialBase: isRadialBase(at),
      hasAoE: !!(at.rad && sumDmg(at.rad.dmg) > 0),
      aoeRadius: at.rad ? at.rad.r : 0,
      cc: +at.cc || 0, cd: +at.cd || 1, sc: +at.sc || 0, ms: +at.ms || 1, fr: +at.fr || 0,
      rng: +at.rng || 0, pt: +at.pt || 0,
      mag: +w.mag || 0, rel: +w.rel || 0,
      disp: ZKC.disp(w)
    };
  }
  var ELEM_IDX = WF.ELEM;
  function sumDmg(d) { var s = 0; for (var k in d) if (Object.prototype.hasOwnProperty.call(d, k)) s += Math.max(0, +d[k] || 0); return s; }
  function panel(w, formId) {
    var at = attackOf(w, formId);
    var comp = composition(w, formId);
    var rows = [];
    var push = function (group, n, v, u, hint) { rows.push({ g: group, n: n, v: v, u: u || '', hint: hint || '' }); };
    var fmt = function (x, d) { return (Math.round(x * Math.pow(10, d || 2)) / Math.pow(10, d || 2)); };
    push('伤害构成', '总伤害', fmt(comp.total), '', comp.list.map(function (x) {
      return WF.TYPE_CN[x.t] + ' ' + Math.round(x.pct * 100) + '%';
    }).join(' · '));
    if (isRadialBase(at)) {
      push('伤害构成', '本体伤害', '0', '', '直击无伤害，全部伤害来自 ' +
        fmt(at.rad.r, 1) + 'm 溅射——按溅射向量计分');
    }
    push('伤害构成', '暴击', fmt(at.cc * 100, 1) + '% × ' + fmt(at.cd, 2) + '×', '',
      '期望倍率 ' + fmt(WF.critExpect(at.cc * 100, at.cd), 3) + '×');
    push('伤害构成', ZN('sc'), fmt(at.sc * 100, 1) + '%');
    if (isGun(w)) push('伤害构成', ZN('ms'), fmt(at.ms, 2));
    push('伤害构成', '射速', fmt(at.fr, 2), '/s');
    if (isMelee(w)) {
      push('近战', '攻击范围', fmt(at.rng || 0, 2), 'm', '群体口径里按半径线性折成命中数');
      push('近战', '跟随穿透', fmt((at.ft || 0) * 100, 0) + '%', '', '多目标时后续目标的伤害保留率');
      if (at.hv) push('近战', '重击倍率', fmt(at.hv.m, 1) + '×', '',
        '前摇 ' + fmt(at.hv.w, 3) + 's');
      if (at.slam) push('近战', '轻震地', fmt(sumDmg(at.slam.dmg), 0) + ' / ' + fmt(at.slam.r, 1) + 'm', '',
        '半径固定，不吃多重');
      if (w.fm && w.fm.heavy_slam && w.fm.heavy_slam.rad) {
        var hr = w.fm.heavy_slam.rad;
        push('近战', '重震地', fmt(sumDmg(hr.dmg), 0) + ' / ' + fmt(hr.r, 1) + 'm', '',
          '边缘衰减到 ' + Math.round((1 - (hr.fo == null ? 0.3 : hr.fo)) * 100) + '%');
      }
      push('近战', '连击持续', fmt(w.cdur || 0, 1), 's');
    } else {
      push('枪械', '弹匣', fmt(w.mag || 0, 0), '发', w.mag ? '' : '无弹匣');
      push('枪械', '装填', fmt(w.rel || 0, 2), 's');
      push('枪械', '备弹', fmt(w.ammo || 0, 0), '发');
      push('枪械', '穿透', fmt(at.pt || 0, 2), 'm', (at.pt || 0) > 0 ? '自带穿透' : '不自带，群体口径里紫卡穿透才有值');
      if (w.mag && w.rel && at.fr) {
        var cyc = w.mag / at.fr + w.rel;
        push('枪械', '持续射速', fmt(w.mag / cyc, 2), '/s',
          '一个弹匣周期 ' + fmt(cyc, 2) + 's，装填占 ' + Math.round(w.rel / cyc * 100) + '%');
      }
    }
    return rows;
  }
  var ARCHS = [];
  function A(o) { o.applies = o.applies || function () { return true; }; ARCHS.push(o); return o; }
  A({
    id: 'm_sustain', slot: 'm', n: '平砍直伤', cal: 'direct', rate: 'aspeed',
    light: true,
    sub: '站桩连段，直伤为主，不吃初始连击',
    build: { dmg: 165, cc: 110, cd: 210, br: 40, range: 3, toxin: 165, electric: 90 },
    multi: { range: true },
    comboBase: 220, comboFull: true,
    ctx: function (w, t) { return { k: 0, dotShare: 0.12, bleedSource: 'slash' }; },
    applies: function (p) { return p.isMelee; }
  });
  A({
    id: 'm_heavy', slot: 'm', n: '重击', cal: 'direct', rate: 'heavy',
    sub: '连击被消耗，斩铁与暴率卡在重击上生效两次；近战标配赋能·渐强叠满 → 起手 220 连击（12×），重击每次按满档吃',
    build: { dmg: 165, cc: 220, cd: 150, br: 10, toxin: 165, electric: 90, heavy: 120 },
    multi: { range: false },
    ctx: function (w, t) { return { k: 0, dotShare: 0.12, heavyCCx2: true }; },
    comboBase: 220, comboFull: true,
    applies: function (p) { return p.isMelee && p.hasHeavy; }
  });
  A({
    id: 'm_slam', slot: 'm', n: '震地', cal: 'slam', rate: 'heavy',
    sub: '重震地纯径向伤害 · 震波 +200% · 每次出手清空连击、再回升到 +110 初始连击，均值按 55 算（3× → 重击 4× · 急进猛突 +80%）· 范围/攻速不进这条',
    mods: [
      { id: 'sacrificial_pressure',  n: '牺牲 压迫点',   why: '+110% 基础伤害 · +33% 对 Sentient（牺牲套 2 件 → 137.5%）' },
      { id: 'sacrificial_steel',     n: '牺牲 斩铁',     why: '+220% 暴击率（牺牲套 2 件 → 275%；重击翻倍 → 550%）' },
      { id: 'organ_shatter',         n: '肢解',          why: '+90% 暴击伤害' },
      { id: 'primed_fever_strike',   n: '热病打击 Prime', why: '+165% 毒素' },
      { id: 'corrupt_charge',        n: '邪恶蓄力',      why: '+30 初始连击 · −50% 连击持续时间（不进模型）' },
      { id: 'seismic_wave',          n: '震波',          why: '+200% 近战震地伤害' },
      { id: 'blood_rush',            n: '急进猛突',      why: '+40% 暴击率 × 连击等级（110 连击 = +200%）' },
      { id: 'galvanized_reflex',     n: '镀层 增幅线圈', why: '+50% 重击效率 · 击杀叠 4 层各 +20 初始连击' }
    ],
    build: { dmg: 137.5, cc: 275, cd: 90, br: 40, combo: 110, msd: 200, toxin: 165 },
    multi: { range: false },
    ctx: function (w, t) {
      var rad = w.fm && w.fm.heavy_slam && w.fm.heavy_slam.rad;
      var dd = rad && rad.dmg ? rad.dmg : {};
      return { k: 0, slamBase: sumDmg(dd), slamType: (dd.blast ? 'blast' : 'impact'),
               initCombo: 0, heavyCCx2: true, dotShare: 0 };
    },
    comboBase: 0,
    applies: function (p) { return p.isMelee && p.hasSlam && !p.hasThrow; }
  });
  A({
    id: 'm_bleed', slot: 'm', n: '纯切', cal: 'blood', rate: 'aspeed',
    light: true,
    sub: '切割 proc 无视护甲，高甲档的最优解；需要切割占比与触发',
    build: { dmg: 165, cc: 110, cd: 180, sc: 180, sd: 80, co: 80, br: 50, slash: 90, scc: 40 },
    multi: { range: true },
    comboBase: 220, comboFull: true,
    ctx: function (w, t) { return { k: 0, dotShare: 0.85, bleedSource: 'slash', dotFacExp: 2 }; },
    applies: function (p) { return p.isMelee && (p.physShare.slash >= 0.3 || p.sc >= 0.2); }
  });
  A({
    id: 'm_inf', slot: 'm', n: '侵染', cal: 'inf', rate: 'aspeed',
    light: true,
    sub: '只扩散元素；物理占比越高越哑火，所以 −冲击在这条线是纯赚',
    build: { cc: 110, cd: 120, sc: 180, sd: 80, co: 80, combo: 80, range: 5, electric: 60, scc: 40 },
    ctx: function (w, t) {
      var N = 1 + 4 * (t.crowd || 0);
      return { k: 0, elecShare: 1, aoe: (N - 1) / N };
    },
    applies: function (p) { return p.isMelee; }
  });
  A({
    id: 'm_throw', slot: 'm', n: '投掷', cal: 'direct', rate: 'none',
    sub: '回旋刃引爆：命中本体 + 爆心溅射一起算，不吃攻速；渐强满层 → 起手 220 连击（12×）',
    build: { dmg: 165, cc: 220, cd: 150, co: 80, br: 10, toxin: 165, electric: 90 },
    multi: { range: false },
    form: 'throw',
    vec: function (w) {
      var fm = w.fm || {};
      var a = fm.throw, b = fm.charged_throw;
      var radOf = function (f) { return f && f.rad && f.rad.dmg ? f.rad.dmg : {}; };
      var pick = (b && sumDmg(radOf(b)) > sumDmg(radOf(a))) ? b : a;
      if (!pick) return (w.at && w.at.dmg) || {};
      return addVec(pick.dmg || {}, radOf(pick));
    },
    ctx: function (w, t) { return { k: 0, dotShare: 0.2 }; },
    comboBase: 220, comboFull: true,
    applies: function (p) { return p.isMelee && p.hasThrow; }
  });
  A({
    id: 'm_slide', slot: 'm', n: '滑砍', cal: 'direct', rate: 'aspeed',
    light: true, stanceForm: 'slide',
    sub: '只打滑砍，滑砍暴率词条在这里才有意义',
    slide: true,
    build: { dmg: 165, cc: 220, cd: 150, br: 10, toxin: 165, electric: 90, slideCrit: 150 },
    multi: { range: true },
    comboBase: 220, comboFull: true,
    ctx: function (w, t) { return { k: 0, dotShare: 0.15 }; },
    applies: function (p) { return p.isMelee && p.hasSlide; }
  });
  A({
    id: 'm_contagion', slot: 'm', n: '神威触染', cal: 'contagion', rate: 'ctArc',
    sub: 'Zaw 专属 · 空中投掷 · 9.875× 三段（仅 19% 吃物理 mod）· 不吃攻击范围',
    build: { dmg: 165, cc: 110, cd: 270, co: 80, br: 10, toxin: 165, electric: 90 },
    multi: { range: false },
    ctx: function (w, t) {
      var c = t.crowd || 0;
      return { k: 0, dotShare: 0, ctLevel: 3, ctHitCtr: 1 + 0.25 * c };
    },
    applies: function (p) { return p.isMelee && p.isZaw; }
  });
  A({
    id: 'g_direct', slot: 'g', n: '单体直伤', cal: 'direct', rate: 'sustain',
    sub: '打身体、不靠触发、不看弱点',
    build: { dmg: 165, cc: 150, cd: 180, ms: 90, sc: 80, punch: 2.2, toxin: 90, cold: 165 },
    buildBy: {
      pistol:  { dmg: 220, cc: 187, cd: 110, ms: 120, sc: 90, toxin: 90, cold: 90 },
      shotgun: { dmg: 165, cc: 120, cd: 110, ms: 120, sc: 90, toxin: 90, cold: 165 },
      archgun: { dmg: 220, cc: 100, cd: 80, ms: 110, sc: 120, toxin: 187, cold: 187 }
    },
    ctx: function (w, t) { return { k: 0, dotShare: 0.1 }; },
    applies: function (p) { return p.isGun; }
  });
  A({
    id: 'g_weak', slot: 'g', n: '弱点', cal: 'weak', rate: 'sustain',
    sub: 'U44 之后弱点暴率/弱点伤害只在这条线成立',
    build: { dmg: 165, cc: 135, cd: 180, ms: 90, sc: 80, punch: 2.2, toxin: 90, cold: 165 },
    buildBy: {
      pistol:  { dmg: 220, cc: 187, cd: 110, ms: 120, sc: 90, toxin: 90, cold: 90 },
      shotgun: { dmg: 165, cc: 120, cd: 110, ms: 120, sc: 90, toxin: 90, cold: 165 },
      archgun: { dmg: 220, cc: 100, cd: 80, ms: 110, sc: 120, toxin: 187, cold: 187 }
    },
    ctx: function (w, t) { return { k: 0.7, headMult: t.head || 3, dotShare: 0.1 }; },
    applies: function (p) { return p.isGun; }
  });
  A({
    id: 'g_hm', slot: 'g', n: '纯切', cal: 'blood', rate: 'sustain',
    sub: '猎人战备：暴击时掷流血，吃总伤害而不是切割占比',
    build: { dmg: 165, cc: 150, cd: 120, ms: 90, punch: 2.2, toxin: 90, cold: 165, critslash: 30 },
    ctx: function (w, t) { return { k: 0, dotShare: 0.85, bleedSource: 'hm', dotFacExp: 2 }; },
    applies: function (p, w) {
      return p.isGun && p.cc >= 0.12 && (w ? !!CRITSLASH_CLS[gunClassOf(w)] : true);
    }
  });
  A({
    id: 'g_dot', slot: 'g', n: '元素 DoT', cal: 'elemDot', rate: 'sustain',
    sub: '火/毒/电持续伤害，光束武器多重吃平方',
    build: { dmg: 165, cd: 60, ms: 90, sc: 220, co: 80, toxin: 150, heat: 90 },
    buildBy: {
      pistol:  { dmg: 220, ms: 180, sc: 180, toxin: 90, heat: 165 },
      shotgun: { dmg: 225, ms: 120, sc: 180, toxin: 90, heat: 150 },
      archgun: { dmg: 220, cd: 80, ms: 110, sc: 180, toxin: 187, heat: 247 }
    },
    ctx: function (w, t) { return { k: 0, dotShare: 0.9, beam: p_isBeam(w), heatProc: true }; },
    applies: function (p) { return p.isGun && (p.sc >= 0.15 || p.isBeam); }
  });
  A({
    id: 'g_status', slot: 'g', n: '触发流', cal: 'statusSup', rate: 'sustain',
    sub: '辅助线 · 高频异况抬全队：紫卡带病毒词条（复合词条独立入队）+ mod 出腐蚀扒皮，冰/火保持自由多塞异况；主要武器配主要·衰弱，手枪配次要·妨害',
    build: { ms: 150, sc: 290, statusDur: 100, corrosive: 120, cold: 165 },
    buildBy: {
      pistol:  { ms: 230, sc: 380, statusDur: 200, corrosive: 120, cold: 90 },
      shotgun: { ms: 230, sc: 390, statusDur: 90, corrosive: 120, cold: 165 },
      archgun: { ms: 110, sc: 360, corrosive: 120, blast: 120 }
    },
    ctx: function (w, t) { return { k: 0 }; },
    applies: function (p, w) { return p.isGun && (p.sc >= 0.15 || p_isBeam(w)); }
  });
  A({
    id: 'g_aoe', slot: 'g', n: '范围 / AoE', cal: 'direct', rate: 'sustain',
    sub: '爆炸类，命中数随半径增长；穿透与弹匣在这条线才有值',
    build: { dmg: 165, cc: 150, cd: 120, ms: 150, tu: 5, punch: 2.2, toxin: 90, cold: 165 },
    buildBy: {
      pistol:  { dmg: 220, cc: 187, cd: 110, ms: 120, punch: 2.1, toxin: 90, cold: 90, aradius: 44 },
      shotgun: { dmg: 165, cc: 120, cd: 110, ms: 120, punch: 1.2, toxin: 90, cold: 165 },
      archgun: { dmg: 280, cc: 100, cd: 80, ms: 110, punch: 3, toxin: 187, cold: 187 }
    },
    ctx: function (w, t) { return { k: 0, dotShare: 0.15 }; },
    multi: { punch: true, range: false, arad: true },
    applies: function (p) { return p.isGun && (p.hasAoE || p.aoeRadius > 0); }
  });
  A({
    id: 'g_inc', slot: 'g', n: '灵化', cal: 'direct', rate: 'sustain', form: 'incarnon',
    sub: '用灵化形态的面板（暴率/射速/构成全都换了一套）',
    build: { dmg: 165, cc: 320, cd: 180, ms: 230, sc: 80, punch: 2.2, toxin: 90, cold: 165 },
    buildBy: {
      pistol:  { dmg: 220, cc: 320, cd: 110, ms: 230, sc: 80, co: 120, toxin: 90, cold: 90, aradius: 44 },
      shotgun: { dmg: 165, cc: 120, cd: 110, ms: 230, sc: 80, co: 80, toxin: 90, cold: 165 },
      archgun: { dmg: 220, cc: 100, cd: 80, ms: 110, sc: 120, toxin: 187, cold: 187 }
    },
    ctx: function (w, t) { return { k: 0, dotShare: 0.15 }; },
    multi: { punch: true, range: false },
    applies: function (p) { return p.hasIncarnon; }
  });
  function p_isBeam(w) { return !!(w.at && w.at.beam) || !!((w.fm && w.fm.incarnon || {}).beam); }
  var ARCH_BY_ID = {};
  ARCHS.forEach(function (a) { ARCH_BY_ID[a.id] = a; });
  var ARCH_BUILDS = {
    m_sustain:  ['primed_pressure_point', 'galvanized_steel', 'organ_shatter', 'blood_rush',
                 'primed_fever_strike', 'shocking_touch', 'primed_fury', 'primed_reach'],
    m_heavy:    ['primed_pressure_point', 'sacrificial_steel', 'organ_shatter', 'gladiator_might',
                 'primed_fever_strike', 'shocking_touch', 'killing_blow', 'corrupt_charge'],
    m_slam:     ['sacrificial_pressure', 'sacrificial_steel', 'organ_shatter', 'primed_fever_strike',
                 'corrupt_charge', 'seismic_wave', 'blood_rush', 'galvanized_reflex'],
    m_bleed:    ['weeping_wounds', 'condition_overload', 'gladiator_might', 'carnis_mandible',
                 'blood_rush', 'galvanized_elementalist', 'primed_pressure_point', 'galvanized_steel'],
    m_inf:      ['condition_overload', 'galvanized_elementalist', 'primed_reach', 'voltaic_strike',
                 'galvanized_steel', 'weeping_wounds', 'galvanized_reflex', 'spring_loaded_blade'],
    m_throw:    ['primed_pressure_point', 'sacrificial_steel', 'organ_shatter', 'gladiator_might',
                 'primed_fever_strike', 'shocking_touch', 'corrupt_charge', 'condition_overload'],
    m_slide:    ['primed_pressure_point', 'sacrificial_steel', 'organ_shatter', 'gladiator_might',
                 'primed_fever_strike', 'shocking_touch', 'primed_fury', 'maiming_strike'],
    m_contagion:['primed_pressure_point', 'galvanized_steel', 'organ_shatter', 'gladiator_might',
                 'primed_fever_strike', 'shocking_touch', 'primed_fury', 'condition_overload'],
    g_direct: {
      rifle:   ['serration', 'split_chamber', 'point_strike', 'vital_sense', 'infected_clip', 'primed_cryo_rounds', 'primed_shred', 'hammer_shot'],
      pistol:  ['hornet_strike', 'barrel_diffusion', 'primed_pistol_gambit', 'primed_target_cracker', 'pathogen_rounds', 'deep_freeze', 'gunslinger', 'sure_shot'],
      shotgun: ['primed_point_blank', 'hells_chamber', 'laser_sight', 'primed_ravage', 'contagious_spread', 'primed_chilling_grasp', 'shotgun_barrage', 'shotgun_savvy'],
      archgun: ['primed_deadly_efficiency', 'primed_dual_rounds', 'parallax_scope', 'hollowed_bullets', 'primed_venomous_clip', 'primed_polar_magazine', 'automatic_trigger', 'marked_target'],
    },
    g_weak:   {
      rifle:   ['serration', 'split_chamber', 'argon_scope', 'vital_sense', 'infected_clip', 'primed_cryo_rounds', 'hammer_shot', 'primed_shred'],
      pistol:  ['hornet_strike', 'barrel_diffusion', 'primed_pistol_gambit', 'primed_target_cracker', 'pathogen_rounds', 'deep_freeze', 'gunslinger', 'sure_shot'],
      shotgun: ['primed_point_blank', 'hells_chamber', 'laser_sight', 'primed_ravage', 'contagious_spread', 'primed_chilling_grasp', 'shotgun_barrage', 'shotgun_savvy'],
      archgun: ['primed_deadly_efficiency', 'primed_dual_rounds', 'parallax_scope', 'hollowed_bullets', 'primed_venomous_clip', 'primed_polar_magazine', 'automatic_trigger', 'marked_target'],
    },
    g_hm:       ['serration', 'split_chamber', 'point_strike', 'vital_sense',
                 'infected_clip', 'primed_cryo_rounds', 'hunter_munitions', 'primed_shred'],
    g_dot:    {
      rifle:   ['serration', 'split_chamber', 'hellfire', 'infected_clip', 'malignant_force', 'hammer_shot', 'galvanized_aptitude'],
      pistol:  ['hornet_strike', 'barrel_diffusion', 'primed_heated_charge', 'pathogen_rounds', 'sure_shot', 'embedded_catalyzer', 'lethal_torrent', 'gunslinger'],
      shotgun: ['primed_point_blank', 'hells_chamber', 'blaze', 'incendiary_coat', 'contagious_spread', 'shotgun_savvy', 'nano_applicator', 'shotgun_barrage'],
      archgun: ['primed_deadly_efficiency', 'primed_dual_rounds', 'primed_combustion_rounds', 'primed_venomous_clip', 'marked_target', 'magma_chamber', 'automatic_trigger', 'hollowed_bullets'],
    },
    g_status: {
      rifle:   ['split_chamber', 'vigilante_armaments', 'galvanized_aptitude', 'malignant_force',
                'high_voltage', 'primed_cryo_rounds', 'continuous_misery'],
      pistol:  ['galvanized_diffusion', 'sure_shot', 'pistol_pestilence',
                'jolt', 'frostbite', 'embedded_catalyzer', 'primed_heated_charge'],
      shotgun: ['galvanized_hell', 'nano_applicator', 'galvanized_savvy', 'toxic_barrage',
                'shell_shock', 'primed_chilling_grasp', 'motus_setup', 'lingering_torment'],
      archgun: ['primed_dual_rounds', 'modified_munitions', 'marked_target', 'contamination_casing',
                'charged_bullets', 'hypothermic_shell', 'magma_chamber'],
    },
    g_aoe:    {
      rifle:   ['serration', 'split_chamber', 'point_strike', 'vital_sense', 'infected_clip', 'primed_cryo_rounds', 'primed_shred', 'vigilante_armaments'],
      pistol:  ['hornet_strike', 'barrel_diffusion', 'primed_pistol_gambit', 'primed_target_cracker', 'pathogen_rounds', 'deep_freeze', 'primed_fulmination', 'seeker'],
      shotgun: ['primed_point_blank', 'hells_chamber', 'laser_sight', 'primed_ravage', 'contagious_spread', 'primed_chilling_grasp', 'shotgun_barrage', 'seeking_fury'],
      archgun: ['primed_deadly_efficiency', 'primed_dual_rounds', 'parallax_scope', 'hollowed_bullets', 'primed_venomous_clip', 'primed_polar_magazine', 'automatic_trigger', 'sabot_rounds'],
    },
    g_inc:    {
      rifle:   ['serration', 'galvanized_chamber', 'galvanized_scope', 'vital_sense', 'infected_clip', 'primed_cryo_rounds', 'hammer_shot', 'primed_shred'],
      pistol:  ['hornet_strike', 'galvanized_diffusion', 'galvanized_crosshairs', 'primed_target_cracker', 'pathogen_rounds', 'deep_freeze', 'galvanized_shot', 'primed_fulmination'],
      shotgun: ['primed_point_blank', 'galvanized_hell', 'laser_sight', 'primed_ravage', 'contagious_spread', 'primed_chilling_grasp', 'shotgun_barrage', 'galvanized_savvy'],
      archgun: ['primed_deadly_efficiency', 'primed_dual_rounds', 'parallax_scope', 'hollowed_bullets', 'primed_venomous_clip', 'primed_polar_magazine', 'automatic_trigger', 'marked_target'],
    },
  };
  function archModsOf(archId, w) {
    var v = archId ? ARCH_BUILDS[archId] : null;
    if (!v) return null;
    if (Object.prototype.toString.call(v) === '[object Array]') return v;
    var cls = gunClassOf(w);
    return (cls && v[cls]) || v.rifle || v.melee || null;
  }
  function snapPanel(w, formId, buckets, meta, elemOrder) {
    var at = attackOf(w, formId);
    var bd = at.dmg || {};
    var D = 0, k;
    for (k in bd) if (Object.prototype.hasOwnProperty.call(bd, k)) D += Math.max(0, +bd[k] || 0);
    var dmgM = 1 + (+buckets.dmg || 0) / 100;
    var types = {};
    PHYS.forEach(function (t) {
      types[t] = Math.max(0, (+bd[t] || 0)) * dmgM * Math.max(0, 1 + (+buckets[t] || 0) / 100);
    });
    WF.ELEM.forEach(function (t) {
      types[t] = ((+bd[t] || 0) + D * Math.max(0, +buckets[t] || 0) / 100) * dmgM;
    });
    (WF.OTHER || []).forEach(function (t) {
      if (+bd[t] > 0) types[t] = (+bd[t]) * dmgM;
    });
    if (WF.combineElem) WF.combineElem(types, elemOrder);
    var coV = +buckets.co || 0;
    if (coV > 0) {
      var nCo = 0, tco;
      PHYS.forEach(function (t) { if (types[t] > 0) nCo++; });
      WF.ELEM.forEach(function (t) { if (types[t] > 0) nCo++; });
      nCo = Math.min(12, nCo);
      if (nCo > 0 && dmgM > 0) {
        var kCo = (dmgM + coV / 100 * nCo) / dmgM;
        for (tco in types) if (Object.prototype.hasOwnProperty.call(types, tco)) types[tco] = types[tco] * kCo;
      }
    }
    var tot = 0;
    for (k in types) if (Object.prototype.hasOwnProperty.call(types, k)) tot += types[k];
    var cc = (+at.cc || 0) * 100 * (1 + (+buckets.cc || 0) / 100) + (+buckets.ccFlat || 0);
    var cd = (+at.cd || 1) * (1 + (+buckets.cd || 0) / 100) + (+buckets.cdFlat || 0);
    var _facM = (1 + (+buckets.fac || 0) / 100)
              * (1 + Math.min(1, cc / 100) * Math.max(0, +buckets.xh || 0) / 100);
    if (_facM !== 1) {
      tot = 0;
      for (k in types) if (Object.prototype.hasOwnProperty.call(types, k)) { types[k] *= _facM; tot += types[k]; }
    }
    var sc = (+at.sc || 0) * 100 * (1 + (+buckets.sc || 0) / 100);
    var ms = (+at.ms || 1) * (1 + (+buckets.ms || 0) / 100);
    var fr = isMelee(w)
      ? (+at.fr || 0) * (1 + (+meta.aspeed || 0) / 100)
      : (+at.fr || 0) * (1 + (+meta.frate || 0) / 100);
    var mag = (+w.mag || 0) * (1 + (+meta.mag || 0) / 100);
    var rel = (+w.rel || 0) / (1 + (+meta.rel || 0) / 100);
    var sus = (mag > 0 && rel > 0 && fr > 0) ? fr / (1 + rel * fr / mag) : fr;
    return {
      types: types, total: tot, cc: cc, cd: cd, sc: sc, ms: ms, fr: fr,
      sus: sus, rng: (+at.rng || 0) + (+meta.range || 0),
      pt: (+at.pt || 0) + (+meta.punch || 0),
      mag: mag, rel: rel,
      combo: Math.min(WF.comboCapOf(w), (+meta.combo || 0) + (+buckets.combo || 0)),
      comboCap: WF.comboCapOf(w),
      cdur: (+w.cdur || 5) + (+((meta || {}).comboDur) || 0),
      cdurAdd: +((meta || {}).comboDur) || 0,
      finPct: +((meta || {}).finisher) || 0,
      critM: WF.critExpect(cc, cd),
      ps: (+at.ps || 0) * (1 + (+buckets.ps || 0) / 100),
      psPct: +buckets.ps || 0,
      spread: +buckets.spread || 0,
      acc: +buckets.acc || 0,
      hrel: +buckets.hrel || 0,
      noise: +buckets.noise || 0,
      ammoc: +buckets.ammoc || 0,
      ccc: +buckets.ccc || 0,
      bounce: +buckets.bounce || 0,
      bounceExp: +buckets.bounceExp || 0,
      bounceR: +buckets.bounceR || 0,
      movesp: +buckets.movesp || 0,
      stagger: +buckets.stagger || 0,
      sspread: +buckets.sspread || 0,
      ammoeff: +buckets.ammoeff || 0,
      beamr: +buckets.beamr || 0,
      aradius: +((meta || {}).aradius) || +buckets.aradius || 0,
      radR: at.rad ? (+at.rad.r || 0) * (1 + ((+((meta || {}).aradius) || +buckets.aradius || 0) / 100)) : 0
    };
  }
  function panelDiff(w, formId, riven, afterBM, eoOpt) {
    var rb = afterBM || parseRiven(riven || {});
    var eo = (eoOpt && eoOpt.length) ? eoOpt : elemOrderNow(riven);
    var a = snapPanel(w, formId, {}, {}, eo);
    var b = snapPanel(w, formId, rb.buckets || {}, rb.meta || {}, eo);
    var rows = [];
    var push = function (g, n, va, vb, u, d, hint, en) {
      rows.push({ g: g, n: n, en: en || null, before: va, after: vb, u: u || '', d: d == null ? 2 : d, hint: hint || '' });
    };
    var pct = function (x) { return Math.round(x * 10) / 10; };
    var allTypes = {};
    Object.keys(a.types).concat(Object.keys(b.types)).forEach(function (t) { allTypes[t] = 1; });
    Object.keys(allTypes).forEach(function (t) {
      if (!(a.types[t] > 0) && !(b.types[t] > 0)) return;
      push('构成', WF.TYPE_CN[t] || t, a.types[t], b.types[t], '', 1,
        a.total > 0 ? Math.round(a.types[t] / a.total * 100) + '% → ' +
          Math.round(b.types[t] / Math.max(1e-9, b.total) * 100) + '%' : '',
        WF.TYPE_EN[t] || t);
    });
    push('构成', '总伤害', a.total, b.total, '', 1,
      isMelee(w) && stanceInfo() ? '裸面板，不含架势倍率 —— 架势口径见下面「近战」组' : '');
    push('构成', ZN('cc'), pct(a.cc), pct(b.cc), '%', 1, '期望 ' + a.critM.toFixed(2) + '× → ' + b.critM.toFixed(2) + '×');
    push('构成', ZN('cd'), pct(a.cd * 100), pct(b.cd * 100), '%', 1);
    push('构成', ZN('sc'), pct(a.sc), pct(b.sc), '%', 1);
    if (isGun(w)) push('构成', ZN('ms'), a.ms, b.ms, '', 2);
    if (isMelee(w)) {
      push('近战', '攻速', a.fr, b.fr, '/s', 2);
      push('近战', '攻击范围', a.rng, b.rng, 'm', 2,
        b.rng > a.rng ? '只影响能同时打到几个，单体口径为 0' : '');
      push('近战', '初始连击', a.combo, b.combo, '', 0,
        b.combo > a.combo ? ('起手 ' + Math.round(b.combo) + ' 连击 = ' + WF.comboLevelOf(b.combo, WF.comboCapOf(w)) +
          ' 级 → 连击倍率 ' + WF.comboMult(b.combo, WF.comboCapOf(w)).toFixed(0) + '×（每 20 连击 1 级，'
          + '上限 ' + WF.comboCapOf(w) + '）') : '');
      push('近战', '连击时长', a.cdur, b.cdur, 's', 2,
        (Math.abs(b.cdur - a.cdur) > 1e-9)
          ? ('连击窗口 ' + a.cdur.toFixed(2) + ' → ' + b.cdur.toFixed(2) + ' 秒（每 20 连击 1 级，窗口越长越难掉级）')
          : '不受这张卡影响');
      try {
        var _siP = stanceInfo();
        if (_siP) {
          var _mulP = stanceMulOf(ARCH_BY_ID['m_sustain']);
          push('近战', '平A 单发', a.total * _mulP, b.total * _mulP, '', 1,
               '总伤害 × 架势 ' + _siP.z + ' 每招 ×' + (+_siP.per).toFixed(2));
          push('近战', '平A 秒伤', a.total * _mulP * a.fr, b.total * _mulP * b.fr, '/s', 1,
               '平A 单发 × 攻速 ' + a.fr.toFixed(2) + ' /s');
          if (_siP.hasBlock) {
            var _mulB = _siP.blockPer;
            push('近战', '格挡段 单发', a.total * _mulB, b.total * _mulB, '', 1,
                 '总伤害 × 格挡段 每招 ×' + (+_siP.blockPer).toFixed(2) +
                 (Math.abs(_siP.blockPer - _siP.per) > 0.005 ? '（与平A ×' + (+_siP.per).toFixed(2) + ' 不同）' : ''));
            var _nb = (_siP.blockPer > 0) ? Math.round(_siP.blockTotal / _siP.blockPer) : 0;
            push('近战', '格挡段 秒伤', a.total * _mulB * a.fr, b.total * _mulB * b.fr, '/s', 1,
                 '格挡段 ' + (_nb || '?') + ' 招 ×' + (+_siP.blockPer).toFixed(2) +
                 '，合计 ' + _siP.blockTotal + ' 倍 / ' + _siP.blockSecs + ' 秒');
          }
        }
      } catch (eP) { ZKHTML.warn('引擎/riven-router.js:2036', eP); }
      try {
        var _ar = ARCH_BY_ID['m_sustain'];
        var _cmp = archComp(w, _ar), _at = attackOf(w, _ar.form || null);
        var _b = {
          types: _cmp.list.reduce(function (o, x) { o[x.t] = x.v; return o; }, {}),
          sc: +_at.sc || 0, mag: +w.mag || 1,
          cc: (+_at.cc || 0) * 100, cd: +_at.cd || 1, ms: +_at.ms || 1
        };
        var _md = buildModsOf(_ar, w);
        var _e0 = WF.normalize({ base: _b, mods: _md, ctx: _ar.ctx(w, {}), riven: {} });
        var _e1 = WF.normalize({ base: _b, mods: _md, ctx: _ar.ctx(w, {}), riven: rb.buckets || {} });
        var _finMod = 1 + (+_md.finisher || 0) / 100;
        var _finA = (1 + 0) * _finMod;
        var _finB = (1 + (+((rb.meta || {}).finisher) || 0) / 100) * _finMod;
        push('近战', '处决伤害',
             (_e0.mdb || 0) * (_e0.facM || 1) * FINISHER_MUL * _finA,
             (_e1.mdb || 0) * (_e1.facM || 1) * FINISHER_MUL * _finB, '', 0,
             '改装后基础伤害 × ' + FINISHER_MUL + ' × 处决加成'
             + (Math.abs(_finB - _finA) > 1e-9
                 ? '（' + Math.round((_finB / _finA - 1) * 100) + '% ← 紫卡）'
                 : '')
             + ' · Finisher 类型，无视护甲；只吃基伤 / 对XX / 处决加成，元素·暴击·触发不动');
      } catch (eF) { ZKHTML.warn('引擎/riven-router.js:2069', eF); }
    } else {
      push('枪械', '射速', a.fr, b.fr, '/s', 2, (a.sus !== b.sus) ? '含装填 ' + a.sus.toFixed(2) + ' → ' + b.sus.toFixed(2) : '');
      push('枪械', '弹匣', a.mag, b.mag, '发', 0);
      push('枪械', '装填', a.rel, b.rel, 's', 2);
      push('枪械', '穿透', a.pt, b.pt, 'm', 2, b.pt > a.pt ? '只在群体口径里计分' : '');
    }
    var _ou = function (n2, va, vb, u, d, hint) {
      if (!va && !vb) return;
      push('其他', n2, va, vb, u, d, hint);
    };
    if (a.psPct || b.psPct) {
      var _pbase = a.psPct > 0 ? a.ps / (1 + a.psPct / 100) : a.ps;
      push('其他', '投射物速度', a.ps, b.ps, 'm/s', 0,
           _pbase > 0
             ? ('基础 ' + _pbase.toFixed(0) + ' m/s' +
                (Math.abs(b.psPct - a.psPct) > 0.01 ? ' → ' + (b.psPct > 0 ? '+' : '') + b.psPct.toFixed(0) + '%' : ''))
             : '即时命中武器，投射物速度不适用');
    }
    _ou('额外散布', a.spread, b.spread, '°', 1, '数值越大越散（分裂飞行这类）');
    _ou('精准度', a.acc, b.acc, '%', 0, '负值 = 散布变大');
    _ou('收起装填', a.hrel, b.hrel, '%/s', 0, '收起来时每秒自动装填');
    _ou('消音', a.noise, b.noise, '%', 0, b.noise >= 100 ? '完全消音（不惊动敌人）' : '');
    _ou('弹药转换', a.ammoc, b.ammoc, '%', 0, '拾取弹药的转换比例');
    _ou('连击获得', a.ccc, b.ccc, '%', 0, '近战每次命中额外获得连击的概率');
    _ou('弹跳', a.bounce, b.bounce, '次', 0, b.bounce > a.bounce ? '投掷武器飞行途中额外弹跳' : '');
    _ou('弹跳爆炸', a.bounceExp, b.bounceExp, '%', 0, '');
    _ou('弹跳爆炸半径', a.bounceR, b.bounceR, 'm', 1, '');
    _ou('移动速度', a.movesp, b.movesp, '%', 0, '只在持有该武器时生效');
    _ou('硬直抗性', a.stagger, b.stagger, '%', 0, '自伤硬直的削减比例');
    _ou('状态扩散', a.sspread, b.sspread, '%', 0, '命中时把异常扩散给周围敌人的概率');
    _ou('弹药效率', a.ammoeff, b.ammoeff, '%', 0, '射击有几率不消耗弹药（爆头 / 空中触发那类）');
    _ou('光束射程', a.beamr, b.beamr, '%', 0, '只对射线武器生效，按武器自身射程百分比放大');
    if (a.aradius || b.aradius) {
      push('其他', '爆炸半径', a.aradius, b.aradius, '%', 0,
        b.radR > 0
          ? ('半径 ' + b.radR.toFixed(1) + ' m · 群体命中 ×' +
             Math.pow(1 + b.aradius / 100, 2).toFixed(2))
          : (a.radR > 0 ? '半径 ' + a.radR.toFixed(1) + ' m' : '该形态没有爆炸半径，这条不生效'));
    }
    return { rows: rows, before: a, after: b };
  }
  function parseRiven(riven) {
    var buckets = {}, meta = {}, list = [];
    var _rv = riven || {};
    for (var k in _rv) if (Object.prototype.hasOwnProperty.call(_rv, k)) {
      var v = +_rv[k];
      if (!v && v !== 0) continue;
      var s = STAT_BY_K[k];
      if (!s) continue;
      list.push({ k: k, n: s.n, v: v });
      if (s.meta) meta[s.meta] = (meta[s.meta] || 0) + v;
      else if (s.en) buckets[s.en] = (buckets[s.en] || 0) + v;
    }
    return { buckets: buckets, meta: meta, list: list };
  }
  function rateOf(w, meta, arch) {
    var at = attackOf(w, arch.form || null);
    var m = meta || {};
    if (arch.rate === 'none') return 1;
    if (arch.rate === 'aspeed') {
      return Math.max(0.05, (+at.fr || 1) * (1 + (+m.aspeed || 0) / 100));
    }
    if (arch.rate === 'ctArc') {
      var a = (+m.aspeed || 0) / 100;
      return 1 + 0.25 * a / (1 + 0.25 * a);
    }
    if (arch.rate === 'heavy') {
      var g = 1 + 0.5 * (+m.windup || 0) / 100;
      return Math.min(1.4, Math.max(0.5, g));
    }
    var fr = (+at.fr || 1) * (1 + (+m.frate || 0) / 100);
    var mag = (+w.mag || 0) * (1 + (+m.mag || 0) / 100);
    var rel = +w.rel || 0;
    if (+m.rel) rel = rel / (1 + (+m.rel) / 100);
    if (!(mag > 0) || !(rel > 0)) return fr;
    return fr / (1 + rel * fr / mag);
  }
  function ratioTwoCtx(e1, e0, cal) {
    var a = e1 && e1.raw && e1.raw[cal], b = e0 && e0.raw && e0.raw[cal];
    if (!a || !b || !(a.withR > 0) || !(b.withR > 0)) return null;
    var r = a.withR / b.withR;
    if (cal !== 'blood' && cal !== 'elemDot') return r;
    var d1 = e1.raw.direct, d0 = e0.raw.direct;
    if (!(d1 && d0) || !(d0.withR > 0)) return r;
    var k = (e1.dotWeight == null) ? 0 : e1.dotWeight;
    return (1 - k) * (d1.withR / d0.withR) + k * r;
  }
  function ratioTwoCtxAtten(e1, e0, ctx1, ctx0, cal, r0, r1, kind) {
    if (!WF.attenOut) return null;
    var a = WF.attenOut(cal, e1.st1, ctx1, r1, kind);
    var b = WF.attenOut(cal, e0.st1, ctx0, r0, kind);
    if (!(b > 0)) return null;
    var r = a / b;
    if (cal !== 'blood' && cal !== 'elemDot') return r;
    var d1 = WF.attenOut('direct', e1.st1, ctx1, r1, kind);
    var d0 = WF.attenOut('direct', e0.st1, ctx0, r0, kind);
    if (!(d0 > 0)) return r;
    var k = (e1.dotWeight == null) ? 0 : e1.dotWeight;
    return (1 - k) * (d1 / d0) + k * r;
  }
  function crowdFactor(w, meta, arch, t) {
    if (!t.crowd || !arch.multi) return 1;
    var m = 1, at = attackOf(w, arch.form || null);
    if (arch.multi.range) {
      var r0 = +at.rng || 2.5;
      var r1 = r0 + (+meta.range || 0);
      m *= r1 / r0;
    }
    if (arch.multi.punch) {
      var p0 = +at.pt || 0, p1 = p0 + (+meta.punch || 0);
      m *= (1 + p1 / 1.5) / (1 + p0 / 1.5);
    }
    if (arch.multi.arad && at.rad) {
      var ar = +at.rad.r || 0, arPct = +meta.aradius || 0;
      if (ar > 0 && arPct) m *= Math.pow(1 + arPct / 100, 2);
    }
    return 1 + t.crowd * (m - 1);
  }
  function archComp(w, arch) {
    return arch.vec ? compOfMap(arch.vec(w)) : composition(w, arch.form || null);
  }
  function procStacks(p) {
    var sc = Math.max(0, +(p && p.sc) || 0);
    if (!(sc > 0)) return 0;
    return Math.max(1, Math.min(10, Math.round(10 * Math.min(1, sc / 0.20))));
  }
  function elemShare(types, k) {
    if (!types) return 0;
    var sum = 0, v = 0;
    for (var kk in types) if (Object.prototype.hasOwnProperty.call(types, kk)) {
      var x = Math.max(0, +types[kk] || 0);
      sum += x;
      if (kk === k) v = x;
    }
    return sum > 0 ? v / sum : 0;
  }
  function procStacksOf(types, k, scBuild) {
    if (!(scBuild > 0)) return 0;
    var sh = elemShare(types, k);
    if (!(sh > 0)) return 0;
    return procStacks({ sc: scBuild * sh });
  }
  var MECH_MOD = {
    napalm: { tick: 150, ticks: 6, area: 0.90 },
    acid:   { flat: 450, hpFrac: 0.45, radius: 15 }
  };
  function mechParts(mods, st, dr, crowd, fac) {
    var out = { napalm: 0, napalmTick: 0, napalmTicks: 0, napalmArea: 0,
                acid: 0, acidFlat: 0, acidEquiv: 0, acidR: 0 };
    var M = mods || {};
    var keep = 1 - (dr || 0);
    var cr = Math.min(1, Math.max(0, +crowd || 0));
    if (+M.napalm) {
      var np = MECH_MOD.napalm;
      var dm = Math.max(0, +((st && st.dmgM) || 1));
      var ms = Math.max(1, +((st && st.ms) || 1));
      out.napalmTick = np.tick * dm * (fac || 1) * keep;
      out.napalmTicks = np.ticks;
      out.napalmArea = np.area;
      out.napalm = out.napalmTick * np.ticks * ms * (1 + cr * np.area);
    }
    if (+M.acid) {
      var ac = MECH_MOD.acid;
      out.acidR = ac.radius;
      out.acidFlat = ac.flat * keep;
      out.acidEquiv = ac.hpFrac * keep * (1 + cr);
      out.acid = out.acidFlat;
    }
    return out;
  }
  function tennokaiParts(mods) {
    var M = mods || {};
    var out = { on: 0, dmgPct: 0, cdPct: 0, scPct: 0, chancePct: 0, win: 0, every: 0, mult: 1 };
    if (!(+M.tkEnable || +M.tkDmg || +M.tkChance || +M.tkWin || +M.tkEvery || +M.tkSC || +M.tkCd)) return out;
    out.on = 1;
    out.dmgPct = +M.tkDmg || 0;
    out.cdPct = +M.tkCd || 0;
    out.scPct = +M.tkSC || 0;
    out.chancePct = +M.tkChance || 0;
    out.win = +M.tkWin || 0;
    out.every = +M.tkEvery || 0;
    out.mult = 1 + out.dmgPct / 100;
    return out;
  }
  function clearParts(ctx, st, scBuild, dr) {
    var out = { blast: 0, electric: 0, gas: 0, perShot: 0, perSec: 0, share: 0 };
    if (!WF.elemAoeParts || !st) return out;
    var crowd = Math.min(1, Math.max(0, +ctx.crowd || 0));
    if (!(crowd > 0)) return out;
    var parts = WF.elemAoeParts(st, ctx) || {};
    var sc = Math.max(0, Math.min(1, +scBuild || 0));
    if (!(sc > 0)) return out;
    var fac = 1 - (dr || 0);
    ['blast', 'electric', 'gas'].forEach(function (k) {
      var v = +parts[k] || 0;
      if (!(v > 0)) return;
      var sh = elemShare(st.types, k);
      if (!(sh > 0)) return;
      if (k === 'electric') v *= crowd / (1 + crowd);
      out[k] = v * sc * sh * fac;
    });
    out.perShot = out.blast + out.electric + out.gas;
    return out;
  }
  function fillProcCtx(ctx, types, scBuild, cap, t) {
    ctx.crowd = Math.min(1, Math.max(0, +((t && t.crowd) || 0)));
    var c10 = Math.min(10, Math.max(0, cap == null ? 10 : cap));
    ctx.heatP  = Math.min(c10, procStacksOf(types, 'heat', scBuild));
    ctx.toxinP = Math.min(c10, procStacksOf(types, 'toxin', scBuild));
    ctx.elecP  = Math.min(c10, procStacksOf(types, 'electric', scBuild));
    ctx.gasP   = Math.min(c10, procStacksOf(types, 'gas', scBuild));
    ctx.blastP = Math.min(c10, procStacksOf(types, 'blast', scBuild));
    ctx.impP   = Math.min(5, procStacksOf(types, 'impact', scBuild));
    ctx.radP   = Math.min(c10, procStacksOf(types, 'radiation', scBuild));
  }
  function _setStacks(ctx, probe, scBuild, cap, t) {
    ctx.corr = Math.min(cap, procStacksOf(probe.types, 'corrosive', scBuild));
    ctx.viral = Math.min(cap, procStacksOf(probe.types, 'viral', scBuild));
    var shMag = Math.max(elemShare(probe.types, 'magnetic'), Math.min(1, +probe.magShare || 0));
    ctx.mag = shMag > 0 ? Math.min(cap, procStacks({ sc: scBuild * shMag })) : 0;
    ctx.coldP = Math.min(10, procStacksOf(probe.types, 'cold', scBuild));
    ctx.puncP = Math.min(5, procStacksOf(probe.types, 'puncture', scBuild));
    ctx.heatProc = (probe.types.heat > 0) && (+(t && t.armor) || 0) > 0;
    fillProcCtx(ctx, probe.types, scBuild, cap, t);
  }
  function shotRateOf(w, formId, mods) {
    var at = attackOf(w, formId || null), m = mods || EXTRA_MODS || {};
    var g = isMelee(w) ? (+m.aspeed || 0) : (+m.frate || 0);
    var base = Math.max(0.05, +at.fr || 1);
    if (+at.chg > 0) base = Math.min(base, 1 / (+at.chg));
    return Math.max(0.05, base * (1 + g / 100));
  }
  var NO_PROC = { void: 1 };
  function procStats(w, formId, riven, tK, mods) {
    try {
      var pb = procBreakdown(w, formId, riven, tK, mods);
      if (!pb || !pb.st) return null;
      var st = pb.st, ctx = pb.ctx;
      var P = Math.max(1, +st.ms || 1);
      var Pi = Math.floor(P + 1e-9), pf = Math.max(0, Math.min(1, P - Pi));
      var sc = Math.max(0, (+st.sc || 0) / 100);
      var sdM = (st.statusDurM == null) ? 1 : Math.max(0, st.statusDurM);
      var rate = shotRateOf(w, formId, mods);
      var ty = st.types || {}, sum = 0, k;
      for (k in ty) if (Object.prototype.hasOwnProperty.call(ty, k)) { if (NO_PROC[k]) continue; sum += Math.max(0, +ty[k] || 0); }
      var crit = WF.critExpect(st.cc, st.cd, st.tu);
      var perProc = {};
      (pb.list || []).forEach(function (x) {
        perProc[x.k] = (x.target || 0) * (st.sdM || 1) * crit * Math.pow(st.facM || 1, 2);
      });
      var rows = [], totShot = 0, totSec = 0, totDmg = 0;
      (pb.list || []).forEach(function (x) {
        var dmg = Math.max(0, +ty[x.k] || 0);
        var share = sum > 0 ? dmg / sum : 0;
        if (!(share > 0)) return;
        var p = (sc >= 1) ? Math.min(1, share) : sc * share;
        var q = sc * share;
        var dur = ((WF.PROC && WF.PROC[x.k] && WF.PROC[x.k].dur) || 0) * sdM;
        var nLo = Pi * rate * dur, nHi = (Pi + 1) * rate * dur;
        var perShot = q * P;
        var perSec = perShot * rate;
        var dmgSec = perSec * (perProc[x.k] || 0);
        totShot += perShot; totSec += perSec; totDmg += dmgSec;
        rows.push({
          k: x.k, n: x.n, note: x.note, dur: dur, share: share,
          p: p, q: q,
          hitShot: (1 - pf) * (1 - Math.pow(1 - p, Pi)) + pf * (1 - Math.pow(1 - p, Pi + 1)),
          hitSec: (1 - pf) * (1 - Math.pow(1 - p, Pi * rate)) + pf * (1 - Math.pow(1 - p, (Pi + 1) * rate)),
          uptime: (dur > 0)
            ? ((1 - pf) * (1 - Math.pow(1 - p, nLo)) + pf * (1 - Math.pow(1 - p, nHi)))
            : 0,
          perShot: perShot, perSec: perSec,
          perProc: perProc[x.k] || 0, dmgSec: dmgSec,
          dot: (WF.DOT_COEF && WF.DOT_COEF[x.k] > 0)
        });
      });
      rows.sort(function (a, b) { return b.perSec - a.perSec; });
      return {
        rows: rows, sc: sc, pellets: P, pelletsInt: Pi, pelletFrac: pf,
        statusDurM: sdM, rate: rate, target: pb.target,
        total: { perShot: totShot, perSec: totSec, dmgSec: totDmg }
      };
    } catch (e) { return null; }
  }
  function procBreakdown(w, formId, riven, tK, mods) {
    try {
      var rb = parseRiven(riven || {});
      var at = attackOf(w, formId || null);
      var bd = at.dmg || {}, comp = {}, k;
      for (k in bd) if (Object.prototype.hasOwnProperty.call(bd, k)) comp[k] = Math.max(0, +bd[k] || 0);
      var t = TARGET_BY_K[tK || 'g_mob'] || TARGET_BY_K['g_mob'];
      var m = mods || {};
      var ctx = { faction: t.faction, armor: t.armor };
      if (t.shieldShare != null) ctx.shieldShare = +t.shieldShare || 0;
      if (t.shielded) ctx.shielded = true;
      var base = { types: comp, sc: +at.sc || 0, mag: +w.mag || 1,
                   cc: (+at.cc || 0) * 100, cd: +at.cd || 1, ms: +at.ms || 1 };
      ctx.elemOrder = elemOrderNow(riven);
      var probe = WF.normalize({ base: base, mods: m, riven: rb.buckets, ctx: ctx });
      var scBuild = (+at.sc || 0) * (1 + ((+m.sc || 0) + (+rb.buckets.sc || 0)) / 100);
      ctx.corr = Math.min(10, procStacksOf(probe.types, 'corrosive', scBuild));
      ctx.viral = Math.min(10, procStacksOf(probe.types, 'viral', scBuild));
      var shMag = Math.max(elemShare(probe.types, 'magnetic'), Math.min(1, +probe.magShare || 0));
      ctx.mag = shMag > 0 ? Math.min(10, procStacks({ sc: scBuild * shMag })) : 0;
      ctx.coldP = Math.min(10, procStacksOf(probe.types, 'cold', scBuild));
      ctx.puncP = Math.min(5, procStacksOf(probe.types, 'puncture', scBuild));
      ctx.heatProc = (probe.types.heat > 0) && (+t.armor || 0) > 0;
      fillProcCtx(ctx, probe.types, scBuild, 10, t);
      var st = WF.normalize({ base: base, mods: m, riven: rb.buckets, ctx: ctx,
                              disposition: profile(w).disp });
      return { list: WF.procModel(st, ctx), ctx: ctx, st: st, target: t };
    } catch (e) { return null; }
  }
  function scoreArch(w, riven, t, arch) {
    var p = profile(w);
    var form = arch.form || null;
    var at = attackOf(w, form);
    var comp = archComp(w, arch);
    var base = {
      types: comp.list.reduce(function (o, x) { o[x.t] = x.v; return o; }, {}),
      sc: +at.sc || 0,
      mag: +w.mag || 1,
      cc: (+at.cc || 0) * 100, cd: +at.cd || 1, ms: +at.ms || 1
    };
    var mods = buildModsOf(arch, w), mods0 = mods;
    var ctx = arch.ctx(w, t);
    ctx.faction = t.faction;
    ctx.armor = t.armor;
    ctx.isZaw = p.isZaw;
    ctx.isAsm = p.isAsm;
    if (t.shieldCap) { ctx.shieldCap = t.shieldCap; ctx.shieldAdaptive = t.shieldAdaptive; }
    if (t.shielded) ctx.shielded = true;
    if (t.shieldShare != null) ctx.shieldShare = +t.shieldShare || 0;
    if (arch.cal === 'slam') ctx.noCO = true;
    if (arch.rate === 'heavy' && arch.cal !== 'slam') ctx.heavyAtk = true;
    var rb = parseRiven(riven);
    ctx.elemOrder = elemOrderNow(riven);
    var comboCap = WF.comboCapOf(w);
    ctx.comboCap = comboCap;
    var comboBaseV = arch.comboFull ? comboCap : (+arch.comboBase || 0);
    var probe = WF.normalize({ base: base, mods: mods, riven: rb.buckets, ctx: ctx });
    if (arch.comboBase != null || (+mods.combo || 0) > 0) {
      ctx.initCombo = WF.comboCap(comboBaseV + (+mods.combo || 0) + (+riven.combo || 0), comboCap);
    }
    if (arch.cal === 'slam' || arch.cal === 'heavy') {
      ctx.initComboPeak = ctx.initCombo;
    }
    var _sccPct = (+mods.scc || 0)
      ? WF.nativeComboCritChance(mods.scc, +ctx.initCombo || 0, comboCap) * 100 : 0;
    var scBuild = (+p.sc || 0) * (1 + ((+mods.sc || 0) + _sccPct + (+rb.buckets.sc || 0)) / 100);
    var ns = procStacks({ sc: scBuild });
    var _capS = (arch.rate === 'heavy') ? 0 : 10;
    _setStacks(ctx, probe, scBuild, _capS, t);
    var ctx0 = {}, _k0;
    for (_k0 in ctx) if (Object.prototype.hasOwnProperty.call(ctx, _k0)) ctx0[_k0] = ctx[_k0];
    ctx0.elemOrder = EXTRA_ELEM_ORDER ? EXTRA_ELEM_ORDER.slice() : null;
    var probe0 = WF.normalize({ base: base, mods: mods, ctx: ctx0 });
    var initCombo0 = WF.comboCap(comboBaseV + (+mods.combo || 0), comboCap);
    var _sccPct0 = (+mods.scc || 0)
      ? WF.nativeComboCritChance(mods.scc, initCombo0, comboCap) * 100 : 0;
    var scBuild0 = (+p.sc || 0) * (1 + ((+mods.sc || 0) + _sccPct0) / 100);
    _setStacks(ctx0, probe0, scBuild0, _capS, t);
    var inp1 = { base: base, mods: mods, riven: rb.buckets, ctx: ctx, disposition: p.disp };
    var inp0 = { base: base, mods: mods, riven: {}, ctx: ctx0, disposition: p.disp };
    var e1 = WF.evaluate(inp1), e0 = WF.evaluate(inp0);
    var ct = null;
    if (arch.cal === 'contagion' && WF.contagionParts) ct = WF.contagionParts(e1.st1, ctx);
    var slamDmg = (arch.cal === 'slam' && e1.raw && e1.raw.slam) ? e1.raw.slam.withR : null;
    var hitDmg = (e1.raw && e1.raw[arch.cal] && e1.raw[arch.cal].withR != null)
      ? e1.raw[arch.cal].withR : null;
    var stMul = stanceMulOf(arch);
    if (hitDmg != null && stMul !== 1) hitDmg *= stMul;
    if (hitDmg != null && arch.rate === 'heavy' && arch.cal !== 'slam') {
      hitDmg *= WF.heavySlamFactor(+ctx.initCombo || 0, comboCap);
    }
    var comboInfo = null;
    if (arch.cal === 'slam' || arch.rate === 'heavy') {
      var ic = +ctx.initCombo || 0;
      var _isSlam = (arch.cal === 'slam');
      comboInfo = {
        initCombo: ic,
        peakCombo: (ctx.initComboPeak != null) ? +ctx.initComboPeak : ic,
        resetEachHit: _isSlam,
        cap: comboCap,
        level: WF.comboLevelOf(ic, comboCap),
        mult: WF.comboMult(ic, comboCap),
        heavyFactor: WF.heavySlamFactor(ic, comboCap),
        fromMod: +mods.combo || 0,
        fromRiven: +riven.combo || 0,
        brCrit: (+mods.br || 0) ? WF.nativeComboCritChance(mods.br, ic, comboCap) * 100 : 0,
        msd: +mods.msd || 0,
        slamM: (+mods.slam || 0),
        elemPct: e1.elemPct || 0,
        sp: (_isSlam && WF.slamParts) ? WF.slamParts(e1.st1, ctx) : null
      };
    }
    var per1 = ratioTwoCtx(e1, e0, arch.cal);
    if (per1 == null) return null;
    var meta1 = {};
    for (var g in rb.meta) if (Object.prototype.hasOwnProperty.call(rb.meta, g)) meta1[g] = rb.meta[g];
    var em = extraMetaOf(w);
    var r0 = rateOf(w, em || {}, arch), r1 = rateOf(w, metaMerge(em, meta1), arch);
    var c0 = crowdFactor(w, em || {}, arch, t), c1 = crowdFactor(w, metaMerge(em, rb.meta), arch, t);
    var rateG = r1 / (r0 || 1) - 1;
    var perHitDisp = per1;
    ctx.sniper = (w.c === 'sniper');
    if (t.atten && WF.blendedRatioAtten) {
      var pa = ratioTwoCtxAtten(e1, e0, ctx, ctx0, arch.cal, r0, r1, t.atten);
      var ph = ratioTwoCtxAtten(e1, e0, ctx, ctx0, arch.cal, r0, r0, t.atten);
      if (pa != null && ph != null && ph > 0) {
        per1 = pa; perHitDisp = ph; rateG = pa / ph - 1;
      }
    }
    var rateMul = t.atten ? 1 : r1 / (r0 || 1);
    var ratio = per1 * rateMul * (c1 / (c0 || 1));
    var gain = (ratio - 1) * 100;
    var clear = clearParts(ctx, probe, scBuild, e1.dr);
    var _radTot = (at.rad && at.rad.dmg) ? sumDmg(at.rad.dmg) : 0;
    var _dirTot = sumDmg(at.dmg || {});
    clear.radial = 0;
    clear.radShare = 0;
    clear.radR = (at.rad && +at.rad.r) || 0;
    clear.radArea = clear.radR > 0 ? Math.PI * clear.radR * clear.radR : 0;
    if (_radTot > 0 && hitDmg > 0) {
      var _rs = _radTot / (_radTot + _dirTot);
      var _fo = (at.rad.fo == null) ? 0.3 : Math.min(1, Math.max(0, +at.rad.fo));
      var _retain = 1 - 2 * _fo / 3;
      clear.radShare = _rs;
      clear.radial = hitDmg * _rs * Math.min(1, Math.max(0, +ctx.crowd || 0)) * _retain;
    }
    var _mp = mechParts(mods, probe, e1.dr, ctx.crowd, probe.facM);
    clear.napalm = _mp.napalm;
    clear.napalmTick = _mp.napalmTick;
    clear.napalmTicks = _mp.napalmTicks;
    clear.napalmArea = _mp.napalmArea;
    clear.acid = _mp.acid;
    clear.acidFlat = _mp.acidFlat;
    clear.acidEquiv = _mp.acidEquiv;
    clear.acidR = _mp.acidR;
    clear.mech = _mp.napalm + _mp.acid;
    clear.tk = tennokaiParts(mods);
    clear.perShot += clear.mech;
    clear.perSec = (clear.radial + clear.perShot) * (r1 || 0);
    clear.perShot += clear.radial;
    clear.share = (clear.perShot > 0)
      ? clear.perShot / ((hitDmg || 0) + clear.perShot) : 0;
    clear.rate = r1 || 0;
    return {
      id: arch.id, n: arch.n, sub: arch.sub, cal: arch.cal, form: form,
      gain: gain, ratio: ratio, perHit: (perHitDisp - 1) * 100,
      rateGain: rateG * 100, crowdGain: (c1 / (c0 || 1) - 1) * 100,
      build: mods0 || arch.build, mods: arch.mods || null, ctx: ctx, base: base, slamDmg: slamDmg,
      hitDmg: hitDmg,
      clear: clear,
      comboInfo: comboInfo, ct: ct
    };
  }
  var FINISHER_MUL = 8;
  function finisherDmg(w, riven, t, archId, userMods) {
    var arch = ARCH_BY_ID[archId || 'm_sustain'] || ARCH_BY_ID['m_sustain'];
    if (!arch) return null;
    try {
      var p = profile(w);
      var at = attackOf(w, arch.form || null);
      var comp = archComp(w, arch);
      var base = {
        types: comp.list.reduce(function (o, x) { o[x.t] = x.v; return o; }, {}),
        sc: +at.sc || 0, mag: +w.mag || 1,
        cc: (+at.cc || 0) * 100, cd: +at.cd || 1, ms: +at.ms || 1
      };
      var mods = buildModsOf(arch, w);
      if (userMods) Object.keys(userMods).forEach(function (k) {
        mods[k] = (+mods[k] || 0) + (+userMods[k] || 0);
      });
      var ctx = arch.ctx(w, t || TARGET_BY_K['g_mob']);
      var st = WF.normalize({ base: base, mods: mods, ctx: ctx,
                              riven: parseRiven(riven || {}).buckets, disposition: p.disp });
      var mdb = (st && st.mdb) || 0;
      var fm = (st && st.facM) || 1;
      var finPct = (+mods.finisher || 0)
                 + (+((((parseRiven(riven || {}) || {}).meta) || {}).finisher) || 0);
      var finMul = 1 + finPct / 100;
      return { dmg: mdb * fm * FINISHER_MUL * finMul, base: mdb, facM: fm, mul: FINISHER_MUL,
               finPct: finPct, finMul: finMul };
    } catch (e) { return null; }
  }
  function scoreArchFast(w, riven, t, arch, p) {
    return scoreArch(w, riven, t, arch);
  }
  function contribOf(w, riven, targetKey, archId) {
    var t = TARGET_BY_K[targetKey] || TARGETS[0];
    var arch = ARCH_BY_ID[archId];
    if (!arch || !w) return [];
    var p = profile(w);
    var base = scoreArch(w, riven || {}, t, arch);
    if (!base) return [];
    var rb = parseRiven(riven || {});
    return rb.list.map(function (s) {
      var r2 = {};
      for (var q in riven) if (Object.prototype.hasOwnProperty.call(riven, q)) r2[q] = riven[q];
      delete r2[s.k];
      var sub = scoreArchFast(w, r2, t, arch, p);
      return {
        k: s.k, n: s.n, v: s.v,
        delta: (sub && sub.gain != null) ? (base.gain - sub.gain) : null
      };
    });
  }
  function route(w, riven, targetKey) {
    var t = TARGET_BY_K[targetKey] || TARGETS[0];
    var p = profile(w);
    var list = [], rejected = [];
    var DOT_CAL = { blood: 1, elemDot: 1, statusSup: 1 };
    ARCHS.forEach(function (a) {
      if (a.slot === 'm' && !p.isMelee) return;
      if (a.slot === 'g' && !p.isGun) return;
      if (t.procImmune && DOT_CAL[a.cal]) {
        rejected.push({ id: a.id, n: a.n, why: '目标免疫异常状态，DoT 口径不成立' });
        return;
      }
      if (!a.applies(p, w)) {
        rejected.push({ id: a.id, n: a.n, why: whyNot(a, p, w) });
        return;
      }
      var s = scoreArch(w, riven || {}, t, a);
      if (s) list.push(s);
    });
    list.sort(function (a, b) { return b.gain - a.gain; });
    return { p: p, target: t, list: list, best: list[0] || null, rejected: rejected };
  }
  function whyNot(a, p, w) {
    switch (a.id) {
      case 'm_slam': return p.hasThrow
        ? '投掷类武器，震地不是它的玩法（已并入「投掷」）'
        : '这把武器的重震地没有径向伤害数据';
      case 'm_heavy': return '没有重击倍率';
      case 'm_bleed': return '切割占比 ' + Math.round(p.physShare.slash * 100) + '%、触发 ' +
                            Math.round(p.sc * 100) + '%，凑不出稳定的流血';
      case 'm_throw': return '不是回旋刃';
      case 'm_contagion': return p.isAsm && !p.isZaw
        ? '组合枪不是近战，没有二段跳后的空中投掷'
        : 'Zaw 专属：要二段跳/子弹跳后空中投掷，普通近战没有这个动作';
      case 'm_slide': return '没有滑砍形态';
      case 'g_hm': {
        var _c = w ? gunClassOf(w) : null;
        if (_c && !CRITSLASH_CLS[_c]) {
          return '这一类武器没有「暴击 → 切割」的卡（猎人 战备是步枪 / 弓专属）';
        }
        return ZN('cc') + '太低（' + Math.round(p.cc * 100) + '%），猎人战备的触发率撑不起来';
      }
      case 'g_dot': return '触发几率 ' + Math.round(p.sc * 100) + '%、也不是光束，DoT 叠不上';
      case 'g_aoe': return '没有爆炸/径向伤害';
      case 'g_inc': return '没有灵化形态';
      default: return '不适用';
    }
  }
  var SLAM_HEAVY_MIN = 6.0;
  var SLAM_DMG_MIN = 200;
  function defaultArch(p) {
    if (p.isMelee) {
      if (p.hasThrow) return 'm_throw';
      if (p.hasSlam && p.heavyMul >= SLAM_HEAVY_MIN && p.baseDmg >= SLAM_DMG_MIN) return 'm_slam';
      if (p.physShare.slash >= 0.45 && p.sc >= 0.2) return 'm_bleed';
      return 'm_sustain';
    }
    if (p.hasIncarnon) return 'g_inc';
    if (p.hasAoE) return 'g_aoe';
    if (p.isBeam || p.sc >= 0.3) return 'g_dot';
    if (p.cc >= 0.18) return 'g_weak';
    return 'g_direct';
  }
  function advise(w, riven, targetKey) {
    var t = TARGET_BY_K[targetKey] || TARGETS[0];
    var r = route(w, riven, targetKey);
    var d = defaultArch(r.p);
    var byId = {};
    r.list.forEach(function (x) { byId[x.id] = x; });
    return {
      p: r.p, target: t, list: r.list, rejected: r.rejected,
      best: r.best,
      natural: { id: d, n: ARCH_BY_ID[d] ? ARCH_BY_ID[d].n : d, score: byId[d] || null },
      agrees: !!(r.best && r.best.id === d)
    };
  }
  var GRADES = [
    { min: 310, g: 'EX', n: '版本级' },
    { min: 275, g: 'S+', n: '顶级' },
    { min: 215, g: 'S',  n: '极佳' },
    { min: 170, g: 'A',  n: '优秀' },
    { min: 115, g: 'B',  n: '可用' },
    { min: 65,  g: 'C',  n: '勉强' },
    { min: 0,   g: 'D',  n: '偏低' },
    { min: -1e9, g: 'F', n: '负提升' }
  ];
  function gradeGain(v) {
    var x = +v || 0;
    for (var i = 0; i < GRADES.length; i++) if (x >= GRADES[i].min) return GRADES[i];
    return GRADES[GRADES.length - 1];
  }
  function tierOf(nPos, nNeg) {
    var key = nPos + 'P' + (nNeg ? nNeg + 'N' : '');
    var t = WF.TIER[key];
    return t ? { key: key, t: t, ok: true } : { key: key, t: null, ok: false };
  }
  function rivenCol(w) {
    var Z = window.ZKC;
    if (!Z || !Z.dispRec || !Z.catCol) return null;
    var rec = Z.dispRec(w);
    if (!rec) return null;
    var c = Z.catCol(rec.cat);
    return (c != null && c >= 0) ? c : null;
  }
  function statCap(w, statKey, sign, tier) {
    var cls = gunClassOf(w);
    var slot = { rifle: 'p', shotgun: 'shotgun', pistol: 's', archgun: 'a', melee: 'm' }[cls] || w.s;
    var col = rivenCol(w), base;
    if (col != null) base = baseFromData(statKey, col);
    if (base === undefined || base === null) base = baseValue(statKey, slot);
    if (base == null || !tier || !tier.t) return null;
    var f = sign < 0 ? tier.t.neg : tier.t.pos;
    return Math.abs(base) * (window.ZKC ? ZKC.disp(w) : (+w.dp || 1)) * f * 1.1;
  }
  function legalStats(w) {
    var p = profile(w);
    var out = [];
    STATS.forEach(function (s) {
      if (s.nodis) return;
      if (s.only === 'melee' && !p.isMelee) return;
      if (s.only === 'gun' && !p.isGun) return;
      if (s.phys && !(p.physShare[s.k] > 0)) return;
      if (s.k === 'efficiency' || s.k === 'finisher' || s.k === 'slideCrit') {
        if (s.k !== 'finisher' && !p.hasHeavy && s.k === 'efficiency') return;
      }
      out.push(s);
    });
    return out;
  }
  function norm(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/[\s\-_'’·.]/g, '')
      .replace(/prime/g, 'p');
  }
  var INDEX = DB.map(function (w) {
    return { w: w, zh: norm(w.z), en: norm(w.n), id: norm(w.i) };
  });
  function search(q, limit) {
    q = norm(q);
    limit = limit || 12;
    if (!q) return DB.slice(0, limit).map(function (w) { return w; });
    var exact = [], starts = [], has = [];
    INDEX.forEach(function (r) {
      if (r.zh === q || r.en === q || r.id === q) exact.push(r.w);
      else if (r.zh.indexOf(q) === 0 || r.en.indexOf(q) === 0) starts.push(r.w);
      else if (r.zh.indexOf(q) >= 0 || r.en.indexOf(q) >= 0) has.push(r.w);
    });
    return exact.concat(starts, has).slice(0, limit);
  }
  function byId(id) {
    for (var i = 0; i < DB.length; i++) if (DB[i].i === id) return DB[i];
    return null;
  }
  var STAT_EN = (window.ZKC && window.ZKC.statMap) ? window.ZKC.statMap('enFull') : {};
  var ROSTER_EN = {
    g_mob: 'Grineer · Rifleman', c_mob: 'Corpus · Crewman', i_mob: 'Infested · Runner',
    g_demo: 'Grineer · Demolisher', c_demo: 'Corpus · Demolisher', i_demo: 'Infested · Demolisher',
    o_gunner: 'Orokin · Heavy Gunner', o_mob: 'Orokin · Group',
    hydrolyst: 'Eidolon · Hydrolyst', orb: 'Profit Marginor'
  };
  var ARCH_EN = {
    m_sustain: 'Melee Direct', m_heavy: 'Heavy Attack', m_slam: 'Slam', m_bleed: 'Pure Slash',
    m_inf: 'Infestation', m_throw: 'Throw', m_slide: 'Slide', m_contagion: 'Exodia Contagion',
    g_direct: 'Single Target Direct', g_weak: 'Weakpoint', g_hm: 'Pure Slash',
    g_dot: 'Elemental DoT', g_aoe: 'AoE', g_inc: 'Incarnate', g_status: 'Status Flow'
  };
  var SLOT_EN = { p: 'Primary', s: 'Secondary', m: 'Melee', a: 'Archwing', e: 'Exalted' };
  var ARCH_SUB_EN = {
    m_sustain: 'Stationary combos; mostly direct damage, no initial-combo bonus',
    m_heavy: 'Combo gets consumed; crit and flat crit count twice on heavy attacks — initial combo is the key',
    m_slam: 'Heavy slam is pure radial damage · Seismic Wave +200% · each swing clears the combo, then refunds to +110 initial combo (averaged as 55) (3× → heavy 4× · Blood Rush +80%) · Range / attack speed do not apply here',
    m_bleed: 'Slash procs ignore armor — the best answer for high-armour targets; needs slash share and status chance',
    m_inf: 'Only spreads damage elements; the higher the physical share, the worse it performs — so −Impact is pure profit here',
    m_throw: 'Boomerang detonation: direct hit and blast splash are counted together; attack speed does not apply',
    m_slide: 'Slide attacks only — slide crit chance only matters on this line',
    m_contagion: 'Zaw exclusive · midair throw · 9.875× across three stages (only 19% takes physical mods) · attack range does not apply',
    g_direct: 'Hits the body, no reliance on status effects, no weakpoint dependence',
    g_weak: 'After U44, weakpoint crit chance / weakpoint damage only work on this line',
    g_hm: 'Hunter prep: bleed rolls on crit and scales off total damage rather than slash share',
    g_dot: 'Fire / Toxin / Electricity damage over time; beam weapons square their multishot',
    g_aoe: 'Explosive: hit count grows with radius; pierce and magazine capacity only matter on this line',
    g_inc: 'Uses the Incarnate form panel (crit, fire rate and composition all change)',
    g_status: 'Support line · high-frequency procs boost the whole squad: riven Viral (combined stats queue independently) + Corrosive mods for armour strip, keep Ice / Heat free for extra procs; Primary gets Primary Debilitate, pistol gets Secondary Encumber'
  };
  var PANEL_GRP_EN = {
    '构成': 'Composition', '枪械': 'Gun', '近战': 'Melee', '其他': 'Other'
  };
  var PANEL_ROW_EN = (function () {
    var m = {}, sk = (window.ZKNAMES && ZKNAMES.statKeys) || [], i2;
    for (i2 = 0; i2 < sk.length; i2++) {
      var e = sk[i2];
      if (!e || !e.cn) continue;
      var en = e.enFull || e.en;
      if (en) m[e.cn] = en;
    }
    var extra = {
      '总伤害': 'Total Damage',
      '连击时长': 'Combo Duration',
      '平A 单发': 'Normal Attack per Hit',
      '平A 秒伤': 'Normal Attack DPS',
      '格挡段 单发': 'Block per Hit',
      '格挡段 秒伤': 'Block DPS',
      '投射物速度': 'Projectile Speed'
    };
    for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) m[k] = extra[k];
    return m;
  })();
  var GRADE_EN = {
    'EX': 'Maximum', 'S+': 'Top Tier', 'S': 'Excellent', 'A': 'Great',
    'B': 'Usable', 'C': 'Marginal', 'D': 'Low', 'F': 'Negative'
  };
  var PROC_EL_EN = {
    slash: 'Slash', heat: 'Heat', electric: 'Electricity', toxin: 'Viral',
    gas: 'Gas Cloud', blast: 'Blast', corrosive: 'Corrosive', viral: 'Viral Proliferation',
    magnetic: 'Disruption', radiation: 'Confusion', cold: 'Cold', puncture: 'Weakness',
    impact: 'Impact'
  };
  function statNameOf(k, lang) {
    if (lang === 2 && STAT_EN[k]) return STAT_EN[k];
    var s = STAT_BY_K[k];
    return s ? s.n : k;
  }
  function targetNameOf(k, lang) {
    if (lang === 2) {
      var kb = String(k == null ? '' : k).replace(/@sp$/, '');
      if (ROSTER_EN[kb]) return ROSTER_EN[kb];
      if (ROSTER_EN[k]) return ROSTER_EN[k];
    }
    var t = TARGET_BY_K[k];
    return t ? t.n : k;
  }
  function targetSubOf(t, lang) {
    if (!t) return '';
    var s = t.sub || '';
    if (lang !== 2) return s;
    return s.replace(/^普通图/, 'Normal')
            .replace(/^钢铁/, 'Steel Path')
            .replace(/减伤/g, 'damage reduction')
            .replace(/无甲/g, 'no armor')
            .replace(/成群/g, 'swarm')
            .replace(/单体/g, 'single target');
  }
  function archNameOf(id, lang) {
    if (lang === 2 && ARCH_EN[id]) return ARCH_EN[id];
    var a = ARCH_BY_ID[id];
    return a ? a.n : id;
  }
  function slotNameOf(k, lang) {
    if (lang === 2 && SLOT_EN[k]) return SLOT_EN[k];
    return SLOT_CN[k] || k;
  }
  function archSubOf(id, lang) {
    if (lang === 2 && ARCH_SUB_EN[id]) return ARCH_SUB_EN[id];
    var a = ARCH_BY_ID[id];
    return a ? (a.sub || '') : '';
  }
  function panelRowName(r, lang) {
    if (!r) return '';
    if (lang === 2) return r.en || PANEL_ROW_EN[r.n] || r.n;
    return r.n;
  }
  function panelGrpName(g, lang) {
    if (lang === 2) return PANEL_GRP_EN[g] || g;
    return g;
  }
  function gradeNameOf(g, lang) {
    if (lang === 2 && GRADE_EN[g]) return GRADE_EN[g];
    for (var i = 0; i < GRADES.length; i++) if (GRADES[i].g === g) return GRADES[i].n;
    return g;
  }
  return {
    DB: DB, TARGETS: TARGETS, TARGET_BY_K: TARGET_BY_K,
    STATS: STATS, STAT_BY_K: STAT_BY_K, baseValue: baseValue,
    tennokaiParts: tennokaiParts,
    ARCHS: ARCHS, ARCH_BY_ID: ARCH_BY_ID, ARCH_BUILDS: ARCH_BUILDS,
    archModsOf: archModsOf, gunClassOf: gunClassOf,
    procBreakdown: procBreakdown,
    procStats: procStats,
    SLOT_CN: SLOT_CN,
    STAT_EN: STAT_EN, ROSTER_EN: ROSTER_EN, ARCH_EN: ARCH_EN, SLOT_EN: SLOT_EN,
    ARCH_SUB_EN: ARCH_SUB_EN,
    PANEL_GRP_EN: PANEL_GRP_EN, PANEL_ROW_EN: PANEL_ROW_EN, GRADE_EN: GRADE_EN,
    PROC_EL_EN: PROC_EL_EN,
    statNameOf: statNameOf, targetNameOf: targetNameOf, archNameOf: archNameOf, slotNameOf: slotNameOf,
    targetSubOf: targetSubOf,
    archSubOf: archSubOf,
    panelRowName: panelRowName, panelGrpName: panelGrpName, gradeNameOf: gradeNameOf,
    profile: profile, attackOf: attackOf, composition: composition, physShare: physShare,
    panel: panel, panelDiff: panelDiff, snapPanel: snapPanel,
    parseRiven: parseRiven, rateOf: rateOf, crowdFactor: crowdFactor,
    scoreArch: scoreArch, contribOf: contribOf, route: route, legalStats: legalStats,
    procStacks: procStacks,
    clearParts: clearParts, mechParts: mechParts, MECH_MOD: MECH_MOD,
    defaultArch: defaultArch, advise: advise,
    setExtraMods: function (o, replace) {
      EXTRA_MODS = (o && Object.keys(o).length) ? o : null;
      EXTRA_REPLACE = !!replace;
    },
    setElemOrder: function (arr) {
      EXTRA_ELEM_ORDER = (arr && arr.length) ? [].concat(arr) : null;
    },
    elemOrderNow: function (riven) { return elemOrderNow(riven); },
    rivenElemOrder: function (riven) { return rivenElemOrder(riven); },
    STANCES: STANCES, stancesFor: stancesFor, setStance: setStance, stanceInfo: stanceInfo,
    stanceSlotPol: stanceSlotPol, stanceSlotPolDef: stanceSlotPolDef, setStanceSlotPol: setStanceSlotPol,
    stanceCapBonus: stanceCapBonus, stanceCapBonusOf: stanceCapBonusOf,
    stanceMulOf: stanceMulOf, FINISHER_MUL: FINISHER_MUL, finisherDmg: finisherDmg,
    GRADES: GRADES, gradeGain: gradeGain, tierOf: tierOf, statCap: statCap,
    search: search, byId: byId, whyNot: whyNot,
    targetName: function (t) {
      var f = WF.FACTIONS[t.faction];
      return f && f.label ? f.label : t.faction;
    }
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = RIVEN_ROUTER;
