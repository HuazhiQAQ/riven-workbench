/* _probe_docfig.cjs —— 给「识别流程讲解」文档重出配图与原始行
 *
 *   node _probe_docfig.cjs <产物.html> <卡图> <输出目录>
 *
 * 产出：
 *   输出目录/rows.json      识别结果 + 分区 + 逐行（含 zone）+ 各阶段耗时
 *   输出目录/aligned.png    ①对齐后原图
 *   输出目录/mask.png       ②二值化掩膜
 *   输出目录/zones.png      ③④分区框（红=分界线，黄=分区，与运行时调试框一致）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { toFileUrl, openPage } = require('./cdp.cjs');

function saveDataUrl(url, file) {
  const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(url || '');
  if (!m) return false;
  fs.writeFileSync(file, Buffer.from(m[2], 'base64'));
  return true;
}

(async () => {
  const [html, card, outDir] = process.argv.slice(2);
  fs.mkdirSync(outDir, { recursive: true });
  const page = await openPage(toFileUrl(html));
  const cdp = page.cdp;
  try {
    for (let i = 0; i < 160; i++) {
      if (await cdp.eval('(document.readyState === "complete") && !!window.RivenOCR && !!window.ZKDATA')) break;
      await new Promise(r => setTimeout(r, 500));
    }
    const b64 = fs.readFileSync(card).toString('base64');
    const mime = /\.png$/i.test(card) ? 'image/png' : 'image/jpeg';
    await cdp.eval('window.__testUrl = "data:' + mime + ';base64,' + b64 + '"');
    const out = await cdp.eval(`(async () => {
      window.__ocrProfile = true;
      window.__ocrPhases = null;
      window.__numVerify = [];
      window.__zones = null;
      window.__zoneSplit = '';
      window.__dbgRows = null;
      window.__nameRetry = null;
      const t0 = performance.now();
      await window.RivenOCR.loadImage(window.__testUrl);
      const r = await window.RivenOCR.recognize({});
      const ms = Math.round(performance.now() - t0);
      return JSON.stringify({
        ms: ms,
        phases: window.__ocrPhases,
        fitMode: window.__fitMode, fitWhy: window.__fitWhy || '', fitAr: window.__fitAr,
        comboGuess: window.__comboGuess, divY: window.__divY,
        retry: window.__ocrRetry, rounds: window.__ocrRounds || 0,
        zones: window.__zones,
        zoneSplit: window.__zoneSplit, zoneDbg: window.__zoneDbg,
        nameRetry: window.__nameRetry,
        rows: window.__ocrRowsFinal,
        numVerify: window.__numVerify,
        shakyWhy: (window.__shakyWhy || []).slice(0, 4),
        weapon: r.weapon, rank: r.rank, mr: r.mr, rolls: r.rolls,
        affixes: (r.affixes || []).map(a => ({ sign: a.sign, value: a.value, name: a.name, drow: a.drow, score: a.score })),
        rankFix: r.rankFix, unread: r.unread, dropped: r.dropped, weak: r.weak,
        nameCheck: r.nameCheck, rivenGen: r.rivenGen, pol: r.pol,
        levelRaw: r.levelRaw, weaponRaw: r.weaponRaw,
        stepImages: window.__stepImages
      });
    })()`, { awaitPromise: true });
    const o = JSON.parse(out);
    const imgs = o.stepImages || {};
    delete o.stepImages;
    saveDataUrl(imgs.aligned, path.join(outDir, 'aligned.png'));
    saveDataUrl(imgs.mask, path.join(outDir, 'mask.png'));
    saveDataUrl(imgs.zones, path.join(outDir, 'zones.png'));
    fs.writeFileSync(path.join(outDir, 'rows.json'), JSON.stringify(o, null, 1), 'utf8');
    console.log('ms=' + o.ms + '  weapon=' + (o.weapon && o.weapon.cn) + '  rank=' + o.rank + '  mr=' + o.mr + '  rolls=' + o.rolls + '  combo=' + o.comboGuess);
    console.log('zones=' + JSON.stringify((o.zones || []).map(z => z.name + ':' + z.ry0.toFixed(3) + '-' + z.ry1.toFixed(3) + '/' + z.rx0.toFixed(2) + '-' + z.rx1.toFixed(2))));
    console.log('rows=' + (o.rows || []).length + '  affixes=' + (o.affixes || []).length);
  } finally { page.kill(); }
})();
