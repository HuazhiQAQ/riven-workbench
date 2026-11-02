# coding: utf-8 -*
"""定位网页版产物（`*riven-workbench*.html`）。
产物定名「识图版」（`20261017紫卡模拟器识图版.html`，含截图识别、历史记录等功能）。
  匹配式放宽成 `*riven-workbench*.html`，只认「网页版/识图版」两族产物名，
  不挑 `test_ocr.html` / `识别流程讲解_*.html`。
产物名带日期（沿用 xlsm 的日期，如 `20260928riven-workbench-web.html`）。
  xlsm 更新日期后文件名会变，写死文件名会导致加载失败（非断言失败）；
  因此统一在此查找 web/ 内最新产物，并排除备份名。
支持显式传路径；相对路径按 web/（本文件所在目录）解析。
"""
import glob
import os

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.dirname(HERE)
OUT_DIR = os.path.join(WEB, 'dist')


def _newest(pat, exclude):
    hit = [p for p in glob.glob(os.path.join(OUT_DIR, pat))
           if not any(x in os.path.basename(p) for x in exclude)]
    return max(hit, key=os.path.getmtime) if hit else None


# 排除词须覆盖所有备份名：备份件与主文件 mtime 相同，会被一并挑中
# 导致验的不是部署文件。
_EXCLUDE = ('备份', '_无对比')


def find(src=None):
    """最终版产物路径。src 可显式指定（绝对路径，或相对 web/ 的路径）。"""
    if src:
        return src if os.path.isabs(src) else os.path.join(OUT_DIR, src)
    return _newest('*riven-workbench*.html', _EXCLUDE) \
        or os.path.join(OUT_DIR, 'riven-workbench-web.html')


def find_plain():
    """`--plain` 无对比备用版。"""
    return os.path.join(OUT_DIR, 'riven-workbench-web-plain.html')
