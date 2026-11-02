# -*- coding: utf-8 -*-
"""真机验证「计算器」紫卡命名：按本体名，且跟着语言走。
扫的格子：
  H1 = 用语切换 | B4 = 模糊搜索 | C4 = 候选序号
  B5 = 命中武器（还是变体自己的名字，数值/倾向也按它算）
  B24 = 紫卡命名 —— 校验目标所在格
"""
import os
import sys
import time

import os as _os
def _find_skill_scripts():
    """定位 xlsm-vba-inject 的 scripts 目录，找不到返回 None。"""
    env = _os.environ.get('ZK_SKILL_SCRIPTS')
    if env:
        return env if _os.path.isdir(env) else None
    here = _os.path.dirname(_os.path.abspath(__file__))
    for c in (_os.path.join(_os.path.dirname(here), '_deps', 'xlsm-vba-inject', 'scripts'),
              _os.path.join(_os.path.expanduser('~'), '.workbuddy', 'skills',
                            'xlsm-vba-inject', 'scripts')):
        if _os.path.isdir(c):
            return c
    return None

_SKILL = _find_skill_scripts()
if not _SKILL:
    raise SystemExit(
        '找不到 xlsm-vba-inject 的 scripts 目录，本脚本无法运行。\n'
        '设环境变量 ZK_SKILL_SCRIPTS=<该目录>，'
        '或把 xlsm-vba-inject 放到工具包同级 _deps/ 下。')
sys.path.insert(0, _SKILL)
from run_in_wps import Wps                                    # noqa: E402

SRC = sys.argv[1] if len(sys.argv) > 1 else \
    os.path.join(os.path.dirname(os.path.abspath(__file__)),
                 '..', 'riven-source-6.0.xlsm')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out',
                   'final4_test.xlsm')

s = Wps(SRC, OUT, '计算器', visible=False)
cWs = s.sheet('计算器')
tWs = s.sheet('倾向表')


def recalc():
    try:
        s.app.Calculate
        s.app.CalculateFull()
    except Exception:                                          # noqa: BLE001
        pass
    time.sleep(0.15)


def pick(keyword, want):
    """把 B4 设成关键字，再挑候选序号，使「命中武器」= want"""
# 归档留档脚本：一次性执行。
# 复用时把 xlsm 路径当命令行参数传入；OUT 默认写脚本自己旁边的 out/ 。
    cWs.Range('B4').Value = keyword
    recalc()
    for i in range(1, 6):
        nm = str(cWs.Range('E%d' % (4 + i)).Value or '')
        if nm == want:
            cWs.Range('C4').Value = i
            recalc()
            return True
    return False


# (语言, 关键字, 期望命中武器, 期望命名前缀)
CASES = [
    ('国际服', '执', '圣洁执法者', '执法者'),
    ('国服',   '执', '圣洁执法者', '执法者'),
    ('English', 'Sancti Magistar', 'Sancti Magistar', 'Magistar'),
    ('国际服', '执法者', '执法者', '执法者'),
    ('国服',   '圣装丧钟', '圣装丧钟', '丧钟'),
    ('国际服', '丧钟Prime', '丧钟Prime', '丧钟'),
    ('English', 'Knell Prime', 'Knell Prime', 'Knell'),
    ('国际服', '赤毒布拉玛', '赤毒布拉玛', '赤毒布拉玛'),     # 变体·无本体：按自己
    ('English', 'Kuva Bramma', 'Kuva Bramma', 'Kuva Bramma'),
    ('国际服', '席瓦&神盾Prime', '席瓦&神盾Prime', '席瓦&神盾'),  # 带 & 的名字
    ('English', 'Pangolin Prime', 'Pangolin Prime', 'Pangolin Sword'),
]

# ---- 先验「候选列表只出现当前语言的名字」（掩码是否正确）----
MASK_CASES = [
    ('国服', '丧钟', ['圣装丧钟', '丧钟'], ['丧钟Prime']),
    ('国际服', '丧钟', ['丧钟Prime', '丧钟'], ['圣装丧钟']),
    ('English', 'Knell', ['Knell Prime', 'Knell'], ['圣装丧钟', '丧钟Prime']),
]
bad = []
for lang, kw, must, mustnot in MASK_CASES:
    cWs.Range('H1').Value = lang
    recalc()
    cWs.Range('B4').Value = kw
    recalc()
    got = [str(cWs.Range('E%d' % (4 + i)).Value or '') for i in range(1, 6)]
    got = [g for g in got if g]
    ok = all(m in got for m in must) and not any(m in got for m in mustnot)
    print('  [候选] %-8s 搜「%s」-> %s %s' % (lang, kw, got, 'OK' if ok else '✗'), flush=True)
    if not ok:
        bad.append((lang, kw, got, must, mustnot))

# ---- 洗卡模拟器的搜索框（走 VBA 语言命中）----
s7 = s.sheet('洗卡模拟器')
for lang, kw, must, mustnot in MASK_CASES:
    cWs.Range('H1').Value = lang
    recalc()
    s7.Range('I4').Value = kw
    s.run('Sheet7.刷新候选')
    recalc()
    got = [str(s7.Range('I%d' % (10 + i)).Value or '') for i in range(1, 6)]
    got = [g for g in got if g]
    ok = (not mustnot or not any(m in got for m in mustnot)) and (not must or any(m in got for m in must))
    print('  [洗卡] %-8s 搜「%s」-> %s %s' % (lang, kw, got, 'OK' if ok else '✗'), flush=True)
    if not ok:
        bad.append(('洗卡' + lang, kw, got, must, mustnot))
s7.Range('I4').Value = ''

for lang, kw, hit, want in CASES:
    cWs.Range('H1').Value = lang
    recalc()
    if not pick(kw, hit):
        print('  ✗ %-8s 搜「%s」没找到候选「%s」' % (lang, kw, hit), flush=True)
        bad.append((lang, kw, hit, 'NOCAND', want))
        continue
    got_hit = str(cWs.Range('B5').Value or '')
    got_nm = str(cWs.Range('B24').Value or '')
    ok = got_nm.startswith(want) and got_hit == hit
    print('  %-8s 命中 %-16s 命名「%s」 %s' % (lang, got_hit, got_nm,
                                              'OK' if ok else '✗ 期望前缀 ' + want), flush=True)
    if not ok:
        bad.append((lang, kw, got_hit, got_nm, want))

print('\n================ 汇总 ================')
print('用例 %d，失败 %d' % (len(CASES), len(bad)))
for b in bad:
    print('   ✗', b)
print('弹窗：', s.dialogs(), flush=True)
s.close(False)
