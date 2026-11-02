# *- coding: utf-8 -*
"""给计算器填一组词条，再截「综合评定」那块（左右两框 + 游戏卡面）。"""
import io, os, subprocess

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

W, H, SCALE = '1280', '1250', '2'

DRIVE = r'''
<script>
setTimeout(function(){
  try{
    document.documentElement.setAttribute('data-theme','dark');
    ['#pick','#open','#ranges','#about'].forEach(function(s){
      var e=document.querySelector(s); if(e) e.style.display='none';
    });
    // 计算器：选武器（托里德）→ 填 3 正 1 负
    var q=document.getElementById('q');
    q.value='托里德'; q.dispatchEvent(new Event('input',{bubbles:true}));
    setTimeout(function(){
      var c=document.querySelector('#cands .cand'); if(c) c.click();
      setTimeout(function(){
        var rows=[[2,'1'],[21,'1'][0]][0];
        var sel0=document.querySelector('select[data-a="krow"][data-i="0"]');
        var sel1=document.querySelector('select[data-a="krow"][data-i="1"]');
        var sel2=document.querySelector('select[data-a="krow"][data-i="2"]');
        var sel3=document.querySelector('select[data-a="krow"][data-i="3"]');
        function pick(sel,row){
          var o=Array.from(sel.options).find(function(x){return +x.value===row;});
          if(o){ sel.value=String(row); sel.dispatchEvent(new Event('change',{bubbles:true})); }
          return !!o;
        }
        // 托里德（步枪）：基础伤害 / 暴击伤害 / 多重射击 / 变焦
        pick(sel0,2);
        var s1=document.querySelector('select[data-a="krow"][data-i="1"]'); pick(s1,5);
        var s2=document.querySelector('select[data-a="krow"][data-i="2"]'); pick(s2,19);
        var s3=document.querySelector('select[data-a="krow"][data-i="3"]'); pick(s3,26);
        setTimeout(function(){
          // 当前值填成理论中值附近，让评级有内容
          [0,1,2,3].forEach(function(i){
            var tds=Array.from(document.querySelectorAll('#calc-body table.res tr')).slice(1);
            if(!tds[i]) return;
            var md=parseFloat(tds[i].children[4].textContent);
            if(!isFinite(md)) return;
            var inp=document.querySelector('input[data-a="kval"][data-i="'+i+'"]');
            if(inp){ inp.value=String(md*(i===3? 0.94 : 1.04)); inp.dispatchEvent(new Event('change',{bubbles:true})); }
          });
        },120);
      },150);
    },150);
  }catch(e){ document.title='ERR '+e.message; }
},300);
</script>
'''

OUTER = '''<!doctype html><meta charset="utf-8">
<body style="margin:0;background:#3a3f4a">
<iframe src="_dc_inner.html" style="width:%spx;height:%spx;border:0;display:block"></iframe>
</body>
'''
html = io.open(SRC, encoding='utf-8').read()
io.open(os.path.join(TMP, '_dc_inner.html'), 'w', encoding='utf-8').write(
    html.replace('</body>', DRIVE + '</body>'))
outer = os.path.join(TMP, '_dc_outer.html')
io.open(outer, 'w', encoding='utf-8').write(OUTER % (W, H))
out = os.path.join(TMP, 'calc_filled.png')
subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars',
                '--allow-file-access-from-files', '--force-device-scale-factor=' + SCALE,
                '--virtual-time-budget=9000',
                '--window-size=%d,%d' % (int(W) + 140, int(H)),
                '--screenshot=' + out, 'file:///' + outer.replace('\\', '/')],
               capture_output=True, text=True)
print('截图 ->', out, os.path.getsize(out), '字节')
