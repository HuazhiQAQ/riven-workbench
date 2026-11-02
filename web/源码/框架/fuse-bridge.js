(function () {
  var P = window.parent;
  if (!P || P === window) return;

  function send(type, data) {
    try { P.postMessage({ __jjfuse: 1, type: type, data: data || {} }, '*'); } catch (e) { ZKHTML.warn('框架/fuse-bridge.js:6', e); }
  }
  function txt(el) {
    return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '';
  }
  function curName() {
    var el = document.querySelector('#c2wrap .wname')
          || document.querySelector('#calc-body .wname')
          || document.querySelector('.wname');
    var s = txt(el);
    return (s && s !== '—') ? s : '';
  }
  function selectWeapon(name) {
    var q = document.getElementById('q1');
    if (!q) return 'no-input';
    q.value = name || '';
    try { q.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) { ZKHTML.warn('框架/fuse-bridge.js:22', e); }
    var c = document.querySelector('#cands1 .cand');
    if (!c) return 'no-candidate';
    c.click();
    try { if (location.hash !== '#open') location.hash = 'open'; } catch (e) { ZKHTML.warn('框架/fuse-bridge.js:26', e); }
    return 'ok';
  }
  function gotoSec(h) {
    try { if (h && location.hash !== '#' + h) location.hash = h; } catch (e) { ZKHTML.warn('框架/fuse-bridge.js:30', e); }
  }

  window.ZKFUSE = {
    version: 1,
    selectWeapon: selectWeapon,
    curName: curName,
    goto: gotoSec,
    send: send
  };

  var last = '';
  setInterval(function () {
    var n = curName();
    if (n && n !== last) { last = n; send('state', { name: n }); }
  }, 1000);

  window.addEventListener('message', function (e) {
    var m = e && e.data;
    if (!m || m.__zkfuse !== 1) return;
    var d = m.data || {};
    if (m.type === 'select') {
      var r = selectWeapon(d.name);
      if (r !== 'ok') {
        setTimeout(function () { r = selectWeapon(d.name); send('select-result', { name: d.name, result: r }); }, 400);
        return;
      }
      send('select-result', { name: d.name, result: r });
    } else if (m.type === 'goto') {
      gotoSec(d.hash);
      send('goto-result', { hash: d.hash });
    } else if (m.type === 'ping') {
      send('pong', { name: curName() });
    }
  });

  setTimeout(function () { send('hello', { v: 1, name: curName() }); }, 400);
})();
