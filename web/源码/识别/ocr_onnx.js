let __ort = null, __detSess = null, __recSess = null;
var __gentle = false;
var __ensurePromise = null;
var __wakeResolve = null;
var __B64_CHUNK = 0x40000;   // 262144 = 4 的倍数（base64 量子），切块必须对齐
function nap(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function ocrApi() { return (typeof window !== 'undefined' && window.__OCR_API) || null; }
function apiRankAffix(nm) {
  var A = ocrApi();
  return (A && typeof A.rankAffix === 'function') ? A.rankAffix(nm) : null;
}
function apiNameRowHit(r) {
  var A = ocrApi();
  try { return (A && typeof A.nameRowHit === 'function') ? A.nameRowHit(r) : 0; } catch (e) { return 0; }
}
function wakeOnnx() {
  __gentle = false;
  if (__wakeResolve) { var r = __wakeResolve; __wakeResolve = null; r(); }
}
function gentleWait(ms) {
  if (!__gentle) return Promise.resolve();
  return new Promise(function (r) {
    __wakeResolve = r;
    setTimeout(function () { if (__wakeResolve === r) { __wakeResolve = null; r(); } }, ms);
  });
}
function idleTick() {
  if (!__gentle) return Promise.resolve();
  return new Promise(function (r) {
    var done = false;
    var fin = function () {
      if (done) return; done = true;
      if (__wakeResolve === fin) __wakeResolve = null;
      r();
    };
    __wakeResolve = fin;
    if (typeof requestIdleCallback === 'function') requestIdleCallback(fin, { timeout: 1500 });
    else setTimeout(fin, 0);
  });
}
async function b64ToU8(b64, gz) {
  if (!__gentle) {
    var u0 = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return gz ? await ortGunzip(u0) : u0;
  }
  var q = b64.length;
  var pad = b64[q - 1] === '=' ? (b64[q - 2] === '=' ? 2 : 1) : 0;
  var out = new Uint8Array(Math.floor(q / 4) * 3 - pad), off = 0, pos = 0;
  while (pos < q) {
    var end = Math.min(pos + __B64_CHUNK, q);
    var seg = atob(b64.slice(pos, end));
    for (var i = 0; i < seg.length; i++) out[off + i] = seg.charCodeAt(i);
    off += seg.length; pos = end;
    if (pos < q) await nap(0);
  }
  return gz ? await ortGunzip(out) : out;
}
async function ortB64Url(b64, type, gz, useBlob) {
  var parts = [], pos = 0, q = b64.length;
  var CH = __gentle ? __B64_CHUNK : q;
  while (pos < q) {
    var end = Math.min(pos + CH, q);
    var seg = atob(b64.slice(pos, end));
    var u = new Uint8Array(seg.length);
    for (var i = 0; i < seg.length; i++) u[i] = seg.charCodeAt(i);
    parts.push(u);
    pos = end;
    if (__gentle && pos < q) await nap(0);
  }
  var u8 = parts[0];
  if (parts.length > 1) {
    var tot = 0;
    for (var k = 0; k < parts.length; k++) tot += parts[k].length;
    u8 = new Uint8Array(tot);
    var off = 0;
    for (var k2 = 0; k2 < parts.length; k2++) { u8.set(parts[k2], off); off += parts[k2].length; }
  }
  if (gz) u8 = await ortGunzip(u8);
  if (useBlob) return URL.createObjectURL(new Blob([u8], { type: type }));
  return 'data:' + type + ';base64,' + ortU8ToB64(u8);
}
async function ortGunzip(u8) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('浏览器不支持 DecompressionStream（无法解压内嵌运行时）');
  }
  var res = new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip')));
  return new Uint8Array(await res.arrayBuffer());
}
function ortU8ToB64(u8) {
  var s = '', CH = 0x8000;
  for (var i = 0; i < u8.length; i += CH) {
    s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  }
  return btoa(s);
}
var __blobModOk = null;
async function ortBlobModuleOK() {
  if (__blobModOk !== null) return __blobModOk;
  try {
    var u = URL.createObjectURL(new Blob(['export default 1;'], { type: 'text/javascript' }));
    await import(u); URL.revokeObjectURL(u); __blobModOk = true;
  } catch (e) { __blobModOk = false; }
  return __blobModOk;
}
async function ortBoot() {
  if (__ort) return __ort;
  var E = (typeof window !== 'undefined') && window.ORT_EMBED;
  if (E && E.mjs) {
    try {
      var useBlob = await ortBlobModuleOK();
      var gz = !!E.gz;
      var mod = await import(await ortB64Url(E.mjs, 'text/javascript', gz, useBlob));
      var wp = {};
      if (E.glue) {
        wp.mjs = await ortB64Url(E.glue, 'text/javascript', gz, useBlob);
      }
      wp.wasm = E.wasm ? await ortB64Url(E.wasm, 'application/wasm', gz, true) : null;
      if (!wp.wasm) throw new Error('内嵌运行时缺 wasm 本体（E.wasm 为空），离线不可用');
      mod.env.wasm.wasmPaths = wp;
      mod.env.wasm.numThreads = 1;
      __ort = mod;
      window.__ortSource = 'embedded';
      window.__ortErr = '';
    } catch (e) {
      __ort = null;
      window.__ortErr = '内嵌运行时启动失败：' + ((e && e.message) || e);
      console.warn('内嵌运行时启动失败：', e);
    }
  }
  if (!__ort) {
    try {
      __ort = await import('./ort/ort.wasm.min.mjs');
      __ort.env.wasm.wasmPaths = './ort/';
      window.__ortSource = 'local';
    } catch (e2a) {
      try {
        __ort = await import('./ort/ort.mjs');
        __ort.env.wasm.wasmPaths = './ort/';
        window.__ortSource = 'local';
      } catch (e2b) { __ort = null; }
    }
  }
  if (!__ort) {
    window.__ortSource = 'missing';
    window.__ortErr = window.__ortErr
      || 'ONNX 运行时缺失：内嵌运行时未能启动，且已禁用外部 CDN 回退（离线版不发任何请求）。';
    throw new Error(window.__ortErr);
  }
  try { __ort.env.wasm.numThreads = 1; }
  catch (e4) { ZKHTML.warn('ortBoot:numThreads', e4); }
  return __ort;
}
try { window.__ortBootTest = ortBoot; window.__onnxSelfTest = onnxEnsure; } catch (e5) { ZKHTML.warn('识别/ocr_onnx.js:212', e5); }
try {
  window.__onnxPreload = function () { return onnxEnsure(true).catch(function () {}); };
  window.__wakeOnnx = wakeOnnx;   // 一传卡就叫醒：后续初始化全速、不再让出
  window.__onnxState = function () {
    return { boot: !!__ort, det: !!__detSess, rec: !!__recSess, gentle: __gentle, pending: !!__ensurePromise };
  };
} catch (e6) { ZKHTML.warn('识别/ocr_onnx.js:223', e6); }
function onnxEnsure(gentle) {
  if (__detSess && __recSess) return Promise.resolve();
  if (!__ensurePromise) {
    __gentle = gentle === true;
    __ensurePromise = onnxEnsureInner();
  }
  return __ensurePromise;
}
async function onnxEnsureInner() {
  try {
    await ortBoot();
    if (__gentle) await idleTick();
    if (__gentle) await gentleWait(250);
    if (!__detSess) {
      const detBuf = await b64ToU8(ONNX_MODELS.det, ONNX_MODELS.gz);
      if (__gentle) await gentleWait(200);
      __detSess = await __ort.InferenceSession.create(detBuf, { executionProviders: ['wasm'] });
      if (__gentle) await gentleWait(150);
    }
    if (!__recSess) {
      const recBuf = await b64ToU8(ONNX_MODELS.rec, ONNX_MODELS.gz);
      if (__gentle) await gentleWait(150);
      __recSess = await __ort.InferenceSession.create(recBuf, { executionProviders: ['wasm'] });
    }
  } catch (e) {
    __ensurePromise = null;   // 失败清记忆：正式识别时可重试（本版只有一个引擎，没有别的可回落）
    __gentle = false;
    if (!__detSess && !__recSess) __ort = null;
    throw e;
  }
}
function detPrep(canvas) {
  const W = canvas.width, H = canvas.height;
  const side = 736;
  let ratio = side / Math.min(W, H);
  const maxSide = Math.max(W, H);
  if (maxSide * ratio > 2600) ratio = 2600 / maxSide;
  let rw = Math.max(32, Math.round(W * ratio / 32) * 32 | 0);
  let rh = Math.max(32, Math.round(H * ratio / 32) * 32 | 0);
  const cv = document.createElement('canvas'); cv.width = rw; cv.height = rh;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(canvas, 0, 0, rw, rh);
  const d = cx.getImageData(0, 0, rw, rh).data;
  const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
  const out = new Float32Array(3 * rh * rw);
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
    const i = (y * rw + x) * 4;
    out[y * rw + x] = (d[i] / 255 - mean[0]) / std[0];
    out[rh * rw + y * rw + x] = (d[i + 1] / 255 - mean[1]) / std[1];
    out[2 * rh * rw + y * rw + x] = (d[i + 2] / 255 - mean[2]) / std[2];
  }
  return { data: out, rh, rw };
}
function detBoxes(prob, rh, rw, srcH, srcW) {
  const thresh = (typeof window.__OCR_DETTH === 'number') ? window.__OCR_DETTH
    : ((window.ONNX_CFG && typeof window.ONNX_CFG.detTh === 'number') ? window.ONNX_CFG.detTh : 0.3);
  const rowSum = new Float32Array(rh);
  for (let y = 0; y < rh; y++) {
    let s = 0;
    for (let x = 0; x < rw; x++) if (prob[y * rw + x] > thresh) s++;
    rowSum[y] = s;
  }
  const rows = []; let y0 = -1;
  for (let y = 0; y <= rh; y++) {
    const on = y < rh && rowSum[y] >= 2;
    if (on && y0 < 0) y0 = y;
    if ((!on || y === rh) && y0 >= 0) { if (y - y0 >= 4) rows.push([y0, y]); y0 = -1; }
  }
  const sy = srcH / rh, sx = srcW / rw, boxes = [];
  for (const [ya, yb] of rows) {
    const rowH = (yb - ya) * sy;
    const maxGap = Math.max(4, Math.min(Math.round(srcW * 0.045), Math.round(rowH * 1.5)));
    const colSum = new Float32Array(rw);
    for (let y = ya; y < yb; y++) for (let x = 0; x < rw; x++) if (prob[y * rw + x] > thresh) colSum[x]++;
    const spans = [];
    let x0 = -1;
    for (let x = 0; x <= rw; x++) {
      const on = x < rw && colSum[x] >= (yb - ya) * 0.12;
      if (on && x0 < 0) x0 = x;
      if ((!on || x === rw) && x0 >= 0) {
        if (x - x0 >= 2) spans.push([Math.round(x0 * sx), Math.round(x * sx)]);
        x0 = -1;
      }
    }
    let cur = null;
    const flush = () => {
      if (cur) boxes.push({ y0: Math.round(ya * sy), y1: Math.round(yb * sy), x0: cur[0], x1: cur[1] });
    };
    for (const sp of spans) {
      if (cur && sp[0] - cur[1] <= maxGap) { cur[1] = sp[1]; continue; }
      flush();
      cur = sp.slice();
    }
    flush();
  }
  const MIN_H = Math.max(6, Math.round(srcH * 0.008));
  const MIN_W = Math.max(8, Math.round(srcW * 0.018));
  return boxes.filter(b => (b.y1 - b.y0) >= MIN_H && (b.x1 - b.x0) >= MIN_W);
}
function outTensor(res, name) {
  return res[name] || res[Object.keys(res)[0]];
}
function recNormAB() {
  const k = window.__OCR_RECNORM
    || (window.ONNX_CFG && window.ONNX_CFG.recNorm) || 'pm1';
  return k === '01' ? [1 / 255, 0] : [1 / 127.5, -1];
}
async function recOne(canvas, box, optH) {
  const srcW = canvas.width, srcH = canvas.height;
  const pad = 3;
  const x0 = Math.max(0, box.x0 - pad), y0 = Math.max(0, box.y0 - pad);
  const x1 = Math.min(srcW, box.x1 + pad), y1 = Math.min(srcH, box.y1 + pad);
  const wOrg = x1 - x0, hOrg = y1 - y0;
  if (!isFinite(wOrg) || !isFinite(hOrg) || wOrg < 2 || hOrg < 2) return { text: '', conf: 0 };
  const h = (optH && optH >= 32) ? (Math.round(optH / 32) * 32) : 48;
  let w = Math.round(h * wOrg / hOrg);
  if (!isFinite(w) || w < 8) w = 8;
  w = Math.min(320, w) | 0;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(canvas, x0, y0, wOrg, hOrg, 0, 0, w, h);
  const d = cx.getImageData(0, 0, w, h).data;
  const out = new Float32Array(3 * h * w);
  const nAB = recNormAB(), nA = nAB[0], nB = nAB[1];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    out[y * w + x] = d[i] * nA + nB;
    out[h * w + y * w + x] = d[i + 1] * nA + nB;
    out[2 * h * w + y * w + x] = d[i + 2] * nA + nB;
  }
  const tensor = new __ort.Tensor('float32', out, [1, 3, h, w]);
  const res = await __recSess.run({ x: tensor });
  const outT = outTensor(res, 'softmax_5.tmp_0');
  const T = outT.dims[1], C = outT.dims[2], arr = outT.data;
  let text = '', lastIdx = -1; const confs = [];
  for (let t = 0; t < T; t++) {
    let best = -1e9, bi = 0;
    for (let c = 0; c < C; c++) { const v = arr[t * C + c]; if (v > best) { best = v; bi = c; } }
    if (bi === 0) { lastIdx = -1; continue; }
    if (bi === lastIdx) continue;
    lastIdx = bi;
    text += ONNX_KEYS[bi] || '';
    confs.push(best);
  }
  const conf = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 0;
  return { text: text.trim(), conf };
}
async function onnxDetOnly(canvas) {
  await onnxEnsure();
  const p = detPrep(canvas);
  const detTensor = new __ort.Tensor('float32', p.data, [1, 3, p.rh, p.rw]);
  const detRes = await __detSess.run({ x: detTensor });
  const prob = outTensor(detRes, 'sigmoid_0.tmp_0').data;
  return detBoxes(prob, p.rh, p.rw, canvas.height, canvas.width);
}
async function passRegion(canvas, ry0, ry1, rx0, rx1, zone) {
  const W = canvas.width, H = canvas.height;
  const y0 = Math.round(H * ry0), y1 = Math.round(H * ry1);
  const x0 = Math.round(W * (rx0 === undefined ? 0 : rx0));
  const x1 = Math.round(W * (rx1 === undefined ? 1 : rx1));
  const subW = Math.max(1, x1 - x0), subH = Math.max(1, y1 - y0);
  const sub = document.createElement('canvas');
  sub.width = subW; sub.height = subH;
  sub.getContext('2d', { willReadFrequently: true })
    .drawImage(canvas, x0, y0, subW, subH, 0, 0, subW, subH);
  const p = detPrep(sub);
  const detTensor = new __ort.Tensor('float32', p.data, [1, 3, p.rh, p.rw]);
  const detRes = await __detSess.run({ x: detTensor });
  const prob = outTensor(detRes, 'sigmoid_0.tmp_0').data;
  const boxes = detBoxes(prob, p.rh, p.rw, sub.height, sub.width);
  const rows = [];
  for (const b of boxes) {
    const r = await recOne(sub, b);
    if (!r.text) continue;
    rows.push({
      text: r.text,
      yc: (b.y0 + b.y1) / 2 + y0,   // 还原到模板坐标
      xc: (b.x0 + b.x1) / 2 + x0,
      h: b.y1 - b.y0,
      conf: r.conf,
      zone: zone || '',
      x0: b.x0 + x0, x1: b.x1 + x0, y0: b.y0 + y0, y1: b.y1 + y0
    });
  }
  return rows;
}
function findDivider(canvas, textRows) {
  return textBlockTop(textRows, canvas ? canvas.height : 0);
}
function guessComboByRows(rows, H, band) {
  const y0 = band ? band[0] : 0.55, y1 = band ? band[1] : 0.88;
  const n = (rows || []).filter(function (r) { return r.yc >= H * y0 && r.yc <= H * y1; }).length;
  window.__dividerRatio = n;
  if (n >= 4) return '3+1';
  if (n === 3) return '2+1';
  if (n === 2) return '1+1';
  return '?';
}
function mergePasses(rowsA, rowsB, tol) {
  if (!rowsB || !rowsB.length) return rowsA.slice();
  const t = tol || 40;
  const out = [];
  const usedB = new Array(rowsB.length).fill(false);
  for (const a of rowsA) {
    let bestJ = -1, bestD = 999;
    for (let j = 0; j < rowsB.length; j++) {
      if (usedB[j]) continue;
      const d = Math.abs(a.yc - rowsB[j].yc);
      if (d < bestD && d < t) { bestD = d; bestJ = j; }
    }
    if (bestJ >= 0) {
      usedB[bestJ] = true;
      const b = rowsB[bestJ];
      const win = a.conf >= b.conf ? a : b;
      out.push(Object.assign({}, win, { zone: a.zone || win.zone || '' }));
    } else {
      out.push(a);
    }
  }
  for (let j = 0; j < rowsB.length; j++) if (!usedB[j]) out.push(rowsB[j]);
  out.sort((a, b) => a.yc - b.yc);
  return out;
}
async function detRowsOn(canvas) {
  const boxes = await onnxDetOnly(canvas);
  if (!boxes || !boxes.length) return [];
  const bs = boxes.slice().sort(function (a, b) { return (a.y0 + a.y1) - (b.y0 + b.y1); });
  const rows = [];
  for (const b of bs) {
    const cy = (b.y0 + b.y1) / 2;
    const hh = Math.max(4, b.y1 - b.y0);
    let r = null;
    for (const q of rows) if (Math.abs(q.yc - cy) < hh * 0.7) { r = q; break; }
    if (r) {
      r.y0 = Math.min(r.y0, b.y0); r.y1 = Math.max(r.y1, b.y1);
      r.x0 = Math.min(r.x0, b.x0); r.x1 = Math.max(r.x1, b.x1);
      r.yc = (r.y0 + r.y1) / 2; r.n++;
    } else {
      rows.push({ y0: b.y0, y1: b.y1, x0: b.x0, x1: b.x1, yc: cy, n: 1 });
    }
  }
  return rows;
}
function zonesFromText(rows, divY, H, W) {
  const fixed = [
    { name: 'level', ry0: 0.03, ry1: 0.18, rx0: 0.52, rx1: 1.0 },
    { name: 'name', ry0: 0.42, ry1: 0.70, rx0: 0.06, rx1: 0.94 },
    { name: 'affix', ry0: 0.55, ry1: 0.88, rx0: 0.04, rx1: 0.96 }
  ];
  window.__zoneSplit = window.__zoneSplit || '';
  if (!rows || rows.length < 4) return fixed;
  const wrap = function (list, padY, padX) {
    if (!list.length) return null;
    let y0 = 1e9, y1 = -1e9, x0 = 1e9, x1 = -1e9;
    for (const r of list) {
      if (r.y0 < y0) y0 = r.y0;
      if (r.y1 > y1) y1 = r.y1;
      if (r.x0 < x0) x0 = r.x0;
      if (r.x1 > x1) x1 = r.x1;
    }
    y0 = Math.max(0, y0 / H - padY); y1 = Math.min(1, y1 / H + padY);
    x0 = Math.max(0, x0 / W - padX); x1 = Math.min(1, x1 / W + padX);
    if (y1 - y0 < 0.03 || x1 - x0 < 0.05) return null;
    return { ry0: y0, ry1: y1, rx0: x0, rx1: x1 };
  };
  const pick = function (idx, list, py, px) {
    return Object.assign({ name: fixed[idx].name }, wrap(list, py, px) || fixed[idx]);
  };
  const band = rows.filter(function (r) {
    return r.yc >= H * 0.40 && r.yc <= H * 0.70 && (r.y1 - r.y0) > 6;
  });
  let nameRows = [], medH = 0;
  if (band.length >= 2) {
    const hs = band.map(function (r) { return r.y1 - r.y0; }).sort(function (a, b) { return a - b; });
    medH = hs[(hs.length / 2) | 0];
    for (const r of band) {
      let sc = 0;
      if (r.text) { try { sc = apiNameRowHit(r); } catch (e) { sc = 0; } }
      if ((r.y1 - r.y0) >= medH * 1.12 || sc >= 0.8) nameRows.push(r);
    }
    if (nameRows.length > 1) {
      let best = [nameRows[0]], cur = [nameRows[0]];
      for (let i = 1; i < nameRows.length; i++) {
        if (nameRows[i].y0 - nameRows[i - 1].y1 <= medH * 0.9) cur.push(nameRows[i]);
        else { if (cur.length > best.length) best = cur; cur = [nameRows[i]]; }
      }
      if (cur.length > best.length) best = cur;
      nameRows = best;
    }
    if (nameRows.length) {
      let blkH = 0, top = 1e9;
      for (const r of nameRows) {
        if (r.y1 - r.y0 > blkH) blkH = r.y1 - r.y0;
        if (r.y0 < top) top = r.y0;
      }
      for (let guard = 0; guard < 2; guard++) {
        let up = null;
        for (const r of rows) {
          const h = r.y1 - r.y0;
          if (r.y1 > top + 2) continue;              // 只要块上方的
          if (r.y1 < top - blkH * 1.2) continue;     // 太远（标题/等级行）
          if (h < blkH * 0.8) continue;              // 字号差太多（不是同一块）
          if (!up || r.y1 > up.y1) up = r;
        }
        if (!up) break;
        nameRows.push(up);
        top = up.y0;
      }
    }
  }
  let nameZ = fixed[1], affixZ = fixed[2];
  let why = '';
  if (nameRows.length) {
    let blkY0 = 1e9, blkY1 = 0;
    for (const r of nameRows) {
      if (r.y1 > blkY1) blkY1 = r.y1;
      if (r.y0 < blkY0) blkY0 = r.y0;
    }
    const nz0 = Math.max(0.28, blkY0 / H - 0.012);
    if (nz0 < fixed[1].ry0 - 0.004) {
      nameZ = { name: 'name', ry0: nz0, ry1: fixed[1].ry1, rx0: fixed[1].rx0, rx1: fixed[1].rx1 };
      window.__zoneSplit = 'name';
    }
    let nextTop = 1;
    for (const r of rows) {
      if (r.y0 > blkY1 + 2 && r.y0 / H < nextTop) nextTop = r.y0 / H;
    }
    let ay0 = Math.min(blkY1 / H + 0.006, 0.62);
    if (nextTop < 1) ay0 = Math.min(ay0, Math.max(0.50, nextTop - 0.004));
    if ((0.88 - ay0) >= 0.03 && ay0 > fixed[2].ry0 + 0.005) {
      affixZ = { name: 'affix', ry0: ay0, ry1: 0.88, rx0: 0.04, rx1: 0.96 };
      window.__zoneSplit = 'name';
    } else { why = 'band-too-narrow'; }
  } else { why = band.length >= 2 ? 'no-big-row' : 'few-rows'; }
  window.__zoneDbg = { n: rows.length, band: band.length, medH: medH, why: why,
    rows: nameRows.map(function (r) { return { y0: r.y0, y1: r.y1, h: r.y1 - r.y0, t: r.text || '' }; }) };
  return [pick(0, rows.filter(function (r) { return r.x0 > W * 0.5 && r.y1 < H * 0.22; }), 0.02, 0.03), nameZ, affixZ];
}
const NUM_HEAD_RE = /^\s*([+\-−–—‐‑﹣×xX✕⨯*<>±]?\s*\d{1,4}(?:[.,]\d{1,3})?\s*%?)/;
function numNorm(s) {
  return String(s || '').replace(/[−–—‐‑﹣]/g, '-').replace(/[^\d.,%+\-]/g, '').replace(/,/g, '.');
}
function numCore(s) {
  const m = numNorm(s).match(/\d+(?:\.\d+)?/);
  return m ? m[0] : '';
}
function glyphUnits(s) {
  let u = 0;
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (c >= 0x4e00 && c <= 0x9fff) u += 1.0;          // 汉字方
    else if (ch === ' ') u += 0.34;
    else if (/[0-9+\-.%×xX✕⨯]/.test(ch)) u += 0.56;    // 数字/符号窄
    else u += 0.62;
  }
  return u;
}
function numSpanOf(row, tok) {
  const w = row.x1 - row.x0;
  if (!(w > 8)) return null;
  const total = glyphUnits(row.text) || 1;
  const lead = glyphUnits(String(row.text).slice(0, String(row.text).indexOf(tok)));
  const own = glyphUnits(tok);
  const xa = row.x0 + w * (lead / total) - 2;
  const xb = row.x0 + w * ((lead + own) / total) + 3;
  if (!(xb - xa >= 8)) return null;
  return [Math.max(0, Math.round(xa)), Math.round(xb)];
}
async function verifyNumbers(templated, rows, band) {
  const H = templated.height;
  const b0 = band ? band[0] : 0.5, b1 = band ? band[1] : 0.84;
  const out = [];
  let n = 0;
  let lmCache = null;      // 二值化掩膜一张就够：整幅阈值 + 去小块，一张约 100~200ms，别每行都做
  const seen = Object.create(null);   // 多轮合并后同一行可能留两条副本，复核一次就够（否则副本裁歪会误报冲突）
  for (const r of rows) {
    if (n >= 6) break;
    if (r.yc < H * b0 || r.yc > H * b1) continue;   // 只查词条带，别浪费在段位/循环数上
    if (r.x0 == null || r.x1 == null || r.y0 == null) continue;
    const t = String(r.text || '');
    const dupKey = Math.round(r.yc / 10) + '|' + t;
    if (seen[dupKey]) continue;
    seen[dupKey] = 1;
    const m = t.match(NUM_HEAD_RE);
    if (!m) continue;
    const span = numSpanOf(r, m[1]);
    if (!span) continue;
    n++;
    const box = { x0: span[0], y0: r.y0 - 1, x1: span[1], y1: r.y1 + 1 };
    let a = null, b = null, c = null;
    try { a = await recOne(templated, box); } catch (e) { a = null; }
    try { b = await recOne(templated, box, 64); } catch (e) { b = null; }
    const inText = numCore(m[1]);
    const va = numCore(a && a.text), vb = numCore(b && b.text);
    let suspect = '';
    if (va && va === inText) suspect = '';
    else if (vb && vb === inText) suspect = '';
    else if (va && vb && va === vb) suspect = va;
    else if (va || vb) {
      try {
        if (!lmCache) lmCache = lumaMask(templated, 90);
        c = await recOne(lmCache, box);
      } catch (e) { c = null; }
      const vc = numCore(c && c.text);
      if (vc && va && vc === va) suspect = va;
      else if (vc && vb && vc === vb) suspect = vb;
    }
    const rec = { y: Math.round(r.yc), from: inText, vals: [inText, suspect].filter(Boolean), conflict: !!suspect };
    if (suspect) r.numConflict = true;
    out.push(rec);
  }
  return out;
}
async function cardRectFromText(img) {
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  if (!W || !H) return null;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  cv.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0);
  const rows = await detRowsOn(cv);
  if (!rows || rows.length < 3) return null;
  let y0 = 1e9, y1 = -1e9, x0 = 1e9, x1 = -1e9;
  for (const r of rows) {
    if (r.y0 < y0) y0 = r.y0;
    if (r.y1 > y1) y1 = r.y1;
    if (r.x0 < x0) x0 = r.x0;
    if (r.x1 > x1) x1 = r.x1;
  }
  if (!(y1 > y0) || (y1 - y0) < H * 0.25) return null;   // 字全挤在一条薄带里 不像一张卡
  const px = (x1 - x0) * 0.06, py = (y1 - y0) * 0.10;    // 卡面左右留白窄，上下要含插画和页脚
  return [Math.max(0, x0 - px), Math.max(0, y0 - py),
          Math.min(W, x1 + px), Math.min(H, y1 + py)];
}
async function onnxFullRows(imgEl, opts) {
  opts = opts || {};
  var __P = (typeof window !== 'undefined' && window.__ocrProfile) ? (window.__ocrPhases = window.__ocrPhases || { wake: 0, det: 0, rec: 0 }) : null;
  var __tw = __P ? performance.now() : 0;
  await onnxEnsure();
  if (__P) __P.wake += performance.now() - __tw;
  var __td = __P ? performance.now() : 0;
  let templated = fitToTemplate(imgEl);         // ①定位 + 拉正 + 贴模板
  try {
    const fit = templated.__fit || {};
    const ar = fit.ar;
    window.__fitAr = (typeof ar === 'number') && isFinite(ar) ? ar : null;
    const badShape = (typeof ar === 'number') && isFinite(ar) && (ar < 0.25 || ar > 2.0);
    if (fit.mode === 'full' || badShape) {
      const rect = await cardRectFromText(imgEl);
      if (rect) {
        templated = fitToTemplate(imgEl, rect);
        window.__fitRescue = rect;
      }
      window.__fitWhy = fit.mode === 'full' ? 'full' : (badShape ? 'shape' : '');
    } else {
      window.__fitWhy = '';
    }
    window.__fitMode = templated.__fit ? templated.__fit.mode : '';
  } catch (e) { ZKHTML.warn('识别/ocr_onnx.js:609', e); }
  const H = templated.height;
  let polInfo = null;
  try {
    if (typeof window.PolarOCR !== 'undefined' && window.PolarOCR.detect) {
      polInfo = await window.PolarOCR.detect(templated);
      window.__polar = polInfo;   // 调试/诊断用
    }
  } catch (ePol) { polInfo = null; }
  const tol = Math.round(H * 0.035);            // 投票对齐容差随模板缩放（800 28）
  let textRows = [];
  try { textRows = await detRowsOn(templated); } catch (e) { textRows = []; }
  window.__textRows = textRows.length;
  window.__textRowsArr = textRows.map(function (r) { return [Math.round(r.yc), Math.round((r.y1-r.y0)*10)/10, r.text]; });
  const divY = findDivider(templated, textRows);
  const ZONES = zonesFromText(textRows, divY, H, templated.width);
  const affixBand = [ZONES[2].ry0, ZONES[2].ry1];
  const combo = guessComboByRows(textRows, H, affixBand);
  window.__comboGuess = combo;
  window.__divY = divY;
  if (!window.__zones) window.__zones = ZONES;
  if (__P) { __P.det += performance.now() - __td; }
  var __tr = __P ? performance.now() : 0;
  async function passZones(cv) {
    const out = [];
    for (const z of ZONES) {
      const rs = await passRegion(cv, z.ry0, z.ry1, z.rx0, z.rx1, z.name);
      out.push(...rs);
    }
    out.sort((a, b) => a.yc - b.yc);
    return out;
  }
  let rows = await passZones(templated);
  const nameTxt = rows.filter(r => r.zone === 'name').map(r => r.text || '').join(' ');
  const nameCjk = (nameTxt.match(/[\u4e00-\u9fff]/g) || []).length;
  const nameLooksFull = /[-–—·・\s]/.test(nameTxt) || nameCjk >= 6;
  if (!nameLooksFull && ZONES[1].ry0 > 0.33) {
    const __tt = __P ? performance.now() : 0;
    const top = Math.max(0.30, ZONES[1].ry0 - 0.10);
    try {
      const cand = textRows.filter(function (r) {
        return r.yc >= H * top && r.yc < H * ZONES[1].ry0 + 4 && (r.y1 - r.y0) >= H * 0.018;
      });
      let extra = [];
      for (const r of cand) {
        const rr = await recOne(templated, r);
        if (!rr.text) continue;
        extra.push({ text: rr.text, conf: rr.conf, zone: 'name', yc: r.yc, xc: r.xc, h: r.h,
                     x0: r.x0, x1: r.x1, y0: r.y0, y1: r.y1 });
      }
      window.__nameRetry = { top: top, mode: 'rec', rows: extra.map(function (r) { return [Math.round(r.yc), r.text]; }) };
      rows = mergePasses(rows, extra, tol);
      if (nameCjk === 0 && !extra.length) {
        const extra2 = await passRegion(templated, top, ZONES[1].ry0 + 0.02, ZONES[1].rx0, ZONES[1].rx1, 'name');
        window.__nameRetry = { top: top, mode: 'det', rows: extra2.map(function (r) { return [Math.round(r.yc), r.text]; }) };
        rows = mergePasses(rows, extra2, tol);
      }
    } catch (e) { ZKHTML.warn('识别/ocr_onnx.js:name-retry', e); }
    if (__P) {
      window.__ocrPhases = window.__ocrPhases || { wake: 0, det: 0, rec: 0, parse: 0 };
      window.__ocrPhases.nameRetry = (window.__ocrPhases.nameRetry || 0) + (performance.now() - __tt);
    }
  }
  const inAffixBand = r => r.yc >= H * affixBand[0] && r.yc <= H * affixBand[1];
  const affixCount = rows.filter(r => r.zone === 'affix').length
    + rows.filter(r => !r.zone && inAffixBand(r)).length;
  const affixRowsNow = rows.filter(r => r.zone === 'affix' || (!r.zone && inAffixBand(r)));
  let shaky = false;
  for (const r of affixRowsNow) {
    try {
      const nm = String(r.text || '').replace(/^[+\-−–—‐‑﹣×xX✕⨯*±]?\s*[\d.,]+\s*%?\s*/, '');
      const rk = apiRankAffix(nm);
      window.__shakyWhy = window.__shakyWhy || [];
      if (window.__shakyWhy.length < 8 && rk && rk.length) {
        window.__shakyWhy.push([nm, rk[0].score, rk[1] ? rk[1].score : -1, String(r.text).slice(0, 14)]);
      }
      if (rk && rk.length > 1 && rk[0].score < 88 && (rk[0].score - rk[1].score) < 8) { shaky = true; break; }
    } catch (e) { ZKHTML.warn('识别/ocr_onnx.js:688', e); }
  }
  const looksValid = r => {
    const t = String(r.text || '').trim();
    if (!t) return false;
    return /\d/.test(t);   // 只认「有数字」的行
  };
  const validAffix = affixRowsNow.filter(looksValid).length;
  const hasName = rows.some(r => r.zone === 'name' && (r.text || '').trim() && (r.conf || 0) > 0.3);
  const needExtra = !hasName || validAffix < 4;
  window.__affixFirst = affixCount;
  window.__validAffix = validAffix;
  window.__hasName = hasName;
  window.__shaky = shaky;
  window.__ocrRetry = needExtra ? (hasName ? 'few' : 'noname') : '';
  if (needExtra) {
    const countBand = function () {
      return rows.filter(r => r.zone === 'affix').length
        + rows.filter(r => !r.zone && inAffixBand(r)).length;
    };
    const backScale = function (rs, sc) {
      return rs.map(function (r) {
        return {
          text: r.text, zone: r.zone, conf: r.conf,
          yc: r.yc / sc, xc: r.xc / sc, h: r.h / sc,
          x0: r.x0 / sc, x1: r.x1 / sc, y0: r.y0 / sc, y1: r.y1 / sc
        };
      });
    };
    rows = mergePasses(rows, await passZones(lumaMask(templated, 90)), tol);
    rows = mergePasses(rows, await passRegion(templated, 0.0, 1.0, 0, 1, 'full'), tol);
    for (const sc of [1.15, 0.85]) {
      rows = mergePasses(rows, backScale(await passZones(scaleCanvas(templated, sc)), sc), tol);
      window.__ocrRounds = (window.__ocrRounds || 0) + 1;
      if (countBand() >= 4) break;
    }
  }
  if (__P) __P.rec += performance.now() - __tr;
  if (opts.numCheck !== false && (typeof window === 'undefined' || window.__ocrNumCheck !== false)) {
    var __tn = __P ? performance.now() : 0;
    try {
      window.__numVerify = (window.__numVerify || []).concat(await verifyNumbers(templated, rows, affixBand));
    } catch (e) { ZKHTML.warn('识别/ocr_onnx.js:numverify', e); }
    if (__P) { window.__ocrPhases = window.__ocrPhases || { wake: 0, det: 0, rec: 0, parse: 0 }; window.__ocrPhases.num = (window.__ocrPhases.num || 0) + (performance.now() - __tn); }
  }
  try {
    const debugCanvas = document.createElement('canvas');
    debugCanvas.width = templated.width; debugCanvas.height = templated.height;
    const dcx = debugCanvas.getContext('2d');
    dcx.drawImage(templated, 0, 0);
    dcx.strokeStyle = '#ff3333'; dcx.lineWidth = 2;
    dcx.beginPath(); dcx.moveTo(0, divY); dcx.lineTo(debugCanvas.width, divY); dcx.stroke();
    dcx.strokeStyle = '#ffff00';
    for (const z of ZONES) {
      dcx.strokeRect(z.rx0 * debugCanvas.width, z.ry0 * H,
        (z.rx1 - z.rx0) * debugCanvas.width, (z.ry1 - z.ry0) * H);
    }
    window.__stepImages = {
      aligned: templated.toDataURL(),
      mask: lumaMask(templated, 90).toDataURL(),
      zones: debugCanvas.toDataURL()
    };
  } catch (e) { ZKHTML.warn('识别/ocr_onnx.js:723', e); }
  window.__ocrRowsFinal = rows.map(function (r) {
    return [Math.round(r.yc), Math.round(r.y1 - r.y0), r.zone || '', r.text || ''];
  });
  return { rows: rows, templated: templated, pol: polInfo, zones: ZONES };
}
