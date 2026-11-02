# -*- coding: utf-8 -*-
"""把「本体名」固化成倾向表的静态列，并让「计算器」的紫卡命名用它。
固化方式：命名不依赖运行时的关键词剥离推断，改由查表得到。
武器名字对照表已提供，因此离线把本体名算好写进单元格：
  倾向表 N/O/P = 本体名·国服 / 国际服 / EN   —— 与 J 列（任意叫法）平行，行 2..1435
      ↳ 给「计算器」B24 用（B24 手里只有 H5:H9 的 J 行号，没有武器行号）
  倾向表 Q/R/S = 本体名·国服 / 国际服 / EN   —— 与武器行平行，行 2..640
      ↳ 给 Sheet7 的 VBA 本体名() 用（它手里有武器行号），也给 export.py 用
218 把变体·有本体全部命中；两处机械剥离对不上的（Pangolin Prime / Prisma Dual Decurions）
以倾向表里真实存在的武器行为准）。
"""
import os
import html
import json
import re
import shutil
import sys
import zipfile

sys.stdout.reconfigure(encoding='utf-8')

SRC = sys.argv[1] if len(sys.argv) > 1 else None
if not SRC:
    raise SystemExit('用法：python patch_basename.py <某个.xlsm>')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out',
                   'step_naming.xlsm')
DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'web', 'data.json')

z = zipfile.ZipFile(SRC)
names = z.namelist()
blobs = {n: z.read(n) for n in names}

# ---------- sharedStrings ----------
ss = blobs['xl/sharedStrings.xml'].decode('utf-8')
m = re.search(r'(<sst[^>]*>)(.*)(</sst>)', ss, re.S)
head, body, tail = m.group(1), m.group(2), m.group(3)
si_list = re.findall(r'<si>.*?</si>', body, re.S)


def si_text(s):
    return html.unescape(''.join(re.findall(r'<t[^>]*>(.*?)</t>', s, re.S)))


vals = [si_text(s) for s in si_list]
idx_of = {}
for i, v in enumerate(vals):
    idx_of.setdefault(v, i)


def esc(s):
    s = s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    return s


def intern(v):
    """返回共享字符串下标；没有就追加"""
# 归档留档脚本：一次性执行。
# 复用时把 xlsm 路径当命令行参数传入；OUT 默认写脚本自己旁边的 out/ 。
    if v in idx_of:
        return idx_of[v]
    i = len(si_list)
    si_list.append('<si><t xml:space="preserve">' + esc(v) + '</t></si>')
    idx_of[v] = i
    vals.append(v)
    return i


# ---------- 读倾向表 ----------
s5 = blobs['xl/worksheets/sheet5.xml'].decode('utf-8')
rows = {}
for m in re.finditer(r'<row r="(\d+)"[^>]*>(.*?)</row>', s5, re.S):
    rows[int(m.group(1))] = m.group(2)


def cell_val(body, ref):
    m = re.search(r'<c r="' + ref + r'"([^>]*)>(.*?)</c>', body, re.S)
    if not m:
        return None
    v = re.search(r'<v>(.*?)</v>', m.group(2), re.S)
    if not v:
        return None
    s = v.group(1)
    # <v> 里的内容一律是 XML 转义过的（J 列是 t="str" 的公式结果，字串直接写在 <v> 里，
    # 像「Sun &amp; Moon」这种带 & 的名字不反转义就跟 C/D/E 对不上，N/O/P 会被写空）。
    if 't="s"' in m.group(1) and s.isdigit():
        return vals[int(s)]
    return html.unescape(s)


# 本体名（三语言），按武器行 2..640 —— 来自已核对过的 data.json
W = json.load(open(DATA, encoding='utf-8'))['weapons']
assert len(W) == 639, len(W)
base_of = {}          # 武器行 -> (国服, 国际服, EN)
for i, w in enumerate(W):
    base_of[i + 2] = (w['bcn'], w['bintl'], w['ben'])

# J 列（任意叫法）-> 武器行：按 TOCOL 的行优先顺序 C,D,E 取首次出现
name2row = {}
for r in range(2, 641):
    b = rows.get(r, '')
    for col in ('C', 'D', 'E'):
        nm = cell_val(b, col + str(r))
        if nm:
            name2row.setdefault(nm, r)

# ---------- 写 N/O/P（跟着 J 走）与 Q/R/S（跟着武器行走） ----------
def put_cells(rn, pairs):
    """pairs = [(列, 值)]，值 None 表示留空；就地改 rows[rn]"""
    body = rows.get(rn)
    if body is None:
        body = ''
    for col, v in pairs:
        ref = col + str(rn)
        if re.search(r'<c r="' + ref + r'"', body):
            body = re.sub(r'<c r="' + ref + r'"[^>]*>.*?</c>', '', body, flags=re.S)
        if v:
            body += '<c r="%s" t="s"><v>%d</v></c>' % (ref, intern(v))
    rows[rn] = body


n_j = 0
for r in range(2, 1436):
    jn = cell_val(rows.get(r, ''), 'J' + str(r))
    if not jn:
        put_cells(r, [('N', None), ('O', None), ('P', None)])
        continue
    wr = name2row.get(jn)
    if not wr:
        put_cells(r, [('N', None), ('O', None), ('P', None)])
        continue
    cn, it, en = base_of[wr]
    put_cells(r, [('N', cn), ('O', it), ('P', en)])
    n_j += 1

n_w = 0
for r in range(2, 641):
    cn, it, en = base_of[r]
    put_cells(r, [('Q', cn), ('R', it), ('S', en)])
    n_w += 1

# 同时把 J 溢出区（641..1435）的 Q/R/S 也清干净，避免误读
for r in range(641, 1461):
    if r in rows:
        put_cells(r, [('Q', None), ('R', None), ('S', None)])

print('N/O/P 填了 %d 行 | Q/R/S 填了 %d 行' % (n_j, n_w))

# 重新拼 sheet5.xml（保持 <row> 之外的东西不动）
def rebuild(sheet_xml):
    out, last = [], 0
    for m in re.finditer(r'<row r="(\d+)"[^>]*>.*?</row>', sheet_xml, re.S):
        out.append(sheet_xml[last:m.start()])
        out.append(rows[int(m.group(1))] if False else '')
        last = m.end()
    return None


# 实现方式：按 <row> 逐段替换
parts = []
pos = 0
for m in re.finditer(r'<row r="(\d+)"([^>]*)>(.*?)</row>', s5, re.S):
    r = int(m.group(1))
    parts.append(s5[pos:m.start()])
    parts.append('<row r="%d"%s>%s</row>' % (r, m.group(2), rows.get(r, m.group(3))))
    pos = m.end()
parts.append(s5[pos:])
new_s5 = ''.join(parts)

# ---------- 改「计算器」B24：紫卡命名用本体名 ----------
s1 = blobs['xl/worksheets/sheet1.xml'].decode('utf-8')
m = re.search(r'<c r="B24"([^>]*)>(.*?)</c>', s1, re.S)
assert m, '找不到 B24'
attrs, inner = m.group(1), m.group(2)
f = re.search(r'<f[^>]*>(.*?)</f>', inner, re.S)
assert f, 'B24 没有公式'
old = html.unescape(f.group(1))

assert '$B$5&" "&_xlpm.k_1' in old, 'B24 结尾不是 $B$5 开头，公式可能变过了'
anchor = '_xlpm.g,计算器!$H$1="国服",'
assert anchor in old, 'B24 里找不到 _xlpm.g 锚点'
new = old.replace(anchor, anchor +
                  '_xlpm.bn,IFERROR(INDEX(倾向表!$N:$P,INDEX($H$5:$H$9,IF($C$4="",1,$C$4)),参数!$B$28),""),')
new = new.replace('$B$5&" "&_xlpm.k_1', 'IF(_xlpm.bn="",$B$5,_xlpm.bn)&" "&_xlpm.k_1')
assert '_xlpm.bn' in new and 'IF(_xlpm.bn="",$B$5,_xlpm.bn)&" "' in new

# 清掉缓存值，让 WPS 重算（<v> 留着也行，但改了公式必须重算）
inner2 = re.sub(r'<v>.*?</v>', '', inner, flags=re.S)
inner2 = re.sub(r'(<f[^>]*>).*?(</f>)',
                lambda mm: mm.group(1) + esc(new) + mm.group(2), inner2, flags=re.S)
s1 = s1[:m.start()] + '<c r="B24"' + attrs + '>' + inner2 + '</c>' + s1[m.end():]
print('B24 已改为：本体名优先，取不到再回落到 $B$5')

# ---------- 写回 ----------
new_ss = (head + ''.join(si_list) + tail)
new_ss = re.sub(r'count="\d+"', 'count="%d"' % len(si_list), new_ss, count=1)
new_ss = re.sub(r'uniqueCount="\d+"', 'uniqueCount="%d"' % len(si_list), new_ss, count=1)
blobs['xl/sharedStrings.xml'] = new_ss.encode('utf-8')
blobs['xl/worksheets/sheet5.xml'] = new_s5.encode('utf-8')
blobs['xl/worksheets/sheet1.xml'] = s1.encode('utf-8')
print('共享字符串 %d -> %d' % (len(vals) - (len(si_list) - len(vals)), len(si_list)))

with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as zo:
    for n in names:
        zo.writestr(n, blobs[n])
print('输出 ->', OUT)
