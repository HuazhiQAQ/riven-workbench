# -*- coding: utf-8 -*-
"""真机验收：用语切换 H1 联动 + 三种语言的搜索命中 + 两条口径复核。
搜索格是 洗卡模拟器!I4（不是计算器 B4）、候选序号格 I5、候选表 I11:I15/K11:K15。
"""
import os
import sys

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
from run_in_wps import Wps                                          # noqa: E402


def _find_xlsm():
    """不写死文件名：产物名带日期，随版本变化。按「旁边 → 上两级」找最新的
       *紫卡模拟器*.xlsm（排除备份 / 缓存 / Excel 锁文件）。"""
    here = os.path.dirname(os.path.abspath(__file__))
    cands = []
    for d in (here, os.path.dirname(here), os.path.dirname(os.path.dirname(here)), os.getcwd()):
        try:
            cands += [os.path.join(d, f) for f in os.listdir(d)
                      if f.endswith('.xlsm') and '紫卡模拟器' in f
                      and '备份' not in f and not f.startswith('~$') and not f.startswith('_')]
        except OSError:
            pass
    return max(cands, key=os.path.getmtime) if cands else None


SRC = sys.argv[1] if len(sys.argv) > 1 else _find_xlsm()
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   'out', 'verify_lang_out.xlsm')

OK, BAD = [], []


def ck(cond, msg):
    (OK if cond else BAD).append(msg)
    print(('  PASS  ' if cond else '  FAIL  ') + msg)


print('验收对象：%s' % SRC)
s = Wps(SRC, OUT, '洗卡模拟器', visible=False)
try:
    par = s.sheet('参数')
    calc = s.sheet('计算器')
    sh7 = s.sheet('洗卡模拟器')

    def 候选():
        out = []
        for i in range(1, 6):
            nm = sh7.Range('I%d' % (10 + i)).Value
            cat = sh7.Range('K%d' % (10 + i)).Value
            if nm:
                out.append((str(nm), str(cat)))
        return out

    def 搜(kw):
        sh7.Range('I4').Value = ''
        sh7.Range('I4').Value = kw
        try:
            s.app.Run('Sheet7.刷新候选')
        except Exception as e:
            print('     Run 刷新候选 失败: %s' % str(e)[:60])
        return 候选()

    def 切语言(lg):
        calc.Range('H1').Value = lg
        # 同步语言参数() 只负责重刷候选；B28/B29 由公式给出
        try:
            s.app.Run('Sheet7.同步语言参数')
        except Exception as e:
            print('     Run 同步语言参数 失败: %s' % str(e)[:60])
        s.app.CalculateFull()

    # ---------- 1. H1 联动 ----------
    print('\n[1] 用语切换 H1 -> 参数 B28/B29 自动同步')
    # B28 / B29 是活公式（直接引用 计算器!$H$1）。
    # 不写入脏值 9 再等它同步 —— 写入会把公式冲掉，
    # 语言切换随之失灵。做法：先断言这俩确实是公式，然后只改 H1 看结果是否跟着变。
    f28 = str(par.Range('B28').Formula)
    f29 = str(par.Range('B29').Formula)
    ck(f28.startswith('=') and 'H$1' in f28, 'B28 是引用 H1 的活公式（不是手填死值）')
    ck(f29.startswith('=') and 'H$1' in f29, 'B29 是引用 H1 的活公式（不是手填死值）')
    expect = {'国服': (1, 1), '国际服': (2, 2), 'English': (3, 0)}
    for lg, (w28, w29) in expect.items():
        切语言(lg)
        g28, g29 = par.Range('B28').Value, par.Range('B29').Value
        ck(g28 == w28 and g29 == w29,
           'H1=%-8s -> B28=%s(期望%d) B29=%s(期望%d)' % (lg, g28, w28, g29, w29))

    # ---------- 2. 三种语言的搜索 ----------
    print('\n[2] 三种语言下搜各自的名字（核心 bug）')
    样例 = {
        '国服':    ('Garuda之爪', '迦楼罗之爪'),
        '国际服':  ('迦楼罗之爪', 'Garuda之爪'),
        'English': ('Garuda Talons', '迦楼罗之爪'),
    }
    for lg, (good_kw, bad_kw) in 样例.items():
        切语言(lg)
        got = 搜(good_kw)
        ck(len(got) > 0, 'H1=%-8s 搜 %-14r 命中 %d 条 %s'
           % (lg, good_kw, len(got), [g[0] for g in got[:3]]))
        got2 = 搜(bad_kw)
        ck(len(got2) == 0, 'H1=%-8s 搜 %-14r（别的语言）应搜不到，实际 %d 条'
           % (lg, bad_kw, len(got2)))

    print()
    # 「赤毒」是中文词：国服/国际服都该搜到；English 下应搜英文「Kuva」
    for lg, kw in (('国服', '赤毒'), ('国际服', '赤毒'), ('English', 'Kuva')):
        切语言(lg)
        got = 搜(kw)
        ck(len(got) > 0, 'H1=%-8s 搜 %-6r 命中 %d 条' % (lg, kw, len(got)))

    # ---------- 3. 两条口径复核 ----------
    print('\n[3] 派系 / 后坐力 两条口径仍正确（回归）')
    切语言('国际服')
    # 参数!B30 是活公式（跟 计算器!B5 走），不写死 —— 写入会把公式冲掉。
    # 做法：驱动 计算器!B4/C4 选中一把步枪，让 B30 自己识别出「步枪」。
    calc.Range('B4').Value = '托里德'
    calc.Range('C4').Value = 1
    s.app.CalculateFull()
    ck(par.Range('B30').Value == '步枪',
       'B30 自动识别为步枪（实际 %r）' % (par.Range('B30').Value,))
    calc.Range('B17').Value = '对克隆尼伤害'
    calc.Range('B19').Value = '后坐力'
    s.app.CalculateFull()
    v17 = [calc.Range('%s17' % c).Value for c in 'DEF']
    v19 = [calc.Range('%s19' % c).Value for c in 'DEF']
    print('   派系 D/E/F = %s' % v17)
    print('   后坐力 D/E/F = %s' % v19)
    ck(all(isinstance(v, float) for v in v17) and 1.0 < v17[0] < v17[1] < v17[2] < 2.0,
       '派系行仍是倍率且递增')
    if all(isinstance(v, float) for v in v19):
        ck(v19[0] < v19[1] < v19[2] < 0, '后坐力行仍是负值且递增')

    # ---------- 4. 洗卡复核 ----------
    print('\n[4] 洗卡按钮回归')
    err = s.click('CommandButton1')
    ck(not err, '开紫卡 按钮无报错（%s）' % (err or 'ok'))
    ck(bool(sh7.Range('B9').Value), '卡面第 1 槽有词条：%r' % (sh7.Range('B9').Value,))

    print('\n' + '=' * 60)
    print('通过 %d / 失败 %d' % (len(OK), len(BAD)))
    if BAD:
        print('\n失败项：')
        for m in BAD:
            print('  -', m)
    print('弹窗:', s.dialogs())
finally:
    s.close(False)
sys.exit(1 if BAD else 0)
