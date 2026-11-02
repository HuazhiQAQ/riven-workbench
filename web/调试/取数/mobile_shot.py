# *- coding: utf-8 -*
"""给页面预先点几下（开卡 / 洗卡 / 选武器），再截一张手机宽度的长图。
与 probe.py 同一约束：Windows 无头窗口最小宽约 500px，故将页面放入定宽 iframe，
  截图中左侧条带即为真实手机宽度渲染。
"""
import io, os, subprocess, sys

import os as _os, sys as _sys
_sys.path.insert(0, _os.path.join(
    _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))), 'build'))
import _product
SRC = _product.find()          # 产物名带日期，_product 自动找最新那份
TMP = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shot')
CHROME = next((p for p in (
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    os.path.join(os.environ.get('LOCALAPPDATA', ''),
                 'Google', 'Chrome', 'Application', 'chrome.exe'),
) if os.path.isfile(p)), None)
assert CHROME, '没找到 Chrome，请自行改 CHROME 常量'

os.makedirs(TMP, exist_ok=True)   # 输出目录可能已被清空，确保存在

W = sys.argv[1] if len(sys.argv) > 1 else '390'
H = sys.argv[2] if len(sys.argv) > 2 else '3000'
OUT = sys.argv[3] if len(sys.argv) > 3 else 'm.png'
THEME = sys.argv[4] if len(sys.argv) > 4 else 'dark'
HIDE = sys.argv[5] if len(sys.argv) > 5 else ''   # 逗号分隔的选择器，先隐藏（让目标版块顶到最上面）
SCALE = sys.argv[6] if len(sys.argv) > 6 else '2'

DRIVE = r'''
<script>
setTimeout(function(){
  try{
    document.documentElement.setAttribute('data-theme','%s');
    var hide = '%s'.split(',').filter(Boolean);
    hide.forEach(function(s){
      document.querySelectorAll(s).forEach(function(e){ e.style.display='none'; });
    });
    // ★ 新结构：#pick 是主入口（自选武器洗卡），#open 才是开紫卡
    document.querySelector('button[data-a="open"]').click();
    document.querySelector('#open button[data-a="reroll2"]').click();
    var q = document.getElementById('q1');
    if (q){ q.value='布拉玛'; q.dispatchEvent(new Event('input',{bubbles:true})); }
    setTimeout(function(){
      var c = document.querySelector('#cands1 .cand'); if (c) c.click();
      document.querySelector('#pick button[data-a="reroll1"]').click();
    }, 150);
  }catch(e){}
}, 200);
</script>
''' % (THEME, HIDE)

OUTER = '''<!doctype html><meta charset="utf-8">
<body style="margin:0;background:#3a3f4a">
<iframe src="_shot_inner.html" style="width:%spx;height:%spx;border:0;display:block"></iframe>
</body>
'''

html = io.open(SRC, encoding='utf-8').read()
io.open(os.path.join(TMP, '_shot_inner.html'), 'w', encoding='utf-8').write(
    html.replace('</body>', DRIVE + '</body>'))

outer = os.path.join(TMP, '_shot_outer.html')
io.open(outer, 'w', encoding='utf-8').write(OUTER % (W, H))
out = os.path.join(TMP, OUT)
subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars',
                '--allow-file-access-from-files',
                '--force-device-scale-factor=' + SCALE,
                '--virtual-time-budget=6000',
                '--window-size=%d,%d' % (int(W) + 140, int(H)),
                '--screenshot=' + out,
                'file:///' + outer.replace('\\', '/')],
               capture_output=True, text=True)
print('截图 ->', out, os.path.getsize(out), '字节')
