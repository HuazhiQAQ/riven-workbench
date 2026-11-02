# -*- coding: utf-8 -*-
"""组合榜合法性清理

紫卡最多 3 正 1 负（总词条 ≤ 4）。行情库里国服挂单混进了一批「4 条正词条」
的脏单（原站在售卡被解析成正词条全满、负词条为空），它们聚合出的组合在页面上
会显示成 4 个正词条 —— 现实中不存在这种卡。

本脚本只做一件事：把 combos 里不合法的组删掉，其余字段（挂单数 / 占比 / 中位价 /
溢价 / 最高价 / 常见武器）一律不动，因为原始生成用的是未裁剪挂单，当前库里已经
复现不出同一套占比口径。删完按类内中位价降序重排，等价于重新出榜。

合法性规则（任一条不满足即丢弃）：
  ① 正词条 1~3 条           ② 正词条无重复
  ③ 负词条 ≤1 条且不与正词条重复   ④ 总词条 ≤4
  ⑤ 每个 slug 都能在 db['stats'] 里落到词条行号

用法：
  python 构建/pricedb_fixcombos.py            # 只报告，不写盘
  python 构建/pricedb_fixcombos.py --apply    # 写回 源码/数据/zkpricedb.js

脚本幂等：重复跑不会二次删除。
"""

import io
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)
DB = os.path.join(SRC, '源码', '数据', 'zkpricedb.js')

MAX_POS = 3
MAX_TOTAL = 4


def load_db():
    raw = io.open(DB, encoding='utf-8').read()
    cut = raw.index('window.ZKPRICEDB=')
    head = raw[:cut]
    body = raw[cut + len('window.ZKPRICEDB='):].strip().rstrip(';')
    return head, json.loads(body)


def why_bad(d, stats):
    ks = d.get('ks') or []
    gk = d.get('gk') or ''
    if not ks:
        return '正词条为空'
    if len(ks) > MAX_POS:
        return '正词条 %d 条' % len(ks)
    if len(set(ks)) != len(ks):
        return '正词条重复'
    if gk and gk in ks:
        return '负词条与正词条重复'
    if len(ks) + (1 if gk else 0) > MAX_TOTAL:
        return '总词条 %d 条' % (len(ks) + (1 if gk else 0))
    miss = [s for s in ks + ([gk] if gk else []) if s not in stats]
    if miss:
        return 'slug 落不到行号：%s' % ','.join(miss)
    return ''


def main():
    apply = '--apply' in sys.argv
    head, db = load_db()
    stats = db.get('stats') or {}
    total_removed = 0

    for store in ('intl', 'cn'):
        arr = db.get('combos', {}).get(store)
        if not arr:
            continue
        kept, dropped = [], []
        for d in arr:
            bad = why_bad(d, stats)
            if bad:
                dropped.append((bad, d))
            else:
                kept.append(d)
        kept.sort(key=lambda d: (d['c'], -(d.get('m') or 0)))
        db['combos'][store] = kept
        total_removed += len(dropped)
        print('[%s] %d -> %d 条，删 %d' % (store, len(arr), len(kept), len(dropped)))
        for bad, d in dropped:
            print('   - %s | c=%s n=%s med=%s 正=%s 负=%s' % (
                bad, d.get('c'), d.get('n'), d.get('m'),
                '+'.join(d.get('ks') or []), d.get('gk') or '—'))
        left = {}
        for d in kept:
            left[d['c']] = left.get(d['c'], 0) + 1
        print('   剩余分类：' + ' '.join('%s=%d' % (k, v) for k, v in sorted(left.items())))

    if not total_removed:
        print('没有不合法的组合，未改动。')
        return

    body = json.dumps(db, ensure_ascii=False, separators=(',', ':'))
    old_sz = os.path.getsize(DB)
    new_sz = len((head + 'window.ZKPRICEDB=' + body + ';\n').encode('utf-8'))
    print('体积 %.2f MB -> %.2f MB' % (old_sz / 1048576.0, new_sz / 1048576.0))

    if apply:
        io.open(DB, 'w', encoding='utf-8', newline='\n').write(
            head + 'window.ZKPRICEDB=' + body + ';\n')
        print('已写回', DB)
    else:
        print('（未写盘，加 --apply 应用）')


if __name__ == '__main__':
    main()
