'use strict';
/* _probe_zrows.cjs —— 逐行 dump：每行属于哪个分区、读成什么，段位/循环各是多少
 *   node _probe_zrows.cjs <产物.html> <卡图> [...]
 */
const fs = require('fs');
const path = require('path');
const { toFileUrl, openPage } = require('./cdp.cjs');
(async () => {
  const argv2 = process.argv.slice(2);
  /* 不传产物时自动取最新；第一参数若是图片则当卡图 */
  const firstIsImg = argv2[0] && /\.(png|jpe?g|webp)$/i.test(argv2[0]);
  const html = (firstIsImg ? require('./cdp.cjs').latestProduct() : (argv2.shift() || require('./cdp.cjs').latestProduct()));
  const cards = argv2;
  const page = await openPage(toFileUrl(html));
  const cdp = page.cdp;
  try {
    for (let i = 0; i < 120; i++) {
      if (await cdp.eval('(document.readyState === "complete") && !!window.RivenOCR && !!window.ZKDATA')) break;
      await new Promise(r => setTimeout(r, 500));
    }
    for (const c of cards) {
      const b64 = fs.readFileSync(c).toString('base64');
      const mime = /\.png$/i.test(c) ? 'image/png' : 'image/jpeg';
      await cdp.eval('window.__testUrl = "data:' + mime + ';base64,' + b64 + '"');
      const out = await cdp.eval(`(async () => {
        window.__nameRetry = null;
        await window.RivenOCR.loadImage(window.__testUrl);
        const r = await window.RivenOCR.recognize({});
        return JSON.stringify({
          rows: window.__ocrRowsFinal,
          zones: (r.zones || []).map(z => z.name + ':' + z.ry0.toFixed(3) + '-' + z.ry1.toFixed(3)),
          w: r.weapon && r.weapon.cn, mr: r.mr, rank: r.rank, rolls: r.rolls
        });
      })()`, { awaitPromise: true });
      const o = JSON.parse(out);
      console.log('\n=== ' + path.basename(c) + '  ' + o.w + ' 段位' + o.mr + ' 等级' + o.rank + ' 循环' + o.rolls
        + '\n    ' + o.zones.join(' | '));
      (o.rows || []).forEach(x => console.log('   y=' + x[0] + ' h=' + x[1] + ' [' + x[2] + '] ' + x[3]));
    }
  } finally { page.kill(); }
})();
