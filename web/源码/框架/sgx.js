(function(){
  function start(){
  var D = window.ZKDATA || {}, P = D.params || {}, ZKC = window.ZKC;
  if (!D.stats || !P.combo || !ZKC) { window.__sgxFail = 'deps'; return; }
  var CATS = ['步枪', '霰弹', '手枪', '曲翼', '近战'];
  var LANG_KEY = ['cn', 'intl', 'en'];          /* 与 app.js 的 STAT_KEY 一致 */
  var NON_PCT = (window.RULES && window.RULES.NON_PCT) || [20, 27, 28, 34];
  var FACTION = (window.RULES && window.RULES.FACTION_DROWS) || [16, 17, 18, 42, 43, 44];
  var RECOIL = (window.RULES && typeof window.RULES.RECOIL_ROW === 'number') ? window.RULES.RECOIL_ROW : 25;
  var NEG_ONLY = (window.RULES && typeof window.RULES.NEG_ONLY_ROW === 'number') ? window.RULES.NEG_ONLY_ROW : 30;
  var MELEE_POS = (window.RULES && window.RULES.ZK_MELEE_POS) || [2, 3, 9, 10, 11, 12, 27, 29];
  var RANGED_POS = (window.RULES && window.RULES.ZK_RANGED_POS) || [9, 10, 11, 12, 20];
  var COLS = [
    { p: 3, n: 1, gain: true },
    { p: 2, n: 1, gain: true },
    { p: 3, n: 0, gain: true },
    { p: 2, n: 0, gain: true },
    { p: 3, n: 1, gain: false },
    { p: 2, n: 1, gain: false }
  ];
  var TXT = {
    title:  ['属性数值速查', '属性数值速查', 'Stat Value Reference'],
    note:   ['按 基准值 × 布局系数 × 倾向 × 浮动 实时算出，满级口径；后两列为负词条扣减值',
             '按 基准值 × 布局系数 × 倾向 × 浮动 实时算出，满级口径；后两列为负词条扣减值',
             'Real-time from base × layout × disposition × roll. Max rank; last two columns are the negative (Malus) rolls.'],
    stat:   ['词条', '词条', 'Stat'],
    subN:   ['普通词条', '普通词条', 'Normal stats'],
    subNe:  ['任何紫卡都可能洗出', '任何紫卡都可能洗出', 'Can appear on any riven'],
    subF:   ['融合词条', '融合词条', 'Spliced stats'],
    subFe:  ['只能靠融合得到，洗不出来', '只能靠融合得到，洗不出来', 'Fusion-only, cannot be rolled'],
    cnt:    [' 条', ' 条', ' stats']
  };
  var HEAD = [
    ['3+1', '3正1负', '3+1'], ['2+1', '2正1负', '2+1'],
    ['3+0', '3正0负', '3+0'], ['2+0', '2正0负', '2+0'],
    ['3+1 负', '3正1负 · 负词条', '3+1 Malus'], ['2+1 负', '2正1负 · 负词条', '2+1 Malus']
  ];
  function lg() { return window.ZKLANGI ? (+window.ZKLANGI() || 0) : 1; }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function comboIdxOf(nPos, nNeg) { return nPos >= 3 ? (nNeg ? 3 : 2) : (nNeg ? 1 : 0); }
  function coefOf(c) {
    var k = P.combo[comboIdxOf(c.p, c.n)];
    return c.gain ? k.gain : Math.abs(k.neg);
  }
  var ROWMAP = {};
  (function () {
    for (var i = 0; i < D.stats.length; i++) ROWMAP[D.stats[i].row] = D.stats[i];
  })();
  function statName(row) {
    var s = ROWMAP[row];
    return s ? (s[LANG_KEY[lg()]] || s.cn || s.intl || s.en || '') : '';
  }
  function catName(cat) {
    var a = P.catName && P.catName[cat];
    return a ? (a[lg()] || a[0]) : cat;
  }
  function cell(row, v, isPos) {
    if (!isFinite(v)) return '';
    var s = Math.round(v * 100) / 100;
    if (FACTION.indexOf(row) >= 0) return '\u00d7' + (isPos ? 1 + s / 100 : 1 - s / 100).toFixed(2);
    if (row === RECOIL) return (s >= 0 ? '+' : '') + s.toFixed(2) + '%';
    var sg = s < 0 ? '' : (isPos ? '+' : '-');
    return sg + s.toFixed(2) + (NON_PCT.indexOf(row) >= 0 ? '' : '%');
  }
  function curSel() {
    var w = window.ZK_SEL;
    return (w && w.cat && P.catName && P.catName[w.cat]) ? w : null;
  }
  function dispFor(cat) {
    var w = curSel();
    return (w && w.cat === cat) ? ZKC.disp(w) : ZKC.disp();
  }
  function range(row, cat, col) {
    var ci = ZKC.CAT_COL[cat];
    var st = ROWMAP[row];
    var base = (st && st.v) ? st.v[ci] : null;
    if (base === null || base === undefined || !isFinite(base)) return null;
    var coef = coefOf(col);
    if (!isFinite(coef) || coef <= 0) return null;
    var isPos = col.gain;
    var isFac = FACTION.indexOf(row) >= 0;
    var b = isFac ? (base - 1) * 100 : base;
    var maxRank = isFinite(P.maxRank) ? P.maxRank : 8;
    var f = b * coef * dispFor(cat) * ((maxRank + 1) / 9);
    if (row === RECOIL && isPos) f = -f;
    var lo = f * P.lo, hi = f * P.hi;
    if (!isPos && isFac) { var t = lo; lo = hi; hi = t; }
    return { a: cell(row, lo, isPos), b: cell(row, hi, isPos) };
  }
  function boxOf(row, cat, col) {
    var isPos = col.gain;
    if (isPos && row === NEG_ONLY) return '<span class="sgx-box na">\u2014</span>';
    if (!isPos) {
      var isMelee = cat === '近战';
      var alwaysPos = (row >= 35 && row <= 52) || (isMelee ? MELEE_POS : RANGED_POS).indexOf(row) >= 0;
      if (alwaysPos) return '<span class="sgx-box na">\u2014</span>';
    }
    var r = range(row, cat, col);
    if (!r) return '<span class="sgx-box na">\u2014</span>';
    var cls = 'sgx-box' + (isPos ? '' : ' neg');
    return '<span class="' + cls + '">' + esc(r.a) + '<i>\u2014</i><b>' + esc(r.b) + '</b></span>';
  }
  function rowList(cat, fuse) {
    var out = [], f0 = ZKC.FUSE_FROM, f1 = ZKC.FUSE_TO;
    var ci = ZKC.CAT_COL[cat];
    var rows = [];
    for (var i = 0; i < D.stats.length; i++) rows.push(D.stats[i].row);
    rows.sort(function (a, b) { return a - b; });
    for (var k = 0; k < rows.length; k++) {
      var row = rows[k];
      var isF = (row >= f0 && row <= f1);
      if (isF !== !!fuse) continue;
      var v = ROWMAP[row] && ROWMAP[row].v;
      if (!v || v[ci] === null || v[ci] === undefined || !isFinite(v[ci])) continue;
      out.push(row);
    }
    return out;
  }
  function body(cat, fuse) {
    var rows = rowList(cat, fuse), h = '';
    if (!rows.length) return '<tr><td colspan="7" class="sgx-nm">\u2014</td></tr>';
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      h += '<tr data-r="' + row + '"><td class="sgx-nm"><b>' + esc(statName(row)) + '</b></td>';
      for (var j = 0; j < COLS.length; j++) {
        h += '<td class="sgx-c' + (COLS[j].gain ? '' : ' mal') + '">' + boxOf(row, cat, COLS[j]) + '</td>';
      }
      h += '</tr>';
    }
    return h;
  }
  function head() {
    var L = lg(), h = '<th>' + esc(TXT.stat[L]) + '</th>';
    for (var i = 0; i < 6; i++) {
      h += '<th' + (i >= 4 ? ' class="mal"' : '') + '>'
        + esc(L === 2 ? HEAD[i][2] : HEAD[i][0])
        + (L === 2 ? '' : '<span>' + esc(HEAD[i][1]) + '</span>') + '</th>';
    }
    return h;
  }
  function labels() {
    var L = lg(), g = function (id) { return document.getElementById(id); };
    var el;
    if ((el = g('sgxTitle'))) el.textContent = TXT.title[L];
    if ((el = g('sgxNote'))) el.textContent = TXT.note[L];
    if ((el = g('sgxSubN'))) el.textContent = TXT.subN[L];
    if ((el = g('sgxSubNe'))) el.textContent = TXT.subNe[L];
    if ((el = g('sgxSubF'))) el.textContent = TXT.subF[L];
    if ((el = g('sgxSubFe'))) el.textContent = TXT.subFe[L];
    if ((el = g('sgxHeadN'))) el.innerHTML = head();
    if ((el = g('sgxHeadF'))) el.innerHTML = head();
  }
  function selChip() {
    var el = document.getElementById('sgxSel');
    if (!el) return;
    var w = curSel(), L = lg();
    if (!w || w.cat !== cur || CATS.indexOf(w.cat) < 0) {
      el.hidden = true; el.textContent = ''; el.removeAttribute('title');
      return;
    }
    var d = ZKC.disp(w), uni = ZKC.isUnified();
    var nm = w[LANG_KEY[L]] || w.cn || w.en || '';
    el.hidden = false;
    el.textContent = (L === 2 ? 'per ' : '按「') + nm
      + (L === 2 ? ' · disp ' : '」· 倾向 ') + d.toFixed(2)
      + (uni ? (L === 2 ? ' (global)' : '（统一）') : '');
    el.title = L === 2
      ? 'This table is calculated with ' + nm + "'s disposition " + d.toFixed(2)
        + (uni ? '; all weapons share one disposition right now, so the numbers do not change per weapon.' : '.')
      : '本表按「' + nm + '」的倾向 ' + d.toFixed(2) + ' 计算'
        + (uni ? '；当前全库倾向统一，换同类别武器数值不变。' : '（选别的武器会跟着变）。');
  }
  var cur = null;
  function paint(cat) {
    if (cat) cur = cat;
    if (!cur) cur = '步枪';
    var bs = document.querySelectorAll('#sgxCats .sgx-cat');
    for (var i = 0; i < bs.length; i++) {
      var on = bs[i].getAttribute('data-cat') === cur;
      bs[i].className = 'sgx-cat' + (on ? ' on' : '');
      bs[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    var n = document.getElementById('sgxBodyN'), f = document.getElementById('sgxBodyF');
    if (n) n.innerHTML = body(cur, false);
    if (f) f.innerHTML = body(cur, true);
    var c = document.getElementById('sgxCnt');
    if (c) {
      var a = rowList(cur, false).length, b = rowList(cur, true).length;
      c.textContent = catName(cur) + ' \u00b7 ' + a + ' + ' + b + TXT.cnt[lg()];
    }
    selChip();
  }
  function cats() {
    var wrap = document.getElementById('sgxCats');
    if (!wrap) return;
    var h = '', first = null;
    for (var i = 0; i < CATS.length; i++) {
      if (!P.catName || !P.catName[CATS[i]]) continue;
      if (!first) first = CATS[i];
      h += '<button type="button" class="sgx-cat" data-cat="' + CATS[i] + '">' + esc(catName(CATS[i])) + '</button>';
    }
    wrap.innerHTML = h;
    wrap.onclick = function (e) {
      var el = e.target;
      while (el && el !== wrap && !el.getAttribute('data-cat')) el = el.parentElement;
      if (el && el !== wrap) paint(el.getAttribute('data-cat'));
    };
  }
  function redraw() { cats(); labels(); paint(cur); }
  function follow() {
    var w = curSel();
    if (w && CATS.indexOf(w.cat) >= 0 && P.catName && P.catName[w.cat]) cur = w.cat;
    paint(cur);
  }
  window.ZKSGXAPI = { redraw: redraw, range: range, rowList: rowList, cell: cell, follow: follow };
  function boot() {
    if (!document.getElementById('sgxCats')) return;
    follow();
    redraw();
    var btns = document.querySelectorAll('[data-a="lang"]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () { setTimeout(redraw, 0); });
    }
    window.addEventListener('hashchange', function () {
      if ((location.hash || '').indexOf('/ranges') >= 0) follow();
    });
    window.addEventListener('zkdispchange', function () { follow(); redraw(); });
  }
  boot();
  }
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start);
})();
