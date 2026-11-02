/* wash_n_e2e.cjs —— 03 区「洗 N 次」UI 回归（无头 Chrome + CDP，不装任何依赖）
 *
 *   node debug/wash_n_e2e.cjs [产物.html]
 *
 * 验的是 3.19 之后的口径：
 *   ① 「洗 N 次」每轮的**词条**都不同（3.18 那版只重掷数值，10 行长得一模一样）
 *   ② 锁定的槽在洗 N 次里保留
 *   ③ 点一行 = 整套套用（词条 + 数值一起换）
 *   ④ 普通「洗卡」之后：同一把武器的候选保留（签名只认武器与锁定槽，换武器 / 重新开卡才清榜）
 */
'use strict';
const path = require('path');
const { toFileUrl, openPage, sleep } = require('./cdp.cjs');

const DEFAULT_HTML = require('./cdp.cjs').latestProduct();

const CARD_STATE = `(() => {
  const w = document.getElementById('c2wrap');
  if (!w) return [];
  return [...w.querySelectorAll('select[data-a="slot"]')].map(s => {
    const i = s.dataset.i;
    const v = w.querySelector('input[data-a="val"][data-i="' + i + '"]');
    return { i, name: s.options[s.selectedIndex].text.trim(), val: v ? v.value : '' };
  });
})()`;

const ROWS_STATE = `(() => {
  const h = document.getElementById('rnList');
  if (!h) return [];
  return [...h.querySelectorAll('.on-row')].map(r => ({
    hd: (r.querySelector('.on-hd') || {}).textContent || '',
    aff: [...r.querySelectorAll('.on-afs .af')].map(a => a.textContent.trim()),
  }));
})()`;

async function main() {
  const htmlPath = process.argv[2] || DEFAULT_HTML;
  const page = await openPage(toFileUrl(htmlPath, '#/open'));
  const cdp = page.cdp;
  const step = (s) => console.log('\n── ' + s);
  try {
    /* 等页面脚本就绪 + 03 区已渲染（按钮在静态 HTML 里就有，只等按钮会早于 init） */
    const ready = `document.readyState === 'complete' && !!window.ZKDATA
      && !!document.getElementById('c2') && document.getElementById('c2').children.length > 0
      && !!document.getElementById('rnRun')`;
    for (let i = 0; i < 120; i++) {
      const v = await cdp.eval('!!(' + ready + ')');
      if (v === true) break;
      await sleep(500);
    }

    step('开一张卡');
    let card = [];
    for (let k = 0; k < 4 && !card.length; k++) {
      await cdp.eval('document.querySelector(\'[data-a="open"]\').click(); true');
      await sleep(1200);
      card = await cdp.eval('document.querySelectorAll("#c2 select[data-a=\\"slot\\"]").length');
    }
    console.log('   开出来的卡（#c2）词条数: ' + card);

    step('洗一次卡（#c2wrap 要等洗卡才有词条）');
    for (let k = 0; k < 4; k++) {
      await cdp.eval('document.querySelector(\'[data-a="rerollActive"]\').click(); true');
      await sleep(900);
      card = await cdp.eval(CARD_STATE);
      if (card.length) break;
    }
    console.log('   卡面词条: ' + JSON.stringify(card.map(c => c.name + ' ' + c.val)));
    if (!card.length) throw new Error('洗卡后 #c2wrap 里没有词条表');

    step('锁住第 1 条');
    await cdp.eval(`(() => {
      const s = document.querySelector('#c2wrap select[data-a="lock"][data-i="0"]');
      if (!s) return 'no-select';
      s.value = '1';
      s.dispatchEvent(new Event('change', { bubbles: true }));
      return 'ok';
    })()`);
    await sleep(600);
    const locked = await cdp.eval(`(() => {
      const w = document.getElementById('c2wrap');
      const s = w.querySelector('select[data-a="slot"][data-i="0"]');
      const v = w.querySelector('input[data-a="val"][data-i="0"]');
      const lk = w.querySelector('select[data-a="lock"][data-i="0"]');
      return JSON.stringify({ name: s ? s.options[s.selectedIndex].text.trim() : '', val: v ? v.value : '', lock: lk ? lk.value : '?' });
    })()`);
    const L = JSON.parse(locked);
    console.log('   锁定槽 0 = ' + L.name + ' ' + L.val + '（lock=' + L.lock + '）');

    step('洗 N 次（300 轮）');
    await cdp.eval(`(() => { const n = document.getElementById('rnN'); if (n) n.value = '300'; return true; })()`);
    await cdp.eval('document.getElementById("rnRun").click(); true');
    let rows = [];
    for (let i = 0; i < 60; i++) {
      rows = await cdp.eval(ROWS_STATE);
      if (rows.length) break;
      await sleep(500);
    }
    console.log('   候选行数: ' + rows.length);
    rows.forEach((r, i) => console.log('   ' + (i + 1) + '. ' + r.hd.replace(/\s+/g, ' ').trim() + '  → ' + r.aff.join(' | ')));
    if (!rows.length) throw new Error('洗 N 次没有出候选');

    // ① 词条必须真的不一样（归一化：去掉数值与派系倍率前缀，只留词条名）
    const norm = (a) => a.replace(/×\s*[\d.]+/g, '').replace(/[-+−]?[\d.,%]+/g, '').replace(/\s+/g, '');
    const sig = rows.map(r => r.aff.map(norm).join('|'));
    const uniq = new Set(sig).size;
    console.log('   10 行的词条组合去重后 = ' + uniq + ' 种');
    if (uniq < 3) throw new Error('候选行词条几乎一样（洗 N 次 没在重抽词条？）');

    // ② 锁定槽必须保留
    const keep = rows.filter(r => r.aff.some(a => norm(a).indexOf(norm(L.name)) >= 0)).length;
    console.log('   含锁定词条「' + L.name + '」的行: ' + keep + '/' + rows.length);
    if (keep !== rows.length) throw new Error('锁定槽没被保留');

    step('点第 1 行套用');
    await cdp.eval('document.querySelectorAll("#rnList .on-row")[0].click(); true');
    await sleep(900);
    const after = await cdp.eval(CARD_STATE);
    console.log('   套用后卡面: ' + JSON.stringify(after.map(c => c.name + ' ' + c.val)));
    const row0Names = rows[0].aff.map(norm);
    const names = after.map(c => norm(c.name));
    const hit = row0Names.every(n => names.indexOf(n) >= 0);
    console.log('   与第 1 行词条一致: ' + hit);
    if (!hit) throw new Error('套用后词条没对上：期望 ' + JSON.stringify(row0Names) + '，实际 ' + JSON.stringify(names));

    step('普通「洗卡」之后：同武器的候选保留，仍可整套套用');
    await cdp.eval('document.querySelector(\'[data-a="rerollActive"]\').click(); true');
    await sleep(900);
    const rows2 = await cdp.eval(ROWS_STATE);
    console.log('   洗卡后候选行数: ' + rows2.length + '（同武器，期望保留）');
    if (!rows2.length) throw new Error('普通洗卡后同一把武器的候选被清空');

    const errs = cdp.logs.filter(l => /exception|\[console\.error\]/.test(l));
    console.log('\n' + (errs.length ? ('页面报错 ' + errs.length + ' 条:') : '页面无 JS 报错。'));
    errs.slice(0, 6).forEach(l => console.log('  ' + l.slice(0, 240)));
    console.log('\n✓ 洗 N 次回归全过');
  } catch (e) {
    console.error('\n✗ 失败: ' + (e && e.message || e));
    process.exitCode = 1;
  } finally {
    page.kill();
  }
}

main();
