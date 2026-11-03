(function () {
  'use strict';
  var ZK = window.ZKDATA || {};
  var STATS = ZK.stats || [], WEAPONS = ZK.weapons || [];
  var STAT_WM = (window.ZKNAMES && window.ZKNAMES.statWm) || {};
  var AFFIX_TABLE = STATS.map(function (s) {
    var w = STAT_WM[s.row] || STAT_WM[String(s.row)] || [];
    return { cn: s.cn, intl: s.intl, en: s.en, wmCn: w[0] || '', wmEn: w[1] || '', drow: s.row };
  });
  function dispLang() {
    try { return window.ZKLANGI ? (window.ZKLANGI() | 0) : 1; } catch (e) { return 1; }
  }
  function dispName(o) {
    if (!o) return '';
    var L = dispLang();
    if (L === 2) return o.en || o.intl || o.cn || '';
    if (L === 1) return o.intl || o.cn || o.en || '';
    return o.cn || o.intl || o.en || '';
  }
  function dispStat(row) {
    for (var i = 0; i < AFFIX_TABLE.length; i++) if (AFFIX_TABLE[i].drow === row) return dispName(AFFIX_TABLE[i]);
    return '';
  }
  var DISP_ALL = window.ZKC ? ZKC.disp() : 1.2;
  function wdisp(w) { return window.ZKC ? (ZKC.dispReal ? ZKC.dispReal(w) : ZKC.disp(w)) : 1.2; }
  function affixEnAliases(en) {
    var out = [];
    if (!en) return out;
    if (en.indexOf('Damage vs. ') === 0) out.push(en.replace('Damage vs. ', 'Damage to '));
    if (en.indexOf('Damage vs ') === 0) out.push(en.replace('Damage vs ', 'Damage vs. '));
    if (en.indexOf('Damage vs ') === 0) out.push(en.replace('Damage vs ', 'Damage to '));
    if (en.indexOf(' on Slide Attack') >= 0) out.push(en.replace(' on Slide Attack', ' for Slide Attack'));
    if (en.indexOf('Magazine Reload While Holstered') === 0) out.push('Reload While Holstered');
    if (en.indexOf('Heavy Attack Damage') === 0) out.push('Melee Damage On Heavy Attack');
    if (en.indexOf('Slam Damage') === 0) out.push('Slam Attack Damage');
    if (/^(Cold|Toxin|Electricity|Heat|Impact|Slash|Puncture|Gas|Corrosive|Viral|Radiation|Blast|Magnetic)$/.test(en)) out.push(en + ' Damage');
    return out;
  }
  var WEAPON_TABLE = WEAPONS.map(function (w, i) {
    return { cn: w.cn, intl: w.intl, en: w.en, cat: w.cat, disp: wdisp(w), idx: i,
             bcn: w.bcn, bintl: w.bintl, ben: w.ben, vr: w.var };
  });
  var AFFIX_ALIAS = { '伤害': '基础伤害', '射物虐': '投射物速度', '投射物速度': '投射物速度', '攻击范围': '攻击范围' };
  var WEAPON_CN_FIX = (window.ZKNAMES && ZKNAMES.alias) || {};   /* 别名/错写：唯一来源是命名表 */
  var NON_PCT_ROWS = window.RULES.NON_PCT_ROWS;
  var ZKP = ZK.params || {};
  var CATS = ZKP.cats || ['步枪', '霰弹', '手枪', '曲翼', '近战·天工造武'];
  var CATKEY = ZKP.catKey || {};
  var CAT_NAMES = (function () {
    var ks = Object.keys(CATKEY);
    return ks.length ? ks : ['步枪', '霰弹', '手枪', '曲翼', '近战'];
  })();
  var CAT_COL = (function () {
    var m = {};
    for (var i = 0; i < CAT_NAMES.length; i++) {
      var k = CATKEY[CAT_NAMES[i]];
      if (k == null) { m[CAT_NAMES[i]] = i; continue; }
      m[CAT_NAMES[i]] = (window.ZKC && ZKC.catCol) ? ZKC.catCol(CAT_NAMES[i]) : CATS.indexOf(k);
    }
    return m;
  })();
  var COMBO_COEF = (ZKP.combo || []).slice();
  var VOL_LO = isFinite(ZKP.lo) ? ZKP.lo : 0.9;
  var VOL_MID = isFinite(ZKP.mid) ? ZKP.mid : 1;
  var VOL_HI = isFinite(ZKP.hi) ? ZKP.hi : 1.1;
  var MAX_RANK = isFinite(ZKP.maxRank) ? ZKP.maxRank : 8;
  var DRAIN2RANK = window.RULES.DRAIN2RANK;
  var FACTION_DROWS = window.RULES.FACTION_DROWS;
  var VALUE_MAX = isFinite(window.RULES.VALUE_MAX) ? window.RULES.VALUE_MAX : 404;
  var RANK2DRAIN = (function () {
    var m = {};
    for (var k in DRAIN2RANK) if (Object.prototype.hasOwnProperty.call(DRAIN2RANK, k)) if (DRAIN2RANK[k] != null) m[DRAIN2RANK[k]] = +k;
    return m;
  })();
  function shrinkValue(v) {
    var x = +v;
    if (!isFinite(x) || x <= VALUE_MAX) return v;
    if (x / 10 <= VALUE_MAX) return x / 10;
    if (x / 100 <= VALUE_MAX) return x / 100;
    return v;
  }
  var STAT_ROW = (function () {
    var m = {};
    for (var i = 0; i < STATS.length; i++) m[STATS[i].row] = STATS[i];
    return m;
  })();
  function rowBaseOf(row, cat) {
    var st = STAT_ROW[row];
    if (!st || !st.v) return NaN;
    var i = CAT_COL[cat];
    if (i === undefined || i < 0) return NaN;
    var v = st.v[i];
    return (v === null || v === undefined) ? NaN : v;
  }
  function rowAllowsCat(row, cat) {
    var b = rowBaseOf(row, cat);
    return isFinite(b);
  }
  function catsFromAffixes(affixes) {
    var allowed = null, used = 0;
    for (var i = 0; i < (affixes || []).length; i++) {
      var d = affixes[i] && affixes[i].drow;
      if (!d || !STAT_ROW[d]) continue;
      used++;
      if (allowed === null) {
        allowed = CAT_NAMES.filter(function (c) { return rowAllowsCat(d, c); });
      } else {
        allowed = allowed.filter(function (c) { return rowAllowsCat(d, c); });
      }
      if (!allowed.length) break;
    }
    return { cats: allowed || [], used: used };
  }
  function catsAlive(cats, affixes, rank, posN, negN) {
    if (!affixes.length) return cats.slice();
    return (cats || []).filter(function (c) {
      for (var i = 0; i < WEAPON_TABLE.length; i++) {
        if (WEAPON_TABLE[i].cat !== c) continue;
        if (isFinite(weaponValueFit(WEAPON_TABLE[i], affixes, rank, posN, negN))) return true;
      }
      return false;
    });
  }
  function drainToRank(drain) {
    var n = parseInt(drain, 10);
    return (isFinite(n) && DRAIN2RANK[n] != null) ? DRAIN2RANK[n] : MAX_RANK;
  }
  function comboIdxOf2(posN, negN) {
    if (posN <= 2) return negN ? 1 : 0;
    return negN ? 3 : 2;
  }
  function weaponValueFit(w, affixes, rank, posN, negN) {
    if (!w) return NaN;
    var c = COMBO_COEF[comboIdxOf2(posN, negN)];
    if (!c) return NaN;
    var rk = (rank + 1) / 9;
    if (!isFinite(rk) || rk <= 0) return NaN;
    var sum = 0, n = 0, miss = 0;
    for (var i = 0; i < affixes.length; i++) {
      var a = affixes[i];
      var row = a && a.drow;
      if (!row || !STAT_ROW[row]) continue;
      var base = rowBaseOf(row, w.cat);
      if (!isFinite(base)) return NaN;                       // 这把武器根本没这条属性 硬否
      var coef = (a.sign === '-' || factionSign(a) === '-') ? Math.abs(c.neg) : c.gain;
      if (!isFinite(coef) || coef <= 0) return NaN;
      if (FACTION_DROWS.indexOf(row) >= 0) base = (base - 1) * 100;   // 派系：倍率 百分数
      var f = base * coef * wdisp(w) * rk;
      if (!f) return NaN;
      var vol = Math.abs(+a.value) / Math.abs(f);
      if (!isFinite(vol)) { miss++; continue; }
      if (vol < VOL_LO - 0.04 || vol > VOL_HI + 0.04) { miss++; continue; }
      sum += Math.abs(vol - VOL_MID); n++;
    }
    if (!n || miss > 1) return NaN;                          // 一条都对不上 / 歪了两条以上 否
    return miss * 5 + sum / n;
  }
  var SETTLE_TOL = (function () {
    var z = (ZK.params && +ZK.params.variantTh) || 0;
    return (z > 0.05 && z < 0.25) ? z : 0.11;
  })();
  function familyOf(w) {
    if (!w) return [];
    var base = String(w.bcn || w.bintl || w.cn || '');
    var baseEn = String(w.ben || w.en || '');
    var out = [];
    for (var i = 0; i < WEAPON_TABLE.length; i++) {
      var x = WEAPON_TABLE[i];
      if (x.cat !== w.cat) continue;
      var xb = String(x.bcn || x.bintl || x.cn || '');
      if (xb === base || (baseEn && String(x.ben || x.en || '') === baseEn)) out.push(x);
    }
    return out.length ? out : [w];
  }
  function scaleProbe(rows, w, rank, posN, negN) {
    if (!w) return null;
    var c = COMBO_COEF[comboIdxOf2(posN, negN)];
    if (!c) return null;
    var rk = (rank + 1) / 9;
    if (!(rk > 0)) return null;
    var gs = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i].drow;
      if (!row || !STAT_ROW[row]) continue;
      if (NON_PCT_ROWS.indexOf(row) >= 0) continue;
      var base = rowBaseOf(row, w.cat);
      if (!isFinite(base) || !base) return null;
      var coef = (rows[i].sign === '-' || factionSign(rows[i]) === '-') ? Math.abs(c.neg) : c.gain;
      var pred = base * coef * wdisp(w) * rk;
      if (!pred) return null;
      gs.push(Math.abs(+rows[i].value) / Math.abs(pred) - 1);
    }
    if (gs.length < 2) return null;                 // 一条数约束不住定标
    var bad = 0, worst = 0, sum = 0;
    for (var k = 0; k < gs.length; k++) {
      var g = gs[k];                               /* 保留符号：mean 必须是有向的 */
      if (Math.abs(g) > SETTLE_TOL) bad++;
      if (Math.abs(g) > worst) worst = Math.abs(g);
      sum += g;
    }
    return { bad: bad, worst: worst, mean: sum / gs.length,
             absMean: Math.abs(sum / gs.length), n: gs.length };
  }
  var SETTLE_W = { wVar: 1.0, cConf: 0.45, cOther: 1.4, cDown: 2.2 };
  var DRAIN_CONFUSE = ['68', '80', '56', '35', '17', '01', '90', '34'];
  function drainDigitConfused(a, b) {
    if (a === b) return true;
    for (var i = 0; i < DRAIN_CONFUSE.length; i++) {
      var p = DRAIN_CONFUSE[i];
      if ((p.charAt(0) === a && p.charAt(1) === b) || (p.charAt(0) === b && p.charAt(1) === a)) return true;
    }
    return false;
  }
  function rankCostOf(levelText, r) {
    var to = (RANK2DRAIN[r] != null) ? String(RANK2DRAIN[r]) : null;
    if (to == null) return 9;
    var a = String(levelText == null ? '' : levelText).replace(/[^0-9]/g, '');
    if (!a) return 9;
    if (a === to) return 0;
    var r0 = drainToRank(a);
    if (!isFinite(r0)) return 9;
    if (r < r0) return SETTLE_W.cDown;          // 往下修：不是已知的误差模式，昂贵
    var cost = 0, n = Math.max(a.length, to.length);
    for (var i = 0; i < n; i++) {
      var ca = a.charAt(a.length - 1 - i), cb = to.charAt(to.length - 1 - i);
      if (ca && cb && ca === cb) continue;
      cost += (ca && cb && drainDigitConfused(ca, cb)) ? SETTLE_W.cConf : SETTLE_W.cOther;
    }
    return cost;
  }
  function settleBetter(x, y) {
    if (!y) return true;
    var a = x.probe, b = y.probe;
    if (a.bad !== b.bad) return a.bad < b.bad;
    var px = x.cb ? x.cb.pen : 0, py = y.cb ? y.cb.pen : 0;
    if (px !== py) return px < py;
    if (Math.abs(x.cost - y.cost) > 1e-9) return x.cost < y.cost;
    if (Math.abs(a.absMean - b.absMean) > 0.005) return a.absMean < b.absMean;
    return a.worst < b.worst - 1e-9;
  }
  function settleRowsOf(san) {
    var rows = [];
    for (var i = 0; i < (san || []).length; i++) {
      var a = san[i];
      if (!a || lockIconMisread(a)) continue;
      var mm = matchAffix(a.namePart);
      if (!mm || !mm.row) continue;
      rows.push({ drow: mm.row.drow, sign: a.sign, value: a.value });
    }
    return rows;
  }
  function settleSearch(rows, cands, posN, negN, rank, cur, levelText, pinRank) {
    var best = null;
    for (var ci = 0; ci < cands.length; ci++) {
      var w = cands[ci];
      for (var r = 0; r <= MAX_RANK; r++) {
        if (pinRank && r !== rank) continue;             // 容量读得准 就不许用数值改等级
        var p = scaleProbe(rows, w, r, posN, negN);
        if (!p) continue;
        var cost = rankCostOf(levelText, r) + ((w === cur) ? 0 : SETTLE_W.wVar);
        var cand = { w: w, rank: r, probe: p, cost: cost, cb: null };
        if (settleBetter(cand, best)) best = cand;
      }
    }
    return best;
  }
  function settleRankCombo(rawAffixes, cn, en, rank, levelText) {
    var rows = [], seen = {};
    for (var i = 0; i < (rawAffixes || []).length; i++) {
      var a = rawAffixes[i];
      if (!a || !a.namePart || lockIconMisread(a)) continue;
      var mm = matchAffix(a.namePart);
      if (!mm || !mm.row) continue;
      var dr = mm.row.drow;
      if (seen[dr]) continue;                       // 同一对照表行只留一条（与 sanitize 的 byRow 同向）
      seen[dr] = 1;
      rows.push({ drow: dr, sign: a.sign, value: a.value, y: (a.y || 0) });
    }
    if (rows.length < 2) return null;               // 一条数约束不住定标
    rows.sort(function (x, y) { return (x.y || 0) - (y.y || 0); });
    var n = rows.length, last = rows[n - 1];
    var combos;
    if (n >= 4) combos = [{ pos: 3, neg: 1, pen: 0 }];
    else if (n === 3) {
      var lastPos = (last.sign === '+' && last.drow !== RECOIL_ROW);
      combos = lastPos ? [{ pos: 3, neg: 0, pen: 0 }]
                       : [{ pos: 2, neg: 1, pen: 0 }, { pos: 3, neg: 0, pen: 2 }];
    } else if (n === 2) combos = [{ pos: 2, neg: 0, pen: 0 }];
    else return null;
    var cands = [], cur = null;
    var wm = (cn || en) ? matchWeapon(cn, en) : null;
    if (wm && wm.row) { cur = wm.row; cands = familyOf(cur); }
    if (!cands.length) {
      var cInfo = catsFromAffixes(rows);
      var pool = (cInfo.used && cInfo.cats.length) ? cInfo.cats : null;
      if (!pool) return null;
      for (var k = 0; k < WEAPON_TABLE.length; k++)
        if (pool.indexOf(WEAPON_TABLE[k].cat) >= 0) cands.push(WEAPON_TABLE[k]);
    }
    if (!cands.length) return null;
    function rowsFor(cb) {
      return rows.map(function (x, idx) {
        return { drow: x.drow, value: x.value, sign: (cb.neg && idx === n - 1) ? '-' : x.sign };
      });
    }
    var better = settleBetter;
    var pinRank = rankCostOf(levelText, rank) === 0;      // 容量一眼读准 等级以卡面为准
    var best = null;
    for (var ci = 0; ci < combos.length; ci++) {
      var er = rowsFor(combos[ci]);
      for (var wi = 0; wi < cands.length; wi++) {
        for (var r = 0; r <= MAX_RANK; r++) {
          if (pinRank && r !== rank) continue;
          var pr = scaleProbe(er, cands[wi], r, combos[ci].pos, combos[ci].neg);
          if (!pr) continue;
          var cand = { w: cands[wi], rank: r, cb: combos[ci], probe: pr,
                       cost: rankCostOf(levelText, r) + ((cands[wi] === cur) ? 0 : SETTLE_W.wVar) };
          if (better(cand, best)) best = cand;
        }
      }
    }
    if (!best || best.probe.bad > 0) return null;    // 没有自洽的解 不做改动
    var curProbe = cur ? scaleProbe(rowsFor(combos[0]), cur, rank, combos[0].pos, combos[0].neg) : null;
    if (curProbe && curProbe.bad === 0) return null; // 现状自洽 不动
    if (curProbe && curProbe.bad <= 1 && best.rank !== rank && rankCostOf(levelText, rank) === 0) return null;
    if (best.probe.bad >= (curProbe ? curProbe.bad : 1e9)) return null;
    if (best.rank === rank && best.cb === combos[0] && best.w === cur) return null;
    return { rank: best.rank, combo: { pos: best.cb.pos, neg: best.cb.neg },
             comboChanged: (best.cb !== combos[0]), w: best.w, probe: best.probe };
  }
  function settleScale(san, wpick, posN, negN, rank, cats, levelText) {
    var rows = settleRowsOf(san);
    if (rows.length < 2) return null;
    var cur = (wpick && wpick.row) ? wpick.row : null;
    var curProbe = cur ? scaleProbe(rows, cur, rank, posN, negN) : null;
    if (curProbe && curProbe.bad === 0) return null;        // 当前读法自洽 一个字都不动
    var cands = [];
    var nameLocked = !!(cur && wpick && wpick.score >= 92);
    if (cur) cands = nameLocked ? [cur] : familyOf(cur);
    else {
      var pool = (cats && cats.length) ? cats : null;
      if (!pool) return null;
      for (var k = 0; k < WEAPON_TABLE.length; k++)
        if (pool.indexOf(WEAPON_TABLE[k].cat) >= 0) cands.push(WEAPON_TABLE[k]);
    }
    if (!cands.length) return null;
    var best = settleSearch(rows, cands, posN, negN, rank, cur, levelText,
                            rankCostOf(levelText, rank) === 0);
    if (!best) return null;
    if (!cur) {
      return (best.probe.bad === 0 && best.rank !== rank)
        ? { w: null, rank: best.rank, probe: best.probe, scope: 'rankOnly' } : null;
    }
    if (best.probe.bad >= curProbe.bad) return null;        // 没有比现状更好 不动
    if (best.probe.bad > 0) return null;                    // 只有自洽才改
    if (best.rank !== rank && curProbe.bad <= 1 && rankCostOf(levelText, rank) === 0) return null;
    if (best.rank === rank && best.w === cur) return null;
    return { w: best.w, rank: best.rank, probe: best.probe, scope: 'rank' };
  }
  var DIGIT_FIX = { '0': '8', '8': '0', '6': '5', '5': '6', '3': '8', '1': '7', '7': '1', '9': '4' };
  function repairValueOnce(raw, expect) {
    var src = String(raw == null ? '' : raw).trim();
    var ev = Math.abs(+expect);
    if (!src || !(ev > 0)) return null;
    var tries = [src], i;
    for (i = 0; i < src.length; i++) {
      var ch = src.charAt(i);
      if (!DIGIT_FIX[ch]) continue;
      tries.push(src.slice(0, i) + DIGIT_FIX[ch] + src.slice(i + 1));
    }
    if (src.indexOf('.') < 0 && src.length > 1) tries.push(src.slice(0, -1) + '.' + src.slice(-1));
    var nv0 = parseFloat(src);
    if (isFinite(nv0) && nv0) { tries.push(String(nv0 / 10)); tries.push(String(nv0 * 10)); }
    var best = null;
    for (i = 0; i < tries.length; i++) {
      var v = parseFloat(tries[i]);
      if (!isFinite(v) || v === 0) continue;
      var vol = Math.abs(v) / ev;
      if (vol < VOL_LO || vol > VOL_HI) continue;
      var d = Math.abs(vol - VOL_MID);
      if (!best || d < best.d) best = { v: v, d: d, from: src, text: tries[i] };
    }
    return best;
  }
  function repairAffixValues(san, wpick, rank, posN, negN) {
    var out = [];
    if (!wpick || !wpick.row || !(san || []).length) return out;
    var cat = wpick.row.cat, disp = wdisp(wpick.row);
    var c = COMBO_COEF[comboIdxOf2(posN, negN)];
    if (!c) return out;
    var rk = (rank + 1) / 9;
    if (!isFinite(rk) || rk <= 0) return out;
    for (var i = 0; i < san.length; i++) {
      var a = san[i];
      var mm = matchAffix(a.namePart);
      if (!mm || !mm.row) continue;
      if (FACTION_DROWS.indexOf(mm.row.drow) >= 0) continue;
      var base = rowBaseOf(mm.row.drow, cat);
      if (!isFinite(base) || !base) continue;
      var negSide = (a.sign === '-' || (a.sign === '×' && parseFloat(a.value) < 1));
      var coef = negSide ? Math.abs(c.neg) : c.gain;
      if (!isFinite(coef) || coef <= 0) continue;
      var expect = base * coef * disp * rk;
      if (!expect) continue;
      var vol0 = Math.abs(parseFloat(a.value)) / Math.abs(expect);
      if (!isFinite(vol0)) continue;
      if (vol0 >= VOL_LO - 0.04 && vol0 <= VOL_HI + 0.04) continue;   // 本来就对，一个字都不动
      var fix = repairValueOnce(a.value, expect);
      if (!fix) continue;
      a.value = String(fix.v);
      out.push({ row: mm.row.drow, name: dispName(mm.row), from: fix.from, to: String(fix.v) });
    }
    return out;
  }
  function pickWeaponSmart(cnPart, enPart, catInfo, affixes, rank, posN, negN) {
    var cats = (catInfo && catInfo.used) ? catInfo.cats : null;
    var all = rankWeapon(cnPart, enPart);
    var i, w;
    for (i = 0; i < all.length; i++) {
      if (all[i].score < 45) break;
      w = all[i].row;
      if (cats && cats.length && cats.indexOf(w.cat) < 0) continue;
      if (affixes.length && !isFinite(weaponValueFit(w, affixes, rank, posN, negN))) continue;
      return { pick: all[i], byName: all[i].score >= 62 };
    }
    if (!cats || !cats.length || !affixes.length) return null;
    var alive = catsAlive(cats, affixes, rank, posN, negN);
    if (!alive.length) return null;
    var best = null, bestD = 1e9;
    for (i = 0; i < WEAPON_TABLE.length; i++) {
      w = WEAPON_TABLE[i];
      if (alive.indexOf(w.cat) < 0) continue;
      var d = weaponValueFit(w, affixes, rank, posN, negN);
      if (!isFinite(d)) continue;
      var dd = d + (alive.length > 1 ? 1e-6 * CAT_NAMES.indexOf(w.cat) : 0);
      if (dd < bestD) { bestD = dd; best = w; }
    }
    return best ? { pick: { row: best, score: 0, col: '-' }, byName: false } : null;
  }
  function lockIconMisread(a) {
    if (!a || a.isPct) return false;
    var v = +a.value;
    if (!isFinite(v) || Math.abs(v) > 9) return false;        // 真词条个位数极少见，且那些行不带 %
    var m = matchAffix(a.namePart);
    return !!(m && NON_PCT_ROWS.indexOf(m.row.drow) < 0);
  }
  var FACTION_ROWS = [
    { drow: 16, keys: ['科普斯', 'corpus'] },
    { drow: 17, keys: ['克隆尼', 'grineer'] },
    { drow: 18, keys: ['异变体', 'infested'] }
  ];
  function latinFaction(t) {
    var words = String(t).toLowerCase().match(/[a-z]{5,}/g) || [];
    for (var i = 0; i < FACTION_ROWS.length; i++) {
      var key = FACTION_ROWS[i].keys[1];
      for (var w = 0; w < words.length; w++) {
        var s = words[w];
        if (s[0] !== key[0]) continue;
        if (s.length < key.length - 2 || s.length > key.length + 2) continue;
        var same = 0;
        for (var c = 0; c < key.length; c++) if (s.indexOf(key[c]) >= 0) same++;
        if (same / key.length >= 0.75) return FACTION_ROWS[i].drow;
      }
    }
    return 0;
  }
  function factionRowOf(name) {
    var t = norm(name);
    if (!t) return 0;
    for (var i = 0; i < FACTION_ROWS.length; i++)
      for (var j = 0; j < FACTION_ROWS[i].keys.length; j++)
        if (t.indexOf(FACTION_ROWS[i].keys[j]) >= 0) return FACTION_ROWS[i].drow;
    return latinFaction(t);
  }
  function factionPatternOf(name) {
    var t = norm(name);
    if (!t) return 0;
    return (/对[^对]{1,12}伤害/.test(t) || /对[^对]{1,12}的伤害/.test(t)) ? 1 : 0;
  }
  function factionSign(a) { return a && a.sign === '×' && +a.value < 1 ? '-' : '+'; }
  function rollBaseOf(row, cat) {
    var b = rowBaseOf(row, cat);
    return (isFinite(b) && FACTION_DROWS.indexOf(row) >= 0) ? (b - 1) * 100 : b;
  }
  function realPolarity(a) {
    if (a.drow === 25) return (a.sign === '+') ? -1 : 1;
    if (a.sign === '×') return (+a.value < 1) ? -1 : 1;
    return (a.sign === '-') ? -1 : 1;
  }
  function rivenGenLatin(affixes, weapon) {
    if (!weapon || !weapon.cat) return '';
    var cat = weapon.cat, pos = [];
    for (var i = 0; i < (affixes || []).length; i++) {
      var a = affixes[i];
      if (!a || !a.drow || !STAT_ROW[a.drow]) continue;
      if (realPolarity(a) < 0) continue;                       // 负面槽不参与命名
      var base = rollBaseOf(a.drow, cat);
      if (!isFinite(base) || base === 0) continue;
      var v = Math.abs(parseFloat(a.value));
      if (!isFinite(v)) continue;
      if (FACTION_DROWS.indexOf(a.drow) >= 0) v = Math.abs((parseFloat(a.value) - 1) * 100);
      pos.push({ row: a.drow, ratio: v / base });
    }
    if (!pos.length) return '';
    pos.sort(function (x, y) { return y.ratio - x.ratio; });
    function wd(r, key) { var s = STAT_ROW[r]; return (s && s[key]) ? s[key].toLowerCase() : ''; }
    var k1 = wd(pos[0].row, 'pre'), k2 = '', k3 = '';
    if (pos.length >= 2) k2 = (pos.length >= 3) ? wd(pos[1].row, 'pre') : wd(pos[1].row, 'suf');
    if (pos.length >= 3) k3 = wd(pos[2].row, 'suf');
    var res = k1;
    if (k2) res += '-' + k2;
    if (k3) res += k3;
    return res;
  }
  function levSim(a, b) {
    a = String(a); b = String(b);
    var m = a.length, n = b.length, i, j;
    if (!m) return n ? 0 : 1; if (!n) return 0;
    var dp = new Array(n + 1);
    for (j = 0; j <= n; j++) dp[j] = j;
    for (i = 1; i <= m; i++) {
      var prev = dp[0]; dp[0] = i;
      for (j = 1; j <= n; j++) {
        var t = dp[j];
        dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
        prev = t;
      }
    }
    return 1 - dp[n] / Math.max(m, n);
  }
  var FOLD_DIGIT = { '0': 'o', '1': 'l', '5': 's', '2': 'z', '8': 'b' };
  function foldLatin(s) {
    return String(s == null ? '' : s).normalize('NFKC').toLowerCase()
      .replace(/[01582]/g, function (c) { return FOLD_DIGIT[c]; })
      .replace(/[^a-z]/g, '');
  }
  var PRE2ROW = {}, SUF2ROW = {};
  (function () {
    for (var r in STAT_ROW) if (Object.prototype.hasOwnProperty.call(STAT_ROW, r)) {
      var st = STAT_ROW[r];
      if (!st) continue;
      if (st.pre) PRE2ROW[foldLatin(st.pre)] = +r;
      if (st.suf) SUF2ROW[foldLatin(st.suf)] = +r;
    }
  })();
  function genNameParts(ocrEn, weaponEn) {
    var raw = String(ocrEn == null ? '' : ocrEn).normalize('NFKC').toLowerCase();
    if (weaponEn) {
      var wv = String(weaponEn).normalize('NFKC').toLowerCase();
      var p = raw.indexOf(wv);
      if (p === 0) raw = raw.slice(wv.length);
    }
    return raw.split(/[^a-z0-9]+/).map(foldLatin)
      .filter(function (x) { return x.length >= 2; });
  }
  function genNameStats(ocrEn, weaponEn) {
    var parts = genNameParts(ocrEn, weaponEn);
    var must = [], maybe = [];
    if (parts.length >= 1 && PRE2ROW[parts[0]]) must.push(PRE2ROW[parts[0]]);
    if (parts.length === 2 && SUF2ROW[parts[1]]) must.push(SUF2ROW[parts[1]]);
    if (parts.length >= 3) {
      if (PRE2ROW[parts[1]]) maybe.push(PRE2ROW[parts[1]]);
      if (SUF2ROW[parts[1]]) maybe.push(SUF2ROW[parts[1]]);
      if (SUF2ROW[parts[2]]) must.push(SUF2ROW[parts[2]]);
    }
    return { must: must, maybe: maybe, parts: parts };
  }
  function crossCheckName(derived, ocrEn, weaponEn) {
    function norm(s) { return foldLatin(s); }   /* R2：派生名与卡面名走同一套折叠才守恒 */
    var d = norm(derived), o = norm(ocrEn);
    if (weaponEn) { var we = norm(weaponEn); if (we && o.indexOf(we) === 0) o = o.slice(we.length); }
    if (!d) return { ok: false, sim: 0, derived: derived, ocr: ocrEn, reason: 'derived-empty' };
    if (!o) return { ok: false, sim: 0, derived: derived, ocr: ocrEn, reason: 'ocr-empty' };
    var sim = levSim(d, o);
    function nearHit() {
      if (o.length < 2) return false;
      var head = d.slice(0, o.length), tail = d.slice(-o.length);
      return levSim(o, head) >= 0.75 || levSim(o, tail) >= 0.75;
    }
    var ok = (d === o) || sim >= 0.80 || nearHit();
    return { ok: ok, sim: Math.round(sim * 1000) / 1000, derived: derived, ocr: ocrEn, reason: ok ? null : 'mismatch' };
  }
  var OCR_PROGRESS = function () {};
  var currentImage = null;
  var OCR_REQ = 0;
  var lastConflicts = { level: null, name: null, affix: [] };
  var TPL_W = 632, TPL_H = 800;
  var REGIONS_PCT = {
    level: { top: 0.02, bottom: 0.16, left: 0.68, right: 0.96 },
    name:  { top: 0.42, bottom: 0.70, left: 0.08, right: 0.92 },
    affix: { top: 0.55, bottom: 0.88, left: 0.06, right: 0.94 }
  };
  var AFFIX_SUFFIXES = (function () {
    var cnt = {};
    for (var i = 0; i < AFFIX_TABLE.length; i++) {
      var t = norm(AFFIX_TABLE[i].cn);
      if (t.length >= 3) cnt[t.slice(-2)] = (cnt[t.slice(-2)] || 0) + 1;
    }
    return Object.keys(cnt).filter(function (s) { return cnt[s] >= 2; }).sort(function (a, b) { return b.length - a.length; });
  })();
function detectCardBox(img) {
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  if (!W || !H) return null;
  const sw = Math.min(240, W), sh = Math.max(1, Math.round(H * sw / W));
  const c = document.createElement('canvas');
  c.width = sw; c.height = sh;
  const cx = c.getContext('2d');
  cx.drawImage(img, 0, 0, sw, sh);
  const d = cx.getImageData(0, 0, sw, sh).data;
  const isBg = (r, g, b) => {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = mx === 0 ? 0 : (mx - mn) / mx;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    return lum > 200 && sat < 0.12;
  };
  const isPurple = (r, g, b) => (b - g) > 5 && b > 40;
  const nonBg = new Uint8Array(sw * sh);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) nonBg[p] = isBg(d[i], d[i + 1], d[i + 2]) ? 0 : 1;
  function longestSeg(arr, len, th) {
    let best = null, s = -1;
    for (let i = 0; i < len; i++) {
      if (arr[i] > th) { if (s < 0) s = i; }
      else if (s >= 0) { if (!best || i - s > best[1] - best[0] + 1) best = [s, i - 1]; s = -1; }
    }
    if (s >= 0 && (!best || len - s > best[1] - best[0] + 1)) best = [s, len - 1];
    return best;
  }
  const rows = new Float32Array(sh);
  for (let y = 0; y < sh; y++) {
    let n = 0;
    for (let x = 0; x < sw; x++) n += nonBg[y * sw + x];
    rows[y] = n / sw;
  }
  const ry = longestSeg(rows, sh, 0.2);
  if (!ry) return null;
  const cols = new Float32Array(sw);
  for (let y = ry[0]; y <= ry[1]; y++) {
    for (let x = 0; x < sw; x++) cols[x] += nonBg[y * sw + x];
  }
  const rx = longestSeg(cols, sw, (ry[1] - ry[0] + 1) * 0.5);
  if (!rx) return null;
  const x0 = rx[0], x1 = rx[1] + 1, y0 = ry[0], y1 = ry[1] + 1;
  if (x1 - x0 < sw * 0.15 || y1 - y0 < sh * 0.15) return null;   // 太小视为未检测到
  let pur = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * sw + x) * 4;
      if (isPurple(d[i], d[i + 1], d[i + 2])) pur++;
    }
  }
  if (pur < (x1 - x0) * (y1 - y0) * 0.25) return null;
  return { x0: x0 / sw, y0: y0 / sh, x1: x1 / sw, y1: y1 / sh };
}
function alignToTemplate(img, box) {
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const c = document.createElement('canvas');
  c.width = TPL_W; c.height = TPL_H;
  const cx = c.getContext('2d');
  cx.imageSmoothingEnabled = true;
  cx.imageSmoothingQuality = 'high';
  cx.drawImage(img,
    box.x0 * W, box.y0 * H, (box.x1 - box.x0) * W, (box.y1 - box.y0) * H,
    0, 0, TPL_W, TPL_H);
  return c;
}
var RANK_LINE_RE = /段位|沒位|没位|設位|设位|投位|股位|叚位|没伤|精通段位|M\s?R/i;   /* 「段」常被读成 沒/設/投/股/叚，逐个收进来 */
function parseMr(text) {
  var m = String(text || '').match(/(\d+)/);
  var n = m ? parseInt(m[1], 10) : 0;
  return (n >= 8 && n <= 16) ? n : 8;
}
function parseRolls(text) {
  var t = String(text || '');
  var mr = t.match(/(?:Re-?rolls?|Rerfols?|Rer[o0]lls?|循环次数?|循环)\s*[：:]?\s*(\d+)/i);
  if (mr) return parseInt(mr[1], 10) || 10;
  var mr2 = t.match(/\bRe[a-z]{0,7}\s*[：:]\s*(\d+)/i);
  if (mr2) return parseInt(mr2[1], 10) || 10;
  var mk = t.match(/(?:Ranks?|Rolls?)\s*[：:]?\s*(\d+)/i);
  if (mk) return parseInt(mk[1], 10) || 10;
  var mo = t.match(/(?<![A-Za-z0-9])[Oo〇○]\s*[：:]?\s*(\d+)\b/);
  if (mo) return parseInt(mo[1], 10) || 10;
  var m = t.match(/\d+/);
  if (!m || m[0].length < 2) return 10;
  if (m[0].length >= 3) return parseInt(m[0].slice(1), 10) || 10;   // 首位疑似图标误读（9271271）
  return parseInt(m[0], 10);                                        // 2 位：真循环数，不去首位
}
function nameRowHit(r) {
  var cn = (String((r && r.text) || '').match(/[\u4e00-\u9fff&·・]+/g) || []).join('');
  if (!cn) return 0;
  return nameRowScore(cn);
}
function classifyRows(rows) {
  const H = currentImage.naturalHeight || currentImage.height;
  const cjkCount = s => (s.match(/[\u4e00-\u9fff]/g) || []).length;
  let duanIdx = rows.findIndex(r => RANK_LINE_RE.test(r.text));
  if (duanIdx < 0 && rows.length) {
    const yMax = rows.reduce((m, r) => Math.max(m, r.yc), 0);
    duanIdx = rows.findIndex(r => r.yc >= yMax * 0.86 && /位\s*\d{1,2}\s*$/.test(String(r.text || '')));
  }
  const main = duanIdx >= 0
    ? rows.slice(0, duanIdx)
    : rows.filter(r => r.yc <= H * 0.88);
  const mainS = main.slice().sort(function (a, b) { return a.yc - b.yc; });
  const hasNum = t => /\d/.test(String(t || ''));
  const isStatRow = t => hasNum(t)
    || /[%％×✕⨯±<>]/.test(String(t || ''))
    || /[+\-−–—‐‑﹣xX*]\s*\d/.test(String(t || ''));
  const noNumCjk = r => !hasNum(r.text) && cjkCount(r.text) >= 2;
  let nameRow = null;
  for (const r of mainS) { if (nameRowHit(r) > 0) { nameRow = r; break; } }
  if (!nameRow) {
    const nl0 = mainS.filter(noNumCjk);
    for (var _i = 0; _i + 1 < nl0.length; _i++) {
      var _j2 = { text: nl0[_i].text + nl0[_i + 1].text, yc: nl0[_i].yc, h: nl0[_i].h };
      if (nameRowHit(_j2) > 0) { nameRow = _j2; break; }
    }
    if (!nameRow) {
      const nz = nl0.filter(r => r.zone === 'name');
      const pool = nz.length ? nz : nl0;
      nameRow = pool.slice().sort(function (a, b) { return (b.h || 0) - (a.h || 0); })[0] || null;
    }
  }
  const _ni = nameRow ? mainS.indexOf(nameRow) : -1;
  let affixNameRow = null;
  if (_ni >= 0) {
    for (var _k = _ni + 1; _k < mainS.length; _k++) {
      if (noNumCjk(mainS[_k])) { affixNameRow = mainS[_k]; break; }
    }
  }
  let levelRow = null;
  const _nmY = nameRow ? nameRow.yc : Infinity;
  const lvZone = mainS.filter(r => r.zone === 'level' && hasNum(r.text) && r.yc < _nmY);
  if (lvZone.length) levelRow = lvZone[0];
  else {
    let _bs = -1e9;
    for (const r of mainS) {
      if (!hasNum(r.text) || r.yc >= _nmY) continue;
      const t = String(r.text).trim();
      const n = (t.match(/\d{1,3}/g) || [])[0];
      const v = n === undefined ? -1 : +n;
      const dr = (t.match(/\d/g) || []).length / Math.max(t.length, 1);
      let sc = 0;
      if (v >= 10 && v <= 18) sc += 100;
      if (t.length <= 6) sc += 30;
      if (dr >= 0.5) sc += 20;
      sc -= r.yc / 1000;
      if (sc > _bs) { _bs = sc; levelRow = r; }
    }
  }
  const levelText = levelRow ? levelRow.text : '';
  const lastNameY = Math.max(nameRow ? nameRow.yc : -1, affixNameRow ? affixNameRow.yc : -1);
  const cut = lastNameY >= 0 ? lastNameY : (levelRow ? levelRow.yc : H * 0.45);
  const affixRows = mainS.filter(function (r) {
    if (r === nameRow || r === affixNameRow) return false;
    if (r.yc <= cut + 2) return false;
    return isStatRow(r.text) || cjkCount(r.text) >= 2;
  });
  let rollsIdx = duanIdx + 1;
  while (duanIdx >= 0 && rollsIdx < rows.length
         && (RANK_LINE_RE.test(String(rows[rollsIdx].text || '')) || !String(rows[rollsIdx].text || '').trim())) rollsIdx++;
  const mrRowTxt = duanIdx >= 0 ? String(rows[duanIdx].text || '') : '';
  let rollsText = (duanIdx >= 0 && rollsIdx < rows.length) ? rows[rollsIdx].text : '';
  if (!rollsText && (mrRowTxt.match(/\d+/g) || []).length >= 2) rollsText = mrRowTxt;
  return {
    levelText,
    mrText: mrRowTxt,
    rollsText: rollsText,
    nameText: nameRow ? nameRow.text : '',
    affixText: affixRows.map(r => r.text).join('\n'),
    affixY: affixRows.map(r => r.yc),
  };
}
function scanAllRows(rows) {
  var affixLines = [], nameLine = '', levelLine = '', bestWS = 0, lvBest = 0;
  for (var i = 0; i < (rows || []).length; i++) {
    var t = String((rows[i] && rows[i].text) || '').trim();
    if (!t) continue;
    var a = parseAffixes([t])[0];
    if (a) {
      var m = matchAffix(a.namePart);
      if (m && m.score >= 62) { affixLines.push({ text: t, y: (rows[i] && rows[i].yc) || 0 }); continue; }
    }
    if (/^\d{1,2}$/.test(t)) {
      var n = parseInt(t, 10);
      if (n >= 6 && n <= 18 && n > lvBest) { lvBest = n; levelLine = t; }
      continue;
    }
    if (/\d/.test(t)) continue;
    var p = parseName([t]);
    if (!p || !(p.cn || p.en)) continue;
    var rk = rankWeapon(p.cn, p.en);
    if (rk.length && rk[0].score >= 70 && rk[0].score > bestWS) { bestWS = rk[0].score; nameLine = t; }
  }
  return { affixLines: affixLines, nameLine: nameLine, levelLine: levelLine };
}
function globalOnly() {
  var f = currentImage && currentImage.__fit;
  return !f || f.mode === 'full' || f.mode === 'raw';
}
function mergeGlobalScan(c, rows) {
  var g = scanAllRows(rows || []);
  var have = [];
  var chave = (c.affixText ? String(c.affixText).split('\n') : []).filter(Boolean);
  var cy = (c.affixY ? c.affixY : []);
  for (var k = 0; k < chave.length; k++) have.push({ text: chave[k], y: (cy[k] != null ? cy[k] : 0) });
  for (var i = 0; i < g.affixLines.length; i++) {
    var t = g.affixLines[i], dup = false;
    for (var j = 0; j < have.length; j++) {
      if (have[j].text === t.text || norm(have[j].text) === norm(t.text) || simScore(norm(have[j].text), norm(t.text)) >= 78) { dup = true; break; }
    }
    if (!dup) have.push(t);
  }
  c.affixText = have.map(function (x) { return x.text; }).join('\n');
  c.affixY = have.map(function (x) { return x.y; });
  if (g.nameLine) {
    var wg = lineWeaponScore(g.nameLine), wc = c.nameText ? lineWeaponScore(c.nameText) : 0;
    if (!c.nameText || (wg > 0 && wg > wc)) c.nameText = g.nameLine;
  }
  if (!c.levelText && g.levelLine) c.levelText = g.levelLine;
  return c;
}
function mergeClassified(a, b) {
  var seen = [];
  function add(t, y) {
    t = String(t || '').trim();
    if (!t) return;
    for (var i = 0; i < seen.length; i++) {
      if (seen[i].text === t || norm(seen[i].text) === norm(t) || simScore(norm(seen[i].text), norm(t)) >= 78) return;
    }
    seen.push({ text: t, y: (y == null ? 0 : y) });
  }
  var aT = (a && a.affixText ? String(a.affixText).split('\n') : []);
  var aY = (a && a.affixY ? a.affixY : []);
  var bT = (b && b.affixText ? String(b.affixText).split('\n') : []);
  var bY = (b && b.affixY ? b.affixY : []);
  for (var i = 0; i < aT.length; i++) add(aT[i], aY[i]);
  for (var j = 0; j < bT.length; j++) add(bT[j], bY[j]);
  return {
    levelText: (a && a.levelText) || (b && b.levelText) || '',
    mrText: (a && a.mrText) || (b && b.mrText) || '',
    rollsText: (a && a.rollsText) || (b && b.rollsText) || '',
    nameText: (a && a.nameText) || (b && b.nameText) || '',
    affixText: seen.map(function (x) { return x.text; }).join('\n'),
    affixY: seen.map(function (x) { return x.y; })
  };
}
function classifyWithGlobal(rows) {
  if (globalOnly()) {
    var g = scanAllRows(rows);
    if (g.affixLines.length || g.nameLine)
      return { levelText: g.levelLine, mrText: '', rollsText: '', nameText: g.nameLine, affixText: g.affixLines.map(function (x) { return x.text; }).join('\n'), affixY: g.affixLines.map(function (x) { return x.y; }) };
  }
  return mergeGlobalScan(classifyRows(rows), rows);
}
function voteBest(values) {
  const vc = {};
  for (const v of values) if (v) vc[v] = (vc[v] || 0) + 1;
  const sorted = Object.entries(vc).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return { value: '', votes: 0, total: values.length, conflict: false };
  const tie = sorted.length > 1 && sorted[1][1] === sorted[0][1];
  return { value: sorted[0][0], votes: sorted[0][1], total: values.length, conflict: tie };
}
function sameWeaponName(a, b) {
  if (a.key === b.key) return true;
  if (a.en && b.en) {
    if (a.en === b.en) return true;
    if (Math.min(a.en.length, b.en.length) >= 4 && (a.en.includes(b.en) || b.en.includes(a.en))) return true;
  }
  if (a.cn && b.cn) {
    if (a.cn === b.cn) return true;
    if (Math.abs(a.cn.length - b.cn.length) <= 2 && (a.cn.includes(b.cn) || b.cn.includes(a.cn))) return true;
    if (Math.abs(a.cn.length - b.cn.length) <= 2 && simScore(a.cn, b.cn) >= 55) return true;
  }
  return false;
}
function buildConsensus(runs) {
  const lv = voteBest(runs.map(r => parseLevel(r.lines.level)));
  const repLevel = runs.find(r => parseLevel(r.lines.level) === lv.value);
  const nameReads = [];
  for (const r of runs) {
    const p = parseName(r.lines.name);
    const cn = norm(p.cn), en = norm(p.en);
    if (!cn && !en) continue;                     // 空读法不计票
    nameReads.push({ cn, en, key: cn + '|' + en, r });
  }
  const nameGroups = [];
  for (const rd of nameReads) {
    const g = nameGroups.find(gr => gr.some(x => sameWeaponName(x, rd)));
    if (g) g.push(rd); else nameGroups.push([rd]);
  }
  let nm = { value: '', votes: 0, total: nameReads.length, conflict: false };
  let repName = null;
  if (nameGroups.length) {
    const finalized = nameGroups.map(g => {
      const vc = {};
      for (const rd of g) vc[rd.key] = (vc[rd.key] || 0) + 1;
      const ranked = Object.entries(vc).sort((a, b) => b[1] - a[1]);
      const topN = ranked.filter(([, n]) => n === ranked[0][1]).map(([k]) => k);
      const tied = g.filter(rd => topN.includes(rd.key));
      const q = rd => (rd.cn ? 2 : 0) + (rd.en ? 2 : 0);
      const win = tied.reduce((a, b) => q(b) > q(a) ? b : a, tied[0]);
      return { win, votes: ranked[0][1], total: g.length, distinct: ranked.length };
    });
    finalized.sort((a, b) => b.total - a.total);   // 大组优先（真实名字的读法更多）；
    const f = finalized[0];
    nm = { value: f.win.key, votes: f.votes, total: f.total, conflict: f.distinct > 1 };
    repName = f.win.r;
  }
  const allObs = [];
  for (const r of runs) {
    for (const a of parseAffixes(r.lines.affix)) {
      if (norm(a.namePart)) allObs.push({ t: r.t, a });
    }
  }
  allObs.sort((x, y) => (x.a.y || 0) - (y.a.y || 0));
  const rowGroups = [];
  for (const o of allObs) {
    const last = rowGroups[rowGroups.length - 1];
    if (last && (o.a.y || 0) - last[0].a.y < 1.5) last.push(o);
    else rowGroups.push([o]);
  }
  let entries = rowGroups.map(list => finalizeAffixEntry(list));
  const merged = [];
  for (const e of entries) {
    let target = null;
    for (const o of merged) {
      const sameVal = e.sign === o.sign && Math.abs(+e.value - +o.value) < 0.15;
      const nearRow = sameVal && Math.abs((e.y || 0) - (o.y || 0)) < 1.5;
      if (nearRow || sameAffixName(norm(e.namePart), norm(o.namePart), sameVal)) { target = o; break; }
    }
    if (!target) { merged.push(e); continue; }
    target.obs.push(...e.obs);
    const f = finalizeAffixEntry(target.obs);
    target.namePart = f.namePart; target.raw = f.raw;
    target.sign = f.sign; target.value = f.value; target.isPct = f.isPct;
    target.votes = f.votes; target.conflict = f.conflict; target.y = f.y;
  }
  merged.sort((a, b) => (a.y || 0) - (b.y || 0));
  const rowText = rs => (rs || []).map(l => typeof l === 'string' ? l : (l.text || '')).join('\n');
  return {
    level: lv, name: nm,
    levelRaw: repLevel ? rowText(repLevel.lines.level) : '',
    nameRaw: repName ? rowText(repName.lines.name) : '',
    affixes: merged, runs,
  };
}
function finalizeAffixEntry(list) {
  const uniqT = xs => new Set(xs.map(x => x.t)).size;   // 涉及的不同阈值数=真实票数
  const clusters = [];
  for (const x of list) {
    const v = +x.a.value;
    let c = clusters.find(cl => Math.abs(cl.v - v) < 0.15);
    if (!c) { c = { v, items: [] }; clusters.push(c); }
    c.items.push(x);
  }
  clusters.sort((a, b) => {
    const boost = cl => {
      const np = cl.items.filter(x => x.a.isPct).length;
      if (!np && cl.items.every(x => lockIconMisread(x.a))) return 0.5;
      return np >= cl.items.length / 2 ? 2 : 1;
    };
    const d = uniqT(b.items) * boost(b) - uniqT(a.items) * boost(a);
    if (d) return d;
    const pa = a.items.filter(x => x.a.isPct).length / a.items.length;
    const pb = b.items.filter(x => x.a.isPct).length / b.items.length;
    return pb - pa;
  });
  const win = clusters[0];
  const byT = new Map();
  for (const x of win.items) if (!byT.has(x.t)) byT.set(x.t, x);
  const uniq = [...byT.values()];
  const pctVotes = uniq.filter(x => x.a.isPct).length;
  const isPct = pctVotes >= uniq.length / 2;
  const vc = {};
  for (const x of uniq) vc[x.a.value] = (vc[x.a.value] || 0) + 1;
  const ranked = Object.entries(vc).sort((a, b) => a[0].length - b[0].length || b[1] - a[1]);
  const rep = uniq.find(x => x.a.value === ranked[0][0]) || uniq[0];
  let namePart = rep.a.namePart, ns = -1;
  for (const x of uniq) {
    const m = matchAffix(x.a.namePart);
    const s = m ? m.score : 0;
    if (s > ns || (s === ns && s > 0 && x.a.namePart.length < namePart.length)) { ns = s; namePart = x.a.namePart; }
  }
  const conflict = clusters.length > 1 && (uniqT(clusters[1].items) >= uniqT(win.items));
  const ys = list.map(x => x.a.y).filter(v => v != null);
  return { obs: list, namePart, raw: rep.a.raw, sign: rep.a.sign, value: ranked[0][0], isPct, votes: uniqT(win.items), conflict, y: ys.length ? Math.min(...ys) : 0 };
}
function affixExact(name) {
  const t = norm(name);
  return !!t && AFFIX_TABLE.some(r => String(r.cn).split(/\s*\/\s*/).some(a => norm(a) === t));
}
function sameAffixName(na, nb, sameVal) {
  if (!na || !nb) return false;
  if (na === nb) return true;
  const diff = Math.abs(na.length - nb.length);
  const longer = na.length >= nb.length ? na : nb;
  const shorter = na.length >= nb.length ? nb : na;
  if (na.includes(nb) || nb.includes(na)) {
    if (diff <= 1) return true;
    if (diff <= 2 && longer.startsWith(shorter)) return true;              // 噪声在尾部
    if (diff <= 2 && sameVal && longer.endsWith(shorter) && !affixExact(shorter)) return true;   // 头部残片
    return false;                                                          // 包含但形态不符（暴击几率/弱点暴击几率 差 2 字头部）
  }
  if (diff <= 2 && sameVal && longer.endsWith(shorter) && !affixExact(shorter)) return true;   // 头部被截断
  const sim = simScore(na, nb);
  if (sim >= 55 && diff <= 2) return true;   // 同长错字
  const lcs = lcsLen(na, nb);
  return sameVal && lcs >= 3 && (na.length + nb.length - 2 * lcs) <= 3;
}
function lcsLen(a, b) {
  let best = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      let k = 0;
      while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) k++;
      if (k > best) best = k;
    }
  }
  return best;
}
function norm(s) {
  return String(s == null ? '' : s).normalize('NFKC').toLowerCase()   // NFKC：全角数字/字母/％ 统一成半角
    .replace(/[\s·・.。,，:：;；'’"“”()（）\[\]【】\-—_/\\|!！?？]/g, '')
    .replace(/的/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '');
}
function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({length: n+1}, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j-1] + 1, prev[j-1] + (a[i-1] === b[j-1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}
function simScore(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 100;
  const la = a.length, lb = b.length;
  if (Math.min(la, lb) >= 2 && (a.includes(b) || b.includes(a))) return 95 - Math.abs(la - lb);
  return Math.round(100 * (1 - lev(a, b) / Math.max(la, lb)));
}
function levConf(a, b, pool) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const sub = confusable(a[i - 1], b[j - 1], pool) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + sub);
    }
    prev = cur;
  }
  return prev[n];
}
function simScoreConf(a, b, pool) {
  if (!a || !b) return 0;
  if (a === b) return 100;
  const la = a.length, lb = b.length;
  if (Math.min(la, lb) >= 2 && (a.includes(b) || b.includes(a))) return 95 - Math.abs(la - lb);
  return Math.round(100 * (1 - levConf(a, b, pool) / Math.max(la, lb)));
}
function pickBest(ranked) {
  if (!ranked.length) return null;
  const best = ranked[0];
  const second = ranked[1];
  const ambiguous = best.score < 100 && !!second && second.score >= 62 && best.score - second.score < 9;
  return { ...best, ranked, ambiguous, candidates: ranked.slice(0, 3) };
}
function colAliases(v) { return String(v == null ? '' : v).split(/\s*\/\s*/).filter(Boolean); }
function rankAffix(name) {
  const n = norm(name);
  if (!n) return [];
  const build = (key, cnOnly) => {
    const aliasCn = AFFIX_ALIAS[key] || null;   // 简写命中：对应行直接满分，避免歧义误报
    const suffix = AFFIX_SUFFIXES.find(s => key.length > s.length + 1 && key.endsWith(s));
    const scored = [];
    for (const row of AFFIX_TABLE) {
      let bestCol = null, bestS = 0, bestAlias = null, endsSuffix = false;
      if (aliasCn && norm(row.cn) === norm(aliasCn)) { bestS = 100; bestCol = 'cn'; bestAlias = row.cn; }
      for (const [col, raw] of [['cn', row.cn], ['intl', row.intl], ['en', row.en], ['cn', row.wmCn], ['en', row.wmEn]]) {
        if (cnOnly && col === 'en') continue;
        const _aliasPool = col === 'en' ? colAliases(raw).concat(affixEnAliases(raw)) : colAliases(raw);
        for (const alias of _aliasPool) {
          const t = norm(alias);
          if (!t) continue;
          let s = Math.max(simScore(key, t), simScoreConf(key, t, 'affix'));   // 接上字形相近容错
          if (col !== 'en' && t.includes(key) && key.length >= 2 && key !== t) s = Math.max(s, 88 - (t.length - key.length));
          if (col !== 'en' && suffix && t.endsWith(suffix)) endsSuffix = true;
          if (s > bestS) { bestS = s; bestCol = col; bestAlias = alias; }
        }
      }
      if (bestS > 0) scored.push({ row, score: Math.min(100, bestS), col: bestCol, alias: bestAlias, endsSuffix });
    }
    scored.sort((a, b) => b.score - a.score);
    if (suffix) {
      const pool = scored.filter(x => x.endsSuffix && x.score >= 62);
      if (pool.length) return pool;   // 同后缀候选池优先
    }
    return scored;
  };
  const scored = build(n, false);
  const stripped = n.replace(/^[aoqe]{1,2}/, '').replace(/[aoqe]{1,2}$/, '');
  if (stripped !== n && stripped.length >= 2) {
    const alt = build(stripped, true);
    if (alt.length) {
      const top = alt[0], second = alt[1];
      if (top.score >= 62 && (!second || top.score - second.score >= 9)) return alt;
    }
  }
  return scored;
}
function affixDisplayName(m) {
  if (!m) return '';
  if (m.col === 'cn' && m.alias && /[\u4e00-\u9fff]/.test(m.alias)) return m.alias;
  return m.row.cn;
}
function matchAffix(name) {
  var fr = factionRowOf(name);
  if (fr) {
    var frow = null;
    for (var i = 0; i < AFFIX_TABLE.length; i++) if (AFFIX_TABLE[i].drow === fr) { frow = AFFIX_TABLE[i]; break; }
    if (frow) return { row: frow, score: 92, col: 'intl', alias: frow.intl || frow.cn,
                       ambiguous: false, candidates: [{ row: frow, score: 92 }] };
  }
  const best = pickBest(rankAffix(name));
  return best && best.score >= 45 ? best : null;
}
function commonChars(a, b) {
  const sb = [...b], used = new Array(sb.length).fill(false);
  let c = 0;
  for (const ch of a) {
    const i = sb.indexOf(ch);
    if (i >= 0 && !used[i]) { used[i] = true; c++; }
  }
  return c;
}
function latinTokens(raw) {
  return String(raw == null ? '' : raw).normalize('NFKC').toLowerCase()
    .split(/[^a-z0-9]+/).filter(Boolean);
}
function buildConfuse(groups) {
  var m = {};
  groups.forEach(function (g) {
    g.forEach(function (a) {
      (m[a] = m[a] || []).push.apply(m[a], g.filter(function (x) { return x !== a; }));
    });
  });
  return m;
}
var WEAPON_CONFUSE = buildConfuse([
  ['冰', '水', '永', '求'],
  ['凇', '松'],
  ['信', '言'],
  ['凤', '风'],
  ['刚', '钢'],
  ['女', '文'],
  ['魔', '订'],
  ['猎', '借'],
  ['天', '大'],
  ['穹', '弯'],
  ['匣', '甲', '便'],
  ['自', '目'],
  ['段', '没', '设'],
  ['舍', '害'],
  ['虐', '速'],
  ['于', '击'],
  ['寒', '暴'],
  ['座', '坐'],
  ['枪', '抢'],
  ['者', '老'],
  ['穹', '亨'],
  ['锤', '锂'],
  ['匣', '巨'],
  ['暴', '景'],
  ['滑', '清'],
  ['害', '吉'],
  ['围', '国'],
  ['腐', '房'],
  ['腐', '岛'],  // 对科腐者对科岛者
  ['达', '这'],
  ['克', '兑'],
  ['拉', '啦'],
  ['双', '又'],
  ['之', '乏'],
  ['爪', '抓'],
  ['三', '王'],
  ['叉', '义'],
  ['叶', '叫'],
  ['坚', '竖'],
  ['韧', '仞'],
  ['宝', '室'],
  ['聚', '娶'],
  ['丝', '系'],
  ['蛛', '珠'],
  ['皇', '白'],
  ['丧', '哀'],
  ['钟', '种'],
  ['乌', '鸟'],
  ['尔', '你'],
  ['什', '件'],
  ['长', '张'],
  ['伊', '尹'],
  ['格', '络'],
  ['尼', '呢'],
  ['斯', '期'],
  ['伯', '佰'],
  ['顿', '钝'],
  ['佐', '左'],
  ['伦', '论'],
  ['斧', '爷'],
  ['使', '吏'],
  ['侍', '待'],
  ['侦', '慎'],
  ['察', '查'],
  ['信', '倍'],
  ['条', '冬'],
  ['客', '容'],
  ['派', '瓜'],
  ['枢', '抠'],
  ['密', '蜜'],
  ['高', '京'],
  ['纵', '从'],
  ['横', '黄'],
  ['莉', '黎'],
  ['议', '仪'],
  ['光', '先'],
  ['切', '刍'],
  ['割', '害'],
  ['器', '哭'],
  ['洛', '落'],
  ['诺', '偌'],
  ['鲁', '兽'],
  ['古', '占'],
  ['兰', '蓝'],
  ['卡', '卞'],
  ['关', '闭'],
  ['军', '晕'],
  ['扇', '扁'],
  ['冷', '令'],
  ['冻', '东'],
  ['步', '止'],
  ['凝', '疑'],
  ['副', '付'],
  ['手', '乎'],
  ['殁', '没'],
  ['旋', '游'],
  ['将', '奖'],
  ['特', '持'],
  ['瑞', '端'],
  ['分', '公'],
  ['离', '寓'],
  ['斩', '崭'],
  ['伤', '杨'],
  ['主', '王'],
  ['近', '进'],
  ['战', '站'],
  ['吸', '及'],
  ['西', '酉'],
  ['加', '如'],
  ['扎', '礼'],
  ['勒', '靳'],
  ['反', '返'],
  ['曲', '由'],
  ['寇', '冠'],
  ['微', '徽'],
  ['波', '坡'],
  ['塔', '搭'],
  ['海', '每'],
  ['巨', '臣'],
  ['妖', '姚'],
  ['帕', '怕'],
  ['压', '庄'],
  ['德', '得'],
  ['原', '厚'],
  ['子', '孑'],
  ['矿', '旷'],
  ['融', '隔'],
  ['炮', '泡'],
  ['头', '买'],
  ['蛇', '她'],
  ['恩', '思'],
  ['霰', '散'],
  ['小', '少'],
  ['灵', '零'],
  ['巴', '巳'],
  ['罗', '维'],
  ['迦', '伽'],
  ['葛', '褐'],
  ['蝰', '奎'],
  ['短', '矮'],
  ['柄', '柯'],
  ['镰', '廉'],
  ['簧', '黄'],
  ['管', '官'],
  ['棍', '混'],
  ['雄', '准'],
  ['史', '吏'],
  ['托', '拖'],
  ['成', '戊'],
  ['燃', '然'],
  ['气', '乞'],
  ['咀', '且'],
  ['嚼', '爵'],
  ['金', '全'],
  ['杖', '仗'],
  ['谐', '偕'],
  ['玛', '吗'],
  ['腕', '婉'],
  ['甲', '申'],
  ['哈', '蛤'],
  ['武', '戍'],
  ['响', '向'],
  ['胆', '但'],
  ['啐', '卒'],
  ['沫', '未'],
  ['锤', '垂'],
  ['锁', '销'],
  ['噬', '蚕'],
  ['菌', '困'],
  ['圣', '盛'],
  ['英', '央'],
  ['悦', '说'],
  ['音', '意'],
  ['收', '牧'],
  ['杀', '末'],
  ['瓦', '凡'],
  ['雅', '推'],
  ['骨', '滑'],
  ['葬', '藏'],
  ['卢', '芦'],
  ['塞', '赛'],
  ['多', '夕'],
  ['墓', '慕'],
  ['指', '措'],
  ['姆', '母'],
  ['连', '链'],
  ['穿', '窗'],
  ['夜', '液'],
  ['语', '话'],
  ['久', '夕'],
  ['士', '土'],
  ['顶', '订'],
  ['薙', '稚'],
  ['星', '早'],
  ['始', '如'],
  ['夸', '跨'],
  ['兹', '滋'],
  ['魂', '魄'],
  ['死', '厂'],
  ['神', '伸'],
  ['奏', '秦'],
  ['奥', '澳'],
  ['震', '晨'],
  ['嫣', '婉'],
  ['红', '江'],
  ['潘', '翻'],
  ['孢', '包'],
  ['感', '敢'],
  ['染', '梁'],
  ['守', '宁'],
  ['望', '忘'],
  ['安', '案'],
  ['培', '赔'],
  ['壮', '状'],
  ['丸', '九'],
  ['热', '势'],
  ['能', '熊'],
  ['机', '几'],
  ['怨', '恕'],
  ['焦', '售'],
  ['尖', '尘'],
  ['幡', '翻'],
  ['电', '申'],
  ['锯', '据'],
  ['煞', '熬'],
  ['嵴', '脊'],
  ['椎', '谁'],
  ['鞭', '鞋'],
  ['穆', '睦'],
  ['腾', '藤'],
  ['布', '市'],
  ['莱', '来'],
  ['希', '稀'],
  ['芭', '琶'],
  ['幻', '幼'],
  ['库', '裤'],
  ['异', '弄'],
  ['变', '恋'],
  ['轻', '经'],
  ['弗', '佛'],
  ['弧', '孤'],
  ['探', '深'],
  ['弯', '湾'],
  ['影', '景'],
  ['征', '正'],
  ['服', '报'],
  ['榴', '溜'],
  ['循', '遁'],
  ['环', '坏'],
  ['昂', '仰'],
  ['心', '必'],
  ['急', '忽'],
  ['怯', '却'],
  ['薛', '孽'],
  ['恐', '耸'],
  ['惧', '具'],
  ['狼', '狠'],
  ['脓', '浓'],
  ['龙', '尤'],
  ['悲', '非'],
  ['戒', '或'],
  ['憎', '增'],
  ['恨', '很'],
  ['争', '挣'],
  ['鼓', '故'],
  ['执', '势'],
  ['法', '去'],
  ['扫', '妇'],
  ['除', '徐'],
  ['技', '枝'],
  ['巧', '考'],
  ['捕', '辅'],
  ['佩', '配'],
  ['救', '求'],
  ['赎', '读'],
  ['肉', '内'],
  ['迪', '笛'],
  ['朗', '郎'],
  ['方', '万'],
  ['位', '住'],
  ['角', '用'],
  ['飞', '非'],
  ['舟', '丹'],
  ['帆', '凡'],
  ['晚', '免'],
  ['祷', '涛'],
  ['普', '晋'],
  ['沃', '袄'],
  ['晴', '睛'],
  ['日', '曰'],
  ['伞', '命'],
  ['晶', '品'],
  ['放', '仿'],
  ['匕', '七'],
  ['首', '自'],
  ['乱', '刮'],
  ['面', '百'],
  ['狂', '逛'],
  ['极', '及'],
  ['速', '述'],
  ['磁', '滋'],
  ['楞', '棱'],
  ['次', '欢'],
  ['痃', '玄'],
  ['欧', '殴'],
  ['歌', '哥'],
  ['颂', '讼'],
  ['亡', '云'],
  ['毒', '每'],
  ['囊', '壤'],
  ['芽', '蚜'],
  ['纳', '呐'],
  ['氰', '青'],
  ['沙', '砂'],
  ['泰', '秦'],
  ['形', '刑'],
  ['瑟', '琴'],
  ['单', '早'],
  ['清', '请'],
  ['溶', '熔'],
  ['尊', '遵'],
  ['漫', '慢'],
  ['激', '缴'],
  ['点', '占'],
  ['发', '友'],
  ['敏', '悔'],
  ['灼', '酌'],
  ['蚀', '独'],
  ['体', '休'],
  ['烈', '列'],
  ['焰', '陷'],
  ['标', '际'],
  ['牝', '牡'],
  ['狮', '师'],
  ['狙', '阻'],
  ['击', '出'],
  ['豹', '豺'],
  ['鹰', '雁'],
  ['猛', '孟'],
  ['虎', '虐'],
  ['梵', '梦'],
  ['拳', '卷'],
  ['怪', '牡'],
  ['杰', '然'],
  ['流', '硫'],
  ['索', '系'],
  ['疆', '僵'],
  ['南', '内'],
  ['瘟', '温'],
  ['疫', '役'],
  ['家', '佳'],
  ['拐', '别'],
  ['盗', '监'],
  ['贼', '贱'],
  ['镐', '搞'],
  ['眼', '很'],
  ['镜', '境'],
  ['鹤', '鹳'],
  ['石', '右'],
  ['花', '华'],
  ['破', '坡'],
  ['损', '捐'],
  ['珽', '廷'],
  ['碎', '粹'],
  ['的', '白'],
  ['祸', '锅'],
  ['根', '跟'],
  ['科', '料'],
  ['基', '其'],
  ['林', '休'],
  ['空', '穴'],
  ['突', '穴'],
  ['触', '解'],
  ['等', '待'],
  ['终', '冬'],
  ['幕', '募'],
  ['低', '底'],
  ['绘', '会'],
  ['绝', '断'],
  ['路', '珞'],
  ['翁', '嗡'],
  ['翠', '卒'],
  ['雀', '崔'],
  ['脉', '泳'],
  ['纹', '文'],
  ['痘', '逗'],
  ['杜', '社'],
  ['艾', '义'],
  ['旺', '汪'],
  ['木', '本'],
  ['苍', '仓'],
  ['苏', '办'],
  ['苦', '若'],
  ['草', '早'],
  ['荒', '慌'],
  ['谬', '缪'],
  ['菲', '绯'],
  ['铭', '名'],
  ['蕈', '覃'],
  ['菇', '咕'],
  ['虫', '中'],
  ['蚂', '妈'],
  ['蟥', '黄'],
  ['昂', '品'],
  ['菈', '拉'],
  ['女', '如'],
  ['颚', '鄂'],
  ['蜓', '廷'],
  ['螺', '骡'],
  ['血', '皿'],
  ['肢', '支'],
  ['裸', '颗'],
  ['鳃', '腮'],
  ['视', '观'],
  ['觉', '学'],
  ['醒', '腥'],
  ['认', '让'],
  ['冲', '仲'],
  ['诡', '柜'],
  ['计', '记'],
  ['诸', '煮'],
  ['豪', '毫'],
  ['赘', '敖'],
  ['赤', '亦'],
  ['雷', '雪'],
  ['邪', '斜'],
  ['炎', '淡'],
  ['阳', '阴'],
  ['幽', '函'],
  ['俄', '饿'],
  ['超', '趋'],
  ['辐', '幅'],
  ['迅', '讯'],
  ['浆', '奖'],
  ['楼', '搂'],
  ['追', '迫'],
  ['送', '这'],
  ['通', '同'],
  ['拟', '似'],
  ['野', '予'],
  ['马', '鸟'],
  ['工', '王'],
  ['铁', '钱'],
  ['轨', '轴'],
  ['钩', '勾'],
  ['锋', '峰'],
  ['锐', '兑'],
  ['锡', '析'],
  ['闪', '闵'],
  ['劫', '动'],
  ['阿', '啊'],
  ['代', '伐'],
  ['附', '付'],
  ['陶', '淘'],
  ['瓷', '资'],
  ['鹿', '尘'],
  ['镖', '飘'],
  ['霆', '庭'],
  ['君', '群'],
  ['霜', '露'],
  ['冥', '明'],
  ['差', '着'],
  ['预', '项'],
  ['鸣', '鸟'],
  ['扬', '杨'],
  ['食', '饰'],
  ['人', '入'],
  ['魔', '磨'],
  ['砍', '坎'],
  ['驱', '躯'],
  ['骄', '娇'],
  ['傲', '熬'],
  ['骇', '孩'],
  ['敌', '改'],
  ['弹', '禅'],
  ['鲮', '棱'],
  ['鳄', '鄂'],
  ['鸵', '驼'],
  ['戟', '截'],
  ['麦', '表'],
  ['鸦', '鸭'],
  ['齐', '剂'],
  ['辰', '晨'],
  ['骑', '绮'],
  ['兵', '丘'],
  ['业', '亚']
]);
var AFFIX_CONFUSE = buildConfuse([
  ['冰', '水', '永', '求'],
  ['天', '大'],
  ['匣', '甲', '便'],
  ['自', '目'],
  ['段', '没', '设'],
  ['系', '素'],
  ['舍', '害'],
  ['药', '约'],
  ['虐', '速'],
  ['于', '击'],
  ['寒', '暴'],
  ['座', '坐'],
  ['枪', '抢'],
  ['害', '吉'],
  ['者', '老'],
  ['穹', '亨'],
  ['锤', '锂'],
  ['匣', '巨'],
  ['暴', '景'],
  ['滑', '清'],
  ['围', '国'],
  ['腐', '房'],
  ['腐', '岛'],
  ['伤', '份'],
  ['害', '宫'],
  ['基', '其'],
  ['础', '细'],
  ['近', '达'],
  ['战', '站'],
  ['暴', '泰'],
  ['击', '出'],
  ['几', '九'],
  ['率', '卒'],
  ['重', '里'],
  ['触', '解'],
  ['发', '友'],
  ['时', '付'],
  ['间', '问'],
  ['射', '躬'],
  ['速', '述'],
  ['弓', '引'],
  ['类', '迷'],
  ['武', '式'],
  ['度', '席'],
  ['冰', '冷'],
  ['冻', '冷'],
  ['毒', '责'],
  ['素', '索'],
  ['电', '申'],
  ['焰', '烙'],
  ['冲', '中'],
  ['切', '分'],
  ['割', '剖'],
  ['穿', '空'],
  ['刺', '利'],
  ['对', '讨'],
  ['科', '料'],
  ['普', '晋'],
  ['斯', '欺'],
  ['的', '钓'],
  ['克', '兄'],
  ['隆', '险'],
  ['尼', '呢'],
  ['异', '导'],
  ['变', '峦'],
  ['体', '休'],
  ['多', '名'],
  ['透', '迂'],
  ['弹', '掸'],
  ['匣', '医'],
  ['容', '客'],
  ['量', '熏'],
  ['最', '取'],
  ['大', '太'],
  ['值', '植'],
  ['装', '袋'],
  ['填', '慎'],
  ['投', '设'],
  ['物', '吻'],
  ['器', '哭'],
  ['后', '候'],
  ['力', '刀'],
  ['焦', '集'],
  ['初', '劫'],
  ['始', '妃'],
  ['连', '还'],
  ['持', '待'],
  ['续', '卖'],
  ['额', '领'],
  ['数', '敌'],
  ['概', '既'],
  ['不', '木'],
  ['得', '碍'],
  ['效', '校'],
  ['滑', '骨'],
  ['行', '衍'],
  ['决', '快'],
  ['范', '宛'],
  ['常', '堂'],
  ['状', '壮'],
  ['态', '奈'],
  ['气', '乞'],
  ['腐', '府'],
  ['蚀', '浊'],
  ['病', '痴'],
  ['辐', '福'],
  ['爆', '曝'],
  ['炸', '乍'],
  ['磁', '砒'],
  ['奥', '粤'],
  ['罗', '男'],
  ['金', '全'],
  ['者', '著'],
  ['炽', '织'],
  ['蛇', '它'],
  ['军', '挥'],
  ['弱', '羽'],
  ['点', '占'],
  ['起', '越'],
  ['准', '谁'],
  ['备', '各'],
  ['招', '抬'],
  ['架', '驾'],
  ['角', '用'],
  ['震', '晨'],
  ['地', '他'],
  ['业', '亚']
]);
var VARIANT_PREFIXES = (function () {
  var v = (window.ZKNAMES && ZKNAMES.variants) || [], a = [], i;
  for (i = 0; i < v.length; i++) {
    if (!v[i] || v[i].strip === false || !v[i].cn) continue;
    a.push(v[i].cn);
  }
  return a;
})();
function hasVar(name) { name = String(name || ''); for (var i = 0; i < VARIANT_PREFIXES.length; i++) if (name.indexOf(VARIANT_PREFIXES[i]) === 0) return 1; return 0; }
function confusable(a, b, pool) {
  if (a === b) return true;
  var map = (pool === 'weapon') ? WEAPON_CONFUSE : AFFIX_CONFUSE;
  var s = map[a];
  return !!(s && s.indexOf(b) >= 0);
}
function commonCharsConf(a, b, pool) {
  var sb = [...b], used = new Array(sb.length).fill(false);
  var c = 0;
  for (var ch of a) {
    for (var i = 0; i < sb.length; i++) {
      if (!used[i] && (sb[i] === ch || confusable(sb[i], ch, pool))) { used[i] = true; c++; break; }
    }
  }
  return c;
}
var PINYIN_MAP = {"三":"san","业":"ye","丝":"si","丧":"sang","丸":"wan","主":"zhu","久":"jiu","之":"zhi","乌":"wu","乱":"luan","争":"zheng","亚":"ya","亡":"wang","人":"ren","什":"shen","仓":"cang","代":"dai","伊":"yi","伞":"san","伤":"shang","伦":"lun","伯":"bo","位":"wei","低":"di","佐":"zuo","体":"ti","佩":"pei","使":"shi","侍":"shi","侦":"zhen","俄":"e","保":"bao","信":"xin","借":"jie","傲":"ao","光":"guang","克":"ke","兰":"lan","关":"guan","兵":"bing","典":"dian","兹":"zi","军":"jun","冥":"ming","冰":"bing","冲":"chong","冷":"leng","冻":"dong","净":"jing","凇":"song","凝":"ning","凤":"feng","凯":"kai","击":"ji","刀":"dao","刃":"ren","分":"fen","切":"qie","刚":"gang","创":"chuang","利":"li","制":"zhi","刺":"ci","剑":"jian","副":"fu","割":"ge","力":"li","加":"jia","努":"nu","劫":"jie","勇":"yong","勒":"lei","匕":"bi","化":"hua","北":"bei","单":"dan","南":"nan","卡":"ka","卢":"lu","压":"ya","原":"yuan","叉":"cha","双":"shuang","反":"fan","发":"fa","变":"bian","古":"gu","史":"shi","叶":"ye","合":"he","君":"jun","吸":"xi","咀":"ju","和":"he","咖":"ka","哈":"ha","响":"xiang","啐":"cui","喷":"pen","器":"qi","噬":"shi","嚼":"jue","囊":"nang","圣":"sheng","坏":"huai","坚":"jian","型":"xing","培":"pei","基":"ji","堤":"di","塔":"ta","塞":"sai","墓":"mu","墨":"mo","士":"shi","壮":"zhuang","声":"sheng","多":"duo","夜":"ye","大":"da","天":"tian","太":"tai","头":"tou","夸":"kua","夺":"duo","奇":"qi","奏":"zou","奥":"ao","女":"nv","妖":"yao","姆":"mu","始":"shi","威":"wei","娅":"ya","嫣":"yan","子":"zi","孢":"bao","守":"shou","安":"an","宝":"bao","客":"ke","家":"jia","寄":"ji","密":"mi","寇":"kou","寒":"han","察":"cha","对":"dui","导":"dao","射":"she","将":"jiang","尊":"zun","小":"xiao","尔":"er","尖":"jian","尸":"shi","尺":"chi","尼":"ni","屠":"tu","嵴":"ji","工":"gong","巧":"qiao","巨":"ju","差":"cha","巴":"ba","布":"bu","帆":"fan","希":"xi","帕":"pa","席":"xi","幕":"mu","幡":"fan","幻":"huan","幽":"you","库":"ku","度":"du","座":"zuo","异":"yi","弓":"gong","引":"yin","弗":"fu","弧":"hu","弩":"nu","弯":"wan","弹":"dan","形":"xing","影":"ying","征":"zheng","循":"xun","微":"wei","德":"de","心":"xin","怒":"nu","急":"ji","怨":"yuan","怪":"guai","怯":"qie","恐":"kong","恨":"hen","恩":"en","恶":"e","悦":"yue","悲":"bei","惧":"ju","惩":"cheng","感":"gan","愤":"fen","憎":"zeng","成":"cheng","戒":"jie","战":"zhan","戟":"ji","扇":"shan","手":"shou","扎":"zha","托":"tuo","执":"zhi","扫":"sao","扬":"yang","技":"ji","拉":"la","拐":"guai","拟":"ni","拳":"quan","指":"zhi","振":"zhen","捕":"bu","损":"sun","探":"tan","提":"ti","收":"shou","放":"fang","敌":"di","敏":"min","救":"jiu","文":"wen","斧":"fu","斩":"zhan","斯":"si","方":"fang","旋":"xuan","无":"wu","日":"ri","旺":"wang","昂":"ang","星":"xing","映":"ying","晚":"wan","普":"pu","晴":"qing","晶":"jing","智":"zhi","暗":"an","暮":"mu","暴":"bao","曲":"qu","月":"yue","服":"fu","朗":"lang","望":"wang","木":"mu","机":"ji","杀":"sha","杖":"zhang","杜":"du","束":"shu","条":"tiao","杰":"jie","松":"song","极":"ji","林":"lin","枢":"shu","枪":"qiang","枭":"xiao","枷":"jia","柄":"bing","柏":"bai","染":"ran","标":"biao","根":"gen","格":"ge","梵":"fan","棍":"gun","棘":"ji","棱":"leng","椎":"chui","楞":"leng","楼":"lou","榴":"liu","横":"heng","次":"ci","欧":"ou","歌":"ge","步":"bu","武":"wu","死":"si","殁":"mo","毒":"du","比":"bi","气":"qi","氩":"ya","氰":"qing","水":"shui","永":"yong","求":"qiu","沃":"wo","沙":"sha","沫":"mo","法":"fa","波":"bo","泰":"tai","洁":"jie","洛":"luo","派":"pai","流":"liu","浆":"jiang","浪":"lang","海":"hai","清":"qing","溶":"rong","漫":"man","潘":"pan","激":"ji","火":"huo","灭":"mie","灵":"ling","灼":"zhuo","炎":"yan","炮":"pao","点":"dian","烈":"lie","热":"re","焦":"jiao","焰":"yan","煞":"sha","燃":"ran","爆":"bao","爪":"zhao","牙":"ya","牝":"pin","特":"te","犸":"ma","狂":"kuang","狙":"ju","狮":"shi","狼":"lang","猎":"lie","猛":"meng","猪":"zhu","玛":"ma","环":"huan","玻":"bo","珀":"po","珽":"ting","瑞":"rui","瑟":"se","璃":"li","瓦":"wa","瓷":"ci","生":"sheng","用":"yong","甲":"jia","电":"dian","疆":"jiang","疫":"yi","痃":"xuan","病":"bing","痘":"dou","痛":"tong","瘟":"wen","的":"de","皇":"huang","盗":"dao","目":"mu","直":"zhi","盾":"dun","真":"zhen","眼":"yan","知":"zhi","短":"duan","石":"shi","矿":"kuang","砍":"kan","破":"po","碎":"sui","磁":"ci","神":"shen","祭":"ji","祷":"dao","祸":"huo","离":"li","科":"ke","穆":"mu","穹":"qiong","空":"kong","穿":"chuan","突":"tu","等":"deng","管":"guan","簧":"huang","米":"mi","精":"jing","索":"suo","红":"hong","纳":"na","纵":"zong","纹":"wen","终":"zhong","绘":"hui","绝":"jue","绯":"fei","罗":"luo","置":"zhi","翁":"weng","翠":"cui","者":"zhe","聚":"ju","肉":"rou","肢":"zhi","胆":"dan","背":"bei","胜":"sheng","能":"neng","脉":"mai","脓":"nong","腕":"wan","腾":"teng","舌":"she","舍":"she","舟":"zhou","艾":"ai","节":"jie","芙":"fu","芭":"ba","花":"hua","芽":"ya","苍":"cang","苏":"su","苦":"ku","英":"ying","茧":"jian","草":"cao","荒":"huang","莉":"li","莫":"mo","莱":"lai","莲":"lian","菇":"gu","菈":"la","菌":"jun","菲":"fei","萨":"sa","葛":"ge","葬":"zang","蕈":"xun","薇":"wei","薙":"ti","薛":"xue","虎":"hu","虫":"chong","蚀":"shi","蚂":"ma","蛇":"she","蛛":"zhu","蜓":"ting","蜻":"qing","蝰":"kui","融":"rong","螺":"luo","蟥":"huang","血":"xue","行":"xing","裂":"lie","装":"zhuang","裸":"luo","西":"xi","视":"shi","觉":"jue","角":"jiao","触":"chu","言":"yan","计":"ji","订":"ding","认":"ren","议":"yi","试":"shi","诡":"gui","语":"yu","诸":"zhu","诺":"nuo","谐":"xie","谢":"xie","谬":"miu","谱":"pu","豪":"hao","豹":"bao","贼":"zei","赎":"shu","赘":"zhui","赤":"chi","赫":"he","超":"chao","路":"lu","轨":"gui","轮":"lun","轻":"qing","辐":"fu","辰":"chen","达":"da","迅":"xun","近":"jin","连":"lian","迦":"jia","迪":"di","追":"zhui","送":"song","逐":"zhu","通":"tong","速":"su","遂":"sui","邪":"xie","醒":"xing","里":"li","重":"zhong","野":"ye","量":"liang","金":"jin","钉":"ding","钟":"zhong","钢":"gang","钩":"gou","铁":"tie","铭":"ming","锁":"suo","锋":"feng","锐":"rui","锡":"xi","锤":"chui","锯":"ju","镐":"gao","镖":"biao","镜":"jing","镰":"lian","长":"zhang","闪":"shan","阔":"kuo","阳":"yang","阿":"a","附":"fu","降":"jiang","除":"chu","陶":"tao","隆":"long","障":"zhang","隼":"sun","雀":"que","雄":"xiong","雅":"ya","集":"ji","雌":"ci","雷":"lei","霆":"ting","震":"zhen","霜":"shuang","霰":"xian","静":"jing","面":"mian","鞭":"bian","韧":"ren","音":"yin","顶":"ding","顿":"dun","颂":"song","预":"yu","颚":"e","风":"feng","飞":"fei","食":"shi","首":"shou","马":"ma","驱":"qu","骄":"jiao","骇":"hai","骑":"qi","骨":"gu","高":"gao","鬼":"gui","魂":"hun","魔":"mo","鱼":"yu","鲁":"lu","鲤":"li","鲨":"sha","鲮":"ling","鳃":"sai","鳄":"e","鸣":"ming","鸦":"ya","鸵":"tuo","鹤":"he","鹰":"ying","鹿":"lu","麦":"mai","黑":"hei","鼓":"gu","齐":"qi","龙":"long"};
function pyOf(s) {
  var out = [];
  for (var ch of String(s || '')) out.push(/[\u4e00-\u9fff]/.test(ch) ? (PINYIN_MAP[ch] || null) : null);
  return out;
}
function pyFrac(q, t) {
  var n = Math.max(q.length, t.length), m = 0, tot = 0;
  for (var i = 0; i < n; i++) {
    var a = q[i], b = t[i];
    if (a == null || b == null) continue;
    tot++; if (a === b) m++;
  }
  return tot ? m / tot : 0;
}
function pyScoreOf(q, t) {
  var f = pyFrac(pyOf(q), pyOf(t));
  if (f <= 0) return 0;
  var pq = pyOf(q), pt = pyOf(t);
  var sameLen = pq.length === pt.length && pq.length > 0;
  return sameLen ? Math.min(90, 60 + 30 * f) : Math.min(70, 45 + 20 * f);
}
var RIVEN_ROOT_LIST = null;
function latinIsRivenName(en) {
  const t = norm(en).replace(/[^a-z]/g, '');
  if (t.length < 3) return false;
  if (!RIVEN_ROOT_LIST) {
    RIVEN_ROOT_LIST = Object.keys(ROOT2ROWS).map(function (r) { return r.toLowerCase(); })
      .filter(function (r) { return r.length >= 3; })
      .sort(function (a, b) { return b.length - a.length; });
  }
  let i = 0, hit = 0;
  while (i < t.length) {
    let m = null;
    for (const r of RIVEN_ROOT_LIST) { if (t.startsWith(r, i)) { m = r; break; } }
    if (m) { hit += m.length; i += m.length; } else i++;
  }
  return hit >= 4 && hit >= t.length * 0.8;
}
function rankWeapon(cnPart, enPart) {
  const ncn = norm(cnPart), nen = norm(enPart || '');
  const scored = [];
  for (const row of WEAPON_TABLE) {
    let bestCol = null, bestS = 0;
    for (const [col, alias] of [['cn', row.cn], ['intl', row.intl]]) {
      const t = norm(alias);
      if (!t || !ncn) continue;
      let s = 0;
      if (ncn === t) s = 100;
      else if (Math.min(ncn.length, t.length) >= 2 && (ncn.includes(t) || t.includes(ncn))) s = 95 - Math.abs(ncn.length - t.length);
      if (s < 100) s = Math.max(s, simScore(ncn, t));
      const ccc = commonCharsConf(ncn, t, 'weapon');
      if (ccc >= 2 && ncn.length >= 2 && t.length >= 2) s = Math.max(s, Math.min(96, 64 + Math.round(36 * ccc / Math.max(ncn.length, t.length))));
      if (ncn.length === 1 && t.length >= 2 && (t.startsWith(ncn) || t.endsWith(ncn))) s = Math.max(s, 90);
      if (ncn.length === 2 && t.length === 2) {
        if (confusable(ncn[0], t[0], 'weapon') && confusable(ncn[1], t[1], 'weapon')) s = Math.max(s, 92);
        else if (confusable(ncn[0], t[0], 'weapon') || confusable(ncn[1], t[1], 'weapon')) s = Math.max(s, 85);
      }
      if (s < 90) s = Math.max(s, pyScoreOf(ncn, t));
      if (s > bestS) { bestS = s; bestCol = col; }
    }
    if (nen && nen.length >= 4 && !latinIsRivenName(nen)) {
      const t = norm(row.en);
      if (t) {
        let s = 0;
        const se = simScore(nen, t) - 5;
        if (se >= 80) s = se;
        else {
          const toks = latinTokens(enPart);
          if (toks.indexOf(t) >= 0 || (t.length >= 6 && nen.indexOf(t) === 0)) s = Math.max(s, Math.min(96, 84 + t.length));
        }
        if (s > bestS) { bestS = s; bestCol = 'en'; }
      }
    }
    if (bestS > 0) scored.push({ row, score: Math.min(100, bestS), col: bestCol });
  }
  scored.sort((a, b) =>
    b.score - a.score ||
    hasVar(a.row.cn) - hasVar(b.row.cn) ||
    Math.abs(a.row.cn.length - ncn.length) - Math.abs(b.row.cn.length - ncn.length) ||
    a.row.cn.length - b.row.cn.length);
  return scored;
}
function matchWeapon(cnPart, enPart) {
  const best = pickBest(rankWeapon(cnPart, enPart));
  return best && best.score >= 70 ? best : null;
}
function lineWeaponScore(text) {
  var cn = (String(text == null ? '' : text).match(/[\u4e00-\u9fff&·・]+/g) || []).join('');
  if (!cn) return 0;
  var rk = rankWeapon(cn, '');
  var best = (rk.length && rk[0].score >= 70) ? rk[0].score : 0;
  var cn2 = stripRivenAffixCores(cn);
  if (cn2 && cn2 !== cn) {
    var rk2 = rankWeapon(cn2, '');
    if (rk2.length && rk2[0].score >= 70 && rk2[0].score > best) best = rk2[0].score;
  }
  return best;
}
function normLines(lines) {
  return (lines || []).map((l, i) => typeof l === 'string' ? { text: l, y: i * 3 } : { text: (l && l.text) || '', y: (l && l.y) || 0 });
}
function parseLevel(lines) {
  const joined = normLines(lines).map(l => l.text).join(' ');
  const cands = joined.match(/\d{1,3}/g) || [];
  const expand = s => {
    const n = +s;
    if (n >= 10 && n <= 18) return [s];            // 直读容量
    if (n >= 5 && n <= 9) return [String(n * 2)];  // 个位 乘 2 容量
    const out = [];
    for (let k = Math.min(2, s.length - 1); k >= 1; k--) {
      const p = s.slice(0, k);
      const v = +p;
      if (v >= 10 && v <= 18) out.push(p);
    }
    return out;
  };
  const good = cands.flatMap(expand);
  if (good.length) return good[0];
  return cands.length ? cands[0] : null;
}
function pickNameLine(lines) {
  const affixLike = l => /^[+\-−–—‐‑﹣×xX✕⨯*±]?\s*\d/.test(l.trim());
  const cjk = s => (s.match(/[\u4e00-\u9fff]/g) || []).length;
  const latMax = s => (s.match(/[A-Za-z][A-Za-z\-']*/g) || []).reduce((a, m) => Math.max(a, m.length), 0);
  const cands = normLines(lines).filter(l => l.text && l.text.trim());
  if (!cands.length) return '';
  const score = l => {
    if (affixLike(l.text)) return 0;                              // 词条行
    const ws = lineWeaponScore(l.text);
    if (ws > 0) return 5000 + ws;
    const c = cjk(l.text), e = latMax(l.text);
    if (c >= 1 && e >= 3) {
      const pen = (c >= 2 && c <= 4) ? 0 : (c === 1 ? 30 : 20 + (c - 4) * 8);
      return 1000 + Math.min(e, 20) * 6 + c - pen;
    }
    if (c >= 2) return 500 + (c <= 4 ? c * 10 : 40 - (c - 4) * 8);         // 纯中文行（无英文名的武器）
    if (e >= 4) return 300 + Math.min(e, 12);                     // 纯英文行（中文没读出来）
    return c * 10 + e;                                            // 碎片
  };
  let best = '', bs = 0;
  for (const l of cands) { const s = score(l); if (s > bs) { bs = s; best = l.text; } }   // 严格大于：同分取靠上的
  return best;
}
var AFFIX_CORES = (function () {
  var s = new Set();
  for (var _i = 0; _i < STATS.length; _i++) {
    var _c = STATS[_i].core;
    if (_c && !/占位$/.test(_c)) s.add(_c);
  }
  return s;
})();
var AFFIX_CORE_RE = (function () {
  var reEsc = function (x) { return x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
  return new RegExp(Array.from(AFFIX_CORES)
    .sort(function (a, b) { return b.length - a.length; })
    .map(reEsc).join('|'), 'g');
})();
function nameRowScore(cn) {
  var s = String(cn || '').replace(/[·・‐‑‒–—―\s]/g, '');
  if (!s) return 0;
  var best = 0;
  for (var i = s.length; i >= 2; i--) {
    var wp = s.slice(0, i), af = s.slice(i);
    if (af) {
      var mt = af.match(AFFIX_CORE_RE) || [];
      var len = 0;
      for (var k = 0; k < mt.length; k++) len += mt[k].length;
      if (len !== af.length) continue;
    }
    var rk = rankWeapon(wp, '');
    if (!rk.length) continue;
    var sc = rk[0].score;
    var need = af ? 70 : 92;
    if (sc >= need && sc > best) best = sc;
  }
  return best;
}
function stripRivenAffixCores(cn) {
  if (!cn) return cn;
  var _fw = findWeapon(cn);
  if (!_fw) return cn;
  var _wm = _fw.match;
  var _rest = cn.split(_wm).join('');
  var _clean = _rest.replace(/[·・\s]/g, '');
  if (!_clean) return _wm;
  var _mt = _clean.match(AFFIX_CORE_RE) || [];
  var _len = _mt.reduce(function (a, s) { return a + s.length; }, 0);
  if (_len === _clean.length) return _wm;
  return cn;
}
function parseName(lines) {
  const stop = new Set(['段位', '没位', '设位', '精通段位']);
  const src = normLines(lines);
  const line = pickNameLine(lines);
  const cnRuns = line.match(/[\u4e00-\u9fff&·・]+/g) || [];
  const cnRaw = cnRuns.filter(r => !stop.has(r)).join('');
  const cnNoAffix = stripRivenAffixCores(cnRaw);
  const cnOut = WEAPON_CN_FIX[cnNoAffix] || cnNoAffix;
  let latTexts = [line];
  if (!cnRaw) {
    for (const l of src) {
      const t = (l.text || '').trim();
      if (!t || t === line || /\d/.test(t) || /[\u4e00-\u9fff]/.test(t)) continue;
      latTexts.push(t);
    }
  }
  const latRuns = [];
  for (const one of latTexts) {
    const rr = one.match(/[A-Za-z][A-Za-z\-']+(?:\s+[A-Za-z][A-Za-z\-']+)*/g) || [];
    for (const r of rr) latRuns.push(r);
  }
  const en = latRuns.filter(r => !/^(the|of|vs|M\s?R)$/i.test(r)).join(' ');
  return { cn: cnOut, en };
}
function mergeFragmentLines(lines) {
  const src = normLines(lines);
  const out = [];
  for (let i = 0; i < src.length; i++) {
    const l = src[i];
    const hasNum = /\d/.test(l.text), hasCjk = /[\u4e00-\u9fff]/.test(l.text);
    if (hasCjk && !hasNum) {
      let j = i + 1;
      while (j < src.length && /[\u4e00-\u9fff]/.test(src[j].text) && !/\d/.test(src[j].text)
             && src[j].text.length <= 20) j++;
      const tail = src[j];
      if (tail && /^[\u4e00-\u9fff]/.test(tail.text) && /\d/.test(tail.text)
          && /[\d%]\s*$/.test(tail.text) && tail.text.length <= 20) {
        out.push({ text: l.text + tail.text.trim(), y: l.y });
        i = j;                       // 跳过中间的名称片段与末尾续行
        continue;
      }
    }
    if (hasNum && !hasCjk && l.text.length <= 12) {
      const nxt = src[i + 1], prv = out[out.length - 1];
      if (nxt && /[\u4e00-\u9fff]/.test(nxt.text) && !/\d/.test(nxt.text) && nxt.text.length <= 15) { out.push({ text: l.text + nxt.text.trim(), y: l.y }); i++; continue; }
      if (prv && /[\u4e00-\u9fff]/.test(prv.text) && !/\d/.test(prv.text) && prv.text.length <= 15) { out[out.length - 1] = { text: l.text + prv.text, y: l.y }; continue; }
    }
    out.push(l);
  }
  return out;
}
function parseAffixes(lines) {
  const out = [];
  const seen = new Set();
  lines = mergeFragmentLines(lines);
  const take = (rawText, y, mt, nameTail) => {
    let sign = mt[1] || '';
    if (/^[xX*✕⨯]$/.test(sign)) sign = '×';
    else if (/^[−–—‐‑﹣]$/.test(sign)) sign = '-';
    let value = mt[2];
    const isPct = mt[3] === '%';
    let nameTail0 = nameTail
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
      .replace(/^[\s（(\[【]+/, '');
    let parenM = /[（(]([^）)\]]*)/.exec(nameTail0);
    let paren = parenM ? parenM[1].trim() : '';
    let catHint = /重击/.test(paren) ? 'melee' : (/弓/.test(paren) ? 'ranged' : '');
    let namePart = nameTail0
      .split(/[（(]/)[0]
      .replace(/[^\u4e00-\u9fffA-Za-z&\s]/g, '')
      .trim();
    if (/[\u4e00-\u9fff]/.test(namePart) && !(factionRowOf(namePart) || factionPatternOf(namePart)))
      namePart = namePart.replace(/[A-Za-z]+/g, '').replace(/\s+/g, ' ').trim();
    if (sign === '<' || sign === '>') sign = (factionRowOf(namePart) || factionPatternOf(namePart)) ? '×' : '-';
    if ((factionRowOf(namePart) || factionPatternOf(namePart)) && sign !== '×') {
      var __neg = (sign === '-');   /* 先记原始符号：−38% ×0.62，不许吞负号变 ×1.38 正面 */
      sign = '×'; var __f = +value; if (isPct) __f = __f / 100;
      if (__neg) __f = 1 - Math.abs(__f);
      else if (__f < 1) __f = __f + 1;
      value = String(__f);
    }   /* 派系：+0.45×1.45； */
    if (!/[\u4e00-\u9fff]/.test(namePart) && !matchAffix(namePart)) return;
    if (/^[\u4e00-\u9fff]$/.test(namePart) && !matchAffix(namePart)) return;
    if (!namePart) return;
    if (isPct) { const _sv = shrinkValue(value); if (typeof _sv === 'number') value = String(_sv); }
    const key = sign + value + isPct + namePart;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ raw: rawText, sign, value, isPct, namePart, y, catHint });
  };
  for (let l of lines) {
    l = { text: l.text, y: l.y };
    l.text = l.text.replace(/^[\s)|lI\]【】。、，．.,fF]+/, '');
    l.text = l.text.replace(/(\d)\s*\.\s*(\d)/g, '$1.$2');
    l.text = l.text.replace(/(\d)\s*,\s*(\d{1,3})(?!\d)/g, '$1.$2');
    l.text = l.text.replace(/(\d)\s*[0Oo]\s*\/\s*[0Oo](?=\s|$)/g, '$1%');
    l.text = l.text.replace(/(\d+\.\d+)\s*[0Oo]\s*(?=[\u4e00-\u9fffA-Za-z（(])/g, '$1%');
    l.text = l.text.replace(/%\s*(\d+)\s*(?=[\u4e00-\u9fffA-Za-z（(])/g, '%');
    if (RANK_LINE_RE.test(l.text)) continue;
    const re = /([+\-−–—‐‑﹣×xX✕⨯*±<>])?\s*(\d{1,4}(?:\.\d{1,3})?)\s*(%?)\s*(?=[\u4e00-\u9fffA-Za-z（(])/g;
    let m, last = null;
    const hits = [];
    while ((m = re.exec(l.text)) !== null) { last = m; hits.push({ mt: m, start: m.index, end: re.lastIndex }); }
    if (!last) {
      const nm = /^([\u4e00-\u9fffA-Za-z][\u4e00-\u9fffA-Za-z\s]*?)\s*([+\-−–—‐‑﹣×xX✕⨯*±])?\s*(\d{1,4}(?:\.\d{1,3})?)\s*(%?)\s*$/.exec(l.text);
      if (nm && /[\u4e00-\u9fff]/.test(nm[1])) take(l.text, l.y, [nm[0], nm[2], nm[3], nm[4]], nm[1]);
      continue;
    }
    const strong = hits.filter(h => h.mt[3] === '%');
    if (strong.length >= 2) {
      for (let k = 0; k < strong.length; k++) {
        const h = strong[k];
        take(l.text, (l.y || 0) + k * 2, h.mt, l.text.slice(h.end, k + 1 < strong.length ? strong[k + 1].start : l.text.length));
      }
      continue;
    }
    take(l.text, l.y, last, l.text.slice(last.index + last[0].length));
  }
  return out;
}
var _ftCandsCache = null;
function _ftCands() {
  if (_ftCandsCache) return _ftCandsCache;
  var cands = [], r, names, k, _al, _ai, s2, _sh, _rowSel, _sr, _nm;
  for (r = 0; r < AFFIX_TABLE.length; r++) {
    var row = AFFIX_TABLE[r];
    names = [row.cn];
    if (row.intl && row.intl !== row.cn) names.push(row.intl);
    if (row.en && row.en !== row.cn && row.en !== row.intl) {
      names.push(row.en);
      _al = affixEnAliases(row.en);
      for (_ai = 0; _ai < _al.length; _ai++) names.push(_al[_ai]);
    }
    if (row.wmCn && row.wmCn !== row.cn && row.wmCn !== row.intl) names.push(row.wmCn);
    if (row.wmEn && row.wmEn !== row.en) names.push(row.wmEn);
    for (k = 0; k < names.length; k++) {
      _nm = String(names[k] == null ? '' : names[k]).replace(/\s+/g, '');
      if (_nm.length >= 2) cands.push({ row: row.drow, nm: _nm.toLowerCase(), len: _nm.length });
    }
  }
  for (s2 = 0; s2 < SHORTHAND.length; s2++) {
    _sh = SHORTHAND[s2];
    if (!_sh.k || _sh.k.length < 2) continue;
    _rowSel = _sh.rows;
    for (_sr = 0; _sr < _rowSel.length; _sr++) {
      cands.push({ row: _rowSel[_sr].r, nm: _sh.k.toLowerCase(), len: _sh.k.length, sh: 1 });
    }
  }
  cands.sort(function (a, b) { return b.len - a.len; });
  _ftCandsCache = cands;
  return cands;
}
function _ftHits(s, cands, wcat) {
  var tL = s.toLowerCase(), hits = [], used = [], seen = {}, c, it, idx, guard, sp, row, over;
  for (c = 0; c < cands.length; c++) {
    it = cands[c];
    row = it.row;
    if (it.sh && /^(伤害|damage)$/i.test(it.nm)) row = (wcat === '近战') ? 3 : 2;
    if (seen[row]) continue;
    idx = tL.indexOf(it.nm); guard = 0;
    while (idx >= 0 && guard++ < 80) {
      over = false;
      for (sp = 0; sp < used.length; sp++) if (idx < used[sp].e && idx + it.len > used[sp].s) { over = true; break; }
      if (!over) break;
      idx = tL.indexOf(it.nm, idx + 1);
    }
    if (idx < 0) continue;
    seen[row] = 1;
    used.push({ s: idx, e: idx + it.len });
    hits.push({ row: row, name: it.nm, start: idx, end: idx + it.len });
  }
  hits.sort(function (a, b) { return a.start - b.start; });
  return hits;
}
function _ftNums(s) {
  var out = [], re = /[+\-−–—\u2010‑﹣×xX✕⨯*]?\s*\d{1,4}(?:\.\d{1,3})?%?/g, m, txt;
  while ((m = re.exec(s))) {
    txt = m[0];
    if (!/\d/.test(txt)) continue;
    out.push({ s: m.index, e: m.index + txt.length, txt: txt });
  }
  return out;
}
function parseFreeText(text) {
  if (!text || !String(text).trim()) return null;
  var rawT = String(text);
  var out = { weapon: null, affixes: [] };
  var fw = findWeapon(rawT.replace(/\s+/g, ''));
  var wm = fw ? fw.w : null;
  if (wm) out.weapon = { idx: WEAPONS.indexOf(wm), cn: wm.cn, intl: wm.intl, en: wm.en, cat: wm.cat };
  var wcat = wm ? wm.cat : null;
  var cands = _ftCands();
  var segs = rawT.split(/[\n\r\/|丨]+/);
  var usedRow = {}, si, hi, ni, s, hits, nums, Ht, hitOf, v, n0, d, lidx, ridx, bestL, bestR, pick;
  for (si = 0; si < segs.length; si++) {
    s = segs[si].replace(/\s+/g, '');
    if (!s) continue;
    hits = _ftHits(s, cands, wcat);
    if (!hits.length) continue;
    nums = _ftNums(s);
    hitOf = [];
    for (ni = 0; ni < nums.length; ni++) {
      n0 = nums[ni]; lidx = -1; ridx = -1; bestL = 99; bestR = 99;
      for (hi = 0; hi < hits.length; hi++) {
        if (hits[hi].end <= n0.s) {
          d = n0.s - hits[hi].end;
          if (d <= 2 && d < bestL) { bestL = d; lidx = hi; }
        } else if (hits[hi].start >= n0.e) {
          d = hits[hi].start - n0.e;
          if (d <= 2 && d < bestR) { bestR = d; ridx = hi; }
        }
      }
      pick = (lidx >= 0 && hitOf[lidx] === undefined) ? lidx : (ridx >= 0 ? ridx : lidx);
      if (pick < 0 || hitOf[pick] !== undefined) continue;
      hitOf[pick] = n0;
    }
    for (hi = 0; hi < hits.length; hi++) {
      Ht = hits[hi]; v = hitOf[hi];
      if (!v || usedRow[Ht.row]) continue;
      var _sel = v.txt;
      var isNeg = _sel.indexOf('-') >= 0 || /[−–—\u2010‑﹣]/.test(_sel);
      var isMul = /[×xX✕⨯*]/.test(_sel);
      var value = Math.abs(parseFloat(String(_sel).replace(/[^\d.]/g, '')));
      if (!isFinite(value)) continue;
      usedRow[Ht.row] = 1;
      out.affixes.push({ row: Ht.row, sign: isMul ? '×' : (isNeg ? '-' : '+'), value: value,
                         isPct: NON_PCT_ROWS.indexOf(Ht.row) < 0, namePart: Ht.name });
    }
  }
  var _em = extractMeta(rawT);
  if (_em && _em.rolls != null) out.rolls = _em.rolls;
  return (out.weapon || out.affixes.length) ? out : null;
}
function resFromFree(ft, engineUsed) {
  function std(row) { for (var i = 0; i < AFFIX_TABLE.length; i++) if (AFFIX_TABLE[i].drow === row) return AFFIX_TABLE[i].cn; return ''; }
  var affixes = [];
  for (var i = 0; i < ft.affixes.length; i++) {
    var a = ft.affixes[i], nm = std(a.row);
    affixes.push({ sign: a.sign, value: String(a.value), isPct: a.isPct, nameRaw: nm, name: nm, drow: a.row, ambiguous: false });
  }
  var w = ft.weapon;
  return {
    levelRaw: null,
    weapon: w ? { idx: w.idx, cn: w.cn, intl: w.intl, en: w.en, cat: w.cat, score: 100, ambiguous: !!(w.ambiguous), inferred: false } : null,
    weaponCats: [], weaponRaw: w ? { cn: w.cn, en: w.en } : { cn: '', en: '' },
    rivenGen: null, rivenName: (ft && ft.rivenName) || null, nameCheck: { ok: true },
    affixes: affixes, dropped: 0,
    engineUsed: engineUsed || 'onnx-free',
    conflicts: { level: null, name: null, affix: [] },
    ignored: (ft && ft.ignored) || [],
    rolls: (ft && ft.rolls != null) ? ft.rolls : null
  };
}
var WEAPON_ALIAS = {
    "八十木": "巴什穆",
    "吹风机": "寇恩热能枪",
    "大剑p": "迦伦提恩",
    "奶锤": "执法者",
    "姥爷弓": "太始弓",
    "小黑弓": "恐惧",
    "尿分叉": "导热聚焦枪",
    "尿壶": "原子矿融炮",
    "性病炮": "横痃重炮",
    "扫描锤": "赫利俄光锤",
    "杀妈刀": "心智之殁",
    "毒盘子": "裸鳃刃",
    "波动拳": "静电能量导引枪",
    "波波枪": "努寇微波枪",
    "烟花枪": "苏普拉",
    "猫刀": "米尔",
    "玻璃喷": "碎裂者",
    "疙瘩": "葛拉卡达",
    "盘子p": "战刃",
    "矿难锤": "西伯利亚冰锤",
    "肛塞": "旋刃飞刀",
    "菊花枪": "噬菌者",
    "葛炮": "葛拉特勒",
    "装逼刀": "侍刃",
    "钓鱼竿": "金工火神",
    "钱鞭": "勒克塔",
    "集团拐": "螺钉拐刃",
    "集团表": "咖玛腕甲枪",
    "马桶橛子": "席瓦&神盾",
    "80木": "巴什穆",
    "C喷": "弧电离子枪",
    "C矛": "铁晶磁轨炮",
    "C锤": "弧电振子锤",
    "C镰": "信条格里高利",
    "G矛": "燃焰标枪",
    "G鞭": "阿特拉克斯",
    "I炮": "横痃重炮",
    "I狙": "孢丝感染枪",
    "I矿枪": "异融量子枪",
    "I镰": "灼蚀变体镰",
    "I鞭": "嵴椎节鞭",
    "OP": "欧特鲁斯",
    "O炮": "奥堤克光子枪",
    "dklm": "多克拉姆",
    "klps": "瘟疫克里帕丝",
    "spf": "瑟普梵",
    "太阳神锤": "赫利俄光锤",
    "刻薄毒镖": "阿克里德",
    "毒手枪": "阿克里德",
    "爆裂生化炮": "托里德",
    "爆燃喷射器": "伊格尼斯",
    "喷火器": "伊格尼斯",
    "喷火枪": "伊格尼斯",
    "亡魂喷火器": "红莲伊格尼斯",
    "红莲爆燃喷射器": "红莲伊格尼斯",
    "奥基手持火箭炮": "食人女魔",
    "量子苏普拉": "苏普拉",
    "镇暴量子苏普拉": "苏普拉破坏者",
    "光谱手枪": "光谱切割器",
    "镇暴光谱手枪": "光谱切割器破坏者",
    "热能步枪": "通量步枪",
    "高压电棒": "普罗沃",
    "镇暴高压电棒": "普罗沃破坏者",
    "镇暴德拉": "德拉破坏者",
    "兰卡原能加速枪": "兰卡",
    "安普斯雷电": "安培克斯",
    "楞次复合弓": "楞次弓",
    "光能量子": "量子切割器",
    "镇暴光能量子": "量子切割器破坏者",
    "弧光等离子冲击枪": "弧电离子枪",
    "对流射线发生器": "导热聚焦枪",
    "绯红五芒星榴弹炮": "嫣红 潘塔",
    "五芒星榴弹炮": "潘塔",
    "铁磁式激光矛枪": "铁晶磁轨炮",
    "欧玛电击棍": "欧玛",
    "克莱斯卡": "直镐",
    "猎鹰回旋刃": "猎鹰轮",
    "弧光蓄电重锤": "弧电振子锤",
    "惩戒手刺": "奥比克斯",
    "工程支持联接体": "电能斩锯",
    "僵直电鞭": "勒克塔",
    "迪特隆": "德特昂",
    "双持锡斯特": "锡斯特双枪",
    "超声冲击枪": "超音波冲击枪",
    "循环式电浆手枪": "循环离子枪",
    "静电势能发射器": "静电能量导引枪",
    "将军手持短炮": "安格斯壮",
    "幽浮能量枪": "视使之触",
    "弧光探导手枪": "弧电探知者",
    "双子精灵": "双子小精灵",
    "泰特拉": "特拉",
    "棱晶泰特拉": "棱晶特拉",
    "镇暴奥堤克光子枪": "奥堤克光子枪破坏者",
    "镇暴冷冻光束步枪": "冷冻光束步枪破坏者",
    "信条·特使": "信条典客",
    "信条·议程": "信条集议",
    "信条·利维亚": "信条莉薇娅",
    "信条·螺旋": "信条斯派克斯",
    "信条·迪普洛斯": "信条纵横双枪",
    "信条·泰特拉": "信条特拉",
    "信条·热能步枪": "信条通量步枪",
    "信条·循环式电浆手枪": "信条循环离子枪",
    "信条·迪特隆": "信条德特昂",
    "信条·铁磁式激光矛枪": "信条铁晶磁轨炮",
    "信条·弧光等离子冲击枪": "信条弧电离子枪",
    "纷争能量枪": "武使之力",
    "手弩": "布里斯提卡",
    "尸体拖": "史提托双枪",
    "破剑": "破碎的战争之剑",
    "天顶": "天顶之星",
    "战争大剑": "战争之剑",
    "PP弓": "圣装帕里斯",
    "大舅弓": "大久和弓",
    "莲花狙": "狙击特昂破坏者",
    "红炸": "嫣红 潘塔",
    "鱼骨": "螺钉步枪",
    "鱼骨枪": "螺钉步枪",
    "泡泡枪": "努寇微波枪",
    "推推棒": "超音波冲击枪",
    "推推乐": "超音波冲击枪",
    "电棍": "普罗沃",
    "电拐": "欧玛",
    "菜刀": "斩肉双刀",
    "暴击鞭": "嵴椎节鞭",
    "刑罚绞索": "嵴椎节鞭",
    "偃月刀": "关刀",
    "矿枪": "量子切割器",
    "派亚脊刺": "食人鱼",
    "B刀": "圣装侍刃",
    "13刀": "圣装侍刃",
    "萌虎": "猛虎",
    "毒榴弹": "托里德",
    "大和炮": "大久和弓",
    "自杀星": "杀星",
    "音波枪": "超音波冲击枪",
    "老狙": "狙击特昂",
    "V狙": "守望者",
    "队长刀": "圣装达克拉",
    "碎剑": "破碎的战争之剑",
};
window.WEAPON_ALIAS = WEAPON_ALIAS;
function findWeapon(t) {
  var best = null, bl = 0, m = '', amb = false;
  var tl = String(t).toLowerCase();
  for (var wi = 0; wi < WEAPONS.length; wi++) {
    var wcn = WEAPONS[wi].cn;
    if (wcn && wcn.length >= 2 && t.indexOf(wcn) >= 0 && wcn.length > bl) { best = WEAPONS[wi]; bl = wcn.length; m = wcn; amb = false; }
    var _walt = [WEAPONS[wi].intl, WEAPONS[wi].en];
    for (var _a = 0; _a < _walt.length; _a++) {
      var _k = _walt[_a];
      if (!_k || _k.length < 2) continue;
      var _sq = _k.replace(/\s+/g, '').toLowerCase();
      if (tl.indexOf(_sq) >= 0 && _sq.length > bl) { best = WEAPONS[wi]; bl = _sq.length; m = _sq; amb = false; }
    }
  }
  for (var nick in WEAPON_ALIAS) {
    if (!Object.prototype.hasOwnProperty.call(WEAPON_ALIAS, nick) || nick.length <= bl) continue;
    var _ni = tl.indexOf(nick.toLowerCase());
    if (_ni < 0) continue;
    var cn2 = WEAPON_ALIAS[nick];
    for (var w2 = 0; w2 < WEAPONS.length; w2++) {
      if (WEAPONS[w2].cn === cn2) { best = WEAPONS[w2]; bl = nick.length; m = t.substr(_ni, nick.length); amb = false; break; }
    }
  }
  var bBest = null, bL = 0, bM = '', bPick = null, bCnt = 0;
  for (var bi = 0; bi < WEAPONS.length; bi++) {
    var bc = WEAPONS[bi].cn, bbase = bc ? bc.replace(/[（(][^）)]*[）)]/g, '').trim() : '';
    if (bbase && bbase.length >= 2 && t.indexOf(bbase) >= 0) {
      if (bbase.length > bL) { bL = bbase.length; bM = bbase; bCnt = 1; bPick = WEAPONS[bi]; }
      else if (bbase.length === bL && bL > 0) {
        bCnt++;
        if (!bPick) bPick = WEAPONS[bi];
        else if (WEAPONS[bi].var === '本体' && bPick.var !== '本体') bPick = WEAPONS[bi];
      }
    }
  }
  if (bL > bl) { best = bPick; bl = bL; m = bM; amb = bCnt > 1; }
  if (best) {
    var _mi2 = t.indexOf(m);
    if (_mi2 >= 0) {
      var _bch = _mi2 > 0 ? t[_mi2 - 1] : '';
      var _ach = _mi2 + m.length < t.length ? t[_mi2 + m.length] : '';
      var _sep = (_ach === '-' || _ach === '\u00b7' || _ach === '\u2022');
      if (_sep) return null;
    }
  }
  return best ? { w: best, match: m, ambiguous: amb } : null;
}
var ROOT2ROWS = (function () {
  var m = {};
  STATS.forEach(function (s) {
    if (s.pre) (m[s.pre] = m[s.pre] || []).push(s.row);
    if (s.suf) (m[s.suf] = m[s.suf] || []).push(s.row);
  });
  return m;
})();
var CORE2ROWS = (function () {
  var m = {};
  STATS.forEach(function (s) { if (s.core) (m[s.core] = m[s.core] || []).push(s.row); });
  return m;
})();
function resolveRootRow(cands, wm) {
  var pos = cands.filter(function (r) { return r !== 30; });   // 永负「概率不获得连击数」不参与紫卡命名
  if (pos.length === 1) return pos[0];
  var hasBase = pos.indexOf(2) >= 0, hasMelee = pos.indexOf(3) >= 0;
  if (hasBase && hasMelee) return (wm && wm.cat === '近战') ? 3 : 2;
  return pos.length ? pos[0] : cands[0];
}
function parseRivenName(name) {
  if (!name || !String(name).trim()) return null;
  var t = String(name).replace(/\s+/g, ' ').trim();
  var fw = findWeapon(t), wm = fw ? fw.w : null;
  var rest = fw ? t.split(fw.match).join(' ').trim() : t;
  if (!rest) return { weapon: wm, rows: [] };
  var roots = Object.keys(ROOT2ROWS).sort(function (a, b) { return b.length - a.length; });
  var rows = [], i = 0;
  while (i < rest.length) {
    var hit = null;
    for (var r = 0; r < roots.length; r++) {
      var rt = roots[r];
      if (rest.slice(i, i + rt.length).toLowerCase() === rt.toLowerCase()) { hit = rt; break; }
    }
    if (hit) { var row = resolveRootRow(ROOT2ROWS[hit], wm); if (row) rows.push(row); i += hit.length; }
    else i++;
  }
  var seen = {}, out = [];
  rows.forEach(function (r) { if (!seen[r]) { seen[r] = 1; out.push(r); } });
  if (!out.length) {
    var cores = Object.keys(CORE2ROWS).sort(function (a, b) { return b.length - a.length; });
    var j = 0;
    while (j < rest.length) {
      var chit = null;
      for (var c2 = 0; c2 < cores.length; c2++) {
        var ck = cores[c2];
        if (rest.slice(j, j + ck.length) === ck) { chit = ck; break; }
      }
      if (chit) { var cr = resolveRootRow(CORE2ROWS[chit], wm); if (cr && !seen[cr]) { seen[cr] = 1; out.push(cr); } j += chit.length; }
      else j++;
    }
  }
  return { weapon: wm, rows: out };
}
var SHORTHAND = [
  { k: '双爆', rows: [{ r: 4, pos: true }, { r: 5, pos: true }] },
  { k: '负触发', rows: [{ r: 6, pos: false }] },
  { k: '爆伤', rows: [{ r: 5, pos: true }] },
  { k: '暴伤', rows: [{ r: 5, pos: true }] },
  { k: '暴击', rows: [{ r: 4, pos: true }] },
  { k: '负触率', rows: [{ r: 6, pos: false }] },
  { k: '负多重', rows: [{ r: 19, pos: false }] },
  { k: '负暴击', rows: [{ r: 4, pos: false }] },
  { k: 'i歧视', rows: [{ r: 18, pos: true }] },
  { k: 'g歧视', rows: [{ r: 17, pos: true }] },
  { k: 'c歧视', rows: [{ r: 16, pos: true }] },
  { k: 'o歧视', rows: [{ r: 42, pos: true }] },
  { k: '触时', rows: [{ r: 7, pos: true }] },
  { k: '触率', rows: [{ r: 6, pos: true }] },
  { k: '触发', rows: [{ r: 6, pos: true }] },
  { k: '多重', rows: [{ r: 19, pos: true }] },
  { k: '初始', rows: [{ r: 27, pos: true }] },
  { k: '弹匣', rows: [{ r: 21, pos: true }] },
  { k: '弹药', rows: [{ r: 22, pos: true }] },
  { k: '投射', rows: [{ r: 24, pos: true }] },
  { k: '装填', rows: [{ r: 23, pos: true }] },
  { k: '后坐', rows: [{ r: 25, pos: true, flip: true }] },
  { k: '重效', rows: [{ r: 31, pos: true }] },
  { k: '切割', rows: [{ r: 14, pos: true }] },
  { k: '病毒', rows: [{ r: 38, pos: true }] },
  { k: '伤害', rows: [{ r: 2, pos: true }] },
  { k: 'damage', rows: [{ r: 2, pos: true }] },
  { k: '范围', rows: [{ r: 34, pos: true }] },
  { k: '攻速', rows: [{ r: 8, pos: true }] },
  { k: '负爆', rows: [{ r: 5, pos: false }] },
  { k: '负多', rows: [{ r: 19, pos: false }] },
  { k: '负触', rows: [{ r: 6, pos: false }] },
  { k: '基', rows: [{ r: 2, pos: true }] },
  { k: '暴', rows: [{ r: 4, pos: true }] },
  { k: '爆', rows: [{ r: 5, pos: true }] },
  { k: '多', rows: [{ r: 19, pos: true }] },
  { k: '触', rows: [{ r: 6, pos: true }] },
  { k: '毒', rows: [{ r: 10, pos: true }] },
  { k: '冰', rows: [{ r: 9, pos: true }] },
  { k: '电', rows: [{ r: 11, pos: true }] },
  { k: '火', rows: [{ r: 12, pos: true }] },
  { k: '冲', rows: [{ r: 13, pos: true }] },
  { k: '穿', rows: [{ r: 15, pos: true }] },
  { k: '切', rows: [{ r: 14, pos: true }] },
  { k: '腐蚀', rows: [{ r: 37, pos: true }] },
  { k: '腐', rows: [{ r: 37, pos: true }] },
  { k: '毒气', rows: [{ r: 36, pos: true }] },
  { k: '辐射', rows: [{ r: 39, pos: true }] },
  { k: '爆炸', rows: [{ r: 40, pos: true }] },
  { k: '磁力', rows: [{ r: 41, pos: true }] },
  { k: '穿透', rows: [{ r: 20, pos: true }] },
  { k: '连击持续', rows: [{ r: 28, pos: true }] },
  { k: '处决', rows: [{ r: 33, pos: true }] },
  { k: '滑行', rows: [{ r: 32, pos: true }] },
  { k: '弹药效率', rows: [{ r: 47, pos: true }] },
  { k: '震地', rows: [{ r: 52, pos: true }] },
  { k: '收起', rows: [{ r: 48, pos: true }] },
  { k: '异常', rows: [{ r: 35, pos: true }] },
  { k: '重击伤害', rows: [{ r: 49, pos: true }] },
  { k: '爆率', rows: [{ r: 4, pos: true }] },
  { k: '暴击率', rows: [{ r: 4, pos: true }] },
  { k: '基伤', rows: [{ r: 2, pos: true }] },
  { k: '换弹', rows: [{ r: 23, pos: true }] },
  { k: '弹容', rows: [{ r: 21, pos: true }] },
  { k: '弹量', rows: [{ r: 21, pos: true }] },
  { k: '备弹', rows: [{ r: 22, pos: true }] },
  { k: '后座', rows: [{ r: 25, pos: true, flip: true }] },
  { k: '瞄准', rows: [{ r: 26, pos: true }] },
  { k: '弹速', rows: [{ r: 24, pos: true }] },
  { k: '飞行速度', rows: [{ r: 24, pos: true }] },
  { k: '重击', rows: [{ r: 49, pos: true }] },
  { k: '蓄力', rows: [{ r: 50, pos: true }] },
  { k: '初连', rows: [{ r: 27, pos: true }] },
  { k: '连击几率', rows: [{ r: 29, pos: true }] },
  { k: '额外连击', rows: [{ r: 29, pos: true }] },
  { k: '滑暴', rows: [{ r: 32, pos: true }] },
  { k: '弱点伤', rows: [{ r: 45, pos: true }] },
  { k: '弱点暴击', rows: [{ r: 46, pos: true }] },
  { k: '收枪装填', rows: [{ r: 48, pos: true }] },
  { k: '异况', rows: [{ r: 35, pos: true }] },
  { k: '招架', rows: [{ r: 51, pos: true }] },
  { k: '对G', rows: [{ r: 17, pos: true }] },
  { k: '对C', rows: [{ r: 16, pos: true }] },
  { k: '对I', rows: [{ r: 18, pos: true }] },
  { k: '对O', rows: [{ r: 42, pos: true }] },
  { k: 'G佬', rows: [{ r: 17, pos: true }] },
  { k: 'C佬', rows: [{ r: 16, pos: true }] },
  { k: 'I佬', rows: [{ r: 18, pos: true }] },
  { k: '克隆尼', rows: [{ r: 17, pos: true }] },
  { k: '科普斯', rows: [{ r: 16, pos: true }] },
  { k: '异变体', rows: [{ r: 18, pos: true }] },
  { k: '奥罗金', rows: [{ r: 42, pos: true }] }
].sort(function (a, b) { return b.k.length - a.k.length; });
var EN_ABBR = (function () {
  var m = {}, sk = (window.ZKNAMES && ZKNAMES.statKeys) || [];
  var st = (window.ZKDATA && window.ZKDATA.stats) || [];
  function put(a, cn) {
    if (!a || !cn) return;
    if (!/^[A-Za-z][A-Za-z .\-]*$/.test(a)) return;
    if (!m[a]) m[a] = cn;
  }
  sk.forEach(function (e) {
    if (!e || !e.cn) return;
    put(e.cn, e.cn);
    (e.alias || []).forEach(function (a) { put(a, e.cn); });
  });
  st.forEach(function (s2) {
    (s2.alias || []).forEach(function (a) { put(a, s2.cn); });
  });
  return m;
})();
var EN_ABBR_RE = (function () {
  var keys = Object.keys(EN_ABBR).sort(function (a, b) { return b.length - a.length; });
  var alt = keys.map(function (k) {
    return k.replace(/[.]/g, '\\.').replace(/\s+/g, '\\s*');
  }).join('|');
  return new RegExp('(^|[^A-Za-z])(' + alt + ')(?![A-Za-z])', 'gi');
})();
function expandEnAbbr(t) {
  return String(t).replace(EN_ABBR_RE, function (all, pre, key, off, str) {
    var up = String(key).replace(/\s+/g, ' ').toUpperCase();
    var cn = EN_ABBR[up];
    if (!cn) {
      var ks = Object.keys(EN_ABBR);
      for (var i = 0; i < ks.length; i++) if (ks[i].toUpperCase() === up) { cn = EN_ABBR[ks[i]]; break; }
    }
    if (!cn) return all;
    var sign = (pre === '-' || pre === '\u2212' || pre === '\u2013' || pre === '\u2014');
    if (!sign && !String(pre).trim()) {
      for (var b = off - 2; b >= 0 && off - b <= 3; b--) {
        var ch = str.charAt(b);
        if (ch === '-' || ch === '\u2212' || ch === '\u2013' || ch === '\u2014') { sign = true; break; }
        if (String(ch).trim()) break;
      }
    }
    return (sign ? ' 负' : pre) + ' ' + cn + ' ';
  });
}
var TRADE_RE = [
  /(\d+(?:\.\d+)?\s*[kKmM]?)\s*(?:p|P|白|白金|铂金)(?![A-Za-z])/g,   /* 1000p / 1.5k p */
  /(\d+(?:\.\d+)?\s*[kKmM])(?![%\d])/g,                               /* 1.5k（后面不是数字/百分号） */
  /\b(?:WTS|WTB|WTT|LF|PMO|PC|PM|OFFER|OFFERS|NEGOTIABLE)\b/gi,
  /\b(?:god\s*roll|groll|godly|trash\s*roll|junk)\b/gi,
  /(?:可刀|小刀|接刀|面交|私聊|详聊|打包|秒收|秒出|带走|包邮|价格私|报价)/g
];
function stripRivenNameTokens(t) {
  var s = String(t);
  s = s.replace(/[A-Za-z]{2,}-[A-Za-z]{2,}/g, ' ');                  /* 拉丁词根名 */
  var fw = findWeapon(s);
  var after = -1;
  if (fw) {
    var mi = s.indexOf(fw.match);
    if (mi >= 0) after = mi + String(fw.match).length;
  }
  s = s.replace(/[\u4e00-\u9fff]{2,4}(?:[-\u2013\u2014\u00b7\u2022][\u4e00-\u9fff]{2,4})+/g,
    function (m, off) {
      if (after >= 0 && off >= after && off <= after + 8) return ' ';
      return m;
    });
  return s;
}
function splitBlocks(t) {
  var NL = String.fromCharCode(10), CR = String.fromCharCode(13);
  var lines = String(t).split(NL);
  var out = [], cur = [];
  for (var i = 0; i < lines.length; i++) {
    var ln = lines[i];
    if (ln.charAt(ln.length - 1) === CR) ln = ln.slice(0, -1);
    if (!ln.trim()) {                                  /* 空行 = 分界 */
      if (cur.length) { out.push(cur.join(NL)); cur = []; }
      continue;
    }
    cur.push(ln);
  }
  if (cur.length) out.push(cur.join(NL));
  return out;
}
function textScoreOf(res) {
  if (!res) return -1e9;
  var n = (res.affixes || []).length;
  var s = Math.min(n, 4) * 10 + (res.weapon ? 6 : 0);
  if (n > 4) s -= (n - 4) * 20;
  if (!n) s -= 8;
  return s;
}
function labeledAffix(seg) {
  var best = null, bestLen = 0;
  for (var i = 0; i < AFFIX_TABLE.length; i++) {
    var row = AFFIX_TABLE[i], names = [row.cn];
    if (row.intl && row.intl !== row.cn) names.push(row.intl);
    if (row.en && row.en !== row.cn && row.en !== row.intl) {
      names.push(row.en);
      var _al = affixEnAliases(row.en);
      for (var _ai = 0; _ai < _al.length; _ai++) names.push(_al[_ai]);
    }
    for (var k = 0; k < names.length; k++) {
      var nm = names[k];
      if (!nm || nm.length < 2) continue;
      var idx = seg.indexOf(nm);
      if (idx >= 0 && nm.length > bestLen) { bestLen = nm.length; best = { row: row.drow, nm: nm, start: idx }; }
    }
  }
  if (!best) return null;
  var rest = seg.slice(best.start + best.nm.length);
  var m = /^\s*([+\-\u2212\u2013\u2014×xX*])\s*(\d[\d.,]*)\s*%?/.exec(rest);
  if (!m) return null;
  var value = parseFloat(m[2].replace(/,/g, ''));
  if (!isFinite(value)) return null;
  if (factionRowOf(best.nm) || factionPatternOf(best.nm)) {
    var _sv = m[1];
    var _fx = (_sv === '×' || _sv === 'x' || _sv === 'X' || _sv === '*') ? Math.abs(value) : Math.abs(value) + 1;
    return { row: best.row, sign: '×', value: _fx, isPct: false, namePart: best.nm };
  }
  var sign = (m[1] === '+' || m[1] === '+') ? '+' : '-';
  return { row: best.row, sign: sign, value: Math.abs(value),
           isPct: NON_PCT_ROWS.indexOf(best.row) < 0, namePart: best.nm };
}
function extractMeta(t) {
  var out = { t: String(t), mr: null, rank: null, rolls: null };
  if (/零\s*洗|没洗过|没洗|未洗过/.test(out.t)) { out.rolls = 0; out.t = out.t.replace(/零\s*洗|没洗过|没洗|未洗过/g, ' '); }
  var pats = [
    { re: /(?:精通段位|段位)\s*[：:]?\s*(\d+)/g, key: 'mr' },
    { re: /(?:Mod\s*等级|Mod等级|等级)\s*[：:]?\s*(\d+)/g, key: 'rank' },
    { re: /(?:循环次数|洗卡次数)\s*[：:]?\s*(\d+)/g, key: 'rolls' },
    { re: /洗了\s*(\d+)\s*次/g, key: 'rolls' },   /* 口语：洗了200次 循环 200 */
    { re: /(\d+)\s*洗/g, key: 'rolls' },           /* 口语：500洗 / 20洗 循环 500 / 20 */
    { re: /循环\s*[：:]?\s*(\d+)/g, key: 'rolls' },   /* 口语：循环：20 / 循环20 */
    { re: /Mr\.?\s*[：:]?\s*(\d+)/g, key: 'mr' },    /* 英文：Mr.9 */
    { re: /Ranks?\s*[：:]?\s*(\d+)/g, key: 'rank' },  /* 英文：Ranks:8 */
    { re: /Re-?rolls?\s*[：:]?\s*(\d+)/g, key: 'rolls' }, /* 英文：Re-rolls:47 */
    { re: /(?<![A-Za-z0-9])[Oo〇○]\s*[：:]?\s*(\d+)\b/g, key: 'rolls' },
    { re: /(?<![A-Za-z0-9])0(\d{2,})(?!\d)/g, key: 'rolls' }   /* OCR 循环图标被识别成数字0（019 19） */
  ];
  for (var i = 0; i < pats.length; i++) {
    var re = pats[i].re, key = pats[i].key;
    re.lastIndex = 0;
    var m;
    while ((m = re.exec(out.t))) {
      out[key] = +m[1];
      out.t = out.t.slice(0, m.index) + ' ' + out.t.slice(m.index + m[0].length);
      re.lastIndex = m.index;
    }
  }
  if (out.rolls == null) {
    var _cnmap = { '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
    var _fbase = 0, _fuzz = false;
    var _scanFz = function (_re, _mult) {
      _re.lastIndex = 0; var _m2;
      while ((_m2 = _re.exec(out.t))) {
        var _s2 = _m2[1], _n2 = 0;
        if (/^\d+$/.test(_s2)) _n2 = +_s2;
        else { for (var _c2 = 0; _c2 < _s2.length; _c2++) { var _cv2 = _cnmap[_s2[_c2]]; if (_cv2 == null) { _n2 = 0; break; } _n2 += _cv2; } }
        if (_n2 > 0) { _fbase = _n2 * _mult; _fuzz = !!(_m2[2]); }
      }
    };
    _scanFz(/(?:洗了|洗|重铸)?\s*([一二两三四五六七八九十\d]+)\s*百\s*(多|来|几|余)?\s*次?/g, 100);
    if (!_fbase) _scanFz(/(?:洗了|洗|重铸)?\s*([一二两三四五六七八九十\d]+)\s*千\s*(多|来|几|余)?\s*次?/g, 1000);
    if (!_fbase) _scanFz(/(?:洗了|洗|重铸)?\s*([一二两三四五六七八九十\d]+)\s*万\s*(多|来|几|余)?\s*次?/g, 10000);
    if (!_fbase) _scanFz(/(?:洗了|洗|重铸)?\s*(\d{1,4})\s*(?:多次|来次|几次|余次|多|来|几|余)\s*次?/g, 1);
    if (_fbase > 0) out.rolls = _fuzz ? (_fbase + Math.floor(Math.random() * 101)) : _fbase;
  }
  return out;
}
function extractPol(t) {
  if (/(?:18Y|18y|1BY|1by)/.test(t)) return 'madurai';   /* OCR：r槽 被识别成 18Y/1BY */
  if (/r槽|v槽/i.test(t)) return 'madurai';
  if (/18\s*[-－一]|18[-－一]/.test(t)) return 'naramon';   /* OCR 横槽图标被识别成 18- / 18一 Naramon */
  if (/一槽|横槽/.test(t)) return 'naramon';
  if (/三角槽|盾槽/.test(t)) return 'vazarin';
  if (/madurai/i.test(t)) return 'madurai';
  if (/naramon/i.test(t)) return 'naramon';
  if (/vazarin/i.test(t)) return 'vazarin';
  return null;
}
function handleLabeledSegment(out, label, seg) {
  seg = String(seg == null ? '' : seg).replace(/^\s*[：:]\s*|\s*[：:]\s*$/g, '').trim();
  if (/武器|weapon/i.test(label)) {
    var fw = findWeapon(seg.replace(/\s+/g, ''));
    if (fw && fw.w) out.weapon = { idx: WEAPONS.indexOf(fw.w), cn: fw.w.cn, intl: fw.w.intl, en: fw.w.en, cat: fw.w.cat };
  }
  else if (/精通段位|段位|mastery|\bMR\b/i.test(label)) { var m1 = /(\d+)/.exec(seg); if (m1) out.mr = +m1[1]; }
  else if (/循环次数|洗练次数|重铸次数|rerolls?/i.test(label)) { var m2 = /(\d+)/.exec(seg); if (m2) out.rolls = +m2[1]; }
  else if (/Mod\s*等级|等级|\bRank\b/i.test(label)) { var m3 = /(\d+)/.exec(seg); if (m3) out.rank = +m3[1]; }
  else if (/裂罅|riven\s*name/i.test(label)) { out.rivenName = seg; }
  else if (/极性|极化|polarity/i.test(label)) { out.pol = String(seg).replace(/[：:\s]/g, ''); }
  else if (/正面|负面|positive|negative/i.test(label)) {
    var af = labeledAffix(seg);
    if (af) {
      if (/负面|negative/i.test(label) && af.sign === '+' && af.isPct) af.sign = '-';
      out.affixes.push(af);
    }
  }
}
function parseLabeled(text) {
  var t = String(text).replace(/\u3000/g, ' ');
  var out = { weapon: null, affixes: [], mr: null, rolls: null, rank: null, rivenName: null };
  var re = /(武器名称|武器名|武器|紫卡名称|紫卡名|正面词条|负面词条|正面属性|负面属性|正词条|负词条|正面|负面|精通段位|段位|Mod\s*等级|等级|循环次数|洗练次数|重铸次数|裂罅\s*Mod\s*名称|裂罅[^：:]*名称|裂罅[^：:]*|极性|极化|Weapon\s*Name|Weapon|Positive|Negative|Riven\s*Name|Mastery\s*Rank|MR|Rerolls|Polarity|Rank)/gi;
  var m2, last = 0, curLabel = null;
  while ((m2 = re.exec(t))) {
    if (curLabel) handleLabeledSegment(out, curLabel, t.slice(last, m2.index));
    curLabel = m2[1]; last = m2.index + m2[0].length;
  }
  if (curLabel) handleLabeledSegment(out, curLabel, t.slice(last));
  return (out.weapon || out.affixes.length) ? out : null;
}
function parseShorthand(text) {
  if (!text) return null;
  var t = String(text).replace(/\s+/g, '');
  var fw = findWeapon(t);
  var wm = fw ? fw.w : null;
  var rest = fw ? t.split(fw.match).join('') : t;
  var AFFIX_NAMES = [];
  for (var ai = 0; ai < AFFIX_TABLE.length; ai++) {
    var at = AFFIX_TABLE[ai];
    if (at.cn && at.cn.length >= 2) AFFIX_NAMES.push({ r: at.drow, nm: at.cn.replace(/\s+/g, '') });
    if (at.intl && at.intl !== at.cn && at.intl.length >= 2) AFFIX_NAMES.push({ r: at.drow, nm: at.intl.replace(/\s+/g, '') });
    if (at.en && at.en !== at.cn && at.en.length >= 2) {
      var _enN = at.en.replace(/\s+/g, '');
      if (_enN.length >= 2) AFFIX_NAMES.push({ r: at.drow, nm: _enN });
      var _al2 = affixEnAliases(at.en);
      for (var _ai2 = 0; _ai2 < _al2.length; _ai2++) { var _alN = _al2[_ai2].replace(/\s+/g, ''); if (_alN.length >= 2) AFFIX_NAMES.push({ r: at.drow, nm: _alN }); }
    }
    var _wmP = [at.wmCn, at.wmEn];
    for (var _wi = 0; _wi < _wmP.length; _wi++) {
      var _wn = String(_wmP[_wi] || '').replace(/\s+/g, '');
      if (_wn.length >= 2) AFFIX_NAMES.push({ r: at.drow, nm: _wn });
    }
  }
  AFFIX_NAMES.sort(function (a, b) { return b.nm.length - a.nm.length; });
  var list = [], i = 0;
  while (i < rest.length) {
    var hit = null;
    for (var a2 = 0; a2 < AFFIX_NAMES.length; a2++) {
      if (rest.slice(i, i + AFFIX_NAMES[a2].nm.length) === AFFIX_NAMES[a2].nm) { hit = { k: AFFIX_NAMES[a2].nm, rows: [{ r: AFFIX_NAMES[a2].r, pos: true }] }; break; }
    }
    if (!hit) for (var s = 0; s < SHORTHAND.length; s++) { if (rest.slice(i, i + SHORTHAND[s].k.length) === SHORTHAND[s].k) { hit = SHORTHAND[s]; break; } }
    if (!hit) {
      var _cKeys = Object.keys(CORE2ROWS).sort(function (aa, bb) { return bb.length - aa.length; });
      for (var _z2 = 0; _z2 < _cKeys.length; _z2++) {
        var _kk = _cKeys[_z2];
        if (rest.slice(i, i + _kk.length) === _kk) { var _cr2 = resolveRootRow(CORE2ROWS[_kk], wm); if (_cr2) { hit = { k: _kk, rows: [{ r: _cr2, pos: true }] }; } break; }
      }
    }
    if (hit) {
      var _negNow = false;
      var _back = i - 1;
      while (_back >= 0 && /[\d.%\s]/.test(rest[_back])) _back--;
      if (_back >= 0 && (rest[_back] === '-' || rest[_back] === '\u2212' || rest[_back] === '\u2013' || rest[_back] === '负')) {
        var _nch = rest[_back + 1];
        if (rest[_back] === '负') _negNow = true;
        else if (!_nch || !/[A-Za-z\u4e00-\u9fff]/.test(_nch)) _negNow = true;
      }
      var _rowsD = hit.rows;
      if (hit.k === '伤害' || /^damage$/i.test(hit.k)) _rowsD = [{ r: (wm && wm.cat === '近战') ? 3 : 2, pos: true }];
      for (var q = 0; q < _rowsD.length; q++) list.push({ r: _rowsD[q].r, pos: _negNow ? false : _rowsD[q].pos });
      i += hit.k.length;
    } else i++;
  }
  if (!list.length) {
    var _pr = parseRivenName(t);
    if (_pr && _pr.rows.length) {
      var wm2 = _pr.weapon || wm;
      posN = Math.min(_pr.rows.length, 3); negN = 1;   /* 默认都带负面词条 */
      cat = wm2 ? wm2.cat : '步枪'; disp = wm2 ? wdisp(wm2) : DISP_ALL;
      var _aff = [];
      var _flCoef = [1.09, 1.05, 1.01];
      _pr.rows.slice(0, 3).forEach(function (r, idx) {
        var g = gen(r, true, (r === 25));
        if (g && g.value != null) {
          if (g.sign !== '×') g = { sign: g.sign, value: Math.round(g.value * _flCoef[idx] / 1.0998 * 10) / 10, isPct: g.isPct };
          _aff.push({ row: r, sign: g.sign, value: g.value, isPct: g.isPct, namePart: stdName(r) });
        }
      });
      var _mp = [2, 3, 9, 10, 11, 12, 27, 29], _rp = [9, 10, 11, 12, 20];
      var _posArr = (wm2 && wm2.cat === '近战') ? _mp : _rp;
      var _nr = 0;
      if (_posArr.indexOf(18) < 0 && isFinite(ocrBase(18, cat))) _nr = 18;
      for (var _z2 = 2; _z2 <= 52 && !_nr; _z2++) {
        if (_z2 === 30 || _z2 === 18) continue;
        if (_posArr.indexOf(_z2) >= 0) continue;
        if (!isFinite(ocrBase(_z2, cat))) continue;
        _nr = _z2; break;
      }
      if (_nr) {
        var _b = ocrBase(_nr, cat);
        var _negC = (posN >= 3) ? 0.75 : 0.495;      // 3正1负 / 2正1负 的负面修正系数
        var _v = _b * _negC * disp * ((8 + 1) / 9) * 0.9;   // 最低值(P.lo=0.9)
        _aff.push({ row: _nr, sign: (_nr === 25) ? '+' : '-',
          value: Math.round(Math.abs(_v) * 10) / 10, isPct: NON_PCT_ROWS.indexOf(_nr) < 0, namePart: stdName(_nr) });
      }
      if (_aff.length)
        return { weapon: wm2 ? { idx: WEAPONS.indexOf(wm2), cn: wm2.cn, intl: wm2.intl, en: wm2.en, cat: wm2.cat } : null, affixes: _aff, rivenName: String(text).trim() };
    }
  }
  if (!list.length && !wm) return null;
  var posRows = [], negRows = [], sp = {}, sn = {};
  for (var j = 0; j < list.length; j++) {
    var it = list[j];
    if (it.pos) { if (!sp[it.r] && posRows.length < 3) { sp[it.r] = 1; posRows.push({ r: it.r, flip: !!it.flip }); } }
    else { if (!sn[it.r] && negRows.length < 1) { sn[it.r] = 1; negRows.push({ r: it.r, flip: !!it.flip }); } }
  }
  var _nr2 = 0;
  if (posRows.length && !negRows.length) {
    var _mpr = [2, 3, 9, 10, 11, 12, 27, 29], _rpr = [9, 10, 11, 12, 20];
    var _posA2 = (wm && wm.cat === '近战') ? _mpr : _rpr;
    var _cat2 = wm ? wm.cat : '步枪';
    if (_posA2.indexOf(18) < 0 && isFinite(ocrBase(18, _cat2))) {
      var _u18 = 0;
      for (; _u18 < posRows.length; _u18++) if (posRows[_u18].r === 18) break;
      if (_u18 >= posRows.length) _nr2 = 18;
    }
    if (window.RivenOCR._negAny) {
      var _cand2 = [];
      for (var _z5 = 2; _z5 <= 52; _z5++) {
        if (_z5 === 30) continue;
        if (_posA2.indexOf(_z5) >= 0) continue;
        var _u2b = 0;
        for (; _u2b < posRows.length; _u2b++) if (posRows[_u2b].r === _z5) break;
        if (_u2b < posRows.length) continue;
        if (!isFinite(ocrBase(_z5, _cat2))) continue;
        _cand2.push(_z5);
      }
      if (_nr2 === 0 && _cand2.length) {
        if (_cand2.indexOf(18) >= 0) _nr2 = 18;
        else _nr2 = _cand2[Math.floor(Math.random() * _cand2.length)];
      }
    } else {
      for (var _z4 = 2; _z4 <= 52 && !_nr2; _z4++) {
        if (_z4 === 30 || _z4 === 18) continue;
        if (_posA2.indexOf(_z4) >= 0) continue;
        var _u2 = 0;
        for (; _u2 < posRows.length; _u2++) if (posRows[_u2].r === _z4) break;
        if (_u2 < posRows.length) continue;
        if (!isFinite(ocrBase(_z4, _cat2))) continue;
        _nr2 = _z4; break;
      }
    }
    if (_nr2) negRows.push({ r: _nr2, flip: false });
  }
  var affixes = [], cat = wm ? wm.cat : '步枪', disp = DISP_ALL, posN = posRows.length, negN = negRows.length;  /* 无武器名也能生成 —— 用默认类别'步枪'当数值基准，武器留空（weapon:null）， ocrApply 会提示手选武器、认出来的词条已填好（近战专属词条在步枪基准下无值，会被跳过）。 */
  function stdName(row) { for (var z = 0; z < AFFIX_TABLE.length; z++) if (AFFIX_TABLE[z].drow === row) return AFFIX_TABLE[z].cn; return ''; }
  function isFrow(row) { return row === 16 || row === 17 || row === 18 || row === 42 || row === 43 || row === 44; }
  function ocrBase(row, cat) {
    var si = 0, stx = null;
    for (si = 0; si < STATS.length; si++) if (STATS[si].row === row) { stx = STATS[si]; break; }
    if (!stx) return NaN;
    var ci = (window.ZKC && ZKC.catCol) ? ZKC.catCol(cat) : CAT_COL[cat];
    if (ci == null || ci < 0) return NaN;
    var vv = stx.v[ci];
    return (vv === null || vv === undefined) ? NaN : vv;
  }
  function gen(row, isPos, flip, coefOverride) {
    var b = cat ? ocrBase(row, cat) : NaN;
    if (!isFinite(b)) return null;
    var ci = posN <= 2 ? (negN ? 1 : 0) : (negN ? 3 : 2);
    var gain = [0.99, 1.2375, 0.75, 0.9375][ci], negC = [0, 0.495, 0, 0.75][ci];
    var coef = isPos ? gain : negC;
    var _pf, _nf;
    if (window.RivenOCR._allTop) { _pf = 1.0998; _nf = 1.0998; }        /* 全部触顶：正负都顶 */
    else if (window.RivenOCR._bottomFlag) { _pf = 0.9002; _nf = 1.0998; }
    else if (window.RivenOCR._highLow === 'low') { _pf = 0.92; _nf = 1.08; }
    else if (window.RivenOCR._highLow === 'high') { _pf = 1.08; _nf = 0.92; }
    else { _pf = 1.0998; _nf = 0.9002; }
    var _fl = (coefOverride != null) ? coefOverride : (isPos ? _pf : _nf);
    if (isFrow(row)) {
      var inc = (b - 1) * coef * disp * ((8 + 1) / 9) * _fl;
      var mult = isPos ? (1 + inc) : (1 - inc);
      return { sign: '×', value: Math.round(mult * 1000) / 1000, isPct: false };
    }
    var v = b * coef * disp * ((8 + 1) / 9) * _fl;
    if (flip) {
      return { sign: isPos ? '-' : '+', value: Math.round(Math.abs(v) * 10) / 10, isPct: NON_PCT_ROWS.indexOf(row) < 0 };
    }
    return { sign: isPos ? '+' : '-', value: Math.round(Math.abs(v) * 10) / 10, isPct: NON_PCT_ROWS.indexOf(row) < 0 };
  }
  var _userVals = {};
  (function () {
    var _re = /([+\-\u00d7xX])\s*(\d+(?:\.\d+)?)\s*%?/g, _m3;
    while ((_m3 = _re.exec(rest))) {
      var _off3 = _m3.index + _m3[0].length, _r3 = -1;
      for (var _a5 = 0; _a5 < AFFIX_NAMES.length; _a5++) {
        if (rest.slice(_off3, _off3 + AFFIX_NAMES[_a5].nm.length) === AFFIX_NAMES[_a5].nm) { _r3 = AFFIX_NAMES[_a5].r; break; }
      }
      if (_r3 >= 0) _userVals[_r3] = parseFloat(_m3[2]);
    }
  })();
  var _ignored = [], _igSeen = {};
  function _markIgnored(r) { var _nm = dispStat(r); if (r && _nm && !_igSeen[r]) { _igSeen[r] = 1; _ignored.push(_nm); } }
  var _perCoef = null;
  if (window.RivenOCR._perTop && posRows.length) {
    _perCoef = {};
    var _tops = window.RivenOCR._topRows || {};
    var _others = posRows.filter(function (e) { return !_tops[e.r]; });
    var _need = Math.min((window.RivenOCR._highN || 2) - 1, _others.length);
    var _copy = _others.slice();
    for (var _i3 = _copy.length - 1; _i3 > 0; _i3--) { var _j3 = Math.floor(Math.random() * (_i3 + 1)); var _tmp3 = _copy[_i3]; _copy[_i3] = _copy[_j3]; _copy[_j3] = _tmp3; }
    var _pickSet = {};
    for (var _i4 = 0; _i4 < _need && _i4 < _copy.length; _i4++) _pickSet[_copy[_i4].r] = 1;
    posRows.forEach(function (e) {
      if (_tops[e.r]) _perCoef[e.r] = 1.0998;
      else if (_pickSet[e.r]) _perCoef[e.r] = 1.08;
      else _perCoef[e.r] = 1.03;
    });
  }
  posRows.forEach(function (e) { var g = gen(e.r, true, e.flip, _perCoef ? _perCoef[e.r] : undefined); if (g && g.value != null) { if (_userVals[e.r] != null) g = { sign: g.sign, value: _userVals[e.r], isPct: g.isPct }; affixes.push({ row: e.r, sign: g.sign, value: g.value, isPct: g.isPct, namePart: stdName(e.r) }); } else { _markIgnored(e.r); } });
  negRows.forEach(function (e) { var g = gen(e.r, false, e.flip); if (g && g.value != null) { if (_userVals[e.r] != null) g = { sign: g.sign, value: _userVals[e.r], isPct: g.isPct }; affixes.push({ row: e.r, sign: g.sign, value: g.value, isPct: g.isPct, namePart: stdName(e.r) }); } else { _markIgnored(e.r); } });
  if (!affixes.length) return null;
  return { weapon: wm ? { idx: WEAPONS.indexOf(wm), cn: wm.cn, intl: wm.intl, en: wm.en, cat: wm.cat, ambiguous: !!(fw && fw.ambiguous) } : null, affixes: affixes, ignored: _ignored };
}
function freeFallback(r, rows, engineUsed) {
  if (!r || r.weapon || (r.affixes || []).length >= 3) return r;
  var whole = [];
  for (var i = 0; i < (rows || []).length; i++) { var x = rows[i]; if (x && x.text && x.text.trim()) whole.push(x.text.trim()); }
  if (!whole.length) return r;
  var txt = whole.join(' ');
  var ft = parseFreeText(txt);
  if (ft && (ft.weapon || ft.affixes.length > (r.affixes || []).length)) return resFromFree(ft, engineUsed);
  var sh = parseShorthand(txt);
  if (sh && (sh.weapon || sh.affixes.length)) return resFromFree(sh, engineUsed);
  return r;
}
function fmtAffixName(a) {
  const sign = (a.sign === '-' || a.sign === '−' || a.sign === '–') ? '-'
    : (a.sign === '×' || a.sign === 'x' || a.sign === 'X' || a.sign === '*' || a.sign === '✕') ? '×' : '+';
  var _np = a && a.drow != null && NON_PCT_ROWS.indexOf(a.drow) >= 0;
  return sign + a.value + ((a.isPct && !_np) ? '%' : '');
}
function isNegAffix(a) {
  return !!a && (a.sign === '-' || /^[−–—‐‑﹣]$/.test(a.sign) || factionSign(a) === '-');
}
function affixAsPos(a) {
  if (!a) return a;
  var s = a.sign, v = +a.value;
  if (s === '-' || /^[−–—‐‑﹣]$/.test(s))
    return Object.assign({}, a, { sign: '+', value: isFinite(v) ? String(Math.abs(v)) : a.value });
  if ((s === '×' || s === 'x' || s === 'X' || s === '*') && isFinite(v) && v < 1)
    return Object.assign({}, a, { value: (2 - v).toFixed(2) });
  return a;
}
function affixAsNeg(a) {
  if (!a) return a;
  var s = a.sign, v = +a.value;
  if (s === '+' || s === undefined || s === null || s === '')
    return Object.assign({}, a, { sign: '-' });
  if ((s === '×' || s === 'x' || s === 'X' || s === '*') && isFinite(v) && v > 1)
    return Object.assign({}, a, { value: (2 - v).toFixed(2) });
  return a;
}
function recoilOut(a, isNegBox) {
  return Object.assign({}, a, { sign: isNegBox ? '+' : '-' });
}
function comboFitBest(rows, rank, posN, negN, cats) {
  var best = Infinity;
  for (var i = 0; i < WEAPON_TABLE.length; i++) {
    var w = WEAPON_TABLE[i];
    if (cats && cats.length && cats.indexOf(w.cat) < 0) continue;
    var d = weaponValueFit(w, rows, rank, posN, negN);
    if (isFinite(d) && d < best) best = d;
  }
  return best;
}
function decideCombo(list, rank) {
  var n = list.length;
  var lastByY = list.reduce(function (mx, x) { return ((x.a.y || 0) > (mx.a.y || 0) ? x : mx); }, list[0]);
  var lastByYIdx = list.indexOf(lastByY);
  var negIdx = [];
  for (var i = 0; i < n; i++) if (isNegAffix(list[i].a)) negIdx.push(i);
  var cats = null;
  var ci = catsFromAffixes(list.map(function (x) {
    return { drow: x.m.row.drow, sign: x.a.sign, value: x.a.value };
  }));
  if (ci.used && ci.cats.length) cats = ci.cats;
  var opts;
  if (n >= 4) opts = [{ pos: 3, neg: 1 }];
  else if (n === 3) opts = [{ pos: 2, neg: 1 }, { pos: 3, neg: 0 }];
  else if (n === 2) opts = [{ pos: 2, neg: 0 }];
  else opts = [{ pos: n, neg: 0 }];
  if (n === 3 && lastByY.a.sign === '+' && lastByY.m.row.drow !== RECOIL_ROW) opts = [{ pos: 3, neg: 0 }];
  var best = null;
  for (var k = 0; k < opts.length; k++) {
    var o = opts[k];
    var rows = list.map(function (x, i) {
      var sign = x.a.sign;
      if (o.neg && i === n - 1) sign = '-';
      return { drow: x.m.row.drow, sign: sign, value: x.a.value };
    });
    var pen = 0;
    if (o.neg) {
      if (negIdx.length && negIdx[negIdx.length - 1] !== lastByYIdx) pen = 2;
    } else if (negIdx.length) pen = 2;
    var fit = (rank === undefined || rank === null || !isFinite(rank))
      ? Infinity : comboFitBest(rows, rank, o.pos, o.neg, cats);
    var sc = (isFinite(fit) ? fit : 1000) + pen + (o.neg && !isFinite(fit) ? 500 : 0);
    if (!best || sc < best.sc) best = { pos: o.pos, neg: o.neg, sc: sc, pen: pen, fit: fit };
  }
  return best || { pos: n, neg: 0 };
}
var RECOIL_ROW = window.RULES.RECOIL_ROW; /* 武器后坐力行号：方向相反，卡面 + 是减益、卡面 - 是增益（与 app.js dirOf 一致） */
function sanitizeFinalAffixes(affixes, opts) {
  opts = opts || {};
  const isNeg = isNegAffix;
  const withM = [];
  (affixes || []).forEach((a, i) => { const m = matchAffix(a.namePart); if (m) withM.push({ a, i, m }); });
  const byRow = new Map();
  for (const x of withM) {
    const prev = byRow.get(x.m.row);
    if (!prev || x.m.score > prev.m.score || (x.m.score === prev.m.score && x.i < prev.i)) byRow.set(x.m.row, x);
  }
  const dedup = [...byRow.values()].sort((a, b) => a.i - b.i);     // 按卡面顺序（上 下）
  const n = dedup.length;
  if (!n) return [];
  const lastByY = dedup.reduce((mx, x) => ((x.a.y || 0) > (mx.a.y || 0) ? x : mx), dedup[0]);
  const recoil = dedup.find(x => x.m.row.drow === RECOIL_ROW) || null;
  const recoilIsLast = !!(recoil && lastByY && recoil === lastByY);
  let recoilNeg = false;        // 后坐力是否落负面槽
  let forceCombo = null;        // 需要覆盖 decideCombo 的组合
  if (recoil) {
    if (recoilIsLast) {
      if (n >= 4) { recoilNeg = true; }                         // 4 词条（3+1）：末条（后坐力）占负面槽
      else if (n <= 2) { recoilNeg = false; }                   // 2 词条：全正面
      else { // n === 3
        if (recoil.a.sign === '+') { recoilNeg = true; forceCombo = [{ pos: 2, neg: 1 }]; }   // 正后坐力 = 减益
        else { recoilNeg = false; forceCombo = [{ pos: 3, neg: 0 }]; }                         // 负/空白后坐力 = 增益，3+0
      }
    } else {
      recoilNeg = false;       // 后坐力不在末条：当普通词条处理，绝不占负面槽（真末条另有其行）
    }
  }
  const combo = forceCombo ? forceCombo[0] : (opts.combo || decideCombo(dedup, opts.rank));
  let negSel = [];
  if (combo.neg > 0) {
    if (recoilNeg) {
      negSel = [recoil];
    } else {
      const negAll = dedup.filter(x => isNeg(x.a) && x.m.row.drow !== RECOIL_ROW);
      const negReal = negAll.filter(x => !lockIconMisread(x.a));
      let pool = negReal.length ? negReal : negAll;
      if (!pool.length) {
        const noSign = dedup.filter(x => !x.a.sign && x.m.row.drow !== RECOIL_ROW && !lockIconMisread(x.a));
        pool = noSign.length ? noSign : [lastByY];
      }
      negSel = pool.length
        ? [pool.slice().sort((a, b) => b.i - a.i || b.m.score - a.m.score)[0]]
        : [lastByY];
    }
  }
  const negSet = new Set(negSel);
  const poss = dedup.filter(x => !negSet.has(x))
    .slice().sort((a, b) => b.m.score - a.m.score || a.i - b.i)
    .slice(0, combo.pos);
  const out = [];
  const pushAffix = (x, isNegBox) => {
    if (x.m.row.drow === RECOIL_ROW) out.push({ a: recoilOut(x.a, isNegBox), i: x.i });
    else out.push({ a: isNegBox ? affixAsNeg(x.a) : affixAsPos(x.a), i: x.i });
  };
  poss.forEach(x => pushAffix(x, false));
  negSel.forEach(x => pushAffix(x, true));
  return out.sort((p, q) => p.i - q.i).map(x => x.a);
}
function finalResultLines(p) {
  const lines = [];
  let wpick = null, wwarn = false;
  if (p.weapon.cn || p.weapon.en) {
    const wconf = matchWeapon(p.weapon.cn, p.weapon.en);
    if (wconf) { wpick = wconf; wwarn = !!wconf.ambiguous; }
    else {
      const top = pickBest(rankWeapon(p.weapon.cn, p.weapon.en));
      if (top && top.score >= 62) { wpick = top; wwarn = true; }
    }
  }
  lines.push((wpick ? dispName(wpick.row) : '未识别武器') + ((wwarn || lastConflicts.name) ? ' ⚠' : ''));
  lines.push((p.level || '未识别等级') + (lastConflicts.level ? ' ⚠' : ''));
  var _meleeCat = !!(wpick && wpick.row && wpick.row.cat === '近战');
  for (const a of sanitizeFinalAffixes(p.affixes, { rank: drainToRank(p.level) })) {
    const m = matchAffix(a.namePart);
    var _nm = affixDisplayName(m);
    if (m && m.row && m.row.drow === 8) _nm = _meleeCat ? '攻击速度' : '射速';   /* 攻速名：近战/非近战 */
    var _fa = fmtAffixName(a);
    if (m && m.row && NON_PCT_ROWS.indexOf(m.row.drow) >= 0) _fa = _fa.replace(/%$/, '');  /* 范围/初始连击/连击/穿透 不加% */
    lines.push(_fa + ' ' + _nm + (((m && m.ambiguous) || affixConflicted(a) || a.uncertain) ? ' ⚠' : ''));
  }
  return lines;
}
function attachNumVerify(res) {
  if (!res) return res;
  var nv = (typeof window !== 'undefined' && window.__numVerify) || [];
  if (!nv.length) return res;
  var fixed = [], conf = [];
  for (var i = 0; i < nv.length; i++) {
    if (nv[i].fixed) fixed.push(nv[i]);
    if (nv[i].conflict) conf.push(nv[i]);
  }
  res.numChecked = nv.length;
  if (fixed.length) res.numFixed = fixed;
  if (conf.length) res.numConflict = conf;
  var affs = res.affixes || [];
  for (var k = 0; k < affs.length; k++) {
    var v = String(affs[k].value);
    for (var j = 0; j < conf.length; j++) {
      if (conf[j].vals && conf[j].vals.indexOf(v) >= 0) { affs[k].uncertain = true; break; }
    }
  }
  return res;
}
function affixConflicted(a) {
  for (const cf of lastConflicts.affix) {
    const fa = parseAffixes([cf.a])[0], fb = parseAffixes([cf.b])[0];
    const hit = [fa, fb].find(x => x && x.sign === a.sign && x.value === a.value && norm(x.namePart) === norm(a.namePart));
    if (hit) return true;
  }
  return false;
}
  function probeCanvas(img) {
    if (img && img.getContext !== HTMLCanvasElement.prototype.getContext) {
      var c = document.createElement('canvas');
      c.width = img.naturalWidth || img.width;
      c.height = img.naturalHeight || img.height;
      c.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0, c.width, c.height);
      return c;
    }
    return img;
  }
  function probeText(img) {
    var cv = probeCanvas(img);
    if (typeof onnxDetOnly === 'function' && typeof location !== 'undefined' && location.protocol !== 'file:') {
      return onnxDetOnly(cv).then(function (boxes) {
        if (!boxes || !boxes.length) return { boxes: inkBlocks(cv) || [], source: 'ink' };
        return { boxes: boxes, source: 'onnx' };
      }).catch(function () {
        return { boxes: inkBlocks(cv) || [], source: 'ink' };
      });
    }
    return Promise.resolve({ boxes: inkBlocks(cv) || [], source: 'ink' });
  }
  function loadImage(src) {
    return new Promise(function (res, rej) {
      var node = (src && src.nodeType === 1) ? src : null;
      var tag = node ? String(node.tagName || '').toUpperCase() : '';
      function accept(img) {
        var out = img, aligned = false;
        try {
          out = fitToTemplate(img);
          aligned = true;
        } catch (e) {
          try {
            var box = detectCardBox(img);
            if (box) { out = alignToTemplate(img, box); aligned = true; }
          } catch (e2) { ZKHTML.warn('识别/ocr.js:4018', e2); }
        }
        var purpleMode = (out.__fit && out.__fit.mode) || 'raw';
        var quad = out.__fit ? out.__fit.quad : null;
        probeText(img).then(function (textInfo) {
          var cov = (quad && textInfo.boxes.length) ? textCoverage(quad, textInfo.boxes) : -1;
          textInfo.coverage = cov;
          var needFallback = !aligned || purpleMode === 'full' || (cov >= 0 && cov < 0.5);
          if (needFallback) {
            try {
              var alt = fitByText(img, textInfo.boxes);
              if (alt) { alt.__fullCanvas = out; out = alt; aligned = true; textInfo.mode = out.__fit.mode; }
            } catch (e3) { ZKHTML.warn('识别/ocr.js:4039', e3); }
          }
          if (!textInfo.mode) textInfo.mode = purpleMode;
          out.__text = textInfo;
          currentImage = out; OCR_REQ++;
          res({
            w: img.naturalWidth || img.width, h: img.naturalHeight || img.height,
            aligned: aligned, canvas: out,
            fit: out.__fit || null,
            text: out.__text || null,
            regions: REGIONS_PCT
          });
        }).catch(function (e4) {
          out.__text = { boxes: [], coverage: -1, mode: purpleMode, error: String(e4) };
          currentImage = out; OCR_REQ++;
          res({
            w: img.naturalWidth || img.width, h: img.naturalHeight || img.height,
            aligned: aligned, canvas: out,
            fit: out.__fit || null,
            text: out.__text,
            regions: REGIONS_PCT
          });
        });
      }
      if (node && (tag === 'IMG' || tag === 'CANVAS')) {
        if (tag === 'IMG' && !node.complete) {
          node.addEventListener('load', function () { accept(node); });
          node.addEventListener('error', function () { rej(new Error('图片解码失败')); });
          return;
        }
        try { accept(node); } catch (e) { rej(e); }
        return;
      }
      var img = new Image();
      img.onload = function () { accept(img); };
      img.onerror = function () { rej(new Error('图片解码失败')); };
      img.src = src;
    });
  }
  function hasImage() { return !!currentImage; }
  function buildFromRaw(levelText, nameText, affixText, affixY, mrText, rollsText) {
    var raw = (affixText || '').split(/\n+/);
    var texts = [], ys = [];
    for (var i = 0; i < raw.length; i++) {
      if (!raw[i].trim()) continue;
      texts.push(raw[i]);
      var yv = (affixY && affixY[i] != null) ? affixY[i] : 0;
      ys.push(yv > 0 ? yv : (texts.length - 1) * 3);   // 无真实 y 时退回数组序，保证「末条」判定一致
    }
    var lines = texts.map(function (t, i) { return { text: t, y: ys[i] }; });
    return {
      level: parseLevel((levelText || '').split(/\n+/).filter(Boolean)),
      weapon: parseName((nameText || '').split(/\n+/).filter(Boolean)),
      affixes: parseAffixes(lines),
      mr: parseMr(mrText),
      rolls: parseRolls(rollsText)
    };
  }
  function repairByGenName(affixes, wrow, ocrEn) {
    if (!wrow || !ocrEn || !(affixes || []).length) return null;
    var cur = crossCheckName(rivenGenLatin(affixes, wrow), ocrEn, wrow.en);
    if (cur.ok) return null;                                  // 名字本来就对得上，不动
    var gen = genNameStats(ocrEn, wrow.en);
    var extra = [];
    for (var gi = 0; gi < gen.must.length; gi++) {
      if (isFinite(rowBaseOf(gen.must[gi], wrow.cat))) extra.push(gen.must[gi]);
    }
    var best = null;
    for (var i = 0; i < affixes.length; i++) {
      var a = affixes[i];
      if (!a.nameRaw) continue;
      var alts = rankAffix(a.nameRaw).slice(0, 4);
      for (var ei = 0; ei < extra.length; ei++) {
        if (extra[ei] === a.drow) continue;
        alts.push({ row: STAT_ROW[extra[ei]], score: a.score || 0 });
      }
      for (var k = 1; k < alts.length; k++) {
        var row = alts[k] && alts[k].row;
        if (!row || !row.drow || row.drow === a.drow) continue;
        var dup = false;
        for (var kk = 0; kk < k; kk++) {
          if (alts[kk] && alts[kk].row && alts[kk].row.drow === row.drow) { dup = true; break; }
        }
        if (dup) continue;
        if (!isFinite(rowBaseOf(row.drow, wrow.cat))) continue;          // 该类别洗不出这条 非法
        if ((alts[k].score || 0) < (a.score || 0) - 12) continue;         // 名字分差太多就别硬换
        var trial = affixes.slice();
        trial[i] = {
          sign: a.sign, value: a.value, isPct: a.isPct, nameRaw: a.nameRaw,
          name: affixDisplayName({ row: row }), drow: row.drow,
          score: alts[k].score, ambiguous: false
        };
        var c = crossCheckName(rivenGenLatin(trial, wrow), ocrEn, wrow.en);
        if (!c.ok) continue;                                              // 只有对上名字的假设才算候选
        var sc = c.sim + ((gen.must.indexOf(row.drow) >= 0) ? 0.05 : 0);
        if (!best || sc > best.sc) best = { sc: sc, set: trial, sim: c.sim };
      }
    }
    return best ? best.set : null;
  }
  function finalize(p, engineUsed) {
    var rank = drainToRank(p.level);
    var _r0 = rank;
    var _pre = settleRankCombo(p.affixes, p.weapon.cn, p.weapon.en, rank, p.level);
    var rankFix = null;
    if (_pre) {
      rank = _pre.rank;
      rankFix = { levelFrom: _r0, levelTo: rank, drainFrom: p.level,
                  drainTo: (RANK2DRAIN[rank] != null ? String(RANK2DRAIN[rank]) : p.level),
                  weaponFrom: '', weaponTo: '',
                  comboFixed: !!_pre.comboChanged,
                  worst: (_pre.probe ? +_pre.probe.worst.toFixed(4) : null) };
    }
    var san = sanitizeFinalAffixes(p.affixes, { rank: rank, combo: _pre ? _pre.combo : null });
    var affixRows = san.map(function (a) {
      var mm = matchAffix(a.namePart);
      return { drow: mm ? mm.row.drow : 0, sign: a.sign, value: a.value };
    });
    var catInfo = catsFromAffixes(affixRows);
    var catHint = null;
    for (var ch_i = 0; ch_i < (p.affixes || []).length; ch_i++) {
      var hc = p.affixes[ch_i] && p.affixes[ch_i].catHint;
      if (hc === 'melee') catHint = 'melee';
      else if (hc === 'ranged' && catHint !== 'melee') catHint = 'ranged';
    }
    if (catHint === 'melee') catInfo.cats = catInfo.cats.filter(function (c) { return c === '近战'; });
    else if (catHint === 'ranged') catInfo.cats = catInfo.cats.filter(function (c) { return c !== '近战'; });
    var posN = 0, negN = 0;
    for (var q = 0; q < affixRows.length; q++) {
      if (affixRows[q].sign === '-' || factionSign(affixRows[q]) === '-') negN = 1; else posN++;
    }
    var wpick = null, wwarn = false, winfer = false;
    var wm = (p.weapon.cn || p.weapon.en) ? matchWeapon(p.weapon.cn, p.weapon.en) : null;
    if (wm && (!catInfo.used || !catInfo.cats.length || catInfo.cats.indexOf(wm.row.cat) >= 0)) {
      wpick = wm; wwarn = !!wm.ambiguous;
    } else {
      var alt = pickWeaponSmart(p.weapon.cn, p.weapon.en, catInfo, affixRows, rank, posN, negN);
      if (alt) { wpick = alt.pick; wwarn = true; winfer = !alt.byName; }
      else {
        var top = (p.weapon.cn || p.weapon.en) ? pickBest(rankWeapon(p.weapon.cn, p.weapon.en)) : null;
        if (top && top.score >= 62
          && (!catInfo.used || !catInfo.cats.length || catInfo.cats.indexOf(top.row.cat) >= 0)) {
          wpick = top; wwarn = true;
        }
      }
    }
    var _w0 = wpick ? wpick.row : null;
    for (var _it = 0; _it < 3; _it++) {
      var _st = settleScale(san, wpick, posN, negN, rank, catInfo.cats, p.level);
      if (!_st) break;
      var _curW = wpick ? wpick.row : null;
      var _chW = !!(_curW && _st.w && _st.w !== _curW);
      var _chR = (_st.rank !== rank);
      if (!_chW && !_chR) break;
      if (_chW) { wpick.row = _st.w; wwarn = true; }        // 家族内换武器后数值自洽 采用它
      if (_chR) {
        rank = _st.rank;
        san = sanitizeFinalAffixes(p.affixes, { rank: rank });
        affixRows = san.map(function (a) {
          var mm = matchAffix(a.namePart);
          return { drow: mm ? mm.row.drow : 0, sign: a.sign, value: a.value };
        });
        posN = 0; negN = 0;
        for (var q2 = 0; q2 < affixRows.length; q2++) {
          if (affixRows[q2].sign === '-' || factionSign(affixRows[q2]) === '-') negN = 1; else posN++;
        }
      }
      rankFix = rankFix || { levelFrom: _r0, levelTo: rank, drainFrom: p.level,
                             drainTo: null, weaponFrom: '', weaponTo: '', comboFixed: false, worst: null };
      rankFix.levelTo = rank;
      rankFix.drainTo = (RANK2DRAIN[rank] != null ? String(RANK2DRAIN[rank]) : p.level);
      rankFix.weaponFrom = _w0 ? dispName(_w0) : '';
      rankFix.weaponTo = (wpick && wpick.row) ? dispName(wpick.row) : '';
      rankFix.worst = (_st.probe ? +_st.probe.worst.toFixed(4) : null);
    }
    var valueFixed = repairAffixValues(san, wpick, rank, posN, negN);
    var affixes = [], dropped = 0;
    for (var a of san) {
      if (lockIconMisread(a)) { dropped++; continue; }
      var m = matchAffix(a.namePart);
      affixes.push({
        sign: a.sign, value: a.value, isPct: a.isPct, nameRaw: a.namePart,
        name: m ? affixDisplayName(m) : null,
        drow: m ? m.row.drow : 0,
        score: m ? (m.score || 0) : 0,     /* R3 局部搜索要用它做「换过去值不值」的判据 */
        ambiguous: !!((m && m.ambiguous) || affixConflicted(a))
      });
    }
    var unread = [];
    for (var ui = 0; ui < (p.affixes || []).length; ui++) {
      var ua = p.affixes[ui];
      if (!ua || !ua.namePart) continue;
      if (lockIconMisread(ua)) continue;                  // 已计入 dropped，不重复报
      if (matchAffix(ua.namePart)) continue;
      unread.push({ text: String(ua.namePart), y: ua.y || 0 });
    }
    var weak = affixes.filter(function (x) { return x.drow && x.score && x.score < 62; })
      .map(function (x) { return { text: x.nameRaw, name: x.name, score: x.score }; });
    var rivenGen = rivenGenLatin(affixes, wpick ? wpick.row : null);
    var nameCheck = crossCheckName(rivenGen, p.weapon.en, wpick ? wpick.row.en : null);
    if (!nameCheck.ok && wpick && wpick.row && p.weapon.en) {
      var fixedSet = repairByGenName(affixes, wpick.row, p.weapon.en);
      if (fixedSet) {
        affixes = fixedSet;
        rivenGen = rivenGenLatin(affixes, wpick.row);
        nameCheck = crossCheckName(rivenGen, p.weapon.en, wpick.row.en);
        nameCheck.repaired = true;
      }
    }
    if (!nameCheck.ok && wpick && nameCheck.reason === 'mismatch' && !lastConflicts.name)
      lastConflicts.name = { a: rivenGen, b: p.weapon.en, riven: true };
    return {
      levelRaw: p.level,
      mr: (p.mr != null ? p.mr : 8),
      rolls: (p.rolls != null ? p.rolls : 10),
      weapon: wpick ? { idx: wpick.row.idx, cn: wpick.row.cn, intl: wpick.row.intl,
                        en: wpick.row.en, cat: wpick.row.cat, score: wpick.score,
                        ambiguous: !!wwarn, inferred: !!winfer,
                        byValue: !!(rankFix && rankFix.weaponFrom && rankFix.weaponFrom !== rankFix.weaponTo) } : null,
      weaponCats: (function () {
        if (!catInfo.used || !catInfo.cats.length) return [];
        var al = catsAlive(catInfo.cats, affixRows, rank, posN, negN);
        return (al.length ? al : catInfo.cats).slice();
      })(),
      weaponRaw: { cn: p.weapon.cn, en: p.weapon.en },
      rivenGen: rivenGen,        // 第 11 步：由正面词条反推出的紫卡生成名（拉丁）
      nameCheck: nameCheck,      // 第 11 步：派生名 ↔ 卡面 OCR 拉丁名 交叉校验结果
      affixes: affixes,
      dropped: dropped,          // 疑似锁图标误读、被拦下的条数（由 UI 计入「没认出来」）
      unread: unread,            // 有数字、但对不上任何词条的原始行
      weak: weak,                // 对上了但分数 < 62（不敢信）的行
      valueFixed: valueFixed,    // 被数字修复过的值 [{row,name,from,to}]
      genMust: (wpick && wpick.row && p.weapon.en)
        ? genNameStats(p.weapon.en, wpick.row.en) : { must: [], maybe: [], parts: [] },
      rank: rank,                // 识别等级回传（66:10110容量0级；
      rankFix: rankFix,
      engineUsed: engineUsed,
      conflicts: lastConflicts
    };
  }
  window.__dbgOn = false;
  var __dbgData = null;
  function setDbg(html, isHtml) {
    var d = document.getElementById('__dbgbox');
    if (!d) {
      d = document.createElement('div');
      d.id = '__dbgbox';
      d.style.cssText = 'position:fixed;left:8px;bottom:44px;z-index:99999;max-width:720px;max-height:60vh;overflow:auto;background:#111;color:#7fff9a;font:12px/1.5 monospace;padding:8px;border:1px solid #444;white-space:pre-wrap;border-radius:6px;';
      document.body.appendChild(d);
    }
    if (isHtml) { d.textContent = ''; d.innerHTML = html; }
    else { d.textContent = html; }
    d.style.display = window.__dbgOn ? 'block' : 'none';
  }
  function __dbgPaint() {
    if (!window.__dbgOn) return;
    if (!__dbgData) { setDbg('还没有识别结果 —— 先识别一张截图。', false); return; }
    var html = '【原始行·预判组合:' + __dbgData.combo + '·分界线y:' + __dbgData.divY + '】\n' + __dbgData.rows.join('\n');
    var S = __dbgData.step;
    if (S) {
      html += '\n\n=== ①对齐后 ===\n';
      html += '<img src="' + S.aligned + '" style="max-width:200px;display:block;">\n';
      html += '=== ②二值掩膜（颜色掩膜）===\n';
      html += '<img src="' + S.mask + '" style="max-width:200px;display:block;">\n';
      html += '=== ③④分界线+分区框（红线=分界线，黄框=分区，绿框=det文字框）===\n';
      html += '<img src="' + S.zones + '" style="max-width:200px;display:block;">\n';
    }
    var P = window.__ocrLast;
    if (P) {
      var _e = function (s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
          return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
        });
      };
      html += '\n\n=== 识别明细（本机推理）===\n';
      html += '引擎：' + _e(P.engine) + '\n';
      html += '模型：' + _e(P.model) + '\n';
      html += 'det输入 ' + _e(P.detInput) + '　阈值 ' + P.detTh + '　置信下限 ' + P.confMin + '\n';
      html += '文字框 ' + P.boxes + ' → 行组 ' + P.groups + ' → 保留 ' + P.lines + ' 行（丢弃 ' + P.dropped + '）\n';
      html += '耗时 ' + Math.round(P.ms.total) + 'ms（加载 ' + Math.round(P.ms.load)
        + ' · det ' + Math.round(P.ms.det) + ' · rec ' + Math.round(P.ms.rec) + '）\n';
      html += '预判组合 ' + _e(P.combo) + '　分界线 y ' + P.divY
        + '　极性 ' + _e(P.pol ? (P.pol.pol + (P.pol.lowConf ? '（低置信）' : '')) : '未识别') + '\n';
      html += '<table style="border-collapse:collapse;font-size:11px;margin-top:4px;">'
        + '<tr style="color:#8af"><th align="left">y</th><th align="left">x</th>'
        + '<th align="left">conf</th><th align="left">zone</th><th align="left">text</th></tr>';
      for (var _pi = 0; _pi < P.items.length; _pi++) {
        var _it = P.items[_pi];
        html += '<tr><td>' + _it.y + '</td><td>' + _it.x + '</td>'
          + '<td>' + (Number(_it.conf) || 0).toFixed(2) + '</td>'
          + '<td>' + _e(_it.zone || '—') + '</td>'
          + '<td>' + _e(_it.text) + '</td></tr>';
      }
      html += '</table>';
    }
    setDbg(html, true);
  }
  function ensureDbgBtn() {
    var b = document.getElementById('ocrDbgBtn');
    if (b) return b;
    b = document.createElement('button');
    b.id = 'ocrDbgBtn';
    b.type = 'button';
    b.textContent = '显示识别';
    b.style.cssText = 'position:fixed;left:max(8px,env(safe-area-inset-left));bottom:max(8px,env(safe-area-inset-bottom));z-index:100000;transform:none;background:#222;color:#7fff9a;font:12px/1.4 monospace;padding:4px 10px;border:1px solid #444;border-radius:6px;cursor:pointer;';
    b.onclick = function () {
      window.__dbgOn = !window.__dbgOn;
      b.textContent = window.__dbgOn ? '隐藏识别' : '显示识别';
      if (window.__dbgOn) __dbgPaint();
      else { var d = document.getElementById('__dbgbox'); if (d) d.style.display = 'none'; }
    };
    document.body.appendChild(b);
    return b;
  }
  function recognize(opts) {
    opts = opts || {};
    lastConflicts = { level: null, name: null, affix: [] };
    window.__numVerify = [];        // 数值复读结果按次清空，别跨图累加
    window.__zones = null;          // 分区/调试字段同理
    window.__zoneSplit = '';
    if (!currentImage) return Promise.reject(new Error('还没有载入截图'));
    var img0 = currentImage;        // 捕获本次识别用的图，避免被后续载入覆盖（#15）
    var req = OCR_REQ;              // 请求令牌：结束后若已变，说明有新图载入，丢弃旧结果
    var onProg = opts.onProgress || function () {};
    OCR_PROGRESS = function (m) {
      try { onProg(m); } catch (e) { ZKHTML.warn('识别/ocr.js:4385', e); }
    };
    function onnxPath() {
      OCR_PROGRESS({ status: '正在识别…' });
      var base = img0, fullCanvas = base && base.__fullCanvas;
      return onnxFullRows(img0, { onProgress: onProg }).then(function (res) {
        var templated = res.templated;   // 切到模板坐标（456x600），classifyRows 读 naturalHeight/height
        if (req === OCR_REQ) currentImage = templated;   // 仅当本请求仍是最新时才改写全局
        var rows = res.rows;
        var c = classifyWithGlobal(rows);
        try {
          window.__dbgRows = rows.map(function (r) { return r.yc.toFixed(0) + ':' + r.text; });
          ensureDbgBtn();
          __dbgData = { rows: window.__dbgRows, combo: window.__comboGuess || '?',
                        divY: window.__divY || '?', step: window.__stepImages || null };
          __dbgPaint();          /* 面板没开时直接返回，不拼 HTML */
        } catch (e) { ZKHTML.warn('识别/ocr.js:4411', e); }
        var _ftRows = (res && res.rows) ? res.rows.slice() : [];
        var polInfo = (res && res.pol) || null;
        var finish = function () {
          if (req !== OCR_REQ) return Promise.reject(new Error('识别被更新的截图取代，已丢弃旧结果'));
          var __tp = (typeof window !== 'undefined' && window.__ocrProfile) ? performance.now() : 0;
          var _rp = buildFromRaw(c.levelText, c.nameText, c.affixText, c.affixY, c.mrText, c.rollsText);
          var _r = finalize(_rp, 'onnx');
          var _fr = freeFallback(_r, _ftRows, 'onnx');   // 全图兜底：仅当现有结果太差才介入，成功路径原样返回
          attachNumVerify(_fr);                          // 数值复读结论挂到词条上（不确定的标 uncertain）
          _fr.zones = window.__zones || null;            // 本次真实用的分区（调试框照这个画才不漂）
          if ((typeof window !== 'undefined' && window.__ocrProfile)) { window.__ocrPhases = window.__ocrPhases || { wake: 0, det: 0, rec: 0, parse: 0 }; window.__ocrPhases.parse += performance.now() - __tp; }
          if (polInfo && polInfo.pol && !_fr.pol) {
            _fr.pol = polInfo.pol;
            _fr.polLow = !!polInfo.lowConf;
            _fr.polIoU = polInfo.bestIoU;
          }
          return _fr;
        };
        if (!fullCanvas) return finish();
        return onnxFullRows(fullCanvas, { numCheck: false, onProgress: onProg }).then(function (r2) {
          c = mergeClassified(classifyWithGlobal(r2.rows || []), c);
          _ftRows = _ftRows.concat(r2.rows || []);
          if (!polInfo && r2 && r2.pol) polInfo = r2.pol;
          return finish();
        }).catch(function () { return finish(); });
      }).catch(function (e) {
        window.__onnxErr = (e && e.stack) || String(e);
        OCR_PROGRESS({ status: '这张图不太好认，正在换一种方式重试…' });
        throw e;
      });
    }
    return onnxPath().catch(function (e) {
      var why = (window.__ortErr ? window.__ortErr + '；' : '') + ((e && e.message) || e || '未知原因');
      console.warn('本地 ONNX 失败：', why);
      try {
        OCR_PROGRESS({ status: '本地引擎失败：' + why + '（已停下，请重试或换一张图）' });
      } catch (e2) { ZKHTML.warn('识别/ocr.js:4455', e2); }
      throw e;
    });
  }
  window.__OCR_API = {
    rankAffix: rankAffix, nameRowHit: nameRowHit, nameRowScore: nameRowScore,
    parseAffixes: parseAffixes, matchAffix: matchAffix,
    version: 1
  };
  window.RivenOCR = {
    loadImage: loadImage, recognize: recognize, hasImage: hasImage,
    __regions: REGIONS_PCT,   /* 识别模块读它做 zone 分区，口径与 loadImage 返回值一致 */
    parseRivenName: parseRivenName,
    _settle: { settleScale: settleScale, probe: scaleProbe, family: familyOf, rows: settleRowsOf,
               rankCostOf: rankCostOf, w: SETTLE_W,
               tol: function () { return SETTLE_TOL; } },
    _nameRowHit: nameRowHit,
    rankWeapon: rankWeapon, matchWeapon: matchWeapon,
    parseText: function (lines, meta) {
      meta = meta || {};
      var arr = (lines || []).map(function (l) {
        return (typeof l === 'string') ? l : String((l && l.text) || '');
      }).filter(function (x) { return x.trim() !== ''; });
      var p = buildFromRaw(meta.level || '', meta.name || '', arr.join('\n'), null,
        meta.mr || '', meta.rolls || '');
      return finalize(p, 'text-only');
    },
    generate: function (text) {
      if (!text || !String(text).trim()) return null;
      var self = (window.RivenOCR && window.RivenOCR._one) ? window.RivenOCR : this;
      if (!self || !self._one) return null;
      var blocks = splitBlocks(text);
      var cands = [], i;
      if (blocks.length <= 1) {
        cands.push(String(text));
      } else {
        for (i = 0; i < blocks.length; i++) cands.push(blocks[i]);
        for (i = 0; i + 1 < blocks.length; i++) cands.push(blocks[i] + '\n' + blocks[i + 1]);
        cands.push(String(text));
      }
      var best = null, bestSc = -1e9;
      for (i = 0; i < cands.length; i++) {
        var r = null;
        try { r = self._one(cands[i]); } catch (e) { r = null; }
        var sc = textScoreOf(r);
        if (sc > bestSc + 1e-9) { bestSc = sc; best = r; }
      }
      return (bestSc > -1e8) ? best : null;
    },
    _one: function (text) {
      if (!text || !String(text).trim()) return null;
      var raw = String(text);
      raw = raw.replace(/(\d+(?:\.\d+)?[kKmM]?\s*)(出|收|求|卖|买)/g, ' ');
      for (var _ti = 0; _ti < TRADE_RE.length; _ti++) raw = raw.replace(TRADE_RE[_ti], ' ');
      raw = expandEnAbbr(raw);
      raw = stripRivenNameTokens(raw);
      var raw0 = raw;   /* 「触底」标记用未清洗的原文检测 */
      var meta = extractMeta(raw);
      raw = meta.t;
      var pol = extractPol(raw);   /* 极性俗称识别（r槽/v槽Madurai 等），未识别则由 ocrApply 默认 madurai */
      if (/^\s*(?:武器|Weapon|Riven|紫卡)/i.test(raw)) {
        var lb = parseLabeled(raw);
        if (lb && (lb.weapon || lb.affixes.length)) {
          var rl = resFromFree(lb, 'labeled');
          rl.pol = pol;
          rl.bottom = /触底/.test(raw0);
          rl.mr = (meta.mr != null) ? meta.mr : ((lb.mr != null && isFinite(lb.mr)) ? lb.mr : 8);
          rl.rolls = (meta.rolls != null) ? meta.rolls : ((lb.rolls != null && isFinite(lb.rolls)) ? lb.rolls : 10);
          rl.rank = (meta.rank != null) ? meta.rank : ((lb.rank != null && isFinite(lb.rank)) ? lb.rank : 8);
          return (rl.weapon || rl.affixes.length) ? rl : null;
        }
      }
      var t = raw.replace(/\s+/g, ' ').trim();
      window.RivenOCR._bottomFlag = /触底/.test(raw0);
      window.RivenOCR._allTop = /全(?:部)?(?:触|到)顶|全顶|全满|满滚|全高|全部高/.test(raw0);
      window.RivenOCR._highLow = /四高|三高|双高|一高|单高/.test(raw0) ? 'high' : (/双低|一低|单低/.test(raw0) ? 'low' : null);
      window.RivenOCR._highN = /四高/.test(raw0) ? 4 : (/三高/.test(raw0) ? 3 : (/双高/.test(raw0) ? 2 : (/一高|单高/.test(raw0) ? 1 : 0)));
      window.RivenOCR._topRows = {};
      var _topRe2 = /到顶|触顶|触底/g, _tmT2;
      while ((_tmT2 = _topRe2.exec(raw0))) {
        var _seg2 = raw0.slice(Math.max(0, _tmT2.index - 8), _tmT2.index);
        var _sm2 = _seg2.match(/([\u4e00-\u9fffA-Za-z]+)$/);
        var _nm2 = _sm2 ? _sm2[1] : '';
        var _mx2 = null;
        for (var _ln2 = 2; _ln2 <= Math.min(_nm2.length, 6) && !_mx2; _ln2++) {
          var _m22 = matchAffix(_nm2.slice(_nm2.length - _ln2));
          if (_m22 && _m22.row) _mx2 = _m22;
        }
        if (_mx2 && _mx2.row) window.RivenOCR._topRows[_mx2.row.drow != null ? _mx2.row.drow : _mx2.row] = true;
      }
      window.RivenOCR._perTop = !!(window.RivenOCR._highN > 0) && Object.keys(window.RivenOCR._topRows).length > 0;
      window.RivenOCR._negAny = /负任意|任意负/.test(raw0);
      var ft = null, _useSh = false;
      var _ftFree = parseFreeText(t);
      var _ftSh = parseShorthand(t);
      if (_ftFree && _ftFree.affixes.length) ft = _ftFree;
      if (_ftSh && _ftSh.affixes.length && (!ft || _ftSh.affixes.length > ft.affixes.length)) { ft = _ftSh; _useSh = true; }
      if (!ft) {
        var _wo = findWeapon(t);
        if (!_wo || !_wo.w) return null;
        var _wx = resFromFree({ weapon: { idx: WEAPONS.indexOf(_wo.w), cn: _wo.w.cn, intl: _wo.w.intl, en: _wo.w.en, cat: _wo.w.cat },
                                affixes: [], rivenName: null }, 'text-weapon');
        _wx.weaponOnly = true;
        _wx.pol = pol;
        _wx.mr = (meta.mr != null) ? meta.mr : 8;
        _wx.rank = (meta.rank != null) ? meta.rank : 8;
        _wx.rolls = (meta.rolls != null) ? meta.rolls : 10;
        return _wx;
      }
      var res = resFromFree(ft, 'text');
      if (res.affixes.length === 2) {
        for (var _zz2 = 0; _zz2 < res.affixes.length; _zz2++) if (res.affixes[_zz2].sign === '-') res.affixes[_zz2].sign = '+';
      } else if (res.affixes.length === 4) {
        var _hasNeg4 = false;
        for (var _q4 = 0; _q4 < 4; _q4++) {
          var _a4 = res.affixes[_q4];
          if (_a4.sign === '-' && _a4.drow !== RECOIL_ROW) { _hasNeg4 = true; break; }
        }
        if (!_hasNeg4 && res.affixes[3].sign === '+') res.affixes[3].sign = '-';
      }
      if (_useSh && /[0-9]/.test(raw)) {
        var _nums = [], _reN = /\d{1,5}(?:\.\d{1,3})?/g, _mN;
        var _src2 = raw.replace(/\s+/g, '');
        while ((_mN = _reN.exec(_src2))) _nums.push(parseFloat(_mN[0]));
        var _pi = 0;
        for (var _k2 = 0; _k2 < res.affixes.length; _k2++) {
          if (res.affixes[_k2].sign === '+') { if (_pi < _nums.length) { res.affixes[_k2].value = String(_nums[_pi]); res.affixes[_k2].isPct = true; } _pi++; }
        }
      }
      res.pol = pol;
      res.bottom = /触底/.test(raw0);
      if (!(res.weapon || res.affixes.length)) return null;
      res.mr = (meta.mr != null) ? meta.mr : 8;
      res.rank = (meta.rank != null) ? meta.rank : 8;
      res.rolls = (meta.rolls != null) ? meta.rolls : 10;
      return res;
    },
    _t: {
      matchAffix: matchAffix, matchWeapon: matchWeapon, parseAffixes: parseAffixes, parseFreeText: parseFreeText, parseShorthand: parseShorthand,
      parseName: parseName, parseLevel: parseLevel, sanitizeFinalAffixes: sanitizeFinalAffixes,
      norm: norm, simScore: simScore, rankWeapon: rankWeapon, rankAffix: rankAffix,
      buildConsensus: buildConsensus, finalResultLines: finalResultLines, affixDisplayName: affixDisplayName,
      lockIconMisread: lockIconMisread, NON_PCT_ROWS: NON_PCT_ROWS, finalize: finalize,
      factionRowOf: factionRowOf, factionSign: factionSign, buildFromRaw: buildFromRaw,
      catsFromAffixes: catsFromAffixes, catsAlive: catsAlive, pickWeaponSmart: pickWeaponSmart,
      weaponValueFit: weaponValueFit, drainToRank: drainToRank, DRAIN2RANK: DRAIN2RANK,
      CAT_NAMES: CAT_NAMES,
      rivenGenLatin: rivenGenLatin, crossCheckName: crossCheckName,
      realPolarity: realPolarity, rollBaseOf: rollBaseOf, levSim: levSim,
      _classifyRows: function (rows, H) {
        var bak = currentImage;
        currentImage = { naturalHeight: H, height: H, width: 632 };
        try { return classifyRows(rows); } finally { currentImage = bak; }
      },
      _classifyWithGlobal: function (rows, H) {
        var bak = currentImage;
        currentImage = { naturalHeight: H, height: H, width: 632 };
        try { return classifyWithGlobal(rows); } finally { currentImage = bak; }
      }
    }
  };
  try { ensureDbgBtn(); } catch (e) { ZKHTML.warn('识别/ocr.js:4663', e); }
})();
