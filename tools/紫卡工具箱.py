# -*- coding: utf-8 -*-
"""Warframe 紫卡计算器 6.0 —— 一体化工具箱（单文件）
功能整合在单个脚本内，按子命令调用：
    python riven-toolbox.py info              看当前配置 / 锚点
    python riven-toolbox.py dump   <xlsm> <模块名> <输出.vba>
    python riven-toolbox.py inject <xlsm> <模块名> <源码.vba> <输出.xlsm>
    python riven-toolbox.py map    <xlsm>                  数据表行号 -> 名字
    python riven-toolbox.py weapons <xlsm>                 各类别测试武器
    python riven-toolbox.py cache  <xlsm>                   查文件里的 XML 缓存
    python riven-toolbox.py hardcode <源码.vba>             扫写死的循环上限
    python riven-toolbox.py roll   <xlsm>                  5 类别 × N 次洗卡抽样
    python riven-toolbox.py produce <xlsm> <输出.xlsm>    真保存一次（刷新缓存）
    python riven-toolbox.py spill  <xlsm>                 查溢出区外的残值
环境
----
* 纯离线命令（map / weapons / cache / hardcode / spill）：
  任意 Python 3，只要标准库。
* 需要动 Excel 的命令（dump / inject / roll / fusion / produce）：
  解释器必须装了 pywin32 / oletools / olefile，缺任一个则无法运行。
* dump / inject 复用外部模块 `xlsm-vba-inject` 的 CFB 读写实现，
  本目录同级的 `_deps/xlsm-vba-inject/scripts` → 本机 `.workbuddy/skills/...`。
  两条都找不到时，只有 dump / inject 会明确报错，其余命令不受影响。
两条验收约束（手册里有展开）
  1. COM 读出来对 ≠ 文件里对。验收用 `cache`，不只看内存值。
  2. 加行/删行后必须跑 `hardcode`，只改常量不够 —— 漏改裸循环上限会静默失效。
"""
from __future__ import print_function

import argparse
import json
import os
import re
import sys
import zipfile

# ---------------------------------------------------------------- 配置

def _find_skill_scripts():
    """定位 xlsm-vba-inject 的 scripts 目录。返回 None 表示没找到。
    探测顺序（前者优先）：
      1. 环境变量 ZK_SKILL_SCRIPTS —— 显式指定，路径里不必是本工具包的
      2. 本目录同级的 _deps/xlsm-vba-inject/scripts —— 随包携带的副本
      3. 本机 .workbuddy/skills/xlsm-vba-inject/scripts
    """
    env = os.environ.get('ZK_SKILL_SCRIPTS')
    if env:
        return env if os.path.isdir(env) else None
    here = os.path.dirname(os.path.abspath(__file__))
    cands = [
        os.path.join(os.path.dirname(here), '_deps', 'xlsm-vba-inject', 'scripts'),
        os.path.join(os.path.expanduser('~'), '.workbuddy', 'skills',
                     'xlsm-vba-inject', 'scripts'),
    ]
    for c in cands:
        if os.path.isdir(c):
            return c
    return None


SKILL_SCRIPTS = _find_skill_scripts()

# 数据（sheet3）行区间
抽取起, 抽取止 = 2, 34
融合起, 融合止 = 35, 52
末行 = 52
永负行 = 30                      # 概率不获得连击数

# 正负规则（按数据表行号，不按名字）
近战永正 = {2, 3, 9, 10, 11, 12, 27, 29}
远程永正 = {9, 10, 11, 12, 20}

测试武器 = {
    '近战': '愤怒',
    '手枪': '赤毒努寇微波枪',
    '曲翼': '惩戒者',
    '步枪': '赤毒布拉玛',
    '霰弹': '塞多',
}

# 融合配方（材料1, 材料2, 期望产物）
融合用例 = [
    ('愤怒', '重击效率', '额外连击数几率', '重击伤害'),
    ('愤怒', '重击效率', '连击持续时间', '重击准备速度'),
    ('愤怒', '射速 / 攻击速度', '范围', '格挡角度'),
    ('愤怒', '射速 / 攻击速度', '近战伤害', '震地伤害'),
    ('愤怒', '近战伤害', '触发几率', '异常状态伤害'),
    ('赤毒布拉玛', '毒素伤害', '火焰伤害', '毒气伤害'),
    ('赤毒布拉玛', '基础伤害', '触发几率', '异常状态伤害'),
    ('赤毒布拉玛', '弹匣容量', '装填速度', '弹药效率'),
    ('赤毒布拉玛', '弹药最大值', '装填速度', '收起武器时自动装填'),
    ('塞多', '电击伤害', '冰冻伤害', '磁力伤害'),
]


def _u(s):
    """Windows 控制台输出转字符串"""
    try:
        return s
    except Exception:
        return repr(s)


def P(*a):
    print(' '.join(_u(str(x)) for x in a))
    try:
        sys.stdout.flush()
    except Exception:
        pass


# ---------------------------------------------------------------- 通用: 读 xlsm

def sheet_xml(path, sheet_name):
    """取某张表的 XML 文本"""
    z = zipfile.ZipFile(path)
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        ss = z.read('xl/sharedStrings.xml').decode('utf-8')
        shared = [''.join(re.findall(r'<t[^>]*>(.*?)</t>', s, re.S))
                  for s in re.findall(r'<si>(.*?)</si>', ss, re.S)]
    wbx = z.read('xl/workbook.xml').decode('utf-8')
    names = re.findall(r'<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"', wbx)
    rels = z.read('xl/_rels/workbook.xml.rels').decode('utf-8')
    # Id 与 Target 的先后顺序不固定（WPS / Excel 生成结果不同），逐个 Relationship 解析
    rmap = {}
    for rel in re.findall(r'<Relationship\b[^>]*/?>', rels):
        rid = re.search(r'\bId="([^"]+)"', rel)
        tgt_attr = re.search(r'\bTarget="([^"]+)"', rel)
        if rid and tgt_attr:
            rmap[rid.group(1)] = tgt_attr.group(1)
    tgt = None
    for nm, rid in names:
        if nm == sheet_name:
            tgt = rmap.get(rid)
            if tgt:
                # Target 可能是 worksheets/sheetN.xml 或 /xl/worksheets/sheetN.xml，统一成 zip 内路径
                tgt = tgt.lstrip('/')
                if not tgt.startswith('xl/'):
                    tgt = 'xl/' + tgt
    if tgt is None:
        raise SystemExit('找不到表：%s（现有：%s）'
                         % (sheet_name, [n for n, _ in names]))
    return z.read(tgt).decode('utf-8'), shared


def mk_reader(xml, shared):
    """造一个 单元格引用 -> 值 的读取器（能处理 t="s" / t="str" / 自闭标签）"""
    def cv(ref):
        m = re.search(r'<c r="%s"([^>]*?)(/>|>(.*?)</c>)' % ref, xml, re.S)
        if not m:
            return None
        attrs, tail, body = m.group(1), m.group(2), m.group(3)
        if tail == '/>':
            return ''
        v = re.search(r'<v>(.*?)</v>', body or '', re.S)
        if not v:
            return ''
        raw = v.group(1)
        if 't="s"' in attrs:
            try:
                return shared[int(raw)]
            except Exception:
                return raw
        return raw
    return cv


# ---------------------------------------------------------------- 命令: info

def cmd_info(a):
    P('== 紫卡计算器 6.0 工具箱 ==')
    P('  数据行区间   抽取 %d~%d / 融合 %d~%d / 末行 %d'
      % (抽取起, 抽取止, 融合起, 融合止, 末行))
    P('  永负行       %d（概率不获得连击数）' % 永负行)
    P('  近战永正     %s' % sorted(近战永正))
    P('  远程永正     %s' % sorted(远程永正))
    P('  测试武器     %s' % 测试武器)
    P('  技能脚本路径 %s%s'
      % (SKILL_SCRIPTS or '(未找到)',
         '' if SKILL_SCRIPTS and os.path.isdir(SKILL_SCRIPTS)
         else '  ← 缺失，dump / inject 不可用（离线命令不受影响）'))


# ---------------------------------------------------------------- 命令: dump / inject

def _load_skill():
    if not SKILL_SCRIPTS or not os.path.isdir(SKILL_SCRIPTS):
        raise SystemExit(
            '找不到 xlsm-vba-inject 的 scripts 目录。\n'
            'dump / inject 需要它提供 CFB 读写实现。\n'
            '解决办法（任选其一）：\n'
            '  1) 设环境变量指向它：\n'
            '       set ZK_SKILL_SCRIPTS=<xlsm-vba-inject 的 scripts 目录>\n'
            '  2) 把 xlsm-vba-inject 放到本工具包同级：\n'
            '       紫卡6.0_工具包/_deps/xlsm-vba-inject/scripts\n'
            '  3) 装到本机：\n'
            '       <本机目录>/.workbuddy/skills/xlsm-vba-inject/scripts\n'
            '离线命令（info/map/weapons/cache/hardcode/spill）不需要它，仍可正常使用。')
    if SKILL_SCRIPTS not in sys.path:
        sys.path.insert(0, SKILL_SCRIPTS)


def cmd_dump(a):
    """抽模块的原始字节源码（cp936）"""
    _load_skill()
    import inject as I                                   # noqa: E402
    from oletools.olevba import decompress_stream        # noqa: E402
    raw = bytes(zipfile.ZipFile(a.xlsm).read('xl/vbaProject.bin'))
    fat, first_dir, cutoff = I.cfb_info(raw)
    ents = I.dir_entries(raw, fat, first_dir)
    mini, mfat = I.ministream_raw(raw, fat, ents), I.minifat(raw, fat)
    d = [e for e in ents if e[2] == 'dir'][0]
    ds = I.read_stream(raw, fat, d[3], d[4], cutoff, mini, mfat)
    hit = [e for e in ents if e[2] == a.module]
    if not hit:
        raise SystemExit('模块 %s 不存在' % a.module)
    e = hit[0]
    old = I.read_stream(raw, fat, e[3], e[4], cutoff, mini, mfat)
    src = decompress_stream(old[I.find_module_offset(ds, a.module):])
    open(a.out, 'wb').write(src)
    P('模块 %s 原始源码 %d 字节 -> %s' % (a.module, len(src), a.out))
    P('★ 这是 cp936 字节；要交给 inject 请先 decode("cp936") 存成 UTF-8')


def cmd_inject(a):
    """把改好的源码写回 xlsm（源码文件必须是 UTF-8）"""
    _load_skill()
    import inject as I                                   # noqa: E402
    I.inject(a.xlsm, a.module, a.source, a.out)
    P('输出 -> %s' % a.out)


# ---------------------------------------------------------------- 命令: map

def cmd_map(a):
    xml, shared = sheet_xml(a.xlsm, 'data')
    cv = mk_reader(xml, shared)
    rows = {}
    for r in range(抽取起, 末行 + 1):
        rows[r] = {'国服': cv('A%d' % r), '国际': cv('B%d' % r), 'EN': cv('C%d' % r)}
    if a.out:
        json.dump(rows, open(a.out, 'w', encoding='utf-8'),
                  ensure_ascii=False, indent=1)
        P('已导出 %d 行 -> %s' % (len(rows), a.out))
    for r in sorted(rows):
        tag = ''
        if 融合起 <= r <= 融合止:
            tag = ' [融合]'
        elif r == 永负行:
            tag = ' [永负]'
        P('  %2d  %-14s %-14s %-26s%s'
          % (r, rows[r]['国服'], rows[r]['国际'], rows[r]['EN'], tag))


# ---------------------------------------------------------------- 命令: weapons

def cmd_weapons(a):
    """看倾向表行结构 / 挑各类别代表武器"""
    xml, shared = sheet_xml(a.xlsm, '倾向表')
    cv = mk_reader(xml, shared)
    if a.rows:
        P('== 倾向表 行 %s ==' % a.rows)
        for r in range(2, 2 + int(a.rows)):
            P(' %3d | EN=%-22s 国际=%-18s 国服=%-18s 倾向=%-5s 类型=%-6s J=%s'
              % (r, cv('C%d' % r), cv('D%d' % r), cv('E%d' % r),
                 cv('F%d' % r), cv('G%d' % r), cv('J%d' % r)))
        P('★ J 列与同行 C/D/E 错开：J 是它们的扁平展开（J2=C2, J3=D2, J4=E2, J5=C3…）')
        return
    found = {}
    r = 2
    while r < 4000:
        nm = cv('J%d' % r)
        if nm is None:
            break
        tp = cv('G%d' % r)
        if nm and tp and tp not in found:
            found[tp] = (nm or '').strip().replace('\xa0', ' ')
        r += 1
    P('== 各类别第一个候选（★ 未必能命中搜索，仅供参考）==')
    for k in found:
        P('  %-8s %s' % (k, found[k]))
    P('')
    P('== 实测能命中的搜索词 ==')
    for k in 测试武器:
        P('  %-8s %s' % (k, 测试武器[k]))


# ---------------------------------------------------------------- 命令: cache

def _cell_ref(xml, ref_name):
    """取单元格里 <f ... ref="..."> 的溢出区间。
    ref 在 <f> 标签上，不在 <c> 上；在 <c> 里查找会返回 (无)。"""
    m = re.search(r'<c r="%s"([^>]*?)(/>|>(.*?)</c>)' % ref_name, xml, re.S)
    if not m:
        return '(无此格)'
    body = m.group(3) or ''
    f = re.search(r'<f\b[^>]*?ref="([^"]+)"', body, re.S)
    return f.group(1) if f else '(无 ref)'


def cmd_cache(a):
    """离线查「文件里的缓存」—— COM 读出来对 ≠ 文件里对"""
    # 缓存按「存盘那一刻的类别」计算，类别取自 参数!B30
    px, ps = sheet_xml(a.xlsm, '参数')
    pvs = mk_reader(px, ps)
    cat = pvs('B30') or '(空)'
    lang = pvs('B28') or '(空)'
    近战 = ('近战' in str(cat))
    永正集 = 近战永正 if 近战 else 远程永正
    P('== 计算器 sheet1 四格  （存盘时 参数!B30=「%s」 B28=「%s」→ %s口径）=='
      % (cat, lang, '近战' if 近战 else '远程'))

    xml, shared = sheet_xml(a.xlsm, '计算器')
    cv = mk_reader(xml, shared)
    bad = 0
    for col, desc, pos in (('N', '正面', True), ('O', '正面', True),
                           ('P', '负面', False), ('Q', '正面', True)):
        # 不能遇到空值就 break：列表中间可能有空单元格，会少读
        vals = [v for v in (cv('%s%d' % (col, i)) for i in range(5, 80)) if v]
        ref = _cell_ref(xml, '%s5' % col)
        融合 = [v for v in vals
                if (_row_of(v, a.xlsm) or -1) and 融合起 <= _row_of(v, a.xlsm) <= 融合止]
        永正 = [v for v in vals if _row_of(v, a.xlsm) in 永正集]
        永负 = [v for v in vals if _row_of(v, a.xlsm) == 永负行]
        unknown = [v for v in vals if _row_of(v, a.xlsm) is None]
        条 = 'ref=%s  %d 条' % (ref, len(vals))
        if pos:
            P('  %s %s  %s  含融合 %d  混永负 %s'
              % (col, desc, 条, len(融合), 永负 or '无 ✓'))
        else:
            P('  %s %s  %s  混永正 %s  混融合 %s'
              % (col, desc, 条, 永正 or '无 ✓', 融合 or '无 ✓'))
            if 永正 or 融合:
                bad += 1
        if unknown:
            P('      ⚠ 反查不到行号: %s（名字对不上数据表 A/B/C 列）' % unknown)
        if a.verbose:
            P('       %s' % vals)
    P('  负面槽判定: %s' % ('不合格 ✗' if bad else '通过 ✓'))

    P('')
    P('== 洗卡模拟器 sheet7 下拉池 ==')
    x7, sh7 = sheet_xml(a.xlsm, '洗卡模拟器')
    cv7 = mk_reader(x7, sh7)
    for label, col, r0 in (('②正面', 'O', 2), ('②负面', 'Q', 2),
                           ('③正面', 'O', 35), ('③负面', 'Q', 35)):
        vals = [cv7('%s%d' % (col, r0 + i)) for i in range(31)]
        vals = [v for v in vals if v]
        P('  %-6s %2d 条  %s' % (label, len(vals), vals if a.verbose else ''))


_ROWCACHE = {}


def _row_of(name, xlsm):
    """名字 -> 数据表行号（带缓存）"""
    if xlsm not in _ROWCACHE:
        xml, shared = sheet_xml(xlsm, 'data')
        cv = mk_reader(xml, shared)
        d = {}
        for r in range(抽取起, 末行 + 1):
            for c in 'ABC':
                v = cv('%s%d' % (c, r))
                if v:
                    d[v.strip()] = r
        _ROWCACHE[xlsm] = d
    return _ROWCACHE[xlsm].get((name or '').strip())


# ---------------------------------------------------------------- 命令: hardcode

# 已人工核实过的上限，不按 bug 处理
# 倾向表 J 索引行 = 2..1434（1433 条，与 C/D/E 去重名差集为 0）
# 融合表 配方行 = 3..31（29 条配方）
已知正确上限 = {
    640:  '倾向表 D 列（国际服名）真实末行 = 640，扫武器行就该到 640',
    1435: '倾向表 J 列（任意叫法索引）真实末行 = 1434，+1 覆盖到位',
    31:   '融合表 配方区 C3:C31 共 29 条',
}


def cmd_hardcode(a):
    """扫源码里写死的行号——加行后必跑"""
    raw = open(a.source, 'rb').read()
    for enc in ('cp936', 'utf-8', 'gbk'):
        try:
            src = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise SystemExit('源码编码认不出来')
    P('== 写死的行号（>=30）==')
    n = susp = 0
    for i, ln in enumerate(src.split('\n'), 1):
        s = ln.strip()
        if s.startswith("'"):
            continue
        for pat, tag in ((r'\bFor\s+\w+\s*=\s*2\s+To\s+(\d+)', '循环上限'),
                         (r'\bCells\(\s*(\d+)\s*,', 'Cells 行'),
                         (r'>\s*(\d{2})\s*(?:And|Then)', '行号比较')):
            for m in re.finditer(pat, ln):
                v = int(m.group(1))
                if v >= 30:
                    note = 已知正确上限.get(v)
                    mark = '    已核实' if note else '  ⚠ 待核'
                    P('  %5d [%s] %-100s %s' % (i, tag, s[:100], mark))
                    if note:
                        P('          └ %s' % note)
                    else:
                        susp += 1
                    n += 1
                    break
    P('  共 %d 处，其中已核实 %d 处、待核 %d 处。' % (n, n - susp, susp))
    P('  ★ 待核的那些要确认上限够不够；数据表加行时优先改成常量形式'
      '（`For i = 抽取起 To 融合止`）')


# ---------------------------------------------------------------- 命令: spill

def cmd_spill(a):
    """查动态数组溢出区外有没有残留 <v>"""
    xml, _ = sheet_xml(a.xlsm, a.sheet)
    n = 0
    for m in re.finditer(r'<c r="([A-Z]+)(\d+)"[^>]*t="array"[^>]*ref="([^"]+)"', xml):
        col, row, ref = m.group(1), int(m.group(2)), m.group(3)
        mm = re.match(r'%s%d:%s(\d+)' % (col, row, col), ref)
        if not mm:
            continue
        hi = int(mm.group(1))
        for r in range(hi + 1, hi + 12):
            c = re.search(r'<c r="%s%d"([^>]*?)(/>|>(.*?)</c>)' % (col, r), xml, re.S)
            if c and '<v>' in (c.group(3) or ''):
                P('  溢出区外残留: %s%d 有 <v>（ref=%s）' % (col, r, ref))
                n += 1
    P('  共 %d 处残值%s' % (n, '' if n else ' ✓'))


# ---------------------------------------------------------------- 真机类命令

def _wps(xlsm, out, sheet='洗卡模拟器'):
    _load_skill()          # 缺依赖时给可读报错，而不是裸 ImportError
    from run_in_wps import Wps                            # noqa: E402
    return Wps(xlsm, out, sheet, visible=False)


def cmd_produce(a):
    """让 WPS 真保存一次（把缓存写回文件）—— 部署前必做"""
    s = _wps(a.xlsm, a.out, '洗卡模拟器')
    try:
        ws = s.ws
        ws.Range('I4').Value = a.weapon
        ws.Range('I5').Value = 1
        s.run('Sheet7.刷新候选')
        s.click('CommandButton3')
        s.app.CalculateFull()
        P('弹窗:', s.dialogs())
    finally:
        s.close(True)                     # 真保存，with 默认是不保存的
        P('已真保存 -> %s' % a.out)


def cmd_roll(a):
    """5 类别 × N 次洗卡，统计负面槽有没有混入永正 / 融合"""
    s = _wps(a.xlsm, a.out, '洗卡模拟器')
    try:
        ws = s.ws
        bad = 0
        from collections import Counter
        for cat, wname in 测试武器.items():
            s.clear_dialogs()
            ws.Range('I4').Value = wname
            ws.Range('I5').Value = 1
            s.run('Sheet7.刷新候选')
            shown = str(ws.Range('I7').Value or '')
            if not shown:
                P('=== %s | 搜「%s」没命中，跳过（宏会弹窗后退出，抽样是假的）'
                  % (cat, wname))
                continue
            s.click('CommandButton3')
            i8 = str(ws.Range('I8').Value or '')
            is_melee = '近战' in i8
            pos = 近战永正 if is_melee else 远程永正
            P('=== %s | %s' % (cat, i8))
            neg, hit_p, hit_f = Counter(), Counter(), Counter()
            for _ in range(a.n):
                s.click('CommandButton3')
                nm = ws.Range('I21').Value
                if nm is None:
                    continue
                r = _row_of(str(nm).strip(), a.xlsm)
                if r is None:
                    continue
                neg[str(nm)] += 1
                if 融合起 <= r <= 融合止:
                    hit_f[str(nm)] += 1
                if r in pos:
                    hit_p[str(nm)] += 1
            P('  样本 %d，不同词条 %d 种' % (a.n, len(neg)))
            P('  永正混入: %s' % (dict(hit_p) if hit_p else '无 ✓'))
            P('  融合混入: %s' % (dict(hit_f) if hit_f else '无 ✓'))
            if hit_p or hit_f:
                bad += 1
        P('弹窗: %s' % s.dialogs())
        P('结论: %s' % ('有类别不合格！' if bad else '全部通过 ✓'))
    finally:
        s.close(False)


def cmd_fusion(a):
    s = _wps(a.xlsm, a.out, '洗卡模拟器')
    try:
        ws = s.ws
        ok = tot = 0
        for wname, m1, m2, want in 融合用例:
            tot += 1
            s.clear_dialogs()
            ws.Range('I4').Value = wname
            ws.Range('I5').Value = 1
            s.run('Sheet7.刷新候选')
            for r in range(18, 22):                 # 清锁定：产物会自动锁定，未清除会阻塞后续操作
                ws.Range('L%d' % r).Value = '不锁'
            for r in range(30, 36):                 # 清产物区
                for c in ('I', 'K', 'L'):
                    ws.Range('%s%d' % (c, r)).Value = ('' if c != 'L' else '不锁')
            s.click('CommandButton3')               # 洗卡出一张新卡
            ws.Range('I18').Value = m1              # 材料必须先在卡面上
            ws.Range('K18').Value = 100
            ws.Range('I19').Value = m2
            ws.Range('K19').Value = 100
            ws.Range('I26').Value = m1
            ws.Range('I27').Value = m2
            s.click('CommandButton5')               # OLEObject 名，不是单元格 M28
            prods = []
            for i in range(1, 7):
                nm = ws.Range('I%d' % (29 + i)).Value
                v = ws.Range('K%d' % (29 + i)).Value
                if nm:
                    prods.append((nm, v))
            dg = [d for d in s.dialogs()
                  if ('出错' in d or '没有' in d or '已经' in d or '无法' in d)]
            good = any(str(p[0]).strip() == want for p in prods)
            ok += 1 if good else 0
            P('  %-6s %-9s + %-9s -> 期望 %-11s | %s | %s%s'
              % (wname, m1, m2, want, '成功' if good else '失败',
                 prods, ('  ⚠' + str(dg)) if dg else ''))
        P('结论: %d/%d 通过' % (ok, tot))
    finally:
        s.close(False)


# ---------------------------------------------------------------- main

def main(argv=None):
    ap = argparse.ArgumentParser(
        description='紫卡计算器 6.0 一体化工具箱',
        formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd')

    sub.add_parser('info', help='看当前配置/锚点').set_defaults(f=cmd_info)

    p = sub.add_parser('dump', help='抽 VBA 模块原始源码(cp936)')
    p.add_argument('xlsm'); p.add_argument('module'); p.add_argument('out')
    p.set_defaults(f=cmd_dump)

    p = sub.add_parser('inject', help='写回 VBA src(源码文件须 UTF-8)')
    p.add_argument('xlsm'); p.add_argument('module')
    p.add_argument('source'); p.add_argument('out')
    p.set_defaults(f=cmd_inject)

    p = sub.add_parser('map', help='数据表 行号->名字')
    p.add_argument('xlsm'); p.add_argument('--out')
    p.set_defaults(f=cmd_map)

    p = sub.add_parser('weapons', help='倾向表结构/测试武器')
    p.add_argument('xlsm'); p.add_argument('--rows')
    p.set_defaults(f=cmd_weapons)

    p = sub.add_parser('cache', help='★ 离线查文件里的 XML 缓存')
    p.add_argument('xlsm'); p.add_argument('-v', '--verbose', action='store_true')
    p.set_defaults(f=cmd_cache)

    p = sub.add_parser('hardcode', help='★ 扫写死的行号')
    p.add_argument('source')
    p.set_defaults(f=cmd_hardcode)

    p = sub.add_parser('spill', help='查溢出区外残值')
    p.add_argument('xlsm'); p.add_argument('--sheet', default='计算器')
    p.set_defaults(f=cmd_spill)

    p = sub.add_parser('produce', help='真保存一次(刷新缓存)')
    p.add_argument('xlsm'); p.add_argument('out')
    p.add_argument('--weapon', default='愤怒')
    p.set_defaults(f=cmd_produce)

    p = sub.add_parser('roll', help='★ 5 类别抽样验收')
    p.add_argument('xlsm'); p.add_argument('out')
    p.add_argument('-n', type=int, default=60)
    p.set_defaults(f=cmd_roll)

    p = sub.add_parser('fusion', help='★ 融合配方逐条实测')
    p.add_argument('xlsm'); p.add_argument('out')
    p.set_defaults(f=cmd_fusion)

    a = ap.parse_args(argv)
    if not getattr(a, 'f', None):
        ap.print_help()
        return 1
    a.f(a)
    return 0


if __name__ == '__main__':
    sys.exit(main())
