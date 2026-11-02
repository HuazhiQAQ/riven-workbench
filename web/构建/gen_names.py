# coding: utf-8 -*
"""names.json —— 唯一命名表（生成 + 校验）

为什么要有这个脚本
------------------
模拟器的「名字」以前散在七八个地方各存一份：
  · zkdata.js 里 weapons 的 en/intl/cn/ben/bintl/bcn、stats 的 cn/intl/en
  · 七个 txt（wm-stat-id / wm-items / wm-items-en / wm-items-id /
    wm-stat-items-cn / wm-stat-items-en / wm-dict）—— 内容已全部并入本表后删除
  · 代码里零散的：ZKC.VAR_TOK、ocr.js VARIANT_PREFIXES / WEAPON_CN_FIX、
    ZKC.ALIAS、pricetable.js TYPE_LAB、app.js rgCatName 的英文表、两处 CAT_COL。
结果就是改一个译名要改三遍，还容易漏。

现在：源码/数据/names.json 是**唯一命名表**，其余全部从它取。
  · 本脚本负责「首次生成」与「体检」：
      python gen_names.py            # 校验表 vs 数据源，不一致就报错
      python gen_names.py --apply    # 用表里的名字回写 zkdata.js / 记录差异
      python gen_names.py --build    # 从数据源重建整张表（迁移/新增武器时用）
  · 构建期：build.py 读这张表 → 内联成 window.ZKNAMES + 校验 zkdata 名字与表一致
  · WM 词库：源码/填表/_wmdict.py 只读这张表，不再读 7 个 txt

表的字段
--------
types     武器类型：key（游戏内叫法）/ intl / en / col（倾向表列序）/ price（价表列名）
variants  变体词：cn / en，供归一化时剥离（圣装、赤毒、信条…）
alias     别名与错写：玩家写法 → 正式名（冰淞→冰凇、山智段→心智之殁…）
stats     词条 51 条：row / cn / intl / en / wmCn / wmEn
weapons   武器 637 条：en / cn / intl / ben / bcn / bintl / cat / var / wmCn / wmEn
wm        WM 站点下拉原文：itemList / itemListEn / itemPairs / overrides / nameRules
"""
import io
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)
NAMES = os.path.join(SRC, '源码', '数据', 'names.json')


# ---------------------------------------------------------------- 读数据源
def load_zkdata():
    p = os.path.join(SRC, '源码', '数据', 'zkdata.js')
    s = io.open(p, encoding='utf-8').read()
    body = s[s.index('=', s.index('window.ZKDATA')) + 1:].strip().rstrip(';')
    return json.loads(body)


# ---------------------------------------------------------------- 固定词表
# 变体词：名字里带这些前缀/后缀时，搜索要能等价（赤毒·食人女魔 = 赤毒食人女魔 = Kuva Ogris）
# strip=True 表示「归一化后剥掉它，好让本体名也能命中」。
VARIANTS = [
    {'cn': '圣装', 'en': 'Prime', 'strip': True},
    {'cn': '赤毒', 'en': 'Kuva', 'strip': True},
    {'cn': '信条', 'en': 'Tenet', 'strip': True},
    {'cn': '终幕', 'en': 'Coda', 'strip': True},
    {'cn': '棱晶', 'en': 'Prisma', 'strip': True},
    {'cn': '异变', 'en': 'Mutalist', 'strip': True},
    {'cn': '试用型', 'en': '', 'strip': True},
    {'cn': '枢议', 'en': '', 'strip': True},
    {'cn': 'MK1', 'en': 'MK1', 'strip': True},
]

# 派系名：词条名归一化时把各种叫法收成同一个词根
# 「对科普斯的伤害 / 对 Corpus 伤害 / Damage vs. Corpus / Damage to Corpus」→ 同一个 corpus
FACTIONS = [
    {'key': 'corpus', 'words': ['corpus', '科普斯', '科普斯人']},
    {'key': 'grineer', 'words': ['grineer', '克隆尼', '格林']},
    {'key': 'infested', 'words': ['infested', '感染者', '异变感染体']},
    {'key': 'corrupted', 'words': ['corrupted', '堕落者', '堕落']},
    {'key': 'narmer', 'words': ['narmer', '合一众']},
    {'key': 'murmur', 'words': ['murmur', '低语者']},
]

# 别名 / 错写修正：键是玩家可能写出来的，值是表里的正式名
ALIAS = {
    '冰淞': '冰凇',
    '山智段': '心智之殁',
    '智段': '心智之殁',
}

TYPES = [
    {'key': '步枪', 'intl': '步枪', 'en': 'Rifle', 'col': 0, 'price': '步枪'},
    {'key': '霰弹', 'intl': '霰弹', 'en': 'Shotgun', 'col': 1, 'price': '霰弹'},
    {'key': '手枪', 'intl': '手枪', 'en': 'Pistol', 'col': 2, 'price': '手枪'},
    {'key': '曲翼', 'intl': '曲翼', 'en': 'Arch-gun', 'col': 3, 'price': '曲翼'},
    {'key': '近战', 'intl': '近战', 'en': 'Melee', 'col': 4, 'price': '近战'},
    {'key': '近战·天工造武', 'intl': '近战·天工造武', 'en': 'Zaw', 'col': 4, 'price': 'Zaw'},
    {'key': '组合枪', 'intl': '组合枪', 'en': 'Kitgun', 'col': 2, 'price': '组合枪'},
    {'key': '同伴武器', 'intl': '同伴武器', 'en': 'Companion Weapon', 'col': 0, 'price': '同伴武器'},
]

# 价表里 oracle 用的类型键和游戏内叫法不完全一样
TYPE_ALIAS = {'霰弹枪': '霰弹', '曲翼武器': '曲翼', 'zaw': 'Zaw', 'Zaw': 'Zaw'}


# ---------------------------------------------------------------- 生成
def build():
    """以表为准增量更新：已有条目原样保留（含手工改过的 WM 名），
    只把 zkdata 里新增的武器/词条补进来。迁移期若表还不存在，用内置默认值起头。
    """
    z = load_zkdata()
    prev = load_table() if os.path.exists(NAMES) else None
    wm = prev['wm'] if prev else {'itemList': [], 'itemListEn': [], 'itemPairs': [],
                                  'overrides': [], 'nameRules': []}
    en2cn = {a: b for a, b in wm.get('itemPairs', [])}

    old_w = {w['en']: w for w in (prev['weapons'] if prev else [])}
    old_s = {s['row']: s for s in (prev['stats'] if prev else [])}

    stats, added_s = [], []
    for s in z['stats']:
        a = old_s.get(s['row'])
        if a:
            a.update({'cn': s['cn'], 'intl': s['intl'], 'en': s['en']})
            stats.append(a)
        else:
            added_s.append(s['row'])
            stats.append({'row': s['row'], 'cn': s['cn'], 'intl': s['intl'], 'en': s['en'],
                          'wmCn': '', 'wmEn': ''})

    weapons, added_w, missing_wm = [], [], []
    for w in z['weapons']:
        a = old_w.get(w.get('en', ''))
        if a:
            for k in ('cn', 'intl', 'ben', 'bcn', 'bintl', 'cat', 'var'):
                a[k] = w.get(k, '')
            weapons.append(a)
            continue
        wm_cn = en2cn.get(w.get('en', ''), '')
        wm_en = w.get('en', '') if wm_cn else ''
        if not wm_cn and w.get('ben') in en2cn:
            wm_cn, wm_en = en2cn[w['ben']], w['ben']
        if not wm_cn:
            missing_wm.append(w.get('en', ''))
        added_w.append(w.get('en', ''))
        weapons.append({
            'en': w.get('en', ''), 'cn': w.get('cn', ''), 'intl': w.get('intl', ''),
            'ben': w.get('ben', ''), 'bcn': w.get('bcn', ''), 'bintl': w.get('bintl', ''),
            'cat': w.get('cat', ''), 'var': w.get('var', ''),
            'wmCn': wm_cn, 'wmEn': wm_en,
        })

    table = {
        'meta': {
            'version': 1,
            'note': '唯一命名表：所有模块都从这里取名字，不要在代码里再写一份',
            'counts': {'types': len(TYPES), 'variants': len(VARIANTS), 'factions': len(FACTIONS),
                       'alias': len(ALIAS), 'stats': len(stats), 'weapons': len(weapons)},
        },
        'types': (prev or {}).get('types', TYPES),
        'typeAlias': (prev or {}).get('typeAlias', TYPE_ALIAS),
        'variants': (prev or {}).get('variants', VARIANTS),
        'factions': (prev or {}).get('factions', FACTIONS),
        'alias': (prev or {}).get('alias', ALIAS),
        'statKeys': (prev or {}).get('statKeys', []),
        'stats': stats,
        'weapons': weapons,
        'wm': wm,
    }
    return table, {'addedWeapons': added_w, 'addedStats': added_s, 'missingWm': missing_wm}


def write(table):
    os.makedirs(os.path.dirname(NAMES), exist_ok=True)
    with io.open(NAMES, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(table, f, ensure_ascii=False, indent=1, sort_keys=False)
        f.write('\n')


def load_table():
    return json.load(io.open(NAMES, encoding='utf-8'))


# ---------------------------------------------------------------- 校验
def check(table=None):
    """表 vs zkdata.js：名字逐字段比对。返回问题列表（空=一致）。"""
    table = table or load_table()
    z = load_zkdata()
    bad = []

    tw, zw = table['weapons'], z['weapons']
    if len(tw) != len(zw):
        bad.append('武器条数不一致：表 %d / zkdata %d' % (len(tw), len(zw)))
    for i, (a, b) in enumerate(zip(tw, zw)):
        for k in ('en', 'cn', 'intl', 'ben', 'bcn', 'bintl'):
            if (a.get(k) or '') != (b.get(k) or ''):
                bad.append('weapons[%d].%s：表 %r / zkdata %r' % (i, k, a.get(k), b.get(k)))

    ts, zs = table['stats'], z['stats']
    zrow = {s['row']: s for s in zs}
    if len(ts) != len(zs):
        bad.append('词条条数不一致：表 %d / zkdata %d' % (len(ts), len(zs)))
    for a in ts:
        b = zrow.get(a['row'])
        if not b:
            bad.append('词条 row=%s 在 zkdata 里没有' % a['row'])
            continue
        for k in ('cn', 'intl', 'en'):
            if (a.get(k) or '') != (b.get(k) or ''):
                bad.append('stats row=%s .%s：表 %r / zkdata %r' % (a['row'], k, a.get(k), b.get(k)))

    # 引擎键：riven-router 的 S({k:…}) 与 riven-engine 的 STAT_POOL 都要在表里登记
    rp = os.path.join(SRC, '源码', '引擎', 'riven-router.js')
    if os.path.exists(rp):
        src = io.open(rp, encoding='utf-8').read()
        used = re.findall(r"S\(\{\s*k:\s*'([^']+)'", src)
        known_k = set(x.get('key') for x in table.get('statKeys', []))
        for k in used:
            if k not in known_k:
                bad.append('引擎键 %r 在 riven-router 里有，命名表 statKeys 里没登记' % k)
        if not used:
            bad.append('引擎键扫描 0 条 —— riven-router 的 S({k:…}) 写法变了，正则要跟着改')

    ep = os.path.join(SRC, '源码', '引擎', 'riven-engine.js')
    if os.path.exists(ep):
        esrc = io.open(ep, encoding='utf-8').read()
        pool = re.findall(r"\{\s*k:\s*'([^']+)'\s*,\s*n:\s*SE\('([^']+)'\)", esrc)
        for k, kk in pool:
            if k != kk:
                bad.append('riven-engine STAT_POOL 的 k=%r 与查表键 %r 不一致' % (k, kk))
        if not pool:
            bad.append('riven-engine STAT_POOL 扫描 0 条 —— n 应统一写成 SE(\'键\')')
        for k, _ in pool:
            if k not in known_k:
                bad.append('引擎键 %r 在 riven-engine STAT_POOL 里有，命名表 statKeys 里没登记' % k)

    # statKeys 字段体检：不能有解析残渣（[ ] ' 引号），cn/en 不能空
    JUNK = "[]'"
    for e in table.get('statKeys', []):
        k = e.get('key')
        if not k:
            bad.append('statKeys 有条目缺 key')
            continue
        for f in ('cn', 'short', 'en', 'enFull', 'eng'):
            v = e.get(f)
            if v is None:
                continue
            if not isinstance(v, str):
                bad.append('statKeys[%s].%s 不是字符串：%r' % (k, f, v))
                continue
            for c in JUNK:
                if c in v:
                    bad.append('statKeys[%s].%s 有残渣 %r：%r' % (k, f, c, v))
        if not (e.get('cn') or '').strip():
            bad.append('statKeys[%s].cn 为空' % k)
        if e.get('row') is not None and not isinstance(e.get('row'), int):
            bad.append('statKeys[%s].row 不是整数：%r' % (k, e.get('row')))

    # 类型：zkdata 里出现过的 cat 必须都在表里
    known = set(t['key'] for t in table['types'])
    for c in sorted(set(w.get('cat', '') for w in zw) - known):
        bad.append('类型「%s」在 zkdata 里有，表里没登记' % c)
    return bad


# ---------------------------------------------------------------- 回写 zkdata（表为准）
def apply_to_zkdata(table=None):
    """用表里的名字覆盖 zkdata.js 的 names 字段。只改名字，不碰数值/形态/类别。"""
    table = table or load_table()
    p = os.path.join(SRC, '源码', '数据', 'zkdata.js')
    raw = io.open(p, encoding='utf-8').read()
    head, body = raw[:raw.index('=', raw.index('window.ZKDATA')) + 1], None
    body = raw[len(head):].strip().rstrip(';')
    z = json.loads(body)

    tw = table['weapons']
    for i, w in enumerate(z['weapons']):
        if i >= len(tw):
            break
        for k in ('en', 'cn', 'intl', 'ben', 'bcn', 'bintl'):
            if k in tw[i] and tw[i][k]:
                w[k] = tw[i][k]

    ts = {s['row']: s for s in table['stats']}
    for s in z['stats']:
        a = ts.get(s['row'])
        if not a:
            continue
        for k in ('cn', 'intl', 'en'):
            if a.get(k):
                s[k] = a[k]

    out = head + json.dumps(z, ensure_ascii=False, separators=(',', ':')) + ';\n'
    io.open(p, 'w', encoding='utf-8', newline='\n').write(out)
    return len(tw), len(ts)


def main():
    argv = sys.argv[1:]
    if '--build' in argv:
        table, info = build()
        write(table)
        c = table['meta']['counts']
        print('已更新 %s' % NAMES)
        print('  类型 %d · 变体 %d · 派系 %d · 别名 %d · 词条 %d · 武器 %d'
              % (c['types'], c['variants'], c['factions'], c['alias'], c['stats'], c['weapons']))
        if info['addedWeapons']:
            print('  新增武器 %d 把：%s' % (len(info['addedWeapons']),
                                          '、'.join(info['addedWeapons'][:8])))
        if info['addedStats']:
            print('  新增词条 row：%s' % info['addedStats'])
        if info['missingWm']:
            print('  ! 有 %d 把查不到 WM 名（wmCn 留空）：%s'
                  % (len(info['missingWm']), '、'.join(info['missingWm'][:8])))
        return 0

    if '--apply' in argv:
        n = apply_to_zkdata()
        print('已用表里的名字回写 zkdata.js：武器 %d 条 · 词条 %d 条' % n)
        return 0

    if not os.path.exists(NAMES):
        print('✗ 没有 %s，先跑 python gen_names.py --build' % NAMES)
        return 1
    bad = check()
    if bad:
        print('✗ 命名表与 zkdata.js 不一致 %d 处：' % len(bad))
        for b in bad[:20]:
            print('   ' + b)
        print('   要么改表（推荐），要么 python gen_names.py --apply 用表覆盖数据')
        return 1
    t = load_table()
    c = t['meta']['counts']
    print('✓ 命名表一致：类型 %d · 变体 %d · 派系 %d · 别名 %d · 词条 %d · 武器 %d'
          % (c['types'], c['variants'], c['factions'], c['alias'], c['stats'], c['weapons']))
    return 0


if __name__ == '__main__':
    sys.exit(main())
