'use strict';
/* 回归总入口：一条命令按顺序跑探针套件，逐个报 PASS/FAIL，末尾汇总。
 * 用法:
 *   node 调试/run_all.cjs                     # 核心 18 项（产物自动取 产物/ 里最新一份）
 *   node 调试/run_all.cjs <产物.html>          # 指定产物
 *   node 调试/run_all.cjs --only smoke,fill   # 只跑指定项
 *   node 调试/run_all.cjs --ext               # 核心 + 扩展（扩展为各功能的专项验收）
 * 判定：进程退出码非 0 即 FAIL；另扫输出里的 FAIL / ✗ / ❌ / WATCHDOG / 非 none 的 EXC；
 *      有约定尾标的（RESULT: ALL PASS / ✅ 全部通过）必须命中。
 */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const HERE = __dirname;
const PROD_DIR = path.join(HERE, '..', '产物');

function resolveProduct(argv) {
  const a = argv.filter(x => !x.startsWith('--'));
  if (a[0]) return path.resolve(a[0]);
  let best = null, bestM = -1;
  for (const f of fs.readdirSync(PROD_DIR)) {
    if (!/模拟器.*\.html$/.test(f)) continue;
    const m = fs.statSync(path.join(PROD_DIR, f)).mtimeMs;
    if (m > bestM) { bestM = m; best = f; }
  }
  if (!best) throw new Error('产物目录里没有模拟器 HTML');
  return path.join(PROD_DIR, best);
}

/* 判定方式：exit=退出码；scan=正则必须命中（写带 ✅/RESULT 的探针） */
const SUITE = {
  /* ---- 核心：每轮必跑 ---- */
  smoke:        { file: '_probe_smoke.cjs',          args: 1 },
  fill:         { file: '_probe_fill.cjs',           args: 0, must: /全部用例通过/ },
  priceref:     { file: '_probe_priceref.cjs',       args: 1 },
  price:        { file: '_probe_price.cjs',          args: 1, must: /RESULT: ALL PASS/ },
  pricecombo:   { file: '_probe_pricecombo.cjs',     args: 1 },
  pricecombo_cat: { file: '_probe_pricecombo_cat.cjs', args: 1, must: /ARCH-NO-KIT: true[\s\S]*ARCH-NO-RIFLE: true/ },
  pricesingle:  { file: '_probe_pricesingle.cjs',    args: 1, must: /COMBO-OK: true/ },
  pricestore:   { file: '_probe_pricestore.cjs',     args: 1, must: /CN-BTN: cn[\s\S]*EXC: none/ },
  pricecalccn:  { file: '_probe_pricecalccn.cjs',    args: 1, must: /ALL PASS/ },
  disptoggle:   { file: '_probe_disptoggle.cjs',     args: 1, must: /AFTER-RELOAD: unified=true/ },
  dispui:       { file: '_probe_dispui.cjs',         args: 1, must: /RG-META: .*0\.85/ },
  sgx:          { file: '_probe_sgx.cjs',            args: 1, must: /✅ 全部通过/ },
  'sgxfollow(main)':    { file: '_probe_sgxfollow.cjs', args: 1, tail: ['main'], must: /✅ 全部通过/ },
  'sgxfollow(variant)': { file: '_probe_sgxfollow.cjs', args: 1, tail: ['variant'], must: /✅ 全部通过/ },
  panelfollow:  { file: '_probe_panelfollow.cjs',    args: 1 },
  common:       { file: '_probe_common.cjs',         args: 1, must: /✅ 全部通过/ },
  namematch:    { file: '_probe_namematch.cjs',      args: 1, must: /全部命中/ },
  import04:     { file: '_probe_import04.cjs',       args: 1, must: /RESULT: ALL PASS/ },
  /* ---- 扩展：--ext 时附加的功能专项 ---- */
  advscope4:    { file: '_probe_advscope4.cjs',   ext: true, args: 1 },
  advscope6:    { file: '_probe_advscope6.cjs',   ext: true, args: 1 },
  _10b:         { file: '_probe_10b.cjs',         ext: true, args: 1 },
  _12:          { file: '_probe_12.cjs',          ext: true, args: 1 },
  _13:          { file: '_probe_13.cjs',          ext: true, args: 1 },
  _15b:         { file: '_probe_15b.cjs',         ext: true, args: 1 },
  chooseocr:    { file: '_probe_chooseocr.cjs',   ext: true, args: 1 },
  cmpclear:     { file: '_probe_cmpclear.cjs',    ext: true, args: 1 },
  combo:        { file: '_probe_combo.cjs',       ext: true, args: 1 },
  fixw:         { file: '_probe_fixw.cjs',        ext: true, args: 1 },
  fuseopt:      { file: '_probe_fuseopt.cjs',     ext: true, args: 1 },
  gstatus:      { file: '_probe_gstatus.cjs',     ext: true, args: 1 },
  kfus:         { file: '_probe_kfus.cjs',        ext: true, args: 1 },
  lich:         { file: '_probe_lich.cjs',        ext: true, args: 1 },
  openN:        { file: '_probe_openN.cjs',       ext: true, args: 1 },
  own:          { file: '_probe_own.cjs',         ext: true, args: 1 },
  physpool:     { file: '_probe_physpool.cjs',    ext: true, args: 1 },
  rivenname:    { file: '_probe_rivenname.cjs',   ext: true, args: 1 },
  rowsmeta:     { file: '_probe_rowsmeta.cjs',    ext: true, args: 1 },
  textparse:    { file: '_probe_textparse.cjs',   ext: true, args: 1, must: /✅ 全部通过/ },
  typenames:    { file: '_probe_typenames.cjs',   ext: true, args: 1 },
  numcheck:     { file: '_probe_numcheck.cjs',    ext: true, args: 1, manual: true },   /* 需人工给卡图 */
  washpool:     { file: '_probe_washpool.cjs',    ext: true, args: 1 },
  washn:        { file: 'wash_n_e2e.cjs',         ext: true, args: 1, must: /洗 N 次回归全过/ },
};

const FAIL_RE = /\bFAIL\b|✗|❌|WATCHDOG|EXC: (?!none)|^ERR |\nERR /;

function run(name, entry, product) {
  return new Promise(resolve => {
    const args = [path.join(HERE, entry.file)];
    if (entry.args >= 1) args.push(product);
    (entry.tail || []).forEach(t => args.push(t));
    const t0 = Date.now();
    const c = spawn(process.execPath, args, { cwd: HERE, windowsHide: true });
    let out = '';
    c.stdout.on('data', d => { out += d; });
    c.stderr.on('data', d => { out += d; });
    c.on('close', code => {
      let why = [];
      if (code !== 0) why.push('exit=' + code);
      if (entry.must && !entry.must.test(out)) why.push('缺约定尾标');
      const m = out.match(FAIL_RE);
      if (m) why.push('输出含失败标记 ' + JSON.stringify(m[0]));
      resolve({ name, ok: why.length === 0, why: why.join(' / '),
                secs: ((Date.now() - t0) / 1000).toFixed(1), out });
    });
    c.on('error', e => resolve({ name, ok: false, why: 'spawn: ' + e.message, secs: '0', out: '' }));
  });
}

(async () => {
  const argv = process.argv.slice(2);
  /* --only 支持两种写法：--only=a,b 与 --only a,b */
  const onlyRaw = (() => {
    const i = argv.findIndex(a => a === '--only' || a.startsWith('--only='));
    if (i < 0) return '';
    const a = argv[i];
    if (a.includes('=')) return a.slice(a.indexOf('=') + 1);
    return argv[i + 1] || '';
  })();
  const only = onlyRaw.split(',').map(s => s.trim()).filter(Boolean);
  const ext = argv.includes('--ext');
  /* --only 的「值」不能漏给 resolveProduct，否则会被当成产物路径 */
  const productArgv = (() => {
    const out = [];
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      if (a === '--only') { i++; continue; }
      if (a.startsWith('--only=')) continue;
      out.push(a);
    }
    return out;
  })();
  const product = resolveProduct(productArgv);
  console.log('产物: ' + product);

  const names = Object.keys(SUITE).filter(n => {
    if (only.length) return only.indexOf(n) >= 0;
    if (SUITE[n].manual) return false;      /* 要人工给卡图的诊断探针，不随 --ext 跑 */
    return ext ? true : !SUITE[n].ext;
  });

  const results = [];
  for (const n of names) {
    process.stdout.write('… ' + n.padEnd(20));
    let r = await run(n, SUITE[n], product);
    /* 无头 Chrome 连跑偶发「找不到 page target」——属目标页竞争，不是断言失败，单跑一次。 */
    if (!r.ok && /找不到 page target/.test(r.out)) {
      process.stdout.write('RETRY  ');
      r = await run(n, SUITE[n], product);
    }
    results.push(r);
    console.log((r.ok ? 'PASS' : 'FAIL') + '  (' + r.secs + 's)' + (r.ok ? '' : '  ← ' + r.why));
  }
  const bad = results.filter(r => !r.ok);
  console.log('\n—— 汇总: ' + (results.length - bad.length) + '/' + results.length + ' 通过 ——');
  if (bad.length) {
    for (const r of bad) {
      console.log('✗ ' + r.name + ' (' + r.why + ')');
      const tail = r.out.trim().split('\n').slice(-12).join('\n');
      console.log(tail.replace(/^/gm, '    '));
    }
    process.exit(1);
  }
})().catch(e => { console.error(e); process.exit(1); });
