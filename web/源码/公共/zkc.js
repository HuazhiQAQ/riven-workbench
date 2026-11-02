window.ZKC = (function (g) {
  var R = g.RULES || {};
  var D = (g.ZKDATA && g.ZKDATA.params) || {};
  var ROWS = (g.ZKDATA && g.ZKDATA.rows) || {};
  var HAS_UNIFIED = (typeof R.DISP_UNIFIED === 'number');
  var DISP = HAS_UNIFIED ? R.DISP_UNIFIED
           : (typeof D.defaultDisp === 'number') ? D.defaultDisp : 1.2;
  var UNIFIED_VAL = HAS_UNIFIED ? R.DISP_UNIFIED : 1.2;
  var BUILD_VARIANT = !HAS_UNIFIED;
  var ORIG_DISP = null;                  /* 本构建 weapons[*].disp 的出厂值，切回现行版时恢复 */
  function setTitleSuffix(on) {
    if (!g.document) return;
    var t = String(g.document.title || '').replace(/ · 倾向版/g, '');
    if (on) t += ' · 倾向版';
    g.document.title = t;
  }
  function applyMode(m, persist) {
    var z = g.ZKDATA || {};
    var snap = z.dispSnapshot, list = z.weapons;
    if (!ORIG_DISP && list) {
      ORIG_DISP = list.map(function (w) { return (w && typeof w.disp === 'number') ? w.disp : UNIFIED_VAL; });
    }
    var variant = m === 'v' && !!(snap && list && snap.length === list.length);
    R.DISP_UNIFIED = variant ? null : UNIFIED_VAL;
    HAS_UNIFIED = typeof R.DISP_UNIFIED === 'number';
    DISP = HAS_UNIFIED ? R.DISP_UNIFIED
         : (typeof D.defaultDisp === 'number') ? D.defaultDisp : 1.2;
    if (list) {
      for (var i = 0; i < list.length; i++) {
        var w = list[i]; if (!w) continue;
        w.disp = (variant && typeof snap[i] === 'number') ? snap[i] : ORIG_DISP[i];
      }
      var meta = z.meta || (z.meta = {});
      meta.dispositionUnified = variant ? null : String(UNIFIED_VAL);
      meta.note = variant
        ? '倾向版：每把武器按自己的倾向计算（取自历史倾向快照）'
        : '游戏已取消倾向变动，全库武器倾向统一 ' + UNIFIED_VAL;
      meta.dispSnapshotNote = variant
        ? '历史倾向值快照（按 weapons 下标一一对应）；当前即按这些值生效'
        : '「最后时光的武器倾向表」用的历史倾向值快照（按 weapons 下标一一对应）';
    }
    if (g.document && g.document.body) {
      if (variant) g.document.body.setAttribute('data-disp-variant', '');
      else g.document.body.removeAttribute('data-disp-variant');
    }
    fillDispText();
    setTitleSuffix(variant);
    try { g.dispatchEvent(new CustomEvent('zkdispchange')); }
    catch (e) { if (g.ZKHTML && ZKHTML.warn) ZKHTML.warn('公共/zkc.js:emit', e); }
    return variant;
  }
  function setDispMode(m) { return applyMode(m === 'v' ? 'v' : 'u', false); }
  applyMode('u', false);
  var FUSE_FROM = (typeof R.ZK_FUSE_FROM === 'number') ? R.ZK_FUSE_FROM
                : (typeof ROWS.fuseFrom === 'number') ? ROWS.fuseFrom : 35;
  var FUSE_TO = (typeof R.ZK_FUSE_TO === 'number') ? R.ZK_FUSE_TO
              : (typeof ROWS.fuseTo === 'number') ? ROWS.fuseTo : 52;
  var ROLL_FROM = (typeof ROWS.rollFrom === 'number') ? ROWS.rollFrom : 2;
  var ROLL_TO = (typeof ROWS.rollTo === 'number') ? ROWS.rollTo : 34;
  var FACTION = R.FACTION_DROWS || [16, 17, 18, 42, 43, 44];
  var NON_PCT = R.NON_PCT || [20, 27, 28, 34];
  var RECOIL_ROW = (typeof R.RECOIL_ROW === 'number') ? R.RECOIL_ROW : 25;
  var NM = g.ZKNAMES || {};
  var CAT_COL = R.CAT_COL || (function () {
    var m = {}, t = NM.types || [], i;
    for (i = 0; i < t.length; i++) if (t[i] && t[i].key) m[t[i].key] = +t[i].col || 0;
    return m;
  })();
  function isFuseRow(row) { row = +row || 0; return row >= FUSE_FROM && row <= FUSE_TO; }
  function isRollRow(row) { row = +row || 0; return row >= ROLL_FROM && row <= ROLL_TO; }
  function isFactionRow(row) { return FACTION.indexOf(+row) >= 0; }
  function isPctRow(row) { return !isFactionRow(row) && NON_PCT.indexOf(+row) < 0; }
  var _dispIx = null;
  function dispIx() {
    if (_dispIx) return _dispIx;
    var m = {}, list = (g.ZKDATA && g.ZKDATA.weapons) || [], i, j, ks, n;
    for (i = 0; i < list.length; i++) {
      if (!list[i]) continue;
      ks = [list[i].en, list[i].intl, list[i].cn];
      for (j = 0; j < ks.length; j++) {
        n = norm(ks[j]);
        if (n && m[n] == null) m[n] = list[i];
      }
    }
    _dispIx = m;
    return m;
  }
  function dispRec(w) {
    var list = (g.ZKDATA && g.ZKDATA.weapons) || [];
    if (!w) return null;
    if (typeof w === 'string') return dispIx()[norm(w)] || null;
    if (typeof w.idx === 'number' && list[w.idx]) return list[w.idx];
    var m = dispIx(), n;
    n = norm(w.n); if (n && m[n]) return m[n];
    n = norm(w.en); if (n && m[n]) return m[n];
    n = norm(w.intl); if (n && m[n]) return m[n];
    n = norm(w.cn); if (n && m[n]) return m[n];
    n = norm(w.n);
    if (n) {
      var a = (w.s === 's') ? 'secondary' : 'primary', b = (a === 'primary') ? 'secondary' : 'primary';
      if (m[n + a]) return m[n + a];
      if (m[n + b]) return m[n + b];
    }
    return null;
  }
  function disp(w) {
    if (HAS_UNIFIED) return DISP;
    if (w && isFinite(+w.disp) && +w.disp > 0) return +w.disp;
    var r = dispRec(w);
    if (r && isFinite(+r.disp) && +r.disp > 0) return +r.disp;
    return DISP;
  }
  function dispReal(w) {
    var z = g.ZKDATA || {};
    var snap = z.dispSnapshot, list = z.weapons;
    if (w && snap && list) {
      var i = (typeof w.idx === 'number' && list[w.idx] && list[w.idx].cn === w.cn) ? w.idx : list.indexOf(w);
      if (i >= 0 && isFinite(+snap[i]) && +snap[i] > 0) return +snap[i];
    }
    if (w && !HAS_UNIFIED && isFinite(+w.disp) && +w.disp > 0) return +w.disp;
    return DISP;
  }
  function dispText(w) { return disp(w).toFixed(2); }   /* 全站倾向统一两位：1.20 */
  function isUnified() { return HAS_UNIFIED; }
  function typeName(cat, lang) {
    var t = NM.types || [], i;
    for (i = 0; i < t.length; i++) {
      if (!t[i] || t[i].key !== cat) continue;
      return lang === 2 ? (t[i].en || cat) : lang === 1 ? (t[i].intl || cat) : cat;
    }
    return cat;
  }
  function typeAlias(t) {
    var m = NM.typeAlias || {};
    return (m[t] != null) ? m[t] : t;
  }
  function catCol(cat) {
    var v = CAT_COL[cat];
    return (typeof v === 'number') ? v : -1;
  }
  function dirOf(row) { return row === RECOIL_ROW ? -1 : 1; }
  function asmFind(list, id) {
    for (var i = 0; i < (list || []).length; i++) if (list[i].i === id) return list[i];
    return null;
  }
  function ldSide(x) {
    var P = (g.RULES && g.RULES.ZK_KIT_LD_P) || {};
    return P[x && x.i] ? 'p' : 's';
  }
  var LICH_EL = R.ZK_LICH_EL || ['impact', 'cold', 'heat', 'toxin', 'electricity', 'radiation', 'magnetic'];
  var LICH_PCT = (typeof R.ZK_LICH_PCT === 'number') ? R.ZK_LICH_PCT : 60;
  var LICH_EN_RE = /\b(kuva|tenet|coda)\b/i;
  var LICH_CN_RE = /赤毒|信条|终幕/;
  var LICH_DEF = LICH_EL.indexOf('heat') >= 0 ? 'heat' : LICH_EL[0];
  function lichEl(k) { return LICH_EL.indexOf(k) >= 0 ? k : LICH_DEF; }
  function isLich(w) {
    if (!w) return false;
    if (LICH_EN_RE.test(String(w.en || w.intl || w.n || ''))) return true;
    return LICH_CN_RE.test(String(w.cn || w.z || ''));
  }
  function lichAdd(w, el) {
    if (!w) return w;
    var k, dm = {}, tot = 0;
    var base = (w.at && w.at.dmg) || {};
    for (k in base) if (Object.prototype.hasOwnProperty.call(base, k)) { dm[k] = base[k]; tot += +base[k] || 0; }
    var add = Math.round(tot * (LICH_PCT / 100) * 10) / 10;
    if (add > 0) dm[el] = (dm[el] || 0) + add;
    var at = {}, out = {};
    for (k in (w.at || {})) if (Object.prototype.hasOwnProperty.call(w.at, k)) at[k] = w.at[k];
    at.dmg = dm;
    for (k in w) if (Object.prototype.hasOwnProperty.call(w, k)) out[k] = w[k];
    out.at = at;
    return out;
  }
  function fillDispText() {
    if (!g.document || !g.document.querySelectorAll) return;
    var ns = g.document.querySelectorAll('[data-disp-text]');
    for (var i = 0; i < ns.length; i++) ns[i].textContent = dispText();
  }
  var SEP_RE = /[\s\u00A0\u3000·・•∙⋅。.,，、､;；:：'"“”‘’\u0060()（）\[\]【】{}｛｝\-_—–－‒~～!！?？/\\|+*#&@^×]/g;
  var VAR_TOK = (function () {
    var a = [], v = NM.variants || [], i;
    for (i = 0; i < v.length; i++) {
      if (!v[i] || v[i].strip === false) continue;
      if (v[i].cn) a.push(String(v[i].cn).toLowerCase());
      if (v[i].en) a.push(String(v[i].en).toLowerCase());
    }
    return a;
  })();
  function norm(s) {
    var t = String(s == null ? '' : s);
    if (t.normalize) t = t.normalize('NFKC');      // 老浏览器没有就按原文
    return t.replace(SEP_RE, '').toLowerCase();
  }
  function coreOf(s) {
    var t = norm(s);
    for (var i = 0; i < VAR_TOK.length; i++) t = t.split(VAR_TOK[i]).join('');
    return t;
  }
  var ALIAS = NM.alias || {};
  function aliasNorm(s) {
    var t = norm(s);
    for (var k in ALIAS) if (Object.prototype.hasOwnProperty.call(ALIAS, k)) {
      var nk = norm(k);
      if (nk && t.indexOf(nk) >= 0) t = t.split(nk).join(norm(ALIAS[k]));
    }
    return t;
  }
  var FAC = (function () {
    var m = {}, f = NM.factions || [], i, j, w;
    for (i = 0; i < f.length; i++) {
      if (!f[i] || !f[i].key) continue;
      for (j = 0; j < (f[i].words || []).length; j++) {
        w = String(f[i].words[j]).toLowerCase();
        if (w) m[w] = f[i].key;
      }
    }
    return m;
  })();
  var STAT_DROP_EN = /\b(damage|vs\.?|versus|to|for|against)\b/g;
  function statCanon(s) {
    var t = String(s == null ? '' : s).toLowerCase(), k;
    t = t.replace(STAT_DROP_EN, ' ');
    t = t.replace(/对/g, ' ').replace(/伤害/g, ' ').replace(/的/g, ' ');
    for (k in FAC) if (Object.prototype.hasOwnProperty.call(FAC, k)) {
      if (t.indexOf(k) >= 0) t = t.split(k).join(' ' + FAC[k] + ' ');
    }
    return norm(t);
  }
  var SK = NM.statKeys || [];
  var _skK = {}, _skN = {};
  (function () {
    for (var i = 0; i < SK.length; i++) {
      var e = SK[i];
      if (!e || !e.key) continue;
      _skK[e.key] = e;
      var ns = [e.cn, e.short, e.en, e.enFull, e.eng].concat(e.alias || []);
      for (var j = 0; j < ns.length; j++) {
        var n = norm(ns[j]);
        if (n && _skN[n] == null) _skN[n] = e.key;
      }
    }
  })();
  function statRowName(row, lang) {
    var arr = (g.ZKDATA && g.ZKDATA.stats) || [], i, st;
    if (row == null || row === '') return '';
    for (i = 0; i < arr.length; i++) {
      st = arr[i] || {};
      if (+st.row !== +row) continue;
      if (lang === 2) return st.en || st.cn || '';
      if (lang === 1) return st.intl || st.cn || '';
      return st.cn || st.intl || '';
    }
    return '';
  }
  function statNameByKey(k, lang) {
    var e = _skK[k];
    if (!e) return k;
    if (lang === 2) return e.enFull || e.en || e.cn || k;
    if (lang === 1) return statRowName(e.row, 1) || e.cn || k;
    return e.cn || k;
  }
  function statShort(k) {
    var e = _skK[k];
    return (e && (e.short || e.cn)) || k;
  }
  function statEngineName(k) {
    var e = _skK[k];
    return (e && (e.eng || e.cn)) || k;
  }
  function statKeyOf(s) { return _skN[norm(s)] || ''; }
  function statMap(field) {
    var m = {}, i;
    for (i = 0; i < SK.length; i++) {
      if (!SK[i] || !SK[i].key) continue;
      m[SK[i].key] = SK[i][field] || SK[i].cn || SK[i].key;
    }
    return m;
  }
  var _sIx = null, _sList = null;
  function _statRows(list) {
    if (_sIx && _sList === list) return _sIx;
    var ix = {};
    for (var i = 0; i < list.length; i++) {
      var st = list[i] || {};
      var keys = [st.cn, st.intl, st.en, statCanon(st.cn), statCanon(st.en)];
      for (var j = 0; j < keys.length; j++) {
        var c = j < 3 ? norm(keys[j]) : keys[j];
        if (!c) continue;
        (ix[c] = ix[c] || []).push(+st.row);
      }
    }
    _sIx = ix; _sList = list;
    return ix;
  }
  function matchStat(q, list) {
    list = list || (g.ZKDATA && g.ZKDATA.stats) || [];
    var k = statKeyOf(q);
    if (k) {
      var row = _skK[k] && _skK[k].row;
      if (row) {
        for (var n = 0; n < list.length; n++) if (+list[n].row === +row) return +row;
        return +row;
      }
    }
    var keys = [norm(q), statCanon(q)];
    var ix = _statRows(list), i, rows;
    for (i = 0; i < keys.length; i++) {
      if (!keys[i]) continue;
      rows = ix[keys[i]];
      if (!rows || !rows.length) continue;
      for (var j = 0; j < rows.length; j++) if (rows[j] >= ROLL_FROM && rows[j] <= ROLL_TO) return rows[j];
      return rows[0];
    }
    return 0;
  }
  var _mIx = null, _mList = null;
  function _buildIx(list) {
    if (_mIx && _mList === list) return _mIx;
    var ix = {};
    function add(k, i, w) { if (k) (ix[k] = ix[k] || []).push({ i: i, w: w }); }
    for (var i = 0; i < list.length; i++) {
      var w = list[i] || {};
      var full = [w.cn, w.intl, w.en], base = [w.bcn, w.bintl, w.ben];
      for (var a = 0; a < 3; a++) {
        add(norm(full[a]), i, 100);
        add(norm(base[a]), i, 88);
        add(coreOf(full[a]), i, 70);
        add(coreOf(base[a]), i, 66);
      }
    }
    var AL = ALIAS, byCN = {};
    for (var j = 0; j < list.length; j++) if (list[j].cn && byCN[list[j].cn] == null) byCN[list[j].cn] = j;
    for (var nick in AL) if (Object.prototype.hasOwnProperty.call(AL, nick)) {
      var k = byCN[AL[nick]];
      if (k == null) continue;
      add(norm(nick), k, 95);
      add(coreOf(nick), k, 92);
    }
    _mIx = ix; _mList = list;
    return ix;
  }
  function matchWeapons(q, list, limit) {
    list = list || [];
    var nq = aliasNorm(q), cq = aliasNorm(coreOf(q));
    if (!nq) return [];
    var ix = _buildIx(list), sc = {}, order = [];
    function bump(i, w) {
      if (sc[i] == null) { sc[i] = w; order.push(i); }
      else if (w > sc[i]) sc[i] = w;
    }
    var hit = ix[nq], j, arr;
    if (hit) for (j = 0; j < hit.length; j++) bump(hit[j].i, hit[j].w + 8);
    if (cq && cq !== nq) {
      hit = ix[cq];
      if (hit) for (j = 0; j < hit.length; j++) bump(hit[j].i, Math.min(hit[j].w, 74));
    }
    if (nq.length >= 2) {
      for (var key in ix) if (Object.prototype.hasOwnProperty.call(ix, key)) {
        if (key === nq || key === cq) continue;
        var pos = key.indexOf(nq);
        if (pos < 0 && cq.length >= 2) pos = key.indexOf(cq);
        if (pos < 0) continue;
        arr = ix[key];
        for (j = 0; j < arr.length; j++) bump(arr[j].i, (pos === 0 ? 50 : 38) + (arr[j].w >= 88 ? 4 : 0));
      }
    }
    var out = order.slice();
    out.sort(function (a, b) {
      if (sc[b] !== sc[a]) return sc[b] - sc[a];
      var wa = list[a] || {}, wb = list[b] || {};
      var ba = wa.var === '本体' ? 1 : 0, bb = wb.var === '本体' ? 1 : 0;
      if (ba !== bb) return bb - ba;
      return String(wa.en || '').length - String(wb.en || '').length || a - b;
    });
    return out.slice(0, limit || 40);
  }
  if (g.document) {
    if (g.document.readyState === 'loading') g.document.addEventListener('DOMContentLoaded', fillDispText);
    else fillDispText();
  }
  return {
    disp: disp, dispRec: dispRec, dispReal: dispReal, dispText: dispText, isUnified: isUnified, fillDispText: fillDispText,
    setDispMode: setDispMode, applyMode: applyMode,
    isFuseRow: isFuseRow, isRollRow: isRollRow,
    isFactionRow: isFactionRow, isPctRow: isPctRow,
    catCol: catCol, CAT_COL: CAT_COL, dirOf: dirOf, asmFind: asmFind, ldSide: ldSide,
    isLich: isLich, lichAdd: lichAdd, lichEl: lichEl,
    LICH_EL: LICH_EL, LICH_PCT: LICH_PCT, LICH_DEF: LICH_DEF,
    FUSE_FROM: FUSE_FROM, FUSE_TO: FUSE_TO, ROLL_FROM: ROLL_FROM, ROLL_TO: ROLL_TO,
    norm: norm, coreOf: coreOf, matchWeapons: matchWeapons, aliasNorm: aliasNorm, ALIAS: ALIAS,
    typeName: typeName, typeAlias: typeAlias, NAMES: NM,
    statCanon: statCanon, matchStat: matchStat,
    statNameByKey: statNameByKey, statRowName: statRowName, statShort: statShort, statEngineName: statEngineName,
    statKeyOf: statKeyOf, statMap: statMap
  };
})(window);
