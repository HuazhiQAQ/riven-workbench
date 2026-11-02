var esc = ZKHTML.esc;
window.ZKMB = (function () {
  'use strict';
  function E(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function polBox(o) {
    return '<span class="mod-polarity' + (o.polCls || '') + '" title="' +
      E(o.polText || '') + ' 极性 · 本槽占 ' + E(o.cost) + ' 点">' +
      E(o.polGlyph || '·') + ' ' + E(o.cost) + '</span>';
  }
  function layerBox(layers, attr, key) {
    if (!layers || !layers.max || layers.max <= 1) return '';
    return '<span class="layerbox" ' + attr + '="' + E(key) + '" title="叠层型 · 默认吃满层数（可下调，步进器 − 到 0 即不计入）">' +
      '<button type="button" class="lbtn" data-' + attr + '="' + E(key) + '" data-d="-1">−</button>' +
      '<b class="lcur">' + E(layers.cur) + '</b><span class="lmax">/' + E(layers.max) + '层</span>' +
      '<button type="button" class="lbtn" data-' + attr + '="' + E(key) + '" data-d="1">+</button></span>';
  }
  function polBtn(polKey, polText) {
    return '<span class="slotpol" data-mbp="' + E(polKey) + '" title="切换极化">' + E(polText || '无极性') + '</span>';
  }
  function statBlock(props, cond, desc) {
    var h = '<div class="mod-stat">';
    (props || []).forEach(function (s) { h += '<div class="mod-prop">' + E(s) + '</div>'; });
    if (cond) h += '<div class="mod-cond">' + E(cond) + '</div>';
    if (desc) h += '<div class="mod-desc">' + E(desc) + '</div>';
    return h + '</div>';
  }
  function modSlot(o) {
    var no = o.no == null ? '' : '<span class="mbsno">' + E(o.no) + '</span>';
    if (o.empty) {
      return '<div class="g-mbslot mod-slot active" data-mbs="' + E(o.polKey) + '">' + no +
        '<span class="plus">+</span>' + polBtn(o.polKey, o.polText) + '</div>';
    }
    return '<div class="g-mbslot mod-slot ' + E(o.cls || '') + (o.off ? ' off' : '') + '"' +
      (o.title ? ' title="' + E(o.title) + '"' : '') + ' data-mbs="' + E(o.polKey) + '">' +
      no +
      '<div class="mod-title">' + polBox(o) + E(o.name) + '</div>' +
      '<div class="mod-detail">' + statBlock(o.props, o.cond, o.desc) +
      '<div class="mod-action"><button type="button" class="mod-slot-remove" data-mbx="' + E(o.polKey) +
      '" title="卸下">×</button></div></div>' +
      layerBox(o.layers, 'ls', o.polKey) +
      polBtn(o.polKey, o.polText) +
      (o.off ? '<span class="offtag">不适用</span>' : '') +
      '</div>';
  }
  function rivenSlot(o) {
    return '<div class="g-mbslot mod-slot rivenslot x' + (o.empty ? ' active' : '') + '" data-mbr="1"' +
      (o.title ? ' title="' + E(o.title) + '"' : '') + '>' +
      '<span class="mbsno">' + E(o.no) + '</span>' +
      '<div class="mod-title">' + polBox(o) + E(o.name) + '</div>' +
      '<div class="mod-detail"><div class="mod-stat"><div class="mod-prop">' + E(o.sub || '') + '</div></div></div>' +
      polBtn(o.polKey, o.polText) +
      (o.movable === false ? '' :
        '<button type="button" class="mbmove" data-mvr="1" title="把紫卡挪到别的格（不锁死在第 8 格）">⇄</button>') +
      (!o.removable ? '' :
        '<button type="button" class="mbmove" data-mbrx="1" title="把紫卡从这一格下掉（这一格就能装别的 MOD 了）">×</button>') +
      '</div>';
  }
  function exilSlot(o) {
    if (o.empty) {
      return '<div class="g-mbslot mod-slot exislot active" data-mbe="1">' +
        '<span class="plus">+</span>' + polBtn('E', o.polText) + '</div>';
    }
    return '<div class="g-mbslot mod-slot exislot" data-mbe="1"' +
      (o.title ? ' title="' + E(o.title) + '"' : '') + '>' +
      '<span class="exilab">特殊</span>' +
      '<div class="mod-title">' + polBox(o) + E(o.name) + '</div>' +
      '<div class="mod-detail">' + statBlock(o.props, o.cond, '') +
      '<div class="mod-action"><button type="button" class="mod-slot-remove" data-mbx="e" title="卸下">×</button></div></div>' +
      polBtn('E', o.polText) +
      '</div>';
  }
  function buffSlot(o) {
    if (o.empty) {
      return '<div class="g-mbslot buff-slot active" data-mba="' + E(o.role) + '">' +
        '<span class="plus">+</span>' +
        '<span class="buff-tgt" title="生效目标（点此选择赋能）">' + E(o.role) + '</span></div>';
    }
    return '<div class="g-mbslot buff-slot' + (o.off ? ' off' : '') + '" data-mba="' + E(o.role) + '"' +
      (o.title ? ' title="' + E(o.title) + '"' : '') + '>' +
      '<div class="mod-title"><span class="mod-polarity" title="生效目标">' + E(o.role) + '</span>' +
      E(o.name) + '</div>' +
      '<div class="mod-detail">' + statBlock(o.props, '', o.desc) +
      '<div class="mod-action"><button type="button" class="mod-slot-remove" data-mba-x="' + E(o.role) +
      '" title="卸下">×</button></div></div>' +
      layerBox(o.layers, 'alr', o.role) +
      '</div>';
  }
  function pickerRow(o) {
    return '<button type="button" class="g-mbitem mrow" data-mbi="' + E(o.id) + '">' +
      '<span class="rz ' + E(o.rar || 'n') + '"></span>' +
      '<span class="nm">' + E(o.name) + '</span>' +
      (o.en ? '<span class="en">' + E(o.en) + '</span>' : '') +
      '<span class="pp">' + E(o.props || '') + '</span>' +
      (o.right == null ? '' : '<span class="dr">' + E(o.right) + '</span>') +
      (o.gain == null ? '' : '<span class="gb' + (o.gain > 0 ? '' : ' zero') + '">' +
        (o.gain > 0 ? '+' : '') + E(o.gain) + '%</span>') +
      '</button>';
  }
  function legal(m, pools, wid, isExi) {
    if (!m) return false;
    if (isExi ? !m.x : !!m.x) return false;
    if (pools && pools.indexOf(m.t) < 0) return false;
    if (m.ex && m.ex.length) {
      if (!wid) return false;
      if (m.ex.indexOf(wid) < 0) return false;
    }
    if (m.sg) {
      var list = (window.ZKSYN || {})[m.sg] || [];
      if (wid && list.indexOf(wid) >= 0) return false;
    }
    return true;
  }
  function wclass(w) {
    if (!w) return '';
    var c = String(w.c || '');
    if (c === 'shotgun') return 'shotgun';
    if (c === 'bow' || c === 'crossbow') return 'bow';
    if (c === 'archgun') return 'archgun';
    if (c === 'pistol') return 'pistol';
    if (w.s === 'm' || w.s === 'e') return 'melee';
    return 'rifle';
  }
  function arcLegal(a, w) {
    if (!a) return false;
    var wc = wclass(w);
    if (a.w && wc && a.w !== wc) return false;
    return true;
  }
  var PKTABS = [
    { id: 'fast',  n: '快速选择' },
    { id: 'gain',  n: '收益排序' },
    { id: 'set',   n: '套装' },
    { id: 'dmg',   n: '伤害' },
    { id: 'elem',  n: '元素' },
    { id: 'speed', n: '速度' },
    { id: 'other', n: '其他' },
    { id: 'riven', n: '紫卡' }
  ];
  var FAST_CN = { baseDmg: '基伤多重', baseDmgRange: '基伤范围', condiRange: '异况范围', crit: '双暴',
    aimCrit: '瞄准双暴', silverCorrosive: '银腐蚀', silverRadiation: '银辐射', silverViral: '银病毒',
    goldCorrosive: '金腐蚀', goldViral: '金病毒', gas: '毒气', heavyCrit: '重击双暴', slideCrit: '滑砍双暴',
    allStatus: '四活动', allElem: '四元素', condiCombo: '异况漂移' };
  var FAST = {
    Rifle: {
      baseDmg: ['Serration', 'Split Chamber', 'Heavy Caliber'],
      crit: ['Point Strike', 'Vital Sense'],
      aimCrit: ['Argon Scope', 'Bladed Rounds'],
      silverCorrosive: ['Stormbringer', 'Infected Clip'],
      silverRadiation: ['Stormbringer', 'Hellfire'],
      silverViral: ['Primed Cryo Rounds', 'Infected Clip'],
      goldCorrosive: ['High Voltage', 'Malignant Force'],
      goldViral: ['Rime Rounds', 'Malignant Force'],
      gas: ['Thermite Rounds', 'Malignant Force', 'Infected Clip'],
      allStatus: ['High Voltage', 'Malignant Force', 'Thermite Rounds', 'Rime Rounds'],
      allElem: ['Primed Cryo Rounds', 'Hellfire', 'Stormbringer', 'Infected Clip']
    },
    Shotgun: {
      baseDmg: ['Primed Point Blank', "Hell's Chamber"],
      crit: ['Primed Ravage', 'Blunderbuss'],
      aimCrit: ['Laser Sight', 'Shrapnel Shot'],
      silverCorrosive: ['Primed Charged Shell', 'Contagious Spread'],
      silverRadiation: ['Primed Charged Shell', 'Incendiary Coat'],
      silverViral: ['Chilling Grasp', 'Contagious Spread'],
      goldCorrosive: ['Shell Shock', 'Toxic Barrage'],
      goldViral: ['Frigid Blast', 'Toxic Barrage'],
      gas: ['Scattering Inferno', 'Toxic Barrage', 'Contagious Spread'],
      allStatus: ['Shell Shock', 'Toxic Barrage', 'Scattering Inferno', 'Frigid Blast'],
      allElem: ['Primed Charged Shell', 'Contagious Spread', 'Incendiary Coat', 'Chilling Grasp']
    },
    Secondary: {
      baseDmg: ['Hornet Strike', 'Barrel Diffusion', 'Lethal Torrent'],
      crit: ['Primed Pistol Gambit', 'Primed Target Cracker'],
      aimCrit: ['Hydraulic Crosshairs', 'Sharpened Bullets'],
      silverCorrosive: ['Convulsion', 'Pathogen Rounds'],
      silverRadiation: ['Convulsion', 'Primed Heated Charge'],
      silverViral: ['Deep Freeze', 'Pathogen Rounds'],
      goldCorrosive: ['Jolt', 'Pistol Pestilence'],
      goldViral: ['Frostbite', 'Pistol Pestilence'],
      gas: ['Scorch', 'Pistol Pestilence', 'Pathogen Rounds'],
      allStatus: ['Jolt', 'Pistol Pestilence', 'Scorch', 'Frostbite'],
      allElem: ['Primed Heated Charge', 'Deep Freeze', 'Convulsion', 'Pathogen Rounds']
    },
    Melee: {
      baseDmgRange: ['Primed Pressure Point', 'Primed Reach'],
      condiRange: ['Condition Overload', 'Primed Reach'],
      crit: ['Blood Rush', 'Organ Shatter'],
      heavyCrit: ['Sacrificial Steel', 'Amalgam Organ Shatter'],
      slideCrit: ['Maiming Strike', 'Blood Rush', 'Organ Shatter'],
      silverCorrosive: ['Shocking Touch', 'Primed Fever Strike'],
      silverRadiation: ['Shocking Touch', 'Molten Impact'],
      silverViral: ['North Wind', 'Primed Fever Strike'],
      goldCorrosive: ['Voltaic Strike', 'Virulent Scourge'],
      goldViral: ['Vicious Frost', 'Virulent Scourge'],
      gas: ['Volcanic Edge', 'Virulent Scourge', 'Primed Fever Strike'],
      allStatus: ['Voltaic Strike', 'Virulent Scourge', 'Volcanic Edge', 'Vicious Frost'],
      condiCombo: ['Drifting Contact', 'Condition Overload'],
      allElem: ['Primed Fever Strike', 'Shocking Touch', 'Molten Impact', 'North Wind']
    },
    ArchGun: {
      baseDmg: ['Primed Rubedo-Lined Barrel', 'Dual Rounds'],
      crit: ['Parallax Scope', 'Hollowed Bullets'],
      aimCrit: ['Critical Focus'],
      silverCorrosive: ['Electrified Barrel', 'Primed Venomous Clip'],
      silverRadiation: ['Electrified Barrel', 'Primed Combustion Rounds'],
      silverViral: ['Polar Magazine', 'Primed Polar Magazine', 'Primed Venomous Clip'],
      goldCorrosive: ['Charged Bullets', 'Contamination Casing'],
      goldViral: ['Hypothermic Shell', 'Contamination Casing'],
      gas: ['Magma Chamber', 'Contamination Casing', 'Primed Venomous Clip'],
      allStatus: ['Contamination Casing', 'Magma Chamber', 'Charged Bullets', 'Hypothermic Shell'],
      allElem: ['Electrified Barrel', 'Venomous Clip', 'Primed Venomous Clip', 'Combustion Rounds', 'Primed Combustion Rounds', 'Primed Polar Magazine']
    }
  };
  var CATK = {
    dmg: { dmg: 1, impact: 1, puncture: 1, slash: 1, fac: 1 },
    elem: { heat: 1, cold: 1, toxin: 1, electric: 1, corrosive: 1, viral: 1, gas: 1, radiation: 1, blast: 1, magnetic: 1 },
    speed: { frate: 1, aspeed: 1, mag: 1, rel: 1, ammo: 1 }
  };
  var POOL_CN = { primary: '主要武器通用', rifle: '步枪', assault_rifle: '步枪专用', shotgun: '霰弹',
                  pistol: '手枪', melee: '近战', archgun: '曲翼', sniper: '狙击专用', bow: '弓专用' };
  var RAR_CN = { n: '普通', c: '优良', r: '稀有', g: '罕见', l: '传说', x: '异化' };
  var MKEY = ZKC.statMap('short');
  var MUNIT = { punch: 'm', range: 'm', comboDur: 's', combo: '' };
  var TRIG_CN = { headshot: '弱点命中', headshot_kill: '弱点击杀', weakpoint_hit: '弱点命中', kill: '击杀',
    melee_kill: '近战击杀', hit: '命中', reload_complete: '换弹完成', reload_from_empty: '空仓换弹', equip: '装备时',
    status_applied: '异况生效', toxin_status: '毒素异况', cold_status: '冰冻异况', heat_status: '火焰异况',
    electricity_status: '电击异况', swap_consume_combo: '切枪吃连击', ability_cast: '施放技能', direct_hit: '直接命中',
    crit: '暴击', firing: '开火', full_burst: '点射打完', consecutive_headshot: '连续弱点命中',
    bullet_jump_land: '飞跃落地', punch_through: '穿透命中', per_tendril: '每根触手' };
  var COND_CN = { aiming: '瞄准中', airborne: '空中', invisible: '隐身中', 'fire_rate_below_2.5': '射速低于2.5' };
  var SETKIND = {
    crit_chance_per_combo: '暴击几率随连击数增长',
    crit_tier_upgrade_chance: '暴击升档几率',
    enhances_own_mods: '自身 MOD 效果',
    warframe_layer: '战甲层套装加成（武器不生效）',
    unmodelled: '套装加成未建模'
  };
  var POOL_EN = { primary: 'Primary', rifle: 'Rifle', assault_rifle: 'Assault Rifle', shotgun: 'Shotgun',
                  pistol: 'Pistol', melee: 'Melee', archgun: 'Archgun', sniper: 'Sniper', bow: 'Bow' };
  var RAR_EN = { n: 'Common', c: 'Uncommon', r: 'Rare', g: 'Epic', l: 'Legendary', x: 'Exotic' };
  var MKEY_EN = ZKC.statMap('en');
  var TRIG_EN = { headshot: 'Weakpoint Hit', headshot_kill: 'Weakpoint Kill', weakpoint_hit: 'Weakpoint Hit',
    kill: 'Kill', melee_kill: 'Melee Kill', hit: 'Hit', reload_complete: 'Reload Complete',
    reload_from_empty: 'Reload from Empty', equip: 'On Equip', status_applied: 'Status Applied',
    toxin_status: 'Toxin Status', cold_status: 'Cold Status', heat_status: 'Heat Status',
    electricity_status: 'Electricity Status', swap_consume_combo: 'Swap Consumes Combo',
    ability_cast: 'Ability Cast', direct_hit: 'Direct Hit', crit: 'Critical Hit', firing: 'Firing',
    full_burst: 'Full Burst', consecutive_headshot: 'Consecutive Weakpoint Hits',
    bullet_jump_land: 'Bullet Jump Landing', punch_through: 'Punch Through', per_tendril: 'Per Tendril' };
  var COND_EN = { aiming: 'Aiming', airborne: 'Airborne', invisible: 'Invisible',
    'fire_rate_below_2.5': 'Fire Rate Below 2.5' };
  var SETKIND_EN = {
    crit_chance_per_combo: 'Critical Chance per Combo',
    crit_tier_upgrade_chance: 'Critical Tier Upgrade Chance',
    enhances_own_mods: 'Enhances Own Mods',
    warframe_layer: 'Warframe Layer Set Bonus (not applied to weapons)',
    unmodelled: 'Set Bonus Not Modelled'
  };
  var FAST_EN = { baseDmg: 'Base Damage / Multishot', baseDmgRange: 'Base Damage / Range',
    condiRange: 'Condition / Range', crit: 'Crit Chance + Crit Damage', aimCrit: 'Aim Crit',
    silverCorrosive: 'Silver Corrosive', silverRadiation: 'Silver Radiation', silverViral: 'Silver Viral',
    goldCorrosive: 'Gold Corrosive', goldViral: 'Gold Viral', gas: 'Gas', heavyCrit: 'Heavy Crit',
    slideCrit: 'Slide Crit', allStatus: 'All Status', allElem: 'All Elements',
    condiCombo: 'Drifting Contact' };
  var PKTABS_EN = { fast: 'Quick Pick', gain: 'By Gain', set: 'Set', dmg: 'Damage', elem: 'Element',
    speed: 'Speed', other: 'Other', riven: 'Riven' };
  function langIx() { return ZKHTML.langIx(); }
  function tx(cn, en) { return ZKHTML.tx(cn, en); }
  function poolLabel(p) { return langIx() === 2 ? (POOL_EN[p] || p) : (POOL_CN[p] || p); }
  function rarLabel(r) { return langIx() === 2 ? (RAR_EN[r] || r) : (RAR_CN[r] || r); }
  function statShort(k) { return langIx() === 2 ? (MKEY_EN[k] || k) : (MKEY[k] || k); }
  function nm(o) {
    if (!o) return '';
    var L = langIx();
    if (L === 2) return o.en || o.n || o.intl || o.cn || o.z || '';
    if (L === 1) return o.intl || o.cn || o.z || o.n || '';
    return o.cn || o.z || o.intl || o.n || '';
  }
  function nd(o) {
    if (!o) return '';
    return langIx() === 2 ? (o.de || o.dz || '') : (o.dz || o.de || '');
  }
  function fmtN(v, d) {
    return (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d == null ? 1 : d);
  }
  function modUnit(k) { return Object.prototype.hasOwnProperty.call(MUNIT, k) ? MUNIT[k] : '%'; }
  function rarOf(m) { return (m && m.r && RAR_CN[m.r]) ? m.r : 'n'; }
  function mkeyOf(o, k) { return (o && o.s === 'm' && k === 'frate') ? 'aspeed' : k; }
  function isStackKV(o, kv) { return kv.length > 2 && (+kv[2] || 1) > 1; }
  function propLine(o, statName) {
    var sn = statName || function (k) { return statShort(k); };
    return (o.p || []).map(function (kv) {
      var k = mkeyOf(o, kv[0]), v = +kv[1], st = kv.length > 2 ? (+kv[2] || 1) : 1;
      var u = modUnit(k), dg = (u === '' || Math.abs(v) >= 10) ? 0 : 1;
      var s = sn(k) + ' ' + (v >= 0 ? '+' : '−') + fmtN(Math.abs(v), dg) + u;
      if (isStackKV(o, kv)) s += '/层 ×' + st + ' 层';
      else if (st > 1) s += ' ×' + st + ' 层';
      return s;
    });
  }
  function propLineAll(o, statName) { return propLine(o, statName).join('　'); }
  function condLabel(m) {
    var bg = (m && m.bg) || [], parts = [], seen = {};
    bg.forEach(function (b) {
      if (b.k === 'asm') return;
      var t = (langIx() === 2 ? (TRIG_EN[b.tr] || b.tr) : (TRIG_CN[b.tr] || b.tr)) || '',
          c = langIx() === 2 ? (COND_EN[b.cd] || '') : (COND_CN[b.cd] || '');
      if (b.k === 'mech' && !t && !c) return;
      var s = b.k === 'sb' ? tx('叠层', 'Stacks') : tx('条件', 'Condition');
      if (t) s += '·' + t;
      if (c) s += '·' + c;
      if (b.st > 1) s += '·' + tx('上限', 'Cap ') + b.st + tx('层', ' stacks');
      if (b.du) s += '·' + (+b.du).toFixed(b.du < 10 ? 1 : 0) + 's';
      if (seen[s]) return;
      seen[s] = 1;
      parts.push(s);
    });
    return parts.join('；');
  }
  function condStat(m) {
    var out = [];
    (m && m.bg || []).forEach(function (b) {
      if (b.k !== 'cond' || !b.gk) return;
      var v = +b.gv, k = b.gk;
      out.push('需条件 ' + (v >= 0 ? '+' : '−') + fmtN(Math.abs(v), Math.abs(v) < 10 ? 1 : 0) + modUnit(k));
    });
    return out;
  }
  function catOK(m, cat) {
    var ks = CATK[cat];
    if (!ks) return false;
    return (m.p || []).some(function (kv) { return ks[mkeyOf(m, kv[0])]; });
  }
  function poolMain(pools) {
    if (!pools || !pools.length) return '';
    return (pools.length > 1 && pools[1] !== 'primary') ? pools[1] : pools[0];
  }
  function setPerCap(s, n) {
    var per = +s.per || 0;
    return Math.min(per * 6, per * Math.max(0, n || 0));
  }
  function setBonusText(s, n) {
    var per = +s.per || 0, cnt = +n || 0;
    if (s.k === 'crit_chance_per_combo') {
      return tx('每件 +' + fmtN(per, 0) + '% 每连击等级暴率，封顶 +' + fmtN(per * 6, 0) + '%'
                 + (cnt ? '（当前 ' + cnt + ' 件 → +' + fmtN(setPerCap(s, cnt), 0) + '%，与急进猛突加算）' : ''),
               '+' + fmtN(per, 0) + '% crit chance per combo level per piece, capped at +' + fmtN(per * 6, 0) + '%'
                 + (cnt ? ' (' + cnt + ' equipped → +' + fmtN(setPerCap(s, cnt), 0) + '%, stacks with Blood Rush)' : ''));
    }
    if (s.k === 'enhances_own_mods') {
      return tx('同时装备多张会进一步提升本套 MOD 自身的词条（每多 1 件 +' + fmtN(per, 0) + '%）'
                 + (cnt >= 2 ? '（当前 ' + cnt + ' 件 → 本套词条 ×' + (1 + per / 100 * (cnt - 1)).toFixed(2) + '）'
                             : '（需 ≥2 件才生效）'),
               'Equipping several of this set further boosts its own stats (+' + fmtN(per, 0) + '% per extra piece)'
                 + (cnt >= 2 ? ' (' + cnt + ' equipped → set stats ×' + (1 + per / 100 * (cnt - 1)).toFixed(2) + ')'
                             : ' (needs at least 2 pieces)'));
    }
    if (s.k === 'crit_tier_upgrade_chance') {
      return tx('暴击等级提升（每件 +' + fmtN(per, 0) + '%，封顶 ' + fmtN(per * 6, 0) + '%）'
                 + (cnt ? '（当前 ' + cnt + ' 件 → ' + fmtN(setPerCap(s, cnt), 0) + '%）' : ''),
               'Critical tier upgrade (+' + fmtN(per, 0) + '% per piece, capped at ' + fmtN(per * 6, 0) + '%)'
                 + (cnt ? ' (' + cnt + ' equipped → ' + fmtN(setPerCap(s, cnt), 0) + '%)' : ''));
    }
    var base = langIx() === 2 ? (SETKIND_EN[s.k] || 'Set Bonus Not Modelled') : (SETKIND[s.k] || '套装加成未建模');
    return tx((per ? '每件 +' + fmtN(per, per < 10 ? 1 : 0) + '% ' : '') + base + '（暂不计入伤害）',
              (per ? '+' + fmtN(per, per < 10 ? 1 : 0) + '% ' : '') + base + ' (not counted in damage)');
  }
  function sortForBrowse(list) {
    var setIdx = {};
    (window.ZKSETS || []).forEach(function (s, i) { setIdx[s.i] = i; });
    var withSet = [], plain = [];
    list.forEach(function (m) { (m.st && setIdx[m.st] != null ? withSet : plain).push(m); });
    var byName = function (a, b) { var x = nm(a), y = nm(b); return x < y ? -1 : x > y ? 1 : 0; };
    withSet.sort(function (a, b) { return (setIdx[a.st] - setIdx[b.st]) || byName(a, b); });
    plain.sort(byName);
    return withSet.concat(plain);
  }
  var _MBYN = null;
  function modByEn(en) {
    if (!_MBYN) {
      _MBYN = {};
      (window.ZKMODS || []).forEach(function (m) { if (m.n) _MBYN[String(m.n).toLowerCase()] = m; });
    }
    return _MBYN[String(en || '').toLowerCase()] || null;
  }
  function hayOf(ctx, o) {
    if (o.__hay == null) {
      var s = String(o.z || '') + ' ' + String(o.n || '');
      try { s += ' ' + propLineAll(o, ctx.statName); } catch (e) { ZKHTML.warn('框架/modpanel.js:516', e); }
      if (o.dz || o.de) s += ' ' + String(o.dz || o.de);
      try {
        if (!ctx.isArc) {
          s += ' ' + condLabel(o);
          var mc = condStat(o); if (mc && mc.length) s += ' ' + mc.join(' ');
        }
      } catch (e2) { ZKHTML.warn('框架/modpanel.js:523', e2); }
      try { var st = ctx.setOf(o); if (st) s += ' ' + nm(st) + '套装'; } catch (e3) { ZKHTML.warn('框架/modpanel.js:524', e3); }
      if (o.t) s += ' ' + String(o.t);
      try { if (ctx.isArc) s += ' ' + ctx.arcLabel(o); } catch (e4) { ZKHTML.warn('框架/modpanel.js:526', e4); }
      o.__hay = s.toLowerCase();
    }
    return o.__hay;
  }
  function poolHint(ctx) {
    var pools = ctx.pools();
    if (!pools) return tx('未选择武器：暂显示全部 MOD。', 'No weapon selected: showing all mods.');
    var cls = ctx.weaponClassCN ? ctx.weaponClassCN() : '';
    return '当前武器：<b>' + E(cls || '未选择') + '</b>　可用 MOD 池：'
         + pools.map(function (p) { return E(poolLabel(p)); }).join(' / ');
  }
  function modRows(ctx, list, gainMap) {
    var pools = ctx.pools(), main = poolMain(pools), h = '', hdrSeen = {};
    list.forEach(function (o) {
      var s = ctx.setOf(o);
      if (o.st && !hdrSeen[o.st]) {
        hdrSeen[o.st] = 1;
        if (s) {
          var n = ctx.setCount(s.i);
          h += '<div class="setrow"><span>' + E(nm(s)) + tx('套装', ' Set') + '</span>'
             + '<span class="sc">已装 ' + (n || 0) + '/' + (s.tot || 0) + '</span>'
             + '<span class="sb">' + E(setBonusText(s, n)) + '</span></div>';
        }
      }
      var u = ctx.used(o);
      var tags = [];
      if (ctx.isArc) { tags.push(o.t); tags.push(ctx.arcLabel(o)); }
      else {
        tags.push(rarLabel(o.r));
        if (s) tags.push(nm(s) + tx('套装', ' Set'));
        if (o.rw || o.ew) tags.push(tx('限定', 'Restricted'));
        if (pools && o.t !== main && POOL_CN[o.t]) tags.push(poolLabel(o.t));
      }
      var tg = tags.filter(function (t) { return t; }).join(' · ');
      var dr = ctx.isArc ? '' : '<span class="dr">' + ((+o.d || 0) + (+o.f || 0)) + ' 点</span>';
      var gb = '';
      if (gainMap) {
        var g = gainMap[o.i];
        if (g != null) gb = '<span class="gb' + (g > 0.05 ? '' : ' zero') + '">'
                         + (g > 0 ? '+' : '') + fmtN(g, 1) + '%</span>';
      }
      var hasMeta = (o.bg || []).length;
      var naTxt = o.st ? tx('套装成员 · 套装加成不计入收益', 'Set member · set bonus not counted in gain')
                       : tx('机制型 · 面板无读数（气解 / 格挡 / 处决这类）',
                            'Mechanic only · no panel reading (Tennokai / block / finisher and the like)');
      var pp = (ctx.isArc || (o.p || []).length || hasMeta)
        ? '<span class="pp">' + E(propLineAll(o, ctx.statName)) + '</span>'
        : '<span class="pp na">' + E(naTxt) + '</span>';
      var cond = ctx.isArc ? '' : condLabel(o);
      var de = ctx.isArc ? '' : nd(o);
      h += '<div class="mrow g-mbitem' + (u ? ' used' : '') + '" data-mi="' + E(o.i) + '" data-mbi="' + E(o.i) + '">'
         + '<span class="rz ' + rarOf(o) + '"></span>'
         + '<span class="nm">' + E(nm(o)) + '</span>'
         + '<span class="en">' + E(langIx() === 2 ? '' : (o.n || '')) + '</span>'
         + (tg ? '<span class="tg">' + E(tg) + '</span>' : '')
         + (cond ? '<span class="tg cond">' + E(cond) + '</span>' : '')
         + pp + gb + dr
         + condStat(o).map(function (x) { return '<span class="cs">' + E(x) + '</span>'; }).join('')
         + (de ? '<span class="mde">' + E(de) + '</span>' : '')
         + (u ? '<span class="tg">' + tx('已在第 ', 'In slot ') + u + tx(' 槽', '') + '</span>' : '')
         + '</div>';
    });
    return h;
  }
  function fastChips(ctx) {
    var kind = ctx.fastKind ? ctx.fastKind() : '';
    var tab = FAST[kind];
    if (!tab) return '<div class="none">这把武器没有快速选择表。</div>';
    var h = '<div class="fastgrid">';
    Object.keys(tab).forEach(function (key) {
      var names = tab[key];
      var ok = names.filter(function (en) { var m = modByEn(en); return m && ctx.modOK(m); });
      if (!ok.length) return;
      var miss = names.length - ok.length;
      h += '<div class="fchip" data-fast="' + E(key) + '" title="' + E(names.join(' / ')) + '">'
         + E(langIx() === 2 ? (FAST_EN[key] || key) : (FAST_CN[key] || key))
         + '<small>' + (miss ? (langIx() === 2 ? (ok.length + ' usable · ' + miss + ' not modelled')
                                          : (ok.length + ' 张可用 · 缺 ' + miss + ' 张未建模'))
                              : (langIx() === 2 ? (ok.length + ' mods') : (ok.length + ' 张'))) + '</small></div>';
    });
    h += '</div><div class="fastgrid"><div class="fnote">'
       + tx('点一项就把一整组 MOD 装进空槽'
            + '（已装、与已装冲突、没有空槽的会跳过，原因写在左上角消息栏）。'
            + '条件型 MOD（爆头 / 击杀 / 换弹触发）按满条件口径计入，行上的「条件·」标签写明触发要求；'
            + '叠层型默认 0 层，装好后在槽内步进器调层。'
            + '标「缺 N 张未建模」的只剩条件超载 / Blood Rush / 致残突击——要异况计数 / 连击 / 滑砍桶，收益引擎没有，装不了。',
            'Click one to load a whole group of mods into empty slots'
            + ' (mods already used, conflicting with an installed mod, or with no free slot are skipped — '
            + 'the reason is written in the message box at the top left). '
            + 'Conditional mods (headshot / kill / reload) are counted at full condition; the "Condition ·" tag '
            + 'on each row states the trigger requirement. Stacking mods default to 0 stacks — use the stepper '
            + 'inside the slot after installing. Rows marked "missing N not modelled" are limited to '
            + 'Condition Overload / Blood Rush / Maiming Strike — the gain engine has no status count / combo / '
            + 'slide bucket, so they cannot be installed.')
       + '</div></div>';
    return h;
  }
  function fastInstall(ctx, key) {
    var tab = FAST[ctx.fastKind ? ctx.fastKind() : ''];
    var names = (tab && tab[key]) || [];
    var put = [], skip = [], dup = 0;
    var have = ctx.installed ? ctx.installed() : [];
    names.forEach(function (en) {
      var m = modByEn(en);
      if (!m || !ctx.modOK(m)) { skip.push(en); return; }
      if (have.indexOf(m.i) >= 0) { dup++; return; }
      if (ctx.conflict && ctx.conflict(m, have)) { skip.push(en); return; }
      if (!ctx.installMod(m)) { skip.push(en); return; }
      have.push(m.i); put.push(nm(m));
    });
    return { put: put, skip: skip, dup: dup };
  }
  function pickerBody(ctx) {
    var tab = ctx.tab || 'fast';
    var q = String(ctx.q || '').trim().toLowerCase();
    var isArc = !!ctx.isArc, isExi = !!ctx.isExi;
    var hideTabs = isArc || isExi;
    var tabs = hideTabs ? '' : PKTABS.map(function (t) {
      return '<button type="button" data-tab="' + t.id + '" data-mbtab="' + t.id + '"'
           + (tab === t.id ? ' class="on"' : '') + '>'
           + (langIx() === 2 ? (PKTABS_EN[t.id] || t.n) : t.n) + '</button>';
    }).join('');
    var pool = (isArc || tab === 'riven') ? '' : poolHint(ctx);
    var hit = function (o) { return !q || hayOf(ctx, o).indexOf(q) >= 0; };
    var list = isArc
      ? (ctx.arcs() || []).filter(hit)
      : (ctx.mods() || []).filter(function (m) { return ctx.modOK(m) && hit(m); });
    var h = '', cnt = '';
    if (tab === 'riven' && !isArc) {
      h = ctx.rivenRows ? ctx.rivenRows() : '<div class="none">这个版本没有紫卡面板。</div>';
      cnt = '紫卡槽';
    } else if (isArc || q || isExi) {
      var byName = function (a, b) { var x = nm(a), y = nm(b); return x < y ? -1 : x > y ? 1 : 0; };
      var arcCore = ctx.arcCore ? (ctx.arcCore() || '') : '';
      var rankOf = function (o) {
        if (arcCore && o.i === arcCore) return -1;
        if (!q) return 0;
        var z = String(o.z || '').toLowerCase(), n = String(o.n || '').toLowerCase();
        if (z === q || n === q) return 0;
        if (z.indexOf(q) === 0 || n.indexOf(q) === 0) return 1;
        return 2;
      };
      list.sort(function (a, b) { return (rankOf(a) - rankOf(b)) || byName(a, b); });
      h = modRows(ctx, list);
      cnt = '共 ' + list.length + ' 条';
    } else if (tab === 'fast') {
      h = fastChips(ctx);
      cnt = '成套一键装填';
    } else if (tab === 'gain') {
      var gl = ctx.gainList ? ctx.gainList() : null;
      if (!gl || !gl.length) {
        h = '<div class="none">' + E(ctx.gainEmpty || '算不出收益：先选好武器。') + '</div>';
        cnt = '';
      } else {
        var gm = {};
        gl.forEach(function (x) { gm[x.m.i] = x.g; });
        h = '<div class="pkpool">按「装上后输出指数提升」降序，共 ' + gl.length + ' 张候选'
          + (ctx.gainNote ? E(ctx.gainNote()) : '') + '</div>'
          + modRows(ctx, gl.map(function (x) { return x.m; }), gm);
        cnt = '共 ' + gl.length + ' 张候选';
      }
    } else {
      var sub;
      if (tab === 'set') sub = list.filter(function (m) { return m.st; });
      else if (tab === 'dmg' || tab === 'elem' || tab === 'speed') sub = list.filter(function (m) { return catOK(m, tab); });
      else sub = list.filter(function (m) {
        return !m.st && !catOK(m, 'dmg') && !catOK(m, 'elem') && !catOK(m, 'speed');
      });
      if (tab === 'set') sub = sortForBrowse(sub);
      else sub.sort(function (a, b) { var x = nm(a), y = nm(b); return x < y ? -1 : x > y ? 1 : 0; });
      h = modRows(ctx, sub) || '<div class="none">这个分类下没有可用 MOD。</div>';
      cnt = '共 ' + sub.length + ' 条';
    }
    return { tabs: tabs, pool: pool, list: h, count: cnt, hideTabs: hideTabs };
  }
  function ownModsOf(ew, mods, isOK) {
    var wid = (ew && ew.i) || '';
    if (!wid) return [];
    return (mods || []).filter(function (m) {
      if (!m || !m.ex || m.ex.indexOf(wid) < 0) return false;
      if (m.x) return false;
      if (m.rw) return false;
      if (!m.p || !m.p.length) return false;
      if (isOK && !isOK(m)) return false;
      return true;
    });
  }
  var ELEM_SYN = {
    'blast': '火 + 冰',
    'radiation': '火 + 电',
    'gas': '火 + 毒',
    'magnetic': '冰 + 电',
    'viral': '冰 + 毒',
    'corrosive': '电 + 毒'
  };
  function elemProcTable(pb, ps) {
    var out = { rows: [] };
    if (!pb || !pb.list || !pb.list.length) return out;
    var pr = (ps && ps.rows && ps.rows.length) ? ps.rows : [];
    var byName = {}, used = {};
    pr.forEach(function (r) { if (!byName[r.n]) byName[r.n] = r; });
    var rows = pb.list.filter(function (x) { return x.has || x.stacks > 0; });
    rows.sort(function (a, b) { return (b.target + b.aoe) - (a.target + a.aoe); });
    var noteOf = function (x) {
      var syn = ELEM_SYN[x.k];
      var base = x.note || '';
      return syn ? (base ? (base + '　·　' + syn + ' 合成') : (syn + ' 合成')) : base;
    };
    rows.forEach(function (x) {
      var r = byName[x.n] || null;
      used[x.n] = 1;
      out.rows.push({
        n: x.n, k: x.k || null, note: noteOf(x),
        stacks: x.stacks, target: x.target, aoe: x.aoe, debuff: x.debuff,
        share: r ? r.share : null, dur: r ? r.dur : null, uptime: r ? r.uptime : null,
        p: r ? r.p : null, perShot: r ? r.perShot : null, perSec: r ? r.perSec : null,
        dmgSec: r ? r.dmgSec : null, dot: r ? r.dot : null
      });
    });
    pr.forEach(function (r) {
      if (used[r.n]) return;
      out.rows.push({
        n: r.n, k: r.k || null, note: r.note, stacks: null, target: null, aoe: null, debuff: null,
        share: r.share, dur: r.dur, uptime: r.uptime, p: r.p,
        perShot: r.perShot, perSec: r.perSec, dmgSec: r.dmgSec, dot: r.dot
      });
    });
    return out;
  }
  return { modSlot: modSlot, rivenSlot: rivenSlot, exilSlot: exilSlot,
           buffSlot: buffSlot, pickerRow: pickerRow, esc: E, legal: legal,
           wclass: wclass, arcLegal: arcLegal,
           PKTABS: PKTABS, FAST: FAST, FAST_CN: FAST_CN, CATK: CATK,
           POOL_CN: POOL_CN, RAR_CN: RAR_CN, MKEY: MKEY, MUNIT: MUNIT,
           TRIG_CN: TRIG_CN, COND_CN: COND_CN, SETKIND: SETKIND,
           POOL_EN: POOL_EN, RAR_EN: RAR_EN, MKEY_EN: MKEY_EN, MUNIT_EN: MUNIT,
           TRIG_EN: TRIG_EN, COND_EN: COND_EN, SETKIND_EN: SETKIND_EN,
           FAST_EN: FAST_EN, PKTABS_EN: PKTABS_EN,
           tx: tx, poolLabel: poolLabel, rarLabel: rarLabel, statShort: statShort,
           nm: nm, nd: nd, mkeyOf: mkeyOf, isStackKV: isStackKV, modUnit: modUnit,
           rarOf: rarOf, propLine: propLine, propLineAll: propLineAll,
           condLabel: condLabel, condStat: condStat, catOK: catOK, poolMain: poolMain,
           setPerCap: setPerCap, setBonusText: setBonusText, sortForBrowse: sortForBrowse,
           modByEn: modByEn, poolHint: poolHint, modRows: modRows, fastChips: fastChips,
           fastInstall: fastInstall, pickerBody: pickerBody,
           ownModsOf: ownModsOf, elemProcTable: elemProcTable };
})();
(function () {
"use strict";
var ZK      = window.ZKDATA || {};
var STATS   = ZK.stats || [];
var WEAPONS = ZK.weapons || [];
var RULES   = window.RULES || {};
var NON_PCT = RULES.NON_PCT || [20, 27, 28, 34];
var RR = window.RIVEN_ROUTER, WE = window.WF, WDB = window.WEAPON_DB;
function langIx() { return ZKHTML.langIx(); }
function NM(o) {
  if (!o) return '';
  var L = langIx();
  if (L === 2) return o.en || o.n || o.intl || o.cn || o.z || '';
  if (L === 1) return o.intl || o.cn || o.z || o.n || '';
  return o.cn || o.z || o.intl || o.n || '';
}
function ND(o) {
  if (!o) return '';
  return langIx() === 2 ? (o.de || o.dz || '') : (o.dz || o.de || '');
}
var TK = 'normal', TSTEEL = 0;
var ADV = { armor: '', strip: 0, faction: '', dmg: 0, ms: 0, cc: 0, cd: 0, fac: 0 };
var EXKEYS = window.RULES.ZK_EXKEYS;
function advActive() {
  return (ADV.armor !== '' && ADV.armor != null) || +ADV.strip || ADV.faction ||
         EXKEYS.some(function (k) { return !!+ADV[k]; });
}
function tkey() {
  var k0 = TK + (TSTEEL ? '@sp' : '');
  var base = RR.TARGET_BY_K[k0] || RR.TARGET_BY_K[TK];
  if (!base) return 'normal';
  var armFill = (ADV.armor !== '' && ADV.armor != null && isFinite(+ADV.armor));
  var strip = Math.max(0, Math.min(100, +ADV.strip || 0));
  if (!armFill && !strip && !ADV.faction) return base.k;
  var t = {}, k;
  for (k in base) if (Object.prototype.hasOwnProperty.call(base, k)) t[k] = base[k];
  var arm = armFill ? Math.max(0, +ADV.armor) : base.armor;
  t.armor = Math.round(arm * (1 - strip / 100));
  if (ADV.faction) t.faction = ADV.faction;
  t.sub = (armFill ? '护甲 ' + arm : '护甲跟档') + (strip ? ' · 剥甲 ' + strip + '%' : '') +
          (ADV.faction ? ' · 派系换过' : '') + ' → ' + t.armor;
  RR.TARGET_BY_K.__adv5 = t;
  return '__adv5';
}
function tgtLabel() {
  var t = RR.TARGET_BY_K[tkey()] || RR.TARGET_BY_K[TK];
  return t ? RR.targetNameOf(t.k, langIx()) : '普通图';
}
var ENGINE_OK = !!(RR && WE && WDB && RR.DB);
var ROW2STAT = window.RULES.ZK_ROW2STAT;
var BY_ROW = {};
STATS.forEach(function (s) { BY_ROW[s.row] = s; });
var ACTIVE = 'A';
var ST = { A: { img: null, res: null }, B: { img: null, res: null } };
var WIDX = -1;
var WIDX_FROM = null;
var WMAP = [];
var ENGINE_READY = false;
var CACHE = { A: null, B: null };
function $(id) { return document.getElementById(id); }
function unitOf(row) {
  if (ZKC.isFactionRow(row)) return '×';
  if (NON_PCT.indexOf(row) >= 0) return '';
  return '%';
}
var CATCOL = ZKC.CAT_COL;
var MELEE_ROWS = RULES.ZK_MELEE_ROWS || [3, 27, 28, 29, 30, 31, 32, 33, 34];
var CATALOG = [];
function zname(row) {
  var r = BY_ROW[row];
  if (!r) return '—';
  return NM(r) || String(row);
}
function slotKey(row, melee) {
  var k = ROW2STAT[row];
  return (k === '@spd') ? (melee ? 'aspeed' : 'frate') : k;
}
function grpOf(row) {
  return MELEE_ROWS.indexOf(row) >= 0 ? '近战武器'
       : (ZKC.isFuseRow(row) ? '融合词条' : '');
}
function buildCatalog() {
  var w = WEAPONS[WIDX], ew = engineWeapon();
  var melee = !!(w && w.cat === '近战');
  var col = w ? CATCOL[w.cat] : null;
  var legal = ew ? RR.legalStats(ew) : null, ok = {};
  if (legal) legal.forEach(function (s) { ok[s.k] = 1; });
  var out = [];
  STATS.forEach(function (s) {
    var row = s.row;
    if (!ROW2STAT[row]) return;
    var k = slotKey(row, melee);
    if (col == null) { out.push({ row: row, k: k, grp: grpOf(row) }); return; }
    if (!s.v || s.v[col] == null) return;
    if (legal && !ok[k]) return;
    out.push({ row: row, k: k, grp: grpOf(row) });
  });
  var GR = { '': 0, '近战武器': 1, '融合词条': 2 };
  out.sort(function (a, b) { return (GR[a.grp] - GR[b.grp]) || (a.row - b.row); });
  CATALOG = out;
}
function statOpt(sel, ix, slots, melee) {
  var used = {}, elems = 0;
  if (slots) slots.forEach(function (s, si) {
    if (!s || si === ix) return;
    used[s.drow] = 1;
    if (si !== 3 && window.RULES.STAT_KEY_ROW && [9, 10, 11, 12].indexOf(s.drow) >= 0) elems++;
  });
  var out = '<option value="0"' + (sel ? '' : ' selected') + '>— 无词条 —</option>', grp = null;
  CATALOG.forEach(function (x) {
    var row = x.row;
    if (ix != null && used[row]) return;
    if (ix === 3 ? alwaysPos(row, melee) : negOnly(row)) return;
    if (elems >= 2 && [9, 10, 11, 12].indexOf(row) >= 0) return;
    if (x.grp && x.grp !== grp) {
      grp = x.grp;
      out += '<option disabled>── ' + x.grp + ' ──</option>';
    }
    var st = (RR && RR.STAT_BY_K && RR.STAT_BY_K[x.k]) || null;
    out += '<option value="' + x.row + '"' + (String(x.row) === String(sel) ? ' selected' : '') + '>'
         + esc(zname(x.row)) + (st && st.dead ? ' · ' + (st.panel ? '面板另列' : '不影响伤害') : '') + '</option>';
  });
  if (sel && !CATALOG.some(function (x) { return x.row === sel; })) {
    out += '<option value="' + sel + '" selected>' + esc(zname(sel)) + ' · 不在可选目录</option>';
  }
  return out;
}
function refreshSelects(side) {
  var host = $('rows' + side);
  if (!host) return;
  var slots = [].slice.call(host.querySelectorAll('.rslot')).map(function (row) {
    var rw = +row.querySelector('select').value;
    return rw ? { drow: rw } : null;
  });
  var melee = !!(engineWeapon() && engineWeapon().cat === '近战');
  Array.prototype.forEach.call(host.querySelectorAll('select'), function (el, ix) {
    var cur = el.value;
    el.innerHTML = statOpt(+cur, ix, slots, melee);
    el.value = cur;
  });
}
function fmt(v, d) { return (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d == null ? 1 : d); }
(function buildWMap() {
  if (!ENGINE_OK) { WMAP = WEAPONS.map(function () { return null; }); return; }
  var byN = {}, byZ = {};
  RR.DB.forEach(function (w) {
    if (w.n) byN[String(w.n).toLowerCase()] = w;
    if (w.z) byZ[w.z] = w;
  });
  WMAP = WEAPONS.map(function (w) {
    var n = String(w.en || '').toLowerCase();
    if (byN[n]) return byN[n];
    if (w.cn && byZ[w.cn]) return byZ[w.cn];
    var i2 = String(w.intl || '').toLowerCase();
    if (byN[i2]) return byN[i2];
    return null;
  });
})();
function engineWeapon() {
  if (ASM_W) return ASM_W;
  return (WIDX >= 0 && WMAP[WIDX]) ? WMAP[WIDX] : null;
}
function bootEngine() {
  var el = $('eng');
  var p = (typeof window.__onnxSelfTest === 'function') ? window.__onnxSelfTest() : Promise.resolve();
  Promise.resolve(p).then(function () {
    ENGINE_READY = true;
    var src = window.__ortSource || '?';
    el.textContent = '引擎就绪（OCR 运行时来源 ' + src + '　·　收益引擎 ' + (ENGINE_OK ? '已载入 ' + RR.DB.length + ' 把武器' : '未载入') + '）';
    el.className = 'status ok';
    syncRunAll();
  }).catch(function (e) {
    el.textContent = '引擎加载失败：' + ((e && e.message) || e) + '　' + (window.__ortErr || '');
    el.className = 'status err';
  });
}
function syncRunAll() {
  var b = $('runAll');
  if (!b) return;
  b.disabled = !(ENGINE_READY && (ST.A.img || ST.B.img));
}
function weaponLabel(w) {
  if (!w) return '';
  return NM(w);
}
function weaponHits(q, limit) {
  var s = String(q || '').trim();
  var i, all = [];
  if (!s) {                                  // 空串：按原行为列出前 N 把
    for (i = 0; i < WEAPONS.length && all.length < (limit || 80); i++) all.push(i);
    return all;
  }
  return ZKC.matchWeapons(s, WEAPONS, limit || 80);
}
function renderWList(q) {
  var host = $('wlist');
  if (!host) return;
  var hit = weaponHits(q, 80);
  if (!hit.length) { host.innerHTML = '<div class="none">没有匹配的武器</div>'; host.classList.add('open'); return; }
  host.innerHTML = hit.map(function (k) {
    var w = WEAPONS[k];
    return '<button type="button" data-k="' + k + '">'
         + '<span>' + esc(NM(w)) + '</span>'
         + '<span class="en">' + esc(langIx() === 2 ? '' : (w.en || '')) + (WMAP[k] ? '' : ' <span class="nodata">无引擎数据</span>') + '</span>'
         + '</button>';
  }).join('');
  host.classList.add('open');
}
function setWeapon(i) {
  WIDX = i;
  WIDX_FROM = 'user';
  var w = WEAPONS[i];
  $('wq').value = w ? weaponLabel(w) : '';
  $('wlist').classList.remove('open');
  onWeaponChanged();
}
if ($('wq')) {
  $('wq').addEventListener('focus', function () { renderWList(this.value); });
  $('wq').addEventListener('input', function () { renderWList(this.value); });
}
if ($('wlist')) {
  $('wlist').addEventListener('mousedown', function (e) {
    var b = e.target.closest ? e.target.closest('button[data-k]') : null;
    if (!b) return;
    e.preventDefault();
    setWeapon(+b.getAttribute('data-k'));
  });
}
document.addEventListener('click', function (e) {
  if ($('wlist') && (!e.target.closest || !e.target.closest('.wpick'))) $('wlist').classList.remove('open');
});
function renderBasic() {
  var w = WEAPONS[WIDX];
  var ew = engineWeapon();
  var h = '';
  if (w) {
    h += '<b>' + esc(weaponLabel(w)) + '</b>';
    if (w.intl) h += '　国际服名 ' + esc(w.intl);
    h += '　·　类别 ' + esc(w.cat || '—') + '　·　倾向 ' + esc(w ? fmt(ZKC.disp(w), 2) : '—');
    if (w.var) h += '　·　形态 ' + esc(w.var);
    h += '<br>';
    if (ew) {
      var at = ew.at || {};
      h += '引擎档案：暴击 ' + (at.cc != null ? fmt(at.cc * 100, 1) + '%' : '—')
         + ' / 暴伤 ' + (at.cd != null ? fmt(at.cd, 2) + '×' : '—')
         + ' / 触发 ' + (at.sc != null ? fmt(at.sc * 100, 1) + '%' : '—')
         + ' / 段位 ' + (ew.mr != null ? ew.mr : '—');
    } else {
      h += '<span style="color:var(--zkc-warn)">该武器在收益引擎里没有基础数据，面板与报告无法计算（仍可识别与手填）。</span>';
    }
  } else {
    h += '尚未选定武器。识别完成后自动带入；也可直接在上面的搜索框里挑。';
  }
  ['A', 'B'].forEach(function (s) {
    var r = ST[s].res;
    if (!r) return;
    var bits = [];
    if (r.weapon && NM(r.weapon)) bits.push('识别武器 ' + NM(r.weapon));
    if (r.mr != null) bits.push('段位 ' + r.mr);
    if (r.pol) bits.push('极性 ' + r.pol);
    if (r.rolls != null) bits.push('洗练 ' + r.rolls + ' 次');
    if (bits.length) h += '<br>' + s + ' 侧读数：' + bits.join('　·　');
  });
  $('binfo').innerHTML = h;
  var wa = ST.A.res && ST.A.res.weapon, wb = ST.B.res && ST.B.res.weapon;
  var ia = (wa && wa.idx >= 0) ? wa.idx : -1;
  var ib = (wb && wb.idx >= 0) ? wb.idx : -1;
  var m = $('match');
  m.onclick = function (e) {
    var b = e.target && e.target.closest ? e.target.closest('#fixW') : null;
    if (!b) return;
    e.preventDefault();
    fixWeaponOpen();
  };
  if (ia >= 0 && ib >= 0) {
    if (ia === ib) {
      m.innerHTML = '<span class="badge ok">武器一致</span> 两侧都认出 <b>' + esc(weaponLabel(WEAPONS[ia])) + '</b>'
                  + (ia === WIDX ? '' : ' <button type="button" class="btn ghost fixw" id="fixW" title="输入框是另一把：点这里换成识别出的这把，两侧一起写上">修</button>'
                     + '　<span class="hint">输入框当前是你手选的 '
                     + esc(WIDX >= 0 ? weaponLabel(WEAPONS[WIDX]) : '（空）') + '，没有跟着改 —— 点「修」换成识别出的这把。</span>');
    } else {
      m.innerHTML = '<span class="badge err">武器不一致</span> A = ' + esc(weaponLabel(WEAPONS[ia]))
                  + '　/　B = ' + esc(weaponLabel(WEAPONS[ib]))
                  + ' <button type="button" class="btn ghost fixw" id="fixW" title="洗卡时两边必定同一把武器：点这里指定正确的那把，A / B 两侧一起改">修</button>'
                  + '　<span class="hint">洗卡时两边必定同武器。认错了就点「修」，挑正确的那把，两侧一起改（词条、段位、洗练次数都不动）。</span>';
    }
  } else if (ia >= 0 || ib >= 0) {
    var only = ia >= 0 ? ia : ib;
    m.innerHTML = '<span class="badge warn">仅一侧认出武器</span> ' + esc(weaponLabel(WEAPONS[only]))
                + ' <button type="button" class="btn ghost fixw" id="fixW" title="另一侧没认出武器：点这里指定一把，两侧一起写上">修</button>'
                + '　<span class="hint">' + (only === WIDX
                    ? '另一侧未识别或未认名，按这把算；点「修」可以把两侧都写上这把。'
                    : '输入框当前是你手选的 ' + esc(WIDX >= 0 ? weaponLabel(WEAPONS[WIDX]) : '（空）')
                      + '，识别结果被覆盖 —— 要换回请点「修」重选。') + '</span>';
  } else {
    m.innerHTML = '<span class="badge idle">待识别</span>';
  }
}
var FIXW_HOT = -1, FIXW_LIST = [];
function fixWeaponOpen() {
  if (document.getElementById('fixWMask')) return;
  var wa = ST.A.res && ST.A.res.weapon, wb = ST.B.res && ST.B.res.weapon;
  var ia = (wa && wa.idx >= 0) ? wa.idx : -1, ib = (wb && wb.idx >= 0) ? wb.idx : -1;
  var mask = document.createElement('div');
  mask.className = 'ocr-fixmask'; mask.id = 'fixWMask';
  var box = document.createElement('div');
  box.className = 'ocr-fixbox';
  var quick = '';
  if (ia >= 0 && ia !== ib) quick += '<button type="button" class="btn ghost sm" data-k="' + ia + '">用 A：' + esc(weaponLabel(WEAPONS[ia])) + '</button>';
  if (ib >= 0 && ia !== ib) quick += '<button type="button" class="btn ghost sm" data-k="' + ib + '">用 B：' + esc(weaponLabel(WEAPONS[ib])) + '</button>';
  box.innerHTML = '<h4>强行指定武器</h4>'
    + '<p>洗卡时两张卡必定同一把武器。选定后 A、B 两侧的识别武器一起改成它，'
    + '词条、等级、段位、洗练次数都不动。</p>'
    + (quick ? '<div class="fixw-quick">' + quick + '</div>' : '')
    + '<input type="text" id="fixWInput" placeholder="搜索：中文 / 国际服名 / 英文名" autocomplete="off" spellcheck="false">'
    + '<div class="ocr-fixcands" id="fixWCands"></div>'
    + '<div class="ocr-fixbar"><button type="button" class="btn ghost sm" id="fixWCancel">取消</button></div>';
  document.body.appendChild(mask);
  mask.appendChild(box);
  var inp = box.querySelector('#fixWInput'), cbox = box.querySelector('#fixWCands');
  var cur = WIDX >= 0 ? weaponLabel(WEAPONS[WIDX]) : '';
  var hot = -1;
  function close() {
    if (mask.parentNode) mask.parentNode.removeChild(mask);
    document.removeEventListener('keydown', onKey, true);
  }
  function drawList() {
    var q = inp.value.trim(), i;
    FIXW_LIST = q ? weaponHits(q, 40) : [];
    if (!FIXW_LIST.length && q && window.RivenOCR && typeof window.RivenOCR.rankWeapon === 'function') {
      var rk = window.RivenOCR.rankWeapon(q, '') || [];
      FIXW_LIST = [];
      for (i = 0; i < rk.length && FIXW_LIST.length < 12; i++) {
        if (rk[i] && rk[i].row && rk[i].score >= 70) {
          var k = WEAPONS.indexOf(rk[i].row);
          if (k >= 0) FIXW_LIST.push(k);
        }
      }
    }
    FIXW_LIST = FIXW_LIST.filter(function (x) { return x >= 0; });
    if (hot < 0 && FIXW_LIST.length) hot = 0;
    if (hot >= FIXW_LIST.length) hot = FIXW_LIST.length - 1;
    var h = '';
    for (i = 0; i < FIXW_LIST.length; i++) {
      var w = WEAPONS[FIXW_LIST[i]];
      h += '<div class="fx' + (i === hot ? ' hot' : '') + '" data-i="' + FIXW_LIST[i] + '">'
        + '<b>' + esc(weaponLabel(w)) + '</b>'
        + '<span class="cat">' + esc(w.cat || '') + (WMAP[FIXW_LIST[i]] ? '' : ' · 无引擎数据') + '</span></div>';
    }
    cbox.innerHTML = h || '<div class="fx">' + (q ? '没匹配到武器 —— 换个写法（中文 / 国际服名 / 英文名 / 外号）' : '输入武器名后这里出候选') + '</div>';
    Array.prototype.forEach.call(cbox.querySelectorAll('.fx[data-i]'), function (el) {
      el.addEventListener('click', function () { pick(+el.getAttribute('data-i')); });
    });
  }
  function pick(idx) { close(); applyFixWeapon(idx); }
  function commitSel() {
    if (!FIXW_LIST.length) { drawList(); if (!FIXW_LIST.length) return; }
    pick(FIXW_LIST[hot >= 0 && hot < FIXW_LIST.length ? hot : 0]);
  }
  function onKey(e) {
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!FIXW_LIST.length) return;
      e.preventDefault();
      var d = (e.key === 'ArrowDown' ? 1 : -1);
      hot = ((hot < 0 ? 0 : hot) + d + FIXW_LIST.length) % FIXW_LIST.length;
      drawList(); return;
    }
    if (e.key === 'Enter') { e.preventDefault(); commitSel(); }
  }
  Array.prototype.forEach.call(box.querySelectorAll('.fixw-quick button[data-k]'), function (el) {
    el.addEventListener('click', function () { pick(+el.getAttribute('data-k')); });
  });
  inp.addEventListener('input', function () { hot = -1; drawList(); });
  box.querySelector('#fixWCancel').addEventListener('click', close);
  mask.addEventListener('click', function (e) { if (e.target === mask) close(); });
  document.addEventListener('keydown', onKey, true);
  if (cur) inp.value = cur;
  drawList();
  inp.focus(); inp.select();
}
function applyFixWeapon(idx) {
  var w = WEAPONS[idx];
  if (!w) return false;
  var touched = 0;
  ['A', 'B'].forEach(function (s) {
    var r = ST[s].res;
    if (!r) return;
    r.weapon = { idx: idx, cn: w.cn, intl: w.intl, en: w.en, cat: w.cat };
    if (w.var) r.weapon.var = w.var;
    r.weaponForced = true;
    touched++;
    var el = $('st' + s);
    if (!el) return;
    var n = (r.affixes || []).length;
    el.textContent = '识别完成：' + NM(w) + ' · ' + n + ' 条词条'
                   + (n < 4 ? '　（请注意核对词条数量）' : '');
    el.className = 'status' + (n < 4 ? ' warn' : ' ok');
  });
  if (!touched) return false;
  WIDX = idx; WIDX_FROM = 'user';
  if ($('wq')) $('wq').value = weaponLabel(w);
  onWeaponChanged();
  return true;
}
var RECOIL_ROW = window.RULES.RECOIL_ROW;
function dirOf(row) { return ZKC.dirOf(row); }
function isFacRow(row) { return !!ROW2FAC[row]; }
var MELEE_POS = window.RULES.ZK_MELEE_POS;
var RANGED_POS = window.RULES.ZK_RANGED_POS;
function alwaysPos(row, melee) {
  if (row >= (window.RULES.ZK_FUSE_FROM || 35) && row <= (window.RULES.ZK_FUSE_TO || 52)) return true;
  return melee ? MELEE_POS.indexOf(row) >= 0 : RANGED_POS.indexOf(row) >= 0;
}
function negOnly(row) { return row === (window.RULES.NEG_ONLY_ROW || 30); }
function renderPanel(side) {
  var host = $('rows' + side);
  var r = ST[side].res;
  var aff = (r && r.affixes ? r.affixes : []).slice(0, 4);
  host.innerHTML = '';
  var melee = !!(engineWeapon() && engineWeapon().cat === '近战');
  var pos = [], neg = [];
  aff.forEach(function (a) {
    var v = parseFloat(a.value);
    if (!a.drow || !isFinite(v)) return;
    var internal = isFacRow(a.drow) ? (v - 1) * 100
      : (a.sign === '-' ? -1 : 1) * Math.abs(v) * dirOf(a.drow);
    (internal < 0 ? neg : pos).push({ drow: a.drow, internal: internal });
  });
  var slots = [];
  for (var i = 0; i < 3; i++) slots.push(pos[i] || null);
  slots.push(neg[0] || null);
  for (i = 0; i < 4; i++) {
    var a = slots[i] || {};
    var row = a.drow || 0;
    var neg = (i === 3 && row);
    var val = (a.internal != null)
      ? (isFacRow(row) ? (1 + a.internal / 100).toFixed(4)
                       : String(Math.round(a.internal * dirOf(row) * 100) / 100))
      : '';
    var d = document.createElement('div');
    d.className = 'rslot' + (neg ? ' neg' : '');
    var dis = '';
    d.innerHTML =
        '<span class="ri">' + (i === 3 ? '负面词条' : '正面词条 ' + (i + 1)) + '</span>'
      + '<select' + dis + '>' + statOpt(row, i, slots, melee) + '</select>'
      + '<input type="number" step="0.1" value="' + val + '"' + dis + '>'
      + '<span class="u">' + (row ? unitOf(row) : '%') + '</span>'
      + '<div class="meta"></div>';
    host.appendChild(d);
  }
  bindPanel(side);
  renderEval(side);
}
function bindPanel(side) {
  var host = $('rows' + side);
  Array.prototype.forEach.call(host.querySelectorAll('select'), function (el) {
    el.addEventListener('change', function () {
      var rw = +el.value;
      el.closest('.rslot').querySelector('.u').textContent = rw ? unitOf(rw) : '%';
      refresh();
    });
  });
  Array.prototype.forEach.call(host.querySelectorAll('input[type=number]'), function (el) {
    el.addEventListener('input', refresh);
  });
}
function readSide(side) {
  var host = $('rows' + side);
  var out = { rank: ($('rk') ? +($('rk').value || 0) : 8), affixes: [] };
  Array.prototype.forEach.call(host.querySelectorAll('.rslot'), function (row, ri) {
    var rw = +row.querySelector('select').value;
    var vv = row.querySelector('input[type=number]').value;
    if (!rw || vv === '') return;
    var x = parseFloat(vv);
    if (!isFinite(x)) return;
    out.affixes.push({ drow: rw, idx: ri,
                       internal: isFacRow(rw) ? (x - 1) * 100 : x * dirOf(rw),
                       name: NM(BY_ROW[rw]),
                       unit: unitOf(rw) });
  });
  return out;
}
var ROW2FAC = { 16: 'corpus', 17: 'grineer', 18: 'infested', 42: 'orokin', 43: 'techrot', 44: 'scaldra' };
function cardOf(side, melee) {
  var d = readSide(side), card = {};
  d.affixes.forEach(function (f) {
    var k = ROW2STAT[f.drow];
    if (!k) return;
    if (k === 'fac') {
      var tgtF = (RR && RR.TARGET_BY_K && RR.TARGET_BY_K[tkey()]) ? RR.TARGET_BY_K[tkey()].faction : '';
      var rowF = ROW2FAC[f.drow] || '';
      card.fac = (rowF && tgtF && rowF !== tgtF) ? 0 : f.internal;
      return;
    }
    if (k === '@spd') k = melee ? 'aspeed' : 'frate';
    card[k] = f.internal;
  });
  return card;
}
function computeSide(side) {
  var ew = engineWeapon();
  var out = { ok: false, err: '', ew: ew, card: null, route: null, contrib: [], tier: null,
              legal: [], nPos: 0, nNeg: 0, affixes: [] };
  if (!ENGINE_OK) { out.err = '收益引擎未载入'; return out; }
  if (!ew) { out.err = (WIDX < 0 ? '尚未选定武器' : '该武器没有引擎基础数据'); return out; }
  var d = readSide(side);
  out.affixes = d.affixes;
  if (!d.affixes.length) { out.err = '还没有填词条'; return out; }
  var p;
  try { p = RR.profile(ew); } catch (e) { out.err = '武器档案读取失败：' + e.message; return out; }
  var card = cardOf(side, p.isMelee);
  out.card = card;
  d.affixes.forEach(function (f) {
    if (f.idx === 3) out.nNeg = 1; else out.nPos++;
  });
  if (out.nPos < 2) out.nPos = 2;
  try {
    out.tier = RR.tierOf(out.nPos, out.nNeg);
    out.route = RR.route(ew, card, tkey());
    out.legal = RR.legalStats(ew);
    if (out.route && out.route.best) {
      out.contrib = RR.contribOf(ew, card, tkey(), out.route.best.id);
    }
    out.ok = !!(out.route && out.route.best);
    if (!out.ok) out.err = '这张卡没有任何流派成立';
  } catch (e) {
    out.err = '计算失败：' + e.message;
  }
  return out;
}
function renderEval(side) {
  var host = $('rows' + side);
  var c = CACHE[side] = computeSide(side);
  var ew = c.ew;
  var p = null;
  if (ew) { try { p = RR.profile(ew); } catch (e) { ZKHTML.warn('框架/modpanel.js:1550', e); } }
  var rows = host.querySelectorAll('.rslot');
  Array.prototype.forEach.call(rows, function (row, i) {
    var meta = row.querySelector('.meta');
    var drow = +row.querySelector('select').value;
    var val = row.querySelector('input[type=number]').value;
    var neg = (i === 3);   /* 无符号按钮：第 4 行恒为负面槽 */
    var a = c.affixes.filter(function (f) { return f.drow === drow; })[0];
    var bits = [];
    var r = ST[side].res;
    var ra = r && r.affixes ? r.affixes[i] : null;
    if (ra && (ra.nameRaw || ra.name)) {
      bits.push('原文 ' + esc(ra.nameRaw || ra.name) + (ra.value != null ? ' ' + esc(ra.value) + (ra.isPct ? '%' : '') : ''));
    }
    if (!drow) { meta.innerHTML = '<span class="t">空槽</span> ' + bits.join(' '); return; }
    var k = ROW2STAT[drow];
    if (!k) { meta.innerHTML = '<span class="t warn">引擎无此项</span> 不进打分'; return; }
    if (k === '@spd') k = (p && p.isMelee) ? 'aspeed' : 'frate';
    if (c.tier && val !== '') {
      var capV = isFacRow(drow) ? (+val - 1) * 100 : +val * dirOf(drow);
      var sign = capV < 0 ? -1 : 1;
      var cap = RR.statCap(ew, k, sign, c.tier);
      if (cap) {
        var pos = Math.abs(capV) / cap * 100;
        var capTxt = (k === 'fac') ? '×' + (1 + cap / 100).toFixed(2)
                                   : '≤' + fmt(cap, 2) + unitOf(drow);   /* 满值口径同 04 fmtCap（两位小数） */
        bits.push('<span class="t">满值 ' + capTxt + '</span>');
        bits.push('<span class="t' + (pos >= 99.5 ? ' core' : (pos < 85 ? ' warn' : '')) + '">浮动 ' + fmt(pos, 0) + '%</span>');
      }
    }
    var ct = c.contrib.filter(function (x) { return x.k === k; })[0];
    if (ct) {
      if (ct.delta == null) bits.push('<span class="t dead">不进打分</span>');
      else if (ct.v < 0) {
        var cost = -ct.delta;
        bits.push(cost <= 0.5
          ? '<span class="t dead">零成本负面</span>'
          : '<span class="t neg">负面 −' + fmt(cost, 1) + ' 点</span>');
      }
      else if (ct.delta <= 0.5) bits.push('<span class="t dead">无关 ±0</span>');
      else if (ct.delta >= 20) bits.push('<span class="t core">核心 +' + fmt(ct.delta, 1) + ' 点</span>');
      else bits.push('<span class="t">可用 +' + fmt(ct.delta, 1) + ' 点</span>');
    }
    meta.innerHTML = bits.join('');
  });
  var sc = $('score' + side);
  if (!c.ok) {
    sc.innerHTML = '<div class="lb">净增幅</div><div class="big na">—</div>'
                 + '<div class="bestline">' + esc(c.err || '无法计算') + '</div>';
    return;
  }
  var g = c.route.best.gain;
  var gd = RR.gradeGain(g);
  sc.innerHTML =
      '<div class="lb">净增幅（' + esc(tgtLabel()) + ' · 可成立流派取最优）</div>'
    + '<div class="big ' + (g >= 0 ? 'up' : 'down') + '">' + (g >= 0 ? '+' : '−') + fmt(Math.abs(g), 1) + '%</div>'
    + '<div class="chips"><span class="chip key">最优流派：' + esc(RR.archNameOf(c.route.best.id, langIx())) + '</span>'
    + '<span class="chip">' + esc(gd.g + ' ' + RR.gradeNameOf(gd.g, langIx())) + '</span>'
    + '<span class="chip">' + c.nPos + ' 正 ' + c.nNeg + ' 负</span>'
    + (c.affixes.some(function (f) { return !ROW2STAT[f.drow]; }) ? '<span class="chip no">含不进打分项</span>' : '')
    + '</div>'
    + '<div class="bestline">' + esc(c.affixes.length) + ' 条词条参与计算　·　同武器共 ' + c.route.list.length + ' 个流派成立</div>';
  var cpm = $('cpm' + side);
  if (cpm && WIDX >= 0) {
    var w = WEAPONS[WIDX];
    cpm.innerHTML = esc(NM(w)) + '<br>倾向 ' + esc(fmt(ZKC.disp(w), 2)) + ' · ' + esc(w.cat || '');
  }
  afRebuild();
}
var _t = null;
function refresh() {
  if (_t) clearTimeout(_t);
  _t = setTimeout(function () { _t = null; paint(); }, 90);
}
var barSig = '';
function renderTgtBar() {
  var host = $('tgtbar');
  if (!host || !RR || !RR.TARGETS) return;
  var sig = TK + '|' + TSTEEL;
  if (sig === barSig) return;
  barSig = sig;
  var sfx = TSTEEL ? '@sp' : '';
  var h = '<div class="tg2">' +
    '<button type="button" data-st="0" class="' + (TSTEEL ? '' : 'on') + '">普通图</button>' +
    '<button type="button" data-st="1" class="' + (TSTEEL ? 'on' : '') + '">钢铁之路</button></div>' +
    '<div class="tg1">';
  RR.TARGETS.forEach(function (t) {
    var tt = RR.TARGET_BY_K[t.k + sfx] || t;
    h += '<button type="button" data-k="' + t.k + '" class="' + (TK === t.k ? 'on' : '') + '">' +
      esc(RR.targetNameOf(t.k, langIx())) + '<small>' + esc(RR.targetSubOf(tt, langIx())) + '</small></button>';
  });
  host.innerHTML = h + '</div>';
}
document.addEventListener('DOMContentLoaded', function () {
  var host = $('tgtbar');
  if (!host) return;
  renderTgtBar();
  buildAdv();
  host.addEventListener('click', function (e) {
    var b = e.target;
    while (b && b !== this && !(b.getAttribute &&
           (b.getAttribute('data-k') || b.getAttribute('data-st') != null))) b = b.parentNode;
    if (!b || b === this) return;
    var k = b.getAttribute('data-k'), st = b.getAttribute('data-st');
    if (st != null) TSTEEL = +st; else if (k) TK = k;
    paint();
  });
});
function buildAdv() {
  var ehost = $('advenemy'), mhost = $('advmods');
  if (!ehost || !mhost) return;
  var facs = [['', '跟目标档']];
  Object.keys((WE && WE.FACTIONS) || {}).forEach(function (k) {
    if (k === 'none' || k === 'overguard') return;
    facs.push([k, (WE.FACTIONS[k] && WE.FACTIONS[k].label) || k]);
  });
  ehost.innerHTML =
    '<label><span>护甲</span><input type="number" step="100" data-ak="armor" placeholder="跟档"><i>点</i></label>' +
    '<label><span>已剥甲</span><input type="number" step="5" min="0" max="100" data-ak="strip" value="0"><i>%</i></label>' +
    '<label><span>派系</span><select data-ak="faction">' +
      facs.map(function (f) { return '<option value="' + f[0] + '">' + f[1] + '</option>'; }).join('') +
    '</select></label>';
  var rows = [['dmg', '基伤'], ['ms', '多重'], ['cc', '暴率'], ['cd', '暴伤'], ['fac', '对派系']];
  mhost.innerHTML = rows.map(function (r) {
    return '<label><span>' + r[1] + '</span><input type="number" step="5" data-ak="' + r[0] +
      '" placeholder="0"><i>%</i></label>';
  }).join('');
  function onEdit(e) {
    var el = e.target;
    var k = el.getAttribute && el.getAttribute('data-ak');
    if (!k) return;
    if (el.tagName === 'SELECT') ADV[k] = el.value;
    else if (el.value === '') ADV[k] = (k === 'armor') ? '' : 0;
    else ADV[k] = el.value;
    paint();
  }
  ehost.addEventListener('input', onEdit);
  ehost.addEventListener('change', onEdit);
  mhost.addEventListener('input', onEdit);
  mhost.addEventListener('change', onEdit);
}
var ADVLB = { dmg: '基伤', ms: '多重', cc: '暴率', cd: '暴伤', fac: '对派系' };
function renderAdvHint() {
  var el = $('advhint');
  if (!el) return;
  var bits = [];
  if (ADV.armor !== '' && ADV.armor != null) bits.push('护甲 ' + ADV.armor);
  if (+ADV.strip) bits.push('剥甲 ' + ADV.strip + '%');
  if (ADV.faction) bits.push('派系 ' + RR.targetName({ faction: ADV.faction }));
  EXKEYS.forEach(function (k) { if (+ADV[k]) bits.push(ADVLB[k] + ' +' + ADV[k] + '%'); });
  if (!bits.length) { el.textContent = ''; return; }
  var cur = RR.TARGET_BY_K[tkey()];
  el.textContent = '微调生效 —— ' + bits.join(' · ') +
    (cur ? '。实际按护甲 ' + cur.armor + '（减伤 ' +
      Math.round((WE.armorDR ? WE.armorDR(cur.armor) : 0) * 100) + '%）、派系 ' +
      RR.targetName(cur) + ' 算' : '') + '。清空即回到目标档。';
}
function paint() {
  renderTgtBar();
  renderAdvHint();
  activeExtras();
  applyStance();
  renderStance();
  renderCap();
  renderBasic();
  renderEval('A'); renderEval('B');
  renderWPanel();
  renderConclusion();
  renderDiagElemProc(); renderDiagClear();
  renderReport();
}
var ELEM_COLOR = {
  impact:'#9aa0b0', puncture:'#6f8fb0', slash:'#d9534f',
  cold:'#7ec8e3', heat:'#e8732f', electric:'#e6c84f', toxin:'#5fbf6a',
  blast:'#b07a3a', corrosive:'#3aa6a0', gas:'#9bc53d',
  magnetic:'#a06fd0', radiation:'#e8923f', viral:'#4f8fe8', void:'#8a6fd0', tau:'#6b6b6b'
};
ZKMB.ELEM_COLOR = ELEM_COLOR;   /* 04 区武器面板的构成条复用同一份配色 */
var FACOF = {
  smite_corpus: 'corpus', smite_grineer: 'grineer', smite_infested: 'infested',
  smite_corrupted: 'orokin', smite_the_murmur: 'murmur', smite_sentient: 'sentient'
};
function facOK(owner) {
  if (!owner) return true;
  var f = (owner.st === 'sacrifice') ? 'sentient' : FACOF[owner.fam];
  if (!f) return true;
  var t = (RR && RR.TARGET_BY_K) ? RR.TARGET_BY_K[tkey()] : null;
  return !!t && t.faction === f;
}
function collectBuckets(withCard) {
  var b = {}, meta = {}, k;
  var eo = [];   /* mod 元素按槽序（装卡顺序）——伤害构成组合的顺序口径，与 02/05 一致 */
  if (withCard) {
    var side = RIVEN_SIDE, card = side ? (CACHE[side] && CACHE[side].card) : null;
    if (card) {
      var rb = RR.parseRiven(card || {});
      for (k in rb.buckets) if (Object.prototype.hasOwnProperty.call(rb.buckets, k)) b[k] = (b[k] || 0) + rb.buckets[k];
      for (k in rb.meta) if (Object.prototype.hasOwnProperty.call(rb.meta, k)) meta[k] = (meta[k] || 0) + rb.meta[k];
    }
  }
  var add = function (arr, owner, ly) {
    (arr || []).forEach(function (kv) {
      var key = mkeyOf(owner, kv[0]), v = propValOf(owner, kv, ly);
      if (key === 'fac' && !facOK(owner)) return;
      if (AF_META_K[key]) meta[key] = (meta[key] || 0) + v;
      else {
        b[key] = (b[key] || 0) + v;
        if (WF.PRIM && WF.PRIM.indexOf(key) >= 0 && eo.indexOf(key) < 0) eo.push(key);
      }
    });
  };
  for (var i = 0; i < NSLOT; i++) {
    if (i === RIVEN_SLOT && !RIVEN_OFF) continue;
    var m = SLOTS[i] ? MODBY[SLOTS[i]] : null;
    if (m && modOK(m, i)) add(m.p, m, slotLayers(i));
  }
  weaponArcRoles().forEach(function (role) {
    var id = ARC[role];
    var a = id ? ARCBY[id] : null;
    if (a && (a.t === role || a.t === '任意武器')) add(a.p, a, arcLayers(role));
  });
  return { b: b, meta: meta, eo: eo };
}
function currentBuckets() { return collectBuckets(true); }
function renderWPanel() {
  var host = $('wpanel');
  if (!host) return;
  var ew = engineWeapon();
  if (!ENGINE_OK) { host.innerHTML = '<div class="ai-nil">引擎还没就绪 —— 等顶部状态变绿后重进本区。</div>'; return; }
  if (!ew) { host.innerHTML = '<div class="ai-nil">还没选定武器 —— 识别认出武器 / 信息栏手选 / 点「修」指定后，这里出军械库面板。</div>'; return; }
  var bm = currentBuckets();
  var s;
  var _rSide = RIVEN_SIDE, _rCard = _rSide ? (CACHE[_rSide] && CACHE[_rSide].card) : null;
  var _eo = [];
  try { (RR.elemOrderNow(_rCard || {}) || []).forEach(function (k0) { if (_eo.indexOf(k0) < 0) _eo.push(k0); }); } catch (e0) { ZKHTML.warn('框架/modpanel.js:1519', e0); }
  (bm.eo || []).forEach(function (k0) { if (_eo.indexOf(k0) < 0) _eo.push(k0); });
  try { s = RR.snapPanel(ew, null, bm.b, bm.meta, _eo); } catch (e) { host.innerHTML = ''; return; }
  if (!s) { host.innerHTML = ''; return; }
  var total = s.total, isMeleeW = (ew.s === 'm' || ew.s === 'e');
  var nMod = liveMods().length + (RIVEN_SIDE ? 1 : 0)
            + weaponArcRoles().filter(function (r) { return ARC[r]; }).length;
  var h = '<div class="wph"><span class="nm">' + esc(NM(ew)) + '</span>'
        + '<span class="cl">' + esc(weaponClassCN()) + '　·　已叠 ' + nMod + ' 张卡后的面板</span></div>';
  h += '<div class="wgrid">';
  function tile(l, v, u) {
    return '<div class="wtile"><div class="wl">' + l + '</div><div class="wv">'
         + (u ? v + ' <small>' + u + '</small>' : v) + '</div></div>';
  }
  h += tile('总伤害', fmt(total, 1));
  h += tile('暴击', fmt(s.cc, 1) + '%', '×' + fmt(s.cd, 2));
  h += tile('暴击期望', fmt(s.critM, 3) + '×');
  h += tile('触发', fmt(s.sc, 1) + '%');
  h += tile(isMeleeW ? '攻击速度' : '射速', fmt(s.fr, 2), '/s');
  h += tile('多重', fmt(s.ms, 2));
  if (!isMeleeW) {
    h += tile('弹匣', fmt(s.mag, 0), '发');
    h += tile('装填', fmt(s.rel, 2), 's');
    h += tile('持续射速', fmt(s.sus, 2), '/s');
  }
  h += tile('范围', fmt(s.rng, 2), 'm');
  h += tile('穿透', fmt(s.pt, 2), 'm');
  if (s.combo) h += tile('连击', fmt(s.combo, 0));
  if (isMeleeW) {
    var si = (RR.stanceInfo ? RR.stanceInfo() : null);
    var h1 = 0, fin = null, _t = RR.TARGET_BY_K ? RR.TARGET_BY_K[tkey()] : null;
    try {
      var _r = RR.scoreArch(ew, {}, _t, RR.ARCH_BY_ID['m_sustain']);
      h1 = (_r && _r.hitDmg) || 0;
    } catch (e1) { ZKHTML.warn('框架/modpanel.js:1834', e1); }
    try { fin = RR.finisherDmg(ew, null, _t); } catch (e2) { ZKHTML.warn('框架/modpanel.js:1835', e2); }
    h += tile('架势', si ? NM(si) : '不装');
    h += tile('平A 倍率', '×' + fmt(si ? si.per : 1, 2));
    if (h1) h += tile('平A 单发', fmt(h1, 0));
    if (h1) h += tile('平A 秒伤', fmt(h1 * (s.fr || 1), 0), '/s');
    if (fin) h += tile('处决伤害', fmt(fin.dmg, 0), '×' + fmt(fin.mul, 0));
  }
  h += '</div>';
  var order = (WE.PHYS || ['impact','puncture','slash']).concat(WE.ELEM || []);
  var rows = [];
  order.forEach(function (t) {
    var v = s.types[t];
    if (v > 0.0001) rows.push({ t: t, v: v, pct: total > 0 ? v / total * 100 : 0 });
  });
  if (rows.length) {
    rows.sort(function (a, b) { return b.v - a.v; });
    h += '<div class="elem"><h4>伤害构成（物理 + 元素 · 含已装 MOD 与赋能）</h4><div class="ebar">';
    rows.forEach(function (r) {
      h += '<span style="width:' + r.pct + '%;background:' + (ELEM_COLOR[r.t] || '#9aa0b0')
         + '" title="' + esc(WE.TYPE_CN[r.t] || r.t) + ' ' + fmt(r.v, 1) + '（' + fmt(r.pct, 1) + '%）"></span>';
    });
    h += '</div><div class="elegend">';
    rows.forEach(function (r) {
      h += '<div class="er"><span class="dot" style="background:' + (ELEM_COLOR[r.t] || '#9aa0b0') + '"></span>'
         + '<span class="en">' + esc(WE.TYPE_CN[r.t] || r.t) + '</span>'
         + '<span class="ev">' + fmt(r.v, 1) + '</span>'
         + '<span class="ep">' + fmt(r.pct, 1) + '%</span></div>';
    });
    h += '</div></div>';
  }
  var pd = null;
  try { pd = RR.panelDiff(ew, null, null, { buckets: bm.b, meta: bm.meta }, _eo); } catch (e) { pd = null; }
  if (pd && pd.rows && pd.rows.length) {
    var unit = function (v, r) {
      var s = fmt(+v || 0, r.d);
      if (r.u === '%') return s + '%';
      if (!r.u) return s;
      return s + (r.u.charAt(0) === '/' ? '' : ' ') + r.u;
    };
    h += '<div class="wdiff"><h4><b>无卡 → 有卡</b>　军械库口径（裸枪）对当前整套配卡，改一格即重算</h4>';
    h += '<div class="wd"><div class="hd">项</div><div class="hd c">无卡</div>'
       + '<div class="hd c">有卡</div><div class="hd c">变化</div>';
    var lastG = null;
    pd.rows.forEach(function (r) {
      if (r.g !== lastG) { h += '<div class="grp">' + esc(RR.panelGrpName(r.g, langIx())) + '</div>'; lastG = r.g; }
      var dv = (+r.after || 0) - (+r.before || 0);
      var eps = 0.5 * Math.pow(10, -(r.d || 0));
      var dTxt = Math.abs(dv) < eps ? '—'
        : (dv > 0 ? '+' : '−') + fmt(Math.abs(dv), r.d) + (r.u === '%' ? '%' : '');
      var hint = (r.n === '连击时长') ? '' : (r.hint || '');
      h += '<div class="k">' + esc(RR.panelRowName(r, langIx())) + (hint ? '<small>' + esc(hint) + '</small>' : '') + '</div>'
         + '<div class="c">' + unit(r.before, r) + '</div>'
         + '<div class="c">' + unit(r.after, r) + '</div>'
         + '<div class="delta' + (dTxt === '—' ? ' zero' : '') + '">' + dTxt + '</div>';
    });
    h += '</div></div>';
  }
  host.innerHTML = h;
}
function reportView() {
  var cA = CACHE.A, cB = CACHE.B;
  var ew = engineWeapon();
  return { cA: cA, cB: cB, ew: ew, p: ew ? RR.profile(ew) : null };
}
function renderReport() {
  var host = $('repBody');
  var v = reportView();
  if (!ENGINE_OK) { host.innerHTML = '<div class="empty">收益引擎未载入。</div>'; return; }
  if (!v.ew) { host.innerHTML = '<div class="empty">先选定武器。</div>'; return; }
  var cA = v.cA, cB = v.cB;
  if (!cA.ok && !cB.ok) {
    host.innerHTML = '<div class="empty">' + esc((cA.err || '') + (cB.err && cB.err !== cA.err ? '　/　' + cB.err : '')) + '，暂无可出报告的内容。</div>';
    return;
  }
  var h = secMods() + secArch(v) + secAffix(v);
  host.innerHTML = h;
}
function renderConclusion() {
  var host = $('repConc');
  if (!host) return;
  var v = reportView();
  if (!ENGINE_OK) { host.innerHTML = '<div class="empty">收益引擎未载入。</div>'; return; }
  if (!v.ew) { host.innerHTML = '<div class="empty">先选定武器。</div>'; return; }
  var cA = v.cA, cB = v.cB;
  if (!cA.ok && !cB.ok) {
    host.innerHTML = '<div class="empty">' + esc((cA.err || '') + (cB.err && cB.err !== cA.err ? '　/　' + cB.err : '')) + '，暂无可出结论的内容。</div>';
    return;
  }
  host.innerHTML = secConclusion(v);
}
function diagCtx() {
  var c = CACHE.A;
  if (!c || !c.ok || !c.route || !c.route.best) return null;
  var ex = (LAST_EX && Object.keys(LAST_EX).length) ? LAST_EX : null;
  return { c: c, w: c.ew, card: c.card, best: c.route.best,
           mods: ex || c.route.best.build || {} };
}
function diagShow(card, bodyId, html, labId, labTxt) {
  var el = $(card), body = $(bodyId), lab = $(labId);
  if (!el || !body) return;
  if (!html) { body.innerHTML = ''; el.hidden = true; return; }
  body.innerHTML = html;
  if (lab && labTxt != null) lab.textContent = labTxt;
  el.hidden = false;
}
function fmtOr(v, d) { return (v > 0) ? fmt(v, d) : '—'; }
var TRIG_NOTE = '（这边没装流派标准卡，只算你配的这 8 张 + 紫卡）';
function renderDiagElemProc() {
  var x = diagCtx();
  if (!x) return diagShow('dmpElem', 'dmpElemBody', '');
  var pb = null, ps = null;
  try { pb = RR.procBreakdown(x.w, x.best.form, x.card, tkey(), x.mods); } catch (e) { pb = null; }
  try { ps = RR.procStats(x.w, x.best.form, x.card, tkey(), x.mods); } catch (e2) { ps = null; }
  var tb = (window.ZKMB && ZKMB.elemProcTable) ? ZKMB.elemProcTable(pb, ps) : { rows: [] };
  if (!tb.rows.length) return diagShow('dmpElem', 'dmpElemBody', '');
  var h = '<table class="epc"><thead>' +
    '<tr class="grp"><th rowspan="2">元素 / 异常</th>' +
    '<th colspan="4" class="grp-a">一层有多疼</th>' +
    '<th colspan="7" class="grp-b">多久挂得上</th></tr>' +
    '<tr class="grp2"><th>层数</th><th>主目标</th><th>群体</th><th>减益</th>' +
    '<th>比重</th><th>持续</th><th>覆盖率</th><th>弹片触发率</th>' +
    '<th>每发触发量</th><th>每秒触发量</th><th>每秒触发伤害</th></tr></thead><tbody>';
  tb.rows.forEach(function (r) {
    h += '<tr>' +
      '<td>' + esc(r.k ? (langIx() === 2 ? (RR.PROC_EL_EN[r.k] || r.n) : r.n) : r.n)
      + (r.note ? '<small>' + esc(r.note) + '</small>' : '') + '</td>' +
      '<td style="text-align:right">' + (r.stacks > 0 ? r.stacks : '—') + '</td>' +
      '<td style="text-align:right">' + fmtOr(r.target, 1) + '</td>' +
      '<td style="text-align:right">' + fmtOr(r.aoe, 1) + '</td>' +
      '<td>' + esc(r.debuff || '—') + '</td>' +
      '<td style="text-align:right">' + (r.share != null ? fmt(r.share * 100, 1) + '%' : '—') + '</td>' +
      '<td style="text-align:right">' + (r.dur != null ? fmt(r.dur, r.dur < 10 ? 1 : 0) + 's' : '—') + '</td>' +
      '<td style="text-align:right">' + (r.uptime != null ? fmt(r.uptime * 100, 1) + '%' : '—') + '</td>' +
      '<td style="text-align:right">' + (r.p != null ? fmt(r.p * 100, 2) + '%' : '—') + '</td>' +
      '<td style="text-align:right">' + (r.perShot != null ? fmt(r.perShot, 2) : '—') + '</td>' +
      '<td style="text-align:right">' + (r.perSec != null ? fmt(r.perSec, 2) : '—') + '</td>' +
      '<td style="text-align:right">' + ((r.dot && r.dmgSec > 0) ? fmt(Math.round(r.dmgSec), 0) : '—') + '</td>' +
      '</tr>';
  });
  h += '</tbody></table>';
  var s = 'A 卡';
  if (pb) {
    s += ' · 目标 ' + (pb.target ? RR.targetNameOf(pb.target.k, langIx()) : '—') +
      (pb.ctx && pb.ctx.crowd > 0 ? ' · 怪群密度 ' + Math.round(pb.ctx.crowd * 100) + '%' : ' · 单体');
  }
  if (ps) {
    var pel = (ps.pelletFrac > 0.02) ? (ps.pelletsInt + '+' + fmt(ps.pelletFrac, 1)) : String(ps.pelletsInt);
    s += ' · 触发 ' + fmt(ps.sc * 100, 1) + '% · 弹片 ' + pel +
      ' · 射速 ' + fmt(ps.rate, 2) + '/秒 · 每发异常 ' + fmt(ps.total.perShot, 2) + ' 个' +
      (ps.statusDurM && Math.abs(ps.statusDurM - 1) > 0.005 ? ' · 持续 ×' + fmt(ps.statusDurM, 2) : '') +
      (ps.total.dmgSec > 0 ? ' · 触发伤害 ' + fmt(Math.round(ps.total.dmgSec), 0) + '/秒' : '');
  }
  diagShow('dmpElem', 'dmpElemBody', h, 'dmpElemlab', s);
}
function renderDiagClear() {
  var x = diagCtx();
  if (!x) return diagShow('dmpClear', 'dmpClearBody', '');
  var c = x.best.clear;
  if (!c || !(c.perShot > 0)) return diagShow('dmpClear', 'dmpClearBody', '');
  var hit = +x.best.hitDmg || 0, rate = +c.rate || 0;
  var rows = [['主目标', hit, '被直接命中的那一只（直击 + 径向两段相加）']];
  if (c.radial > 0) rows.push(['径向溅射', c.radial,
    '半径 ' + fmt(c.radR, 1) + ' m 内每只各吃一份 · 边缘按衰减系数折成面积加权 · 该形态径向占 ' +
    fmt(c.radShare * 100, 0) + '%']);
  if (c.blast > 0) rows.push(['爆炸引爆', c.blast, '满 10 层或目标死亡时结算，5 m 内每层 300%']);
  if (c.electric > 0) rows.push(['电链', c.electric, '3 m 内 50% 攻击伤害（已剔掉主目标那份）']);
  if (c.gas > 0) rows.push(['毒气云', c.gas, '3→6 m，命中数按面积 (r/3)²']);
  if (c.napalm > 0) rows.push(['夜巡燃烧弹', c.napalm,
    '每跳 ' + fmt(c.napalmTick, 1) + ' 火伤 × ' + c.napalmTicks + ' 跳 · 覆盖 ' +
    fmt(c.napalmArea * 100, 0) + '% 爆炸面积 · 多重每发多叠一层 · 只吃基伤/派系']);
  var tot = 0;
  rows.forEach(function (r) { if (r[0] !== '主目标') tot += r[1]; });
  var h = '<table><tr><th>通道</th><th style="text-align:right">每发</th>' +
          '<th style="text-align:right">每秒</th><th style="text-align:right">占总输出</th></tr>';
  rows.forEach(function (r, i) {
    h += '<tr><td>' + esc(r[0]) + (r[2] ? '<small>' + esc(r[2]) + '</small>' : '') + '</td>' +
         '<td style="text-align:right">' + (r[1] > 0 ? fmt(Math.round(r[1]), 0) : '—') + '</td>' +
         '<td style="text-align:right">' + (r[1] > 0 && rate > 0 ? fmt(Math.round(r[1] * rate), 0) : '—') + '</td>' +
         '<td style="text-align:right">' + (i === 0 ? '—' : fmt(r[1] / (hit + c.perShot) * 100, 1) + '%') + '</td>' +
         '</tr>';
  });
  h += '</table>';
  if (c.acid > 0 || c.acidEquiv > 0) {
    h += '<div class="note">酸性弹药（<b>按击杀触发</b>，不是按发）：450 腐蚀（过护甲后 <b>' +
      fmt(Math.round(c.acidFlat), 0) + '</b>）＋ 45% 敌方最大生命 · 半径 ' + fmt(c.acidR, 0) +
      ' m · 等效 <b>每次击杀让周围每只敌人掉 ' + fmt(c.acidEquiv * 100, 1) +
      '% 血</b>（45% × 护甲保留 × 群体）。45% 那项是相对血量，引擎没有敌人血量数据，' +
      '编一张「等级 → 血量」表就是自造系数，所以只给比例口径、不折绝对伤害。</div>';
  }
  var wi = x.w && x.w.i;
  var mech = (wi && MODS.length) ? MODS.filter(function (m) {
    return m && m.ex && m.ex.indexOf(wi) >= 0;
  }) : [];
  if (mech.length && !(c.napalm > 0) && !(c.acid > 0)) {
    h += '<div class="note">这张武器还能装 ' + mech.map(function (m) {
      return '<b>' + esc(NM(m)) + '</b>';
    }).join(' / ') + ' 这类清场机制卡 —— 源数据没有 bucket，只能靠标记桶进引擎，这边配卡装上也不出数。</div>';
  }
  diagShow('dmpClear', 'dmpClearBody', h, 'dmpClearlab',
    'A 卡 · 群体占 ' + fmt(c.share * 100, 1) + '%' +
    (c.radArea > 0 ? ' · 覆盖半径 ' + fmt(c.radR, 1) + ' m（' + fmt(Math.round(c.radArea), 0) + ' m²）' : ''));
}
function secMods() {
  var slot = curSlot();
  var act = liveMods().map(function (m) { return { n: NM(m), p: propLineAll(m), c: modCost(m, POLS[SLOTS.indexOf(m.i)]) }; });
  weaponArcRoles().forEach(function (role) {
    var aid = ARC[role]; var a = aid ? ARCBY[aid] : null;
    if (a) act.push({ n: NM(a) + '（赋能 · ' + role + '）',
      p: propLineAll(a) + (arcClass(a) !== 'modeled' ? '　' + arcClassLabel(a) : ''), c: null });
  });
  if (!act.length) return '';
  var h = '<div class="rsec"><h3><span class="no">§0</span>本次计入的配卡</h3><p style="line-height:2">';
  act.forEach(function (x) {
    h += '<span class="chip key" style="margin:2px 5px 2px 0">' + esc(x.n) + '　' + esc(x.p)
       + (x.c != null ? '　<span style="opacity:.7">' + x.c + ' 点</span>' : '') + '</span>';
  });
  h += '</p><div class="note">这些卡<b>就是</b>当前这套配卡（引擎 <code>setExtraMods</code> 走替换口径）；'
     + '一张不装才回退到流派标准配卡。占容量 ' + capUse() + ' / ' + capMax() + ' 点。'
     + (capMax() > CAP_MAX ? '（含满级架式 +' + (capMax() - CAP_MAX) + '）' : '') + '</div></div>';
  return h;
}
function ctNum(v) {
  if (!(v > 0)) return '0';
  return v >= 1e4 ? fmt(v / 1e4, 2) + '万' : fmt(v, 0);
}
function secArch(v) {
  var cA = v.cA, cB = v.cB;
  var names = [], byName = {};
  [cA, cB].forEach(function (c) {
    if (!c.route) return;
    c.route.list.forEach(function (s) {
      if (!byName[s.n]) { byName[s.n] = { A: null, B: null, eA: null, eB: null }; names.push(s.n); }
      byName[s.n][c === cA ? 'A' : 'B'] = s.gain;
      byName[s.n][c === cA ? 'eA' : 'eB'] = s;
    });
  });
  if (!names.length) return '';
  function rankOf(n) {
    var a = byName[n].A, b = byName[n].B;
    return Math.max(a == null ? -1e9 : a, b == null ? -1e9 : b);
  }
  names.sort(function (a, b) { return rankOf(b) - rankOf(a); });
  var bestA = cA.ok ? RR.archNameOf(cA.route.best.id, langIx()) : null;
  var bestB = cB.ok ? RR.archNameOf(cB.route.best.id, langIx()) : null;
  var top = names.slice();
  var h = '<div class="rsec"><h3><span class="no">§2</span>流派判定（这张卡该走什么）</h3>';
  h += '<table><tr><th>流派</th><th style="text-align:right">A 净增幅</th><th style="text-align:right">B 净增幅</th><th>谁能走</th></tr>';
  top.forEach(function (n) {
    var a = byName[n].A, b = byName[n].B;
    h += '<tr><td>' + esc(n) + '</td>'
       + '<td class="num">' + (a == null ? '—' : (a >= 0 ? '+' : '−') + fmt(Math.abs(a), 1) + '%') + '</td>'
       + '<td class="num">' + (b == null ? '—' : (b >= 0 ? '+' : '−') + fmt(Math.abs(b), 1) + '%') + '</td>'
       + '<td>' + (n === bestA ? '<span class="chip key">A 最优</span> ' : '') + (n === bestB ? '<span class="chip key">B 最优</span>' : '') + '</td></tr>';
    var se = null, sTag = '';
    if (byName[n].eA && byName[n].eA.comboInfo) { se = byName[n].eA; sTag = 'A'; }
    else if (byName[n].eB && byName[n].eB.comboInfo) { se = byName[n].eB; sTag = 'B'; }
    if (se) {
      var ci = se.comboInfo, sp = ci.sp;
      var srows = [];
      var l1 = '起手 ' + Math.round(ci.initCombo) + ' 连击 = ' + ci.level + ' 级 → 连击倍率 ×' + fmt(ci.mult, 0);
      if (+ci.cap && +ci.cap !== 220) l1 += ' · 该武器上限 ' + ci.cap + '（被动 +1 级）';
      if (+ci.brCrit) l1 += ' · 急进猛突 +' + fmt(ci.brCrit, 0) + '% 暴击（随连击倍率）';
      if (+ci.heavyFactor && !ci.sp) l1 += ' · 重击伤害 ×' + fmt(ci.heavyFactor, 0) + '（每次重击都按这一档）';
      srows.push(l1);
      if (sp) {
        var mul = sp.slamBase * sp.dmgM * sp.elemM * sp.combo * sp.slamM * sp.msdm * sp.facM * sp.coef;
        var l2 = '基础震地 ' + ctNum(sp.slamBase)
          + ' × 基伤 ×' + fmt(sp.dmgM, 2)
          + ' × 元素 ×' + fmt(sp.elemM, 2)
          + ' × 连击 ×' + fmt(sp.combo, 0)
          + (Math.abs(sp.slamM - 1) > 1e-9 ? ' × 震地增伤 ×' + fmt(sp.slamM, 2) : '')
          + ' × 震波 ×' + fmt(sp.msdm, 2)
          + ' × 对敌 ×' + fmt(sp.facM, 2)
          + ' × 派系 ×' + fmt(sp.coef, 2)
          + ' = ' + ctNum(mul) + '（未暴击）';
        srows.push(l2);
        srows.push('暴击 ' + fmt(sp.cc, 1) + '% ×' + fmt(sp.cd, 2)
          + ' → 期望 ×' + fmt(sp.critM, 2) + ' = ' + ctNum(sp.total)
          + '　← 重击/震地吃满连击倍率，暴率按重击翻倍');
      } else if (se.slamDmg) {
        srows.push('实际震地伤害 ' + fmt(se.slamDmg / 1e4, 1) + '万');
      }
      h += '<tr><td colspan="4" style="font-size:12px;color:#7a7a7a">　' + esc(n) + '（' + sTag + '）：'
        + srows.map(function (x) { return esc(x); }).join('<br>　') + '</td></tr>';
    }
    var ce = null, cTag = '';
    if (byName[n].eA && byName[n].eA.ct) { ce = byName[n].eA; cTag = 'A'; }
    else if (byName[n].eB && byName[n].eB.ct) { ce = byName[n].eB; cTag = 'B'; }
    if (ce) {
      var ct = ce.ct;
      var rows = [];
      rows.push('面板基数 D = ' + ctNum(ct.D) + '　等级 ×' + ct.lvM + '　基伤 ×' + fmt(ct.dmgM, 2)
        + '　多重 ' + fmt(ct.ms, 2) + '（撞击段按 0.5+0.5×多重 折）');
      rows.push('① 撞击 1.875×  D/3 ×(物理词条加成 冲击 ' + fmt(ct.physMod.impact, 2)
        + ' / 穿刺 ' + fmt(ct.physMod.puncture, 2) + ' / 切割 ' + fmt(ct.physMod.slash, 2)
        + ') = ' + ctNum(ct.imp) + '　← 唯一吃物理词条的一段');
      rows.push('② 爆炸 5×  (D + D×病毒 ' + fmt(ct.viralPct, 0) + '%) · ' + fmt(ct.radius, 0)
        + 'm 爆心覆盖 ×' + fmt(ct.ctHitCtr, 2) + ' = ' + ctNum(ct.boom) + '　← 不吃物理');
      rows.push('③ 嵌入 3×  (D + D×爆炸 ' + fmt(ct.blastPct, 0) + '%) = ' + ctNum(ct.emb) + '　← 不吃物理');
      rows.push('合计 ' + ctNum(ct.sum) + ' × 暴击期望 ' + fmt(ct.critM, 2) + '× × 对敌 ' + fmt(ct.facM, 2)
        + ' × 护甲后 ' + fmt(1 - ct.dr, 2) + ' = ' + ctNum(ct.total));
      h += '<tr><td colspan="4" style="font-size:12px;color:#7a7a7a">　' + esc(n) + '（' + cTag + '）：'
        + rows.map(function (x) { return esc(x); }).join('<br>　') + '</td></tr>';
    }
  });
  h += '</table>';
  h += '<div class="note">共 ' + names.length + ' 个流派能成立。</div>';
  var rej = (cA.route && cA.route.rejected) || (cB.route && cB.route.rejected) || [];
  if (rej.length) {
    h += '<p style="margin:9px 0 2px;font-size:12.5px"><b>被排除的流派</b>：</p><ul style="font-size:12.5px">';
    rej.forEach(function (x) { h += '<li>' + esc(RR.archNameOf(x.id, langIx())) + ' —— ' + esc(x.why) + '</li>'; });
    h += '</ul>';
  }
  return h + '</div>';
}
function secAffix(v) {
  var cards = [['A', v.cA], ['B', v.cB]];
  var h = '<div class="rsec"><h3><span class="no">§3</span>每条词条的意义（贡献 = 删掉这条后净增幅掉多少点）</h3>';
  cards.forEach(function (pair) {
    var side = pair[0], c = pair[1];
    h += '<h4>卡 ' + side + (c.ok ? '　净增幅 ' + (c.route.best.gain >= 0 ? '+' : '−') + fmt(Math.abs(c.route.best.gain), 1) + '%　·　' + esc(RR.archNameOf(c.route.best.id, langIx())) : '') + '</h4>';
    if (!c.ok) { h += '<div class="empty">' + esc(c.err) + '</div>'; return; }
    h += '<table><tr><th>词条</th><th style="text-align:right">卡面值</th><th style="text-align:right">占该档上限</th><th style="text-align:right">贡献</th><th>判定</th></tr>';
    var maxD = 0;
    c.contrib.forEach(function (x) { if (x.delta != null && x.delta > maxD) maxD = x.delta; });
    c.contrib.forEach(function (x) {
      var sign = x.v < 0 ? -1 : 1;
      var cap = RR.statCap(c.ew, x.k, sign, c.tier);
      var pos = cap ? Math.abs(x.v) / cap * 100 : null;
      var cls, lab;
      if (x.delta == null) { cls = 'dead'; lab = '不进打分'; }
      else if (x.v < 0) {
        var cost = -x.delta;
        cls = cost > 0.5 ? 'neg' : 'core';
        lab = cost > 0.5 ? '负面（−' + fmt(cost, 1) + ' 点）' : '零成本负面';
      }
      else if (x.delta <= 0.5) { cls = 'dead'; lab = '无关'; }
      else if (x.delta >= maxD * 0.6) { cls = 'core'; lab = '核心'; }
      else { cls = ''; lab = '可用'; }
      h += '<tr><td>' + esc(x.n) + '</td>'
         + '<td class="num">' + (x.v < 0 ? '−' : '+') + fmt(Math.abs(x.v), 1) + '</td>'
         + '<td class="num">' + (pos == null ? '—' : fmt(pos, 1) + '%' + (pos >= 99.5 ? ' 顶格' : '')) + '</td>'
         + '<td class="num">' + (x.delta == null ? '—' : (x.delta >= 0 ? '+' : '−') + fmt(Math.abs(x.delta), 1) + ' 点') + '</td>'
         + '<td><span class="chip ' + (cls === 'core' ? 'ok' : (cls === 'neg' ? 'no' : '')) + '">' + lab + '</span></td></tr>';
    });
    h += '</table>';
  });
  return h + '</div>';
}
function secConclusion(v) {
  var cA = v.cA, cB = v.cB;
  var h = '<div class="rsec"><h3><span class="no">§4</span>结论：留哪张</h3>';
  if (!cA.ok || !cB.ok) {
    var only = cA.ok ? 'A' : (cB.ok ? 'B' : null);
    if (!only) return h + '<div class="empty">两张卡都还没算出来。</div></div>';
    var oc = cA.ok ? cA : cB;
    h += '<div class="verdict"><div class="head">只有卡 ' + only + ' 可算<span class="gr">'
       + esc(RR.gradeGain(oc.route.best.gain).g) + '</span></div>'
       + '<div style="font-size:13px">净增幅 ' + (oc.route.best.gain >= 0 ? '+' : '−') + fmt(Math.abs(oc.route.best.gain), 1)
       + '%　·　最优流派 ' + esc(RR.archNameOf(oc.route.best.id, langIx())) + '</div>'
       + '<div class="note">另一侧没填或没识别，无法对比。</div></div></div>';
    return h;
  }
  var ga = cA.route.best.gain, gb = cB.route.best.gain;
  var diff = ga - gb;
  var win = Math.abs(diff) < 2 ? null : (diff > 0 ? 'A' : 'B');
  var wc = win === 'A' ? cA : cB;
  var lc = win === 'A' ? cB : cA;
  var gd = RR.gradeGain(wc.route.best.gain);
  var head;
  if (win) {
    head = '留卡 ' + win + '　（净增幅 ' + (wc.route.best.gain >= 0 ? '+' : '−') + fmt(Math.abs(wc.route.best.gain), 1)
         + '%　比另一张高 ' + fmt(Math.abs(diff), 1) + ' 点）';
  } else {
    head = '两张基本等价（差 ' + fmt(Math.abs(diff), 1) + ' 点）';
  }
  h += '<div class="verdict"><div class="head">' + esc(head) + '<span class="gr">' + esc(gd.g + ' ' + RR.gradeNameOf(gd.g, langIx())) + '</span></div>';
  h += '<div style="font-size:12.5px;color:var(--zkc-muted)">A：' + esc(RR.archNameOf(cA.route.best.id, langIx())) + ' ' + fmt(ga, 1) + '%　|　B：'
     + esc(RR.archNameOf(cB.route.best.id, langIx())) + ' ' + fmt(gb, 1) + '%　（' + esc(tgtLabel()) + ' 口径）</div>';
  h += '<ul style="font-size:12.5px">';
  function worstPos(c) {
    var worst = null;
    c.contrib.forEach(function (x) {
      if (x.v < 0) return;
      var cap = RR.statCap(c.ew, x.k, 1, c.tier);
      if (!cap) return;
      var pos = Math.abs(x.v) / cap * 100;
      if (!worst || pos < worst.pos) worst = { n: x.k ? RR.statNameOf(x.k, langIx()) : x.n, pos: pos };
    });
    return worst;
  }
  if (win) {
    var wa = worstPos(wc);
    h += '<li><b>留下的这张</b>：' + esc(RR.archNameOf(wc.route.best.id, langIx())) + ' 口径下 ' + wc.nPos + ' 正 ' + wc.nNeg + ' 负，'
       + (wa ? '最不满的一条是「' + esc(wa.n) + '」只占该档上限 ' + fmt(wa.pos, 1) + '%，这是唯一的提升空间。' : '各条都已接近上限。')
       + '</li>';
    var lw = worstPos(lc);
    h += '<li><b>丢掉的那张</b>：净增幅低 ' + fmt(Math.abs(diff), 1) + ' 点'
       + (lw ? '；它的短板是「' + esc(lw.n) + '」只能到 ' + fmt(lw.pos, 1) + '%。' : '。') + '</li>';
  } else {
    h += '<li>净增幅差距 ' + fmt(Math.abs(diff), 1) + ' 点，属于同档波动，<b>按词条实用性挑</b>：负面压到的属性有没有实际影响、以及哪张更贴近你要玩的那个流派。</li>';
  }
  var negA = cA.contrib.filter(function (x) { return x.v < 0; })[0];
  var negB = cB.contrib.filter(function (x) { return x.v < 0; })[0];
  if (negA || negB) {
    function costOf(x) { return -x.delta; }
    function costTxt(x) { return costOf(x) > 0.5 ? '损失 ' + fmt(costOf(x), 1) + ' 点' : '零成本'; }
    var line = '<li><b>负面成本</b>：';
    if (negA) line += 'A 的「' + esc(negA.n) + '」' + costTxt(negA);
    if (negA && negB) line += '；';
    if (negB) line += 'B 的「' + esc(negB.n) + '」' + costTxt(negB);
    h += line + '。'
       + (negA && negB && (costOf(negA) > 0.5) !== (costOf(negB) > 0.5)
          ? '两边负面成本不同，这一项应当压过净增幅的小差距。' : '')
       + '</li>';
  }
  h += '<li><b>继续洗的期望</b>：'
     + (win ? '现在这张已经站到该形状（' + wc.nPos + ' 正 ' + wc.nNeg + ' 负）的高位。若要再洗，目标只有一个 —— 把最不满的那条顶上去；'
            + '但重洗会整卡重掷，已顶格的条目会一起丢，期望上是亏的。'
          : '两张都还没顶满，继续洗有正期望，但记住重洗整卡重掷。')
     + '</li>';
  h += '</ul></div></div>';
  return h;
}
var ASM = window.ZKASM || null;
var ASM_W = null;
var ASMS = window.RULES.ZK_ASMS;
var KIT_LD_P = window.RULES.ZK_KIT_LD_P;
var ZK_DMG_CN = window.RULES.ZK_DMG_LABEL;
var ZTYPES = window.RULES.ZK_ZTYPES;
var KTYPES = window.RULES.ZK_KTYPES;
function asmCamel(s) {
  var w = String(s == null ? '' : s).replace(/\(.*?\)/g, ' ')
           .replace(/[^A-Za-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
  return w.map(function (x, i) {
    var l = x.toLowerCase();
    return i ? l.charAt(0).toUpperCase() + l.slice(1) : l;
  }).join('');
}
function anm(id) {
  var a = ASM && ASM.n && ASM.n[id];
  return a ? (a[langIx()] || a[1] || a[2] || a[0] || id) : id;
}
function asmFind(list, id) { return ZKC.asmFind(list, id); }
function ldSide(x) { return ZKC.ldSide(x); }
function ldList(sd) { return ASM.kit.l.filter(function (x) { return ldSide(x) === sd; }); }
function asmSide() { return ASMS.side === 's' ? 's' : 'p'; }
function asmKindOf(w) {
  if (!ASM || !w) return '';
  if (ZKC.isLich(w)) return 'lich';
  var ci = asmCamel(w.en || w.intl || '');
  if (!ci) return '';
  if (ASM.kit.c.some(function (x) { return x.i === ci; })) return 'kit';
  if (ASM.zaw.s.some(function (x) { return x.i === ci; })) return 'zaw';
  return '';
}
function kitRowsMap() {
  if (kitRowsMap._m) return kitRowsMap._m;
  var m = {};
  WEAPONS.forEach(function (z, i) {
    var mm = /^(.+?)\s*\((Primary|Secondary)\)\s*$/i.exec(String(z.en || ''));
    if (!mm) return;
    var id = asmCamel(mm[1]);
    if (!id) return;
    (m[id] = m[id] || {})[mm[2].toLowerCase() === 'primary' ? 'p' : 's'] = i;
  });
  kitRowsMap._m = m;
  return m;
}
function zawRowsMap() {
  if (zawRowsMap._m) return zawRowsMap._m;
  var m = {};
  WEAPONS.forEach(function (z, i) {
    var ci = asmCamel(z.en || '');
    if (ci && ASM.zaw.s.some(function (x) { return x.i === ci; })) m[ci] = i;
  });
  zawRowsMap._m = m;
  return m;
}
function syncAsm(w, kind) {
  if (kind === 'lich') { ASMS.kind = 'lich'; ASMS.src = 'lich'; return; }
  var sig = kind + '|' + (w ? (w.en || w.cn || '') : '');
  if (ASMS.kind === kind && ASMS.src === sig) return;
  var same = (ASMS.kind === kind);
  ASMS.kind = kind; ASMS.src = sig;
  if (kind === 'zaw') {
    var st = asmFind(ASM.zaw.s, asmCamel(w.en || '')) || ASM.zaw.s[0];
    ASMS.strike = st.i;
    if (!same || !asmFind(ASM.zaw.g, ASMS.zgrip)) ASMS.zgrip = ASM.zaw.g[0].i;
    if (!same || !asmFind(ASM.zaw.l, ASMS.zlink)) ASMS.zlink = ASM.zaw.l[0].i;
    if (st.i === 'balla' && ASMS.zlink === ASM.zaw.l[0].i) {
      ASMS.zlink = (asmFind(ASM.zaw.l, 'vargeetIiJai') || ASM.zaw.l[0]).i;
    }
    return;
  }
  var side = /\(Secondary\)/i.test(String(w.en || '')) ? 's' : 'p';
  var flip = (ASMS.side !== side);
  ASMS.side = side;
  ASMS.chamber = asmCamel(w.en || '');
  var g0 = asmFind(ASM.kit.g, ASMS.kgrip);
  if (flip || !g0 || (g0.t === 'Secondary') !== (side === 's')) {
    var g = ASM.kit.g.filter(function (x) { return (x.t === 'Secondary') === (side === 's'); })[0];
    ASMS.kgrip = (g || ASM.kit.g[0]).i;
  }
  var l0 = asmFind(ASM.kit.l, ASMS.kloader);
  if (flip || !l0 || ldSide(l0) !== side) ASMS.kloader = (ldList(side)[0] || ASM.kit.l[0]).i;
}
function buildZaw() {
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
  return {
    i: 'asm:zaw:' + st.i + ':' + gp.i + ':' + lk.i,
    n: st.n, z: anm(st.i), s: 'm', c: 'melee', mr: 0, dp: ZKC.disp(), rf: st.n, tr: [],
    co: 'additive_with_base_damage',
    at: { cc: (10 + st.c + lk.c) / 100, cd: (st.ix === 'A' ? 2.2 : 2),
          sc: (10 + st.st + lk.st) / 100, ms: 1,
          fr: +((60 + st.s + gp.s + lk.s) / 60).toFixed(3),
          dmg: dm, pt: 0, rng: mod.g, ft: 0.6, hv: { m: 6, w: 0.3667 } },
    cdur: 5, fl: ['block', 'block_forward', 'forward', 'heavy', 'slide']
  };
}
function buildKit() {
  var ci = 0, ch = asmFind(ASM.kit.c, ASMS.chamber) || ASM.kit.c[0];
  ASM.kit.c.forEach(function (x, i) { if (x.i === ch.i) ci = i; });
  var gp = asmFind(ASM.kit.g, ASMS.kgrip) || ASM.kit.g[0];
  var seco = (asmSide() === 's');
  var ld = asmFind(ASM.kit.l, ASMS.kloader);
  if (!ld || ldSide(ld) !== asmSide()) { ld = ldList(asmSide())[0] || ASM.kit.l[0]; ASMS.kloader = ld.i; }
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
  var isShot = (ch.n === 'Catchmoon' || ch.n === 'Sporelacer') && !seco;
  return {
    i: 'asm:kit:' + ch.i + ':' + gp.i + ':' + ld.i,
    n: ch.n, z: anm(ch.i), s: seco ? 's' : 'p',
    c: seco ? 'pistol' : (isShot ? 'shotgun' : 'rifle'), mr: 0, dp: ZKC.disp(), rf: ch.n, tr: [],
    co: 'additive_with_base_damage',
    at: { cc: +cc.toFixed(3), cd: +cd.toFixed(2), sc: +sc.toFixed(3), ms: 1,
          fr: +(gp.f[ci] / 60).toFixed(3), dmg: dm, pt: 0, rng: 300 },
    mag: ch.mag[ld.mi] || ch.mag[0], rel: +rel.toFixed(2), ammo: 210
  };
}
function asmSummary(w) {
  var dm = w.at.dmg, tot = 0, parts = [];
  for (var k in dm) if (Object.prototype.hasOwnProperty.call(dm, k)) tot += dm[k];
  ['impact','puncture','slash','heat','cold','electricity','toxin','blast','radiation','gas',
   'magnetic','viral','corrosive','void'].forEach(function (k) {
    if (dm[k]) parts.push(ZK_DMG_CN[k] + ' ' + fmt(dm[k], 1));
  });
  var bits = ['基础伤害 <b>' + fmt(tot, 1) + '</b>（' + parts.join(' · ') + '）',
    (w.s === 'm' ? '攻击速度 <b>' : '射速 <b>') + fmt(w.at.fr, 2) + '</b>',
    '暴击 <b>' + fmt(w.at.cc * 100, 1) + '%</b> ×' + fmt(w.at.cd, 2),
    '触发 <b>' + fmt(w.at.sc * 100, 1) + '%</b>'];
  if (w.s === 'm') bits.push('范围 <b>' + fmt(w.at.rng, 1) + ' m</b>');
  else bits.push('弹匣 <b>' + (w.mag || '∞') + '</b> · 装填 <b>' + fmt(w.rel, 2) + 's</b>');
  return bits.join('　·　');
}
function asmRow(lab, key, list) {
  var cur = ASMS[key] || (list[0] && list[0].i);
  return '<div class="g-asmrow"><label>' + esc(lab) + '</label>'
    + '<select data-ak="' + key + '">' + list.map(function (x) {
        var nm = anm(x.i);
        var suf = (langIx() === 2 || !x.n || x.n === nm) ? '' : (' · ' + x.n);
        return '<option value="' + x.i + '"' + (x.i === cur ? ' selected' : '') + '>'
             + esc(nm + suf) + '</option>';
      }).join('') + '</select></div>';
}
function renderAsm() {
  var host = $('asmbox');
  if (!host) return;
  var w = WEAPONS[WIDX];
  var kind = asmKindOf(w);
  if (!ASM || !kind) {
    ASM_W = null; ASMS.kind = '';
    host.hidden = true; host.innerHTML = '';
    return;
  }
  host.hidden = false;
  if (kind === 'lich') {
    var lel = ZKC.lichEl(ASMS.elem5), ll = langIx();
    var lh = '<div class="asm-h">玄骸武器（赤毒 / 信条 / 终幕）—— 额外元素固定 ' + ZKC.LICH_PCT +
      '%，装上去就当自带元素，最后参加反应</div>';
    lh += '<div class="g-asmrow"><label>额外元素</label><select data-ak="elem">' +
      ZKC.LICH_EL.map(function (ek) {
        var lab = (window.RULES.ZK_DMG_CN[ek] || [ek, ek, ek])[ll] || ek;
        return '<option value="' + ek + '"' + (ek === lel ? ' selected' : '') + '>' +
          esc(lab) + '</option>';
      }).join('') + '</select></div>';
    ASM_W = WMAP[WIDX] ? ZKC.lichAdd(WMAP[WIDX], lel) : null;
    if (ASM_W) lh += '<div class="asm-sum">' + asmSummary(ASM_W) + '</div>';
    host.innerHTML = lh;
    Array.prototype.forEach.call(host.querySelectorAll('select'), function (el) {
      el.addEventListener('change', function () {
        ASMS.elem5 = el.value;
        onWeaponChanged();
      });
    });
    return;
  }
  syncAsm(w, kind);
  var h = '<div class="asm-h">' + (kind === 'zaw' ? 'Zaw（刀刃 / 握柄 / 链接）' : '组合枪（枪膛 / 握把 / 装填器）')
        + ' —— 改任意一件立刻重组并重算</div>';
  if (kind === 'zaw') {
    h += asmRow('刀刃', 'strike', ASM.zaw.s) + asmRow('握柄', 'zgrip', ASM.zaw.g) + asmRow('链接', 'zlink', ASM.zaw.l);
    ASM_W = buildZaw();
  } else {
    var sideSel = '<div class="g-asmrow"><label>手性</label><select data-ak="side">'
      + '<option value="p"' + (asmSide() === 'p' ? ' selected' : '') + '>主手</option>'
      + '<option value="s"' + (asmSide() === 's' ? ' selected' : '') + '>副手</option></select></div>';
    h += asmRow('枪膛', 'chamber', ASM.kit.c) + sideSel
       + asmRow('握把', 'kgrip', ASM.kit.g.filter(function (x) { return (x.t === 'Secondary') === (asmSide() === 's'); }))
       + asmRow('装填器', 'kloader', ldList(asmSide()));
    ASM_W = buildKit();
  }
  h += '<div class="asm-sum">' + asmSummary(ASM_W) + '</div>';
  host.innerHTML = h;
  Array.prototype.forEach.call(host.querySelectorAll('select'), function (el) {
    el.addEventListener('change', function () {
      var key = el.getAttribute('data-ak');
      var v = el.value;
      if (key === 'side') {
        ASMS.side = v;
        var row = kitRowsMap()[ASMS.chamber];
        if (row && row[v] != null) { WIDX = row[v]; $('wq').value = weaponLabel(WEAPONS[WIDX]); WIDX_FROM = 'user'; }
      } else if (key === 'chamber') {
        ASMS.chamber = v;
        var r2 = kitRowsMap()[v];
        if (r2 && r2[asmSide()] != null) { WIDX = r2[asmSide()]; $('wq').value = weaponLabel(WEAPONS[WIDX]); WIDX_FROM = 'user'; }
        else if (r2) { ASMS.side = (r2.p != null ? 'p' : 's'); WIDX = r2[ASMS.side]; $('wq').value = weaponLabel(WEAPONS[WIDX]); WIDX_FROM = 'user'; }
      } else if (key === 'strike') {
        ASMS.strike = v;
        var zr = zawRowsMap()[v];
        if (zr != null) { WIDX = zr; $('wq').value = weaponLabel(WEAPONS[WIDX]); WIDX_FROM = 'user'; }
      } else {
        ASMS[key] = v;
      }
      onWeaponChanged();
    });
  });
}
function onWeaponChanged() {
  if (window.ZKSGW && WIDX >= 0) window.ZKSGW(WEAPONS[WIDX]);
  renderAsm();
  buildCatalog();
  refreshSelects('A'); refreshSelects('B');
  renderSlots(); renderArc(); renderCap();
  renderModList();
  renderBasic();
  refresh();
}
var MODS = window.ZKMODS || [];
var ARCS = window.ZKARCS || [];
var SETS = window.ZKSETS || [];
var MODBY = {}, ARCBY = {}, SETBY = {}, MODBYN = {};
MODS.forEach(function (m) { MODBY[m.i] = m; if (m.n) MODBYN[String(m.n).toLowerCase()] = m; });
ARCS.forEach(function (a) { ARCBY[a.i] = a; });
SETS.forEach(function (s) { SETBY[s.i] = s; });
var NSLOT = 9;
var SLOTS = [null, null, null, null, null, null, null, null, null];
var POLS = ['', '', '', '', '', '', '', '', ''];
var RIVEN_SLOT = 7;
var EXILUS_SLOT = 8;
var RIVEN_SIDE = null;
var RIVEN_DRAIN = 18;
var RIVEN_OFF = false;
var SLOT_LAYERS = [null, null, null, null, null, null, null, null, null];
var ARC = {};
var ARC_LAYERS = {};
function arcMaxLayers(a) {
  var mx = 0;
  (a && a.p || []).forEach(function (kv) { if (kv.length > 2) mx = Math.max(mx, +kv[2] || 1); });
  (a && a.bg || []).forEach(function (b) { if (b.k === 'sb') mx = Math.max(mx, +b.st || 1); });
  return mx;
}
function arcLayersOf(a) {
  if (!a) return 0;
  if (ARC_LAYERS[a.i] != null) return ARC_LAYERS[a.i];
  var mx = arcMaxLayers(a);
  return mx > 1 ? mx : 0;
}
function arcLayers(role) { return arcLayersOf(ARCBY[ARC[role]]); }
var LAST_EX = {};
var PICK = null;
var CAP_MAX = 60;
function capMax() { return CAP_MAX + ((RR.stanceCapBonus) ? RR.stanceCapBonus() : 0); }
var POOL_CN = ZKMB.POOL_CN;
function modPoolsOf(ew) {
  if (!ew) return null;
  var s = ew.s, c = ew.c || '';
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
function curPools() {
  var ew = engineWeapon();
  if (ew) { var p = modPoolsOf(ew); if (p) return p; }
  var w = WEAPONS[WIDX], cat = w ? (w.cat || '') : '';
  if (cat === '近战') return ['melee'];
  if (cat === '手枪') return ['pistol'];
  if (cat === '霰弹') return ['primary', 'shotgun'];
  if (cat === '步枪') return ['primary', 'rifle', 'assault_rifle'];
  if (cat === '曲翼') return ['archgun'];
  return null;
}
function modOK(m, si) {
  if (!m) return false;
  var isExi = (si === EXILUS_SLOT);
  var ew = engineWeapon();
  var wid = (ew && ew.i) || '';
  var pools = curPools();
  if (!pools) {
    if (m.x) return false;
    return m.s === curSlot();
  }
  return ZKMB.legal(m, pools, wid, isExi);
}
function poolMain(pools) { return ZKMB.poolMain(pools); }
function weaponClassCN() {
  var ew = engineWeapon();
  if (ew) {
    if (ew.i && String(ew.i).indexOf('asm:zaw') === 0) return 'Zaw（自制近战）';
    if (ew.s === 'a') return '曲翼';
    if (ew.s === 'm' || ew.s === 'e') return '近战';
    if (ew.s === 's') return '手枪';
    if (ew.s === 'p') {
      if (ew.c === 'shotgun') return '霰弹';
      if (ew.c === 'sniper') return '狙击枪';
      if (ew.c === 'bow' || ew.c === 'crossbow') return '弓';
      if (String(ew.i || '').indexOf('asm:kit') === 0) return '组合枪';
      return '步枪';
    }
  }
  var w = WEAPONS[WIDX];
  return w ? (w.cat || '') : '';
}
var PKTABS = ZKMB.PKTABS;
var PKTAB = 'fast';
var FAST_CN = ZKMB.FAST_CN;
var FAST = ZKMB.FAST;
function fastKind() {
  var ew = engineWeapon();
  var s = ew ? ew.s : '', cat = WEAPONS[WIDX] ? (WEAPONS[WIDX].cat || '') : '';
  if (s === 'a' || cat === '曲翼') return 'ArchGun';
  if (s === 'm' || s === 'e' || cat === '近战') return 'Melee';
  if (s === 's' || cat === '手枪') return 'Secondary';
  if (s === 'p' && ew.c === 'shotgun') return 'Shotgun';
  if (cat === '霰弹') return 'Shotgun';
  return 'Rifle';
}
var CATK = ZKMB.CATK;
function catOK(m, cat) { return ZKMB.catOK(m, cat); }
var POL_ORDER = ['', 'r', '-', 'd', '=', 'w', 'o'];
var POL_INFO = window.RULES.ZK_POL_INFO;
var POL_CN = { '': '无极性', r: '马杜莱', '-': '纳拉蒙', d: '瓦萨林', '=': '泽努里', w: '乌奈鲁', o: '万用' };
var RAR_CN = ZKMB.RAR_CN;
var MKEY = ZKMB.MKEY;
var MUNIT = ZKMB.MUNIT;
function modUnit(k) { return ZKMB.modUnit(k); }
function polTxt(p) {
  if (langIx() === 2) {
    if (!p) return 'No Polarity';
    var pi = POL_INFO[p];
    return (pi && pi.en) ? pi.en : p;
  }
  return POL_CN[p] || '无极性';
}
function polGlyph(p) { return p || '·'; }
function rarOf(m) { return ZKMB.rarOf(m); }
function curSlot() {
  if (ASM_W) return ASM_W.s === 'm' ? 'm' : 'g';
  var w = WEAPONS[WIDX];
  if (!w) return 'g';
  if (w.cat === '近战') return 'm';
  var ew = WMAP[WIDX];
  return (ew && (ew.s === 'a' || ew.s === 'w')) ? ew.s : 'g';
}
function modCost(m, pol) {
  var c = (+m.d || 0) + (+m.f || 0);
  if (!pol) return c;
  return (pol === 'o' || pol === m.y) ? Math.round(c / 2) : Math.round(c * 1.25);
}
function mkeyOf(o, k) { return ZKMB.mkeyOf(o, k); }
function isStackKV(o, kv) { return ZKMB.isStackKV(o, kv); }
function propLine(o) { return ZKMB.propLine(o); }
function arcVal(kv) { return +kv[1] * (kv.length > 2 ? (+kv[2] || 1) : 1); }
function propValOf(m, kv, layers) {
  if (isStackKV(m, kv)) return +kv[1] * Math.max(0, Math.min(+layers || 0, +kv[2] || 1));
  return arcVal(kv);
}
function propLineAll(o) { return ZKMB.propLineAll(o); }
function modMaxLayers(m) {
  var mx = 0;
  (m.p || []).forEach(function (kv) { if (kv.length > 2) mx = Math.max(mx, +kv[2] || 1); });
  (m.bg || []).forEach(function (b) { if (b.k === 'sb') mx = Math.max(mx, +b.st || 1); });
  return mx;
}
function slotLayers(i) {
  var m = SLOTS[i] ? MODBY[SLOTS[i]] : null;
  if (!m) return 0;
  if (SLOT_LAYERS[i] != null) return SLOT_LAYERS[i];
  var mx = modMaxLayers(m);
  return mx > 1 ? mx : 0;
}
function liveMods() {
  var out = [];
  for (var i = 0; i < NSLOT; i++) {
    if (i === RIVEN_SLOT && !RIVEN_OFF) continue;
    var m = SLOTS[i] ? MODBY[SLOTS[i]] : null;
    if (m && modOK(m, i)) out.push(m);
  }
  return out;
}
var TRIG_CN = ZKMB.TRIG_CN;
var COND_CN = ZKMB.COND_CN;
function condLabel(m) { return ZKMB.condLabel(m); }
var ARC_PANEL_KEYS = { dmg:1, cc:1, cd:1, ms:1, sc:1, rel:1, mag:1, frate:1,
  range:1, punch:1, combo:1, corrosive:1, fac:1, xh:1, ccFlat:1, cdFlat:1 };
var MECH_CN = {
  status_spread: '状态扩散', debilitate: '复合异常拆分', proc_burst: '连锁挂状态',
  proc_conversion: '触发转化', aoe_echo: '溅射回声', duplicate_on_base_crit: '暴击复制',
  damage_vs_frozen: '冻伤加成', per_status_damage_bonus: '每状态加伤',
  overguard_damage_bonus: '超护盾加伤', overguard_on_damage: '受击超护盾',
  compression_damage: '压缩加伤', compression_ammo_efficiency: '压缩弹药',
  tenno_scaled: '随段位缩放', headshot_multiplier_bonus: '爆头倍率',
  flat_damage_on_status: '状态平伤', rechargeable_magazine: '可充能弹匣',
  ammo_efficiency: '弹药效率', added_element: '附加元素',
  heavy_crit_per_input: '重击暴击', unmodelled: '未建模', out_of_scope: '超出范围',
  combo_gain: '连击获得', energy_regen: '能量回复', lifesteal: '生命偷取',
  status_burst: '状态爆发', enemy_pull: '拉拽',
  projectile_attack: '投射物', suspend_wave: '悬空波'
};
function arcMech(a) {
  var m = null, fb = null;
  (a.bg || []).forEach(function (b) {
    if (b.k === 'mech') {
      if (b.mk === 'unmodelled' || b.mk === 'out_of_scope') { if (!fb) fb = b.mk; }
      else if (!m) m = b.mk;
    } else if (b.k === 'buff' && !fb) fb = 'buff';
  });
  return m || fb;
}
function arcClass(a) {
  var panelP = (a.p || []).some(function (kv) { return ARC_PANEL_KEYS[kv[0]]; });
  if (panelP) return 'modeled';
  var hasMech = (a.bg || []).some(function (b) { return b.k === 'mech' || b.k === 'buff'; });
  if (hasMech) return 'mech';
  if (a.bg && a.bg.length) return 'nonpanel';
  return 'utility';
}
function arcClassLabel(a) {
  var c = arcClass(a);
  if (c === 'modeled') {
    if ((a.bg || []).some(function (b) { return b.k === 'asm'; })) return '实装 · 条件按满足计';
    return (a.bg && a.bg.length) ? '实装 · 满层（触发型乐观）' : '实装 · 常驻满层';
  }
  if (c === 'mech') {
    var mk = arcMech(a);
    if (mk === 'status_spread') return '机制型 · 状态扩散（侵染流派核心 · 本工具不计入面板）';
    if (mk === 'unmodelled') return '不计入 · 未建模';
    if (mk === 'out_of_scope') return '不计入 · 超出范围';
    if (mk === 'buff') return '机制型 · 触发型（本工具不计入面板）';
    var nm = MECH_CN[mk] || mk;
    return '机制型 · ' + nm + '（本工具不计入面板）';
  }
  if (!a.de) return '未收录 · 无数据';
  return '不计入 · 纯功能型';
}
function modCondStat(m) { return ZKMB.condStat(m); }
function weaponArcRoles() {
  var ew = engineWeapon();
  if (ew) {
    var i = String(ew.i || '');
    if (i.indexOf('asm:kit') === 0) return ['次要武器', '组合枪'];
    if (i.indexOf('asm:zaw') === 0) return ['近战', '天工造武'];
    if (ew.s === 'a') return ['主要武器', '次要武器'];
    if (ew.s === 'm' || ew.s === 'e') return ['近战'];
    if (ew.s === 's') return ['次要武器'];
    if (ew.s === 'p') return ['主要武器'];
  }
  var cat = WEAPONS[WIDX] ? (WEAPONS[WIDX].cat || '') : '';
  if (cat === '近战') return ['近战'];
  if (cat === '手枪') return ['次要武器'];
  if (cat === '曲翼') return ['主要武器', '次要武器'];
  if (cat === '步枪' || cat === '霰弹') return ['主要武器'];
  return [];
}
function arcOk(a) {
  if (a.t === '任意武器') return true;
  return weaponArcRoles().indexOf(a.t) >= 0;
}
function activeExtras() {
  var slot = curSlot(), o = {};
  var scnt = setCounts();
  var add = function (arr, owner, layers, smul) {
    (arr || []).forEach(function (kv) {
      var k = mkeyOf(owner, kv[0]);
      if (k === 'fac' && !facOK(owner)) return;
      o[k] = (o[k] || 0) + propValOf(owner, kv, layers) * (smul || 1);
    });
  };
  for (var i = 0; i < NSLOT; i++) {
    if (i === RIVEN_SLOT && !RIVEN_OFF) continue;
    var m = SLOTS[i] ? MODBY[SLOTS[i]] : null;
    if (m && modOK(m, i)) add(m.p, m, slotLayers(i), setSelfMul(m, scnt));
  }
  weaponArcRoles().forEach(function (role) {
    var id = ARC[role];
    var a = id ? ARCBY[id] : null;
    if (a && (a.t === role || a.t === '任意武器')) add(a.p, a, arcLayers(role));
  });
  var sbk = setBonusBuckets(scnt);
  for (var sb in sbk) if (Object.prototype.hasOwnProperty.call(sbk, sb)) o[sb] = (o[sb] || 0) + sbk[sb];
  EXKEYS.forEach(function (k) {
    if (+ADV[k]) o[k] = (o[k] || 0) + (+ADV[k]);
  });
  if (RR && RR.setExtraMods) RR.setExtraMods(o, true);
  if (RR && RR.setElemOrder) {
    var eorder = [];
    for (var ei = 0; ei < NSLOT; ei++) {
      if (ei === RIVEN_SLOT) continue;
      var em = SLOTS[ei] ? MODBY[SLOTS[ei]] : null;
      if (!em || !modOK(em, ei)) continue;
      (em.p || []).forEach(function (kv) {
        var ek = mkeyOf(em, kv[0]);
        if (ek === 'heat' || ek === 'cold' || ek === 'electric' || ek === 'toxin') eorder.push(ek);
      });
    }
    RR.setElemOrder(eorder);
  }
  LAST_EX = o;
  return o;
}
var SETKIND = ZKMB.SETKIND;
function setPerCap(s, n) { return ZKMB.setPerCap(s, n); }
function setBonusBuckets(cnt) {
  var o = {};
  SETS.forEach(function (s) {
    var n = (cnt && cnt[s.i]) || 0;
    if (!n) return;
    if (s.k === 'crit_chance_per_combo') o.br = (o.br || 0) + setPerCap(s, n);
    else if (s.k === 'crit_tier_upgrade_chance') o.tu = (o.tu || 0) + setPerCap(s, n);
  });
  return o;
}
function countSets(ids) {
  var c = {}, seen = {};
  (ids || []).forEach(function (id) {
    var m = MODBY[id];
    if (!m || !m.st || seen[id]) return;
    seen[id] = 1;
    c[m.st] = Math.min(6, (c[m.st] || 0) + 1);
  });
  return c;
}
function setBonusText(s, n) { return ZKMB.setBonusText(s, n); }
function setCounts() {
  return countSets(liveMods().map(function (m) { return m.i; }));
}
function setSelfMul(m, cnt) {
  var s = m && m.st ? SETBY[m.st] : null;
  if (!s || s.k !== 'enhances_own_mods') return 1;
  var n = (cnt && cnt[m.st]) || 0;
  if (n < 2) return 1;
  return 1 + (+s.per || 0) / 100 * (n - 1);
}
function moveRiven(to) {
  var lim = NSLOT - 1;
  to = ((to % lim) + lim) % lim;
  if (to === RIVEN_SLOT) return;
  var mods = [];
  for (var i = 0; i < NSLOT; i++) {
    if (i === EXILUS_SLOT || i === RIVEN_SLOT) continue;
    if (SLOTS[i]) mods.push({ id: SLOTS[i], pol: POLS[i], lay: SLOT_LAYERS[i] });
  }
  for (var j = 0; j < NSLOT; j++) {
    if (j === EXILUS_SLOT || j === RIVEN_SLOT) continue;
    SLOTS[j] = null; POLS[j] = ''; SLOT_LAYERS[j] = null;
  }
  RIVEN_SLOT = to;
  var k = 0;
  for (var m = 0; m < NSLOT; m++) {
    if (m === EXILUS_SLOT || m === RIVEN_SLOT) continue;
    if (k < mods.length) { SLOTS[m] = mods[k].id; POLS[m] = mods[k].pol; SLOT_LAYERS[m] = mods[k].lay; k++; }
  }
  renderSlots(); renderArc(); renderCap(); refresh();
}
function rivenSlotHTML() {
  var side = RIVEN_SIDE, c = side ? CACHE[side] : null;
  var has = c && c.ok && c.card;
  var NO = '<span class="mbsno">' + (RIVEN_SLOT + 1) + '</span>';
  if (!has) {
    return ZKMB.rivenSlot({
      no: RIVEN_SLOT + 1, polGlyph: polGlyph('r'), polText: polTxt(POLS[RIVEN_SLOT]),
      cost: RIVEN_DRAIN, polCls: '', name: '紫卡', sub: '未选卡面 A / B',
      empty: true, polKey: RIVEN_SLOT
    }).replace('data-mbr="1"', 'data-mbr="1" data-si="' + RIVEN_SLOT + '" data-kind="riven"');
  }
  var rk = +(c.card.rank != null ? c.card.rank : 8);
  var cost = Math.round(RIVEN_DRAIN * (POLS[RIVEN_SLOT] ? ((POLS[RIVEN_SLOT] === 'o' || POLS[RIVEN_SLOT] === 'r') ? 0.5 : 1.25) : 1));
  var pc = !POLS[RIVEN_SLOT] ? '' : ((POLS[RIVEN_SLOT] === 'o' || POLS[RIVEN_SLOT] === 'r') ? ' np' : ' wp');
  return ZKMB.rivenSlot({
    no: RIVEN_SLOT + 1, polGlyph: polGlyph('r'), polText: polTxt(POLS[RIVEN_SLOT]),
    cost: cost, polCls: pc, name: '紫卡 · ' + side + ' 面', removable: false,
    sub: (c.card.weapon ? NM(c.card.weapon) : '') + ' 紫卡 · 等级 ' + rk + ' · 占 1 个 MOD 槽',
    polKey: RIVEN_SLOT
  }).replace('data-mbr="1"', 'data-mbr="1" data-si="' + RIVEN_SLOT + '" data-kind="riven"');
}
function renderSlots() {
  var H = { mod: '', exi: '' };
  for (var i = 0; i < NSLOT; i++) {
    if (i === RIVEN_SLOT && !RIVEN_OFF) { H.mod += rivenSlotHTML(); continue; }
    var m = SLOTS[i] ? MODBY[SLOTS[i]] : null;
    var isExi = (i === EXILUS_SLOT);
    var NO = isExi ? '' : '<span class="mbsno">' + (i + 1) + '</span>';
    if (!m) {
      H[isExi ? 'exi' : 'mod'] += (isExi
        ? ZKMB.exilSlot({ empty: true, polText: polTxt(POLS[i]) }).replace('data-mbe="1"', 'data-mbe="1" data-si="' + i + '"')
        : ZKMB.modSlot({ empty: true, no: i + 1, polKey: i, polText: polTxt(POLS[i]) }))
        .replace('data-mbs="' + i + '"', 'data-mbs="' + i + '" data-si="' + i + '"');
      continue;
    }
    var off = !modOK(m, i);
    var cost = modCost(m, POLS[i]);
    var pc = !POLS[i] ? '' : ((POLS[i] === 'o' || POLS[i] === m.y) ? ' np' : ' wp');
    var _mx = modMaxLayers(m);
    var _cur = _mx > 1 ? slotLayers(i) : 0;
    var _props = propLine(m);
    var _cond = condLabel(m);
    var _cs = modCondStat(m);
    if (_cs && _cs.length) _cond = _cond ? _cond + '；' + _cs.join('；') : _cs.join('；');
    H[isExi ? 'exi' : 'mod'] += (isExi
      ? ZKMB.exilSlot({ name: NM(m), polGlyph: polGlyph(m.y), polText: polTxt(POLS[i]),
                        cost: cost, polCls: pc, props: _props, cond: _cond })
          .replace('data-mbe="1"', 'data-mbe="1" data-si="' + i + '"')
      : ZKMB.modSlot({ no: i + 1, cls: rarOf(m), name: NM(m), polGlyph: polGlyph(m.y),
                       polText: polTxt(POLS[i]), cost: cost, polCls: pc, props: _props,
                       cond: _cond, desc: ND(m),
                       layers: _mx > 1 ? { cur: _cur, max: _mx } : null,
                       off: off, polKey: i }))
      .replace('data-mbs="' + i + '"', 'data-mbs="' + i + '" data-si="' + i + '"');
  }
  $('slots').innerHTML = H.mod;
  bindSlots($('slots'), 'mod');
  $('sexil').innerHTML = H.exi;
  bindSlots($('sexil'), 'mod');
}
function layerHTML(m, si) {
  var max = modMaxLayers(m);
  if (max <= 1) return '';
  var cur = Math.max(0, Math.min(slotLayers(si), max));
  return '<span class="layerbox" data-layer="' + si + '" title="叠层型 · 默认吃满层数（可下调，步进器 − 到 0 即不计入）">'
       + '<button type="button" class="lbtn" data-ls="' + si + '" data-d="-1">−</button>'
       + '<b class="lcur">' + cur + '</b><span class="lmax">/' + max + '层</span>'
       + '<button type="button" class="lbtn" data-ls="' + si + '" data-d="1">+</button></span>';
}
function arcLayerHTML(a, role) {
  var max = arcMaxLayers(a);
  if (max <= 1) return '';
  var cur = Math.max(0, Math.min(arcLayers(role), max));
  return '<span class="layerbox" data-alayer="' + esc(role) + '" title="叠层型赋能 · 默认吃满层数（可下调，− 到 0 即不计入）">'
       + '<button type="button" class="lbtn" data-alr="' + esc(role) + '" data-d="-1">−</button>'
       + '<b class="lcur">' + cur + '</b><span class="lmax">/' + max + '层</span>'
       + '<button type="button" class="lbtn" data-alr="' + esc(role) + '" data-d="1">+</button></span>';
}
function renderArc() {
  var roles = weaponArcRoles();
  var h;
  if (!roles.length) {
    h = '<div class="buff-note">当前武器没有可用赋能（先选一把武器）。</div>';
  } else {
    h = '';
    roles.forEach(function (role, ri) {
      var id = ARC[role];
      var a = id ? ARCBY[id] : null;
      if (!a) {
        h += '<div class="buff-slot active" data-si="' + esc(role) + '" data-role="' + esc(role) + '">'
           + '<span class="plus">+</span>'
           + '<span class="buff-tgt" title="生效目标（点此选择赋能）">' + esc(role) + '</span></div>';
      } else {
        var off = !arcOk(a);
        h += '<div class="buff-slot' + (off ? ' off' : '') + '" data-si="' + esc(role) + '" data-role="' + esc(role) + '">'
          + '<div class="mod-title"><span class="mod-polarity" title="生效目标">' + esc(role) + '</span>'
          + esc(NM(a)) + '</div>'
          + '<div class="mod-detail"><div class="mod-stat">'
          + propLine(a).map(function (s) { return '<div class="mod-prop">' + esc(s) + '</div>'; }).join('')
          + (condLabel(a) ? '<div class="mod-cond">' + esc(condLabel(a)) + '</div>' : '')
          + (ND(a) ? '<div class="mod-desc">' + esc(ND(a)) + '</div>' : '')
          + (arcClass(a) === 'modeled'
              ? '<div class="arc-note ok">' + esc(arcClassLabel(a)) + '</div>'
              : '<div class="arc-note off">' + esc(arcClassLabel(a)) + '</div>')
          + '</div><div class="mod-action"><button class="mod-slot-remove" title="卸下">×</button></div></div>'
          + arcLayerHTML(a, role)
          + (off ? '<span class="offtag">不适用</span>' : '')
          + '</div>';
      }
    });
  }
  $('aslots').innerHTML = h;
  bindSlots($('aslots'), 'arc');
  var alb = $('arclab');
  if (alb) alb.textContent = roles.length ? ('生效目标：' + roles.join(' + ')) : '先选武器';
}
var STANCE_ID = 'auto';
var STANCE_OPEN = false;
var _stSig = '';
function meleeWeapon() {
  var ew = engineWeapon();
  return (ew && (ew.s === 'm' || ew.s === 'e')) ? ew : null;
}
function stanceList() {
  var w = meleeWeapon();
  return (w && RR && RR.stancesFor) ? RR.stancesFor(w) : [];
}
function curStanceId() {
  var l = stanceList();
  if (!l.length) return null;
  if (STANCE_ID === 'none') return null;
  if (STANCE_ID && STANCE_ID !== 'auto') {
    for (var i = 0; i < l.length; i++) if (l[i].i === STANCE_ID) return STANCE_ID;
  }
  return l[0].i;
}
function applyStance() {
  if (!RR || !RR.setStance) return;
  RR.setStance(curStanceId());
}
function renderStance() {
  var head = $('stancehead'), host = $('sslots'), box = $('stlistbox');
  if (!head || !host || !box) return;
  var w = meleeWeapon();
  if (!w) {
    if (head.style.display !== 'none') { head.style.display = 'none'; host.style.display = 'none'; }
    if (host.innerHTML) host.innerHTML = '';
    if (box.innerHTML) box.innerHTML = '';
    _stSig = '';
    return;
  }
  var l = stanceList(), cid = curStanceId(), cur = null, i;
  for (i = 0; i < l.length; i++) if (l[i].i === cid) cur = l[i];
  var sPol = (RR.stanceSlotPol) ? RR.stanceSlotPol() : 'r';
  var sBonus = (RR.stanceCapBonusOf) ? RR.stanceCapBonusOf(cur, sPol) : 0;
  var sig = w.i + '|' + (cid || '-') + '|' + STANCE_ID + '|' + STANCE_OPEN + '|' + l.length + '|' + sPol + '|' + sBonus;
  if (sig === _stSig) return;
  _stSig = sig;
  head.style.display = ''; host.style.display = '';
  var h = '';
  if (!l.length) {
    h = '<div class="buff-note">这一类武器在源数据里没有招式表，没有可装的架势卡。</div>';
  } else {
    h = '<div class="buff-slot st-slot" id="stslot" title="点这里换架势">'
      + '<div class="mod-title"><span class="mod-polarity">架势</span>' + esc(cur ? NM(cur) : '不装') + '</div>'
      + '<div class="mod-detail"><div class="mod-stat">'
      + (cur
          ? '<div class="mod-prop">平A 每招 ×' + fmt(cur.neutral.per, 2) + '</div>'
            + '<div class="mod-prop">连段 ' + fmt(cur.neutral.total, 1) + ' 倍 / ' + fmt(cur.neutral.secs, 2) + ' 秒</div>'
            + '<div class="mod-prop">容量上限 <b>+' + sBonus + '</b> · '
              + (sBonus >= 10 ? '极性相符 ×2' : '极性不符 −1') + '</div>'
          : '<div class="mod-prop">未装架势 · 平A 按 ×1.00 · 容量上限 +0</div>')
      + '</div></div>'
      + (cur ? '<div class="mod-action"><span class="slotpol" id="stslotpol" title="架式槽极化：点一下换一种（满级架式 +5，槽极性相符 ×2，不符 −1）">'
          + esc(polTxt(sPol)) + '</span>'
          + '<button class="mod-slot-remove" id="stclr" title="卸下架势">×</button></div>' : '')
      + '</div>';
  }
  host.innerHTML = h;
  var lo = '<div class="stlist"' + (STANCE_OPEN ? '' : ' hidden') + '>';
  lo += '<div class="st-o' + (STANCE_ID === 'auto' ? ' on' : '') + '" data-st="auto">'
      + '<span class="zn">自动（这一类最强）</span>'
      + '<span class="mv">' + (l.length ? '×' + fmt(l[0].neutral.per, 2) : '—') + '</span></div>';
  lo += '<div class="st-o' + (STANCE_ID === 'none' ? ' on' : '') + '" data-st="none">'
      + '<span class="zn">不装架势</span><span class="mv">×1.00</span></div>';
  l.forEach(function (s1) {
    lo += '<div class="st-o' + ((STANCE_ID !== 'auto' && s1.i === cid) ? ' on' : '') + '" data-st="' + esc(s1.i) + '">'
        + '<span class="zn">' + esc(NM(s1)) + '</span>'
        + '<span class="sub">' + esc(s1.cat) + '</span>'
        + '<span class="mv">×' + fmt(s1.neutral.per, 2) + ' · ' + fmt(s1.neutral.rate, 2) + '/s</span></div>';
  });
  lo += '</div>';
  box.innerHTML = l.length ? lo : '';
}
document.addEventListener('click', function (e) {
  var t = e.target;
  if (!t || !t.closest) return;
  if (t.closest('#stslotpol')) {
    var porder = ['r', '-', 'd', '=', 'w', 'o'];
    var cp = (RR.stanceSlotPol) ? RR.stanceSlotPol() : 'r';
    var np = porder[(porder.indexOf(cp) + 1) % porder.length];
    if (RR.setStanceSlotPol) RR.setStanceSlotPol(np);
    _stSig = '';
    renderStance(); renderCap(); refresh();
    return;
  }
  if (t.closest('#stslot')) {
    if (t.closest('#stclr')) { STANCE_ID = 'none'; }
    else { STANCE_OPEN = !STANCE_OPEN; }
    renderStance(); applyStance(); renderCap(); refresh();
    return;
  }
  var o = t.closest('.st-o');
  if (o) {
    STANCE_ID = o.getAttribute('data-st') || 'auto';
    STANCE_OPEN = false;
    renderStance(); applyStance(); renderCap(); refresh();
    return;
  }
  if (STANCE_OPEN && !t.closest('#stlistbox')) { STANCE_OPEN = false; renderStance(); }
});
function bindSlots(host, kind) {
  Array.prototype.forEach.call(host.querySelectorAll('.mbmove'), function (el) {
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      moveRiven(RIVEN_SLOT + 1);
    });
  });
  Array.prototype.forEach.call(host.querySelectorAll('.slotpol'), function (el) {
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      var i = +el.getAttribute('data-pol');
      POLS[i] = POL_ORDER[(POL_ORDER.indexOf(POLS[i]) + 1) % POL_ORDER.length];
      renderSlots(); renderCap(); refresh();
    });
  });
  Array.prototype.forEach.call(host.querySelectorAll('.lbtn'), function (el) {
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      var si = +el.getAttribute('data-ls'), d = +el.getAttribute('data-d');
      var m = SLOTS[si] ? MODBY[SLOTS[si]] : null;
      if (!m) return;
      var max = 0;
      (m.p || []).forEach(function (kv) { if (kv.length > 2) max = Math.max(max, +kv[2] || 1); });
      (m.bg || []).forEach(function (b) { if (b.k === 'sb') max = Math.max(max, +b.st || 1); });
      SLOT_LAYERS[si] = Math.max(0, Math.min(slotLayers(si) + d, max));
      renderSlots(); renderCap(); refresh();
    });
  });
  Array.prototype.forEach.call(host.querySelectorAll('.lbtn[data-alr]'), function (el) {
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      var role = el.getAttribute('data-alr'), d = +el.getAttribute('data-d');
      var a = ARCBY[ARC[role]];
      if (!a) return;
      ARC_LAYERS[a.i] = Math.max(0, Math.min(arcLayersOf(a) + d, arcMaxLayers(a)));
      renderArc(); renderCap(); refresh();
    });
  });
  Array.prototype.forEach.call(host.querySelectorAll('.mod-slot,.buff-slot'), function (el) {
    var si = +el.getAttribute('data-si');
    var role = el.getAttribute('data-role');
    var isRiven = el.getAttribute('data-kind') === 'riven';
    var det = el.querySelector('.mod-detail');
    if (det) det.addEventListener('click', function (e) {
      e.stopPropagation();
      if (isRiven) { RIVEN_SIDE = null; }
      else if (kind === 'arc') { if (role) ARC[role] = null; }
      else { SLOTS[si] = null; SLOT_LAYERS[si] = null; }
      renderSlots(); renderArc(); renderCap(); refresh();
    });
    el.addEventListener('click', function () {
      if (isRiven) { openPick('mod', RIVEN_SLOT); return; }
      if (kind === 'arc') openPick('arc', role); else openPick('mod', si);
    });
  });
}
function capUse() {
  var s = 0;
  for (var i = 0; i < NSLOT; i++) {
    if (i === RIVEN_SLOT && !RIVEN_OFF) { if (RIVEN_SIDE) s += (POLS[RIVEN_SLOT] ? Math.round(RIVEN_DRAIN / 2) : RIVEN_DRAIN); continue; }
    var m = SLOTS[i] ? MODBY[SLOTS[i]] : null;
    if (m && modOK(m, i)) s += modCost(m, POLS[i]);
  }
  return s;
}
function renderCap() {
  var u = capUse();
  var slot = curSlot(), used = 0, exiN = 0;
  for (var i = 0; i < NSLOT; i++) {
    if (i === RIVEN_SLOT && !RIVEN_OFF) continue;
    if (i === EXILUS_SLOT) { if (SLOTS[i]) exiN = 1; continue; }
    if (SLOTS[i]) used++;
  }
  var arcN = 0; weaponArcRoles().forEach(function (r) { if (ARC[r]) arcN++; });
  $('capuse').textContent = u;
  var cm = capMax();
  var cmEl = $('capmax');
  if (cmEl) cmEl.textContent = cm;
  var cab = $('capbox');
  if (cab) cab.className = 'mbmeta' + (u > cm ? ' over' : '');
  if ($('mbsub')) $('mbsub').textContent = RIVEN_OFF ? '8 张' : '7 张 + 紫卡';
  var cnt = $('mbcnt');
  if (cnt) cnt.textContent = used + exiN + arcN + ((RIVEN_SIDE && !RIVEN_OFF) ? 1 : 0);
  $('mcount').textContent = (RIVEN_OFF ? '8 个普通格装了 ' : '7 个普通格装了 ') + used + ' 张' + (exiN ? ' + 特殊功能 1' : '') + (arcN ? (' + ' + arcN + ' 个赋能') : '')
    + ((RIVEN_SIDE && !RIVEN_OFF) ? ' + 紫卡（卡面 ' + RIVEN_SIDE + '）' : '')
    + '　（' + (slot === 'm' ? '近战' : slot === 'g' ? '枪械' : '曲翼') + '）';
  var sc = setCounts(), sh = '';
  SETS.forEach(function (s) {
    if (!sc[s.i]) return;
    sh += '<span class="chip set" title="' + esc(setBonusText(s, sc[s.i])) + '">'
        + esc(NM(s)) + ' ' + sc[s.i] + '/' + s.tot + '</span>';
  });
  $('setline').innerHTML = sh;
}
function openPick(kind, si) {
  PICK = { k: kind, si: si };
  PKTAB = (kind === 'mod' && si === RIVEN_SLOT) ? 'riven' : 'fast';
  $('pktitle').textContent = (kind === 'arc') ? ('选择赋能（' + si + '）')
    : (si === EXILUS_SLOT ? '给特殊功能槽选择 MOD（只列特殊功能卡）' : ('给第 ' + (si + 1) + ' 槽选择 MOD'));
  $('mq').value = '';
  $('picker').hidden = false;
  renderModList();
  try { $('mq').focus(); } catch (e) { ZKHTML.warn('框架/modpanel.js:3410', e); }
}
function closePick() { PICK = null; $('picker').hidden = true; }
function poolHint() { return ZKMB.poolHint(pickerCtx()); }
function sortForBrowse(list) { return ZKMB.sortForBrowse(list); }
function rivenRows() {
  var h = '';
  ['A', 'B'].forEach(function (sd) {
    var c = CACHE[sd];
    if (!(c && c.ok && c.card)) return;
    var on = (RIVEN_SIDE === sd);
    var wname = c.card.weapon ? NM(c.card.weapon) : '';
    var props = [];
    try {
      readSide(sd).affixes.forEach(function (a) {
        props.push((a.sign === '-' ? '−' : '+') + fmt(Math.abs(+a.value), 1) + a.unit + ' ' + a.name);
      });
    } catch (e) { ZKHTML.warn('框架/modpanel.js:3431', e); }
    h += '<div class="mrow rrow' + (on ? ' on' : '') + '" data-riv="' + sd + '">'
       + '<span class="pol">' + esc(sd) + '</span>'
       + '<span class="nm">紫卡 ' + esc(sd) + (wname ? ' · ' + esc(wname) : '') + '</span>'
       + (on ? '<span class="tg">已在紫卡槽</span>' : '')
       + (props.length ? '<span class="mde">' + esc(props.join('　')) + '</span>' : '')
       + '</div>';
  });
  if (!h) return '<div class="none">还没有识别出卡面：先用上面的识别按钮读 A / B 任一侧。</div>';
  h += '<div class="mrow rrow" data-riv=""><span class="pol">×</span>'
     + '<span class="nm">卸下紫卡</span></div>';
  return h;
}
function pickerCtx() {
  var isArc = !!(PICK && PICK.k === 'arc');
  var isExi = !!(PICK && PICK.si === EXILUS_SLOT);
  return {
    tab: PKTAB,
    q: ($('mq') ? $('mq').value : ''),
    isArc: isArc, isExi: isExi,
    mods: function () { return MODS; },
    arcs: function () {
      if (!PICK) return [];
      return ARCS.filter(function (a) {
        return (a.t === PICK.si || a.t === '任意武器') && ZKMB.arcLegal(a, engineWeapon());
      });
    },
    modOK: function (m) { return modOK(m, PICK ? PICK.si : null); },
    pools: function () { return curPools(); },
    used: function (o) {
      if (isArc) return 0;
      var u = 0;
      for (var i = 0; i < NSLOT; i++) {
        if (!SLOTS[i]) continue;
        if (PICK && i === PICK.si) continue;
        if (SLOTS[i] === o.i) u = i + 1;
      }
      return u;
    },
    setOf: function (o) { return (o && o.st && SETBY[o.st]) ? SETBY[o.st] : null; },
    setCount: function (id) { return setCounts()[id] || 0; },
    arcLabel: function (a) { return arcClassLabel(a); },
    arcCore: function () { var A = AF_ARCH_ARC[curArchId()]; return (A && A.arc) || ''; },
    gainList: function () { return gainRanked(); },
    gainNote: function () { return afSide() ? '（含当前卡面值）' : '（未识别卡面，按裸武器算）'; },
    gainEmpty: '算不出收益：先选好武器（识别出卡面会把卡面值一起算进去，更准）。',
    rivenRows: rivenRows,
    fastKind: fastKind,
    weaponClassCN: weaponClassCN
  };
}
function fastCtx() {
  return {
    fastKind: fastKind,
    modOK: function (m) { return modOK(m, PICK ? PICK.si : null); },
    installed: function () {
      var have = [];
      for (var i = 0; i < NSLOT; i++) if (SLOTS[i]) have.push(SLOTS[i]);
      return have;
    },
    conflict: function (m, have) { return afConflict(m, have); },
    installMod: function (m) {
      for (var j = 0; j < NSLOT; j++) {
        if (j === RIVEN_SLOT) continue;
        if (!SLOTS[j]) {
          SLOTS[j] = m.i; POLS[j] = m.y || '';
          SLOT_LAYERS[j] = null;
          return true;
        }
      }
      return false;
    }
  };
}
function modRows(list, gainMap) { return ZKMB.modRows(pickerCtx(), list, gainMap); }
function renderFast() { return ZKMB.fastChips(pickerCtx()); }
function fastInstall(key) {
  var r = ZKMB.fastInstall(fastCtx(), key);
  renderSlots(); renderArc(); renderCap(); renderModList(); refresh();
  var msg = '快速选择「' + (langIx() === 2 ? (ZKMB.FAST_EN[key] || key) : (FAST_CN[key] || key)) + '」：装入 ' + r.put.length + ' 张'
          + (r.put.length ? '（' + r.put.join('、') + '）' : '');
  if (r.skip.length) msg += '；跳过 ' + r.skip.length + ' 张（未建模 / 冲突 / 无空槽）：' + r.skip.join('、');
  if (r.dup) msg += '；' + r.dup + ' 张已装过';
  msg += '。普通 MOD 上限 8 张（第 9 格是紫卡槽）';
  afMsg(msg);
}
var GAIN_CACHE = { sig: '', list: null };
function gainSig() {
  var ew = engineWeapon(); if (!ew) return '';
  var side = afSide();
  var have = []; for (var i = 0; i < NSLOT; i++) if (SLOTS[i]) have.push(SLOTS[i]);
  var lay = [];
  for (var j = 0; j < NSLOT; j++) if (SLOTS[j]) lay.push(SLOTS[j] + '@' + slotLayers(j));
  var arcSig = weaponArcRoles().map(function (r) { return r + ':' + (ARC[r] || ''); }).join(',');
  return ew.i + '|' + (side || '-') + '|' + have.join(',') + '|' + lay.join(',') + '|' + arcSig + '|' + (RIVEN_SIDE || '-');
}
function gainRanked() {
  var sig = gainSig();
  if (GAIN_CACHE.sig === sig) return GAIN_CACHE.list;
  var ew = engineWeapon(), pools = curPools();
  if (!ew || !RR || !RR.snapPanel) return null;
  var side = afSide();
  var card = side ? CACHE[side].card : null;
  var have = []; for (var i = 0; i < NSLOT; i++) if (SLOTS[i]) have.push(SLOTS[i]);
  var layers = curLayers();
  var aid = afArchId();
  var base = afOut(ew, card, have, ARC, null, layers, aid);
  var out = [];
  MODS.forEach(function (m) {
    if (!modOK(m, PICK.si)) return;
    if (!m.p || !m.p.length) return;
    if (m.rw || m.ew) return;
    if (m.ex && m.ex.length && m.ex.indexOf(ew.i) < 0) return;
    if (have.indexOf(m.i) >= 0) return;
    if (afConflict(m, have)) return;
    var v = afOut(ew, card, have.concat(m.i), ARC, null, layers, aid);
    out.push({ m: m, g: (base > 0 && v != null) ? (v / base - 1) * 100 : 0 });
  });
  out.sort(function (a, b) { return b.g - a.g; });
  GAIN_CACHE = { sig: sig, list: out };
  return out;
}
function renderModList() {
  if (!PICK) return;
  var body = ZKMB.pickerBody(pickerCtx());
  $('pktabs').innerHTML = body.tabs;
  $('pktabs').style.display = body.hideTabs ? 'none' : '';
  $('pkpool').innerHTML = body.pool;
  $('modlist').innerHTML = body.list;
  $('pcount').textContent = body.count;
  Array.prototype.forEach.call($('modlist').querySelectorAll('.mrow'), function (row) {
    row.addEventListener('click', function () {
      if (row.classList.contains('used')) return;
      var id = row.getAttribute('data-mi');
      if (!PICK) return;
      if (PICK.k === 'arc') ARC[PICK.si] = id;
      else { SLOTS[PICK.si] = id; SLOT_LAYERS[PICK.si] = null; }
      closePick();
      renderSlots(); renderArc(); renderCap(); refresh();
    });
  });
  Array.prototype.forEach.call($('modlist').querySelectorAll('.rrow'), function (row) {
    row.addEventListener('click', function () {
      RIVEN_SIDE = row.getAttribute('data-riv') || null;
      closePick();
      renderSlots(); renderCap(); refresh();
    });
  });
  Array.prototype.forEach.call($('modlist').querySelectorAll('.fchip'), function (chip) {
    chip.addEventListener('click', function () { fastInstall(chip.getAttribute('data-fast')); });
  });
}
$('pktabs').addEventListener('click', function (e) {
  var b = e.target.closest ? e.target.closest('button[data-tab]') : null;
  if (!b) return;
  PKTAB = b.getAttribute('data-tab');
  renderModList();
});
var AF_META_K = { frate: 1, aspeed: 1, mag: 1, rel: 1, range: 1, punch: 1, windup: 1, aradius: 1 };
var AF_ARC_PRESET = {
};
var AF_ARCH_ARC = window.ZKAFARC || {};
function curArchId() {
  var s = afSide();
  if (!s || !RR || !RR.route) return null;
  var tid = String(($('afsel') || {}).value || '');
  var id = null;
  try {
    var r = RR.route(CACHE[s].ew, CACHE[s].card, tkey());
    if (r && r.list && r.list.length) {
      var pick = tid ? r.list.filter(function (x) { return x.id === tid; })[0] : r.best;
      id = pick ? pick.id : null;
    }
  } catch (e) { ZKHTML.warn('框架/modpanel.js:3654', e); }
  return id || null;
}
function afSide() {
  if (CACHE.A && CACHE.A.ok && CACHE.A.ew && CACHE.A.card) return 'A';
  if (CACHE.B && CACHE.B.ok && CACHE.B.ew && CACHE.B.card) return 'B';
  return null;
}
function afArchGain(ew, card, tid) {
  var r = RR.route(ew, card, tkey());
  if (!r || !r.list.length) return null;
  if (tid) {
    var it = null;
    r.list.forEach(function (x) { if (x.id === tid) it = x; });
    return it ? it.gain : null;
  }
  return r.best ? r.best.gain : null;
}
function afArchId() {
  var el = $('afsel');
  var v = el ? String(el.value || '') : '';
  if (v && v.indexOf('preset:') !== 0) return v;
  var side = afSide();
  var r = side && CACHE[side] && CACHE[side].route;
  return (r && r.best) ? r.best.id : null;
}
var _AF_BASE = {};
function afBaseCache(ew, f) {
  var k = (ew && (ew.i || ew.z)) + '|' + (f || '');
  if (!_AF_BASE[k]) _AF_BASE[k] = RR.snapPanel(ew, f, {}, {});
  return _AF_BASE[k];
}
function afOut(ew, card, ids, arc, form, layers, archId, facless) {
  var rb = RR.parseRiven(card || {});
  var b = {}, meta = {}, k;
  for (k in rb.buckets) if (Object.prototype.hasOwnProperty.call(rb.buckets, k)) b[k] = rb.buckets[k];
  for (k in rb.meta) if (Object.prototype.hasOwnProperty.call(rb.meta, k)) meta[k] = rb.meta[k];
  var add = function (arr, owner, ly) {
    (arr || []).forEach(function (kv) {
      var key = mkeyOf(owner, kv[0]), v = propValOf(owner, kv, ly);
      if (key === 'fac' && (facless || !facOK(owner))) return;
      if (AF_META_K[key]) meta[key] = (meta[key] || 0) + v;
      else b[key] = (b[key] || 0) + v;
    });
  };
  ids.forEach(function (id) {
    var m = MODBY[id];
    if (m) add(m.p, m, (layers && layers[id] != null) ? layers[id] : modMaxLayers(m));
  });
  if (arc) {
    var arcIds = (typeof arc === 'string') ? [arc]
      : Object.keys(arc).map(function (k) { return arc[k]; }).filter(Boolean);
    arcIds.forEach(function (aid) { var a = ARCBY[aid]; if (a) add(a.p, a, arcLayersOf(a)); });
  }
  var f = form || null;
  var s0 = afBaseCache(ew, f);
  var eord = null;
  try {
    eord = orderOf(ids);
    if (RR.rivenElemOrder) eord = eord.concat(RR.rivenElemOrder(card));
  } catch (eO) { eord = null; }
  var s = RR.snapPanel(ew, f, b, meta, eord);
  var t = (RR.TARGET_BY_K && RR.TARGET_BY_K[tkey()]) || {};
  var D0 = 0, tk0;
  for (tk0 in s0.types) if (Object.prototype.hasOwnProperty.call(s0.types, tk0)) D0 += Math.max(0, +s0.types[tk0] || 0);
  var pt = {};
  ['heat', 'cold', 'electric', 'toxin'].forEach(function (x) {
    pt[x] = Math.max(0, +s0.types[x] || 0) + D0 * Math.max(0, +b[x] || 0) / 100;
  });
  ['blast', 'corrosive', 'gas', 'magnetic', 'radiation', 'viral'].forEach(function (x) {
    pt[x] = Math.max(0, +s0.types[x] || 0);
  });
  try { WE.combineElem(pt, eord); } catch (e3) { ZKHTML.warn('框架/modpanel.js:3754', e3); }
  var e;
  var scPct = Math.max(0, +s.sc || 0);
  var kSc = Math.min(1, scPct / 25);
  var nsProc = RR.procStacks ? RR.procStacks(RR.profile(ew)) : 10;
  var icPanel = 0, capPanel = 0;
  if (ew && ew.s === 'm') {
    var _Aic = (archId && RR.ARCH_BY_ID) ? RR.ARCH_BY_ID[archId] : null;
    capPanel = WE.comboCapOf ? WE.comboCapOf(ew) : 220;
    icPanel = (_Aic && _Aic.comboFull) ? capPanel
      : ((_Aic && _Aic.comboBase != null) ? +_Aic.comboBase : 0);
    icPanel = Math.min(capPanel, icPanel + (+b.combo || 0));
  }
  try {
    e = WE.evaluate({
      base: { types: s0.types, cc: s0.cc, cd: s0.cd, ms: s0.ms, mag: +ew.mag || 1 },
      mods: b, riven: {}, disposition: 1,
      ctx: {
        faction: facless ? 'none' : (t.faction || 'none'),
        armor: +t.armor || 0,
        k: 0,
        initCombo: icPanel,
        comboCap: capPanel,
        corr: pt.corrosive > 0 ? nsProc : 0,
        viral: pt.viral > 0 ? nsProc : 0,
        mag: pt.magnetic > 0 ? nsProc : 0,
        heatProc: pt.heat > 0 && (+t.armor || 0) > 0,
        shielded: !!t.shielded,
        shieldShare: (t.shieldShare != null) ? (+t.shieldShare || 0) : (t.shielded ? 1 : 0),
        dotShare: 0.35 * kSc,
        beam: !!(ew.at && ew.at.beam)
      }
    });
  } catch (err) { return null; }
  var kd = (e.dotWeight == null) ? 0 : e.dotWeight;
  var dir = e.raw.direct ? e.raw.direct.withR : 0;
  var perDir = dir;
  var perBld = (1 - kd) * dir + kd * (e.raw.blood ? e.raw.blood.withR : 0);
  var perDot = (1 - kd) * dir + kd * (e.raw.elemDot ? e.raw.elemDot.withR : 0);
  var per = Math.max(perDir, perBld, perDot);
  var rateMul = 1;
  try {
    var _arch = (archId && RR.ARCH_BY_ID) ? RR.ARCH_BY_ID[archId] : null;
    if (_arch && RR.rateOf) {
      var r1 = RR.rateOf(ew, meta, _arch), r0 = RR.rateOf(ew, {}, _arch);
      rateMul = (r0 > 0) ? (r1 / r0) : 1;
    } else {
      rateMul = (s.sus || s.fr || 0);
    }
  } catch (eR) { rateMul = (s.sus || s.fr || 0); }
  var idx = per * rateMul;
  try {
    var _sa = (archId && RR.ARCH_BY_ID) ? RR.ARCH_BY_ID[archId] : null;
    if (_sa && _sa.light && RR.stanceMulOf) idx *= RR.stanceMulOf(_sa);
  } catch (eS) { ZKHTML.warn('框架/modpanel.js:3816', eS); }
  try {
    var at = RR.attackOf(ew, f);
    var rad = at.rad || at.slam;
    if (rad && rad.dmg) {
      var dmgM = 1 + (+b.dmg || 0) / 100, rt = 0, tk;
      for (tk in rad.dmg) if (Object.prototype.hasOwnProperty.call(rad.dmg, tk)) rt += Math.max(0, +rad.dmg[tk] || 0);
      if (rt > 0) idx += rt * dmgM * (s.critM || 1) * (at.rad ? s.ms : 1) * rateMul;
    }
  } catch (e2) { ZKHTML.warn('框架/modpanel.js:3827', e2); }
  return idx;
}
function afLegal(m, ew) {
  var pools = modPoolsOf(ew);
  if (pools ? pools.indexOf(m.t) < 0 : m.s !== curSlot()) return false;
  if (!ZKMB.legal(m, null, (ew && ew.i) || '', false)) return false;
  if (m.x) return false;
  if (m.rw) return false;
  if (m.ex && m.ex.length && m.ex.indexOf(ew.i) < 0) return false;
  return true;
}
function afCands(ew, slot) {
  return MODS.filter(function (m) {
    if (!m.p || !m.p.length) return false;
    return afLegal(m, ew);
  });
}
function afConflict(m, ids) {
  for (var i = 0; i < ids.length; i++) {
    var o = MODBY[ids[i]];
    if (!o) continue;
    if (o.i === m.i) return true;
    if (o.fam && m.fam && o.fam === m.fam) return true;
    if (o.inc && o.inc.indexOf(m.i) >= 0) return true;
    if (m.inc && m.inc.indexOf(o.i) >= 0) return true;
  }
  return false;
}
function afCost(ids) {
  var c = 0;
  ids.forEach(function (id) { var m = MODBY[id]; if (m) c += modCost(m, m.y); });
  return c;
}
function afMsg(s) { var el = $('afmsg'); if (el) el.textContent = s; }
function curLayers() {
  var o = {};
  for (var i = 0; i < NSLOT; i++) {
    if (i === RIVEN_SLOT || !SLOTS[i]) continue;
    if (SLOT_LAYERS[i] != null) o[SLOTS[i]] = SLOT_LAYERS[i];
  }
  return o;
}
function afBudget() {
  var rd = (RIVEN_SIDE && !RIVEN_OFF) ? (POLS[RIVEN_SLOT] ? Math.round(RIVEN_DRAIN / 2) : RIVEN_DRAIN) : 0;
  return capMax() - rd;
}
function modHasFac(id) {
  var m = MODBY[id];
  if (!m) return false;
  var p = m.p || [];
  for (var i = 0; i < p.length; i++) if (mkeyOf(m, p[i][0]) === 'fac') return true;
  return false;
}
function orderOf(ids) {
  var out = [];
  (ids || []).forEach(function (id) {
    var m = MODBY[id];
    if (!m || !m.p) return;
    m.p.forEach(function (kv) {
      var k = mkeyOf(m, kv[0]);
      if (k === 'heat' || k === 'cold' || k === 'electric' || k === 'toxin') out.push(k);
    });
  });
  return out;
}
function afReal(ew, card, ids, archId) {
  var arch = (archId && RR.ARCH_BY_ID) ? RR.ARCH_BY_ID[archId] : null;
  if (!ew || !arch || !RR.scoreArch) return null;
  var o = {};
  var AF_UP = 0.5;
  var scntR = countSets(ids);
  ids.forEach(function (id) {
    var m = MODBY[id];
    if (!m) return;
    var mx = modMaxLayers(m), smul = setSelfMul(m, scntR);
    (m.p || []).forEach(function (kv) {
      var key = mkeyOf(m, kv[0]);
      var lay = (+kv[2] > 1) ? Math.max(1, Math.round(+kv[2] * AF_UP)) : mx;
      var v = propValOf(m, kv, lay);
      if (key === 'fac') return;
      o[key] = (o[key] || 0) + v * smul;
    });
  });
  var sbkR = setBonusBuckets(scntR);
  for (var kR in sbkR) if (Object.prototype.hasOwnProperty.call(sbkR, kR)) o[kR] = (o[kR] || 0) + sbkR[kR];
  RR.setExtraMods(o, true);
  try { if (RR.setElemOrder) RR.setElemOrder(orderOf(ids)); } catch (eEO) { ZKHTML.warn('框架/modpanel.js:3960', eEO); }
  var r = null;
  try { r = RR.scoreArch(ew, card || null, tkey(), arch); } catch (e) { r = null; }
  if (!r) return null;
  var rm = 1;
  try {
    var r0 = RR.rateOf(ew, {}, arch), r1 = RR.rateOf(ew, o, arch);
    if (r0 > 0) rm = r1 / r0;
  } catch (e2) { ZKHTML.warn('框架/modpanel.js:3972', e2); }
  var cm = 1;
  try {
    var cg = +r.crowdGain;
    if (isFinite(cg)) cm = Math.max(0.05, 1 + cg / 100);
  } catch (e3) { ZKHTML.warn('框架/modpanel.js:3981', e3); }
  return (r.hitDmg || 0) * rm * cm;
}
function afRun(noRiven) {
  var noR = (noRiven === true);
  RIVEN_OFF = noR;
  var side = afSide();
  if (!side) {
    if (!noR) { afMsg('先在 A / B 任一侧填好词条，引擎算出流派后再自动装填。'); return; }
    if (!engineWeapon()) { afMsg('先在上方选一把武器（或识别一张紫卡）再装填。'); return; }
  }
  if (!RR || !RR.route || !RR.snapPanel) { afMsg('收益引擎未载入。'); return; }
  var ew = side ? CACHE[side].ew : engineWeapon();
  var card = side ? CACHE[side].card : {};
  var slot = curSlot();
  var tid = String(($('afsel') || {}).value || '');
  var cands = afCands(ew, slot);
  var form = null;
  var archId = null;
  try {
    var r0 = RR.route(ew, card, tkey());
    if (r0 && r0.list.length) {
      var pick = tid ? r0.list.filter(function (x) { return x.id === tid; })[0] : r0.best;
      form = pick ? pick.form : null;
      archId = pick ? pick.id : null;
    }
  } catch (e) { ZKHTML.warn('框架/modpanel.js:4001', e); }
  if (!RIVEN_SIDE) {
    if (CACHE.A && CACHE.A.ok && CACHE.A.card) RIVEN_SIDE = 'A';
    else if (CACHE.B && CACHE.B.ok && CACHE.B.card) RIVEN_SIDE = 'B';
  }
  var budget = afBudget();
  var base = afOut(ew, card, [], null, form, null, archId, true);
  if (base == null || !(base > 0)) {
    renderSlots(); renderArc(); renderCap(); refresh();
    afMsg('这把武器算不出输出指数。');
    return;
  }
  var ids = [], cur = base, skipped = 0, stdMiss = [];
  var arch = (archId && RR.ARCH_BY_ID) ? RR.ARCH_BY_ID[archId] : null;
  var NSL = noR ? (NSLOT - 1) : ((NSLOT - 1) - (RIVEN_SIDE ? 1 : 0));
  var dropped = [];
  var stdIds = (archId && RR.archModsOf) ? RR.archModsOf(archId, ew)
              : ((archId && RR.ARCH_BUILDS) ? RR.ARCH_BUILDS[archId] : null);
  var _afCls = null;
  try { _afCls = RR.gunClassOf ? RR.gunClassOf(ew) : null; } catch (eC) { ZKHTML.warn('框架/modpanel.js:4035', eC); }
  var ownSet = {};
  var ownIds = (window.ZKMB && ZKMB.ownModsOf)
    ? ZKMB.ownModsOf(ew, MODS, function (m) { return afLegal(m, ew); })
    : [];
  var pool = [];
  if (stdIds && stdIds.length) {
    stdIds.forEach(function (id) {
      var m = MODBY[id];
      if (!m) { stdMiss.push(id); return; }
      if (!afLegal(m, ew)) { stdMiss.push(NM(m) + '（池位不符）'); return; }
      if (afConflict(m, pool)) { stdMiss.push(NM(m) + '（同族冲突）'); return; }
      pool.push(id);
    });
  }
  ownIds.forEach(function (m) {
    if (ownSet[m.i]) return;
    if (afConflict(m, pool)) return;
    ownSet[m.i] = 1;
    pool.push(m.i);
  });
  if (pool.length) {
    while (pool.length && pool.length > NSL) {
      var dropI = -1, dropV = -Infinity, dropFac = false;
      for (var d0 = 0; d0 < pool.length; d0++) {
        if (ownSet[pool[d0]]) continue;
        var tr = pool.slice(0, d0).concat(pool.slice(d0 + 1));
        var vv = afReal(ew, card, tr, archId);
        if (vv == null) vv = afOut(ew, card, tr, null, form, null, archId, true);
        if (vv == null) continue;
        var isF = modHasFac(pool[d0]);
        var better = (vv > dropV + 1e-9) || (Math.abs(vv - dropV) <= 1e-9 && isF && !dropFac);
        if (better) { dropV = vv; dropI = d0; dropFac = isF; }
      }
      if (dropI < 0) break;
      dropped.push(pool[dropI]);
      pool.splice(dropI, 1);
    }
    if (pool.length > NSL) pool = pool.slice(0, NSL);
    ids = pool;
    if (ids.length) {
      var vStd = afOut(ew, card, ids, null, form, null, archId, true);
      if (vStd != null && vStd > 0) cur = vStd;
    }
  }
  var fellBack = false;
  if (!ids.length && cands.length) {
    fellBack = !!stdIds;
    for (var round = ids.length; round < NSL; round++) {
      var bestV = cur, bestM = null;
      for (var j = 0; j < cands.length; j++) {
        var m = cands[j];
        if (afConflict(m, ids)) continue;
        if (afCost(ids) + modCost(m, m.y) > budget) { skipped++; continue; }
        ids.push(m.i);
        var v = afOut(ew, card, ids, null, form, null, archId, true);
        ids.pop();
        if (v != null && v > bestV * (1 + 1e-9)) { bestV = v; bestM = m; }
      }
      if (!bestM) break;
      ids.push(bestM.i);
      cur = bestV;
    }
  }
  var bestA = {}, chosenArc = {};
  weaponArcRoles().forEach(function (role) {
    var bestId = null, bestV = cur;
    ARCS.forEach(function (a) {
      if (!(a.t === role || a.t === '任意武器')) return;
      if (!ZKMB.arcLegal(a, ew)) return;
      if (chosenArc[a.i]) return;
      var v = afOut(ew, card, ids, a.i, form, null, archId, true);
      if (v != null && v > bestV * (1 + 1e-9)) { bestV = v; bestId = a.i; }
    });
    if (bestId) { bestA[role] = bestId; chosenArc[bestId] = 1; cur = bestV; }
  });
  var archArcNote = '';
  if (archId && AF_ARCH_ARC[archId]) {
    var A0 = AF_ARCH_ARC[archId];
    var _ewA = engineWeapon(), _arcId = A0.arc;
    if (A0.arcBy && _ewA && A0.arcBy[_ewA.s]) _arcId = A0.arcBy[_ewA.s];
    var aA = ARCBY[_arcId], aR = A0.role || (aA && aA.t);
    if (aA && aR && weaponArcRoles().indexOf(aR) >= 0) {
      Object.keys(bestA).forEach(function (r0) { if (bestA[r0] === _arcId) delete bestA[r0]; });
      bestA[aR] = _arcId;
      var vA = afOut(ew, card, ids, _arcId, form, null, archId, true);
      if (vA != null && vA > 0) cur = vA;
      archArcNote = '　·　' + A0.note;
    }
  }
  var presetNote = '';
  if (tid.indexOf('preset:') === 0) {
    var pk = tid.slice(7), pre = AF_ARC_PRESET[pk];
    if (pre) {
      pre.arcs.forEach(function (aid) {
        var a = ARCBY[aid];
        if (!a) return;
        var role = pre.role || a.t;
        if (weaponArcRoles().indexOf(role) < 0) return;
        bestA[role] = aid;
      });
      presetNote = '　·　' + pre.note;
    }
  }
  var _exiKeep = SLOTS[EXILUS_SLOT], _exiPol = POLS[EXILUS_SLOT], _exiLay = SLOT_LAYERS[EXILUS_SLOT];
  SLOTS = [null, null, null, null, null, null, null, null, null];
  POLS = ['', '', '', '', '', '', '', '', ''];
  SLOT_LAYERS = [null, null, null, null, null, null, null, null, null];
  SLOTS[EXILUS_SLOT] = _exiKeep;
  POLS[EXILUS_SLOT] = _exiPol || '';
  SLOT_LAYERS[EXILUS_SLOT] = _exiLay;
  var si = 0;
  ids.forEach(function (id) {
    while ((!noR && si === RIVEN_SLOT) || si === EXILUS_SLOT) si++;
    SLOTS[si] = id;
    POLS[si] = (MODBY[id] && MODBY[id].y) || '';
    si++;
  });
  if (RIVEN_SIDE && !noR) POLS[RIVEN_SLOT] = 'o';
  ARC = bestA;
  renderSlots(); renderArc(); renderCap(); renderModList(); refresh();
  var gAfter = null;
  try { gAfter = afArchGain(ew, card, tid); } catch (e) { ZKHTML.warn('框架/modpanel.js:4192', e); }
  var arcN = Object.keys(bestA).length;
  afMsg('自动装填：' + ids.length + ' 张 MOD' + (arcN ? (' + ' + arcN + ' 个赋能') : '')
       + (arch ? '　流派「' + arch.n + '」'
            + (stdIds ? (fellBack ? '标准配卡装不上，已按可装卡贪心填充' : '标准配卡') : '（这类武器没有标准配卡，按可装卡填充）')
          : '')
       + '　输出指数 ' + fmt(base, 0) + ' → ' + fmt(cur, 0)
       + (gAfter != null ? '　装后净增幅 ' + (gAfter >= 0 ? '+' : '−') + fmt(Math.abs(gAfter), 1) + '%' : '')
       + '　紫卡槽 ' + (noR ? '未装（8 格全用普通 MOD）' : (RIVEN_SIDE ? ('卡面 ' + RIVEN_SIDE) : '空着'))
       + (dropped.length ? '　·　装不下，丢掉 ' +
          dropped.map(function (id) { var m = MODBY[id]; return (m && NM(m)) || id; }).join('、') : '')
       + (stdMiss.length ? '　·　' + stdMiss.length + ' 张标准卡没装上：' + stdMiss.slice(0, 3).join('、') : '')
       + (fellBack ? '　·　已按「' + (langIx() === 2 ? (ZKMB.POOL_EN[_afCls] || _afCls) : (POOL_CN[_afCls] || _afCls)) + '」可装卡重配' : '')
       + (Object.keys(ownSet).length ? '　·　已装武器专属卡 ' +
          Object.keys(ownSet).map(function (id) { var m = MODBY[id]; return (m && NM(m)) || id; }).join('、') : '')
       + '　·　按无派系评估（不上歧视卡）'
       + archArcNote
       + presetNote);
}
var AF_SIG = null;
function afRebuild() {
  var el = $('afsel');
  if (!el) return;
  var side = afSide();
  var list = (side && CACHE[side].route && CACHE[side].route.list) || [];
  var sig = list.map(function (x) { return x.id; }).join(',');
  if (sig === AF_SIG) return;
  AF_SIG = sig;
  var keep = el.value;
  var h = '<option value="">自动（跟着当前最优流派）</option>';
  list.forEach(function (x) { h += '<option value="' + esc(x.id) + '">' + esc(RR.archNameOf(x.id, langIx())) + '</option>'; });
  Object.keys(AF_ARC_PRESET).forEach(function (k) {
    var p = AF_ARC_PRESET[k];
    h += '<option value="preset:' + esc(k) + '">' + esc(p.name) + '</option>';
  });
  el.innerHTML = h;
  if (keep && Array.prototype.some.call(el.options, function (o) { return o.value === keep; })) el.value = keep;
}
function applyResult(side, r) {
  ST[side].res = r;
  var idx = (r.weapon && r.weapon.idx >= 0) ? r.weapon.idx : -1;
  var changed = false;
  if (idx >= 0) {
    if (WIDX !== idx) {
      WIDX = idx; WIDX_FROM = side;
      var w = WEAPONS[idx];
      if ($('wq')) $('wq').value = w ? weaponLabel(w) : '';
      changed = true;
    } else if (!WIDX_FROM) {
      WIDX_FROM = side;
    }
  }
  if (r.rank != null && $('rk')) {
    $('rk').value = r.rank;
  }
  var n = (r.affixes || []).length;
  var stEl = $('st' + side);
  stEl.textContent = '识别完成：' + ((r.weapon && NM(r.weapon)) || '未认出武器')
                   + ' · ' + n + ' 条词条'
                   + (n < 4 ? '　（请注意核对词条数量）' : '');
  stEl.className = 'status' + (n < 4 ? ' warn' : ' ok');
  if (changed) onWeaponChanged();
  renderPanel(side);
  paint();
}
var OCR_WAITMASK = null;
var OCR_RAN = false;
function waitOn(txt) {
  if (typeof document === 'undefined' || !document.body) return;
  if (!OCR_WAITMASK) {
    var m = document.createElement('div');
    m.className = 'ocr-waitmask';
    m.setAttribute('role', 'alertdialog');
    m.setAttribute('aria-busy', 'true');
    m.innerHTML = '<div class="ocr-waitbox"><i class="spin" aria-hidden="true"></i>'
      + '<div><b>识别中，请勿操作</b><span></span></div></div>';
    m.addEventListener('mousedown', function (e) { e.preventDefault(); e.stopPropagation(); }, true);
    m.addEventListener('keydown', function (e) { e.stopPropagation(); }, true);
    OCR_WAITMASK = m;
  }
  var t = OCR_WAITMASK.querySelector('.ocr-waitbox span');
  if (t) t.textContent = txt || '正在本地识别这张卡面，几秒内完成，期间请不要切换武器或改词条。';
  if (!OCR_WAITMASK.parentNode) document.body.appendChild(OCR_WAITMASK);
}
function waitOff() {
  if (OCR_WAITMASK && OCR_WAITMASK.parentNode) OCR_WAITMASK.parentNode.removeChild(OCR_WAITMASK);
}
function runSide(side, onProg) {
  var stt = ST[side], stEl = $('st' + side);
  if (!stt.img) return Promise.resolve(false);
  stEl.textContent = '正在识别…'; stEl.className = 'status';
  return window.RivenOCR.loadImage(stt.img).then(function () {
    return window.RivenOCR.recognize({ onProgress: function (m) {
      if (typeof onProg === 'function') onProg(m);
    } });
  }).then(function (r) {
    applyResult(side, r);
    return true;
  }).catch(function (e) {
    stEl.textContent = '识别失败：' + ((e && e.message) || e); stEl.className = 'status err';
    return false;
  });
}
function parseSideText(side) {
  var ta = $('tx' + side), stEl = $('st' + side);
  var raw = String(ta.value || '');
  var lines = raw.split(/\r?\n/)
                .map(function (s) { return s.trim(); })
                .filter(function (s) { return s; });
  if (!lines.length) { stEl.textContent = '先把卡面文字贴进去（一行一条，或整段粘贴）。'; stEl.className = 'status warn'; return; }
  var r = null;
  try { r = window.RivenOCR.generate(raw); } catch (e) { r = null; }
  if (!r || !(r.affixes || []).length) {
    try { r = window.RivenOCR.parseText(lines, {}); } catch (e) { r = null; }
  }
  if (!r || !(r.affixes || []).length) {
    stEl.textContent = '这段文字里没有解析出词条。'; stEl.className = 'status err'; return;
  }
  applyResult(side, r);
  stEl.textContent = '文字解析：' + (r.affixes || []).length + ' 条词条'
                   + (WIDX >= 0 ? '' : '（武器未认名，请在基础信息里手选）');
  stEl.className = 'status ok';
}
function runAll() {
  var btn = $('runAll'), hint = $('runhint');
  if (!ENGINE_READY) { hint.textContent = '引擎还没就绪，等顶部状态变绿再点。'; return; }
  var todo = [];
  if (ST.A.img) todo.push('A');
  if (ST.B.img) todo.push('B');
  if (!todo.length) { hint.textContent = '两侧都还没有图。'; return; }
  btn.disabled = true; btn.classList.add('is-busy');
  btn.innerHTML = '<svg class="ic" aria-hidden="true" focusable="false"><use href="#i-reroll"/></svg>正在识别…';
  hint.textContent = '正在依次识别 ' + todo.join(' → ') + '…';
  waitOn((OCR_RAN ? '正在本地识别这张卡面，几秒内完成。'
                  : '首次识别要先展开本地模型，约十几秒；之后每张几秒。')
        + '期间请不要切换武器、改词条，也不要再点识别。');
  var busyAt = Date.now();
  var MIN_BUSY = window.RULES.ZK_MIN_BUSY;
  var waitTx = OCR_WAITMASK ? OCR_WAITMASK.querySelector('.ocr-waitbox span') : null;
  var finish = function (fn) {
    var left = MIN_BUSY - (Date.now() - busyAt);
    if (left > 0) setTimeout(fn, left); else fn();
  };
  var start = function () {
    var p = Promise.resolve();
    todo.forEach(function (s) {
      p = p.then(function () {
        return runSide(s, function (m) {
          if (waitTx && m && m.status) waitTx.textContent = '卡面 ' + s + '：' + m.status;
        });
      });
    });
    p.then(function () {}, function () {}).then(function () {
      finish(function () {
        OCR_RAN = true;
        waitOff();
        btn.classList.remove('is-busy');
        btn.textContent = '开始识别';
        btn.disabled = false;
        hint.textContent = '识别完成。读数不对就直接在卡面板里改。';
        syncRunAll();
        paint();
      });
    });
  };
  setTimeout(start, 60);   // 先让遮罩和 busy 态画出来再开跑（与 02 区同口径）
}
function loadFile(side, f) {
  if (window.__wakeOnnx) window.__wakeOnnx();   // 一传卡就叫醒引擎：后续初始化全速（与 02 区同口径）
  var url = URL.createObjectURL(f);
  var img = new Image();
  img.onload = function () {
    ST[side].img = img;
    ST[side].res = null;
    var dz = $('drop' + side);
    dz.innerHTML = '';
    var im = new Image();
    im.onload = function () { try { URL.revokeObjectURL(url); } catch (e) { ZKHTML.warn('框架/modpanel.js:4353', e); } };
    im.onerror = function () { try { URL.revokeObjectURL(url); } catch (e) { ZKHTML.warn('框架/modpanel.js:4354', e); } };
    im.src = url; dz.appendChild(im);
    $('st' + side).textContent = '已载入（' + img.naturalWidth + '×' + img.naturalHeight + '）'
      + (ENGINE_READY ? '' : '　引擎还在加载');
    $('st' + side).className = 'status';
    setActive(side);
    syncRunAll();
  };
  img.onerror = function () {
    try { URL.revokeObjectURL(url); } catch (e) { ZKHTML.warn('框架/modpanel.js:4366', e); }
    $('st' + side).textContent = '图片解码失败。'; $('st' + side).className = 'status err';
  };
  img.src = url;
}
function setActive(side) {
  ACTIVE = side;
  ['A', 'B'].forEach(function (s) {
    $('pan' + s).classList.toggle('active', s === side);
    var t = $('tag' + s);
    if (!t) return;
    if (s === 'A') t.textContent = '左' + (s === side ? ' · 当前接收' : '');
    else t.textContent = '右' + (s === side ? ' · 当前接收' : '');
  });
}
buildCatalog();
['A', 'B'].forEach(function (side) {
  var dz = $('drop' + side), fi = $('file' + side);
  dz.addEventListener('click', function () { fi.click(); });
  fi.addEventListener('change', function () { if (fi.files[0]) loadFile(side, fi.files[0]); });
  dz.addEventListener('dragover', function (e) { e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', function () { dz.classList.remove('dragover'); });
  dz.addEventListener('drop', function (e) {
    e.preventDefault(); dz.classList.remove('dragover');
    if (e.dataTransfer.files[0]) loadFile(side, e.dataTransfer.files[0]);
  });
  $('pan' + side).addEventListener('click', function () { setActive(side); });
  $('txb' + side).addEventListener('click', function (e) {
    e.stopPropagation();
    $('txw' + side).classList.toggle('open');
  });
  $('txgo' + side).addEventListener('click', function (e) {
    e.stopPropagation();
    parseSideText(side);
  });
  $('clr' + side).addEventListener('click', function (e) {
    e.stopPropagation();
    ST[side] = { img: null, res: null };
    $('drop' + side).innerHTML = '<div class="dz-hint">点击选图 / 拖拽到此处<br>或 Ctrl+V 粘贴截图</div>';
    $('txw' + side).classList.remove('open');
    $('st' + side).textContent = ''; $('st' + side).className = 'status';
    renderPanel(side);
    syncRunAll();
    paint();
  });
  renderPanel(side);
});
$('runAll').addEventListener('click', runAll);
if ($('rk')) $('rk').addEventListener('input', refresh);
$('mq').addEventListener('input', renderModList);
$('pkclose').addEventListener('click', closePick);
$('mclr').addEventListener('click', function () {
  SLOTS = [null, null, null, null, null, null, null, null, null];
  SLOT_LAYERS = [null, null, null, null, null, null, null, null, null];
  ARC = {};
  RIVEN_OFF = false;
  renderSlots(); renderArc(); renderCap(); refresh();
});
$('afgo').addEventListener('click', function () { afRun(false); });
if ($('afgonr')) $('afgonr').addEventListener('click', function () { afRun(true); });
window.addEventListener('paste', function (e) {
  var rt = document.documentElement.getAttribute('data-route');
  if (rt && rt !== 'choose') return;
  var cd = e.clipboardData;
  if (!cd) return;
  if (cd.files && cd.files.length) { loadFile(ACTIVE, cd.files[0]); return; }
  var it = cd.items || [];
  for (var i = 0; i < it.length; i++) {
    if (it[i].type.indexOf('image/') === 0) {
      var f = it[i].getAsFile();
      if (f) { loadFile(ACTIVE, f); return; }
    }
  }
});
renderAsm();
renderSlots(); renderArc(); renderCap();
afRebuild();
renderBasic();
paint();
bootEngine();
window.addEventListener('zkdispchange', function () {
  try { renderBasic(); paint(); } catch (e) { ZKHTML.warn('框架/modpanel.js:dispchange', e); }
});
window.ZKDMGAB = {
  lang: function () {
    barSig = ''; _stSig = '';
    if ($('wq') && WIDX >= 0 && WEAPONS[WIDX]) $('wq').value = weaponLabel(WEAPONS[WIDX]);
    if ($('wlist') && $('wlist').classList.contains('open')) renderWList($('wq').value || '');
    onWeaponChanged();
  },
};
window.__MB05 = {
  afOut: afOut, afReal: afReal, afLegal: afLegal, afConflict: afConflict,
  afCands: afCands, afBudget: afBudget, curSlot: curSlot,
  modCost: modCost, modMaxLayers: modMaxLayers, propLine: propLine
};
try{window.__DM={
  afSide:afSide, afRun:afRun, tkey:tkey,
  cache:function(){return CACHE;}, modby:function(){return MODBY;},
  slots:function(){return SLOTS;}, nslot:function(){return NSLOT;},
  rivenSlot:function(){return RIVEN_SLOT;}, exilusSlot:function(){return EXILUS_SLOT;},
  rivenSide:function(){return RIVEN_SIDE;}, weapons:function(){return WEAPON_DB;},
  arc:function(){return ARC;}, layers:function(){return SLOT_LAYERS;}, rivenOff:function(){return RIVEN_OFF;}
};}catch (e) { ZKHTML.warn('框架/modpanel.js:4541', e); }
})();
