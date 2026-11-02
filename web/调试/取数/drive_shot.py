# *- coding: utf-8 -*
"""截三张桌面图：① 自选武器（金色跳转按钮）/ ③ 综合评定 / ⑤ 数值说明（固定系数表）。
用法：python drive_shot.py [pick|calc|about|all]
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
os.makedirs(TMP, exist_ok=True)

W, H, SCALE = '1280', '900', '2'

# 通用：切暗色主题 + 只显示目标版块
HEAD = r'''
<script>
setTimeout(function(){
  try{
    document.documentElement.setAttribute('data-theme','dark');
    var keep = '__KEEP__';
    ['#pick','#open','#calc','#ranges','#about'].forEach(function(s){
      if (s !== keep) { var e = document.querySelector(s); if (e) e.style.display='none'; }
    });
    document.querySelector('header') && (document.querySelector('header').style.display='');
  }catch(e){ document.title='ERR '+e.message; }
},250);
</script>
'''

PICK = r'''
<script>
setTimeout(function(){
  try{
    var q = document.getElementById('q1');
    q.value = '托里德'; q.dispatchEvent(new Event('input', {bubbles:true}));
    setTimeout(function(){
      var c = document.querySelector('#cands1 .cand'); if (c) c.click();
      setTimeout(function(){
        var b = document.querySelector('#pick button[data-a="reroll1"]'); if (b) b.click();
        setTimeout(function(){
          // ★ 手设正面槽 0 = 后坐力(25)，填 -108（Excel 截图 A 的当前值）：
          //   正面槽后坐力必须是**负数** —— 后坐力是全表唯一方向相反的词条
          var sel = document.querySelector('#c3wrap select[data-a="slot"][data-i="0"]');
          var o = sel && Array.from(sel.options).find(function(x){return +x.value===25;});
          if (o){
            sel.value='25'; sel.dispatchEvent(new Event('change',{bubbles:true}));
            var inp = document.querySelector('#c3wrap input[data-a="val"][data-i="0"]');
            if (inp){ inp.value='-108'; inp.dispatchEvent(new Event('change',{bubbles:true})); }
          }
        }, 200);
      }, 150);
    }, 200);
  }catch(e){ document.title='ERR '+e.message; }
},400);
</script>
'''

CALC = r'''
<script>
setTimeout(function(){
  try{
    var q = document.getElementById('q');
    q.value = '托里德'; q.dispatchEvent(new Event('input', {bubbles:true}));
    setTimeout(function(){
      var c = document.querySelector('#cands .cand'); if (c) c.click();
      setTimeout(function(){
        function pick(i, row){
          var sel = document.querySelector('select[data-a="krow"][data-i="'+i+'"]');
          var o = Array.from(sel.options).find(function(x){ return +x.value === row; });
          if (o){ sel.value = String(row); sel.dispatchEvent(new Event('change', {bubbles:true})); }
        }
        // 托里德（步枪）：后坐力（正面，验符号）/ 暴击伤害 / 多重射击 / 变焦（负面）
        pick(0, 25); pick(1, 5); pick(2, 19); pick(3, 26);
        setTimeout(function(){
          [0,1,2,3].forEach(function(i){
            var trs = Array.from(document.querySelectorAll('#calc-body table.res tr')).slice(1);
            if (!trs[i]) return;
            var md = parseFloat(trs[i].children[4].textContent);
            if (!isFinite(md)) return;
            var inp = document.querySelector('input[data-a="kval"][data-i="'+i+'"]');
            if (inp){ inp.value = String(md * (i === 3 ? 0.94 : 1.04));
                      inp.dispatchEvent(new Event('change', {bubbles:true})); }
          });
        }, 150);
      }, 200);
    }, 200);
    // 滚到「综合评定」那块（左右两框 + 游戏卡面）
    setTimeout(function(){
      var v = document.querySelector('.verdict');
      var se = document.scrollingElement || document.documentElement;
      if (v) se.scrollTop = v.getBoundingClientRect().top + se.scrollTop - 96;
      window.dispatchEvent(new Event('scroll'));
    }, 900);
  }catch(e){ document.title='ERR '+e.message; }
},400);
</script>
'''

ABOUT = r'''
<script>
// 数值说明里「固定系数」那张卡：滚到它下面去
setTimeout(function(){
  try{
    var c = document.getElementById('consts');
    var se = document.scrollingElement || document.documentElement;
    var card = c ? c.closest('.card') || c : null;
    var y = card ? card.getBoundingClientRect().top + se.scrollTop - 96 : 0;
    se.scrollTop = y;
    window.dispatchEvent(new Event('scroll'));
  }catch(e){ document.title='ERR '+e.message; }
},700);
</script>
'''

RANGES = r'''
<script>
// ④ 区：选中一把武器后滚到「融合专属词条」——左栏「当前武器」卡不该跟着跑
setTimeout(function(){
  try{
    var q = document.getElementById('rgQ');
    q.value = '托里德'; q.dispatchEvent(new Event('input', {bubbles:true}));
    setTimeout(function(){
      var b = document.querySelector('#rgList button[data-a="rgpick"]');
      if (b) b.click();
      setTimeout(function(){
        var f = document.querySelector('.r-tbl.fuse') || document.querySelector('.r-tables');
        var se = document.scrollingElement || document.documentElement;
        if (f) se.scrollTop = f.getBoundingClientRect().top + se.scrollTop - 120;
        window.dispatchEvent(new Event('scroll'));
      }, 250);
    }, 250);
  }catch(e){ document.title='ERR '+e.message; }
},450);
</script>
'''

JOBS = {
    'pick':   ('#pick',   PICK,   'desk_pick.png'),
    'calc':   ('#calc',   CALC,   'calc_filled.png'),
    'about':  ('#about',  ABOUT,  'desk_about.png'),
    'ranges': ('#ranges', RANGES, 'desk_ranges.png'),
}

OUTER = '''<!doctype html><meta charset="utf-8">
<body style="margin:0;background:#3a3f4a">
<iframe src="_ds_inner_%s.html" style="width:%spx;height:%spx;border:0;display:block"></iframe>
</body>
'''

html = io.open(SRC, encoding='utf-8').read()
want = sys.argv[1:] or ['pick', 'calc', 'about']

for key in want:
    keep, drive, name = JOBS[key]
    inner = os.path.join(TMP, '_ds_inner_%s.html' % key)
    injected = HEAD.replace('__KEEP__', keep) + drive
    io.open(inner, 'w', encoding='utf-8').write(
        html.replace('</body>', injected + '</body>'))
    outer = os.path.join(TMP, '_ds_outer_%s.html' % key)
    io.open(outer, 'w', encoding='utf-8').write(OUTER % (key, W, H))
    out = os.path.join(TMP, name)
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars',
                    '--allow-file-access-from-files',
                    '--force-device-scale-factor=' + SCALE,
                    '--virtual-time-budget=9000',
                    '--window-size=%d,%d' % (int(W) + 140, int(H)),
                    '--screenshot=' + out, 'file:///' + outer.replace('\\', '/')],
                   capture_output=True, text=True)
    print('截图 ->', name, os.path.getsize(out), '字节')
