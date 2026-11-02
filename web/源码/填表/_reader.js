  window.__WM_CORE_SRC__ = (function () {
    var el = document.getElementById('wmCoreB64');
    if (!el) return '';
    try {
      var bin = atob(el.getAttribute('data-b64') || '');
      var arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return new TextDecoder('utf-8').decode(arr);
    } catch (e) {
      console.error('[WM脚本] base64 解码失败', e);
      return '';
    }
  })();
