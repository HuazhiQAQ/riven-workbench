/* _probe_price.cjs —— 功能 6「紫卡价值表」验收（双服 / 数据驱动列 / 排序 / 列菜单 / 导出）
   数据与列全部由 window.ZKPRICE 描述，断言里不写死列名顺序，只按可见列反查下标。 */
'use strict';
const { openPage, toFileUrl } = require('./cdp.cjs');
const path = require('path');
const FILE = process.argv[2] || require('./cdp.cjs').latestProduct();
const PAGE_URL = toFileUrl(path.resolve(__dirname, FILE), '#/price');
let fail = 0;
function ck(msg, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + msg + ' | got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want));
  if (!ok) fail++;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  setTimeout(function () { console.error('WATCHDOG'); process.exit(3); }, 180000);
  const pg = await openPage(PAGE_URL);
  const ev = e => pg.cdp.eval(e);
  await ev(`(function(){return new Promise(function(res){var n=0;(function p(){
    if(window.ZKPRICE&&document.querySelectorAll('#priceTb tr').length>0) return res(1);
    if(++n>240) return res(0); setTimeout(p,150);})();});})()`);
  await sleep(600);

  /* 0) 先把语言钉在「国际服」，两服的默认服才确定 */
  await ev(`(function(){var b=document.querySelector('#langFloatPanel button[data-i="1"]'); if(b)b.click(); return 1;})()`);
  await sleep(400);

  /* 1) 分区与导航 */
  const sec = await ev(`(function(){
    var s=document.getElementById('price'); if(!s) return null;
    var r=s.getBoundingClientRect();
    return { h:Math.round(r.height), n:(s.querySelector('.sec-n')||{}).textContent||'',
             nav:!!document.querySelector('#topNav a[href="#price"]'), disp:getComputedStyle(s).display };
  })()`);
  ck('功能6分区存在', !!sec, true);
  ck('分区可见（高度>0 且 display:block）', [sec.h > 100, sec.disp], [true, 'block']);
  ck('编号 06', sec.n, '06');
  ck('导航有紫卡价值表锚点', sec.nav, true);

  /* 2) 数据结构：两服各 419 行，列由数据描述 */
  const meta = await ev(`(function(){
    var P=window.ZKPRICE;
    function d(s){ var x=P[s]; return { rows:x.rows.length, cols:x.cols.length,
      has:(x.rows.filter(function(r){return (+r[x.emptyKey]||0)>0;})).length,
      kpis:(x.kpis||[]).length, sort:x.defaultSort, ek:x.emptyKey }; }
    return { stores:Object.keys(P), intl:d('intl'), cn:d('cn') };
  })()`);
  ck('两服都在（intl + cn）', meta.stores, ['intl', 'cn']);
  ck('国际服 419 行 / 11 列', [meta.intl.rows, meta.intl.cols], [419, 11]);
  ck('国服 419 行 / 11 列', [meta.cn.rows, meta.cn.cols], [419, 11]);
  ck('默认排序列 = med', [meta.intl.sort, meta.cn.sort], ['med', 'med']);
  ck('有数据行数：国际服 419 / 国服 351', [meta.intl.has, meta.cn.has], [419, 351]);

  /* 3) 服按钮 + 默认服 */
  const stores0 = await ev(`(function(){
    var a=[]; [].slice.call(document.querySelectorAll('#priceStore .prx-sbtn')).forEach(function(b){ a.push(b.getAttribute('data-s')); });
    var on=document.querySelector('#priceStore .prx-sbtn.on');
    return { all:a, on:on?on.getAttribute('data-s'):null, src:(document.getElementById('priceSrc').textContent||'').slice(0,12) };
  })()`);
  ck('服切换按钮两个', stores0.all, ['intl', 'cn']);
  ck('默认选中国际服', stores0.on, 'intl');
  ck('采集口径文案非空', stores0.src.length > 4, true);

  /* 4) 默认表头 = 除 hide 外的全部列，且第一列是名字列 */
  const head0 = await ev(`(function(){
    var ks=[]; [].slice.call(document.querySelectorAll('#priceTh th')).forEach(function(t){ ks.push(t.getAttribute('data-k')); });
    return ks;
  })()`);
  const visWant = await ev(`window.ZKPRICE.intl.cols.filter(function(c){return !c.hide;}).map(function(c){return c.k;})`);
  ck('可见列 = 数据里未标 hide 的列', head0, visWant);
  ck('默认 10 列（倾向列默认收起）', head0.length, 10);
  ck('默认无「倾向」列', head0.indexOf('dispo') < 0 && (await ev(`window.ZKPRICE.intl.cols.some(function(c){return c.k==='dispo';})`)), true);
  ck('列数徽标 10/11', await ev(`document.getElementById('priceColNum').textContent`), '10/11');

  /* 5) 默认行数 = 有成交行数，且中位价列每行都有值 */
  const medIx = head0.indexOf('med');          /* tr.children 是 0 基 */
  const rows0 = await ev(`document.querySelectorAll('#priceTb tr').length`);
  ck('默认只列有数据的武器（国际服 419）', rows0, 419);
  const medFilled = await ev(`(function(){
    var n=0;
    [].slice.call(document.querySelectorAll('#priceTb tr')).forEach(function(tr){
      var td=tr.children[${medIx}]; if(td && td.textContent.trim() !== '—') n++;
    });
    return n;
  })()`);
  ck('每行中位价都有值', medFilled, rows0);
  ck('量级条画出来了', await ev(`document.querySelectorAll('#priceTb .prx-bar i').length > 100`), true);

  /* 6) 搜索：中文 / 全拼 / 首字母 / 英文 */
  const hitsOf = async (q) => {
    await ev(`(function(){var e=document.getElementById('priceQ'); e.value=${JSON.stringify(q)}; e.dispatchEvent(new Event('input',{bubbles:true})); return 1;})()`);
    await sleep(220);
    return ev(`(function(){var a=[]; [].slice.call(document.querySelectorAll('#priceTb td.name')).forEach(function(t){a.push(t.textContent.trim());}); return a;})()`);
  };
  for (const q of ['托里德', 'tuolide', 'Torid']) {
    const r = await hitsOf(q);
    ck('搜「' + q + '」命中托里德 1 行', [r.length, r.length === 1 && r[0].indexOf('托里德') === 0], [1, true]);
  }
  /* 首字母是子串匹配，'tld' 会顺带命中 斯特拉迪瓦（stldw），只要求命中托里德 */
  const tld = await hitsOf('tld');
  ck('搜「tld」命中托里德', [tld.length <= 3, tld.some(function (x) { return x.indexOf('托里德') === 0; })], [true, true]);

  /* 7) 空态提示 */
  const none = await hitsOf('嫣红');
  ck('搜「嫣红」（开不出卡）无结果', none, []);
  ck('无结果时显示空态提示', await ev(`!document.getElementById('priceEmpty').hidden`), true);
  await hitsOf('');

  /* 8) 类型下拉筛选 */
  const typeList = await ev(`(function(){var s=document.getElementById('priceType'); return [].slice.call(s.options).map(function(o){return o.value;});})()`);
  ck('类型下拉第一项=全部类型', typeList[0], '');
  await ev(`(function(){var s=document.getElementById('priceType'); s.value='近战'; s.dispatchEvent(new Event('change',{bubbles:true})); return 1;})()`);
  await sleep(300);
  const typeCells = await ev(`(function(){var a=[]; [].slice.call(document.querySelectorAll('#priceTb tr')).forEach(function(tr){ a.push(tr.children[1].textContent.trim()); }); return {n:a.length, bad:a.filter(function(x){return x!=='近战';}).length}; })()`);
  ck('近战筛选生效', [typeCells.n > 0, typeCells.bad], [true, 0]);
  await ev(`(function(){var s=document.getElementById('priceType'); s.value=''; s.dispatchEvent(new Event('change',{bubbles:true})); return 1;})()`);
  await sleep(300);

  /* 9) 排序：默认降序 → 点一次升序 → 再点回降序 */
  const medSeq = () => ev(`(function(){var a=[]; [].slice.call(document.querySelectorAll('#priceTb tr')).slice(0,6).forEach(function(tr){
    a.push(parseFloat((tr.children[${medIx}].textContent||'').replace(/[^0-9.]/g,'')));}); return a;})()`);
  const seq0 = await medSeq();
  ck('默认中位价降序', seq0.every((v, i) => i === 0 || seq0[i - 1] >= v), true);
  await ev(`(function(){document.querySelector('#priceTh th[data-k="med"]').click(); return 1;})()`);
  await sleep(250);
  const seq1 = await medSeq();
  ck('点一次转升序', seq1.every((v, i) => i === 0 || seq1[i - 1] <= v), true);
  await ev(`(function(){document.querySelector('#priceTh th[data-k="med"]').click(); return 1;})()`);
  await sleep(250);
  const seq2 = await medSeq();
  ck('再点回降序', seq2.every((v, i) => i === 0 || seq2[i - 1] >= v), true);

  /* 10) 列菜单：默认 11 个勾选项、名字列锁定；取消均价 → 列数 -1；恢复默认 → 回来 */
  await ev(`(function(){document.getElementById('priceColBtn').click(); return 1;})()`);
  await sleep(250);
  const menu = await ev(`(function(){
    var m=document.getElementById('priceColMenu');
    var cbs=[].slice.call(m.querySelectorAll('input[data-k]'));
    return { on:m.classList.contains('on'), n:cbs.length,
             lock:(m.querySelector('label.lock input')||{}).getAttribute ? m.querySelector('label.lock input').getAttribute('data-k') : null,
             checked:cbs.filter(function(c){return c.checked;}).length };
  })()`);
  ck('列菜单可打开', menu.on, true);
  ck('菜单列全部 11 项', menu.n, 11);
  ck('名字列锁定不可关', menu.lock, 'zh');
  ck('默认勾选 10 项', menu.checked, 10);
  const toggled = await ev(`(function(){
    var cb=document.querySelector('#priceColMenu input[data-k="avg"]');
    cb.checked=false; cb.dispatchEvent(new Event('change',{bubbles:true}));
    return document.querySelectorAll('#priceTh th').length;
  })()`);
  ck('取消「均价」后可见列 -1', toggled, 9);
  ck('均价列已消失', await ev(`!document.querySelector('#priceTh th[data-k="avg"]')`), true);
  const restored = await ev(`(function(){
    document.getElementById('priceColDef').click();
    return document.querySelectorAll('#priceTh th').length;
  })()`);
  ck('点「恢复默认」回到 10 列', restored, 10);
  await ev(`(function(){document.body.click(); return 1;})()`);
  await sleep(200);
  ck('点空白处菜单收起', await ev(`!document.getElementById('priceColMenu').classList.contains('on')`), true);

  /* 11) 切国服：口径文案 / 卡片 / 计数单位 / 行数 / 开关文案 全跟着换 */
  await ev(`(function(){document.querySelector('#priceStore .prx-sbtn[data-s="cn"]').click(); return 1;})()`);
  await sleep(500);
  const cn = await ev(`(function(){
    var on=document.querySelector('#priceStore .prx-sbtn.on');
    return { on:on?on.getAttribute('data-s'):null,
             src:(document.getElementById('priceSrc').textContent||''),
             lab:(document.getElementById('priceEmptyLab').textContent||''),
             stat:(document.getElementById('priceStat').textContent||''),
             cards:document.querySelectorAll('#priceCards .pr-card').length,
             rows:document.querySelectorAll('#priceTb tr').length,
             cols:document.querySelectorAll('#priceTh th').length };
  })()`);
  ck('切到国服', cn.on, 'cn');
  ck('采集口径换成国服', cn.src.indexOf('在售') >= 0, true);
  ck('开关文案换成「0 在售」', cn.lab.indexOf('在售') >= 0, true);
  ck('计数单位换成「在售」', cn.stat.indexOf('在售') >= 0, true);
  ck('概览卡片 4 张', cn.cards, 4);
  ck('国服默认只列有在售的（351）', cn.rows, 351);
  ck('国服可见列同样 10 列', cn.cols, 10);

  /* 12) 「显示 0 在售」开关 → 全量 419 行，且空壳行带 pr-void */
  await ev(`(function(){var c=document.getElementById('priceShowEmpty'); c.checked=true; c.dispatchEvent(new Event('change',{bubbles:true})); return 1;})()`);
  await sleep(400);
  const all = await ev(`(function(){return {rows:document.querySelectorAll('#priceTb tr').length, voidRows:document.querySelectorAll('#priceTb tr.pr-void').length};})()`);
  ck('勾上后行数=全量 419', all.rows, 419);
  ck('没在售的行标了 pr-void', all.voidRows, 419 - 351);
  await ev(`(function(){var c=document.getElementById('priceShowEmpty'); c.checked=false; c.dispatchEvent(new Event('change',{bubbles:true})); return 1;})()`);
  await sleep(300);

  /* 13) 国服名单里没有「变体·有本体」的武器（与开卡池口径一致） */
  const badVar = await ev(`(function(){
    var Z=window.ZKDATA, P=window.ZKPRICE;
    var badSet={};
    Z.weapons.forEach(function(w){ if(w.var==='变体·有本体' && w.cn) badSet[w.cn]=1; });
    var bad=[];
    P.cn.rows.forEach(function(r){ if(badSet[r.zh]) bad.push(r.zh); });
    return bad.slice(0,5);
  })()`);
  ck('表里无「变体·有本体」武器', badVar, []);

  /* 14) 语言 ↔ 服联动：切 English 名字变拉丁，且服回到国际服 */
  const beforeName = await ev(`(function(){return (document.querySelector('#priceTb td.name')||{}).textContent||'';})()`);
  await ev(`(function(){var b=document.querySelector('#langFloatPanel button[data-i="2"]'); if(b)b.click(); return 1;})()`);
  await sleep(500);
  const afterEn = await ev(`(function(){
    var tr=document.querySelector('#priceTb td.name');
    var on=document.querySelector('#priceStore .prx-sbtn.on');
    return { name:tr?tr.textContent.trim():'', store:on?on.getAttribute('data-s'):null };
  })()`);
  ck('切 English 后武器名变英文', [beforeName.indexOf(afterEn.name) === 0 || afterEn.name !== beforeName, /[A-Za-z]/.test(afterEn.name)], [true, true]);
  ck('切 English 后服跟随回国际服', afterEn.store, 'intl');
  await ev(`(function(){var b=document.querySelector('#langFloatPanel button[data-i="1"]'); if(b)b.click(); return 1;})()`);
  await sleep(400);
  ck('切回国际服语言后仍是 419 行', await ev(`document.querySelectorAll('#priceTb tr').length`), 419);

  /* 14b) 类型名统一口径：霰弹 / 曲翼 / Zaw（数据里仍存 霰弹枪 / 曲翼武器） */
  const typeInfo = await ev(`(function(){
    var opts = [].slice.call(document.querySelectorAll('#priceType option'))
      .map(function (o) { return o.textContent.trim(); });
    var th = [].slice.call(document.querySelectorAll('#priceTh th')), ti = -1;
    for (var i = 0; i < th.length; i++) if (th[i].textContent.indexOf('类型') >= 0) ti = i;
    var set = {};
    if (ti >= 0) [].slice.call(document.querySelectorAll('#priceTb tr')).forEach(function (tr) {
      var t = ((tr.children[ti] || {}).textContent || '').trim();
      if (t) set[t] = 1;
    });
    return { opts: opts, ti: ti, types: Object.keys(set).sort() };
  })()`);
  ck('类型列可见', typeInfo.ti >= 0, true);
  ck('下拉里没有旧写法（霰弹枪 / 曲翼武器）',
    typeInfo.opts.filter(function (t) { return t.indexOf('霰弹枪') >= 0 || t.indexOf('曲翼武器') >= 0; }), []);
  ck('下拉里有 霰弹 / 曲翼 / Zaw',
    ['霰弹', '曲翼', 'Zaw'].every(function (t) { return typeInfo.opts.indexOf(t) >= 0; }), true);
  ck('表格类型列里没有旧写法', typeInfo.types.filter(function (t) {
    return t.indexOf('霰弹枪') >= 0 || t.indexOf('曲翼武器') >= 0; }), []);
  ck('表格类型列里有 霰弹 / 曲翼',
    ['霰弹', '曲翼'].every(function (t) { return typeInfo.types.indexOf(t) >= 0; }), true);

  /* 筛选仍按原始串比对：选「霰弹」这一项只出霰弹 */
  await ev(`(function(){ var s = document.getElementById('priceType');
    s.value = '霰弹枪'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
  await sleep(400);
  const shotOnly = await ev(`(function(){
    var th = [].slice.call(document.querySelectorAll('#priceTh th')), ti = -1;
    for (var i = 0; i < th.length; i++) if (th[i].textContent.indexOf('类型') >= 0) ti = i;
    var set = {};
    [].slice.call(document.querySelectorAll('#priceTb tr')).forEach(function (tr) {
      var t = ((tr.children[ti] || {}).textContent || '').trim();
      if (t) set[t] = 1;
    });
    return { types: Object.keys(set), n: document.querySelectorAll('#priceTb tr').length };
  })()`);
  ck('按「霰弹」筛选只出霰弹且非空', [shotOnly.types, shotOnly.n > 0], [['霰弹'], true]);
  await ev(`(function(){ var s = document.getElementById('priceType');
    s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
  await sleep(400);

  /* 15) 导出按钮在、且没有页面异常 */
  ck('导出 CSV 按钮存在', await ev(`!!document.getElementById('priceCsv')`), true);
  const exc = await ev(`(window.__errs||[]).length`);
  ck('无页面异常', exc, 0);
  const logs = pg.cdp.logs.filter(x => /exception|console\.error/i.test(x));
  ck('控制台无异常日志', logs.slice(0, 3), []);

  pg.kill();
  console.log(fail ? ('RESULT: ' + fail + ' FAIL') : 'RESULT: ALL PASS');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e && e.message || e); process.exit(2); });
