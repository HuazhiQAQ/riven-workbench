  function wmLang() {
    try {
      if (window.WM_LANGI) return (window.WM_LANGI() | 0);
    } catch (e) { ZKHTML.warn('填表/_gen.js:37', e); }
    try { return window.ZKLANGI ? (window.ZKLANGI() | 0) : 1; } catch (e) { return 1; }
  }
  function wmPolName(pol) {
    for (var i = 0; i < POL_ICONS.length; i++) if (POL_ICONS[i].k === pol) return POL_ICONS[i].n;
    return 'Madurai';  }
  function wmNormName(s) {
    var t = String(s || '').replace(/[\s　]+/g, '').replace(/[·・･]/g, '\u00b7').toLowerCase();
    var z = t.replace(/[a-z0-9._\-'"]+/g, '');
    return z ? z : t;
  }
  function wmItemName(name) {
    var raw = String(name || '');
    var out = [raw];
    var al = WM_WEAPON_ALIAS[raw];
    if (al) out.push(al);
    WM_NAME_RULES.forEach(function (r) {
      var m = raw.match(r[0]);
      if (!m) return;
      r[1].forEach(function (tpl) { out.push(tpl.replace('$1', m[1])); });
    });
    for (var i = 0; i < out.length; i++) {
      var k = wmNormName(out[i]);
      for (var j = 0; j < WM_ITEM_LIST.length; j++) {
        if (wmNormName(WM_ITEM_LIST[j]) === k) return WM_ITEM_LIST[j];
      }
    }
    return al || raw;
  }
  function wmItemNameAny(names) {
    for (var i = 0; i < names.length; i++) {
      if (!names[i]) continue;
      var r = wmItemName(names[i]);
      if (WM_ITEM_LIST.indexOf(r) >= 0) return r;
    }
    return names.length ? wmItemName(names[0]) : '';
  }
  function wmWeaponName(w) {
    if (!w) return '';
    var L = wmLang();
    var cands = [w.cn, w.intl];
    try { cands.push(wname(w)); } catch (e) { ZKHTML.warn('填表/_gen.js:98', e); }
    cands.push(w.en);
    var wmCn = wmItemNameAny(cands);
    if (L === 2) {
      var en = WM_WEAPON_CN2EN[wmCn];
      if (en) return en;
    }
    return wmCn;
  }
  function wmStat(it) {
    var v = it.val;
    if (typeof v !== 'number' || !isFinite(v)) v = parseFloat(it.val);
    var r = Math.round(Math.abs(v) * 100 + 1e-9) / 100;
    var nm = sname(it.row);
    var wid = WM_STAT_ROW_ID[it.row];
    var wm = '';
    if (wid != null && WM_STAT_ID[wid]) {
      wm = (wmLang() === 2) ? WM_STAT_ID[wid][3] : WM_STAT_ID[wid][2];
    }
    if (!wm) wm = nm;
    var mult = false;
    if (typeof isFactionRow === 'function' && isFactionRow(it.row)) {
      var signed = it.neg ? -Math.abs(v) : Math.abs(v);
      r = Math.round((1 + signed / 100) * 100) / 100;
      mult = true;
    }
    return { name: nm, wm: wm, value: mult ? r : (it.neg ? -r : r), mult: mult, row: it.row };
  }
  function buildWmFillData(card) {
    if (!card || !card.w) return null;
    var pos = [], neg = [];
    (card.slots || []).forEach(function (it) {
      if (!it) return;
      var s = wmStat(it);
      if (it.neg) neg.push(s); else pos.push(s);
    });
    var mr = 8, lv = 8, pol = 'Madurai';
    if (card.__calc) {
      mr = Math.max(8, Math.min(16, Math.round(+K.mr || 8)));
      lv = Math.max(0, Math.min(P.maxRank, Math.round(+K.rank || 0)));
      pol = wmPolName(K.pol);
    }
    return {
      native: true,
      category: '裂罅Mod',   /* 模糊关键词：填的时候按它匹配「已提示的裂罅Mod」这类选项 */
      weapon: wmWeaponName(card.w),                       /* WM 下拉里的写法 */
      weaponAlt: (card.w ? (card.w.cn || card.w.intl || card.w.en || '') : ''),  /* 模拟器原名，兜底候选 */
      pos: pos,
      neg: neg,
      mastery: mr,
      modLevel: lv,
      combo: Math.max(0, Math.round(card.rerolls || 0)),
      polarity: pol
    };
  }
  function wmCardFromCalc() {
    if (!K.w) return null;
    var items = [];
    for (var i = 0; i < 4; i++) {
      if (!K.rows[i] || !isFinite(parseFloat(K.vals[i]))) continue;
      items.push({ row: K.rows[i], val: parseFloat(K.vals[i]), neg: (i === 3) });
    }
    return { w: K.w, slots: items, rerolls: K.rolls || 0, __calc: true };
  }
  function wmRivenText(d) {
    var L = [];
    L.push('武器名称：' + (d.weapon || ''));
    (d.pos || []).forEach(function (s) {
      L.push('正面词条：' + s.wm + ' ' + (s.mult ? '×' : '+') + Math.abs(s.value));
    });
    (d.neg || []).forEach(function (s) {
      L.push('负面词条：' + s.wm + ' ' + (s.mult ? '×' : '−') + Math.abs(s.value));
    });
    if (d.mastery != null) L.push('精通段位：' + d.mastery);
    if (d.modLevel != null) L.push('Mod等级：' + d.modLevel);
    if (d.combo != null) L.push('循环次数：' + d.combo);
    if (d.polarity) L.push('极性：' + d.polarity);
    return L.join('\n');
  }
  function wmCoreSource() {
    if (typeof window.__WM_CORE_SRC__ === 'string' && window.__WM_CORE_SRC__.length > 500) {
      return window.__WM_CORE_SRC__;
    }
    return null;
  }
  function wmScriptFor(card) {
    var d = buildWmFillData(card);
    if (!d) return null;
    var core = wmCoreSource();
    if (!core) return null;
    return [
      '/* ════════════════════════════════════════════════════════════', '   WM 裂罅订单自动填充 —— 由紫卡模拟器生成', '   武器：' + d.weapon, '   正面：' + (d.pos.map(function (s) { return s.name + ' ' + s.value; }).join(' / ') || '无'), '   负面：' + (d.neg.map(function (s) { return s.name + ' ' + s.value; }).join(' / ') || '无'), '   段位 ' + d.mastery + ' · 等级 ' + d.modLevel + ' · 循环 ' + d.combo + ' · ' + d.polarity, '   ════════════════════════════════════════════════════════════ */',
      '',
      'window.__WM_FILL_DATA__ = ' + JSON.stringify(d, null, 2) + ';',
      '',
      core
    ].join('\n');
  }
  function wmCopyFallback(txt) {
    try {
      var ta = document.createElement('textarea');
      ta.value = txt;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch (e) { return false; }
  }
  function wmCopyText(txt, cb) {
    var ret = function (ok) { if (cb) cb(!!ok); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        navigator.clipboard.writeText(txt).then(function () { ret(true); },
          function () { ret(wmCopyFallback(txt)); });
        return;
      } catch (e) { ZKHTML.warn('填表/_gen.js:275', e); }
    }
    ret(wmCopyFallback(txt));
  }
  var WM_MODAL_ID = 'wmModal';
  function wmEscKey(e) {
    if (e.key === 'Escape' || e.key === 'Esc' || e.keyCode === 27) wmModalClose();
  }
  function wmModalClose() {
    var m = document.getElementById(WM_MODAL_ID);
    if (m && m.parentNode) m.parentNode.removeChild(m);
    document.removeEventListener('keydown', wmEscKey, true);
  }
  function wmOpenModal(txt, d) {
    wmModalClose();
    var mask = document.createElement('div');
    mask.id = WM_MODAL_ID;
    mask.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:9997;'
      + 'background:var(--scrim);display:flex;align-items:center;justify-content:center;'
      + 'padding:18px;box-sizing:border-box';
    var panel = document.createElement('div');
    panel.style.cssText = 'width:min(780px,100%);max-height:88vh;display:flex;flex-direction:column;'
      + 'background:var(--surface);color:var(--text);border:1px solid var(--border);'
      + 'border-radius:12px;padding:16px;box-shadow:0 20px 56px rgba(0,0,0,.5);box-sizing:border-box';
    function wmShown(s) {
      return esc(s.name) + (s.wm && s.wm !== s.name
        ? ' <span style="color:var(--text-mute)">→</span> ' + esc(s.wm) : '')
        + ' ' + s.value;
    }
    var posTxt = (d.pos || []).map(wmShown).join(' / ') || '无';
    var negTxt = (d.neg || []).map(wmShown).join(' / ') || '无';
    panel.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">'
      + '<b style="font-size:15px">WM 填充脚本</b>'
      + '<span id="wmTip" style="font-size:12px;color:var(--brand-text)"></span>'
      + '<button type="button" class="btn ghost sm" id="wmX" style="margin-left:auto">关闭</button>'
      + '</div>'
      + '<div style="font-size:12px;line-height:1.7;color:var(--text-mute);margin-bottom:10px">'
      + '武器 <b style="color:var(--text)">' + esc(d.weapon || '—') + '</b><br>'
      + '正面 ' + posTxt + '<br>'
      + '负面 ' + negTxt + '<br>'
      + '<span style="color:var(--text-mute)">箭头右边是 WM 下拉里的用词（按 wm-dict.txt 翻的），'
      + '不对就去改 wm-dict.txt 那一行。</span><br>'
      + '段位 ' + d.mastery + ' · 等级 ' + d.modLevel + ' · 循环 ' + d.combo + ' · ' + esc(d.polarity || '')
      + '</div>'
      + '<textarea id="wmOut" readonly spellcheck="false" style="flex:1 1 auto;min-height:200px;'
      + 'width:100%;font-size:11px;line-height:1.45;padding:9px;border-radius:8px;'
      + 'border:1px solid var(--border);background:var(--surface-2);color:var(--text);'
      + 'resize:vertical;font-family:var(--f-mono);box-sizing:border-box"></textarea>'
      + '<div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">'
      + '<button type="button" class="btn" id="wmCopy">复制完整脚本</button>'
      + '<span style="font-size:12px;color:var(--text-mute);line-height:1.5">'
      + '用法：WM 拍卖页 → 创建拍卖 → 停在「物品详情」→ F12 控制台粘贴回车。'
      + '<b style="color:var(--text)">只填表单，不会替你提交。</b></span>'
      + '</div>';
    mask.appendChild(panel);
    mask.addEventListener('mousedown', function (e) { if (e.target === mask) wmModalClose(); });
    document.body.appendChild(mask);
    document.addEventListener('keydown', wmEscKey, true);
    var ta = document.getElementById('wmOut');
    var tip = document.getElementById('wmTip');
    var btn = document.getElementById('wmCopy');
    ta.value = txt;
    var flash = function (t, ms) {
      if (!tip) return;
      tip.textContent = t;
      setTimeout(function () { if (tip) tip.textContent = ''; }, ms || 2600);
    };
    function bindCopy(el, text, label) {
      if (!el) return;
      el.addEventListener('click', function () {
        wmCopyText(text, function (ok) {
          el.textContent = ok ? '\u2713 \u5df2\u590d\u5236' : '\u590d\u5236\u5931\u8d25';
          setTimeout(function () { el.textContent = label; }, 1800);
          if (ok) flash('\u2713 ' + label + '\u5df2\u590d\u5236');
          else { try { ta.focus(); ta.select(); } catch (e) { ZKHTML.warn('填表/_gen.js:365', e); } }
        });
      });
    }
    bindCopy(btn, txt, '\u590d\u5236\u5b8c\u6574\u811a\u672c');
    wmCopyText(txt, function (ok) {
      flash(ok ? '\u2713 \u5df2\u590d\u5236\u5230\u526a\u8d34\u677f'
                : '\u526a\u8d34\u677f\u4e0d\u53ef\u7528\uff0c\u8bf7\u70b9\u300c\u590d\u5236\u5b8c\u6574\u811a\u672c\u300d');
      if (ok && btn) {
        btn.textContent = '\u2713 \u5df2\u590d\u5236';
        setTimeout(function () { btn.textContent = '\u590d\u5236\u5b8c\u6574\u811a\u672c'; }, 1800);
      }
      if (!ok) { try { ta.focus(); ta.select(); } catch (e2) { ZKHTML.warn('填表/_gen.js:379', e2); } }
    });
    var bx = document.getElementById('wmX');
    if (bx) bx.addEventListener('click', wmModalClose);
  }
  function doGenWm(cardIdx) {
    var card = (cardIdx === 'calc') ? wmCardFromCalc() : C[cardIdx || ACTIVE_BLK];
    var d = card ? buildWmFillData(card) : null;
    var txt = card ? wmScriptFor(card) : null;
    if (!txt || !d) {
      alert('生成失败：' + (!card || !card.w
        ? '还没选武器。\n先在计算器里选一把武器并填好词条，或在左边开一张卡。'
        : '页面里没找到填充脚本的源码。'));
      return;
    }
    if (!d.pos.length && !d.neg.length) {
      alert('这张卡还没有任何词条，先洗出词条再生成。');
      return;
    }
    wmOpenModal(txt, d);
  }
