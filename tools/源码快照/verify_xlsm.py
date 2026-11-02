# -*- coding: utf-8 -*-
"""真机（WPS）验收：派系=倍率 / 后坐力=方向相反，xlsm 三条链路都要对。"""
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
                   'out', 'verify_out.xlsm')
print('验收对象：%s' % SRC)

FACTION = set([16, 17, 18, 42, 43, 44])
RECOIL = 25

OK, BAD = [], []


def ck(cond, msg):
    (OK if cond else BAD).append(msg)
    print(('  PASS  ' if cond else '  FAIL  ') + msg)


def near(a, b, tol=0.02):
    try:
        return a is not None and b is not None and abs(float(a) - float(b)) <= tol
    except (TypeError, ValueError):
        return False


stat = {'fac': 0, 'fmt': 0, 'recP': 0, 'recN': 0, 'tot': 0}
s = Wps(SRC, OUT, '洗卡模拟器', visible=False)
try:
    dat = s.sheet('data')
    calc = s.sheet('计算器')
    ref = s.sheet('参考·理论区间')
    par = s.sheet('参数')
    fz = s.sheet('融合')

    # ---------- 名字 -> 数据表行号 ----------
    nm2row = {}
    for i, row in enumerate(dat.Range('A2:C52').Value):
        for c in row:
            if c:
                nm2row[str(c).strip()] = i + 2
    ck(len(nm2row) > 100, '名字->行号 映射建好（%d 条）' % len(nm2row))

    # ---------- 1. 参考·理论区间 ----------
    print('\n[1] 参考·理论区间（满级，组合系数=参数!B11，浮动 0.9/1.1）')
    s.app.CalculateFull()
    d = calc.Range('B7').Value
    b11 = par.Range('B11').Value
    b4 = par.Range('B4').Value
    b6 = par.Range('B6').Value
    g16 = dat.Range('G16').Value
    g25 = dat.Range('G25').Value
    g2 = dat.Range('G2').Value
    print('   倾向 %s | 系数 %s | 浮动 %s/%s | 基准：派系 %s / 后坐力 %s / 基础伤害 %s'
          % (d, b11, b4, b6, g16, g25, g2))
    e18, f18 = ref.Range('E18').Value, ref.Range('F18').Value
    e27, f27 = ref.Range('E27').Value, ref.Range('F27').Value
    e4, f4 = ref.Range('E4').Value, ref.Range('F4').Value
    print('   派系(行18)   E18=%s  F18=%s' % (e18, f18))
    print('   后坐力(行27) E27=%s  F27=%s' % (e27, f27))
    print('   基础伤害(行4) E4=%s  F4=%s' % (e4, f4))
    ck(near(e18, 1 + (g16 - 1) * b11 * d * b4), '派系「最小」= 1+(1.45-1)*系数*倾向*0.9')
    ck(near(f18, 1 + (g16 - 1) * b11 * d * b6), '派系「最大」= 1+(1.45-1)*系数*倾向*1.1')
    ck(1.0 < float(e18) < float(f18) < 2.0, '派系给的是倍率且 最小<最大（不再是 +1.x）')
    ck(near(e27, -g25 * b11 * d * b6), '后坐力「最小」= -90*系数*倾向*1.1')
    ck(near(f27, -g25 * b11 * d * b4), '后坐力「最大」= -90*系数*倾向*0.9')
    ck(float(e27) < float(f27) < 0, '后坐力两面都是负值，且 最小 < 最大')
    ck(near(e4, g2 * b11 * d * b4) and near(f4, g2 * b11 * d * b6),
       '普通词条（基础伤害）没被误改')

    # ---------- 2. 计算器 ----------
    print('\n[2] 计算器 D/E/F（理论最小 / 中值 / 最大）')
    try:
        calc.Range('B17:B20').Validation.Delete()
    except Exception:
        pass
    # 后坐力对近战不存在（数据 K25 是空的），先把类别切到步枪再测。
    # 参数!B30 是活公式（跟 计算器!B5 走），不写死 ——
    # 写入会把公式冲掉，武器类型会退回手填死值。做法是驱动 计算器!B4/C4
    # 选中一把步枪，让 B30 自动识别出「步枪」。
    calc.Range('B4').Value = '\u6258\u91cc\u5fb7'
    calc.Range('C4').Value = 1
    s.app.CalculateFull()
    print('   命中武器 = %r  参数!B30 = %r' % (calc.Range('B5').Value, par.Range('B30').Value))
    ck(par.Range('B30').Value == '\u6b65\u67aa',
       'B30 自动识别为步枪（实际 %r）' % (par.Range('B30').Value,))
    calc.Range('B17').Value = '对克隆尼伤害'
    calc.Range('B19').Value = '后坐力'
    s.app.CalculateFull()
    v17 = [calc.Range('%s17' % c).Value for c in 'DEF']
    v19 = [calc.Range('%s19' % c).Value for c in 'DEF']
    print('   派系(行17, J=%s) D/E/F = %s' % (calc.Range('J17').Value, v17))
    print('   后坐力(行19, J=%s) D/E/F = %s' % (calc.Range('J19').Value, v19))
    ck(all(isinstance(v, float) for v in v17), '派系行 D/E/F 都是数字（没变成 #NAME?/#VALUE!）')
    ck(1.0 < v17[0] < v17[1] < v17[2] < 2.0, '派系行 最小<中值<最大，且都是倍率')
    ck(all(isinstance(v, float) for v in v19), '后坐力行 D/E/F 都是数字（近战会显示「无此词条」）')
    if all(isinstance(v, float) for v in v19):
        ck(v19[0] < v19[1] < v19[2] < 0, '后坐力行 三格都是负值（降后坐力），最小<中值<最大')
        ck(abs(v19[0] / v19[1] - 1.1) < 0.001, '后坐力「最小」用的是浮动 1.1（降得最多）')
    if all(isinstance(v, float) for v in v17):
        ck(abs((v17[0] - 1) / (v17[1] - 1) - 0.9) < 0.001, '派系「最小」用的是浮动 0.9')

    # ---------- 3. 洗卡模拟器 VBA ----------
    print('\n[3] 洗卡模拟器 VBA（开紫卡 40 次 + 洗卡 15 次）')

    def scan(base):
        for i in range(4):
            nm = s.ws.Range('B%d' % (base + i)).Value
            v = s.ws.Range('D%d' % (base + i)).Value
            if not nm or v is None:
                continue
            r = nm2row.get(str(nm).strip(), 0)
            if not r:
                continue
            stat['tot'] += 1
            if r in FACTION:
                stat['fac'] += 1
                # 正面槽（1~3）是加伤 -> 倍率 >1；负面槽（4）是减伤 -> 倍率 <1
                if i < 3:
                    if not (1.0 < float(v) < 2.5):
                        ck(False, '派系「%s」在正面槽数值 %s 不在 1~2.5' % (nm, v))
                else:
                    if not (0.4 < float(v) < 1.0):
                        ck(False, '派系「%s」在负面槽数值 %s 不在 0.4~1' % (nm, v))
                if '\u00d7' in str(s.ws.Range('D%d' % (base + i)).NumberFormat):
                    stat['fmt'] += 1
            elif r == RECOIL:
                if i < 3:
                    stat['recP'] += 1
                    if float(v) >= 0:
                        ck(False, '后坐力在正面槽「%s」= %s（应为负=降低）' % (nm, v))
                else:
                    stat['recN'] += 1
                    if float(v) <= 0:
                        ck(False, '后坐力在负面槽「%s」= %s（应为正=增加）' % (nm, v))

    for k in range(40):
        err = s.click('CommandButton1')
        if err:
            ck(False, '开紫卡 按钮报错: %s' % err)
        scan(9)
    for k in range(15):
        err = s.click('CommandButton2')
        if err:
            ck(False, '洗卡 按钮报错: %s' % err)
        scan(20)
    print('   共扫 %d 条：派系 %d（其中 %d 条套了 × 数字格式）/ 后坐力正面 %d / 负面 %d'
          % (stat['tot'], stat['fac'], stat['fmt'], stat['recP'], stat['recN']))
    ck(stat['fac'] == 0 or stat['fmt'] == stat['fac'], '派系行全部套上 × 数字格式')
    ck(stat['fac'] > 0, '样本里出现过派系词条（%d 条）' % stat['fac'])

    # ---------- 4. 融合 ----------
    print('\n[4] 融合')
    recipes = []
    for row in fz.Range('A3:C31').Value:
        a, b, c = row[0], row[1], row[2]
        if a and b and c:
            ra = nm2row.get(str(a).strip())
            rb = nm2row.get(str(b).strip())
            rc = nm2row.get(str(c).strip())
            if ra and rb and rc:
                recipes.append((ra, rb, rc))
    ck(len(recipes) >= 20, '配方表读出 %d 条' % len(recipes))

    done = False
    for k in range(40):
        if done:
            break
        s.click('CommandButton1')
        rows = []
        for i in range(4):
            nm = s.ws.Range('B%d' % (20 + i)).Value
            rows.append(nm2row.get(str(nm).strip(), 0) if nm else 0)
        pick = None
        for i in range(4):
            for j in range(4):
                if i == j or not rows[i] or not rows[j]:
                    continue
                if rows[i] > 34 or rows[j] > 34:
                    continue
                for ra, rb, rc in recipes:
                    if set([ra, rb]) == set([rows[i], rows[j]]):
                        pick = (i, j, rc)
                        break
                if pick:
                    break
            if pick:
                break
        if not pick:
            continue
        i, j, rc = pick
        n1 = s.ws.Range('B%d' % (20 + i)).Value
        s.ws.Range('B26').Value = n1
        time.sleep(0.03)
        n2 = s.ws.Range('B%d' % (20 + j)).Value
        s.ws.Range('B27').Value = n2
        time.sleep(0.03)
        s.clear_dialogs()
        err = s.click('CommandButton4')
        dls = s.dialogs()
        if err:
            ck(False, '融合按钮报错: %s' % err)
            break
        if any('\u51fa\u9519\u4e86' in str(t) for t in dls):
            ck(False, '融合弹错: %s' % dls)
            break
        done = True
        pidx, prow, pv = None, 0, None
        for t in range(4):
            nm = s.ws.Range('B%d' % (20 + t)).Value
            r = nm2row.get(str(nm).strip(), 0) if nm else 0
            if 35 <= r <= 52:
                pidx, prow, pv = t, r, s.ws.Range('D%d' % (20 + t)).Value
                break
        ck(pidx is not None, '卡面上出现了融合产物（35~52 行）')
        if pidx is None:
            break
        nf = s.ws.Range('D%d' % (20 + pidx)).NumberFormat
        print('   融合：%s + %s -> %s（行 %s，配方指定 %s）| 数值 %s | 格式 %s'
              % (n1, n2, s.ws.Range('B%d' % (20 + pidx)).Value, prow, rc, pv, nf))
        ck(prow == rc, 'dist = 配方表指定的那一条')
        if prow in FACTION:
            ck(1.0 < float(pv) < 2.5, '融合产物是派系 -> 倍率 %s' % pv)
            ck('\u00d7' in str(nf), '融合产物派系行套了 × 数字格式')
        elif prow == RECOIL:
            ck(float(pv) < 0, '融合产物是后坐力 -> 负值 %s' % pv)
        else:
            ck(float(pv) > 0, '融合产物是普通正面词条 -> 正值 %s' % pv)
    ck(done, '至少跑通一次完整融合')

    print('\n弹窗：', s.dialogs())
finally:
    s.close(False)

print('\n==== 通过 %d / 失败 %d ====' % (len(OK), len(BAD)))
for m in BAD:
    print('  FAIL:', m)
sys.exit(1 if BAD else 0)
