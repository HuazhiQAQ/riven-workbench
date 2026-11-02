'use strict';
/* 目录栏「现行版 / 倾向版」切换探针：
   ① 目录底部「倾向口径」分段控件存在且随口径点亮  ② 切换后 body[data-disp-variant] / ZKC.isUnified / 武器 disp / 标题联动
   ③ 每次打开都从现行版起步：切到倾向版后 reload，回到现行版且不写 localStorage
   ④ 数值联动：计算器倾向值、选中武器后区间表数值随口径重算且往返还原
   ⑤ 折叠态 mini 图标按钮可切换 */
const path = require('path');
const { openPage, toFileUrl } = require('./cdp.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const file = process.argv[2] || require('./cdp.cjs').latestProduct();
  const p = await openPage(toFileUrl(path.resolve(file)));
  const out = [];
  const ev = async expr => p.cdp.eval(expr);
  const clickD = d => ev(`(function(){var b=document.querySelector('.sb-seg [data-zk-d="${d}"]');if(!b)return 'MISSING';b.click();return 'ok';})()`);
  try {
    await sleep(2500);

    // ① 分段控件
    out.push('SEG: ' + await ev(`(function(){
      var b = document.querySelectorAll('.sb-seg [data-zk-d]');
      if (b.length !== 2) return 'BAD len=' + b.length;
      var on = document.querySelector('.sb-seg [data-zk-d].on');
      var mini = document.querySelector('.sb-mini [data-zk-d="cycle"]');
      return 'n=2 on=' + (on ? on.textContent : '?') + ' mini=' + (mini ? 'yes' : 'MISSING');
    })()`));

    // 基线：当前口径
    const base = {
      unified: await ev('ZKC.isUnified()'),
      w0: await ev('ZKDATA.weapons[0].disp'),
      du: await ev(`getComputedStyle(document.querySelector('[data-du-only]')).display`),
      dv: await ev(`getComputedStyle(document.querySelector('[data-dv-only]')).display`),
      title: await ev('document.title')
    };
    out.push('BASE: unified=' + base.unified + ' w0=' + base.w0 + ' du=' + base.du + ' dv=' + base.dv
      + ' vcls=' + await ev("!!document.body.hasAttribute('data-disp-variant')"));

    // ② 切到倾向版
    out.push('CLICK v: ' + await clickD('v'));
    await sleep(700);
    const v = {
      unified: await ev('ZKC.isUnified()'),
      w0: await ev('ZKDATA.weapons[0].disp'),
      snap0: await ev('ZKDATA.dispSnapshot[0]'),
      du: await ev(`getComputedStyle(document.querySelector('[data-du-only]')).display`),
      dv: await ev(`getComputedStyle(document.querySelector('[data-dv-only]')).display`),
      vcls: await ev("document.body.hasAttribute('data-disp-variant')"),
      title: await ev('document.title'),
      saved: await ev(`localStorage.getItem('zk-disp-mode')`),
      on: await ev(`(document.querySelector('.sb-seg [data-zk-d].on')||{textContent:''}).textContent`),
      note: await ev(`(document.getElementById('dispNote')||{textContent:''}).textContent.slice(-40)`)
    };
    out.push('VARIANT: unified=' + v.unified + ' w0=' + v.w0 + ' (snap0=' + v.snap0 + ') du=' + v.du + ' dv=' + v.dv
      + ' vcls=' + v.vcls + ' saved=' + v.saved + ' on=' + v.on);
    out.push('TITLE: ' + v.title);
    out.push('NOTE-TAIL: …' + v.note);

    // ④ 数值联动：计算器里倾向展示应随之变（选武器前的默认倾向文案）
    out.push('DISPTEXT: ' + await ev('ZKC.dispText()'));

    // ⑤ 功能1（倾向区间表）联动：选中武器后，sgx 区间表数值必须随口径重算
    const hashOf = s => { let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return h; };
    const sgxHash = () => ev(`(function(){var s='';var n=document.querySelectorAll('#sgxBodyN .sgx-box');for(var i=0;i<n.length;i++)s+=n[i].textContent+'|';return s;})()`).then(hashOf);
    const sel = await ev(`(function(){var w=ZKDATA.weapons[0];window.ZK_SEL=w;if(window.ZKSGXAPI)ZKSGXAPI.follow();return w.cat+'/'+w.disp;})()`);
    await clickD('v'); await clickD('u'); await sleep(600);   // 预热往返：口径归位 + cur 跟随选中武器
    const u0 = await ev('ZKC.isUnified()');
    const s1 = await sgxHash();
    const chip1 = await ev(`(document.getElementById('sgxSel')||{textContent:''}).textContent`);
    await clickD(u0 ? 'v' : 'u');
    await sleep(700);
    const s2 = await sgxHash();
    const chip2 = await ev(`(document.getElementById('sgxSel')||{textContent:''}).textContent`);
    await clickD(u0 ? 'u' : 'v');
    await sleep(700);
    const s3 = await sgxHash();
    const uEnd = await ev('ZKC.isUnified()');
    out.push('RANGES: sel=' + sel
      + ' calcChanged=' + (s1 !== s2) + ' restored=' + (u0 === uEnd && s1 === s3)
      + ' chip@' + (u0 ? 'u' : 'v') + '=' + JSON.stringify(chip1)
      + ' chip@' + (u0 ? 'v' : 'u') + '=' + JSON.stringify(chip2));

    // ⑤b 折叠态 mini 图标切换
    out.push('MINI-CLICK: ' + await ev(`(function(){var b=document.querySelector('.sb-mini [data-zk-d="cycle"]');if(!b)return 'MISSING';b.click();return 'ok unified=' + ZKC.isUnified();})()`));
    await clickD(u0 ? 'v' : 'u');   // 归位
    await sleep(400);

    // 切回基线口径
    await clickD(base.unified ? 'u' : 'v');
    await sleep(500);
    out.push('BACK: unified=' + await ev('ZKC.isUnified()')
      + ' w0=' + await ev('ZKDATA.weapons[0].disp')
      + ' vcls=' + await ev("document.body.hasAttribute('data-disp-variant')")
      + ' saved=' + await ev(`localStorage.getItem('zk-disp-mode')`)
      + ' title=' + await ev('document.title'));

    // ③ 每次打开都从现行版起步：切到倾向版后 reload，必须回到现行版、分段控件点亮「现行版」
    await clickD('v');
    await sleep(300);
    await ev('location.reload()');
    await sleep(2800);
    out.push('AFTER-RELOAD: unified=' + await ev('ZKC.isUnified()')
      + ' vcls=' + await ev("document.body.hasAttribute('data-disp-variant')")
      + ' w0=' + await ev('ZKDATA.weapons[0].disp')
      + ' on=' + await ev(`(document.querySelector('.sb-seg [data-zk-d].on')||{textContent:''}).textContent`)
      + ' saved=' + await ev(`localStorage.getItem('zk-disp-mode')`));

    out.push('EXC: ' + (p.cdp.logs.filter(x => x.indexOf('exception') >= 0 || x.indexOf('console.error') >= 0).join(' || ') || 'none'));
  } catch (e) { out.push('ERR ' + e.message); }
  p.kill();
  console.log(out.join('\n'));
})();
