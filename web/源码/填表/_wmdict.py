# coding: utf-8 -*
"""把词库源文件编译成 JS 字面量。
  把名字当场翻好写进脚本 —— 填充脚本收到的就是 WM 的原生用词，
  等号比对即可，不猜、不试、不浪费时间。
源文件只有一个：源码/数据/names.json（唯一命名表）
  stats[].cn/intl       模拟器里的叫法
  stats[].wmCn/wmEn     WM 下拉里的原文
  wm.itemList/itemListEn  WM 武器下拉原文清单
  wm.itemPairs          武器英中对照
  wm.overrides          Zaw 音译等武器别名
  wm.nameRules          武器变体命名规则
旧的那几个 txt（wm-stat-id / wm-items* / wm-stat-items-* / wm-dict）已并入表，不再读取。
  Weakpoint/Weak Point、Recoil/Weapon Recoil…），靠「名字→名字」匹配会选不中。
  改成「一个 ID = 一个概念，三语各存一份原文」，按数据表行号取，
  名字写法再怎么变都不影响 —— 行号是唯一的。
"""
import io, os, re, json, sys

BASE = os.path.dirname(os.path.abspath(__file__))


def _table():
    """唯一的输入：源码/数据/names.json（唯一命名表）。"""
    global _CACHE
    if _CACHE is None:
        p = os.path.join(BASE, '..', '数据', 'names.json')
        if not os.path.exists(p):
            raise SystemExit('找不到命名表 %s —— 先跑 python 构建/gen_names.py --build' % p)
        _CACHE = json.load(io.open(p, encoding='utf-8'))
    return _CACHE


_CACHE = None


def parse_dict():
    """→ (weapon_pairs, rules)  rules = [(regex_src, [tpl, ...])]
    数据来自命名表的 wm.overrides / wm.nameRules。
    """
    wm = _table().get('wm', {})
    weapon = [tuple(x) for x in wm.get('overrides', [])]
    rules = [(_rule_regex(left), [t.replace('X', '$1') for t in tpl])
             for left, tpl in wm.get('nameRules', [])]
    return weapon, rules


def _esc(s):
    """规则里的字面部分 → 正则。全角/半角括号、横杠都放宽，避免输入法或 IME 造成的
    标点形态差异导致匹配失败。"""
    out = ''
    for ch in s:
        if ch in '（）()':
            out += '[（(]' if ch in '（(' else '[)）]'
        elif ch in '-－':
            out += '[\\-－]'
        else:
            out += re.escape(ch)
    return out


def _rule_regex(left):
    """「圣装X」→ ^圣装[\\s\\-－]*(.+)$  ／「X（主手）」→ ^(.+?)[（(]主手[)）]$"""
    if 'X' not in left:
        raise SystemExit('武器规则左边必须有占位符 X：%r' % left)
    if left.startswith('X'):                      # X 在末尾：后缀型
        rest = _esc(left[1:])
        return '^(.+?)\\s*' + rest + '$'
    i = left.index('X')
    pre, suf = _esc(left[:i]), _esc(left[i + 1:])
    return '^' + pre + '[\\s\\-－]*(.+)' + (suf + '$' if suf else '$')


def parse_items():
    return list(_table().get('wm', {}).get('itemList', []))


def parse_items_en():
    return list(_table().get('wm', {}).get('itemListEn', []))


def parse_items_id():
    """→ [(英文名, 中文名)]，中文名可能为空（WM 中文站没这一条）。"""
    return [tuple(x) for x in _table().get('wm', {}).get('itemPairs', [])]


def parse_stat_id():
    """→ [{id, row, cn, intl, wmcn, en}]，来自命名表的 stats[]。
      cn   模拟器国服名     intl 模拟器国际服名
      wmcn WM 中文下拉原文   en   WM 英文下拉原文
    注意 en 是 **WM 英文原文**（如 Damage），不是模拟器的英文名（Base Damage）。
    编译期自检：行号不重复。
    """
    rows = []
    for i, s in enumerate(_table().get('stats', [])):
        rows.append({'id': i, 'row': int(s['row']),
                     'cn': s.get('cn', ''), 'intl': s.get('intl', ''),
                     'wmcn': s.get('wmCn', ''), 'en': s.get('wmEn', '')})
    rws = [r['row'] for r in rows]
    dup = sorted(set(x for x in rws if rws.count(x) > 1))
    if dup:
        raise SystemExit('命名表里词条行号重复：%s' % dup)
    return rows


def _js_str(s):
    return json.dumps(s, ensure_ascii=False)


def js_block():
    weapon, rules = parse_dict()
    items = parse_items()
    items_en = parse_items_en()
    pairs = parse_items_id()
    stat_rows = parse_stat_id()

    # 词条 ID 表
    # [0] 模拟器国服名 [1] 模拟器国际服名 [2] WM中文下拉原文 [3] WM英文下拉原文
    # 填 WM 时用的是 [2]/[3]（WM 下拉里的原样写法），不是 [0]/[1]
    # 网页侧的名字 WM 下拉里选不中。
    # WM 站点只有一个语言开关，所以 [2]/[3] 由 WM 的语言 决定
    # 跟模拟器当前界面语言无关（见 _gen.js 的 wmLang()）。
    L = []
    L.append('  /* ── 以下由 wm-stat-id.txt 编译生成，不要手改 ──')
    L.append('     改词库请改那个 txt 再跑 python build.py。')
    L.append('')
    L.append('     一个 ID = 一个概念，四种写法各存一份：')
    L.append('       [0] 模拟器国服名   [1] 模拟器国际服名')
    L.append('       [2] WM 中文下拉原文   [3] WM 英文下拉原文')
    L.append('')
    L.append('     填 WM 用 [2]/[3]：网页侧的名字在 WM 下拉里选不中。')
    L.append('       差别看派系伤害就明白：网页侧「对Corpus的伤害」，')
    L.append('       WM 下拉里是「对 Corpus 的伤害」（带空格）。')
    L.append('')
    L.append('     ID 0「基础伤害」与 ID 1「近战伤害」在 WM 英文下拉里都叫 Damage，')
    L.append('       是 WM 本身的同名，不是重复条目 —— 按行号区分，别合并。')
    L.append('')
    L.append('     用法：WM_STAT_ID[WM_STAT_ROW_ID[row]][2 或 3] 取 WM 用词；')
    L.append('          WM_STAT_ROWS_BY_NAME[任意写法] 反查可能的行号。 */')
    L.append('  var WM_STAT_ID = {')
    for r in stat_rows:
        L.append('    %d: [%s, %s, %s, %s],'
                 % (r['id'], _js_str(r['cn']), _js_str(r['intl']),
                    _js_str(r['wmcn']), _js_str(r['en'])))
    L.append('  };')
    L.append('')

    # row -> ID：按数据表行号取词条最直接，不用再拿名字去匹配
    L.append('  /* 数据表行号 -> ID。词条在数据表里的行是固定的，用行号查最直接，')
    L.append('     不用再拿名字去匹配。 */')
    L.append('  var WM_STAT_ROW_ID = {')
    for r in stat_rows:
        L.append('    %d: %d,' % (r['row'], r['id']))
    L.append('  };')
    L.append('')

    # 任意写法 -> 行号数组
    L.append('  /* 四种写法的任意一种 -> 数据表行号数组。')
    L.append('     同一个 WM 词可能对应多个行（Damage 同时是「基础伤害」和「近战伤害」），')
    L.append('     所以值是数组 —— 按名字反查只能缩小范围，最终靠行号定案。 */')
    L.append('  var WM_STAT_ROWS_BY_NAME = {')
    name_rows = {}
    for r in stat_rows:
        for key in (r['cn'], r['intl'], r['wmcn'], r['en']):
            if key:
                name_rows.setdefault(key, []).append(r['row'])
    for key in sorted(name_rows):
        L.append('    %s: [%s],' % (_js_str(key),
                                  ','.join(str(x) for x in sorted(set(name_rows[key])))))
    L.append('  };')
    L.append('')

    L.append('  /* ── 以下三张表由 wm-dict.txt / wm-items*.txt 编译生成，不要手改 ──')
    L.append('     改词库请改那几个 txt 再跑 python build.py。')
    L.append('     它们只在「生成 WM 脚本」这一步被查一次 —— 名字当场翻好写进脚本，')
    L.append('     填充脚本拿到的就是 WM 原生用词，不需要再翻译、再模糊匹配。 ── */')
    L.append('  var WM_WEAPON_ALIAS = {')
    L.append(',\n'.join('    %s: %s' % (_js_str(a), _js_str(b)) for a, b in weapon))
    L.append('  };')
    L.append('')
    L.append('  var WM_NAME_RULES = [')
    L.append(',\n'.join('    [/%s/, [%s]]' % (rx, ', '.join(_js_str(t) for t in tpl))
                        for rx, tpl in rules))
    L.append('  ];')
    L.append('')

    # 英文武器表
    # 界面语言切到 English 时，武器名从 WM 英文下拉原文里取。
    L.append('  /* ── 以下由 wm-items-en.txt / wm-items-id.txt 编译生成，不要手改 ──')
    L.append('     界面语言切到 English 时，武器名从 WM 英文下拉原文里取。')
    L.append('')
    L.append('     WM_ITEM_LIST_EN：WM 英文下拉的武器原文（校验用）')
    L.append('     WM_WEAPON_CN2EN：WM 中文名 -> WM 英文名（两站叫法不同时用）')
    L.append('     WM_WEAPON_EN2CN：WM 英文名 -> WM 中文名（反查）')
    L.append('')
    L.append('     形态后缀必须保留：「制胜者 (近战)」<->「Vinquibus (Melee)」')
    L.append('       和「制胜者」<->「Vinquibus」是两把不同的武器。 */')
    L.append('  var WM_ITEM_LIST_EN = [')
    L.append(',\n'.join('    %s' % _js_str(x) for x in items_en))
    L.append('  ];')
    L.append('')
    L.append('  var WM_WEAPON_CN2EN = {')
    L.append(',\n'.join('    %s: %s' % (_js_str(cn), _js_str(en))
                        for en, cn in pairs if cn))
    L.append('  };')
    L.append('')
    L.append('  var WM_WEAPON_EN2CN = {')
    L.append(',\n'.join('    %s: %s' % (_js_str(en), _js_str(cn))
                        for en, cn in pairs if cn))
    L.append('  };')
    L.append('')

    L.append('  var WM_ITEM_LIST = [')
    L.append(',\n'.join('    %s' % _js_str(x) for x in items))
    L.append('  ];')
    return '\n'.join(L) + '\n'


if __name__ == '__main__':
    weapon, rules = parse_dict()
    items = parse_items()
    items_en = parse_items_en()
    pairs = parse_items_id()
    stat_rows = parse_stat_id()
    print('词条 ID %d 条 · 武器别名 %d 条 · 规则 %d 条 · 中文原文 %d 条 · 英文原文 %d 条 · 中英对照 %d 对'
          % (len(stat_rows), len(weapon), len(rules), len(items), len(items_en), len(pairs)))
    for rx, tpl in rules:
        print('   /%s/ → %s' % (rx, tpl))
    b = js_block()
    print('JS 字面量 %d 字符' % len(b))

    # dump：把编译结果写成 _dict.js（参考件，不参与构建）。
    # 构建走的是本文件的 js_block()，这里只是为了方便直接看表 / 拿去对拍。
    if '--dump' in sys.argv:
        out = os.path.join(BASE, '_dict.js')
        with io.open(out, 'w', encoding='utf-8', newline='\n') as f:
            f.write(b)
        print('已写出 %s（%d 字节）' % (out, os.path.getsize(out)))
