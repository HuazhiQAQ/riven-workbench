# coding: utf-8 -*
"""weapon-db.js 的构建期池化 —— 把重复字符串换成索引，产物小 15%。
  把它改成「索引 + 池表」会使数据难以直接维护 —— 改一把武器的数值要先去查池表。
  所以：源码保持可读，池化只发生在产物里，运行时再还原。
  改消费方要动 riven-router.js / app.js 几十处，改动面广、风险高。
  池化 + 运行时还原 = 消费方一行都不用改，行为保持一致。
池化规则：
  只池化出现 ≥2 次的字符串值（出现 1 次的池化反而更大 —— 多一次查表成本）。
  数字和键名不池化（键名短且结构固定；数字无法与索引区分）。
编码方式：字符串值 → 负数索引（-(idx+1)），与正数索引的对象/数组区分开。
  运行时还原：见 build.py 里的 _wdb_decode()。
运行：python _pool_wdb.py          # 打印测算，不写文件
      python _pool_wdb.py --write  # 写到 _wdb.packed.json（供 build.py 用）
"""
from __future__ import print_function
import io
import json
import os
import re
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'weapon-db.js')
OUT = os.path.join(HERE, '_wdb.packed.json')


def load_db():
    """把 weapon-db.js 里的数组读成 Python 对象。
    weapon-db.js 不是严格 JSON —— 里面有 Infinity（JSON 里是非法的）。
      所以先取出数组字面量原文，再做「Infinity → 特殊标记 → Infinity」的替换。
    """
    s = io.open(SRC, encoding='utf-8').read()
    i = s.index('[')
    j = s.rindex(']')
    lit = s[i:j + 1]
    # Infinity 不是合法 JSON 字面量，先换成字符串占位
    lit2 = re.sub(r'\bInfinity\b', '"@@INF@@"', lit)
    arr = json.loads(lit2)

    def fix(o):
        if isinstance(o, dict):
            return dict((k, fix(v)) for k, v in o.items())
        if isinstance(o, list):
            return [fix(v) for v in o]
        if o == '@@INF@@':
            return float('inf')
        return o

    return fix(arr)


def pack(arr):
    """→ (pool, packed)  字符串值换成 -(idx+1)。"""
    freq = {}
    neg = 0
    stack = [arr]
    while stack:
        o = stack.pop()
        if isinstance(o, dict):
            stack.extend(o.values())
        elif isinstance(o, list):
            stack.extend(o)
        elif isinstance(o, str):
            freq[o] = freq.get(o, 0) + 1
        elif isinstance(o, (int, float)) and not isinstance(o, bool) and o < 0:
            neg += 1
    # 编码用负数表示「池索引」，所以原始数据里不能有负数
    # 有的话还原时会被误当成索引，整个值就错了。
    if neg:
        raise SystemExit('weapon-db 里有 %d 个负数 —— 与池索引编码冲突，'
                         '换一种编码方式' % neg)

    # 只池化出现 ≥2 次的；
    pool, seen = [], set()
    for o in arr:
        stack = [o]
        while stack:
            x = stack.pop(0)
            if isinstance(x, dict):
                stack = list(x.values()) + stack
            elif isinstance(x, list):
                stack = list(x) + stack
            elif isinstance(x, str) and x not in seen and freq.get(x, 0) >= 2:
                seen.add(x)
                pool.append(x)
    index = dict((s, -(i + 1)) for i, s in enumerate(pool))

    def enc(o):
        if isinstance(o, dict):
            return dict((k, enc(v)) for k, v in o.items())
        if isinstance(o, list):
            return [enc(v) for v in o]
        if isinstance(o, str):
            return index.get(o, o)     # 没入池的保持原样
        return o

    return pool, enc(arr)


def main():
    arr = load_db()
    pool, packed = pack(arr)
    src_size = os.path.getsize(SRC)

    # 体积对比（按 JS 字面量长度算，跟产物里实际占的字节一致）
    def lit_len(o):
        if isinstance(o, dict):
            return len('{') + sum(len(json.dumps(k)) + 1 + lit_len(v) + 1
                                  for k, v in o.items()) - 1 + 1
        if isinstance(o, list):
            return len('[') + sum(lit_len(v) + 1 for v in o) - 1 + 1
        if isinstance(o, float) and o == float('inf'):
            return len('Infinity')
        if isinstance(o, str):
            return len(json.dumps(o, ensure_ascii=False))
        return len(json.dumps(o))

    before = lit_len(arr)
    after = lit_len(packed) + lit_len(pool) + 40   # +40：还原代码的净成本
    print('=== weapon-db 池化测算 ===')
    print('  武器条目      : %d' % len(arr))
    print('  入池字符串    : %d 个（出现 ≥2 次的）' % len(pool))
    print('  源码文件      : %d 字节' % src_size)
    print('  数据字面量    : %d → %d 字节' % (before, after))
    print('  净节省        : %d 字节（%.1f%%）' % (before - after,
                                              (before - after) * 100.0 / before))
    print()

    # 等价性自检：还原后必须与原对象逐字段相等
    index = dict((s, -(i + 1)) for i, s in enumerate(pool))
    rev = dict((v, k) for k, v in index.items())

    def dec(o):
        if isinstance(o, dict):
            return dict((k, dec(v)) for k, v in o.items())
        if isinstance(o, list):
            return [dec(v) for v in o]
        if isinstance(o, int) and not isinstance(o, bool) and o < 0:
            return rev[o]
        return o

    back = dec(packed)
    if back == arr:
        print('  ✓ 还原后与原对象逐字段相等')
    else:
        for a, b in zip(arr, back):
            if a != b:
                print('  ✗ 不一致：', json.dumps(a, ensure_ascii=False)[:120])
                print('        vs  ', json.dumps(b, ensure_ascii=False)[:120])
                break
        raise SystemExit('池化破坏了数据 —— 拒绝写出')

    if '--write' in sys.argv:
        # Infinity 要能往返 —— 用字符串标记
        def ser(o):
            if isinstance(o, dict):
                return dict((k, ser(v)) for k, v in o.items())
            if isinstance(o, list):
                return [ser(v) for v in o]
            if isinstance(o, float) and o == float('inf'):
                return '@@INF@@'
            return o

        io.open(OUT, 'w', encoding='utf-8', newline='\n').write(
            json.dumps({'pool': pool, 'db': ser(packed)},
                       ensure_ascii=False, separators=(',', ':')))
        print('  已写出 %s（%d 字节）' % (OUT, os.path.getsize(OUT)))


if __name__ == '__main__':
    main()
