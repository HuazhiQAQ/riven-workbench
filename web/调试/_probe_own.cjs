/* _probe_own.cjs —— 专属强化卡（m.ex）到底有没有被拦住
 * 用法: node _probe_own.cjs <产物.html>
 * 判据: 对一把「不是 ocucor」的手枪，sentient_surge 不得出现在可装列表里。
 */
'use strict';
const path = require('path');
const { openPage, toFileUrl } = require('./cdp.cjs');

(async () => {
  const file = process.argv[2] || require('./cdp.cjs').latestProduct();
  const p = await openPage(toFileUrl(path.resolve(file)));
  const out = [];
  try {
    await new Promise(r => setTimeout(r, 1500));
    const r = await p.cdp.eval(`(function(){
      var MODS = window.ZKMODS || [];
      var byId = {}; MODS.forEach(function(m){ byId[m.i]=m; });
      var surge = byId['sentient_surge'];
      var res = { hasSurge: !!surge, ex: surge ? surge.ex : null, t: surge ? surge.t : null };
      if (window.ZKMB && window.ZKMB.legal && surge) {
        res.legalOcucor = ZKMB.legal(surge, ['pistol'], 'ocucor', false);
        res.legalBraton = ZKMB.legal(surge, ['pistol'], 'braton', false);
        res.legalNoWid = ZKMB.legal(surge, ['pistol'], '', false);
      }
      return res;
    })()`);
    out.push('legal: ' + JSON.stringify(r));
  } catch (e) {
    out.push('ERR ' + e.message);
  }
  p.kill();
  console.log(out.join('\n'));
})();
