(function () {
  var DISP_ALL = ZKC.disp();
  window.addEventListener('zkdispchange', function () {
    DISP_ALL = ZKC.disp();
    try { render(); } catch (e) { ZKHTML.warn('框架/app.js:dispchange', e); }
  });
  'use strict';
  var D = window.ZKDATA;
  var STATS = D.stats, WEAPONS = D.weapons, FUSION = D.fusion, P = D.params;
  var CATKEY = P.catKey;
var ROLL_FROM = 2, ROLL_TO = 34;
  var NEG_ONLY_ROW = 30;                       // 概率不获得连击数：只能当负面
  var MELEE_POS = window.RULES.ZK_MELEE_POS;
  var RANGED_POS = window.RULES.ZK_RANGED_POS;
  var NON_PCT = window.RULES.NON_PCT;          // 穿透/初始连击/连击持续时间/范围：不带 %
  var RECOIL_ROW = window.RULES.RECOIL_ROW;
  function dirOf(row) { return ZKC.dirOf(row); }
  var IX = {};                                  // 数据表行号 -> stats 下标
  STATS.forEach(function (s, i) { IX[s.row] = i; });
  function st(row) { return STATS[IX[row]]; }
  function squash(s) { return ZKC.norm(s); }
  var esc = ZKHTML.esc;
  function isMelee(cat) { return cat === '近战' || cat === '近战·天工造武'; }
  function alwaysPos(row, cat) {
    if (isFuseRow(row)) return true;      // 融合词条任何类别都永正
    return isMelee(cat) ? MELEE_POS.indexOf(row) >= 0 : RANGED_POS.indexOf(row) >= 0;
  }
  function negOnly(row) { return row === NEG_ONLY_ROW; }
  function colOf(cat) { return ZKC.catCol(cat); }
  function baseOf(row, cat) {
    var i = colOf(cat);
    if (i < 0) return NaN;
    var v = st(row).v[i];
    return (v === null || v === undefined) ? NaN : v;
  }
  var PHYS_ROW_K = { 13: 'impact', 14: 'slash', 15: 'puncture' };
  var _physCache = new Map();
  var _physDbByEn = null, _physDbByCn = null;
  function physDbIndex() {
    if (_physDbByEn) return;
    _physDbByEn = {}; _physDbByCn = {};
    var DB = (window.RIVEN_ROUTER && window.RIVEN_ROUTER.DB) || window.WEAPON_DB || [];
    DB.forEach(function (x) {
      if (x.n) _physDbByEn[String(x.n).toLowerCase()] = x;
      if (x.z) _physDbByCn[x.z] = x;
    });
  }
  function physDbOf(w) {
    if (!w) return null;
    if (w.at) return w;                    // 已经是引擎条目（自制 / 组合枪现场组的那把）
    physDbIndex();
    var en = String(w.en || '').toLowerCase();
    if (_physDbByEn[en]) return _physDbByEn[en];
    if (w.cn && _physDbByCn[w.cn]) return _physDbByCn[w.cn];
    var it = String(w.intl || '').toLowerCase();
    if (_physDbByEn[it]) return _physDbByEn[it];
    return null;
  }
  function physShareOf(w) {
    if (!w) return null;
    var db = physDbOf(w);
    if (!db) return null;
    var ck = db.i || db.n;
    if (ck && _physCache.has(ck)) return _physCache.get(ck);
    var share = { impact: 0, puncture: 0, slash: 0 };
    var forms = [db.at || {}].concat(Object.keys(db.fm || {}).map(function (k) { return db.fm[k]; }));
    forms.forEach(function (a) {
      var d = a.dmg || {}, tot = 0, k;
      for (k in d) if (Object.prototype.hasOwnProperty.call(d, k)) tot += d[k];
      if (!(tot > 0)) return;
      ['impact', 'puncture', 'slash'].forEach(function (t) {
        share[t] = Math.max(share[t], (d[t] || 0) / tot);
      });
    });
    if (ck) _physCache.set(ck, share);
    return share;
  }
  function physRowOK(row, w) {
    var k = PHYS_ROW_K[row];
    if (!k) return true;
    var sh = physShareOf(w);
    if (!sh) return true;
    return sh[k] > 0;
  }
  function physBlockedRows(w) {
    return Object.keys(PHYS_ROW_K).map(Number).filter(function (r) { return !physRowOK(r, w); });
  }
  function rollBase(row, cat) {
    var b = baseOf(row, cat);
    return (isFinite(b) && isFactionRow(row)) ? (b - 1) * 100 : b;
  }
  function toGame(v, row) {
    if (!isFinite(v)) return NaN;
    return isFactionRow(row) ? 1 + v / 100 : v * dirOf(row);
  }
  function fromGame(v, row) {
    if (!isFinite(v)) return NaN;
    return isFactionRow(row) ? (v - 1) * 100 : v * dirOf(row);
  }
  var LANGS = ['国服', '国际服', 'English'];
  var lang = 1;                                 // 默认国际服（与当前 xlsm 的 参数!B28=2 一致）
  window.ZKLANGI = function () { return lang; };
  var wmLangOv = null;                             // null = 跟随界面语言
  window.WM_LANGI = function () { return wmLangOv == null ? lang : wmLangOv; };
  window.WM_LANGSET = function (v) { wmLangOv = v; };
  var STAT_KEY = ['cn', 'intl', 'en'];          // 参数!B28 = 1/2/3
  var WPN_KEY = ['cn', 'intl', 'en'];           // 参数!B29 = 2/1/0
  function sname(row) {
    return st(row)[STAT_KEY[lang]] || st(row).cn;
  }
  function wname(w) { return w[WPN_KEY[lang]] || w.cn || w.en; }
  window.ZKNAME = {
    stat: function (row) { var s = st(row); return s ? (s[STAT_KEY[lang]] || s.cn || s.intl || s.en || '') : ''; },
    weapon: function (w) { return w ? (w[WPN_KEY[lang]] || w.cn || w.intl || w.en || '') : ''; },
    mod: function (o) {
      if (!o) return '';
      if (lang === 2) return o.n || o.en || o.z || o.cn || '';
      return o.z || o.cn || o.n || o.en || '';
    },
    modById: function (id) {
      var list = window.ZKMODS || [];
      for (var i = 0; i < list.length; i++) if (list[i].i === id) return list[i];
      return null;
    },
    statKey: function (k) { var R = window.RIVEN_ROUTER; return R ? R.statNameOf(k, lang) : k; },
    target: function (k) { var R = window.RIVEN_ROUTER; return R ? R.targetNameOf(k, lang) : k; },
    arch: function (id) { var R = window.RIVEN_ROUTER; return R ? R.archNameOf(id, lang) : id; },
    slot: function (k) { var R = window.RIVEN_ROUTER; return R ? R.slotNameOf(k, lang) : k; },
    type: function (k) {
      var W = window.WF;
      if (!W) return k;
      if (lang === 2 && W.TYPE_EN) return W.TYPE_EN[k] || W.TYPE_CN[k] || k;
      return W.TYPE_CN[k] || k;
    }
  };
  var IS_VAR = '变体·有本体';
  var OPENABLE = WEAPONS.filter(function (w) { return w.var !== IS_VAR; });
  window.ZKOPENABLE = OPENABLE;      /* 只能开出本体 / 变体无本体； */
  window.ZK_SEL = null;
  window.ZKSGW = function (w) {
    if (!w || w === window.ZK_SEL) return;
    window.ZK_SEL = w;
    var A = window.ZKSGXAPI;
    if (A && A.follow) A.follow();
  };
  var OPEN_CAT = '';   // 开紫卡类别筛选（'' = 全部 / '近战' / '步枪' / '霰弹' / '手枪' / '曲翼' / 'Zaw' / '组合枪'）
  var ZAW_NAMES = window.RULES.ZK_ZAW_NAMES;
  var KIT_NAMES = window.RULES.ZK_KIT_NAMES;
  function isZaw(w) { return ZAW_NAMES.indexOf(w.bintl) >= 0; }
  function isKit(w) { return KIT_NAMES.indexOf(w.bintl) >= 0; }
  var COMPANION_NAMES = window.RULES.ZK_COMPANION_NAMES;
  function isCompanion(w) { return COMPANION_NAMES.indexOf(w.bintl) >= 0; }
  var BASE_KEY = ['bcn', 'bintl', 'ben'];
  function baseName(w) {
    if (!w) return '';
    var k = BASE_KEY[lang];
    return (w[k] || w.bcn || w.ben || w[WPN_KEY[lang]] || w.cn || w.en || '');
  }
  function isVariant(w) { return !!w && w.var === IS_VAR; }
  function histDispOf(w) {
    if (!w) return NaN;
    var i = WEAPONS.indexOf(w);
    if (i >= 0 && D.dispSnapshot && D.dispSnapshot.length > i) {
      var v = D.dispSnapshot[i];
      if (v != null && isFinite(v)) return v;
    }
    return isFinite(w.disp) ? w.disp : NaN;
  }
  function autoCmpForVariant(w) {
    if (!w) return;
    if (ZKC.isUnified()) {                       /* 统一版：对比这把武器在博物馆里的历史倾向 */
      var d = histDispOf(w);
      if (isFinite(d)) K.cmp = d;
      return;
    }
    var base = baseName(w);
    var fallback = null;
    if (base) {
      for (var i = 0; i < WEAPONS.length; i++) {
        var v = WEAPONS[i];
        if (v === w || baseName(v) !== base || !isFinite(v.disp)) continue;
        if (v.var === IS_VAR) { K.cmp = v.disp; return; }
        if (fallback === null) fallback = v.disp;
      }
    }
    K.cmp = (fallback === null) ? '' : fallback;
  }
  var NAME2ROW = {};
  STATS.forEach(function (s) {
    [s.cn, s.intl, s.en].forEach(function (n) { if (n) NAME2ROW[squash(n)] = s.row; });
  });
  function rowOfName(nm) {
    var r = NAME2ROW[squash(nm)];
    return r == null ? ZKC.matchStat(nm, STATS) : r;
  }
  function findWeapon(q) { return ZKC.matchWeapons(q, WEAPONS, 40); }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
  }
  var COMBO_POS = [2, 2, 3, 3], COMBO_NEG = [0, 1, 0, 1];
  function comboIdxOf(nPos, nNeg) { return nPos >= 3 ? (nNeg ? 3 : 2) : (nNeg ? 1 : 0); }
  function fmt(v, row) {
    if (v == null || !isFinite(v)) return '';
    if (isFactionRow(row)) return '×' + v.toFixed(2);
    var s = (v >= 0 ? '+' : '-') + Math.abs(v).toFixed(2);
    return NON_PCT.indexOf(row) >= 0 ? s : s + '%';
  }
  function n2(v, d) { return (v == null || !isFinite(v)) ? '' : Number(v).toFixed(d == null ? 2 : d); }
  function nz(v, d) {
    if (v == null || !isFinite(v)) return '';
    var s = Number(v).toFixed(d == null ? 4 : d);
    return s.indexOf('.') < 0 ? s : s.replace(/0+$/, '').replace(/\.$/, '');
  }
  function inpNum(v, row) {
    if (!isFinite(v)) return '';
    return isFactionRow(row) ? toGame(v, row).toFixed(4) : n2(toGame(v, row));
  }
  function kfmt(v, row) {
    if (!isFinite(v)) return '';
    if (isFactionRow(row)) return '×' + toGame(v, row).toFixed(2);
    return n2(toGame(v, row));
  }
  function rcardHtml(name, items, emptyTxt, rerolls, corners, mr, rank) {
    var _polSrc = POL_ICONS[2].src;
    for (var _q = 0; _q < POL_ICONS.length; _q++) if (POL_ICONS[_q].k === K.pol) { _polSrc = POL_ICONS[_q].src; break; }
    var h = '<div class="rcard">'
      + '<img class="rcard-art" src="data:image/webp;base64,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" alt="紫卡卡面" width="316" height="400">'
      + (corners ? '<div class="rcard-corner rc-tr">' + (10 + (rank == null ? 8 : rank)) + '<img class="rc-ico-img" src="' + _polSrc + '"/></div>'
      + '<div class="rcard-corner rc-tl">' + (LANGS[lang] === 'English' ? 'MR ' + (mr || 8) : '段位 ' + (mr || 8)) + '</div>'
      + (isFinite(rerolls) ? '<div class="rcard-corner rc-br"><svg class="rc-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.34-5.66"/><path d="M4 4v5h5"/></svg><span class="rc-n">' + rerolls + '</span></div>' : '')
      : '') + '<div class="rcard-txt">'
      + '<div class="rcard-name">' + esc(name || '—') + '</div>';
    var any = false;
    for (var i = 0; i < items.length; i++) {
      var it = items[i], v = parseFloat(it && it.val);
      if (!it || !isFinite(v)) continue;
      any = true;
      var sv = kfmt(v, it.row);
      if (!isFactionRow(it.row)) {
        sv = (it.row === RECOIL_ROW)
          ? (/^-/.test(sv) ? sv : '+' + sv)
          : (it.neg ? '−' : '+') + sv.replace(/^-/, '');
        if (NON_PCT.indexOf(it.row) < 0) sv += '%';
      }
      h += '<div class="rcard-line ' + (it.neg ? 'neg' : 'pos') + '">'
        + (it.row === 48 ? esc(sname(it.row)) + ' ' + esc(sv) : esc(sv) + ' ' + esc(sname(it.row))) + '</div>';
    }
    if (!any) h += '<div class="rcard-line none">' + esc(emptyTxt || '还没有词条') + '</div>';
    return h + '</div></div>';
  }
/* ① 洗卡模拟器 */
  function newCard() {
    return { w: null, slots: [null, null, null, null], locks: [false, false, false, false],
             products: [], combo: { gain: P.combo[3].gain, neg: P.combo[3].neg },
             fus: [0, 0], note: '', rerolls: 0, kuva: 0 };
  }
  function isFuseRow(row) { return ZKC.isFuseRow(row); }
  function prejudgeLocks(rows, srcLocks) {
    var out = [false, false, false, false], normal = 0;
    for (var i = 0; i < 4; i++) {
      var r = +((rows || [])[i] || 0);
      if (!r) continue;
      if (isFuseRow(r)) { out[i] = true; continue; }
      if (srcLocks && srcLocks[i]) {
        if (normal >= 1) continue;
        out[i] = true; normal++;
      }
    }
    return out;
  }
  var KUVA_TAB = [900, 1000, 1200, 1400, 1700, 2000, 2350, 2750, 3150, 3500];
  function rollCost(card) {
    var r = card.rerolls;
    if (!isFinite(r) || r < 0) r = 0;
    var base = (r < KUVA_TAB.length) ? KUVA_TAB[r] : 3500;
    for (var i = 0; i < 4; i++) {
      var s = card.slots[i];
      if (card.locks[i] && s && !(isFuseRow(s.row)))
        return base * 2;   // 仅基础词条锁定翻倍；
    }
    return base;
  }
  function kuvaFmt(n) {
    n = Math.round(n) || 0;
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  var C = { 1: newCard(), 2: newCard(), 3: newCard(), 4: newCard() };
  function mkVal(row, coef, disp, cat) {
    var b = rollBase(row, cat), vol = P.lo + Math.random() * (P.hi - P.lo);
    return b * coef * disp * vol;
  }
  function volOf(card, i) {
    var s = card.slots[i];
    if (!s || !card.w) return P.mid;
    var b = rollBase(s.row, card.w.cat), d = ZKC.disp(card.w);
    var coef = (i === 3) ? card.combo.neg : card.combo.gain;
    if (!isFinite(b) || !b || !isFinite(d) || !d || !isFinite(coef) || !coef) return P.mid;
    var v = s.val / (b * coef * d);
    if (!isFinite(v)) return P.mid;
    return Math.max(P.lo, Math.min(P.hi, v));
  }
  function genStats(card, useLock) {
    var w = card.w, ci = colOf(w.cat);
    if (ci < 0) { card.slots = [null, null, null, null]; return; }
    var nPos, nNeg, ci2, anyLock = false, i;
    if (useLock) for (i = 0; i < 4; i++) if (card.locks[i] && card.slots[i]) anyLock = true;
    if (anyLock) {                                  // 有锁定 -> 冻结组合类型
      nPos = 0;
      for (i = 0; i < 3; i++) if (card.slots[i]) nPos = i + 1;
      nNeg = card.slots[3] ? 1 : 0;
      if (nPos < 2) nPos = 2;
      ci2 = comboIdxOf(nPos, nNeg);
    } else {
      ci2 = Math.floor(Math.random() * 4);          // 四种组合等概率
      nPos = COMBO_POS[ci2]; nNeg = COMBO_NEG[ci2];
    }
    card.combo = { gain: P.combo[ci2].gain, neg: P.combo[ci2].neg };
    var pool = [], npool = [];
    for (var row = ROLL_FROM; row <= ROLL_TO; row++) {
      if (!isFinite(baseOf(row, w.cat))) continue;   // 闸①基准值为空（该类别没这条属性）
      if (!physRowOK(row, w)) continue;
      var used = false;
      for (i = 0; i < 4; i++)
        if (useLock && card.locks[i] && card.slots[i] && card.slots[i].row === row) used = true;
      if (used) continue;
      if (!negOnly(row)) pool.push(row);             // 正面池剔除永负
      if (!alwaysPos(row, w.cat)) npool.push(row);   // 负面池剔除永正
    }
    shuffle(pool); shuffle(npool);
    var pi = 0, chosen = [];
    for (i = 0; i < 3; i++) {
      if (useLock && card.locks[i]) { if (card.slots[i]) chosen.push(card.slots[i].row); continue; }
      if (i < nPos) {
        if (pi >= pool.length) break;
        var r = pool[pi++]; chosen.push(r);
        card.slots[i] = { row: r, name: sname(r), val: mkVal(r, card.combo.gain, ZKC.disp(w), w.cat) };
      } else card.slots[i] = null;
    }
    if (!(useLock && card.locks[3])) {
      if (nNeg === 1 && npool.length) {
        var pick = 0;
        for (var n = 0; n < npool.length; n++) if (chosen.indexOf(npool[n]) < 0) { pick = n; break; }
        var nr = npool[pick];
        card.slots[3] = { row: nr, name: sname(nr), val: mkVal(nr, card.combo.neg, ZKC.disp(w), w.cat) };
      } else card.slots[3] = null;
    }
    card.products = [];
    card.fus = [0, 0];
    card.note = '';                                 // 洗一次就把上一条融合提示清掉
  }
  var BASE_ELEM_ROWS = [9, 10, 11, 12];
  function baseElemOthers(card, exceptIdx) {
    var n = 0;
    for (var i = 0; i < 4; i++)
      if (i !== exceptIdx && card.slots[i] && BASE_ELEM_ROWS.indexOf(card.slots[i].row) >= 0) n++;
    return n;
  }
  function fillSlot(card, idx) {
    var w = card.w, ci = colOf(w.cat);
    if (ci < 0) return;
    var isNeg = (idx === 3);
    var pool = [];
    for (var row = ROLL_FROM; row <= ROLL_TO; row++) {
      if (!isFinite(baseOf(row, w.cat))) continue;   // 闸①基准值为空
      if (!physRowOK(row, w)) continue;
      if (isNeg ? alwaysPos(row, w.cat) : negOnly(row)) continue;
      if (BASE_ELEM_ROWS.indexOf(row) >= 0 && baseElemOthers(card, idx) >= 2) continue;  // 一条紫卡最多 2 个基础元素（#9）
      var dup = false;
      for (var i = 0; i < 4; i++)
        if (i !== idx && card.slots[i] && card.slots[i].row === row) dup = true;
      if (!dup) pool.push(row);
    }
    if (!pool.length) { card.slots[idx] = null; return; }
    var r = pool[Math.floor(Math.random() * pool.length)];
    var coef = isNeg ? card.combo.neg : card.combo.gain;
    card.slots[idx] = { row: r, name: sname(r), val: mkVal(r, coef, ZKC.disp(w), w.cat) };
  }
  function rowAvailable(row, cat) { return isFinite(baseOf(row, cat)); }
  var FUSE_MAP = {};
  FUSION.forEach(function (f) {
    var a = rowOfName(f.a), b = rowOfName(f.b), c = rowOfName(f.c);
    if (!a || !b || !c) return;
    var lo = a < b ? a : b, hi = a < b ? b : a;
    (FUSE_MAP[lo + ',' + hi] = FUSE_MAP[lo + ',' + hi] || []).push(c);
  });
  var FUSE_PARTNER = null;
  function fusePartners(cat, row) {
    if (!FUSE_PARTNER) {
      FUSE_PARTNER = {};
      FUSION.forEach(function (f) {
        var a = rowOfName(f.a), b = rowOfName(f.b), c = rowOfName(f.c);
        if (!a || !b || !c) return;
        (FUSE_PARTNER[a] = FUSE_PARTNER[a] || []).push({ row: b, prod: c });
        (FUSE_PARTNER[b] = FUSE_PARTNER[b] || []).push({ row: a, prod: c });
      });
    }
    var out = (FUSE_PARTNER[row] || []).filter(function (p) { return rowAvailable(p.prod, cat); });
    out.sort(function (x, y) { return x.row - y.row; });
    return out;
  }
  function fuseProd(cat, r1, r2) {
    if (!r1 || !r2 || r1 === r2) return 0;
    var lo = r1 < r2 ? r1 : r2, hi = r1 < r2 ? r2 : r1;
    var list = FUSE_MAP[lo + ',' + hi] || [];
    for (var i = 0; i < list.length; i++) if (rowAvailable(list[i], cat)) return list[i];
    return 0;
  }
  function hasFuseOnCard(card) {
    for (var i = 0; i < 4; i++)
      if (card.slots[i] && isFuseRow(card.slots[i].row)) return true;
    return false;
  }
  function doFusion(blk) {
    var card = C[blk];
    function say(t) { card.note = t; render(); }     // 写状态再重绘，别直接写 DOM
    var s1 = card.fus[0], s2 = card.fus[1];
    if (!s1 || !s2 || s1 === s2) { say('请在两个「融合词条」下拉里各选一个不同的词条。'); return; }
    var w = card.w;
    if (!w) { say('这个区还没有武器，先开卡或洗卡。'); return; }
    var r1 = s1, r2 = s2, ci = colOf(w.cat);
    var prRow = 0;
    for (var k = 0; k < FUSION.length; k++) {
      var fa = rowOfName(FUSION[k].a), fb = rowOfName(FUSION[k].b);
      if ((fa === r1 && fb === r2) || (fa === r2 && fb === r1)) {
        var pc = rowOfName(FUSION[k].c);
        if (pc && isFinite(baseOf(pc, w.cat))) { prRow = pc; break; }
      }
    }
    if (!prRow) {
      say('融合表里没有这对组合（或者这类武器出不了对应的融合属性）：'
        + esc(sname(r1)) + ' + ' + esc(sname(r2)));
      return;
    }
    for (var i = 0; i < 4; i++)
      if (card.slots[i] && isFuseRow(card.slots[i].row)) {
        say('这张卡上已经有一条融合词条「' + esc(card.slots[i].name)
          + '」了，每张紫卡最多只能带一个融合词条。');
        return;
      }
    if (card.products.length >= 6) { say('产物栏已满（6 条）。'); return; }
    var m1 = -1, m2 = -1;
    for (i = 0; i < 4; i++) {
      if (card.slots[i] && card.slots[i].row === r1) m1 = i;
      if (card.slots[i] && card.slots[i].row === r2) m2 = i;
    }
    if (m1 < 0 || m2 < 0) { say('所选词条已经不在当前卡面上了，请重新选择。'); return; }
    pushHist();                                  // 到这儿才算真要改卡面，前面的都是校验
    var mp = (m1 === 3) ? m2 : m1;               // 产物进「正面材料」槽
    var mo = (m1 === 3) ? m1 : m2;               // 另一槽被消耗
    var b = rollBase(prRow, w.cat);
    var vol = Math.max(volOf(card, m1), volOf(card, m2));
    var v = b * card.combo.gain * ZKC.disp(w) * vol;
    card.slots[mp] = { row: prRow, name: sname(prRow), val: v };
    card.locks[mp] = true;
    card.locks[mo] = false;                      // 被消耗的槽先解锁
    fillSlot(card, mo);                          // 再补一条同正负的新词条
    card.products.push({ row: prRow, name: sname(prRow), val: v });
    card.fus = [0, 0];
    say('<span class="ok">融合成功：' + esc(sname(prRow)) + ' ' + fmt(toGame(v, prRow), prRow) + '</span>');
  }
  function copyToCalc(blk) {
    var card = C[blk];
    if (!card.w) { card.note = '这个区还没有武器，先开卡或洗卡。'; render(); return; }
    K.w = card.w;
    K.manual = '';                     // 换武器 手填倾向清空，回到全库统一的 1.2
    autoCmpForVariant(K.w);            // 对比历史倾向 自动填这把武器在博物馆里的历史值
    K.rank = P.maxRank;
    var ci = 0;
    for (var i = 0; i < P.combo.length; i++)
      if (Math.abs(P.combo[i].gain - card.combo.gain) < 1e-9
        && Math.abs(P.combo[i].neg - card.combo.neg) < 1e-9) { ci = i; break; }
    K.comboIdx = ci;
    K.rolls = card.rerolls || 0; K.kuva = card.kuva || 0;
    for (i = 0; i < 4; i++) {
      var s = card.slots[i];
      K.rows[i] = s ? s.row : 0;
      K.vals[i] = s ? String(s.val) : '';   // 用完整精度，别先四舍五入
    }
    K.locks = prejudgeLocks(K.rows, card.locks);
    card.note = '<span class="ok">已复制到计算器：' + esc(wname(card.w)) + ' · '
      + esc(P.combo[ci].name) + ' · 按满级口径'
      + (K.locks[0] || K.locks[1] || K.locks[2] || K.locks[3] ? ' · 锁定已带过去' : '')
      + '</span>';
    render();
    var host = document.getElementById('calc');
    if (host && host.scrollIntoView) {
      try { host.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { ZKHTML.warn('框架/app.js:778', e); }
    }
  }
  function rivenAffix(r, key) { return st(r)[key] || ''; }
  function rivenCore(r, fb) {
    var c = st(r).core;
    if (c && !/xx/i.test(c) && c.indexOf('占位') < 0) return c;
    return rivenAffix(r, fb);
  }
  function rivenNameOf(bn, rows) {
    var n = rows.length;
    if (!bn || !n) return '';
    var g = (LANGS[lang] === '国服');
    function a(r, fb) { return g ? rivenCore(r, fb) : rivenAffix(r, fb); }
    var res = bn + ' ' + a(rows[0], 'pre');
    if (n === 1) return res;
    if (n === 2) return res + (g ? '·' : '') + a(rows[1], 'suf').toLowerCase();
    return res + '-' + a(rows[1], 'pre').toLowerCase()
      + (g ? '·' : '') + a(rows[2], 'suf').toLowerCase();
  }
  function rivenName(card) {
    var w = card.w; if (!w) return '';
    var ci = colOf(w.cat); if (ci < 0) return '';
    var list = [];
    for (var i = 0; i < 3; i++) {
      var s = card.slots[i]; if (!s) continue;
      var bs = rollBase(s.row, w.cat);
      if (isFinite(bs) && bs > 0) list.push({ row: s.row, ratio: s.val / bs });
    }
    if (!list.length) return '';
    list.sort(function (a, b) { return b.ratio - a.ratio; });
    return rivenNameOf(baseName(w), list.map(function (x) { return x.row; }));
  }
  var K = { w: null, manual: '', comboIdx: 3, rank: 8, mr: 8, rolls: 10, cmp: ZKC.disp(), pol: 'madurai',
            rows: [0, 0, 0, 0], vals: ['', '', '', ''],
            locks: [false, false, false, false] };
  function kDisp() {
    if (K.manual !== '' && isFinite(parseFloat(K.manual))) return parseFloat(K.manual);
    return K.w ? ZKC.disp(K.w) : DISP_ALL;
  }
  function lists() {
    var ci = K.w ? colOf(K.w.cat) : -1;
    var out = [[], [], [], []];
    if (ci < 0) return out;
    var posSet = (CATKEY[K.w.cat] === '近战·天工造武') ? MELEE_POS : RANGED_POS;
    var r0 = K.rows[0], r1 = K.rows[1], r2 = K.rows[2], r3 = K.rows[3];
    for (var row = 2; row <= 52; row++) {
      if (!isFinite(baseOf(row, K.w.cat))) continue;                  // 闸①基准值为空
      if (!physRowOK(row, K.w)) continue;
      var nm = sname(row);
      if (row !== NEG_ONLY_ROW) {                                  // 正面槽：排除永负(30)
        if ([r1, r2, r3].indexOf(row) < 0) out[0].push({ row: row, name: nm });  // N5 -> B17
        if ([r0, r2, r3].indexOf(row) < 0) out[1].push({ row: row, name: nm });  // Q5 -> B18
        if ([r0, r1, r3].indexOf(row) < 0) out[2].push({ row: row, name: nm });  // O5 -> B19
      }
      if (row <= ROLL_TO && posSet.indexOf(row) < 0 && [r0, r1, r2].indexOf(row) < 0)
        out[3].push({ row: row, name: nm });
    }
    return out;
  }
  function theory(row, which) {
    var ci = K.w ? colOf(K.w.cat) : -1;
    if (ci < 0 || !row) return NaN;
    var b = rollBase(row, K.w.cat), c = P.combo[K.comboIdx];
    var isNeg = (row === K.rows[3]);
    var coef = isNeg ? c.neg : c.gain;
    var k0 = b * coef * kDisp() / 9 * (1 + K.rank);
    if (which === 'mid') return k0 * P.mid;
    var lo = k0 * P.lo, hi = k0 * P.hi;
    var glo = toGame(lo, row), ghi = toGame(hi, row);
    if (!isFinite(glo) || !isFinite(ghi)) return NaN;
    return which === 'min' ? (glo <= ghi ? lo : hi) : (glo >= ghi ? lo : hi);
  }
  function theoryGain(row) {
    var ci = K.w ? colOf(K.w.cat) : -1;
    if (ci < 0 || !row) return NaN;
    var b = rollBase(row, K.w.cat), c = P.combo[K.comboIdx];
    var coef = (row === K.rows[3]) ? c.neg : c.gain;
    return b * coef * P.hi * kDisp() / 9 * (1 + K.rank);
  }
  function calcDevs() {
    var out = [];
    for (var i = 0; i < 4; i++) {
      var r = K.rows[i], cv = parseFloat(K.vals[i]);
      var md = theory(r, 'mid');
      if (!r || !isFinite(cv) || !isFinite(md) || md === 0) continue;
      out.push({ i: i, row: r, cv: cv, md: md, g: (i === 3) ? (1 - cv / md) : (cv / md - 1), neg: (i === 3) });
    }
    return out;
  }
  function grade(g) {
    for (var i = 0; i < P.grades.length; i++) if (g >= P.grades[i].th) return P.grades[i].name;
    return P.grades[P.grades.length - 1].name;
  }
  function gClass(n) { return 'g-' + String(n).slice(-1); }
  function calcName() {
    if (!K.w) return '';
    var ci = colOf(K.w.cat); if (ci < 0) return '';
    var list = [];
    for (var i = 0; i < 3; i++) {
      var r = K.rows[i]; if (!r) continue;
      var mx = theoryGain(r);
      var c = parseFloat(K.vals[i]);
      if (isFinite(mx) && mx !== 0 && isFinite(c)) list.push({ row: r, ratio: c / mx });
    }
    if (!list.length) return '';
    list.sort(function (a, b) { return b.ratio - a.ratio; });
    return rivenNameOf(baseName(K.w), list.map(function (x) { return x.row; }));
  }
  function posLine(row, val, neg) {
    var sv = kfmt(val, row);
    if (!isFactionRow(row)) {
      sv = (row === RECOIL_ROW) ? (/^-/.test(sv) ? sv : '+' + sv)
        : (neg ? '−' : '+') + sv.replace(/^-/, '');
      if (NON_PCT.indexOf(row) < 0) sv += '%';
    }
    return sname(row) + ' ' + sv;
  }
  function kopylist(btn) {
    var o0 = btn ? btn.innerHTML : '';
    if (!K.w) { if (btn) { btn.innerHTML = '未选武器'; setTimeout(function () { btn.innerHTML = o0; }, 1200); } return; }
    var lines = [];
    lines.push('武器名称：' + wname(K.w));
    var hasP = false, hasN = false, i, r, v;
    for (i = 0; i < 3; i++) {
      r = K.rows[i]; v = parseFloat(K.vals[i]);
      if (!r || !isFinite(v)) continue;
      hasP = true;
      lines.push('正面词条：' + posLine(r, v, false));
    }
    if (!hasP) lines.push('正面词条：—');
    if (K.rows[3] && isFinite(parseFloat(K.vals[3]))) {
      hasN = true;
      lines.push('负面词条：' + posLine(K.rows[3], parseFloat(K.vals[3]), true));
    }
    if (!hasN) lines.push('负面词条：无负面词条');
    lines.push('裂罅Mod名称：' + (calcName() || baseName(K.w)));
    lines.push('精通段位：' + K.mr);
    lines.push('Mod等级：' + K.rank);
    lines.push('循环次数：' + (K.rolls || 0));
    lines.push('极性：' + polName(K.pol));   /* 语言判断：国服(lang=0)用中文译名，国际服/English 用拉丁名 */
    var txt = lines.join('\n');
    var ta = document.createElement('textarea');
    ta.value = txt;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ZKHTML.warn('框架/app.js:988', e); }
    document.body.removeChild(ta);
    if (btn) {
      btn.innerHTML = ok ? '已复制 ✓' : '复制失败';
      setTimeout(function () { btn.innerHTML = o0; }, 1200);
    }
  }
  function fillC2FromK() {
    var s = [null, null, null, null], rows = [0, 0, 0, 0], i;
    var _rk = isFinite(parseFloat(K.rank)) ? Math.min(P.maxRank, Math.max(0, parseFloat(K.rank))) : P.maxRank;
    var _lv = (P.maxRank + 1) / (_rk + 1);
    for (i = 0; i < 4; i++)
      if (K.rows[i] && isFinite(parseFloat(K.vals[i]))) {
        s[i] = { row: K.rows[i], val: parseFloat(K.vals[i]) * _lv };
        rows[i] = K.rows[i];
      }
    var _sameW = (C[2].w === K.w);
    C[2].w = K.w;
    C[2].slots = s;
    var _lk = prejudgeLocks(rows, K.locks), _nLock = 0;
    for (i = 0; i < 4; i++) if (_lk[i] && s[i]) _nLock++;
    C[2].locks = _lk;
    if (!_sameW) C[2].fus = [0, 0];
    C[2].combo = P.combo[K.comboIdx] ? { gain: P.combo[K.comboIdx].gain, neg: P.combo[K.comboIdx].neg } : C[2].combo;
    C[2].products = [];
    C[2].note = (_nLock ? ('已导入并自动锁定 ' + _nLock + ' 条词条（融合词条必锁）') : '')
      + (_lv > 1.000001 ? ((_nLock ? '　' : '') + '数值已按满级折算（计算器当前 ' + _rk + ' 级）') : '');
    C[2].rerolls = K.rolls || 0; C[2].kuva = K.kuva || 0;
  }
  var FN_SECS = ['ranges', 'calc', 'open', 'dmg', 'choose', 'price'];
  var FN_ORDER = (function () {
    try { var _o = JSON.parse(localStorage.getItem('zkm_fnorder')); if (_o && _o.length === FN_SECS.length && FN_SECS.indexOf(_o[0]) >= 0) return _o; } catch (e) { ZKHTML.warn('框架/app.js:1026', e); }
    return FN_SECS.slice();
  })();
  function fnApplyOrder() {
    var main = document.querySelector('.wrap') || document.body;
    var about = document.getElementById('about');
    var els = FN_ORDER.map(function (id) { return document.getElementById(id); }).filter(Boolean);
    els.forEach(function (el) { if (about && el !== about) main.insertBefore(el, about); });
    els.forEach(function (el, i) {
      var n = el.querySelector('.sec-n');
      if (n) n.textContent = String(i + 1).padStart(2, '0');
    });
    var nav = document.getElementById('topNav');
    if (nav) {
      var inner = nav.querySelector('.nav-inner');
      FN_ORDER.forEach(function (id) {
        var a = nav.querySelector('a[href="#' + id + '"]');
        if (a && inner) inner.appendChild(a);
      });
      var ab = nav.querySelector('a[href="#about"]');
      if (ab && inner) inner.appendChild(ab);
    }
  }
  function fnMove(t) {
    var fid = t.getAttribute('data-fn'), dir = t.getAttribute('data-b');
    var i = FN_ORDER.indexOf(fid);
    var j = dir === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= FN_ORDER.length) return;
    FN_ORDER[i] = FN_ORDER[j]; FN_ORDER[j] = fid;
    try { localStorage.setItem('zkm_fnorder', JSON.stringify(FN_ORDER)); } catch (e) { ZKHTML.warn('框架/app.js:1055', e); }
    fnApplyOrder();
  }
  function gotoPickFromCalc(btn) {
    var o0 = btn ? btn.innerHTML : '';
    if (!K.w) { if (btn) { btn.innerHTML = '未选武器'; setTimeout(function () { btn.innerHTML = o0; }, 1200); } return; }
    fillC2FromK();       // 复制 K C[2]（武器 + 4 词条 + 数值 + combo，次数清零）
    ACTIVE_BLK = 2;      // 继续洗卡右栏显示 C[2]
    render(); commit();  // 立即渲染出计算器这张卡
    var host = document.getElementById('q1');
    if (host && host.scrollIntoView) { try { host.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { ZKHTML.warn('框架/app.js:1069', e); } }
    if (location.hash !== '#open') { try { location.hash = 'open'; } catch (e) { ZKHTML.warn('框架/app.js:1070', e); } }
    if (btn) { btn.innerHTML = '已复制到继续洗卡'; setTimeout(function () { btn.innerHTML = o0; }, 1200); }
  }
  function importToDmg(btn) {
    var o0 = btn ? btn.innerHTML : '';
    function say(msg) { if (btn) { btn.innerHTML = msg; setTimeout(function () { btn.innerHTML = o0; }, 1400); } }
    if (!K.w) { say('未选武器'); return; }
    var wi = WEAPONS.indexOf(K.w);          /* K.w 是 WEAPONS 里的引用，indexOf 直接可用 */
    if (wi < 0) { say('没找到这把武器'); return; }
    if (typeof dmgImportHook !== 'function') { say('收益计算器未就绪'); return; }
    var ok = dmgImportHook({ wi: wi, comboIdx: K.comboIdx, rows: K.rows.slice(), vals: K.vals.slice() });
    if (ok === false) { say('这把武器没有基础数值'); return; }
    say('已导入收益计算器');
    var sec = document.getElementById('dmg');
    if (sec && sec.scrollIntoView) { try { sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { ZKHTML.warn('框架/app.js:1087', e); } }
    if (location.hash !== '#dmg') { try { location.hash = 'dmg'; } catch (e) { ZKHTML.warn('框架/app.js:1088', e); } }
  }
  function washFromRange() {
    if (!RG.w) { alert('先在区间表左边选一把武器。'); return; }
    var ri = WEAPONS.indexOf(RG.w);
    if (ri < 0) { alert('没找到这把武器。'); return; }
    pick1(ri);   // 填 C[2]、ACTIVE_BLK=2、洗一次
    var o3 = document.getElementById('open');
    if (o3 && o3.scrollIntoView) { try { o3.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { ZKHTML.warn('框架/app.js:1098', e); } }
    if (location.hash !== '#open') { try { location.hash = 'open'; } catch (e) { ZKHTML.warn('框架/app.js:1099', e); } }
  }
  var RIVEN_TIER = {
    '近战': {
      T1: [5, 8, 34], T2: [4, 2],
      T3: [3, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 6, 7, 27, 31, 32, 24, 23, 21, 22, 25, 20],   // #13 行28(连击持续时间)/行33(处决伤害)引擎标 dead 不进 DPS，移出正向推荐避免误导
      neg: { no: [33, 32, 28, 18], minor: [6, 7, 16, 14], fatal: [2, 4, 5, 34, 8, 27, 30] }   // #18 行31(重击效率)只进 T3，移出负向两档
    },
    '_default': {
      T1: [19, 2, 4, 5], T2: [9, 10, 11, 12, 8, 6, 7],
      T3: [3, 13, 14, 15, 16, 17, 18, 23, 21, 22, 24, 25, 20, 27, 28, 31, 47, 48, 49],
      neg: { no: [18, 20, 22], minor: [6, 7, 16, 25], fatal: [2, 4, 5, 19, 8] }
    }
  };
  function rivenRecHtml() {
    if (!K.w) return '<details open class="calc-fold"><summary class="calc-sub"><span class="dot dot-gold"></span>词条详情推荐'
      + ' <em>选一把武器后按类别给推荐</em><span class="fold-arr"></span></summary>'
      + '<div class="calc-fold-body"></div></details>';
    var cat = K.w.cat, t = RIVEN_TIER[cat] || RIVEN_TIER['_default'];
    var tag = function (r) { var nm = sname(r) || ('词条' + r); return '<span class="rec-tag">' + esc(nm) + '</span>'; };
    var row = function (label, list, warn) {
      return '<div class="rec-row"><span class="rec-t' + (warn ? ' rec-warn' : '') + '">' + label + '</span>'
        + list.map(tag).join('') + '</div>';
    };
    return '<details open class="calc-fold"><summary class="calc-sub"><span class="dot dot-gold"></span>词条详情推荐'
      + ' <em>' + esc(cat) + ' · 分档推荐</em><span class="fold-arr"></span></summary>'
      + '<div class="calc-fold-body"><div class="riven-rec">'
      + '<div class="rec-block"><span class="rec-h">正面词条优先级</span>'
      + row('T1', t.T1) + row('T2', t.T2) + row('T3', t.T3)
      + '</div>'
      + '<div class="rec-block"><span class="rec-h">推荐负面</span>'
      + row('无伤负', t.neg.no) + row('小伤负', t.neg.minor) + row('致命负', t.neg.fatal, true)
      + '</div></div></div></details>';
  }
  function decompOf(mr, rank, rolls) {
    var m = Math.max(0, (+mr || 8) - 8);
    var r = Math.max(0, Math.min(P.maxRank, (+rank || 0)));
    var c = Math.max(0, Math.floor(+rolls || 0));
    var a = 100 * m;                              /* 段位项：0 ~ 800 */
    var b = Math.floor(22.5 * Math.pow(2, r));    /* 等级项：22 ~ 5,760 */
    var d = 200 * c;                              /* 循环项：洗一次 +200 */
    var total = a + b + d - 7;
    return { a: a, b: b, d: d, mr: (+mr || 8), rank: r, rolls: c,
             endo: total > 0 ? Math.floor(total) : 0 };
  }
  function decompInvested(rank) { return 30 * (Math.pow(2, Math.max(0, rank)) - 1); }
  var DK = { mr: null, rank: null, rolls: null };
  var DKSIG = null;
  function decompSync() {
    var sig = (+K.mr || 8) + '|' + (+K.rank || 0) + '|' + (+K.rolls || 0);
    if (sig !== DKSIG) {
      DK.mr = +K.mr || 8;
      DK.rank = +K.rank || 0;
      DK.rolls = +K.rolls || 0;
      DKSIG = sig;
    }
  }
  function decompGrp(v) { return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function decompCalc() {
    var mr = Math.max(8, Math.min(16, Math.round(+DK.mr || 8)));
    var rank = Math.max(0, Math.min(P.maxRank, Math.round(+DK.rank || 0)));
    var rolls = Math.max(0, Math.round(+DK.rolls || 0));
    var d = decompOf(mr, rank, rolls);
    d.mr = mr; d.rank = rank; d.rolls = rolls;
    d.inv = decompInvested(rank);
    d.diff = d.endo - d.inv;
    d.ratio = d.inv > 0 ? Math.round(d.endo / d.inv * 100) : 0;
    return d;
  }
  function decompPaint() {
    var d = decompCalc(), grp = decompGrp;
    var g = function (id, t) { var el = document.getElementById(id); if (el) el.textContent = t; };
    g('dkv-a', grp(d.a)); g('dkv-b', grp(d.b)); g('dkv-d', grp(d.d));
    g('dk-total', grp(d.endo)); g('dk-num', grp(d.endo));
    g('dk-eq-a', '100 × (卡面段位 ' + d.mr + ' − 8)');
    g('dk-eq-b', '22.5 × 2^' + d.rank);
    g('dk-eq-d', '200 × 循环 ' + d.rolls + ' 次');
    var rl = document.getElementById('dk-rate');
    if (rl) {
      var cls, txt;
      if (d.inv <= 0) { cls = 'gain'; txt = '等级 0：没投入过升级，分解是净得'; }
      else if (d.diff >= 0) { cls = 'gain'; txt = '比升到该级投入多 ' + grp(d.diff) + ' · 回收 ' + d.ratio + '%'; }
      else { cls = 'loss'; txt = '比升到该级投入少 ' + grp(-d.diff) + ' · 回收 ' + d.ratio + '%'; }
      rl.className = 'decomp-rate ' + cls;
      rl.textContent = txt;
    }
    ['mr', 'rank', 'rolls'].forEach(function (k) {
      var el = document.getElementById('dk-in-' + k);
      if (!el) return;
      var cardV = k === 'mr' ? (+K.mr || 8) : (k === 'rank' ? (+K.rank || 0) : (+K.rolls || 0));
      el.classList.toggle('mod', Math.round(+el.value || 0) !== Math.round(cardV));
    });
  }
  function decompBind() {
    var box = document.getElementById('dk-box');
    if (!box) return;
    box.addEventListener('input', function (e) {
      var el = e.target;
      if (!el || el.tagName !== 'INPUT') return;
      var k = el.getAttribute('data-dk');
      if (!k) return;
      DK[k] = el.value === '' ? null : el.value;
      decompPaint();
    });
    box.addEventListener('change', function (e) {
      var el = e.target;
      if (!el || el.tagName !== 'INPUT') return;
      var k = el.getAttribute('data-dk');
      if (!k) return;
      var d = decompCalc();
      el.value = k === 'mr' ? d.mr : (k === 'rank' ? d.rank : d.rolls);   /* 越界时把框改回来 */
      decompPaint();
    });
  }
  function decompHtml() {
    decompSync();
    var d = decompCalc(), grp = decompGrp;
    var capRank = P.maxRank;
    var h = '<details open class="calc-fold"><summary class="calc-sub"><span class="dot dot-gold"></span>分解 · 内融核心'
      + ' <em>裂罅分解公式 · 三个数值都能直接改</em><span class="fold-arr"></span></summary>'
      + '<div class="calc-fold-body"><div class="decomp" id="dk-box">';
    h += '<div class="decomp-sum"><div class="decomp-num" id="dk-num">' + grp(d.endo) + '</div>'
      + '<div class="decomp-unit">内融核心（Endo）</div>'
      + '<div class="decomp-rate" id="dk-rate"></div></div>';
    h += '<div><div class="tscroll"><table class="res decomp-tbl">'
      + '<tr><th>项</th><th>数值</th><th>算式</th><th>内融核心</th></tr>'
      + '<tr><td>段位项</td><td class="dk-cell">'
        + '<input class="dk-in" id="dk-in-mr" type="number" inputmode="numeric" data-dk="mr" '
        + 'min="8" max="16" step="1" value="' + d.mr + '" title="裂罅段位，8~16"></td>'
      + '<td class="decomp-eq" id="dk-eq-a">100 × (卡面段位 ' + d.mr + ' − 8)</td>'
      + '<td id="dkv-a">' + grp(d.a) + '</td></tr>'
      + '<tr><td>等级项</td><td class="dk-cell">'
        + '<input class="dk-in" id="dk-in-rank" type="number" inputmode="numeric" data-dk="rank" '
        + 'min="0" max="' + capRank + '" step="1" value="' + d.rank + '" title="已升到几级，0~' + capRank + '"></td>'
      + '<td class="decomp-eq" id="dk-eq-b">22.5 × 2^' + d.rank + '</td>'
      + '<td id="dkv-b">' + grp(d.b) + '</td></tr>'
      + '<tr><td>循环项</td><td class="dk-cell">'
        + '<input class="dk-in" id="dk-in-rolls" type="number" inputmode="numeric" data-dk="rolls" '
        + 'min="0" step="1" value="' + d.rolls + '" title="洗过几次"></td>'
      + '<td class="decomp-eq" id="dk-eq-d">200 × 循环 ' + d.rolls + ' 次</td>'
      + '<td id="dkv-d">' + grp(d.d) + '</td></tr>'
      + '<tr class="decomp-total"><td>合计</td><td class="dk-cell dk-cell-total">—</td>'
      + '<td class="decomp-eq">向下取整 − 7</td><td id="dk-total">' + grp(d.endo) + '</td></tr></table></div>';
    h += '</div>';
    h += '</div></details>';
    return h;
  }
  function opt(v, t, sel) {
    return '<option value="' + esc(v) + '"'
      + (String(sel) === String(v) ? ' selected' : '') + '>' + esc(t) + '</option>';
  }
  var MELEE_ONLY_ROWS = (window.RULES && window.RULES.ZK_MELEE_ROWS) || [3, 27, 28, 29, 30, 31, 32, 33, 34];
  function isMeleeOnlyRow(r) { return MELEE_ONLY_ROWS.indexOf(r) >= 0; }
  function optGrouped(items, sel) {
    var normal = '', melee = '', fuse = '', meleeMax = 0, fuseMax = 0;
    items.forEach(function (x) {
      var o = opt(x.row, x.name, sel);
      var len = String(x.name).length;
      if (isFuseRow(x.row)) { fuse += o; if (len > fuseMax) fuseMax = len; }
      else if (isMeleeOnlyRow(x.row)) { melee += o; if (len > meleeMax) meleeMax = len; }
      else normal += o;
    });
    var h = normal;
    function sepRow(t, maxLen) {
      var side = Math.max(1, Math.ceil((maxLen - t.length) / 2));
      var ln = new Array(side + 1).join('─');
      return '<option disabled>' + ln + t + ln + '</option>';
    }
    if (melee) h += sepRow('近战武器', meleeMax) + melee;
    if (fuse) h += sepRow('融合词条', fuseMax) + fuse;
    return h;
  }
  function slotRow(blk, i, lockable) {
    var card = C[blk], s = card.slots[i], isNeg = (i === 3);
    var pool = [];
    if (card.w) {
      var ci = colOf(card.w.cat);
      if (ci >= 0) for (var row = ROLL_FROM; row <= ROLL_TO; row++) {
        if (!isFinite(baseOf(row, card.w.cat))) continue;   // 闸①基准值为空
        if (!physRowOK(row, card.w)) continue;
        if (isNeg ? alwaysPos(row, card.w.cat) : negOnly(row)) continue;
        if (BASE_ELEM_ROWS.indexOf(row) >= 0 && baseElemOthers(card, i) >= 2) continue;  // 一条紫卡最多 2 个基础元素（#9）
        var dupRow = false;
        for (var d2 = 0; d2 < 4; d2++)
          if (d2 !== i && card.slots[d2] && card.slots[d2].row === row) dupRow = true;
        if (dupRow) continue;
        pool.push(row);
      }
      if (s && pool.indexOf(s.row) < 0) pool.unshift(s.row);
    }
    var rng = s ? rangeLine(card, i, 4 + (lockable ? 1 : 0)) : '';
    var cls = [];
    if (lockable && card.locks[i]) cls.push('locked');
    if (rng) cls.push('has-range');
    var h = '<tr' + (cls.length ? ' class="' + cls.join(' ') + '"' : '') + '><td class="c-slot">'
      + (isNeg ? '负面词条' : '正面词条 ' + (i + 1)) + '</td><td class="c-attr"><select data-a="slot" data-b="'
      + blk + '" data-i="' + i + '">' + opt(0, '—', s ? s.row : 0);
    h += optGrouped(pool.map(function (r) { return { row: r, name: sname(r) }; }),
      s ? s.row : 0);
    h += '</select></td><td class="c-val"><input type="number" step="0.01" data-a="val" data-b="' + blk
      + '" data-i="' + i + '" value="' + (s ? inpNum(s.val, s.row) : '') + '"></td>';
    h += '<td class="c-show ' + (s ? (isFuseRow(s.row) ? 'fuse-v' : (isNeg ? 'neg-v' : 'pos-v')) : '')
      + '">' + (s ? fmt(toGame(s.val, s.row), s.row) : '') + '</td>';
    if (lockable && s) {
      h += '<td class="c-lock"><select data-a="lock" data-b="' + blk + '" data-i="' + i + '">'
        + opt('0', '不锁', card.locks[i] ? 0 : 1) + opt('1', '锁定', card.locks[i] ? 1 : 0)
        + '</select></td>';
    }
    h += '</tr>';
    if (rng) h += rng;
    return h;
  }
  function rangeLine(card, i, cols) {
    var s = card.slots[i];
    if (!s || !card.w) return '';
    var vol = volOf(card, i);
    if (!isFinite(vol) || vol <= 0) return '';
    var b1 = s.val / vol;
    return '<tr class="c-range"><td colspan="' + cols + '"><span class="c-rline">区间 <b>'
      + fmt(toGame(b1 * P.lo, s.row), s.row) + '</b> ~ <b>' + fmt(toGame(b1 * P.hi, s.row), s.row)
      + '</b><i class="c-rsep">·</i>浮动 <b>' + Math.round(vol / P.hi * 100) + '%</b></span></td></tr>';
  }
  function fusePreview(card) {
    var w = card.w;
    if (!w) return null;
    if (hasFuseOnCard(card))
      return { bad: true, html: '这张卡上已经有融合词条了，每张紫卡最多只能带一个。' };
    var cat = w.cat, f0 = card.fus[0], f1 = card.fus[1];
    if (f0 && f1) {
      var prod = fuseProd(cat, f0, f1);
      if (!prod) return {
        bad: true, html: '✗ <b>' + esc(sname(f0)) + '</b> 和 <b>' + esc(sname(f1))
          + '</b> 融不出东西（当前武器是「' + esc(cat) + '」，配方按类别裁剪过）。'
      };
      var b = rollBase(prod, cat), coef = card.combo.gain;
      var m1 = -1, m2 = -1;
      for (var i = 0; i < 4; i++) {
        if (card.slots[i] && card.slots[i].row === f0) m1 = i;
        if (card.slots[i] && card.slots[i].row === f1) m2 = i;
      }
      if (m1 < 0 || m2 < 0) return {
        bad: true,
        html: '✗ 所选词条已经不在当前卡面上了（可能刚改过词条），请重新在下拉里选。'
      };
      var vol = Math.max(volOf(card, m1), volOf(card, m2));
      var v = b * coef * ZKC.disp(card.w) * vol;
      return {
        bad: false,
        html: '✓ <b>' + esc(sname(f0)) + '</b> ＋ <b>' + esc(sname(f1)) + '</b> → 融合出 <b class="fuse-v">'
          + esc(sname(prod)) + '</b>。融合只替换词条，数值按「基准 × 组合系数 × 倾向 × 浮动」'
          + '得到一个固定值（浮动继承两条材料里较高的那个 <span class="mono">' + n2(vol) + '</span>）：'
          + ' <b class="mono">' + fmt(toGame(v, prod), prod) + '</b>'
      };
    }
    var anchor = f0 || f1;
    if (anchor) {
      var onCard = {};
      card.slots.forEach(function (s) {
        if (s && !isFuseRow(s.row)) onCard[s.row] = 1;
      });
      var ps = fusePartners(cat, anchor).filter(function (p) { return onCard[p.row]; });
      if (!ps.length) return {
        bad: true,
        html: '✗ 卡面上没有能和 <b>' + esc(sname(anchor)) + '</b> 配对的词条。'
          + '这条词条的搭档是「'
          + (fusePartners(cat, anchor).map(function (p) { return esc(sname(p.row)); }).join('、') || '无')
          + '」—— 先洗出其中一条再融。'
      };
      var btns = ps.map(function (p) {
        return '<button class="chip" data-a="fusefill" data-anchor="'
          + anchor + '" data-row="' + p.row + '" data-prod="' + p.prod + '" title="点一下直接配对">'
          + esc(sname(p.row)) + ' <i>→ ' + esc(sname(p.prod)) + '</i></button>';
      }).join('');
      return {
        bad: false,
        html: '<b>' + esc(sname(anchor)) + '</b> 的搭档（' + ps.length + ' 条，点一下直接配好）：<div class="fchips">'
          + btns + '</div>'
      };
    }
    var cnt = 0;
    card.slots.forEach(function (s) { if (s && !isFuseRow(s.row)) cnt++; });
    if (!cnt) return null;
    var total = 0, seen = {};
    card.slots.forEach(function (s) {
      if (!s || isFuseRow(s.row)) return;
      fusePartners(cat, s.row).forEach(function (p) {
        var key = (s.row < p.row ? s.row + ',' + p.row : p.row + ',' + s.row);
        if (!seen[key]) { seen[key] = 1; total++; }
      });
    });
    return {
      bad: false,
      html: '卡面上这 ' + cnt + ' 条里，有 <b>' + total + '</b> 种可融的组合'
        + '（下拉只列了能配对成功的词条，选一个就能看到搭档）。完整配方见下方 <b>融合配方速查</b>。'
    };
  }
  function fuseRef(card, blk) {
    if (!card.w) return '';
    var cat = card.w.cat, rows = [];
    FUSION.forEach(function (f) {
      var a = rowOfName(f.a), b = rowOfName(f.b), c = rowOfName(f.c);
      if (!a || !b || !c) return;
      if (!rowAvailable(c, cat)) return;                // 这类武器出不了这个产物
      if (!rowAvailable(a, cat) && !rowAvailable(b, cat)) return;   // 两个材料都不存在，配了也没用
      rows.push({ c: c, a: a, b: b });
    });
    rows.sort(function (x, y) { return x.c - y.c; });
    if (!rows.length) return '';
    var _det = document.querySelector('details.fuseref');
    var _open = _det ? _det.open : false;  // 默认收起，展开状态由交互触发并持久化
    var hasRow = function (row) { return card.slots.some(function (s) { return s && s.row === row; }); };
    var okN = 0;
    rows.forEach(function (r) { if (hasRow(r.a) && hasRow(r.b)) okN++; });
    var h = '<details class="fuseref"' + (_open ? ' open' : '') + '><summary>融合配方速查 · 当前武器「' + esc(cat)
      + '」有 ' + rows.length + ' 条'
      + (okN ? ' · <b style="color:var(--accent-text)">当前可生效 ' + okN + ' 条</b>' : '')
      + '</summary><div class="frtable">';
    rows.forEach(function (r) {
      var onA = hasRow(r.a), onB = hasRow(r.b), okIt = (onA && onB);
      var cls = okIt ? ' ok' : ((onA || onB) ? ' on' : '');
      h += '<div class="fr' + cls + '"'
        + (okIt ? ' data-a="fuserefgo" data-b="' + blk + '" data-r1="' + r.a + '" data-r2="' + r.b
           + '" title="点击直接合成：' + esc(sname(r.c)) + '" style="cursor:pointer" role="button" tabindex="0"' : '')
        + '><span class="in">' + esc(sname(r.a))
        + '</span><i>＋</i><span class="in">' + esc(sname(r.b)) + '</span><i>→</i><b>'
        + esc(sname(r.c)) + '</b></div>';
    });
    return h + '</div><p class="hint" style="margin:8px 0 0">灰底＝卡面上已有其中一条材料；亮紫＝当前可真正合成的配方，点击可直接融合。</p></details>';
  }
  function comboIdxOfCard(card) {
    for (var i = 0; i < P.combo.length; i++)
      if (Math.abs(P.combo[i].gain - card.combo.gain) < 1e-9
        && Math.abs(P.combo[i].neg - card.combo.neg) < 1e-9) return i;
    return -1;
  }
  function recalcCombo(card) {
    if (!card || !card.w) return;
    var _rP = 0, _rN = 0;
    for (var _rj = 0; _rj < 3; _rj++) if (card.slots[_rj]) _rP = _rj + 1;
    if (card.slots[3]) _rN = 1;
    if (_rP < 2) _rP = 2;
    var _cidx = comboIdxOf(_rP, _rN);
    card.combo = { gain: P.combo[_cidx].gain, neg: P.combo[_cidx].neg };
    for (var _rk = 0; _rk < 4; _rk++) {
      var _rs = card.slots[_rk];
      if (!_rs || card.locks[_rk]) continue;
      var _rc = (_rk === 3) ? card.combo.neg : card.combo.gain;
      _rs.val = rollBase(_rs.row, card.w.cat) * _rc * ZKC.disp(card.w) * P.mid;
    }
  }
  window.RivenOCR.recalcCombo = recalcCombo;   // 供回归测试
  function slotCounts(card) {
    var nPos = 0, nNeg = 0;
    for (var i = 0; i < 4; i++) {
      var s = card.slots[i];
      if (!s) continue;
      if (i === 3) nNeg = 1; else nPos = i + 1;
    }
    if (nPos < 2) nPos = 2;                       // 紫卡最少 2 正
    return { pos: nPos, neg: nNeg };
  }
  function wpnBar(card, blk) {
    if (!card.w) return '<div class="wpn"><span class="empty">还没有武器</span></div>';
    var c = slotCounts(card), ci = comboIdxOfCard(card);
    var cname = ci >= 0 ? P.combo[ci].name : '';
    return '<div class="wpn">'
      + '<button type="button" class="wname" data-a="torange" data-k="' + blk
      + '" data-b="' + (ci >= 0 ? ci : '') + '" title="跳到倾向 / 区间表看它的数值区间">'
      + esc(wname(card.w))
      + '</button>'
      + '<span class="meta"><span class="sep">·</span> 倾向 <span class="disp">' + n2(ZKC.disp(card.w)) + '</span></span>'
      + '<span class="meta"><span class="sep">·</span> ' + esc(P.catName[card.w.cat]
          ? P.catName[card.w.cat][Math.min(lang, 2)] : card.w.cat) + '</span>'
      + (ci >= 0 ? '<span class="meta"><span class="sep">·</span> ' + esc(cname) + '</span>' : '')
      + (isVariant(card.w)
          ? '<span class="tag-var" title="变体武器：紫卡名按本体「'
            + esc(baseName(card.w)) + '」命名">变体 · ' + esc(baseName(card.w)) + '</span>'
          : '')
      + '</div>';
  }
  function cardHtml(blk, part) {
    var card = C[blk], h = '';
    var wantCard = (!part || part === 'card');
    var wantFuse = (!part || part === 'fuse');
    if (wantCard) {
    h += wpnBar(card, blk);
    if (isVariant(card.w)) {
      var _vnote = ZKC.isUnified()
        ? '倾向已统一为 ' + ZKC.dispText() + '，本体与变体数值完全一致。'
        : '但这张卡装在它身上时，数值按它自己的倾向 <b>' + n2(ZKC.disp(card.w)) + '</b> 算。';
      h += '<div class="varnote"><svg class="ic" aria-hidden="true" focusable="false"><use href="#i-info"/></svg>'
        + '<span>「' + esc(wname(card.w)) + '」是<strong>变体</strong>：开紫卡开不出它，开出来的是本体「'
        + esc(baseName(card.w)) + '」，卡名也按本体的名字来；' + _vnote + '</span></div>';
    }
    var withLock = blk !== 1;
    h += '<table class="slots"><tr><th class="c-slot">槽位</th>'
      + '<th class="c-attr">属性</th><th class="c-val">数值</th><th class="c-show">显示</th>'
      + (withLock ? '<th class="c-lock">锁定</th>' : '') + '</tr>';
    for (var i = 0; i < 4; i++) h += slotRow(blk, i, withLock);
    h += '</table>';
    }
    if (!wantFuse) return h;
    if (blk !== 1) {
      function matTxt(row, v) {
        var s = fmt(toGame(v, row), row);
        if (row === 34 || row === 20) return s + ' m';      // 攻击范围 / 穿透
        if (row === 28) return s + ' s';                    // 连击持续时间
        return s;
      }
      var mats = [];
      card.slots.forEach(function (s) {
        if (!s) return;
        if (isFuseRow(s.row)) return;   // 融合词条不能再当材料
        if (mats.some(function (m) { return m.row === s.row; })) return;
        if (fusePartners(card.w ? card.w.cat : '', s.row).length) mats.push({ row: s.row, val: s.val });
      });
      function fusOpt(i) {
        var other = card.fus[i === 0 ? 1 : 0], sel = card.fus[i], body = opt(0, '— 选一个材料 —', sel);
        mats.forEach(function (m) {
          if (m.row === other) return;
          body += opt(m.row, sname(m.row) + '　' + matTxt(m.row, m.val), sel);
        });
        if (sel && !mats.some(function (m) { return m.row === sel; }))
          body += opt(sel, sname(sel) + '（已不在卡面）', sel);
        return body;
      }
      h += '<div class="fusepool"><label class="fl" style="min-width:76px">融合词条 1</label>'
        + '<select data-a="fus" data-b="' + blk + '" data-i="0">' + fusOpt(0) + '</select>'
        + '<label class="fl" style="min-width:76px">融合词条 2</label>'
        + '<select data-a="fus" data-b="' + blk + '" data-i="1">' + fusOpt(1) + '</select>'
        + '<button type="button" class="btn violet sm" data-a="fuse" data-b="' + blk + '">'
        + '<svg class="ic" aria-hidden="true" focusable="false"><use href="#i-fuse"/></svg>融合</button></div>';
      var pv = fusePreview(card);
      if (pv) h += '<div class="fusehint' + (pv.bad ? ' bad' : '') + '">' + pv.html + '</div>';
      h += '<div id="msg' + blk + '" class="hint">' + ZKHTML.escNote(card.note || '') + '</div>';
      h += fuseRef(card, blk);
      if (card.products.length) {
        h += '<div class="prods"><b style="color:var(--accent-text);font-size:var(--fs-12)">融合产物</b>';
        card.products.forEach(function (p) {
          h += '<div>' + esc(p.name) + ' &nbsp;<span class="fuse-v">' + fmt(p.val, p.row) + '</span></div>';
        });
        h += '</div>';
      }
      h += '<div class="wpn" style="margin-top:10px">紫卡命名：<b>'
        + esc(rivenName(card) || '—') + '</b></div>';
    } else {
      h += '<div id="msg' + blk + '" class="hint">' + ZKHTML.escNote(card.note || '') + '</div>';
    }
    return h;
  }
  function noWeapon(title, how) {
    return '<div class="empty">'
      + '<svg class="ic" aria-hidden="true" focusable="false"><use href="#i-target"/></svg>'
      + '<b>' + esc(title) + '</b><span>' + esc(how) + '</span></div>';
  }
  var ACTIVE_BLK = 4;   // 03 区右栏当前洗的卡：4=开紫卡，2=搜索武器
  function renderSim() {
    var two = document.getElementById('c2');
    if (two) two.innerHTML = C[1].w ? cardHtml(1)
      : noWeapon('还没开卡', '点上面的「开紫卡」，随机抽一把武器和一组词条');
    var wrap = document.getElementById('c2wrap');
    var fwrap = document.getElementById('fusewrap');
    var _ab = ACTIVE_BLK, _at = C[_ab];
    var _ready = !!_at.w && _at.slots.some(function (s) { return !!s; });
    if (wrap) {
      if (!_at.w) {
        wrap.innerHTML = noWeapon('还没选武器', '先在左边开一张卡，或搜一把武器选中 —— 这里的洗卡跟着它走');
      } else if (!_ready) {
        wrap.innerHTML = noWeapon('还没洗过', '点上面的「洗卡」重掷一遍词条与数值');
      } else wrap.innerHTML = cardHtml(_ab, 'card');
    }
    if (fwrap) {
      if (!_at.w) {
        fwrap.innerHTML = noWeapon('还没选武器', '选好武器、洗完一次之后，这里出融合材料与配方');
      } else if (!_ready) {
        fwrap.innerHTML = noWeapon('还没洗过', '洗出词条后，这里会列出能当材料的两条词条');
      } else fwrap.innerHTML = cardHtml(_ab, 'fuse');
    }
    rvSync();                           // 洗卡框右栏「洗 N 次」：武器/锁定一变就清空旧候选
    renderCmp();                        // ① / ② 区下面那两块「洗卡前 / 当前」（同 --plain 构建里没有）
  }
  function openPool() {
    var pool;
    if (OPEN_CAT === '同伴武器') pool = OPENABLE.filter(isCompanion);
    else if (OPEN_CAT === 'Zaw') pool = OPENABLE.filter(isZaw);
    else if (OPEN_CAT === '组合枪') pool = OPENABLE.filter(isKit);
    else if (OPEN_CAT === '近战' || OPEN_CAT === '步枪' || OPEN_CAT === '霰弹' || OPEN_CAT === '手枪' || OPEN_CAT === '曲翼')
      pool = OPENABLE.filter(function (w) {
        if (w.cat !== OPEN_CAT) return false;
        if (isZaw(w) || isKit(w) || isCompanion(w)) return false;
        return true;
      });
    else pool = OPENABLE;
    return pool.length ? pool : OPENABLE;
  }
  var ON_TOP = [];
  var _rvPxIx = null;
  function rvPxKey(s) {
    return String(s == null ? '' : s).replace(/\s+/g, '').replace(/[（）]/g, function (c) {
      return c === '（' ? '(' : ')';
    }).toLowerCase();
  }
  function rvPxIx() {
    if (_rvPxIx) return _rvPxIx;
    var ix = {}, rows = (window.ZKPRICE && window.ZKPRICE.intl && window.ZKPRICE.intl.rows) || [];
    rows.forEach(function (r) {
      if (r.zh) ix[rvPxKey(r.zh)] = r;
      if (r.zi) ix[rvPxKey(r.zi)] = r;
      if (r.en) ix[rvPxKey(r.en)] = r;
    });
    _rvPxIx = ix;
    return ix;
  }
  function rivenPriceOf(w) {
    if (!w) return 0;
    var ix = rvPxIx();
    var r = ix[rvPxKey(w.cn)] || ix[rvPxKey(w.intl)] || ix[rvPxKey(w.en)] || null;
    var v = r ? +r.med : 0;
    return (isFinite(v) && v > 0) ? v : 0;
  }
  var POS_W = [0.55, 1.10, 1.55, 1.85];          // 未上榜 / T3 / T2 / T1
  var NEG_W = [0.50, 0.80, 1.05, 1.35];          // 无伤负 / 小伤负 / 未上榜 / 致命负
  function tierPos(row, cat) {
    var t = RIVEN_TIER[cat] || RIVEN_TIER['_default'];
    if (t.T1.indexOf(row) >= 0) return 3;
    if (t.T2.indexOf(row) >= 0) return 2;
    if (t.T3.indexOf(row) >= 0) return 1;
    return 0;
  }
  function tierNeg(row, cat) {
    var t = RIVEN_TIER[cat] || RIVEN_TIER['_default'];
    if (t.neg.no.indexOf(row) >= 0) return 0;
    if (t.neg.minor.indexOf(row) >= 0) return 1;
    if (t.neg.fatal.indexOf(row) >= 0) return 3;
    return 2;
  }
  var ROLL_COMBO_MAX = (function () {
    var mx = 0;
    for (var i = 0; i < P.combo.length; i++) mx = Math.max(mx, +P.combo[i].gain || 0);
    return mx || 1;
  })();
  function rollComboFactor(card) {
    return (+card.combo.gain || 0) / ROLL_COMBO_MAX;
  }
  var ROLL_W_MAX = 1.85 * 3 * (0.9375 / ROLL_COMBO_MAX);   // 三条 T1 满浮动的满分锚点
  function rollScoreOf(card) {
    var cat = (card.w && card.w.cat) || '';
    var sum = 0, cf = rollComboFactor(card);
    for (var i = 0; i < 4; i++) {
      var sl = card.slots[i];
      if (!sl) continue;
      var k = (P.hi > P.lo) ? (volOf(card, i) - P.lo) / (P.hi - P.lo) : 0.5;
      var q = 0.55 + 0.45 * Math.max(0, Math.min(1, k));   // 浮动越好分越高（同一档内比数值）
      if (i === 3) sum -= NEG_W[tierNeg(sl.row, cat)] * q * cf;
      else sum += POS_W[tierPos(sl.row, cat)] * q * cf;
    }
    return Math.max(0, sum);
  }
  function rollPctOf(score) {
    return Math.max(0, Math.min(100, Math.round(score / ROLL_W_MAX * 100)));
  }
  function rollGradeOf(pct) {
    if (pct >= 88) return ['极品 S', 'g-s'];
    if (pct >= 78) return ['极品 A', 'g-a'];
    if (pct >= 66) return ['牛通 A', 'g-b'];
    if (pct >= 52) return ['普通 B', 'g-c'];
    return ['一般 C', 'g-d'];
  }
  function onListBox() { return document.getElementById('onList'); }
  function onListSay(html) {
    var h = onListBox();
    if (h) h.innerHTML = '<div class="on-empty">' + html + '</div>';
    var s = document.getElementById('onStat');
    if (s) s.innerHTML = '';
  }
  function onListRender(n, ms, uniq) {
    var host = onListBox(), stat = document.getElementById('onStat');
    if (stat) {
      stat.innerHTML = ON_TOP.length
        ? '开了 <b>' + kuvaFmt(n) + '</b> 次'
          + (ms != null ? '（' + (ms < 1000 ? Math.round(ms) + ' 毫秒' : (ms / 1000).toFixed(1) + ' 秒') + '）' : '')
          + (uniq != null ? '　·　出现 ' + uniq + ' 把不同武器' : '')
          + '　·　按「分数 × 国际服中位价」排，贵的优先展出；同一把武器只留最好的一张'
        : '';
    }
    if (!host) return;
    if (!ON_TOP.length) {
      host.innerHTML = '<div class="on-empty">点「开 N 次」，这里列出最值得看的 10 把武器（点一行整套套过去）。'
        + '<br>抽卡是等概率的：每次随机一把武器 + 一组词条；榜单按「分数 × 国际服中位价」排，'
        + '同一把武器只留价值最高的一张。只做模拟：不消耗辣椒、不动当前卡面、不进撤销栈。</div>';
      return;
    }
    host.innerHTML = ON_TOP.map(function (r, i) {
      var w = WEAPONS[r.wi] || {};
      var p = rollPctOf(r.score), g = rollGradeOf(p);
      var afs = r.slots.map(function (s, j) {
        if (!s) return '';
        return '<span class="af' + (j === 3 ? ' neg' : '') + '">'
             + esc(fmt(toGame(s.val, s.row), s.row)) + ' <i>' + esc(sname(s.row)) + '</i></span>';
      }).filter(Boolean).join('');
      var price = r.price > 0
        ? '<span class="on-pr" title="国际服中位价 ' + r.price + ' 白金 · 榜单按「分数 × 中位价」排">'
          + Math.round(r.price) + '<i>白金</i></span>'
        : '<span class="on-pr none" title="国际服没查到成交价 —— 榜单里按 1 白金计，只按分数排">—</span>';
      return '<button type="button" class="on-row" data-i="' + i + '">'
        + '<span class="on-hd">'
        + '<span class="og ' + g[1] + '">' + g[0] + '</span>'
        + '<b class="on-w">' + esc(wname(w) || '（未知武器）') + '</b>'
        + '<span class="on-ct">' + esc(w.cat || '') + '</span>'
        + '<span class="on-pw">' + price
        + '<span class="on-sc">' + p + '</span></span>'
        + '</span>'
        + '<span class="on-afs">' + afs + '</span>'
        + '</button>';
    }).join('');
  }
  function openNRun() {
    var inp = document.getElementById('onN'), run = document.getElementById('onRun');
    var n = inp ? parseInt(inp.value, 10) : 1000;
    if (!isFinite(n) || n < 10) n = 10;
    if (n > 20000) n = 20000;
    if (inp) inp.value = n;
    var pool = openPool();
    if (run) run.disabled = true;
    onListSay('正在开 <b>' + kuvaFmt(n) + '</b> 张…');
    setTimeout(function () {
      var tmp = newCard();
      var byW = {}, seen = {}, uniq = 0, i;
      var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
      for (i = 0; i < n; i++) {
        var w = pool[Math.floor(Math.random() * pool.length)];   /* 抽卡仍等概率：模拟的是真实爆率 */
        if (!w) continue;
        var wi = WEAPONS.indexOf(w);
        tmp.w = w;
        tmp.locks = [false, false, false, false];
        genStats(tmp, false);
        if (!tmp.slots.some(function (s) { return !!s; })) continue;
        if (!seen[wi]) { seen[wi] = 1; uniq++; }
        var sc = rollScoreOf(tmp);
        var pr = rivenPriceOf(w);
        var val = sc * (pr > 0 ? pr : 1);
        var old = byW[wi];
        if (old && old.val >= val) continue;                     /* 同一把武器只留价值最高的一张 */
        byW[wi] = {
          wi: wi, score: sc, val: val, price: pr,
          slots: tmp.slots.map(function (s) { return s ? { row: s.row, name: s.name, val: s.val } : null; }),
          combo: { gain: tmp.combo.gain, neg: tmp.combo.neg }
        };
      }
      var best = Object.keys(byW).map(function (k) { return byW[k]; });
      best.sort(function (a, b) { return (b.val - a.val) || (b.score - a.score) || (a.wi - b.wi); });
      if (best.length > 10) best.length = 10;
      var t1 = (window.performance && performance.now) ? performance.now() : Date.now();
      ON_TOP = best;
      onListRender(n, t1 - t0, uniq);
      if (run) run.disabled = false;
    }, 40);
  }
  function onUseRoll(i) {
    var rec = ON_TOP[i];
    if (!rec) return;
    var w = WEAPONS[rec.wi];
    if (!w) return;
    function cloneSlots() {
      return rec.slots.map(function (s) { return s ? { row: s.row, name: s.name, val: s.val } : null; });
    }
    pushHist();
    var blocks = (ACTIVE_BLK === 4) ? [1, 4] : [ACTIVE_BLK];
    blocks.forEach(function (b) {
      var c = C[b];
      if (!c) return;
      c.w = w;
      c.slots = cloneSlots();
      c.combo = { gain: rec.combo.gain, neg: rec.combo.neg };
      c.products = [];
      c.fus = [0, 0];
      c.locks = [false, false, false, false];
      c.rerolls = 0;
      c.kuva = 0;
      c.note = (b === ACTIVE_BLK)
        ? '已套用「开 N 次」第 ' + (i + 1) + ' 名：' + wname(w) + '（评分 ' + rollPctOf(rec.score) + ' 分）—— 武器与词条一起换，按新开的一张卡算。'
        : '';
    });
    render(); commit();
  }
  function initOpenN() {
    var minus = document.getElementById('onMinus'),
        plus = document.getElementById('onPlus'),
        run = document.getElementById('onRun'),
        inp = document.getElementById('onN'),
        host = document.getElementById('onList');
    function curN() {
      var v = inp ? parseInt(inp.value, 10) : 1000;
      if (!isFinite(v)) v = 1000;
      return Math.max(10, Math.min(20000, v));
    }
    function setN(v) { if (inp) inp.value = Math.max(10, Math.min(20000, v)); }
    if (minus) minus.addEventListener('click', function () { setN(Math.round(curN() / 2)); });
    if (plus) plus.addEventListener('click', function () { setN(curN() * 2); });
    if (run) run.addEventListener('click', openNRun);
    if (inp) inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); openNRun(); }
    });
    if (host) host.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('.on-row') : null;
      if (!b) return;
      onUseRoll(+b.getAttribute('data-i'));
    });
    onListRender(0, null);
  }
  var RV_TOP = [], RV_SIG = '', RV_N = 0, RV_UNIQ = 0;
  function rvSigOf(card) {
    if (!card || !card.w) return '';
    var p = [];
    for (var i = 0; i < 4; i++)
      p.push(card.locks[i] && card.slots[i] ? ('L' + card.slots[i].row) : '_');
    return wi(card.w) + '|' + p.join(',');    // 武器在库里的下标才换得动签名（w.i 字段不存在，曾致换武器不清榜 #洗N次串卡）
  }
  function rvComboLabel(slots) {
    var np = 0, nn = 0;
    for (var i = 0; i < 4; i++) {
      if (!slots[i]) continue;
      if (i === 3) nn++; else np++;
    }
    return np + ' 正' + (nn ? ' ' + nn + ' 负' : '');
  }
  function rvRowsKey(slots) {
    var a = [];
    for (var i = 0; i < 4; i++) if (slots[i]) a.push(slots[i].row);
    return a.sort(function (x, y) { return x - y; }).join(',');
  }
  function rvLockedCount(card) {
    var n = 0;
    for (var i = 0; i < 4; i++) if (card.locks[i] && card.slots[i]) n++;
    return n;
  }
  function rvCloneSlots(slots) {
    return slots.map(function (s) { return s ? { row: s.row, name: s.name, val: s.val } : null; });
  }
  function rvStat(n, ms, uniq) {
    var stat = document.getElementById('rnStat');
    if (!stat) return;
    if (!RV_TOP.length) { stat.innerHTML = ''; return; }
    var cur = C[ACTIVE_BLK];
    var curPct = (cur && cur.w && cur.slots.some(function (s) { return !!s; }))
      ? rollPctOf(rollScoreOf(cur)) : null;
    stat.innerHTML = '洗了 <b>' + kuvaFmt(n) + '</b> 次'
      + (ms != null ? '（' + (ms < 1000 ? Math.round(ms) + ' 毫秒' : (ms / 1000).toFixed(1) + ' 秒') + '）' : '')
      + (uniq ? '　·　出现 <b>' + kuvaFmt(uniq) + '</b> 种不同词条组合' : '')
      + '　·　最好 ' + rollPctOf(RV_TOP[0].score) + ' 分'
      + (curPct != null ? '（当前卡 ' + curPct + ' 分）' : '')
      + '　·　下面是分数最高的 10 张，点一行整套套用';
  }
  function rvRender() {
    var host = document.getElementById('rnList');
    rvStat(RV_N, null, RV_UNIQ);
    if (!host) return;
    if (!RV_TOP.length) {
      host.innerHTML = '<div class="on-empty">点「洗 N 次」，这里列出同一把武器洗出来的最好 10 张。'
        + '<br>只做模拟：武器不变、词条与数值全都重抽、不消耗辣椒、不动当前卡面；点一行才整套套用。</div>';
      return;
    }
    host.innerHTML = RV_TOP.map(function (r, i) {
      var p = rollPctOf(r.score), g = rollGradeOf(p);
      var afs = r.slots.map(function (s, j) {
        if (!s) return '';
        return '<span class="af' + (j === 3 ? ' neg' : '') + '">'
             + esc(fmt(toGame(s.val, s.row), s.row)) + ' <i>' + esc(sname(s.row)) + '</i></span>';
      }).filter(Boolean).join('');
      return '<button type="button" class="on-row" data-i="' + i + '">'
        + '<span class="on-hd">'
        + '<span class="og ' + g[1] + '">' + g[0] + '</span>'
        + '<b class="on-w">' + esc(rvComboLabel(r.slots)) + '</b>'
        + (r.locked ? '<span class="on-ct">锁定 ' + r.locked + ' 槽</span>' : '')
        + '<span class="on-sc">' + p + '</span>'
        + '</span>'
        + '<span class="on-afs">' + afs + '</span>'
        + '</button>';
    }).join('');
  }
  function rvRun() {
    var card = C[ACTIVE_BLK];
    if (!card || !card.w) {
      alert('先在左边开一张卡，或搜一把武器选中 —— 这里洗的是当前这张卡。');
      return;
    }
    var inp = document.getElementById('rnN'), run = document.getElementById('rnRun');
    var n = inp ? parseInt(inp.value, 10) : 1000;
    if (!isFinite(n) || n < 10) n = 10;
    if (n > 50000) n = 50000;
    if (inp) inp.value = n;
    if (run) run.disabled = true;
    var say = document.getElementById('rnList');
    if (say) say.innerHTML = '<div class="on-empty">正在洗 <b>' + kuvaFmt(n) + '</b> 次…</div>';
    var st0 = document.getElementById('rnStat');
    if (st0) st0.innerHTML = '';
    var tmp = {
      w: card.w,
      locks: card.locks.slice(0, 4),
      combo: { gain: card.combo.gain, neg: card.combo.neg },
      slots: rvCloneSlots(card.slots),
      products: [], fus: [0, 0], note: ''
    };
    var wi = WEAPONS.indexOf(card.w);
    var locked = rvLockedCount(card);
    setTimeout(function () {
      var best = [], seen = {}, uniq = 0, i, sl;
      var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
      for (i = 0; i < n; i++) {
        genStats(tmp, true);                    // 真正的洗卡：词条 + 数值 + 组合一起重抽
        sl = tmp.slots;
        if (!sl[0] && !sl[1] && !sl[2] && !sl[3]) continue;
        var key = rvRowsKey(sl);
        if (!seen[key]) { seen[key] = 1; uniq++; }
        var sc = rollScoreOf(tmp);
        if (best.length >= 10 && sc <= best[best.length - 1].score) continue;
        var rec = {
          wi: wi, score: sc, locked: locked,
          slots: rvCloneSlots(sl),
          combo: { gain: tmp.combo.gain, neg: tmp.combo.neg }
        };
        var k = best.length;
        while (k > 0 && best[k - 1].score < rec.score) k--;
        best.splice(k, 0, rec);
        if (best.length > 10) best.length = 10;
      }
      var t1 = (window.performance && performance.now) ? performance.now() : Date.now();
      RV_TOP = best;
      RV_N = n;
      RV_UNIQ = uniq;
      RV_SIG = rvSigOf(card);
      rvRender();
      rvStat(n, t1 - t0, uniq);
      if (run) run.disabled = false;
    }, 40);
  }
  function rvUse(i) {
    var rec = RV_TOP[i];
    if (!rec) return;
    var card = C[ACTIVE_BLK];
    if (!card || !card.w) return;
    pushHist();
    card.slots = rvCloneSlots(rec.slots);
    card.combo = { gain: rec.combo.gain, neg: rec.combo.neg };
    var hadProd = card.products && card.products.length;
    card.products = [];
    card.fus = [0, 0];
    var cost = rollCost(card);
    card.rerolls++;
    card.kuva += cost;
    card.note = '已套用「洗 N 次」第 ' + (i + 1) + ' 张（' + rvComboLabel(rec.slots)
      + '，评分 ' + rollPctOf(rec.score) + ' 分）—— 词条与数值整套换掉，按一次洗卡计入辣椒'
      + (hadProd ? '；融合产物已清空，要的话重新点「融合」。' : '。');
    render(); commit();
  }
  function rvSync() {
    var sig = rvSigOf(C[ACTIVE_BLK]);
    if (sig !== RV_SIG) {
      RV_SIG = sig;
      RV_TOP = [];
      RV_N = 0;
      RV_UNIQ = 0;
      rvRender();
      return;
    }
    if (RV_TOP.length) rvStat(RV_N, null, RV_UNIQ);
  }
  function initRerollN() {
    var minus = document.getElementById('rnMinus'),
        plus = document.getElementById('rnPlus'),
        run = document.getElementById('rnRun'),
        inp = document.getElementById('rnN'),
        host = document.getElementById('rnList');
    function curN() {
      var v = inp ? parseInt(inp.value, 10) : 1000;
      if (!isFinite(v)) v = 1000;
      return Math.max(10, Math.min(50000, v));
    }
    function setN(v) { if (inp) inp.value = Math.max(10, Math.min(50000, v)); }
    if (minus) minus.addEventListener('click', function () { setN(Math.round(curN() / 2)); });
    if (plus) plus.addEventListener('click', function () { setN(curN() * 2); });
    if (run) run.addEventListener('click', rvRun);
    if (inp) inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); rvRun(); }
    });
    if (host) host.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('.on-row') : null;
      if (!b) return;
      rvUse(+b.getAttribute('data-i'));
    });
    rvRender();
  }
  var CMP_ORDER = [1, 4, 2, 3];        // 变动卡片的判定优先级：② 区优先
  var CMP_BLK = {};                    // key = data-cmp 这块上一次真正盯的卡面块
  function cmpBlk(host, chg) {
    var key = host.getAttribute('data-cmp') || '';
    var order = key.split(',');
    for (var i = 0; i < order.length; i++) order[i] = parseInt(order[i], 10);
    if (chg >= 0 && order.indexOf(chg) >= 0) CMP_BLK[key] = chg;
    else if (CMP_BLK[key] == null) CMP_BLK[key] = order[0];
    return CMP_BLK[key];
  }
  function blkChanged(a, b) {
    var oa, ob;
    try { oa = JSON.parse(a).c; ob = JSON.parse(b).c; } catch (e) { return -1; }
    for (var i = 0; i < CMP_ORDER.length; i++) {
      var k = CMP_ORDER[i];
      if (JSON.stringify(oa[k]) !== JSON.stringify(ob[k])) return k;
    }
    return -1;                          // 仅计算器发生变化 沿用上一次那张卡
  }
  function cardFromSnap(s, blk) {
    var o = ZKHTML.safeParse(s, null);
    var k = (o && o.c && o.c[blk]) || null;
    if (!k) return { w: null, slots: [null, null, null, null] };
    return { w: (k.wi >= 0 && WEAPONS[k.wi]) ? WEAPONS[k.wi] : null,
             slots: k.slots || [null, null, null, null] };
  }
  function itemsOf(card) {
    var out = [];
    for (var i = 0; i < 4; i++) {
      var s = card.slots[i];
      if (s) out.push({ row: s.row, val: s.val, neg: (i === 3) });
    }
    return out;
  }
  function renderCmp() {
    var host = document.querySelector('.cmpc[data-cmp]');
    if (!host) return;                   // plain 备用版里没有这一块
    var blk = ACTIVE_BLK;                // 03 区右栏：跟随最近选中的武器
    var bB = host.querySelector('.cmp-side:not(.now) .cmp-body');
    var bA = host.querySelector('.cmp-side.now .cmp-body');
    if (!bB || !bA) return;
    var st = host.querySelector('[data-stat]');
    if (st) {
      var lv = C[blk] || {};
      st.innerHTML =
          '<span class="cs-r"><span class="cs-k">洗卡次数</span><b class="cs-v">'
        + (lv.rerolls || 0) + '</b></span>'
        + '<span class="cs-r"><span class="cs-k">辣椒总消耗</span><b class="cs-v">'
        + kuvaFmt(lv.kuva || 0) + '</b></span>';
    }
    var cur = snap();
    var top = UNDO.length ? UNDO[UNDO.length - 1] : null;
    var now = cardFromSnap(cur, blk);
    bA.innerHTML = now.w ? rcardHtml(rivenName(now), itemsOf(now), '还没洗过', (C[blk] || {}).rerolls, !!now.w)
                         : rcardHtml('', [], '还没有卡');
    var old = top ? cardFromSnap(top, blk) : null;
    var _top = top ? ZKHTML.safeParse(top, null) : null;
    bB.innerHTML = (!old || !old.w) ? rcardHtml('', [], '还没有上一次')
                                    : rcardHtml(rivenName(old), itemsOf(old), '上一次没有词条',
                                        ((_top && _top.c && _top.c[blk]) || {}).rerolls, !!old.w);
  }
  var POL_ICONS = [
    { k: 'naramon', n: 'Naramon', cn: '纳拉蒙', src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAAE7mlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4gPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgOS4xLWMwMDEgNzkuMTQ2Mjg5OSwgMjAyMy8wNi8yNS0yMDowMTo1NSAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczpkYz0iaHR0cDovL3B1cmwub3JnL2RjL2VsZW1lbnRzLzEuMS8iIHhtbG5zOnBob3Rvc2hvcD0iaHR0cDovL25zLmFkb2JlLmNvbS9waG90b3Nob3AvMS4wLyIgeG1sbnM6eG1wTU09Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9tbS8iIHhtbG5zOnN0RXZ0PSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvc1R5cGUvUmVzb3VyY2VFdmVudCMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIDI1LjAgKFdpbmRvd3MpIiB4bXA6Q3JlYXRlRGF0ZT0iMjAyNi0xMC0xOFQxMTo1Mzo0NSswODowMCIgeG1wOk1vZGlmeURhdGU9IjIwMjYtMTAtMThUMTI6MTQ6NDIrMDg6MDAiIHhtcDpNZXRhZGF0YURhdGU9IjIwMjYtMTAtMThUMTI6MTQ6NDIrMDg6MDAiIGRjOmZvcm1hdD0iaW1hZ2UvcG5nIiBwaG90b3Nob3A6Q29sb3JNb2RlPSIzIiB4bXBNTTpJbnN0YW5jZUlEPSJ4bXAuaWlkOjg2ZjVkOTMxLWQ3OTYtYWY0OC05MmVhLTYyZTBjMzkzYTZlZCIgeG1wTU06RG9jdW1lbnRJRD0ieG1wLmRpZDo4NmY1ZDkzMS1kNzk2LWFmNDgtOTJlYS02MmUwYzM5M2E2ZWQiIHhtcE1NOk9yaWdpbmFsRG9jdW1lbnRJRD0ieG1wLmRpZDo4NmY1ZDkzMS1kNzk2LWFmNDgtOTJlYS02MmUwYzM5M2E2ZWQiPiA8eG1wTU06SGlzdG9yeT4gPHJkZjpTZXE+IDxyZGY6bGkgc3RFdnQ6YWN0aW9uPSJjcmVhdGVkIiBzdEV2dDppbnN0YW5jZUlEPSJ4bXAuaWlkOjg2ZjVkOTMxLWQ3OTYtYWY0OC05MmVhLTYyZTBjMzkzYTZlZCIgc3RFdnQ6d2hlbj0iMjAyNi0xMC0xOFQxMTo1Mzo0NSswODowMCIgc3RFdnQ6c29mdHdhcmVBZ2VudD0iQWRvYmUgUGhvdG9zaG9wIDI1LjAgKFdpbmRvd3MpIi8+IDwvcmRmOlNlcT4gPC94bXBNTTpIaXN0b3J5PiA8L3JkZjpEZXNjcmlwdGlvbj4gPC9yZGY6UkRGPiA8L3g6eG1wbWV0YT4gPD94cGFja2V0IGVuZD0iciI/PvGEkq0AAACMSURBVFiFY/z//z/DQAKmAbV91AGjDhgMDmBhYGBgWFxzktb2wPI6I7JgbIv5wIcAvR2AUerRwwF4i1oWYhTREgxEGkDx7KBJhIx4VVEfwENh0IQAA8MAhcKgCoFB4QBc0UCN6GFEwwwMDIiCiJBGajkCw1xsUUDXxDjo0gDdAeNov2DUAaMOGPEOAAAxxRBFN+YzEQAAAABJRU5ErkJggg==' },
    { k: 'vazarin', n: 'Vazarin', cn: '瓦扎林', src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAAE7mlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4gPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgOS4xLWMwMDEgNzkuMTQ2Mjg5OSwgMjAyMy8wNi8yNS0yMDowMTo1NSAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczpkYz0iaHR0cDovL3B1cmwub3JnL2RjL2VsZW1lbnRzLzEuMS8iIHhtbG5zOnBob3Rvc2hvcD0iaHR0cDovL25zLmFkb2JlLmNvbS9waG90b3Nob3AvMS4wLyIgeG1sbnM6eG1wTU09Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9tbS8iIHhtbG5zOnN0RXZ0PSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvc1R5cGUvUmVzb3VyY2VFdmVudCMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIDI1LjAgKFdpbmRvd3MpIiB4bXA6Q3JlYXRlRGF0ZT0iMjAyNi0xMC0xOFQxMTo1Mzo0NCswODowMCIgeG1wOk1vZGlmeURhdGU9IjIwMjYtMTAtMThUMTI6MTQ6NDUrMDg6MDAiIHhtcDpNZXRhZGF0YURhdGU9IjIwMjYtMTAtMThUMTI6MTQ6NDUrMDg6MDAiIGRjOmZvcm1hdD0iaW1hZ2UvcG5nIiBwaG90b3Nob3A6Q29sb3JNb2RlPSIzIiB4bXBNTTpJbnN0YW5jZUlEPSJ4bXAuaWlkOjUzM2I1ZTM4LTAwMjMtNGU0OC05OGVmLWZlMzJiMDg2OGRlNiIgeG1wTU06RG9jdW1lbnRJRD0ieG1wLmRpZDo1MzNiNWUzOC0wMDIzLTRlNDgtOThlZi1mZTMyYjA4NjhkZTYiIHhtcE1NOk9yaWdpbmFsRG9jdW1lbnRJRD0ieG1wLmRpZDo1MzNiNWUzOC0wMDIzLTRlNDgtOThlZi1mZTMyYjA4NjhkZTYiPiA8eG1wTU06SGlzdG9yeT4gPHJkZjpTZXE+IDxyZGY6bGkgc3RFdnQ6YWN0aW9uPSJjcmVhdGVkIiBzdEV2dDppbnN0YW5jZUlEPSJ4bXAuaWlkOjUzM2I1ZTM4LTAwMjMtNGU0OC05OGVmLWZlMzJiMDg2OGRlNiIgc3RFdnQ6d2hlbj0iMjAyNi0xMC0xOFQxMTo1Mzo0NCswODowMCIgc3RFdnQ6c29mdHdhcmVBZ2VudD0iQWRvYmUgUGhvdG9zaG9wIDI1LjAgKFdpbmRvd3MpIi8+IDwvcmRmOlNlcT4gPC94bXBNTTpIaXN0b3J5PiA8L3JkZjpEZXNjcmlwdGlvbj4gPC9yZGY6UkRGPiA8L3g6eG1wbWV0YT4gPD94cGFja2V0IGVuZD0iciI/PlzLDNgAAADISURBVFiF3ZXbDcMgDEXtKDsxDZvkk00yTaaif1VFi42fSL2/ROhwuDHYe4edOSI3v6+n39dDnjAU4BNktnZyH0TnAACoreBWgIzMLL8Baiu4w8SXgWwIpOZARDnHA5IdyLDBljAaYukviIQ4Vz+srSDXiRF0pUOiOcCZ0JRWPIi8IVST0AIxrpFzgItGuWgOSDfTxPwYWSHSXsNQAIsFNwNaiNQr+AXpCqCx8B8lXMnMjjuA9BpSDFBQ4QCcke0lNL2GHtlu4AVNxkxIee4iGAAAAABJRU5ErkJggg==' },
    { k: 'madurai', n: 'Madurai', cn: '马杜莱', src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAAE7mlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4gPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgOS4xLWMwMDEgNzkuMTQ2Mjg5OSwgMjAyMy8wNi8yNS0yMDowMTo1NSAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczpkYz0iaHR0cDovL3B1cmwub3JnL2RjL2VsZW1lbnRzLzEuMS8iIHhtbG5zOnBob3Rvc2hvcD0iaHR0cDovL25zLmFkb2JlLmNvbS9waG90b3Nob3AvMS4wLyIgeG1sbnM6eG1wTU09Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9tbS8iIHhtbG5zOnN0RXZ0PSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvc1R5cGUvUmVzb3VyY2VFdmVudCMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIDI1LjAgKFdpbmRvd3MpIiB4bXA6Q3JlYXRlRGF0ZT0iMjAyNi0xMC0xOFQxMTo1Mzo0MiswODowMCIgeG1wOk1vZGlmeURhdGU9IjIwMjYtMTAtMThUMTI6MTQ6NDgrMDg6MDAiIHhtcDpNZXRhZGF0YURhdGU9IjIwMjYtMTAtMThUMTI6MTQ6NDgrMDg6MDAiIGRjOmZvcm1hdD0iaW1hZ2UvcG5nIiBwaG90b3Nob3A6Q29sb3JNb2RlPSIzIiB4bXBNTTpJbnN0YW5jZUlEPSJ4bXAuaWlkOjViODdiY2YwLTY5ODMtZTA0YS1hY2Y5LTUzZDE3MWNkYjRmYSIgeG1wTU06RG9jdW1lbnRJRD0ieG1wLmRpZDo1Yjg3YmNmMC02OTgzLWUwNGEtYWNmOS01M2QxNzFjZGI0ZmEiIHhtcE1NOk9yaWdpbmFsRG9jdW1lbnRJRD0ieG1wLmRpZDo1Yjg3YmNmMC02OTgzLWUwNGEtYWNmOS01M2QxNzFjZGI0ZmEiPiA8eG1wTU06SGlzdG9yeT4gPHJkZjpTZXE+IDxyZGY6bGkgc3RFdnQ6YWN0aW9uPSJjcmVhdGVkIiBzdEV2dDppbnN0YW5jZUlEPSJ4bXAuaWlkOjViODdiY2YwLTY5ODMtZTA0YS1hY2Y5LTUzZDE3MWNkYjRmYSIgc3RFdnQ6d2hlbj0iMjAyNi0xMC0xOFQxMTo1Mzo0MiswODowMCIgc3RFdnQ6c29mdHdhcmVBZ2VudD0iQWRvYmUgUGhvdG9zaG9wIDI1LjAgKFdpbmRvd3MpIi8+IDwvcmRmOlNlcT4gPC94bXBNTTpIaXN0b3J5PiA8L3JkZjpEZXNjcmlwdGlvbj4gPC9yZGY6UkRGPiA8L3g6eG1wbWV0YT4gPD94cGFja2V0IGVuZD0iciI/PhX+zhIAAADRSURBVFiF5ZdBDoMwDAQT1D/1Nf0Jx/6kr+mr0hMQWqJ6vbvigE8IRZmx4xhRW2vlzJhOpZdSbsvDa35H1vflqiz88bxvAgBYGv8E7A0yElCAj/b4ObZeQJntaK/l/SriuAVQIr0A3dUAfF33XYGaFGkAfCcxOgJEguqd6BxQwnfJMQIo/LCqbAVS0D6cH6NQHzkqAN0ipUBqjqiOID3EFALUBGUF6PHNCCi+HWkBCTwrIINnBKRwVEAORwUsERWwZI8I2CIiYMs+KmCNevm/4w/cdxpTY6qbPwAAAABJRU5ErkJggg==' }
  ];
  function polName(pol) {
    for (var i = 0; i < POL_ICONS.length; i++) if (POL_ICONS[i].k === pol)
      return lang === 0 ? POL_ICONS[i].cn : POL_ICONS[i].n;
    return lang === 0 ? '马杜莱' : 'Madurai';   // 兜底：未知极性与 madurai 同口径
  }
  var FUSPOP_I = -1, FUSPOP_BTN = null;
  function fusePopEl() { return document.getElementById('fusPop'); }
  function fusePopData(i, cvIn) {
    var row = K.rows[i];
    if (!K.w || !row) return null;
    var cat = K.w.cat, combo = P.combo[K.comboIdx];
    var coef = (i === 3) ? combo.neg : combo.gain;
    function k0(r, c) { return rollBase(r, cat) * c * kDisp() / 9 * (1 + K.rank); }
    var full0 = k0(row, coef), cv = (cvIn === undefined) ? parseFloat(K.vals[i]) : +cvIn;
    var used = isFinite(full0) && full0 !== 0 && isFinite(cv);
    var vol = used ? cv / full0 : P.mid;
    vol = Math.max(P.lo, Math.min(P.hi, vol));
    var list = fusePartners(cat, row).map(function (p) {
      var f = k0(p.prod, combo.gain);
      return { row: p.row, name: sname(p.row), prod: p.prod, prodName: sname(p.prod), val: f * vol, full: f };
    });
    return { row: row, vol: vol, used: used, list: list };
  }
  function fusePopHtml(i, cvIn) {
    var head = '<div class="hd"><b>' + (K.rows[i] ? esc(sname(K.rows[i])) : '未选词条') + '</b>'
      + '<span class="sub">融合产物</span>'
      + '<button type="button" class="x" data-a="kfusx" title="关闭" aria-label="关闭">×</button></div>';
    var d = fusePopData(i, cvIn);
    if (!d) return head + '<div class="bd"><p class="tip">先在左边选一条词条，这里就会列出它融合出来的产物。</p></div>';
    if (!d.list.length) return head + '<div class="bd"><p class="tip">这条词条没有可融合的对象（只有基础元素之间能融合）。</p></div>';
    var h = head + '<div class="bd"><table><tr><th>材料</th><th>产物</th><th>数值</th></tr>';
    d.list.forEach(function (o) {
      h += '<tr><td class="mat">' + esc(o.name) + '</td>'
        + '<td class="prod">' + esc(o.prodName) + '</td>'
        + '<td class="val">' + fmt(toGame(o.val, o.prod), o.prod)
        + '<i>满值 ' + fmt(toGame(o.full, o.prod), o.prod) + '</i></td></tr>';
    });
    h += '</table><p class="tip">'
      + (d.used ? '按本条词条的浮动 ' + n2(d.vol * 100, 1) + '% 折算'
                : '本条还没填数值，暂按中值 ' + n2(P.mid * 100, 1) + '% 折算')
      + '；实际融合取两条材料里浮动更高的那条，产物落在正面槽。</p></div>';
    return h;
  }
  function placeFusePop(btn) {
    var el = fusePopEl(), b = btn || FUSPOP_BTN;
    if (!el || !b) return;
    var r = b.getBoundingClientRect();
    var vw = window.innerWidth || document.documentElement.clientWidth;
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var gap = 8, w = el.offsetWidth || 300, hh = el.offsetHeight || 220;
    var left = Math.round(r.right + 6);                       /* 默认贴按钮右侧往右展开 */
    if (left + w > vw - gap) left = Math.round(r.left - 6 - w);  /* 右边放不下 翻到左侧 */
    if (left + w > vw - gap) left = Math.max(gap, vw - gap - w);
    if (left < gap) left = gap;
    var top = Math.round(r.bottom + 6);                       /* 默认往下 */
    if (top + hh > vh - gap) top = Math.round(r.top - 6 - hh); /* 下面放不下就往上翻 */
    if (top < gap) top = gap;
    if (top + hh > vh - gap) top = Math.max(gap, vh - gap - hh);  /* 按钮本身在视口外时也别把浮框顶出去 */
    el.style.left = left + 'px';
    el.style.top = top + 'px';
  }
  function openFusePop(btn, i) {
    var el = fusePopEl();
    if (!el) return;
    FUSPOP_I = i; FUSPOP_BTN = btn;
    el.innerHTML = fusePopHtml(i);
    el.classList.add('on');
    el.setAttribute('aria-hidden', 'false');
    placeFusePop(btn);
  }
  function closeFusePop() {
    var el = fusePopEl();
    FUSPOP_I = -1; FUSPOP_BTN = null;
    if (!el || !el.classList.contains('on')) return;
    el.classList.remove('on');
    el.setAttribute('aria-hidden', 'true');
  }
  function syncFusePop(i) {
    var el = fusePopEl();
    if (!el || !el.classList.contains('on')) return;
    var b = document.querySelector('#calc-body [data-a="kfus"][data-i="' + i + '"]');
    if (!b || b.disabled) { closeFusePop(); return; }
    FUSPOP_I = i; FUSPOP_BTN = b;
    el.innerHTML = fusePopHtml(i);
    placeFusePop(b);
  }
  function refreshFusePopLive(cvIn) {
    var el = fusePopEl();
    if (!el || !el.classList.contains('on') || FUSPOP_I < 0) return;
    el.innerHTML = fusePopHtml(FUSPOP_I, cvIn);
  }
  window.addEventListener('scroll', function () {
    var el = fusePopEl();
    if (el && el.classList.contains('on')) placeFusePop();
  }, true);
  window.addEventListener('resize', function () {
    var el = fusePopEl();
    if (el && el.classList.contains('on')) placeFusePop();
  });
  window.addEventListener('hashchange', function () { closeFusePop(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeFusePop();
  });
  function prNum(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function prStore() { return (window.ZKSTORE && window.ZKSTORE.cur() === 'cn') ? 'cn' : 'intl'; }
  function priceRefHtml() {
    var R = window.ZKPRICEREF;
    var ST = prStore();
    var WN = ST === 'cn' ? '国服' : '国际服';
    var h = '<div class="card pr-card"><h3><span class="dot dot-gold"></span>市场行情参考'
      + '<em>' + WN + '在售挂单同款比价</em></h3>';
    if (!R || !R.ready()) return h + '<p class="pr-empty">行情库没加载，这一块不可用。</p></div>';
    if (!K.w) return h + '<p class="pr-empty">选好武器、填上词条后，这里会给出同款卡的挂单行情。</p></div>';
    var slug = R.slugOfWeapon(K.w);
    if (!slug) {
      return h + '<p class="pr-empty">行情库里没有「' + esc(wname(K.w))
        + '」的挂单（组合枪、天工造武这类组件枪没有独立紫卡页面）。</p></div>';
    }
    var pos = [], neg = [], skipped = [], i, row, cv, s, gv;
    for (i = 0; i < 4; i++) {
      row = K.rows[i]; cv = parseFloat(K.vals[i]);
      if (!row || !isFinite(cv)) continue;
      s = R.slugOfRow(row);
      if (!s) { skipped.push(sname(row)); continue; }
      gv = Math.abs(toGame(cv, row));
      if (!isFinite(gv)) continue;
      if (i === 3) neg.push({ s: s, v: gv }); else pos.push({ s: s, v: gv });
    }
    if (!pos.length) {
      return h + '<p class="pr-empty">至少要填一条正面词条才能比价'
        + (skipped.length ? '（' + esc(skipped.join('、')) + ' 没有对应的市场属性）' : '') + '。</p></div>';
    }
    var r = R.estimate(slug, pos, neg, ST);
    if (!r.ok) {
      return h + '<p class="pr-empty">' + esc(r.reason || '算不出来')
        + (r.noPool ? '，这边给不了' + WN + '价' : '') + '。</p></div>';
    }
    var w = r.weapon;
    var posName = [];
    for (i = 0; i < pos.length; i++) {
      var _n = R.statName(pos[i].s);
      if (posName.indexOf(_n) < 0) posName.push(_n);
    }
    h += '<div class="pr-head"><b>' + esc(w.zh) + '</b>'
      + '<span>' + esc(posName.join(' + '))
      + (neg.length ? ' <em class="pr-negtag">｜ 带负词条</em>' : ' <em class="pr-oktag">｜ 无负词条</em>')
      + '</span></div>';
    var split = (r.exact === false && r.spread > 5 && r.p75 >= 100);
    if (split) {
      h += '<div class="pr-split"><b>下面的三档价只能当参考</b>'
        + '<span>库里没有「词条数量一样」的同款可比，从 ' + prNum(r.priceMin) + 'p 到 '
        + prNum(r.priceMax) + 'p 都有 —— 价差是被<b>没填的那几条词条</b>放大的。'
        + '词条更多的挂单已按每多一条正面 <b>×0.75</b> 折算（全库实测 2正0负 中位价 = 3正0负 的 75%）。'
        + '把正面词条填满 3 条' + (neg.length ? '' : '、并补上负词条') + '再回来看，数字会可信得多。</span></div>';
    }
    h += '<div class="pr-grid">'
      + '<div class="pr-cell"><span class="pr-l">快出手</span><b class="pr-v">' + prNum(r.p25) + '<small>p</small></b><span class="pr-s">' + (split ? '参考下限' : '挂这里当天有人问') + '</span></div>'
      + '<div class="pr-cell hero"><span class="pr-l">正常挂' + (split ? '（参考）' : '') + '</span><b class="pr-v">' + prNum(r.p50) + '<small>p</small></b><span class="pr-s">' + (split ? '放宽池的中位价' : '同款中位价') + '</span></div>'
      + '<div class="pr-cell"><span class="pr-l">耐心等</span><b class="pr-v">' + prNum(r.p75) + '<small>p</small></b><span class="pr-s">' + (split ? '参考上限' : '挂着等对的人') + '</span></div>'
      + '</div>';
    var meta = [];
    if (r.fallback) meta.push('没有词条相近的挂单，只能按整把武器的行情给');
    else meta.push('同款比价 <b>' + r.nUsed + '</b> 条');
    meta.push(WN + '这把共 <b>' + w.n + '</b> 条在售');
    if (ST === 'cn') meta.push('国服挂单是卖家要价，交易中心 <b>300</b> 白金封顶');
    if (!r.fallback && r.shape === false) meta.push('库里没有词条数相同的同款，已放宽到全池比价并按正面条数差 ×0.75/条 折算');
    else if (!r.fallback && r.exact === false) meta.push('同款样本不足，已放宽到词条相近的卡');
    if (!split && r.spread >= 1.2) meta.push('同款之间价差 <b>' + r.spread + '×</b>');
    if (r.nOutlier) meta.push('另有 ' + r.nOutlier + ' 条离谱高价没算进去');
    if (r.negAdj && r.negAdj !== 1) meta.push('负词条已按武器面板折算 <b>×' + r.negAdj
      + '</b>（-暴击对低暴击武器白送、-多重对谁都是致命这类）');
    h += '<p class="pr-meta">' + meta.join(' · ') + '</p>';
    var _cap = (R.meta(ST) && R.meta(ST).cap) || 0;
    if (!split && !r.fallback && _cap && r.p50 >= _cap * 0.99) {
      h += '<p class="pr-tip pr-cap">正常挂已经顶到 ' + prNum(_cap) + 'p '
        + (ST === 'cn' ? '的国服上限' : '的价格上限')
        + ' —— 这张卡属于同武器里最贵的那一档，三档价因此挤在一起。'
        + (ST === 'cn' ? '国服不能再挂更高，剩下的差别只有好不好出手。'
                       : '挂更高基本没人接，想快出就按「快出手」那个数。') + '</p>';
    }
    if (r.evidence && r.evidence.length) {
      var _pv = function (x) { return esc(x.name) + ' ' + (x.x ? '×' : '') + esc(x.v); };
      h += '<div class="pr-ev"><div class="pr-ev-h">最像的在售卡</div><ul>';
      r.evidence.slice(0, 4).forEach(function (e) {
        h += '<li><b>' + prNum(e.price) + 'p</b>'
          + '<span class="pr-sim">相似 ' + Math.round(e.sim * 100) + '%</span>'
          + '<span class="pr-aff">' + e.pos.map(_pv).join(' / ')
          + (e.neg.length ? ' <em class="pr-negtag">负 ' + e.neg.map(_pv).join(' / ') + '</em>' : '')
          + '</span></li>';
      });
      h += '</ul></div>';
    }
    if (skipped.length) {
      h += '<p class="pr-tip">' + esc(skipped.join('、'))
        + ' 在 WM 挂单数据里没有对应属性，这次没参与比价（目前只有「初始连击」「重击效率」属于这一类）。</p>';
    }
    h += '<p class="pr-tip">' + (r.fallback
      ? '这套词条在' + WN + '库里找不到可比的挂单，上面是按整把武器的中位行情给的，只能当量级参考。'
      : split
        ? '参考价的算法：放宽到词条相近的卡，按相似度加权后取分位数；词条数不一样的挂单按每多一条正面 ×0.75 折算 —— 有数字总比没有强，但填满词条后给出的区间才是真行情。'
        : '同款卡在市场上本来就差 2 倍左右（实测 P75/P25 = 2.15×），所以给区间不给准数；'
          + (ST === 'cn'
              ? '国服在售挂单只有三千多条、单把武器十来张，样本比国际服薄得多，数字只当档位看（抽检 300 张，中位偏差 17%）。'
              : '5000p 以上的展示价、以及超过中位 6 倍的钓鱼价都已剔除。'))
      + '</p>';
    return h + '</div>';
  }
  (function () {
    var last = prStore();
    var g = function () {
      var s = prStore();
      if (s === last) return;
      last = s;
      renderCalc();
    };
    if (window.ZKSTORE) ZKSTORE.watch(g);
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      if (t.closest('#priceStore .prx-sbtn') || t.closest('[data-a="lang"]')
          || t.closest('[data-zk-l]') || t.closest('#langFloat')) {
        setTimeout(g, 0);
      }
    });
  })();
  function renderCalc() {
    var _fpKeep = FUSPOP_I;                          /* 浮框开着的话，重绘完要跟着新数值重挂 */
    window.ZKSGW(K.w);
    var host = document.getElementById('calc-body');
    if (!host) return;
    var h = '';
    h += '<div class="kv"><label>搜索武器</label><input type="text" id="q" placeholder="输入关键字，如 执法者 / 布拉玛" value="'
      + esc(K.w ? wname(K.w) : '') + '"></div>';
    h += '<div class="cands" id="cands"></div>';
    h += '<div class="grid4">';
    h += '<div class="kv"><label>命中武器</label><b>'
      + (K.w ? '<button type="button" class="wname" data-a="torange" data-k="k" data-b="' + K.comboIdx
          + '" title="跳到倾向 / 区间表">' + esc(wname(K.w))
          + '<svg class="ic" aria-hidden="true" focusable="false"><use href="#i-arrow-right"/></svg></button>'
        : '—') + '</b></div>';
    h += '<div class="kv"><label>武器类型</label><b>' + esc(K.w ? (P.catName[K.w.cat] || [K.w.cat])[Math.min(lang, 2)] : '—') + '</b></div>';
    h += '<div class="kv"><label>当前倾向</label><b class="acc-num">' + n2(kDisp()) + '</b></div>';
    h += '<div class="kv"><label>手填倾向</label><input type="number" step="0.01" id="manual" value="' + esc(K.manual) + '" placeholder="留空 = ' + n2(ZKC.disp(K.w)) + '"></div>';
    h += '<div class="kv"><label>词条组合</label><select id="combo">';
    P.combo.forEach(function (c, i) { h += opt(i, c.name, K.comboIdx); });
    h += '</select></div>';
    h += '<div class="kv"><label>当前等级</label><input type="number" id="rank" min="0" max="' + P.maxRank + '" step="1" value="' + K.rank + '" style="width:48px"><button type="button" class="btn ghost sm rankmax" data-a="rankmax" title="一键满级">↑</button><button type="button" class="btn ghost sm" data-a="fixrank" title="按对中差值修正等级（保留已填数值）">修</button></div>';
    h += '<div class="kv"><label>段位</label><input type="number" id="mr" min="8" max="16" step="1" value="' + K.mr + '"></div>';
    h += '<div class="kv"><label>' + (ZKC.isUnified() ? '对比历史倾向' : '对比变体倾向')
      + '</label><input type="number" step="0.01" id="cmp" value="' + esc(K.cmp) + '"'
      + (ZKC.isUnified() ? '' : ' placeholder="没有变体"')
      + ' title="'
      + (ZKC.isUnified() ? '这把武器在最后时光的武器倾向表里的历史倾向值'
                         : '同本体另一把的倾向值（没有变体的武器留空）') + '"></div>';
    h += '<div class="kv"><label>循环次数</label><input type="number" min="0" step="1" id="cyc" value="' + (K.rolls != null ? K.rolls : 10) + '" title="卡面洗卡/循环次数，跟着输入走，默认 10"></div>';
    h += '<div class="kv"><label>极性</label><span class="pol-cyc">'
      + POL_ICONS.map(function (p) {
          return '<button type="button" class="pol-ic' + (K.pol === p.k ? ' on' : '') + '" data-a="pol" data-v="'
            + p.k + '" title="' + (LANGS[lang]==='国服' ? p.cn : p.n) + '" style="margin:0 3px;padding:2px;background:transparent;border:1px solid '
            + (K.pol === p.k ? '#e8b84b' : 'rgba(128,128,128,.35)') + ';border-radius:6px;cursor:pointer"><img src="'
            + p.src + '" alt="' + (LANGS[lang]==='国服' ? p.cn : p.n) + '" style="width:24px;height:24px;display:block"></button>';
        }).join('')
      + '</span></div>';
    h += '</div>';
    var L = lists();
    h += '<p class="hint tswipe">表格较宽，可左右滑动查看 →</p>';
    h += '<div class="tscroll"><table class="res"><tr><th>词条位</th><th>属性</th><th>当前值</th>'
      + '<th>理论最小</th><th>理论中值</th><th>理论最大</th><th>对中差值</th><th>评级</th>'
      + '<th>' + (ZKC.isUnified() ? '对比历史倾向' : '对比变体倾向') + '</th></tr>';
    var gs = [], rows = [];
    var _dev = calcDevs(), _devByI = {};
    for (var _d = 0; _d < _dev.length; _d++) _devByI[_dev[_d].i] = _dev[_d].g;
    for (var i = 0; i < 4; i++) {
      var r = K.rows[i], cv = parseFloat(K.vals[i]);
      var mn = theory(r, 'min'), md = theory(r, 'mid'), mx = theory(r, 'max');
      var g = _devByI.hasOwnProperty(i) ? _devByI[i] : NaN;
      gs.push(g); rows.push({ mn: mn, md: md, mx: mx, g: g, cv: cv });
      h += '<tr><td>' + (i === 3 ? '负面词条' : '正面词条 ' + (i + 1)) + '</td>'
        + '<td><span class="krowsel"><select data-a="krow" data-i="' + i + '">' + opt(0, '—', r);
      h += optGrouped(L[i], r);
      var _canFus = !!(r && K.w && fusePartners(K.w.cat, r).length);
      h += '</select>'
        + '<button type="button" class="btn ghost sm fusbtn" data-a="kfus" data-i="' + i + '"'
        + (_canFus ? '' : ' disabled') + ' title="'
        + (_canFus ? '看这条词条融合出哪些产物、各给多少' : '这条词条没有可融合的产物') + '">融</button></span></td>'
        + '<td><input type="number" step="0.01" data-a="kval" data-i="' + i + '" value="'
        + esc(isFinite(cv) ? inpNum(cv, r) : K.vals[i]) + '"></td>'
        + '<td>' + kfmt(mn, r) + '</td><td>' + kfmt(md, r) + '</td><td>' + kfmt(mx, r) + '</td>'
        + '<td>' + (isFinite(g) ? ((Math.abs(g) < 5e-5 ? 0 : g) * 100).toFixed(2) + '%' : '') + '</td>'
        + '<td>' + (isFinite(g) ? '<span class="grade ' + gClass(grade(g)) + '">' + grade(g) + '</span>' : '') + '</td>'
        + '<td>' + (isFinite(cv) && isFinite(kDisp()) && kDisp() !== 0 && K.cmp !== '' && isFinite(+K.cmp)
             ? kfmt(cv / kDisp() * K.cmp, r) : '') + '</td></tr>';
    }
    h += '</table></div>';
    var vg = [];
    for (i = 0; i < 3; i++) if (isFinite(gs[i])) vg.push(gs[i]);
    var avg = vg.length ? vg.reduce(function (a, b) { return a + b; }, 0) / vg.length : NaN;
    var badRows = _dev.filter(function (d) { return Math.abs(d.g) > P.variantTh; });
    var over = badRows.length > 0;
    var limTxt = (P.variantTh * 100).toFixed(0);
    var gradeName = isFinite(avg) ? grade(avg) : '';
    h += '<div class="verdict">';
    var chkTitle, chkBody;
    if (!_dev.length) {
      chkTitle = '—'; chkBody = '还没填够词条';
    } else if (over) {
      chkTitle = '需要核对' + (badRows.length > 1 ? '（' + badRows.length + ' 条）' : '');
      chkBody = badRows.map(function (d) {
        return (d.neg ? '负面词条「' : '「') + esc(sname(d.row)) + '」偏离 '
          + (Math.abs(d.g) * 100).toFixed(2) + '% 超出浮动极限 ' + limTxt + '%';
      }).join('<br>') + '<br>※ 请核对武器变体与倾向';
    } else if (!isFinite(avg)) {
      chkTitle = '—'; chkBody = '负面词条在浮动区间内；正面词条填满 3 条后给出综合评级';
    } else {
      chkTitle = '正常'; chkBody = '所有词条都在浮动区间内，卡面数值与当前武器 / 倾向自洽';
    }
    h += '<div class="vbox vleft">'
      + '<div class="vgrow"></div>'
      + '<div class="vgrade">'
      + '<span class="vlab">综合评级</span>'
      + (isFinite(avg)
          ? '<b class="biggrade ' + gClass(gradeName) + '">' + gradeName + '</b>'
          : '<b class="biggrade none">—</b>')
      + '<span class="vsub">' + (isFinite(avg)
          ? '三条正面词条对中差值的平均值 ' + (avg * 100).toFixed(2) + '%'
          : '选了词条并填上当前值后才有评级') + '</span>'
      + '</div>'
      + '<div class="vgrow"></div>'
      + '<div class="vcheck ' + (over ? 'bad' : 'ok') + '">'
      + '<svg class="ic" aria-hidden="true" focusable="false"><use href="#'
      + (over ? 'i-alert' : 'i-check') + '"/></svg>'
      + '<div><b>校验提示：' + chkTitle + '</b>'
      + '<span>' + chkBody + '</span></div>'
      + (K.fixnote ? '<div class="vfixnote" style="margin-top:6px;font-size:12px;opacity:.85">' + esc(K.fixnote) + '</div>' : '')
      + '</div>'
      + '</div>';
    var kItems = [];
    if (K.w) {
      for (i = 0; i < 4; i++) {
        if (!K.rows[i] || !isFinite(parseFloat(K.vals[i]))) continue;
        kItems.push({ row: K.rows[i], val: parseFloat(K.vals[i]), neg: (i === 3) });
      }
    }
    h += '<div class="vbox vright">'
      + rcardHtml(calcName(), kItems, K.w ? '还没有填词条' : '还没有选武器', K.rolls, !!K.w, K.mr, K.rank)
      + '<p class="ctip">按游戏内紫卡的排版：卡面中间写出紫卡名与各条词条（带正负号），'
      + '数值取自左表「当前值」。</p>'
      + '<div class="ctip btns"><button type="button" class="btn sm" data-a="genwm" data-b="calc">生成 WM 脚本</button><button type="button" class="btn sm" data-a="kopylist">复制紫卡信息</button><button type="button" class="btn sm" data-a="gotoPick">再洗一次</button><button type="button" class="btn sm violet" data-a="kdmg">导入收益计算</button></div>'
      + '</div>';
    h += '</div>';
    h += priceRefHtml();          /* 综合评级下面紧跟行情，形成「好不好 + 值多少」的连贯判断 */
    h += '<details open class="calc-fold"><summary class="calc-sub"><span class="dot dot-cyan"></span>等级换算 <em>当前数值按等级线性缩放</em><span class="fold-arr"></span></summary>';
    h += '<div class="calc-fold-body">';
    h += '<p class="hint tswipe">表格较宽，可左右滑动查看 →</p>';
    h += '<div class="tscroll"><table class="res lvc"><tr><th>词条</th><th>满级</th>';
    for (i = 0; i <= P.maxRank; i++) h += '<th' + (i === K.rank ? ' class="rk-now"' : '') + '>' + i + '</th>';
    h += '</tr>';
    var lvScale = (P.maxRank + 1) / (K.rank + 1);   // 卡面数值已按满级存储，K.rank=满级时 lvScale=1，折算不变
    for (i = 0; i < 4; i++) {
      if (!K.rows[i]) continue;
      var full = parseFloat(K.vals[i]);
      var fullMax = isFinite(full) ? full * lvScale : NaN;   // 折算到满级
      h += '<tr><td>' + esc(sname(K.rows[i])) + '</td><td>' + kfmt(fullMax, K.rows[i]) + '</td>';
      for (var rk = 0; rk <= P.maxRank; rk++)
        h += '<td' + (rk === K.rank ? ' class="rk-now"' : '') + '>'
          + (isFinite(fullMax) ? kfmt(fullMax * (rk + 1) / (P.maxRank + 1), K.rows[i]) : '') + '</td>';
      h += '</tr>';
    }
    h += '</table></div>';
    h += '</div></details>';
    h += rivenRecHtml();
    h += '<details open class="calc-fold"><summary class="calc-sub"><span class="dot dot-cyan"></span>综合属性雷达图'
      + ' <em>当前紫卡各维度输出 · 含武器及变体</em><span class="fold-arr"></span></summary>'
      + '<div class="calc-fold-body"><div class="radar-grid">';
    radarWeapons().forEach(function (it) {
      h += '<div class="radar-item"><div class="radar-name radar-link" data-idx="' + it.idx
        + '" onclick="switchSearch(' + it.idx + ')" title="点击切换到分析识别计算器并高亮该武器">' + esc(wname(it.w))
        + (it.w === K.w ? '（当前）' : '') + ' · 倾向 ' + n2(ZKC.disp(it.w))
        + (radarMismatch(it.w) ? '<span class="radar-mismatch">数值对不上</span>' : '')
        + '</div><canvas id="radarCalc_' + it.idx + '" width="560" height="440"></canvas>'
        + '<div class="radar-legend"><span class="rl-min">■</span>里圈=最小值 '
        + '<span class="rl-mid">■</span>中圈=中间值 '
        + '<span class="rl-max">■</span>外圈=最大值</div></div>';
    });
    h += '</div><p class="ctip">比例尺＝浮动系数 0.9（里圈·最小值）→ 1.0（中圈·中间值）→ 1.1（外圈·最大值），不是武器真实数值；标签给出每个词条的 最小/中值/最大 真实数值，变体只换倾向、其余输入不动，负词条红标。</p>';
    h += '</div></details>';
    h += decompHtml();
    host.innerHTML = h;
    decompBind();     /* 数值列的输入事件（重建 DOM 后要重新绑） */
    decompPaint();    /* 回收率 / 投入说明 / 「改过」高亮都由它刷 */
    renderCands();
    drawRadar();
    if (_fpKeep >= 0) syncFusePop(_fpKeep);           /* 浮框跟着重绘后的数值/词条重算 */
  }
  function radarWeapons() {
    var out = [];
    if (!K.w) return out;
    var bn = baseName(K.w);
    for (var i = 0; i < WEAPONS.length; i++) {
      var w = WEAPONS[i];
      if (baseName(w) === bn) out.push({ w: w, idx: i });
    }
    return out;
  }
  function radarRaw(w) {
    var dims = [];
    var c = P.combo[K.comboIdx];
    for (var i = 0; i < 4; i++) {
      var r = K.rows[i]; if (!r) continue;
      var b = rollBase(r, K.w.cat);
      if (!isFinite(b) || !b) continue;
      var coef = (i === 3) ? c.neg : c.gain;
      if (!coef) continue;
      var k0 = b * coef * ZKC.disp(K.w) / 9 * (1 + K.rank);   // 变体：只换倾向，其余输入数值不变
      var lo = k0 * P.lo, mid = k0 * P.mid, hi = k0 * P.hi;
      var glo = toGame(lo, r), ghi = toGame(hi, r);
      var mn, mx;
      if (isFinite(glo) && isFinite(ghi)) { mn = glo <= ghi ? lo : hi; mx = glo >= ghi ? lo : hi; }
      else { mn = lo; mx = hi; }
      dims.push({ label: sname(r), min: mn, mid: mid, max: mx, neg: mn < 0,
        pct: NON_PCT.indexOf(r) < 0,   /* 是否百分比词条（参照历史记录区域的单位逻辑 NON_PCT） */
        isFac: isFactionRow(r),       /* 派系伤害词条显示 × 值（同历史记录 histVal） */
        dMin: toGame(mn, r), dMid: toGame(mid, r), dMax: toGame(mx, r), cur: (function () {
          var v = parseFloat(K.vals[i]); return isFinite(v) ? toGame(v, r) : NaN;
        })() });
    }
    return dims;
  }
  function radarMismatch(w) {
    var dims = radarRaw(w);
    for (var i = 0; i < dims.length; i++) {
      var d = dims[i];
      if (!isFinite(d.cur)) continue;
      var a = Math.abs(d.cur);
      var lo = Math.min(Math.abs(d.dMin), Math.abs(d.dMax));
      var hi = Math.max(Math.abs(d.dMin), Math.abs(d.dMax));
      if (a < lo - 1e-6 || a > hi + 1e-6) return true;
    }
    return false;
  }
  window.switchSearch = function (idx) {
    var w = WEAPONS[idx];
    pickCalc(idx);            /* 直接确认选中该变体武器（02区 计算器切到它，不用再点候选） */
    var q = document.getElementById('q');
    if (!q) return;
    q.value = baseName(w);
    drawCands('q');
    var cs = CAND.q;
    for (var i = 0; i < cs.length; i++)
      if (WEAPONS[cs[i]] === w) { HOT.q = i; drawCands('q'); break; }
    q.focus();
    if (q.scrollIntoView) q.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  function drawRadar() {
    var items = radarWeapons(); if (!items.length) return;
    items.forEach(function (it) {
      var cv = document.getElementById('radarCalc_' + it.idx); if (!cv) return;
      drawRadarOne(cv, radarRaw(it.w));
    });
  }
  function drawRadarOne(cv, dims) {
    var pos = [], neg = [];
    dims.forEach(function (d) { (d.neg ? neg : pos).push(d); });
    if (!pos.length) return;
    var N = 4;   // 固定四边形（菱形）网格，词条多少不影响框架
    var axis = [0, 1, 3], slot = {};
    for (var k = 0; k < pos.length && k < 3; k++) slot[axis[k]] = pos[k];
    if (neg.length) slot[2] = neg[0];
    var items = [slot[0], slot[1], slot[2], slot[3]];   // 上 右 下 左（负面在下侧轴，index 对应 ang）
    var ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    var cx = W / 2, cy = H / 2 - 6, R = Math.min(W, H) / 2 - 96;
    var ang = function (i) { return -Math.PI / 4 + i * 2 * Math.PI / N; };
    var i, a, x, y;
    var F0 = 0.9, F1 = 1.1;
    var rOf = function (f) { return R * 0.04 + R * 0.92 * (f - F0) / (F1 - F0); };
    var clampF = function (f) { return isFinite(f) ? Math.max(F0, Math.min(F1, f)) : F0; };
    for (var l = 0; l < 5; l++) {
      var rr = rOf(F0 + l * 0.05);
      ctx.beginPath();
      for (i = 0; i <= N; i++) {
        a = ang(i % N); x = cx + rr * Math.cos(a); y = cy + rr * Math.sin(a);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = (l === 1 || l === 3) ? 'rgba(148,163,184,0.30)' : 'rgba(148,163,184,0.16)';
      ctx.lineWidth = 1; ctx.stroke();
    }
    for (i = 0; i < N; i++) {
      a = ang(i);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
      ctx.strokeStyle = 'rgba(148,163,184,0.22)'; ctx.stroke();
    }
    var rings = [
      { f: F0, color: '#4ade80', fill: 'rgba(74,222,128,0.06)' },
      { f: 1.0, color: '#facc15', fill: 'rgba(250,204,21,0.08)' },
      { f: F1, color: '#f87171', fill: 'rgba(248,113,113,0.08)' }
    ];
    rings.forEach(function (rk) {
      var rr = rOf(rk.f);
      ctx.beginPath();
      for (i = 0; i <= N; i++) {
        a = ang(i % N); x = cx + rr * Math.cos(a); y = cy + rr * Math.sin(a);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = rk.fill; ctx.fill();
      ctx.strokeStyle = rk.color; ctx.lineWidth = 1.5; ctx.stroke();
    });
    if (items.some(function (d) { return d && isFinite(d.cur) && isFinite(d.mid) && d.mid !== 0; })) {
      ctx.beginPath();
      for (i = 0; i < N; i++) {
        var d0 = items[i];
        var fc = (d0 && isFinite(d0.cur) && d0.mid) ? clampF(d0.cur / d0.mid) : F0;
        var rr0 = rOf(fc); a = ang(i);
        i === 0 ? ctx.moveTo(cx + rr0 * Math.cos(a), cy + rr0 * Math.sin(a))
                : ctx.lineTo(cx + rr0 * Math.cos(a), cy + rr0 * Math.sin(a));
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(167,139,250,0.22)'; ctx.fill();
      ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 2; ctx.stroke();
      for (i = 0; i < N; i++) {
        var d1 = items[i];
        var fc2 = (d1 && isFinite(d1.cur) && d1.mid) ? clampF(d1.cur / d1.mid) : F0;
        var rr2 = rOf(fc2); a = ang(i);
        ctx.beginPath();
        ctx.arc(cx + rr2 * Math.cos(a), cy + rr2 * Math.sin(a), 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#a78bfa'; ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.stroke();
      }
    }
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fillStyle = '#22c55e'; ctx.fill();
    ctx.textAlign = 'center';
    for (i = 0; i < N; i++) {
      var d = items[i]; if (!d) continue;
      a = ang(i);
      var lx = cx + (R + 42) * Math.cos(a), ly = cy + (R + 26) * Math.sin(a);
      ctx.fillStyle = d.neg ? '#f87171' : 'rgba(226,232,240,0.95)';
      ctx.font = 'bold 13px system-ui'; ctx.fillText(d.label, lx, ly);
      ctx.fillStyle = d.neg ? '#f87171' : 'rgba(148,163,184,0.9)';
      ctx.font = '10px system-ui';
      ctx.fillText(f3(d.dMin, d) + ' / ' + f3(d.dMid, d) + ' / ' + f3(d.dMax, d), lx, ly + 22);
      var cs = isFinite(d.cur) ? ('当前 ' + f3(d.cur, d)) : '当前 —';
      ctx.font = 'bold 10px system-ui';
      var tw = ctx.measureText(cs).width;
      var bw = tw + 12, bh = 16, bx = lx - bw / 2, by = ly + 40;
      ctx.fillStyle = 'rgba(167,139,250,0.15)';
      ctx.strokeStyle = 'rgba(196,181,253,0.9)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx + 4, by); ctx.lineTo(bx + bw - 4, by);
      ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + 4);
      ctx.lineTo(bx + bw, by + bh - 4); ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - 4, by + bh);
      ctx.lineTo(bx + 4, by + bh); ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - 4);
      ctx.lineTo(bx, by + 4); ctx.quadraticCurveTo(bx, by, bx + 4, by);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#c4b5fd'; ctx.fillText(cs, lx, by + 11);
    }
  }
  function f3(v, d) { if (d && d.isFac) return '×' + String(Math.round(Math.abs(v) * 100) / 100); if (d && d.pct) return (v >= 0 ? '+' : '-') + String(Math.abs(Math.round(v * 10) / 10)) + '%'; return String(Math.round(v * 10) / 10); }
  var CAND = { q: [], q1: [] };    // 当前显示出来的武器下标
  var HOT = { q: -1, q1: -1 };     // 键盘高亮到第几条（-1 = 还没按过方向键）
  function candMeta(qid) {
    return qid === 'q' ? { box: 'cands', act: 'pick', cur: K.w }
                       : { box: 'cands1', act: 'pick1', cur: C[3].w };
  }
  function drawCands(qid) {
    var m = candMeta(qid);
    var q = document.getElementById(qid), box = document.getElementById(m.box);
    if (!q || !box) return;
    if (!q.value) { box.innerHTML = ''; CAND[qid] = []; HOT[qid] = -1; return; }
    CAND[qid] = findWeapon(q.value).slice(0, 10);
    if (!CAND[qid].length) {
      box.innerHTML = '<div class="hint">没匹配到武器</div>'; HOT[qid] = -1; return;
    }
    if (HOT[qid] < 0 || HOT[qid] >= CAND[qid].length) HOT[qid] = 0;
    var h = '';
    CAND[qid].forEach(function (idx, n) {
      var w = WEAPONS[idx];
      h += '<div class="cand' + (m.cur === w ? ' on' : '') + (n === HOT[qid] ? ' hot' : '')
        + '" data-a="' + m.act + '" data-i="' + idx + '" role="option" aria-selected="'
        + (m.cur === w ? 'true' : 'false') + '">'
        + '<span class="n">' + (n + 1) + '</span><b>' + esc(wname(w)) + '</b>'
        + '<span class="meta">'
        + (isVariant(w) ? '<span class="tag-var">变体 · ' + esc(baseName(w)) + '</span>' : '')
        + '<span class="cat">' + esc(w.cat) + ' · ' + n2(ZKC.disp(w)) + '</span></span></div>';
    });
    box.innerHTML = h;
  }
  function renderCands() { drawCands('q'); }
  function moveHot(qid, d) {
    var n = CAND[qid] ? CAND[qid].length : 0;
    if (!n) return;
    HOT[qid] = ((HOT[qid] < 0 ? 0 : HOT[qid]) + d + n) % n;
    drawCands(qid);
  }
  function enterHot(qid) {
    var n = CAND[qid] ? CAND[qid].length : 0;
    if (!n) return;
    var idx = CAND[qid][HOT[qid] < 0 ? 0 : HOT[qid]];
    if (qid === 'q') pickCalc(idx); else pick1(idx);
  }
  function pickCalc(idx) {
    pushHist();
    K.w = WEAPONS[idx]; K.manual = '';
    autoCmpForVariant(K.w);              // 选武器 对比历史倾向自动填这把武器在博物馆里的历史值
    for (var i = 0; i < 4; i++)
      if (K.rows[i] && !isFinite(baseOf(K.rows[i], K.w.cat))) { K.rows[i] = 0; K.vals[i] = ''; }
    renderCalc(); commit();
  }
  function pick1(idx) {
    pushHist();
    C[3].w = WEAPONS[idx];
    window.ZKSGW(WEAPONS[idx]);
    C[2].w = WEAPONS[idx]; C[2].locks = [false, false, false, false];
    genStats(C[2], false);
    C[2].rerolls = 0; C[2].kuva = 0;      // 换武器 = 换一张新卡，洗卡计数归零
    RV_TOP = []; RV_N = 0; RV_UNIQ = 0; RV_SIG = '';   // 换武器开新卡 「洗 N 次」旧候选清空
    ACTIVE_BLK = 2;   // 搜索选中 右栏跟随 C[2]
    render(); commit();
  }
  function renderConsts() {
    var host = document.getElementById('consts');
    if (!host) return;
    function coef(v) {
      if (!v) return '0';
      return String(Number(v).toFixed(4)).replace(/0+$/, '').replace(/\.$/, '');
    }
    var h = '<div class="ctwo">';
    h += '<div class="ctable"><h4>浮动系数</h4><table><tr><th>取值</th><th>系数</th></tr>'
      + '<tr><td>下限</td><td class="num">' + coef(P.lo) + '</td></tr>'
      + '<tr><td>中值</td><td class="num">' + coef(P.mid) + '</td></tr>'
      + '<tr><td>上限</td><td class="num">' + coef(P.hi) + '</td></tr>'
      + '</table><p class="ctip">洗卡时在上下限之间均匀取一个随机乘数。</p></div>';
    h += '<div class="ctable"><h4>词条组合修正系数</h4>'
      + '<table><tr><th>属性组合</th><th>增益系数</th><th>减益系数</th></tr>';
    P.combo.forEach(function (c) {
      h += '<tr><td>' + esc(c.name) + '</td><td class="num pos">' + coef(c.gain)
        + '</td><td class="num ' + (c.neg ? 'neg' : 'zero') + '">'
        + (c.neg ? coef(c.neg) : '0') + '</td></tr>';
    });
    h += '</table><p class="ctip">「3增益0减益」的增益系数比「2增益0减益」低，是因为它多一条正面词条，'
      + '单条数值要压下来，总收益才是平衡的。</p></div>';
    host.innerHTML = h + '</div>';
  }
  function render() { renderSim(); renderCalc(); renderConsts(); }
  var UNDO = [], REDO = [], LAST = '', UNDO_MAX = 80;
  function wi(w) { return w ? WEAPONS.indexOf(w) : -1; }
  function snap() {
    var c = {};
    [1, 2, 3, 4].forEach(function (b) {
      var k = C[b];
      c[b] = {
        wi: wi(k.w),
        slots: k.slots.map(function (s) { return s ? { row: s.row, name: s.name, val: s.val } : null; }),
        locks: k.locks.slice(),
        products: k.products.map(function (p) { return { row: p.row, name: p.name, val: p.val }; }),
        combo: { gain: k.combo.gain, neg: k.combo.neg },
        fus: k.fus.slice(), note: k.note,
        rerolls: k.rerolls || 0, kuva: k.kuva || 0
      };
    });
    return JSON.stringify({
      c: c, lang: lang,
      k: { wi: wi(K.w), manual: K.manual, comboIdx: K.comboIdx, rank: K.rank, mr: K.mr, rolls: K.rolls, cmp: K.cmp,
           pol: K.pol, rows: K.rows.slice(), vals: K.vals.slice(), locks: K.locks.slice() }
    });
  }
  function restore(s) {
    var o = ZKHTML.safeParse(s, null);
    if (!o || !o.c || !o.k) { ZKHTML.warn('restore:快照不可用', new Error('结构缺 c/k')); return false; }
    var _arr = function (v) { return Object.prototype.toString.call(v) === '[object Array]' ? v : []; };
    [1, 2, 3, 4].forEach(function (b) {
      var src = o.c[b] || {}, k = C[b];
      k.w = (src.wi >= 0 && WEAPONS[src.wi]) ? WEAPONS[src.wi] : null;
      k.slots = _arr(src.slots).map(function (x) { return x ? { row: x.row, name: x.name, val: x.val } : null; });
      while (k.slots.length < 4) k.slots.push(null);
      k.locks = _arr(src.locks).slice(0, 4);
      while (k.locks.length < 4) k.locks.push(false);
      k.products = _arr(src.products).map(function (p) { return { row: p.row, name: p.name, val: p.val }; });
      k.combo = src.combo ? { gain: src.combo.gain, neg: src.combo.neg } : k.combo;
      k.fus = _arr(src.fus).length === 2 ? src.fus.slice() : [0, 0];
      k.note = src.note || '';
      k.rerolls = src.rerolls || 0; k.kuva = src.kuva || 0;
    });
    K.w = (o.k.wi >= 0 && WEAPONS[o.k.wi]) ? WEAPONS[o.k.wi] : null;
    K.manual = o.k.manual; K.comboIdx = o.k.comboIdx; K.rank = o.k.rank; K.mr = o.k.mr || 8; K.rolls = o.k.rolls || 10; K.cmp = o.k.cmp;
    K.pol = o.k.pol || 'madurai';
    K.rows = _arr(o.k.rows).slice(); while (K.rows.length < 4) K.rows.push(0);
    K.vals = _arr(o.k.vals).slice(); while (K.vals.length < 4) K.vals.push('');
    K.locks = (o.k.locks && o.k.locks.length === 4) ? o.k.locks.slice() : prejudgeLocks(K.rows, null);
    lang = o.lang;
    return true;
  }
  function pushHist() {
    if (!LAST) return;
    UNDO.push(LAST);                 // LAST 是「改动之前」的状态
    if (UNDO.length > UNDO_MAX) UNDO.shift();
    REDO.length = 0;                 // 有新改动，重做链就断
  }
  function commit() { LAST = snap(); syncHist(); }
  function syncHist() {
    var u = document.getElementById('undoBtn'), r = document.getElementById('redoBtn');
    if (u) u.disabled = !UNDO.length;
    if (r) r.disabled = !REDO.length;
    var cus = document.querySelectorAll('.cmpc button[data-a="undo"]');
    for (var i = 0; i < cus.length; i++) cus[i].disabled = !UNDO.length;
  }
  function undo() {
    if (!UNDO.length) return;
    var s = UNDO[UNDO.length - 1];
    if (!restore(s)) { UNDO.pop(); syncHist(); return; }
    REDO.push(LAST); UNDO.pop(); LAST = s;
    syncLangBtns(); render(); syncHist();
  }
  function redo() {
    if (!REDO.length) return;
    var s = REDO[REDO.length - 1];
    if (!restore(s)) { REDO.pop(); syncHist(); return; }
    UNDO.push(LAST); REDO.pop(); LAST = s;
    syncLangBtns(); render(); syncHist();
  }
  function syncLangBtns() {
    var bs = document.querySelectorAll('#langSeg button');
    for (var i = 0; i < bs.length; i++)
      bs[i].classList.toggle('on', +bs[i].getAttribute('data-i') === lang);
    var fs = document.querySelectorAll('#langFloat button[data-a="lang"]');
    for (var j = 0; j < fs.length; j++)
      fs[j].classList.toggle('on', +fs[j].getAttribute('data-i') === lang);
  }
  var AUTOWARN_CN = {
    h: '自动配装提醒',
    b: '配装由系统生成，<b>不代表真实配卡</b>；可以自由配装探索玩法，<b>注意辨别以免损失</b>。'
  };
  var AUTOWARN_EN = {
    h: 'Auto-Loadout Notice',
    b: 'This loadout is <b>generated by the system</b>, not a real in-game card build. ' +
       'Use it freely to explore playstyles, but <b>mind the difference so you don\'t lose out</b>.'
  };
  function relabelAutoWarn() {
    var o = (lang === 2) ? AUTOWARN_EN : AUTOWARN_CN;
    var ids = [['g-mbwarn-h', 'g-mbwarn-b'], ['mbwarn-h', 'mbwarn-b']];
    for (var i = 0; i < ids.length; i++) {
      var h = document.getElementById(ids[i][0]), b = document.getElementById(ids[i][1]);
      if (h) h.textContent = o.h;
      if (b) b.innerHTML = o.b;
    }
  }
function theme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}
function themeIcon(t) {
  var u = document.querySelector('#themeBtn use');
  if (u) u.setAttribute('href', t === 'light' ? '#i-sun' : '#i-moon');
  var b = document.getElementById('themeBtn');
  if (b) b.setAttribute('title', t === 'light' ? '当前亮色，点击切到暗色' : '当前暗色，点击切到亮色');
}
function setTheme(t) {
  t = t === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('zk-theme', t); } catch (e) { ZKHTML.warn('框架/app.js:2953', e); }   // 无痕模式下会抛，忽略
  themeIcon(t);
}
  document.addEventListener('change', function (e) {
    var t = e.target, a = t.getAttribute('data-a');
    if (!a) {
      if (t.id === 'combo') { pushHist(); K.comboIdx = +t.value; renderCalc(); commit(); }
      if (t.id === 'rank') {
        pushHist();
        var __oldR = K.rank;
        K.rank = Math.max(0, Math.min(P.maxRank, +t.value || 0));
        if (isFinite(__oldR) && __oldR !== K.rank) {
          var __f = (1 + K.rank) / (1 + __oldR);
          for (var __i = 0; __i < 4; __i++) {
            var __v = parseFloat(K.vals[__i]);
            if (K.rows[__i] && isFinite(__v)) K.vals[__i] = String(__v * __f);
          }
        }
        renderCalc(); commit();
      }
      if (t.id === 'mr') { pushHist(); K.mr = Math.max(8, Math.min(16, +t.value || 8)); renderCalc(); commit(); }
      if (t.id === 'cyc') { pushHist(); K.rolls = Math.max(0, Math.floor(+t.value) || 0); renderCalc(); commit(); }
      if (t.id === 'manual') { pushHist(); K.manual = t.value; renderCalc(); commit(); }
      if (t.id === 'cmp') { pushHist(); K.cmp = parseFloat(t.value) || 0; renderCalc(); commit(); }
      return;
    }
    var blk = +t.getAttribute('data-b'), i = +t.getAttribute('data-i');
    if (a === 'slot') {
      var row = +t.value, card = C[blk], _had = !!card.slots[i];
      if (!row && _had) {
        var _lk = false;
        for (var _li = 0; _li < 4; _li++) if (card.locks[_li] && card.slots[_li]) { _lk = true; break; }
        if (_lk) { t.value = String(card.slots[i].row); card.note = '有词条已锁定，组合类型冻结，不能删除词条改变组合数量。'; render(); return; }
      }
      pushHist();
      if (!row) { card.slots[i] = null; card.locks[i] = false; }   // 清空词条同步清锁，避免空槽残留锁定（#7）
      else if (card.w) {
        var coef = (i === 3) ? card.combo.neg : card.combo.gain;
        card.slots[i] = { row: row, name: sname(row),
          val: rollBase(row, card.w.cat) * coef * ZKC.disp(card.w) * P.mid };
      }
      if (card.w && (!_had || !row)) recalcCombo(card);
      render(); commit();
    } else if (a === 'val') {
      pushHist();
      var s = C[blk].slots[i];
      if (s) { s.val = fromGame(parseFloat(t.value), s.row); if (!isFinite(s.val)) s.val = 0; }
      render(); commit();
    } else if (a === 'lock') {
      var card = C[blk], wantLock = (t.value === '1');
      if (wantLock) {
        var _si = card.slots[i], _isFuse = _si && isFuseRow(_si.row);
        if (!_isFuse) {                          // 融合词条自动锁，不占「基础词条只能锁一个」限额
          for (var _j = 0; _j < 4; _j++) {
            if (_j === i) continue;
            var _sj = card.slots[_j];
            if (card.locks[_j] && _sj && !(isFuseRow(_sj.row))) {
              card.note = '基础词条一次只能锁定一条，请先解锁已有的基础词条锁定再锁新的。';
              render(); return;
            }
          }
        }
      }
      pushHist(); card.locks[i] = wantLock; render(); commit();
    } else if (a === 'opencat') {
      OPEN_CAT = t.value || '';   // 仅记录筛选，不重开卡；
    } else if (a === 'fus') {
      pushHist();
      var c = C[blk], v = +t.value;
      c.fus[i] = v;
      var other = c.fus[i === 0 ? 1 : 0];
      if (v && other && !fuseProd(c.w ? c.w.cat : '', v, other)) c.fus[i === 0 ? 1 : 0] = 0;
      render(); commit();
    } else if (a === 'krow') {
      pushHist();
      var _oG = P.combo[K.comboIdx].gain, _oN = P.combo[K.comboIdx].neg;   // 变更前组合系数
      K.rows[i] = +t.value;
      if (isFuseRow(K.rows[i])) K.locks[i] = true; else K.locks[i] = false;
      var _pn = 0, _nn = 0;
      for (var _k2 = 0; _k2 < 3; _k2++) if (K.rows[_k2]) _pn++;
      if (K.rows[3]) _nn = 1;
      var _nIdx = comboIdxOf(_pn, _nn);
      if (_nIdx !== K.comboIdx) {
        var _nG = P.combo[_nIdx].gain, _nN = P.combo[_nIdx].neg;
        for (var _k3 = 0; _k3 < 4; _k3++) {
          if (_k3 === i || !K.rows[_k3]) continue;
          var _isN3 = (_k3 === 3);
          var _oc3 = _isN3 ? _oN : _oG, _nc3 = _isN3 ? _nN : _nG;
          if (isFinite(_oc3) && _oc3 !== 0 && isFinite(_nc3)) {
            var _cv3 = parseFloat(K.vals[_k3]);
            if (isFinite(_cv3)) K.vals[_k3] = String(_cv3 * (_nc3 / _oc3));
          }
        }
      }
      K.comboIdx = _nIdx;
      if (K.rows[i]) { var _m2 = theory(K.rows[i], 'min'); K.vals[i] = isFinite(_m2) ? String(_m2) : ''; }
      else K.vals[i] = '';
      renderCalc(); commit();
    } else if (a === 'kval') {
      pushHist();
      var kr = K.rows[i], kg = fromGame(parseFloat(t.value), kr);
      K.vals[i] = isFinite(kg) ? String(kg) : t.value;
      renderCalc(); commit();
    }
  });
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t && t.getAttribute && t.getAttribute('data-a') === 'kval') {
      var _ki = +t.getAttribute('data-i'), _kv = parseFloat(t.value);
      if (_ki === FUSPOP_I) refreshFusePopLive(isFinite(_kv) ? fromGame(_kv, K.rows[_ki]) : NaN);
    }
    if (t.id === 'q') drawCands('q');
    if (t.id === 'q1') drawCands('q1');      // ① 区搜索框，和计算器的分开
  });
  document.addEventListener('keydown', function (e) {
    var t = e.target || {}, tag = t.tagName;
    var inText = (tag === 'INPUT' && (t.type === 'text' || t.type === 'search'))
              || tag === 'TEXTAREA';
    if (e.key === 'Escape' && (t.id === 'q' || t.id === 'q1' || t.id === 'rgQ')) {
      var boxId = t.id === 'q' ? 'cands' : (t.id === 'q1' ? 'cands1' : 'rgCands');
      var bx = document.getElementById(boxId);
      if (bx) bx.innerHTML = '';
      CAND[t.id] = []; HOT[t.id] = -1;
      if (t.id === 'rgQ') { RG.q = []; RG.hot = -1; }
      return;
    }
    var mod = e.ctrlKey || e.metaKey;
    if (mod && !inText && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
      return;
    }
    if (mod && !inText && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); return; }
    if (t.id === 'q' || t.id === 'q1') {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveHot(t.id, 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveHot(t.id, -1); }
      else if (e.key === 'Enter') { e.preventDefault(); enterHot(t.id); }
    }
  });
  document.addEventListener('click', function (e) {
    var t = e.target;
    var _fp0 = fusePopEl();       /* 浮框：点外面就收； */
    if (_fp0 && _fp0.classList.contains('on') && !_fp0.contains(t)
      && !(t.closest && t.closest('[data-a="kfus"]'))) closeFusePop();
    while (t && t !== document && !(t.getAttribute && t.getAttribute('data-a'))) t = t.parentNode;
    if (!t || t === document) return;
    var a = t.getAttribute('data-a'), i, b;
    function blkOf(el) {
      var v = el.getAttribute('data-b') || el.getAttribute('data-blk');
      if (v) return +v;
      var n = el;
      while (n && n !== document) {
        if (n.id === 'c2') return 1;
        if (n.id === 'c2wrap') return ACTIVE_BLK;   // 03 区右栏：跟随最近选中的武器
        n = n.parentNode;
      }
      return 1;
    }
    if (a === 'kfus') {
      var _ki = +t.getAttribute('data-i'), _fe2 = fusePopEl();
      if (_fe2 && _fe2.classList.contains('on') && FUSPOP_I === _ki) closeFusePop();
      else openFusePop(t, _ki);
      return;
    }
    if (a === 'kfusx') { closeFusePop(); return; }
    if (a === 'pick') { pickCalc(+t.getAttribute('data-i')); return; }
    if (a === 'pick1') { pick1(+t.getAttribute('data-i')); return; }
    if (a === 'ocr-go') { ocrRun(); return; }
    if (a === 'ocr-clear') { ocrClear(); return; }
    if (a === 'undo') { undo(); return; }
    if (a === 'redo') { redo(); return; }
    if (a === 'theme') { setTheme(theme() === 'light' ? 'dark' : 'light'); return; }
    if (a === 'pol') { pushHist(); K.pol = t.getAttribute('data-v') || 'madurai'; renderCalc(); return; }   // #17 极性变更纳入撤销历史
    if (a === 'rankmax') {
      pushHist();
      var __oldR2 = K.rank;
      K.rank = P.maxRank;
      if (isFinite(__oldR2) && __oldR2 !== K.rank) {
        var __f2 = (1 + K.rank) / (1 + __oldR2);
        for (var __i2 = 0; __i2 < 4; __i2++) {
          var __v2 = parseFloat(K.vals[__i2]);
          if (K.rows[__i2] && isFinite(__v2)) K.vals[__i2] = String(__v2 * __f2);
        }
      }
      renderCalc(); commit();
      return;
    }
    function diffSumAt(__r) {
      var __o = K.rank; K.rank = __r;
      var __s = 0, __n = 0;
      for (var __i3 = 0; __i3 < 4; __i3++) {
        var __row = K.rows[__i3]; if (!__row) continue;
        var __v3 = parseFloat(K.vals[__i3]); if (!isFinite(__v3)) continue;
        var __m = theory(__row, 'mid');
        if (isFinite(__m) && __m !== 0) {
          var __d3 = (__i3 === 3) ? (1 - __v3 / __m) : (__v3 / __m - 1);
          __s += Math.abs(__d3); __n++;
        }
      }
      K.rank = __o;
      return __n ? __s : Infinity;
    }
    if (a === 'fixrank') {
      var __curS = diffSumAt(K.rank), __s0 = diffSumAt(0), __s8 = diffSumAt(P.maxRank);
      var __best = K.rank, __bs = __curS;
      if (__s0 < __bs) { __bs = __s0; __best = 0; }
      if (__s8 < __bs - 1e-6) { __bs = __s8; __best = P.maxRank; }
      if (__best !== K.rank) {
        pushHist();
        K.rank = __best;   /* 只改等级，数值冻结不动 */
        K.fixnote = '已按对中差值把等级修正为 ' + __best + ' 级（已填数值保持不变）';
        renderCalc(); commit();
      } else { K.fixnote = '当前等级的对中差值已合理，无需修正'; renderCalc(); }
      return;
    }
    if (a === 'kopylist') { kopylist(t); return; }
    if (a === 'gotoPick') { gotoPickFromCalc(t); return; }
    if (a === 'kdmg') { importToDmg(t); return; }
    if (a === 'washFromRange') { washFromRange(); return; }
    if (a === 'fnmove') { fnMove(t); return; }
    if (a === 'torange') {
      var ciT = t.getAttribute('data-b');
      var kT = t.getAttribute('data-k') || '';
      var wT = kT === 'k' ? K.w : (kT ? C[+kT].w : null);
      gotoRanges(wT, ciT === '' || ciT == null ? -1 : +ciT);
      return;
    }
    if (a === 'go') {                                    // 首屏模块入口 -> 滚到对应版块
      var host = document.querySelector(t.getAttribute('data-b'));
      if (host && host.scrollIntoView) {
        try { host.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (er) { ZKHTML.warn('框架/app.js:3234', er); }
      }
      return;
    }
    if (a === 'open') {                                  // ② 开紫卡
      pushHist();
      var pool = openPool();
      var w = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
      if (!w) {   // 兜底：该类别没有可开武器（理论上不会发生），切回全部
        OPEN_CAT = '';
        var es = document.getElementById('openCatSel'); if (es) es.value = '';
        w = OPENABLE[Math.floor(Math.random() * OPENABLE.length)];
      }
      C[1].w = w; C[1].locks = [false, false, false, false];
      genStats(C[1], false);
      C[1].rerolls = 0; C[1].kuva = 0;           // 刚开出来的卡 = 免费首抽，计数从 0 起
      C[4].w = w; C[4].locks = [false, false, false, false];
      C[4].slots = [null, null, null, null];     // ② 右侧词条在触发洗卡前保持为空
      C[4].combo = { gain: C[1].combo.gain, neg: C[1].combo.neg };
      C[4].products = []; C[4].fus = [0, 0]; C[4].note = '';
      C[4].rerolls = 0; C[4].kuva = 0;
      RV_TOP = []; RV_N = 0; RV_UNIQ = 0; RV_SIG = '';   // 重新开卡 「洗 N 次」旧候选整榜清空（旧榜可能是别的武器洗的）
      ACTIVE_BLK = 4;   // 开紫卡 右栏跟随 C[4]
      render(); commit();
    } else if (a === 'reroll2') {                        // ② 区右侧：继续洗（跟随①）
      if (!C[1].w) { alert('先点一次上面的「开紫卡」按钮抽一把，洗卡会跟着它走。'); return; }
      pushHist();
      C[4].w = C[1].w;
      var cost4 = rollCost(C[4]);                        // 按洗之前的锁定状态定价
      genStats(C[4], true);
      C[4].rerolls++; C[4].kuva += cost4;
      render(); commit();
    } else if (a === 'reroll1') {                        // 搜索武器：继续洗 C[2]
      if (!C[2].w) { alert('请先在「搜索武器」里选一把武器。'); return; }
      pushHist();
      var cost2 = rollCost(C[2]);
      genStats(C[2], true);
      C[2].rerolls++; C[2].kuva += cost2;
      render(); commit();
    } else if (a === 'rerollActive') {                    // 03 区右栏：洗当前卡一次
      var _at = C[ACTIVE_BLK];
      if (!_at.w) { alert('先在左边开一张卡，或搜一把武器选中。'); return; }
      pushHist();
      var _ac = rollCost(_at);
      genStats(_at, true);
      _at.rerolls++; _at.kuva += _ac;
      render(); commit();
    } else if (a === 'genwm') {                        // 生成 WM 填充脚本
      var _gb = t.getAttribute('data-b');
      doGenWm(_gb === 'calc' ? 'calc' : (_gb === '1' ? 1 : ACTIVE_BLK));
    } else if (a === 'copy2calc') {                      // 复制到计算器
      pushHist();
      var _cb2 = t.getAttribute('data-b');
      copyToCalc(_cb2 === 'act' ? ACTIVE_BLK : +_cb2);
      commit();
      var _sbc = document.getElementById('q');
      if (_sbc && _sbc.getBoundingClientRect) {
        try {
          var _sTop2 = _sbc.getBoundingClientRect().top + (window.pageYOffset || document.documentElement.scrollTop || 0);
          window.scrollTo({ top: Math.max(0, _sTop2), behavior: 'smooth' });
        } catch (e3) { ZKHTML.warn('框架/app.js:3309', e3); }
      }
    } else if (a === 'fuse') {
      doFusion(blkOf(t));                                // pushHist 在真正改动前才调
      commit();
    } else if (a === 'fusefill') {                       // 点搭档 chip 直接配对好两个下拉
      var fb = blkOf(t), fc = C[fb];
      pushHist();
      fc.fus = [+t.getAttribute('data-anchor'), +t.getAttribute('data-row')];
      render(); commit();
    } else if (a === 'fuserefgo') {                      // 配方速查亮紫行 点击直接合成
      var fg = blkOf(t), fgC = C[fg];
      fgC.fus = [+t.getAttribute('data-r1'), +t.getAttribute('data-r2')];
      doFusion(fg);                                      // doFusion 内部 pushHist + render
      commit();
    } else if (a === 'lang') {
      lang = +t.getAttribute('data-i');
      syncLangBtns();
      [1, 2, 3, 4].forEach(function (b) {
        C[b].slots.forEach(function (s) { if (s) s.name = sname(s.row); });
        C[b].products.forEach(function (p) { p.name = sname(p.row); });
      });
      render();
      rgRenderAll();
      if (window.ZKDMG && window.ZKDMG.lang) window.ZKDMG.lang();
      if (window.ZKDMGAB && window.ZKDMGAB.lang) window.ZKDMGAB.lang();
      if (window.ZKADV && window.ZKADV.relabel) window.ZKADV.relabel();
      if (window.ZKPAINT && window.ZKPAINT.targets) window.ZKPAINT.targets();
      relabelAutoWarn();
    }
  });
  function initNavSpy() {
    var nav = document.getElementById('topNav');
    var links = [].slice.call(document.querySelectorAll('#topNav a'));
    var secs = [];
    links.forEach(function (a) {
      var el = document.getElementById(a.getAttribute('href').slice(1));
      if (el) secs.push({ a: a, el: el });
    });
    if (!secs.length) return;
    function spy() {
      var line = (nav ? nav.getBoundingClientRect().height : 44) + 20;
      var best = secs[0];
      for (var i = 0; i < secs.length; i++)
        if (secs[i].el.getBoundingClientRect().top <= line) best = secs[i];
      for (i = 0; i < secs.length; i++) secs[i].a.classList.toggle('active', secs[i] === best);
    }
    spy();
    window.addEventListener('scroll', spy, { passive: true });
    window.addEventListener('resize', spy);
  }
  var DRAIN2RANK = window.RULES.DRAIN2RANK;
  var OCR_BUSY = false, OCR_LOADING = false;
  var OCR_GEN = 0, OCR_WAITMASK = null;
  function ocrWaitOn(txt) {
    if (typeof document === 'undefined' || !document.body) return;
    if (!OCR_WAITMASK) {
      var m = document.createElement('div');
      m.className = 'ocr-waitmask';
      m.setAttribute('role', 'alertdialog');
      m.setAttribute('aria-busy', 'true');
      m.innerHTML = '<div class="ocr-waitbox"><i class="spin" aria-hidden="true"></i>'
        + '<div><b>识别中，请勿操作</b><span id="ocrWaitTx"></span></div></div>';
      m.addEventListener('mousedown', function (e) { e.preventDefault(); e.stopPropagation(); }, true);
      m.addEventListener('keydown', function (e) { e.stopPropagation(); }, true);
      OCR_WAITMASK = m;
    }
    var t = OCR_WAITMASK.querySelector('#ocrWaitTx');
    if (t) t.textContent = txt || '正在本地识别这张卡面，几秒内完成，期间请不要切换武器或改词条。';
    if (!OCR_WAITMASK.parentNode) document.body.appendChild(OCR_WAITMASK);
  }
  function ocrWaitOff() {
    if (OCR_WAITMASK && OCR_WAITMASK.parentNode) OCR_WAITMASK.parentNode.removeChild(OCR_WAITMASK);
  }
  function ocrSay(html, kind) {
    var box = document.getElementById('ocrStatus');
    if (!box) return;
    box.className = 'ocr-status' + (kind ? ' ' + kind : '');
    box.innerHTML = html || '';
  }
  function ocrEnableGo(on) {
    var go = document.getElementById('ocrGo');
    if (go) go.disabled = !on;
  }
  var OCR_FIX_MAP = {};
  var OCR_LAST = { res: null, key: '', histIdx: -1 };
  function ocrFixKey(res) {
    if (!res) return '';
    var raw = (res.weaponRaw && (res.weaponRaw.cn || res.weaponRaw.en)) || '';
    var rn = res.rivenName || '';
    if (!raw && !rn) return '';
    return String(raw + '|' + rn).replace(/\s+/g, '');
  }
  function ocrFixBtnShow(on) {
    var b = document.getElementById('ocrFix');
    if (b) b.hidden = !on;
  }
  function ocrFixApply(idx, histIdx) {
    var w = WEAPONS[idx];
    if (!w) return;
    var r = (histIdx >= 0 && OCR_HIST[histIdx]) ? OCR_HIST[histIdx] : null;
    var _k = (r && r.fixKey) || OCR_LAST.key;
    if (_k) OCR_FIX_MAP[_k] = idx;
    if (r) {
      var from = r.weapon || '（没认出）';
      r.weaponFixedFrom = from;
      r.weaponFixedTo = wname(w);
      r.weapon = wname(w);
      r.weaponIdx = idx;
      r.weaponInferred = false;
      r.weaponAmbiguous = false;
      r.weaponForced = true;
      renderOcrHist();
      ocrFixBtnShow(true);
      ocrSay('已矫正历史识别为 <b>' + esc(wname(w)) + '</b>'
        + (from && from !== wname(w) ? '（原识别：' + esc(from) + '）' : '')
        + ' —— 仅更新该条历史记录，当前卡不受影响。', 'ok');
      return;
    }
    var from2 = K.w ? wname(K.w) : '';
    pushHist();
    K.w = w; K.manual = '';
    autoCmpForVariant(w);
    renderCalc(); commit();
    ocrFixBtnShow(true);
    ocrSay('已强制矫正为 <b>' + esc(wname(w)) + '</b>'
      + (from2 && from2 !== wname(w) ? '（原识别：' + esc(from2) + '）' : '')
      + ' —— 计算器已按它重算，本次会话内这张图不会再认错。', 'ok');
  }
  function ocrFixOpen(histIdx) {
    if (document.getElementById('ocrFixMask')) return;
    var cur = (histIdx >= 0 && OCR_HIST[histIdx]) ? OCR_HIST[histIdx] : null;
    var curName = cur ? (cur.weapon || '') : (K.w ? wname(K.w) : '');
    var mask = document.createElement('div');
    mask.className = 'ocr-fixmask'; mask.id = 'ocrFixMask';
    var box = document.createElement('div');
    box.className = 'ocr-fixbox';
    box.innerHTML = '<h4>强制矫正武器</h4>'
      + '<p>输入正确的武器名（中文 / 国际服名 / 英文名 / 外号都行），选一条点「矫正」。'
      + '只换武器，词条、等级、段位、洗练次数都不动；本次会话里这张图再识别也不会再认错。</p>'
      + '<input type="text" id="ocrFixInput" placeholder="例如：西伯利亚冰锤" autocomplete="off" spellcheck="false">'
      + '<div class="ocr-fixcands" id="ocrFixCands"></div>'
      + '<div class="ocr-fixbar"><button type="button" class="btn ghost sm" id="ocrFixCancel">取消</button>'
      + '<button type="button" class="btn sm" id="ocrFixOk">矫正</button></div>';
    mask.appendChild(box);
    document.body.appendChild(mask);
    var inp = box.querySelector('#ocrFixInput'), cbox = box.querySelector('#ocrFixCands');
    var list = [], hot = -1;
    if (curName) inp.value = curName;
    function close() {
      if (mask.parentNode) mask.parentNode.removeChild(mask);
      document.removeEventListener('keydown', onKey, true);
    }
    function drawList() {
      var q = inp.value.trim(), i2;
      list = q ? findWeapon(q).slice(0, 12) : [];
      if (!list.length && q && window.RivenOCR && typeof window.RivenOCR.rankWeapon === 'function') {
        var rk = window.RivenOCR.rankWeapon(q, '') || [];
        list = [];
        for (i2 = 0; i2 < rk.length && list.length < 12; i2++) {
          if (rk[i2] && rk[i2].row && rk[i2].score >= 70) list.push(WEAPONS.indexOf(rk[i2].row));
        }
      }
      list = list.filter(function (x) { return x >= 0; });
      if (hot < 0 && list.length) hot = 0;
      if (hot >= list.length) hot = list.length - 1;
      var h = '';
      for (i2 = 0; i2 < list.length; i2++) {
        var w2 = WEAPONS[list[i2]];
        h += '<div class="fx' + (i2 === hot ? ' hot' : '') + '" data-i="' + list[i2] + '">'
          + '<b>' + esc(wname(w2)) + '</b><span class="cat">' + esc(w2.cat) + '</span></div>';
      }
      cbox.innerHTML = h || '<div class="fx">' + (q ? '没匹配到武器' : '输入武器名后这里出候选') + '</div>';
      var fx = cbox.querySelectorAll('.fx[data-i]');
      for (var j = 0; j < fx.length; j++) {
        (function (el) { el.addEventListener('click', function () { pick(+el.getAttribute('data-i')); }); })(fx[j]);
      }
    }
    function pick(idx) { close(); ocrFixApply(idx, histIdx); }
    function commitSel() {
      if (list.length) pick(list[hot >= 0 && hot < list.length ? hot : 0]);
      else ocrSay('没匹配到武器 —— 换个写法再试（如「西伯利亚冰锤」「Sibear」）。', 'bad');
    }
    function onKey(e) {
      if (e.key === 'Escape') { close(); return; }
      if (!list.length) { if (e.key === 'Enter') { e.preventDefault(); commitSel(); } return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        var d = (e.key === 'ArrowDown' ? 1 : -1);
        hot = ((hot < 0 ? 0 : hot) + d + list.length) % list.length;
        drawList(); return;
      }
      if (e.key === 'Enter') { e.preventDefault(); commitSel(); }
    }
    inp.addEventListener('input', function () { hot = 0; drawList(); });
    box.querySelector('#ocrFixCancel').addEventListener('click', close);
    box.querySelector('#ocrFixOk').addEventListener('click', commitSel);
    mask.addEventListener('click', function (e) { if (e.target === mask) close(); });
    document.addEventListener('keydown', onKey, true);
    drawList();
    inp.focus(); inp.select();
  }
  function doTextGen() {
    var inp = document.getElementById('ocrText');
    if (!inp) return;
    var txt = inp.value.trim();
    if (!txt) { ocrSay('<b>先输入文字</b>，例如：双爆多负触发的托里德', 'bad'); return; }
    var res = window.RivenOCR.generate(txt);
    if (!res || (!res.weapon && !(res.affixes || []).length)) {
      ocrSay('没认出来 —— 试试“双爆多负触发的托里德”，或带数值的“泰瑟步枪 79.7多重射击 82.1病毒伤害”', 'bad');
      return;
    }
    if (res.weaponOnly && res.weapon) {
      ocrSay('只认出武器：<b>' + esc(wname(res.weapon)) + '</b> —— 这句里没有词条数值，已按满级填了一张空卡，数值请自己补。', '');
    }
    ocrApply(res, true);   // 点「生成」不跳转页面，只有「识别并填入计算器」才滚到搜索武器
  }
  (function () {
    var tg = document.getElementById('ocrTextGo'), ti = document.getElementById('ocrText');
    var tc = document.getElementById('ocrTextClear');
    if (tc) tc.addEventListener('click', function () { if (ti) { ti.value = ''; ocrSay('', ''); ti.focus(); } });   /* 清除按钮 清空输入框 */
    if (tg) tg.addEventListener('click', doTextGen);
    if (ti) ti.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); doTextGen(); } });
  })();
  var OCR_GO_LABEL_HTML = null;
  function ocrGoBusy(on) {
    var go = document.getElementById('ocrGo');
    if (!go) return;
    if (on) {
      if (OCR_GO_LABEL_HTML === null) OCR_GO_LABEL_HTML = go.innerHTML;
      go.classList.add('is-busy');
      go.innerHTML = '<svg class="ic" aria-hidden="true" focusable="false"><use href="#i-reroll"/></svg>正在识别…';
      go.disabled = true;
    } else {
      go.classList.remove('is-busy');
      if (OCR_GO_LABEL_HTML !== null) go.innerHTML = OCR_GO_LABEL_HTML;
      go.disabled = false;
    }
  }
  function findDividerY(boxes, quad, srcH, tplH) {
    var fallback = Math.round(tplH * 0.45);
    if (typeof textBlockTop !== 'function' || !boxes || !boxes.length) return fallback;
    var qy0 = 0, qy1 = srcH || 1;
    if (quad && quad.length === 4) {
      qy0 = Math.min(quad[0][1], quad[1][1], quad[2][1], quad[3][1]);
      qy1 = Math.max(quad[0][1], quad[1][1], quad[2][1], quad[3][1]);
    }
    var span = qy1 - qy0;
    if (span < 4) return fallback;
    var rows = [];
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      var y0 = (b.y0 - qy0) / span * tplH, y1 = (b.y1 - qy0) / span * tplH;
      rows.push({ y0: y0, y1: y1, yc: (y0 + y1) / 2 });
    }
    return textBlockTop(rows, tplH);
  }
  function ocrThumb(url, res) {
    var cv = document.getElementById('ocrCanvas'), wrap = document.getElementById('ocrPreview');
    var zone = document.getElementById('ocrZone');
    var maskCv = document.getElementById('ocrMaskCanvas');
    if (!cv || !wrap) return;
    var img = new Image();
    img.onload = function () {
      var sw = img.naturalWidth || img.width, sh = img.naturalHeight || img.height;
      if (!sw || !sh) return;
      var w = 300;
      var h = Math.max(1, Math.round(w * sh / sw));
      cv.width = w; cv.height = h;
      var g = cv.getContext('2d');
      if (!g) return;
      g.drawImage(img, 0, 0, w, h);
      var fit = res && res.fit;
      if (fit && fit.quad && fit.quad.length === 4) {
        var k = w / (fit.srcW || sw);
        g.strokeStyle = '#ffd166'; g.lineWidth = 2;
        g.beginPath();
        for (var q = 0; q < 4; q++) {
          var qx = fit.quad[q][0] * k, qy = fit.quad[q][1] * k;
          if (q === 0) g.moveTo(qx, qy); else g.lineTo(qx, qy);
        }
        g.closePath(); g.stroke();
      }
      wrap.hidden = false;
      if (zone) zone.style.display = 'none';
      if (!maskCv) return;
      var src = (res && res.canvas) ? res.canvas : img;
      var pw = src.naturalWidth || src.width || sw, ph = src.naturalHeight || src.height || sh;
      var mh = Math.max(1, Math.round(w * ph / pw));
      maskCv.width = w; maskCv.height = mh;
      var mctx = maskCv.getContext('2d');
      if (!mctx) return;
      mctx.drawImage(src, 0, 0, w, mh);
      var imgData = mctx.getImageData(0, 0, w, mh);
      var md = imgData.data;
      for (var i = 0; i < md.length; i += 4) {
        var gray = 0.299 * md[i] + 0.587 * md[i+1] + 0.114 * md[i+2];
        var v = gray > 90 ? 255 : 0;
        md[i] = md[i+1] = md[i+2] = v;
      }
      mctx.putImageData(imgData, 0, 0);
      var R = (res && res.regions) || {
        level: { top: 0.02, bottom: 0.16, left: 0.68, right: 0.96 },
        name:  { top: 0.42, bottom: 0.70, left: 0.08, right: 0.92 },
        affix: { top: 0.55, bottom: 0.81, left: 0.06, right: 0.94 }
      };
      function zoneBox(rg, color, lw) {
        if (!rg) return;
        mctx.strokeStyle = color; mctx.lineWidth = lw;
        mctx.strokeRect(rg.left * w, rg.top * mh,
                        (rg.right - rg.left) * w, (rg.bottom - rg.top) * mh);
      }
      zoneBox(R.level, '#ffff00', 2);    // 等级 / 容量消耗
      zoneBox(R.name, '#33d6ff', 1.5);   // 武器名
      zoneBox(R.affix, '#00ff00', 1.5);  // 词条
      var tplH = ph;
      var divTpl = findDividerY((res && res.text) ? res.text.boxes : null,
                                (res && res.fit) ? res.fit.quad : null,
                                (res && res.fit) ? (res.fit.srcH || sh) : sh, tplH);
      var divY = Math.round(divTpl * (mh / (tplH || mh)));
      mctx.strokeStyle = '#ff0000'; mctx.lineWidth = 3;
      mctx.beginPath(); mctx.moveTo(0, divY); mctx.lineTo(w, divY); mctx.stroke();
    };
    img.src = url;
  }
  function ocrClear() {
    var wrap = document.getElementById('ocrPreview'), f = document.getElementById('ocrFile');
    var zone = document.getElementById('ocrZone');
    var maskCv = document.getElementById('ocrMaskCanvas');
    if (wrap) wrap.hidden = true;
    if (f) f.value = '';
    if (zone) zone.style.display = '';
    if (maskCv) { var c = maskCv.getContext && maskCv.getContext('2d'); if (c) c.clearRect(0,0,maskCv.width,maskCv.height); }
    OCR_LOADING = false; OCR_BUSY = false;
    OCR_GEN++;                 // #15 清空也作废在跑的识别，别让它回来又填一遍
    ocrWaitOff();
    ocrGoBusy(false); ocrEnableGo(false);
    ocrSay('', '');
    var _wb = document.getElementById('ocrWarn'); if (_wb) _wb.innerHTML = '';
  }
  function ocrTake(file) {
    if (!file) return;
    if (window.__wakeOnnx) window.__wakeOnnx();
    if (!/^image\//.test(file.type || '')) { ocrSay('这不是图片，换一张紫卡截图试试。', 'bad'); return; }
    OCR_GEN++; OCR_BUSY = false; ocrWaitOff(); ocrGoBusy(false);
    var fr = new FileReader();
    OCR_LOADING = true; ocrEnableGo(false);      // 读图期间不许识别（否则认的是上一张）
    fr.onload = function () {
      var url = String(fr.result);
      OCR_SRC = url;             // 存下识别原图，识别成功后随历史保留（可缩略/放大/复制/保存）
      ocrSay('正在读取截图…', '');
      var OCR = window.RivenOCR;
      if (!OCR) { OCR_LOADING = false; ocrSay('识别模块没加载出来，刷新一下页面再试。', 'bad'); return; }
      OCR.loadImage(url).then(function (res) {
        OCR_LOADING = false;
        ocrEnableGo(true);
        ocrThumb(url, res);
        ocrSay('截图已就绪，点「识别并填入计算器」。', '');
      }).catch(function () {
        OCR_LOADING = false;
        ocrThumb(url);            // 读图失败也把原图显示出来，不留空白
        ocrSay('这张图读不出来，换一张试试。', 'bad');
        var _wb = document.getElementById('ocrWarn'); if (_wb) _wb.innerHTML = '';
      });
    };
    fr.onerror = function () { OCR_LOADING = false; ocrSay('这张图读不出来，换一张试试。', 'bad'); var _wb = document.getElementById('ocrWarn'); if (_wb) _wb.innerHTML = ''; };
    fr.readAsDataURL(file);
  }
  function ocrRun() {
    var OCR = window.RivenOCR;
    if (OCR_BUSY || OCR_LOADING || !OCR || !OCR.hasImage()) return;
    OCR_BUSY = true;
    var gen = ++OCR_GEN;             // #15 本次识别的代次
    ocrEnableGo(false);
    var busyAt = Date.now();
    ocrGoBusy(true);                 // 按钮立即切「正在识别…」+ 转圈，状态先于计算生效
    ocrWaitOn();                     // #15 全屏遮罩：识别期间请勿操作
    ocrSay('正在识别…', '');
    var MIN_BUSY = window.RULES.ZK_MIN_BUSY;
    var finish = function (fn) {
      var left = MIN_BUSY - (Date.now() - busyAt);
      if (left > 0) setTimeout(fn, left); else fn();
    };
    var start = function () {
      OCR.recognize({
        onProgress: function (m) {
          if (!m || !m.status) return;
          ocrSay(m.status, '');
          var wt = document.getElementById('ocrWaitTx');
          if (wt) wt.textContent = m.status;
        }
      }).then(function (res) {
        finish(function () {
          if (gen !== OCR_GEN) return;   // #15 已被更新的一次识别/换图取代 整块丢弃
          OCR_BUSY = false; ocrGoBusy(false); ocrWaitOff();
          ocrApply(res);
        });
      }).catch(function (e) {
        finish(function () {
          if (gen !== OCR_GEN) return;   // #15 同上：迟到失败也不许改状态
          OCR_BUSY = false; ocrGoBusy(false); ocrWaitOff();
          var m = (e && e.message) || '';
          var src = window.__ortSource || '';
          if (src === 'embedded') {
            ocrSay('本地引擎报错：' + esc(m || '未知原因')
              + (window.__ortErr ? '（' + esc(window.__ortErr) + '）' : ''), 'bad');
          } else {
            ocrSay('识别失败：' + esc(m || '未知原因'), 'bad');
            var _wb = document.getElementById('ocrWarn'); if (_wb) _wb.innerHTML = '';
          }
        });
      });
    };
    setTimeout(start, 60);   // 让出一帧多让 busy 态画出来即启动（原 300ms，见上）
  }
  function ocrApply(res, noScroll) {
    var _fk = ocrFixKey(res);
    OCR_LAST.res = res || null; OCR_LAST.key = _fk;
    var _fixIdx = (_fk && OCR_FIX_MAP[_fk] != null) ? OCR_FIX_MAP[_fk] : -1;
    if (_fixIdx >= 0 && _fixIdx < WEAPONS.length && res) {
      var _fw = WEAPONS[_fixIdx];
      if (!res.weapon || res.weapon.idx !== _fixIdx) {
        res.weapon = { idx: _fixIdx, cn: _fw.cn, intl: _fw.intl, en: _fw.en, cat: _fw.cat,
                       score: 100, ambiguous: false, inferred: false, forced: true };
        res.weaponForced = true;
      }
    }
    var w = (res && res.weapon) ? WEAPONS[res.weapon.idx] : null;
    var pos = [], neg = [], i;
    var miss = (res && res.dropped) || 0;
    var affixes = (res && res.affixes) || [];
    for (i = 0; i < affixes.length; i++) {
      var a = affixes[i], v = parseFloat(a.value);
      if (!a.drow || !isFinite(v) || (w && !isFinite(baseOf(a.drow, w.cat)))) { miss++; continue; }
      var internal = isFactionRow(a.drow) ? (v - 1) * 100
        : (a.sign === '-' ? -1 : 1) * Math.abs(v) * dirOf(a.drow);
      (internal < 0 ? neg : pos).push({ row: a.drow, val: internal, sign: a.sign, card: a.value });
    }
    pushHist();
    K.rivenName = (res && res.rivenName) || '';
    K.pol = (res && res.pol) || 'madurai';
    K.bottom = !!(res && res.bottom);
    K.mr = (res && res.mr) || 8;
    K.rolls = (res && res.rolls != null) ? res.rolls : 10;
    if (w) { K.w = w; K.manual = ''; autoCmpForVariant(w); }
    K.comboIdx = comboIdxOf(Math.min(pos.length, 3), neg.length ? 1 : 0);
    for (i = 0; i < 4; i++) { K.rows[i] = 0; K.vals[i] = ''; }
    for (i = 0; i < pos.length && i < 3; i++) { K.rows[i] = pos[i].row; K.vals[i] = String(pos[i].val); }
    if (neg.length) { K.rows[3] = neg[0].row; K.vals[3] = String(neg[0].val); }
    K.locks = prejudgeLocks(K.rows, null);
    K.rank = (res && isFinite(res.rank)) ? res.rank : P.maxRank;
    renderCalc(); commit();
    var got = Math.min(pos.length, 3) + (neg.length ? 1 : 0);
    OCR_HIST.push({
      img: OCR_SRC || '',
      time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      weapon: w ? wname(w) : null,
      weaponIdx: w ? WEAPONS.indexOf(w) : -1,
      weaponAmbiguous: !!(w && res.weapon && res.weapon.ambiguous),
      weaponInferred: !!(w && res.weapon && res.weapon.inferred),
      combo: P.combo[K.comboIdx] ? P.combo[K.comboIdx].name : '',
      comboIdx: K.comboIdx,
      pol: K.pol,               /* 极性（图标链路识别，低置信度时 UI 有提示） */
      rank: K.rank,
      mr: K.mr,
      rolls: K.rolls,
      pos: pos.map(function (p) { return { row: p.row, name: histName(p.row), val: p.val, sign: p.sign, card: p.card }; }),
      neg: neg.map(function (p) { return { row: p.row, name: histName(p.row), val: p.val, sign: p.sign, card: p.card }; }),
      got: got,
      miss: (res && res.dropped) || 0,
      rankFix: (res && res.rankFix) || null,
      unread: (res && res.unread) || [],
      cats: (res && res.weaponCats) || [],
      fixKey: _fk
    });
    OCR_LAST.histIdx = OCR_HIST.length - 1;
    ocrFixBtnShow(true);
    renderOcrHist();
    var unsure = !!(w && res.weapon && res.weapon.ambiguous);
    var inferred = !!(w && res.weapon && res.weapon.inferred);
    var cats = (res && res.weaponCats) || [];
    var catLabel = (w && P.catName[w.cat]) ? P.catName[w.cat][Math.min(lang, 2)] : '';
    var msg;
    if (w) {
      msg = '已填入计算器：<b>' + esc(wname(w)) + '</b> · ' + esc(P.combo[K.comboIdx].name)
          + ' · 等级 ' + K.rank + ' · ' + got + ' 条词条';
      if (inferred) {
        msg = '武器名没认出来 —— 按认出来的词条推断这是一把 <b>' + esc(catLabel) + '</b>，'
            + '已先填入 <b>' + esc(wname(w)) + '</b>（' + esc(P.combo[K.comboIdx].name)
            + ' · 等级 ' + K.rank + ' · ' + got + ' 条词条），请核对或手选';
      }
    } else {
      msg = '没认出武器名 —— 请在下面「搜索武器」里手选一把'
          + (got ? '，认出来的 ' + got + ' 条词条已经填好了' : '');
      if (cats.length) msg += '（按词条看应该是' + esc(cats.join(' / ')) + '）';
    }
    if (res && res.weaponForced) msg += '（按你上次点「修」矫正的结果填入）';
    if (miss) {
      var _ut = (res && res.unread) || [];
      var _uq = _ut.slice(0, 3).map(function (x) { return esc(x.text); });
      msg += '（另有 ' + miss + ' 条没认出来' +
        (_uq.length ? '：' + _uq.join(' / ') + (_ut.length > 3 ? ' …' : '') : '') + '，请手动补）';
    }
    if (res && res.valueFixed && res.valueFixed.length) {
      msg += '（已按倾向修正读数：' + res.valueFixed.map(function (x) {
        return esc(x.name || ('行' + x.row)) + ' ' + esc(x.from) + '→' + esc(x.to);
      }).join('，') + '）';
    }
    if (res && res.rankFix) {
      var _rf = res.rankFix, _rp = [];
      if (_rf.levelFrom !== _rf.levelTo)
        _rp.push('等级 ' + _rf.levelFrom + ' → ' + _rf.levelTo
          + '（卡面容量 ' + esc(String(_rf.drainFrom == null ? '?' : _rf.drainFrom))
          + '，按数值回算应为 ' + esc(String(_rf.drainTo)) + '）');
      if (_rf.weaponFrom && _rf.weaponFrom !== _rf.weaponTo)
        _rp.push(esc(_rf.weaponFrom) + ' → ' + esc(_rf.weaponTo)
          + '（卡面只印本体名，' + esc(_rf.weaponFrom) + ' 的倾向已排除）');
      if (_rp.length) msg += '（已校正：' + _rp.join('；') + '）';
    }
    if (res && res.ignored && res.ignored.length) msg += '；词条「' + esc(res.ignored.join('、')) + '」不属于该武器类别，已忽略';
    var _dvOver = calcDevs().filter(function (d) { return Math.abs(d.g) > P.variantTh; });
    if (_dvOver.length) {
      msg += '；' + _dvOver.map(function (d) {
        return (d.neg ? '负面「' : '「') + esc(sname(d.row)) + '」';
      }).join('、') + ' 偏离超出浮动极限 ' + (P.variantTh * 100).toFixed(0)
        + '%，请核对变体与倾向';
    }
    if (unsure && !inferred) msg += ' —— 武器名不太确定，请核对';
    if (res && res.polLow) msg += '；极性不太确定（右上角徽章图标判定置信度低，请核对，已先按判定值填入）';
    ocrSay(msg, !w ? 'bad' : ((miss || unsure || inferred || (res && res.polLow) || _dvOver.length) ? 'warn' : 'ok'));
    var _isShot = res && ('mr' in res);
    var _warn = [];
    if (!w) _warn.push('武器名没认出来，请用「修」手动选，或对照原图补录');
    else {
      if (res.weapon && res.weapon.ambiguous) _warn.push('武器名有歧义（多个候选分差很小），请确认是否正确');
      if (res.weapon && res.weapon.inferred) _warn.push('武器由词条推断得出，不确定，请确认');
    }
    var _gotCnt = Math.min(pos.length, 3) + (neg.length ? 1 : 0);
    if (_gotCnt === 0) _warn.push('没识别出任何词条（可能没截到词条区，或文字里没有数值）');
    if (miss > 0) _warn.push('有 ' + miss + ' 条词条数值没读出来（已跳过），请对照原图补录');
    if (_isShot) {
      if (res.mr == null) _warn.push('精通段位没认出来，已按默认 8，请按游戏内补填');
      if (res.rolls == null) _warn.push('循环次数没认出来，已按默认 10，没有循环图标时请填 0');
      if (!isFinite(res.rank)) _warn.push('MOD 等级没认出来，已按满级，请按游戏内升级点数核对');
      if (!res.pol) _warn.push('极性没认出来，已按默认 R 槽，请对照原图选择');
      else if (res.polLow) _warn.push('极性置信度低（可能识别错了），请以游戏内为准');
    }
    if (_warn.length) _warn.push('TIP：识别空白不代表数值为 0，请对照原图逐字段核对');
    var _wbox = document.getElementById('ocrWarn');
    if (_wbox) _wbox.innerHTML = _warn.length ? _warn.map(function (t) {
      var _tip = t.indexOf('TIP：') === 0;
      return '<div class="ocr-warn' + (_tip ? ' tip' : '') + '">' + (_tip ? '' : '⚠ ') + esc(t) + '</div>';
    }).join('') : '';
  }
  var OCR_SRC = '';             // 最近一次读进来的识别原图(dataURL)，识别成功后随历史记录保留
  var OCR_HIST = [];
  function histName(row) { return sname(row) || ''; }
  function renderOcrHist() {
    var host = document.getElementById('ocrHist');
    if (!host) return;
    if (!OCR_HIST.length) { host.innerHTML = '<div class="ocr-hist-empty">还没识别过紫卡，识别结果会自动记在这里（仅本次打开有效）。</div>'; return; }
    var h = '';
    for (var i = OCR_HIST.length - 1; i >= 0; i--) {
      var r = OCR_HIST[i];
      var _th = r.img ? '<div class="ocr-hist-thumb" data-zoom="' + i + '" title="点击放大 / 复制 / 保存"><img src="' + esc(r.img) + '" alt="识别原图"></div>' : '';
      h += '<div class="ocr-hist-item">' + _th + '<div class="ocr-hist-main"><div class="ocr-hist-head">'
        + '<b>#' + (i + 1) + '</b> <span>' + esc(r.time) + '</span> ';
      if (r.weapon) h += '<strong>' + esc(r.weapon) + '</strong>';
      else h += '<strong class="ocr-bad">未认出武器' + (r.cats.length ? '（似为' + esc(r.cats.join('/')) + '）' : '') + '</strong>';
      if (r.weaponInferred) h += '<em class="ocr-warn">（推断）</em>';
      if (r.rankFix) h += '<em class="ocr-warn">（已校正'
        + (r.rankFix.levelFrom !== r.rankFix.levelTo ? '等级' : '变体') + '）</em>';
      if (r.weaponForced) h += '<em class="ocr-warn">（已矫正'
        + (r.weaponFixedFrom && r.weaponFixedFrom !== r.weaponFixedTo
            ? '：' + esc(r.weaponFixedFrom) + ' → ' + esc(r.weaponFixedTo) : '') + '）</em>';
      h += ' <span>' + esc(r.combo) + ' · 等级 ' + r.rank + ' · ' + r.got + ' 条 · '
          + esc(polName(r.pol || 'madurai')) + '</span></div><ul class="ocr-hist-aff">';
      var histVal = function (a) {
        if (isFactionRow(a.row)) return '×' + a.card;
        return (a.sign === '-' ? '-' : '+') + a.card + (NON_PCT.indexOf(a.row) >= 0 ? '' : '%');
      };
      var histEntry = function (a, cls) {
        var nm = esc(a.name || '（未知名）'), vl = histVal(a);
        return '<li class="' + cls + '">' + (a.row === 48 ? nm + ' ' + vl : vl + ' ' + nm) + '</li>';
      };
      r.pos.forEach(function (a) { h += histEntry(a, 'ocr-pos'); });
      r.neg.forEach(function (a) { h += histEntry(a, 'ocr-neg'); });
      if (r.miss) h += '<li class="ocr-miss">另有 ' + r.miss + ' 条未认出' +
        ((r.unread && r.unread.length)
          ? '：' + r.unread.slice(0, 3).map(function (x) { return esc(x.text); }).join(' / ')
          : '') + '</li>';
      h += '</ul></div><div class="ocr-hist-refill"><button type="button" class="btn ghost sm" data-hidx="' + i + '">再次填入</button>'
        + '<button type="button" class="btn ghost sm" data-fixidx="' + i + '" title="认错武器了？强制改成你指定的武器">修</button>'
        + '<button type="button" class="btn ghost sm" data-delidx="' + i + '"><svg class="ic" aria-hidden="true" focusable="false"><use href="#i-trash"/></svg>删除</button></div></div>';
    }
    host.innerHTML = h;
    var refills = host.querySelectorAll('[data-hidx]');
    for (var b = 0; b < refills.length; b++) {
      (function (idx, el) { el.addEventListener('click', function () { ocrHistRefill(OCR_HIST[idx]); }); })
        (+refills[b].getAttribute('data-hidx'), refills[b]);
    }
    var _thumbs = host.querySelectorAll('.ocr-hist-thumb');
    for (var t2 = 0; t2 < _thumbs.length; t2++) {
      (function (idx, el) { el.addEventListener('click', function () { ocrHistZoom(OCR_HIST[idx].img); }); })
        (+_thumbs[t2].getAttribute('data-zoom'), _thumbs[t2]);
    }
    var _dels = host.querySelectorAll('[data-delidx]');
    for (var d2 = 0; d2 < _dels.length; d2++) {
      (function (idx, el) { el.addEventListener('click', function () { ocrHistDel(idx); }); })
        (+_dels[d2].getAttribute('data-delidx'), _dels[d2]);
    }
    var _fxs = host.querySelectorAll('[data-fixidx]');
    for (var f2 = 0; f2 < _fxs.length; f2++) {
      (function (idx, el) { el.addEventListener('click', function () { ocrFixOpen(idx); }); })
        (+_fxs[f2].getAttribute('data-fixidx'), _fxs[f2]);
    }
  }
  function ocrHistRefill(r) {
    if (!r) return;
    var w = (r.weaponIdx >= 0 && r.weaponIdx < WEAPONS.length) ? WEAPONS[r.weaponIdx] : null;
    K.manual = '';
    if (w) { K.w = w; autoCmpForVariant(w); }
    K.comboIdx = (typeof r.comboIdx === 'number' && r.comboIdx >= 0 && r.comboIdx < P.combo.length) ? r.comboIdx : 0;
    K.rank = (typeof r.rank === 'number') ? r.rank : P.maxRank;
    K.mr = r.mr || 8;
    K.rolls = (r.rolls != null) ? r.rolls : 10;
    for (var i = 0; i < 4; i++) { K.rows[i] = 0; K.vals[i] = ''; }
    for (i = 0; i < r.pos.length && i < 3; i++) { K.rows[i] = r.pos[i].row; K.vals[i] = String(r.pos[i].val); }
    if (r.neg && r.neg.length) { K.rows[3] = r.neg[0].row; K.vals[3] = String(r.neg[0].val); }
    K.locks = prejudgeLocks(K.rows, null);
    renderCalc(); commit();
    ocrSay('已把历史 #' + (OCR_HIST.indexOf(r) + 1) + ' 重新填入计算器。', 'ok');
  }
  function ocrHistClear() { OCR_HIST.length = 0; renderOcrHist(); }
  function ocrHistDel(idx) {
    if (idx >= 0 && idx < OCR_HIST.length) { OCR_HIST.splice(idx, 1); renderOcrHist(); }
  }
  function ocrHistZoom(url) {
    if (!url) return;
    var mask = document.createElement('div');
    mask.className = 'ocr-zoom-mask';
    var box = document.createElement('div');
    box.className = 'ocr-zoom-box';
    box.innerHTML = '<img class="ocr-zoom-img" src="' + esc(url) + '" alt="识别原图">'
      + '<div class="ocr-zoom-bar"><button type="button" class="btn ghost sm" id="ocrZoomClose">关闭</button></div>';
    mask.appendChild(box);
    document.body.appendChild(mask);
    function close() { if (mask.parentNode) mask.parentNode.removeChild(mask); document.removeEventListener('keydown', onKey, true); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    mask.addEventListener('click', function (e) { if (e.target === mask) close(); });
    box.querySelector('#ocrZoomClose').addEventListener('click', close);
    document.addEventListener('keydown', onKey, true);
  }
  function initOCR() {
    var zone = document.getElementById('ocrZone'), file = document.getElementById('ocrFile');
    var ocrClearHist = document.getElementById('ocrHistClear');
    if (ocrClearHist) ocrClearHist.addEventListener('click', ocrHistClear);
    var ocrFixBtn = document.getElementById('ocrFix');
    if (ocrFixBtn) ocrFixBtn.addEventListener('click', function () { ocrFixOpen(-1); });
    if (!zone || !file) return;
    function pick() { file.click(); }
    zone.addEventListener('click', pick);
    zone.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); }
    });
    file.addEventListener('change', function () { ocrTake(file.files && file.files[0]); });
    ['dragenter', 'dragover'].forEach(function (t) {
      zone.addEventListener(t, function (e) { e.preventDefault(); zone.classList.add('over'); });
    });
    ['dragleave', 'dragend'].forEach(function (t) {
      zone.addEventListener(t, function () { zone.classList.remove('over'); });
    });
    zone.addEventListener('drop', function (e) {
      e.preventDefault(); zone.classList.remove('over');
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) ocrTake(f);
    });
    document.addEventListener('paste', function (e) {
      if (document.documentElement.getAttribute('data-route') === 'choose') return;
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (var i = 0; i < items.length; i++) {
        if (items[i].kind === 'file' && /^image\//.test(items[i].type || '')) {
          var f = items[i].getAsFile();
          if (f) { e.preventDefault(); ocrTake(f); return; }
        }
      }
    });
  }
  window.addEventListener('DOMContentLoaded', function () {
    setTheme(theme());        // 同步按钮文案（data-theme 已在 <head> 里定好，这里不改）
    syncLangBtns();
    relabelAutoWarn();     // 自动配装大字提醒（④ / ⑤ 两处）
    fnApplyOrder();        // 恢复自定义的三功能排序（编号 + 导航同步）
    LAST = snap();
    syncHist();
    render();
    initOpenN();              // 03 区「开 N 次」（批量模拟，取前 10）
    initRerollN();            // 03 区「洗 N 次」（武器固定，词条整套重抽，取前 10）
    initRanges();             // ③ 倾向 / 区间表
    initDmg();                // ① 紫卡收益计算器（插在开卡洗卡之后）
    initOCR();
    renderOcrHist();
    initNavSpy();
    (function scheduleOnnxPreload() {
      if (typeof window.__onnxPreload !== 'function') return;
      var tries = 0;
      function go() {
        if (document.hidden && tries++ < 6) { setTimeout(go, 2000); return; }
        window.__onnxPreload();
      }
      setTimeout(go, 1500);
    })();
  });
  var RG_CATS = ['步枪', '霰弹', '手枪', '曲翼', '近战', '组合枪', 'Zaw', '同伴武器'];
  var RG_FROM = ROLL_FROM, RG_TO = ROLL_TO;
  var RG_G = {
    2: '伤害', 3: '伤害',
    4: '暴击', 5: '暴击', 32: '暴击', 46: '暴击',
    6: '触发', 7: '触发', 35: '触发',
    8: '攻速',
    9: '元素', 10: '元素', 11: '元素', 12: '元素',
    36: '元素', 37: '元素', 38: '元素', 39: '元素', 40: '元素', 41: '元素',
    13: '物理', 14: '物理', 15: '物理',
    16: '派系', 17: '派系', 18: '派系', 42: '派系', 43: '派系', 44: '派系',
    19: '射击', 20: '射击', 24: '射击', 25: '射击', 26: '射击', 45: '射击',
    21: '弹药', 22: '弹药', 23: '弹药', 47: '弹药', 48: '弹药',
    27: '连击', 28: '连击', 29: '连击', 30: '连击', 31: '连击',
    33: '连击', 34: '连击', 49: '连击', 50: '连击', 51: '连击', 52: '连击'
  };
  var RG_ORDER = ['伤害', '暴击', '触发', '攻速', '元素', '物理', '派系', '射击', '弹药', '连击'];
  var RG_EN = { '伤害': 'Damage', '暴击': 'Critical', '触发': 'Status', '攻速': 'Attack Speed',
    '元素': 'Elemental', '物理': 'Physical', '派系': 'Faction', '射击': 'Firing',
    '弹药': 'Ammo', '连击': 'Combo', '其它': 'Other' };
  function rgGroupRaw(row) { return RG_G[row] || '其它'; }
  function rgGroup(row) {
    var g = rgGroupRaw(row);
    return lang === 2 ? (RG_EN[g] || g) : g;
  }
  function rgGroupNo(row) {
    var i = RG_ORDER.indexOf(rgGroupRaw(row));   // 用中文原标签定序，换语言不能打乱分组次序
    return i < 0 ? RG_ORDER.length : i;
  }
  function isFactionRow(row) { return ZKC.isFactionRow(row); }
  var RG_REFVAL = {
    '步枪': [[2,0.018333299], [4,0.016666001], [5,0.013333], [6,0.0099999998], [7,0.01111], [8,0.00667], [9,0.0099999998], [13,0.01333], [19,0.0099999998], [20,0.029999999], [21,0.0055550002], [22,0.0055499999], [23,0.0055550002], [24,0.0099999998], [25,0.0099999998], [26,0.006666]],
    '霰弹': [[2,0.018300001], [4,0.0099999998], [5,0.0099999998], [6,0.0099999998], [7,0.011], [8,0.0099999998], [9,0.0099999998], [13,0.01333], [19,0.0133], [20,0.029999999], [21,0.0055550002], [22,0.0099999998], [23,0.0055550002], [24,0.0099999998], [25,0.0099999998]],
    '手枪': [[2,0.0244], [4,0.016666001], [5,0.0099999998], [6,0.0099999998], [7,0.01111], [8,0.0082999999], [9,0.0099999998], [13,0.01333], [19,0.0133], [20,0.029999999], [21,0.0055550002], [22,0.0099999998], [23,0.0055550002], [24,0.0099999998], [25,0.0099999998], [26,0.0088999998]],
    '曲翼': [[2,0.0111], [4,0.0111], [5,0.0088999998], [6,0.0066999998], [7,0.01111], [8,0.00667], [9,0.0133], [13,0.0099999998], [19,0.0066999998], [20,0.029999999], [21,0.0066999998], [22,0.0111], [23,0.0111], [25,0.0099999998], [26,0.006666]],
    '近战': [[3,0.018300001], [4,0.02], [5,0.0099999998], [6,0.0099999998], [7,0.011], [8,0.0060999999], [9,0.0099999998], [13,0.0133], [27,0.27224001], [28,0.090000004], [29,0.0065299999], [30,0.01165], [31,0.0081599997], [32,0.013334], [33,0.0133], [34,0.021579999]]
  };
  var RG = {
    w: null, pos: 3, neg: true, rank: 8, cat: '步枪', catKey: '步枪',
    q: [], hot: -1, from: ''
  };
  function comboToPN(ci) {
    var pos = [2, 2, 3, 3][ci], neg = [0, 1, 0, 1][ci];
    return { pos: pos, neg: !!neg };
  }
  function rgCell(row, v, isPos) {
    if (!isFinite(v)) return '';
    var s = Math.round(v * 100) / 100;   /* 两位小数，避免理论最大被一位舍入显示得比 1.1 上限还大 */
    if (isFactionRow(row)) return '×' + (isPos ? 1 + s / 100 : 1 - s / 100).toFixed(2);
    if (row === RECOIL_ROW) return (s >= 0 ? '+' : '') + s.toFixed(2) + '%';
    var _sg = s < 0 ? '' : (isPos ? '+' : '-');
    return _sg + s.toFixed(2) + (NON_PCT.indexOf(row) >= 0 ? '' : '%');
  }
  function rgCoef(posN, negN, isPos) {
    var c = P.combo[comboIdxOf(posN, negN)];
    return isPos ? c.gain : Math.abs(c.neg);
  }
  function rgRange(w, row, posN, negN, rank, isPos) {
    var base = baseOf(row, w.cat);
    if (!isFinite(base)) return null;
    var coef = rgCoef(posN, negN, isPos);
    if (!isFinite(coef) || coef <= 0) return null;     // 2正0负/3正0负 时没有负面系数
    if (isFactionRow(row)) base = (base - 1) * 100;    // 派系：倍率 百分数
    var f = base * coef * ZKC.disp(w) * ((rank + 1) / 9);
    if (row === RECOIL_ROW && isPos) f = -f;
    var lo = rgCell(row, f * P.lo, isPos), hi = rgCell(row, f * P.hi, isPos);
    return {
      min: isPos ? lo : hi,
      avg: rgCell(row, f * P.mid, isPos),
      max: isPos ? hi : lo
    };
  }
  function rgRows(w, positive, posN, negN, rank) {
    var out = [];
    for (var row = RG_FROM; row <= RG_TO; row++) {
      var base = baseOf(row, w.cat);
      if (!isFinite(base)) continue;                                  // 闸①这类武器没有这条属性
      if (positive ? negOnly(row) : alwaysPos(row, w.cat)) continue;   // 永负不当正面 / 永正不当负面
      if (!physRowOK(row, w)) {
        out.push({
          row: row, group: rgGroup(row), label: sname(row),
          min: '- - -', avg: '- - -', max: '- - -', blocked: true
        });
        continue;
      }
      var r = rgRange(w, row, posN, negN, rank, positive);
      if (!r) continue;
      out.push({
        row: row, group: rgGroup(row), label: sname(row),
        min: r.min, avg: r.avg, max: r.max
      });
    }
    out.sort(function (a, b) {
      return rgGroupNo(a.row) - rgGroupNo(b.row) || a.row - b.row;
    });
    return out;
  }
  function rgRowsFuse(w, posN, negN, rank) {
    var out = [];
    for (var row = ZKC.FUSE_FROM; row <= ZKC.FUSE_TO; row++) {
      if (!physRowOK(row, w)) continue;
      var r = rgRange(w, row, posN, negN, rank, true);
      if (!r) continue;                     // 闸①基准值为空
      out.push({
        row: row, group: rgGroup(row), label: sname(row),
        min: r.min, avg: r.avg, max: r.max
      });
    }
    out.sort(function (a, b) {
      return rgGroupNo(a.row) - rgGroupNo(b.row) || a.row - b.row;
    });
    return out;
  }
  function rgFmt(v, d) { return (v == null || !isFinite(v)) ? '' : Number(v).toFixed(d == null ? 2 : d); }
  var RCP_GROUPS = [
    { t: '适用于：所有武器', en: 'Applies to: All weapons', n: 9 },
    { t: '适用于：步枪、霰弹、手枪、组合枪、曲翼、部分同伴武器',
      en: 'Applies to: Rifles, Shotguns, Pistols, Combination Guns, Archguns, some Companion weapons',
      n: 9 },
    { t: '适用于：近战武器、组合近战武器、部分同伴武器',
      en: 'Applies to: Melee weapons, Combination Melee weapons, some Companion weapons',
      n: -1 }
  ];
  function rcpName(name) {
    var r = rowOfName(name);
    return r ? sname(r) : name;
  }
  function rgRenderRecipe() {
    var host = document.getElementById('rgRcpBody');
    if (!host) return;
    var h = '', at = 0;
    RCP_GROUPS.forEach(function (g) {
      var end = g.n < 0 ? FUSION.length : Math.min(at + g.n, FUSION.length);
      h += '<tr><td colspan="3" class="rcp-g">' + esc(lang === 2 ? (g.en || g.t) : g.t) + '</td></tr>';
      for (var i = at; i < end; i++) {
        var f = FUSION[i];
        h += '<tr><td>' + esc(rcpName(f.a)) + '</td><td>' + esc(rcpName(f.b))
          + '</td><td class="rcp-p">' + esc(rcpName(f.c)) + '</td></tr>';
      }
      at = end;
    });
    host.innerHTML = h;
  }
  function rgRenderTables() {
    rgRenderRecipe();
    var w = RG.w;
    var pb = document.getElementById('rgPosBody'), nb = document.getElementById('rgNegBody');
    var fb = document.getElementById('rgFuseBody');
    var pc = document.getElementById('rgPosCount'), nc = document.getElementById('rgNegCount');
    if (!w) {
      pb.innerHTML = '<tr><td colspan="4" class="r-empty">从左边选一把武器</td></tr>';
      nb.innerHTML = '<tr><td colspan="4" class="r-empty">从左边选一把武器</td></tr>';
      if (fb) fb.innerHTML = '<tr><td colspan="4" class="r-empty">从左边选一把武器</td></tr>';
      if (pc) pc.textContent = '';
      if (nc) nc.textContent = '';
      return 0;
    }
    var negN = RG.neg ? 1 : 0;
    function rgCount(list) {
      var ok = 0, bad = 0;
      for (var i = 0; i < list.length; i++) (list[i].blocked ? bad++ : ok++);
      return ok + ' 条' + (bad ? '（' + bad + ' 条洗不出）' : '');
    }
    function body(list, empty) {
      if (!list.length) return '<tr><td colspan="4" class="r-empty">' + esc(empty) + '</td></tr>';
      var h = '', g0 = null;
      list.forEach(function (x) {
        if (x.group !== g0) {
          g0 = x.group;
          h += '<tr><td colspan="4" class="r-gsep">' + esc(g0) + '</td></tr>';
        }
        h += '<tr' + (x.blocked ? ' class="r-blocked"' : '') + '>'
          + '<td>' + esc(x.label) + '</td>'
          + '<td class="n">' + esc(x.min) + '</td>'
          + '<td class="n">' + esc(x.avg) + '</td>'
          + '<td class="n">' + esc(x.max) + '</td></tr>';
      });
      return h;
    }
    var plist = rgRows(w, true, RG.pos, negN, RG.rank);
    pb.innerHTML = body(plist, '这类武器没有对应的词条');
    if (pc) pc.textContent = rgCount(plist);
    if (RG.neg) {
      var nlist = rgRows(w, false, RG.pos, negN, RG.rank);
      nb.innerHTML = body(nlist, '这类武器没有能当负面的词条');
      if (nc) nc.textContent = rgCount(nlist);
    } else {
      nb.innerHTML = '<tr><td colspan="4" class="r-empty">切到「带 1 负」后才会出现负面词条</td></tr>';
      if (nc) nc.textContent = '未启用';
    }
    if (fb) {
      var fl = rgRowsFuse(w, RG.pos, negN, RG.rank);
      fb.innerHTML = body(fl, '这类武器没有可用的融合专属词条');
      var fw = document.getElementById('rgFuseWrap');
      if (fw) {
        fw.classList.toggle('none', !fl.length);
        var frw = fw.closest('.r-fuserow');
        if (frw) frw.classList.toggle('rcp-only', !fl.length);
      }
    }
    return 0;
  }
  function rgSelfCheck() {
    var bad = [];
    RG_CATS.forEach(function (cat) {
      (RG_REFVAL[cat] || []).forEach(function (it) {
        var mine = baseOf(it[0], cat);
        if (!isFinite(mine)) return;
        var back = it[1] * (NON_PCT.indexOf(it[0]) >= 0 ? 90 : 9000);
        if (Math.abs(back - mine) / Math.max(mine, 1e-9) > 0.005) bad.push(cat + '/' + it[0]);
      });
    });
    return bad;
  }
  window.ZKRGSELF = rgSelfCheck;      /* 基础数值表 × 武器类型 对账：表值 vs 游戏实测值（RG_REFVAL） */
  function rgRenderList() {
    var host = document.getElementById('rgList');
    if (!host) return;
    var list = [];
    WEAPONS.forEach(function (w, i) {
      if (RG.cat === 'Zaw') { if (w.var !== IS_VAR && isZaw(w)) list.push(i); return; }
      if (RG.cat === '组合枪') { if (isKit(w)) list.push(i); return; }   // 主手/副手组合枪都列
      if (RG.cat === '同伴武器') { if (w.var !== IS_VAR && isCompanion(w)) list.push(i); return; }
      if (w.var === IS_VAR) return;
      if (isZaw(w) || isKit(w) || isCompanion(w)) return;   // 特殊类不吃普通类别面板
      if (w.cat === RG.cat) list.push(i);
    });
    list.sort(function (a, b) { return wname(WEAPONS[a]) < wname(WEAPONS[b]) ? -1 : 1; });  /* 按名称排序 */
    var h = '';
    list.forEach(function (i) {
      var w = WEAPONS[i];
      h += '<button type="button" data-a="rgpick" data-i="' + i + '"'
        + (RG.w === w ? ' class="on" aria-selected="true"' : ' aria-selected="false"') + '>'
        + '<span>' + esc(wname(w)) + '</span> <span class="d">' + n2(ZKC.disp(w)) + '</span></button>';
    });
    host.innerHTML = h || '<div class="r-empty">没有这类武器</div>';
    requestAnimationFrame(rgAlignList);
  }
  function rgAlignList() {
    var list = document.getElementById('rgList');
    if (!list || window.innerWidth < 1024) return;
    var fuse = document.getElementById('rgFuseWrap');   // 右栏内容紧凑，取融合专属词条表底部
    if (fuse && !fuse.offsetParent) fuse = document.getElementById('rgRcpWrap');  // 融合表被隐藏时改对齐合成配方底
    if (!fuse) return;
    var card = list.closest('.r-card');
    if (!card) return;
    var cs = getComputedStyle(card);
    var padB = parseFloat(cs.paddingBottom) || 0;      // 行条底部跑到行底，卡片底边才能精确贴合融合表底
    var borB = parseFloat(cs.borderBottomWidth) || 0;
    var top = list.getBoundingClientRect().top;
    var bot = fuse.getBoundingClientRect().bottom;
    var h = Math.floor(bot - top - padB - borB);
    if (h > 120) list.style.maxHeight = h + 'px';
  }
  if (window.addEventListener) window.addEventListener('resize', rgAlignList);
  function rgRenderCombo() {
    var host = document.getElementById('rgCombo');
    if (!host) return;
    var cur = comboIdxOf(RG.pos, RG.neg ? 1 : 0);
    var h = '<span>当前档位</span>';
    P.combo.forEach(function (c, i) {
      h += '<button type="button" class="cb' + (i === cur ? ' on' : '')
        + '" data-a="rgcombo" data-i="' + i + '">' + esc(c.name) + '</button>';
    });
    h += '<span style="margin-left:auto">正面系数 <b>' + nz(P.combo[cur].gain) + '</b>'
      + (RG.neg ? ' · 负面系数 <b>' + nz(Math.abs(P.combo[cur].neg)) + '</b>' : '')
      + ' · 等级 <b>' + RG.rank + '</b></span>';
    if (RG.from) h += '<span class="from">' + esc(RG.from) + '</span>';
    host.innerHTML = h;
  }
  function rgCatName(c) {
    if (LANGS[lang] === 'English') {
      return ZKC.typeName(c, 2);   /* 英文叫法查命名表，代码里不再抄一份 */
    }
    return (c === 'Zaw' && LANGS[lang] === '国服') ? '天工造武' : c;
  }
  function rgRenderCatBtns() {
    var cc = document.getElementById('rgCat');
    if (!cc) return;
    var ch = '';
    RG_CATS.forEach(function (c) {
      var on = c === RG.cat;
      ch += '<button type="button" data-a="rgcat" data-cat="' + esc(c) + '"'
        + (on ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"') + '>'
        + esc(rgCatName(c)) + '</button>';
    });
    cc.innerHTML = ch;
  }
  function rgRenderHead() {
    var n = document.getElementById('rgName'), m = document.getElementById('rgMeta');
    var w = RG.w;
    if (n) n.textContent = w ? wname(w) : '—';
    if (m) {
      m.textContent = w
        ? ((P.catName[w.cat] ? P.catName[w.cat][Math.min(lang, 2)] : w.cat)
           + ' · 倾向 ' + n2(ZKC.disp(w)))
        : '从左边搜一把武器';
    }
    var note = document.getElementById('rgNote');
    if (note) {
      var c = P.combo[comboIdxOf(RG.pos, RG.neg ? 1 : 0)];
      note.textContent = RG.pos + ' 正 · ' + (RG.neg ? '1 负' : '0 负')
        + ' · 组合系数 正 ' + nz(c.gain)
        + (RG.neg ? ' / 负 ' + nz(Math.abs(c.neg)) : '')
        + '（等级越高数值越大，满级 8 档为最大值）';
    }
    rgRenderCombo();
    syncRangeCtl();
    rgRenderVar();
    rgRenderCatBtns();
  }
  function syncRangeCtl() {
    var bs = document.querySelectorAll('#rgPos button');
    for (var i = 0; i < bs.length; i++) {
      var on = +bs[i].getAttribute('data-i') === RG.pos;
      bs[i].classList.toggle('on', on);
      bs[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    var ns = document.querySelectorAll('#rgNeg button');
    for (i = 0; i < ns.length; i++) {
      var onN = (ns[i].getAttribute('data-i') === '1') === !!RG.neg;
      ns[i].classList.toggle('on', onN);
      ns[i].setAttribute('aria-pressed', onN ? 'true' : 'false');
    }
    var cs = document.querySelectorAll('#rgCat button');
    for (i = 0; i < cs.length; i++) {
      var onC = cs[i].getAttribute('data-cat') === RG.cat;
      cs[i].classList.toggle('on', onC);
      cs[i].setAttribute('aria-pressed', onC ? 'true' : 'false');
    }
    var rk = document.getElementById('rgRank');
    if (rk) rk.value = String(RG.rank);
  }
  function rgSetWeapon(i, ci) {
    var w = WEAPONS[i];
    if (!w) return;
    RG.w = w;
    window.ZKSGW(w);
    if (isZaw(w)) RG.cat = 'Zaw';
    else if (isKit(w)) RG.cat = '组合枪';
    else if (isCompanion(w)) RG.cat = '同伴武器';
    else RG.cat = w.cat;
    RG.catKey = RG.cat;
    RG.q = []; RG.hot = -1;
    if (ci != null && ci >= 0) {
      var pn = comboToPN(ci);
      RG.pos = pn.pos; RG.neg = pn.neg;
    }
    var q = document.getElementById('rgQ');
    if (q) q.value = '';
    rgRenderAll();
  }
  function gotoRanges(w, ci) {
    if (w) {
      var i = -1;
      for (var n = 0; n < WEAPONS.length; n++) if (WEAPONS[n] === w) { i = n; break; }
      if (i >= 0) rgSetWeapon(i, ci);
      else if (ci != null && ci >= 0) { var pn = comboToPN(ci); RG.pos = pn.pos; RG.neg = pn.neg; rgRenderAll(); }
    } else if (ci != null && ci >= 0) {
      var pn2 = comboToPN(ci); RG.pos = pn2.pos; RG.neg = pn2.neg; rgRenderAll();
    }
    RG.from = (ci != null && ci >= 0)
      ? '已按当前卡面组合切到「' + P.combo[ci].name + '」' : '';
    rgRenderHead();
    var host = document.getElementById('ranges');
    if (host && host.scrollIntoView) {
      try { host.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { ZKHTML.warn('框架/app.js:4656', e); }
    }
  }
  function rgRenderCands() {
    var q = document.getElementById('rgQ'), box = document.getElementById('rgCands');
    if (!q || !box) return;
    if (!q.value) { box.innerHTML = ''; RG.q = []; RG.hot = -1; return; }
    RG.q = findWeapon(q.value).slice(0, 12);
    if (!RG.q.length) { box.innerHTML = '<div class="hint">没匹配到武器</div>'; RG.hot = -1; return; }
    if (RG.hot < 0 || RG.hot >= RG.q.length) RG.hot = 0;
    var h = '';
    RG.q.forEach(function (i, n) {
      var w = WEAPONS[i];
      h += '<div class="cand' + (RG.w === w ? ' on' : '') + (n === RG.hot ? ' hot' : '')
        + '" data-a="rgpick" data-i="' + i + '"><span class="n">' + (n + 1) + '</span><b>'
        + esc(wname(w)) + '</b>'
        + '<span class="meta">'
        + (isVariant(w) ? '<span class="tag-var">变体 · ' + esc(baseName(w)) + '</span>' : '')
        + '<span class="cat">' + esc(w.cat) + ' · ' + n2(ZKC.disp(w))
        + '</span></span></div>';
    });
    box.innerHTML = h;
  }
  function rgRenderVar() {
    var sel = document.getElementById('rgVar'), wrap = document.getElementById('rgVarWrap');
    if (!sel || !wrap) return;
    var w = RG.w;
    if (!w) { wrap.style.display = 'none'; return; }
    var base = baseName(w);
    if (!base) { wrap.style.display = 'none'; return; }
    var opts = [];
    for (var i = 0; i < WEAPONS.length; i++) if (baseName(WEAPONS[i]) === base) opts.push(i);
    if (opts.length <= 1) { wrap.style.display = 'none'; return; }
    wrap.style.display = '';
    var cur = WEAPONS.indexOf(w), html = '';
    for (var j = 0; j < opts.length; j++) {
      var wj = WEAPONS[opts[j]];
      var catn = (P.catName[wj.cat] ? P.catName[wj.cat][Math.min(lang, 2)] : wj.cat);
      var varTag = isVariant(wj) ? '（变体）' : '';
      html += '<option value="' + opts[j] + '"' + (opts[j] === cur ? ' selected' : '')
        + '>' + esc(wname(wj) + varTag + ' · ' + catn) + '</option>';
    }
    sel.innerHTML = html;
  }
  function rgRenderAll() {
    rgRenderHead(); rgRenderList(); rgRenderTables(); rgRenderCands();
  }
  function initRanges() {
    var rk = document.getElementById('rgRank');
    if (rk) {
      var h = '';
      for (var i = 0; i <= P.maxRank; i++) h += '<option value="' + i + '">' + i + '</option>';
      rk.innerHTML = h;
    }
    rgRenderCatBtns();
    var d = -1;
    for (i = 0; i < WEAPONS.length; i++) {
      if (WEAPONS[i].var !== IS_VAR
          && String(WEAPONS[i].en).toUpperCase().indexOf('AX-52') === 0) { d = i; break; }
    }
    for (i = 0; d < 0 && i < WEAPONS.length; i++)
      if (WEAPONS[i].var !== IS_VAR && WEAPONS[i].cat === '步枪') { d = i; break; }
    if (d >= 0) RG.w = WEAPONS[d];
    RG.cat = RG.w ? RG.w.cat : '步枪';
    if (RG.w) window.ZKSGW(RG.w);
    rgRenderAll();
    try {
      var rgBad = rgSelfCheck();
      if (rgBad.length) ZKHTML.warn('框架/app.js:rgself', new Error('基础数值表与实测值不符 ' + rgBad.join(',')));
    } catch (e0) { ZKHTML.warn('框架/app.js:rgself', e0); }
    window.addEventListener('zkdispchange', function () {
      try { rgRenderAll(); } catch (e) { ZKHTML.warn('框架/app.js:rg-dispchange', e); }
    });
  }
  document.addEventListener('click', function (e) {
    var t = e.target;
    while (t && t !== document && !(t.getAttribute && t.getAttribute('data-a'))) t = t.parentNode;
    if (!t || t === document) return;
    var a = t.getAttribute('data-a');
    if (a === 'rgpick') { rgSetWeapon(+t.getAttribute('data-i')); RG.from = ''; rgRenderHead(); }
    else if (a === 'rgpos') { RG.pos = +t.getAttribute('data-i'); RG.from = ''; rgRenderHead(); rgRenderTables(); }
    else if (a === 'rgneg') { RG.neg = t.getAttribute('data-i') === '1'; RG.from = ''; rgRenderHead(); rgRenderTables(); }
    else if (a === 'rgcombo') {
      var pn = comboToPN(+t.getAttribute('data-i'));
      RG.pos = pn.pos; RG.neg = pn.neg; RG.from = '';
      rgRenderHead(); rgRenderTables();
    }
    else if (a === 'rgcat') {
      RG.cat = t.getAttribute('data-cat');
      RG.catKey = RG.cat;
      RG.from = '';
      var keep = RG.w && RG.w.cat === RG.cat;
      if (!keep) {
        var i2;
        if (RG.cat === 'Zaw') { for (i2 = 0; i2 < WEAPONS.length; i2++) if (WEAPONS[i2].var !== IS_VAR && isZaw(WEAPONS[i2])) { RG.w = WEAPONS[i2]; break; } }
        else if (RG.cat === '组合枪') { for (i2 = 0; i2 < WEAPONS.length; i2++) if (WEAPONS[i2].var !== IS_VAR && isKit(WEAPONS[i2])) { RG.w = WEAPONS[i2]; break; } }
        else if (RG.cat === '同伴武器') { for (i2 = 0; i2 < WEAPONS.length; i2++) if (WEAPONS[i2].var !== IS_VAR && isCompanion(WEAPONS[i2])) { RG.w = WEAPONS[i2]; break; } }
        else { for (i2 = 0; i2 < WEAPONS.length; i2++) if (WEAPONS[i2].cat === RG.cat) { RG.w = WEAPONS[i2]; break; } }
      }
      rgRenderHead(); rgRenderList(); rgRenderTables();
    }
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'rgRank') { RG.rank = +e.target.value; RG.from = ''; rgRenderHead(); rgRenderTables(); }
    else if (e.target.id === 'rgVar') { rgSetWeapon(+e.target.value); RG.from = ''; }
  });
  document.addEventListener('input', function (e) {
    if (e.target.id === 'rgQ') rgRenderCands();
  });
  document.addEventListener('keydown', function (e) {
    if ((e.target || {}).id !== 'rgQ') return;
    var n = RG.q ? RG.q.length : 0;
    if (!n) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      RG.hot = ((RG.hot < 0 ? 0 : RG.hot) + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
      rgRenderCands();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      rgSetWeapon(RG.q[RG.hot < 0 ? 0 : RG.hot]);
    }
  });
  var dmgImportHook = null;
  function initDmg() {
    var RR = window.RIVEN_ROUTER, WE = window.WF;
    var host = document.getElementById('dmg');
    if (!host) return;
    var $ = function (id) { return document.getElementById(id); };
    if (!RR || !WE || !window.WEAPON_DB) {
      var box0 = $('g-big');
      if (box0) box0.innerHTML = '<div class="g-empty">收益引擎没有载入</div>';
      return;
    }
    var RL = window.RULES || {};
    var SLOTS = RL.RIVEN_SLOTS || 4;         /* 一张卡最多几条词条 */
    var MAXP = RL.RIVEN_MAX_POS || 3;        /* 最多几条正 */
    var MAXN = RL.RIVEN_MAX_NEG || 1;        /* 最多几条负 */
    var VMAX = RL.VALUE_MAX || 404;          /* 卡面读数上限 */
    var RECOIL = RL.RECOIL_ROW || 25;        /* 后坐力：方向相反 */
    var NEGNLY = RL.NEG_ONLY_ROW || 30;      /* 概率不获得连击数：只能当负面（02 同款） */
    var MELEE_POS = window.RULES.ZK_MELEE_POS;
    var RANGED_POS = window.RULES.ZK_RANGED_POS;
    function dirOf(row) { return ZKC.dirOf(row); }
    function alwaysPos(row, C) {                                     /* 02 原函数复制 */
      if (isFuseRow(row)) return true;
      return C.melee ? MELEE_POS.indexOf(row) >= 0 : RANGED_POS.indexOf(row) >= 0;
    }
    var byN = {}, byZ = {};
    RR.DB.forEach(function (w) {
      if (w.n) byN[String(w.n).toLowerCase()] = w;
      if (w.z) byZ[w.z] = w;
    });
    function mapWeapon(w) {
      if (!w) return null;
      var n = String(w.en || '').toLowerCase();
      if (byN[n]) return byN[n];
      if (w.cn && byZ[w.cn]) return byZ[w.cn];
      var i2 = String(w.intl || '').toLowerCase();
      if (byN[i2]) return byN[i2];
      return null;
    }
    var ROW2STAT = window.RULES.ZK_ROW2STAT;
    var MELEE_ROWS = RL.ZK_MELEE_ROWS || [3, 27, 28, 29, 30, 31, 32, 33, 34];
    var FACROWS = RL.FACTION_DROWS || [16, 17, 18, 42, 43, 44];
    var NONPCT = RL.NON_PCT || [20, 27, 28, 34];
    var FACROW = RL.FACROW_KEY || { 16: 'corpus', 17: 'grineer', 18: 'infested',
                                    42: 'orokin', 43: 'techrot', 44: 'scaldra' };
    var Z = (window.ZKDATA && window.ZKDATA.stats) ? window.ZKDATA : { stats: [], weapons: [] };
    var ZROW = {};
    Z.stats.forEach(function (r) { ZROW[r.row] = r; });
    var CATCOL = ZKC.CAT_COL;
    function nrm(s) {
      return String(s == null ? '' : s).toLowerCase()
        .replace(/[\s\-_'’·.]/g, '').replace(/prime/g, 'p');
    }
    var ZK_EN = {};
    (Z.weapons || []).forEach(function (z) { if (z.en) ZK_EN[nrm(z.en)] = z; });
    function aliasQ(q) { return ZKC.aliasNorm(q); }
    var ROWS_OF = {};
    Object.keys(ROW2STAT).forEach(function (r) {
      var k = ROW2STAT[r];
      if (!k || k === '@spd') return;
      (ROWS_OF[k] = ROWS_OF[k] || []).push(+r);
    });
    function rowFor(k, cat) {
      var rs = ROWS_OF[k] || [];
      for (var i = 0; i < rs.length; i++) {
        var r = ZROW[rs[i]];
        if (r && r.v && r.v[CATCOL[cat]] != null) return rs[i];
      }
      return rs.length ? rs[0] : null;
    }
    function slotKey(row, C) {
      var k = ROW2STAT[row];
      if (k === '@spd') k = C.melee ? 'aspeed' : 'frate';
      return k;
    }
    function isFacRow(row) { return FACROWS.indexOf(row) >= 0; }
    function isNonPctRow(row) { return NONPCT.indexOf(row) >= 0; }
    function rowUnit(row) {
      if (row == null) return '%';
      if (isFacRow(row)) return '×';
      if (!isNonPctRow(row)) return '%';
      if (row === 20 || row === 34) return 'm';
      if (row === 28) return 's';
      return '';
    }
    function toCard(row, v) { return isFacRow(row) ? 1 + (+v || 0) / 100 : (+v || 0); }
    function toInner(row, x) { return isFacRow(row) ? ((+x || 0) - 1) * 100 : (+x || 0); }
    function fmtCard(row, v, withSign) {
      if (isFacRow(row)) return '×' + toCard(row, v).toFixed(2);
      var s = (withSign && v >= 0 ? '+' : '') + (Math.round(v * 100) / 100).toFixed(2);
      return s + rowUnit(row);
    }
    function fmtCap(row, cap) {
      if (cap == null) return '';
      if (isFacRow(row)) return '×' + (1 + cap / 100).toFixed(2);
      return '≤' + (Math.round(cap * 100) / 100).toFixed(2) + rowUnit(row);
    }
    function guessCat(w) {
      if (w.s === 'm') return '近战';
      if (w.s === 'a') return '曲翼';
      if (w.c === 'shotgun' || w.c === 'dual_shotguns') return '霰弹';
      if (w.s === 's') return '手枪';
      return '步枪';
    }
    var ASM = window.ZKASM || null;
    var ASMS = window.RULES.ZK_ASMS;
    function tx(cn, en) { return ZKHTML.tx(cn, en); }
    function archSub(a) { return RR.archSubOf(a && a.id, langIx()); }
    function anm(id) {
      var a = ASM && ASM.n && ASM.n[id];
      if (!a) return id;
      return a[langIx()] || a[1] || a[2] || id;
    }
    function camel(s) {
      var w = String(s == null ? '' : s).replace(/\(.*?\)/g, ' ')
        .replace(/[^A-Za-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
      return w.map(function (x, i) {
        var l = x.toLowerCase();
        return i ? l.charAt(0).toUpperCase() + l.slice(1) : l;
      }).join('');
    }
    function asmFind(list, id) { return ZKC.asmFind(list, id); }
    var KIT_LD_P = window.RULES.ZK_KIT_LD_P;
    function ldSide(x) { return ZKC.ldSide(x); }
    function asmSide() { return ASMS.side === 's' ? 's' : 'p'; }
    function ldList(sd) {
      return ASM.kit.l.filter(function (x) { return ldSide(x) === sd; });
    }
    function kitRows() {
      if (kitRows._m) return kitRows._m;
      var m = {};
      (Z.weapons || []).forEach(function (z) {
        var mm = /^(.+?)\s*\((Primary|Secondary)\)\s*$/i.exec(String(z.en || ''));
        if (!mm) return;
        var id = camel(mm[1]);
        if (!id) return;
        (m[id] = m[id] || {})[mm[2].toLowerCase() === 'primary' ? 'p' : 's'] = z;
      });
      kitRows._m = m;
      return m;
    }
    function kitCat(ch, seco) {
      if (seco) return '手枪';
      return (ch.n === 'Catchmoon' || ch.n === 'Sporelacer') ? '霰弹' : '步枪';
    }
    function asmKind(C) {
      if (!C) return '';
      if (ZKC.isLich(C.w)) return 'lich';
      if (!ASM || !C.zk) return '';
      var ci = camel(C.zk.en || C.zk.intl || '');
      if (!ci) return '';
      if (ASM.kit.c.some(function (x) { return x.i === ci; })) return 'kit';
      if (ASM.zaw.s.some(function (x) { return x.i === ci; })) return 'zaw';
      return '';
    }
    function syncAsm(C, kind) {
      if (kind === 'lich') { ASMS.kind = 'lich'; ASMS.src = 'lich'; return; }
      var sig = kind + '|' + (C.zk ? (C.zk.en || C.zk.cn || '') : '');
      if (ASMS.kind === kind && ASMS.src === sig) return;
      var sameKind = (ASMS.kind === kind);
      ASMS.kind = kind;
      ASMS.src = sig;
      if (kind === 'zaw') {
        var st = asmFind(ASM.zaw.s, camel(C.zk.en || '')) || ASM.zaw.s[0];
        ASMS.strike = st.i;
        if (!sameKind || !asmFind(ASM.zaw.g, ASMS.zgrip)) ASMS.zgrip = ASM.zaw.g[0].i;
        if (!sameKind || !asmFind(ASM.zaw.l, ASMS.zlink)) ASMS.zlink = ASM.zaw.l[0].i;
        if (st.i === 'balla' && ASMS.zlink === ASM.zaw.l[0].i) {
          ASMS.zlink = (asmFind(ASM.zaw.l, 'vargeetIiJai') || ASM.zaw.l[0]).i;
        }
        return;
      }
      var side = /\(Secondary\)/i.test(String(C.zk.en || '')) ? 's' : 'p';
      var flip = (ASMS.side !== side);
      ASMS.side = side;
      ASMS.chamber = camel(C.zk.en || '');
      var g0 = asmFind(ASM.kit.g, ASMS.kgrip);
      if (flip || !g0 || (g0.t === 'Secondary') !== (side === 's')) {
        var g = ASM.kit.g.filter(function (x) { return (x.t === 'Secondary') === (side === 's'); })[0];
        ASMS.kgrip = (g || ASM.kit.g[0]).i;
      }
      var l0 = asmFind(ASM.kit.l, ASMS.kloader);
      if (flip || !l0 || ldSide(l0) !== side) {
        ASMS.kloader = (ldList(side)[0] || ASM.kit.l[0]).i;
      }
    }
    var ZTYPES = window.RULES.ZK_ZTYPES;
    function buildZaw(C) {
      var st = asmFind(ASM.zaw.s, ASMS.strike) || ASM.zaw.s[0];
      var gp = asmFind(ASM.zaw.g, ASMS.zgrip) || ASM.zaw.g[0];
      var lk = asmFind(ASM.zaw.l, ASMS.zlink) || ASM.zaw.l[0];
      var mod = gp.th ? st.w : st.o;
      var total = Math.round((224 + st.d + gp.d + lk.d) * (mod.d || 1));
      var dm = {};
      var calced = (st.r.length === 4)
        ? st.r.map(function (v, i) { return [ZTYPES[i], +(v + (total - st.d) / 4).toFixed(1)]; })
        : st.r.map(function (v, i) { return [ZTYPES[i], +((v * total) / 20).toFixed(1)]; });
      calced.forEach(function (kv) { if (kv[1] > 0) dm[kv[0]] = (dm[kv[0]] || 0) + kv[1]; });
      var cc = (10 + st.c + lk.c) / 100, sc = (10 + st.st + lk.st) / 100;
      var fr = (60 + st.s + gp.s + lk.s) / 60;
      return {
        i: 'asm:zaw:' + st.i + ':' + gp.i + ':' + lk.i,
        n: st.n, z: anm(st.i), s: 'm', c: 'melee', mr: 0,
        st: (mod.t || 'melee').toLowerCase(),
        dp: DISP_ALL, rf: st.n, tr: [], co: 'additive_with_base_damage',
        at: { cc: cc, cd: (st.ix === 'A' ? 2.2 : 2), sc: sc, ms: 1,
              fr: +fr.toFixed(3), dmg: dm, pt: 0, rng: mod.g, ft: 0.6,
              hv: { m: 6, w: 0.3667 } },
        cdur: 5,
        fl: ['block', 'block_forward', 'forward', 'heavy', 'slide']
      };
    }
    var KTYPES = window.RULES.ZK_KTYPES;
    function buildKit(C) {
      var ci = 0, ch = asmFind(ASM.kit.c, ASMS.chamber) || ASM.kit.c[0];
      ASM.kit.c.forEach(function (x, i) { if (x.i === ch.i) ci = i; });
      var gp = asmFind(ASM.kit.g, ASMS.kgrip) || ASM.kit.g[0];
      var seco = (asmSide() === 's');
      var ld = asmFind(ASM.kit.l, ASMS.kloader);
      if (!ld || ldSide(ld) !== asmSide()) {
        ld = ldList(asmSide())[0] || ASM.kit.l[0];
        ASMS.kloader = ld.i;
      }
      if ((gp.t === 'Secondary') !== seco) {
        gp = ASM.kit.g.filter(function (x) { return (x.t === 'Secondary') === seco; })[0] || gp;
        ASMS.kgrip = gp.i;
      }
      var src = seco ? ch.s : ch.p;
      var ov = (ld.ov || []).filter(function (o) { return o.chamberID === ch.n; })[0] || {};
      var dm = {};
      src.forEach(function (kv) {
        var mul = (ch.n === 'Tombfinger' && seco && kv[0] === 'Radiation') ? 4 : 1;
        var v = +(kv[1] + mul * gp.d[ci]).toFixed(1);
        var k = KTYPES[String(kv[0]).toLowerCase()] || String(kv[0]).toLowerCase();
        if (v > 0) dm[k] = (dm[k] || 0) + v;
      });
      var cd = (ch.n === 'Sporelacer' && seco ? 3 : 2) + ld.cd;
      var cc = ch.cc + (ov.critChance != null ? ov.critChance : ld.cc);
      var sc = ch.sc + (ov.procChance != null ? ov.procChance : ld.sc);
      var rel = 1.3 + (ov.reload != null ? ov.reload : ld.rel);
      var mag = ch.mag[ld.mi] || ch.mag[0];
      var isShot = (ch.n === 'Catchmoon' || ch.n === 'Sporelacer') && !seco;
      return {
        i: 'asm:kit:' + ch.i + ':' + gp.i + ':' + ld.i,
        n: ch.n, z: anm(ch.i), s: seco ? 's' : 'p',
        c: seco ? 'pistol' : (isShot ? 'shotgun' : 'rifle'), mr: 0,
        dp: DISP_ALL, rf: ch.n, tr: [],
        co: 'additive_with_base_damage',
        at: { cc: +cc.toFixed(3), cd: +cd.toFixed(2), sc: +sc.toFixed(3), ms: 1,
              fr: +(gp.f[ci] / 60).toFixed(3), dmg: dm, pt: 0, rng: 300 },
        mag: mag, rel: +rel.toFixed(2), ammo: 210
      };
    }
    function asmSummary(w) {
      var l = langIx(), dm = w.at.dmg, tot = 0, parts = [];
      for (var k in dm) if (Object.prototype.hasOwnProperty.call(dm, k)) tot += dm[k];
      ['impact', 'puncture', 'slash', 'heat', 'cold', 'electricity', 'toxin',
       'blast', 'radiation', 'gas', 'magnetic', 'viral', 'corrosive', 'void'].forEach(function (k) {
        if (dm[k]) parts.push(ZK_DMG_CN[k][l] + ' ' + fmt(dm[k], 1));
      });
      var bits = [
        '基础伤害 <b>' + fmt(tot, 1) + '</b>（' + parts.join(' · ') + '）',
        w.s === 'm' ? '攻击速度 <b>' + fmt(w.at.fr, 2) + '</b>'
                    : '射速 <b>' + fmt(w.at.fr, 2) + '</b> /秒',
        '暴击 <b>' + fmt(w.at.cc * 100, 1) + '%</b> ×' + fmt(w.at.cd, 2),
        '触发 <b>' + fmt(w.at.sc * 100, 1) + '%</b>'
      ];
      if (w.s === 'm') bits.push('范围 <b>' + fmt(w.at.rng, 1) + ' m</b>');
      else bits.push('弹匣 <b>' + (w.mag || '∞') + '</b> · 装填 <b>' + fmt(w.rel, 2) + 's</b>');
      return bits;
    }
    var ZK_DMG_CN = window.RULES.ZK_DMG_CN;
    function cur() {
      var w = state.zk ? null : RR.byId(state.id);
      var zk = state.zk || (w ? ZK_EN[nrm(w.n)] : null);
      var cat = (zk && zk.cat) || (w ? guessCat(w) : '步枪');
      var melee = w ? !!RR.profile(w).isMelee : (cat === '近战');
      var C = { w: w, zk: zk, cat: cat, melee: melee,
                disp: w ? ZKC.disp(w) : DISP_ALL, asm: '' };
      var k = asmKind(C);
      if (k === 'lich') {
        syncAsm(C, k);
        C.asm = 'lich';
        C.w = ZKC.lichAdd(C.w, ZKC.lichEl(ASMS.elem4));
        C.disp = ZKC.disp(C.w);
      } else if (k) {
        syncAsm(C, k);
        var bw = (k === 'zaw') ? buildZaw(C) : buildKit(C);
        C.asm = k;
        C.w = bw;
        C.melee = (k === 'zaw');
        C.cat = (k === 'zaw') ? '近战' : '手枪';
        C.disp = ZKC.disp(C.w);
      }
      return C;
    }
    function langIx() { return ZKHTML.langIx(); }
    function wnameOf(C) {
      if (C.asm === 'zaw') return anm(ASMS.strike);
      if (C.asm === 'kit') return anm(ASMS.chamber);
      var l = langIx(), zk = C.zk;
      if (zk) {
        var t = (l === 0 ? (zk.cn || zk.intl) : (l === 2 ? (zk.en || zk.intl) : (zk.intl || zk.cn)));
        if (!C.w) return t || zk.en || state.id;
        if (C.w.z === t) return t;
      }
      if (C.w) {
        if (!zk) return (l === 2 ? (C.w.n || C.w.z) : (C.w.z || C.w.n));
        return (l === 2 ? (C.w.n || C.w.z) : (C.w.z || C.w.n));
      }
      return state.id;
    }
    function zname(row) {
      var r = ZROW[row];
      if (!r) return '—';
      var l = langIx();
      return (l === 0 ? (r.cn || r.intl) : (l === 2 ? (r.en || r.intl) : (r.intl || r.cn)))
        || r.cn || String(row);
    }
    function catalog(C) {
      var legal = C.w ? RR.legalStats(C.w) : null, ok = {};
      if (legal) legal.forEach(function (s) { ok[s.k] = 1; });
      var rows = Object.keys(ZROW).map(Number).sort(function (a, b) { return a - b; });
      var out = [];
      rows.forEach(function (row) {
        if (!ROW2STAT[row]) return;
        var r = ZROW[row];
        if (!r.v || r.v[CATCOL[C.cat]] == null) return;      /* 闸①模板没这条属性 洗不出来 */
        var k = slotKey(row, C);
        if (legal && !ok[k]) return;                          /* 闸②引擎判死 */
        out.push({ row: row, k: k, n: r.cn || k,
                   grp: MELEE_ROWS.indexOf(row) >= 0 ? '近战武器'
                      : (isFuseRow(row) ? '融合词条' : '') });
      });
      var GR = { '': 0, '近战武器': 1, '融合词条': 2 };
      out.sort(function (a, b) { return (GR[a.grp] - GR[b.grp]) || (a.row - b.row); });
      return out;
    }
    function capOf(C, row, sign, tier) {
      if (row == null || !tier || !tier.t) return null;
      var r = ZROW[row], col = CATCOL[C.cat];
      if (!r || !r.v || col == null || r.v[col] == null) return null;
      var b = r.v[col];
      var pct = isFacRow(row) ? (b - 1) * 100 : b;
      var f = sign < 0 ? tier.t.neg : tier.t.pos;
      return Math.abs(pct) * ZKC.disp(C.w) * f * 1.1;
    }
    var state = { id: 'torid', zk: null, target: 'g_demo', steel: 1, slots: [] };
    var selArch = null;
    state.slots = [
      { row: 4, v: 200.9 }, { row: 5, v: 145.5 },
      { row: 37, v: 119.8 }, { row: 26, v: -62.9 }
    ];
    var adv = {
      armor: '', strip: 0, faction: '',
      dmg: 0, ms: 0, cc: 0, cd: 0, fac: 0,
      e1: '', e1v: 0, e2: '', e2v: 0,
      napalm: 0, acid: 0
    };
    function advOn() {
      if (adv.armor !== '' && adv.armor != null) return true;
      if (+adv.strip || adv.faction || adv.napalm || adv.acid) return true;
      if (adv.e1 || adv.e2) return true;
      var ks = ['dmg', 'ms', 'cc', 'cd', 'fac'];
      for (var i = 0; i < ks.length; i++) if (+adv[ks[i]]) return true;
      return false;
    }
    $('g-dbcount').textContent = (Z.weapons.length || RR.DB.length) + ' 把';
    $('g-dbcount').title = '倾向表 ' + (Z.weapons.length || 0) + ' 把全部可查 · 引擎库 ' +
      RR.DB.length + ' 条（多出的是爪类与显赫武器）· Zaw / 组合枪选到刀刃或枪膛、或选到赤毒 / 信条 / 终幕武器时，下面会出现组装台';
    function riv() {
      var C = cur(), o = {};
      var t = RR.TARGET_BY_K[targetKeyNow()] || RR.TARGETS[0];
      for (var i = 0; i < state.slots.length; i++) {
        var s = state.slots[i];
        if (!s || !s.row) continue;
        if (isFacRow(s.row) && FACROW[s.row] && t && t.faction && FACROW[s.row] !== t.faction) continue;
        o[slotKey(s.row, C)] = s.v;
      }
      return o;
    }
    function rowApplies(row) {
      if (!isFacRow(row)) return true;
      var t = RR.TARGET_BY_K[targetKeyNow()] || RR.TARGETS[0];
      return !(FACROW[row] && t && t.faction && FACROW[row] !== t.faction);
    }
    function counts() {
      var np = 0, nn = 0;
      state.slots.forEach(function (s, i) {
        if (!s || !s.row) return;
        if (i === 3) nn++; else np++;     /* 02 口径：按槽位位置数，不看值符号 */
      });
      return { np: np, nn: nn };
    }
    function curTier() {
      var c = counts();
      return RR.tierOf(Math.min(MAXP, c.np), Math.min(MAXN, c.nn));
    }
    var flashT = null;
    function flash(msg) {
      var el = $('g-tier');
      if (!el) return;
      var back = el.textContent;
      el.textContent = msg;
      el.style.color = 'var(--neg-text)';
      clearTimeout(flashT);
      flashT = setTimeout(function () { el.textContent = back; el.style.color = ''; }, 1600);
    }
    function targetKeyNow() {
      var sk = state.target + (state.steel ? '@sp' : '');
      var base = RR.TARGET_BY_K[sk] || RR.TARGET_BY_K[state.target];
      if (!base) return state.target;
      var armFill = (adv.armor !== '' && adv.armor != null && isFinite(+adv.armor));
      var strip = Math.max(0, Math.min(100, +adv.strip || 0));
      if (!armFill && !strip && !adv.faction) return base.k;
      var t = {};
      for (var k in base) if (Object.prototype.hasOwnProperty.call(base, k)) t[k] = base[k];
      var arm = armFill ? Math.max(0, +adv.armor) : base.armor;
      t.armor = Math.round(arm * (1 - strip / 100));
      if (adv.faction) t.faction = adv.faction;
      t.sub = '微调过：' +
        (armFill ? '护甲 ' + arm : '护甲跟档') +
        (strip ? ' · 剥甲 ' + strip + '%' : '') +
        (adv.faction ? ' · 派系换过' : '');
      RR.TARGET_BY_K.__adv4 = t;
      return '__adv4';
    }
    var EXKEYS = window.RULES.ZK_EXKEYS;
    function extraNow() {
      var o = {}, any = false;
      for (var i = 0; i < EXKEYS.length; i++) {
        var v = +adv[EXKEYS[i]] || 0;
        if (v) { o[EXKEYS[i]] = v; any = true; }
      }
      if (adv.e1 && +adv.e1v) { o[adv.e1] = (o[adv.e1] || 0) + (+adv.e1v); any = true; }
      if (adv.e2 && +adv.e2v) { o[adv.e2] = (o[adv.e2] || 0) + (+adv.e2v); any = true; }
      if (+adv.napalm) { o.napalm = 1; any = true; }
      if (+adv.acid) { o.acid = 1; any = true; }
      return any ? o : null;
    }
    function advAny() {
      return (adv.armor !== '' && adv.armor != null) || +adv.strip || adv.faction || extraNow();
    }
    function isAsmName(name) {
      var c = camel(name);
      return !!c && !!(asmFind(ASM.zaw.s, c) || asmFind(ASM.kit.c, c));
    }
    function zkName(zk) {
      if (!zk) return '';
      var l = langIx();
      return (l === 0 ? (zk.cn || zk.intl) : (l === 2 ? (zk.en || zk.intl) : (zk.intl || zk.cn)))
        || zk.en || '';
    }
    function searchAll(q, limit) {
      q = aliasQ(q).trim();
      var hits = RR.search(q, limit * 2).filter(function (w) {
        return !isAsmName(w.n);
      }).map(function (w) { return { w: w, zk: null }; });
      var seen = {};
      hits.forEach(function (x) { seen[nrm(x.w.n)] = 1; });
      var nq = nrm(q), extra = [];
      if (nq) {
        for (var i = 0; i < Z.weapons.length && extra.length < 4; i++) {
          var z = Z.weapons[i];
          if (seen[nrm(z.en)]) continue;
          if (nrm(z.cn).indexOf(nq) < 0 && nrm(z.intl).indexOf(nq) < 0 &&
              nrm(z.en).indexOf(nq) < 0) continue;
          extra.push({ w: null, zk: z });
        }
      }
      return hits.concat(extra).slice(0, limit);
    }
    $('g-q').addEventListener('input', function () {
      var q = this.value.trim();
      if (!q) { $('g-hits').classList.remove('on'); return; }
      var hits = searchAll(q, 8);
      if (!hits.length) {
        $('g-hits').innerHTML = '<div class="g-hit"><span>没有匹配</span></div>';
        $('g-hits').classList.add('on'); return;
      }
      $('g-hits').innerHTML = hits.map(function (x) {
        return x.zk
          ? '<div class="g-hit" data-zk="' + esc(x.zk.en) + '"><span>' + esc(zkName(x.zk)) +
            '</span><i>' + esc(x.zk.cat) + '模板 · ' +
            (isAsmName(x.zk.en) ? tx('可组装', 'buildable') : tx('同伴/自制', 'companion/custom')) +
            ' · 倾向 ' + n2(ZKC.disp(x.zk)) + '</i></div>'
          : '<div class="g-hit" data-id="' + x.w.i + '"><span>' + esc(langIx() === 2 ? (x.w.n || x.w.z) : (x.w.z || x.w.n)) + '</span>' +
            '<i>' + esc(RR.slotNameOf(x.w.s, langIx())) + ' · 倾向 ' + n2(ZKC.disp(x.w)) + '</i></div>';
      }).join('');
      $('g-hits').classList.add('on');
      [].slice.call($('g-hits').querySelectorAll('.g-hit')).forEach(function (el) {
        el.addEventListener('click', function () {
          if (this.getAttribute('data-zk')) pick({ zk: ZK_EN[nrm(this.getAttribute('data-zk'))] });
          else pick({ w: RR.byId(this.getAttribute('data-id')) });
          $('g-q').value = '';
          $('g-hits').classList.remove('on');
        });
      });
    });
    function pick(it) {
      if (!it) return;
      if (it.zk) { state.zk = it.zk; state.id = 'zk:' + it.zk.en; }
      else if (it.w) { state.zk = null; state.id = it.w.i; }
      else return;
      var ok = {};
      catalog(cur()).forEach(function (x) { ok[x.row] = 1; });
      state.slots = state.slots.map(function (s, i) { return (s && s.row && ok[s.row]) ? s : null; });
      adv.napalm = 0; adv.acid = 0;
      if (MB) MB.autoNote = '';
      selArch = null;
      render();
    }
    function paintSteel() {
      var bs = $('g-steel').children;
      for (var i = 0; i < bs.length; i++) {
        bs[i].className = (+bs[i].getAttribute('data-st') === (state.steel ? 1 : 0)) ? 'on' : '';
      }
    }
    function paintTargets() {
      var sfx = state.steel ? '@sp' : '';
      $('g-tg').innerHTML = RR.TARGETS.map(function (t) {
        var tt = RR.TARGET_BY_K[t.k + sfx] || t;
        return '<button type="button" data-k="' + t.k + '">' + esc(RR.targetNameOf(t.k, langIx())) +
          '<small>' + esc(RR.targetSubOf(tt, langIx())) + '</small></button>';
      }).join('');
      paintSteel();
    }
    function relabelTargets() {
      $('g-steel').innerHTML =
        '<button type="button" data-st="0">' + tx('普通图', 'Normal') + '</button>' +
        '<button type="button" data-st="1">' + tx('钢铁之路', 'Steel Path') + '</button>';
      paintTargets();
      var bs = $('g-tg').children;
      for (var i = 0; i < bs.length; i++) {
        bs[i].className = bs[i].getAttribute('data-k') === state.target ? 'on' : '';
      }
    }
    window.ZKPAINT = { targets: relabelTargets };
    relabelTargets();
    $('g-steel').addEventListener('click', function (e) {
      var b = e.target;
      while (b && b !== this && !(b.getAttribute && b.getAttribute('data-st') != null)) b = b.parentNode;
      if (!b || b === this) return;
      state.steel = +b.getAttribute('data-st');
      selArch = null;
      paintTargets();
      render();
    });
    $('g-tg').addEventListener('click', function (e) {
      var b = e.target;
      while (b && b !== this && !(b.getAttribute && b.getAttribute('data-k'))) b = b.parentNode;
      if (!b || b === this) return;
      state.target = b.getAttribute('data-k');
      selArch = null;
      render();
    });
    (function buildAdv() {
      var mhost = $('g-advmods'), ehost = $('g-advenemy');
      if (!mhost || !ehost) return;
      var ADV_LAB = {
        dmg: ['基伤', 'Base Damage'], ms: ['多重', 'Multishot'], cc: ['暴率', 'Crit Chance'],
        cd: ['暴伤', 'Crit Damage'], fac: ['对派系', 'Faction Damage'],
        e1: ['元素 A', 'Element A'], e2: ['元素 B', 'Element B'],
        armor: ['护甲', 'Armor'], strip: ['已剥甲', 'Stripped'], faction: ['派系', 'Faction']
      };
      var ADV_ELEM = ['heat', 'cold', 'toxin', 'electric', 'corrosive', 'viral',
                      'gas', 'radiation', 'magnetic', 'blast'];
      function labOf(k) {
        var p = ADV_LAB[k];
        if (!p) return k;
        return langIx() === 2 ? p[1] : p[0];
      }
      function numRow(key, unit, ph) {
        return '<label class="g-avr"><span data-lab="' + key + '">' + labOf(key) + '</span>' +
          '<input type="number" step="5" data-ak="' + key + '" placeholder="' + ph + '"><i>' +
          unit + '</i></label>';
      }
      function elRow(n, tk, vk) {
        return '<label class="g-avr wide"><span data-lab="' + tk + '">' + labOf(tk) + '</span>' +
          '<select data-ak="' + tk + '"><option value="">' + tx('不加', 'None') + '</option>' +
          ADV_ELEM.map(function (k) {
            return '<option value="' + k + '">' + window.ZKNAME.type(k) + '</option>';
          }).join('') + '</select>' +
          '<input type="number" step="5" data-ak="' + vk + '" placeholder="90"><i>%</i></label>';
      }
      mhost.innerHTML =
        numRow('dmg', '%', '265') + numRow('ms', '%', '230') +
        numRow('cc', '%', '180') + numRow('cd', '%', '120') +
        numRow('fac', '%', '55') + elRow('A', 'e1', 'e1v') + elRow('B', 'e2', 'e2v');
      var facs = [['', '跟目标档']];
      Object.keys(WE.FACTIONS || {}).forEach(function (k) {
        if (k === 'none' || k === 'overguard') return;   /* 超宏不在目标档与手填选项内 */
        facs.push([k, (WE.FACTIONS[k] && WE.FACTIONS[k].label) || k]);
      });
      ehost.innerHTML =
        '<label class="g-avr"><span data-lab="armor">' + labOf('armor') + '</span><input type="number" step="100" data-ak="armor" placeholder="跟档"><i>点</i></label>' +
        '<label class="g-avr"><span data-lab="strip">' + labOf('strip') + '</span><input type="number" step="5" min="0" max="100" data-ak="strip" value="0"><i>%</i></label>' +
        '<label class="g-avr wide"><span data-lab="faction">' + labOf('faction') + '</span><select data-ak="faction">' +
          facs.map(function (f) { return '<option value="' + f[0] + '">' + f[1] + '</option>'; }).join('') +
        '</select></label>';
      function onEdit(e) {
        var el = e.target;
        var k = el.getAttribute && el.getAttribute('data-ak');
        if (!k) return;
        if (el.tagName === 'SELECT') adv[k] = el.value;
        else if (el.value === '') adv[k] = (k === 'armor') ? '' : 0;   /* 护甲空 = 跟档 */
        else adv[k] = el.value;
        selArch = null;
        redraw();
        advHint();
      }
      mhost.addEventListener('input', onEdit);
      mhost.addEventListener('change', onEdit);
      ehost.addEventListener('input', onEdit);
      ehost.addEventListener('change', onEdit);
      function relabel() {
        var sp = document.querySelectorAll('[data-lab]');
        for (var i = 0; i < sp.length; i++) sp[i].textContent = labOf(sp[i].getAttribute('data-lab'));
        var sels = mhost.querySelectorAll('select[data-ak]');
        for (var j = 0; j < sels.length; j++) {
          var opts = sels[j].options;
          for (var k = 0; k < opts.length; k++) {
            var v = opts[k].value;
            opts[k].textContent = v ? window.ZKNAME.type(v) : tx('不加', 'None');
          }
        }
      }
      window.ZKADV = { relabel: relabel };
    })();
    function advHint() {
      var el = $('g-advhint');
      if (!el) return;
      var ex = extraNow();
      var bits = [];
      if (ex) {
        var MECH_MID = { napalm: 'nightwatch_napalm', acid: 'acid_shells' };
        Object.keys(ex).forEach(function (k) {
          if (MECH_MID[k]) {
            var mo = window.ZKNAME.modById(MECH_MID[k]);
            bits.push(mo ? window.ZKNAME.mod(mo) : k);
            return;
          }
          bits.push(RR.statNameOf(k, langIx()) + ' +' + ex[k] + '%');
        });
      }
      if (adv.armor !== '') bits.push('护甲 ' + adv.armor);
      if (+adv.strip) bits.push('剥甲 ' + adv.strip + '%');
      if (adv.faction) bits.push('派系 ' + RR.targetName({ faction: adv.faction }));
      el.innerHTML = bits.length
        ? '正在生效 —— ' + bits.join(' · ') + '。清空即回到目标档。'
        : '留空＝完全按上面选的目标档算。填了才会盖上去；护甲和剥甲同时填时，先按护甲、再乘 (1−剥甲)。';
    }
    function addAt(b, row) {
      row = +row;
      var C = cur();
      if (state.slots[b] && state.slots[b].row) return;   /* 该格已有词条 */
      var good = (b === 3) ? -1 : 1;                      /* 02 口径：符号由槽位定，无正负按钮 */
      if (good < 0 && alwaysPos(row, C)) { flash('这条词条不能当负面'); return; }
      if (good < 0 && C.melee && isFuseRow(row)) {
        flash('融合词条在近战上不能当负面'); return;      /* 总则 H-2 */
      }
      var cap = capOf(C, row, good, curTier());
      state.slots[b] = { row: row,
        v: good * dirOf(row) * Math.round((cap || 50) * 0.8 * 10) / 10 };
      selArch = null;
      render();
    }
    function changeK(i, row) {
      var s = state.slots[i];
      if (!s) return;
      row = +row;
      if (!row) { state.slots[i] = null; selArch = null; render(); return; }
      var C = cur(), good = (i === 3) ? -1 : 1;
      if (good < 0 && alwaysPos(row, C)) { flash('这条词条不能当负面'); return; }
      if (good > 0 && row === NEGNLY) { flash('「概率不获得连击数」只能当负面'); return; }
      if (good < 0 && C.melee && isFuseRow(row)) {
        flash('融合词条在近战上不能当负面'); return;
      }
      var nElem = 0, nFus = 0;
      state.slots.forEach(function (x, xi) {
        if (!x || !x.row || xi === i) return;
        if (xi !== 3 && [9, 10, 11, 12].indexOf(x.row) >= 0) nElem++;
        if (isFuseRow(x.row)) nFus++;
      });
      if ([9, 10, 11, 12].indexOf(row) >= 0 && nElem >= 2) {
        flash('一条紫卡最多 2 个基础元素'); return;       /* 02 规则 #9 */
      }
      if (isFuseRow(row) && nFus >= 1) {
        flash('每张紫卡最多 1 个融合词条'); return;
      }
      var cap = capOf(C, row, good, curTier());
      s.row = row;
      s.v = good * dirOf(row) * Math.round((cap || 50) * 0.8 * 10) / 10;
      selArch = null;
      render();
    }
    function setVal(i, raw) {
      var s = state.slots[i];
      if (!s || !s.row) return;
      var x = parseFloat(raw);
      if (!isFinite(x)) return;
      var v = toInner(s.row, x);        /* 派系 ×形式 内部百分数； */
      var mag = Math.abs(v);
      if (rowUnit(s.row) === '%' && mag > VMAX) { v = v < 0 ? -VMAX : VMAX; flash('卡面读数上限 ' + VMAX + '%'); }
      s.v = v;
      selArch = null;
      redraw();
    }
    function delSlot(i) {
      state.slots[i] = null;            /* 固定 4 槽：置空不前移（02 同构） */
      selArch = null;
      render();
    }
    if ($('g-quick')) $('g-quick').addEventListener('click', function (e) {
      var el = e.target;
      while (el && el !== this && !(el.getAttribute && el.getAttribute('data-q'))) el = el.parentNode;
      if (!el || el === this) return;
      var C = cur();
      var avail = {};
      catalog(C).forEach(function (x) { avail[x.row] = x; });
      var sets = {
        crit: { cc: 1, cd: 1 },
        critel: { cc: 1, cd: 1, slash: -1 },
        dmgcrit: { dmg: 1, cc: 1, cd: 1 },
        melee: { dmg: 1, cc: 1, range: 1, cd: -1 },
        element: { heat: 1, cd: 1, dmg: 1, zoom: -1 }
      };
      var s = sets[el.getAttribute('data-q')];
      var pick2 = [];
      for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) {
        var row = rowFor(k, C.cat);
        if (row == null || !avail[row]) continue;
        pick2.push({ row: row, sign: s[k] > 0 ? 1 : -1 });
      }
      if (!pick2.length) { flash('这把武器洗不出这一组'); return; }
      var np = 0, nn = 0;
      pick2.forEach(function (x) { x.sign > 0 ? np++ : nn++; });
      var tier = RR.tierOf(Math.min(MAXP, np), Math.min(MAXN, nn));
      state.slots = [null, null, null, null];
      var pi = 0;
      pick2.slice(0, SLOTS).forEach(function (x) {
        var b = x.sign > 0 ? pi : 3;
        if (x.sign > 0) { while (pi < 3 && state.slots[pi]) pi++; b = pi; if (pi < 3) pi++; }
        if (b < 0 || b > 3) return;
        var cap = capOf(C, x.row, x.sign, tier);
        state.slots[b] = { row: x.row, v: x.sign * Math.round((cap || 50) * 0.8 * 10) / 10 };
      });
      selArch = null;
      render();
    });
    function fmt(x, d) {
      if (x == null || !isFinite(x)) return '—';
      d = d == null ? 1 : d;
      return (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d);
    }
    function sgn(x, d) { return (x >= 0 ? '+' : '') + fmt(x, d); }
    function dmgText(v) {
      if (v == null || !isFinite(v)) return '—';
      var a = Math.abs(v);
      if (langIx() === 2) {
        if (a >= 1e9) return fmt(v / 1e9, 2) + 'B';
        if (a >= 1e6) return fmt(v / 1e6, 2) + 'M';
        if (a >= 1e3) return fmt(v / 1e3, 1) + 'K';
        return fmt(v, a >= 100 ? 0 : 1);
      }
      if (a >= 1e8) return fmt(v / 1e8, 2) + ' 亿';
      if (a >= 1e4) return fmt(v / 1e4, 1) + ' 万';
      return fmt(v, a >= 100 ? 0 : 1);
    }
    function optHtml(list, sel, cur, empty) {
      var out = empty
        ? '<option value="0">— ' + tx('无词条', 'none') + ' —</option>'
        : '', grp = null;
      list.forEach(function (x) {
        if (x.grp && x.grp !== grp) {
          grp = x.grp;
          out += '<option disabled>── ' + tx(x.grp, GRP_EN[x.grp] || x.grp) + ' ──</option>';
        }
        out += '<option value="' + x.row + '"' + (String(x.row) === String(sel) ? ' selected' : '') + '>' +
          esc(zname(x.row)) +
          (cur && x.k && RR.STAT_BY_K[x.k] && RR.STAT_BY_K[x.k].dead
            ? ' · ' + (RR.STAT_BY_K[x.k].panel ? tx('面板另列', 'panel only') : tx('不影响伤害', 'no dps'))
            : '') +
          '</option>';
      });
      return out;
    }
    var GRP_EN = { '近战武器': 'Melee only', '融合词条': 'Elemental fusion' };
    function asmRow(lab, key, list, curId, other, sfx) {
      function opt(x, dis) {
        var nm = anm(x.i);
        var en = (langIx() === 2 || nm === x.n) ? '' : ' · ' + x.n;
        var tail = sfx ? (sfx(x) || '') : '';
        return '<option value="' + x.i + '"' + (x.i === curId ? ' selected' : '') +
          (dis ? ' disabled' : '') + '>' + esc(nm + en + tail) + '</option>';
      }
      var opts = list.map(function (x) { return opt(x, false); }).join('');
      if (other && other.length) {
        opts += '<option disabled>── ' +
          esc(tx('另一手专用 · 不可选', 'other hand only')) + ' ──</option>' +
          other.map(function (x) { return opt(x, true); }).join('');
      }
      return '<div class="g-asmrow"><label>' + esc(lab) + '</label>' +
        '<select data-ak="' + key + '">' + opts + '</select></div>';
    }
    function renderAsm(C) {
      var card = $('g-asmcard');
      if (!card) return;
      var k = C.asm || '';
      card.hidden = !k;
      if (!k) return;
      var h = '';
      if (k === 'lich') {
        var lel = ZKC.lichEl(ASMS.elem4), lix = langIx();
        h += '<div class="g-asmrow"><label>' + esc(tx('额外元素', 'bonus element')) +
          '</label><select data-ak="elem">' + ZKC.LICH_EL.map(function (ek) {
            return '<option value="' + ek + '"' + (ek === lel ? ' selected' : '') + '>' +
              esc((ZK_DMG_CN[ek] || [ek, ek, ek])[lix] || ek) + '</option>';
          }).join('') + '</select></div>';
        $('g-asmsub').textContent = tx('玄骸武器 · 额外元素 ' + ZKC.LICH_PCT + '%',
          'lich weapon · bonus element ' + ZKC.LICH_PCT + '%');
        h += '<p class="g-asmnote">' +
          esc(tx('赤毒 / 信条 / 终幕武器自带一条额外元素，数值固定 ' + ZKC.LICH_PCT +
                 '%（按基础伤害的百分比加进去）。装上去之后就当自带元素处理，和武器原本的元素一起、最后才参加反应。',
                 'Kuva / Tenet / Coda weapons carry one bonus element at a fixed ' + ZKC.LICH_PCT +
                 '%. It goes in as innate damage and reacts last, together with the weapon\'s own elements.')) +
          '</p>';
      } else if (k === 'zaw') {
        h += asmRow('刀刃', 'strike', ASM.zaw.s, ASMS.strike);
        h += asmRow('握柄', 'zgrip', ASM.zaw.g, ASMS.zgrip);
        h += asmRow('扣坠', 'zlink', ASM.zaw.l, ASMS.zlink);
        $('g-asmsub').textContent = '天工造武 · 刀刃 + 握柄 + 扣坠';
      } else {
        var seco = (asmSide() === 's');
        var lds = ldList(asmSide()), ldo = ldList(seco ? 'p' : 's');
        h += asmRow('枪膛', 'chamber', ASM.kit.c, ASMS.chamber, null, function (x) {
          if (seco) return '';
          var c2 = kitCat(x, false);
          return ' · ' + tx(c2, c2 === '霰弹' ? 'shotgun' : 'rifle');
        });
        h += asmRow('握把', 'kgrip', ASM.kit.g.filter(function (x) {
          return (x.t === 'Secondary') === seco;
        }), ASMS.kgrip);
        h += asmRow('装填器', 'kloader', lds, ASMS.kloader, ldo);
        $('g-asmsub').textContent = '组合枪 · 枪膛 + 握把 + 装填器（' +
          (seco ? '副手' : '主手') + ' · 装填器 ' + lds.length + ' 个可选）';
        h += '<p class="g-asmnote">' +
          esc(tx('手性由倾向表条目决定：换手请换选「' + anm(camel(C.zk.en || '')) +
                 (seco ? '（主手）' : '（副手）') + '」那条，装填器会跟着换一整套。',
                 'Hand is fixed by the disposition entry — pick the ' +
                 (seco ? 'Primary' : 'Secondary') + ' row to switch hands.')) + '</p>';
      }
      $('g-asm').innerHTML = h;
      [].slice.call($('g-asm').querySelectorAll('select[data-ak]')).forEach(function (sel) {
        sel.addEventListener('change', function () {
          var ak = this.getAttribute('data-ak');
          if (ak === 'elem') ASMS.elem4 = this.value; else ASMS[ak] = this.value;
          if (ak === 'chamber') {
            var z = (kitRows()[this.value] || {})[asmSide()];
            if (z) { state.zk = z; state.id = 'zk:' + z.en; }
          }
          render();
        });
      });
      $('g-asmhint').innerHTML = asmSummary(C.w).join('<span class="g-asmsep">·</span>');
    }
    window.addEventListener('zkdispchange', function () {
      try { render(); } catch (e) { ZKHTML.warn('框架/app.js:dmg-dispchange', e); }
    });
    function render() {
      var C = cur();
      if (!C.w && !C.zk) return;
      var tier = curTier(), c = counts(), p = C.w ? RR.profile(C.w) : null;
      if (C.w) {
        $('g-wsum').innerHTML =
          '<div class="g-wname">' + esc(wnameOf(C)) + '<span>' + esc(langIx() === 2 ? '' : C.w.n) + '</span></div>' +
          '<div class="g-tags">' +
            '<span class="g-tag k">' + esc(RR.slotNameOf(C.w.s, langIx())) + '</span>' +
            '<span class="g-tag">' + esc(C.w.c || '-') + '</span>' +
            (C.asm ? '<span class="g-tag k">' + tx('自制', 'custom') + '</span>'
                   : '<span class="g-tag">' + tx('段位', 'MR') + ' ' + (C.w.mr || '-') + '</span>') +
            '<span class="g-tag">倾向 ' + n2(ZKC.disp(C.w)) + '</span>' +
            '<span class="g-tag">' + (p.isMelee ? '基础伤害 ' + fmt(p.baseDmg, 0)
              : '弹匣 ' + (C.w.mag || '∞') + ' · 装填 ' + (C.w.rel || '-') + 's') + '</span>' +
            (C.w.fl && C.w.fl.length ? '<span class="g-tag">形态 ' + C.w.fl.length + '</span>' : '') +
          '</div>';
      } else {
        $('g-wsum').innerHTML =
          '<div class="g-wname">' + esc(wnameOf(C)) + '<span>' + esc(C.zk.en) + '</span></div>' +
          '<div class="g-tags">' +
            '<span class="g-tag k">' + esc(C.cat) + '模板</span>' +
            '<span class="g-tag">同伴 / 自制武器</span>' +
            '<span class="g-tag">倾向 ' + n2(ZKC.disp(C.w || C.zk)) + '</span>' +
            '<span class="g-tag warn">无基础面板</span>' +
          '</div>';
      }
      var btns = $('g-tg').children;
      for (var bi = 0; bi < btns.length; bi++) {
        btns[bi].className = btns[bi].getAttribute('data-k') === state.target ? 'on' : '';
      }
      var tk = targetKeyNow();
      var t = RR.TARGET_BY_K[tk] || RR.TARGETS[0];
      $('g-tghint').innerHTML = (tk === '__adv4')
        ? '微调生效中：<b>护甲 ' + t.armor + '</b>（减伤 ' +
          fmt(WE.armorDR(t.armor) * 100, 1) + '%）· 派系 <b>' + RR.targetName(t) +
          '</b>。清空下面的输入框就回到 <b>' + RR.targetNameOf(state.target, langIx()) + '</b>。'
        : '';
      var TIER_SHORT = { '2P': '2+0', '3P': '3+0', '2P1N': '2+1', '3P1N': '3+1' };
      $('g-tier').textContent = tier.ok ? (TIER_SHORT[tier.key] || tier.t.label)
        : (c.np + ' 正 ' + c.nn + ' 负 · 结构不成立');
      var cat = catalog(C);
      var bhtml = '';
      for (var b = 0; b < SLOTS; b++) {
        var s = state.slots[b];
        var rowLab = (b === 3) ? '负面词条' : '正面词条 ' + (b + 1);   /* 02 原样：符号由槽位定 */
        var row = s ? s.row : 0;
        var good = (b === 3) ? -1 : 1;   /* 正面槽=好事(pos 系数)、负面槽=坏事(neg 系数) */
        var used = {};
        var nElem = 0;
        state.slots.forEach(function (x, j) {
          if (j === b || !x || !x.row) return;
          used[x.row] = 1;
          if (j !== 3 && [9, 10, 11, 12].indexOf(x.row) >= 0) nElem++;
        });
        var opts = cat.filter(function (x) {
          if (used[x.row] && x.row !== row) return false;
          if (x.row !== row && (b === 3 ? alwaysPos(x.row, C) : x.row === NEGNLY)) return false;
          if (x.row !== row && nElem >= 2 && [9, 10, 11, 12].indexOf(x.row) >= 0) return false;
          return true;
        });
        var cap = s ? capOf(C, s.row, good, tier) : null;
        var over = cap != null && Math.abs(s.v) > Math.abs(cap) + 0.05;
        bhtml += '<div class="g-box' + (s ? '' : ' empty') + (over ? ' over' : '') + '" data-b="' + b + '">' +
          '<span class="g-ri">' + rowLab + '</span>' +
          '<select class="g-k" data-b="' + b + '" title="' + esc(s ? zname(row) : '') + '">' +
            optHtml(opts, row, true, true) + '</select>' +
          (s
            ? '<div class="g-vwrap"><input type="number" step="0.01" data-b="' + b + '" value="' +
                toCard(row, s.v).toFixed(2) + '"><i>' + rowUnit(row) + '</i></div>'
            : '<div class="g-vwrap g-dis"><input type="number" step="0.01" data-b="' + b + '" value="" disabled placeholder="—"><i></i></div>') +
          '<button type="button" class="g-del" data-b="' + b + '" title="' + tx('移除', 'remove') + '"' +
            (s ? '' : ' disabled') + '>×</button>' +
          (s ? '<div class="g-cmeta" data-b="' + b + '"></div>' : '') +
          '</div>';
      }
      $('g-boxes').innerHTML = bhtml;
      bindBoxes();
      if ($('g-quick')) $('g-quick').innerHTML =
        '<button type="button" class="g-pill" data-q="crit">双暴</button>' +
        '<button type="button" class="g-pill" data-q="dmgcrit">基伤+双暴</button>' +
        '<button type="button" class="g-pill" data-q="critel">双暴+负IPS</button>' +
        (C.melee ? '<button type="button" class="g-pill" data-q="melee">近战 基伤/暴率/范围</button>'
                 : '<button type="button" class="g-pill" data-q="element">元素+暴伤</button>');
      renderAsm(C);
      advHint();
      redraw();
    }
    function bindBoxes() {
      [].slice.call($('g-boxes').querySelectorAll('select.g-k')).forEach(function (sel) {
        sel.addEventListener('change', function () {
          var b = +this.getAttribute('data-b');
          if (this.value === '0') { if (state.slots[b]) delSlot(b); return; }
          if (state.slots[b]) changeK(b, this.value);
          else addAt(b, this.value);
        });
      });
      [].slice.call($('g-boxes').querySelectorAll('input')).forEach(function (inp) {
        inp.addEventListener('input', function () { setVal(+this.getAttribute('data-b'), this.value); });
        inp.addEventListener('change', function () {
          var s = state.slots[+this.getAttribute('data-b')];
          if (s && s.row) this.value = toCard(s.row, s.v).toFixed(2);   /* 被截断时把输入框改回来 */
        });
      });
      [].slice.call($('g-boxes').querySelectorAll('.g-del')).forEach(function (b) {
        b.addEventListener('click', function () { delSlot(+this.getAttribute('data-b')); });
      });
    }
    function fallbackPanel(C) {
      var tier = curTier(), cat = catalog(C), pct = 0;
      var rows = cat.map(function (x) {
        var cp = capOf(C, x.row, 1, tier), cn = capOf(C, x.row, -1, tier);
        return '<tr><td>' + esc(zname(x.row)) + '</td><td class="up">' + fmtCap(x.row, cp) +
          '</td><td class="dn">' + fmtCap(x.row, cn) + '</td></tr>';
      }).join('');
      var sl = RR.SLOT_CN || {};
      $('g-big').innerHTML =
        '<div class="g-lab">引擎里没有这把武器的基础面板</div>' +
        '<div class="g-who"><b>' + esc(wnameOf(C)) + '</b> <i>' + esc(C.cat) + '模板 · 倾向 ' + n2(ZKC.disp(C.w || C.zk)) + '</i></div>' +
        '<div class="g-verdict">' +
          '<div>自制 / 守护 / <b>同伴武器</b>都不在 weapon-db 里（604 把里没有 <b>' +
            esc(C.zk.en) + '</b>），没有基础伤害、暴击、触发就谈不上「这张卡强多少」—— ' +
            '<b>不编一个假面板</b>。</div>' +
          '<div>但紫卡这一侧是完整的：它的词条池、名词、单位、满值上限都按 <b>' + esc(C.cat) +
            '模板</b> × 倾向 <b>' + n2(ZKC.disp(C.w || C.zk)) + '</b> 算，右边那张表就是。</div>' +
        '</div>';
      $('g-archs').innerHTML = '<div class="g-tscroll"><table class="g-t">' +
        '<thead><tr><th>能洗出的词条</th><th>正面满值</th><th>负面最大</th></tr></thead><tbody>' +
        rows + '</tbody></table></div>';
      $('g-archsub').textContent = '这把武器洗得出的词条 · 满值上限';
      $('g-archnote').innerHTML = '满值 = 基准值 × 倾向 ' + n2(ZKC.disp(C.w || C.zk)) +
        ' × 结构系数 × 1.10（浮动上限），与 02 区同一套公式。结构系数随上面选的正负条数变。';
      $('g-panel').innerHTML = '<div class="g-empty">没有基础面板</div>';
      $('g-panellab').textContent = '不可用';
      $('g-rejected').innerHTML = '<div class="g-empty">没有基础面板，流派判定不适用</div>';
    }
    var STANCE_SEL = 'auto', _stSig2 = '', STANCE_OPEN = false, _stW = null;
    function stNm(x) { return langIx() === 2 ? (x.n || x.z) : x.z; }
    function syncStance(w) {
      var card = $('g-stcard'), host = $('g-sttile'), box = $('g-stlistbox'), note = $('g-stnote');
      if (!card || !host) return;
      _stW = w || null;
      var isMelee = !!(w && (w.s === 'm' || w.s === 'e' || w.st));
      var l = (isMelee && RR.stancesFor) ? RR.stancesFor(w) : [];
      var show = l.length > 0;
      if (card.hidden === show) card.hidden = !show;
      if (!show) {
        RR.setStance(null); STANCE_SEL = 'auto'; STANCE_OPEN = false; _stSig2 = '';
        if (host.innerHTML) host.innerHTML = '';
        if (box && box.innerHTML) box.innerHTML = '';
        if (note) note.textContent = '';
        return;
      }
      var cid = STANCE_SEL;
      if (cid !== 'auto' && cid !== 'none' && !l.some(function (x) { return x.i === cid; })) { cid = 'auto'; STANCE_SEL = 'auto'; }
      var cur = (cid === 'auto') ? (l.length ? l[0] : null)
        : (cid === 'none') ? null
        : l.filter(function (x) { return x.i === cid; })[0] || null;
      var sPol = (RR.stanceSlotPol) ? RR.stanceSlotPol() : 'r';
      var sBonus = (RR.stanceCapBonusOf) ? RR.stanceCapBonusOf(cur, sPol) : 0;
      var sig = (w.i || '') + '|' + l.length + '|' + langIx() + '|' + cid + '|' + STANCE_OPEN + '|' + sPol + '|' + sBonus;
      if (sig !== _stSig2) {
        _stSig2 = sig;
        var h = '<div class="buff-slot st-slot" id="g-stslot" title="点这里换架势">'
          + '<div class="mod-title"><span class="mod-polarity">架势</span>' + esc(cur ? stNm(cur) : '不装') + '</div>'
          + '<div class="mod-detail"><div class="mod-stat">'
          + (cur
              ? '<div class="mod-prop">平A 每招 ×' + fmt(cur.neutral.per, 2) + '</div>'
                + '<div class="mod-prop">连段 ' + fmt(cur.neutral.total, 1) + ' 倍 / ' + fmt(cur.neutral.secs, 2) + ' 秒</div>'
                + '<div class="mod-prop">容量上限 <b>+' + sBonus + '</b> · '
                  + (sBonus >= 10 ? '极性相符 ×2' : '极性不符 −1') + '</div>'
              : '<div class="mod-prop">未装架势 · 平A 按 ×1.00 · 容量上限 +0</div>')
          + '</div></div>'
          + (cur ? '<div class="mod-action"><span class="slotpol" id="g-stslotpol" title="架式槽极化：点一下换一种（满级架式 +5，槽极性相符 ×2，不符 −1）">'
              + esc(mbPolTxt(sPol)) + '</span>'
              + '<button class="mod-slot-remove" id="g-stclr" title="卸下架势">×</button></div>' : '')
          + '</div>';
        host.innerHTML = h;
        var lo = '<div class="stlist"' + (STANCE_OPEN ? '' : ' hidden') + '>';
        lo += '<div class="st-o' + (STANCE_SEL === 'auto' ? ' on' : '') + '" data-st="auto">'
            + '<span class="zn">自动（这一类最强）</span>'
            + '<span class="mv">' + (l.length ? '×' + fmt(l[0].neutral.per, 2) : '—') + '</span></div>';
        lo += '<div class="st-o' + (STANCE_SEL === 'none' ? ' on' : '') + '" data-st="none">'
            + '<span class="zn">不装架势</span><span class="mv">×1.00</span></div>';
        l.forEach(function (x) {
          lo += '<div class="st-o' + ((STANCE_SEL !== 'auto' && x.i === cid) ? ' on' : '') + '" data-st="' + esc(x.i) + '">'
              + '<span class="zn">' + esc(stNm(x)) + '</span>'
              + '<span class="sub">' + esc(x.cat || '') + '</span>'
              + '<span class="mv">×' + fmt(x.neutral.per, 2) + ' · ' + fmt(x.neutral.rate, 2) + '/s</span></div>';
        });
        lo += '</div>';
        if (box) box.innerHTML = lo;
      }
      var id = STANCE_SEL;
      if (id === 'auto') id = l.length ? l[0].i : null;
      if (id === 'none') id = null;
      RR.setStance(id);
      if (note) {
        var si = RR.stanceInfo();
        note.innerHTML = si
          ? '连段 <b>' + si.total + '</b> 倍 / <b>' + si.secs + '</b> 秒 · 每招平均 <b>×' +
            si.per.toFixed(2) + '</b> · 滑砍 <b>×' + si.slidePer.toFixed(2) + '</b>' +
            (si.hasSlide ? '' : '（源数据无滑砍段，按平A 计）') +
            '　震地与重击不吃架势倍率。'
          : '没装架势 → 平A 按 ×1.00。';
      }
    }
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      if (t.closest('#g-stslotpol')) {
        var porder = ['r', '-', 'd', '=', 'w', 'o'];
        var cp = (RR.stanceSlotPol) ? RR.stanceSlotPol() : 'r';
        var np = porder[(porder.indexOf(cp) + 1) % porder.length];
        if (RR.setStanceSlotPol) RR.setStanceSlotPol(np);
        _stSig2 = '';
        syncStance(_stW); mbCapPaint();
        return;
      }
      if (t.closest('#g-stclr')) { STANCE_SEL = 'none'; STANCE_OPEN = false; _stSig2 = ''; redraw(); return; }
      if (t.closest('#g-stslot')) { STANCE_OPEN = !STANCE_OPEN; _stSig2 = ''; syncStance(_stW); return; }
      var o = t.closest('#g-stlistbox .st-o');
      if (o) { STANCE_SEL = o.getAttribute('data-st') || 'auto'; STANCE_OPEN = false; _stSig2 = ''; redraw(); return; }
      if (STANCE_OPEN && !t.closest('#g-stlistbox')) { STANCE_OPEN = false; _stSig2 = ''; syncStance(_stW); }
    });
    var MB_NSLOT = 8;
    var MB_RIVEN_SLOT = 7;
    var MB_RIVEN_DRAIN = 18;
    var MB_POL_ORDER = ['', 'r', '-', 'd', '=', 'w', 'o'];
var POL_INFO = window.RULES.ZK_POL_INFO;
    var MB_POL_CN = { '': '无极性', r: '马杜莱', '-': '纳拉蒙', d: '瓦萨林', '=': '泽努里', w: '乌奈鲁', o: '万用' };
    var MB_POL_EN = { '': 'No Polarity', r: 'Madurai', '-': 'Naramon', d: 'Vazarin', '=': 'Zenurik',
                      w: 'Unairu', o: 'Aura' };
    var MB = {
      slots: [], pols: [],
      layers: {}, arcLayers: {},
      rivenPos: 7,
      rivenOff: false,
      rivenPol: '',
      exi: null, exiPol: '',
      arcs: {},
      pick: null, q: '', sig: '', archUser: '', best: '',
      tab: 'fast',
      autoNote: '',
    };
    var MB_MODS = window.ZKMODS || [];
    var MB_ARCS = window.ZKARCS || [];
    var MB_SETS = window.ZKSETS || [];
    var MB_BY = {}, MB_ARC_BY = {}, MB_SET_BY = {};
    MB_MODS.forEach(function (m) { MB_BY[m.i] = m; });
    MB_ARCS.forEach(function (a) { MB_ARC_BY[a.i] = a; });
    MB_SETS.forEach(function (s) { MB_SET_BY[s.i] = s; });
    for (var _mb0 = 0; _mb0 < MB_NSLOT; _mb0++) { MB.slots.push(null); MB.pols.push(''); }
    var MB_FACOF = {
      smite_corpus: 'corpus', smite_grineer: 'grineer', smite_infested: 'infested',
      smite_corrupted: 'orokin', smite_the_murmur: 'murmur', smite_sentient: 'sentient'
    };
    function mbName(m) { return langIx() === 2 ? (m.n || m.z || '') : (m.z || m.n || ''); }
    function mbDesc(m) { return langIx() === 2 ? (m.de || m.dz || '') : (m.dz || m.de || ''); }
    function mbPools(w) {
      if (!w) return null;
      var s = w.s, c = w.c || '';
      if (s === 'p') {
        if (c === 'shotgun') return ['primary', 'shotgun'];
        if (c === 'sniper') return ['primary', 'rifle', 'sniper'];
        if (c === 'bow' || c === 'crossbow') return ['primary', 'rifle', 'bow'];
        return ['primary', 'rifle', 'assault_rifle'];
      }
      if (s === 's') return ['pistol'];
      if (s === 'm' || s === 'e') return (c && c !== 'melee') ? ['melee', c] : ['melee'];
      if (s === 'a') return ['archgun'];
      return null;
    }
    function mbOK(m, isExi) {
      var w = cur().w;
      return ZKMB.legal(m, mbPools(w), (w && w.i) || '', isExi);
    }
    function mbCost(m) { return (+m.d || 0) + (+m.f || 0); }
    function mbKey(m, k) { return (m && m.s === 'm' && k === 'frate') ? 'aspeed' : k; }
    var MB_META_K = { frate: 1, aspeed: 1, mag: 1, rel: 1, windup: 1, range: 1, punch: 1, aradius: 1 };
    function mbVal(kv) { return +kv[1] * (kv.length > 2 ? (+kv[2] || 1) : 1); }
    function mbFacOK(m) {
      var f = (m.st === 'sacrifice') ? 'sentient' : MB_FACOF[m.fam];
      if (!f) return true;
      var t = RR.TARGET_BY_K[targetKeyNow()];
      return !!t && t.faction === f;
    }
    function mbCountSets(ids) {
      var c = {}, seen = {};
      (ids || []).forEach(function (id) {
        var m = MB_BY[id];
        if (!m || !m.st || seen[id]) return;
        seen[id] = 1;
        c[m.st] = Math.min(6, (c[m.st] || 0) + 1);
      });
      return c;
    }
    function mbSetBonus(cnt) {
      var o = {};
      MB_SETS.forEach(function (s) {
        var n = (cnt && cnt[s.i]) || 0;
        if (!n) return;
        var per = Math.min((+s.per || 0) * 6, (+s.per || 0) * n);
        if (s.k === 'crit_chance_per_combo') o.br = (o.br || 0) + per;
        else if (s.k === 'crit_tier_upgrade_chance') o.tu = (o.tu || 0) + per;
      });
      return o;
    }
    function mbSelfMul(m, cnt) {
      var s = MB_SET_BY[m.st];
      if (!s || s.k !== 'enhances_own_mods') return 1;
      var n = (cnt && cnt[m.st]) || 0;
      return n < 2 ? 1 : 1 + (+s.per || 0) / 100 * (n - 1);
    }
    function mbModIds() {
      var a = MB.slots.filter(Boolean);
      if (MB.exi) a.push(MB.exi);
      return a;
    }
    function mbArcIds() {
      var a = [], r = mbRoles();
      r.forEach(function (role) { if (MB.arcs[role]) a.push(MB.arcs[role]); });
      return a;
    }
    function mbIds() { return mbModIds().concat(mbArcIds()); }
    function mbValOf(kv, layers) {
      var st = kv.length > 2 ? (+kv[2] || 1) : 1;
      if (mbIsStack(kv)) return +kv[1] * Math.max(0, Math.min(layers == null ? st : layers, st));
      return +kv[1] * st;
    }
    function mbBucketOf(ids) {
      var scnt = mbCountSets(ids), o = {}, lay = mbLayerMap();
      (ids || []).forEach(function (id) {
        var m = MB_BY[id];
        if (!m) return;
        var smul = mbSelfMul(m, scnt);
        (m.p || []).forEach(function (kv) {
          var k = mbKey(m, kv[0]);
          if (k === 'fac' && !mbFacOK(m)) return;
          o[k] = (o[k] || 0) + mbValOf(kv, lay[id]) * smul;
        });
      });
      var sb = mbSetBonus(scnt);
      for (var k2 in sb) if (Object.prototype.hasOwnProperty.call(sb, k2)) o[k2] = (o[k2] || 0) + sb[k2];
      return o;
    }
    function mbArcBucket(arcIds, o) {
      var lay = mbLayerMap();
      (arcIds || []).forEach(function (id) {
        var a = MB_ARC_BY[id];
        (a && a.p || []).forEach(function (kv) {
          var k3 = mbKey(a, kv[0]);
          if (k3 === 'fac' && !mbFacOK(a)) return;
          o[k3] = (o[k3] || 0) + mbValOf(kv, lay[id]);
        });
      });
      return o;
    }
    function mbAggregate() {
      var ids = mbModIds();
      if (!ids.length) return null;
      var o = mbBucketOf(ids);
      mbArcBucket(mbArcIds(), o);
      var ex = extraNow();
      if (ex) for (var k4 in ex) if (Object.prototype.hasOwnProperty.call(ex, k4)) o[k4] = (o[k4] || 0) + ex[k4];
      return o;
    }
    function mbElemOrderOf(ids) {
      var order = [], EK = { heat: 1, cold: 1, electric: 1, toxin: 1 };
      (ids || []).forEach(function (id) {
        var m = id && MB_BY[id];
        (m && m.p || []).forEach(function (kv) {
          var k = mbKey(m, kv[0]);
          if (EK[k]) order.push(k);
        });
      });
      return order;
    }
    function mbElemOrder() { return mbElemOrderOf(mbModIds()); }
    function mbPolTxt(p) {
      if (langIx() === 2) return MB_POL_EN[p] || 'No Polarity';
      return MB_POL_CN[p] || '无极性';
    }
    function mbPolGlyph(p) { return p || '·'; }
    function mbCostOf(m, pol) {
      var c = mbCost(m);
      if (!pol) return c;
      return (pol === 'o' || pol === m.y) ? Math.round(c / 2) : Math.round(c * 1.25);
    }
    function mbHasRiven() {
      for (var i = 0; i < state.slots.length; i++) {
        var s = state.slots[i];
        if (s && s.row) return true;
      }
      return false;
    }
    function mbRivenCost() {
      var p = MB.rivenPol;
      if (!p) return MB_RIVEN_DRAIN;
      return (p === 'o' || p === 'r') ? Math.round(MB_RIVEN_DRAIN / 2) : Math.round(MB_RIVEN_DRAIN * 1.25);
    }
    function mbCap() {
      var t = 0;
      for (var i = 0; i < MB.slots.length; i++) {
        var m = MB.slots[i] ? MB_BY[MB.slots[i]] : null;
        if (m) t += mbCostOf(m, MB.pols[i]);
      }
      if (mbHasRiven()) t += mbRivenCost();
      if (MB.exi && MB_BY[MB.exi]) t += mbCostOf(MB_BY[MB.exi], MB.exiPol);
      return t;
    }
    function mbRoles() {
      var w = cur().w;
      if (!w) return [];
      var i = String(w.i || '');
      if (i.indexOf('asm:kit') === 0) return ['次要武器', '组合枪'];
      if (i.indexOf('asm:zaw') === 0) return ['近战', '天工造武'];
      if (w.s === 'a') return ['主要武器', '次要武器'];
      if (w.s === 'm' || w.s === 'e') return ['近战'];
      if (w.s === 's') return ['次要武器'];
      if (w.s === 'p') return ['主要武器'];
      return [];
    }
    function mbWeaponClass() { return ZKMB.wclass(cur().w); }
    function mbArcList(role) {
      var wc = mbWeaponClass();
      return MB_ARCS.filter(function (a) {
        if (!(a.t === role || a.t === '任意武器')) return false;
        if (!ZKMB.arcLegal(a, cur().w)) return false;
        return true;
      });
    }
    function mbPolHTML(key, pol) {
      return '<span class="g-mbpol' + (pol ? ' on' : '') + '" data-mbp="' + key +
        '" title="本槽极化：' + esc(mbPolTxt(pol)) + '（点一下换一种，容量按它重算）">' +
        esc(mbPolGlyph(pol)) + '</span>';
    }
    function mbPropsOf(m) {
      return (m.p || []).map(function (kv) {
        return RR.STAT_BY_K[kv[0]] ? RR.statNameOf(kv[0], langIx()) + ' ' + mbVal(kv) : '';
      }).filter(Boolean).slice(0, 2).join(' · ');
    }
    var MB_RAR = { n: 1, c: 1, r: 1, g: 1, l: 1, x: 1 };
    function mbRar(m) { return (m && m.r && MB_RAR[m.r]) ? m.r : 'n'; }
    function mbIsStack(kv) { return kv.length > 2 && (+kv[2] || 1) > 1; }
    function mbMaxLayers(m) {
      var mx = 0;
      (m.p || []).forEach(function (kv) { if (kv.length > 2) mx = Math.max(mx, +kv[2] || 1); });
      (m.bg || []).forEach(function (b) { if (b.k === 'sb') mx = Math.max(mx, +b.st || 1); });
      return mx;
    }
    function mbCurLayers(i) {
      var m = MB.slots[i] ? MB_BY[MB.slots[i]] : null;
      if (!m) return 0;
      if (MB.layers[i] != null) return MB.layers[i];
      var mx = mbMaxLayers(m);
      return mx > 1 ? mx : 0;
    }
    function mbCurLayersArc(role) {
      var a = MB.arcs[role] ? MB_ARC_BY[MB.arcs[role]] : null;
      if (!a) return 0;
      if (MB.arcLayers[role] != null) return MB.arcLayers[role];
      var mx = mbMaxLayers(a);
      return mx > 1 ? mx : 0;
    }
    function mbLayerMap() {
      var o = {};
      for (var i = 0; i < MB.slots.length; i++) {
        var id = MB.slots[i];
        if (id) o[id] = mbCurLayers(i);
      }
      for (var r in MB.arcs) if (Object.prototype.hasOwnProperty.call(MB.arcs, r)) if (MB.arcs[r]) o[MB.arcs[r]] = mbCurLayersArc(r);
      return o;
    }
    var MB_TRIG_CN = { headshot: '弱点命中', headshot_kill: '弱点击杀', weakpoint_hit: '弱点命中', kill: '击杀',
      melee_kill: '近战击杀', hit: '命中', reload_complete: '换弹完成', reload_from_empty: '空仓换弹', equip: '装备时',
      status_applied: '异况生效', toxin_status: '毒素异况', cold_status: '冰冻异况', heat_status: '火焰异况',
      electricity_status: '电击异况', swap_consume_combo: '切枪吃连击', ability_cast: '施放技能', direct_hit: '直接命中',
      crit: '暴击', firing: '开火', full_burst: '点射打完', consecutive_headshot: '连续弱点命中',
      bullet_jump_land: '飞跃落地', punch_through: '穿透命中', per_tendril: '每根触手' };
    var MB_COND_CN = { aiming: '瞄准中', airborne: '空中', invisible: '隐身中', 'fire_rate_below_2.5': '射速低于2.5' };
    var MB_TRIG_EN = { headshot: 'Weakpoint Hit', headshot_kill: 'Weakpoint Kill', weakpoint_hit: 'Weakpoint Hit',
      kill: 'Kill', melee_kill: 'Melee Kill', hit: 'Hit', reload_complete: 'Reload Complete',
      reload_from_empty: 'Reload from Empty', equip: 'On Equip', status_applied: 'Status Applied',
      toxin_status: 'Toxin Status', cold_status: 'Cold Status', heat_status: 'Heat Status',
      electricity_status: 'Electricity Status', swap_consume_combo: 'Swap Consumes Combo',
      ability_cast: 'Ability Cast', direct_hit: 'Direct Hit', crit: 'Critical Hit', firing: 'Firing',
      full_burst: 'Full Burst', consecutive_headshot: 'Consecutive Weakpoint Hits',
      bullet_jump_land: 'Bullet Jump Landing', punch_through: 'Punch Through', per_tendril: 'Per Tendril' };
    var MB_COND_EN = { aiming: 'Aiming', airborne: 'Airborne', invisible: 'Invisible',
      'fire_rate_below_2.5': 'Fire Rate Below 2.5' };
    function mbCondLabel(m) {
      var bg = (m && m.bg) || [], parts = [], seen = {};
      bg.forEach(function (b) {
        if (b.k === 'asm') return;
        var en = langIx() === 2;
        var t = (en ? (MB_TRIG_EN[b.tr] || b.tr) : (MB_TRIG_CN[b.tr] || b.tr)) || '',
            c = en ? (MB_COND_EN[b.cd] || '') : (MB_COND_CN[b.cd] || '');
        if (b.k === 'mech' && !t && !c) return;
        var s = b.k === 'sb' ? (en ? 'Stacks' : '叠层') : (en ? 'Condition' : '条件');
        if (t) s += '·' + t;
        if (c) s += '·' + c;
        if (b.st > 1) s += '·' + (en ? ('Cap ' + b.st + ' stacks') : ('上限' + b.st + '层'));
        if (b.du) s += '·' + (+b.du).toFixed(b.du < 10 ? 1 : 0) + 's';
        if (seen[s]) return;
        seen[s] = 1;
        parts.push(s);
      });
      return parts.join('；');
    }
    var MB_MKEY = ZKC.statMap('short');
    var MB_MKEY_EN = ZKC.statMap('en');
    var MB_MUNIT = { punch: 'm', range: 'm', comboDur: 's', combo: '' };
    function mbUnit(k) { return Object.prototype.hasOwnProperty.call(MB_MUNIT, k) ? MB_MUNIT[k] : '%'; }
    function mbStatName(k) {
      if (langIx() === 2) {
        if (MB_MKEY_EN[k]) return MB_MKEY_EN[k];
      } else if (MB_MKEY[k]) return MB_MKEY[k];
      return RR.statNameOf(k, langIx());
    }
    function mbPropLine(m) {
      return (m.p || []).map(function (kv) {
        var k = mbKey(m, kv[0]), v = +kv[1], st = kv.length > 2 ? (+kv[2] || 1) : 1;
        var u = mbUnit(k), dg = (u === '' || Math.abs(v) >= 10) ? 0 : 1;
        var s = mbStatName(k) + ' ' + (v >= 0 ? '+' : '−') + fmt(Math.abs(v), dg) + u;
        if (mbIsStack(kv)) s += '/层 ×' + st + ' 层';
        else if (st > 1) s += ' ×' + st + ' 层';
        return s;
      });
    }
    function mbPolTextHTML(key, pol) {
      return '<span class="slotpol" data-mbp="' + key + '" title="切换极化">' + esc(mbPolTxt(pol)) + '</span>';
    }
    function mbLayerBox(m, i) {
      var mx = mbMaxLayers(m);
      if (mx <= 1) return '';
      var cur = mbCurLayers(i);
      return '<span class="layerbox" data-layer="' + i + '" title="叠层型 · 默认吃满层数（可下调，步进器 − 到 0 即不计入）">' +
        '<button type="button" class="lbtn" data-ls="' + i + '" data-d="-1">−</button>' +
        '<b class="lcur">' + cur + '</b><span class="lmax">/' + mx + '层</span>' +
        '<button type="button" class="lbtn" data-ls="' + i + '" data-d="1">+</button></span>';
    }
    function mbArcLayerBox(a, role) {
      var mx = mbMaxLayers(a);
      if (mx <= 1) return '';
      var cur = mbCurLayersArc(role);
      return '<span class="layerbox" data-alayer="' + esc(role) + '" title="叠层型赋能 · 默认吃满层数（可下调，− 到 0 即不计入）">' +
        '<button type="button" class="lbtn" data-alr="' + esc(role) + '" data-d="-1">−</button>' +
        '<b class="lcur">' + cur + '</b><span class="lmax">/' + mx + '层</span>' +
        '<button type="button" class="lbtn" data-alr="' + esc(role) + '" data-d="1">+</button></span>';
    }
    function mbRivenHTML(at) {
      var has = mbHasRiven(), p = MB.rivenPol, cost = mbRivenCost();
      var pos = (at == null) ? MB.rivenPos : at;
      var pc = p ? ((p === 'o' || p === 'r') ? ' np' : ' wp') : '';
      return ZKMB.rivenSlot({
        no: pos + 1, polGlyph: mbPolGlyph('r'), polText: mbPolTxt(p),
        cost: cost, polCls: pc, name: '紫卡 · 本卡',
        sub: has ? '等级 8 · 占 1 个 MOD 槽' : '左栏还没填词条',
        empty: !has, polKey: 'R', removable: true,
        title: '第 8 格 · 紫卡：左栏那 4 行词条就是它（固定占 1 个 MOD 槽）'
      });
    }
    function mbSlotHTML(i) {
      if (i === MB.rivenPos) return mbRivenHTML(i);
      var k = (MB.rivenPos >= 0 && i > MB.rivenPos) ? i - 1 : i;
      var id = MB.slots[k], m = id ? MB_BY[id] : null;
      var pol = MB.pols[k] || '';
      var no = '<span class="mbsno">' + (i + 1) + '</span>';
      if (!m) {
        return ZKMB.modSlot({ empty: true, no: i + 1, polKey: k, polText: mbPolTxt(pol) });
      }
      var ok = mbOK(m, false), cost = mbCostOf(m, pol);
      var pc = pol ? ((pol === 'o' || pol === m.y) ? ' np' : ' wp') : '';
      var mx = mbMaxLayers(m);
      return ZKMB.modSlot({
        no: i + 1, cls: mbRar(m), name: mbName(m), polGlyph: mbPolGlyph(m.y),
        polText: mbPolTxt(pol), cost: cost, polCls: pc, props: mbPropLine(m),
        cond: mbCondLabel(m), desc: mbDesc(m),
        layers: mx > 1 ? { cur: mbCurLayers(k), max: mx } : null,
        off: !ok, polKey: k,
        title: '第 ' + (i + 1) + ' 格 · ' + mbDesc(m)
      });
    }
    function mbRender() {
      var card = $('g-mbcard');
      if (!card) return;
      card.hidden = false;
      var w = cur().w, roles = mbRoles();
      for (var rr in MB.arcs) if (Object.prototype.hasOwnProperty.call(MB.arcs, rr)) if (roles.indexOf(rr) < 0) delete MB.arcs[rr];
      var arcSig = roles.map(function (r) { return r + ':' + (MB.arcs[r] || ''); }).join(',');
      var sig = [w ? (w.i || w.n) : '', MB.slots.join(','), MB.pols.join(''),
                 JSON.stringify(MB.layers), JSON.stringify(MB.arcLayers),
                 MB.rivenPol || '', mbHasRiven() ? '1' : '0',
                 MB.exi || '', MB.exiPol || '', arcSig,
                 MB.pick == null ? '' : (MB.pick.arc || (MB.pick.exi ? 'e' : 's' + MB.pick.i)),
                 MB.q].join('|');
      if (sig === MB.sig) { mbCapPaint(); return; }
      MB.sig = sig;
      if (mbHasRiven()) { if (MB.rivenPos < 0 && !MB.rivenOff) MB.rivenPos = MB_RIVEN_SLOT; }
      else { MB.rivenPos = -1; MB.rivenOff = false; }
      var h = '';
      for (var i = 0; i < MB_NSLOT; i++) h += mbSlotHTML(i);
      $('g-mbslots').innerHTML = h;
      var em = MB.exi ? MB_BY[MB.exi] : null;
      var eCls = (em && MB.exiPol) ? ((MB.exiPol === 'o' || MB.exiPol === em.y) ? ' np' : ' wp') : '';
      $('g-mbexi').innerHTML = em
        ? ZKMB.exilSlot({ name: mbName(em), polGlyph: mbPolGlyph(em.y), polText: mbPolTxt(MB.exiPol),
                          cost: mbCostOf(em, MB.exiPol), polCls: eCls, props: mbPropLine(em),
                          cond: mbCondLabel(em), title: '特殊功能槽：只收 Exilus 卡' })
        : ZKMB.exilSlot({ empty: true, polText: mbPolTxt(MB.exiPol) });
      var ah = '';
      roles.forEach(function (role) {
        var id = MB.arcs[role], a = id ? MB_ARC_BY[id] : null;
        var amx = a ? mbMaxLayers(a) : 0;
        ah += ZKMB.buffSlot({
          role: role, name: a ? mbName(a) : '', props: a ? mbPropLine(a) : [],
          desc: a ? mbDesc(a) : '', empty: !a,
          layers: (a && amx > 1) ? { cur: mbCurLayersArc(role), max: amx } : null,
          title: a ? mbDesc(a) : ('赋能 · 生效目标 ' + role)
        });
      });
      $('g-mbarc').innerHTML = ah;
      var alab = $('g-mbarclab');
      if (alab) alab.textContent = roles.length ? ('生效目标：' + roles.join(' + ')) : '先选武器';
      mbPickRender();
      mbCapPaint();
    }
    function capMaxOf() { return 60 + ((RR.stanceCapBonus) ? RR.stanceCapBonus() : 0); }
    function mbCapPaint() {
      var el = $('g-mblab');
      if (!el) return;
      var n = mbIds().length + (mbHasRiven() ? 1 : 0), cap = mbCap();
      var cm = capMaxOf();
      el.innerHTML = '已装 <b>' + n + '</b> 张 · 容量 <b class="' +
        (cap > cm ? 'neg' : 'pos') + '">' + cap + '</b> / ' + cm +
        '<span class="g-mbcaphint">（按每槽极化实算' + (cm > 60 ? '，含满级架式 +' + (cm - 60) : '') + '）</span>' +
        (cap > cm ? '<span class="g-mbover">超了</span>' : '');
      var hint = $('g-mbhint');
      if (!hint) return;
      if (!cur().w) {
        hint.innerHTML = '先选一把武器 —— 配卡池按武器类别分（步枪 / 手枪 / 霰弹 / 曲翼 / 近战 / 组合枪 / Zaw），' +
          '没选之前这些格子是空的。';
      } else if (!mbModIds().length) {
        hint.innerHTML = '一张不装 = 按流派标准配卡算（上面「流派对照」里的那套）。装了就<b>替换</b>整套，' +
          '不再叠加流派卡 —— 否则同一张加伤卡会被算两遍。';
      } else {
        hint.innerHTML = '这 <b>' + n + '</b> 张替换了流派标准配卡，与 05 版块配卡板同一条口径。' +
          '叠层型 MOD 按<b>满层</b>算（那边有层数步进器）。容量按每槽极化实算：无极性原价、' +
          '同极性或万用 ÷2、错极性 ×1.25。近战<b>满级架式</b>再加容量上限：槽极性相符 +10、不符 +4' +
          '（架势卡上点极性可换槽位极化）。<b>紫卡固定占第 8 格</b>（满级 18 点）——' +
          '标准配卡 8 张装不下，按「丢掉最不疼」少装 1 张。' +
          (MB.autoNote ? '<br><b>' + MB.autoNote + '</b>' : '');
      }
    }
    function mbSlotNoOf(k) {
      var rp = MB.rivenPos;
      var disp = (rp >= 0 && k >= rp) ? k + 1 : k;
      return disp + 1;
    }
    function mbUsedOf(o) {
      if (MB.pick && MB.pick.exi) return (MB.exi === o.i) ? 9 : 0;
      var u = 0;
      for (var k = 0; k < MB.slots.length; k++) {
        if (MB.pick && MB.pick.i != null && k === MB.pick.i) continue;
        if (MB.slots[k] === o.i) u = mbSlotNoOf(k);
      }
      return u;
    }
    function mbWeaponClassCN() {
      var w = cur().w;
      if (!w) return '';
      var i = String(w.i || '');
      if (i.indexOf('asm:zaw') === 0) return 'Zaw（自制近战）';
      if (i.indexOf('asm:kit') === 0) return '组合枪';
      if (w.s === 'a') return '曲翼';
      if (w.s === 'm' || w.s === 'e') return '近战';
      if (w.s === 's') return '手枪';
      if (w.s === 'p') {
        if (w.c === 'shotgun') return '霰弹';
        if (w.c === 'sniper') return '狙击枪';
        if (w.c === 'bow' || w.c === 'crossbow') return '弓';
        return '步枪';
      }
      return '';
    }
    function mbFastKind() {
      var w = cur().w;
      if (!w) return '';
      var s = w.s, c = w.c || '';
      if (s === 'a') return 'ArchGun';
      if (s === 'm' || s === 'e') return 'Melee';
      if (s === 's') return 'Secondary';
      if (s === 'p' && c === 'shotgun') return 'Shotgun';
      return 'Rifle';
    }
    function mbArcClassLabel(a) {
      var bg = (a && a.bg) || [];
      if (bg.some(function (b) { return b.k === 'asm'; })) return '实装 · 条件按满足计';
      if (bg.length) return '实装 · 满层（触发型乐观）';
      return '实装 · 常驻满层';
    }
    function mbRivenRows() {
      var has = mbHasRiven(), pos = MB.rivenPos;
      var h = '<div class="mrow rrow' + (pos >= 0 ? ' on' : '') + '" data-mbriven="keep">'
           + '<span class="pol">紫</span>'
           + '<span class="nm">紫卡 · 本卡</span>'
           + (pos >= 0 ? '<span class="tg">已在第 ' + (pos + 1) + ' 格</span>'
                      : '<span class="tg">不占格</span>')
           + '<span class="mde">' + (has
               ? '左栏那 4 行词条就是它（等级 8 · 满级占 18 点）'
               : '左栏还没填词条 —— 填了才有紫卡') + '</span>'
           + '</div>';
      if (pos >= 0) {
        h += '<div class="mrow rrow" data-mbriven="off"><span class="pol">×</span>'
           + '<span class="nm">卸下紫卡（这一格空出来装普通 MOD）</span></div>';
      } else {
        h += '<div class="mrow rrow" data-mbriven="on"><span class="pol">+</span>'
           + '<span class="nm">装上紫卡（占第 ' + (MB_RIVEN_SLOT + 1) + ' 格）</span></div>';
      }
      return h;
    }
    function mbGainRanked() {
      var E = window.__MB05;
      if (!E || !E.afOut || !cur().w) return null;
      var have = MB.slots.filter(Boolean);
      var baseV = null;
      try {
        baseV = E.afOut(cur().w, riv(), have, null, MB.bestForm || null, null, mbArchNow(), true);
      } catch (e) { baseV = null; }
      if (baseV == null) return null;
      var out = [], wid = (cur().w && cur().w.i) || '';
      MB_MODS.forEach(function (m) {
        if (!mbOK(m, !!MB.pick.exi)) return;
        if (!m.p || !m.p.length) return;
        if (m.rw || m.ew) return;
        if (m.ex && m.ex.length && m.ex.indexOf(wid) < 0) return;
        if (have.indexOf(m.i) >= 0) return;
        if (mbConflict(m.i, have)) return;
        var v = null;
        try {
          v = E.afOut(cur().w, riv(), have.concat([m.i]), null, MB.bestForm || null, null, mbArchNow(), true);
        } catch (e2) { v = null; }
        if (v == null || !baseV) return;
        out.push({ m: m, g: (v / baseV - 1) * 100 });
      });
      out.sort(function (a, b) { return b.g - a.g; });
      return out;
    }
    function mbPickerCtx() {
      var isArc = !!MB.pick.arc, isExi = !!MB.pick.exi;
      return {
        tab: MB.tab, q: MB.q, isArc: isArc, isExi: isExi,
        mods: function () { return MB_MODS; },
        arcs: function () { return MB.pick.arc ? mbArcList(MB.pick.arc) : []; },
        modOK: function (m) { return mbOK(m, isExi); },
        pools: function () { return mbPools(cur().w); },
        used: mbUsedOf,
        setOf: function (o) { return (o && o.st && MB_SET_BY[o.st]) ? MB_SET_BY[o.st] : null; },
        setCount: function (id) { return mbCountSets(mbModIds())[id] || 0; },
        arcLabel: mbArcClassLabel,
        arcCore: function () { return ''; },
        gainList: mbGainRanked,
        gainNote: function () { return ''; },
        gainEmpty: '算不出收益：先选好武器（收益排序走 05 版块那套引擎，没挂上桥时用不了）。',
        rivenRows: mbRivenRows,
        fastKind: mbFastKind,
        weaponClassCN: mbWeaponClassCN
      };
    }
    function mbFastCtx() {
      return {
        fastKind: mbFastKind,
        modOK: function (m) { return mbOK(m, !!MB.pick.exi); },
        installed: function () { return MB.slots.filter(Boolean).concat(MB.exi ? [MB.exi] : []); },
        conflict: function (m, have) { return mbConflict(m.i, have); },
        installMod: function (m) {
          for (var j = 0; j < MB.slots.length; j++) {
            if (MB.slots[j]) continue;
            MB.slots[j] = m.i; MB.pols[j] = m.y || '';
            MB.layers[j] = null;
            return true;
          }
          return false;
        }
      };
    }
    function mbFastInstall(key) {
      var r = ZKMB.fastInstall(mbFastCtx(), key);
      MB.sig = ''; redraw();
      var msg = '快速选择「' + (ZKMB.FAST_CN[key] || key) + '」：装入 ' + r.put.length + ' 张'
              + (r.put.length ? '（' + r.put.join('、') + '）' : '');
      if (r.skip.length) msg += '；跳过 ' + r.skip.length + ' 张（未建模 / 冲突 / 无空槽）：' + r.skip.join('、');
      if (r.dup) msg += '；' + r.dup + ' 张已装过';
      flash(msg);
    }
    function mbPickRender() {
      var box = $('g-mbpick');
      if (!box) return;
      if (MB.pick == null) { box.hidden = true; return; }
      box.hidden = false;
      var isArc = !!MB.pick.arc, isExi = !!MB.pick.exi;
      $('g-mbpickt').textContent = isArc ? ('选择赋能（' + MB.pick.arc + '）')
        : (isExi ? '给特殊功能槽选择 MOD（只列特殊功能卡）'
                 : ('给第 ' + (MB.pick.i != null ? mbSlotNoOf(MB.pick.i) : 1) + ' 槽选择 MOD'));
      var body = ZKMB.pickerBody(mbPickerCtx());
      var tb = $('g-mbtabs');
      if (tb) { tb.innerHTML = body.tabs; tb.style.display = body.hideTabs ? 'none' : ''; }
      var pl = $('g-mbpool');
      if (pl) pl.innerHTML = body.pool;
      $('g-mblist').innerHTML = body.list;
      var cnt = $('g-mbpcount');
      if (cnt) cnt.textContent = body.count;
      if ($('g-mbq').value !== (MB.q || '')) $('g-mbq').value = MB.q || '';
    }
    function mbArchFill(a) {
      var sel = $('g-mbarch');
      if (!sel) return;
      var list = (a && a.list) || [];
      MB.best = (a && a.best) ? a.best.id : '';
      var want = '__auto,' + list.map(function (x) { return x.id; }).join(',') + '|' + langIx();
      if (sel.getAttribute('data-sig') !== want) {
        sel.setAttribute('data-sig', want);
        sel.innerHTML = '<option value="__auto">自动 · ' +
          (a && a.best ? esc(RR.archNameOf(a.best.id, langIx())) : '跟着当前最优流派') + '</option>' +
          list.map(function (x) {
            return '<option value="' + esc(x.id) + '">' + esc(RR.archNameOf(x.id, langIx())) + '</option>';
          }).join('');
        if (MB.archUser && MB.archUser !== '__auto' &&
            !sel.querySelector('option[value="' + MB.archUser + '"]')) MB.archUser = '';
      } else if (sel.options[0]) {
        sel.options[0].textContent = '自动 · ' + (a && a.best ? RR.archNameOf(a.best.id, langIx()) : '跟着当前最优流派');
      }
      sel.value = MB.archUser || '__auto';
    }
    function mbArchNow() {
      var v = MB.archUser || '__auto';
      if (v === '__auto') return MB.best || '';
      return v;
    }
    function mbConflict(id, ids) {
      var m = MB_BY[id];
      if (!m) return true;
      for (var i = 0; i < ids.length; i++) {
        var o = MB_BY[ids[i]];
        if (!o) continue;
        if (o.i === m.i) return true;
        if (o.fam && m.fam && o.fam === m.fam) return true;
        if (o.inc && o.inc.indexOf(m.i) >= 0) return true;
        if (m.inc && m.inc.indexOf(o.i) >= 0) return true;
      }
      return false;
    }
    function mbScoreOf(ids, archId, arcIds) {
      var E = window.__MB05;
      if (E && E.afOut && cur().w) {
        try {
          var v = E.afOut(cur().w, riv(), ids || [],
                          (arcIds && arcIds.length) ? arcIds[0] : null,
                          MB.bestForm || null, mbLayerMap(), archId, true);
          if (v != null) return v;
        } catch (eMB) { ZKHTML.warn('框架/app.js:6939', eMB); }
      }
      var arch = (archId && RR.ARCH_BY_ID) ? RR.ARCH_BY_ID[archId] : null;
      if (!arch || !RR.scoreArch) return null;
      var o = mbArcBucket(arcIds || [], mbBucketOf(ids)), w = cur().w;
      RR.setExtraMods(o, true);
      try { if (RR.setElemOrder) RR.setElemOrder(mbElemOrderOf(ids)); } catch (e0) { ZKHTML.warn('框架/app.js:6945', e0); }
      var r = null;
      try { r = RR.scoreArch(w, riv(), targetKeyNow(), arch); } catch (e1) { r = null; }
      if (!r) return null;
      var rm = 1;
      try {
        var r0 = RR.rateOf(w, {}, arch), r1 = RR.rateOf(w, o, arch);
        if (r0 > 0) rm = r1 / r0;
      } catch (e2) { ZKHTML.warn('框架/app.js:6953', e2); }
      return (r.hitDmg || 0) * rm;
    }
    function mbFillArcs(archId, ids) {
      var roles = mbRoles();
      if (!roles.length) return;
      var chosen = {}, used = {};
      var curV = mbScoreOf(ids, archId, []);
      if (curV == null) return;
      roles.forEach(function (role) {
        var bestId = null, bestV = curV;
        mbArcList(role).forEach(function (a) {
          if (used[a.i]) return;
          var v = mbScoreOf(ids, archId, [a.i]);
          if (v != null && v > bestV * (1 + 1e-9)) { bestV = v; bestId = a.i; }
        });
        if (bestId) { chosen[role] = bestId; used[bestId] = 1; curV = bestV; }
      });
      var A0 = (window.ZKAFARC || {})[archId];
      if (A0) {
        var _wA = cur().w, _arcId = A0.arc;
        if (A0.arcBy && _wA && A0.arcBy[_wA.s]) _arcId = A0.arcBy[_wA.s];
        var aA = MB_ARC_BY[_arcId], aR = A0.role || (aA && aA.t);
        if (aA && aR && roles.indexOf(aR) >= 0) {
          Object.keys(chosen).forEach(function (r) { if (chosen[r] === _arcId) delete chosen[r]; });
          chosen[aR] = _arcId;
        }
      }
      MB.arcs = chosen;
    }
    function mbFill(noRiven) {
      var w = cur().w;
      noRiven = (noRiven === true);
      if (noRiven) { MB.rivenPos = -1; MB.rivenOff = true; }
      else { MB.rivenOff = false;
             if (mbHasRiven() && MB.rivenPos < 0) MB.rivenPos = MB_RIVEN_SLOT; }
      if (!w) { flash('先选定武器'); return; }
      var archId = mbArchNow();
      if (!archId) { flash('这张卡在这把武器上没有成立的流派'); return; }
      var ids = RR.archModsOf(archId, w);
      if (!ids || !ids.length) { flash('这个流派没有标准配卡'); return; }
      var pool = [], exi = null;
      ids.forEach(function (id) {
        var m = MB_BY[id];
        if (!m) return;
        if (m.x) { if (!exi) exi = id; return; }
        if (!mbOK(m, false)) return;
        if (mbConflict(id, pool)) return;
        pool.push(id);
      });
      var ownSet = {};
      var ownIds = (window.ZKMB && ZKMB.ownModsOf)
        ? ZKMB.ownModsOf(w, MB_MODS, function (m) { return mbOK(m, false); })
        : [];
      ownIds.forEach(function (m) {
        if (ownSet[m.i]) return;
        if (mbConflict(m.i, pool)) return;
        ownSet[m.i] = 1;
        pool.push(m.i);
      });
      var _cap8 = MB_NSLOT - (mbHasRiven() && MB.rivenPos >= 0 ? 1 : 0);
      while (pool.length > _cap8 && pool.length) {
        var dropI = pool.length - 1, dropV = -Infinity;
        for (var d0 = 0; d0 < pool.length; d0++) {
          if (ownSet[pool[d0]]) continue;
          var sub = pool.slice(0, d0).concat(pool.slice(d0 + 1));
          var vv = mbScoreOf(sub, archId);
          if (vv == null) continue;
          if (vv > dropV) { dropV = vv; dropI = d0; }
        }
        pool.splice(dropI, 1);
      }
      if (!pool.length) { flash('这个流派的标准配卡一张都装不上'); return; }
      MB.slots = [];
      MB.pols = [];
      for (var k = 0; k < _cap8; k++) {
        var id = pool[k] || null;
        MB.slots.push(id);
        MB.pols.push(id ? (MB_BY[id].y || '') : '');
      }
      MB.exi = exi;
      MB.exiPol = exi ? (MB_BY[exi].y || '') : '';
      MB.rivenPol = mbHasRiven() ? 'r' : '';
      mbFillArcs(archId, MB.slots.filter(Boolean));
      MECH_UI.forEach(function (m) {
        if (m.ex.indexOf(w.i) < 0) { adv[m.k] = 0; return; }
        adv[m.k] = (mbMechSlot(m.mid) >= 0) ? 0 : 1;
      });
      MB.sig = '';
      var notes = [];
      if (Object.keys(ownSet).length) {
        notes.push('已装武器专属卡 ' + Object.keys(ownSet).map(function (id) {
          return MB_BY[id] ? mbName(MB_BY[id]) : id;
        }).join(' / '));
      }
      MB.autoNote = notes.join(' · ');
      redraw();
    }
    (function bindMB() {
      var card = $('g-mbcard');
      if (!card) return;
      card.addEventListener('click', function (e) {
        var t = e.target;
        var pb = t.closest ? t.closest('[data-mbp]') : null;
        if (pb) {
          var key = pb.getAttribute('data-mbp');
          if (key === 'E') MB.exiPol = MB_POL_ORDER[(MB_POL_ORDER.indexOf(MB.exiPol) + 1) % MB_POL_ORDER.length];
          else if (key === 'R') MB.rivenPol = MB_POL_ORDER[(MB_POL_ORDER.indexOf(MB.rivenPol) + 1) % MB_POL_ORDER.length];
          else {
            var pi = +key;
            MB.pols[pi] = MB_POL_ORDER[(MB_POL_ORDER.indexOf(MB.pols[pi]) + 1) % MB_POL_ORDER.length];
          }
          MB.sig = ''; redraw(); return;
        }
        var rx = t.closest ? t.closest('[data-mbrx]') : null;
        if (rx) {
          MB.lastRivenPos = MB.rivenPos >= 0 ? MB.rivenPos : MB_RIVEN_SLOT;
          MB.rivenPos = -1;
          MB.rivenOff = true;
          MB.sig = ''; redraw(); return;
        }
        var mv = t.closest ? t.closest('[data-mvr]') : null;
        if (mv) {
          MB.rivenPos = ((MB.rivenPos + 1) % MB_NSLOT);
          MB.rivenOff = false;
          MB.sig = ''; redraw(); return;
        }
        if (t.closest && t.closest('[data-mbr]')) { flash('紫卡就是左栏这张卡 —— 词条直接改左边那 4 行'); return; }
        var lb = t.closest ? t.closest('.lbtn') : null;
        if (lb) {
          var si = +lb.getAttribute('data-ls'), d = +lb.getAttribute('data-d');
          var sm = MB.slots[si] ? MB_BY[MB.slots[si]] : null;
          if (!sm) return;
          var mx = mbMaxLayers(sm);
          MB.layers[si] = Math.max(0, Math.min(mbCurLayers(si) + d, mx));
          MB.sig = ''; redraw(); return;
        }
        var alb = t.closest ? t.closest('.lbtn[data-alr]') : null;
        if (alb) {
          var arole = alb.getAttribute('data-alr'), ad = +alb.getAttribute('data-d');
          var aa = MB.arcs[arole] ? MB_ARC_BY[MB.arcs[arole]] : null;
          if (!aa) return;
          MB.arcLayers[arole] = Math.max(0, Math.min(mbCurLayersArc(arole) + ad, mbMaxLayers(aa)));
          MB.sig = ''; redraw(); return;
        }
        var tb2 = t.closest ? t.closest('[data-mbtab]') : null;
        if (tb2) { MB.tab = tb2.getAttribute('data-mbtab'); mbPickRender(); return; }
        var xb = t.closest ? t.closest('[data-mbx]') : null;
        if (xb) {
          var k = xb.getAttribute('data-mbx');
          if (k === 'e') { MB.exi = null; MB.exiPol = ''; } else { MB.slots[+k] = null; MB.pols[+k] = ''; }
          MB.sig = ''; redraw(); return;
        }
        var ax = t.closest ? t.closest('[data-mba-x]') : null;
        if (ax) { delete MB.arcs[ax.getAttribute('data-mba-x')]; MB.sig = ''; redraw(); return; }
        if (!cur().w) { flash('先选一把武器'); return; }
        var s1 = t.closest ? t.closest('[data-mbs]') : null;
        if (s1) { MB.pick = { i: +s1.getAttribute('data-mbs') }; MB.q = ''; MB.sig = ''; mbRender(); return; }
        var s2 = t.closest ? t.closest('[data-mbe]') : null;
        if (s2) { MB.pick = { exi: 1 }; MB.q = ''; MB.sig = ''; mbRender(); return; }
        var s3 = t.closest ? t.closest('[data-mba]') : null;
        if (s3) { MB.pick = { arc: s3.getAttribute('data-mba') }; MB.q = ''; MB.sig = ''; mbRender(); return; }
        var it = t.closest ? t.closest('[data-mbi]') : null;
        if (it) {
          if (it.classList.contains('used')) return;
          var id = it.getAttribute('data-mbi');
          if (MB.pick && MB.pick.arc) MB.arcs[MB.pick.arc] = id;
          else if (MB.pick && MB.pick.exi) MB.exi = id;
          else if (MB.pick) MB.slots[MB.pick.i] = id;
          MB.pick = null; MB.sig = ''; redraw(); return;
        }
        var fc = t.closest ? t.closest('[data-fast]') : null;
        if (fc) { mbFastInstall(fc.getAttribute('data-fast')); return; }
        var rv = t.closest ? t.closest('[data-mbriven]') : null;
        if (rv) {
          var act = rv.getAttribute('data-mbriven');
          if (act === 'off') {
            MB.lastRivenPos = MB.rivenPos >= 0 ? MB.rivenPos : MB_RIVEN_SLOT;
            MB.rivenPos = -1;
            MB.rivenOff = true;
          } else if (act === 'on') {
            MB.rivenPos = (MB.lastRivenPos != null ? MB.lastRivenPos : MB_RIVEN_SLOT);
            MB.rivenOff = false;
          }
          MB.pick = null; MB.sig = ''; redraw(); return;
        }
      });
      card.addEventListener('input', function (e) {
        if (!e.target || e.target.id !== 'g-mbq') return;
        MB.q = e.target.value; MB.sig = ''; mbPickRender();
      });
      if ($('g-mbpx')) $('g-mbpx').addEventListener('click', function () {
        MB.pick = null; MB.sig = ''; mbRender();
      });
      if ($('g-mbarch')) $('g-mbarch').addEventListener('change', function () {
        MB.archUser = this.value || '__auto';
      });
      if ($('g-mbfill')) $('g-mbfill').addEventListener('click', function () { mbFill(false); });
      if ($('g-mbfillnr')) $('g-mbfillnr').addEventListener('click', function () { mbFill(true); });
      if ($('g-mbclr')) $('g-mbclr').addEventListener('click', function () {
        MB.slots = []; MB.pols = [];
        for (var k = 0; k < MB_NSLOT; k++) { MB.slots.push(null); MB.pols.push(''); }
        MB.exi = null; MB.exiPol = ''; MB.arcs = {}; MB.rivenPol = ''; MB.sig = ''; redraw();
      });
    })();
    function mbFaceRender() {
      var host = $('g-face');
      if (!host) return;
      var np = 0, nn = 0, rows = [];
      state.slots.forEach(function (s) {
        if (!s || !s.row) return;
        if (s.v >= 0) np++; else nn++;
        var nm = sname(s.row);
        rows.push('<div class="g-facerow ' + (s.v >= 0 ? 'pos' : 'neg') + '">' +
          '<b>' + esc(nm) + '</b><span>' + (s.v >= 0 ? '+' : '\u2212') + fmt(Math.abs(s.v), 2) + '</span></div>');
      });
      host.innerHTML = rows.length ? rows.join('')
        : '<div class="g-empty">还没填词条 —— 到 05 版块的「卡 A 面板」填，或从 02 区导入这张卡。</div>';
      var lab = $('g-facelab');
      if (lab) lab.textContent = np + ' 正 / ' + nn + ' 负 · 等级 ' + (K && K.rank != null ? K.rank : 8);
    }
    function redraw() {
      var C = cur();
      if (!C.w) {
        mbArchFill(null); mbRender(); mbFaceRender(); fallbackPanel(C);
        var _lab = $('g-elemproclab');
        if (_lab) {
          var _t = RR.TARGET_BY_K[targetKeyNow()] || RR.TARGETS[0];
          _lab.textContent = '目标：' + RR.targetNameOf(_t && _t.k, langIx());
        }
        return;
      }
      var w = C.w, rv = riv();
      syncStance(w);
      var _mbAgg = mbAggregate();
      if (_mbAgg) {
        RR.setExtraMods(_mbAgg, true);
        if (RR.setElemOrder) RR.setElemOrder(mbElemOrder());
      } else {
        RR.setExtraMods(extraNow());
        if (RR.setElemOrder) RR.setElemOrder(null);
      }
      var tkey = targetKeyNow();
      var a = RR.advise(w, rv, tkey);
      mbArchFill(a);
      mbRender();
      mbFaceRender();
      var best = a.best;
      MB.bestForm = best ? (best.form || null) : null;
      if (selArch) {
        var keep = a.list.filter(function (x) { return x.id === selArch; })[0];
        if (keep) best = keep; else selArch = null;
      }
      if (!best) {
        $('g-big').innerHTML = '<div class="g-empty">这张卡在这把武器上没有任何一条流派成立</div>';
        $('g-archs').innerHTML = '';
        $('g-panel').innerHTML = ''; $('g-rejected').innerHTML = '';
        return;
      }
      var gr = RR.gradeGain(best.gain), natural = a.natural;
      $('g-big').innerHTML =
        '<div class="g-top"><div>' +
          '<div class="g-lab">' + (selArch ? '你选的口径' : '这张卡最强在') + '</div>' +
          '<div class="g-num ' + (best.gain >= 0 ? 'pos' : 'neg') + '">' + sgn(best.gain, 0) + '%</div>' +
          '<div class="g-who"><b>' + esc(RR.archNameOf(best.id, langIx())) + '</b> <i>' + esc(archSub(best)) + '</i></div>' +
        '</div>' +
        '<div class="g-grade"><b class="' + (best.gain >= 0 ? 'pos' : 'neg') + '">' + esc(gr.g) +
          '</b><span>' + esc(RR.gradeNameOf(gr.g, langIx())) + '</span></div></div>' +
        '<div class="g-verdict">' +
          '<div>武器自己的流派是 <b>' + esc(RR.archNameOf(natural.id, langIx())) + '</b>' +
            (natural.score ? '（这张卡在那里 ' + sgn(natural.score.gain, 0) + '%）' : '（这张卡在那里不适用）') +
            ' · ' + (a.agrees ? '<b class="g-ok">两者一致</b>' : '<b>两者不一致</b>') + '</div>' +
          '<div class="g-split">' +
            '<div>单发 <em>' + sgn(best.perHit, 0) + '%</em></div>' +
            '<div>速率 <em>' + sgn(best.rateGain, 0) + '%</em></div>' +
            '<div>群体 <em>' + sgn(best.crowdGain, 0) + '%</em></div>' +
            (best.hitDmg != null ? '<div>' + tx('单发伤害', 'per hit') + ' <em>' +
              dmgText(best.hitDmg) + '</em></div>' : '') +
          '</div>' +
        '</div>' +
        '<div class="g-meta">' +
          '<div>护甲 <b>' + a.target.armor + '</b>（减伤 <b>' + fmt(WE.armorDR(a.target.armor) * 100, 1) + '%</b>）</div>' +
          '<div>派系 <b>' + esc(RR.targetName(a.target)) + '</b></div>' +
          '<div>形态 <b>' + esc(best.form || '默认') + '</b></div>' +
          '<div>配卡 <b>' + Object.keys(best.build).map(function (k) {
            var s = RR.STAT_BY_K[k];
            var BUILD_N = { br: '急进猛突', msd: '震地伤害', co: '异况超量' };
            var BUILD_N_EN = { br: 'Blood Rush', msd: 'Slam Damage', co: 'Condition Overload' };
            var bn = langIx() === 2 ? (BUILD_N_EN[k] || (s ? RR.statNameOf(k, 2) : k)) : (s ? s.n : (BUILD_N[k] || k));
            return esc(bn) + ' ' + best.build[k];
          }).join(' · ') + '</b></div>' +
        '</div>';
      var maxAbs = Math.max.apply(null, a.list.map(function (x) { return Math.abs(x.gain); }).concat([1]));
      $('g-archs').innerHTML = a.list.map(function (s) {
        var on = best && s.id === best.id;
        return '<div class="g-arch' + (on ? ' sel' : '') + '" data-id="' + s.id + '">' +
          '<div><div class="g-anm">' + esc(RR.archNameOf(s.id, langIx())) + (s.id === natural.id ? ' <span class="g-tag k">武器本位</span>' : '') +
            '<i>' + esc(archSub(s)) + '</i></div>' +
            '<div class="g-split3"><span>单发 <b>' + sgn(s.perHit, 0) + '%</b></span>' +
            '<span>速率 <b>' + sgn(s.rateGain, 0) + '%</b></span>' +
            '<span>群体 <b>' + sgn(s.crowdGain, 0) + '%</b></span>' +
            (s.hitDmg != null ? '<span class="g-hit">' +
              tx(s.cal === 'slam' ? '震地伤害' : '单发伤害', 'hit') + ' <b>' +
              dmgText(s.hitDmg) + '</b></span>' : '') +
            '</div></div>' +
          '<div class="g-vl ' + (s.gain >= 0 ? 'pos' : 'neg') + '">' + sgn(s.gain, 0) + '%</div>' +
          '<div class="g-bar"><i style="width:' + Math.max(1, Math.abs(s.gain) / maxAbs * 100).toFixed(1) + '%' +
            (s.gain < 0 ? ';background:var(--neg)' : '') + '"></i></div>' +
          '</div>';
      }).join('');
      [].slice.call($('g-archs').querySelectorAll('.g-arch')).forEach(function (el) {
        el.addEventListener('click', function () {
          selArch = (selArch === this.getAttribute('data-id')) ? null : this.getAttribute('data-id');
          redraw();
        });
      });
      $('g-archsub').textContent = '按这张卡在该流派下的净增幅排序';
      $('g-archnote').innerHTML = '「武器本位」= 只读武器数据判出来的自然玩法（不是这张卡的结论）。' +
        '点一行可以锁定它，下面两张表会跟着换。' +
        '「单发」是同一发子弹的伤害比，「速率」是每秒出手次数的比（含装填），「群体」是命中数的比 —— ' +
        '三者相乘就是总增幅。<b>速率和群体分开算，因为它们对应的词条完全不同：射速/攻速/弹匣/装填属于速率，范围和穿透属于群体。</b>';
      var tier2 = curTier();
      var cs = RR.contribOf(w, rv, tkey, best.id).filter(function (c) { return c.delta != null; });
      var rowOfKey = {};
      state.slots.forEach(function (sl) { if (sl && sl.row) rowOfKey[slotKey(sl.row, C)] = sl.row; });
      var metaOf = {};
      cs.forEach(function (c) {
        var row = rowOfKey[c.k] != null ? rowOfKey[c.k] : rowFor(c.k, C.cat);
        if (row == null) return;
        var good = (c.v * (row === RECOIL ? -1 : 1)) >= 0 ? 1 : -1;
        var cap = capOf(C, row, good, tier2);
        var fp = (cap != null && Math.abs(cap) > 0.01) ? Math.abs(c.v) / Math.abs(cap) * 100 : null;
        metaOf[row] = { fp: fp, delta: c.delta };
      });
      [].slice.call($('g-boxes').querySelectorAll('.g-cmeta')).forEach(function (el) {
        var sl = state.slots[+el.getAttribute('data-b')];
        if (!sl || !sl.row) { el.innerHTML = ''; return; }
        if (!rowApplies(sl.row)) {
          el.innerHTML = '<span class="g-mf g-dd">' +
            tx('对不上当前目标档的派系，不计', 'not the target faction — ignored') + '</span>';
          return;
        }
        var bits = [], cap0 = capOf(C, sl.row,
          (sl.v * (sl.row === RECOIL ? -1 : 1)) >= 0 ? 1 : -1, tier2);
        bits.push('<span class="g-mf">' + tx('满值', 'cap') + ' <b>' +
          (fmtCap(sl.row, cap0) || '—') + '</b></span>');
        var m = metaOf[sl.row];
        if (m) {
          var fcls = m.fp == null ? 'flat' : (m.fp >= 85 ? 'up' : (m.fp < 50 ? 'dn' : 'flat'));
          var dcls = m.delta > 0.5 ? 'up' : (m.delta < -0.5 ? 'dn' : 'flat');
          bits.push('<span class="g-mf">' + tx('浮动', 'roll') + ' <b class="' + fcls + '">' +
            (m.fp == null ? '—' : fmt(m.fp, 0) + '%') + '</b></span>');
          bits.push('<span class="g-mf">' + tx('边际', 'gain') + ' <b class="' + dcls + '">' +
            sgn(m.delta, 1) + '%</b></span>');
        }
        el.innerHTML = bits.join('<i class="g-msep">·</i>');
      });
      $('g-panellab').textContent = (best.form ? '形态：' + best.form + ' · ' : '') + '军械库口径（裸枪 + 当前配卡）';
      var pd = null;
      var isMeleeW = (w.s === 'm') || (w.s === 'e' && !!(w.fl && (w.fl.indexOf('heavy_slam') >= 0 || w.fl.indexOf('neutral') >= 0)));
      var wpTop = '';
      (function () {
        var bm, sp;
        try { bm = RR.parseRiven(rv || {}); } catch (e0) { return; }
        var _b = {}, _m = {}, _k;
        for (_k in (bm.buckets || {})) if (Object.prototype.hasOwnProperty.call(bm.buckets, _k)) _b[_k] = (_b[_k] || 0) + bm.buckets[_k];
        for (_k in (bm.meta || {})) if (Object.prototype.hasOwnProperty.call(bm.meta, _k)) _m[_k] = (_m[_k] || 0) + bm.meta[_k];
        var _mb = null;
        try { _mb = mbAggregate(); } catch (e2) { ZKHTML.warn('框架/app.js:5763', e2); _mb = null; }
        var _eo = [];
        try { _eo = mbElemOrderOf(mbModIds()).slice(); } catch (e3) { ZKHTML.warn('框架/app.js:5766', e3); _eo = []; }
        try {
          (RR.elemOrderNow ? RR.elemOrderNow(rv || {}) : []).forEach(function (k0) {
            if (_eo.indexOf(k0) < 0) _eo.push(k0);
          });
        } catch (e4) { ZKHTML.warn('框架/app.js:5772', e4); }
        if (_mb) {
          for (_k in _mb) {
            if (!Object.prototype.hasOwnProperty.call(_mb, _k)) continue;
            var _v = +_mb[_k] || 0;
            if (!_v) continue;
            if (MB_META_K[_k]) _m[_k] = (_m[_k] || 0) + _v;
            else _b[_k] = (_b[_k] || 0) + _v;
          }
        }
        try { sp = RR.snapPanel(w, best.form, _b, _m, _eo.length ? _eo : undefined); } catch (e1) { return; }
        if (!sp) return;
        try {
          pd = RR.panelDiff(w, best.form, rv, { buckets: _b, meta: _m }, _eo.length ? _eo : undefined);
        } catch (e5) { ZKHTML.warn('框架/app.js:5815', e5); pd = null; }
        function wtileOf(l, v, u) {
          return '<div class="wtile"><div class="wl">' + l + '</div><div class="wv">'
            + (u ? v + ' <small>' + u + '</small>' : v) + '</div></div>';
        }
        wpTop += '<div class="wgrid">';
        wpTop += wtileOf('总伤害', fmt(sp.total, 1));
        wpTop += wtileOf('暴击', fmt(sp.cc, 1) + '%', '×' + fmt(sp.cd, 2));
        wpTop += wtileOf('暴击期望', fmt(sp.critM, 3) + '×');
        wpTop += wtileOf('触发', fmt(sp.sc, 1) + '%');
        wpTop += wtileOf(isMeleeW ? '攻速' : '射速', fmt(sp.fr, 2), '/s');
        wpTop += wtileOf('多重', fmt(sp.ms, 2));
        if (!isMeleeW) {
          wpTop += wtileOf('弹匣', fmt(sp.mag, 0), '发');
          wpTop += wtileOf('装填', fmt(sp.rel, 2), 's');
          wpTop += wtileOf('持续射速', fmt(sp.sus, 2), '/s');
        }
        wpTop += wtileOf('范围', fmt(sp.rng, 2), 'm');
        wpTop += wtileOf('穿透', fmt(sp.pt, 2), 'm');
        if (sp.combo) wpTop += wtileOf('连击', fmt(sp.combo, 0));
        wpTop += '</div>';
        var WFg = window.WF;
        var order = ((WFg && WFg.PHYS) || ['impact', 'puncture', 'slash']).concat((WFg && WFg.ELEM) || []);
        var ecol = (window.ZKMB && ZKMB.ELEM_COLOR) || {};
        var erows = [];
        order.forEach(function (t) {
          var v = sp.types[t];
          if (v > 0.0001) erows.push({ t: t, v: v, pct: sp.total > 0 ? v / sp.total * 100 : 0 });
        });
        if (erows.length) {
          erows.sort(function (x, y) { return y.v - x.v; });
          wpTop += '<div class="elem"><h4>伤害构成（物理 + 元素 · 裸枪 + 当前配卡）</h4><div class="ebar">';
          erows.forEach(function (r2) {
            wpTop += '<span style="width:' + r2.pct + '%;background:' + (ecol[r2.t] || '#9aa0b0')
              + '" title="' + esc((WFg && WFg.TYPE_CN[r2.t]) || r2.t) + ' ' + fmt(r2.v, 1) + '（' + fmt(r2.pct, 1) + '%）"></span>';
          });
          wpTop += '</div><div class="elegend">';
          erows.forEach(function (r2) {
            wpTop += '<div class="er"><span class="dot" style="background:' + (ecol[r2.t] || '#9aa0b0') + '"></span>'
              + '<span class="en">' + esc((WFg && WFg.TYPE_CN[r2.t]) || r2.t) + '</span>'
              + '<span class="ev">' + fmt(r2.v, 1) + '</span>'
              + '<span class="ep">' + fmt(r2.pct, 1) + '%</span></div>';
          });
          wpTop += '</div></div>';
        }
      })();
      var lastG = null, rows = '';
      rows += '<div class="hd">项</div><div class="hd c">无卡</div><div class="hd c">有卡</div><div class="hd c">变化</div>';
      (pd && pd.rows ? pd.rows : []).forEach(function (r) {
        if (r.g !== lastG) { rows += '<div class="grp">' + esc(RR.panelGrpName(r.g, langIx())) + '</div>'; lastG = r.g; }
        var dv = (+r.after || 0) - (+r.before || 0);
        var eps = 0.5 * Math.pow(10, -(r.d || 0));
        var dTxt = Math.abs(dv) < eps ? '—'
          : (dv > 0 ? '+' : '−') + fmt(Math.abs(dv), r.d) + (r.u || '');
        var hint = r.hint || '';
        rows += '<div class="k">' + esc(RR.panelRowName(r, langIx())) + (hint ? '<small>' + esc(hint) + '</small>' : '') + '</div>'
          + '<div class="c">' + fmt(+r.before || 0, r.d) + (r.u || '') + '</div>'
          + '<div class="c">' + fmt(+r.after || 0, r.d) + (r.u || '') + '</div>'
          + '<div class="delta' + (dTxt === '—' ? ' zero' : '') + '">' + dTxt + '</div>';
      });
      $('g-panel').innerHTML = wpTop +
        '<div class="wdiff"><h4><b>无卡 → 有卡</b>　军械库口径（裸枪）对当前整套配卡，改一格即重算</h4>' +
        '<div class="wd">' + rows + '</div></div>' +
        '<p class="g-note">这是<b>面板</b>，不是打分。面板只回答「装上去长什么样」；' +
        '真正决定分数的是上面那张流派表 —— 同样 +100% 伤害，在无甲档和高甲档的价值就不一样。</p>' +
        (function () {
          var si = (RR.stanceInfo && RR.stanceInfo()) ? RR.stanceInfo() : null;
          if (!si) return '';
          return '<p class="g-note">架势 <b>' + esc(langIx() === 2 ? (si.n || si.z) : si.z) + '</b>：平A 每一招按 <b>×' +
            si.per.toFixed(2) + '</b> 计（连段 ' + si.total + ' 倍 / ' + si.secs + ' 秒，' +
            si.rate.toFixed(2) + ' 倍每秒）；震地与重击不吃架势倍率。</p>';
        })();
      renderElemProc(w, best.form, rv, tkey, best.build);
      renderClear(best);
      $('g-rejected').innerHTML = a.rejected.length
        ? '<div class="g-tscroll"><table class="g-t"><thead><tr><th>流派</th><th>原因</th></tr></thead><tbody>' +
          a.rejected.map(function (x) {
            return '<tr><td>' + esc(RR.archNameOf(x.id, langIx())) + '</td><td class="g-why">' + esc(x.why) + '</td></tr>';
          }).join('') + '</tbody></table></div>'
        : '<div class="g-empty">这把武器没有不成立的流派</div>';
    }
    function renderElemProc(w, formId, riven, tkey, mods) {
      var card = $('g-elemproccard'), host = $('g-elemproc'), lab = $('g-elemproclab');
      if (!card || !host) return;
      var pb = null, ps = null;
      try { pb = RR.procBreakdown ? RR.procBreakdown(w, formId, riven, tkey, mods) : null; } catch (e) { pb = null; }
      try { ps = RR.procStats ? RR.procStats(w, formId, riven, tkey, mods) : null; } catch (e2) { ps = null; }
      var tb = (window.ZKMB && ZKMB.elemProcTable) ? ZKMB.elemProcTable(pb, ps) : { rows: [] };
      if (!tb.rows.length) { card.hidden = true; return; }
      var html = '';
      tb.rows.forEach(function (x) {
        html += '<tr>' +
          '<td>' + esc(x.k ? (langIx() === 2 ? (RR.PROC_EL_EN[x.k] || x.n) : x.n) : x.n) +
          '<span class="g-dd">' + esc(x.note || '') + '</span></td>' +
          '<td>' + (x.stacks > 0 ? x.stacks : '—') + '</td>' +
          '<td>' + (x.target > 0 ? fmt(x.target, 1) : '—') + '</td>' +
          '<td>' + (x.aoe > 0 ? fmt(x.aoe, 1) : '—') + '</td>' +
          '<td class="g-why">' + esc(x.debuff || '—') + '</td>' +
          '<td>' + (x.share != null ? fmt(x.share * 100, 1) + '%' : '—') + '</td>' +
          '<td>' + (x.dur != null ? fmt(x.dur, x.dur < 10 ? 1 : 0) + 's' : '—') + '</td>' +
          '<td>' + (x.uptime != null ? fmt(x.uptime * 100, 1) + '%' : '—') + '</td>' +
          '<td>' + (x.p != null ? fmt(x.p * 100, 2) + '%' : '—') + '</td>' +
          '<td>' + (x.perShot != null ? fmt(x.perShot, 2) : '—') + '</td>' +
          '<td>' + (x.perSec != null ? fmt(x.perSec, 2) : '—') + '</td>' +
          '<td>' + ((x.dot && x.dmgSec > 0) ? fmt(Math.round(x.dmgSec), 0) : '—') + '</td>' +
          '</tr>';
      });
      host.innerHTML = '<div class="g-tscroll"><table class="g-t g-epc"><thead>' +
        '<tr class="grp"><th rowspan="2">元素 / 异常</th>' +
        '<th colspan="4" class="grp-a">一层有多疼</th>' +
        '<th colspan="7" class="grp-b">多久挂得上</th></tr>' +
        '<tr class="grp2"><th>层数</th><th>主目标</th><th>群体</th><th>减益</th>' +
        '<th>比重</th><th>持续</th><th>覆盖率</th><th>弹片触发率</th>' +
        '<th>每发触发量</th><th>每秒触发量</th><th>每秒触发伤害</th></tr>' +
        '</thead><tbody>' + html + '</tbody></table></div>';
      var s = pb ? ('目标：' + (pb.target ? RR.targetNameOf(pb.target.k, langIx()) : '—') +
        (pb.ctx && pb.ctx.crowd > 0 ? ' · 怪群密度 ' + Math.round(pb.ctx.crowd * 100) + '%' : ' · 单体')) : '';
      if (ps) {
        var pel = (ps.pelletFrac > 0.02)
          ? (ps.pelletsInt + '+' + fmt(ps.pelletFrac, 1))
          : String(ps.pelletsInt);
        s += '　·　触发 ' + fmt(ps.sc * 100, 1) + '% · 弹片 ' + pel +
          ' · 射速 ' + fmt(ps.rate, 2) + '/秒 · 每发异常 ' + fmt(ps.total.perShot, 2) + ' 个' +
          (ps.statusDurM && Math.abs(ps.statusDurM - 1) > 0.005
            ? ' · 持续 ×' + fmt(ps.statusDurM, 2) : '') +
          (ps.total.dmgSec > 0 ? ' · 触发伤害 ' + fmt(Math.round(ps.total.dmgSec), 0) + '/秒' : '');
      }
      lab.textContent = s;
      card.hidden = false;
    }
    var MECH_UI = [
      { k: 'napalm', n: '夜巡燃烧弹', mid: 'nightwatch_napalm', ex: ['ogris', 'kuva_ogris'] },
      { k: 'acid', n: '酸性弹药', mid: 'acid_shells', ex: ['sobek', 'kuva_sobek'] }
    ];
    function mbMechSlot(mid) {
      if (!mid || !MB || !MB.slots) return -1;
      for (var i = 0; i < MB.slots.length; i++) if (MB.slots[i] === mid) return i;
      return -1;
    }
    function mbFreeSlot() {
      for (var i = 0; i < MB_NSLOT; i++) {
        if (MB.rivenPos >= 0 && i === MB.rivenPos) continue;
        if (MB.slots[i]) continue;
        return i;
      }
      return -1;
    }
    function mechToggles() {
      var C = cur(), w = C && C.w;
      if (!w) return '';
      var on = MECH_UI.filter(function (m) { return m.ex.indexOf(w.i) >= 0; });
      if (!on.length) return '';
      return '<div class="g-mech">' + on.map(function (m) {
        var si = mbMechSlot(m.mid);
        var onNow = (si >= 0) || (+adv[m.k] > 0);
        var mo = window.ZKNAME.modById(m.mid);
        return '<label><input type="checkbox" data-mk="' + m.k + '"' +
          (onNow ? ' checked' : '') + '> ' + esc(mo ? window.ZKNAME.mod(mo) : m.n) +
          (si >= 0 ? ' <span class="g-dd">（已装在第 ' + (si + 1) + ' 格）</span>' : '') +
          '</label>';
      }).join('') + '</div>';
    }
    document.addEventListener('change', function (e) {
      var t = e.target;
      var k = t && t.getAttribute && t.getAttribute('data-mk');
      if (!k) return;
      var ui = MECH_UI.filter(function (m) { return m.k === k; })[0];
      if (!ui) return;
      if (t.checked) {
        if (mbMechSlot(ui.mid) < 0) {
          var si = mbFreeSlot();
          if (si < 0) {
            adv[k] = 1;
            flash('8 格都满了，' + ui.n + ' 只能按试算开关算（不占格子）');
          } else {
            MB.slots[si] = ui.mid;
            MB.pols[si] = (MB_BY[ui.mid] && MB_BY[ui.mid].y) || '';
            adv[k] = 0;
          }
        }
      } else {
        var s2 = mbMechSlot(ui.mid);
        if (s2 >= 0) { MB.slots[s2] = null; MB.pols[s2] = ''; }
        adv[k] = 0;
      }
      selArch = null;
      MB.sig = '';
      redraw();
      advHint();
    });
    function renderClear(best) {
      var card = $('g-clearcard'), host = $('g-clear'), lab = $('g-clearlab');
      if (!card || !host) return;
      var c = best && best.clear;
      var tg = mechToggles();
      if (!c || !(c.perShot > 0)) {
        if (tg) {
          host.innerHTML = tg;
          lab.textContent = '可装机制卡';
          card.hidden = false;
          return;
        }
        host.innerHTML = '';
        card.hidden = true;
        return;
      }
      var hit = +best.hitDmg || 0, rate = +c.rate || 0;
      var CLEAR_EN = { '主目标': 'Main Target', '径向溅射': 'Radial Splash', '爆炸引爆': 'Blast Detonation',
        '电链': 'Chain Lightning', '毒气云': 'Gas Cloud' };
      function clearRowName(cn, en) { return langIx() === 2 ? en : cn; }
      var rows = [];
      rows.push([clearRowName('主目标', 'Main Target'), hit, rate > 0 ? hit * rate : hit,
        '被直接命中的那一只（直击 + 径向两段相加）']);
      if (c.radial > 0) {
        rows.push([clearRowName('径向溅射', 'Radial Splash'), c.radial, c.radial * rate,
          '半径 ' + fmt(c.radR, 1) + ' m 内每只各吃一份 · 边缘按衰减系数折成面积加权 · 该形态径向占 ' +
          fmt(c.radShare * 100, 0) + '%']);
      }
      if (c.blast > 0) rows.push([clearRowName('爆炸引爆', 'Blast Detonation'), c.blast, c.blast * rate,
        '满 10 层或目标死亡时结算，5 m 内每层 300%']);
      if (c.electric > 0) rows.push([clearRowName('电链', 'Chain Lightning'), c.electric, c.electric * rate,
        '3 m 内 50% 攻击伤害（已剔掉主目标那份）']);
      if (c.gas > 0) rows.push([clearRowName('毒气云', 'Gas Cloud'), c.gas, c.gas * rate,
        '3→6 m，命中数按面积 (r/3)²']);
      if (c.napalm > 0) {
        var _nw = window.ZKNAME.modById('nightwatch_napalm');
        rows.push([_nw ? window.ZKNAME.mod(_nw) : '夜巡燃烧弹', c.napalm, c.napalm * rate,
          '每跳 ' + fmt(c.napalmTick, 1) + ' 火伤 × ' + c.napalmTicks +
          ' 跳 · 覆盖 ' + fmt(c.napalmArea * 100, 0) + '% 爆炸面积 · 多重每发多叠一层 · ' +
          '只吃基伤/派系，不吃元素与暴击']);
      }
      var tb = '';
      rows.forEach(function (r, i) {
        tb += '<tr>' +
          '<td>' + esc(r[0]) + '<span class="g-dd">' + esc(r[3]) + '</span></td>' +
          '<td>' + (r[1] > 0 ? fmt(Math.round(r[1]), 0) : '—') + '</td>' +
          '<td>' + (r[2] > 0 ? fmt(Math.round(r[2]), 0) : '—') + '</td>' +
          '<td>' + (i === 0 ? '—' : fmt(r[1] / (hit + c.perShot) * 100, 1) + '%') + '</td>' +
          '</tr>';
      });
      var html = (tg || '') +
        '<div class="g-tscroll"><table class="g-t"><thead><tr>' +
        '<th>通道</th><th>每发</th><th>每秒</th><th>占总输出</th>' +
        '</tr></thead><tbody>' + tb + '</tbody></table></div>';
      if (c.acid > 0 || c.acidEquiv > 0) {
        html += '<p class="g-hint g-acidnote">酸性弹药（<b>按击杀触发</b>，不是按发）：' +
          '450 腐蚀（过护甲后 <b>' + fmt(Math.round(c.acidFlat), 0) + '</b>）＋' +
          '45% 敌方最大生命 · 半径 ' + fmt(c.acidR, 0) + ' m · ' +
          '等效 <b>每次击杀让周围每只敌人掉 ' + fmt(c.acidEquiv * 100, 1) + '% 血</b>' +
          '（45% × 护甲保留 × 群体）。45% 那项是相对血量，' +
          '引擎没有敌人血量数据，编一张「等级 → 血量」表就是自造系数，' +
          '所以这里只给比例口径、不折绝对伤害，也不计钢铁之路的额外血量。</p>';
      }
      host.innerHTML = html;
      lab.textContent = '群体占 ' + fmt(c.share * 100, 1) + '%' +
        (c.radArea > 0 ? ' · 覆盖半径 ' + fmt(c.radR, 1) + ' m（' +
          fmt(Math.round(c.radArea), 0) + ' m²）' : '');
      card.hidden = false;
    }
    dmgImportHook = function (p) {
      if (!p || p.wi < 0) return false;
      var w = WEAPONS[p.wi];
      var d = mapWeapon(w);
      if (!d) {
        var zk = ZK_EN[nrm(w.en || '')] || ZK_EN[nrm(w.intl || '')] || ZK_EN[nrm(w.cn || '')];
        if (!zk) return false;
        state.zk = zk; state.id = 'zk:' + zk.en;
      } else {
        state.zk = null; state.id = d.i;
      }
      var C = cur();
      var avail = {};
      catalog(C).forEach(function (x) { avail[x.row] = 1; });
      var out = [null, null, null, null], any = false;
      for (var i = 0; i < 4; i++) {
        var row = +p.rows[i] || 0;
        if (!row) continue;
        var mag = Math.abs(parseFloat(p.vals[i]));
        if (!isFinite(mag)) mag = 0;
        var v = (i === 3 ? -1 : 1) * mag;           /* 第 4 槽是负面，卡面印绝对值 */
        if (row === RECOIL) v = -v;                 /* 总则 A-1：后坐力方向相反 */
        out[i] = { row: row, v: v };                /* 02 输入框同构：位置即正负，固定 4 槽 */
        any = true;
      }
      if (any) state.slots = out;
      else state.slots = state.slots.map(function (s) { return (s && s.row && avail[s.row]) ? s : null; });
      selArch = null;
      $('g-q').value = '';
      $('g-hits').classList.remove('on');
      render();
      return true;
    };
    var kk = (typeof K !== 'undefined') ? K : null;
    if (kk && kk.w) {
      var wi0 = WEAPONS.indexOf(kk.w);
      if (wi0 >= 0) dmgImportHook({ wi: wi0, comboIdx: kk.comboIdx, rows: kk.rows.slice(), vals: kk.vals.slice() });
    }
    window.ZKDMG = {
      lang: function () { render(); }
    };
    render();
    advHint();
  }
})();
