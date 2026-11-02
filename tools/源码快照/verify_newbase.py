# -*- coding: utf-8 -*-
"""验收：改了基准值 / 给某个武器类别补了一条数值之后，宏是否需要改「列表」。
本脚本是该依据的可复跑版本，分三段：
  ① 离线拆包（不打开 Excel）：行数有没有变 / 三个活公式在不在 / 基准值落在哪
  ② 真机 COM（只在副本上跑）：把武器钉成霰弹枪，读宏自己写出来的池子（O35/Q35），
     再连点洗卡看目标词条实际出不出
  ③ 真机 COM：用融合配方验证产物取值 = 新基准 × 组合系数 × 倾向 × 浮动
用法：
    python verify_newbase.py [xlsm路径] [--shot-weapon 鳄] [--rolls 120]
路径必须当参数传或改下面的 DEFAULT —— 文件名带日期，随版本变化。
"""
from __future__ import unicode_literals

import io
import os
import re
import sys
import time
import zipfile

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
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


DEFAULT = _find_xlsm()
OUTDIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')

# 数据表行号常量（与 Sheet7 一致；加/删行时才需要动）
抽取起, 抽取止, 融合起, 融合止 = 2, 34, 35, 52
# 永正 / 永负 / 永不正（Sheet7: 是永正 / 是永负 / 是永不正）
永正_近战, 永正_远程 = {2, 3, 9, 10, 11, 12, 27, 29}, {9, 10, 11, 12, 20}
永负 = {30}
# 组合系数 参数!B10:B13
COEF = {'2增益0减益': 0.99, '2增益1减益': 1.2375, '3增益0减益': 0.75, '3增益1减益': 0.9375}
# 本次核对的四条（OLD 用于证明取值不是原值）
NEW = {26: 80.1, 45: 225.0, 46: 247.5, 47: 45.0}
OLD = {26: None, 45: 90.0, 46: 90.0, 47: 9.0}
FUS_PLAN = [('基础伤害', '变焦', 45),
            ('暴击几率', '变焦', 46),
            ('弹匣容量', '装填速度', 47)]

OK, BAD = [], []


def ck(cond, msg, tag=''):
    (OK if cond else BAD).append(msg)
    print(('  PASS  ' if cond else '  FAIL  ') + msg)


def load(path):
    """离线拆包 -> {表名: {坐标: (attrs, 值, 公式)}}，正确处理自闭合格与 sharedStrings。"""
    z = zipfile.ZipFile(path)
    sst = []
    if 'xl/sharedStrings.xml' in z.namelist():
        sx = z.read('xl/sharedStrings.xml').decode('utf-8')
        sst = [''.join(re.findall(r'<t[^>]*>(.*?)</t>', si, re.S))
               for si in re.findall(r'<si>(.*?)</si>', sx, re.S)]
    wb = z.read('xl/workbook.xml').decode('utf-8')
    rels = z.read('xl/_rels/workbook.xml.rels').decode('utf-8')
    r2t = dict(re.findall(r'Id="([^"]+)"[^>]*Target="([^"]+)"', rels))
    out = {}
    for name, rid in re.findall(r'<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"', wb):
        t = r2t.get(rid, '')
        t = t if t.startswith('xl/') else 'xl/' + t.lstrip('/')
        xml = z.read(t).decode('utf-8')
        cells = {}
        # 必须同时吃「自闭合 <c .../>」和「成对 <c ...>...</c>」，否则整格会被吞掉
        for m in re.finditer(r'<c r="([A-Z]+\d+)"([^>]*?)(?:/>|>(.*?)</c>)', xml, re.S):
            ref, attrs, body = m.group(1), m.group(2), (m.group(3) or '')
            fm = re.search(r'<f[^>]*>(.*?)</f>', body, re.S)
            vm = re.search(r'<v>(.*?)</v>', body, re.S)
            raw = vm.group(1) if vm else None
            if 't="s"' in attrs and raw is not None and raw.isdigit() and int(raw) < len(sst):
                raw = sst[int(raw)]                     # <v> 是 sharedStrings 下标，不是文本
            cells[ref] = (attrs, raw, fm.group(1) if fm else None)
        out[name] = cells
    z.close()
    return out


def is_num(v):
    """等价于 VBA 的 IsNumeric + Excel 的 ISNUMBER。
    注意数据表里「没这个类别」的格子填的是字符串 '-'，`not in (None,'')` 会把它当成有值，
      但 IsNumeric('-') = False —— 必须真的试转 float。"""
    if v is None or v == '':
        return False
    try:
        float(v)
        return True
    except (TypeError, ValueError):
        return False


def rowmax(cells, cols):
    mx = 0
    for ref in cells:
        m = re.match(r'^([A-Z]+)(\d+)$', ref)
        if m and m.group(1) in cols:
            mx = max(mx, int(m.group(2)))
    return mx


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    path = args[0] if args else DEFAULT
    rolls = 120
    if '--rolls' in sys.argv:
        rolls = int(sys.argv[sys.argv.index('--rolls') + 1])
    weapon = '鳄'
    if '--shot-weapon' in sys.argv:
        weapon = sys.argv[sys.argv.index('--shot-weapon') + 1]
    cats = ['步枪', '霰弹', '手枪', '曲翼', '近战']

    print('验收对象：%s（%d 字节）' % (path, os.path.getsize(path)))

    # ================= ① 离线 =================
    print('\n' + '=' * 60)
    print('① 离线拆包（不看 Excel 也能看的那些）')
    print('=' * 60)
    sh = load(path)
    dat, par, cal = sh['data'], sh['参数'], sh['计算器']

    ck(rowmax(dat, 'GHIJK') == 融合止,
       '数据表 G:K 最大行 = %d（宏常量 抽取起%d/抽取止%d/融合起%d/融合止%d 依赖它）'
       % (rowmax(dat, 'GHIJK'), 抽取起, 抽取止, 融合起, 融合止))
    for ref, want in (('B28', True), ('B29', True), ('B30', True)):
        _, v, f = par.get(ref, ('', None, None))
        ck(bool(f), '参数!%s 仍是活公式（缓存值 %r）—— 绝不能被写死' % (ref, v))
    _, b24, _ = par.get('B24', ('', None, None))
    ck(b24 is not None, '参数!B24 新武器默认倾向 = %r' % (b24,))

    print('\n  这次动过的 4 条基准值（数据!G:K → 步枪/霰弹/手枪/曲翼/近战）：')
    for r in sorted(NEW):
        nm = dat.get('A%d' % r, ('', '', ''))[1]
        vals = [dat.get('%s%d' % (c, r), ('', None, ''))[1] for c in 'GHIJK']
        print('    行%-3d %-16s %s    （改动前 %s）' % (r, nm, vals, OLD[r]))

    print('\n  「参数!B30」对应的那列，在 2~%d 行里有值的行 = 该类别洗卡池：' % 抽取止)
    _, cat, _ = par.get('B30', ('', None, None))
    if cat in cats:
        vcol = 'GHIJK'[cats.index(cat)]
        pool_rows = [r for r in range(抽取起, 抽取止 + 1)
                     if is_num(dat.get('%s%d' % (vcol, r), ('', None, ''))[1])]
        pos = [r for r in pool_rows if r not in 永负]
        neg = [r for r in pool_rows if r not in (永正_近战 if cat.startswith('近战') else 永正_远程)]
        print('    类别 %s（%s 列）：%d 条 → 正面池 %d / 负面池 %d'
              % (cat, vcol, len(pool_rows), len(pos), len(neg)))
        for r in sorted(NEW):
            if r <= 抽取止:
                ck(r in pool_rows, '改过的行 %d 在 %s 的洗卡池里（%s 列有值）'
                   % (r, cat, vcol))
            else:
                ck(r not in pool_rows, '改过的行 %d 在融合专属区，不在洗卡池里' % r)

    # ================= ②③ 真机 =================
    print('\n' + '=' * 60)
    print('② 真机 COM（只在副本上跑）：钉死一把霰弹枪，读宏自己写出来的池子')
    print('=' * 60)
    try:
        from run_in_wps import Wps                                   # noqa: E402
    except ImportError as e:
        ck(False, '导入 run_in_wps 失败（跳过真机部分）：%s' % e)
        summary()
        return

    if not os.path.isdir(OUTDIR):
        os.makedirs(OUTDIR)
    out = os.path.join(OUTDIR, 'verify_newbase_out.xlsm')
    # 运行中断（比如被 timeout / head 打断）会留下被 WPS 占用的副本，
    # 直接覆盖会 PermissionError。被占用时改用其它文件名，避免验收中断在文件锁上。
    try:
        if os.path.exists(out):
            os.remove(out)
    except OSError:
        out = os.path.join(OUTDIR, 'verify_newbase_out_%d.xlsm' % int(time.time()))
    s = Wps(path, out, '洗卡模拟器', visible=False)
    try:
        cal_s = s.sheet('计算器')

        s.set('I4', weapon)
        s.set('I5', 1)
        time.sleep(0.2)
        s.clear_dialogs()
        s.click('CommandButton3')                      # 洗卡(自选) -> blk 3
        sel = s.get('I6')
        print('  自选武器 = %r' % sel)
        ck(bool(sel), '「洗卡(自选)」选中了武器')

        pool = [v for v in (s.ws.Range('O%d' % r).Value for r in range(35, 66)) if v]
        negp = [v for v in (s.ws.Range('Q%d' % r).Value for r in range(35, 66)) if v]
        print('  宏写出的正面池 O35:O65 = %d 条：%s' % (len(pool), '、'.join(pool)))
        print('  宏写出的负面池 Q35:Q65 = %d 条：%s' % (len(negp), '、'.join(negp)))

        # 用离线算出来的期望池对照（按该武器真实类别那列）
        ck('变焦' in pool, '★ 目标词条「变焦」在正面池里')
        ck('变焦' in negp, '「变焦」在负面池里（不在永正集合 → 正负都能出）')
        ck(len(pool) == 24, '霰弹正面池 %d 条（离线按 数据!H 列 2~34 行算，也应是 24）' % len(pool))
        ck(len(negp) == 19, '霰弹负面池 %d 条（24 − 永正 5 条 = 19）' % len(negp))
        for nm, r in (('弱点伤害', 45), ('弱点暴击几率', 46), ('弹药效率', 47)):
            ck(nm not in pool, '融合专属「%s」不在洗卡池（行 %d ∈ %d~%d）' % (nm, r, 融合起, 融合止))

        print('\n  连点 %d 次「洗卡(自选)」，看「变焦」实际出没出：' % rolls)
        hits = []
        for k in range(rolls):
            if s.click('CommandButton3'):
                ck(False, '洗卡(自选) 第 %d 次报错' % (k + 1))
                break
            for i in range(4):
                if s.ws.Range('I%d' % (18 + i)).Value == '变焦':
                    hits.append((i + 1, s.ws.Range('K%d' % (18 + i)).Value))
        print('    出现 %d 次；槽位 %s；样例 %s'
              % (len(hits), sorted({h[0] for h in hits}), [h[1] for h in hits[:8]]))
        ck(len(hits) > 0, '霰弹洗卡真的能出「变焦」（%d 次）→ 池是动态生成的，没有清单要维护' % len(hits))
        posv = [float(v) for i, v in hits if i <= 3 and v is not None]
        negv = [float(v) for i, v in hits if i == 4 and v is not None]
        if posv:
            ck(all(v > 0 for v in posv), '正面槽全为正（%.2f ~ %.2f）' % (min(posv), max(posv)))
        if negv:
            ck(all(v < 0 for v in negv), '负面槽全为负（%.2f ~ %.2f）' % (min(negv), max(negv)))

        # ================= ③ 融合 =================
        print('\n' + '=' * 60)
        print('③ 真机 COM：融合产物的取值 = 新基准 × 组合系数 × 倾向 × 浮动')
        print('=' * 60)
        tend = float(cal_s.Range('B7').Value) if cal_s.Range('B7').Value else 0.8
        for ing1, ing2, r in FUS_PLAN:
            want = {45: '弱点伤害', 46: '弱点暴击几率', 47: '弹药效率'}[r]
            print('\n  [融合] %s + %s -> %s（新基准 %s，旧 %s）' % (ing1, ing2, want, NEW[r], OLD[r]))

            def names():
                return [s.ws.Range('I%d' % (18 + i)).Value for i in range(4)]

            for i in range(4):
                s.ws.Range('L%d' % (18 + i)).Value = '不锁'
            got = False
            for k in range(400):
                if ing1 in names() and ing2 in names():
                    got = True
                    break
                for i in range(4):
                    nm = s.ws.Range('I%d' % (18 + i)).Value
                    s.ws.Range('L%d' % (18 + i)).Value = \
                        '锁定' if nm in (ing1, ing2) else '不锁'
                if s.click('CommandButton3'):
                    break
            ck(got, '凑齐材料 %s + %s（锁定洗卡 %d 次）' % (ing1, ing2, k))
            if not got:
                continue

            pre = names()
            npos = sum(1 for i in range(3) if pre[i])
            key = '%d增益%d减益' % (npos, 1 if pre[3] else 0)
            ck(key in COEF, '卡面组合类型 = %s（系数 %s）' % (key, COEF.get(key)))
            mu = COEF.get(key, 1.0) * tend
            print('     融合前卡面 %s' % pre)

            s.set('I26', ing1)
            s.set('I27', ing2)
            s.clear_dialogs()
            if s.click('CommandButton5'):                        # 融合(自选)
                ck(False, '融合按钮报错')
                continue
            if [t for t in s.dialogs() if '出错了' in str(t)]:
                ck(False, '融合弹错：%s' % s.dialogs())
                continue
            found = None
            for i in range(4):
                nm = s.ws.Range('I%d' % (29 + i)).Value
                if nm in ('弱点伤害', '弱点暴击几率', '弹药效率'):
                    found = (nm, float(s.ws.Range('K%d' % (29 + i)).Value))
                    break
            ck(found is not None, '产物栏出现了融合产物')
            if not found:
                continue
            nm, v = found
            ck(nm == want, 'dist = %s（实际 %s）' % (want, nm))
            lo, hi = NEW[r] * mu * 0.9, NEW[r] * mu * 1.1
            old_hi = OLD[r] * mu * 1.1
            print('     值 %s ∈ [%.2f, %.2f]（旧基准上限只有 %.2f）' % (v, lo, hi, old_hi))
            ck(lo * 0.999 <= v <= hi * 1.001, 'A 落在新基准区间内 → 基准按行号现读，读对了')
            ck(v > old_hi * 1.0001, 'B 高于旧基准上限 → 用的确实是这次改过的新数值')

        dls = [t for t in s.dialogs() if '出错了' in str(t)]
        ck(not dls, '全程没有「出错了」弹窗')
    finally:
        s.close(False)

    summary()


def summary():
    print('\n' + '=' * 60)
    print('==== 通过 %d / 失败 %d ====' % (len(OK), len(BAD)))
    for m in BAD:
        print('  FAIL:', m)
    print('结论：只改基准值 / 给某类别补一条数值 → 宏 **0 改动**，只要重算 + 真保存。')
    print('      要加/删行才需要动 `02-data-update-propagate.md` 里的 6 个同步点。')
    sys.exit(1 if BAD else 0)


if __name__ == '__main__':
    main()
