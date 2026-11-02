  window.ZKSTORE = (function () {
    var KNOWN = ['intl', 'cn'];
    function uiStore() {
      var b = document.querySelector('#priceStore .prx-sbtn.on');
      var s = b ? String(b.getAttribute('data-s') || '') : '';
      return KNOWN.indexOf(s) >= 0 ? s : '';
    }
    function langStore() {
      var i = -1;
      try { if (window.ZKLANGI) i = window.ZKLANGI() | 0; } catch (e) { i = -1; }
      return i === 0 ? 'cn' : 'intl';
    }
    function cur() { return uiStore() || langStore(); }
    function of(block) {
      if (!block) return null;
      var want = cur();
      if (block[want]) return { s: want, v: block[want], fb: false };
      var other = want === 'cn' ? 'intl' : 'cn';
      if (block[other]) return { s: other, v: block[other], fb: true };
      return null;
    }
    function watch(fn) {
      if (!window.MutationObserver) return;
      var opts = { attributes: true, subtree: true, attributeFilter: ['class'] };
      ['priceStore', 'langFloatPanel'].forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        try { new MutationObserver(fn).observe(el, opts); }
        catch (e) { if (window.ZKHTML && ZKHTML.warn) ZKHTML.warn('框架/pricetable.js:store-watch', e); }
      });
    }
    return { cur: cur, of: of, watch: watch };
  })();
  (function () {
    'use strict';
    var P = window.ZKPRICE;
    var ROOT = document.getElementById('price');
    if (!ROOT || !P) return;
    var STORES = ['intl', 'cn'].filter(function (s) { return P[s] && P[s].rows && P[s].rows.length; });
    if (!STORES.length) return;
    var esc = (window.ZKHTML && window.ZKHTML.esc) || function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    };
    function warn(where, e) { if (window.ZKHTML && ZKHTML.warn) ZKHTML.warn(where, e); }
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { warn('框架/pricetable.js:19', e); } }
    var LK = ['cn', 'intl', 'en'];
    function langIdx() {
      var i = -1;
      try { if (window.ZKLANGI) i = window.ZKLANGI() | 0; } catch (e) { i = -1; }
      if (!(i >= 0 && i <= 2)) {
        var b = document.querySelector('#langFloatPanel button.on') || document.querySelector('#langFloat button.on');
        i = b ? parseInt(b.getAttribute('data-i'), 10) : 1;
      }
      return (i >= 0 && i <= 2) ? i : 1;
    }
    function langKey() { return LK[langIdx()]; }
    function setLang(i) {
      if (langIdx() === i) return;
      var b = document.querySelector('#langFloatPanel button[data-i="' + i + '"]')
           || document.querySelector('[data-a="lang"][data-i="' + i + '"]');
      if (b) { try { b.click(); } catch (e) { warn('框架/pricetable.js:41', e); } }
    }
    var per = {};
    STORES.forEach(function (s) {
      var c0 = P[s], nameC = null;
      c0.cols.forEach(function (c) { if (!nameC && c.kind === 'name') nameC = c; });
      if (!nameC) nameC = c0.cols[0];
      var def = [];
      c0.cols.forEach(function (c) { if (c.hide && c.k !== nameC.k) def.push(c.k); });
      var hid = null, raw = lsGet('zkp_hide:' + s);
      if (raw) { try { hid = JSON.parse(raw); } catch (e) { hid = null; } }
      if (!Array.isArray(hid)) hid = def.slice();
      hid = hid.filter(function (k) {
        if (k === nameC.k) return false;
        return c0.cols.some(function (c) { return c.k === k; });
      });
      var o = { name: nameC.k, def: def, hidden: hid, key: c0.defaultSort || 'med', dir: -1, max: {} };
      var sm = lsGet('zkp_sort:' + s);
      if (sm) {
        try {
          var j = JSON.parse(sm);
          if (j && j.k && c0.cols.some(function (c) { return c.k === j.k; })) {
            o.key = j.k; o.dir = j.dir < 0 ? -1 : 1;
          }
        } catch (e) { warn('框架/pricetable.js:73', e); }
      }
      c0.cols.forEach(function (c) {
        if (!c.bar) return;
        var m = 0;
        c0.rows.forEach(function (d) { var v = +d[c.k]; if (v > m) m = v; });
        o.max[c.k] = m || 1;
      });
      c0.rows.forEach(function (d, i) { d._i = i; });   // 排序稳定的兜底
      per[s] = o;
    });
    var store = lsGet('zkp_store');
    if (STORES.indexOf(store) < 0) store = STORES[0];
    var F = { q: '', type: '', conf: '', empty: false };
    try { F.empty = localStorage.getItem('zkp_empty') === '1'; } catch (e) { warn('框架/pricetable.js:92', e); }
    function cfg() { return P[store]; }
    function stt() { return per[store]; }
    var CONF_W = { '高': 3, '中': 2, '低': 1, '无数据': 0 };
    function typeLab(t) { return ZKC.typeAlias(t); }   /* 映射表在命名表 ZKNAMES.typeAlias */
    function visCols() {
      var s = stt();
      return cfg().cols.filter(function (c) { return c.k === s.name || s.hidden.indexOf(c.k) < 0; });
    }
    function defaults() { return stt().def.slice(); }
    function saveHidden() { lsSet('zkp_hide:' + store, JSON.stringify(stt().hidden)); }
    function int(v) { return Math.round(+v).toLocaleString('en-US'); }
    function dash() { return '<span class="pr-dim">—</span>'; }
    function cell(d, c) {
      var v = d[c.k];
      if (c.kind === 'name') {
        var lk = langKey(), main, sub;
        if (lk === 'en') {
          main = d.en || d.zi || d.zh;
          sub = d.zi || d.zh || '';
        } else {
          main = (lk === 'cn' ? (d.zh || d.zi) : (d.zi || d.zh)) || d.en;
          sub = d.en || '';
        }
        var tip = [d.zh, d.zi, d.en].filter(function (x, i, a) {
          return x && a.indexOf(x) === i;
        }).join(' · ');
        return '<td class="name" title="' + esc(tip) + '">' + esc(main)
          + (sub ? '<i>' + esc(sub) + '</i>' : '') + '</td>';
      }
      if (c.kind === 'money') {
        if (v == null || v === '' || !isFinite(v)) return '<td class="pr-num">' + dash() + '</td>';
        if (!c.bar) return '<td class="pr-num' + (c.dim ? ' pr-dim' : '') + '">' + int(v) + '</td>';
        var w = Math.max(4, Math.min(100, (+v) / stt().max[c.k] * 100));
        return '<td><div class="prx-mbar"><b>' + int(v) + '</b>'
          + '<span class="prx-bar"><i style="width:' + w.toFixed(1) + '%"></i></span></div></td>';
      }
      if (c.kind === 'pct') {
        if (v == null || !isFinite(v)) return '<td class="pr-num">' + dash() + '</td>';
        var cls = v > 0 ? 'pr-up' : (v < 0 ? 'pr-down' : 'pr-dim');
        return '<td class="pr-num"><span class="' + cls + '">'
          + (v > 0 ? '+' : '') + (+v).toFixed(1) + '%</span></td>';
      }
      if (c.kind === 'pct0') {
        if (v == null || !isFinite(v)) return '<td class="pr-num">' + dash() + '</td>';
        return '<td class="pr-num pr-dim">' + Math.round(v) + '%</td>';
      }
      if (c.kind === 'chip') {
        var q = v || '无数据';
        var k = q === '高' ? 'hi' : (q === '中' ? 'mid' : (q === '低' ? 'low' : 'none'));
        return '<td><span class="pr-chip ' + k + '">' + esc(q) + '</span></td>';
      }
      if (c.kind === 'int') {
        if (v == null || !isFinite(v)) return '<td class="pr-num">' + dash() + '</td>';
        return '<td class="pr-num' + (c.dim ? ' pr-dim' : '') + '">' + int(v) + '</td>';
      }
      if (c.kind === 'float2') {
        if (v == null || !isFinite(v)) return '<td class="pr-num">' + dash() + '</td>';
        return '<td class="pr-num pr-dim">' + (+v).toFixed(2) + '</td>';
      }
      if (c.kind === 'date') {
        if (!v) return '<td class="pr-num">' + dash() + '</td>';
        var ds = String(v).slice(0, 10);
        return '<td class="pr-num pr-dim" title="' + esc(ds) + '">' + esc(ds.slice(5)) + '</td>';
      }
      return '<td class="pr-num' + (c.dim ? ' pr-dim' : '') + '">'
        + (v == null || v === '' ? dash() : esc(c.k === 'type' ? typeLab(v) : v)) + '</td>';
    }
    function sortVal(d, c) {
      if (c.kind === 'name') return d.zh || d.en || '';
      if (c.kind === 'chip') return CONF_W[d.conf] || 0;
      return d[c.k];
    }
    function cmp(a, b, c) {
      var s = stt();
      var x = sortVal(a, c), y = sortVal(b, c);
      var str = typeof x === 'string' || typeof y === 'string';
      if (str) {
        if (x == null && y == null) return a._i - b._i;
        if (x == null) return 1;                       // 空值永远沉底，不插在中间
        if (y == null) return -1;
        return String(x).localeCompare(String(y), 'zh-Hans-CN') * s.dir || (a._i - b._i);
      }
      var nx = (x == null || !isFinite(x)), ny = (y == null || !isFinite(y));
      if (nx && ny) return a._i - b._i;
      if (nx) return 1;
      if (ny) return -1;
      if (x === y) return a._i - b._i;
      return (x < y ? -1 : 1) * s.dir;
    }
    function renderHead() {
      var s = stt(), vis = visCols();
      if (!vis.some(function (c) { return c.k === s.key; })) {
        var NUM = ['money', 'int', 'pct', 'pct0', 'float2'];
        var fb = vis.filter(function (c) { return c.bar; })[0]
          || vis.filter(function (c) { return NUM.indexOf(c.kind) >= 0; })[0]
          || vis[0];
        s.key = fb ? fb.k : s.name;
      }
      document.getElementById('priceTh').innerHTML = vis.map(function (c) {
        var on = c.k === s.key;
        return '<th class="' + (c.left ? 'l' : '') + (on ? ' on' : '') + '" data-k="' + esc(c.k) + '"'
          + (c.tip ? ' title="' + esc(c.tip) + '"' : '') + '>'
          + esc(c.t) + '<span class="prx-ar">' + (on ? (s.dir > 0 ? '↑' : '↓') : '↕') + '</span></th>';
      }).join('');
      document.getElementById('priceColNum').textContent = vis.length + '/' + cfg().cols.length;
    }
    function view() {
      var q = F.q, rows = cfg().rows;
      return rows.filter(function (d) {
        if (F.type && d.type !== F.type) return false;
        if (F.conf && (d.conf || '无数据') !== F.conf) return false;
        if (!F.empty && !(+d[cfg().emptyKey] > 0)) return false;
        if (!q) return true;
        return (d.zh || '').toLowerCase().indexOf(q) >= 0
          || (d.zi || '').toLowerCase().indexOf(q) >= 0
          || (d.py || '').indexOf(q) >= 0
          || (d.pyi || '').indexOf(q) >= 0
          || (d.en || '').toLowerCase().indexOf(q) >= 0
          || (d.kw || '').toLowerCase().indexOf(q) >= 0
          || (d.slug || '').toLowerCase().indexOf(q) >= 0;
      });
    }
    function render() {
      renderHead();
      var s = stt(), vis = visCols(), c = cfg().cols.filter(function (x) { return x.k === s.key; })[0];
      var arr = view().slice().sort(function (a, b) { return cmp(a, b, c); });
      var ek = cfg().emptyKey;
      var has = function (d) { return !ek || (+d[ek] || 0) > 0; };
      document.getElementById('priceTb').innerHTML = arr.map(function (d) {
        return '<tr class="' + (has(d) ? '' : 'pr-void') + '">'
          + vis.map(function (cc) { return cell(d, cc); }).join('') + '</tr>';
      }).join('');
      document.getElementById('priceEmpty').hidden = arr.length > 0;
      var got = 0;
      for (var i = 0; i < arr.length; i++) if (has(arr[i])) got++;
      var line = '共 ' + arr.length + ' 把武器';
      if (got !== arr.length) line += '（有数据 ' + got + ' 把）';
      if (cfg().countKey) {
        var sum = arr.reduce(function (n, d) { return n + (+d[cfg().countKey] || 0); }, 0);
        line += ' · ' + (cfg().countLabel || '合计') + ' ' + sum.toLocaleString('en-US') + (cfg().countUnit || '');
      }
      document.getElementById('priceStat').textContent = line;
    }
    function renderCards() {
      document.getElementById('priceCards').innerHTML = (cfg().kpis || []).map(function (k) {
        var sub = (langKey() === 'cn' && k.subCn) ? k.subCn : k.sub;
        return '<div class="pr-card' + (k.tone === 'warn' ? ' warn' : '') + '">'
          + '<div class="k">' + esc(k.k) + '</div>'
          + '<div class="v">' + esc(k.v) + (k.u ? '<small>' + esc(k.u) + '</small>' : '') + '</div>'
          + (sub ? '<div class="s">' + esc(sub) + '</div>' : '') + '</div>';
      }).join('');
    }
    function renderTypes() {
      var sel = document.getElementById('priceType'), seen = {}, list = [];
      cfg().rows.forEach(function (d) {
        if (d.type && !seen[d.type]) { seen[d.type] = 1; list.push(d.type); }
      });
      list.sort(function (a, b) {
        var ca = /[\u4e00-\u9fff]/.test(a) ? 0 : 1, cb = /[\u4e00-\u9fff]/.test(b) ? 0 : 1;
        return ca - cb || a.localeCompare(b, 'zh-Hans-CN');
      });
      if (F.type && !seen[F.type]) F.type = '';
      sel.innerHTML = '<option value="">全部类型</option>' + list.map(function (t) {
        return '<option value="' + esc(t) + '"' + (t === F.type ? ' selected' : '') + '>'
          + esc(typeLab(t)) + '</option>';
      }).join('');
      var hasConf = cfg().rows.some(function (d) { return !!d.conf; });
      var confSel = document.getElementById('priceConf');
      confSel.style.display = hasConf ? '' : 'none';
      if (!hasConf) F.conf = '';
    }
    function buildMenu() {
      var vis = {}, s = stt();
      visCols().forEach(function (c) { vis[c.k] = 1; });
      var items = cfg().cols.map(function (c) {
        var lock = c.k === s.name;
        return '<label class="' + (lock ? 'lock' : '') + '"><input type="checkbox" data-k="' + esc(c.k) + '"'
          + (vis[c.k] ? ' checked' : '') + (lock ? ' disabled' : '') + '>' + esc(c.t) + '</label>';
      }).join('');
      document.getElementById('priceColMenu').innerHTML = '<div class="hd">勾选要显示的列</div>'
        + '<div class="list">' + items + '</div>'
        + '<div class="act"><button type="button" class="btn sm ghost" id="priceColAll">全显示</button>'
        + '<button type="button" class="btn sm ghost" id="priceColDef">恢复默认</button></div>';
    }
    function placeMenu() {
      var m = document.getElementById('priceColMenu');
      var b = document.getElementById('priceColBtn');
      if (!m || !b || !m.classList.contains('on')) return;
      var r = b.getBoundingClientRect();
      var vw = window.innerWidth || document.documentElement.clientWidth;
      var vh = window.innerHeight || document.documentElement.clientHeight;
      var gap = 8, w = m.offsetWidth || 224;
      var left = r.left;                                  // 从按钮左边缘往右展开
      if (left + w > vw - gap) left = vw - gap - w;       // 右边放不下 往左收
      if (left < gap) left = gap;
      m.style.maxHeight = 'none';                         // 先放开量自然高度
      var natH = m.offsetHeight || 300;
      var below = vh - gap - (r.bottom + 7);              // 下方可用高度
      var above = r.top - 7 - gap;                        // 上方可用高度
      var top, room;
      if (below >= Math.min(natH, 200) || below >= above) {
        top = r.bottom + 7; room = below;                 // 放下面
      } else {
        room = above;                                     // 放上面
        top = r.top - 7 - Math.min(natH, above);
      }
      room = Math.max(140, Math.round(room));
      m.style.maxHeight = room + 'px';
      if (top < gap) top = gap;
      m.style.left = Math.round(left) + 'px';
      m.style.top = Math.round(top) + 'px';
    }
    function toggleMenu(force) {
      var m = document.getElementById('priceColMenu');
      var on = force == null ? !m.classList.contains('on') : !!force;
      if (on) {
        buildMenu();
        m.classList.add('on');
        placeMenu();                                      // 先显示再量高度，才能判断要不要往上翻
      } else {
        m.classList.remove('on');
      }
      document.getElementById('priceColBtn').setAttribute('aria-expanded', on ? 'true' : 'false');
    }
    function exportCsv() {
      var cols = visCols(), head = [], rows = [];
      cols.forEach(function (c) {
        if (c.kind === 'name') { head.push.apply(head, c.csv || ['武器（国服）', '武器（国际服）', 'Weapon']); }
        else head.push(c.csv || c.t);
      });
      view().slice().sort(function (a, b) {
        return cmp(a, b, cfg().cols.filter(function (x) { return x.k === stt().key; })[0]);
      }).forEach(function (d) {
        var out = [];
        cols.forEach(function (c) {
          if (c.kind === 'name') { out.push(d.zh || d.zi || '', d.zi || '', d.en || ''); return; }
          out.push(d[c.k] == null ? '' : (c.k === 'type' ? typeLab(d[c.k]) : d[c.k]));
        });
        rows.push(out);
      });
      var qv = function (v) {
        var s = String(v == null ? '' : v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      var lines = [head.join(',')].concat(rows.map(function (r) { return r.map(qv).join(','); }));
      var blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (cfg().csvName || '紫卡价值表') + '_' + new Date().toISOString().slice(0, 10) + '.csv';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    }
    function syncHead() {
      Array.prototype.forEach.call(document.querySelectorAll('#priceStore .prx-sbtn'), function (b) {
        var on = b.getAttribute('data-s') === store;
        b.classList.toggle('on', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      document.getElementById('priceSrc').textContent = cfg().src || '';
      document.getElementById('priceEmptyLab').textContent = cfg().emptyLabel || '显示 0 数据的武器';
      document.getElementById('priceShowEmpty').checked = F.empty;
    }
    var LANG_OF = { intl: 1, cn: 0 };
    function storeOfLang(i) { return i === 0 ? 'cn' : 'intl'; }
    function switchStore(s, opts) {
      if (STORES.indexOf(s) < 0) return;
      store = s;
      lsSet('zkp_store', s);
      if (!opts || !opts.noLang) setLang(LANG_OF[s] == null ? 1 : LANG_OF[s]);
      syncHead();
      renderTypes();
      renderCards();
      render();
    }
    document.getElementById('priceStore').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.prx-sbtn') : null;
      if (!b) return;
      var s = b.getAttribute('data-s');
      if (s && s !== store) switchStore(s);
    });
    var qEl = document.getElementById('priceQ');
    qEl.addEventListener('input', function () { F.q = (qEl.value || '').trim().toLowerCase(); render(); });
    document.getElementById('priceType').addEventListener('change', function (e) {
      F.type = e.target.value; render();
    });
    document.getElementById('priceConf').addEventListener('change', function (e) {
      F.conf = e.target.value; render();
    });
    document.getElementById('priceShowEmpty').addEventListener('change', function (e) {
      F.empty = e.target.checked;
      lsSet('zkp_empty', F.empty ? '1' : '0');
      render();
    });
    document.getElementById('priceCsv').addEventListener('click', exportCsv);
    document.querySelector('#priceTbl thead').addEventListener('click', function (e) {
      var th = e.target.closest ? e.target.closest('th') : null;
      if (!th || !th.getAttribute('data-k')) return;
      var k = th.getAttribute('data-k'), s = stt();
      var c = cfg().cols.filter(function (x) { return x.k === k; })[0];
      if (s.key === k) s.dir = -s.dir;
      else {
        s.key = k;
        s.dir = (c && (c.kind === 'name' || c.kind === 'text' || c.kind === 'date')) ? 1 : -1;
      }
      lsSet('zkp_sort:' + store, JSON.stringify({ k: s.key, dir: s.dir }));
      render();
    });
    document.getElementById('priceColBtn').addEventListener('click', function (e) {
      e.stopPropagation(); toggleMenu();
    });
    document.getElementById('priceColMenu').addEventListener('click', function (e) {
      e.stopPropagation();                       // 别让 document 上的监听把它关掉
      var id = e.target.id;
      if (id === 'priceColAll') { stt().hidden = []; saveHidden(); buildMenu(); render(); }
      if (id === 'priceColDef') { stt().hidden = defaults(); saveHidden(); buildMenu(); render(); }
    });
    document.getElementById('priceColMenu').addEventListener('change', function (e) {
      var cb = e.target.closest ? e.target.closest('input[data-k]') : null;
      if (!cb || cb.disabled) return;
      var k = cb.getAttribute('data-k'), hid = stt().hidden, ix = hid.indexOf(k);
      if (cb.checked && ix >= 0) hid.splice(ix, 1);
      if (!cb.checked && ix < 0) hid.push(k);
      saveHidden(); buildMenu(); render();       // 勾一下立刻生效，不用点确定
    });
    document.addEventListener('click', function () { toggleMenu(false); });
    window.addEventListener('resize', placeMenu);
    window.addEventListener('scroll', placeMenu, true);
    if (window.visualViewport) { window.visualViewport.addEventListener('resize', placeMenu); }
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (document.getElementById('priceColMenu').classList.contains('on')) { toggleMenu(false); return; }
      if (document.activeElement === qEl && qEl.value) {
        qEl.value = ''; F.q = ''; render();
      }
    });
    var lastLang = langKey();
    function langChanged() {
      var k = langKey();
      if (k === lastLang) return;      // 只是开关浮层、没真换语言，不重绘
      lastLang = k;
      var want = storeOfLang(langIdx());
      if (want !== store && STORES.indexOf(want) >= 0) {
        store = want;
        lsSet('zkp_store', want);
        syncHead();
        renderTypes();
      }
      renderCards();
      render();
    }
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      if (t.closest('[data-a="lang"]') || t.closest('[data-zk-l]') || t.closest('#langFloat')) langChanged();
    });
    (function watchLang() {
      var panel = document.getElementById('langFloatPanel');
      if (!panel || !window.MutationObserver) return;
      try {
        new MutationObserver(langChanged)
          .observe(panel, { attributes: true, subtree: true, attributeFilter: ['class'] });
      } catch (e) { warn('框架/pricetable.js:507', e); }
    })();
    var l0 = storeOfLang(langIdx());
    if (STORES.indexOf(l0) >= 0 && l0 !== store) {
      store = l0;
      lsSet('zkp_store', l0);
    }
    syncHead();
    renderTypes();
    renderCards();
    buildMenu();
    render();
  })();
  (function () {
    'use strict';
    function boot() {
    var P = window.ZKPRICEDB || {};
    var box = document.getElementById('priceCombo');
    if (!box || !window.ZKSTORE) return;
    var CATS = ['步枪', '霰弹', '手枪', '曲翼', '近战'];
    var CC = [
      { k: '_p', t: '正词条', str: 1, l: 1 },
      { k: '_g', t: '负词条', str: 1, l: 1 },
      { k: 'n', t: '挂单数' },
      { k: 's', t: '占比' },
      { k: 'm', t: '中位价' },
      { k: 'r', t: '溢价' },
      { k: 'x', t: '最高价' },
      { k: 'w', t: '常见武器', str: 1, l: 1 }
    ];
    var esc = (window.ZKHTML && window.ZKHTML.esc) || function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    };
    function warn(where, e) { if (window.ZKHTML && ZKHTML.warn) ZKHTML.warn(where, e); }
    function langIdx() {
      var i = -1;
      try { if (window.ZKLANGI) i = window.ZKLANGI() | 0; } catch (e) { i = -1; }
      if (!(i >= 0 && i <= 2)) {
        var b = document.querySelector('#langFloatPanel button.on')
             || document.querySelector('#langFloat button.on');
        i = b ? parseInt(b.getAttribute('data-i'), 10) : 1;
      }
      return (i >= 0 && i <= 2) ? i : 1;
    }
    function catLabel(key) {
      var a = window.ZKDATA && window.ZKDATA.params && window.ZKDATA.params.catName
        && window.ZKDATA.params.catName[key];
      return (a && (a[langIdx()] || a[0])) || key;
    }
    function int(v) { return Math.round(+v).toLocaleString('en-US'); }
    function nameLang() {
      var i = 1;
      try { i = langIdx(); } catch (e) { i = 1; }
      if (i === 2) return 2;
      return (ST && ST.s === 'cn') ? 0 : 1;
    }
    function stName(slug) {
      var D = window.ZKPRICEDB || {};
      var row = (D.stats || {})[slug];
      if (row == null) return slug;
      var n = (window.ZKC && ZKC.statRowName) ? ZKC.statRowName(row, nameLang()) : '';
      return n || slug;
    }
    function fillNames(d) {
      if (d.ks) d._p = d.ks.map(stName).join(' + ');
      if (d.gk !== undefined) d._g = d.gk ? stName(d.gk) : '';
      return d;
    }
    var cur = 0, ck = 'm', cd = -1, q = '';
    var byCat = [[], [], [], [], []];
    var ST = null, stKey = '';
    function note() {
      var bits = [];
      if (ST && ST.fb) bits.push(ST.s === 'cn' ? '这里显示的是国服数据' : '这里显示的是国际服数据');
      var o = (P.opt || {})[ST ? ST.s : ''] || {};
      if (o.note) bits.push(o.note);
      return bits.length ? ' · ' + bits.join(' · ') : '';
    }
    function loadData() {
      ST = ZKSTORE.of(P.combos);
      byCat = [[], [], [], [], []];
      (ST ? ST.v : []).forEach(function (d) {
        fillNames(d);
        if (d.c >= 0 && d.c < byCat.length) byCat[d.c].push(d);
      });
      var key = ST ? ST.s : '';
      if (key !== stKey) {
        stKey = key;
        ck = ((P.opt || {})[key] || {}).sort || 'm';   /* 国服按分位排，国际服按中位价排 */
        cd = -1;
        cur = 0;
      }
      box.hidden = !(ST && ST.v.length);
    }
    function langOf() { return langIdx(); }
    function renderTabs() {
      var h = '';
      for (var i = 0; i < CATS.length; i++) {
        h += '<button type="button" class="sgx-cat' + (i === cur ? ' on' : '')
          + '" data-i="' + i + '">' + esc(catLabel(CATS[i])) + '</button>';
      }
      document.getElementById('priceComboCats').innerHTML = h;
    }
    function renderHead() {
      document.getElementById('priceComboTh').innerHTML =
        '<th style="width:44px">#</th>' + CC.map(function (c) {
          var on = c.k === ck;
          return '<th class="' + (c.l ? 'l' : '') + (on ? ' on' : '') + '" data-k="' + esc(c.k) + '">'
            + esc(c.t) + '<span class="prx-ar">' + (on ? (cd > 0 ? '↑' : '↓') : '↕') + '</span></th>';
        }).join('');
    }
    function renderRows() {
      var qq = q.toLowerCase();
      byCat[cur].forEach(fillNames);          /* 派生名现算：切语言 / 切服都要跟着变 */
      var rows = byCat[cur].filter(function (d) {
        return !qq || ((d._p || '') + ' ' + (d._g || '') + ' ' + d.w + ' '
          + (d.ks || []).join(' ') + ' ' + (d.gk || '')).toLowerCase().indexOf(qq) >= 0;
      }).sort(function (a, b) {
        var x = a[ck], y = b[ck];
        if (typeof x === 'string')
          return String(x).localeCompare(String(y), 'zh-Hans-CN') * cd;
        return (x - y) * cd;
      });
      document.getElementById('priceComboTb').innerHTML = rows.map(function (d, i) {
        var rc = d.r >= 1.25 ? ' pr-up' : (d.r < 0.85 ? ' pr-down' : '');
        return '<tr>'
          + '<td class="pr-num pr-dim">' + (i + 1) + '</td>'
          + '<td class="multi prx-pos">' + esc(d._p) + '</td>'
          + '<td class="multi prx-neg">' + esc(d._g || '—') + '</td>'
          + '<td class="pr-num">' + int(d.n) + '</td>'
          + '<td class="pr-num pr-dim">' + d.s + '%</td>'
          + '<td class="pr-num"><b>' + int(d.m) + '</b></td>'
          + '<td class="pr-num' + rc + '">' + (+d.r).toFixed(2) + '×</td>'
          + '<td class="pr-num pr-dim">' + int(d.x) + '</td>'
          + '<td class="multi pr-dim">' + esc(d.w) + '</td></tr>';
      }).join('');
      document.getElementById('priceComboEmpty').hidden = rows.length > 0;
      document.getElementById('priceComboStat').textContent = '本类 ' + rows.length + ' 组' + note();
    }
    function render() { renderHead(); renderRows(); }
    document.getElementById('priceComboCats').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.sgx-cat') : null;
      if (!b) return;
      var i = parseInt(b.getAttribute('data-i'), 10);
      if (!(i >= 0 && i < CATS.length) || i === cur) return;
      cur = i;
      renderTabs();
      render();
    });
    document.getElementById('priceComboTh').addEventListener('click', function (e) {
      var th = e.target.closest ? e.target.closest('th') : null;
      if (!th || !th.getAttribute('data-k')) return;
      var k = th.getAttribute('data-k');
      var c = CC.filter(function (x) { return x.k === k; })[0];
      if (ck === k) cd = -cd;
      else { ck = k; cd = c && c.str ? 1 : -1; }
      render();
    });
    var qEl = document.getElementById('priceComboQ');
    qEl.addEventListener('input', function () { q = (qEl.value || '').trim().toLowerCase(); renderRows(); });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (document.activeElement === qEl && qEl.value) { qEl.value = ''; q = ''; renderRows(); }
    });
    (function () {
      var f = function () { renderTabs(); };
      var last = ZKSTORE.cur();
      var g = function () {
        var s = ZKSTORE.cur();
        if (s === last) return;
        last = s;
        loadData();
        renderTabs();
        render();
      };
      document.addEventListener('click', function (e) {
        var t = e.target;
        if (!t || !t.closest) return;
        if (t.closest('[data-a="lang"]') || t.closest('[data-zk-l]') || t.closest('#langFloat')) { f(); g(); render(); }
      });
      var panel = document.getElementById('langFloatPanel');
      if (panel && window.MutationObserver) {
        try { new MutationObserver(f).observe(panel, { attributes: true, subtree: true, attributeFilter: ['class'] }); }
        catch (e) { warn('框架/pricetable.js:combo-lang', e); }
      }
      ZKSTORE.watch(g);
    })();
    loadData();
    box.hidden = !(ST && ST.v.length);
    renderTabs();
    render();
    }
    if (window.ZKPRICEDB && window.ZKPRICEDB.combos) boot();
    else if (document.readyState === 'complete') boot();
    else window.addEventListener('load', function () {
      try { boot(); } catch (e) { warn('框架/pricetable.js:combo-boot', e); }
    });
  })();
  (function () {
    'use strict';
    function boot() {
    var P = window.ZKPRICEDB || {};
    var box = document.getElementById('priceSingle');
    if (!box || !window.ZKSTORE) return;
    var TABS = ['正面', '负面'];
    var CC = {
      pos: [
        { k: '_nm', t: '词条', str: 1, l: 1 },
        { k: 'r', t: '出现率' },
        { k: 'e', t: '贵组' },
        { k: 'c', t: '便宜组' },
        { k: 'l', t: '提升' },
        { k: 'p', t: '溢价' },
        { k: 'm', t: '中位价' },
        { k: 's', t: '样本' },
        { k: 't', t: '集中在', str: 1, l: 1 }
      ],
      neg: [
        { k: '_nm', t: '负词条', str: 1, l: 1 },
        { k: 'r', t: '出现率' },
        { k: 'p', t: '溢价' },
        { k: 'm', t: '中位价' },
        { k: 's', t: '样本' },
        { k: 't', t: '集中在', str: 1, l: 1 }
      ]
    };
    var DEF = { pos: ['r', -1], neg: ['p', -1] };
    var cur = 'pos', ck = 'r', cd = -1, q = '';
    var ST = null, maxR = {}, stKey = '';
    function S(t) { return ((ST && ST.v) || {})[t || cur] || []; }
    var esc = (window.ZKHTML && window.ZKHTML.esc) || function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    };
    function warn(where, e) { if (window.ZKHTML && ZKHTML.warn) ZKHTML.warn(where, e); }
    function int(v) { return Math.round(+v).toLocaleString('en-US'); }
    function nameLang() {
      var l = 1;
      try { if (window.ZKHTML && ZKHTML.langIx) l = ZKHTML.langIx(); } catch (e) { l = 1; }
      if (l === 2) return 2;
      return (ST && ST.s === 'cn') ? 0 : 1;
    }
    function stName(slug) {
      var D = window.ZKPRICEDB || {};
      var row = (D.stats || {})[slug];
      if (row == null) return slug;
      var n = (window.ZKC && ZKC.statRowName) ? ZKC.statRowName(row, nameLang()) : '';
      return n || slug;
    }
    function calibMax() {
      maxR = {};
      ['pos', 'neg'].forEach(function (k) {
        var m = 0;
        (S(k) || []).forEach(function (d) { if (d.r > m) m = d.r; });
        maxR[k] = m || 1;
      });
    }
    function names() {                     /* 派生名现算：切语言 / 切服都要跟着变 */
      ['pos', 'neg'].forEach(function (g) {
        ((ST && ST.v[g]) || []).forEach(function (d) {
          if (d.k) d._nm = stName(d.k);
        });
      });
    }
    function loadData() {
      ST = ZKSTORE.of(P.single);
      names();
      calibMax();
      var key = ST ? ST.s : '';
      if (key !== stKey) {
        stKey = key;
        ck = DEF[cur][0]; cd = DEF[cur][1]; q = '';
      }
      box.hidden = !(ST && (ST.v.pos.length || ST.v.neg.length));
    }
    function note() {
      var bits = [];
      if (ST && ST.fb) bits.push(ST.s === 'cn' ? '这里显示的是国服数据' : '这里显示的是国际服数据');
      var o = (P.opt || {})[ST ? ST.s : ''] || {};
      if (o.note) bits.push(o.note);
      return bits.length ? ' · ' + bits.join(' · ') : '';
    }
    function tabs() {
      var h = '';
      TABS.forEach(function (t, i) {
        var key = i ? 'neg' : 'pos';
        h += '<button type="button" class="sgx-cat' + (key === cur ? ' on' : '')
          + '" data-i="' + i + '">' + esc(t) + '</button>';
      });
      document.getElementById('priceSingleCats').innerHTML = h;
    }
    function head() {
      document.getElementById('priceSingleTh').innerHTML =
        '<th style="width:44px">#</th>' + CC[cur].map(function (c) {
          var on = c.k === ck;
          return '<th class="' + (c.l ? 'l' : '') + (on ? ' on' : '') + '" data-k="' + esc(c.k) + '">'
            + esc(c.t) + '<span class="prx-ar">' + (on ? (cd > 0 ? '↑' : '↓') : '↕') + '</span></th>';
        }).join('');
    }
    function render() {
      var qq = q.toLowerCase();
      var list = S(cur).filter(function (d) {
        return !qq || (((d._nm || '') + ' ' + (d.t || '') + ' ' + (d.k || '')).toLowerCase().indexOf(qq) >= 0);
      }).sort(function (a, b) {
        var x = a[ck], y = b[ck];
        if (typeof x === 'string')
          return String(x).localeCompare(String(y), 'zh-Hans-CN') * cd;
        return (x - y) * cd;
      });
      var num = function (v, cls) {
        return '<td class="pr-num' + (cls ? ' ' + cls : '') + '">' + v + '</td>';
      };
      document.getElementById('priceSingleTb').innerHTML = list.map(function (d, i) {
        var bar = '<span class="prx-mbar"><span class="prx-bar"><i style="width:'
          + Math.max(4, Math.round(100 * d.r / maxR[cur])) + '%"></i></span>'
          + (+d.r).toFixed(1) + '%</span>';
        var lift = d.l >= 99 ? '—' : (+d.l).toFixed(2) + '×';
        var lc = d.l >= 1.25 ? ' pr-up' : (d.l > 0 && d.l < 0.85 ? ' pr-down' : '');
        var pc = (+d.p >= 1.25 ? ' pr-up' : (+d.p < 0.85 ? ' pr-down' : ''));
        var tds = {
          _nm: '<td class="multi prx-' + (cur === 'pos' ? 'pos' : 'neg') + '">' + esc(d._nm || '') + '</td>',
          r: num(bar), e: num((+d.e).toFixed(1) + '%'), c: num((+d.c).toFixed(1) + '%'),
          l: num(lift, lc.trim()), p: num((+d.p).toFixed(2) + '×', pc.trim()),
          m: num('<b>' + int(d.m) + '</b>'), s: num(int(d.s)),
          t: num(esc(d.t || '—'), 'pr-dim')
        };
        return '<tr><td class="pr-num pr-dim">' + (i + 1) + '</td>'
          + CC[cur].map(function (c) { return tds[c.k]; }).join('') + '</tr>';
      }).join('');
      document.getElementById('priceSingleEmpty').hidden = list.length > 0;
      document.getElementById('priceSingleStat').textContent =
        '共 ' + list.length + ' 条 · ' + (cur === 'pos' ? '正' : '负') + '词条样本 ≥30' + note();
    }
    document.getElementById('priceSingleCats').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.sgx-cat') : null;
      if (!b) return;
      var key = parseInt(b.getAttribute('data-i'), 10) ? 'neg' : 'pos';
      if (key === cur) return;
      cur = key;
      ck = DEF[cur][0]; cd = DEF[cur][1];
      tabs(); head(); render();
    });
    document.getElementById('priceSingleTh').addEventListener('click', function (e) {
      var th = e.target.closest ? e.target.closest('th') : null;
      if (!th || !th.getAttribute('data-k')) return;
      var k = th.getAttribute('data-k');
      var c = CC[cur].filter(function (x) { return x.k === k; })[0];
      if (ck === k) cd = -cd;
      else { ck = k; cd = c && c.str ? 1 : -1; }
      head(); render();
    });
    var qEl = document.getElementById('priceSingleQ');
    qEl.addEventListener('input', function () { q = (qEl.value || '').trim().toLowerCase(); render(); });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (document.activeElement === qEl && qEl.value) { qEl.value = ''; q = ''; render(); }
    });
    loadData();
    tabs(); head(); render();
    (function () {
      var last = ZKSTORE.cur();
      var g = function () {
        var s = ZKSTORE.cur();
        if (s === last) return;
        last = s;
        loadData();
        head(); render();
      };
      ZKSTORE.watch(g);
      document.addEventListener('click', function (e) {
        var t = e.target;
        if (!t || !t.closest) return;
        if (t.closest('[data-a="lang"]') || t.closest('[data-zk-l]') || t.closest('#langFloat')) { g(); names(); render(); }
      });
    })();
    }
    if (window.ZKPRICEDB && window.ZKPRICEDB.single) boot();
    else if (document.readyState === 'complete') boot();
    else window.addEventListener('load', function () {
      try { boot(); } catch (e) { warn('框架/pricetable.js:single-boot', e); }
    });
  })();
