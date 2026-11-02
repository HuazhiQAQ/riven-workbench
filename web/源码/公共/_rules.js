window.RULES={
  RECOIL_ROW: 25,
  NEG_ONLY_ROW: 30,
  NON_PCT: [20, 27, 28, 34],
  FACTION_DROWS: [16, 17, 18, 42, 43, 44],
  DRAIN2RANK: { 10: 0, 11: 1, 12: 2, 13: 3, 14: 4, 15: 5, 16: 6, 17: 7, 18: 8 },
  VALUE_MAX: 404,
  DISP_MAX: 1.2,
  COEF_MAX: 1.2375,
  DISP_UNIFIED: 1.2,
  RIVEN_SLOTS: 4,
  RIVEN_MAX_POS: 3,
  RIVEN_MAX_NEG: 1,
  ZK_MELEE_ROWS: [3, 27, 28, 29, 30, 31, 32, 33, 34],
  ZK_FUSE_FROM: 35,
  ZK_FUSE_TO: 52,
  FACROW_KEY: { 16: 'corpus', 17: 'grineer', 18: 'infested', 42: 'orokin', 43: 'techrot', 44: 'scaldra' }
};
window.RULES.NON_PCT_ROWS = window.RULES.NON_PCT.concat(window.RULES.FACTION_DROWS);
window.RULES.CAT_COL = (function () {
  var m = {}, t = (window.ZKNAMES && ZKNAMES.types) || [], i;
  for (i = 0; i < t.length; i++) if (t[i] && t[i].key) m[t[i].key] = +t[i].col || 0;
  return m;
})();
window.RULES.STAT_KEY_ROW = {
  dmg: [2, 3], cc: 4, cd: 5, sc: 6, statusDur: 7, frate: 8, aspeed: 8,
  cold: 9, toxin: 10, electric: 11, heat: 12, impact: 13, slash: 14, puncture: 15,
  fac: 16, ms: 19, punch: 20, mag: 21, ammo: 22, rel: 23, recoil: 25, zoom: 26,
  combo: 27, comboDur: 28, efficiency: 31, slideCrit: 32, finisher: 33, range: 34,
  sd: 35, gas: 36, corrosive: 37, viral: 38, radiation: 39, blast: 40, magnetic: 41,
  weak: 45, weakcc: 46, heavyDmg: 49, windup: 50, slam: 52
};
window.RULES.ZK_MIN_BUSY = 320;
window.RULES.ZK_EXKEYS = ['dmg', 'ms', 'cc', 'cd', 'fac'];
window.RULES.ZK_ZTYPES = ['puncture', 'impact', 'slash', 'viral'];
window.RULES.ZK_KTYPES = { impact: 'impact', puncture: 'puncture', slash: 'slash', heat: 'heat', cold: 'cold', electricity: 'electricity', toxin: 'toxin', blast: 'blast', radiation: 'radiation', gas: 'gas', magnetic: 'magnetic', viral: 'viral', corrosive: 'corrosive', void: 'void' };
window.RULES.ZK_DMG_CN = { impact: ['冲击', '冲击', 'Impact'], puncture: ['穿刺', '穿刺', 'Puncture'], slash: ['切割', '切割', 'Slash'], heat: ['火焰', '火焰', 'Heat'], cold: ['冰冻', '冰冻', 'Cold'], electricity: ['电击', '电击', 'Electricity'], toxin: ['毒素', '毒素', 'Toxin'], blast: ['爆炸', '爆炸', 'Blast'], radiation: ['辐射', '辐射', 'Radiation'], gas: ['毒气', '毒气', 'Gas'], magnetic: ['磁力', '磁力', 'Magnetic'], viral: ['病毒', '病毒', 'Viral'], corrosive: ['腐蚀', '腐蚀', 'Corrosive'], void: ['虚空', '虚空', 'Void'] };
window.RULES.ZK_DMG_LABEL = { impact: '冲击', puncture: '穿刺', slash: '切割', heat: '火焰', cold: '冰冻', electricity: '电击', toxin: '毒素', blast: '爆炸', radiation: '辐射', gas: '毒气', magnetic: '磁力', viral: '病毒', corrosive: '腐蚀', void: '虚空' };
window.RULES.ZK_ROW2STAT = { 2: 'dmg', 3: 'dmg', 4: 'cc', 5: 'cd', 6: 'sc', 7: 'statusDur', 8: '@spd', 9: 'cold', 10: 'toxin', 11: 'electric', 12: 'heat', 13: 'impact', 14: 'slash', 15: 'puncture', 16: 'fac', 17: 'fac', 18: 'fac', 42: 'fac', 43: 'fac', 44: 'fac', 19: 'ms', 20: 'punch', 21: 'mag', 22: 'ammo', 23: 'rel', 25: 'recoil', 26: 'zoom', 27: 'combo', 28: 'comboDur', 31: 'efficiency', 32: 'slideCrit', 33: 'finisher', 34: 'range', 35: 'sd', 36: 'gas', 37: 'corrosive', 38: 'viral', 39: 'radiation', 40: 'blast', 41: 'magnetic', 45: 'weak', 46: 'weakcc', 49: 'heavyDmg', 50: 'windup', 52: 'slam' };
window.RULES.ZK_ASMS = { kind: '', src: '', strike: '', zgrip: '', zlink: '', chamber: '', kgrip: '', kloader: '', side: 's', elem4: 'heat', elem5: 'heat' };
window.RULES.ZK_LICH_EL = ['impact', 'cold', 'heat', 'toxin', 'electricity', 'radiation', 'magnetic'];
window.RULES.ZK_LICH_PCT = 60;
window.RULES.ZK_KIT_LD_P = { flutterfire: 1, ramflare: 1, zipfire: 1, swiftfire: 1, sparkfire: 1, thunderdrum: 1, arcroid: 1, thymoid: 1, marcoarcroid: 1, marcothymoid: 1 };
window.RULES.ZK_POL_INFO = { r: { n: '马杜莱', en: 'Madurai', sym: 'r', src: '伤害 / 力量' }, d: { n: '瓦扎林', en: 'Vazarin', sym: 'D', src: '防御 / 生命 / 护甲（所有派系都会掉）' }, '-': { n: '纳拉蒙', en: 'Naramon', sym: '—', src: '其它类型（C Corpus 掉得多）' }, '=': { n: '泽努里', en: 'Zenurik', sym: '抓痕', src: '战甲强化与重击 MOD' }, y: { n: '彭加加', en: 'Penjaga', sym: 'Y', src: '守护 / 库狛 / 库娃能力' }, k: { n: '科内克西', en: 'Koneksi', sym: 'O', src: '融合核心（目前只有传说核心有）' }, w: { n: '乌奈鲁', en: 'Unairu', sym: 'R', src: '近战架势 MOD（13.0 起）' }, u: { n: '安布拉', en: 'Umbra', sym: 'U', src: 'Sentient 特化 MOD（完成牺牲系列任务后取得）' }, o: { n: '万能', en: 'Aura', sym: 'O', src: '通用极性：全能 Forma 可放到任意槽位' }
};
window.RULES.ZK_KIT_NAMES = ['捕月','凝目','响胆','墓指','虫置','孢射'];
window.RULES.ZK_ZAW_NAMES = ['宝拉','西亚什','德塔特','客隆什','密丸','乌尔萨','瑟普梵','拉比威','多克拉姆','瘟疫克里帕丝','瘟疫奇沃'];
window.RULES.ZK_COMPANION_NAMES = ['阿塔克斯','激光点发','急冻喷枪','分离','死亡机枪','赫尔斯壮','激光步枪','多连穿甲枪','毒刺','扫除者','泰瑟步枪','冰凇','金工火舌','金工火枪','莱斯腾','巴托腾','阿卡腾'];
window.RULES.ZK_MELEE_POS = [2, 3, 9, 10, 11, 12, 27, 29];
window.RULES.ZK_RANGED_POS = [9, 10, 11, 12, 20];
window.RULES.PHYS = ['impact', 'puncture', 'slash'];
