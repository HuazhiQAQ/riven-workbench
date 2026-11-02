# -*- coding: utf-8 -*-
"""修「计算器」候选列表的语言掩码：国服 / 国际服判断写反。
倾向表 M 列「语言位掩码(1英文/2国际服/4国服)」的公式是
    COUNTIF(C)>0 -> 1（英文名） + COUNTIF(D)>0 -> 2（国际服名） + COUNTIF(E)>0 -> 4（国服名）
但 sheet1 的 H5:H9 写成了
    IF(参数!B29=2, M>=4, IF(参数!B29=1, MOD(M,4)>=2, MOD(M,2)=1))
而 参数!B29 是 0=English / 1=国服 / 2=国际服 —— 于是
    B29=2(国际服) -> 挑 M>=4 = 国服名   ✗
    B29=1(国服)   -> 挑 MOD(M,4)>=2 = 国际服名  ✗
现象：国服模式下搜「丧钟」得到「丧钟Prime」，国际服模式下得到「圣装丧钟」。
"""
import os
import html
import re
import sys
import zipfile

sys.stdout.reconfigure(encoding='utf-8')

SRC = sys.argv[1] if len(sys.argv) > 1 else \
    os.path.join(os.path.dirname(os.path.abspath(__file__)),
                 '..', 'riven-source-6.0.xlsm')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out',
                   'final3.xlsm')

OLD = ('IF(参数!$B$29=2,倾向表!$M$2:$M$1434>=4,'
       'IF(参数!$B$29=1,MOD(倾向表!$M$2:$M$1434,4)>=2,MOD(倾向表!$M$2:$M$1434,2)=1))')
NEW = ('IF(参数!$B$29=1,倾向表!$M$2:$M$1434>=4,'
       'IF(参数!$B$29=2,MOD(倾向表!$M$2:$M$1434,4)>=2,MOD(倾向表!$M$2:$M$1434,2)=1))')

z = zipfile.ZipFile(SRC)
blobs = {n: z.read(n) for n in z.namelist()}

s1 = blobs['xl/worksheets/sheet1.xml'].decode('utf-8')
n = 0
out = []
pos = 0
for m in re.finditer(r'(<c r="(H[5-9])"[^>]*>)(.*?)(</c>)', s1, re.S):
    out.append(s1[pos:m.start()])
    inner = m.group(3)
    f = re.search(r'(<f[^>]*>)(.*?)(</f>)', inner, re.S)
    if f:
        t = html.unescape(f.group(2))
        if OLD in t:
            t = t.replace(OLD, NEW)
            n += 1
            inner = inner[:f.start()] + f.group(1) + html.escape(t) + f.group(3) + inner[f.end():]
            # 清掉缓存值，强制重算
            inner = re.sub(r'<v>.*?</v>', '', inner, flags=re.S)
    out.append(m.group(1) + inner + m.group(4))
    pos = m.end()
out.append(s1[pos:])
s1 = ''.join(out)

assert n == 5, '只替换了 %d 个单元格（应该是 5 个：H5:H9）' % n
blobs['xl/worksheets/sheet1.xml'] = s1.encode('utf-8')
print('已修正 %d 个候选公式（H5:H9）' % n)

with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as zo:
    for k in z.namelist():
        zo.writestr(k, blobs[k])
print('输出 ->', OUT)

# 归档留档脚本：一次性执行。
# 复用时把 xlsm 路径当命令行参数传入；OUT 默认写脚本自己旁边的 out/ 。