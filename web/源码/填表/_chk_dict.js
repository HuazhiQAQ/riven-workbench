  /* 与 wm-fill-core.js 的 norm() 保持一致：去空白 / 冒号 / 全半角括号 / 转小写 */
  const normOf = s => String(s == null ? '' : s)
    .replace(/[\s　]+/g, '').replace(/[：:]/g, '')
    .replace(/（/g, '(').replace(/）/g, ')').toLowerCase();
/* WM 词库校验器 —— 从产物 HTML 里抽出词库，对着 WM 真实下拉逐项核对。 */
const fs = require('fs');
const path = require('path');

const htmlPath = process.argv[2];
const wmDir = process.argv[3] || path.dirname(__filename);
const html = fs.readFileSync(htmlPath, 'utf8');

/* 清单来自唯一命名表（源码/数据/names.json），不再读那几份拆分出来的 txt。 */
const TABLE = JSON.parse(fs.readFileSync(path.join(wmDir, '..', '数据', 'names.json'), 'utf8'));
const uniq = a => Array.from(new Set(a.filter(Boolean)));

const cn = TABLE.wm.itemList;                                   // 武器中文下拉
const en = TABLE.wm.itemListEn;                                 // 武器英文下拉
const scn = uniq(TABLE.stats.map(s => s.wmCn));                  // 词条中文下拉
const sen = uniq(TABLE.stats.map(s => s.wmEn));                  // 词条英文下拉

function grab(decl) {
  const i = html.indexOf(decl);
  if (i < 0) throw new Error('产物里找不到：' + decl);
  const start = Math.min(html.indexOf('{', i), html.indexOf('[', i));
  let d = 0, end = -1;
  for (let k = start; k < html.length; k++) {
    const c = html[k];
    if (c === '{' || c === '[') d++;
    else if (c === '}' || c === ']') { d--; if (d === 0) { end = k + 1; break; } }
  }
  return eval('(' + html.slice(start, end) + ')');
}

const WM_STAT_ID = grab('var WM_STAT_ID = ');
const WM_STAT_ROW_ID = grab('var WM_STAT_ROW_ID = ');
const WM_STAT_ROWS_BY_NAME = grab('var WM_STAT_ROWS_BY_NAME = ');
const WM_ITEM_LIST = grab('var WM_ITEM_LIST = ');
const WM_ITEM_LIST_EN = grab('var WM_ITEM_LIST_EN = ');
const WM_WEAPON_CN2EN = grab('var WM_WEAPON_CN2EN = ');
const WM_WEAPON_EN2CN = grab('var WM_WEAPON_EN2CN = ');
const WM_WEAPON_ALIAS = grab('var WM_WEAPON_ALIAS = ');
const WM_NAME_RULES = grab('var WM_NAME_RULES = ');

let fail = 0;
const bad = (m) => { console.log('  ✗ ' + m); fail++; };

/* ---------- 与 _gen.js 逻辑保持一致（改了那边，这里要同步改） ---------- */
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
function wmWeaponName(w, L) {
  if (!w) return '';
  var cands = [w.cn, w.intl, w.en];
  var wmCn = wmItemNameAny(cands);
  if (L === 2) {
    var en2 = WM_WEAPON_CN2EN[wmCn];
    if (en2) return en2;
  }
  return wmCn;
}
function wmStatName(row, L) {
  var wid = WM_STAT_ROW_ID[row];
  if (wid == null || !WM_STAT_ID[wid]) return '(未映射)';
  return (L === 2) ? WM_STAT_ID[wid][3] : WM_STAT_ID[wid][2];
}

console.log('=== 产物词库 ===');
console.log('  WM_STAT_ID          :', Object.keys(WM_STAT_ID).length, '个 ID');
console.log('  WM_STAT_ROW_ID      :', Object.keys(WM_STAT_ROW_ID).length, '条行号映射');
console.log('  WM_STAT_ROWS_BY_NAME:', Object.keys(WM_STAT_ROWS_BY_NAME).length, '个别名');
console.log('  WM_ITEM_LIST        :', WM_ITEM_LIST.length, '个中文名');
console.log('  WM_ITEM_LIST_EN     :', WM_ITEM_LIST_EN.length, '个英文名');
console.log('  WM_WEAPON_CN2EN     :', Object.keys(WM_WEAPON_CN2EN).length, '对');
console.log('  WM_WEAPON_EN2CN     :', Object.keys(WM_WEAPON_EN2CN).length, '对');

console.log('\n=== 1. 词条名能在真实 WM 下拉里查到 ===');
let hitEn = 0, hitCn = 0;
const missStatCn = [];
for (const k of Object.keys(WM_STAT_ID)) {
  const v = WM_STAT_ID[k];
  if (sen.includes(v[3])) hitEn++;
  else bad('ID ' + k + ' 英文名不在下拉：' + v[3]);
  if (scn.includes(v[2])) hitCn++;
  else missStatCn.push('ID ' + k + ' → ' + v[2]);
}
console.log('  英文名命中真实下拉：' + hitEn + ' / ' + Object.keys(WM_STAT_ID).length);
console.log('  中文名命中主下拉  ：' + hitCn + ' / ' + Object.keys(WM_STAT_ID).length);
if (missStatCn.length) {
  console.log('  中文名不在主下拉（这批在 WM 的近战/重击词条下拉里，非主下拉）：');
  missStatCn.forEach(x => console.log('     ' + x));
}

console.log('\n=== 2. 武器清单与真实下拉逐条一致 ===');
const enSet = new Set(en), cnSet = new Set(cn);
let missEn = WM_ITEM_LIST_EN.filter(x => !enSet.has(x));
let missCn = WM_ITEM_LIST.filter(x => !cnSet.has(x));
console.log('  不在真实英文下拉里的：' + missEn.length + ' 个');
missEn.forEach(x => bad('英文表多出：' + x));
console.log('  不在真实中文下拉里的：' + missCn.length + ' 个');
missCn.forEach(x => bad('中文表多出：' + x));

console.log('\n=== 3. 中英对照双向自洽 ===');
for (const cnName of Object.keys(WM_WEAPON_CN2EN)) {
  const enName = WM_WEAPON_CN2EN[cnName];
  if (WM_WEAPON_EN2CN[enName] !== cnName)
    bad('反向不一致：' + cnName + ' -> ' + enName + ' -> ' + WM_WEAPON_EN2CN[enName]);
  if (!cnSet.has(cnName)) bad('对照表里的中文名不在 WM 中文下拉：' + cnName);
  if (!enSet.has(enName)) bad('对照表里的英文名不在 WM 英文下拉：' + enName);
}
console.log('  双向自洽：' + Object.keys(WM_WEAPON_CN2EN).length + ' 对');

console.log('\n=== 4. 制胜者两个形态必须分开 ===');
const vMelee = WM_WEAPON_CN2EN['制胜者 (近战)'];
const vMain = WM_WEAPON_CN2EN['制胜者'];
console.log('  制胜者 (近战) ->', vMelee);
console.log('  制胜者        ->', vMain);
if (vMelee !== 'Vinquibus (Melee)') bad('近战形态没对上：' + vMelee);
if (vMain !== 'Vinquibus') bad('主手形态没对上：' + vMain);

console.log('\n=== 5. & 系列七把武器不能撞名 ===');
const amp = ['Ack & Brunt', 'Argo & Vel', 'Cobra & Crane', 'Sigma & Octantis',
             'Silva & Aegis', 'Sun & Moon', 'Tak & Lug'];
const ampCn = [];
for (const e of amp) {
  const c = WM_WEAPON_EN2CN[e];
  ampCn.push(c);
  console.log('  ' + e.padEnd(20) + '-> ' + c);
  if (!c) bad(e + ' 没有中文名');
}
if (new Set(ampCn).size !== amp.length) bad('& 系列中文名撞车：' + ampCn.join(' / '));

console.log('\n=== 6. 词条行号映射自洽 ===');
for (const row of Object.keys(WM_STAT_ROW_ID)) {
  const id = WM_STAT_ROW_ID[row];
  if (!WM_STAT_ID[id]) bad('行号 ' + row + ' 指向不存在的 ID ' + id);
}
for (const name of Object.keys(WM_STAT_ROWS_BY_NAME)) {
  for (const row of WM_STAT_ROWS_BY_NAME[name]) {
    if (WM_STAT_ROW_ID[row] == null) bad('别名「' + name + '」指向未知行号 ' + row);
  }
}
console.log('  行号映射自洽');

console.log('\n=== 7. MK1 系列（国服「试用型-」/ 国际服「MK1-」）===');
const mk1 = [
  { cn: '试用型-布莱顿', intl: 'MK1-布莱顿', base: '布莱顿', baseEn: 'Braton' },
  { cn: '试用型-帕里斯', intl: 'MK1-帕里斯', base: '帕里斯', baseEn: 'Paris' },
  { cn: '试用型-斯特朗', intl: 'MK1-斯特朗', base: '斯特朗', baseEn: 'Strun' },
  { cn: '试用型-弗拉克斯', intl: 'MK1-弗拉克斯', base: '弗拉克斯', baseEn: 'Furax' },
  { cn: '试用型-盗贼', intl: 'MK1-盗贼', base: '盗贼', baseEn: 'Furis' },
  { cn: '试用型-苦无', intl: 'MK1-苦无', base: '苦无', baseEn: 'Kunai' },
  { cn: '试用型-玻之武杖', intl: 'MK1-玻之武杖', base: '玻之武杖', baseEn: 'Bo' },
];
for (const m of mk1) {
  const cnOut = wmWeaponName(m, 1);
  const enOut = wmWeaponName(m, 2);
  const okCn = cnOut === m.base, okEn = enOut === m.baseEn;
  console.log('  ' + (m.cn + ' / ' + m.intl).padEnd(36) +
    '→ 中文=' + cnOut.padEnd(10) + ' 英文=' + enOut.padEnd(12) + (okCn && okEn ? '✓' : '✗'));
  if (!okCn) bad(m.cn + ' 中文侧没翻到「' + m.base + '」，得到「' + cnOut + '」');
  if (!okEn) bad(m.intl + ' 英文侧没翻到「' + m.baseEn + '」，得到「' + enOut + '」');
  if (WM_ITEM_LIST.indexOf(cnOut) < 0) bad(cnOut + ' 不在 WM 中文下拉里');
  if (WM_ITEM_LIST_EN.indexOf(enOut) < 0) bad(enOut + ' 不在 WM 英文下拉里');
}

console.log('\n=== 8. 制胜者两形态（运行时）===');
const vin = [
  { cn: '制胜者(主手)', expectCn: '制胜者', expectEn: 'Vinquibus' },
  { cn: '制胜者(近战)', expectCn: '制胜者 (近战)', expectEn: 'Vinquibus (Melee)' },
];
for (const v of vin) {
  const cnOut = wmWeaponName(v, 1), enOut = wmWeaponName(v, 2);
  console.log('  ' + v.cn.padEnd(14) + '→ 中文=' + cnOut.padEnd(16) + ' 英文=' + enOut);
  if (cnOut !== v.expectCn) bad(v.cn + ' 中文侧期望 ' + v.expectCn + '，得到 ' + cnOut);
  if (enOut !== v.expectEn) bad(v.cn + ' 英文侧期望 ' + v.expectEn + '，得到 ' + enOut);
}

console.log('\n=== 9. 词条：中文站 / 英文站 ===');
const statCases = [
  { row: 16, cn: '对 Corpus 的伤害', en: 'Damage to Corpus' },
  { row: 43, cn: '对科腐者的伤害', en: 'Damage to Techrot' },
  { row: 44, cn: '对炽蛇军的伤害', en: 'Damage to Scaldra' },
  { row: 2, cn: '伤害', en: 'Damage' },
  { row: 3, cn: '伤害', en: 'Damage' },
];
for (const c of statCases) {
  const cnOut = wmStatName(c.row, 1), enOut = wmStatName(c.row, 2);
  console.log('  row ' + String(c.row).padStart(2) +
    ' → 中文=' + cnOut.padEnd(16) + ' 英文=' + enOut);
  if (cnOut !== c.cn) bad('row ' + c.row + ' 中文侧期望 ' + c.cn + '，得到 ' + cnOut);
  if (enOut !== c.en) bad('row ' + c.row + ' 英文侧期望 ' + c.en + '，得到 ' + enOut);
}

console.log('\n=== 10. 变体规则 ===');
for (const v of [{ cn: '圣装骨葬', expect: '骨葬 Prime' },
                 { cn: '赤毒布拉玛', expect: '赤毒·布拉玛' }]) {
  const out = wmItemName(v.cn);
  console.log('  ' + v.cn.padEnd(12) + '→ ' + out);
  if (out !== v.expect) bad(v.cn + ' 期望 ' + v.expect + '，得到 ' + out);
}


/* ── 11. 武器名比对（中英双站 + 形态区分）───────────────────────────── */
console.log('\n=== 11. 武器标签候选能命中真机标签 ===');
{
  /* 中文站 zh-hans 真实 DOM 里的 label 文本 */
  const REAL = ['PC', 'Xbox', 'Category', 'Weapon Name', 'Positive Attributes',
    'Negative Attribute', 'Polarity', 'Maxed', 'Direct Sale', 'Auction',
    'Sort by', 'On Site', 'In Game', 'Riven Mod Name', 'Mastery',
    'Mod Rank', 'Re-rolls', 'Selling Price', 'Description'];
  const LABELS = ['weapon name', '武器名称', '武器', 'itemname', 'item name', 'weapon'];
  let hit = 0;
  for (const k of LABELS) {
    const nk = normOf(k);
    const got = REAL.filter(lb => { const nt = normOf(lb); return nt === nk || nt.indexOf(nk) >= 0; });
    if (got.length) { hit++; console.log('  ✓ ' + k.padEnd(14) + '→ ' + got.join(' / ')); }
    else console.log('  · ' + k.padEnd(14) + '→ 未命中（保留作历史兼容）');
  }
  if (!hit) bad('武器标签候选一个都命不中真机标签');
}

console.log('\n=== 12. 武器名比对：中英双站 + 形态区分 ===');
{
  /* nameHit / weaponOk 逻辑与 wm-fill-core.js 保持一致 */
  const nrm = s => String(s == null ? '' : s)
    .replace(/[\s　]+/g, '').replace(/[：:]/g, '')
    .replace(/（/g, '(').replace(/）/g, ')').toLowerCase();
  const zhOnly = s => nrm(s).replace(/[a-z0-9._\-'"]+/g, '');
  function parts(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/\((?:[^()]*)\)/g, m => '\u0001' + nrm(m) + '\u0002')
      .replace(/·/g, '\u0001').split('\u0001').filter(Boolean);
  }
  const stem = s => nrm(parts(s)[0] || '');
  const hitName = (g, w) => {
    if (!g || !w) return false;
    if (nrm(g) === nrm(w)) return true;
    const gs = stem(g), ws = stem(w);
    if (gs && ws && (gs.indexOf(ws) >= 0 || ws.indexOf(gs) >= 0)) {
      const gf = parts(g).slice(1).map(nrm).join('');
      const wf = parts(w).slice(1).map(nrm).join('');
      if ((gf && wf) || (!gf && !wf)) return true;
    }
    const gz = zhOnly(g), wz = zhOnly(w);
    if (gz && wz && gz !== wz && (gz.indexOf(wz) >= 0 || wz.indexOf(gz) >= 0)) {
      const a = stem(gz), b = stem(wz);
      if (a && b && a.indexOf(b) >= 0) return true;
    }
    return false;
  };
  const CASES = [
    ['英文站原样回填',   'Cassowar',            'Cassowar',            true],
    ['英文站混合回填',   'Cassowar 鹤鸵长戟',    'Cassowar',            true],
    ['中文站夹带英文',   '执法者 Amanata',      '执法者',               true],
    ['中文站纯中文',     '鹤鸵长戟',            '鹤鸵长戟',             true],
    ['英文站含 Prime',   'Euphona Prime',       'Euphona Prime',        true],
    ['MK1 国际服前缀',   'MK1-布莱顿',           '布莱顿',                true],
    ['制胜者近战形态',   'Vinquibus (Melee)',   'Vinquibus (Melee)',    true],
    ['制胜者主手',       'Vinquibus',           'Vinquibus',            true],
    ['★主手≠近战',       'Vinquibus',           'Vinquibus (Melee)',    false],
    ['& 系列不撞名',     '认知 & 冲击',          '认知 & 冲击',           true],
    ['英文站 AX-52',     'AX-52',               'AX-52',                true],
    ['真失败：不同武器',  'Cassowar',            'Soma',                 false],
  ];
  let bad2 = 0;
  for (const [n, g, w, exp] of CASES) {
    const got = hitName(g, w);
    const ok = got === exp;
    if (!ok) bad2++;
    console.log('  ' + (ok ? '✓ ' : '✗ ') + n.padEnd(16) +
      (g + '  vs  ' + w).padEnd(46) + ' → ' + got);
  }
  if (bad2) bad('武器名比对 ' + bad2 + ' 项不符');
}

console.log('\n' + (fail ? '✗ 失败 ' + fail + ' 项' : '✓ 全部通过'));
