# coding: utf-8 -*
"""把 src/ 下的 css / js / template 合成一个单文件 HTML（data.json 仅做 JSON 自检，ZKDATA 载体在 template.html）。
  20261025 起取消联网版：只交付「双击即用、一个请求都不发」的离线单文件。
  20261026 起 Tesseract / PaddleOCR 两条联网引擎已整条下线：实现、接口、
    文案都从 src/ocr/ocr.js 里删掉了（不再有"入口即抛错"的桩），OCR 只走
    内嵌的 onnxruntime-web 一条路。
  python build.py                 -> riven-sim-web.html   含双卡对比（默认）
  python build.py --plain         -> riven-sim-web-plain.html（备用版）
  python build.py <目标路径>       （--plain 也适用）
  ⚠ 本脚本产出的是中间件（还没有内嵌 ONNX 运行时）。交付前必须再跑：
      python build/embed-ort.py --src <上一步产物> --out <xxx-完全离线.html>
「最终版」= 带双卡对比的那一份。
  默认产出带对比的那一份；无对比版需显式加 --plain。
两个版本同一份源码：template 里用 `<!-- REAL-REROLL:BEGIN/END -->` 夹住那一块，
  保留对比时只摘标记行、内容留下；不保留则整块删掉。CSS / JS 两边都留，
  renderCmp() 找不到宿主元素会直接 return。
WM 拍卖填充脚本 + 紫卡收益引擎 的源文件清单
  这些功能全部落成源文件，由本脚本组装：
    src/common/_rules.js        → __RULES_JS__      全站铁规则常量源
    src/engine/stances.js       → __ZKSTANCE__      架势库（ZKSTANCE）
    src/engine/riven-engine.js  → __RIVEN_ENGINE__  收益引擎（流入派/等级定标）
    src/engine/weapon-db.js     → __WEAPON_DB__     604 把武器基础面板
    src/engine/zkasm.js         → __ZKASM__         Zaw / 组合枪组装数据
    src/engine/riven-router.js  → __RIVEN_ROUTER__  武器名 → 流派
    src/engine/zkmods.js        → __ZKMODS__        MOD 全库（词条/极性/容量）
    src/engine/zkarcs.js        → __ZKARCS__        赋能 / 套装 / 集团 / 近战赋能映射
    src/framework/cardsplit.js     → __CARDSPLIT_JS__  双卡截图左右切分（csLumaProfile…）
    src/framework/modpanel.js      → __MODPANEL_JS__   MOD 配卡面板（window.ZKMB 唯一定义处 + __DM）
    src/fill/wm-fill-core.js     → __WMCORE_B64__    base64 内联（WM 上的填充引擎）
    src/fill/_reader.js          ┐
    src/fill/_gen.js             ├ 拼进 app.js 的 __JS__ 里（词库段由 _wmdict.py
                                ┘  从 wm-dict.txt / wm-items.txt 现场编译）
     在最终版里已下线（模板里换成 4 行说明性注释），不再参与构建。
     架势与收益引擎同一个 <script> 块（模板里两个占位符紧挨着，中间不加换行）：
       最终版就是这样，分开成两块会让产物多出一个换行、和交付件对不上。
  改词库只改 src/fill/wm-dict.txt（等号对照表）和 wm-items.txt（WM 下拉原文），
  改填充引擎只改 src/fill/wm-fill-core.js —— dist HTML 不手改。
  各源文件的建立时间与变更内容见 ../CHANGELOG.md（工具包根目录，全包唯一版本时间线）。
"""
import base64
import gzip
import io
import json
import os
import re
import sys

# 源码目录跟着「脚本自己所在目录」走，工具包归档里也能直接跑（源码/ 与本文件同级目录）。
SRC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 默认带双卡对比（= 最终版）；
# 判据是有没有 --plain，不是「有没有 --real」——写成后者的话 --plain 会被忽略。
REAL = '--plain' not in sys.argv
_POS = [a for a in sys.argv[1:] if not a.startswith('--')]
# 默认输出到脚本自己旁边（工具包归档里能直接跑）；
# 要覆盖正式交付文件就显式传路径：python build.py <目标.html>
OUT = (_POS[0] if _POS
       else os.path.join(SRC, 'dist', 'riven-sim-web.html' if REAL
                        else 'riven-sim-web-plain.html'))


# 归档版把 src/ 下的目录改成了中文名（源码/公共/填表/…），但本脚本里全是 src/xxx 的老写法。
# 这里做一层段名映射：老名有就用老名（源码树没被改名时行为完全不变），没有就用中文名。
# 只影响路径解析，不碰任何构建逻辑。
_SEG = {
    'src': '源码', 'common': '公共', 'fill': '填表', 'engine': '引擎',
    'data': '数据', 'framework': '框架', 'ocr': '识别', 'assets': '资源',
}


def _alias(p):
    parts = str(p).replace('\\', '/').split('/')
    out = []
    for seg in parts:
        if seg in _SEG:
            # 段名映射只对「上一层确实是源码根」的情况生效：src/xxx 或 src 本身
            out.append(_SEG[seg])
        else:
            out.append(seg)
    # 兜底：如果按映射算出来的路径不存在、而原路径存在，就用原路径
    mapped = '/'.join(out)
    if mapped != str(p).replace('\\', '/'):
        cand = os.path.join(SRC, mapped)
        if not os.path.exists(cand) and os.path.exists(os.path.join(SRC, p)):
            return p
    return mapped


def _zhp(*parts):
    return os.path.join(SRC, _alias('/'.join(parts)))


def read(p):
    # utf-8-sig：data.json 若被别的工具另存出 BOM，普通 utf-8 会在 json.loads 那步失败
    # （build 走到一半失败，产物还是上一份）。
    return io.open(os.path.join(SRC, _alias(p)), encoding='utf-8-sig').read()


tpl = read('src/framework/template.html')
css = read('src/framework/style.css') + read('src/framework/dmg.css')   # 收益计算器面板的样式单独一份，构建时并进来
css += read('src/framework/price.css')           # 功能 6 紫卡价值表的样式单独一份
js = read('src/framework/app.js')
data = read('data/data.json')

# ---------------------------------------------------------------------------
# 唯一命名表：源码/数据/names.json
#   · 表里的名字必须与 zkdata.js 的名称字段逐字段一致（不一致直接构建失败，
#     逼你改表而不是在代码里另写一份）；
#   · 产物里只内联「代码要用的那部分」（类型 / 变体词 / 别名），
#     武器与词条的名字本来就在 ZKDATA 里，不重复塞第二份。
_NAMES_ALL = json.loads(read('src/data/names.json'))
NAMES = {k: _NAMES_ALL[k] for k in ('types', 'typeAlias', 'variants', 'factions', 'alias', 'statKeys')}
NAMES['meta'] = _NAMES_ALL.get('meta', {})
NAMES_JS = 'window.ZKNAMES=' + json.dumps(NAMES, ensure_ascii=False, separators=(',', ':')) + ';'

_zk_names = json.loads(read('src/data/zkdata.js').split('=', 1)[1].rstrip().rstrip(';'))
_tw = _NAMES_ALL['weapons']
if len(_tw) != len(_zk_names['weapons']):
    raise SystemExit('命名表与 zkdata 武器条数不一致：%d vs %d'
                     % (len(_tw), len(_zk_names['weapons'])))
for _i, (a, b) in enumerate(zip(_tw, _zk_names['weapons'])):
    for _k in ('en', 'cn', 'intl', 'ben', 'bcn', 'bintl'):
        if (a.get(_k) or '') != (b.get(_k) or ''):
            raise SystemExit('命名表与 zkdata 不一致：weapons[%d].%s 表=%r 数据=%r'
                             % (_i, _k, a.get(_k), b.get(_k)))
_ts = {s['row']: s for s in _NAMES_ALL['stats']}
for _s in _zk_names['stats']:
    _a = _ts.get(_s['row'])
    if not _a:
        raise SystemExit('命名表缺词条 row=%s' % _s['row'])
    for _k in ('cn', 'intl', 'en'):
        if (_a.get(_k) or '') != (_s.get(_k) or ''):
            raise SystemExit('命名表与 zkdata 不一致：stats row=%s .%s 表=%r 数据=%r'
                             % (_s['row'], _k, _a.get(_k), _s.get(_k)))
# 紫卡收益计算器用的武器基础数值 / 家族证据 / 词条行标志（由 gen-basedata.py 生成）。
# 单独一份 JSON，和 data.json 的 weapons 按下标一一对应。
basedata = read('data/basedata.json')
# basedata.json 里存的是纯 JSON 本体，`window.BASEDATA=` 这层赋值由 build.py 拼
# 跟 window.ZKDATA 的处理方式一致，源文件里不放变量名，避免占位符替换时误伤。
basedata_js = 'window.BASEDATA=' + basedata
# RULES 段以换行起头（源码/common/_rules.js 自带 '\n' 收尾不在这里补）
# 模板里 __BASEDATA__ 后面已经写了 '

# 纯前端 ONNX OCR：模型 base64 + 字典 + 引擎脚本，注入到 ocr.js 之前
def _rb(p):
    with open(p, 'rb') as f:
        return f.read()

_models_dir = _zhp('src', 'ocr', 'models')
# （武器错配 2 张、段位/次数误读 5 张、rec 数字误读若干，0 张变好），已回退 v3。
# v3 det 配方 = 短边 736（limit_side_len），ocr_onnx.js 的 detPrep 维持原样；
# 输入/输出张量名 v3/v4 一致（x / sigmoid_0.tmp_0 / softmax_5.tmp_0）。
# `set OCR_VER=v6` 换成 PP-OCRv6_tiny（实验支线）：det 1.70MB / rec 4.26MB / 字典 6906 行
# 比 v3 省 6.5MB 模型体积。
# 输入名都是 x，输出名不同：v3 = sigmoid_0.tmp_0 / softmax_5.tmp_0，v6 = fetch_name_0；
_OCR_VER = os.environ.get('OCR_VER', 'v3').strip().lower()
_OCR_PACK = {
    'v3': ('ch_PP-OCRv3_det_infer.onnx', 'ch_PP-OCRv3_rec_infer.onnx',
           'ppocr_keys.txt', 6625, 'pm1', 0.30),
    'v6': ('PP-OCRv6_tiny/ch_PP-OCRv6_tiny_det_infer.onnx',
           'PP-OCRv6_tiny/ch_PP-OCRv6_tiny_rec_infer.onnx',
           'PP-OCRv6_tiny/ppocr_keys_v6.txt', 6906, 'pm1', 0.25),
}
# v3 = rec 归一化 [-1,1] + det 二值化 0.30（原配方，不动）
# v6 = rec 归一化 [-1,1] + det 二值化 0.25
# 01/0.25 10 张、60；
if _OCR_VER not in _OCR_PACK:
    raise SystemExit('OCR_VER 只认 %s，收到 %r' % ('/'.join(sorted(_OCR_PACK)), _OCR_VER))
_det_f, _rec_f, _keys_f, _keys_n, _rec_norm, _det_th = _OCR_PACK[_OCR_VER]
# 模型编码保持原来的裸 base64（只是文件大 1.7MB，不动它的字节）。
# 需要给 v3 也压时用 `set GZ_MODELS=1` 强制开；
# 读取侧看 window.ONNX_MODELS.gz 开关解压（ocr_onnx.js 的 b64ToU8(b64, gz)）。
def _gz(path):
    # V12：mtime 必须钉成 0。
    # 同一份源码隔两分钟构建一次就会得到两个 md5 —— 产物不可复现
    # diff 全是噪声，「两次构建结果一致」这条校验也就没法当验收标准。
    return gzip.compress(_rb(path), 9, mtime=0)


_gz_env = os.environ.get('GZ_MODELS', '').strip().lower()
if _gz_env in ('1', 'true', 'yes', 'on'):
    _USE_GZ = True
elif _gz_env in ('', '0', 'false', 'no', 'off'):
    _USE_GZ = (_OCR_VER == 'v6')          # 默认：只压 V6
else:
    raise SystemExit('GZ_MODELS 只认 0/1，收到 %r' % _gz_env)

_det_raw = _rb(os.path.join(_models_dir, _det_f))
_rec_raw = _rb(os.path.join(_models_dir, _rec_f))
if _USE_GZ:
    _det_blob, _rec_blob = _gz(os.path.join(_models_dir, _det_f)), _gz(os.path.join(_models_dir, _rec_f))
else:
    _det_blob, _rec_blob = _det_raw, _rec_raw
_det_b64 = base64.b64encode(_det_blob).decode('ascii')
_rec_b64 = base64.b64encode(_rec_blob).decode('ascii')
print('模型编码: %s（det %.2f -> %.2f MB / rec %.2f -> %.2f MB，base64 后 %.2f MB）'
      % ('gzip+base64' if _USE_GZ else '裸 base64',
         len(_det_raw) / 1048576.0, len(_det_blob) / 1048576.0,
         len(_rec_raw) / 1048576.0, len(_rec_blob) / 1048576.0,
         (len(_det_b64) + len(_rec_b64)) / 1048576.0))
with io.open(os.path.join(_models_dir, _keys_f), encoding='utf-8') as _f:
    _keys = [ln for ln in _f.read().splitlines()]
assert len(_keys) == _keys_n, ('字典项数异常: %d（%s 应为 %d 行 = blank + 字 + 尾空格）'
                               % (len(_keys), _OCR_VER, _keys_n))
print('OCR 模型: %s（det %.2f MB / rec %.2f MB / 字典 %d 行 / rec 归一化 %s / det 阈值 %.2f）'
      % (_OCR_VER, len(_det_raw) / 1048576.0, len(_rec_raw) / 1048576.0,
         len(_keys), _rec_norm, _det_th))
_onnx_engine = read('src/ocr/ocr_onnx.js')
_onnx_bootstrap = (
    'window.ONNX_MODELS={det:"' + _det_b64 + '",rec:"' + _rec_b64 + '",gz:'
    + ('1' if _USE_GZ else '0') + '};\n'
    + 'window.ONNX_KEYS=' + json.dumps(_keys, ensure_ascii=False) + ';\n'
    + 'window.ONNX_CFG={ver:"' + _OCR_VER + '",recNorm:"' + _rec_norm
    + '",detTh:' + ('%.2f' % _det_th) + '};\n'
)
# 顺序：模型常量 【公共预处理层 preprocess.js】 【极性识别 polar_templates.js + polar.js】
# ONNX engine 主识别逻辑。
# preprocess.js 只认图片不认引擎，必须先于 ocr_onnx.js / ocr.js 定义
# 这样裁剪对齐那一层与识别引擎彻底解耦（换引擎不用动预处理）。
# polar_templates.js 定义 window.POLAR_REFS（三张 32x32 标准极性图标），polar.js 消费它
# 两者须在 ocr_onnx.js 之前就位（onnxFullRows 里 fitToTemplate 后立刻调 PolarOCR.detect）。
# 分隔形态：段首 1 个 '\n'、每个段间 1 个 '\n'、段末 1 个 '\n'。
# 源文件自己都以 '\n' 收尾，所以这里每处只补一个分隔换行 —— 补两个就多出空行
# JS 层面靠
ocr = ('\n' + _onnx_bootstrap + read('src/ocr/preprocess.js') + '\n'
       + read('src/ocr/polar_templates.js') + '\n'
       + read('src/ocr/polar.js') + '\n'
       + _onnx_engine + '\n' + read('src/ocr/ocr.js') + '\n')

# REAL-REROLL 块的取舍
_MARK = re.compile(r'[ \t]*<!-- REAL-REROLL:(?:BEGIN|END) -->[ \t]*\n')
_BLOCK = re.compile(r'[ \t]*<!-- REAL-REROLL:BEGIN -->.*?<!-- REAL-REROLL:END -->[ \t]*\n?',
                    re.S)
if REAL:
    tpl = _MARK.sub('', tpl)            # 只摘标记行，内容留下
else:
    tpl = _BLOCK.sub('', tpl)           # 整块删掉
assert 'REAL-REROLL' not in tpl, 'REAL-REROLL 标记没清干净'

json.loads(data)          # 先自检，避免把坏 JSON 打进去
json.loads(basedata)      # 同上

# 游戏紫卡卡面图（RivenTemplate.webp）内联成 data URI
# 页面要能离线单文件打开，不能挂外部图片。
_webp = open(_zhp('src', 'assets', 'riven.webp'), 'rb').read()
# src/framework/app.js 里写的是 src="data:image/webp
# 占位符只承载 base64 主体。
RIVEN_URI = base64.b64encode(_webp).decode('ascii')

# 紫卡收益引擎（4 个文件）+ WM 填充脚本
RIVEN_DIR = _zhp('src', 'engine')
WM_DIR = _zhp('src', 'fill')

_rules = read('src/common/_rules.js')
_riven_engine = read('src/engine/riven-engine.js')
_zkasm = read('src/engine/zkasm.js')
_riven_router = read('src/engine/riven-router.js')
_stance = read('src/engine/stances.js')
_zkmods = read('src/engine/zkmods.js')
_zkarcs = read('src/engine/zkarcs.js')
_cardsplit = read('src/framework/cardsplit.js')
_modpanel = read('src/framework/modpanel.js')
_zkc = read('src/common/zkc.js')
_zkprice = read('src/data/zkprice.js')
_pricetable = read('src/framework/pricetable.js')
_priceref = read('src/framework/priceref.js')
# 行情库 2.3 MB，由 tools/make_priceref_js.py 从 data/riven_price_db.json 生成
_pricedb = read('src/data/zkpricedb.js')

# 武器库：构建期池化
# weapon-db.js 里 642 把武器，重复字符串极多（`additive_with_base_damage`
# 出现 556 次，形态名 / 词条名 / 伤害类型各几十次）。
# 字段名（i/n/z/s/c/mr/at…）直接可读，改一把武器的数值能就地看懂；
# 改成「索引 + 池表」后源码不可读。
# 现有代码直接访问字符串键名
# w.fm.heavy_slam.rad.dmg w.fl.indexOf('slide') w.fm.incarnon
# 改消费方要动 riven-router.js / app.js 几十处。
# 一行都不用改，行为与源码版一致。
# 编码：字符串值 负数索引 -(idx+1)（与正数索引的对象/数组区分开）。
# 还原：见 _wdb_decode()。
sys.path.insert(0, RIVEN_DIR)
import _pool_wdb                                     # noqa: E402
_wdb_pool, _wdb_packed = _pool_wdb.pack(_pool_wdb.load_db())
_weapon_db_src = read('src/engine/weapon-db.js')

# 还原函数：负数 池里的字符串。
# 字符串值 -(idx+1) 对象/数组 保持原样（正数索引不会与负数冲突）
# 数字、布尔、null 不池化 —— 数字无法与索引区分。
_WDB_DECODE_JS = """(function () {
  var P = WEAPON_DB_POOL;
  function dec(o) {
    if (Array.isArray(o)) {
      for (var i = 0; i < o.length; i++) o[i] = dec(o[i]);
      return o;
    }
    if (o && typeof o === 'object') {
      for (var k in o) o[k] = dec(o[k]);
      return o;
    }
    if (typeof o === 'number' && o < 0) return P[-o - 1];
    return o;
  }
  var DB = dec(WEAPON_DB_ENC);
  if (typeof module !== 'undefined' && module.exports) module.exports = DB;
  else window.WEAPON_DB = DB;
})();"""

# 产物里放池化版 + 还原函数，运行时还原出来的对象与源码版逐字段相等。
_weapon_db = (
    '/* weapon-db.js —— 构建期池化版：重复字符串换成索引，运行时还原。\n'
    '   源码（人可维护的可读版）在 src/engine/weapon-db.js，不参与构建。\n'
    '   还原后与源码版逐字段相等 —— build.py 每次构建都会自检这一点。 */\n'
    'var WEAPON_DB_POOL = ' + json.dumps(_wdb_pool, ensure_ascii=False,
                                        separators=(',', ':')) + ';\n'
    'var WEAPON_DB_ENC = ' + json.dumps(_wdb_packed, ensure_ascii=False,
                                       separators=(',', ':')).replace(
        '"@@INF@@"', 'Infinity') + ';\n'
    + _WDB_DECODE_JS
)
print('武器库池化：%d 把 · 入池字符串 %d 个 · src %d 字符 → dist %d 字符（省 %.1f%%）'
      % (len(_wdb_packed), len(_wdb_pool), len(_weapon_db_src), len(_weapon_db),
         (len(_weapon_db_src) - len(_weapon_db)) * 100.0 / len(_weapon_db_src)))

# WM 词库：源码/fill/_wmdict.py 从 wm-stat-id.txt + wm-dict.txt + wm-items*.txt 现场编译
# 词库是唯一可编辑真源（等号对照表），编译产物不入库 —— 改了 txt 重跑 build 即可。
sys.path.insert(0, WM_DIR)
import _wmdict                                    # noqa: E402 （必须在 sys.path 改过之后 import）
WM_DICT = _wmdict.js_block()
print('WM 词库编译完成：%d 字符（源 wm-stat-id.txt + wm-dict.txt + wm-items*.txt）' % len(WM_DICT))

# WM 核心脚本的注释剥离器（工具包根目录，与 web/ 共用）
# 生成出来的 WM 脚本直接贴进拍卖页控制台执行，不需要注释；
# src src/fill/wm-fill-core.js 保留注释便于维护 —— 构建时剥离，不改源码。
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))))
import wm_strip                                   # noqa: E402

# 词库的 JS 语法体检
# 词库是代码生成出来的，一个逗号打错就整页 JS 报错
# 报错行号还落在产物里。
# 有 node 就用 node（真解析）；
def _node_exe():
    """找 node.exe：环境变量优先，然后扫托管运行时目录。
    路径不写死 —— 用 expanduser 取本机家目录。
    """
    c = os.environ.get('ZK_NODE')
    if c and os.path.isfile(c):
        return c
    base = os.path.join(os.path.expanduser('~'), '.workbuddy',
                        'binaries', 'node', 'versions')
    if os.path.isdir(base):
        for v in sorted(os.listdir(base), reverse=True):
            p = os.path.join(base, v, 'node.exe')
            if os.path.isfile(p):
                return p
    return None


def _check_js_block(name, src):
    node = _node_exe()
    if not node:
        # 退回轻量检查：括号配平 + 抓双逗号 / 空键
        depth = 0
        for ch in src:
            if ch in '{[':
                depth += 1
            elif ch in '}]':
                depth -= 1
                if depth < 0:
                    raise SystemExit('词库 JS 语法错：括号提前闭合')
        if depth != 0:
            raise SystemExit('词库 JS 语法错：括号没配平（差 %d）' % depth)
        bad = re.search(r',\s*,', src)
        if bad:
            raise SystemExit('词库 JS 语法错：出现双逗号 %r' % src[bad.start():bad.end() + 20])
        bad = re.search(r'\{\s*,', src)
        if bad:
            raise SystemExit('词库 JS 语法错：出现空键')
        print('✓ 词库 JS 轻量体检通过（无 node，跳过真解析）')
        return
    import subprocess
    import tempfile
    p = os.path.join(tempfile.gettempdir(), '_zk_wmdict_check.js')
    io.open(p, 'w', encoding='utf-8', newline='\n').write(src)
    try:
        r = subprocess.run([node, '--check', p], stdout=subprocess.PIPE,
                           stderr=subprocess.STDOUT)
        if r.returncode != 0:
            raise SystemExit('词库 JS 语法错：\n' + r.stdout.decode('utf-8', 'replace'))
    finally:
        if os.path.exists(p):
            os.remove(p)
    print('✓ 词库 JS 语法体检通过（node --check）')


_check_js_block('WM 词库', WM_DICT)

# WM 注入段：reader（读 base64）+ 词库 + 生成器，插在 app.js 的 rcard 之后
# 三块原样拼接，不做缩进变换。
# 产物里 WM 段嵌在 app.js 的 IIFE 内部，缩进不规则：分节注释是 4/5 格
# `window.__WM_CORE_SRC__ = ...` 只有 2 格、紧接着的 `var el` 又是 4 格。
# 源文件直接按产物形态存（含首行缩进），不做 dedentindent 这类变换。
# 块间形态：reader 紧接词库、中间空一行、生成器到段末。
# 词库那块的源文件（_dict.js）只是编译结果参考件，不参与构建
# 构建时一律从 wm-dict.txt / wm-items.txt 现场编译，避免两处漂移。
_wm_reader = read('src/fill/_reader.js')
_wm_gen = read('src/fill/_gen.js')
WM_SEG = (_wm_reader + WM_DICT + '\n' + _wm_gen)
# 插入位置：rcard 收尾之后、`① 洗卡模拟器` 分节注释之前。
# 锚点只认 `/* ① 洗卡模拟器`，不依赖注释里的分隔线 —— 分隔线会随排版整理变化。
_WM_RE = re.compile(r'/\*[ \t]*(?:=+[ \t]*)?① 洗卡模拟器')
if WM_SEG.strip():
    _hits = list(_WM_RE.finditer(js))
    assert len(_hits) == 1, 'WM 注入锚点「① 洗卡模拟器」命中 %d 处（应恰好 1 处）' % len(_hits)
    _at = _hits[0].start()
    js = js[:_at] + WM_SEG + js[_at:]
print('WM 段已并入 app.js：%d 字符（reader %d + 词库 %d + 生成器 %d）'
      % (len(WM_SEG), len(_wm_reader), len(WM_DICT), len(_wm_gen)))

# WM 填充引擎：base64 内联进隐藏 div
# 用 script 标签内联原文行不通 —— HTML 解析器不认 JS 注释边界
# 源码里任何标签字面量都会把块截断，报错行号还落在别处。
# 内联的是去注释版：生成出来的脚本直接贴进 WM 控制台用，不需要注释。
# src src/fill/wm-fill-core.js 保留全部注释便于维护，构建时剥离。
_wm_core = wm_strip.strip_js_comments(
    read('src/fill/wm-fill-core.js').replace('\r\n', '\n'))
_wm_core = wm_strip.squeeze_blank_lines(_wm_core) + '\n'
assert '/*' not in _wm_core and '//' not in _wm_core, 'WM 核心剥注释后仍有残留'
WM_CORE_B64 = base64.b64encode(_wm_core.encode('utf-8')).decode('ascii')
WMCORE_HOLDER = '<div id="wmCoreB64" hidden data-b64="%s"></div>' % WM_CORE_B64
# base64 里不能出现会截断属性的字符
for _bad in ('"', '<', '>', '\n', '\r'):
    assert _bad not in WM_CORE_B64, 'WM 核心 base64 含非法字符 %r' % _bad
print('WM 核心 %d 字符（去注释后） → base64 %d 字符' % (len(_wm_core), len(WM_CORE_B64)))

# __RIVENIMG__ 落在 app.js 里（卡面图那段 JS 拼字符串的代码）
# 所以必须在 __JS__ 替换之前先把它换掉 —— 否则它会被带进产物里留个占位符。
js = js.replace('__RIVENIMG__', RIVEN_URI)

# 占位符不能和源码里的标识符撞名：app.js 里写的是 window.ZKDATA
# 若占位符叫 __DATA__，replace 会连源码里的那处一起替换，把 JSON 塞进 JS 内部。
# 替换顺序有约束：__JS__ 必须最后替 —— WM_SEG 里有 '__WMCORE_B64__' 之类的
# 标识符，但没有 '__JS__'，所以先替其他都不会被牵连。
html = (tpl.replace('__CSS__', css)
        .replace('__COMMON_JS__', read('src/common/common.js'))
        # V11：ZKDATA 数据块单独成文件（源码/data/zkdata.js），构建期原地内联
        .replace('__ZKNAMES_JS__', NAMES_JS)
        .replace('__ZKDATA_JS__', read('src/data/zkdata.js'))
        .replace('__RULES_JS__', _rules)
        .replace('__RIVEN_ENGINE__', _riven_engine)
        .replace('__ZKSTANCE__', _stance)
        .replace('__ZKMODS__', _zkmods)
        .replace('__ZKARCS__', _zkarcs)
        .replace('__WEAPON_DB__', _weapon_db)
        .replace('__ZKASM__', _zkasm)
        .replace('__RIVEN_ROUTER__', _riven_router)
        .replace('__CARDSPLIT_JS__', _cardsplit)
        .replace('__MODPANEL_JS__', _modpanel)
        .replace('__ZKC_JS__', _zkc)
        .replace('__THEME_JS__', read('src/framework/theme.js'))
        .replace('__LANGFLOAT_JS__', read('src/framework/langfloat.js'))
        .replace('__STATTABLE_JS__', read('src/framework/stattable.js'))
        .replace('__SGX_JS__', read('src/framework/sgx.js'))
        .replace('__WEPTABLE_JS__', read('src/framework/weptable.js'))
        .replace('__PRICE_JS__', _zkprice)
        .replace('__PRICETABLE_JS__', _pricetable)
        .replace('__PRICEDB_JS__', _pricedb)
        .replace('__PRICEREF_JS__', _priceref)
        .replace('__WMCORE_B64__', WMCORE_HOLDER)
        .replace('__OCRJS__', ocr)
        .replace('__BASEDATA__', basedata_js)
        .replace('__JS__', js))
for tag in ('__CSS__', '__OCRJS__', '__JS__', '__BASEDATA__', '__RIVENIMG__',
            '__COMMON_JS__', '__ZKNAMES_JS__', '__ZKDATA_JS__',
            '__RULES_JS__', '__RIVEN_ENGINE__', '__WEAPON_DB__', '__ZKASM__',
            '__RIVEN_ROUTER__', '__THEME_JS__', '__LANGFLOAT_JS__', '__STATTABLE_JS__',
            '__SGX_JS__',
            '__WEPTABLE_JS__', '__PRICE_JS__', '__PRICETABLE_JS__', '__WMCORE_B64__',
            '__PRICEDB_JS__', '__PRICEREF_JS__',
            '__ZKSTANCE__', '__ZKMODS__', '__ZKARCS__', '__CARDSPLIT_JS__',
            '__MODPANEL_JS__', '__ZKC_JS__'):
    assert tag not in html, '占位符未替换：' + tag

# 注入的代码里不能出现裸 </script>（会提前截断块）或 <script>（会被当成新块开头）
for _name, _src in (('WM 段', WM_SEG), ('WM 核心', _wm_core), ('词库', WM_DICT),
                    ('收益引擎', _riven_engine), ('武器库', _weapon_db),
                    ('ZKASM', _zkasm), ('流派路由', _riven_router), ('RULES', _rules),
                    ('架势库', _stance), ('MOD 库', _zkmods), ('赋能套装', _zkarcs),
                    ('卡面切分', _cardsplit), ('MOD 面板', _modpanel), ('口径层', _zkc),
                    ('行情库', _pricedb), ('行情参考', _priceref),
                    ('速查表', read('src/framework/sgx.js'))):
    if '</script' in _src:
        raise SystemExit('注入代码（%s）含裸 </script>：%r'
                         % (_name, _src[_src.index('</script') - 70:_src.index('</script') + 50]))
print('✓ 注入代码无裸 script 标签')

# wmCoreB64 holder 必须落在所有 script 块之外（它是 HTML 元素，不是 JS）
_m = re.search(r'<div id="wmCoreB64"', html)
assert _m, '校验失败：wmCoreB64 holder 不见了'
for _mm in re.finditer(r'<script[^>]*>(.*?)</script>', html, re.S):
    if _mm.start() < _m.start() < _mm.end():
        raise SystemExit('校验失败：wmCoreB64 落在 script 块内')

# 落地校验：改完源码忘了同步的情况要在构建期就报错，不留到真机
_CHECKS = (
    ('id="wmCoreB64"', 'WM 核心 holder'),
    ('window.__WM_CORE_SRC__ = (function ()', 'WM 源码读取器'),
    ('var WM_STAT_ID = {', 'WM 词条三语 ID 表'),
    ('var WM_STAT_ROW_ID = {', 'WM 词条行号映射'),
    ('var WM_ITEM_LIST = [', 'WM 武器原文表'),
    ('var WM_ITEM_LIST_EN = [', 'WM 武器英文原文表'),
    ('var WM_WEAPON_CN2EN = {', 'WM 武器中英对照表'),
    ('function wmScriptFor(', 'WM 生成器主函数'),
    ('window.RULES={', '全站铁规则'),
    ('RIVEN_ROUTER', '流派路由导出'),
    ('window.ZKSTANCE=', '架势库'),
    ('window.ZKMODS=[', 'MOD 库'),
    ('window.ZKARCS', '赋能与套装'),
    ('window.ZKMB = (function ()', 'MOD 卡面渲染'),
    ('window.__DM=', 'MOD 面板导出'),
    ('function csLumaProfile', '双卡截图切分'),
)
for _pat, _tag in _CHECKS:
    assert _pat in html, '落地校验失败 [%s]：%r 找不到' % (_tag, _pat)
print('✓ %d 项落地校验全过' % len(_CHECKS))

# 换行：产物统一 CRLF，与交付件一致。
# 读入侧不用管：read() 走 universal newlines，源码/ 里 CRLF / LF 混着读进来都变成 \n；
# 模板 / JS / CSS / base64 / JSON 里都不存在字面 \r（JSON 的换行是转义后的 \n 两个字符）
# 所以末尾这一次整体转换是安全的、幂等的。
# newline='' ：不指定的话文本模式会在 Linux 上原样写、Windows 上再把 \n 转成 \r\n
_OUT_NL = '\r\n' if '--lf' not in sys.argv else '\n'
with io.open(OUT, 'w', encoding='utf-8', newline='') as f:
    f.write(html if _OUT_NL == '\n' else html.replace('\n', '\r\n'))

# WM 词库逐项校验（对着 WM 真实下拉清单）
# 写完产物再验：词库里的名字必须在 WM 下拉里，否则在 WM 上选不中。
# 名字对不对只有对着清单才知道，光看代码发现不了。
# 没有 node 就跳过（不能因为缺工具就构建失败）。
if _node_exe():
    import subprocess
    _r = subprocess.run([_node_exe(), os.path.join(WM_DIR, '_chk_dict.js'),
                         OUT, WM_DIR], stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT)
    _out = _r.stdout.decode('utf-8', 'replace')
    if _r.returncode != 0:
        raise SystemExit('WM 词库校验失败：\n' + _out)
    # 组数从校验器自己的输出里数 —— 写死数字的话，加了组忘了改这里
    # 就会对外报「10 组全过」而实际跑了 12 组，少报的那组出问题也看不见。
    _ng = len(re.findall(r'^=== ', _out, re.M))
    print('✓ WM 词库逐项校验通过（%d 组）' % _ng)

    # 武器库池化还原校验
    # 池化把重复字符串换成索引、运行时还原 —— 一旦还原出来与源码不等
    # 武器基础面板全错，而且是静默的（数值不对但不报错）。
    # 所以每次构建都必须逐字段对拍一遍。
    _r = subprocess.run([_node_exe(), os.path.join(RIVEN_DIR, '_chk_wdb.js'),
                         OUT, os.path.join(RIVEN_DIR, 'weapon-db.js')],
                        stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    _out = _r.stdout.decode('utf-8', 'replace')
    if _r.returncode != 0:
        raise SystemExit('武器库池化还原校验失败：\n' + _out)
    print('✓ 武器库池化还原校验通过（与源码逐字段相等）')
else:
    print('⚠ 没找到 node，跳过 WM 词库与武器库的逐项校验')

# 源码体检（V06 / V07）
# 靠人盯不住。
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _audit_js import audit as _audit_js                          # noqa: E402
_a = _audit_js(_zhp('src'))
print('源码体检：空 catch %d · for...in %d（缺守卫 %d）· innerHTML %d'
      % (len(_a['empty_catch']), _a['forin'], len(_a['forin_unguarded']), _a['innerHTML']))
if _a['empty_catch']:
    raise SystemExit('源码体检失败：仍有空 catch（吞异常，线上无法排障）：\n  '
                     + '\n  '.join(_a['empty_catch'][:20]))
if _a['forin_unguarded']:
    raise SystemExit('源码体检失败：for...in 缺 hasOwnProperty 守卫：\n  '
                     + '\n  '.join(_a['forin_unguarded'][:20]))

print('输出 -> %s   %.0f KB   %s   换行 %s'
      % (OUT, os.path.getsize(OUT) / 1024,
         '最终版（含双卡对比）' if REAL else '无双卡对比版',
         'CRLF' if _OUT_NL == '\r\n' else 'LF'))
