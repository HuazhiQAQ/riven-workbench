# -*- coding: utf-8 -*-
"""严格词法级的 JavaScript 注释剥离器。
按字符逐个走状态机，只在 NORMAL 状态下把 // 与 /* 认作注释，
字符串 / 模板串 / 正则字面量内部原样保留。不用正则整体删除注释：
源码里有正则字面量（含 / 与 //），字符串中也可能出现斜杠。
用法：
    from wm_strip import strip_js_comments
    print(strip_js_comments(src))
"""
import io
import re

# NORMAL 状态下出现 `/` 时，判断它是否开启一个正则字面量。
# 判据：往前看最近一个有意义的字符（跳过空白与注释残留）。
# 若它是这些之一，正则处于「开头位置」，前一个 token 只能是运算/分隔符，
# 不会是「除号左操作数」。用「前一个非空字符 + 前一个标识符」双判据。
_REGEX_PREV_OK = set('(,=:[!&|?{};+-*%~^<>')
_REGEX_PREV_WORD = {
    'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
    'case', 'do', 'else', 'yield', 'await', 'throw',
}


def _prev_token(src, i):
    """返回 (kind, text)：kind 为 'punct' | 'word' | 'number' | 'other'。"""
    j = i - 1
    while j >= 0:
        c = src[j]
        if c in ' \t\r\n':
            j -= 1
            continue
        if c == '/' and j >= 1 and src[j - 1] == '*':
            # 块注释已在前面的扫描中删除，此处若再见到按 other 处理
            return 'other', ''
        if c.isalnum() or c in '_$.':
            k = j
            while k >= 0 and (src[k].isalnum() or src[k] in '_$.'):
                k -= 1
            return 'word', src[k + 1:j + 1]
        return 'punct', c
    return 'other', ''


def _is_regex_start(src, i):
    """src[i] == '/'，判断此处是否开启正则字面量。"""
    kind, text = _prev_token(src, i)
    if kind == 'punct':
        return text in _REGEX_PREV_OK or text in ('}', ')')
    if kind == 'word':
        return text in _REGEX_PREV_WORD
    # 数字 / 字符串 / 其它 → 是除号
    return False


def strip_js_comments(src):
    """剥离全部 // 与 /* */ 注释，保留字符串与正则字面量原样。
    返回值不保证缩进对齐（整行注释消失后可能留下空行），但语义不变。
    """
    out = []
    i = 0
    n = len(src)
    while i < n:
        c = src[i]

        # ---- 行注释 ----
        if c == '/' and i + 1 < n and src[i + 1] == '/':
            j = src.find('\n', i)
            if j < 0:
                break
            # 保留换行，行号信息不丢
            out.append('\n')
            i = j + 1
            continue

        # ---- 块注释 ----
        if c == '/' and i + 1 < n and src[i + 1] == '*':
            j = src.find('*/', i + 2)
            if j < 0:
                break
            seg = src[i + 2:j]
            # 保留换行数，避免把两段代码挤到同一行
            nl = seg.count('\n')
            out.append('\n' * nl if nl else ' ')
            i = j + 2
            continue

        # ---- 字符串 / 模板串 ----
        if c in ('"', "'"):
            q = c
            j = i + 1
            while j < n:
                if src[j] == '\\':
                    j += 2
                    continue
                if src[j] == q:
                    j += 1
                    break
                j += 1
            out.append(src[i:j])
            i = j
            continue

        if c == '`':
            j = i + 1
            depth = 0
            while j < n:
                if src[j] == '\\':
                    j += 2
                    continue
                if src[j] == '$' and j + 1 < n and src[j + 1] == '{':
                    depth += 1
                    j += 2
                    continue
                if src[j] == '}' and depth > 0:
                    depth -= 1
                    j += 1
                    continue
                if src[j] == '`' and depth == 0:
                    j += 1
                    break
                j += 1
            out.append(src[i:j])
            i = j
            continue

        # ---- 正则字面量 ----
        if c == '/' and _is_regex_start(src, i):
            j = i + 1
            in_class = False
            while j < n:
                ch = src[j]
                if ch == '\\':
                    j += 2
                    continue
                if ch == '[':
                    in_class = True
                elif ch == ']':
                    in_class = False
                elif ch == '/' and not in_class:
                    j += 1
                    break
                elif ch == '\n':
                    break
                j += 1
            # 跳过 flags
            while j < n and src[j].isalpha():
                j += 1
            out.append(src[i:j])
            i = j
            continue

        out.append(c)
        i += 1
    return ''.join(out)


def squeeze_blank_lines(text):
    """压缩连续空行为最多 1 行，并去掉纯空白行上的尾随空格。"""
    lines = [l.rstrip() for l in text.split('\n')]
    res = []
    for l in lines:
        if l == '' and res and res[-1] == '':
            continue
        res.append(l)
    while res and res[0] == '':
        res.pop(0)
    while res and res[-1] == '':
        res.pop()
    return '\n'.join(res)


def strip_file(path, out_path=None):
    src = io.open(path, encoding='utf-8', newline='').read()
    src = src.replace('\r\n', '\n')
    res = squeeze_blank_lines(strip_js_comments(src))
    res += '\n'
    if out_path:
        io.open(out_path, 'w', encoding='utf-8', newline='\n').write(res)
    return res


if __name__ == '__main__':
    import sys
    p = sys.argv[1]
    o = sys.argv[2] if len(sys.argv) > 2 else None
    r = strip_file(p, o)
    print('stripped bytes:', len(r), 'lines:', r.count('\n') + 1)