# coding: utf-8 -*
"""源码压缩：删掉「strip 后为空」的行，让源码与产物行号一一对应。

2026-10-27 起交付件为「无空行」形态（embed-ort.py 的 squeeze_blank），
产物行号原本对不回源码。本脚本把源码也压成同形态：
  · 空行 → 删；
  · 独立注释行（整行只有注释）→ 删；
  · 行尾注释 → 保留（产物剥成空串后该行仍在，行号不受影响）；
  · ★ 保留块 → 保留（strip 后有内容，天然不满足删除条件，此处再挡一道）。

删除判据：用 strip_html 的状态机（strip_js / strip_css / strip_all）得到
「剥注释后的文本」（行数与原文一致），逐行看剥后是否只剩空白。
这样字符串里以 // 开头的行不会被误删。

防呆：
  · 剥后行数与原文不一致 → 中止该文件（状态机契约被破坏）；
  · 候选删除行落在模板串（反引号奇偶为奇）里 → 中止该文件
    （模板串内容是运行时文本，删空行会改行为）；
  · 行里带 ★ → 永不删。

用法：
  python build/squeeze_src.py          # 演练：只打印统计，不写盘
  python build/squeeze_src.py --apply  # 写盘

范围：只处理「构建内联 + 走 strip 路径」的文件（BUILD_FILES）。
  · wm-fill-core.js 是 base64 内联，动一个字节产物就变 —— 排除；
  · _dict.js / _chk_*.js / test_template.html / demo.html / fuse-bridge.js
    不参与构建，行号对不上产物也无妨 —— 排除。
验收：--apply 后两步重建，产物 md5 必须与重建前逐字节一致
（源码变换对产物是恒等变换，md5 不变即证明无损）。
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from strip_html import strip_js, strip_css, strip_all, KEEP_MARK

# 构建锚点：形态是「独立注释行」、但 build.py 会用正则在源码里搜索 —— 永不删。
# 目前只有一处：WM 段注入点（build.py _WM_RE，锚在 app.js）。
# 以后 build.py 再加源内锚点，必须同步登记到这里。
ANCHOR_RES = [
    re.compile(r'/\*[ \t]*(?:=+[ \t]*)?① 洗卡模拟器'),
]

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)

# build build.py 内联、且走 strip 路径的全部源文件（wm-fill-core.js 除外）。
BUILD_FILES = [
    '源码/框架/template.html',
    '源码/框架/style.css',
    '源码/框架/dmg.css',
    '源码/框架/app.js',
    '源码/公共/zkc.js',
    '源码/框架/cardsplit.js',
    '源码/框架/modpanel.js',
    '源码/公共/common.js',
    '源码/框架/theme.js',
    '源码/框架/langfloat.js',
    '源码/框架/stattable.js',
    '源码/框架/sgx.js',
    '源码/框架/weptable.js',
    '源码/框架/pricetable.js',
    '源码/框架/price.css',
    '源码/数据/zkprice.js',
    '源码/识别/preprocess.js',
    '源码/识别/polar_templates.js',
    '源码/识别/polar.js',
    '源码/识别/ocr_engine.js',
    '源码/识别/ocr.js',
    '源码/公共/_rules.js',
    '源码/引擎/riven-engine.js',
    '源码/引擎/zkasm.js',
    '源码/引擎/riven-router.js',
    '源码/引擎/stances.js',
    '源码/引擎/zkmods.js',
    '源码/引擎/zkarcs.js',
    '源码/数据/zkdata.js',
    '源码/填表/_reader.js',
    '源码/填表/_gen.js',
]


def strip_for(name):
    if name.endswith('.js'):
        return strip_js
    if name.endswith('.css'):
        return strip_css
    if name.endswith('.html'):
        return strip_all
    return None


def squeeze_source(path):
    """返回 (新文本, 删除行数, 候选总数)。中止条件抛 ValueError。"""
    with open(path, 'r', encoding='utf-8-sig') as f:
        orig = f.read()
    fn = strip_for(path)
    stripped = fn(orig)
    o_lines = orig.split('\n')
    s_lines = stripped.split('\n')
    if len(o_lines) != len(s_lines):
        raise ValueError('strip 行数不一致：%d vs %d' % (len(o_lines), len(s_lines)))

    had_nl = orig.endswith('\n')
    # 行数断言按「不带结尾换行的正文」算：结尾换行不参与删除判定。
    body_o = o_lines[:-1] if had_nl else o_lines
    body_s = s_lines[:-1] if had_nl else s_lines

    out = []
    removed = 0
    parity = 0  # 剥后文本反引号奇偶：奇 = 处在模板串内
    for o, st in zip(body_o, body_s):
        inside_tpl = (parity % 2 == 1)
        if (st.strip() == '' and KEEP_MARK not in o
                and not any(a.search(o) for a in ANCHOR_RES)):
            if inside_tpl:
                raise ValueError('候选删除行落在模板串内（原文第 %d 行）：%r'
                                 % (len(out) + 1, o[:60]))
            removed += 1
            parity += st.count('`')
            continue
        out.append(o)
        parity += st.count('`')

    new = '\n'.join(out)
    if had_nl:
        new += '\n'  # 结尾换行原样保留（_rules.js 的收尾换行是拼接契约）
    return new, removed, len(body_o)


def main():
    apply = '--apply' in sys.argv
    total_files = total_removed = total_candidates = 0
    for rel in BUILD_FILES:
        path = os.path.join(SRC, rel)
        try:
            new, removed, candidates = squeeze_source(path)
        except ValueError as e:
            print('  [中止] %s：%s' % (rel, e))
            sys.exit(1)
        total_files += 1
        total_removed += removed
        total_candidates += candidates
        if removed or not apply:
            print('%-40s 删 %4d / %4d 行' % (rel, removed, candidates))
        if apply and removed:
            with open(path, 'w', encoding='utf-8', newline='') as f:
                f.write(new)
    print('---')
    print('文件 %d 个 · 候选 %d 行 · 删除 %d 行（源码 %s）'
          % (total_files, total_candidates, total_removed,
             '已写盘' if apply else '演练未写盘'))


if __name__ == '__main__':
    main()
