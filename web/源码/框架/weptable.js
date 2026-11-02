  (function () {
    var Z = window.ZKDATA; if (!Z || !Z.weapons) return;
    var host = document.getElementById('dispTbl'); if (!host) return;
    var STAR = [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5];
    var ZAW_NAMES = window.RULES.ZK_ZAW_NAMES;
    var KIT_NAMES = window.RULES.ZK_KIT_NAMES;
    var COMPANION_NAMES = window.RULES.ZK_COMPANION_NAMES;
    var SNAP = Z.dispSnapshot || null;
    function dispOf(i) {
      if (SNAP && SNAP.length > i && SNAP[i] != null) return SNAP[i];
      var w = Z.weapons[i];
      return w ? (w.disp || 0) : 0;
    }
    function renderNote() {
      var box = document.getElementById('dispNote'); if (!box) return;
      var vals = [];
      for (var i = 0; i < Z.weapons.length; i++) {
        var v = dispOf(i); if (isFinite(v) && v > 0) vals.push(v);
      }
      if (!vals.length) { box.style.display = 'none'; return; }
      var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
      var kinds = {}; vals.forEach(function (v) { kinds[v] = 1; });
      var live = ZKC.disp();
      var tail = ZKC.isUnified()
        ? '计算紫卡数值时生效的倾向统一为 <b>' + live.toFixed(1) + '</b>，本表仅作查考。'
        : '计算紫卡数值时就按各武器自己的倾向（即本表数值）生效。';
      box.innerHTML = '本表陈列 <b>' + vals.length + '</b> 把武器在倾向变动还在时各自的倾向值，'
        + '共 <b>' + Object.keys(kinds).length + '</b> 种，区间 <b>' + lo.toFixed(2) + ' – ' + hi.toFixed(2) + '</b>。'
        + tail;
    }
    renderNote();
    window.addEventListener('zkdispchange', function () {
      try { renderNote(); } catch (e) { ZKHTML.warn('框架/weptable.js:dispchange', e); }
      try { render(); } catch (e) { ZKHTML.warn('框架/weptable.js:dispchange:stars', e); }
    });
    function typeOf(w) {
      if (ZAW_NAMES.indexOf(w.bintl) >= 0) return 'zaw';
      if (KIT_NAMES.indexOf(w.bintl) >= 0) return '组合枪';
      if (COMPANION_NAMES.indexOf(w.bintl) >= 0) return '同伴武器';
      return w.cat;
    }
    window.ZKWTYPE = typeOf;      /* 价值表复用同一套类别分列，别再抄第二份名单 */
    var LK = ['cn', 'intl', 'en'];            // 0 国服 / 1 国际服 / 2 英文
    var esc = ZKHTML.esc;
    function fnum(v) { var r = Math.round(v * 1000) / 1000; return Math.abs(Math.round(r * 100) - r * 100) < 1e-6 ? r.toFixed(2) : String(r); }
    function pips(n) { var s = ''; for (var i = 0; i < 5; i++) s += '<span class="disp-pip' + (i < n ? ' on' : '') + '"></span>'; return s; }
    function curLangKey() {
      var b = document.querySelector('#langFloat button.on');
      var i = b ? (+b.getAttribute('data-i')) : 1;   // 默认国际服
      if (!(i >= 0 && i <= 2)) i = 1;
      return LK[i];
    }
    var curType = '全部';
    function render() {
      var lk = curLangKey();
      var groups = [[], [], [], [], [], []];
      for (var i = 0; i < Z.weapons.length; i++) {
        var st = STAR[i]; if (st == null || st < 0 || st > 5) st = 0;
        if (curType !== '全部' && typeOf(Z.weapons[i]) !== curType) continue;
        groups[st].push(i);
      }
      var h = '';
      for (var n = 0; n <= 5; n++) {
        var arr = groups[n];
        arr.sort(function (a, b) { return (dispOf(b) - dispOf(a)) || (a - b); });
        h += '<div class="disp-col"><div class="disp-col-h"><div class="disp-pips">' + pips(n) + '</div>'
          + '<div class="disp-num">' + n + '星</div><div class="disp-cnt">' + arr.length + ' 把</div></div>'
          + '<div class="disp-list">';
        if (!arr.length) h += '<div class="disp-empty">—</div>';
        else arr.forEach(function (i) {
          var w = Z.weapons[i], nm = w[lk] || w.cn || w.en;
          h += '<div class="disp-item"><span class="disp-w" title="' + esc(nm) + '">' + esc(nm)
            + '</span><span class="disp-d">' + fnum(dispOf(i)) + '</span></div>';
        });
        h += '</div></div>';
      }
      host.innerHTML = h;
    }
    var ftabs = document.querySelectorAll('#dispFilter .disp-tab');
    for (var t = 0; t < ftabs.length; t++) {
      ftabs[t].addEventListener('click', function () {
        curType = this.getAttribute('data-t');
        for (var q = 0; q < ftabs.length; q++) ftabs[q].classList.toggle('on', ftabs[q] === this);
        render();
      });
    }
    document.addEventListener('click', function (e) {
      var t = e.target;
      while (t && t !== document && !(t.getAttribute && t.getAttribute('data-a') === 'lang')) t = t.parentNode;
      if (t && t !== document) render();
    });
    render();
  })();
