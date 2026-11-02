  (function () {
    var root = document.getElementById('langFloat');
    if (!root) return;
    var tg = root.querySelector('.lang-float-toggle'), p = root.querySelector('.lang-float-panel');
    if (!tg || !p) return;
    function open(v) { p.hidden = !v; tg.setAttribute('aria-expanded', v ? 'true' : 'false'); }
    tg.addEventListener('click', function (e) { e.stopPropagation(); open(p.hidden); });
    var bs = p.querySelectorAll('button[data-a="lang"]');
    for (var i = 0; i < bs.length; i++)
      bs[i].addEventListener('click', function () { open(false); });
    document.addEventListener('click', function () { open(false); });
  })();
