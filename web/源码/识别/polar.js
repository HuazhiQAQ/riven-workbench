var POLAR_TYPES = {
  naramon: { key: 'naramon', name: 'Naramon', desc: '横条 / 一槽（横槽）' },
  vazarin: { key: 'vazarin', name: 'Vazarin', desc: '倒三角 D / 三角槽（盾槽）' },
  madurai: { key: 'madurai', name: 'Madurai', desc: 'V 形 / V槽（R槽）' },
  unknown: { key: 'unknown', name: '无法判定', desc: '极性区域未识别到明显图标' }
};
var POLAR_ROI_PCT = { x0: 0.728, x1: 0.917, y0: 0.065, y1: 0.157 };
var POLAR_IOU_THRESHOLD = 0.35;
function polarCrop(src, x0, y0, w, h) {
  var c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  var cx = c.getContext('2d', { willReadFrequently: true });
  cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
  cx.drawImage(src, Math.round(x0), Math.round(y0), Math.round(w), Math.round(h), 0, 0, c.width, c.height);
  return c;
}
function polarGlyphMask(cv) {
  var cx = cv.getContext('2d', { willReadFrequently: true });
  var w = cv.width, h = cv.height;
  var d = cx.getImageData(0, 0, w, h).data;
  var mask = new Uint8Array(w * h);
  for (var p = 0; p < w * h; p++) {
    var i = p * 4;
    if (d[i + 3] < 40) continue;                       // 透明背景（参考图标 PNG）
    var r = d[i], g = d[i + 1], b = d[i + 2];
    var lum = 0.299 * r + 0.587 * g + 0.114 * b;
    mask[p] = (lum > 100 && (r + g + b) < 745) ? 255 : 0;
  }
  return { data: mask, w: w, h: h };
}
function polarForegroundMask(cv) {
  var cx = cv.getContext('2d', { willReadFrequently: true });
  var w = cv.width, h = cv.height;
  var d = cx.getImageData(0, 0, w, h).data;
  var mask = new Uint8Array(w * h);
  for (var p = 0; p < w * h; p++) {
    var i = p * 4;
    if (d[i + 3] < 40) continue;
    var r = d[i], g = d[i + 1], b = d[i + 2];
    var lum = 0.299 * r + 0.587 * g + 0.114 * b;
    var purpleish = (b >= g - 10 && r > 60 && b > 80);
    var bright = (lum > 110 && (r + g + b) < 730);
    mask[p] = (purpleish && bright) ? 255 : 0;
  }
  return { data: mask, w: w, h: h };
}
function polarComponents(mask) {
  var W = mask.w, H = mask.h;
  var visited = new Uint8Array(W * H);
  var stack = new Int32Array(W * H);
  var comps = [];
  for (var p = 0; p < W * H; p++) {
    if (visited[p] || mask.data[p] !== 255) continue;
    var sp = 0; stack[sp++] = p; visited[p] = 1;
    var n = 0, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    while (sp > 0) {
      var q = stack[--sp]; n++;
      var x = q % W, y = (q / W) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (var dy = -1; dy <= 1; dy++) {
        var ny = y + dy; if (ny < 0 || ny >= H) continue;
        for (var dx = -1; dx <= 1; dx++) {
          var nx = x + dx; if (nx < 0 || nx >= W) continue;
          var r = ny * W + nx;
          if (!visited[r] && mask.data[r] === 255) { visited[r] = 1; stack[sp++] = r; }
        }
      }
    }
    comps.push({ n: n, x0: x0, y0: y0, x1: x1, y1: y1, w: x1 - x0 + 1, h: y1 - y0 + 1, cx: (x0 + x1) / 2 });
  }
  return comps;
}
function polarIsolateIcon(templated, roi) {
  var crop = polarCrop(templated, roi.x0, roi.y0, roi.w, roi.h);
  var m = polarGlyphMask(crop);
  var W = m.w, H = m.h;
  var comps = polarComponents(m);
  var zx0 = Math.round(W * 0.50);                  // 右带起点（图标在「18」右侧）
  var maxW = roi.w * 0.55, maxH = roi.h * 0.92;
  var buildMask = function (x0, y0, x1, y1) {
    var bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    var mask = new Uint8Array(bw * bh);
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++)
      if (m.data[y * W + x] === 255) mask[(y - y0) * bw + (x - x0)] = 1;
    return { mask: mask, bw: bw, bh: bh, x0: x0, y0: y0, x1: x1, y1: y1 };
  };
  var pack = function (g) {
    return { mask: g.mask, bw: g.bw, bh: g.bh,
             box: { x0: roi.x0 + g.x0, y0: roi.y0 + g.y0, w: g.x1 - g.x0 + 1, h: g.y1 - g.y0 + 1 } };
  };
  var ey0 = Math.round(H * 0.15), ey1 = Math.round(H * 0.85), bigN = 0;
  for (var ci = 0; ci < comps.length; ci++) {
    var c = comps[ci];
    if (c.x1 < zx0 + 2 && c.n >= 15 && c.n > bigN) { bigN = c.n; ey0 = c.y0; ey1 = c.y1; }
  }
  var best = null, bestN = 0;
  for (var cj = 0; cj < comps.length; cj++) {
    var cc = comps[cj];
    var cx = (cc.x0 + cc.x1) / 2;
    if (cx < zx0 * 0.85) continue;                              // 必须偏右
    var ov = Math.min(cc.y1, ey1) - Math.max(cc.y0, ey0);
    if (ov < 0.5 * (cc.y1 - cc.y0 + 1)) continue;               // 必须与 18 同高（排除上/下方画框）
    var n = 0, bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
    for (var y = cc.y0; y <= cc.y1; y++)
      for (var x = Math.max(cc.x0, zx0); x <= cc.x1; x++)
        if (m.data[y * W + x] === 255) { n++; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
    if (n < 12) continue;
    var w = bx1 - bx0 + 1, h = by1 - by0 + 1;
    if (w < 4 || h < 4) continue;
    if (w > maxW || h > maxH) continue;
    if (n / (w * h) < 0.10) continue;
    if (n > bestN) { bestN = n; best = { x0: bx0, y0: by0, x1: bx1, y1: by1 }; }
  }
  if (best) return pack(buildMask(best.x0, best.y0, best.x1, best.y1));
  var bandPix = function (xa) {
    var n2 = 0, qx0 = 1e9, qy0 = 1e9, qx1 = -1e9, qy1 = -1e9;
    for (var yy = 0; yy < H; yy++) for (var xx = xa; xx < W; xx++)
      if (m.data[yy * W + xx] === 255) { n2++; if (xx < qx0) qx0 = xx; if (xx > qx1) qx1 = xx; if (yy < qy0) qy0 = yy; if (yy > qy1) qy1 = yy; }
    return n2 >= 8 ? { x0: qx0, y0: qy0, x1: qx1, y1: qy1 } : null;
  };
  var fb = bandPix(zx0) || bandPix(0);
  if (!fb) return pack(buildMask(0, 0, 0, 0));
  return pack(buildMask(fb.x0, fb.y0, fb.x1, fb.y1));
}
function polarAutoLocate(templated) {
  var W = templated.width, H = templated.height;
  var sx0 = Math.round(W * 0.48), sx1 = Math.round(W * 0.99);
  var sy0 = 0, sy1 = Math.round(H * 0.24);
  var scan = polarCrop(templated, sx0, sy0, sx1 - sx0, sy1 - sy0);
  var mask = polarForegroundMask(scan);
  var comps = polarComponents(mask).filter(function (c) {
    return c.n >= 25 && c.w < (sx1 - sx0) && c.h < (sy1 - sy0);
  });
  if (!comps.length) return null;
  var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  comps.forEach(function (c) {
    x0 = Math.min(x0, sx0 + c.x0); y0 = Math.min(y0, sy0 + c.y0);
    x1 = Math.max(x1, sx0 + c.x1); y1 = Math.max(y1, sy0 + c.y1);
  });
  var pad = 6;
  return {
    x0: Math.max(0, x0 - pad),
    y0: Math.max(0, y0 - pad),
    w: Math.min(W, (x1 - x0) + pad * 2),
    h: Math.min(H, (y1 - y0) + pad * 2)
  };
}
function polarStretch(src, sbw, sbh, dbw, dbh) {
  var out = new Uint8Array(dbw * dbh);
  for (var y = 0; y < dbh; y++) {
    var sy = Math.min(sbh - 1, Math.round(y / dbh * sbh));
    for (var x = 0; x < dbw; x++) {
      var sx = Math.min(sbw - 1, Math.round(x / dbw * sbw));
      out[y * dbw + x] = src[sy * sbw + sx];
    }
  }
  return out;
}
function polarIoU(a, b) {
  var inter = 0, uni = 0;
  for (var i = 0; i < a.length; i++) { var x = a[i], y = b[i]; if (x || y) uni++; if (x && y) inter++; }
  return uni ? inter / uni : 0;
}
function polarMaskCount(g) {
  var n = 0;
  for (var i = 0; i < g.mask.length; i++) if (g.mask[i]) n++;
  return n;
}
function polarClassify(cand, TPL) {
  if (!TPL) return { type: 'naramon', ious: {}, bestIoU: 0, lowConf: true, why: '标准图标模板未载入，以下取默认值' };
  var ious = {}, best = null, bv = -1;
  for (var k in TPL) if (Object.prototype.hasOwnProperty.call(TPL, k)) {
    var t = TPL[k];
    var sm = polarStretch(t.mask, t.bw, t.bh, cand.bw, cand.bh);   // 模板按候选形变拉伸
    var v = polarIoU(sm, cand.mask);
    ious[k] = v; if (v > bv) { bv = v; best = k; }
  }
  if (best == null) best = 'naramon';              // 理论上不会（TPL 就绪必有 3 键）
  var lowConf = bv < POLAR_IOU_THRESHOLD;
  return { type: best, ious: ious, bestIoU: bv, lowConf: lowConf };
}
var __polarTPL = null;          // { naramon:{mask,bw,bh}, ... } 就绪后的模板
var __polarTPLLoading = null;   // 初始化 Promise（并发调用只跑一次）
function polarLoadTemplates() {
  if (__polarTPL) return Promise.resolve(__polarTPL);
  if (__polarTPLLoading) return __polarTPLLoading;
  var refs = (typeof window !== 'undefined') && window.POLAR_REFS;
  if (!refs) return Promise.resolve(null);   // 模板文件没拼进来 极性识别整体跳过
  __polarTPLLoading = Promise.all(Object.keys(refs).map(function (k) {
    return new Promise(function (res) {
      var img = new Image();
      img.onload = function () {
        try {
          var c = document.createElement('canvas');
          c.width = refs[k].w; c.height = refs[k].h;
          c.getContext('2d').drawImage(img, 0, 0);
          var m = polarGlyphMask(c);
          var comps = polarComponents(m);
          if (!comps.length) { res([k, null]); return; }
          comps.sort(function (a, b) { return b.n - a.n; });
          var t = comps[0];
          var bw = t.w, bh = t.h;
          var mask = new Uint8Array(bw * bh);
          for (var y = t.y0; y <= t.y1; y++)
            for (var x = t.x0; x <= t.x1; x++)
              if (m.data[y * m.w + x] === 255) mask[(y - t.y0) * bw + (x - t.x0)] = 1;
          res([k, { mask: mask, bw: bw, bh: bh }]);
        } catch (e) { res([k, null]); }
      };
      img.onerror = function () { res([k, null]); };
      img.src = refs[k].uri;
    });
  })).then(function (arr) {
    var TPL = {};
    for (var i = 0; i < arr.length; i++) if (arr[i][1]) TPL[arr[i][0]] = arr[i][1];
    __polarTPL = Object.keys(TPL).length > 0 ? TPL : null;
    __polarTPLLoading = null;
    return __polarTPL;
  }).catch(function (e) {
    __polarTPLLoading = null;
    console.warn('极性模板载入失败：', e);
    return null;
  });
  return __polarTPLLoading;
}
function polarDetect(templated) {
  return polarLoadTemplates().then(function (TPL) {
    if (!TPL || !templated || !templated.width) return null;
    var TW = templated.width, TH = templated.height;
    var roi = {
      x0: TW * POLAR_ROI_PCT.x0, y0: TH * POLAR_ROI_PCT.y0,
      w: TW * (POLAR_ROI_PCT.x1 - POLAR_ROI_PCT.x0),
      h: TH * (POLAR_ROI_PCT.y1 - POLAR_ROI_PCT.y0)
    };
    if (roi.w <= 0 || roi.h <= 0) return null;
    var cand = polarIsolateIcon(templated, roi);
    var res = polarClassify(cand, TPL);
    var how = '固定徽章区', usedCand = cand;
    if (polarMaskCount(cand) < 12) {
      var tDef = POLAR_TYPES.madurai;
      return {
        pol: tDef.key, name: tDef.name, desc: tDef.desc,
        lowConf: true,
        ious: res.ious || {},
        bestIoU: res.bestIoU != null ? res.bestIoU : 0,
        box: null, how: how,
        why: '徽章区未找到亮色极性图标（可能卡面定位未覆盖该区域），默认输出 R 槽'
      };
    }
    if (res.lowConf) {
      try {
        var big = polarAutoLocate(templated);
        if (big) {
          var cand2 = polarIsolateIcon(templated, big);
          var res2 = polarClassify(cand2, TPL);
          if (res2.bestIoU > res.bestIoU) { res = res2; usedCand = cand2; how = '自动扫描'; }
        }
      } catch (e) { ZKHTML.warn('识别/polar.js:357', e); }
    }
    var t = POLAR_TYPES[res.type] || POLAR_TYPES.naramon;
    return {
      pol: t.key,                       /* 'naramon' | 'vazarin' | 'madurai' */
      name: t.name, desc: t.desc,
      lowConf: !!res.lowConf,
      ious: res.ious || {},
      bestIoU: res.bestIoU != null ? res.bestIoU : 0,
      box: usedCand ? usedCand.box : null,
      how: how,
      why: res.why || ''
    };
  }).catch(function (e) {
    console.warn('极性识别异常（不影响文字识别）：', e);
    return null;
  });
}
try {
  window.PolarOCR = {
    detect: polarDetect,
    templates: polarLoadTemplates,
    TYPES: POLAR_TYPES,
    ROI: POLAR_ROI_PCT
  };
} catch (ePW) { ZKHTML.warn('识别/polar.js:385', ePW); }
