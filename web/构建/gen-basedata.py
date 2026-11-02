# coding: utf-8 -*
"""把「武器基础伤害数据」烘焙进 tools 包，供 ⑥ 收益面板用。
  cd web && python gen-basedata.py
数据来源（官方公开数据，按下列顺序取，前者覆盖后者）：
  1) 官方武器数据表   —— 武器基础数值（伤害构成 / 射速 / 暴击 / 触发 / 弹匣 / 装填）
  3) 官方紫卡词条表   —— 紫卡家族词条证据
数据来源由环境变量决定，不写死任何机器路径：
    ZK_WEAPON_SRC  —— 官方武器数据的目录
    ZK_RIVEN_SRC   —— 官方紫卡词条表的目录
  两者均未设置时脚本直接报错退出 —— 缺数据仍继续运行会产出全为
  null 的 basedata.json 且打印「成功」，收益面板会静默空掉而不报错。
  静默空数据比构建失败更难定位。
输出 web/basedata.json：
  {"w":[每把武器一条扁平数组或 null, 与 data.json weapons 同序同长],
   "fam":[家族词条证据或 null],
   "flags":[51 条词条的合成器标志位, 与 data.json stats 同序]}
扁平数组下标（前 20 格，与收益计算器的 W[] 一致）：
  0冲击 1穿刺 2切割 3火 4冰 5电 6毒 7爆 8腐 9气 10磁 11辐 12病毒 13虚空(+真实)
  14每秒射速 15暴击率 16暴伤倍数 17触发率 18弹匣 19装填秒
"""
import io
import json
import os
import re

SRC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _src_dir(env_name, default_sub, what):
    """定位外部数据目录。
    找不到就报错退出 —— 不可「缺了也照样跑」。
      缺数据跑出来的 basedata.json 全是 null，收益面板会空，
      且脚本仍打印「成功」，排查困难。
    """
    env = os.environ.get(env_name)
    if env:
        if os.path.isdir(env):
            return env
        raise SystemExit('%s 指向的目录不存在：%s' % (env_name, env))
    # 兜底：包内 _deps 下的同名目录（随包携带时用）
    local = os.path.join(SRC, '_deps', default_sub)
    if os.path.isdir(local):
        return local
    raise SystemExit(
        '找不到%s数据源，已退出。\n'
        '  1) 设环境变量 %s 指向它所在的目录\n'
        '  2) 或把数据放到 %s\n'
        '  （注意：缺数据还照跑会产出一份全 null 的 basedata.json，'
        '收益面板会静默空掉 —— 所以这里直接报错，不继续。）'
        % (what, env_name, local))


WEAPON_SRC = _src_dir('ZK_WEAPON_SRC', 'weapon-data', '官方武器')
RIVEN_SRC = _src_dir('ZK_RIVEN_SRC', 'riven-data', '官方紫卡词条')

ZK = json.loads(io.open(os.path.join(SRC, 'data', 'data.json'),
                         encoding='utf-8-sig').read())
WEAPONS = ZK['weapons']
STATS = ZK['stats']

# 来源 1：官方武器数据（整表）
primary_idx = {}
jp = os.path.join(WEAPON_SRC, 'weapons.json')
if not os.path.isfile(jp):
    raise SystemExit('找不到武器数据文件：%s' % jp)
for x in json.loads(io.open(jp, encoding='utf-8').read()):
    ms = x.get('modes') or []
    rec = (x.get('magazine'), x.get('reload'), ms[0] if ms else None)
    if x.get('name'):
        primary_idx.setdefault(x['name'].strip().lower(), rec)
    for v in (x.get('variants') or []):
        vm = v.get('modes') or []
        rec2 = (v.get('magazine', x.get('magazine')), v.get('reload', x.get('reload')),
                vm[0] if vm else (ms[0] if ms else None))
        if v.get('name'):
            primary_idx.setdefault(v['name'].strip().lower(), rec2)

# 来源 2：官方武器数据（逐武器形态文件，只取默认形态）
# fire_rate 两处口径不同（一处是每秒，一处是 rpm÷60）—— 统一成每秒。
# 同一把武器多个形态（form:）时只留 default_form: true 的那个。
detail_idx = {}
wroot = os.path.join(WEAPON_SRC, 'weapons')
if not os.path.isdir(wroot):
    raise SystemExit('找不到逐武器数据目录：%s' % wroot)
for dp, _, fns in os.walk(wroot):
    for fn in fns:
        if not fn.endswith('.yaml'):
            continue
        t = io.open(os.path.join(dp, fn), encoding='utf-8').read()
        nm = re.search(r'^name:\s*(\S.*)$', t, re.M)
        dg = re.search(r'^  damage:\s*\{(.*)\}', t, re.M)
        if not (nm and dg):
            continue
        fr = re.search(r'^  fire_rate:\s*([\d.]+)', t, re.M)
        cc = re.search(r'^  crit_chance:\s*([\d.]+)', t, re.M)
        cd = re.search(r'^  crit_multiplier:\s*([\d.]+)', t, re.M)
        sc = re.search(r'^  status_chance:\s*([\d.]+)', t, re.M)
        mg = re.search(r'^magazine:\s*([\d.]+)', t, re.M)
        rl = re.search(r'^reload_seconds:\s*([\d.]+)', t, re.M)
        rec = {
            'dmg': dg.group(1), 'fr': fr.group(1) if fr else '0',
            'cc': cc.group(1) if cc else '0', 'cd': cd.group(1) if cd else '1',
            'sc': sc.group(1) if sc else '0', 'mg': mg.group(1) if mg else '0',
            'rl': rl.group(1) if rl else '0'}
        key = nm.group(1).strip().strip('"').lower()
        is_def = re.search(r'^default_form:\s*true', t, re.M) is not None
        prev = detail_idx.get(key)
        # 优先默认形态；
        if prev is None or (is_def and not prev.get('_def')):
            rec['_def'] = is_def
            detail_idx[key] = rec


def flat_from_primary(rec):
    if not rec:
        return None
    mag, rl, mode = rec
    if not mode or not mode.get('damage'):
        return None
    d = mode['damage']
    void = round(d.get('Void', 0), 3) + round(d.get('True', 0), 3)
    return [
        round(d.get('Impact', 0), 3), round(d.get('Puncture', 0), 3), round(d.get('Slash', 0), 3),
        round(d.get('Heat', 0), 3), round(d.get('Cold', 0), 3), round(d.get('Electricity', 0), 3),
        round(d.get('Toxin', 0), 3), round(d.get('Blast', 0), 3), round(d.get('Corrosive', 0), 3),
        round(d.get('Gas', 0), 3), round(d.get('Magnetic', 0), 3), round(d.get('Radiation', 0), 3),
        round(d.get('Viral', 0), 3), void,
        round((mode.get('fireRate') or 0) / 60.0, 4),
        round(mode.get('critChance') or 0, 4), round(mode.get('critMul') or 0, 3),
        round(mode.get('procChance') or 0, 4),
        round(mag or 0, 2), round(rl or 0, 2),
    ]


def flat_from_detail(rec):
    body = rec['dmg']

    def g(k):
        m = re.search(r'\b' + k.lower() + r':\s*([\d.]+)', body)
        return float(m.group(1)) if m else 0.0

    # 与 flat_from_primary 严格同构：14 个伤害槽（Void 与 True 合并进第 13 格）
    # 后接 射速/暴率/暴伤/触发/弹匣/装填 —— 少一格就会把后面整体挤位。
    keys = ['Impact', 'Puncture', 'Slash', 'Heat', 'Cold', 'Electricity', 'Toxin', 'Blast',
            'Corrosive', 'Gas', 'Magnetic', 'Radiation', 'Viral']
    out = [round(g(k), 3) for k in keys]
    out.append(round(g('Void') + g('True'), 3))
    return out + [round(float(rec['fr']), 4), round(float(rec['cc']), 4),
                  round(float(rec['cd']), 3), round(float(rec['sc']), 4),
                  round(float(rec['mg']), 2), round(float(rec['rl']), 2)]


rows = []
n_primary = n_detail = 0
for w in WEAPONS:
    key = w['en'].strip().lower()
    j = flat_from_primary(primary_idx.get(key))
    wfr = detail_idx.get(key)
    wf = flat_from_detail(wfr) if wfr else None
    # 充能武器：「整块电池回充时间」记在了 reload 上（Cycron 26.7s、Mausolon 54.5s）
    if j and wf and j[19] > 6 and wf[19] <= 6:
        rows.append(wf); n_detail += 1; continue
    if j:
        rows.append(j); n_primary += 1; continue
    if wf:
        rows.append(wf); n_detail += 1; continue
    rows.append(None)

# 来源 3：家族词条证据
ROW2ID = {
    13: 'impact', 14: 'slash', 15: 'puncture',
}
ID2ROW = dict((i, r) for r, i in ROW2ID.items())
VAR_SUFFIX = [' Prime', ' Vandal', ' Wraith', ' Umbra', ' Dex', ' Prisma', ' Rakta', ' Sancti',
              ' Telos', ' Vaykor', ' Synoid', ' Secura', ' Ceti', ' Kuva', ' Tenet', ' Carmine',
              ' Marelok', ' Suada', ' Shedu']


def family_name(n):
    n = n.strip()
    if n.lower().startswith('mk1-'):
        n = n[4:].strip()
    for s in VAR_SUFFIX:
        if n.endswith(s) and len(n) > len(s):
            return n[:-len(s)].strip()
    return n


REF_P = os.path.join(RIVEN_SRC, 'riven-ref.json')
if not os.path.isfile(REF_P):
    raise SystemExit('找不到紫卡词条数据文件：%s' % REF_P)
REF = json.loads(io.open(REF_P, encoding='utf-8').read())


def fam_ev(key):
    if not REF:
        return None
    if key in REF['families']:
        e = REF['families'][key]
    else:
        b = family_name(key)
        e = REF['families'].get(b)
        if e is None:
            for k in REF['families']:
                if k.lower() == b.lower():
                    e = REF['families'][k]
                    break
    if not e:
        return None
    never = sorted({ID2ROW[x] for x in (e.get('never') or []) if x in ID2ROW})
    rolls = sorted({ID2ROW[x] for x in (e.get('rolls') or []) if x in ID2ROW})
    return [never, rolls] if (never or rolls) else None


fams = [fam_ev(w['en']) for w in WEAPONS]

# 来源 4：词条行 flags（拼接器 / 只能增益 / 只能减益）
# 与 gen-dmg-calc.py 同一套判据：bit1 拼接器 / bit2 只能当增益 / bit4 只能当减益。
ROW2ID = {
    2: 'damage', 3: 'melee_damage', 4: 'critical_chance', 5: 'critical_damage',
    6: 'status_chance', 7: 'status_duration', 8: 'fire_rate', 9: 'cold',
    10: 'toxin', 11: 'electricity', 12: 'heat', 13: 'impact', 14: 'slash',
    15: 'puncture', 16: 'damage_to_corpus', 17: 'damage_to_grineer',
    18: 'damage_to_infested', 19: 'multishot', 20: 'punch_through',
    21: 'magazine_capacity', 22: 'ammo_maximum', 23: 'reload_speed',
    24: 'projectile_speed', 25: 'weapon_recoil', 26: 'zoom', 27: 'initial_combo',
    28: 'combo_duration', 29: 'additional_combo_count_chance', 30: 'chance_to_gain_combo_count',
    31: 'heavy_attack_efficiency', 32: 'critical_chance_for_slide_attack', 33: 'finisher_damage',
    34: 'range', 35: 'status_damage', 36: 'gas', 37: 'corrosive', 38: 'viral',
    39: 'radiation', 40: 'blast', 41: 'magnetic', 42: 'damage_to_orokin',
    43: 'damage_to_techrot', 44: 'damage_to_scaldra', 45: 'weak_point_damage',
    46: 'weak_point_critical_chance', 47: 'ammo_efficiency', 48: 'reload_while_holstered',
    49: 'melee_damage_on_heavy_attack', 50: 'heavy_attack_wind_up_speed', 51: 'parry_angle',
    52: 'slam_attack_damage',
}
ID2ROW = dict((i, r) for r, i in ROW2ID.items())
ID2ROW.setdefault('attack_speed', 8)   # 近战的射速写法

row_flags = {}
for cls, srows in ((REF or {}).get('classes') or {}).items():
    for s in srows:
        r = ID2ROW.get(s['id'])
        if r is None:
            continue
        f = row_flags.get(r, 0)
        if s.get('spliced'):
            f |= 1
        if not s.get('malus', True):
            f |= 2
        if not s.get('bonus', True):
            f |= 4
        row_flags[r] = f
FLAGS = [row_flags.get(s['row'], 0) for s in STATS]

out = {'meta': {'source': '官方武器数据表 + 官方紫卡词条表',
                'primary': n_primary, 'detail': n_detail,
                'none': len(rows) - n_primary - n_detail},
       'w': rows, 'fam': fams, 'flags': FLAGS}
dst = os.path.join(SRC, 'data', 'basedata.json')
with io.open(dst, 'w', encoding='utf-8', newline='\n') as f:
    f.write(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
print('-> %s  %.0f KB  整表 %d / 逐武器补 %d / 无数据 %d  家族证据 %d'
      % (dst, os.path.getsize(dst) / 1024, n_primary, n_detail,
         len(rows) - n_primary - n_detail, sum(1 for x in fams if x)))
