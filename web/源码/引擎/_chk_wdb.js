/* 验证：产物里池化还原出来的 WEAPON_DB，与源码 weapon-db.js 逐字段相等。 */
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const srcJs = fs.readFileSync(process.argv[3], 'utf8');

function grabArr(text, marker) {
  const i = text.indexOf(marker);
  if (i < 0) throw new Error('找不到：' + marker);
  const start = text.indexOf('[', i);
  let d = 0, end = -1;
  for (let k = start; k < text.length; k++) {
    const c = text[k];
    if (c === '[') d++;
    else if (c === ']') { d--; if (d === 0) { end = k + 1; break; } }
  }
  return text.slice(start, end);
}

// 源码版
const srcArr = eval('(' + grabArr(srcJs, 'var WEAPON_DB = ') + ')');

// 产物版：抽出 POOL + ENC，按产物里的还原逻辑还原
const pool = eval('(' + grabArr(html, 'var WEAPON_DB_POOL = ') + ')');
const enc = eval('(' + grabArr(html, 'var WEAPON_DB_ENC = ') + ')');
function dec(o) {
  if (Array.isArray(o)) { for (var i = 0; i < o.length; i++) o[i] = dec(o[i]); return o; }
  if (o && typeof o === 'object') { for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) o[k] = dec(o[k]); return o; }
  if (typeof o === 'number' && o < 0) return pool[-o - 1];
  return o;
}
const DB = dec(enc);

let fail = 0;
const bad = (m) => { console.log('  ✗ ' + m); fail++; };

console.log('=== weapon-db 池化还原校验 ===');
console.log('  源码条目: ' + srcArr.length + '   产物条目: ' + DB.length);
if (srcArr.length !== DB.length) bad('条目数不一致');

// 深度比较（注意 Infinity：JSON 化会变 null，用 === 逐个比）
function deepEq(a, b, path) {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') {
    if (isNaN(a) && isNaN(b)) return true;
    if (a === Infinity && b === Infinity) return true;
    if (a === -Infinity && b === -Infinity) return true;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) { bad(path + ' 数组长度 ' + a.length + ' vs ' + b.length); return false; }
    let ok = true;
    for (let i = 0; i < a.length; i++) if (!deepEq(a[i], b[i], path + '[' + i + ']')) ok = false;
    return ok;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) {
      bad(path + ' 键数 ' + ka.length + ' vs ' + kb.length +
          ' (' + ka.filter(k => !(k in b)).join(',') + ' / ' + kb.filter(k => !(k in a)).join(',') + ')');
      return false;
    }
    let ok = true;
    for (const k of ka) if (!deepEq(a[k], b[k], path + '.' + k)) ok = false;
    return ok;
  }
  bad(path + ' 值不同：' + JSON.stringify(a) + ' vs ' + JSON.stringify(b));
  return false;
}

for (let i = 0; i < Math.min(srcArr.length, DB.length); i++) {
  deepEq(srcArr[i], DB[i], '[' + i + ']');
}

// 关键字段抽样 + 真实访问模式仿真
// 这一段是池化方案的关键校验：现有代码是直接用字符串键名访问的
// 池化还原必须让这些访问一个都不差。
console.log('\n=== 真实访问模式仿真（riven-router.js 的用法）===');
const grab = (id) => DB.find(x => x.i === id);
const chk = (cond, msg) => { if (!cond) bad(msg); };

// 模式1: w.fm.heavy_slam.slam.dmg.impact （riven-router.js:361 附近）
const g = grab('garuda_talons');
console.log('  w.fm.heavy_slam 存在:', !!g.fm.heavy_slam);
chk(!!g.fm.heavy_slam, 'garuda_talons 丢了 fm.heavy_slam');
console.log('  w.fm.heavy_slam.slam.dmg.impact =', g.fm.heavy_slam.slam.dmg.impact);
chk(g.fm.heavy_slam.slam.dmg.impact === 248, 'heavy_slam.slam.dmg.impact 不对');

// 模式2: w.fl.indexOf('slide') / ('heavy_slam')
console.log('  w.fl =', JSON.stringify(g.fl));
chk(g.fl.indexOf('slide') === 5, "fl.indexOf('slide') 不对");
chk(g.fl.indexOf('heavy_slam') === 4, "fl.indexOf('heavy_slam') 不对");
chk(g.fl.indexOf('throw') === -1, "fl.indexOf('throw') 应为 -1");

// 模式3: w.fm.incarnon
const inc = DB.filter(x => x.fm && x.fm.incarnon);
console.log('  有 fm.incarnon 的武器数:', inc.length, '例:', inc[0] && inc[0].i);
chk(inc.length === 69, 'fm.incarnon 的武器数变了（应 69）');

// 模式4: w.fm.alt_fire / w.fm.charged
const alt = DB.filter(x => x.fm && x.fm.alt_fire).length;
const chg = DB.filter(x => x.fm && x.fm.charged).length;
console.log('  有 fm.alt_fire 的:', alt, '  有 fm.charged 的:', chg);

// 模式5: Object.keys(w.fm) —— 11 个形态名
const fmKeys = new Set();
DB.forEach(x => { if (x.fm) Object.keys(x.fm).forEach(k => fmKeys.add(k)); });
console.log('  fm 的所有 key:', [...fmKeys].join(' '));
chk(fmKeys.size === 11, 'fm 的 key 数量变了（应 11）');
chk(fmKeys.has('heavy_slam') && fmKeys.has('incarnon') && fmKeys.has('slide'),
    'fm 的 key 名不对');

// 模式6: 数值与数组
const dd = grab('dual_decurion');
console.log('  w.tr =', JSON.stringify(dd.tr), '  w.co =', dd.co);
chk(dd.tr[0] === 'tenno', 'tr[0] 不对');
chk(dd.co === 'additive_with_base_damage', 'co 不对');
console.log('  mausolon.at.cc =', grab('mausolon').at.cc);
chk(grab('mausolon').at.cc === 0.3, 'at.cc 不对');

// 模式7: 中文名（含非 ASCII）
console.log('  z =', dd.z, ' / ', grab('garuda_talons').z);
chk(dd.z === '什长双枪', '中文名不对');
chk(grab('garuda_talons').z.indexOf('爪') >= 0, '中文名（爪）不对');

// Infinity 那一处
console.log('\n  cdur=Infinity 的条目数：源码 ' +
  srcArr.filter(x => x.cdur === Infinity).length +
  '  产物 ' + DB.filter(x => x.cdur === Infinity).length);
if (srcArr.filter(x => x.cdur === Infinity).length !== DB.filter(x => x.cdur === Infinity).length)
  bad('Infinity 还原不对');

console.log('\n' + (fail ? '✗ 失败 ' + fail + ' 项' : '✓ 逐字段完全相等 + 真实访问模式全对'));
process.exit(fail ? 1 : 0);
