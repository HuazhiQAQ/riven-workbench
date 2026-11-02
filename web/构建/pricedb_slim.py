# -*- coding: utf-8 -*-
"""价格库瘦身 + 词条名换键

对 源码/数据/zkpricedb.js 做四件事（原始生成脚本 tools/make_priceref_js.py 已不在工程里，
所以这里做「等价重排」，不重新采集数据）：

  ① 删掉价格超过本服上限（国际服 5000 / 国服 300）的挂单
  ② 每把武器按价格排序，去掉最低 25% 与最高 25%，只留中间一半
  ③ 价格与词条数值里带小数的取整（10.325 -> 10、106.7 -> 107）；
     比例 / 溢价 / 倍率（0.29、1.54、2.98、1.89）保持原样，取整会毁语义
  ④ 词条名不再存中文：combos 的 p/g 换成 slug 数组 ks/gk，single 的 n 换成 k；
     显示名一律从 源码/数据/names.json 取（stats 表只留 slug -> 命名表键）

用法：
  python 构建/pricedb_slim.py            # 只报告，不写盘
  python 构建/pricedb_slim.py --apply    # 写回 源码/数据/zkpricedb.js
  python 构建/pricedb_slim.py --no-trim  # 不裁样本（只做上限/取整/换键）

注意：脚本不幂等（第②步会按已裁过的分位再裁一次），重跑前先从
      备份/zkpricedb.瘦身前.js 恢复。
"""

import io
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)
DB = os.path.join(SRC, '源码', '数据', 'zkpricedb.js')
NAMES = os.path.join(SRC, '源码', '数据', 'names.json')

# 价库里两个合并 slug 的补丁：射速/攻速共用一个 slug，近战伤害与基础伤害共用
SLUG_PATCH = {
    '射速': 'fire_rate_/_attack_speed',
    '攻击速度': 'fire_rate_/_attack_speed',
    '近战伤害': 'base_damage_/_melee_damage',
    # 挂单里有、但定价池没收录（rw 的 row 27/31 为 null），补一个只用来看的 slug
    '初始连击': 'initial_combo',
}

# 词条行号 -> 命名表键（与 RULES.ZK_ROW2STAT 同口径，16/17/18/42/43/44 都归 fac）
ROW2KEY = {
    2: 'dmg', 3: 'dmg', 4: 'cc', 5: 'cd', 6: 'sc', 7: 'statusDur', 9: 'cold', 10: 'toxin',
    11: 'electric', 12: 'heat', 13: 'impact', 14: 'slash', 15: 'puncture', 16: 'fac',
    17: 'fac', 18: 'fac', 42: 'fac', 43: 'fac', 44: 'fac', 19: 'ms', 20: 'punch', 21: 'mag',
    22: 'ammo', 23: 'rel', 24: 'proj', 25: 'recoil', 26: 'zoom', 27: 'combo', 28: 'comboDur',
    29: 'comboX', 30: 'comboGain', 31: 'efficiency', 32: 'slideCrit', 33: 'finisher',
    34: 'range', 35: 'sd', 36: 'gas', 37: 'corrosive', 38: 'viral', 39: 'radiation',
    40: 'blast', 41: 'magnetic', 45: 'weak', 46: 'weakcc', 47: 'ammoEff', 48: 'magReload',
    49: 'heavyDmg', 50: 'windup', 51: 'parryAngle', 52: 'slam',
}
# 射速/攻速两个键共用同一 slug：取 frate 作为代表键
ROW8_KEY = 'frate'


def load_db():
    raw = io.open(DB, encoding='utf-8').read()
    head_end = raw.index('window.ZKPRICEDB=') + len('window.ZKPRICEDB=')
    head = raw[:raw.index('window.ZKPRICEDB=')]
    body = raw[head_end:].strip().rstrip(';')
    return head, json.loads(body)


def load_names():
    return json.load(io.open(NAMES, encoding='utf-8'))


def build_maps(db, tab):
    cn2slug = {}
    for slug, cn in db['stats'].items():
        cn2slug[cn] = slug
    cn2slug.update(SLUG_PATCH)

    name2key = {}
    for e in tab['statKeys']:
        for f in ('cn', 'short', 'en', 'enFull', 'eng'):
            if e.get(f):
                name2key.setdefault(e[f], e['key'])
        for a in e.get('alias') or []:
            name2key.setdefault(a, e['key'])

    key2slug = {}
    for row, slug in db['rw'].items():
        r = int(row)
        k = ROW8_KEY if r == 8 else ROW2KEY.get(r)
        if k:
            key2slug.setdefault(k, slug)
    # 价库的 stats 用的是「词条行名」，所以行名也要能反查到键
    for s in tab['stats']:
        k = ROW2KEY.get(s['row'])
        if not k:
            continue
        for f in ('cn', 'intl', 'en'):
            if s.get(f):
                name2key.setdefault(s[f], k)
    return cn2slug, name2key, key2slug


def slug_of_label(label, cn2slug, name2key, key2slug):
    if not label:
        return ''
    if label in cn2slug:
        return cn2slug[label]
    k = name2key.get(label)
    if k and k in key2slug:
        return key2slug[k]
    return None


def rint(v):
    """取整：只处理数值型；None/字符串原样"""
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return v
    return int(round(v))


def quantile(sorted_vals, q):
    if not sorted_vals:
        return 0
    idx = int(round((len(sorted_vals) - 1) * q))
    return sorted_vals[idx]


def slim_weapon(w, cap, stat, trim=True):
    items = w.get('items') or []
    before = len(items)
    kept = []
    for it in items:
        if len(it) < 5:
            continue
        price = it[4]
        if cap and price > cap:
            stat['over_cap'] += 1
            continue
        kept.append(it)
    # ② 去头尾 25%：用原来的分位字段做界（它就是这批样本的价格分位）
    lo, hi = w.get('p25'), w.get('p75')
    if not trim or lo is None or hi is None or not kept:
        mid = kept
    else:
        mid = [it for it in kept if lo <= it[4] <= hi]
        stat['cut_tail'] += len(kept) - len(mid)
        if len(mid) < 3:
            # 保底：样本太少的武器不裁，免得估不出价
            mid = kept
            stat['kept_guard'] += 1
    # ③ 数值取整
    out = []
    for it in mid:
        pi, pv, ni, nv, price = it[0], it[1], it[2], it[3], it[4]
        pv = [rint(x) for x in pv]
        nv = [rint(x) for x in nv]
        price = rint(price)
        out.append([pi, pv, ni, nv, price])
    # 重算统计
    w['items'] = out
    prices = sorted(it[4] for it in out)
    w['n'] = len(out)
    if prices:
        w['p25'] = quantile(prices, 0.25)
        w['med'] = quantile(prices, 0.50)
        w['p75'] = quantile(prices, 0.75)
    elif before:
        w['n'] = 0
    return before, len(out)


def main():
    apply = '--apply' in sys.argv
    trim = '--no-trim' not in sys.argv
    head, db = load_db()
    tab = load_names()
    cn2slug, name2key, key2slug = build_maps(db, tab)

    stat = {'over_cap': 0, 'cut_tail': 0, 'kept_guard': 0, 'bad_label': []}
    w_before = w_after = 0

    pools = [(db.get('w') or {}, db.get('cap') or 0)]
    cnp = db.get('cnp') or {}
    if cnp.get('w'):
        pools.append((cnp['w'], cnp.get('cap') or 300))

    for pool, cap in pools:
        for slug, w in pool.items():
            b, a = slim_weapon(w, cap, stat, trim)
            w_before += b
            w_after += a

    # ranges：词条数值区间取整（负值也照取；取整后区间被压扁就保留小数）
    def slim_ranges(rg):
        for k, v in rg.items():
            if not isinstance(v, list) or len(v) != 2:
                continue
            lo, hi = rint(v[0]), rint(v[1])
            if hi > lo:
                rg[k] = [lo, hi]
            else:
                rg[k] = [v[0], v[1]]      # 窄区间（如 -0.4~0.3）取整会毁掉归一化

    slim_ranges(db.get('ranges') or {})
    if cnp.get('ranges'):
        slim_ranges(cnp['ranges'])

    # ④ combos：p/g -> ks/gk
    combo_cnt = 0
    for lang, arr in (db.get('combos') or {}).items():
        for it in arr:
            ks = []
            for x in (it.get('p') or '').split(' + '):
                x = x.strip()
                if not x:
                    continue
                s = slug_of_label(x, cn2slug, name2key, key2slug)
                if s is None:
                    stat['bad_label'].append(x)
                    s = x
                ks.append(s)
            gk = ''
            g = (it.get('g') or '').strip()
            if g:
                gk = slug_of_label(g, cn2slug, name2key, key2slug)
                if gk is None:
                    stat['bad_label'].append(g)
                    gk = g
            it.pop('p', None)
            it.pop('g', None)
            it['ks'] = ks
            it['gk'] = gk
            combo_cnt += 1

    # ④ single：n -> k，价格分位取整（l 倍数 / p 溢价 保留小数）
    single_cnt = 0
    for lang, grp in (db.get('single') or {}).items():
        for gname in ('pos', 'neg'):
            for it in grp.get(gname) or []:
                nm = it.pop('n', '')
                s = slug_of_label(nm, cn2slug, name2key, key2slug)
                if s is None:
                    stat['bad_label'].append(nm)
                    s = nm
                it['k'] = s
                for f in ('r', 'e', 'c'):
                    if f in it:
                        it[f] = rint(it[f])
                single_cnt += 1

    # ④ stats：slug -> 命名表键（显示名从 names.json 取）
    stat_key = {}
    for slug in db['stats']:
        key = None
        for kk, ss in key2slug.items():
            if ss == slug:
                key = kk
                break
        if key is None:
            key = name2key.get(db['stats'][slug]) or db['stats'][slug]
        stat_key[slug] = key
    stat_key['initial_combo'] = 'combo'
    db['stats'] = stat_key

    body = json.dumps(db, ensure_ascii=False, separators=(',', ':'))
    old_sz = os.path.getsize(DB)
    new_sz = len((head + 'window.ZKPRICEDB=' + body + ';').encode('utf-8'))

    print('挂单样本 %d -> %d（留 %.1f%%）' % (w_before, w_after, w_after * 100.0 / max(1, w_before)))
    print('  超上限丢弃 %d · 去头尾25%% %d · 样本过少保底 %d 把' % (
        stat['over_cap'], stat['cut_tail'], stat['kept_guard']))
    print('组合榜 %d 条 · 单词条 %d 条已换成 slug' % (combo_cnt, single_cnt))
    if stat['bad_label']:
        print('!! 映射不到的标签：', sorted(set(stat['bad_label'])))
    print('体积 %.2f MB -> %.2f MB（%.1f%%）' % (
        old_sz / 1048576.0, new_sz / 1048576.0, new_sz * 100.0 / old_sz))

    if apply:
        stamp = head.replace('自动生成，不要手改 —— 改口径请改 tools/riven_price.py 后重跑',
                             '自动生成，不要手改 —— 原始生成 tools/make_priceref_js.py；'
                             '瘦身/换键 python 构建/pricedb_slim.py --apply')
        io.open(DB, 'w', encoding='utf-8', newline='\n').write(
            stamp + 'window.ZKPRICEDB=' + body + ';\n')
        print('已写回', DB)
    else:
        print('（未写盘，加 --apply 应用）')


if __name__ == '__main__':
    main()
