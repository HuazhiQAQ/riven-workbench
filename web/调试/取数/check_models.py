# *- coding: utf-8 -*
"""看一眼产物里到底嵌了哪版 OCR 模型（det/rec 体积、是否 gzip、magic）。
用法：
    python check_models.py                # 扫 web/dist/*.html
    python check_models.py 路径.html ...   # 只看指定文件
"""
import io, base64, re, os, sys, glob

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PAT_MODELS = re.compile(r'window\.ONNX_MODELS=\{det:"([A-Za-z0-9+/=]*)",rec:"([A-Za-z0-9+/=]*)"(?:,gz:(\d))?\}')
PAT_CFG = re.compile(r'window\.ONNX_CFG=\{[^}]*\}')


def check(p, label=None):
    label = label or os.path.basename(p)
    with io.open(p, encoding='utf-8', errors='replace') as f:
        t = f.read()
    m = PAT_MODELS.search(t)
    if not m:
        print('%s  NO ONNX_MODELS match（可能不是最新产物，或模型段被改写）' % label)
        return
    det, rec, gz = m.group(1), m.group(2), m.group(3) or '0'
    try:
        head = base64.b64decode(det[:16] + '==')[:4]
        magic = head.hex()
    except Exception:
        magic = '??'
    print('%s  gz=%s  det_b64=%.2fMB  rec_b64=%.2fMB  det_magic=%s'
          % (label, gz, len(det) / 1048576.0, len(rec) / 1048576.0, magic))
    cfg = PAT_CFG.search(t)
    if cfg:
        print('    ' + cfg.group(0))


def main():
    args = sys.argv[1:]
    if args:
        files = [a if os.path.isabs(a) else os.path.join(os.getcwd(), a) for a in args]
    else:
        files = sorted(glob.glob(os.path.join(ROOT, 'web', 'dist', '*.html')))
    if not files:
        print('没有找到产物 HTML。')
        return 1
    for p in files:
        if not os.path.exists(p):
            print('MISSING %s' % p)
            continue
        check(p)
    return 0


if __name__ == '__main__':
    sys.exit(main())
