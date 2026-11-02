'use strict';
/* 触发流（g_status）验收：辅助流派 · 异况吞吐
   · 流派定义 / 标准配卡 / 赋能映射（主要·衰弱 & 次要·妨害）
   · statusSup 通道响应 触发几率 / 多重 / 异况种数 / 持续
   · 元素组合规则：mod 腐蚀+冰自由 / 紫卡病毒独立入队 / 自带元素队列最前 */
const path = require('path');
const { openPage, toFileUrl } = require('./cdp.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function chk(n, got, want) {
  const ok = String(got) === String(want);
  console.log((ok ? '  ✓ ' : '  ✗ ') + n + ' = ' + got + (ok ? '' : '（期望 ' + want + '）'));
  ok ? pass++ : fail++;
}
const file = path.resolve(process.argv[2] || require('./cdp.cjs').latestProduct());

(async () => {
  const p = await openPage(toFileUrl(file));
  const q = async (e) => { try { return await p.cdp.eval(e); } catch (err) { return 'ERR:' + err.message; } };
  try {
    await sleep(2000);

    /* ---- 数据层 ---- */
    chk('流派存在', await q(`!!(window.RIVEN_ROUTER && window.RIVEN_ROUTER.ARCH_BY_ID && window.RIVEN_ROUTER.ARCH_BY_ID.g_status)`), 'true');
    chk('流派名=触发流', await q(`window.RIVEN_ROUTER.ARCH_BY_ID.g_status.n`), '触发流');
    chk('cal=statusSup', await q(`window.RIVEN_ROUTER.ARCH_BY_ID.g_status.cal`), 'statusSup');
    chk('枪械判定(高触发 0.15 门槛)', await q(`(function(){
      var A = window.RIVEN_ROUTER.ARCH_BY_ID.g_status;
      return A.applies({ isGun: true, sc: 0.16 }, {}) + '/' + A.applies({ isGun: true, sc: 0.10 }, {}) + '/' + A.applies({ isGun: false, sc: 0.5 }, {});
    })()`), 'true/false/false');
    chk('标准配卡·步枪含无尽苦难', await q(`window.RIVEN_ROUTER.ARCH_BUILDS.g_status.rifle.indexOf('continuous_misery') >= 0`), 'true');
    chk('标准配卡·手枪无专属卡与同族冲突（Acrid 专属卡已剔除）', await q(`(function(){
      var B = window.RIVEN_ROUTER.ARCH_BUILDS.g_status;
      return (B.pistol.indexOf('toxic_sequence') < 0 && B.pistol.indexOf('galvanized_shot') < 0
           && B.rifle.indexOf('rifle_aptitude') < 0);
    })()`), 'true');
    chk('标准配卡·手枪含结霜侵蚀+火焰装填（毒电组腐蚀、冰火自由）', await q(`(function(){
      var B = window.RIVEN_ROUTER.ARCH_BUILDS.g_status;
      return (B.pistol.indexOf('frostbite') >= 0 && B.pistol.indexOf('primed_heated_charge') >= 0);
    })()`), 'true');
    chk('标准配卡·霰弹含恒久折磨', await q(`window.RIVEN_ROUTER.ARCH_BUILDS.g_status.shotgun.indexOf('lingering_torment') >= 0`), 'true');
    chk('赋能映射·主=主要·衰弱', await q(`window.ZKAFARC.g_status.arc`), 'primary_debilitate');
    chk('赋能映射·手枪分支=次要·妨害', await q(`window.ZKAFARC.g_status.arcBy.s`), 'secondary_encumber');

    /* ---- 引擎层 ---- */
    chk('statusSup 通道进 evaluate', await q(`(function(){
      var e = WF.evaluate({ base: { types: { impact: 100 }, sc: 0.3, cc: 0.1, cd: 2, ms: 1, mag: 60 },
        mods: { sc: 90 }, ctx: { k: 0, faction: 'grineer' } });
      return typeof e.raw.statusSup === 'object' && isFinite(e.raw.statusSup.withR);
    })()`), 'true');
    chk('触发几率词条抬升吞吐比', await q(`(function(){
      function r(mods) {
        var e = WF.evaluate({ base: { types: { impact: 30, puncture: 20, slash: 50 }, sc: 0.3, cc: 0.1, cd: 2, ms: 1, mag: 60 },
          mods: mods, ctx: { k: 0, faction: 'grineer' } });
        return e.raw.statusSup.withR;
      }
      var a = r({ ms: 150, sc: 200, statusDur: 100, corrosive: 120, cold: 165 });
      var b = r({ ms: 150, sc: 260, statusDur: 100, corrosive: 120, cold: 165 });
      return (b > a * 1.15);
    })()`), 'true');
    chk('触发持续词条抬升吞吐比', await q(`(function(){
      function r(dur) {
        var e = WF.evaluate({ base: { types: { impact: 30, puncture: 20, slash: 50 }, sc: 0.3, cc: 0.1, cd: 2, ms: 1, mag: 60 },
          mods: { ms: 150, sc: 200, statusDur: dur, corrosive: 120, cold: 165 }, ctx: { k: 0, faction: 'grineer' } });
        return e.raw.statusSup.withR;
      }
      return (r(200) > r(100));
    })()`), 'true');
    chk('异况种数越多吞吐越高', await q(`(function(){
      function r(mods) {
        var e = WF.evaluate({ base: { types: { impact: 30, puncture: 20, slash: 50 }, sc: 0.3, cc: 0.1, cd: 2, ms: 1, mag: 60 },
          mods: mods, ctx: { k: 0, faction: 'grineer' } });
        return e.raw.statusSup.withR;
      }
      return (r({ sc: 100, corrosive: 120, cold: 90 }) > r({ sc: 100, corrosive: 120 }));
    })()`), 'true');

    /* ---- 元素组合规则 ---- */
    chk('mod 毒电→腐蚀 + 冰自由', await q(`(function(){
      var t = WF.evaluate({ base: { types: { impact: 100 }, sc: 0.2, cc: 0.1, cd: 2, ms: 1, mag: 60 },
        mods: { toxin: 60, electric: 60, cold: 165 }, ctx: { k: 0, faction: 'grineer', elemOrder: ['toxin','electric','cold'] } }).st1.types;
      return (t.corrosive > 0 && t.cold > 0 && !t.viral && !t.magnetic);
    })()`), 'true');
    chk('紫卡病毒独立入队 → 三异况', await q(`(function(){
      var t = WF.evaluate({ base: { types: { impact: 100 }, sc: 0.2, cc: 0.1, cd: 2, ms: 1, mag: 60 },
        mods: { toxin: 60, electric: 60, cold: 165 }, riven: { viral: 90 },
        ctx: { k: 0, faction: 'grineer', elemOrder: ['toxin','electric','cold'] } }).st1.types;
      return (t.corrosive > 0 && t.cold > 0 && t.viral > 0);
    })()`), 'true');
    chk('自带元素最后参加（冰电先组磁力，毒自由）', await q(`(function(){
      var t = WF.evaluate({ base: { types: { impact: 30, toxin: 44 }, sc: 0.2, cc: 0.1, cd: 2, ms: 1, mag: 60 },
        mods: { cold: 122, electric: 44 }, ctx: { k: 0, faction: 'grineer', elemOrder: ['cold','electric'] } }).st1.types;
      return (t.magnetic > 0 && t.toxin > 0 && !t.viral);
    })()`), 'true');
    chk('单卡复合元素（剧毒射击·病毒240）直进队列', await q(`(function(){
      var t = WF.evaluate({ base: { types: { impact: 100 }, sc: 0.2, cc: 0.1, cd: 2, ms: 1, mag: 60 },
        mods: { viral: 240 }, ctx: { k: 0, faction: 'grineer' } }).st1.types;
      return t.viral > 0;
    })()`), 'true');
    chk('04 伤害构成口径：snapPanel 带 elemOrder 时毒电→腐蚀冰自由', await q(`(function(){
      var db = (window.__DM && window.__DM.weapons()) || window.WEAPON_DB;
      var w = db.find ? db.find(function(x){ return x.i === 'kuva_nukor'; }) : null;
      if (!w) return 'skip';
      var s = window.RIVEN_ROUTER.snapPanel(w, null,
        { toxin: 60, electric: 60, cold: 90, dmg: 100 }, {},
        ['toxin', 'electric', 'cold']);
      return (s.types.corrosive > 0 && s.types.cold > 0 && !s.types.magnetic && s.types.radiation > 0);
    })()`), 'true');
  } catch (e) { console.log('ERR ' + e.message); fail++; }
  p.kill();

  console.log('\n' + (fail === 0 ? '✅ 全部通过' : '❌ 失败 ' + fail + ' 条') + '（' + pass + '/' + (pass + fail) + '）');
  process.exit(fail ? 1 : 0);
})();
