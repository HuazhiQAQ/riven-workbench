# -*- coding: utf-8 -*-
"""真机验证：融合产物数值 = 基准 x 组合系数 x 倾向 x 浮动。
判定依据
--------
被验公式 v = base*coef*disp*vol   -> 比值 r 落在 [coef*0.9, coef*1.1]
对照公式 v = base*disp*vol        -> 比值 r = v/(base*disp) 落在 [0.9, 1.1]
coef 取「2正1负 = 1.2375」或「3正0负 = 0.75」时，两个区间不重叠，
一条样本即可判定用的是哪套公式。coef=0.99/0.9375 时重叠较多，只做辅助。
必须走按钮路径（app.Run 会静默吞错）。
"""
import io, os, sys, time, shutil

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
from run_in_wps import Wps   # noqa: E402

XLSM = sys.argv[1] if len(sys.argv) > 1 else 'out1.xlsm'
N = int(sys.argv[2]) if len(sys.argv) > 2 else 24

# 融合用例（武器, 材料1, 材料2, 期望产物）
CASES = [
    ('愤怒', '重击效率', '额外连击数几率', '重击伤害'),
    ('愤怒', '射速 / 攻击速度', '范围', '格挡角度'),
    ('赤毒布拉玛', '毒素伤害', '火焰伤害', '毒气伤害'),
    ('赤毒布拉玛', '基础伤害', '触发几率', '异常状态伤害'),
    ('塞多', '电击伤害', '冰冻伤害', '磁力伤害'),
]

近战永正 = {2, 3, 9, 10, 11, 12, 27, 29}
远程永正 = {9, 10, 11, 12, 20}
永负行 = 30


def P(*a):
    print(' '.join(str(x) for x in a))


def main():
    # 路径必须绝对：WPS 按自己的当前目录解析相对路径（报「无法找到 .\xxx.xlsm」）
    src = os.path.abspath(XLSM)
    out = os.path.join(os.path.dirname(src), 'vf_%d.xlsm' % os.getpid())
    s = Wps(src, out, '洗卡模拟器', visible=False)
    try:
        ws = s.ws
        dws = s.sheet('data')
        pws = s.sheet('参数')
        tws = s.sheet('倾向表')
        P('按钮:', s.buttons())

        nameCol = int(pws.Range('B28').Value)
        lo = float(pws.Range('B4').Value)
        hi = float(pws.Range('B6').Value)
        P('显示名列=%d  浮动=[%s, %s]' % (nameCol, lo, hi))

        # 参数 B10:C13 组合系数
        combo = {}
        for r in (10, 11, 12, 13):
            combo[r] = (float(pws.Cells(r, 2).Value), float(pws.Cells(r, 3).Value))
        P('组合系数(行: 正面, 负面) =', combo)

        # 类别 -> 数据列键
        cat2key = {}
        for i in range(33, 38):
            c = str(pws.Cells(i, 1).Value).strip()
            if c:
                cat2key[c] = str(pws.Cells(i, 2).Value)
        P('类别->键 =', cat2key)

        def lookup(wname):
            """武器名 -> (disp, cat, key)"""
            for i in range(2, 641):
                nm = tws.Cells(i, 10).Value
                if nm and str(nm).strip() == wname:
                    disp = float(tws.Cells(i, 11).Value)
                    cat = str(tws.Cells(i, 12).Value).strip()
                    return disp, cat, cat2key.get(cat, '')
            return None, '', ''

        def row_of(nm):
            for k in range(2, 53):
                if str(dws.Cells(k, nameCol).Value).strip() == nm:
                    return k
            return 0

        def vcol_of(key):
            for j in range(7, 12):
                if str(dws.Cells(1, j).Value).strip() == key:
                    return j
            return 0

        def filler(cat, key, vcol, exclude, want_neg):
            """挑一个能放在该槽的合法词条名（按正负规则）"""
            melee = cat in ('近战', '近战·天工造武')
            for k in range(2, 35):
                if k in exclude:
                    continue
                b = dws.Cells(k, vcol).Value
                try:
                    float(b)
                except (TypeError, ValueError):
                    continue
                if melee and k >= 35:
                    continue
                永正 = (k >= 35) or (k in (近战永正 if melee else 远程永正))
                if want_neg and 永正:
                    continue
                if (not want_neg) and k == 永负行:
                    continue
                return k, str(dws.Cells(k, nameCol).Value).strip()
            return 0, ''

        rows = []
        for n in range(N):
            wname, m1, m2, want = CASES[n % len(CASES)]
            disp, cat, key = lookup(wname)
            if not key:
                P('!! 认不出武器', wname)
                continue
            vcol = vcol_of(key)
            r1, r2 = row_of(m1), row_of(m2)
            # 变体：轮换正负构型，得到不同 coef
            variant = n % 4
            extra_pos = variant >= 2        # 第 3 格也填 -> nPos=3
            has_neg = variant % 2 == 1      # 第 4 格有负面 -> nNeg=1

            s.clear_dialogs()
            ws.Range('I4').Value = wname
            ws.Range('I5').Value = 1
            s.run('Sheet7.刷新候选')
            for r in range(18, 22):
                ws.Range('L%d' % r).Value = '不锁'
            for r in range(30, 36):
                for c in ('I', 'K', 'L'):
                    ws.Range('%s%d' % (c, r)).Value = ('' if c != 'L' else '不锁')
            s.click('CommandButton3')               # 洗卡(自选)

            ws.Range('I18').Value = m1              # 材料必须先在卡面上
            ws.Range('K18').Value = 100
            ws.Range('I19').Value = m2
            ws.Range('K19').Value = 100
            if extra_pos:
                _, fn = filler(cat, key, vcol, {r1, r2}, False)
                ws.Range('I20').Value = fn
                ws.Range('K20').Value = 100
            else:
                ws.Range('I20').Value = ''
                ws.Range('K20').Value = ''
            if has_neg:
                _, fn = filler(cat, key, vcol, {r1, r2}, True)
                ws.Range('I21').Value = fn
                ws.Range('K21').Value = 100
            else:
                ws.Range('I21').Value = ''
                ws.Range('K21').Value = ''
            ws.Range('I26').Value = m1
            ws.Range('I27').Value = m2

            s.click('CommandButton5')               # 融合(自选) —— 按钮路径

            prods = []
            for i in range(1, 7):
                nm = ws.Range('I%d' % (29 + i)).Value
                v = ws.Range('K%d' % (29 + i)).Value
                if nm:
                    prods.append((str(nm).strip(), float(v)))
            dg = [d for d in s.dialogs()
                  if ('出错' in d or '没有' in d or '已经' in d or '无法' in d
                      or '不足' in d or '请先' in d)]
            if not prods or dg:
                P('  #%02d %s 跳过（无产物/有弹窗）%s' % (n, wname, dg))
                continue

            nm, v = prods[0]
            prRow = row_of(nm)
            base = float(dws.Cells(prRow, vcol).Value)
            nPos = 3 if extra_pos else 2
            nNeg = 1 if has_neg else 0
            cRow = (13 if nNeg == 1 else 12) if nPos >= 3 else (11 if nNeg == 1 else 10)
            coef = combo[cRow][0]
            ratio = v / (base * disp)
            new_ok = coef * lo - 0.02 <= ratio <= coef * hi + 0.02
            old_ok = lo - 0.02 <= ratio <= hi + 0.02
            rows.append((n, wname, nm, nPos, nNeg, coef, ratio, new_ok, old_ok))
            P('  #%02d %-6s %-8s %d正%d负 coef=%.4f  比值=%.4f  新区间[%0.4f,%0.4f] %s | 旧公式%s'
              % (n, wname, nm, nPos, nNeg, coef, ratio,
                 coef * lo, coef * hi,
                 '✅' if new_ok else '❌', '也说得通' if old_ok else '说不通(证明是新公式)'))
            time.sleep(0.06)
        s.close(False)

        if not rows:
            P('!! 一条样本都没拿到')
            return 1
        ok = sum(1 for r in rows if r[7])
        证明 = sum(1 for r in rows if not r[8])
        P('')
        P('样本 %d 条：符合新公式 %d / %d；其中 %d 条旧公式根本解释不了'
          % (len(rows), ok, len(rows), 证明))
        P('结论: %s' % ('✅ 融合产物已按「基准 x 组合系数 x 倾向 x 浮动」计算'
                        if ok == len(rows) and 证明 > 0 else '❌ 未通过'))
        return 0 if (ok == len(rows) and 证明 > 0) else 1
    finally:
        try:
            s.close(False)
        except Exception:
            pass


if __name__ == '__main__':
    sys.exit(main())
