/* _probe_numcheck.cjs —— 数值复读 / 分区 / 卡形护栏的验证探针
 *
 *   node _probe_numcheck.cjs <产物.html> <卡图.png> [卡图2.png ...]
 *
 * 除了 ocr_e2e.cjs 打的那几行，额外打出：
 *   · __numVerify（每次复读的候选票数、是否纠正、是否冲突）
 *   · __zones / __zoneSplit（分区是不是按名字行切的）
 *   · __fitMode / __fitWhy（卡形护栏有没有触发补救援）
 *   · __ocrPhases.num（复读花了多少毫秒）
 * 关掉复读跑一次（CK_OFF=1）可拿来对比耗时与识别结果。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { toFileUrl, openPage } = require('./cdp.cjs');

const OFF = process.env.CK_OFF === '1';

async function main() {
  const [htmlPath, ...cards] = process.argv.slice(2);
  if (!htmlPath || !cards.length) {
    console.error('用法: node _probe_numcheck.cjs <产物.html> <卡图.png> [...]');
    process.exit(2);
  }
  const page = await openPage(toFileUrl(htmlPath));
  const cdp = page.cdp;
  try {
    let ok = false;
    for (let i = 0; i < 120; i++) {
      if (await cdp.eval('(document.readyState === "complete") && !!window.RivenOCR && !!window.ZKDATA')) { ok = true; break; }
      await new Promise(r => setTimeout(r, 500));
    }
    if (!ok) throw new Error('页面没就绪');
    if (OFF) await cdp.eval('window.__ocrNumCheck = false');
    /* 分阶段耗时只在 __ocrProfile 打开时才记账（ocr_engine.js 的 __P） */
    await cdp.eval('window.__ocrProfile = true');

    for (const card of cards) {
      const b64 = fs.readFileSync(card).toString('base64');
      const mime = /\.png$/i.test(card) ? 'image/png' : 'image/jpeg';
      await cdp.eval('window.__testUrl = "data:' + mime + ';base64,' + b64 + '"');
      const out = await cdp.eval(`(async () => {
        const t0 = Date.now();
        try {
          window.__numVerify = [];
          window.__ocrPhases = null;
          window.__nameRetry = null;
          await window.RivenOCR.loadImage(window.__testUrl);
          const r = await window.RivenOCR.recognize({});
          return JSON.stringify({
            ok: true, ms: Date.now() - t0,
            numMs: window.__ocrPhases ? Math.round(window.__ocrPhases.num || 0) : -1,
            weapon: (r.weapon && (r.weapon.cn || '')) + '(' + ((r.weapon && r.weapon.en) || '') + ')',
            level: (r.rank != null ? r.rank : r.level),
            affix: (r.affixes || []).map(a => a.sign + a.value + (a.isPct ? '%' : '') + ' ' + a.name
                     + (a.uncertain ? ' [不确定]' : '')),
            uncertain: (r.affixes || []).filter(a => a.uncertain).length,
            numFixed: (r.numFixed || []).map(x => x.from + '→' + x.fixed),
            numConflict: (r.numConflict || []).map(x => x.vals.join('/')),
            numChecked: r.numChecked == null ? -1 : r.numChecked,
            zSplit: window.__zoneSplit || '',
            zones: (r.zones || []).map(z => z.name + ':' + z.ry0.toFixed(3) + '-' + z.ry1.toFixed(3)),
            fitMode: window.__fitMode, fitWhy: window.__fitWhy || '',
            nameRetry: window.__nameRetry,
            lines: window.RivenOCR && window.RivenOCR.lastLines ? window.RivenOCR.lastLines : null
          });
        } catch (e) {
          return JSON.stringify({ ok: false, ms: Date.now() - t0, err: (e && (e.stack || e.message)) || String(e) });
        }
      })()`, { awaitPromise: true });
      const o = JSON.parse(out);
      console.log('\n=== ' + path.basename(card) + (OFF ? '（复读关）' : '') + ' ===');
      if (!o.ok) { console.log('  失败: ' + o.err); continue; }
      console.log('  耗时 ' + o.ms + 'ms（其中复读 ' + o.numMs + 'ms）  复读行数 ' + o.numChecked);
      console.log('  武器 ' + o.weapon + ' · 等级 ' + o.level + ' · 极性 ' + (o.pol || ''));
      console.log('  分区 ' + (o.zSplit ? '按名字行切开' : '固定分区') + '  ' + o.zones.join(' | '));
      console.log('  卡形 mode=' + o.fitMode + (o.fitWhy ? ' 补救援原因=' + o.fitWhy : ''));
      if (o.nameRetry) console.log('  名字兜底 ' + o.nameRetry.mode + ' top=' + o.nameRetry.top.toFixed(3)
        + ' → ' + o.nameRetry.rows.map(r => r[0] + ':' + r[1]).join(' / '));
      o.affix.forEach(a => console.log('    · ' + a));
      if (o.numFixed && o.numFixed.length) console.log('  纠正: ' + o.numFixed.join(' , '));
      if (o.numConflict && o.numConflict.length) console.log('  冲突(未猜): ' + o.numConflict.join(' , '));
    }
    const logs = cdp.logs.filter(l => l.indexOf('[exception]') >= 0);
    console.log('\n' + (logs.length ? logs.slice(0, 8).join('\n') : '页面无 JS 报错。'));
  } finally {
    page.kill();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
