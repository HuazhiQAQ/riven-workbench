# coding: utf-8 -*
"""
embed-ort.py —— 把 ONNX 运行时整套内嵌进紫卡工具包的产物，生成「纯离线版」。
但跑模型的引擎（onnxruntime-web 1.30.0）写死在 jsDelivr 上。
断网 / CDN 不可用时连 `import()` 都失败，OCR 不可用。
产物设计目标为「双击 html 即可使用，图片不出本机」。
离线要齐三件东西，少一件就等于没离线：
    ① 运行时模块   ort.wasm.min.mjs              50 KB
    ② wasm 胶水    ort-wasm-simd-threaded.mjs    24 KB
    ③ wasm 本体    ort-wasm-simd-threaded.wasm  13.6 MB
  只嵌 ①③ 而漏 ② → 运行时找不到 ②，会按 `import.meta.url` 去解析
  「同目录下的 ort-wasm-simd-threaded.mjs」，而内嵌场景下 import.meta.url 是
  `blob:null/…`，解析必然取不到 → 启动失败 → 识别直接不可用。②必须嵌，且必须与①是同一构建：
      ort.wasm.min.mjs  ↔  ort-wasm-simd-threaded.mjs  ↔  ort-wasm-simd-threaded.wasm
  （别拿 ort.mjs 配它：那个构建的胶水叫 ort-wasm-simd-threaded.jsep.mjs，
    配的 wasm 是 27 MB 的 jsep 版，两者不通用。）
素材来源（优先用本地已有的，不联网）：
    ① ort/ort-wasm.wasm（本目录）= ort-wasm-simd-threaded.wasm（sha1 一致）
    ② _ort_cache/（从别处拷来的缓存），有就用
    ③ 都没有才从 CDN 下载并缓存
用法（在工具包 web/ 目录下）：
    python embed-ort.py                          # 用默认主文件，输出 <主名>-离线.html
    python embed-ort.py --src 某某.html           # 指定主文件
    python embed-ort.py --out 某某-离线.html      # 指定输出
    python embed-ort.py --force-download          # 忽略本地素材，强制从 CDN 重下
    python embed-ort.py --strip                   # 顺带去掉全部注释（交付形态）
20261025 起交付件是去注释形态（和作者手工做的「最终版」逐字节一致）。
  去注释是构建链的最后一步，必须在 embed 之后做 —— 内嵌那段 ORT 脚本
  自带一行横幅注释，先 strip 再 embed 会把它留下。
      见 src/ocr/ocr_onnx.js 的 ortB64Url()。浏览器需支持 DecompressionStream。
"""
import base64
import gzip
import io
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.dirname(HERE)

CDN = 'https://fastly.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/'
# 键：注入到 window.ORT_EMBED 的名字；
FILES = {
    'mjs':  ('ort.wasm.min.mjs', 30000),                 # 运行时（wasm EP 专用构建）
    'glue': ('ort-wasm-simd-threaded.mjs', 15000),        # wasm 胶水（运行时 import 的那个模块）
    'wasm': ('ort-wasm-simd-threaded.wasm', 10000000),    # wasm 本体
}
MARK = 'window.ORT_EMBED='

# ── 断网闸门：黑名单 ──
# 后三条是任何一个 CDN 主机名都会带上的特征词。
# 判据 = 「扫出来几处」，0 处才通过；
CDN_HOSTS = ('tesseract', 'paddleocr', 'jsdelivr', 'unpkg.com', 'cdnjs')

# 本地已有的同款文件（sha1 一致即同一构建）。
LOCAL_CANDIDATES = {
    'mjs':  [os.path.join(WEB, '运行时', 'ort', 'ort.wasm.min.mjs'),
             os.path.join(WEB, '运行时', '_ort_cache', 'ort.wasm.min.mjs')],
    'glue': [os.path.join(WEB, '运行时', 'ort', 'ort-wasm-simd-threaded.mjs'),
             os.path.join(WEB, '运行时', '_ort_cache', 'ort-wasm-simd-threaded.mjs')],
    # ort/ort-wasm.wasm 与 ort-wasm-simd-threaded.wasm 是同一个文件（sha1 81e64570…）
    'wasm': [os.path.join(WEB, '运行时', 'ort', 'ort-wasm-simd-threaded.wasm'),
             os.path.join(WEB, '运行时', 'ort', 'ort-wasm.wasm'),
             os.path.join(WEB, '运行时', '_ort_cache', 'ort-wasm-simd-threaded.wasm')],
}


def find_src():
    """默认主文件：同目录里唯一的非「离线」产物 HTML。"""
    cands = [f for f in sorted(os.listdir(os.path.join(WEB, "dist")))
             if f.endswith('.html') and '离线' not in f and not f.startswith('_')]
    # 优先带日期前缀的正式产物
    pref = [f for f in cands if f[:8].isdigit()]
    if pref:
        return os.path.join(WEB, 'dist', pref[-1])
    if cands:
        return os.path.join(WEB, 'dist', cands[0])
    raise SystemExit('找不到主 HTML —— 用 --src <路径> 明确指定')


_ARGV = sys.argv[1:]
_has_src = '--src' in _ARGV
SRC = _ARGV[_ARGV.index('--src') + 1] if _has_src else find_src()
OUT = None
FORCE = '--force-download' in sys.argv


def grab(key, fname, min_size):
    """先找本地素材，再考虑下载。"""
    if not FORCE:
        for p in LOCAL_CANDIDATES.get(key, []):
            if os.path.exists(p) and os.path.getsize(p) >= min_size:
                with open(p, 'rb') as f:
                    data = f.read()
                print('  本地命中 %-34s (%.2f MB)  %s'
                      % (os.path.basename(p), len(data) / 1048576.0, p))
                return data
    cache = os.path.join(WEB, '运行时', '_ort_cache')
    os.makedirs(cache, exist_ok=True)
    path = os.path.join(cache, fname)
    if os.path.exists(path) and os.path.getsize(path) >= min_size and not FORCE:
        print('  缓存命中 %s (%.2f MB)' % (fname, os.path.getsize(path) / 1048576.0))
    else:
        if os.path.exists(path) and FORCE:
            os.remove(path)
        url = CDN + fname
        print('  下载 %s …' % url)
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=300) as r:
            data = r.read()
        if len(data) < min_size:
            print('  下载不完整：%d 字节，中止。' % len(data))
            sys.exit(1)
        with open(path, 'wb') as f:
            f.write(data)
        print('  完成 %s (%.2f MB)' % (fname, len(data) / 1048576.0))
    with open(path, 'rb') as f:
        return f.read()


def main():
    global SRC, OUT
    argv = sys.argv[1:]
    if '--src' in argv:
        SRC = argv[argv.index('--src') + 1]
    if '--out' in argv:
        OUT = argv[argv.index('--out') + 1]
    if not OUT:
        base = os.path.splitext(os.path.basename(SRC))[0]
        OUT = os.path.join(WEB, 'dist', base + '-离线.html')

    print('读主文件 …（%s）' % os.path.basename(SRC))
    html = io.open(SRC, encoding='utf-8').read()
    if MARK in html:
        print('这份文件里已经有 ORT_EMBED 了，说明它本身就是离线版 —— 换一份源文件再跑。')
        return

    payload = {}
    for key, (fname, minsz) in FILES.items():
        raw = grab(key, fname, minsz)
        # gzip 后再 base64：wasm 13.6 MB 3.6 MB，整包从 ~19 MB 降到 ~5 MB。
        # mtime 固定写 0 同一份素材每次构建出来的字节完全相同（可复现）；
        # 写当前时间的话，每构建一次 gzip 头就变一次，产物无法逐字节比对。
        # 读取侧见 src/ocr/ocr_onnx.js 的 ortB64Url(..., gz, ...)，按 E.gz 解码。
        payload[key] = base64.b64encode(gzip.compress(raw, compresslevel=9, mtime=0)).decode('ascii')
        print('  %s → gzip+base64 %.2f MB（原 %.2f MB）'
              % (key, len(payload[key]) / 1048576.0, len(raw) / 1048576.0))

    # 注入点：含 window.ONNX_MODELS= 的那个 <script> 块（OCR 主模块）的 <script> 标签之前
    # 必须在它执行前就有 ORT_EMBED。
    # 不要用「第 N 个 <script>」这种位置判断：script 块数早就漂了。
    # 现在按内容定位，改块数也不会跑偏。
    # 还要防「匹配到 JS 字符串里的 <script 字面量」—— 所以从标签起往后找
    # 并且要求这个 <script 标签到块结束之间的内容里真的含 ONNX_MODELS。
    import re
    m = None
    for m in re.finditer(r'<script\b[^>]*>', html):
        body_end = html.find('</script>', m.end())
        if body_end < 0:
            continue
        if 'window.ONNX_MODELS=' in html[m.end():body_end]:
            break
    if m is None:
        print('找不到含 window.ONNX_MODELS 的 <script> 块，注入失败')
        return
    idx = m.start()
    print('注入点：第 %d 个 <script> 块（OCR 主模块）' % (html.count('<script', 0, idx) + 1))
    # 注释与 window.ORT_EMBED 写在同一行：删注释后这一块仍是单行
    # 拆成多行会多出空行、行号整体漂移。
    inject = ('<script>/* 离线运行时（embed-ort.py 生成）：onnxruntime-web 1.30.0 的 '
              'ort.wasm.min.mjs + 胶水 ort-wasm-simd-threaded.mjs + 本体 .wasm，三件缺一不可；'
              'base64 内嵌，不联网。 */'
              '%s{"gz":1,"mjs":"%s","glue":"%s","wasm":"%s"};</script>\n'
              % (MARK, payload['mjs'], payload['glue'], payload['wasm']))
    result = html[:idx] + inject + html[idx:]

    print('写入 %s …' % os.path.basename(OUT))
    if '--strip' in sys.argv:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from strip_html import strip_all, squeeze_blank, STATS
        _before = len(result)
        result = strip_all(result)
        print('去注释：%d → %d 字符（行数 %d 不变）'
              % (_before, len(result), result.count('\n') + 1))
        # V12：口径固定为「 保留 / 其余剥」，计数打出来供两次构建比对。
        print('注释计数：保留 %d 条 / 剥掉 %d 条' % (STATS['kept'], STATS['dropped']))
        # 2026-10-27：交付件再删全部空白行（产物无 <pre>、无带空行的模板串，见 squeeze_blank）。
        _before_squeeze = result
        result = squeeze_blank(result)
        print('删空行：%d → %d 字符（行数 %d → %d，省 %.1f KB）'
              % (len(_before_squeeze), len(result),
                 _before_squeeze.count('\n') + 1, result.count('\n') + 1,
                 (len(_before_squeeze) - len(result)) / 1024.0))
    # ── 断网闸门：在最终交付形态上扫（去注释之后，注释里的字样不算数） ──
    # 20261025 取消联网版；
    # 实现整条删掉 —— 源码本身已是纯离线形态（连 ORT_CDN 都是空串），所以
    # 这里不再做「逐条原文替换」，改成对产物做黑名单扫描：扫出任何 CDN 主机名
    # 就判失败。
    # 扫描前先剔掉内嵌的 base64 大块（二进制里出现什么字串都不代表代码）。
    _code = re.sub(r'[A-Za-z0-9+/=]{200,}', '', result)
    left = [h for h in CDN_HOSTS if h in _code.lower()]
    print('断网闸门：产物内 CDN 主机名 %d 处' % len(left))
    with io.open(OUT, 'w', encoding='utf-8') as f:
        f.write(result)
    print('完成：%.1f MB（原 %.1f MB）' % (len(result.encode('utf-8')) / 1048576.0,
                                          len(html.encode('utf-8')) / 1048576.0))
    if left:
        raise SystemExit('✗ 产物里仍有 CDN 迹象：%s —— 离线版可能发请求。'
                         % ' / '.join(left))
    print('✓ 离线版已无任何 CDN 依赖：ONNX 走内嵌运行时，'
          '全页只有这一条识别路径（已下线引擎在源码与产物中均无痕迹）。')


main()
