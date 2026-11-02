/* ========================================================================== */
(function () {
  'use strict';

  var TOL = 0.05;        // 同层容差：相似度落在 max_sim-0.05 以内的都算「同款那一层」
  var NEG_BONUS = 0.12;  // 负词条「真同款」加成：双方都没负，或负的是同一条
  var NEG_PRESENCE = 0.04; // 双方都有负但不是同一条：弱加成（价格按严重度折算）
  var VAL_MIX = 0.45;    // 数值接近度在相似度里的占比
  var WIDE_POW = 6.0;    // 同款不足 3 条、放宽到相似词条时的权重指数
  var SHAPE_W = 0.75;    // 候选每比查询卡多一条正面词条，价格 ×0.75（全库实测中位比，与 Python 同值）
  var OUT_K = 6;         // 离群线：超过同层中位 6 倍算「挂着不卖」

  /* ── 负词条严重度（与 tools/neg_severity.py 逐行对应，改一边必须同步另一边）── */
  var SEV_MULT = [1.00, 0.85, 0.70, 0.50];   // 0 白送 … 3 致命
  var NEG_FREE = {
    zoom: 1, ammo_maximum: 1, recoil: 1,
    finisher_damage: 1, critical_chance_on_slide_attack: 1,
    chance_to_gain_combo_count: 1, chance_to_gain_extra_combo_count: 1,
    slam_attack_damage: 1, magazine_reloaded_s_when_holstered: 1,
    parry_angle: 1, ammo_efficiency: 1
  };
  var NEG_DEADLY = { multishot: 1, 'base_damage_/_melee_damage': 1 };
  var NEG_FIXED = {
    'fire_rate_/_attack_speed': 2, heavy_attack_wind_up_speed: 2,
    weak_point_damage: 2, melee_damage_on_heavy_attack: 1,
    punch_through: 1, range: 1, reload_speed: 1, magazine_capacity: 1,
    combo_duration: 1, status_duration: 1, projectile_speed: 1,
    weak_point_critical_chance: 1
  };
  var NEG_PHYS = { impact_damage: 'Impact', puncture_damage: 'Puncture', slash_damage: 'Slash' };
  var NEG_ELEM = {
    cold_damage: 'Cold', electric_damage: 'Electricity', heat_damage: 'Heat',
    toxin_damage: 'Toxin', gas: 'Gas', viral: 'Viral', corrosive: 'Corrosive',
    radiation: 'Radiation', blast: 'Blast', magnetic: 'Magnetic'
  };

  function negClass(panel, slug) {
    if (NEG_FREE[slug]) return 0;
    if (NEG_DEADLY[slug]) return 3;
    if (NEG_FIXED[slug] != null) return NEG_FIXED[slug];
    if (/^damage_(vs|to)_/.test(slug)) return 1;
    var cc = panel ? panel[0] : null;
    var sc = panel ? panel[1] : null;
    var dt = panel ? panel[2] : null;
    if (slug === 'critical_chance') {
      if (cc == null) return 2;
      if (cc < 0.15) return 0;
      return cc < 0.25 ? 1 : 3;
    }
    if (slug === 'critical_damage') {
      if (cc == null) return 2;
      return cc < 0.15 ? 1 : 3;
    }
    if (slug === 'status_chance' || slug === 'status_damage') {
      if (sc == null) return 2;
      if (sc < 0.15) return 0;
      return sc < 0.25 ? 1 : 3;
    }
    if (NEG_PHYS[slug]) {
      var sh = dt ? dt[NEG_PHYS[slug]] : null;
      if (sh == null) return 1;
      return sh < 0.10 ? 0 : (sh < 0.30 ? 1 : 3);
    }
    if (NEG_ELEM[slug]) {
      var sh2 = dt ? dt[NEG_ELEM[slug]] : null;
      if (!sh2) return 0;                       // 武器没这个元素，负词条白送
      return sh2 >= 0.15 ? 3 : 1;
    }
    return 1;                                   // 不认识的词条，保守按轻伤
  }

  function negMult(weaponSlug, slugs) {
    /* 这组负词条的价格折扣乘积； */
    if (!slugs || !slugs.length) return 1.0;
    var D = db();
    var panel = (D && D.panels) ? D.panels[weaponSlug] : null;
    var m = 1.0;
    for (var i = 0; i < slugs.length; i++) m *= SEV_MULT[negClass(panel, slugs[i])];
    return m;
  }
  /* ── 负词条严重度结束 ── */

  function db() { return window.ZKPRICEDB || null; }

  /* 定价池：国际服用 db.w / db.ranges，国服用 db.cnp（国服在售挂单现算的池）。
     两边结构一样，估算算法完全复用 —— 国服价格水平跟国际服差好几倍且 300 封顶，
     按倍数换算误差 140%，直接在本服挂单池里比价才准（留一法实测 16.7%）。 */
  function poolOf(store) {
    var D = db();
    if (!D) return null;
    if (store === 'cn') {
      if (!D.cnp || !D.cnp.w) return null;
      return { w: D.cnp.w, ranges: D.cnp.ranges, cap: D.cnp.cap || 300,
               clamp: !!D.cnp.clamp, store: 'cn' };
    }
    return { w: D.w, ranges: D.ranges, cap: D.cap || 0, store: 'intl' };
  }

  /* 模拟器词条行号 -> 定价库 slug（rw 是构建期生成的，row 27/31 为 null） */
  function slugOfRow(row) {
    var D = db();
    if (!D || !D.rw) return null;
    var s = D.rw[String(row)];
    return s || null;
  }

  /* 武器对象 -> 定价库 slug。 */
  var _ix = null;
  function wxIndex() {
    if (_ix) return _ix;
    var D = db();
    _ix = { exact: {}, base: {} };
    if (!D) return _ix;
    var keys = Object.keys(D.w);
    for (var j = 0; j < keys.length; j++) {
      var slug = keys[j], e = D.w[slug];
      if (e.zh) _ix.exact[e.zh] = slug;
      if (e.en) _ix.exact[e.en.toLowerCase()] = slug;
    }
    return _ix;
  }
  function slugOfWeapon(w) {
    if (!w) return null;
    var D = db();
    if (!D) return null;
    if (D.w[w.slug]) return w.slug;
    var ix = wxIndex();
    var cand = [w.cn, w.intl, w.en];
    var i, s;
    for (i = 0; i < cand.length; i++) {
      s = cand[i];
      if (!s) continue;
      if (ix.exact[s]) return ix.exact[s];
      if (ix.exact[s.toLowerCase()]) return ix.exact[s.toLowerCase()];
    }
    // 退回本体名：圣装/Prime 变体在 WM 上没有独立紫卡页面
    cand = [w.bcn, w.bintl, w.ben];
    for (i = 0; i < cand.length; i++) {
      s = cand[i];
      if (!s) continue;
      if (ix.exact[s]) return ix.exact[s];
      if (ix.exact[s.toLowerCase()]) return ix.exact[s.toLowerCase()];
    }
    return null;
  }

  function qnorm(weapon, slug, v, R) {
    var D = db();
    /* 国服池里该武器可能没有这条词条的值域，退回国际服的（卡面数值本身同尺度） */
    var r = (R && R[weapon + '|' + slug]) || D.ranges[weapon + '|' + slug];
    if (!r) return null;
    var lo = r[0], hi = r[1];
    if (!(hi > lo)) return null;
    return Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
  }

  function wquantile(pairs, q) {
    var arr = pairs.slice().sort(function (a, b) { return a[0] - b[0]; });
    var tot = 0, i;
    for (i = 0; i < arr.length; i++) tot += arr[i][1];
    if (tot <= 0) return arr[Math.floor(arr.length / 2)][0];
    var acc = 0;
    for (i = 0; i < arr.length; i++) {
      acc += arr[i][1];
      if (acc >= tot * q) return arr[i][0];
    }
    return arr[arr.length - 1][0];
  }

  function statName(slug) {
    var D = db();
    var k = (D && D.stats) ? D.stats[slug] : null;   /* 价库里只存键，名字全部从命名表取 */
    if (!k) return slug;
    if (window.ZKC && window.ZKC.statNameByKey) return window.ZKC.statNameByKey(k, 0);
    return k;
  }

  /* 派系词条（对 Corpus / Grineer / Infested / Orokin / Scaldra / Techrot）在 WM 上 */
  function isMultStat(slug) {
    return /^(damage_vs_|damage_to_)/.test(slug);
  }

  function fmtVal(v) {
    if (Math.abs(v - Math.round(v)) < 0.05) return String(Math.round(v));
    return v.toFixed(1);
  }

  /* 国服池标了 clamp：交易中心 300 白金封顶，词条数折算把价格推上去也要截回来 */
  function capv(v, P) {
    if (P && P.clamp && P.cap) return Math.min(v, P.cap);
    return v;
  }

  /* pos / neg: [{s: slug, v: 卡面绝对值}]，v 给 0 表示不知道具体数值；
     store: 'intl'（默认）/ 'cn' —— 决定在哪个服的在售挂单里比价 */
  function estimate(weapon, pos, neg, store) {
    var D = db();
    if (!D) return { ok: false, reason: '行情库没加载' };
    var P = poolOf(store);
    if (!P) return { ok: false, reason: store === 'cn' ? '国服挂单库还没生成' : '行情库没加载' };
    var w = P.w[weapon];
    if (!w) {
      return { ok: false, noPool: true, pool: P.store,
               reason: P.store === 'cn' ? '国服交易中心没有这把武器的在售挂单' : '行情库里还没有这把武器' };
    }

    neg = neg || [];
    var ps = {}, ns = {}, i, k;
    var posN = 0;
    for (i = 0; i < pos.length; i++) { ps[pos[i].s] = 1; posN++; }
    for (i = 0; i < neg.length; i++) ns[neg[i].s] = 1;
    if (!posN) return { ok: false, reason: '至少要有一条正面词条' };
    var hasNeg = neg.length > 0;

    var cands = [];
    /* 负词条严重度：查询卡的负词条决定整池价格折算到哪一档。 */
    var nsArr = [];
    for (i = 0; i < neg.length; i++) nsArr.push(neg[i].s);
    var mQ = negMult(weapon, nsArr);
    for (var n = 0; n < w.items.length; n++) {
      var it = w.items[n];
      var pi = it[0], pv = it[1], ni = it[2], nv = it[3], price = it[4];
      var iset = {}, inter = 0, un = 0;
      for (i = 0; i < pi.length; i++) iset[D.slugs[pi[i]]] = 1;
      var pk = Object.keys(ps), ik = Object.keys(iset);
      for (i = 0; i < pk.length; i++) { un++; if (iset[pk[i]]) inter++; }
      for (i = 0; i < ik.length; i++) { if (!ps[ik[i]]) un++; }
      if (inter === 0) continue;
      var sim = inter / un;

      // 数值接近度：只在双方都有该词条时比，缺值按中性 0.5
      var vmap = {};
      for (i = 0; i < pi.length; i++) vmap[D.slugs[pi[i]]] = pv[i];
      var ds = [], sum = 0, cnt = 0;
      for (i = 0; i < pos.length; i++) {
        var s = pos[i].s, v = pos[i].v;
        if (vmap[s] !== undefined && v > 2) {
          var q1 = qnorm(weapon, s, v, P.ranges);
          var q2 = qnorm(weapon, s, vmap[s], P.ranges);
          if (q1 !== null && q2 !== null) { ds.push(1 - Math.abs(q1 - q2)); }
        }
      }
      for (i = 0; i < ds.length; i++) { sum += ds[i]; cnt++; }
      var qb = cnt ? sum / cnt : 0.5;
      sim *= (1 - VAL_MIX) + VAL_MIX * qb;

      if (hasNeg === (ni.length > 0)) {
        if (!ni.length) sim += NEG_BONUS;                    // 双方都没负
        else if (ni.length === nsArr.length &&
                 ni.every(function (x) { return nsArr.indexOf(D.slugs[x]) >= 0; }))
          sim += NEG_BONUS;                                  // 负的是同一条 真同款
        else sim += NEG_PRESENCE;                            // 都有负但不同条
      }
      /* 价格折算到「我的负词条」口径；词条数不一样的候选再按正面条数差折算 */
      var mC = negMult(weapon, ni.map(function (x) { return D.slugs[x]; }));
      var adj = price * (mQ / mC) * Math.pow(SHAPE_W, pi.length - posN);
      cands.push({ sim: sim, price: price, adj: adj, item: it });
    }

    if (!cands.length) {
      return {
        ok: true, fallback: true, weapon: w, pool: P.store,
        p25: w.p25, p50: w.med, p75: w.p75,
        nUsed: w.n, nSame: 0, nPool: 0, exact: false,
        evidence: [], note: '没有词条相近的挂单，只能按这把武器的整体行情给'
      };
    }

    cands.sort(function (a, b) {
      if (b.sim !== a.sim) return b.sim - a.sim;
      return a.adj - b.adj;
    });
    /* 同型池：正面/负词条数量都和查询卡一样的候选。 */
    var sameShape = [];
    for (i = 0; i < cands.length; i++) {
      if (cands[i].item[0].length === posN && cands[i].item[2].length === neg.length)
        sameShape.push(cands[i]);
    }
    var shapeOk = sameShape.length >= 3;
    var pool = shapeOk ? sameShape : cands;
    var maxSim = pool[0].sim;
    var tier = [], c;
    if (maxSim >= 0.55) {
      for (i = 0; i < pool.length; i++) {
        c = pool[i];
        if (c.sim >= maxSim - TOL && c.sim >= 0.55) tier.push(c);
      }
    } else {
      for (i = 0; i < pool.length; i++) {
        if (pool[i].sim >= 0.3) tier.push(pool[i]);
        if (tier.length >= 40) break;
      }
    }

    var pairs = [], exact;
    if (tier.length < 3) {
      var wide = [];
      for (i = 0; i < pool.length; i++) {
        if (pool[i].sim >= 0.3) wide.push(pool[i]);
        if (wide.length >= 30) break;
      }
      if (!wide.length) wide = pool.slice(0, 10);
      for (i = 0; i < wide.length; i++) {
        pairs.push([wide[i].adj, Math.pow(Math.max(0.01, wide[i].sim), WIDE_POW)]);
      }
      exact = false;
    } else {
      for (i = 0; i < tier.length; i++) pairs.push([tier[i].adj, 1]);
      exact = true;
    }
    if (!pairs.length) {
      return {
        ok: true, fallback: true, weapon: w, pool: P.store,
        p25: w.p25, p50: w.med, p75: w.p75,
        nUsed: 0, nSame: 0, nPool: cands.length, exact: false,
        evidence: [], note: '没找到可比的挂单，只能按这把武器的整体行情给'
      };
    }

    // 剔除钓鱼价：同层里比中位高一截的，多半是挂着不卖的展示价
    var raw = pairs.map(function (x) { return x[0]; }).sort(function (a, b) { return a - b; });
    var mid = raw[Math.floor(raw.length / 2)];
    var cut = mid * OUT_K;
    var trimmed = [], dropped = [];
    for (i = 0; i < pairs.length; i++) {
      if (pairs[i][0] <= cut) trimmed.push(pairs[i]); else dropped.push(pairs[i][0]);
    }
    var nOut = dropped.length;
    if (trimmed.length >= 3) pairs = trimmed;

    var ps2 = pairs.map(function (x) { return x[0]; }).sort(function (a, b) { return a - b; });
    var priceMin = ps2[0], priceMax = ps2[ps2.length - 1];
    var spread = priceMax / Math.max(1, priceMin);
    var nSame = 0;
    for (i = 0; i < pool.length; i++) if (pool[i].sim >= 1 - 1e-9) nSame++;

    var ev = [];
    for (i = 0; i < pool.length && ev.length < 5; i++) {
      var e = pool[i], pi2 = e.item[0], pv2 = e.item[1], ni2 = e.item[2], nv2 = e.item[3];
      var pa = [], na = [];
      for (k = 0; k < pi2.length; k++) {
        pa.push({ name: statName(D.slugs[pi2[k]]), v: fmtVal(pv2[k]), x: isMultStat(D.slugs[pi2[k]]) });
      }
      for (k = 0; k < ni2.length; k++) {
        na.push({ name: statName(D.slugs[ni2[k]]), v: fmtVal(Math.abs(nv2[k])), x: isMultStat(D.slugs[ni2[k]]) });
      }
      ev.push({ price: e.price, sim: Math.round(Math.min(1, e.sim) * 100) / 100, pos: pa, neg: na });
    }

    dropped.sort(function (a, b) { return b - a; });
    return {
      ok: true, fallback: false, weapon: w, pool: P.store,
      /* Python 侧是 int() 截断，这里必须用 floor 对齐（round 会在折算价 */
      p25: capv(Math.floor(wquantile(pairs, 0.25)), P),
      p50: capv(Math.floor(wquantile(pairs, 0.50)), P),
      p75: capv(Math.floor(wquantile(pairs, 0.75)), P),
      nUsed: pairs.length, nPool: cands.length,
      nSame: Math.min(nSame, pairs.length),
      exact: exact, spread: Math.round(spread * 10) / 10,
      shape: shapeOk,
      priceMin: priceMin, priceMax: priceMax,
      negAdj: Math.round(mQ * 100) / 100,
      nOutlier: nOut, outliers: dropped.slice(0, 3),
      evidence: ev
    };
  }

  window.ZKPRICEREF = {
    ready: function () { return !!window.ZKPRICEDB; },
    slugOfRow: slugOfRow,
    slugOfWeapon: slugOfWeapon,
    statName: statName,
    isMultStat: isMultStat,
    estimate: estimate,
    poolOf: poolOf,
    meta: function (store) {
      var D = db();
      if (!D) return null;
      if (store === 'cn') {
        if (!D.cnp) return null;
        return { built: D.built, cap: D.cnp.cap, weapons: Object.keys(D.cnp.w).length,
                 orders: null, capLabel: '国服交易中心上限' };
      }
      return { built: D.built, cap: D.cap, weapons: Object.keys(D.w).length, orders: D.dropped };
    }
  };
})();
