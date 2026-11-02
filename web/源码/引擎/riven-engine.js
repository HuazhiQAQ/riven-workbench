var WF = (function () {
  'use strict';
  var ARMOR_CAP = 2700;        // 敌人护甲上限，减伤封顶 90%
  var ARMOR_SPAWN_MIN = 200;   // 任务生成时敌人至少 200 甲
  var PHYS = window.RULES.PHYS;
  var ELEM = ['cold', 'heat', 'electric', 'toxin', 'blast', 'corrosive', 'gas', 'magnetic', 'radiation', 'viral'];
  var PRIM = ['heat', 'cold', 'electric', 'toxin'];
  var ELEM_PAIR = {
    'heat|cold': 'blast',
    'heat|electric': 'radiation',
    'heat|toxin': 'gas',
    'cold|electric': 'magnetic',
    'cold|toxin': 'viral',
    'electric|toxin': 'corrosive'
  };
  var OTHER = ['tau', 'void'];
  var TYPES = PHYS.concat(ELEM, OTHER);
  var TYPE_CN = {
    impact: '冲击', puncture: '穿刺', slash: '切割',
    cold: '冰冻', heat: '火焰', electric: '电击', toxin: '毒素',
    blast: '爆炸', corrosive: '腐蚀', gas: '毒气',
    magnetic: '磁力', radiation: '辐射', viral: '病毒', void: '虚空', tau: 'τ 粒子'
  };
  var TYPE_EN = {
    impact: 'Impact', puncture: 'Puncture', slash: 'Slash',
    cold: 'Cold', heat: 'Heat', electric: 'Electricity', toxin: 'Toxin',
    blast: 'Blast', corrosive: 'Corrosive', gas: 'Gas',
    magnetic: 'Magnetic', radiation: 'Radiation', viral: 'Viral', void: 'Void', tau: 'Tau'
  };
  var FACTIONS = {
    none:      { label: '不计克制（通用）' },
    grineer:   { label: 'Grineer 克隆尼',  impact: 0.5, corrosive: 0.5 },
    kuva:      { label: 'Kuva 赤毒',       impact: 0.5, corrosive: 0.5, heat: -0.5 },
    corpus:    { label: 'Corpus 科普斯',   puncture: 0.5, magnetic: 0.5 },
    amalgam:   { label: 'Amalgam 合并',    electric: 0.5, blast: -0.5, magnetic: 0.5 },
    infested:  { label: 'Infested 感染',   slash: 0.5, heat: 0.5, viral: -0.5 },
    deimos:    { label: 'Deimos 火卫二',   blast: 0.5, gas: 0.5, viral: -0.5 },
    orokin:    { label: 'Orokin 奥罗金',   puncture: 0.5, radiation: -0.5, viral: 0.5 },
    narmer:    { label: 'Narmer 合一众',   slash: 0.5, toxin: 0.5, magnetic: -0.5 },
    sentient:  { label: 'Sentient 灵煞',   cold: 0.5, radiation: 0.5, corrosive: -0.5 },
    murmur:    { label: 'Murmur 低语者',   electric: 0.5, radiation: 0.5, viral: -0.5 },
    zariman:   { label: 'Zariman 扎里曼',  void: 0.5 },
    scaldra:   { label: 'Scaldra 炽蛇军',  impact: 0.5, corrosive: 0.5, gas: -0.5 },
    techrot:   { label: 'Techrot 科腐者',  magnetic: 0.5, gas: 0.5, cold: -0.5 },
    overguard: { label: '超宏防护',        void: 0.5 }
  };
  var FACTION_ORDER = ['none', 'grineer', 'kuva', 'corpus', 'amalgam', 'infested', 'deimos',
                       'orokin', 'narmer', 'sentient', 'murmur', 'zariman', 'scaldra', 'techrot', 'overguard'];
  function typeCoef(type, faction) {
    var t = FACTIONS[faction];
    if (!t) return 1;
    var b = t[type];
    return b == null ? 1 : 1 + b;
  }
  function compCoef(comp, faction) {
    var sum = 0, tot = 0, k, v;
    for (k in comp) if (Object.prototype.hasOwnProperty.call(comp, k)) {
      v = comp[k];
      if (!(v > 0)) continue;
      tot += v;
      sum += v * typeCoef(k, faction);
    }
    return tot > 0 ? sum / tot : 1;
  }
  function armorDR(armor) {
    var a = Math.min(ARMOR_CAP, Math.max(0, +armor || 0));
    return a > 0 ? 0.9 * Math.sqrt(a / ARMOR_CAP) : 0;
  }
  function combineElem(types, order) {
    if (order && order.length) return combineByOrder(types, order);
    var p = {}, i, j, a, b, n, key;
    for (i = 0; i < PRIM.length; i++) p[PRIM[i]] = Math.max(0, +types[PRIM[i]] || 0);
    for (i = 0; i < PRIM.length; i++) {
      a = PRIM[i];
      for (j = i + 1; j < PRIM.length; j++) {
        b = PRIM[j];
        n = Math.min(p[a], p[b]);
        if (!(n > 0)) continue;
        key = ELEM_PAIR[a + '|' + b];
        types[key] = Math.max(0, +types[key] || 0) + (p[a] + p[b]);
        p[a] = 0; p[b] = 0;
      }
    }
    for (i = 0; i < PRIM.length; i++) types[PRIM[i]] = p[PRIM[i]];
    return types;
  }
  function combineByOrder(types, order) {
    var seq = [], seen = {}, i, k, v, hit;
    for (i = 0; i < order.length; i++) {
      k = order[i];
      if (PRIM.indexOf(k) < 0) continue;
      if (seen[k]) continue;
      seen[k] = 1;
      seq.push({ k: k, v: Math.max(0, +types[k] || 0) });
    }
    for (i = 0; i < PRIM.length; i++) {
      k = PRIM[i];
      if (seen[k]) continue;
      v = Math.max(0, +types[k] || 0);
      if (v > 0) { seen[k] = 1; seq.push({ k: k, v: v }); }
    }
    for (;;) {
      var i0 = -1, i1 = -1;
      for (i = 0; i < seq.length; i++) if (seq[i].v > 0) { i0 = i; break; }
      if (i0 < 0) break;
      for (i = i0 + 1; i < seq.length; i++) if (seq[i].v > 0) { i1 = i; break; }
      if (i1 < 0) break;
      var a = seq[i0], b = seq[i1];
      var n = Math.min(a.v, b.v);
      if (!(n > 0)) break;
      hit = ELEM_PAIR[a.k + '|' + b.k] || ELEM_PAIR[b.k + '|' + a.k];
      if (!hit) break;
      types[hit] = Math.max(0, +types[hit] || 0) + (a.v + b.v);
      a.v = 0; b.v = 0;
    }
    for (i = 0; i < seq.length; i++) types[seq[i].k] = seq[i].v;
    return types;
  }
  function procMul(n) {
    var s = Math.min(10, Math.max(0, +n || 0));
    return s <= 0 ? 1 : (2 + 0.25 * (s - 1));
  }
  function _coldCdBonus(ctx) {
    var n = Math.max(0, Math.min(10, +((ctx && ctx.coldP) || 0)));
    if (!(n > 0)) return 0;
    return 10 + 5 * (Math.min(9, n) - 1);
  }
  function shieldShareOf(ctx) {
    if (!ctx) return 0;
    if (ctx.shieldShare != null) {
      var v = +ctx.shieldShare;
      return isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
    }
    return ctx.shielded ? 1 : 0;
  }
  function q32(x) {
    var v = +x;
    if (!isFinite(v)) return 0;
    return Math.round(v * 32) / 32;
  }
  function q32Code(x) {
    var c = Math.round((+x || 0) * 32);
    if (c < 0) c = 0;
    if (c > 4095) c = 4095;
    return c;
  }
  function q32Text(x) { return String(q32(x)); }
  function q32pct(x) { return q32(x); }
  function spawnArmor(armor) {
    return Math.min(ARMOR_CAP, Math.max(ARMOR_SPAWN_MIN, +armor || 0));
  }
  function stripArmor(armor, corrStacks, heatProc) {
    var a = Math.max(0, +armor || 0);
    var s = Math.min(10, Math.max(0, +corrStacks || 0));
    if (s > 0) a *= (1 - (0.26 + 0.06 * (s - 1)));
    if (heatProc) a *= 0.5;
    return a;
  }
  function critExpect(cc, cd, p) {
    var c = Math.max(0, cc) / 100, d = Math.max(1, cd) - 1, e = 1 + c * d;
    if (p > 0) e += p * Math.min(1, c) * d;
    return e;
  }
  function critExpectWeak(cc, cd, p) {
    return critExpect(cc, cd * 2, p);
  }
  function weakPartMult(headMult, weakPct, isHead) {
    var h = Math.max(1, +headMult || 2);
    var w = Math.max(0, +weakPct || 0) / 100;
    return h + (isHead === false ? w : 1.5 * w);
  }
  var COMBO_MAX = 220;        /* 连击计数上限：220 = 11 级 = ×12（渐强满层就顶在这） */
  var COMBO_MAX_VENKA = 240;  /* 唯一特例：凯旋之爪 Prime 被动「连击倍率上限 +1」 240 = 12 级 = ×13 */
  function comboCapOf(w) {
    return (w && (w.en === 'Venka Prime' || w.i === 'venka_prime')) ? COMBO_MAX_VENKA : COMBO_MAX;
  }
  function comboLevelOf(n, cap) {
    var mx = (+cap > 0) ? +cap : COMBO_MAX;
    var x = Math.max(0, +n || 0);
    if (x > mx) x = mx;
    return Math.floor(x / 20);
  }
  function comboMult(n, cap) {
    return comboLevelOf(n, cap) + 1;
  }
  function comboMulOf(n, cap) {
    var L = comboLevelOf(n, cap);
    return L > 0 ? L * 2 - 1 : 1;
  }
  function heavySlamFactor(n, cap) {
    return 2 * comboMult(n, cap);
  }
  function nativeComboCritChance(bldr, n, cap) {
    return comboLevelOf(n, cap) * (Math.max(0, +bldr || 0) / 100);
  }
  function buckets(base, p) {
    p = p || {};
    var inner = base * (1 + (p.absInc || 0)) * (1 + (p.absMore || 0)) + (p.absExtra || 0);
    return inner * (1 + (p.inc || 0)) * (1 + (p.more || 0)) + (p.extra || 0);
  }
  var TIER = {
    '2P':   { pos: 0.990,  neg: 1.000, label: '2 正' },
    '3P':   { pos: 0.750,  neg: 1.000, label: '3 正' },
    '2P1N': { pos: 1.2375, neg: 0.495, label: '2 正 1 负' },
    '3P1N': { pos: 0.9375, neg: 0.750, label: '3 正 1 负' }
  };
  function rivenValue(baseVal, disposition, tier, roll, isNeg) {
    var t = TIER[tier] || TIER['3P1N'];
    var r = Math.min(1.10, Math.max(0.90, +roll || 1));
    return baseVal * r * Math.max(0, +disposition || 1) * (isNeg ? t.neg : t.pos);
  }
  function rollOf(shown, baseVal, disposition, tier, isNeg) {
    var t = TIER[tier] || TIER['3P1N'];
    var denom = baseVal * Math.max(0, +disposition || 1) * (isNeg ? t.neg : t.pos);
    return denom > 0 ? (shown / denom) * 100 : 0;
  }
  function SE(k) {
    return (window.ZKC && window.ZKC.statEngineName) ? window.ZKC.statEngineName(k) : k;
  }
  var STAT_POOL = [
    { k: 'dmg',    n: SE('dmg'),        v: 165,    g: 'core',  doc: '加算进基伤括号（与膛线/赋能同桶）' },
    { k: 'cc',     n: SE('cc'),        v: 150,    g: 'core',  doc: '重击/重震地上生效两次' },
    { k: 'cd',     n: SE('cd'),        v: 120,    g: 'core',  doc: '弱点暴击时按 ×2 进分级' },
    { k: 'ms',     n: SE('ms'),        v: 90,     g: 'core',  doc: '近战无此词条；光束武器上 DoT 吃平方' },
    { k: 'fac',    n: SE('fac'),      v: 45,     g: 'core',  doc: 'DoT 上双算 (1+f)²，与 Bane 同桶' },
    { k: 'heat',   n: SE('heat'),        v: 90,     g: 'elem' },
    { k: 'cold',   n: SE('cold'),        v: 90,     g: 'elem' },
    { k: 'electric', n: SE('electric'),      v: 90,     g: 'elem' },
    { k: 'toxin',  n: SE('toxin'),        v: 90,     g: 'elem' },
    { k: 'blast',  n: SE('blast'),        v: 90,     g: 'elem' },
    { k: 'corrosive', n: SE('corrosive'),     v: 90,     g: 'elem' },
    { k: 'gas',    n: SE('gas'),        v: 90,     g: 'elem' },
    { k: 'magnetic', n: SE('magnetic'),      v: 90,     g: 'elem' },
    { k: 'radiation', n: SE('radiation'),     v: 90,     g: 'elem' },
    { k: 'viral',  n: SE('viral'),        v: 90,     g: 'elem' },
    { k: 'impact', n: SE('impact'),        v: 120,    g: 'phys' },
    { k: 'puncture', n: SE('puncture'),      v: 120,    g: 'phys' },
    { k: 'slash',  n: SE('slash'),        v: 120,    g: 'phys' },
    { k: 'sd',     n: SE('sd'),    v: 90,     g: 'state', doc: '只放大会掉血的 proc' },
    { k: 'sc',     n: SE('sc'),        v: 90,     g: 'state' },
    { k: 'slam',   n: SE('slam'),    v: 119.7,  g: 'state', doc: '仅拼接词条，独立乘区' },
    { k: 'heavyDmg',  n: SE('heavyDmg'),        v: 119.7,  g: 'state' },
    { k: 'windup', n: SE('windup'),    v: 119.7,  g: 'util' },
    { k: 'weak',   n: SE('weak'),        v: 225,    g: 'weak',  doc: '加在部位倍率上，头部 1.5 倍速率' },
    { k: 'weakcc', n: SE('weakcc'),    v: 247.5,  g: 'weak',  doc: '加算进暴率括号，仅弱点击中生效' },
    { k: 'zoom',   n: SE('zoom'),            v: 90,     g: 'none',  doc: '无伤负词条，3+1 的成因' },
    { k: 'recoil', n: SE('recoil'),          v: 90,     g: 'none' },
    { k: 'ammo',   n: SE('ammo'),      v: 90,     g: 'none' },
    { k: 'punch',  n: SE('punch'),            v: 1.2,    g: 'none' },
    { k: 'combo',  n: SE('combo'),      v: 90,     g: 'util' },
    { k: 'range',  n: SE('range'),        v: 2.5,    g: 'none' }
  ];
  var STAT_BY_KEY = {};
  STAT_POOL.forEach(function (s) { STAT_BY_KEY[s.k] = s; });
  function zeroBucket() {
    var b = { dmg: 0, ms: 0, cc: 0, cd: 0, fac: 0, sd: 0, sc: 0, weak: 0, weakcc: 0, slam: 0, msd: 0, heavy: 0, elem: 0, ccFlat: 0, cdFlat: 0, br: 0, xh: 0, co: 0,
              slconv: 0, magconv: 0, critslash: 0, strip: 0, stripA: 0, firstShot: 0, lastShot: 0,
              tu: 0,
              statusDur: 0,
              aradius: 0,
              ps: 0, spread: 0, acc: 0, hrel: 0, noise: 0, ammoc: 0, ccc: 0,
              bounce: 0, bounceExp: 0, bounceR: 0, movesp: 0, stagger: 0, sspread: 0,
              ammoeff: 0, beamr: 0 };
    TYPES.forEach(function (t) { b[t] = 0; });
    return b;
  }
  function normalize(inp, withRiven) {
    var base = inp.base || {};
    var mods = inp.mods || {};
    var riv = withRiven === false ? {} : (inp.riven || {});
    var ctx = inp.ctx || {};
    var A = zeroBucket();
    var keys = Object.keys(A);
    keys.forEach(function (k) {
      A[k] = (+mods[k] || 0) + (+riv[k] || 0);
    });
    if (withRiven !== false && inp.replace) {
      keys.forEach(function (k) { A[k] -= (+inp.replace[k] || 0); });
    }
    var baseTypes = base.types || {};
    var D = 0;
    TYPES.forEach(function (t) { D += Math.max(0, +baseTypes[t] || 0); });
    var magN = Math.max(1, +base.mag || 1);
    if (A.firstShot || A.lastShot) {
      A.dmg += ((+A.firstShot || 0) + (+A.lastShot || 0)) / magN;
    }
    var dmgM0 = 1 + A.dmg / 100;
    var types = {};
    PHYS.forEach(function (t) {
      types[t] = Math.max(0, +baseTypes[t] || 0) * dmgM0 * Math.max(0, 1 + A[t] / 100);
    });
    ELEM.forEach(function (t) {
      var add = D * Math.max(0, A[t]) / 100;
      types[t] = (Math.max(0, +baseTypes[t] || 0) + add) * dmgM0;
    });
    OTHER.forEach(function (t) {
      if (+baseTypes[t] > 0) types[t] = Math.max(0, +baseTypes[t]) * dmgM0;
    });
    if (A.elem > 0) {
      var mix = ctx.elemMix || { heat: 1 };
      var mixSum = 0, mk;
      for (mk in mix) if (Object.prototype.hasOwnProperty.call(mix, mk)) mixSum += Math.max(0, mix[mk]);
      for (mk in mix) if (Object.prototype.hasOwnProperty.call(mix, mk)) {
        if (types[mk] == null) continue;
        types[mk] += D * A.elem / 100 * (mixSum > 0 ? Math.max(0, mix[mk]) / mixSum : 0) * dmgM0;
      }
    }
    combineElem(types, ctx.elemOrder);
    var dmgM = dmgM0, coStat = 0;
    if (A.co > 0 && !ctx.noCO) {
      var nCo = 0, tco, iCo, jCo;
      for (iCo = 0; iCo < PHYS.length; iCo++) if (types[PHYS[iCo]] > 0) nCo++;
      for (jCo = 0; jCo < ELEM.length; jCo++) if (types[ELEM[jCo]] > 0) nCo++;
      nCo = Math.min(12, nCo);
      if (nCo > 0) {
        coStat = nCo;
        dmgM = dmgM0 + (A.co / 100) * nCo;
        var kCo = dmgM / dmgM0;
        for (tco in types) if (Object.prototype.hasOwnProperty.call(types, tco)) types[tco] = types[tco] * kCo;
      }
    }
    var physAbs = 0, elemAbs = 0, elemPct = Math.max(0, A.elem);
    PHYS.forEach(function (t) { physAbs += types[t]; });
    ELEM.forEach(function (t) { elemAbs += types[t]; elemPct += Math.max(0, A[t]); });
    var total = physAbs + elemAbs;
    var brCritPct = A.br ? nativeComboCritChance(A.br, ctx.initCombo, ctx.comboCap) * 100 : 0;
    var cc = Math.max(0, q32pct((+base.cc || 0) * (1 + (A.cc + brCritPct) / 100) + A.ccFlat));
    var ccWeak = Math.max(0, q32pct((+base.cc || 0) * (1 + (A.cc + brCritPct + A.weakcc) / 100) + A.ccFlat));
    var cd = Math.max(1, q32((+base.cd || 1) * (1 + A.cd / 100) + A.cdFlat));
    var scPct = Math.max(0, (+base.sc || 0) * 100
          * Math.max(0, 1 + (A.sc + (mods.scc ? nativeComboCritChance(mods.scc, ctx.initCombo, ctx.comboCap) * 100 : 0)) / 100));
    var _tot = total > 0 ? total : 1;
    var _imp = Math.max(0, types.impact || 0) / _tot;
    var _slash = Math.max(0, types.slash || 0) / _tot;
    var _conv = Math.max(0, (A.slconv || 0) / 100);
    var _mconv = Math.max(0, (A.magconv || 0) / 100);
    var _cslash = Math.max(0, (A.critslash || 0) / 100);
    var _ccRate = Math.min(1, Math.max(0, cc / 100));
    var slashShareEff = Math.min(1, _slash + _imp * _conv);
    var procN = Math.max(0, scPct / 100) * slashShareEff + _ccRate * _cslash;
    return {
      A: A,
      D: D,
      mdb: D * dmgM,
      coStat: coStat,
      types: types,
      physAbs: physAbs,
      elemAbs: elemAbs,
      elemPct: elemPct,
      total: total,
      dmgM: dmgM,
      baseCC: +base.cc || 0,
      ms: Math.max(0, (+base.ms == null ? 1 : +base.ms) * (1 + A.ms / 100)),
      sc: scPct,
      slashShare: slashShareEff,
      procN: procN,
      hasSlash: (types.slash > 0) || (_imp > 0 && _conv > 0) || (_cslash > 0),
      magShare: Math.min(1, Math.max(0, types.magnetic || 0) / _tot + _imp * _mconv),
      cc: cc + Math.min(25, 5 * (+ctx.puncP || 0)),
      ccWeak: ccWeak + Math.min(25, 5 * (+ctx.puncP || 0)),
      cd: cd * (1 + (_coldCdBonus(ctx) / 100)),
      ccRaw: Math.max(0, q32pct((+base.cc || 0) * (1 + A.cc / 100) + A.ccFlat)),
      facM: (1 + A.fac / 100) * (1 + Math.min(1, cc / 100) * Math.max(0, A.xh || 0) / 100),
      sdM: 1 + Math.max(0, A.sd) / 100,
      viralM: procMul(ctx.viral),
      magM: 1 + (procMul(ctx.mag) - 1) * shieldShareOf(ctx),
      magBurstM: (shieldShareOf(ctx) > 0)
        ? (1 + 0.03 * Math.min(10, Math.max(0, +ctx.mag || 0)) * shieldShareOf(ctx))
        : 1,
      shieldKillM: (shieldShareOf(ctx) > 0 && _tot > 0)
        ? 1 / Math.max(0.05, 1 - shieldShareOf(ctx) * Math.min(1, Math.max(0, types.toxin || 0) / _tot))
        : 1,
      slamM: 1 + Math.max(0, A.slam) / 100,
      msdm: 1 + Math.max(0, A.msd) / 100,
      statusDurM: Math.max(0, 1 + (+A.statusDur || 0) / 100),
      weakPct: A.weak,
      tu: Math.min(1, Math.max(0, (+A.tu || 0) / 100))
    };
  }
  var DOT_COEF = { slash: 2.1, heat: 3, electric: 3, toxin: 3, gas: 3, blast: 0.3 };
  var SUP_W = {
    viral: 1.2, corrosive: 1.2, heat: 0.7, slash: 0.6,
    cold: 0.4, toxin: 0.4, electric: 0.4, gas: 0.35,
    blast: 0.3, magnetic: 0.25, puncture: 0.15, radiation: 0.1, impact: 0.05
  };
  function statusSup(st) {
    var ty = st.types || {}, w = 0, k;
    for (k in PROC) if (Object.prototype.hasOwnProperty.call(PROC, k)) {
      var has = (k === 'slash') ? !!st.hasSlash : (ty[k] > 0);
      if (has) w += (SUP_W[k] != null ? SUP_W[k] : 0.2);
    }
    if (!(w > 0)) return 0;
    var dM = (st.statusDurM == null) ? 1 : st.statusDurM;
    return (Math.max(0, st.sc) / 100) * Math.max(1, st.ms || 1) * w * (1 + 0.5 * (dM - 1));
  }
  var PROC = {
    slash:     { n: '切割',   max: 10, dur: 6, kind: ['dot'],             note: '0.35 × 6 跳，无视护甲' },
    heat:      { n: '火焰',   max: 10, dur: 6, kind: ['dot', 'debuff'],   note: '0.5 × 6 跳；2 秒内剥 50% 当前护甲' },
    electric:  { n: '电击',   max: 10, dur: 6, kind: ['dot', 'aoe'],      note: '0.5 × 6 跳；3 米内敌人再吃「攻击伤害 50%」电击并眩晕 3 秒' },
    toxin:     { n: '病毒',   max: 10, dur: 6, kind: ['dot', 'bypass'],   note: '0.5 × 6 跳；直伤与 DoT 都无视护盾' },
    gas:       { n: '毒气云', max: 10, dur: 6, kind: ['dot', 'aoe'],      note: '3 米毒云，每层 +0.3 米至 6 米；目标死了云还在' },
    blast:     { n: '爆炸',   max: 10, dur: 1.5, kind: ['dot', 'aoe'],      note: '1.5 秒后每层 30%；满 10 层或致死时 5 米内每层 300%' },
    corrosive: { n: '腐蚀',   max: 10, dur: 8, kind: ['debuff'],          note: '第 1 层 −26% 当前护甲，此后每层 −6%，满 10 层 −80%' },
    viral:     { n: '病毒增殖', max: 10, dur: 6, kind: ['debuff'],          note: '对生命 +100%，每层 +25%，满 10 层 +325%' },
    magnetic:  { n: '扰乱',   max: 10, dur: 6, kind: ['debuff', 'burst'], note: '对护盾 +100%，每层 +25%，满 325%；破盾时每层 3% 最大护盾' },
    radiation: { n: '迷惑',   max: 10, dur: 12, kind: ['cc'],              note: '对友军伤害 +100%，每层 +50%，满 550%；不折成玩家 DPS' },
    cold:      { n: '冰冻',   max: 10, dur: 6, kind: ['debuff'],          note: '受到暴击伤害 +10%，每层 +5%，满 9 层 +50%' },
    puncture:  { n: '虚弱',   max: 5, dur: 6, kind: ['debuff'],          note: '受到攻击的暴击几率 +5%/层，满 5 层 +25%' },
    impact:    { n: '冲击',   max: 5, dur: 6, kind: ['cc'],              note: '怜悯之击阈值 +8%/层，满 5 层 +40%；不折成玩家 DPS' }
  };
  var BLAST_NOVA_X = 10;
  var BLAST_RADIUS = 5;
  var ELEC_CHAIN   = 0.5;
  var ELEC_RADIUS  = 3;
  var GAS_R0 = 3, GAS_DR = 0.3, GAS_RMAX = 6;
  function elemAoeParts(st, ctx) {
    ctx = ctxOf(ctx);
    var out = { blast: 0, electric: 0, gas: 0 };
    var crowd = Math.min(1, Math.max(0, +ctx.crowd || 0));
    if (!(crowd > 0)) return out;
    var mdb = st.mdb || 0;
    if (!(mdb > 0)) return out;
    var A = st.A || {};
    if (st.types.blast > 0) {
      var bB = mdb * (1 + Math.max(0, +A.blast || 0) / 100);
      out.blast = bB * typeCoef('blast', ctx.faction) * DOT_COEF.blast * BLAST_NOVA_X * crowd;
    }
    if (st.types.electric > 0) {
      out.electric = (st.total || 0) * ELEC_CHAIN * typeCoef('electric', ctx.faction) * (1 + crowd);
    }
    if (st.types.gas > 0) {
      var gs = Math.min(PROC.gas.max, Math.max(1, +ctx.gasP || 1));
      var gr = Math.min(GAS_RMAX, GAS_R0 + GAS_DR * (gs - 1));
      var gB = mdb * (1 + Math.max(0, +A.gas || 0) / 100);
      out.gas = gB * typeCoef('gas', ctx.faction) * DOT_COEF.gas *
                Math.pow(gr / GAS_R0, 2) * crowd;
    }
    return out;
  }
  function elemAoe(st, ctx) {
    var p = elemAoeParts(st, ctx);
    return p.blast + p.electric + p.gas;
  }
  function procModel(st, ctx) {
    ctx = ctxOf(ctx);
    var mdb = (st && st.mdb) || 0, A = (st && st.A) || {}, ty = (st && st.types) || {};
    var ao = elemAoeParts(st, ctx), out = [], k, p, stk, tgt, aoe, dbg, has, base, coef;
    for (k in PROC) if (Object.prototype.hasOwnProperty.call(PROC, k)) {
      p = PROC[k];
      has = (k === 'slash') ? !!st.hasSlash : (ty[k] > 0);
      stk = (k === 'corrosive') ? (+ctx.corr || 0)
          : (k === 'viral')     ? (+ctx.viral || 0)
          : (k === 'magnetic')  ? (+ctx.mag || 0)
          : (k === 'cold')      ? (+ctx.coldP || 0)
          : (k === 'puncture')  ? (+ctx.puncP || 0)
          : (k === 'gas')       ? (+ctx.gasP || 0)
          : (k === 'blast')     ? (+ctx.blastP || 0)
          : (k === 'electric')  ? (+ctx.elecP || 0)
          : (k === 'impact')    ? (+ctx.impP || 0)
          : (k === 'radiation') ? (+ctx.radP || 0)
          : (k === 'heat')      ? (+ctx.heatP || 0)
          : (k === 'toxin')     ? (+ctx.toxinP || 0)
          : (has ? 1 : 0);
      tgt = 0; aoe = 0; dbg = '';
      coef = DOT_COEF[k] || 0;
      if (has && coef > 0 && mdb > 0) {
        base = (k === 'slash') ? mdb : mdb * (1 + Math.max(0, +A[k] || 0) / 100);
        tgt = base * coef * (st.statusDurM == null ? 1 : st.statusDurM);
        aoe = (k === 'blast') ? ao.blast : (k === 'electric') ? ao.electric : (k === 'gas') ? ao.gas : 0;
      }
      if (k === 'viral')     dbg = stk > 0 ? ('对生命 +' + Math.round((procMul(stk) - 1) * 100) + '%') : '';
      if (k === 'magnetic')  dbg = stk > 0 ? ('对护盾 +' + Math.round((procMul(stk) - 1) * 100) + '%'
                                            + '，破盾结算 ' + (3 * stk) + '%，护盾恢复 −'
                                            + Math.min(50, 5 * stk) + '%') : '';
      if (k === 'corrosive') dbg = stk > 0 ? ('削甲 −' + Math.round((0.26 + 0.06 * (stk - 1)) * 100) + '%') : '';
      if (k === 'cold')      dbg = (+ctx.coldP > 0) ? ('受到暴击伤害 +' + _coldCdBonus(ctx) + '%') : '';
      if (k === 'puncture')  dbg = (+ctx.puncP > 0) ? ('受到攻击暴击几率 +' + Math.min(25, 5 * (+ctx.puncP)) + '%') : '';
      if (k === 'heat')      dbg = (+ctx.heatP > 0) ? '剥 50% 当前护甲' : '';
      if (k === 'toxin')     dbg = (st.shieldKillM > 1) ? ('绕盾 ×' + st.shieldKillM.toFixed(2)) : '';
      if (k === 'radiation') dbg = stk > 0 ? ('对友军 +' + Math.min(550, 100 + 50 * (stk - 1)) + '%，不计 DPS') : '';
      if (k === 'impact')    dbg = stk > 0 ? ('处决阈值 +' + Math.min(40, 8 * stk) + '%，不计 DPS') : '';
      out.push({ k: k, n: p.n, note: p.note, kind: p.kind, has: !!has,
                 stacks: stk, target: tgt, aoe: aoe, debuff: dbg });
    }
    return out;
  }
  function typedSum(st, faction) {
    var s = 0, t;
    for (t in st.types) if (Object.prototype.hasOwnProperty.call(st.types, t)) s += st.types[t] * typeCoef(t, faction);
    return s;
  }
  function effectiveArmor(ctx) {
    var a = stripArmor(ctx.armor, ctx.corr, ctx.heatProc);
    var sp = Math.min(0.9, Math.max(0, +ctx.strip || 0) / 100);
    if (sp > 0) a *= (1 - sp);
    var ap = Math.max(0, +ctx.stripA || 0);
    if (ap > 0) a = Math.max(0, a - ap * 10);
    return a;
  }
  function ctxOf(ctx) { return ctx || {}; }
  function direct(st, ctx) {
    ctx = ctxOf(ctx);
    var dr = armorDR(effectiveArmor(ctx));
    var hvM = ctx.heavyAtk ? (1 + Math.max(0, st.A.heavy || 0) / 100) : 1;
    return typedSum(st, ctx.faction) * hvM * st.ms * critExpect(st.cc, st.cd, st.tu) * st.facM * (1 - dr);
  }
  function weak(st, ctx) {
    ctx = ctxOf(ctx);
    var dr = armorDR(effectiveArmor(ctx));
    var k = ctx.k == null ? 1 : Math.min(1, Math.max(0, ctx.k));
    var crit = (1 - k) * critExpect(st.cc, st.cd, st.tu) + k * critExpectWeak(st.ccWeak, st.cd, st.tu);
    var part = (1 - k) + k * weakPartMult(ctx.headMult, st.weakPct, true);
    return typedSum(st, ctx.faction) * st.ms * crit * part * st.facM * (1 - dr);
  }
  function bleed(st, ctx) {
    ctx = ctxOf(ctx);
    var mbd = (st.mdb != null) ? st.mdb : (st.types.slash || 0);
    var okSlash = (st.hasSlash == null) ? (st.types.slash > 0) : st.hasSlash;
    if (!okSlash || !(mbd > 0)) return 0;
    var proc = Math.min(2.5, Math.max(0, (st.sc == null ? 100 : st.sc) / 100));
    var sShare = (st.slashShare == null) ? 1 : Math.max(0, st.slashShare);
    var procN = (st.procN == null)
      ? Math.max(0.05, proc * sShare)
      : Math.max(0.05, st.procN);
    return mbd * DOT_COEF.slash * st.sdM * critExpect(st.cc, st.cd, st.tu) * Math.pow(st.facM, 2) * st.ms * procN *
           (st.statusDurM == null ? 1 : st.statusDurM);
  }
  function hmBleed(st, ctx) {
    ctx = ctxOf(ctx);
    var crit = critExpect(st.cc, st.cd, st.tu);
    var mbd = (st.mdb != null) ? st.mdb : typedSum(st, ctx.faction);
    var hmP = Math.min(1, Math.max(0, (+st.A.critslash || 0) / 100));
    if (!(hmP > 0)) return 0;
    return mbd * hmP * Math.min(1, st.cc / 100) *
           DOT_COEF.slash * st.sdM * crit * Math.pow(st.facM, 2) * st.ms *
           (st.statusDurM == null ? 1 : st.statusDurM);
  }
  function elemDot(st, ctx) {
    ctx = ctxOf(ctx);
    var dr = armorDR(effectiveArmor(ctx));
    var exp = 1;
    var mdb = (st.mdb != null) ? st.mdb : 0;
    var s = 0, t;
    for (var i = 0; i < ELEM.length; i++) {
      t = ELEM[i];
      var c = DOT_COEF[t];
      if (!c) continue;
      if (!(st.types[t] > 0)) continue;
      var eb = Math.max(0, (st.A && st.A[t]) || 0) / 100;
      var base = (mdb > 0) ? (mdb * (1 + eb)) : (st.types[t] || 0);
      s += base * typeCoef(t, ctx.faction) * c;
    }
    s += elemAoe(st, ctx);
    return s * st.sdM * critExpect(st.cc, st.cd, st.tu) * Math.pow(st.facM, ctx.dotFacExp == null ? 2 : ctx.dotFacExp) *
           Math.pow(st.ms, exp) * (st.statusDurM == null ? 1 : st.statusDurM) * (1 - dr);
  }
  function influence(st, ctx) {
    ctx = ctxOf(ctx);
    var aoe = ctx.aoe == null ? 0.6 : Math.min(1, Math.max(0, ctx.aoe));
    if (!(st.total > 0)) return { direct: 0, spread: 0, dot: 0, elemOut: 0, out: 0, elec: 0, aoe: aoe };
    var share = ctx.elecShare == null ? 1 : Math.min(1, Math.max(0, ctx.elecShare));
    var elec = st.types.electric * share;
    var crit = critExpect(st.cc, st.cd, st.tu);
    var dr = armorDR(effectiveArmor(ctx));
    var directOut = st.total * st.ms * crit * st.facM * (1 - dr);
    if (!(elec > 0)) return { direct: directOut, spread: 0, dot: 0, elemOut: 0, out: directOut, elec: 0, aoe: aoe };
    var spread = elec * elec / st.total * crit * st.facM * (1 - dr);
    var dot = 0.3 * elec * (1 + Math.max(0, st.A.electric) / 100) * st.sdM * DOT_COEF.electric * 2 *
              crit * Math.pow(st.facM, 2);
    var elemOut = spread + dot;
    return { direct: directOut, spread: spread, dot: dot, elemOut: elemOut,
             out: (1 - aoe) * directOut + aoe * elemOut, elec: elec, aoe: aoe };
  }
  function slamParts(st, ctx) {
    ctx = ctxOf(ctx);
    var x2 = ctx.heavyCCx2 === false ? 1 : 2;   // 紫卡暴率与斩铁系在重击上生效两次
    var brCritPct = st.A.br ? nativeComboCritChance(st.A.br, ctx.initCombo, ctx.comboCap) * 100 : 0;
    var cc = Math.min(1000, st.baseCC * (1 + (st.A.cc * x2 + brCritPct) / 100));
    var crit = critExpect(cc, st.cd, st.tu);
    var combo = heavySlamFactor(ctx.initCombo, ctx.comboCap);
    var isBlast = ctx.slamType !== 'impact';
    var coef = typeCoef(isBlast ? 'blast' : 'impact', ctx.faction);
    var elemM = 1 + st.elemPct / 100;
    var hit = (+ctx.slamBase || 0) * st.dmgM * elemM * combo * st.slamM * st.msdm * crit * st.facM * coef;
    return {
      slamBase: (+ctx.slamBase || 0), dmgM: st.dmgM,
      elemPct: st.elemPct, elemM: elemM,
      combo: combo, slamM: st.slamM, msdm: st.msdm,
      baseCC: st.baseCC, cc: cc, cd: st.cd, critM: crit,
      facM: st.facM, coef: coef, isBlast: isBlast, total: hit
    };
  }
  function slam(st, ctx) { return slamParts(st, ctx).total; }
  var CT_IMPACT = 1.875, CT_BOOM = 5, CT_EMBED = 3;
  var CT_RADIUS = 10;
  function contagionParts(st, ctx) {
    ctx = ctxOf(ctx);
    var dr = armorDR(effectiveArmor(ctx));
    var lv = ctx.ctLevel == null ? 3 : Math.max(0, Math.min(3, ctx.ctLevel));
    var lvM = 1 + lv;
    var D = st.D;
    var physMod = function (t) { return 1 + Math.max(0, st.A[t] || 0) / 100; };
    var impHit = 0;
    ['impact', 'puncture', 'slash'].forEach(function (t) {
      impHit += (D / 3) * physMod(t) * typeCoef(t, ctx.faction);
    });
    impHit *= CT_IMPACT * lvM * st.dmgM;
    impHit *= (0.5 + 0.5 * st.ms);
    var boomHit = (D + D * Math.max(0, st.A.viral || 0) / 100) * st.dmgM;
    boomHit *= CT_BOOM * lvM * typeCoef('viral', ctx.faction);
    boomHit *= (ctx.ctHitCtr == null ? 1 : ctx.ctHitCtr);
    var embHit = (D + D * Math.max(0, st.A.blast || 0) / 100) * st.dmgM;
    embHit *= CT_EMBED * lvM * typeCoef('blast', ctx.faction);
    var critM = critExpect(st.cc, st.cd, st.tu);
    var raw = (impHit + boomHit + embHit) * st.facM * critM * (1 - dr);
    return {
      D: D, lv: lv, lvM: lvM, dmgM: st.dmgM,
      ms: st.ms, msM: (0.5 + 0.5 * st.ms),
      physMod: { impact: physMod('impact'), puncture: physMod('puncture'), slash: physMod('slash') },
      viralPct: Math.max(0, st.A.viral || 0), blastPct: Math.max(0, st.A.blast || 0),
      imp: impHit, boom: boomHit, emb: embHit, sum: impHit + boomHit + embHit,
      ctHitCtr: (ctx.ctHitCtr == null ? 1 : ctx.ctHitCtr),
      facM: st.facM, critM: critM, cc: st.cc, cd: st.cd,
      dr: dr, radius: CT_RADIUS, total: raw
    };
  }
  function contagion(st, ctx) { return contagionParts(st, ctx).total; }
  var DEMO_BANDS = [
    [1250, 0.80, 0],
    [3125, 0.64, 200],
    [6250, 0.56, 450],
    [12500, 0.32, 1950],
    [25000, 0.16, 3950],
    [Infinity, 0.08, 5950]
  ];
  var PROC_BANDS = [
    [1562.5, 0.640, 0],
    [3906.25, 0.512, 200],
    [7812.5, 0.448, 450],
    [15625, 0.256, 1950],
    [31250, 0.128, 3950],
    [Infinity, 0.064, 5950]
  ];
  function attenMul(x, proc) {
    if (!(x > 0)) return proc ? 0.64 : 0.8;
    var B = proc ? PROC_BANDS : DEMO_BANDS;
    for (var i = 0; i < B.length; i++) {
      if (x <= B[i][0]) return B[i][2] ? B[i][1] + B[i][2] / x : B[i][1];
    }
    return B[B.length - 1][1] + B[B.length - 1][2] / x;
  }
  var ATTEN_TICKS = { slash: 6, heat: 1, electric: 6, toxin: 6, gas: 6 };
  function dotDivisor(st, ctx) {
    var s = 0, p = 0, t, c, v;
    var mdb = (st.mdb != null) ? st.mdb : 0;
    for (var i = 0; i < ELEM.length; i++) {
      t = ELEM[i]; c = DOT_COEF[t];
      if (!c) continue;
      if (!(st.types[t] > 0)) continue;
      var eb = Math.max(0, (st.A && st.A[t]) || 0) / 100;
      var base = (mdb > 0) ? (mdb * (1 + eb)) : (st.types[t] || 0);
      v = base * typeCoef(t, ctx.faction) * c;
      s += v;
      p += v / (ATTEN_TICKS[t] || 6);
    }
    return p > 0 ? s / p : 6;
  }
  function critOf(st, ctx, cal) {
    if (cal === 'weak') {
      var k = ctx.k == null ? 1 : Math.min(1, Math.max(0, ctx.k));
      return (1 - k) * critExpect(st.cc, st.cd, st.tu) + k * critExpectWeak(st.ccWeak, st.cd, st.tu);
    }
    return critExpect(st.cc, st.cd, st.tu);
  }
  function nonCritPerVolley(st, ctx, cal) {
    var dr = armorDR(effectiveArmor(ctx));
    var v = typedSum(st, ctx.faction) * st.ms * st.facM * (1 - dr);
    if (cal === 'weak') {
      var k = ctx.k == null ? 1 : Math.min(1, Math.max(0, ctx.k));
      v *= (1 - k) + k * weakPartMult(ctx.headMult, st.weakPct, true);
    }
    return v;
  }
  function eidolonG(u, T) {
    if (!(u > 0)) return 0;
    return u <= T ? 0.4 * u : (0.1 * (u - T) + T) * 0.4;
  }
  var ATTEN_PROC = { blood: 1, elemDot: 1 };
  var ATTEN_SPLIT = { direct: 1, weak: 1 };
  function attenOut(cal, st, ctx, rate, kind) {
    var v = rawOut(cal, st, ctx);
    if (!(v > 0) || !(rate > 0)) return 0;
    if (kind === 'eidolon') {
      var beam = !!ctx.beam;
      var msI = Math.max(1, Math.round(st.ms || 1));
      var T = ctx.sniper ? 300 : 300 / rate / (beam ? msI : 1);
      var div = ATTEN_PROC[cal] ? (cal === 'blood' ? 6 : dotDivisor(st, ctx))
                                : (beam ? 1 : Math.max(1, st.ms || 1));
      return eidolonG(v / div, T);
    }
    var x;
    if (ATTEN_PROC[cal]) x = v * rate / (cal === 'blood' ? 6 : dotDivisor(st, ctx));
    else if (ATTEN_SPLIT[cal]) x = nonCritPerVolley(st, ctx, cal) * rate;
    else x = v * rate;
    return (ATTEN_SPLIT[cal] ? critOf(st, ctx, cal) : 1) * x * attenMul(x, !!ATTEN_PROC[cal]);
  }
  function ratioAtten(cal, st0, st1, ctx, rate0, rate1, kind) {
    var a = attenOut(cal, st1, ctx, rate1, kind), b = attenOut(cal, st0, ctx, rate0, kind);
    return b > 0 ? a / b : null;
  }
  function blendedRatioAtten(inp, cal, rate0, rate1, kind) {
    var ctx = inp.ctx || {};
    var st0 = normalize(inp, false), st1 = normalize(inp, true);
    var r = ratioAtten(cal, st0, st1, ctx, rate0, rate1, kind);
    if (cal !== 'blood' && cal !== 'elemDot') return r;
    var dr = armorDR(effectiveArmor(ctx));
    var k0 = Math.min(1, Math.max(0, ctx.dotShare == null ? 0.6 : ctx.dotShare));
    var k = k0 > 0 ? k0 / (k0 + (1 - k0) * (1 - dr)) : 0;
    var rd = ratioAtten('direct', st0, st1, ctx, rate0, rate1, kind);
    if (rd == null) return r;
    if (r == null) return rd;
    return (1 - k) * rd + k * r;
  }
  function attenRateGain(inp, cal, rate0, rate1, kind) {
    var ctx = inp.ctx || {};
    var st0 = normalize(inp, false), st1 = normalize(inp, true);
    var a = ratioAtten(cal, st0, st1, ctx, rate0, rate1, kind);
    var b = ratioAtten(cal, st0, st1, ctx, rate0, rate0, kind);
    if (a == null || !(b > 0)) return null;
    return a / b - 1;
  }
  var CALIBERS = [
    { k: 'direct',  n: '单体直伤',   note: '单目标、不含 DoT' },
    { k: 'weak',    n: '弱点 / 爆头', note: '爆伤 ×2 进分级 + 部位加算' },
    { k: 'blood',   n: '纯切 / 破甲', note: '流血无视护甲，派系双算' },
    { k: 'elemDot', n: '元素状态 DoT', note: '火/电/毒/气，吃护甲' },
    { k: 'statusSup', n: '异况吞吐', note: '辅助线 · 触发几率 × 异况种数 × 持续' },
    { k: 'inf',     n: '侵染清怪',   note: '只扩散元素，按绝对量' },
    { k: 'slam',    n: '重震地',     note: '连击系数 + 震地乘区' },
    { k: 'contagion', n: '神威触染',  note: 'Zaw 专属 · 三段异质伤害' }
  ];
  function rawOut(key, st, ctx) {
    var v = rawOut0(key, st, ctx);
    if (key === 'statusSup') return v;   // 吞吐是 proc 计数口径，不吃伤害类乘区
    return v * (st.viralM || 1) * (st.magM || 1) * (st.magBurstM || 1) * (st.shieldKillM || 1);
  }
  function rawOut0(key, st, ctx) {
    switch (key) {
      case 'direct':  return direct(st, ctx);
      case 'weak':    return weak(st, ctx);
      case 'blood':   return ctx.bleedSource === 'hm' ? hmBleed(st, ctx) : bleed(st, ctx);
      case 'elemDot': return elemDot(st, ctx);
      case 'statusSup': return statusSup(st, ctx);
      case 'inf':     return influence(st, ctx).elemOut;
      case 'slam':    return slam(st, ctx);
      case 'contagion': return contagion(st, ctx);
      default:        return 0;
    }
  }
  function ratioFor(key, st1, st0, ctx) {
    if (key === 'inf') {
      var A = influence(st1, ctx), B = influence(st0, ctx);
      if (!(B.direct > 0)) return null;
      var aoe = ctx.aoe == null ? 0.6 : Math.min(1, Math.max(0, ctx.aoe));
      if (!(B.elemOut > 0)) return A.direct / B.direct;
      return (1 - aoe) * (A.direct / B.direct) + aoe * (A.elemOut / B.elemOut);
    }
    var a = rawOut(key, st1, ctx), b = rawOut(key, st0, ctx);
    return b > 0 ? a / b : null;
  }
  function evaluate(inp) {
    var ctx = inp.ctx || {};
    var st0 = normalize(inp, false);
    var st1 = normalize(inp, true);
    if (st1 && st1.A && (+st1.A.strip || +st1.A.stripA)) {
      ctx = (typeof Object.assign === 'function')
        ? Object.assign({}, ctx) : (function (o) { var n = {}, k; for (k in o) if (Object.prototype.hasOwnProperty.call(o, k)) n[k] = o[k]; return n; })(ctx);
      if (+st1.A.strip) ctx.strip = (+ctx.strip || 0) + (+st1.A.strip || 0);
      if (+st1.A.stripA) ctx.stripA = (+ctx.stripA || 0) + (+st1.A.stripA || 0);
    }
    var dr = armorDR(effectiveArmor(ctx));
    var res = { st0: st0, st1: st1, dr: dr, raw: {}, ratio: {}, matrix: [] };
    CALIBERS.forEach(function (c) {
      res.ratio[c.k] = ratioFor(c.k, st1, st0, ctx);
      res.raw[c.k] = { withR: rawOut(c.k, st1, ctx), without: rawOut(c.k, st0, ctx), ratio: res.ratio[c.k] };
    });
    res.influence = { withR: influence(st1, ctx), without: influence(st0, ctx) };
    var k0 = Math.min(1, Math.max(0, ctx.dotShare == null ? 0.6 : ctx.dotShare));
    var k = k0 > 0 ? k0 / (k0 + (1 - k0) * (1 - dr)) : 0;
    res.dotWeight = k;
    var blend = function (key) {
      var r = res.ratio[key];
      return r == null ? null : (1 - k) * res.ratio.direct + k * r;
    };
    CALIBERS.forEach(function (c) {
      var v;
      if (c.k === 'blood' || c.k === 'elemDot') v = blend(c.k);
      else v = res.ratio[c.k];
      if (c.k === 'blood' && ctx.bleedSource === 'none') v = null;
      if (c.k === 'slam' && !(ctx.slamBase > 0)) v = null;
      if (c.k === 'contagion' && !ctx.isZaw) v = null;
      res.matrix.push({ k: c.k, n: c.n, note: c.note, ratio: v });
    });
    res.score = res.ratio.direct == null ? null : (res.ratio.direct - 1) * 100;
    return res;
  }
  function blendedRatio(inp, key) {
    var ctx = inp.ctx || {};
    var st0 = normalize(inp, false), st1 = normalize(inp, true);
    var r = ratioFor(key, st1, st0, ctx);
    if (r == null) return null;
    if (key !== 'blood' && key !== 'elemDot') return r;
    var dr = armorDR(effectiveArmor(ctx));
    var k0 = Math.min(1, Math.max(0, ctx.dotShare == null ? 0.6 : ctx.dotShare));
    var k = k0 > 0 ? k0 / (k0 + (1 - k0) * (1 - dr)) : 0;
    var rd = st0 ? rawOut('direct', st1, ctx) / rawOut('direct', st0, ctx) : 1;
    return (1 - k) * rd + k * r;
  }
  function scoreOf(inp, key) {
    var st0 = normalize(inp, false), st1 = normalize(inp, true);
    var ctx = inp.ctx || {};
    var r = ratioFor(key, st1, st0, ctx);
    if (r == null) return null;
    if (key === 'blood' || key === 'elemDot') {
      var dr = armorDR(effectiveArmor(ctx));
      var k0 = Math.min(1, Math.max(0, ctx.dotShare == null ? 0.6 : ctx.dotShare));
      var k = k0 > 0 ? k0 / (k0 + (1 - k0) * (1 - dr)) : 0;
      var rd = st0 ? rawOut('direct', st1, ctx) / rawOut('direct', st0, ctx) : 1;
      return ((1 - k) * rd + k * r - 1) * 100;
    }
    return (r - 1) * 100;
  }
  var GRADES = [
    { min: 90, g: 'EX', cn: '版本级' },
    { min: 80, g: 'S+', cn: '顶级' },
    { min: 65, g: 'S',  cn: '极佳' },
    { min: 50, g: 'A',  cn: '优秀' },
    { min: 40, g: 'B',  cn: '可用' },
    { min: 30, g: 'C',  cn: '勉强' },
    { min: 20, g: 'D',  cn: '偏差' },
    { min: 10, g: 'E',  cn: '差' },
    { min: -1e9, g: 'F', cn: '废' }
  ];
  function grade(level) {
    var x = +level || 0;
    for (var i = 0; i < GRADES.length; i++) if (x >= GRADES[i].min) return GRADES[i];
    return GRADES[GRADES.length - 1];
  }
  var CEIL_POOL = ['dmg', 'cc', 'cd', 'ms', 'fac', 'sd', 'weak', 'slam', 'heat'];
  function ceiling(inp, caliberKey, opts) {
    opts = opts || {};
    var disp = +inp.disposition || 1;
    var pool = (opts.pool || CEIL_POOL).filter(function (k) {
      var s = STAT_BY_KEY[k];
      if (!s) return false;
      if (k === 'ms' && (inp.base && inp.base.noMs)) return false;
      if (k === 'slam' && !(inp.ctx && inp.ctx.slamBase > 0)) return false;
      if (k === 'weak' && inp.ctx && inp.ctx.k === 0) return false;
      return true;
    });
    var best = -1e9, bestCombo = null;
    for (var i = 0; i < pool.length; i++) {
      for (var j = i + 1; j < pool.length; j++) {
        for (var l = j + 1; l < pool.length; l++) {
          var rv = {};
          var combo = [pool[i], pool[j], pool[l]];
          combo.forEach(function (k) {
            rv[k] = STAT_BY_KEY[k].v * disp * TIER['3P1N'].pos;
          });
          var probe = Object.assign({}, inp, { riven: rv });
          var s = scoreOf(probe, caliberKey);
          if (s != null && s > best) { best = s; bestCombo = combo; }
        }
      }
    }
    return { best: best, combo: bestCombo };
  }
  var WEAPONS = {
    bo: {
      label: '玻之武杖 Prime · 近战',
      base: { types: { impact: 158.4, puncture: 17.6 }, cc: 24, cd: 2.6, ms: 1 },
      mods: { dmg: 320, electric: 150, ms: 0, cc: 440, cd: 120 },
      ctx: { faction: 'grineer', armor: 0, dotShare: 0.6, elecShare: 1, aoe: 0.6, k: 0,
             slamBase: 528, initCombo: 80, slamType: 'blast' },
      disposition: 1.35
    },
    magistar: {
      label: '执法者 Magistar · 震地',
      base: { types: { impact: 168, puncture: 31.5, slash: 10.5 }, cc: 36, cd: 3.0, ms: 1 },
      mods: { dmg: 165, electric: 225, cc: 110, cd: 210, slam: 200 },
      ctx: { faction: 'grineer', armor: 2400, corr: 10, dotShare: 0.15, k: 0,
             slamBase: 630, initCombo: 140, slamType: 'blast', heavyCCx2: true },
      disposition: 1.35
    },
    torid: {
      label: '托里德 Torid · 光束',
      base: { types: { corrosive: 51 }, cc: 29, cd: 3.1, ms: 1 },
      mods: { dmg: 485, corrosive: 90, heat: 60, cc: 200, cd: 120, fac: 55 },
      replace: { corrosive: 90 },   // 紫卡的腐蚀词条顶替那张电 mod 的位置
      ctx: { faction: 'grineer', armor: 2400, corr: 10, heatProc: true, dotShare: 0.75, beam: true },
      disposition: 1.30
    },
    burston: {
      label: '伯斯顿 Prime · 弱点',
      base: { types: { impact: 9, puncture: 7, slash: 2 }, cc: 28, cd: 3.0, ms: 1 },
      mods: { dmg: 525, electric: 180, cc: 520, cd: 210, weak: 350 },
      ctx: { faction: 'grineer', armor: 2400, corr: 10, k: 0.7, headMult: 2, dotShare: 0.2 },
      disposition: 1.35
    }
  };
  return {
    ARMOR_CAP: ARMOR_CAP,
    ARMOR_SPAWN_MIN: ARMOR_SPAWN_MIN,
    TYPES: TYPES, PHYS: PHYS, ELEM: ELEM, OTHER: OTHER, TYPE_CN: TYPE_CN, TYPE_EN: TYPE_EN,
    FACTIONS: FACTIONS, FACTION_ORDER: FACTION_ORDER,
    STAT_POOL: STAT_POOL, STAT_BY_KEY: STAT_BY_KEY,
    CALIBERS: CALIBERS, TIER: TIER, GRADES: GRADES, WEAPONS: WEAPONS,
    DOT_COEF: DOT_COEF, PRIM: PRIM, ELEM_PAIR: ELEM_PAIR,
    PROC: PROC, elemAoe: elemAoe, elemAoeParts: elemAoeParts, procModel: procModel,
    typeCoef: typeCoef, compCoef: compCoef, combineElem: combineElem,
    armorDR: armorDR, spawnArmor: spawnArmor, stripArmor: stripArmor, procMul: procMul,
    shieldShareOf: shieldShareOf,
    q32: q32, q32Text: q32Text, q32pct: q32pct, q32Code: q32Code,
    critExpect: critExpect, critExpectWeak: critExpectWeak, weakPartMult: weakPartMult,
    comboMult: comboMult, heavySlamFactor: heavySlamFactor,
    comboLevelOf: comboLevelOf, comboMulOf: comboMulOf,
    COMBO_MAX: COMBO_MAX, COMBO_MAX_VENKA: COMBO_MAX_VENKA, comboCapOf: comboCapOf,
    comboCap: function (n, cap) { return Math.max(0, Math.min((+cap > 0) ? +cap : COMBO_MAX, +n || 0)); },
    nativeComboCritChance: nativeComboCritChance,
    buckets: buckets,
    rivenValue: rivenValue, rollOf: rollOf,
    normalize: normalize, evaluate: evaluate, scoreOf: scoreOf,
    blendedRatio: blendedRatio,
    attenMul: attenMul, attenOut: attenOut, ratioAtten: ratioAtten,
    blendedRatioAtten: blendedRatioAtten, attenRateGain: attenRateGain,
    grade: grade, ceiling: ceiling,
    direct: direct, weak: weak, bleed: bleed, elemDot: elemDot, influence: influence, slam: slam,
    contagion: contagion, contagionParts: contagionParts,
    slam: slam, slamParts: slamParts
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = WF;
