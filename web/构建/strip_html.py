# coding: utf-8 -*
r"""strip_html.py —— 去注释器：删掉 HTML / CSS / JS 里的注释，行数一行不变。

V12 规则（固定）：
   ① 含「★」的注释属活文档（约定 / 边界说明），整块保留；
   ② 其余注释剥成空串，换行原样保留。
   ③ 保留与剥掉的条数记在 STATS，两次构建结果必须一致，不一致说明规则漂移。

行数不变的原因：交付件（20261025 起）为去注释形态，注释文本删成空串、换行保留。
    · 交付件体积减少约 260 KB，打开更快；
    · 行号不变，运行时报错的行号可直接对回源码。

不使用单条正则的原因：
    · JS 里 `//` 可能是正则字面量的一部分（`/a\/b/`）或字符串内容；
    · `/* */` 可能嵌在模板串里；
    · HTML 的 `<!-- -->` 与 `<script>` / `<style>` 内的注释是两套语法。
    因此按字符走状态机，并按 `<script>` / `<style>` 分段选策略。

用法：
    python strip_html.py <源.html> <目标.html>
或作为模块：
    from strip_html import strip_all
"""
import io
import sys

# NORMAL 状态下遇到 `/`，前一个非空白字符在这些里面就认为 `/` 开启正则字面量
_REGEX_PREV = set('(,=:[!&|?{};+-*%<>~^\n\t ')

# 注释剥离规则：正文里带保留标记（KEEP_MARK）的注释整块保留，其余剥掉。
# 判据只看注释正文里有没有该标记；
KEEP_MARK = '★'
STATS = {'kept': 0, 'dropped': 0}


def _keep(txt):
    if KEEP_MARK in txt:
        STATS['kept'] += 1
        return True
    STATS['dropped'] += 1
    return False


def strip_html_text(s):
    """去掉 <!-- --> 注释（只用于非 script/style 区间）；正文带保留标记的整块留下。"""
    out = []
    i = 0
    n = len(s)
    while i < n:
        if s.startswith('<!--', i):
            j = s.find('-->', i + 4)
            if j < 0:
                break
            if _keep(s[i:j + 3]):
                out.append(s[i:j + 3])
            else:
                # 注释内容整体删掉，但内部的换行要保留
                out.append('\n' * s[i:j + 3].count('\n'))
            i = j + 3
        else:
            out.append(s[i])
            i += 1
    return ''.join(out)


def strip_css(s):
    out = []
    i = 0
    n = len(s)
    while i < n:
        if s.startswith('/*', i):
            j = s.find('*/', i + 2)
            if j < 0:
                out.append('\n' * s.count('\n', i))
                break
            if _keep(s[i:j + 2]):
                out.append(s[i:j + 2])
            else:
                out.append('\n' * s[i:j + 2].count('\n'))
            i = j + 2
        else:
            out.append(s[i])
            i += 1
    return ''.join(out)


def strip_js(s):
    out = []
    i = 0
    n = len(s)
    prev = ''            # 上一个非空白字符，用于判断 `/` 为正则起始还是除号
    while i < n:
        c = s[i]
        # 字符串
        if c in '"\'':
            q = c
            j = i + 1
            while j < n:
                if s[j] == '\\':
                    j += 2
                    continue
                if s[j] == q:
                    j += 1
                    break
                if s[j] == '\n':
                    break
                j += 1
            out.append(s[i:j])
            prev = q
            i = j
            continue
        # 模板串（含 ${} 嵌套）
        if c == '`':
            j = i + 1
            depth = 0
            while j < n:
                if s[j] == '\\':
                    j += 2
                    continue
                if s[j] == '`' and depth == 0:
                    j += 1
                    break
                if s.startswith('${', j):
                    depth += 1
                    j += 2
                    continue
                if s[j] == '}' and depth > 0:
                    depth -= 1
                j += 1
            out.append(s[i:j])
            prev = '`'
            i = j
            continue
        # 块注释
        if s.startswith('/*', i):
            j = s.find('*/', i + 2)
            if j < 0:
                out.append('\n' * s.count('\n', i))
                break
            if _keep(s[i:j + 2]):
                out.append(s[i:j + 2])
            else:
                out.append('\n' * s[i:j + 2].count('\n'))
            i = j + 2
            continue
        # 行注释
        if s.startswith('//', i):
            j = s.find('\n', i)
            if j < 0:
                if _keep(s[i:]):
                    out.append(s[i:])
                break
            if _keep(s[i:j]):
                out.append(s[i:j])
                i = j
                continue
            out.append('\n')
            i = j + 1
            continue
        # 正则字面量
        if c == '/':
            if prev == '' or prev in _REGEX_PREV:
                j = i + 1
                inclass = False
                ok = False
                while j < n:
                    ch = s[j]
                    if ch == '\\':
                        j += 2
                        continue
                    if ch == '[':
                        inclass = True
                    elif ch == ']':
                        inclass = False
                    elif ch == '/' and not inclass:
                        j += 1
                        ok = True
                        break
                    elif ch == '\n':
                        break
                    j += 1
                if ok:
                    out.append(s[i:j])
                    prev = '/'
                    i = j
                    continue
        out.append(c)
        if not c.isspace():
            prev = c
        i += 1
    return ''.join(out)


def strip_all(s):
    """按 <style> / <script> 分段处理，其余按 HTML 处理。"""
    out = []
    i = 0
    n = len(s)
    low = s.lower()
    while i < n:
        a = low.find('<style', i)
        b = low.find('<script', i)
        cands = [x for x in (a, b) if x >= 0]
        if not cands:
            out.append(strip_html_text(s[i:]))
            break
        k = min(cands)
        out.append(strip_html_text(s[i:k]))
        gt = s.find('>', k)
        if k == a:
            end = low.find('</style>', gt)
            end = n if end < 0 else end
            out.append(s[k:gt + 1])
            out.append(strip_css(s[gt + 1:end]))
        else:
            end = low.find('</script>', gt)
            end = n if end < 0 else end
            out.append(s[k:gt + 1])
            out.append(strip_js(s[gt + 1:end]))
        i = end
    return ''.join(out)


def blank_ws_lines(s):
    """把「只剩缩进空白」的行清成真正的空行（可选，默认不启用）。
    """
    return '\n'.join('' if x.strip() == '' else x for x in s.split('\n'))


def squeeze_blank(s):
    """删掉所有空白行（strip_all 之后调用）。2026-10-27 起交付件为「无空行」形态。
    安全前提（构建期有扫描把关，改动前先跑）：
      · 产物没有 <pre>（换行即样式）；
      · 没有内容里带空行的模板字符串（反引号段逐段扫描，含空行就停）。
    行号：源码侧由 build/squeeze_src.py 维持同形态（删空行 + 独立注释行，
    保留构建锚点与 ★ 块），产物行号可对回源码 —— 各文件在产物里的起点
    见工程记忆；app.js 在锚点「① 洗卡模拟器」后偏移 WM 词库段行数。"""
    out = []
    for ln in s.split('\n'):
        if ln.strip():
            out.append(ln)
    return '\n'.join(out)


if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    t = io.open(src, encoding='utf-8', errors='replace').read().replace('\r\n', '\n')
    r = strip_all(t)
    io.open(dst, 'w', encoding='utf-8', newline='\r\n').write(r)
    print('去注释：%d 字符 → %d 字符（行数 %d → %d）'
          % (len(t), len(r), t.count('\n') + 1, r.count('\n') + 1))
    print('注释计数：保留 ★ %d 条 / 剥掉 %d 条（两次构建必须一致）'
          % (STATS['kept'], STATS['dropped']))
