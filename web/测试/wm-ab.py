# !/usr/bin/env python
# *- coding: utf-8 -*
"""WM 填表回归测试：对当前实现与构造的缺陷实现各执行一遍，输出指标对比表。
用法： python test/wm-ab.py
输出： 两轮运行日志 + 8 项指标对比表
"""
import os, re, json, html, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
FILL = os.path.join(ROOT, '源码', '填表', 'wm-fill-core.js')

TPL = """<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<div id="out"></div>
<script src="wm-sim.js"></script>
<script>
window.__WM_FILL_DATA__ = __DATA__;
__PRESET__
</script>
<script src="__SCRIPT__"></script>
<script>
(function(){
  var t0 = Date.now();
  var iv = setInterval(function(){
    var L = window.__WM_FILL_LOG__ || [];
    if (L.length && L[L.length-1].indexOf('结束：') >= 0) { clearInterval(iv); snap(L); document.title='DONE'; }
    if (Date.now()-t0 > 25000) { clearInterval(iv); snap(L); document.title='DONE'; }
  }, 40);
  function snap(L){
    var st = window.__WM_STATE__;
    var pv = [].slice.call(document.querySelectorAll('ul.riven-preview__attributes > li')).map(function(li){
      var b=li.querySelector('b'), s=li.querySelector('span');
      return { val:(b?b.textContent:'').trim(), name:(s?s.textContent:'').trim() };
    });
    var d = document.createElement('pre'); d.id='__SNAP__';
    d.textContent = JSON.stringify({
      log: L.join('\\n'), preview: pv,
      rows: st.rows.map(function(r){ return { kind:r.kind, stat:r.stat, val:r.num?r.num.value:'',
        min:r.num?r.num.getAttribute('min'):'', max:r.num?r.num.getAttribute('max'):'' }; }),
      addClicks: st.addClicks, pickCounts: st.pickCounts
    });
    document.body.appendChild(d);
  }
})();
</script></body></html>"""

def find_chrome():
    for p in [r'C://Program Files\Google\Chrome\Application\chrome.exe',
              r'C://Program Files (x86)\Google\Chrome\Application\chrome.exe',
              r'C://Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
              r'C://Program Files\Microsoft\Edge\Application\msedge.exe']:
        if os.path.exists(p): return p
    return None

def make_old(src):
    raw = open(src, encoding='utf-8', newline='').read()
    nl = '\r\n' if '\r\n' in raw else '\n'
    s = raw
    def rep(old, new):
        nonlocal s
        o = old.replace('\n', nl)
        if o in s: s = s.replace(o, new.replace('\n', nl))
    rep("const clickEntry = el => { tap(deepest(el)); };",
        "const clickEntry = el => { tap(deepest(el)); tap(el); };")
    rep("""  function smartValue(numEl, p, mult) {
    const v = Number(p);
    if (!isFinite(v)) return 0;
    return Number(v.toFixed(4));
  }""",
"""  function smartValue(numEl, p, mult) {
    const v = Number(p);
    if (!isFinite(v)) return 0;
    const mn = parseFloat(numEl && numEl.getAttribute('min'));
    const mx = parseFloat(numEl && numEl.getAttribute('max'));
    const isMulBox = isFinite(mn) && isFinite(mx) && mn >= 0 && mx <= 1;
    if (isMulBox) { const raw = Math.abs(v) > 1 ? v : 1 + v/100; return Number(raw.toFixed(4)); }
    if (mult && v > 1) return Number(((v-1)*100).toFixed(4));
    return Number(v.toFixed(4));
  }""")
    rep("if (!/^\\+?\\s*(增加|添加|新增|add|new)$/i.test(t)) continue;",
        "if (!/增加|添加|新增|^\\+$|^(add|new)$/i.test(t)) continue;")
    rep("    try { await clearPick(root); } catch (_) {}", "    /* 对照：不先清 */")
    rep("""      const ok = await until(() => pickedCls(root) || null, 800, '', root)
        .then(() => true).catch(() => false);
      if (ok) { say('✓ ' + what + ' = 「' + best.text + '」'); return true; }
      say('· ' + what + '：点了「' + best.text + '」但 WM 还没确认 —— 不再补点，末尾统一核对');
      return true;                       /* 动作做完了；不再补点，避免重复登记 */""",
"""      say('✓ ' + what + ' = 「' + best.text + '」');
      return true;""")
    return s

def run(chrome, workdir, script_name, script_src, data, preset=''):
    page = os.path.join(workdir, 'run.html')
    open(page, 'w', encoding='utf-8', newline='').write(
        TPL.replace('__SCRIPT__', script_name)
           .replace('__DATA__', json.dumps(data, ensure_ascii=False))
           .replace('__PRESET__', preset))
    open(os.path.join(workdir, script_name), 'w', encoding='utf-8', newline='').write(script_src)
    out = os.path.join(workdir, 'snap.html')
    profile = os.path.join(workdir, 'cp')
    subprocess.run([chrome, '--headless=new', '--disable-gpu', '--no-sandbox',
                    '--user-data-dir=' + profile, '--virtual-time-budget=60000',
                    '--dump-dom', 'file:///' + page.replace('\\', '/')],
                   stdout=open(out, 'wb'), stderr=subprocess.DEVNULL)
    s = open(out, encoding='utf-8', errors='replace').read()
    m = re.search(r'<pre[^>]*id="?__SNAP__"?[^>]*>(.*?)</pre>', s, re.S)
    if not m: return None
    return json.loads(html.unescape(m.group(1)))

SCENARIOS = [
    {
        'key': 'std',
        'label': '标准：3 正（派系伤害）+ 1 负',
        'data': {
            'weapon': 'Pura-manticon',
            'pos': [
                {'name': 'Damage to Infested', 'wm': 'Damage to Infested', 'value': 1.56,  'mult': True},
                {'name': 'Damage to Corpus',   'wm': 'Damage to Corpus',   'value': 1.52,  'mult': True},
                {'name': 'Damage to Grineer',  'wm': 'Damage to Grineer',  'value': 1.49,  'mult': True},
            ],
            'neg': [{'name': 'Execution Damage', 'wm': 'Execution Damage', 'value': -103.60, 'mult': False}],
        },
        'preset': '',
    },
    {
        'key': 'swap',
        'label': '换词条：第 1 行先挂着别的词条',
        'data': SCENARIOS[0]['data'] if False else {
            'weapon': 'Pura-manticon',
            'pos': [
                {'name': 'Damage to Infested', 'wm': 'Damage to Infested', 'value': 1.56,  'mult': True},
                {'name': 'Damage to Corpus',   'wm': 'Damage to Corpus',   'value': 1.52,  'mult': True},
                {'name': 'Damage to Grineer',  'wm': 'Damage to Grineer',  'value': 1.49,  'mult': True},
            ],
            'neg': [{'name': 'Execution Damage', 'wm': 'Execution Damage', 'value': -103.60, 'mult': False}],
        },
        'preset': """
window.addEventListener('DOMContentLoaded', function(){
  setTimeout(function(){
    var r0 = window.__WM_STATE__.rows[0];
    r0.sk.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    setTimeout(function(){
      var li = [].slice.call(r0.sk.querySelectorAll('li'))
        .filter(function(x){ return x.dataset.name === 'Critical Damage'; })[0];
      if (li) li.click();
    }, 50);
  }, 0);
});
""",
    },
    {
        'key': 'abs',
        'label': '绝对值词条：8.2 / 1.96（原样填）',
        'data': {
            'weapon': 'Pura-manticon',
            'pos': [
                {'name': 'Combo Duration', 'wm': 'Combo Duration', 'value': 8.2,  'mult': False},
                {'name': 'Range',          'wm': 'Range',          'value': 1.96, 'mult': False},
            ],
            'neg': [{'name': 'Execution Damage', 'wm': 'Execution Damage', 'value': -103.60, 'mult': False}],
        },
        'preset': '',
    },
]

def main():
    chrome = find_chrome()
    if not chrome:
        print('✗ 没找到 Chrome / Edge'); return 1
    work = tempfile.mkdtemp(prefix='wmab_')
    total_pass = 0
    total_all = 0
    try:
        shutil.copy(os.path.join(HERE, 'wm-sim.js'), os.path.join(work, 'wm-sim.js'))
        old_src = make_old(FILL)
        new_src = open(FILL, encoding='utf-8', newline='').read()

        for sc in SCENARIOS:
            key = sc['key']
            d = os.path.join(work, key)
            os.makedirs(d, exist_ok=True)
            shutil.copy(os.path.join(HERE, 'wm-sim.js'), os.path.join(d, 'wm-sim.js'))
            old = run(chrome, d, 'old.js', old_src, sc['data'], sc['preset'])
            new = run(chrome, d, 'new.js', new_src, sc['data'], sc['preset'])
            if not old or not new:
                print('✗ 场景「%s」采集失败' % sc['label']); total_all += 1; continue

            op, np_ = old['preview'], new['preview']
            on = [p['name'] for p in op]; nn = [p['name'] for p in np_]
            def g(pv, n):
                return next((p['val'] for p in pv if p['name'] == n), '（缺）')
            exp = sc['data']
            exp_pos = [x['wm'] for x in exp['pos']]
            exp_neg = [x['wm'] for x in exp['neg']]

            checks = [
                ('预览条数 = %d' % (len(exp_pos) + len(exp_neg)), len(op), len(np_),
                 len(np_) == len(exp_pos) + len(exp_neg)),
                ('同名重复条数 = 0', len(on) - len(set(on)), len(nn) - len(set(nn)),
                 len(nn) == len(set(nn))),
                ('空值条目数 = 0', sum(1 for p in op if not p['val']),
                 sum(1 for p in np_ if not p['val']),
                 sum(1 for p in np_ if not p['val']) == 0),
                ('正面词条齐全', '缺', '缺',
                 all(any(n == e for n in nn) for e in exp_pos)),
                ('负面词条齐全', '缺', '缺',
                 all(any(n == e for n in nn) for e in exp_neg)),
                ('同格多点次数 = 0', sum(1 for c in old.get('pickCounts', {}).values() if c > 1),
                 sum(1 for c in new.get('pickCounts', {}).values() if c > 1),
                 sum(1 for c in new.get('pickCounts', {}).values() if c > 1) == 0),
            ]
            # 数值逐项核对（按数据里的 value 找对应词条）
            for x in exp['pos'] + exp['neg']:
                want = ('%g' % x['value'])
                checks.append(('数值 %s = %s' % (x['wm'], want), g(op, x['wm']), g(np_, x['wm']),
                               want in g(np_, x['wm']).replace('-', '-')))
            # 「+ Add」：只在需要补行时才有意义
            if len(exp_pos) > 2:
                checks.append(('「+ Add」被认出', old.get('addClicks', 0), new.get('addClicks', 0),
                               new.get('addClicks', 0) > old.get('addClicks', 0)))
            # 换词条场景：旧的错词条不该留在预览里
            if key == 'swap':
                checks.append(('错词条已清掉', 'Critical Damage' in nn, 'Critical Damage' in nn,
                               'Critical Damage' not in nn))

            print('╔═ 场景「%s」%s' % (sc['label'], '═' * max(0, 40 - len(sc['label']))))
            print('  对照预览：' + ' | '.join((p['val'] or '（空）') + ' ' + p['name'] for p in op))
            print('  新版预览：' + ' | '.join((p['val'] or '（空）') + ' ' + p['name'] for p in np_))
            print(f"  {'':4}{'指标':<34}{'对照':<24}{'现行':<24}")
            print('  ' + '─' * 84)
            for name, o, n, ok in checks:
                print(f"  {'✅' if ok else '❌':<4}{name:<34}{str(o):<24}{str(n):<24}")
                total_all += 1
                total_pass += 1 if ok else 0
            print()
        print('═' * 50)
        print('总计通过 %d / %d' % (total_pass, total_all))
        return 0 if total_pass == total_all else 1
    finally:
        shutil.rmtree(work, ignore_errors=True)

if __name__ == '__main__':
    sys.exit(main())
