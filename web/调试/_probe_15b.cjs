'use strict';
const path = require('path');
const { openPage, toFileUrl } = require('./cdp.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAJUlEQVR42u3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAB4NxmAAAG8wOBeAAAAAElFTkSuQmCC';
const feed = `(function(){
  var b=atob('${PNG}'), a=new Uint8Array(b.length);
  for(var i=0;i<b.length;i++) a[i]=b.charCodeAt(i);
  var f=new File([a],'t.png',{type:'image/png'});
  var dt=new DataTransfer(); dt.items.add(f);
  var inp=document.getElementById('ocrFile'); inp.files=dt.files;
  inp.dispatchEvent(new Event('change',{bubbles:true}));
  return true;
})()`;
(async () => {
  const p = await openPage(toFileUrl(path.resolve(process.argv[2] || require('./cdp.cjs').latestProduct())));
  const log = [];
  const q = async (e) => { try { return await p.cdp.eval(e); } catch(err){ return 'ERR:'+err.message; } };
  try {
    await sleep(2500);
    await q(feed);
    await sleep(2500);
    // 把 recognize 换成一个「慢 1.5 秒 + 故意返回一张假结果」的桩
    log.push('patch: ' + await q(`(function(){
      window.__stale = 0;
      window.RivenOCR.recognize = function(){
        return new Promise(function(res){
          setTimeout(function(){
            window.__stale++;
            res({ weapon: null, affixes: [], dropped: 0, rivenName: 'STALE_MARKER',
                  pol:'madurai', mr:8, rolls:5, rank:8, weaponCats:[] });
          }, 1500);
        });
      };
      return true;
    })()`));
    await q(`(function(){document.getElementById('ocrGo').click(); return true;})()`);
    await sleep(250);
    // 识别跑着的时候换图 → 代次 +1，旧结果必须作废
    await q(feed);
    await sleep(2600);
    log.push('stale 回调次数: ' + await q(`window.__stale`));
    log.push('状态栏: ' + await q(`(function(){var e=document.getElementById('ocrStatus');return e?e.textContent.replace(/\\s+/g,' ').trim().slice(0,70):'';})()`));
    log.push('是否被旧结果写入(已填入): ' + await q(`(document.getElementById('ocrStatus')||{}).textContent.indexOf('已填入')>=0`));
    log.push('识别历史条数: ' + await q(`document.querySelectorAll('#ocrHist [data-hidx],#ocrHist .ocr-hist-item,#ocrHist li').length`));
  } catch(e){ log.push('ERR '+e.message); }
  log.push('logs: ' + p.cdp.logs.slice(-6).join(' | '));
  p.kill();
  console.log(log.join('\n'));
})();
