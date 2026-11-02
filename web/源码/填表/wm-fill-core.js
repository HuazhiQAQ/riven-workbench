(() => {
  'use strict';

  /* 0. 配置 / 数据入口 */
  const OPT       = window.__WM_OPT__ || {};
  const POLL      = OPT.poll      ?? 16;
  const OPEN_WAIT = OPT.openWait  ?? 1200;
  const PICK_WAIT = OPT.pickWait  ?? 1200;
  const NUM_WAIT  = OPT.numWait   ?? 200;
  const TYPE_MS   = OPT.typeMs    ?? 12;
  const VERBOSE   = !!OPT.verbose;

  /* ---------- 面板 + 计时 ---------- */
  const T0 = performance.now();
  const logLines = [];
  const timings = [];

  function uiInit() {
    if (document.getElementById('wmFillPanel')) return;
    const d = document.createElement('div');
    d.id = 'wmFillPanel';
    d.style.cssText = 'position:fixed;right:12px;top:12px;z-index:2147483000;'
      + 'width:min(440px,92vw);max-height:74vh;display:flex;flex-direction:column;'
      + 'background:#11151f;color:#d7dee9;border:1px solid #3a4657;border-radius:10px;'
      + 'padding:10px;font:12px/1.55 ui-monospace,Consolas,monospace;'
      + 'box-shadow:0 14px 40px rgba(0,0,0,.55)';
    const hd = document.createElement('div');
    hd.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px';
    const tt = document.createElement('b');
    tt.textContent = 'WM 快速填充';
    const cl = document.createElement('button');
    cl.type = 'button'; cl.textContent = '×';
    cl.style.cssText = 'margin-left:auto;cursor:pointer;background:#26303f;color:#d7dee9;'
      + 'border:0;border-radius:6px;padding:2px 9px;font:inherit';
    cl.onclick = () => d.parentNode && d.parentNode.removeChild(d);
    const pre = document.createElement('div');
    pre.id = 'wmFillLog';
    pre.style.cssText = 'flex:1;overflow:auto;white-space:pre-wrap;word-break:break-all';
    hd.appendChild(tt); hd.appendChild(cl);
    d.appendChild(hd); d.appendChild(pre);
    document.body.appendChild(d);
  }
  function uiLine(m) {
    const pre = document.getElementById('wmFillLog');
    if (!pre) return;
    const ln = document.createElement('div');
    ln.textContent = m;
    if (m.indexOf('✗') >= 0 || m.indexOf('⚠') >= 0) ln.style.color = '#ff8f8f';
    else if (m.indexOf('✓') >= 0) ln.style.color = '#7ee08a';
    else if (m.indexOf('──') >= 0) ln.style.color = '#8ab4f8';
    pre.appendChild(ln); pre.scrollTop = pre.scrollHeight;
  }
  const say = m => { logLines.push(m); console.log('[WM] ' + m); uiLine(m); };
  const ms  = () => Math.round(performance.now() - T0);

  /* 每步独立结账：一步失败只记一笔，继续往下 */
  async function step(name, fn) {
    const t = performance.now();
    try {
      const r = await fn();
      timings.push([name, Math.round(performance.now() - t), true]);
      return r;
    } catch (e) {
      timings.push([name, Math.round(performance.now() - t), false]);
      say('✗ ' + name + '：' + ((e && e.message) || e));
      return null;
    }
  }

  /* 1. 紫卡文本解析 */
  /* 词条文本 { name, value, mult }。 */
  function splitStat(v) {
    const s = String(v || '').trim();
    let m = s.match(/^(.+?)\s*[×xX*]\s*([\d.]+)\s*$/);
    if (m) return { name: m[1].trim(), value: parseFloat(m[2]), mult: true };
    m = s.match(/^(.+?)\s*([+\-−－])\s*([\d.]+)\s*%?\s*$/);
    if (m) {
      const num = parseFloat(m[3]);
      return { name: m[1].trim(), value: /[-−－]/.test(m[2]) ? -num : num, mult: false };
    }
    m = s.match(/^(.+?)\s*([\d.]+)\s*%?\s*$/);
    if (m) return { name: m[1].trim(), value: parseFloat(m[2]), mult: false };
    return null;
  }

  var WM_LANG = (function () {
    try {
      var h = String((document.documentElement && document.documentElement.getAttribute('lang')) || '').toLowerCase();
      if (h.indexOf('en') === 0) return 3;
    } catch (_) { ZKHTML.warn('填表/wm-fill-core.js:98', _); }
    return 2;
  })();

  function statOf(row) {
    var cn = '', wm = '';
    try {
      var id = WM_STAT_ROW_ID[row], e = WM_STAT_ID[id];
      if (e) { cn = e[0] || ''; wm = (WM_LANG === 3 ? e[3] : e[2]) || e[2] || cn; }
    } catch (_) { ZKHTML.warn('填表/wm-fill-core.js:107', _); }
    return { cn: cn, wm: wm || cn };
  }

  var SH_ALIAS = [

    { k: '双爆', rows: [4, 5] }, { k: '双暴', rows: [4, 5] },
    { k: '双爆伤', rows: [4, 5] }, { k: '双暴伤', rows: [4, 5] },

    { k: '基础伤害', rows: [2] }, { k: '近战伤害', rows: [3] },
    { k: '暴击几率', rows: [4] }, { k: '暴击伤害', rows: [5] },
    { k: '触发几率', rows: [6] }, { k: '触发时间', rows: [7] },
    { k: '射速 / 攻击速度', rows: [8] }, { k: '射速/攻击速度', rows: [8] },
    { k: '射速', rows: [8] }, { k: '攻击速度', rows: [8] },
    { k: '冰冻伤害', rows: [9] }, { k: '毒素伤害', rows: [10] },
    { k: '电击伤害', rows: [11] }, { k: '火焰伤害', rows: [12] },
    { k: '冲击伤害', rows: [13] }, { k: '切割伤害', rows: [14] },
    { k: '穿刺伤害', rows: [15] },
    { k: '对科普斯的伤害', rows: [16] }, { k: '对克隆尼的伤害', rows: [17] },
    { k: '对异变体的伤害', rows: [18] }, { k: '对奥罗金的伤害', rows: [42] },
    { k: '对科腐者的伤害', rows: [43] }, { k: '对炽蛇军的伤害', rows: [44] },
    { k: '多重射击', rows: [19] }, { k: '穿透', rows: [20] },
    { k: '弹匣容量', rows: [21] }, { k: '弹药最大值', rows: [22] },
    { k: '装填速度', rows: [23] }, { k: '投射物速度', rows: [24] },
    { k: '武器后坐力', rows: [25], flip: true }, { k: '后坐力', rows: [25], flip: true },
    { k: '变焦', rows: [26] }, { k: '初始连击', rows: [27] },
    { k: '连击持续时间', rows: [28] }, { k: '额外连击数几率', rows: [29] },
    { k: '概率不获得连击数', rows: [30] }, { k: '重击效率', rows: [31] },
    { k: '滑行攻击暴击几率', rows: [32] }, { k: '处决伤害', rows: [33] },
    { k: '攻击范围', rows: [34] }, { k: '异常状态伤害', rows: [35] },
    { k: '毒气伤害', rows: [36] }, { k: '腐蚀伤害', rows: [37] },
    { k: '病毒伤害', rows: [38] }, { k: '辐射伤害', rows: [39] },
    { k: '爆炸伤害', rows: [40] }, { k: '磁力伤害', rows: [41] },
    { k: '弱点伤害', rows: [45] }, { k: '弱点暴击几率', rows: [46] },
    { k: '弹药效率', rows: [47] }, { k: '收起武器时弹匣每秒自动装填', rows: [48] },
    { k: '重击伤害', rows: [49] }, { k: '重击准备速度', rows: [50] },
    { k: '招架角度', rows: [51] }, { k: '震地攻击伤害', rows: [52] },

    { k: '基伤', rows: [2] }, { k: '暴击率', rows: [4] }, { k: '暴率', rows: [4] },
    { k: '爆率', rows: [4] }, { k: '暴伤', rows: [5] }, { k: '爆伤', rows: [5] },
    { k: '触率', rows: [6] }, { k: '触发', rows: [6] }, { k: '触时', rows: [7] },
    { k: '攻速', rows: [8] }, { k: '多重', rows: [19] }, { k: '弹匣', rows: [21] },
    { k: '弹容', rows: [21] }, { k: '弹药', rows: [22] }, { k: '备弹', rows: [22] },
    { k: '装填', rows: [23] }, { k: '换弹', rows: [23] }, { k: '投射', rows: [24] },
    { k: '弹速', rows: [24] }, { k: '后座', rows: [25], flip: true },
    { k: '瞄准', rows: [26] }, { k: '初连', rows: [27] }, { k: '初始', rows: [27] },
    { k: '连击持续', rows: [28] }, { k: '连击几率', rows: [29] }, { k: '额外连击', rows: [29] },
    { k: '重效', rows: [31] }, { k: '滑暴', rows: [32] }, { k: '滑行', rows: [32] },
    { k: '处决', rows: [33] }, { k: '范围', rows: [34] }, { k: '异况', rows: [35] },
    { k: '异常', rows: [35] }, { k: '毒气', rows: [36] }, { k: '腐蚀', rows: [37] },
    { k: '病毒', rows: [38] }, { k: '辐射', rows: [39] }, { k: '爆炸', rows: [40] },
    { k: '磁力', rows: [41] }, { k: '弱点伤', rows: [45] }, { k: '弱点暴击', rows: [46] },
    { k: '弱暴', rows: [46] }, { k: '弹效', rows: [47] }, { k: '收枪', rows: [48] },
    { k: '重击', rows: [49] }, { k: '蓄力', rows: [50] }, { k: '招架', rows: [51] },
    { k: '震地', rows: [52] },

    { k: '对G', rows: [17] }, { k: '对C', rows: [16] }, { k: '对I', rows: [18] }, { k: '对O', rows: [42] },
    { k: 'G佬', rows: [17] }, { k: 'C佬', rows: [16] }, { k: 'I佬', rows: [18] }, { k: 'O佬', rows: [42] },
    { k: '克隆尼', rows: [17] }, { k: '科普斯', rows: [16] }, { k: '异变体', rows: [18] }, { k: '奥罗金', rows: [42] },

    { k: '基', rows: [2] }, { k: '暴', rows: [4] }, { k: '爆', rows: [5] }, { k: '多', rows: [19] },
    { k: '触', rows: [6] }, { k: '毒', rows: [10] }, { k: '冰', rows: [9] }, { k: '电', rows: [11] },
    { k: '火', rows: [12] }, { k: '冲', rows: [13] }, { k: '切', rows: [14] }, { k: '穿', rows: [15] },
    { k: '腐', rows: [37] }, { k: '病', rows: [38] }, { k: '辐', rows: [39] }, { k: '磁', rows: [41] },

    { k: 'DMG', rows: [2] }, { k: 'CC', rows: [4] }, { k: 'CD', rows: [5] },
    { k: 'SC', rows: [6] }, { k: 'SD', rows: [7] }, { k: 'FR', rows: [8] }, { k: 'AS', rows: [8] },
    { k: 'COLD', rows: [9] }, { k: 'TOXIN', rows: [10] }, { k: 'TOX', rows: [10] },
    { k: 'ELEC', rows: [11] }, { k: 'ELECTRIC', rows: [11] }, { k: 'HEAT', rows: [12] },
    { k: 'IMP', rows: [13] }, { k: 'SLASH', rows: [14] }, { k: 'PUNC', rows: [15] },
    { k: 'DTC', rows: [16] }, { k: 'DTG', rows: [17] }, { k: 'DTI', rows: [18] }, { k: 'DTO', rows: [42] },
    { k: 'MS', rows: [19] }, { k: 'PT', rows: [20] }, { k: 'MAG', rows: [21] },
    { k: 'AMMO', rows: [22] }, { k: 'RLS', rows: [23] }, { k: 'PFS', rows: [24] },
    { k: 'REC', rows: [25], flip: true }, { k: 'ZOOM', rows: [26] }, { k: 'IC', rows: [27] },
    { k: 'COMBO', rows: [28] }, { k: 'CGAIN', rows: [29] }, { k: 'EFF', rows: [31] },
    { k: 'SLIDE', rows: [32] }, { k: 'FIN', rows: [33] }, { k: 'RANGE', rows: [34] },
    { k: 'GAS', rows: [36] }, { k: 'CORR', rows: [37] }, { k: 'VIRAL', rows: [38] },
    { k: 'RAD', rows: [39] }, { k: 'BLAST', rows: [40] }, { k: 'MAGNETIC', rows: [41] },
    { k: 'WEAKCC', rows: [46] }, { k: 'WEAK', rows: [45] }
  ].map(function (a) {
    return { k: a.k, lk: a.k.toLowerCase(), rows: a.rows, flip: !!a.flip,
             ascii: /^[A-Za-z]/.test(a.k) };
  }).sort(function (a, b) { return b.k.length - a.k.length; });

  var _isWordChar = function (c) { return !!c && /[A-Za-z0-9]/.test(c); };

  var _isLetter = function (c) { return !!c && /[A-Za-z]/.test(c); };

  function findAlias(s, sl) {
    var best = null;
    for (var i = 0; i < SH_ALIAS.length; i++) {
      var a = SH_ALIAS[i];
      var src = a.ascii ? sl : s;
      var at = src.indexOf(a.ascii ? a.lk : a.k);
      if (at < 0) continue;
      if (a.ascii && (_isLetter(s.charAt(at - 1)) || _isLetter(s.charAt(at + a.k.length)))) continue;
      if (!best || at < best.at || (at === best.at && a.k.length > best.a.k.length)) {
        best = { a: a, at: at };
      }
    }
    return best;
  }

  function findWeaponName(s, sl) {
    var best = null;
    var cn = (typeof WM_ITEM_LIST !== 'undefined' && WM_ITEM_LIST) || [];
    for (var i = 0; i < cn.length; i++) {
      var nm = cn[i];
      if (!nm || nm.length < 2) continue;
      var at = s.indexOf(nm);
      if (at >= 0 && (!best || nm.length > best.len)) best = { at: at, len: nm.length, cn: nm };
    }
    var en = (typeof WM_ITEM_LIST_EN !== 'undefined' && WM_ITEM_LIST_EN) || [];
    for (var j = 0; j < en.length; j++) {
      var e = en[j];
      if (!e || e.length < 3) continue;
      var k = e.toLowerCase(), at2 = sl.indexOf(k);
      if (at2 < 0) continue;
      if (_isWordChar(s.charAt(at2 - 1)) || _isWordChar(s.charAt(at2 + e.length))) continue;
      if (best && best.len >= e.length) continue;
      var back = '';
      try { back = (typeof WM_WEAPON_EN2CN !== 'undefined' && WM_WEAPON_EN2CN[e]) || ''; } catch (_) { ZKHTML.warn('填表/wm-fill-core.js:228', _); }
      if (!back) continue;
      best = { at: at2, len: e.length, cn: back };
    }
    return best;
  }

  function valueAround(s, at, len) {
    var after = s.slice(at + len);
    var m = /^[\s:：=]*([+\-−－]?)\s*(\d+(?:[.,]\d+)?)\s*%?/.exec(after);
    if (m) return { sign: m[1], num: parseFloat(String(m[2]).replace(',', '.')) };
    var before = s.slice(0, at);
    var m2 = /([+\-−－]?)\s*(\d+(?:[.,]\d+)?)\s*%\s*$/.exec(before);
    if (m2) return { sign: m2[1], num: parseFloat(String(m2[2]).replace(',', '.')), before: true };
    return null;
  }

  function parseFreeText(text) {
    var out = { weapon: '', pos: [], neg: [], mastery: null, modLevel: null, combo: null, polarity: '' };
    var s = String(text || '').replace(/[\u3000]/g, ' ');
    if (!s.trim()) return out;

    s = s.replace(/\d+\s*正(?:\s*\d+\s*负)?/g, ' ');
    var met = [
      [/(?:精通段位|段位)\s*[：:]?\s*(\d+)/, 'mastery'],
      [/(?:Mod\s*等级|Mod等级|等级)\s*[：:]?\s*(\d+)/, 'modLevel'],
      [/(?:循环次数|洗卡次数|循环)\s*[：:]?\s*(\d+)/, 'combo'],
      [/洗了\s*(\d+)\s*次/, 'combo'], [/(\d+)\s*洗/, 'combo'],
      [/(\d+)\s*段(?!位)/, 'mastery']
    ];
    for (var q = 0; q < met.length; q++) {
      var mm = met[q][0].exec(s);
      if (mm && out[met[q][1]] == null) {
        out[met[q][1]] = parseInt(mm[1], 10);
        s = s.slice(0, mm.index) + ' '.repeat(mm[0].length) + s.slice(mm.index + mm[0].length);
      }
    }

    var w = findWeaponName(s, s.toLowerCase());
    if (w) {
      out.weapon = w.cn;
      s = s.slice(0, w.at) + ' '.repeat(w.len) + s.slice(w.at + w.len);
    }

    var guard = 0;
    while (guard++ < 40) {
      var sl = s.toLowerCase();
      var hit = findAlias(s, sl);
      if (!hit) break;
      var a = hit.a, at = hit.at;

      var pre = s.slice(Math.max(0, at - 4), at).replace(/\s+$/, '');
      var neg = /(?:负|[-−－])$/.test(pre);

      var v = valueAround(s, at, a.k.length);
      var val = null;
      if (v && isFinite(v.num)) {
        var minus = neg || v.sign === '-' || v.sign === '−' || v.sign === '－';
        val = minus ? -Math.abs(v.num) : Math.abs(v.num);
      }

      if (a.flip) val = val == null ? null : -Math.abs(val);
      var isNeg = a.flip || neg || (val != null && val < 0);

      for (var ri = 0; ri < a.rows.length; ri++) {
        var st = statOf(a.rows[ri]);
        (isNeg ? out.neg : out.pos).push({ name: st.cn, wm: st.wm, value: val, mult: false });
      }

      var cut0 = at, cut1 = at + a.k.length;
      if (neg) cut0 = at - 1;
      if (v && v.num != null) {
        var tail = s.slice(cut1);
        var mv = /^[\s:：=]*[+\-−－]?\s*\d+(?:[.,]\d+)?\s*%?/.exec(tail);
        if (mv) cut1 += mv[0].length;
        else if (v.before) cut0 = Math.max(0, at - (String(v.num).length + 2));
      }
      s = s.slice(0, cut0) + ' '.repeat(Math.max(1, cut1 - cut0)) + s.slice(cut1);
    }
    return out;
  }

  function parseRiven(text) {
    const lines = String(text || '').split(/\r?\n/);
    const out = { weapon: '', pos: [], neg: [], mastery: null, modLevel: null, combo: null, polarity: '' };
    const rest = [];
    for (let raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      let m = line.match(/^武器名称[：:]\s*(.+)$/);
      if (m) { out.weapon = m[1].trim(); continue; }
      m = line.match(/^正面(?:词条|属性)[：:]\s*(.+)$/);
      if (m) { const p = splitStat(m[1]); if (p) { out.pos.push(p); continue; } }
      m = line.match(/^负面(?:词条|属性)[：:]\s*(.+)$/);
      if (m) { const p = splitStat(m[1]); if (p) { out.neg.push(p); continue; } }
      m = line.match(/^精通段位[：:]\s*(\d+)/);
      if (m) { out.mastery = parseInt(m[1], 10); continue; }
      m = line.match(/^(?:Mod\s*)?等级[：:]\s*(\d+)/);
      if (m) { out.modLevel = parseInt(m[1], 10); continue; }
      m = line.match(/^循环次数[：:]\s*(\d+)/);
      if (m) { out.combo = parseInt(m[1], 10); continue; }
      m = line.match(/^极性[：:]\s*(.+)$/);
      if (m) { out.polarity = m[1].trim(); continue; }
      rest.push(line);
    }

    if (rest.length) {
      const ft = parseFreeText(rest.join('\n'));
      if (!out.weapon && ft.weapon) out.weapon = ft.weapon;
      const hasPos = (n) => out.pos.some((x) => x.name === n);
      const hasNeg = (n) => out.neg.some((x) => x.name === n);
      for (const x of ft.pos) if (!hasPos(x.name)) out.pos.push(x);
      for (const x of ft.neg) if (!hasNeg(x.name)) out.neg.push(x);
      out.mastery = out.mastery == null ? ft.mastery : out.mastery;
      out.modLevel = out.modLevel == null ? ft.modLevel : out.modLevel;
      out.combo = out.combo == null ? ft.combo : out.combo;
      if (!out.polarity && ft.polarity) out.polarity = ft.polarity;
    }
    return out;
  }

  /* 2. DOM 小工具 */
  const fire = (el, t) => el.dispatchEvent(new Event(t, { bubbles: true }));

  function setNativeValue(el, v) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype
                : el.tagName === 'SELECT'  ? HTMLSelectElement.prototype
                : HTMLInputElement.prototype;
    const d = Object.getOwnPropertyDescriptor(proto, 'value');
    if (d && d.set) d.set.call(el, String(v)); else el.value = String(v);
  }

  /* 可见性判定尽量别用 getBoundingClientRect —— 它会强制同步布局。 */
  const vis = el => {
    if (!el || el.hidden) return false;
    if (typeof el.checkVisibility === 'function') {
      try { if (el.checkVisibility()) return true; } catch (_) { ZKHTML.warn('填表/wm-fill-core.js:368', _); }
    }
    const r = el.getBoundingClientRect();
    return !!(r.width || r.height);
  };

  /* 观察器不盯 attributes / characterData。 */
  function until(test, timeout, what, watch) {
    return new Promise((res, rej) => {
      const t0 = performance.now();
      let last = 0, done = false;
      const check = () => {
        if (done) return;
        let v = null;
        try { v = test(); } catch (_) { v = null; }
        if (v) { done = true; cleanup(); return res(v); }
        if (performance.now() - t0 > timeout) {
          done = true; cleanup();
          return rej(new Error('等「' + (what || '状态') + '」超时'));
        }
      };
      const onMut = () => {
        const now = performance.now();
        if (now - last < 8) return;
        last = now; check();
      };
      const moA = new MutationObserver(onMut);
      const moB = new MutationObserver(onMut);
      const iv = setInterval(check, POLL);
      function cleanup() {
        done = true;
        try { moA.disconnect(); } catch (_) { ZKHTML.warn('填表/wm-fill-core.js:405', _); }
        try { moB.disconnect(); } catch (_) { ZKHTML.warn('填表/wm-fill-core.js:406', _); }
        clearInterval(iv);
      }
      try {
        if (watch) {

          /* A. 只看 watch 自己的 class（不带 subtree 不会被 300 个条目放大） */
          moA.observe(watch, { attributes: true, attributeFilter: ['class'] });

          /* B. 子树里新增/删除节点（选项挂上来了） */
          moB.observe(watch, { childList: true, subtree: true });
        } else {
          moA.observe(document.body, { childList: true, subtree: true });
        }
      } catch (_) {
        try { moA.observe(document.body, { childList: true, subtree: true }); } catch (_2) { ZKHTML.warn('填表/wm-fill-core.js:421', _2); }
      }
      check();
    });
  }
  const okOrFalse = (p) => p.then(() => true).catch(() => false);

  /* 3. 名字匹配（运行时词典已剥离，只按生成时译好的 WM 原文等号比对） */
  /* 归一：去空白 / 冒号 / 全半角统一 / 转小写。 */
  const norm = s => String(s ?? '')
    .replace(/[\s　]+/g, '')
    .replace(/[：:]/g, '')
    .replace(/（/g, '(').replace(/）/g, ')')
    .toLowerCase();

  /* WM 中文站的武器条目就是国际服中文名（可能带 - 空格 & Prime） */
  /* WM 回填成「Cassowar 鹤鸵长戟」这类混合内容时判不出选中。 */
  const zhOnly = s => norm(s).replace(/[a-z0-9._\-'"]+/g, '');

  /* 形态后缀：这些括号内容决定「是哪一把」，比名前缀更要紧。 */
  /* 把名字拆成「裸名 + 形态后缀」 */
  /* 把名字拆成「裸名 + 形态后缀」 */
  function FORM_SUF(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/\((?:[^()]*)\)/g, m => '\u0001' + norm(m) + '\u0002')
      .replace(/\u00b7/g, '\u0001')
      .split('\u0001').filter(Boolean);
  }

  const stem = s => norm(FORM_SUF(s)[0] || '');
  const nameHit = (g, w) => {
    if (!g || !w) return false;
    const gn = norm(g), wn = norm(w);
    if (gn === wn) return true;

    /* 路 1：剥掉形态后缀后，裸名互相包含（英文名、Prime 变体吃这条） */
    const gs = stem(g), ws = stem(w);
    if (gs && ws && (gs.indexOf(ws) >= 0 || ws.indexOf(gs) >= 0)) {

      /* 形态后缀必须「都有或都没有」—— 一边有 (Melee) 一边没有 */
      const gf = FORM_SUF(g).slice(1).map(norm).join('');
      const wf = FORM_SUF(w).slice(1).map(norm).join('');
      if ((gf && wf) || (!gf && !wf)) return true;
    }

    /* 路 2：只比中文部分（中文站条目夹带 ASCII 时用） */
    const gz = zhOnly(g), wz = zhOnly(w);
    if (gz && wz && gz !== wz && (gz.indexOf(wz) >= 0 || wz.indexOf(gz) >= 0)) {
      const gsz = stem(gz), wsz = stem(wz);
      if (gsz && wsz && gsz.indexOf(wsz) >= 0) return true;
    }
    return false;
  };
  const zhNorm = s => zhOnly(s) || norm(s);

  /* 从候选里挑最像的：不猜。 */
  function bestEntry(entries, want, isStat) {
    if (!entries || !entries.length) return null;
    let fb = null;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (isStat) {

        /* 词条：整串包含比对（英文站的 Heat / 中文站的 火焰伤害 都吃这条） */
        const n = e.n;
        const w = norm(want);
        if (n === w) return e;
        if (!fb && (n.indexOf(w) >= 0 || w.indexOf(n) >= 0)) fb = e;
      } else if (nameHit(e.text, want)) {

        /* 武器：完全匹配优先，其次任意一条命中路（原文 / 只比中文） */
        if (norm(e.text) === norm(want)) return e;
        if (!fb) fb = e;
      }
    }
    return fb;
  }

  const wmName = st => String((st && (st.wm || st.name)) || '');

  /* 4. 页面结构定位 */
  const SEEKER = 'div[class*="seeker"],div[class*="react-fiber-select"],div[class*="fiber-select"]';
  const seekerInput = root => root && root.querySelector('input,textarea');
  const pickedCls = root => /selected/i.test(String(root && root.className || ''));

  const CREATE_HINT = /auction-?create|create__component/i;
  const SEARCH_HINT = /auctions?-search|\bsearch\b/i;
  let _form = null;
  function formRoot() {
    if (_form) return _form;
    const forms = [...document.querySelectorAll('form')];
    let f = forms.find(x => CREATE_HINT.test(String(x.className)))
        || forms.find(x => x.querySelector('[id*="auction-create"], label[for*="auction-create"]'))
        || forms.find(x => !SEARCH_HINT.test(String(x.className)) && x.querySelector(SEEKER));
    if (!f) f = document.querySelector('[class*="auction-create"]');
    _form = f || document;
    return _form;
  }
  const scope = () => formRoot();

  /* 中文标签「武器名称」在真机上不存在，只按它找会让 findSeekerByLabel 返回 null。 */
  const WM_WEAPON_LABELS = ['weapon name', '武器名称', '武器', 'itemname', 'item name', 'weapon'];

  function findSeekerByLabel(keys) {
    const hits = [];
    for (const k of keys) {
      const nk = norm(k);
      for (const lb of scope().querySelectorAll('label')) {
        const nt = norm(lb.textContent);
        if (nt !== nk && nt.indexOf(nk) < 0) continue;
        const forId = lb.getAttribute('for') || '';
        if (SEARCH_HINT.test(forId)) continue;
        const box = (forId && scope().querySelector('[id="' + forId + '"]')) || lb.parentElement;
        if (!box) continue;
        const sk = box.querySelector(SEEKER);
        if (!sk || !vis(sk)) continue;
        hits.push({ sk, score: CREATE_HINT.test(forId) ? 2 : 1 });
      }
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.length ? hits[0].sk : null;
  }

  /* 词条行 */
  let _rowCache = null, _rowKey = '';
  function statRows(force) {
    const F = scope();
    const probe = F.querySelectorAll('div[class*="form-group"]');
    const key = probe.length + '|' + (probe[0] ? probe[0].className : '');
    if (!force && _rowCache && _rowKey === key) return _rowCache;
    const cands = [];
    F.querySelectorAll('div[class*="__stats"],div[class*="form-group"],li[class*="form-group"]')
      .forEach(row => {
        if (row.hidden) return;
        const sk = row.querySelector(SEEKER);
        const num = row.querySelector('input[type="number"]');
        if (sk && num) cands.push({ row, seeker: sk, num });
      });
    if (!cands.length) {
      F.querySelectorAll(SEEKER).forEach(sk => {
        if (sk.closest('[id*="search"],[class*="search"]')) return;
        let p = sk;
        while (p && p !== F) {
          const num = p.querySelector('input[type="number"]');
          if (num) { cands.push({ row: p, seeker: sk, num }); break; }
          p = p.parentElement;
        }
      });
    }
    const rows = cands.filter(c => !cands.some(o => o !== c && c.row.contains(o.row)));
    rows.forEach((r, i) => { r.kind = rowKind(r); r._i = i; });
    _rowCache = rows; _rowKey = key;
    return rows;
  }

  /* 判据取并集：label class / label 文字 / seeker 的 selected 类 / 数值框 min-max */
  function rowKind(r) {
    let neg = false, pos = false;
    const sk = String(r.seeker.className || '');
    r.row.querySelectorAll('label').forEach(lb => {
      const cls = String(lb.className || '');
      const txt = norm(lb.textContent);
      if (/negative/i.test(cls + ' ' + sk) || /负面/.test(txt)) neg = true;
      if (/positive/i.test(cls + ' ' + sk) || /正面/.test(txt)) pos = true;
    });
    if (neg && !pos) return 'neg';
    if (pos && !neg) return 'pos';
    if (/selectedNegative/i.test(sk)) return 'neg';
    if (/selectedPositive/i.test(sk)) return 'pos';
    const mn = parseFloat(r.num.getAttribute('min'));
    const mx = parseFloat(r.num.getAttribute('max'));
    if (isFinite(mx) && mx <= 0) return 'neg';
    if (isFinite(mn) && mn >= 0) return 'pos';
    return '';
  }

  /* 取第 i 个正面/负面行。 */
  function rowAt(kind, i) {
    const rows = statRows(true).filter(r => r.kind === kind || (!r.kind && kind === 'pos'));
    return rows[i] || null;
  }

  /* 原生 <select> 索引（只扫一次） */
  let _selCache = null;
  function selectMap(force) {
    if (_selCache && !force) return _selCache;
    const map = { all: [] };
    scope().querySelectorAll('select').forEach(s => {
      if (SEARCH_HINT.test(s.id || '')) return;
      let label = '';
      const lb = (s.id && scope().querySelector('label[for="' + s.id + '"]'))
        || (s.closest('[class*="form-group"]') || s.parentElement || document).querySelector('label');
      if (lb) label = norm(lb.textContent);
      const key = label || norm(s.id) || '';
      const entry = { el: s, label };
      if (/裂罅|riven|modname|mod_name/.test(key)) map.modName = entry;
      else if (/极性|polarity/.test(key)) map.polarity = entry;
      else if (/类别|category/.test(key)) map.category = entry;
      else if (/精通|mastery|段位/.test(key)) map.mastery = entry;
      else if (/等级|rank/.test(key)) map.modLevel = entry;
      else if (/循环|re-?roll|combo/.test(key)) map.combo = entry;
      map.all.push(entry);
    });
    _selCache = map;
    return map;
  }

  /* 已认领的控件。 */
  const CLAIMED = new Set();

  function findNumByLabel(keys) {
    const F = scope();
    const labels = [...F.querySelectorAll('label')];
    const cands = [];
    for (const k of keys) {
      const nk = norm(k);
      if (!nk) continue;
      for (const lb of labels) {
        if (CLAIMED.has(lb)) continue;
        const nt = norm(lb.textContent);
        let sc = 0;
        if (nt === nk) sc = 100;
        else if (nt.indexOf(nk) === 0) sc = 60;
        else if (nt.indexOf(nk) >= 0) sc = 30;
        else continue;
        const forId = lb.getAttribute('for') || '';
        if (SEARCH_HINT.test(forId)) continue;
        let el = (forId && F.querySelector('[id="' + forId + '"]')) || null;
        if (el && el.tagName !== 'INPUT' && el.tagName !== 'SELECT') el = el.querySelector('input,select');
        if (!el) el = (lb.parentElement || F).querySelector('input,select');
        if (!el) continue;
        if (el.tagName !== 'INPUT' && el.tagName !== 'SELECT') continue;
        if (CLAIMED.has(el)) continue;
        cands.push({ el, lb, sc: sc + (CREATE_HINT.test(forId) ? 5 : 0) });
      }
    }
    if (!cands.length) return null;
    cands.sort((a, b) => b.sc - a.sc);
    CLAIMED.add(cands[0].el); CLAIMED.add(cands[0].lb);
    return cands[0].el;
  }

  /* 5. 下拉选择（ 核心提速区） */
  const ENTRY_SEL = 'li[class*="entry"],li[class*="item"],li[role="option"],[role="option"]';

  /* 按「选项条数」缓存。 */
  const _entryCache = new WeakMap();

  function rowEntries(root) {
    const boxes = root.querySelectorAll('[class*="dropdown"]');
    const scopeEl = boxes.length ? boxes[boxes.length - 1] : root;
    if (!vis(scopeEl)) return [];
    const list = scopeEl.querySelectorAll(ENTRY_SEL);
    const n = list.length;
    if (!n) { _entryCache.delete(scopeEl); return []; }
    const hit0 = list[0].querySelector('span');
    const hitN = list[n - 1].querySelector('span');
    const sig = n + '|' + ((hit0 ? hit0.textContent : list[0].textContent) || '').trim()
              + '|' + ((hitN ? hitN.textContent : list[n - 1].textContent) || '').trim();
    const c = _entryCache.get(scopeEl);
    if (c && c.sig === sig) return c.items;
    const out = [];
    for (let i = 0; i < n; i++) {
      const li = list[i];
      const full = (li.textContent || '').trim();
      if (!full || full.length > 60) continue;

      /* 主文本取第一个 <span>：WM 有些条目是「中文名 + 英文名」两个 span 拼在一起 */
      const sp = li.querySelector('span');
      const t = sp ? (sp.textContent || '').trim() : '';
      const text = t || full;
      if (/什么都没找到|没有结果|no results/i.test(text)) continue;
      out.push({ el: li, text, full, n: norm(text), nf: norm(full) });
    }
    _entryCache.set(scopeEl, { sig, items: out });
    return out;
  }

  /* WM 的 seeker 只有一颗按钮，选中前后换脸 */
  function clearBtn(root) {
    return [...root.querySelectorAll('button')].find(b => vis(b) && (
      /clear-?all/i.test(String(b.className)) || /icon-backspace/.test(b.innerHTML || '')
    )) || null;
  }
  function chevBtn(root) {
    return [...root.querySelectorAll('button')].find(b => vis(b) && (
      /chevron|caret|arrow/i.test(String(b.className)) || /icon-chevron|icon-caret|icon-arrow/.test(b.innerHTML || '')
    )) || null;
  }
  const hasSelection = root => !!clearBtn(root);
  const isOpen = root => /focused--/i.test(String(root && root.className || ''))
    || /rotate--/i.test(String((chevBtn(root) || {}).className || ''));

  /* 同时派发 Pointer + Mouse + click —— WM 监听 onPointerDown */
  const tap = el => {
    const o = { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, detail: 1, view: window };
    if (typeof PointerEvent === 'function') {
      el.dispatchEvent(new PointerEvent('pointerdown', o));
      el.dispatchEvent(new PointerEvent('pointerup', o));
    }
    el.dispatchEvent(new MouseEvent('mousedown', o));
    el.dispatchEvent(new MouseEvent('mouseup', o));
    el.dispatchEvent(new MouseEvent('click', o));
  };

  /* 展开是自适应探测，按代价从低到高 */
  async function openSeeker(root) {
    const input = seekerInput(root);
    if (!input) throw new Error('下拉容器里没有 input');
    input.focus();
    if (isOpen(root)) return input;
    const chev = chevBtn(root);
    if (chev) tap(chev); else tap(input);
    if (isOpen(root)) return input;
    tap(input);
    if (isOpen(root)) return input;
    input.dispatchEvent(new KeyboardEvent('keydown',
      { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, which: 40, bubbles: true }));
    return input;
  }

  /* 事件从条目最深层元素发出（li > div > span），只往上冒泡不往下传。 */
  const deepest = el => { let n = el; while (n && n.firstElementChild) n = n.firstElementChild; return n || el; };
  const clickEntry = el => { tap(deepest(el)); };

  /* 判定「选上了没有」分两档 */
  function isPicked(root, input, want, hadClear) {
    const v = norm(input && input.value);
    if (v) {
      const w = norm(want);
      return v.indexOf(w) >= 0 || w.indexOf(v) >= 0;
    }
    return !hadClear && !!(hasSelection(root) || pickedCls(root));
  }
  const isPickedLoose = (root, input, want) => {
    const v = norm(input && input.value);
    const w = norm(want);
    if (v) return v.indexOf(w) >= 0 || w.indexOf(v) >= 0;
    return !!(hasSelection(root) || pickedCls(root));
  };

  /* 「对 Corpus 的伤害」与「Damage to Corpus」会互相误判成同一个。 */
  function pickedIs(root, want) {
    const v = norm((seekerInput(root) || {}).value || '');
    const w = norm(want);
    if (!v || !w) return false;
    return v.indexOf(w) >= 0 || w.indexOf(v) >= 0;
  }

  /* 武器用宽松包含比对（WM 显示「执法者 Amanata」，我们要「执法者」）。 */
  /* 武器选中判定：中文站显示「执法者 Amanata」而我们要「执法者」 */
  const weaponOk = (got, want) => nameHit(got, want);

  const waitPicked = (root, input, want, hadClear) =>
    okOrFalse(until(() => isPicked(root, seekerInput(root) || input, want, hadClear) || null,
      PICK_WAIT, '选中生效', root));

  /* 点击词条后的快速验收：每 20ms 查一次； */
  async function acceptQuick(root, input, want) {
    const li0 = () => seekerInput(root) || input;
    const t0 = Date.now();
    let closed = 0;
    while (Date.now() - t0 < PICK_WAIT) {
      if (isPickedLoose(root, li0(), want)) return true;
      if (!isOpen(root)) { if (++closed >= 3) return isPickedLoose(root, li0(), want); }
      else closed = 0;
      await new Promise(r => setTimeout(r, 20));
    }
    return isPickedLoose(root, li0(), want);
  }

  /* 开下拉 等选项出来 */
  async function openAndEntries(root) {
    const input = seekerInput(root);
    await openSeeker(root);
    let ents = rowEntries(root);
    if (ents.length) return ents;
    ents = await waitEntries(root, OPEN_WAIT);
    if (ents.length) return ents;
    input.dispatchEvent(new KeyboardEvent('keydown',
      { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, which: 40, bubbles: true }));
    return await waitEntries(root, 320);
  }

  async function waitEntries(root, ms) {
    let ents = rowEntries(root);
    if (ents.length) return ents;
    await until(() => { const e = rowEntries(root); return e.length ? e : null; }, ms, '下拉选项', root)
      .then(e => { ents = e; }).catch(() => { ents = []; });
    return ents;
  }

  /* 整串一次写入（逐字敲为备用路径，用于需要猜名字的情形） */
  async function typeInto(input, text, perChar) {
    setNativeValue(input, ''); fire(input, 'input');
    if (!perChar) { setNativeValue(input, text); fire(input, 'input'); return; }
    for (const ch of String(text)) {
      setNativeValue(input, input.value + ch);
      fire(input, 'input');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true }));
      await new Promise(r => setTimeout(r, TYPE_MS));
    }
  }

  function enterPick(input) {
    input.focus();
    ['keydown', 'keypress', 'keyup'].forEach(t =>
      input.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true })));
  }

  /* 点清除键（backspace）把这一格的选择/文字撤掉。 */
  async function clearPick(root) {
    const btn = clearBtn(root);
    if (!btn) return false;
    tap(btn);
    await new Promise(r => setTimeout(r, 160));
    return true;
  }

  /* WM 的 riven 预览面板 = WM 自己的属性登记表（ul.riven-preview__attributes > li */
  function previewAtts() {
    const pv = document.querySelector('div.riven-preview');
    if (!pv) return [];
    return [...pv.querySelectorAll('ul.riven-preview__attributes > li')].map(li => {
      const b = li.querySelector('b'), sp = li.querySelector('span');
      return {
        val: (b ? b.textContent : '').trim(),
        name: ((sp ? sp.textContent : '') || li.textContent || '').trim()
      };
    });
  }

  /* 预览面板里已经有这个词条了？ */
  function previewHas(name) {
    const k = norm(name);
    if (!k) return false;
    return previewAtts().some(a => {
      const n = norm(a.name);
      return n && (n.indexOf(k) >= 0 || k.indexOf(n) >= 0);
    });
  }

  /* 在一格里选一个词（武器走这个，带严格验收） */
  async function pick(root, name, what, isStat, verify) {
    const input = seekerInput(root);
    if (!input) throw new Error('下拉容器里没有 input');
    const want = name;
    const hadClear0 = hasSelection(root);
    if (isPicked(root, input, want, hadClear0)) { say('· ' + what + '：已选好「' + input.value + '」，跳过'); return true; }

    const liveInput = () => seekerInput(root) || input;
    const accept = () => (verify ? verify() : acceptQuick(root, input, want));

    const report = best => {
      const note = norm(best.text) === norm(want) ? ''
        : '（原名「' + want + '」→ WM 用词「' + best.text + '」）';
      const shown = String(liveInput().value || '').trim()
        ? ' · 框里显示「' + liveInput().value + '」'
        : (hasSelection(root)
          ? ' · WM 已选中（清除键已挂上），但输入框显示为空'
          : ' ⚠ 框里是空的，且没挂上清除键 —— 多半没真选上');
      say('✓ ' + what + ' = 「' + best.text + '」' + note + shown);
    };

    const ladder = [
      { how: '下拉直选',  run: () => openAndEntries(root) },
      { how: '输入全名',  run: async () => { await typeInto(input, want, false); return waitEntries(root, 700); } }
    ];
    const zh = want.replace(/[A-Za-z0-9 ._'\-]+/g, '');
    const short = Array.from(zh).slice(0, 2).join('');
    if (short.length >= 2 && short !== want) {
      ladder.push({ how: '输入前两字「' + short + '」',
        run: async () => { await typeInto(input, short, false); return waitEntries(root, 700); } });
    }

    for (const stepDef of ladder) {

      /* 每一步执行前先检查一次：前一步若已选中目标则不执行后续步骤 */
      if (isPickedLoose(root, liveInput(), want)) {
        say('✓ ' + what + ' = 「' + (liveInput().value || want) + '」（其实已经选上了，跳过剩下的招）');
        return true;
      }
      let ents = [];
      try { ents = await stepDef.run(); } catch (_) { ents = rowEntries(root); }
      const best = ents.length ? bestEntry(ents, want, isStat) : null;
      if (best) {
        clickEntry(best.el);
        if (await accept()) { report(best); return true; }
        say('· ' + what + '：' + stepDef.how + '点到了「' + best.text + '」但没生效，换下一招');
      } else {
        say('· ' + what + '：' + stepDef.how + '没匹配上（列表 ' + ents.length + ' 项），换下一招');
      }
    }

    /* 最后一招：高亮项 + 回车 */
    input.dispatchEvent(new KeyboardEvent('keydown',
      { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, which: 40, bubbles: true }));
    await new Promise(r => setTimeout(r, 80));
    enterPick(input);
    if (await accept()) { say('✓ ' + what + ' = 「' + want + '」（回车选中高亮项）'); return true; }

    if (isPickedLoose(root, liveInput(), want)) {
      say('✓ ' + what + ' = 「' + (liveInput().value || want) + '」（其实已经选上了，判定晚了半拍）');
      return true;
    }

    const avail = rowEntries(root).slice(0, 12).map(e => e.text).join(' / ');
    try { setNativeValue(input, ''); fire(input, 'input'); } catch (_) { ZKHTML.warn('填表/wm-fill-core.js:1002', _); }
    throw new Error('没能在 WM 下拉里找到「' + want + '」'
      + (avail ? ' —— 当前下拉里有：' + avail
               : ' —— 而且这一格压根没展开出选项（focused 状态：' + (isOpen(root) ? '已展开' : '没展开') + '）'));
  }

  /* 快速选词 pickQuick —— 词条行专用。 */
  async function pickQuick(root, name, what, isStat) {
    const input = seekerInput(root);
    if (!input) throw new Error('下拉容器里没有 input');
    const want = name;

    /* 已经选上了（seeker 上有 selectedPositive / selectedNegative 类） 不动它。 */
    if (pickedCls(root)) {
      if (pickedIs(root, want)) {
        say('· ' + what + '：已选好「' + (String(seekerInput(root) || {}).value || '').trim() + '」，跳过');
        return true;
      }
      say('· ' + what + '：这一格已经挂着「'
        + (String(seekerInput(root) || {}).value || '').trim() + '」，不是「' + want + '」—— 先清掉再选');
    }

    /* ① 先清：把这一格残留的选择/文字清干净 */
    try { await clearPick(root); } catch (_) { ZKHTML.warn('填表/wm-fill-core.js:1038', _); }

    const tryClick = async best => {
      if (!best) return false;
      clickEntry(best.el);

      /* 等 WM 真正接受（seeker 上出现 selected… 类）—— 最多 800ms */
      const ok = await until(() => pickedCls(root) || null, 800, '', root)
        .then(() => true).catch(() => false);
      if (ok) { say('✓ ' + what + ' = 「' + best.text + '」'); return true; }
      say('· ' + what + '：点了「' + best.text + '」但 WM 还没确认 —— 不再补点，末尾统一核对');
      return true;
    };

    /* ② 开下拉直选 */
    let ents = await openAndEntries(root);
    if (await tryClick(ents.length ? bestEntry(ents, want, isStat) : null)) return true;

    /* ③ ②没点到东西才走这：打全名 等列表 再点（仍然只点一次） */
    await typeInto(input, want, false);
    ents = await waitEntries(root, 280);
    if (!ents.length) {
      try { await openSeeker(root); } catch (_) { ZKHTML.warn('填表/wm-fill-core.js:1060', _); }
      ents = await waitEntries(root, 280);
    }
    if (await tryClick(ents.length ? bestEntry(ents, want, isStat) : null)) return true;

    say('· ' + what + '：没点上「' + want + '」—— 数值先填，最后统一核对');
    return false;
  }

  /* 6. 数值填写 */
  /* 倍率框的判定必须看区间：WM 的派系格是 min=1 max=4。 */
  function isMulBox(el) {
    if (!el) return false;
    const mn = parseFloat(el.getAttribute('min'));
    const mx = parseFloat(el.getAttribute('max'));
    return isFinite(mn) && isFinite(mx) && mn >= 1 && mx <= 10 && (mx - mn) <= 4;
  }

  /* 数值原模原样填 —— 不做任何单位推断、不做换算。 */
  function smartValue(numEl, p, mult) {
    const v = Number(p);
    if (!isFinite(v)) return 0;
    return Number(v.toFixed(4));
  }

  /* 越界预警：框的区间接不住这个值 WM 会把它记成空值（还可能多登记一条）。 */
  function rangeWarn(numEl, v, what) {
    if (!numEl) return true;
    const mn = parseFloat(numEl.getAttribute('min'));
    const mx = parseFloat(numEl.getAttribute('max'));
    const val = Number(v);
    if (isFinite(mn) && val < mn - 1e-9) {
      say('⚠ ' + what + ' = ' + val + ' 低于这个框的下限 ' + mn + ' —— WM 大概率不收，请核对数值');
      return false;
    }
    if (isFinite(mx) && val > mx + 1e-9) {
      say('⚠ ' + what + ' = ' + val + ' 超过这个框的上限 ' + mx + ' —— WM 大概率不收，请核对数值');
      return false;
    }
    return true;
  }

  function fillNum(input, v) {
    setNativeValue(input, String(v));
    fire(input, 'input'); fire(input, 'change');
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  /* 像真人键入：execCommand('insertText') 走完整 beforeinput/input 链路 */
  function typeLikeHuman(input, text) {
    input.focus();
    try { input.setSelectionRange(0, input.value.length); } catch (_) { ZKHTML.warn('填表/wm-fill-core.js:1120', _); }
    let ok = false;
    try { ok = document.execCommand('insertText', false, String(text)); } catch (_) { ok = false; }
    if (!ok) { setNativeValue(input, text); fire(input, 'input'); }
    fire(input, 'change');
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  /* 数值先写不等。 */
  function fillNumFast(input, v, what) {
    try { input.focus(); } catch (_) { ZKHTML.warn('填表/wm-fill-core.js:1132', _); }
    fillNum(input, v);
    say('· ' + what + ' = ' + v + '（已写入，末尾统一回读）');
    return true;
  }

  /* 慢路径：给末尾复查用 */
  async function fillNumVerify(input, v, what) {
    for (let i = 0; i < 2; i++) {
      input.focus();
      if (i === 0) fillNum(input, v);
      else typeLikeHuman(input, v);
      const ok = await until(() => {
        const cur = parseFloat(input.value);
        return (isFinite(cur) && Math.abs(cur - v) < 1e-6) || null;
      }, NUM_WAIT, '数值回读', input.parentElement || input).then(() => true).catch(() => false);
      if (ok) {
        say('✓ ' + what + ' = ' + input.value + (i >= 1 ? '（模拟键入写入）' : ''));
        return true;
      }
    }
    say('✗ ' + what + '：数值框还是「' + input.value + '」，应为 ' + v + ' —— 请手动补');
    return false;
  }

  /* 数字格：可能是 <input type=number>，也可能是固定档的 <select> */
  function fillField(el, v, what) {
    if (!el) throw new Error('找不到「' + what + '」控件');
    if (el.tagName !== 'SELECT') return fillNumVerify(el, v, what);
    const want = String(v);
    const opts = [...el.options];
    let hit = opts.find(o => String(o.textContent || '').trim() === want
                         || String(o.value) === want)
           || opts.find(o => String(o.textContent || '').trim().indexOf(want) >= 0);
    if (!hit) {
      say('✗ ' + what + '：下拉里没有「' + want + '」，现有：'
        + opts.map(o => o.textContent.trim()).join(' / '));
      return false;
    }
    setNativeValue(el, hit.value); fire(el, 'change');
    say('✓ ' + what + ' = 「' + hit.textContent.trim() + '」');
    return true;
  }

  /* 原生 <select> */
  function fillNative(sel, want, what) {
    const k = norm(want);
    const cur = sel.selectedOptions && sel.selectedOptions[0];
    if (cur && norm(cur.textContent).indexOf(k) >= 0) {
      say('· ' + what + '：已经是「' + cur.textContent.trim() + '」，跳过');
      return true;
    }
    let hit = null;
    for (const o of sel.options) {
      if (norm(o.textContent).indexOf(k) >= 0) { hit = o; break; }
    }
    if (!hit) throw new Error('「' + what + '」里没有「' + want + '」，现有：'
      + [...sel.options].map(o => o.textContent.trim()).join(' / '));
    setNativeValue(sel, hit.value); fire(sel, 'change');
    say('✓ ' + what + ' = 「' + hit.textContent.trim() + '」');
    return true;
  }

  /* 6.9 载荷自检 —— 断言不成立就一句话都不填。 */
  function checkPayload(D) {
    const errs = [], warns = [];
    if (!D || !D.weapon) errs.push('没有武器名');
    const pos = (D && D.pos) || [], neg = (D && D.neg) || [], all = pos.concat(neg);
    if (!pos.length) errs.push('正面词条 0 条');
    if (pos.length > 3) errs.push('正面词条 ' + pos.length + ' 条（紫卡最多 3 条）');
    if (neg.length > 1) errs.push('负面词条 ' + neg.length + ' 条（紫卡最多 1 条）');
    if (all.length > 4) errs.push('词条总数 ' + all.length + ' 条（最多 4 条）');
    const seenName = {}, seenRow = {};
    all.forEach(s => {
      const v = Number(s.value);
      if (s.value == null) warns.push('「' + s.name + '」没有数值，这一格会留空');
      else if (!isFinite(v)) errs.push('「' + s.name + '」数值不是数字：' + s.value);
      else if (v === 0) errs.push('「' + s.name + '」数值是 0');
      else {
        const lim = s.mult ? 4 : 400;      // 倍率词条（派系伤害）上限 4，百分比上限 400
        if (Math.abs(v) > lim) errs.push('「' + s.name + '」数值 ' + v + ' 超出合理范围（±' + lim + '）');
      }
      const k = norm(s.wm || s.name);
      if (k) { if (seenName[k]) errs.push('「' + s.name + '」在同一张卡上重复出现'); seenName[k] = 1; }
      if (s.row != null) { if (seenRow[s.row]) errs.push('「' + s.name + '」和另一条是同一个词条行'); seenRow[s.row] = 1; }
    });
    return { errs: errs, warns: warns };
  }

  /* 6.95 裂罅卡名终审（只读）。 */
  function nameOracle(sm) {
    const entry = sm && sm.modName;
    if (!entry || !entry.el) return;                     // 页面上没这个控件就静默跳过
    const el = entry.el;
    let opts = [];
    try {
      if (String(el.tagName).toUpperCase() === 'INPUT') {
        const v = String(el.value || '').trim();
        if (v) opts = [v];
      } else {
        opts = [...el.options].map(o => String(o.textContent || o.value || '').trim()).filter(Boolean);
      }
    } catch (e) { opts = []; }
    if (!opts.length) {
      say('⚠ 「裂罅Mod名称」是空的 —— 这组词条 WM 没认，请对照原图核对');
      return;
    }
    const uniq = [...new Set(opts)];
    if (uniq.length === 1) say('✓ WM 生成卡名：' + uniq[0] + '（唯一候选，这组词条 WM 认可）');
    else say('⚠ WM 给出 ' + uniq.length + ' 个候选卡名：' + uniq.slice(0, 5).join(' / ')
      + ' —— 组合有歧义，务必对着原图核一遍');
  }

  /* 6.97 多余空行清理：只会点「增加」的话，多出来的空行留在表单里 */
  function isRowEmpty(r) {
    const v = String((seekerInput(r.seeker) || {}).value || '').trim();
    const n = String((r.num && r.num.value) || '').trim();
    return !v && (!n || !parseFloat(n));
  }
  function removeStatRow(r) {
    const btns = [...r.row.querySelectorAll('button, a, [role="button"]')];
    const hit = btns.find(b => {
      if (!vis(b)) return false;
      const cls = String(b.className || ''), html = String(b.innerHTML || '');
      if (/backspace|chevron|caret|arrow|clear-?all/i.test(cls + ' ' + html)) return false;
      return /trash|delete|remove/i.test(cls)
        || /icon-(trash|delete|close|cross|times)/i.test(html)
        || /^[×✕✖]$/.test((b.textContent || '').trim());
    });
    if (!hit) return false;
    tap(hit);
    return true;
  }
  async function pruneStatRows(needPos, needNeg) {
    for (let pass = 0; pass < 3; pass++) {
      const rows = statRows(true);
      const pos = rows.filter(r => r.kind !== 'neg');
      const neg = rows.filter(r => r.kind !== 'pos');
      const extra = [];
      if (pos.length > needPos) extra.push(...pos.slice(needPos));
      if (neg.length > needNeg) extra.push(...neg.slice(needNeg));
      if (!extra.length) return;
      const empties = extra.filter(isRowEmpty);

      /* 多余行里有内容 绝不碰，但要在界面上提示（可能是手工填的内容） */
      if (empties.length < extra.length) {
        say('· 有 ' + (extra.length - empties.length) + ' 条多余行里带着内容，没敢动 —— 请自己确认一下');
      }
      if (!empties.length) return;

      const before = rows.length;

      /* 找不到删除按钮也要说一声：留下来会拦住 WM 提交，静默返回等于假装干净 */
      if (!removeStatRow(empties[empties.length - 1])) {
        say('· 还有 ' + empties.length + ' 条多余空行，但这行上没有删除按钮 —— 请手动删掉再提交');
        return;
      }
      await new Promise(z => setTimeout(z, 140));
      const after = statRows(true).length;
      if (after >= before) { say('· 多余空行删不掉（点了删除但行数没变），保持原样'); return; }
      say('· 删掉一条多余空行：' + before + ' → ' + after + ' 行');
    }
  }

  /* 7. 主流程 */
  async function main(D) {
    const okN = { v: 0 }, badN = { v: 0 };
    const tally = r => { r ? okN.v++ : badN.v++; return r; };

    /* ---------- 7.0 载荷自检：不通过就不碰页面 ---------- */
    const chk = checkPayload(D);
    if (chk.warns.length) chk.warns.forEach(w => say('· ' + w));
    if (chk.errs.length) {
      say('✗ 载荷自检没过，已停下（一个字都没往页面上写）：');
      chk.errs.forEach(e => say('   · ' + e));
      say('· 把上面的问题改掉再重跑。');
      return;
    }

    /* ---------- 7.0 先把词条行数加够（顺序不能倒：WM 点「增加」会清掉已选武器） ---------- */
    await step('准备词条行', async () => {
      const needPos = (D.pos || []).length, needNeg = (D.neg || []).length;
      const rows = statRows(true);
      const posN = rows.filter(r => r.kind !== 'neg').length;
      const negN = rows.filter(r => r.kind !== 'pos').length;
      if (posN >= needPos && negN >= needNeg) return true;

      /* 最多点一次「增加」，绝不循环。 */
      say('· 行数不够（正 ' + posN + '/' + needPos + '，负 ' + negN + '/' + needNeg + '），点一次「增加」');
      if (!addStatRow()) { say('· 没找到「增加」按钮，就用现有的行继续'); return true; }
      await new Promise(r => setTimeout(r, 160));
      const after = statRows(true);
      say('· 备行后：正 ' + after.filter(r => r.kind !== 'neg').length
        + ' / 负 ' + after.filter(r => r.kind !== 'pos').length);
      return true;
    }).then(tally);

    /* ---------- 7.05 行数多了要能收：只删彻底为空的尾部行 ---------- */
    await step('清理多余空行', async () => {
      const rows = statRows(true);
      const posN = rows.filter(r => r.kind !== 'neg').length;
      const negN = rows.filter(r => r.kind !== 'pos').length;
      const needPos = (D.pos || []).length, needNeg = (D.neg || []).length;
      if (posN <= needPos && negN <= needNeg) return true;
      await pruneStatRows(needPos, needNeg);
      return true;
    }).then(tally);

    /* ---------- 7.1 武器名称（必须串行，后面的东西都依赖它） ---------- */
    await step('武器名称', async () => {
      const root = findSeekerByLabel(WM_WEAPON_LABELS);
      if (!root) throw new Error('找不到「武器名称」下拉');
      const input = seekerInput(root);
      const want = D.weapon;
      const verify = async () => {

        /* 只要「值对得上」或「WM 认为选上了」就算成功。 */
        const t0 = performance.now();
        while (performance.now() - t0 < PICK_WAIT) {
          const v = String(input.value || '').trim();
          if (v) return weaponOk(v, want);
          if (hasSelection(root) || pickedCls(root)) return true;
          await new Promise(r => setTimeout(r, POLL));
        }
        return false;
      };
      await pick(root, D.weapon, '武器名称', false, verify);
      const got = String(input.value || '').trim();
      if (!got || !weaponOk(got, want)) {
        if (!(hasSelection(root) || pickedCls(root))) {
          say('⚠ 武器那格现在是「' + (got || '空') + '」，不是「' + want + '」 —— 请手动选。'
            + '下拉里有：' + rowEntries(root).slice(0, 10).map(e => e.text).join(' / '));
        }
      }
      return true;
    }).then(tally);

    /* ---------- 7.2 词条行（下拉必须串行：同一时刻只能开一个） ---------- */
    for (const [kind, list, label] of [['pos', D.pos || [], '正面'], ['neg', D.neg || [], '负面']]) {
      for (let i = 0; i < list.length; i++) {
        const st = list[i];
        await step(label + ' ' + (i + 1) + '「' + st.name + '」', async () => {
          let rows = statRows().filter(r => r.kind === kind || (!r.kind && kind === 'pos'));
          if (!rows[i]) {
            say('· ' + label + '：只有 ' + rows.length + ' 行，尝试点「增加」');
            await addStatRow();
            rows = statRows(true).filter(r => r.kind === kind || (!r.kind && kind === 'pos'));
          }
          if (!rows[i]) throw new Error(label + '行只有 ' + rows.length + ' 个 —— 请手动加一行后重跑');
          const r = rows[i];

          /* 顺序：先确认词条被 WM 接受，再写数值。 */
          try {
            await pickQuick(r.seeker, wmName(st), label + ' ' + (i + 1), true);
          } catch (e) {
            say('✗ ' + label + ' ' + (i + 1) + '：' + e.message + '（数值照填，最后统一核对）');
          }
          if (st.value != null) {

            /* WM 选中词条后会重画这一行 缓存下来的 num 可能已是脱离文档的旧节点 */
            const fresh = rowAt(kind, i) || r;
            if (fresh.num) {
              const want = smartValue(fresh.num, st.value, st.mult);
              rangeWarn(fresh.num, want, label + ' ' + (i + 1) + ' 数值');
              fillNumFast(fresh.num, want, label + ' ' + (i + 1) + ' 数值');
            }
          }
          return true;
        }).then(tally);
      }
    }

    /* ---------- 7.25 整卡名校验：等词条全部进表之后，读 WM 自己生成的裂罅 Mod 名 ---------- */
    await step('裂罅卡名核对', async () => {
      try { nameOracle(selectMap()); } catch (e) { say('· 卡名核对跳过：' + e.message); }
      return true;
    }).then(tally);

    /* ---------- 7.3 尾部字段：全部并发（裂罅Mod名称是 WM 自己生成的，不碰） ---------- */
    const sm = selectMap();
    const tail = [];
    if (D.category && sm.category) tail.push(['类别', () => fillNative(sm.category.el, D.category, '类别')]);
    if (D.mastery != null) tail.push(['精通段位', async () => {
      const el = findNumByLabel(['精通段位', 'mastery rank', 'mastery', 'masterRank', '段位', '精通']);
      if (el) return fillField(el, Number(D.mastery), '精通段位');
      if (sm.mastery) return fillNative(sm.mastery.el, String(D.mastery), '精通段位');
      throw new Error('找不到「精通段位」控件');
    }]);
    if (D.modLevel != null) tail.push(['Mod 等级', async () => {

      /* 段位必须先认领 —— 两个都含 rank，顺序反了会把 8 填进等级框。 */
      const el = findNumByLabel(['mod 等级', 'mod rank', 'modLevel', '等级', 'rank']);
      if (el) return fillField(el, Number(D.modLevel), 'Mod 等级');
      if (sm.modLevel) return fillNative(sm.modLevel.el, String(D.modLevel), 'Mod 等级');
      throw new Error('找不到「Mod 等级」控件');
    }]);
    if (D.combo != null) tail.push(['循环次数', async () => {
      const el = findNumByLabel(['循环次数', 're-rolls', 'rerolls', 'reRolls', 'combo', 'rolls']);
      if (el) return fillField(el, Number(D.combo), '循环次数');
      if (sm.combo) return fillNative(sm.combo.el, String(D.combo), '循环次数');
      throw new Error('找不到「循环次数」控件');
    }]);
    if (D.polarity && sm.polarity) tail.push(['极性', () => fillNative(sm.polarity.el, D.polarity, '极性')]);

    if (tail.length) await Promise.all(tail.map(([name, fn]) => step(name, fn).then(tally)));

    /* 7.4 复查 + 自愈（唯一的验证环节） */
    const fixed = [];
    const wroot = findSeekerByLabel(WM_WEAPON_LABELS);
    if (wroot) {
      const wv = String((seekerInput(wroot) || {}).value || '').trim();
      const wOk = wv ? weaponOk(wv, D.weapon) : (hasSelection(wroot) || pickedCls(wroot));
      if (!wOk) {
        say('· 复查：武器名称是「' + (wv || '空') + '」，重选');
        try { await pick(wroot, D.weapon, '武器名称', false); fixed.push('武器名称'); }
        catch (e) { say('✗ 复查武器名称也失败：' + e.message); }
      }
    }
    for (const [kind, list, label] of [['pos', D.pos || [], '正面'], ['neg', D.neg || [], '负面']]) {
      for (let i = 0; i < list.length; i++) {
        const st = list[i];
        const r = rowAt(kind, i);
        if (!r) continue;
        const mapped = wmName(st);

        /* 判据两个 */
        const confirmed = (pickedCls(r.seeker) && pickedIs(r.seeker, mapped)) || previewHas(mapped);
        if (!confirmed) {
          say('· 复查：' + label + ' ' + (i + 1) + '「' + mapped + '」没选上，清干净重来一次');
          try {
            await pickQuick(r.seeker, mapped, label + ' ' + (i + 1) + ' 复查', true);
            fixed.push(label + ' ' + (i + 1));
          } catch (e) { say('✗ 复查 ' + label + ' ' + (i + 1) + ' 失败：' + e.message); }
        }
        if (st.value != null) {
          const fresh = rowAt(kind, i) || r;
          if (fresh.num) {
            const want = smartValue(fresh.num, st.value, st.mult);
            if (Math.abs((parseFloat(fresh.num.value) || 0) - want) > 1e-6) {
              await fillNumVerify(fresh.num, want, label + ' ' + (i + 1) + ' 数值');
              fixed.push(label + ' ' + (i + 1) + ' 数值');
            }
          }
        }
      }
    }
    if (fixed.length) say('▸ 复查补回：' + fixed.join('、'));

    /* ---------- 收尾对账：拿 WM 自己的预览面板核对（权威判据） ---------- */
    await dedupe(D);
    verify(D);

    /* ---------- 只读汇报：把页面此刻的真实状态原样打出来（不重填） ---------- */
    report();

    /* ---------- 收尾：计时报告 ---------- */
    say('── 结束：成功 ' + okN.v + '，失败 ' + badN.v + '，用时 ' + ms() + 'ms ──');
    say('── 分步耗时 ──');
    timings.slice().sort((a, b) => b[1] - a[1]).forEach(([n, t, ok]) =>
      say('   ' + (ok ? '  ' : '✗ ') + String(t).padStart(5) + 'ms  ' + n));
    if (badN.v) {
      say('有失败项 —— 对着上面红色的行手动补一下。');
      if (!VERBOSE) diag();
    } else {
      say('全部填完。');
    }
    say('请逐项核对，确认无误后自己点「下一步」。本脚本不会替你提交。');
  }

  /* 「增加」按钮：WM 英文站真机文案是 "+ Add"（带加号和空格），中文站是「增加」。 */
  function addStatRow() {
    const btns = [...scope().querySelectorAll('button, a, [role="button"]')];
    let hit = null, hitLen = 1e9;
    for (const el of btns) {
      if (!vis(el)) continue;
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!/^\+?\s*(增加|添加|新增|add|new)$/i.test(t)) continue;
      if (t.length < hitLen) { hit = el; hitLen = t.length; }
    }
    if (!hit) return false;
    ['mousedown', 'mouseup', 'click'].forEach(t =>
      hit.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true })));
    return true;
  }

  /* 收尾核对：把 WM 预览面板逐条打出来，跟期望的词条清单比。 */
  function verify(D) {
    const exp = [];
    (D.pos || []).forEach(s => exp.push({ kind: '正面', name: wmName(s), value: s.value }));
    (D.neg || []).forEach(s => exp.push({ kind: '负面', name: wmName(s), value: s.value }));
    const at = previewAtts();
    say('  ── 核对：期望 ' + exp.length + ' 条 / 预览面板 ' + at.length + ' 条 ──');
    const cnt = {};
    at.forEach(a => { const k = norm(a.name); cnt[k] = (cnt[k] || 0) + 1; });
    at.forEach((a, i) => {
      const c = cnt[norm(a.name)];
      const dup = c > 1 ? '   ★ 重复登记（同名 ' + c + ' 次）' : '';
      say('  预览' + (i + 1) + '：' + (a.val || '（空值）') + ' ' + a.name + dup);
    });
    exp.forEach(e => {
      const k = norm(e.name);
      const hit = at.filter(a => {
        const n = norm(a.name);
        return n && k && (n.indexOf(k) >= 0 || k.indexOf(n) >= 0);
      });
      if (!hit.length) say('  ✗ 缺：' + e.kind + '「' + e.name + '」没进预览面板');
      else if (hit.length > 1) say('  ✗ 多：' + e.kind + '「' + e.name + '」在预览面板里出现了 ' + hit.length + ' 次');
    });
    if (at.length !== exp.length) {
      say('  ⚠ 条数对不上：多 ' + Math.max(0, at.length - exp.length)
        + ' 条 / 少 ' + Math.max(0, exp.length - at.length) + ' 条');
    }
  }

  /* 重复自愈：预览面板里同名出现多次 = 同一格被选了两次。 */
  async function dedupe(D) {
    const at = previewAtts();
    const cnt = {};
    at.forEach(a => { const k = norm(a.name); cnt[k] = (cnt[k] || 0) + 1; });
    const dups = Object.keys(cnt).filter(k => cnt[k] > 1);
    if (!dups.length) return;
    for (const k of dups) {
      const name = at.find(a => norm(a.name) === k).name;
      say('⚠ 预览面板里「' + name + '」重复登记了（' + cnt[k] + ' 次）');

      /* 找出持有这个词条的那一行 */
      let hit = null;
      for (const [kind, list] of [['pos', D.pos || []], ['neg', D.neg || []]]) {
        for (let i = 0; i < list.length; i++) {
          if (norm(wmName(list[i])) !== k) continue;
          const r = rowAt(kind, i);
          if (!r) continue;
          const cur = norm((seekerInput(r.seeker) || {}).value || '');
          if (cur && (cur.indexOf(k) >= 0 || k.indexOf(cur) >= 0)) { hit = { kind, i, r }; break; }
        }
        if (hit) break;
      }
      if (!hit) {
        say('  · 找不到持有它的行 —— 麻烦在 WM 上手动删掉多出来的那条');
        continue;
      }
      const before = previewAtts().length;
      await clearPick(hit.r.seeker);
      await new Promise(z => setTimeout(z, 260));
      const after = previewAtts().length;
      if (after >= before) {
        say('  · 清掉这一格后预览条数没变（' + after + '）—— 多出来的那条是历史残留，麻烦在 WM 上手动删');
        continue;
      }

      /* 少了一条 重新选中它，把值写回去 */
      const list = hit.kind === 'pos' ? (D.pos || []) : (D.neg || []);
      const st = list[hit.i];
      const lbl = hit.kind === 'pos' ? '正面' : '负面';
      try { await pickQuick(hit.r.seeker, wmName(st), lbl + ' ' + (hit.i + 1) + ' 重选', true); }
      catch (e) { say('  ✗ 重选失败：' + e.message); }
      const fresh = rowAt(hit.kind, hit.i) || hit.r;
      if (st && st.value != null && fresh.num) {
        const want = smartValue(fresh.num, st.value, st.mult);
        rangeWarn(fresh.num, want, lbl + ' ' + (hit.i + 1) + ' 数值');
        await fillNumVerify(fresh.num, want, lbl + ' ' + (hit.i + 1) + ' 数值');
      }
    }
    say('· 清理后预览面板：' + previewAtts().length + ' 条');
  }

  /* 只读汇报：行内容 + WM 自己的预览面板（riven-preview）。 */
  function report() {
    statRows(true).forEach((r, i) => {
      const st = String((seekerInput(r.seeker) || {}).value || '').trim() || '（空）';
      const nv = String((r.num && r.num.value) || '').trim();
      const sel = r.kind || (r.num && parseFloat(r.num.getAttribute('max')) <= 0 ? '负' : '正');
      say('  行' + (i + 1) + ' [' + sel + '] ' + st + (nv ? '  ' + nv : ''));
    });
    const pv = document.querySelector('div.riven-preview');
    if (pv) {
      const nm = (pv.querySelector('.riven-preview__item-name') || {}).textContent || '';
      const at = [...pv.querySelectorAll('.riven-preview__attributes li')].map(li => li.textContent.trim());
      say('  预览面板：' + (nm || '（没有武器名）')
        + (at.length ? ' · ' + at.length + ' 条词条' : ' · 词条 0 条'));
    }
  }

  function diag() {
    const F = scope();
    say('── 诊断 ──');
    say('  创建表单: ' + (F === document ? '（没找到 form，退回整页）' : F.className));
    say('  词条行  : ' + statRows(true).length);
    const w = findSeekerByLabel(WM_WEAPON_LABELS);
    say('  武器框  : ' + (w ? '找到' : '没找到'));
    const pv = document.querySelector('div.riven-preview');
    say('  预览面板: ' + (pv ? '有' : '没找到'));
  }

  async function boot() {
    uiInit();
    let D = null;
    if (window.__WM_FILL_DATA__) D = window.__WM_FILL_DATA__;
    if (!D && window.__WM_RIVEN_TEXT__) {
      const r = parseRiven(window.__WM_RIVEN_TEXT__);
      if (r.weapon) D = r;
    }
    if (!D) {
      let txt = '';
      try { txt = await navigator.clipboard.readText(); } catch (_) { ZKHTML.warn('填表/wm-fill-core.js:1532', _); }

      if (txt && txt.trim()) {
        const r = parseRiven(txt);
        if (r.weapon || r.pos.length || r.neg.length) D = r;
      }
    }
    if (!D) { say('✗ 没拿到紫卡数据 —— 先在模拟器里生成 WM 脚本并粘贴过来'); return; }
    say('── 开始填充（' + D.weapon + '）──');

    const noVal = (D.pos || []).concat(D.neg || []).filter((x) => x.value == null);
    if (noVal.length) {
      say('⚠ ' + noVal.length + ' 条词条没给数值（' + noVal.map((x) => x.name).join(' / ')
        + '）：只选词条，数值框留空，需手补');
    }
    try { await main(D); }
    catch (e) { say('✗ 整体失败：' + ((e && e.message) || e)); }
  }

  function tryJSON(t) {
    try {
      const o = JSON.parse(t);
      return (o && (o.pos || o.weapon)) ? o : null;
    } catch (_) { return null; }
  }

  function askUser() {
    const ta = document.createElement('textarea');
    ta.style.cssText = 'position:fixed;left:12px;top:12px;z-index:2147483000;width:min(520px,92vw);'
      + 'height:220px;background:#0d1117;color:#d7dee9;border:1px solid #3a4657;border-radius:8px;'
      + 'font:12px/1.5 ui-monospace,Consolas,monospace;padding:8px';
    ta.placeholder = '把「紫卡信息」那一段贴进来（口语也行：双暴多负触发的托里德 / 托里德 CC89 CD120 -Zoom）';
    document.body.appendChild(ta);
    const b = document.createElement('button');
    b.textContent = '开始填';
    b.style.cssText = 'position:fixed;left:12px;top:240px;z-index:2147483000;padding:6px 14px;'
      + 'background:#2563eb;color:#fff;border:0;border-radius:6px;cursor:pointer';
    b.onclick = () => {
      const d = tryJSON(ta.value) || parseRiven(ta.value);
      ta.remove(); b.remove();
      if (!d || !d.weapon) { say('✗ 没解析出武器名称'); return; }
      main(d);
    };
    document.body.appendChild(b);
  }

  window.__WM_FILL_LOG__ = logLines;
  window.__WM_FILL_FAST__ = boot;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

