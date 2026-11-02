# coding: utf-8 -*
"""从 xlsm 离线导出网页版所需的全部数据 -> data.json"""
import datetime
import html
import json
import os
import re
import sys
import zipfile

import glob

# xlsm 可以当命令行参数传；
# data.json 固定输出到脚本自己旁边（工具包归档里也能直接跑）。
_HERE = os.path.dirname(os.path.abspath(__file__))
_WEB = os.path.dirname(_HERE)
_PARNT = [os.path.dirname(_WEB), os.path.dirname(os.path.dirname(_WEB))]


def _find_xlsm():
    if len(sys.argv) > 1:
        return sys.argv[1]
    for d in [_WEB] + _PARNT:
        hit = [p for p in glob.glob(os.path.join(d, '*.xlsm'))
               if 'riven-source' in os.path.basename(p)
               and not os.path.basename(p).startswith('6.0_备份')]
        if hit:
            return max(hit, key=os.path.getmtime)
    raise SystemExit(
        '找不到数据源 xlsm。\n'
        '  1) 把 *riven-source*.xlsm 放到本目录或上一级目录\n'
        '  2) 或当命令行参数显式传入：python export.py <某个.xlsm>')


SRC = _find_xlsm()
OUT = os.path.join(_WEB, 'data', 'data.json')
print('数据源 xlsm -> %s' % SRC)

z = zipfile.ZipFile(SRC)
try:
    ss = z.read('xl/sharedStrings.xml').decode('utf-8')
except KeyError:                       # WPS 另存过的版本没有共享字符串表，全部走 inlineStr
    ss = ''
SH = [''.join(re.findall(r'<t[^>]*>(.*?)</t>', s, re.S))
      for s in re.findall(r'<si>(.*?)</si>', ss, re.S)]


def clean(s):
    """反转义 HTML 实体；把 NBSP(ChrW(160)) 换成普通空格 —— Trim$ 不去除该字符，
       留在值里会让 VBA 侧的字符串比较失配。"""
    if s is None:
        return ''
    return html.unescape(str(s)).replace(u'\xa0', ' ').strip()


def reader(sheetfile):
    x = z.read(sheetfile).decode('utf-8')

    def v(c, r):
        m = re.search(r'<c r="%s%d"([^>]*?)(/>|>(.*?)</c>)' % (c, r), x, re.S)
        if not m:
            return None
        if m.group(2) == '/>':
            return ''
        body = m.group(3) or ''
        if 'inlineStr' in m.group(1):          # <c t="inlineStr"><is><t>文本</t></is></c>
            mt = re.search(r'<is>.*?<t[^>]*>(.*?)</t>', body, re.S)
            return mt.group(1) if mt else ''
        mm = re.search(r'<v>(.*?)</v>', body, re.S)
        if not mm:
            return ''
        raw = mm.group(1)
        return SH[int(raw)] if 't="s"' in m.group(1) else raw
    return v


d3 = reader('xl/worksheets/sheet3.xml')   # data
d5 = reader('xl/worksheets/sheet5.xml')   # 倾向表
d6 = reader('xl/worksheets/sheet6.xml')   # 融合
d4 = reader('xl/worksheets/sheet4.xml')   # 参数

# 数据表 2..52
CATS = [clean(d3(c, 1)) for c in 'GHIJK']   # 步枪/霰弹/手枪/曲翼/近战天工造武


def num(s):
    """把 G:K 的格子转成数字；转不出来就是「不适用」（Excel 里填的是字符串 '-'）。
    派系那 6 行（16~18 / 42~44）的 G:K 在源表里是文本 "X1.45" 而不是数值 1.45
       （为了让格子里也显示出倍率符号）。这两处的口径即为「倍率」，所以导出时必须按 1.45 认，
       否则网页版这 6 条会没有基准值（④区间表 / ③计算器 / 融合 全线缺档）。
    但注意：Excel 侧的池子是现场用 IsNumeric / ISNUMBER 筛的
      （Sheet7 洗卡 `If IsNumeric(...)`、计算器 sheet1 `ISNUMBER(INDEX(数据!$G$2:$K$52,…))`），
      文本格一律判成「没有值」→ 这 6 条会从洗卡池和计算器下拉里消失。
      根本修复需将那 30 格改回数值 1.45。
    """
    if s is None:
        return None
    t = str(s).strip()
    if t[:1] in ('X', 'x', u'×'):
        t = t[1:].strip()
    try:
        return float(t)
    except (TypeError, ValueError):
        return None


stats = []
for r in range(2, 53):
    vals = [num(d3(c, r)) for c in 'GHIJK']
    stats.append({
        'row': r,
        'cn': clean(d3('A', r)), 'intl': clean(d3('B', r)), 'en': clean(d3('C', r)),
        'core': clean(d3('D', r)), 'pre': clean(d3('E', r)), 'suf': clean(d3('F', r)),
        'v': vals,
    })

# 倾向表 2..640
# 变体（I 列）：倾向表里的「变体」列
# 取值：本体 / 变体有本体 / 变体无本体
# 规则：随机开紫卡时只开本体和变体无本体的武器 —— 变体只是这张卡
# 装在变体上数值不同，刨除掉一部分变体让概率更贴近实际；
# 比如丧钟Prime 的紫卡叫『丧钟 XXXXX』不会叫『丧钟Prime XXXXX』。
# ⇒ 开卡池 = 本体 + 变体无本体；
# 变体关键词来自源表的「②变体关键词清单」
# Prime 有时在名字中间（Garuda Prime Talons / Prime Laser Rifle），不能只按后缀
# 国服 Wraith 译名不统一：10 把「红莲XX」+ 1 把「双子蝰蛇亡魂」（亡魂在中间）
# Broken 译名不统一：「破碎的战争之剑」/「破损珽杖」
# 组合枪形态后缀 (Primary)/(Secondary)，国服是全角括号（主手）/（副手）
# 分合剑形态后缀 (Heavy Blade)，仅 Dark Split-Sword 一把
# Ceti Lacera（天仓悲痛之刃） Lacera：关键词清单里漏了 Ceti，必须补
PRE_EN = ['Kuva', 'Tenet', 'Coda', 'Prisma', 'Dex', 'Mk1-', 'Vaykor', 'Rakta', 'Synoid',
          'Telos', 'Sancti', 'Secura', 'Mara', 'Broken', 'Mutalist', 'Ceti']
SUF_EN = ['Prime', 'Wraith', 'Vandal']
PRE_CN = ['赤毒', '信条', '终幕', '棱晶', '灵敏', '试用型-', '勇气', '绯红', '枢议', '终极',
          '圣洁', '保障', '苦痛', '破损', '破碎', '异融', '圣装', '红莲', '天仓']
SUF_CN = ['Prime', '亡魂', '破坏者']
PRE_IT = ['赤毒', '信條', '終幕', '稜晶', '靈敏', '試用型-', '勇氣', '緋紅', '樞議', '終極',
          '聖潔', '保障', '苦痛', '破損', '破碎', '異融', '聖裝', '紅蓮', '天倉']
SUF_IT = ['Prime', '亡魂', '破壞者']
# 形态后缀：紫卡名不带形态（组合枪主/副手、分合剑重刃），命名前要剥掉
FORMS = ['(Primary)', '(Secondary)', '(Heavy Blade)', '(Melee)',
         '（主手）', '(主手)', '（副手）', '(副手)', '（近战）', '(近战)',
         '（近戰）', '(近戰)', '（重刃）', '(重刃)']
# 组合枪：剥掉形态后还得能找到「另一形态」那把本体
FORM_ALT = [('(Primary)', '(Secondary)'), ('（主手）', '（副手）'),
            ('（副手）', '（主手）'), ('(Secondary)', '(Primary)')]

def strip_form(n):
    """剥掉形态后缀（组合枪主/副手、分合剑重刃）。剥完为空就退回原名。"""
    for f in FORMS:
        if f in n:
            t = n.replace(f, '').strip()
            if t:
                return t
    return n

def var_cands(n, pre, suf):
    """剥离变体词，返回候选基础名"""
    out = []
    for k in pre:
        if n.startswith(k):
            out.append(n[len(k):].lstrip(' -'))
    for k in suf:
        if n.endswith(' ' + k):
            out.append(n[:-len(k)].rstrip())
        elif (' ' + k + ' ') in n:
            out.append(n.replace(' ' + k + ' ', ' ').strip())
        elif n.endswith(k) and len(n) > len(k):
            out.append(n[:-len(k)].rstrip())
    return [re.sub(r'\s+', ' ', x).strip() for x in out if x.strip()]


weapons = []
for r in range(2, 641):
    cn = d5('C', r)
    if not cn:
        continue
    try:
        disp = float(d5('F', r))
    except (TypeError, ValueError):
        disp = 0.5
    weapons.append({
        'en': clean(d5('C', r)),
        'intl': clean(d5('D', r)),
        'cn': clean(d5('E', r)),
        'disp': disp,
        'cat': clean(d5('G', r)),
        'var': clean(d5('I', r)) or '本体',
    })

# 求每把武器的「本体名」（三语言），供紫卡命名用
BASE_ROWS = [w for w in weapons if w['var'] == '本体']
_bidx = {}
for k in ('en', 'intl', 'cn'):
    d = {}
    for b in BASE_ROWS:
        if b[k]:
            d.setdefault(b[k].strip().lower(), b)
    _bidx[k] = d
_CFG = [('en', PRE_EN, SUF_EN), ('intl', PRE_IT, SUF_IT), ('cn', PRE_CN, SUF_CN)]


def find_base(w):
    """变体·有本体 -> 它的本体那一行；找不到返回 None（命名时退回自己）"""
    for key, pre, suf in _CFG:
        n = w[key]
        if not n:
            continue
        tries = list(var_cands(n, pre, suf))
        for f, alt in FORM_ALT:            # 先换形态再剥变体词
            if f in n:
                tries.append(n.replace(f, alt).strip())
                tries += var_cands(n.replace(f, alt).strip(), pre, suf)
        for f in FORMS:                    # 直接剥形态再剥变体词
            if f in n:
                nf = n.replace(f, '').strip()
                tries.append(nf)
                tries += var_cands(nf, pre, suf)
        for c in tries:
            if c.lower() in _bidx[key]:
                return _bidx[key][c.lower()]
    return None


# 本体名的首选来源是「武器名字对照表」，不依赖字符串规则推断
# A 英文名(A-Z) | B 变体关键词 | C 基础名(剥离后) | D 变体? | E 有普通版? | L 原表行号
# 注意 C 列是机械剥离的结果，不一定等于真实武器名（例：Pangolin Prime -> "Pangolin"
# 真武器叫 "Pangolin Sword"），所以拿到后必须回查倾向表里真实存在的那一行，查不到再退回解析。
_REF_NAME = '20260927武器倾向表_变体清单.xlsx'
_cands = [os.path.join(os.path.dirname(SRC), _REF_NAME),
          os.path.join(_WEB, 'data', _REF_NAME)] + \
         [os.path.join(d, _REF_NAME) for d in _PARNT]
REF = next((p for p in _cands if os.path.exists(p)), _cands[0])
REF_BASE = {}
if os.path.exists(REF):
    rz = zipfile.ZipFile(REF)
    rx = rz.read('xl/worksheets/sheet1.xml').decode('utf-8')
    for rm in re.finditer(r'<row r="(\d+)"[^>]*>(.*?)</row>', rx, re.S):
        if int(rm.group(1)) < 2:
            continue
        d = {}
        for rc in re.finditer(r'<c r="([A-Z]+)\d+"[^>]*>(.*?)</c>', rm.group(2), re.S):
            tv = re.search(r'<t[^>]*>(.*?)</t>', rc.group(2), re.S)
            if tv:
                d[rc.group(1)] = html.unescape(tv.group(1)).strip()
        if d.get('A') and d.get('C'):
            REF_BASE[d['A']] = d['C']
    print('对照表「①A-Z排序视图」读到 %d 把（基础名·剥离后）' % len(REF_BASE))
else:
    print('!! 没找到对照表 %s —— 本体名改用关键词解析（结果应与对照表一致）' % REF)

_by_en = {}
for _w in weapons:
    _by_en.setdefault(_w['en'], _w)

# 硬口径：对照表和关键词都认不出本体的个例，直接写死。
# 嫣红 潘塔（Carmine Penta）吃的是 潘塔（Penta）的紫卡。
BASE_OVERRIDE = {'Carmine Penta': 'Penta'}

_unresolved = []
_from_ref = 0
_from_guess = 0
for w in weapons:
    if w['var'] == '变体·有本体':
        b = None
        if w['en'] in BASE_OVERRIDE:
            b = _by_en.get(BASE_OVERRIDE[w['en']])
            if b is not None:
                _from_guess += 1
        if b is None and w['en'] in REF_BASE:
            b = _by_en.get(REF_BASE[w['en']])      # 必须是倾向表里真有的那一行
            if b is not None:
                _from_ref += 1
        if b is None:
            b = find_base(w)
            if b is not None:
                _from_guess += 1
        if b is None:
            _unresolved.append(w['en'])
            b = w                          # 兜底：找不到就用自己，不允许留空
    else:
        b = w                              # 本体 / 变体无本体：命名按自己
    # 命名名还要剥掉形态后缀：组合枪本体叫「捕月（副手）」，紫卡名应叫「捕月」
    w['ben'] = strip_form(b['en'])
    w['bintl'] = strip_form(b['intl'])
    w['bcn'] = strip_form(b['cn'])
    if not w['ben']:
        w['ben'] = b['en']
    if not w['bintl']:
        w['bintl'] = b['intl']
    if not w['bcn']:
        w['bcn'] = b['cn']

if _unresolved:
    print('!! 变体找不到本体（%d 把，已退回用自己的名字）：' % len(_unresolved))
    for n in _unresolved:
        print('   ', n)

_n_open = len([w for w in weapons if w['var'] != '变体·有本体'])
_n_var = len([w for w in weapons if w['var'] == '变体·有本体'])
_n_base = len(BASE_ROWS)
_n_nob = len([w for w in weapons if w['var'] == '变体·无本体'])
print('变体   本体 %d / 变体·有本体 %d / 变体·无本体 %d => 可开卡 %d 把'
      % (_n_base, _n_var, _n_nob, _n_open))
print('本体名来源：对照表 %d 把 / 关键词解析兜底 %d 把' % (_from_ref, _from_guess))

# 倾向统一口径（避免重跑本脚本把「全库 1.2」打回成分散值）
# 快照 dispSnapshot = 源表里读到的真实倾向（按 weapons 下标一一对应，给⑤区「最后时光的倾向表」用）；
# 是否把生效倾向统一成 meta.dispositionUnified，由上一版 data.json 说了算 —— 这一版就是统一 1.2。
_prev = None
if os.path.exists(OUT):
    try:
        with open(OUT, encoding='utf-8') as _f:
            _prev = json.load(_f)
    except (ValueError, OSError):
        _prev = None
_UNIFIED = ((_prev or {}).get('meta') or {}).get('dispositionUnified')
dispSnapshot = None
if _UNIFIED:
    dispSnapshot = [w['disp'] for w in weapons]
    for w in weapons:
        w['disp'] = float(_UNIFIED)

# 融合表 2..40
fusion = []
for r in range(2, 40):
    a, b, c = d6('A', r), d6('B', r), d6('C', r)
    # 融合表里有三组，每组开头都有一行「基础属性1 / 基础属性2 / 融合属性」表头
    if not (a and b and c):
        continue
    if a.strip() == '基础属性1':
        continue
    fusion.append({'a': clean(a), 'b': clean(b), 'c': clean(c)})

# 参数
def pnum(ref):
    try:
        return float(d4(ref[0], int(ref[1:])))
    except (TypeError, ValueError):
        return None


params = {
    'lo': pnum('B4'), 'mid': pnum('B5'), 'hi': pnum('B6'),
    'combo': [
        {'name': clean(d4('A', 10 + i)),
         'gain': pnum('B%d' % (10 + i)),
         'neg': pnum('C%d' % (10 + i))} for i in range(4)
    ],
    'grades': [
        {'name': clean(d4('A', 17 + i)), 'th': pnum('B%d' % (17 + i))} for i in range(6)
    ],
    'defaultDisp': pnum('B24'),
    'maxRank': pnum('B25'),
    'variantTh': pnum('B26'),
    'catKey': {clean(d4('A', 33 + i)): clean(d4('B', 33 + i)) for i in range(5)},
    'catName': {clean(d4('A', 33 + i)): [clean(d4('C', 33 + i)),
                                         clean(d4('D', 33 + i)),
                                         clean(d4('E', 33 + i))] for i in range(5)},
    'cats': [clean(c) for c in CATS],
}
if _UNIFIED:
    params['defaultDisp'] = float(_UNIFIED)

# 元信息
# 设计约束：每个数据块都要能回答「来源 / 核对时间 / 可信度」。
# 这些字段全部由脚本派生（源文件 mtime、各表行数），不手写 —— 手写会与表脱节。
# 上一版 data.json 里的人写字段（note / dispSnapshotNote / source / confidence）要留住
# 否则每次导出都会把说明文案冲成模板句。
import datetime
_src_mtime = datetime.datetime.fromtimestamp(os.path.getmtime(SRC))
_prev_meta = (_prev or {}).get('meta') or {}
meta = dict(_prev_meta)
meta.update({
    'source': os.path.basename(SRC),
    'sourceSheets': {'stats': 'data', 'weapons': '倾向表', 'fusion': '融合', 'params': '参数'},
    'exportedAt': _src_mtime.strftime('%Y-%m-%d %H:%M'),
    'verifiedAt': _src_mtime.strftime('%Y-%m-%d'),
    'confidence': '数据表/倾向表/融合表/参数表逐条导出，与 xlsm 内一致；'
                  '游戏版本更新改了基准值或倾向后需重新导出',
    'counts': {'stats': len(stats), 'weapons': len(weapons), 'fusion': len(fusion)},
    'rows': {'rollFrom': 2, 'rollTo': 34, 'fuseFrom': 35, 'fuseTo': 52},
})
if _UNIFIED:
    meta['dispositionUnified'] = _UNIFIED
    meta.setdefault('dispSnapshotNote',
                    '⑤区「最后时光的武器倾向表」用的历史倾向值快照（按 weapons 下标一一对应）；'
                    '当前生效的倾向是 %s' % _UNIFIED)

data = {'meta': meta, 'stats': stats, 'weapons': weapons, 'fusion': fusion, 'params': params}
if dispSnapshot is not None:
    data['dispSnapshot'] = dispSnapshot
json.dump(data, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

print('meta    %s' % meta['exportedAt'])
print('stats   %d 行' % len(stats))
print('weapons %d 把' % len(weapons))
print('fusion  %d 条' % len(fusion))
print('cats    %s' % CATS)
print('catKey  %s' % params['catKey'])
print('combo   %s' % params['combo'])
print('grades  %s' % params['grades'])
print('浮动    %s %s %s' % (params['lo'], params['mid'], params['hi']))
print('默认倾向 %s  等级上限 %s  变体阈值 %s'
      % (params['defaultDisp'], params['maxRank'], params['variantTh']))
print('-> %s  %.0f KB' % (OUT, os.path.getsize(OUT) / 1024))
