function csLumaProfile(img) {
  var W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  var c = document.createElement('canvas');
  c.width = W; c.height = H;
  var cx = c.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, W, H);
  var d = cx.getImageData(0, 0, W, H).data;
  var y0 = Math.floor(H * 0.15), y1 = Math.floor(H * 0.90);
  var prof = new Float64Array(W);
  for (var x = 0; x < W; x++) {
    var s = 0, n = 0;
    for (var y = y0; y < y1; y += 2) {
      var i = (y * W + x) * 4;
      s += (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
      n++;
    }
    prof[x] = s / n;
  }
  return { prof: prof, W: W, H: H };
}
function csCrop(img, box) {
  var c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(box.w));
  c.height = Math.max(1, Math.round(box.h));
  var cx = c.getContext('2d');
  cx.drawImage(img, Math.round(box.x), Math.round(box.y), Math.round(box.w), Math.round(box.h),
               0, 0, c.width, c.height);
  return c;
}
function csSplit(img) {
  var p = csLumaProfile(img), W = p.W, H = p.H, prof = p.prof;
  var sm = new Float64Array(W), rad = 2;
  for (var x = 0; x < W; x++) {
    var s = 0, n = 0;
    for (var k = -rad; k <= rad; k++) {
      var xx = x + k;
      if (xx < 0 || xx >= W) continue;
      s += prof[xx]; n++;
    }
    sm[x] = s / n;
  }
  var a = Math.round(W * 0.30), b = Math.round(W * 0.72);
  var mi = a, mv = 1e9, mx = 0;
  for (var q = a; q < b; q++) {
    if (sm[q] < mv) { mv = sm[q]; mi = q; }
    if (sm[q] > mx) mx = sm[q];
  }
  var depth = mx > 1 ? (mx - mv) / mx : 0;
  var splitX = depth >= 0.15 ? mi : Math.round(W / 2);
  var lb = { x: 0, y: 0, w: splitX, h: H };
  var rb = { x: splitX, y: 0, w: W - splitX, h: H };
  return {
    splitX: splitX, mode: depth >= 0.15 ? 'valley' : 'mid', depth: +depth.toFixed(3), lumaMin: +mv.toFixed(1),
    left: { box: lb, canvas: csCrop(img, lb) },
    right: { box: rb, canvas: csCrop(img, rb) }
  };
}
