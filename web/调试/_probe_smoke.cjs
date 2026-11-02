'use strict';
const path = require('path');
const { openPage, toFileUrl } = require('./cdp.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const p = await openPage(toFileUrl(path.resolve(process.argv[2] || require('./cdp.cjs').latestProduct())));
  const out = [];
  try {
    await sleep(2500);
    for (const id of ['ranges','calc','open','dmg','choose','price','about']) {
      await p.cdp.eval(`(function(){location.hash='${id}'; return true;})()`);
      await sleep(600);
      const h = await p.cdp.eval(`(function(){var e=document.getElementById('${id}'); if(!e) return -1; return Math.round(e.getBoundingClientRect().height);})()`);
      out.push(id + ' height=' + h);
    }
    out.push('EXC: ' + (p.cdp.logs.filter(x=>x.indexOf('exception')>=0||x.indexOf('console.error')>=0).join(' || ') || 'none'));
    out.push('LOGS: ' + (p.cdp.logs.slice(-5).join(' | ') || 'none'));
  } catch(e){ out.push('ERR '+e.message); }
  p.kill();
  console.log(out.join('\n'));
})();
