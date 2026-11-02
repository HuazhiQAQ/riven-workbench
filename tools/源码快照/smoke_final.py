# -*- coding: utf-8 -*-
"""成品冒烟：确认移除 ZZTEST 后宏仍能编译运行 —— 开紫卡 + 洗卡自选（三种语言）。"""
# 归档留档脚本：一次性执行。
# 复用时把 xlsm 路径当命令行参数传入；OUT 默认写脚本自己旁边的 out/ 。
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

VAR = '变体·有本体'
SRC = sys.argv[1] if len(sys.argv) > 1 else \
    os.path.join(os.path.dirname(os.path.abspath(__file__)),
                 '..', 'riven-source-6.0.xlsm')
s = Wps(SRC,
        os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out',
                     'final_test.xlsm'), '倾向表', visible=False)
tWs, cWs = s.sheet('倾向表'), s.sheet('计算器')
s7 = s.sheet('洗卡模拟器')

I, NAMES = {}, {}
for j in range(2, 641):
    I[j] = str(tWs.Cells(j, 9).Value or '')
    for c in (3, 4, 5):
        nm = str(tWs.Cells(j, c).Value or '')
        if nm:
            NAMES.setdefault(nm, j)

# 开紫卡 60 次
leak, got = [], set()
for i in range(60):
    s.run('Sheet7.随机抽取')
    nm = str(s7.Range('A4').Value or '').split('|')[0].strip()
    got.add(nm)
    j = NAMES.get(nm)
    if j and I.get(j) == VAR:
        leak.append(nm)
print('开紫卡 60 次 -> 不同武器 %d 把 | 变体泄漏 %d %s' % (len(got), len(leak), leak[:3]), flush=True)

# 洗卡自选：三种语言各来一次（丧钟 / Coda Tysis）
def row_of(cn_name, col):
    for j in range(2, 641):
        if str(tWs.Cells(j, col).Value or '') == cn_name:
            return j
    return None

for h1, col, exp in [('国服', 5, {'圣装丧钟': '丧钟', '灵敏盗贼双枪': '盗贼'}),
                     ('国际服', 4, {'丧钟Prime': '丧钟', 'Dex盗贼双枪': '盗贼'}),
                     ('English', 3, {'Knell Prime': 'Knell', 'Dex Furis': 'Furis'})]:
    cWs.Range('H1').Value = h1
    time.sleep(0.35)
    for nm, want in exp.items():
        r = row_of(nm, col)
        if not r:
            print('  %s 找不到 %s' % (h1, nm), flush=True)
            continue
        s7.Range('I4').Value = ''
        s7.Range('I5').Value = ''
        s7.Range('I6').Value = nm
        s.run('Sheet7.洗卡自选')
        time.sleep(0.12)
        got_nm = str(s7.Range('H24').Value or '')
        print('  %-8s %-14s -> 「%s」 %s' % (h1, nm, got_nm,
                                            'OK' if got_nm.startswith(want) else '✗ 期望 ' + want),
              flush=True)

print('弹窗：', s.dialogs(), flush=True)
s.close(False)
