/* _probe_namematch.cjs —— 武器名归一化回归：任何写法都要落到同一把武器
 *
 *   node _probe_namematch.cjs [产物.html]
 *
 * 验的是 ZKC.matchWeapons（app.js findWeapon 与 modpanel weaponHits 都走它）：
 *   ① 前缀变体族：赤毒/信条/终幕/圣装 —— 原样、加「·」、加「・」、加空格、逐字空格
 *   ② 英文：原样、大写、去空格、加连字符
 *   ③ 本体名 = 本体那把（不能命中同族的变体）
 *   ④ 玩家黑话别名（WEAPON_ALIAS，如「奶锤」→ 执法者）
 *   ⑤ 空串 / 纯符号不炸
 */
'use strict';
const path = require('path');
const { toFileUrl, openPage, sleep, latestProduct } = require('./cdp.cjs');

const FILE = process.argv[2] || latestProduct();

(async () => {
  const p = await openPage(toFileUrl(path.resolve(FILE), '#/'));
  const cdp = p.cdp;
  let bad = 0;
  try {
    for (let i = 0; i < 120; i++) {
      const v = await cdp.eval('document.readyState === "complete" && !!window.ZKC && !!window.ZKDATA && !!window.ZKC.matchWeapons');
      if (v === true) break;
      await sleep(500);
    }
    const ready = await cdp.eval('!!(window.ZKC && window.ZKC.matchWeapons)');
    if (!ready) { console.log('✗ 页面没有 ZKC.matchWeapons'); process.exit(1); }

    const js = `(() => {
      const V = window.ZKDATA.weapons;
      const MW = window.ZKC.matchWeapons;
      const top = q => { const r = MW(q, V, 5); return r.length ? V[r[0]] : null; };
      const res = { total: 0, fail: [], sample: [] };
      const chk = (q, wantEn, tag) => {
        res.total++;
        const w = top(q);
        const got = w ? w.en : '(无)';
        if (got !== wantEn) res.fail.push({ q, want: wantEn, got, tag });
      };
      const PRE = ['赤毒', '信条', '终幕', '圣装'];

      /* ① 中文前缀变体族 */
      V.forEach(w => {
        const cn = w.cn || '';
        const pre = PRE.find(x => cn.indexOf(x) === 0);
        if (pre) {
          const rest = cn.slice(pre.length);
          chk(cn, w.en, '原样');
          chk(pre + '·' + rest, w.en, '间隔号');
          chk(pre + '・' + rest, w.en, '中点');
          chk(pre + ' ' + rest, w.en, '空格');
          chk(pre + '　' + rest, w.en, '全角空格');
          chk(pre + ' ' + rest.split('').join(' '), w.en, '逐字空格');
          chk(pre + '.' + rest, w.en, '句点');
        }
      });

      /* ② 英文形态 */
      V.forEach(w => {
        const en = w.en || '';
        if (!en) return;
        chk(en.toUpperCase(), w.en, '英文大写');
        chk(en.replace(/\\s+/g, ''), w.en, '英文去空格');
        chk(en.replace(/\\s+/g, '-'), w.en, '英文连字符');
      });

      /* ③ 本体名要落到本体 */
      V.forEach(w => {
        if (w.var !== '变体·有本体' || !w.bcn) return;
        const base = V.find(x => x.var === '本体' && x.cn === w.bcn);
        if (base) chk(w.bcn, base.en, '本体优先');
      });

      /* ④ 别名（ZKC.ALIAS：玩家错写 → 正式名），键要能吃下分隔符变体 */
      const AL = window.ZKC.ALIAS || {};
      Object.keys(AL).forEach(nick => {
        const want = AL[nick];
        ['', '·', ' ', '　'].forEach(sep => {
          const q = nick.length > 1 && sep ? nick[0] + sep + nick.slice(1) : nick;
          res.total++;
          const w = top(q);
          if (!w || w.cn !== want) res.fail.push({ q, want, got: w ? w.cn : '(无)', tag: '别名' });
        });
      });

      /* ⑤ 空串 / 纯符号 */
      [[''], ['   '], ['···'], ['---']].forEach(([q]) => {
        res.total++;
        let n = -1;
        try { n = MW(q, V, 5).length; } catch (e) { n = -2; }
        if (n !== 0) res.fail.push({ q, want: '0 条', got: String(n), tag: '空串' });
      });

      /* ⑥ 词条名：同一个概念的不同写法都要落到同一行 */
      const MS = window.ZKC.matchStat;
      const srow = (q, want, tag) => {
        res.total++;
        const got = MS(q, window.ZKDATA.stats);
        if (got !== want) res.fail.push({ q, want: String(want), got: String(got), tag });
      };
      /* 用户点名的一组 */
      ['damage VS corpus', 'damage vs. corpus', 'damage to corpus', 'damage for corpus',
       'damage against corpus', '对科普斯的伤害', '对Corpus的伤害', '对corpus伤害',
       '对科普斯伤害', '对科普斯 的 伤害'].forEach(q => srow(q, 16, '词条归一'));
      /* 另外两个派系 */
      ['Damage vs. Grineer', '对克隆尼伤害', 'damage to grineer'].forEach(q => srow(q, 17, '词条归一'));
      ['Damage vs. Infested', 'damage to infested', '对异变感染体的伤害',
       '对异变感染体伤害', '对感染体的伤害'].forEach(q => srow(q, 18, '词条归一'));
      /* 交易站三个新派系（价库里各占一行，不能互相串） */
      ['对科腐者的伤害', 'Damage vs Techrot'].forEach(q => srow(q, 43, '词条归一'));
      ['对炽蛇军的伤害', 'Damage vs Scaldra'].forEach(q => srow(q, 44, '词条归一'));
      ['对奥罗金的伤害'].forEach(q => srow(q, 42, '词条归一'));
      /* 词条自己的名字必须还能回到自己那一行（滚动区 2~34） */
      window.ZKDATA.stats.forEach(s2 => {
        if (s2.row > 34) return;
        if (s2.cn) srow(s2.cn, s2.row, '词条原名');
        if (s2.en) srow(s2.en, s2.row, '词条原名');
      });
      /* 无关文本不能乱认 */
      ['随便写点什么', 'abc', '伤害', 'damage'].forEach(q => srow(q, 0, '误认防护'));

      /* ⑦ 引擎显示名 === 命名表（证明名字换源后内容没变） */
      const RR2 = window.RIVEN_ROUTER || {};
      const SK2 = window.ZKNAMES.statKeys || [];
      const JUNK3 = /[\[\]']/;
      SK2.forEach(e3 => {
        if (!e3 || !e3.key || !e3.cn) return;
        const st3 = RR2.STAT_BY_K && RR2.STAT_BY_K[e3.key];
        if (!st3) return;
        res.total++;
        if (st3.n !== e3.cn) res.fail.push({ q: 'STAT_BY_K.' + e3.key + '.n', want: e3.cn, got: st3.n, tag: '引擎名' });
        if (JUNK3.test(st3.n)) res.fail.push({ q: 'STAT_BY_K.' + e3.key + '.n', want: '无方括号引号残渣', got: st3.n, tag: '引擎名脏' });
      });

      /* ⑧ 收益引擎 STAT_POOL 显示名 === 命名表（eng 优先，缺省 cn） */
      const POOL3 = (window.WF && window.WF.STAT_POOL) || [];
      SK2.forEach(e3 => {
        if (!e3 || !e3.key) return;
        const p3 = POOL3.filter(x => x && x.k === e3.key)[0];
        if (!p3) return;
        res.total++;
        const want3 = e3.eng || e3.cn;
        if (p3.n !== want3) res.fail.push({ q: 'STAT_POOL.' + e3.key + '.n', want: want3, got: p3.n, tag: '引擎池名' });
        if (JUNK3.test(p3.n)) res.fail.push({ q: 'STAT_POOL.' + e3.key + '.n', want: '无残渣', got: p3.n, tag: '引擎池脏' });
      });
      if (!POOL3.length) {
        res.total++;
        res.fail.push({ q: 'WF.STAT_POOL', want: '非空', got: '空', tag: '引擎池' });
      }

      /* ⑨ 价库里只许有 slug：每个 slug 都要经 stats 落到命名表的键，且键能出名字 */
      const PDB = window.ZKPRICEDB || {};
      const ZC3 = window.ZKC;
      const SLUG3 = /^[A-Za-z0-9_\/]+$/;
      const slugs3 = {};
      const addS = s => { if (s) slugs3[String(s).trim()] = 1; };
      Object.keys(PDB.single || {}).forEach(L => {
        ['pos', 'neg'].forEach(g => (PDB.single[L][g] || []).forEach(it => {
          addS(it && it.k);
          res.total++;
          if (it && it.n) res.fail.push({ q: '价库 single 残留中文名 ' + JSON.stringify(it.n), want: '只存 k', got: it.n, tag: '价库名' });
        }));
      });
      Object.keys(PDB.combos || {}).forEach(L => {
        (PDB.combos[L] || []).forEach(it => {
          (it.ks || []).forEach(addS);
          if (it.gk) addS(it.gk);
          res.total++;
          if (it && (it.p || it.g)) res.fail.push({ q: '价库 combos 残留中文名', want: '只存 ks/gk', got: (it.p || '') + ' / ' + (it.g || ''), tag: '价库名' });
        });
      });
      Object.keys(slugs3).forEach(s => {
        res.total++;
        if (!SLUG3.test(s)) {
          res.fail.push({ q: '价库 slug ' + JSON.stringify(s), want: '纯 slug', got: s, tag: '价库名' });
          return;
        }
        const row = (PDB.stats || {})[s];
        if (row == null) {
          res.fail.push({ q: '价库 slug ' + s, want: 'stats 里有行号', got: '缺', tag: '价库名' });
          return;
        }
        const zr = (window.ZKDATA && window.ZKDATA.stats) || [];
        const hit = zr.filter(x => x && +x.row === +row)[0];
        if (!hit || !hit.cn) {
          res.fail.push({ q: '价库 slug ' + s + ' 行 ' + row, want: '词条表里有这一行', got: '没有', tag: '价库名' });
        }
      });

      /* ⑩ 六个派系各自显示自己的名字，不能被 fac 一个通用键压平 */
      const FAC = [['damage_vs_corpus', '对科普斯'], ['damage_vs_grineer', '对克隆尼'],
                   ['damage_vs_infested', '对异变体'], ['damage_to_orokin', '对奥罗金'],
                   ['damage_to_scaldra', '对炽蛇军'], ['damage_to_techrot', '对科腐者']];
      FAC.forEach(p => {
        res.total++;
        const nm = window.ZKPRICEREF && window.ZKPRICEREF.statName ? window.ZKPRICEREF.statName(p[0]) : '';
        if (!nm || nm.indexOf(p[1]) < 0) {
          res.fail.push({ q: '价库派系名 ' + p[0], want: '含「' + p[1] + '」', got: nm, tag: '派系名' });
        }
      });

      /* 样本：用户报的三种写法 */
      ['赤毒·食人女魔', '赤毒食人女魔', '赤毒 食人女魔', '食人女魔', 'kuva ogris'].forEach(q => {
        const w = top(q);
        res.sample.push({ q, got: w ? (w.cn + ' / ' + w.en + ' / ' + w.var) : '(无)' });
      });
      return JSON.stringify(res);
    })()`;

    const r = JSON.parse(await cdp.eval(js));
    console.log('用例 ' + r.total + ' 条');
    console.log('\n样本：');
    r.sample.forEach(s => console.log('  ' + s.q + '  →  ' + s.got));
    if (r.fail.length) {
      bad = r.fail.length;
      console.log('\n✗ 失败 ' + bad + ' 条（前 20）：');
      r.fail.slice(0, 24).forEach(f => console.log('  [' + f.tag + '] ' + JSON.stringify(f.q) + ' 期望 ' + f.want + ' 实得 ' + f.got));
      process.exitCode = 1;
    } else {
      console.log('\n✓ 全部命中（' + r.total + ' 条）');
    }

    /* 顺带验 UI：#wq 打字后列表首项（一次给三种写法，都要出 Kuva Ogris） */
    for (const qs of ['赤毒·食人女魔', '赤毒 食人女魔', '赤毒食人女魔', '食人女']) {
      const ui = await cdp.eval(`(() => {
        const q = document.getElementById('wq');
        if (!q) return 'no-wq';
        q.value = ${JSON.stringify(qs)};
        q.dispatchEvent(new Event('input'));
        const ls = document.getElementById('wlist');
        const first = ls && ls.querySelector('button span');
        return first ? first.textContent.trim() : '(空)';
      })()`);
      console.log('UI #wq「' + qs + '」首项 → ' + ui);
    }

    /* 02 区 #q（事件委托在 document，必须冒泡）：三种写法 + 英文连字符都要落到同一个下标 */
    const idx02 = [];
    for (const qs of ['赤毒·食人女魔', '赤毒 食人女魔', '赤毒食人女魔', 'kuva-ogris']) {
      idx02.push(await cdp.eval(`(() => {
        const q = document.getElementById('q');
        if (!q) return 'no-q';
        q.value = ${JSON.stringify(qs)};
        q.dispatchEvent(new Event('input', { bubbles: true }));
        const b = document.querySelector('#cands .cand');
        return b ? b.getAttribute('data-i') : '(空)';
      })()`));
    }
    console.log('UI #q 四种写法 → 下标 ' + idx02.join(' / ') + (new Set(idx02).size === 1 ? '  ✓ 同一把' : '  ✗ 不一致'));
    if (new Set(idx02).size !== 1 || idx02[0] === '(空)' || idx02[0] === 'no-q') process.exitCode = 1;
  } catch (e) {
    console.error('✗ 失败: ' + (e && e.stack || e));
    process.exitCode = 1;
  } finally {
    p.kill();
  }
})();
