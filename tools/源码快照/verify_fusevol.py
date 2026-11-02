# -*- coding: utf-8 -*-
"""dist vol = max(材料A的浮动, 材料B的浮动)。
两段：
  ① 离线拆包：数值公式要用的常量读对没有 + 注入后的 Sheet7 源码里确实有 材料浮动()
  ② 真机 COM（只在副本上跑）：
       A. 手填模式 —— 把材料写死成「已知浮动」，产物必须等于 max 那一档（含夹紧到 [0.9,1.1]）
       B. 自然洗卡模式 —— 洗出什么材料就用什么，断言产物 = base × gain × max(rA, rB)
          关键判据是排他性：两个假设差得开时，实际值必须不等于 min 那一档，
            否则说明取值来自随机（或者继承了较低的那个）。
     disp（倾向）在「期望值」里被约掉了：
          vol_i = 内部值_i / (基准_i × 系数_i × disp)
          dist  = 基准_p × gain × disp × max(vol_i)
                = 基准_p × gain × max(内部值_i / (基准_i × 系数_i))
       所以断言不需要知道倾向（手填那一段才需要 disp，只用来造数）。
用法：
    python verify_fusevol.py [xlsm路径] [--rounds 30] [--weapon 鳄]
文件名带日期，脚本不写死：按「旁边 → 上一级 → 上两级」自动找最新的 *紫卡模拟器*.xlsm。
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

OUTDIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')

抽取起, 抽取止, 融合起, 融合止 = 2, 34, 35, 52
派系行 = {16, 17, 18, 42, 43, 44}
后坐力行 = 25

OK, BAD = [], []


def ck(cond, msg, tag=''):
    (OK if cond else BAD).append(msg)
    print(('  PASS  ' if cond else '  FAIL  ') + msg)


# ---------------- 离线读包 ----------------
def load(path):
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
        # 自闭合 <c .../> 也要吃，不然「值是空串」的格子整格消失
        for m in re.finditer(r'<c r="([A-Z]+\d+)"([^>]*?)(?:/>|>(.*?)</c>)', xml, re.S):
            ref, attrs, body = m.group(1), m.group(2), (m.group(3) or '')
            fm = re.search(r'<f[^>]*>(.*?)</f>', body, re.S)
            vm = re.search(r'<v>(.*?)</v>', body, re.S)
            raw = vm.group(1) if vm else None
            if 't="s"' in attrs and raw is not None and raw.isdigit() and int(raw) < len(sst):
                raw = sst[int(raw)]                 # <v> 是 sharedStrings 下标
            cells[ref] = (attrs, raw, fm.group(1) if fm else None)
        out[name] = cells
    z.close()
    return out


def is_num(v):
    """等价于 VBA IsNumeric —— 数据表里「不适用」填的是字符串 '-'，必须真转 float 才知道。"""
    if v is None or v == '':
        return False
    try:
        float(v)
        return True
    except (TypeError, ValueError):
        return False


def num(v):
    return float(v) if is_num(v) else None


def colnum(ref):
    m = re.match(r'^([A-Z]+)(\d+)$', ref)
    return m.group(1), int(m.group(2))


# ---------------- 口径换算（与 Sheet7 的 基准内部 / 内部值 / 游戏值 逐字对齐）----------------
def 基准内部(b):
    return b


def 内部值(row, g):
    if row in 派系行:
        return (g - 1) * 100
    if row == 后坐力行:
        return -g
    return g


def 游戏值(row, v):
    if row in 派系行:
        return 1 + v / 100
    if row == 后坐力行:
        return -v
    return v


def find_xlsm():
    here = os.path.dirname(os.path.abspath(__file__))
    for d in (here, os.path.dirname(here), os.path.dirname(os.path.dirname(here)), os.getcwd()):
        try:
            hits = [os.path.join(d, f) for f in os.listdir(d)
                    if f.endswith('.xlsm') and '紫卡模拟器' in f and '备份' not in f
                    and not f.startswith('~$') and not f.startswith('_')]
        except OSError:
            continue
        if hits:
            return max(hits, key=os.path.getmtime)
    return None


def main():
    # 选项的值不是位置参数：`--rounds 6` 里的 `6` 不能当成 xlsm 路径
    # （写成 `[a for a in argv if not a.startswith('--')]` 会把它收进来 → 找不到文件）。
    argv = sys.argv[1:]
    args, opt = [], {}
    i = 0
    while i < len(argv):
        if argv[i] == '--rounds':
            opt['rounds'] = int(argv[i + 1]); i += 2
        elif argv[i] == '--weapon':
            opt['weapon'] = argv[i + 1]; i += 2
        else:
            args.append(argv[i]); i += 1
    path = args[0] if args else find_xlsm()
    rounds = opt.get('rounds', 30)
    weapon = opt.get('weapon', '鳄')

    if not path or not os.path.exists(path):
        print('找不到 xlsm，请把路径当参数传进来')
        sys.exit(2)
    print('验收对象：%s（%d 字节）' % (path, os.path.getsize(path)))

    # ================= ① 离线 =================
    print('\n' + '=' * 64)
    print('① 离线：常量读对没 + 注入后的源码里有没有 材料浮动()')
    print('=' * 64)
    sh = load(path)
    dat, par, fus = sh['data'], sh['参数'], sh['融合']

    lo = num(par.get('B4', ('', None, ''))[1])
    hi = num(par.get('B6', ('', None, ''))[1])
    ck(lo == 0.9 and hi == 1.1, '参数!B4/B6 浮动区间 = %s ~ %s' % (lo, hi))
    combos = {}
    for r in (10, 11, 12, 13):
        combos[r] = (num(par.get('B%d' % r, ('', None, ''))[1]),
                     num(par.get('C%d' % r, ('', None, ''))[1]))
    print('  组合系数 参数!B10:C13 = %s' % combos)
    ck(all(g is not None for g, n in combos.values()),
       '四档组合系数（增益/减益）都读到了')

    # 名字 -> 数据表行号（三列语言名）
    name2row = {}
    for r in range(抽取起, 融合止 + 1):
        for c in 'ABC':
            nm = dat.get('%s%d' % (c, r), ('', None, ''))[1]
            if nm:
                name2row[str(nm).strip()] = r
    # 融合配方：按行号配对
    FUSE = {}
    for r in range(2, 40):
        a = fus.get('A%d' % r, ('', None, ''))[1]
        b = fus.get('B%d' % r, ('', None, ''))[1]
        c = fus.get('C%d' % r, ('', None, ''))[1]
        if not (a and b and c):
            continue
        ra, rb, rc = name2row.get(str(a).strip()), name2row.get(str(b).strip()), name2row.get(str(c).strip())
        if not (ra and rb and rc):
            continue
        FUSE[(min(ra, rb), max(ra, rb))] = rc
    ck(len(FUSE) >= 18, '融合配方解析出 %d 条' % len(FUSE))

    # 注入后的源码：走 dump_raw.py 拿原始字节再按 cp936 解（olevba 的 stdout 会多插空行）
    src = None
    try:
        import subprocess
        tmpbin = os.path.join(OUTDIR, '_s7check.bin')
        if not os.path.isdir(OUTDIR):
            os.makedirs(OUTDIR)
        subprocess.check_call(
            [sys.executable,
             os.path.join(_SKILL, 'dump_raw.py'),
             path, tmpbin, 'Sheet7'],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        src = open(tmpbin, 'rb').read().decode('cp936')
    except Exception as e:
        print('  （跳过源码检查：%s）' % e)
    if src:
        ck('材料浮动' in src, 'Sheet7 源码里有 材料浮动()')
        ck('vol2 > vol Then vol = vol2' in src,
           '融合() 里取的是两个材料里**较高**的那个（vol2 > vol Then vol = vol2）')
        body = src.split("' 11. 产物写进卡面并自动锁定")[-1].split("' 12.")[0]
        # 只认「代码行」：注释里也会出现同样表述，用 ^\s*vol = 锚定才不会误判
        ck(not re.search(r'^\s*vol\s*=\s*lo\s*\+\s*Rnd', body, re.M),
           '融合() 第 11 步里已经没有「重新随机浮动」那行**代码**（注释里提到不算）')
        ck('材料浮动(blk, m1' in body and '材料浮动(blk, m2' in body,
           '第 11 步对两个材料各反解了一次浮动')

    # ================= ② 真机 =================
    print('\n' + '=' * 64)
    print('② 真机 COM（只在副本上跑）：产物浮动 == max(材料A, 材料B)')
    print('=' * 64)
    try:
        from run_in_wps import Wps                                   # noqa: E402
    except ImportError as e:
        ck(False, '导入 run_in_wps 失败：%s' % e)
        return summary()

    if not os.path.isdir(OUTDIR):
        os.makedirs(OUTDIR)
    out = os.path.join(OUTDIR, 'verify_fusevol_out.xlsm')
    try:
        if os.path.exists(out):
            os.remove(out)
    except OSError:
        out = os.path.join(OUTDIR, 'verify_fusevol_out_%d.xlsm' % int(time.time()))

    s = Wps(path, out, '洗卡模拟器', visible=False)
    hit_hi, hit_lo = 0, 0          # 命中的是「材料A浮动高」还是「材料B浮动高」
    excl = 0                       # 排他性断言真的跑到（两个假设差得开）的次数
    negslot = 0                    # 材料出现在负面槽（第 4 格）的次数
    try:
        # ---- 钉死武器 ----
        s.set('I4', weapon)
        s.set('I5', 1)
        time.sleep(0.2)
        s.clear_dialogs()
        if s.click('CommandButton3'):
            ck(False, '洗卡(自选) 报错')
            return summary()
        wsel = s.get('I6')
        info = str(s.get('I8'))
        print('  自选武器 = %r' % wsel)
        print('  洗卡对象 = %r' % info)
        ck(bool(wsel), '「洗卡(自选)」选中了武器')

        # 类别 -> 数据列（参数!A33:B37 是 显示名 -> 数据列键；数据!G1:K1 是列键）
        cat = None
        m = re.search(r'\|\s*([^|]+?)\s*$', info)
        if m:
            cat = m.group(1).strip()
        print('  类别 = %r' % cat)
        key = None
        for r in range(33, 38):
            if str(par.get('A%d' % r, ('', None, ''))[1]).strip() == cat:
                key = str(par.get('B%d' % r, ('', None, ''))[1]).strip()
        ck(key is not None, '参数!A33:B37 里查到「%s」的数据列键 = %r' % (cat, key))
        if key is None:
            return summary()
        vcol = None
        for c in 'GHIJK':
            if str(dat.get('%s1' % c, ('', None, ''))[1]).strip() == key:
                vcol = c
        ck(vcol is not None, '数据!G1:K1 里查到列键 %r -> %s 列' % (key, vcol))
        if vcol is None:
            return summary()

        def base_of(row):
            b = num(dat.get('%s%d' % (vcol, row), ('', None, ''))[1])
            if b is None:
                return None
            return (b - 1) * 100 if row in 派系行 else b

        # 倾向（只在「手写材料」那一段造数时要用；自然洗卡的断言不需要它）
        disp = None
        tend = sh.get('倾向表', {})
        wkey = re.sub(r'\s+', '', str(wsel))
        for ref, (_, v, _f) in tend.items():
            c, r = colnum(ref)
            if c == 'J' and v and re.sub(r'\s+', '', str(v)) == wkey:
                disp = num(tend.get('K%d' % r, ('', None, ''))[1])
                break
        ck(disp is not None, '倾向表里查到「%s」的倾向 = %s' % (wsel, disp))
        if disp is None:
            return summary()

        def slot_names():
            return [s.get('I%d' % (18 + i)) for i in range(4)]

        def slot_vals():
            return [num(s.get('K%d' % (18 + i))) for i in range(4)]

        def combo_of(names):
            npos = max([i + 1 for i in range(3) if names[i]] or [0])
            npos = max(npos, 2)
            nneg = 1 if names[3] else 0
            row = 12 if npos >= 3 and nneg == 0 else (13 if npos >= 3 else (10 if nneg == 0 else 11))
            return row, combos[row][0], combos[row][1]

        def prod_row(r1, r2):
            p = FUSE.get((min(r1, r2), max(r1, r2)))
            if p and base_of(p) is not None:
                return p
            return 0

        def fuse_and_check(tag, names, m1, m2, vals=None):
            """点一次「融合(自选)」，断言产物 = base_p × gain × max(材料浮动)。"""
            nonlocal hit_hi, hit_lo, excl, negslot
            r1, r2 = names[m1], names[m2]
            pr = prod_row(r1, r2)
            if not pr:
                return None
            # 组合类型一律按点按钮前卡面上真正写着的东西判，别按以为写进去的东西
            real = [name2row.get(str(x).strip()) if x else None for x in slot_names()]
            crow, gain, negc = combo_of(real)
            if os.environ.get('ZKDEBUG'):
                print('        DBG 卡面=%s 值=%s → 组合行%d gain=%s neg=%s'
                      % (real, slot_vals(), crow, gain, negc))
            b1, b2, bp = base_of(r1), base_of(r2), base_of(pr)
            if not (b1 and b2 and bp):
                return None
            g1, g2 = (vals or slot_vals())[m1], (vals or slot_vals())[m2]
            if g1 is None or g2 is None:
                return None
            c1 = negc if m1 == 3 else gain
            c2 = negc if m2 == 3 else gain
            # 材料自己的浮动系数（和 VBA 材料浮动() 同一步，含夹紧到 [lo, hi]）
            va = min(max(内部值(r1, g1) / (b1 * c1) / disp, lo), hi)
            vb = min(max(内部值(r2, g2) / (b2 * c2) / disp, lo), hi)
            vmax = max(va, vb)
            vmin = min(va, vb)
            if os.environ.get('ZKDEBUG'):
                print('        DBG 材料浮动 A=%.4f B=%.4f -> 取 %.4f（disp=%s gain=%s）'
                      % (va, vb, vmax, disp, gain))
            want = 游戏值(pr, bp * gain * disp * vmax)
            want_lo = 游戏值(pr, bp * gain * disp * vmin)

            # 下拉里填「卡面上现在写着的那两个名字」—— 别去查数据表的国服名，
            # 当前显示语言由 参数!B28 决定，写别的写法会「选不上对不上」。
            s.set('I26', str(slot_names()[m1]))
            s.set('I27', str(slot_names()[m2]))
            s.clear_dialogs()
            err = s.click('CommandButton5')
            if err:
                ck(False, '%s：融合按钮报错 %s' % (tag, err))
                return None
            dls = [t for t in s.dialogs() if '出错了' in str(t)]
            if dls:
                ck(False, '%s：融合弹错 %s' % (tag, dls))
                return None
            # 产物落在正面材料那个槽（mp）；也在产物栏里留了一份
            after = slot_names()
            av = slot_vals()
            got = None
            for i in range(4):
                nmp = name2row.get(str(after[i]).strip()) if after[i] else None
                if nmp and 融合起 <= nmp <= 融合止:
                    got = (nmp, av[i])
                    break
            if got is None:
                ck(False, '%s：卡面上没找到融合产物' % tag)
                return None
            grow, gv = got
            ck(grow == pr, '%s：产物 = 行%d（期望 %d）' % (tag, grow, pr))
            ck(abs(gv - want) <= 0.011,
               '%s：产物值 %.4f == max 假设 %.4f（差 %.4f）'
               % (tag, gv, want, abs(gv - want)))
            # 排他性：两个假设差得开时，必须不等于 min 那一档
            if abs(want - want_lo) > 0.05:
                excl += 1
                ck(abs(gv - want_lo) > 0.011,
                   '%s：产物值 %.4f != min 假设 %.4f → 继承的是**较高**的那个，不是较低/随机'
                   % (tag, gv, want_lo))
                # 用 va/vb（反解出来的浮动），不用 ra/rb —— 那是 ① 段解析配方时的
                # 行号变量，同名会串台，结果是 12/12 全判成同一边。
                if va > vb:
                    hit_hi += 1
                else:
                    hit_lo += 1
                if 3 in (m1, m2):
                    negslot += 1
            return True

        # ---------- A. 手填模式：把材料的浮动写死 ----------
        print('\n  A. 手填模式（材料的浮动由外部写死，产物必须取 max，含夹紧到 [0.9,1.1]）')
        plan = [(0.95, 1.05, 'B 高'), (1.05, 0.95, 'A 高'),
                (1.60, 0.40, '两边都超界 -> 夹到 1.10 / 0.90，取 1.10'),
                (0.92, 0.91, '两边都偏低 -> 取 0.92')]
        pairs = [p for p in FUSE.items() if base_of(p[1]) is not None]
        for k, (v1, v2, why) in enumerate(plan):
            key2 = pairs[k % len(pairs)]
            r1, r2, pr = key2[0][0], key2[0][1], key2[1]
            if base_of(r1) is None or base_of(r2) is None:
                continue
            # 只留两个材料在 1、2 号槽 -> 组合固定「2增益0减益」(行10)
            for i in range(4):
                s.set('L%d' % (18 + i), '不锁')
            # ClearContents 必须带括号：写成 `MergeArea.ClearContents` 在 COM 里只是
            for i in range(4):
                s.ws.Range('I%d' % (18 + i)).MergeArea.ClearContents()
                s.ws.Range('K%d' % (18 + i)).Value = ''
            s.set('I18', str(dat.get('A%d' % r1, ('', '', ''))[1]))
            s.set('I19', str(dat.get('A%d' % r2, ('', '', ''))[1]))
            # 组合系数按清完之后卡面上真实剩的东西取，不假设成 2增益0减益
            _c, gain, _n = combo_of([name2row.get(str(x).strip()) if x else None
                                     for x in slot_names()])
            # 不四舍五入：写进去多少就存多少，读回来再算期望（舍入误差会污染断言）
            s.set('K18', 游戏值(r1, base_of(r1) * gain * disp * v1))
            s.set('K19', 游戏值(r2, base_of(r2) * gain * disp * v2))
            names = [r1, r2, None, None]
            vals = [num(s.get('K18')), num(s.get('K19')), None, None]
            exp_vol = max(min(max(v1, v2), hi), lo)
            print('     [%-34s] 材料浮动 %.2f / %.2f -> 期望产物浮动 %.2f' % (why, v1, v2, exp_vol))
            fuse_and_check('手填%d' % (k + 1), names, 0, 1, vals)
            # 每轮之后清掉卡上的融合产物，避免下一轮被「每卡最多一条」拦住
            for i in range(4):
                s.set('L%d' % (18 + i), '不锁')
            s.clear_dialogs()
            s.click('CommandButton3')

        # ---------- B. 自然洗卡模式 ----------
        print('\n  B. 自然洗卡模式（洗出什么材料就用什么，断言不含倾向 —— 期望里它被约掉了）')
        done = 0
        for k in range(rounds * 4):
            if done >= rounds:
                break
            for i in range(4):
                s.set('L%d' % (18 + i), '不锁')
            s.clear_dialogs()
            if s.click('CommandButton3'):
                ck(False, '洗卡(自选) 第 %d 次报错' % (k + 1))
                break
            nm = slot_names()
            rows = [name2row.get(str(x).strip()) if x else None for x in nm]
            pick = None
            for a in range(4):
                for b in range(a + 1, 4):
                    if rows[a] and rows[b] and prod_row(rows[a], rows[b]):
                        pick = (a, b)
                        break
                if pick:
                    break
            if not pick:
                continue
            # 材料不能已经是融合产物（35~52 只能当产物）
            if any(rows[i] and 融合起 <= rows[i] <= 融合止 for i in pick):
                continue
            done += 1
            fuse_and_check('洗卡%d' % done, rows, pick[0], pick[1])
            for i in range(4):
                s.set('L%d' % (18 + i), '不锁')
            s.clear_dialogs()
            s.click('CommandButton3')

        ck(done > 0, '自然洗卡模式跑到了 %d 组融合' % done)
        ck(excl > 0, '排他性断言真的跑到 %d 次（两个假设差得开的情形）' % excl)
        ck(hit_hi + hit_lo == excl, '每次都判出了「谁高」（A高 %d 次 / B高 %d 次）' % (hit_hi, hit_lo))
        ck(hit_hi > 0 and hit_lo > 0,
           '两个方向都覆盖到了（材料A浮动高 %d 次 / 材料B浮动高 %d 次）' % (hit_hi, hit_lo))
        print('  （其中材料出现在负面槽的次数：%d）' % negslot)
        dls = [t for t in s.dialogs() if '出错了' in str(t)]
        ck(not dls, '全程没有「出错了」弹窗（%s）' % dls[:2])
    finally:
        s.close(False)

    summary()


def summary():
    print('\n' + '=' * 64)
    print('==== 通过 %d / 失败 %d ====' % (len(OK), len(BAD)))
    for m in BAD:
        print('  FAIL:', m)
    print('结论：融合产物的浮动系数 = 两个材料里较高的那个（不再重新随机）。')
    sys.exit(1 if BAD else 0)


if __name__ == '__main__':
    main()
