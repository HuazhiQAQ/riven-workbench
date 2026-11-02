const TEMPLATE_W = 632, TEMPLATE_H = 800;
function purpleScan(img) {
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  if (!W || !H) throw new Error('image not loaded');
  const scan = document.createElement('canvas');
  scan.width = W; scan.height = H;
  const scx = scan.getContext('2d', { willReadFrequently: true });
  scx.drawImage(img, 0, 0, W, H);
  const sd = scx.getImageData(0, 0, W, H).data;
  const step = Math.max(1, Math.floor(Math.min(W, H) / 200));
  const pts = [];
  let minX = W, minY = H, maxX = 0, maxY = 0, cnt = 0;
  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      const i = (y * W + x) * 4;
      const r = sd[i], g = sd[i + 1], b = sd[i + 2];
      if (r > 90 && b > 90 && g < r - 25 && g < b - 25 && (r + b) > 180) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        cnt++;
        if (pts.length < 4000) pts.push([x, y]);
      }
    }
  }
  return { pts, minX, minY, maxX, maxY, cnt, W, H };
}
function convexHull(pts) {
  if (pts.length < 3) return pts.slice();
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}
function minAreaRect(hull) {
  if (!hull || hull.length < 3) return null;
  let best = null;
  const n = hull.length;
  for (let i = 0; i < n; i++) {
    const p = hull[i], q = hull[(i + 1) % n];
    const dx = q[0] - p[0], dy = q[1] - p[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const ux = dx / len, uy = dy / len;
    const vx = -uy, vy = ux;
    let minU = 1e9, maxU = -1e9, minV = 1e9, maxV = -1e9;
    for (const r of hull) {
      const u = r[0] * ux + r[1] * uy, v = r[0] * vx + r[1] * vy;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const area = (maxU - minU) * (maxV - minV);
    if (!best || area < best.area) best = { area, ux, uy, vx, vy, minU, maxU, minV, maxV };
  }
  if (!best) return null;
  const { ux, uy, vx, vy, minU, maxU, minV, maxV } = best;
  const cu = (minU + maxU) / 2, cv2 = (minV + maxV) / 2;
  const cx = cu * ux + cv2 * vx;
  const cy = cu * uy + cv2 * vy;
  let w = maxU - minU, h = maxV - minV;
  let angle = Math.atan2(uy, ux);
  const norm = a => { while (a > Math.PI / 2) a -= Math.PI; while (a <= -Math.PI / 2) a += Math.PI; return a; };
  angle = norm(angle);
  if (w > h) { const t = w; w = h; h = t; angle = norm(angle + Math.PI / 2); }
  return { cx, cy, w, h, angle, area: best.area };
}
function warpRect(img, r) {
  const cv = document.createElement('canvas');
  cv.width = TEMPLATE_W; cv.height = TEMPLATE_H;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.fillStyle = '#000'; cx.fillRect(0, 0, TEMPLATE_W, TEMPLATE_H);
  cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
  cx.save();
  cx.translate(TEMPLATE_W / 2, TEMPLATE_H / 2);
  cx.scale(TEMPLATE_W / r.w, TEMPLATE_H / r.h);
  cx.rotate(-r.angle);
  cx.translate(-r.cx, -r.cy);
  cx.drawImage(img, 0, 0);
  cx.restore();
  return cv;
}
function fitAxis(img, sx, sy, sw, sh) {
  const cv = document.createElement('canvas');
  cv.width = TEMPLATE_W; cv.height = TEMPLATE_H;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.fillStyle = '#000'; cx.fillRect(0, 0, TEMPLATE_W, TEMPLATE_H);
  cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
  const s = Math.min(TEMPLATE_W / sw, TEMPLATE_H / sh);
  const dw = Math.round(sw * s), dh = Math.round(sh * s);
  const dx = Math.round((TEMPLATE_W - dw) / 2), dy = Math.round((TEMPLATE_H - dh) / 2);
  cx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  return cv;
}
function rectCorners(r) {
  const dx1 = (r.w / 2) * Math.cos(r.angle), dy1 = -(r.w / 2) * Math.sin(r.angle);
  const dx2 = (r.h / 2) * Math.sin(r.angle), dy2 = (r.h / 2) * Math.cos(r.angle);
  return [
    [r.cx - dx1 - dx2, r.cy - dy1 - dy2],
    [r.cx + dx1 - dx2, r.cy + dy1 - dy2],
    [r.cx + dx1 + dx2, r.cy + dy1 + dy2],
    [r.cx - dx1 + dx2, r.cy - dy1 + dy2]
  ];
}
function fitToTemplate(img, forceRect) {
  if (forceRect) {
    const fr = {
      srcW: img.naturalWidth || img.width, srcH: img.naturalHeight || img.height,
      ar: Math.max(1, forceRect[2] - forceRect[0]) / Math.max(1, forceRect[3] - forceRect[1]),
      scanPts: -1, mode: 'textbox', deg: 0, box: [0, 0, TEMPLATE_W, TEMPLATE_H],
      quad: [[forceRect[0], forceRect[1]], [forceRect[2], forceRect[1]],
             [forceRect[2], forceRect[3]], [forceRect[0], forceRect[3]]]
    };
    const outR = fitAxis(img, forceRect[0], forceRect[1],
      Math.max(1, forceRect[2] - forceRect[0]), Math.max(1, forceRect[3] - forceRect[1]));
    outR.__fit = fr;
    return outR;
  }
  const s = purpleScan(img);
  const info = {
    srcW: img.naturalWidth || img.width,
    srcH: img.naturalHeight || img.height,
    scanPts: s.cnt
  };
  let out;
  if (s.cnt >= 20) {
    const pad = Math.round(Math.max(s.maxX - s.minX, s.maxY - s.minY) * 0.04);
    const sx = Math.max(0, s.minX - pad), sy = Math.max(0, s.minY - pad);
    const sw = Math.min(s.W - sx, (s.maxX - s.minX) + pad * 2);
    const sh = Math.min(s.H - sy, (s.maxY - s.minY) + pad * 2);
    const r = minAreaRect(convexHull(s.pts));
    const deg = r ? Math.abs(r.angle * 180 / Math.PI) : 0;
    if (r && r.w > 4 && r.h > 4 && deg > 1 && deg < 45) {
      out = warpRect(img, r);
      out.__straighten = r.angle;
      info.mode = 'rot';
      info.deg = r.angle * 180 / Math.PI;
      info.ar = r.w / Math.max(1, r.h);
      info.quad = rectCorners(r);
    } else {
      out = fitAxis(img, sx, sy, sw, sh);
      info.mode = 'axis';
      info.deg = 0;
      info.ar = sw / Math.max(1, sh);
      info.quad = [[sx, sy], [sx + sw, sy], [sx + sw, sy + sh], [sx, sy + sh]];
    }
  } else {
    out = fitAxis(img, 0, 0, s.W, s.H);
    info.mode = 'full';
    info.deg = 0;
    info.ar = s.W / Math.max(1, s.H);
    info.quad = null;
  }
  info.box = [0, 0, TEMPLATE_W, TEMPLATE_H];
  out.__fit = info;
  return out;
}
function dropSmallBlobs(data, w, h, minSize, fg) {
  if (fg === undefined) fg = 255;
  const bg = 255 - fg;
  const visited = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  for (let p = 0; p < w * h; p++) {
    if (visited[p] || data[p * 4] !== fg) continue;
    let sp = 0; stack[sp++] = p; visited[p] = 1;
    const comp = [];
    while (sp > 0) {
      const q = stack[--sp];
      if (comp.length < minSize) comp.push(q);
      const x = q % w, y = (q / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const r = ny * w + nx;
          if (visited[r] || data[r * 4] !== fg) continue;
          visited[r] = 1; stack[sp++] = r;
        }
      }
    }
    if (comp.length < minSize) {
      for (let k = 0; k < comp.length; k++) {
        const q = comp[k];
        data[q * 4] = data[q * 4 + 1] = data[q * 4 + 2] = bg;
      }
    }
  }
}
function dropSmallBlobsCanvas(cv, fg) {
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const d = cx.getImageData(0, 0, cv.width, cv.height);
  dropSmallBlobs(d.data, cv.width, cv.height,
    Math.max(6, Math.round(cv.height * 0.012)), fg);
  cx.putImageData(d, 0, 0);
  return cv;
}
function lumaMask(cv, thresh) {
  if (thresh === undefined) thresh = 90;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const w = cv.width, h = cv.height;
  const d = cx.getImageData(0, 0, w, h).data;
  const out = cx.createImageData(w, h);
  const n = w * h;
  const gray = new Float32Array(n);
  let gmin = 255, gmax = 0;
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    gray[p] = g;
    if (g < gmin) gmin = g;
    if (g > gmax) gmax = g;
  }
  const range = gmax - gmin;
  const stretch = range > 1 && range < 110;
  const k = stretch ? 255 / range : 1;
  for (let p = 0; p < n; p++) {
    const g = stretch ? (gray[p] - gmin) * k : gray[p];
    const v = g > thresh ? 255 : 0;
    const i = p * 4;
    out.data[i] = out.data[i + 1] = out.data[i + 2] = v;
    out.data[i + 3] = 255;
  }
  const mc = document.createElement('canvas'); mc.width = w; mc.height = h;
  mc.getContext('2d', { willReadFrequently: true }).putImageData(out, 0, 0);
  dropSmallBlobsCanvas(mc, 255);
  return mc;
}
function scaleCanvas(cv, s) {
  const w = Math.round(cv.width * s), h = Math.round(cv.height * s);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const cc = c.getContext('2d', { willReadFrequently: true });
  cc.imageSmoothingEnabled = true; cc.imageSmoothingQuality = 'high';
  cc.drawImage(cv, 0, 0, w, h);
  return c;
}
function inkPolarity(mk) {
  const cx = mk.getContext('2d', { willReadFrequently: true });
  const w = mk.width, h = mk.height;
  const d = cx.getImageData(0, 0, w, h).data;
  const n = w * h;
  const step = Math.max(1, Math.floor(n / 40000));
  let wht = 0, cnt = 0;
  for (let p = 0; p < n; p += step) { if (d[p * 4] > 127) wht++; cnt++; }
  return (wht / Math.max(1, cnt)) > 0.5 ? 0 : 255;
}
function inkBlocks(cv, thresh) {
  const W = cv.width, H = cv.height;
  if (!W || !H) return [];
  const mk = lumaMask(cv, thresh === undefined ? 90 : thresh);
  const mcx = mk.getContext('2d', { willReadFrequently: true });
  const d = mcx.getImageData(0, 0, W, H).data;
  const fg = inkPolarity(mk);
  if (fg === 0) dropSmallBlobs(d, W, H, Math.max(6, Math.round(H * 0.012)), 0);
  const visited = new Uint8Array(W * H);
  const stack = new Int32Array(W * H);
  const out = [];
  for (let p = 0; p < W * H; p++) {
    if (visited[p] || d[p * 4] !== fg) continue;
    let sp = 0; stack[sp++] = p; visited[p] = 1;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
    while (sp > 0) {
      const q = stack[--sp]; n++;
      const x = q % W, y = (q / W) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= W) continue;
          const r = ny * W + nx;
          if (visited[r] || d[r * 4] !== fg) continue;
          visited[r] = 1; stack[sp++] = r;
        }
      }
    }
    out.push({
      x0: x0, y0: y0, x1: x1, y1: y1, w: x1 - x0 + 1, h: y1 - y0 + 1,
      cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, n: n
    });
  }
  const minN = Math.max(4, Math.round(H * 0.0009));
  const minH = Math.max(3, Math.round(H * 0.004));
  const maxW = W * 0.92, maxH = H * 0.30;
  return out.filter(b => b.n >= minN && b.h >= minH && b.w <= maxW && b.h <= maxH);
}
function textFrameOf(boxes) {
  if (!boxes || !boxes.length) return null;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const b of boxes) {
    if (b.x0 < x0) x0 = b.x0;
    if (b.y0 < y0) y0 = b.y0;
    if (b.x1 > x1) x1 = b.x1;
    if (b.y1 > y1) y1 = b.y1;
  }
  return { x0: x0, y0: y0, x1: x1, y1: y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
function textTiltOf(boxes) {
  if (!boxes || boxes.length < 6) return 0;
  const bs = boxes.slice().sort(function (a, b) { return a.cy - b.cy; });
  let hs = 0;
  for (const b of bs) hs += b.h;
  const avgH = hs / bs.length;
  const tol = Math.max(3, avgH * 0.9);
  const rows = [];
  let cur = [bs[0]];
  for (let i = 1; i < bs.length; i++) {
    if (bs[i].cy - cur[cur.length - 1].cy <= tol) cur.push(bs[i]);
    else { rows.push(cur); cur = [bs[i]]; }
  }
  rows.push(cur);
  const angs = [];
  for (const r of rows) {
    if (r.length < 3) continue;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    const n = r.length;
    for (const b of r) { sx += b.cx; sy += b.cy; sxx += b.cx * b.cx; sxy += b.cx * b.cy; }
    const den = n * sxx - sx * sx;
    if (Math.abs(den) < 1e-6) continue;
    const a = Math.atan((n * sxy - sx * sy) / den);
    if (Math.abs(a) <= Math.PI / 4) angs.push(a);
  }
  if (!angs.length) return 0;
  angs.sort(function (a, b) { return a - b; });
  return angs[(angs.length / 2) | 0];
}
function pointInQuad(x, y, quad) {
  if (!quad || quad.length < 3) return false;
  let inside = false;
  for (let i = 0, j = quad.length - 1; i < quad.length; j = i++) {
    const xi = quad[i][0], yi = quad[i][1], xj = quad[j][0], yj = quad[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function textCoverage(quad, boxes) {
  if (!quad || !boxes || !boxes.length) return -1;
  let hit = 0;
  for (const b of boxes) if (pointInQuad(b.cx, b.cy, quad)) hit++;
  return hit / boxes.length;
}
function fitByText(img, boxes) {
  const fr = textFrameOf(boxes);
  if (!fr) return null;
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const tilt = textTiltOf(boxes);
  const deg = Math.abs(tilt * 180 / Math.PI);
  if (deg > 1 && deg < 45) {
    const c = warpRect(img, {
      cx: (fr.x0 + fr.x1) / 2, cy: (fr.y0 + fr.y1) / 2,
      w: fr.w * 1.08, h: fr.h * 1.08, angle: tilt
    });
    c.__fit = {
      mode: 'text-rot', deg: tilt * 180 / Math.PI, quad: null,
      srcW: W, srcH: H, textFrame: fr, boxes: boxes.length
    };
    return c;
  }
  const padX = Math.round(fr.w * 0.08), padY = Math.round(fr.h * 0.06);
  const sx = Math.max(0, fr.x0 - padX), sy = Math.max(0, fr.y0 - padY);
  const sw = Math.min(W - sx, fr.w + padX * 2), sh = Math.min(H - sy, fr.h + padY * 2);
  if (sw < 20 || sh < 20) return null;
  const c = fitAxis(img, sx, sy, sw, sh);
  c.__fit = {
    mode: 'text-axis', deg: 0, srcW: W, srcH: H, textFrame: fr, boxes: boxes.length,
    quad: [[sx, sy], [sx + sw, sy], [sx + sw, sy + sh], [sx, sy + sh]]
  };
  return c;
}
function enhanceForOCR(cv) {
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const w = cv.width, h = cv.height;
  const d = cx.getImageData(0, 0, w, h).data;
  const n = w * h;
  const hist = new Uint32Array(256);
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const g = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0;
    hist[g < 0 ? 0 : (g > 255 ? 255 : g)]++;
  }
  const cut = Math.max(1, Math.round(n * 0.02));
  let acc = 0, lo = 0, hi = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= cut) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= cut) { hi = v; break; } }
  if (hi - lo < 12) { lo = 0; hi = 255; }
  const k = Math.min(3.0, 245 / Math.max(1, hi - lo));
  const out = cx.createImageData(w, h);
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    for (let c = 0; c < 3; c++) {
      let v = (d[i + c] - lo) * k;
      v = v < 0 ? 0 : (v > 255 ? 255 : v);
      out.data[i + c] = v;
    }
    out.data[i + 3] = 255;
  }
  const mc = document.createElement('canvas'); mc.width = w; mc.height = h;
  mc.getContext('2d', { willReadFrequently: true }).putImageData(out, 0, 0);
  return mc;
}
function textBlockTop(rows, H) {
  if (!rows || !rows.length || !H) return Math.round(H * 0.45);
  const rs = rows.filter(function (r) { return r.yc < H * 0.80; })
                 .sort(function (a, b) { return a.yc - b.yc; });
  if (!rs.length) return Math.round(H * 0.45);
  const pitch = H * 0.05;
  let top = rs[rs.length - 1].y0;
  for (let i = rs.length - 1; i > 0; i--) {
    if (rs[i].yc - rs[i - 1].yc > pitch * 1.6) break;   // 断档 上面是插画区/标题
    top = rs[i - 1].y0;
  }
  return Math.max(0, Math.round(top - H * 0.02));
}
