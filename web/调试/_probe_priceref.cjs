'use strict';
/* 行情面板场景测试：直接操作计算器控件（不靠文字识别，避免识别层干扰）
   14 个场景：3正带负 / 2正无负(同型池) / 冷门武器 / 近战含无行情词条 /
             组合枪 / 只填一条词条 / 组合元素×3 / 招架·震地 / 负词条严重度×2 /
             参考价分支。跑完自动截面板图到 调试/_shots/priceref_panel.png
   用法：node _probe_priceref.cjs [产物路径] */
const fs = require('fs');
const path = require('path');
const { openPage, toFileUrl, sleep } = require('./cdp.cjs');

const PAGE = process.argv[2] ||
  require('./cdp.cjs').latestProduct();

// 模拟器行号：4 暴击几率 / 5 暴击伤害 / 6 触发几率 / 9 冰冻伤害 / 19 多重射击 / 25 后坐力 / 27 初始连击
const SCENES = [
  { name: 'A 托里德 3正+负后坐力', w: '托里德', rows: [5, 19, 4, 25], vals: ['110', '90', '120', '40'] },
  { name: 'B 托里德 2正无负', w: '托里德', rows: [5, 19, 0, 0], vals: ['110', '90', '', ''] },
  { name: 'C cadus 冷门', w: 'cadus', rows: [9, 6, 0, 0], vals: ['80', '60', '', ''] },
  { name: 'D 近战含无行情词条(初始连击)', w: '翁', rows: [5, 27, 0, 0], vals: ['110', '5', '', ''] },
  { name: 'E 组合枪(捕月)应无行情', w: '捕月', rows: [5, 19, 0, 0], vals: ['110', '90', '', ''] },
  { name: 'F 只填一条词条', w: '托里德', rows: [5, 0, 0, 0], vals: ['110', '', '', ''] },
  /* 组合元素：以前 ROW_MAP 只写到 row 34，这几种一律被判「接口里没有对应词条」。
     row 36 毒气 / 38 病毒 / 37 腐蚀 / 35 状态伤害 现在都要能出价。 */
  { name: 'G 翁 毒气+暴伤（row 36）', w: '翁', rows: [36, 5, 0, 0], vals: ['120', '150', '', ''] },
  { name: 'H 努寇 病毒+多重（row 38）', w: '努寇', rows: [38, 19, 0, 0], vals: ['100', '90', '', ''] },
  { name: 'I 冷冻光束 腐蚀+暴伤（row 37）', w: '冷冻光束步枪', rows: [37, 5, 0, 0], vals: ['100', '140', '', ''] },
  /* 用户点名的两条：格挡角度（row 51 招架角度）/ 震地攻击伤害（row 52） */
  { name: 'J 战刃 招架角度+暴伤（row 51）', w: '战刃', rows: [51, 5, 0, 0], vals: ['90', '150', '', ''] },
  { name: 'K 双雄 震地攻击+暴伤（row 52）', w: '双雄', rows: [52, 5, 0, 0], vals: ['120', '150', '', ''] },
  /* 负词条严重度：同一组 3 正，-变焦（白送）必须比 -基础伤害（致命）贵，
     后者会把整池候选价格按面板折算往下压（托里德 Incarnon 29% 暴击）。
     注意负词条不能和正面词条重复（计算器禁止），所以致命负用 row 2 基础伤害 */
  { name: 'L 托里德 3正 -变焦（白送负）', w: '托里德', rows: [5, 19, 4, 26], vals: ['150', '100', '160', '40'] },
  { name: 'M 托里德 3正 -基础伤害（致命负）', w: '托里德', rows: [5, 19, 4, 2], vals: ['150', '100', '160', '60'] },
  /* 参考价分支：词条没填满 + 库里没有词条数相同的同款 → 以前直接「给不出三档价」，
     现在必须照样出三档参考价（拉特昂只填暴伤：放宽池 30p~6000p，价差 200×） */
  { name: 'N 拉特昂 只填暴伤（参考价分支）', w: '拉特昂', rows: [5, 0, 0, 0], vals: ['150', '', '', ''] },
];

(async () => {
  const { cdp, kill } = await openPage(toFileUrl(PAGE));
  try {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false });
    await sleep(2500);
    await cdp.eval(`location.hash='#calc'; 1`);
    await sleep(600);

    for (const sc of SCENES) {
      /* 先切武器并等重绘 —— renderCalc 会整块替换 #calc-body，
         同一帧里继续填词条操作的是旧 DOM（L/M 场景就是这么测歪的） */
      await cdp.eval(`(() => {
        const q = document.getElementById('q');
        q.value = ${JSON.stringify(sc.w)};
        q.dispatchEvent(new Event('input', { bubbles: true }));
        const cand = document.querySelector('#cands [data-i], #cands .cand, #cands li, #cands button');
        if (cand) cand.click();
        return !!cand;
      })()`);
      await sleep(450);
      await cdp.eval(`(() => {
        const setRow = (i, row) => {
          const s = document.querySelector('select[data-a="krow"][data-i="' + i + '"]');
          if (!s) return false;
          s.value = String(row);
          s.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        };
        const setVal = (i, v) => {
          const el = document.querySelector('input[data-a="kval"][data-i="' + i + '"]');
          if (!el) return false;
          el.value = v;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        };
        /* 先清空 4 个槽：切武器后上一场景的词条会保留，而计算器禁止重复词条，
           不清空的话新场景里与残留相同的行会被静默拒绝（L 场景就是这么测歪的） */
        [0, 1, 2, 3].forEach(function (i) { setRow(i, 0); setVal(i, ''); });
        ${JSON.stringify(sc.rows)}.forEach((r, i) => setRow(i, r));
        ${JSON.stringify(sc.vals)}.forEach((v, i) => { if (v !== '') setVal(i, v); });
        return 1;
      })()`);
      await sleep(400);

      const panel = await cdp.eval(`(() => {
        const c = document.querySelector('.pr-card');
        if (!c) return { err: '没有 .pr-card' };
        const g = (s) => [...c.querySelectorAll(s)].map(x => x.textContent.replace(/\\s+/g, ' ').trim());
        const cs = getComputedStyle(c);
        return {
          head: g('.pr-head'), prices: g('.pr-v'), meta: g('.pr-meta'),
          split: g('.pr-split'), ev: g('.pr-ev li'), empty: g('.pr-empty'), tips: g('.pr-tip'),
          h: Math.round(c.getBoundingClientRect().height),
          disp: cs.display, vis: cs.visibility,
          parentH: c.parentElement ? Math.round(c.parentElement.getBoundingClientRect().height) : -1
        };
      })()`);
      console.log('\n=== ' + sc.name + ' ===');
      console.log(JSON.stringify(panel, null, 1));
    }

    // 最后跑回场景 A 截图
    await cdp.eval(`(() => {
      const q = document.getElementById('q');
      q.value = '托里德'; q.dispatchEvent(new Event('input', { bubbles: true }));
      const cand = document.querySelector('#cands [data-i], #cands .cand, #cands li, #cands button');
      if (cand) cand.click();
      [5,19,4,25].forEach((r,i)=>{ const s=document.querySelector('select[data-a="krow"][data-i="'+i+'"]'); if(s){s.value=String(r);s.dispatchEvent(new Event('change',{bubbles:true}));} });
      ['110','90','120','40'].forEach((v,i)=>{ const e=document.querySelector('input[data-a="kval"][data-i="'+i+'"]'); if(e){e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));} });
      return 1;
    })()`);
    await sleep(500);
    const pos = await cdp.eval(`(() => {
      const c = document.querySelector('.pr-card');
      if (!c) return null;
      c.scrollIntoView({ block: 'center' });
      const r = c.getBoundingClientRect();
      /* CDP 的 clip 用页面绝对坐标，getBoundingClientRect 是视口坐标，要加滚动量 */
      return { x: Math.round(r.x), y: Math.round(r.y + window.scrollY),
               w: Math.round(r.width), h: Math.round(r.height) };
    })()`);
    console.log('\n面板位置:', JSON.stringify(pos));
    await sleep(300);
    if (pos && pos.h > 0) {
      const shot = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
        clip: { x: pos.x - 8, y: pos.y - 8, width: Math.min(1400, pos.w + 16), height: Math.min(1400, pos.h + 16), scale: 1 }
      });
      const shotDir = path.join(__dirname, '_shots');
      try { fs.mkdirSync(shotDir, { recursive: true }); } catch (e) { /* 权限问题就跳过截图 */ }
      const shotPath = path.join(shotDir, 'priceref_panel.png');
      try {
        fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
        console.log('截图 -> ' + shotPath);
      } catch (e) {
        console.log('截图写入失败（不影响断言）: ' + e.message);
      }
    }
    if (cdp.logs && cdp.logs.length) console.log('页面日志:', cdp.logs.slice(0, 6));
  } finally { kill(); }
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
