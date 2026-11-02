# coding: utf-8 -*
"""_audit_js.py —— 源码体检（V06 / V07 / V08 的长期闸门）。
只回答三个数字，构建时打印并断言前两个为 0：
    空 catch          catch (e) {}                 —— 吞异常，线上无法排障
    缺守卫 for...in    for (var k in o) 后没判 hasOwnProperty
    innerHTML 出口     单纯计数（不判对错，靠 ?zkdebug=1 打桩逐条告警）
用法：
    python build/_audit_js.py            # 打印
    from _audit_js import audit; audit('src')
"""
import io
import os
import re
import sys

EMPTY_CATCH = re.compile(r'\bcatch\s*\(\s*[A-Za-z_$][\w$]*\s*\)\s*\{\s*\}')
FORIN = re.compile(r'\bfor\s*\(\s*(?:var\s+)?([A-Za-z_$][\w$]*)\s+in\s+')


def _mask(s):
    """把注释替换成等长空白（保留偏移/换行），避免命中注释里的示例代码。"""
    out = list(s)
    i, n = 0, len(s)
    while i < n:
        if s.startswith('//', i):
            j = s.find('\n', i)
            j = n if j < 0 else j
            for k in range(i, j):
                out[k] = ' '
            i = j
        elif s.startswith('/*', i):
            j = s.find('*/', i + 2)
            j = n if j < 0 else j + 2
            for k in range(i, j):
                if out[k] != '\n':
                    out[k] = ' '
            i = j
        else:
            i += 1
    return ''.join(out)


def _match_paren(t, open_idx):
    depth = 0
    i, n = open_idx, len(t)
    while i < n:
        c = t[i]
        if c == '(':
            depth += 1
        elif c == ')':
            depth -= 1
            if depth == 0:
                return i
        elif c in '"\'':
            q = c
            i += 1
            while i < n and t[i] != q:
                if t[i] == '\\':
                    i += 1
                i += 1
        i += 1
    return -1


def audit(root='src'):
    empty, forin, unguarded, inner = [], 0, [], 0
    for dirpath, dirs, names in os.walk(root):
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        for n in sorted(names):
            if not n.lower().endswith('.js'):
                continue
            p = os.path.join(dirpath, n)
            rel = os.path.relpath(p, root).replace('\\', '/')
            raw = io.open(p, encoding='utf-8-sig').read()
            m = _mask(raw)
            for hit in EMPTY_CATCH.finditer(m):
                empty.append('%s:%d' % (rel, m.count('\n', 0, hit.start()) + 1))
            inner += raw.count('.innerHTML')
            pos = 0
            while True:
                mm = FORIN.search(m, pos)
                if not mm:
                    break
                forin += 1
                lp = m.rfind('(', mm.start(), mm.end())
                rp = _match_paren(m, lp) if lp >= 0 else -1
                if rp > 0:
                    after = m[rp + 1:rp + 160]
                    semi = after.find(';')
                    head = after if semi < 0 else after[:semi]
                    if 'hasOwnProperty' not in head:
                        unguarded.append('%s:%d' % (rel, m.count('\n', 0, mm.start()) + 1))
                pos = (rp + 1) if rp > 0 else mm.end()
    return {'empty_catch': empty, 'forin': forin, 'forin_unguarded': unguarded, 'innerHTML': inner}


def main():
    a = audit(sys.argv[1] if len(sys.argv) > 1 else 'src')
    print('空 catch        %d 处%s' % (len(a['empty_catch']), ''.join('\n   - ' + x for x in a['empty_catch'][:10])))
    print('for...in        %d 处（缺守卫 %d 处）%s'
          % (a['forin'], len(a['forin_unguarded']), ''.join('\n   - ' + x for x in a['forin_unguarded'][:10])))
    print('innerHTML       %d 处（靠 ?zkdebug=1 打桩逐条告警）' % a['innerHTML'])
    return 0 if (not a['empty_catch'] and not a['forin_unguarded']) else 1


if __name__ == '__main__':
    sys.exit(main())
