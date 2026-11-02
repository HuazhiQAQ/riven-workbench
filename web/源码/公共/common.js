(function (g) {
  'use strict';
  var MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return MAP[c]; });
  }
  function attr(s) { return esc(s); }
  function attrs(o) {
    var out = [];
    o = o || {};
    for (var k in o) {
      if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
      if (!/^[a-zA-Z][\w:-]*$/.test(k)) continue;
      out.push(k + '="' + attr(o[k]) + '"');
    }
    return out.join(' ');
  }
  function setText(el, s) { if (el) el.textContent = (s == null ? '' : String(s)); return el; }
  function setHTML(el, html) { if (el) el.innerHTML = html; return el; }
  function escNote(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/&lt;(\/?)(span|b|i|em|strong|br)(\s+class=&quot;(ok|warn|bad)&quot;)?\s*\/?&gt;/g,
        function (m, close, tag, _c, cls) {
          return '<' + close + tag + (cls ? ' class="' + cls + '"' : '') + '>';
        });
  }
  function safeParse(s, fb) {
    if (typeof s !== 'string' || !s) return fb;
    try { return JSON.parse(s); }
    catch (e) { warn('safeParse', e); return fb; }
  }
  function langIx() {
    try { return g.ZKLANGI ? (g.ZKLANGI() | 0) : 1; } catch (e) { warn('langIx', e); return 1; }
  }
  function tx(cn, en) { return langIx() === 2 ? en : cn; }
  function reEsc(x) { return String(x == null ? '' : x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  var DEBUG = false;
  try {
    DEBUG = /[?&]zkdebug=1/.test(location.search) || !!localStorage.getItem('zkdebug');
  } catch (e) { DEBUG = false; }
  var BUF = [], CAP = 200;
  function warn(tag, e) {
    var msg = '[无法读取的错误]';
    try {
      msg = (e && (e.message || e.name)) ? (e.name ? e.name + ': ' : '') + e.message : String(e == null ? '' : e);
    } catch (e2) { msg = '[无法读取的错误]'; }
    try {
      BUF.push({ at: Date.now(), tag: String(tag || ''), msg: msg });
      if (BUF.length > CAP) BUF.shift();
    } catch (e3) { BUF = []; }
    if (DEBUG) {
      try { if (g.console) console.warn('[ZK] ' + tag + ' :: ' + msg); }
      catch (e4) { DEBUG = false; }
    }
  }
  function warnDump() {
    try {
      var out = BUF.slice();
      if (g.console) {
        console.log('[ZK] 共 ' + out.length + ' 条留痕');
        for (var i = 0; i < out.length; i++) console.log('  ' + out[i].tag + ' :: ' + out[i].msg);
      }
      return out;
    } catch (e) { return []; }
  }
  function watchInnerHTML() {
    if (!DEBUG || typeof Element === 'undefined' || !Element.prototype) return;
    try {
      var d = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
      if (!d || !d.set || d.set.__zkWatched) return;
      var set = function (v) {
        try {
          if (typeof v === 'string' && v.length < 4000 &&
              /<(?!\/?(span|div|b|i|em|strong|br|table|thead|tbody|tr|td|th|ul|ol|li|p|select|option|input|button|small|label|section|header|footer|aside|main|svg|path|g|a|h[1-6])\b)/i.test(v)) {
            warn('innerHTML 疑似未转义', new Error(v.slice(0, 120)));
          }
        } catch (e0) { warn('innerHTML 打桩', e0); }
        return d.set.call(this, v);
      };
      set.__zkWatched = true;
      Object.defineProperty(Element.prototype, 'innerHTML', { set: set, get: d.get, configurable: true });
    } catch (e) { warn('watchInnerHTML', e); }
  }
  g.ZKHTML = {
    esc: esc, attr: attr, attrs: attrs,
    setText: setText, setHTML: setHTML, escNote: escNote,
    safeParse: safeParse, reEsc: reEsc, langIx: langIx, tx: tx,
    warn: warn, warnDump: warnDump, debug: function () { return DEBUG; },
    watchInnerHTML: watchInnerHTML
  };
  g.__zkWarns = BUF;
  g.__zkWarnsDump = warnDump;
  watchInnerHTML();
})(typeof window !== 'undefined' ? window : this);
