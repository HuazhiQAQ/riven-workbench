/* ============================================================================
 * ocr_engine.js —— 本工具唯一的本地识别引擎（完全离线）
 * ---------------------------------------------------------------------------
 *  链路三层：det（文字检测）→ rec（整行识别）→ 行级清洗 + 分区，
 *  全部在本机完成，一个网络请求都不发。
 *
 *    det : maxSide auto(960~1920) + ceil/32 对齐 + ImageNet mean/std
 *          → 概率图阈值 → 8 邻域连通域 → 补边 → 还原原图坐标
 *    rec : 同行多框拼成白底长图，高 48、宽不限，取 R 通道当灰度复制到三通道，
 *          归一化 v/127.5-1，CTC greedy（blank=0，字典末位空格，injectGapSpaces，
 *          含 CJK 不做全角转半角），再按位置把长图文本切回每个框
 *
 *  模型与运行时全部走 window.ONNX_MODELS / ONNX_KEYS / ORT_EMBED 的
 *  gzip+base64 内嵌：PP-OCRv6_tiny det/rec .onnx + 6906 行字典。
 *
 *  【文本后处理：默认口径写在本模块，业务规则留在 ocr.js 下游】
 *    - 行级清洗 cleanItemText：行首被读成数字的锁/图标、% 与词条名之间的
 *      符号噪声、% 后误读出的 1-2 位数字、倍率符号后的 O/o/〇 误读成 0
 *    - 低置信兜底 0.15（不做一刀切过滤，避免吞掉整条词条）
 *    - zone 分区（level / name / affix，与 ocr.js 的 REGIONS_PCT 同口径）
 *    - 折行合并 mergeFragmentLines、派系 +0.5→×1.5、后坐力符号方向、
 *      数值清洗 shrinkValue、锁图标误读 lockIconMisread —— 均在 ocr.js 的
 *      parseAffixes / mergeFragmentLines / finalize / sanitizeFinalAffixes 里，
 *      由 classifyWithGlobal → buildFromRaw → finalize → attachNumVerify 完整消费
 *    - 数值复读 __numVerify、槽位/永正永负/数值上限等「紫卡铁律」由
 *      window.RULES 与 ocr.js 的 finalize 保证，本模块不绕过、不另写一套
 *
 *  【对外接口（一个不丢）】
 *    onnxFullRows / onnxDetOnly / ortBoot / onnxEnsure / __wakeOnnx /
 *    __onnxPreload / __onnxSelfTest / __onnxState / __ortBootTest /
 *    __ortSource / __ortErr / __numVerify / __zones / __comboGuess / __divY /
 *    __stepImages / __textRows / __textRowsArr / __ocrRowsFinal / __polar /
 *    __fitAr / __fitWhy / __fitMode / __fitRescue / __zoneSplit / __zoneDbg /
 *    __dividerRatio / __affixFirst / __validAffix / __hasName / __shaky /
 *    __shakyWhy / __ocrRetry / __nameRetry / __ocrRounds / __ocrPhases /
 *    __ocrLast（识别明细，供「显示识别」面板消费）
 * ========================================================================== */
(function () {
  'use strict';

  /* 全局状态：本模块是唯一识别引擎，全部状态收在这里 */
  var S = {
    ort: null, detSess: null, recSess: null, dict: null,
    ensurePromise: null, gentle: false, wakeResolve: null,
    canvas: null, regions: null, last: null
  };

  function ZKwarn(tag, e) {
    try { if (window.ZKHTML && window.ZKHTML.warn) window.ZKHTML.warn(tag, e); }
    catch (e2) { /* 诊断钩子不可用不能影响识别 */ void e2; }
  }
  function say(onProg, msg) {
    try { if (onProg) onProg({ status: msg }); } catch (e) { ZKwarn('ocr_engine:say', e); }
  }

  /* ------------------------------------------------------------------ *
   * ① 内嵌运行时 / 内嵌模型解码（gzip + base64，完全离线）
   * ------------------------------------------------------------------ */
  var B64_CHUNK = 0x40000;
  function nap(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function ortU8ToB64(u8) {
    var s = '', CH = 0x8000;
    for (var i = 0; i < u8.length; i += CH) {
      s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    }
    return btoa(s);
  }
  async function ortGunzip(u8) {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('浏览器不支持 DecompressionStream（无法解压内嵌运行时）');
    }
    var res = new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip')));
    return new Uint8Array(await res.arrayBuffer());
  }
  async function b64ToU8(b64, gz) {
    if (!S.gentle) {
      var u0 = Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); });
      return gz ? await ortGunzip(u0) : u0;
    }
    var q = b64.length;
    var pad = b64[q - 1] === '=' ? (b64[q - 2] === '=' ? 2 : 1) : 0;
    var out = new Uint8Array(Math.floor(q / 4) * 3 - pad), off = 0, pos = 0;
    while (pos < q) {
      var end = Math.min(pos + B64_CHUNK, q);
      var seg = atob(b64.slice(pos, end));
      for (var i = 0; i < seg.length; i++) out[off + i] = seg.charCodeAt(i);
      off += seg.length; pos = end;
      if (pos < q) await nap(0);
    }
    return gz ? await ortGunzip(out) : out;
  }
  async function ortB64Url(b64, type, gz, useBlob) {
    var parts = [], pos = 0, q = b64.length;
    var CH = S.gentle ? B64_CHUNK : q;
    while (pos < q) {
      var end = Math.min(pos + CH, q);
      var seg = atob(b64.slice(pos, end));
      var u = new Uint8Array(seg.length);
      for (var i = 0; i < seg.length; i++) u[i] = seg.charCodeAt(i);
      parts.push(u);
      pos = end;
      if (S.gentle && pos < q) await nap(0);
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
  var blobModOk = null;
  async function ortBlobModuleOK() {
    if (blobModOk !== null) return blobModOk;
    try {
      var u = URL.createObjectURL(new Blob(['export default 1;'], { type: 'text/javascript' }));
      await import(u); URL.revokeObjectURL(u); blobModOk = true;
    } catch (e) { blobModOk = false; }
    return blobModOk;
  }
  async function ortBoot() {
    if (S.ort) return S.ort;
    var E = window.ORT_EMBED;
    if (E && E.mjs) {
      try {
        var useBlob = await ortBlobModuleOK();
        var gz = !!E.gz;
        var mod = await import(await ortB64Url(E.mjs, 'text/javascript', gz, useBlob));
        var wp = {};
        if (E.glue) wp.mjs = await ortB64Url(E.glue, 'text/javascript', gz, useBlob);
        wp.wasm = E.wasm ? await ortB64Url(E.wasm, 'application/wasm', gz, true) : null;
        if (!wp.wasm) throw new Error('内嵌运行时缺 wasm 本体（E.wasm 为空），离线不可用');
        mod.env.wasm.wasmPaths = wp;
        mod.env.wasm.numThreads = 1;
        S.ort = mod;
        window.__ortSource = 'embedded';
        window.__ortErr = '';
      } catch (e) {
        S.ort = null;
        window.__ortErr = '内嵌运行时启动失败：' + ((e && e.message) || e);
        console.warn('内嵌运行时启动失败：', e);
      }
    }
    /* 离线版不保留任何外部回退：拿不到内嵌运行时就直接报错，不发请求 */
    if (!S.ort) {
      window.__ortSource = 'missing';
      window.__ortErr = window.__ortErr
        || 'ONNX 运行时缺失：内嵌运行时未能启动（离线版不启用任何外部回退）。';
      throw new Error(window.__ortErr);
    }
    try { S.ort.env.wasm.numThreads = 1; } catch (e4) { ZKwarn('ocr_engine:numThreads', e4); }
    return S.ort;
  }

  /* gentle 预加载 / 一传卡就叫醒（与原引擎同口径，app.js 会调 __wakeOnnx） */
  function wakeOnnx() {
    S.gentle = false;
    if (S.wakeResolve) { var r = S.wakeResolve; S.wakeResolve = null; r(); }
  }
  function gentleWait(ms) {
    if (!S.gentle) return Promise.resolve();
    return new Promise(function (r) {
      S.wakeResolve = r;
      setTimeout(function () { if (S.wakeResolve === r) { S.wakeResolve = null; r(); } }, ms);
    });
  }
  function idleTick() {
    if (!S.gentle) return Promise.resolve();
    return new Promise(function (r) {
      var done = false;
      var fin = function () {
        if (done) return; done = true;
        if (S.wakeResolve === fin) S.wakeResolve = null;
        r();
      };
      S.wakeResolve = fin;
      if (typeof requestIdleCallback === 'function') requestIdleCallback(fin, { timeout: 1500 });
      else setTimeout(fin, 0);
    });
  }
  function onnxEnsure(gentle) {
    if (S.detSess && S.recSess && S.dict) return Promise.resolve();
    if (!S.ensurePromise) {
      S.gentle = gentle === true;
      S.ensurePromise = onnxEnsureInner();
    }
    return S.ensurePromise;
  }
  async function onnxEnsureInner() {
    try {
      await ortBoot();
      if (S.gentle) await idleTick();
      if (S.gentle) await gentleWait(250);
      var M = window.ONNX_MODELS;
      if (!M || !M.det || !M.rec) throw new Error('内嵌模型缺失（window.ONNX_MODELS）');
      if (!S.detSess) {
        var detBuf = await b64ToU8(M.det, M.gz);
        if (S.gentle) await gentleWait(200);
        S.detSess = await S.ort.InferenceSession.create(detBuf, {
          executionProviders: ['wasm'], graphOptimizationLevel: 'all'
        });
        if (S.gentle) await gentleWait(150);
      }
      if (!S.recSess) {
        var recBuf = await b64ToU8(M.rec, M.gz);
        if (S.gentle) await gentleWait(150);
        S.recSess = await S.ort.InferenceSession.create(recBuf, {
          executionProviders: ['wasm'], graphOptimizationLevel: 'all'
        });
      }
      S.dict = window.ONNX_KEYS || [];
      if (!S.dict.length) throw new Error('内嵌字典缺失（window.ONNX_KEYS）');
      window.__ocrDictLen = S.dict.length;
    } catch (e) {
      S.ensurePromise = null;
      S.gentle = false;
      if (!S.detSess && !S.recSess) S.ort = null;
      throw e;
    }
  }

  /* ------------------------------------------------------------------ *
   * ② 识别参数（默认口径 + 内嵌模型所需的阈值校准）
   * ------------------------------------------------------------------ */
  var DET = {
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
    maxSideLength: 'auto',
    minimumAreaThreshold: 20,
    paddingVertical: 0.4,
    paddingHorizontal: 0.6
  };
  var REC = {
    imageHeight: 48,
    maxCropSourceSideLength: 2000,
    rotateVerticalCrops: true
  };
  /* 内嵌 .onnx 输出 sigmoid 概率图：取 0 会把整幅背景连成一块。
     默认取 ONNX_CFG.detTh（v6=0.25），可用 __OCR_DETTH 现场覆盖，便于真机校准。 */
  function ocrDetTh() {
    if (typeof window.__OCR_DETTH === 'number') return window.__OCR_DETTH;
    return (window.ONNX_CFG && typeof window.ONNX_CFG.detTh === 'number')
      ? window.ONNX_CFG.detTh : 0.25;
  }
  function ocrConfMin() {
    if (typeof window.__OCR_CONFMIN === 'number') return window.__OCR_CONFMIN;
    return 0.15;
  }
  function ocrRecNorm() {
    var k = window.__OCR_RECNORM
      || (window.ONNX_CFG && window.ONNX_CFG.recNorm) || 'pm1';
    return k === '01' ? [1 / 255, 0] : [1 / 127.5, -1];
  }

  /* ------------------------------------------------------------------ *
   * ③ det 前处理 / 后处理
   * ------------------------------------------------------------------ */
  function ocrDetImageToTensor(canvas, w, h, mean, std) {
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    var d = ctx.getImageData(0, 0, w, h).data;
    var n = h * w, t = new Float32Array(3 * n);
    var sr = 1 / (255 * std[0]), sg = 1 / (255 * std[1]), sb = 1 / (255 * std[2]);
    var br = mean[0] / std[0], bg = mean[1] / std[1], bb = mean[2] / std[2];
    for (var i = 0, p = 0; i < n; i++, p += 4) {
      t[i] = d[p] * sr - br;
      t[n + i] = d[p + 1] * sg - bg;
      t[2 * n + i] = d[p + 2] * sb - bb;
    }
    return t;
  }
  function ocrResolveMaxSide(v, longest) {
    if (v !== 'auto') return v;
    return Math.min(1920, Math.max(960, Math.round(longest * 0.75 / 32) * 32));
  }
  function ocrCalcResize(w, h, maxSide) {
    var rw = w, rh = h, ratio = 1;
    if (Math.max(rh, rw) > maxSide) {
      ratio = maxSide / (rh > rw ? rh : rw);
      rw = Math.round(w * ratio); rh = Math.round(h * ratio);
    }
    return { width: rw, height: rh, ratio: ratio };
  }
  function ocrPadRect(r, maxW, maxH, pv, ph) {
    var vp = Math.round(r.height * pv), hp = Math.round(r.height * ph);
    var x = Math.max(0, r.x - hp), y = Math.max(0, r.y - vp);
    var right = Math.min(maxW, r.x + r.width + hp);
    var bottom = Math.min(maxH, r.y + r.height + vp);
    return { x: x, y: y, width: right - x, height: bottom - y };
  }
  function ocrToOriginal(r, ratio, ow, oh) {
    var x = Math.max(0, Math.round(r.x / ratio));
    var y = Math.max(0, Math.round(r.y / ratio));
    var w = Math.min(ow - x, Math.round(r.width / ratio));
    var h = Math.min(oh - y, Math.round(r.height / ratio));
    return { x: x, y: y, width: w, height: h };
  }
  function ocrDetPreprocess(canvas) {
    var ow = canvas.width, oh = canvas.height;
    var maxSide = ocrResolveMaxSide(DET.maxSideLength, Math.max(ow, oh));
    var d = ocrCalcResize(ow, oh, maxSide);
    var W = Math.ceil(d.width / 32) * 32;
    var H = Math.ceil(d.height / 32) * 32;
    var pad = document.createElement('canvas');
    pad.width = W; pad.height = H;
    var cx = pad.getContext('2d', { willReadFrequently: true });
    cx.fillStyle = '#000'; cx.fillRect(0, 0, W, H);
    cx.drawImage(canvas, 0, 0, ow, oh, 0, 0, d.width, d.height);
    return {
      tensor: ocrDetImageToTensor(pad, W, H, DET.mean, DET.std),
      width: W, height: H, ratio: d.ratio, ow: ow, oh: oh
    };
  }
  /* 阈值 → 8 邻域连通域 → 补边 → 还原坐标（框几何口径） */
  function ocrDetPostprocess(prob, W, H, ratio, ow, oh) {
    var th = ocrDetTh();
    var n = W * H, mask = new Uint8Array(n);
    for (var i = 0; i < n; i++) mask[i] = (prob[i] || 0) > th ? 1 : 0;
    var seen = new Uint8Array(n), boxes = [], stack = new Int32Array(n);
    for (var s = 0; s < n; s++) {
      if (!mask[s] || seen[s]) continue;
      var sp = 0; stack[sp++] = s; seen[s] = 1;
      var x0 = s % W, x1 = x0, y0 = (s / W) | 0, y1 = y0;
      while (sp > 0) {
        var q = stack[--sp];
        var qx = q % W, qy = (q / W) | 0;
        if (qx < x0) x0 = qx; if (qx > x1) x1 = qx;
        if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
        for (var dy = -1; dy <= 1; dy++) {
          var ny = qy + dy; if (ny < 0 || ny >= H) continue;
          for (var dx = -1; dx <= 1; dx++) {
            var nx = qx + dx; if (nx < 0 || nx >= W) continue;
            var np = ny * W + nx;
            if (mask[np] && !seen[np]) { seen[np] = 1; stack[sp++] = np; }
          }
        }
      }
      var rect = { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
      if (rect.width * rect.height <= DET.minimumAreaThreshold) continue;
      var padded = ocrPadRect(rect, W, H, DET.paddingVertical, DET.paddingHorizontal);
      var box = ocrToOriginal(padded, ratio, ow, oh);
      if (box.width > 5 && box.height > 5) boxes.push(box);
    }
    boxes.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
    return boxes;
  }
  function ocrDetBoxes(canvas, onProg) {
    var pre = ocrDetPreprocess(canvas);
    var t = new S.ort.Tensor('float32', pre.tensor, [1, 3, pre.height, pre.width]);
    return S.detSess.run({ x: t }).then(function (res) {
      t.dispose && t.dispose();
      var name = (S.detSess.outputNames && S.detSess.outputNames[0]) || Object.keys(res)[0];
      var out = res[name] || res[Object.keys(res)[0]];
      var boxes = ocrDetPostprocess(out.data, pre.width, pre.height, pre.ratio, pre.ow, pre.oh);
      return { boxes: boxes, pre: pre };
    }).catch(function (e) {
      t.dispose && t.dispose();
      throw e;
    });
  }

  /* ------------------------------------------------------------------ *
   * ④ 行分组 / 同行拼接 / rec 前处理
   * ------------------------------------------------------------------ */
  function ocrGroupLines(boxes) {
    if (!boxes.length) return [];
    var sorted = boxes.slice().sort(function (a, b) { return a.y - b.y || a.x - b.x; });
    var lines = [], cur = [sorted[0]], hSum = sorted[0].height, avg = sorted[0].height;
    for (var i = 1; i < sorted.length; i++) {
      var c = sorted[i], p = sorted[i - 1];
      if (Math.abs(c.y - p.y) <= avg * 0.5) {
        cur.push(c); hSum += c.height; avg = hSum / cur.length;
      } else {
        cur.sort(function (a, b) { return a.x - b.x; });
        lines.push(cur); cur = [c]; hSum = c.height; avg = c.height;
      }
    }
    if (cur.length) { cur.sort(function (a, b) { return a.x - b.x; }); lines.push(cur); }
    return lines;
  }
  function ocrCropBox(canvas, box) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, box.width); c.height = Math.max(1, box.height);
    var cx = c.getContext('2d', { willReadFrequently: true });
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
    cx.drawImage(canvas, box.x, box.y, box.width, box.height, 0, 0, c.width, c.height);
    return c;
  }
  function ocrRotateTall(crop) {
    if (!REC.rotateVerticalCrops) return crop;
    if (crop.height / crop.width < 1.5) return crop;
    var r = document.createElement('canvas');
    r.width = crop.height; r.height = crop.width;
    var c = r.getContext('2d');
    c.translate(0, crop.width); c.rotate(-Math.PI / 2);
    c.drawImage(crop, 0, 0);
    return r;
  }
  var MAX_BOX_STRETCH = 4, MAX_MERGED_WIDTH = 16384;
  function ocrMergeLineCrop(canvas, lineBoxes) {
    var minY = 1e9, maxB = -1e9, i;
    for (i = 0; i < lineBoxes.length; i++) {
      var b = lineBoxes[i];
      if (b.y < minY) minY = b.y;
      if (b.y + b.height > maxB) maxB = b.y + b.height;
    }
    var commonH = Math.max(1, maxB - minY);
    var gap = Math.max(1, Math.round(commonH * 0.4));
    var widths = lineBoxes.map(function (e) {
      return Math.max(1, Math.round(e.width * Math.min(commonH / e.height, MAX_BOX_STRETCH)));
    });
    var total = widths.reduce(function (a, b) { return a + b; }, 0) + gap * (lineBoxes.length - 1);
    if (total > MAX_MERGED_WIDTH) {
      var k = MAX_MERGED_WIDTH / total;
      widths = widths.map(function (w) { return Math.max(1, Math.round(w * k)); });
      gap = Math.max(1, Math.floor(gap * k));
    }
    var cw = widths.reduce(function (a, b) { return a + b; }, 0) + gap * (lineBoxes.length - 1);
    var out = document.createElement('canvas');
    out.width = cw; out.height = commonH;
    var ctx = out.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, cw, commonH);
    var off = 0, cropWidths = [];
    for (i = 0; i < lineBoxes.length; i++) {
      var e = lineBoxes[i], sw = widths[i];
      var c = ocrCropBox(canvas, e);
      ctx.drawImage(c, 0, 0, e.width, e.height, off, 0, sw, commonH);
      var trail = i < lineBoxes.length - 1 ? gap : 0;
      cropWidths.push(sw + trail);
      off += sw + trail;
    }
    return { canvas: out, cropWidths: cropWidths };
  }
  function ocrRecPreprocess(crop, optH) {
    var h = (optH && optH >= 32) ? Math.round(optH) : REC.imageHeight;
    var ar = crop.width / crop.height;
    var w = Math.max(8, Math.round(h * ar));
    var rs = document.createElement('canvas');
    rs.width = w; rs.height = h;
    var ctx = rs.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(crop, 0, 0, crop.width, crop.height, 0, 0, w, h);
    var d = ctx.getImageData(0, 0, w, h).data;
    var n = w * h, t = new Float32Array(3 * n), AB = ocrRecNorm();
    /* 取 R 通道当灰度，再复制到三通道 */
    for (var i = 0, p = 0; i < n; i++, p += 4) t[i] = (d[p] || 0) * AB[0] + AB[1];
    t.copyWithin(n, 0, n);
    t.copyWithin(2 * n, 0, n);
    return { tensor: t, w: w, h: h };
  }

  /* ------------------------------------------------------------------ *
   * ⑤ CTC 解码（greedy 口径）
   * ------------------------------------------------------------------ */
  var BLANK = 0;
  function ocrCharClass(ch) {
    if (/\p{L}/u.test(ch)) return 0;
    if (/\p{N}/u.test(ch)) return 1;
    return 2;
  }
  function ocrInjectGapSpaces(chars, pos) {
    if (chars.length < 4) return;
    var deltas = [], i;
    for (i = 1; i < pos.length; i++) deltas.push(pos[i] - pos[i - 1]);
    var sorted = deltas.slice().sort(function (a, b) { return a - b; });
    var median = sorted[Math.floor(sorted.length / 2)] || 0;
    if (median <= 0) return;
    var quantum = 0;
    for (i = 0; i < sorted.length; i++) if (sorted[i] > 0) { quantum = sorted[i]; break; }
    if (quantum <= 0) return;
    for (i = chars.length - 1; i >= 1; i--) {
      var prev = pos[i - 1] || 0, cur = pos[i] || 0;
      var k = ocrCharClass(chars[i] || '') === ocrCharClass(chars[i - 1] || '') ? 2.5 : 1.5;
      if (cur - prev > median + k * quantum &&
        chars[i] !== ' ' && chars[i - 1] !== ' ' && chars[i] !== chars[i - 1]) {
        chars.splice(i, 0, ' ');
        pos.splice(i, 0, (prev + cur) / 2);
      }
    }
  }
  var CJK = /[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/;
  function ocrRefineChars(chars, pos) {
    for (var i = chars.length - 1; i >= 1; i--) {
      if (chars[i] === ' ' && chars[i - 1] === ' ') { chars.splice(i, 1); pos.splice(i, 1); }
    }
    if (CJK.test(chars.join(''))) return;      /* 含中文就不做全角转半角 */
    for (var j = 0; j < chars.length; j++) {
      var code = chars[j] ? chars[j].codePointAt(0) : 0;
      if (code >= 65281 && code <= 65374) chars[j] = String.fromCodePoint(code - 65248);
      else if (code === 12288) chars[j] = ' ';
    }
  }
  function ocrAlignDict(dict, numClasses) {
    if (dict.length === numClasses) return dict;
    var entries = dict.slice();
    while (entries.length && entries[entries.length - 1] === '') entries.pop();
    if (entries.length === numClasses) return entries;
    var aligned = [''].concat(entries[0] === '' ? entries.slice(1) : entries);
    if (aligned.length === numClasses - 1) aligned.push('');
    return aligned;
  }
  function ocrCtcDecode(logits, T, C, dict) {
    var d = ocrAlignDict(dict, C), dictLen = d.length, lastIdx = dictLen - 1;
    var out = [], last = -1, sum = 0, cnt = 0, pos = [];
    for (var t = 0; t < T; t++) {
      var base = t * C, best = logits[base], bi = 0;
      for (var c = 1; c < C; c++) {
        var v = logits[base + c];
        if (v > best) { best = v; bi = c; }
      }
      if (bi === BLANK || bi === last) { last = bi; continue; }
      if (bi >= 0 && bi < dictLen) {
        var ch = d[bi] || '';
        if (bi === lastIdx) {
          if (ch !== '<unk>') { out.push(' '); sum += best; cnt++; pos.push((t + 0.5) / T); }
        } else {
          out.push(ch); sum += best; cnt++; pos.push((t + 0.5) / T);
        }
      }
      last = bi;
    }
    ocrInjectGapSpaces(out, pos);
    ocrRefineChars(out, pos);
    return { text: out.join(''), conf: cnt > 0 ? sum / cnt : 0, positions: pos };
  }
  function ocrSplitByPositions(text, positions, segWidths) {
    var chars = Array.from(text);
    if (positions.length !== chars.length || !segWidths.length) {
      if (segWidths.length === 1) return [text];
      var total = segWidths.reduce(function (a, b) { return a + b; }, 0);
      var cw = chars.length ? total / chars.length : 0;
      var res = [], idx = 0;
      for (var i = 0; i < segWidths.length; i++) {
        if (i === segWidths.length - 1) { res.push(chars.slice(idx).join('')); break; }
        var ideal = Math.min(idx + Math.round(segWidths[i] / cw), chars.length);
        var cut = ideal, skip = false;
        for (var dd = 0; dd <= 4 && !skip; dd++) {
          var cands = [ideal - dd, ideal + dd];
          for (var q = 0; q < cands.length; q++) {
            var cd = cands[q], ch = chars[cd];
            if (cd > idx && cd < chars.length && ch !== undefined && /\s/.test(ch)) {
              cut = cd; skip = true; break;
            }
          }
        }
        res.push(chars.slice(idx, cut).join(''));
        idx = skip ? cut + 1 : cut;
      }
      return res;
    }
    var tot = segWidths.reduce(function (a, b) { return a + b; }, 0);
    var out = segWidths.map(function () { return ''; });
    var seg = 0, segEnd = segWidths[0] / tot;
    for (var k = 0; k < chars.length; k++) {
      var p = positions[k] || 0;
      while (p >= segEnd && seg < segWidths.length - 1) { seg++; segEnd += segWidths[seg] / tot; }
      out[seg] += chars[k] || '';
    }
    return out;
  }
  async function ocrRecOne(crop, optH) {
    var p = ocrRecPreprocess(crop, optH);
    var t = new S.ort.Tensor('float32', p.tensor, [1, 3, p.h, p.w]);
    var res;
    try { res = await S.recSess.run({ x: t }); }
    finally { t.dispose && t.dispose(); }
    var name = (S.recSess.outputNames && S.recSess.outputNames[0]) || Object.keys(res)[0];
    var out = res[name] || res[Object.keys(res)[0]];
    var T = out.dims[1], C = out.dims[2];
    var dec = ocrCtcDecode(out.data, T, C, S.dict);
    return dec.text ? { text: dec.text, conf: dec.conf, positions: dec.positions } : null;
  }

  /* ------------------------------------------------------------------ *
   * ⑥ 行级清洗 + 分区（识别后文本后处理，本通道必须补齐的部分）
   * ------------------------------------------------------------------ */
  function ocrCleanItemText(t) {
    var s = String(t == null ? '' : t).trim();
    /* ① 行首被读成数字的锁/图标：「6收起武器时…」→「收起武器时…」
          只在紧跟连续中文、且这段里没有 % 时剥离，避免误伤 +112%触发时间 */
    var m = /^([0-9０-９@©®●○◉〇|｜\/\\_~*]+)(?=[\u4e00-\u9fff]{3,})/.exec(s);
    if (m && !/%/.test(m[1])) {
      var after = s.slice(m[1].length);
      if (after.length >= 4) s = after;
    }
    /* ② % 与词条名之间的符号噪声：「+122%@毒气伤害」→「+122%毒气伤害」 */
    s = s.replace(/([%％])[\s\u3000]*[^\u4e00-\u9fffA-Za-z0-9（(]+/g, '$1');
    /* ③ % 后误读出的 1-2 位数字（后面紧跟 ≥2 个汉字）：「+122%8毒气伤害」→「+122%毒气伤害」 */
    s = s.replace(/([%％])(\d{1,2})(?=[\u4e00-\u9fff]{2,})/g, '$1');
    /* ⑤ 派系倍率里数字 0 被读成字母 O/o/〇/○：「xO.51 对 Grineer 的伤害」→「x0.51 …」
          只在倍率符号 ×/x 之后、且紧跟 .数字 或 数字 时替换，
          不碰武器名（Lexi- / Visi-calidex / Corpus / Grineer）里的字母 O，
          也不碰「○46」这类循环数前缀 —— 否则会把合法倍率算成 ×-49.00 这种非法值。 */
    s = s.replace(/([×xX✕⨯])\s*([Oo〇○])(?=\.\d|\d)/g, function (m, a) { return a + '0'; });
    /* ④ 折行碎片：把「收起武器时弹匣每秒自」这类上半行与「动装填」下半行
          交给下游 ocr.js 的 mergeFragmentLines 处理；这里只保证不提前丢行 */
    return s;
  }
  /* 与 ocr.js 的 REGIONS_PCT 完全一致（level / name / affix） */
  var REGIONS = {
    level: { top: 0.02, bottom: 0.16, left: 0.68, right: 0.96 },
    name:  { top: 0.42, bottom: 0.70, left: 0.08, right: 0.92 },
    affix: { top: 0.55, bottom: 0.88, left: 0.06, right: 0.94 }
  };
  function ocrZoneOf(it, W, H) {
    var R = (S.regions && S.regions.level) ? S.regions : REGIONS;
    var cx = (it.box.x + it.box.width / 2) / W;
    var cy = (it.box.y + it.box.height / 2) / H;
    for (var k in R) {
      if (!Object.prototype.hasOwnProperty.call(R, k)) continue;
      var r = R[k];
      if (r && cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) return k;
    }
    return '';
  }
  function ocrRowsFromItems(items) {
    var W = (S.canvas && S.canvas.width) || 1;
    var H = (S.canvas && S.canvas.height) || 1;
    return items.map(function (it) {
      return {
        text: it.text,
        yc: it.box.y + it.box.height / 2,
        xc: it.box.x + it.box.width / 2,
        h: it.box.height,
        conf: it.conf,
        zone: ocrZoneOf(it, W, H),
        x0: it.box.x, x1: it.box.x + it.box.width,
        y0: it.box.y, y1: it.box.y + it.box.height
      };
    });
  }

  /* ------------------------------------------------------------------ *
   * ⑦ 主识别流程：det → 行分组 → rec → 清洗 → rows
   * ------------------------------------------------------------------ */
  async function ocrRecognize(canvas, onProg) {
    var t0 = performance.now();
    await onnxEnsure();
    var tLoad = performance.now() - t0;
    S.canvas = canvas;
    say(onProg, '检测文字行…');
    var tDet0 = performance.now();
    var det = await ocrDetBoxes(canvas);
    var boxes = det.boxes;
    var tDet = performance.now() - tDet0;

    say(onProg, '识别 ' + boxes.length + ' 个文字框…');
    var tRec0 = performance.now();
    var lines = ocrGroupLines(boxes), items = [];
    for (var li = 0; li < lines.length; li++) {
      var lb = lines[li];
      if (!lb.length) continue;
      if (lb.length === 1) {
        var crop1 = ocrRotateTall(ocrCropBox(canvas, lb[0]));
        var r1 = await ocrRecOne(crop1);
        if (r1) items.push({ text: r1.text, box: lb[0], conf: r1.conf });
      } else {
        var merged = ocrMergeLineCrop(canvas, lb);
        var r2 = await ocrRecOne(merged.canvas);
        if (!r2) continue;
        var pieces = ocrSplitByPositions(r2.text, r2.positions, merged.cropWidths);
        for (var bi = 0; bi < lb.length; bi++) {
          items.push({ text: (pieces[bi] || '').trim(), box: lb[bi], conf: r2.conf });
        }
      }
      if (li % 3 === 0) say(onProg, '识别第 ' + (li + 1) + '/' + lines.length + ' 行…');
    }
    var tRec = performance.now() - tRec0;

    /* 先做行级清洗，再决定留不留 */
    for (var ci = 0; ci < items.length; ci++) items[ci].text = ocrCleanItemText(items[ci].text);
    /* 不做一刀切置信度过滤（0.5 / 纯符号 0.8）——那会把整条词条行吞掉。
       只丢空白和极低置信的噪声，取舍交给 ocr.js 的规则引擎与紫卡铁律。 */
    var confMin = ocrConfMin();
    var kept = items.filter(function (it) {
      return it.text && String(it.text).trim() && it.conf >= confMin;
    });
    kept.sort(function (a, b) { return a.box.y - b.box.y || a.box.x - b.box.x; });

    var total = performance.now() - t0;
    var out = {
      items: kept, rawAll: items, dropped: items.length - kept.length,
      boxes: boxes.length, lines: lines.length,
      ms: { load: tLoad, det: tDet, rec: tRec, total: total },
      detInput: det.pre.width + '×' + det.pre.height,
      detTh: ocrDetTh(), confMin: confMin, ratio: det.pre.ratio
    };
    S.last = out;
    return out;
  }

  /* ------------------------------------------------------------------ *
   * ⑧ 数值复读（保留 __numVerify 输出路径，attachNumVerify 会消费）
   * ------------------------------------------------------------------ */
  var NUM_HEAD_RE = /^\s*([+\-−–—‐‑﹣×xX✕⨯*<>±]?\s*\d{1,4}(?:[.,]\d{1,3})?\s*%?)/;
  function ocrNumNorm(s) {
    return String(s || '').replace(/[−–—‐‑﹣]/g, '-').replace(/[^\d.,%+\-]/g, '').replace(/,/g, '.');
  }
  function ocrNumCore(s) {
    var m = ocrNumNorm(s).match(/\d+(?:\.\d+)?/);
    return m ? m[0] : '';
  }
  function ocrGlyphUnits(s) {
    var u = 0;
    for (var i = 0; i < String(s).length; i++) {
      var ch = String(s)[i], c = ch.codePointAt(0);
      if (c >= 0x4e00 && c <= 0x9fff) u += 1.0;
      else if (ch === ' ') u += 0.34;
      else if (/[0-9+\-.%×xX✕⨯]/.test(ch)) u += 0.56;
      else u += 0.62;
    }
    return u;
  }
  function ocrNumSpanOf(row, tok) {
    var w = row.x1 - row.x0;
    if (!(w > 8)) return null;
    var total = ocrGlyphUnits(row.text) || 1;
    var lead = ocrGlyphUnits(String(row.text).slice(0, String(row.text).indexOf(tok)));
    var own = ocrGlyphUnits(tok);
    var xa = row.x0 + w * (lead / total) - 2;
    var xb = row.x0 + w * ((lead + own) / total) + 3;
    if (!(xb - xa >= 8)) return null;
    return [Math.max(0, Math.round(xa)), Math.round(xb)];
  }
  async function ocrVerifyNumbers(templated, rows, band) {
    var H = templated.height, out = [], seen = Object.create(null);
    var b0 = band ? band[0] : 0.5, b1 = band ? band[1] : 0.84;
    var n = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (n >= 6) break;
      if (r.yc < H * b0 || r.yc > H * b1) continue;
      if (r.x0 == null || r.x1 == null || r.y0 == null) continue;
      var t = String(r.text || '');
      var dupKey = Math.round(r.yc / 10) + '|' + t;
      if (seen[dupKey]) continue;
      seen[dupKey] = 1;
      var m = t.match(NUM_HEAD_RE);
      if (!m) continue;
      var span = ocrNumSpanOf(r, m[1]);
      if (!span) continue;
      n++;
      var box = { x: span[0], y: r.y0 - 1,
        width: Math.max(2, span[1] - span[0]), height: Math.max(2, r.y1 - r.y0 + 2) };
      var crop = ocrCropBox(templated, box);
      var va = '', vb = '', vc = '';
      try { var a = await ocrRecOne(crop); va = ocrNumCore(a && a.text); } catch (e) { /* 复读失败不算冲突 */ void e; }
      try { var b = await ocrRecOne(crop, 64); vb = ocrNumCore(b && b.text); } catch (e2) { /* 同上 */ void e2; }
      var inText = ocrNumCore(m[1]);
      var suspect = '';
      if (va && va === inText) suspect = '';
      else if (vb && vb === inText) suspect = '';
      else if (va && vb && va === vb) suspect = va;
      else if (va || vb) {
        try {
          var lm = (typeof lumaMask === 'function') ? lumaMask(templated, 90) : templated;
          var c = await ocrRecOne(ocrCropBox(lm, box));
          vc = ocrNumCore(c && c.text);
        } catch (e3) { /* 掩膜版失败忽略 */ void e3; }
        if (vc && va && vc === va) suspect = va;
        else if (vc && vb && vc === vb) suspect = vb;
      }
      var rec = { y: Math.round(r.yc), from: inText,
        vals: [inText, suspect].filter(Boolean), conflict: !!suspect };
      if (suspect) r.numConflict = true;
      out.push(rec);
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * ⑨ 辅助：分界线 / 组合预判 / 卡片救援 / 调试图（保留全部输出路径）
   * ------------------------------------------------------------------ */
  function ocrFindDivider(canvas, rows) {
    return (typeof textBlockTop === 'function')
      ? textBlockTop(rows, canvas ? canvas.height : 0)
      : Math.round((canvas ? canvas.height : 800) * 0.45);
  }
  function ocrGuessCombo(rows, H, band) {
    var y0 = band ? band[0] : 0.55, y1 = band ? band[1] : 0.88;
    var n = (rows || []).filter(function (r) {
      return r.yc >= H * y0 && r.yc <= H * y1;
    }).length;
    window.__dividerRatio = n;
    if (n >= 4) return '3+1';
    if (n === 3) return '2+1';
    if (n === 2) return '1+1';
    return '?';
  }
  function ocrFixedZones() {
    return [
      { name: 'level', ry0: REGIONS.level.top, ry1: REGIONS.level.bottom,
        rx0: REGIONS.level.left, rx1: REGIONS.level.right },
      { name: 'name', ry0: REGIONS.name.top, ry1: REGIONS.name.bottom,
        rx0: REGIONS.name.left, rx1: REGIONS.name.right },
      { name: 'affix', ry0: REGIONS.affix.top, ry1: REGIONS.affix.bottom,
        rx0: REGIONS.affix.left, rx1: REGIONS.affix.right }
    ];
  }
  /* fitToTemplate 走 full / 形状异常时，用 det 文字框救一次（保留 __fitRescue） */
  async function ocrCardRectFromText(img) {
    var W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    if (!W || !H) return null;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    cv.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0);
    var det = await ocrDetBoxes(cv);
    var bs = det.boxes;
    if (!bs || bs.length < 3) return null;
    var y0 = 1e9, y1 = -1e9, x0 = 1e9, x1 = -1e9;
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i];
      if (b.x < x0) x0 = b.x;
      if (b.x + b.width > x1) x1 = b.x + b.width;
      if (b.y < y0) y0 = b.y;
      if (b.y + b.height > y1) y1 = b.y + b.height;
    }
    if (!(y1 > y0) || (y1 - y0) < H * 0.25) return null;
    var px = (x1 - x0) * 0.06, py = (y1 - y0) * 0.10;
    return [Math.max(0, x0 - px), Math.max(0, y0 - py),
      Math.min(W, x1 + px), Math.min(H, y1 + py)];
  }
  function ocrStepImages(templated, ZONES, divY) {
    try {
      var debugCanvas = document.createElement('canvas');
      debugCanvas.width = templated.width; debugCanvas.height = templated.height;
      var dcx = debugCanvas.getContext('2d');
      dcx.drawImage(templated, 0, 0);
      /* 红线 = 分界线 */
      dcx.strokeStyle = '#ff3333'; dcx.lineWidth = 2;
      dcx.beginPath(); dcx.moveTo(0, divY); dcx.lineTo(debugCanvas.width, divY); dcx.stroke();
      /* 黄框 = 分区 */
      dcx.strokeStyle = '#ffff00'; dcx.lineWidth = 2;
      for (var i = 0; i < ZONES.length; i++) {
        var z = ZONES[i];
        dcx.strokeRect(z.rx0 * debugCanvas.width, z.ry0 * debugCanvas.height,
          (z.rx1 - z.rx0) * debugCanvas.width, (z.ry1 - z.ry0) * debugCanvas.height);
      }
      /* 绿框 = det 文字框（新识别内容的可视化） */
      dcx.strokeStyle = '#33ff88'; dcx.lineWidth = 1;
      var bs = (S.last && S.last.rawAll) ? S.last.rawAll : [];
      for (var j = 0; j < bs.length; j++) {
        var b = bs[j].box;
        dcx.strokeRect(b.x, b.y, b.width, b.height);
      }
      window.__stepImages = {
        aligned: templated.toDataURL(),
        mask: (typeof lumaMask === 'function' ? lumaMask(templated, 90) : templated).toDataURL(),
        zones: debugCanvas.toDataURL()
      };
    } catch (e) { ZKwarn('ocr_engine:stepImages', e); }
  }

  /* ------------------------------------------------------------------ *
   * ⑩ onnxFullRows —— ocr.js recognize 的唯一入口
   *    返回 { rows, templated, pol, zones }，并写全所有诊断输出
   * ------------------------------------------------------------------ */
  async function onnxFullRows(imgEl, opts) {
    opts = opts || {};
    var onProg = opts.onProgress || function () {};
    var __P = window.__ocrProfile
      ? (window.__ocrPhases = window.__ocrPhases || { wake: 0, det: 0, rec: 0, parse: 0 }) : null;

    var __tw = __P ? performance.now() : 0;
    say(onProg, '正在识别…');
    await onnxEnsure();
    if (__P) __P.wake += performance.now() - __tw;
    var __td = __P ? performance.now() : 0;

    /* ① 对齐 / 拉正 / 贴模板（preprocess.js，与识别引擎解耦） */
    var templated = fitToTemplate(imgEl);
    window.__fitAr = null; window.__fitWhy = ''; window.__fitRescue = null;
    try {
      var fit = templated.__fit || {};
      var ar = fit.ar;
      window.__fitAr = (typeof ar === 'number' && isFinite(ar)) ? ar : null;
      var badShape = (typeof ar === 'number') && isFinite(ar) && (ar < 0.25 || ar > 2.0);
      if (fit.mode === 'full' || badShape) {
        var rect = await ocrCardRectFromText(imgEl);
        if (rect) {
          templated = fitToTemplate(imgEl, rect);
          window.__fitRescue = rect;
        }
        window.__fitWhy = fit.mode === 'full' ? 'full' : (badShape ? 'shape' : '');
      }
      window.__fitMode = templated.__fit ? templated.__fit.mode : '';
    } catch (e) { ZKwarn('ocr_engine:fit', e); }
    var H = templated.height;

    /* ② 识别极性（保留 PolarOCR.detect 输出路径） */
    var polInfo = null;
    try {
      if (window.PolarOCR && window.PolarOCR.detect) {
        polInfo = await window.PolarOCR.detect(templated);
        window.__polar = polInfo;
      }
    } catch (ePol) { polInfo = null; }

    /* ③ det + rec → rows（含行级清洗 / zone / 低置信兜底） */
    var out = await ocrRecognize(templated, onProg);
    var rows = ocrRowsFromItems(out.items);
    S.regions = (window.RivenOCR && window.RivenOCR.__regions) || S.regions || REGIONS;

    /* ④ 分界线 / 组合 / 分区（原样保留调试输出） */
    var divY = ocrFindDivider(templated, rows);
    var ZONES = ocrFixedZones();
    var affixBand = [ZONES[2].ry0, ZONES[2].ry1];
    var combo = ocrGuessCombo(rows, H, affixBand);
    window.__comboGuess = combo;
    window.__divY = divY;
    window.__textRows = rows.length;
    window.__textRowsArr = rows.map(function (r) {
      return [Math.round(r.yc), Math.round((r.y1 - r.y0) * 10) / 10, r.text];
    });
    window.__zones = ZONES;
    window.__zoneSplit = '';
    window.__zoneDbg = { n: rows.length, band: rows.length, medH: 0, why: 'ocr-fixed' };
    window.__affixFirst = rows.filter(function (r) {
      return r.yc >= H * affixBand[0] && r.yc <= H * affixBand[1];
    }).length;
    window.__validAffix = rows.filter(function (r) { return /\d/.test(r.text || ''); }).length;
    window.__hasName = rows.some(function (r) {
      return r.zone === 'name' && (r.text || '').trim() && (r.conf || 0) > 0.3;
    });
    window.__shaky = false; window.__shakyWhy = [];
    window.__ocrRetry = ''; window.__nameRetry = null; window.__ocrRounds = 0;
    if (__P) __P.det += performance.now() - __td;

    /* ⑤ 数值复读（__numVerify → attachNumVerify） */
    if (opts.numCheck !== false && (typeof window === 'undefined' || window.__ocrNumCheck !== false)) {
      var __tn = __P ? performance.now() : 0;
      try {
        window.__numVerify = (window.__numVerify || []).concat(
          await ocrVerifyNumbers(templated, rows, affixBand));
      } catch (e) { ZKwarn('ocr_engine:numverify', e); }
      if (__P) { window.__ocrPhases = window.__ocrPhases || { wake: 0, det: 0, rec: 0, parse: 0 }; window.__ocrPhases.num = (window.__ocrPhases.num || 0) + (performance.now() - __tn); }
    }

    /* ⑥ 演示图：①对齐后 ②二值掩膜 ③④分界线+分区框（保留「显示识别」三张图） */
    ocrStepImages(templated, ZONES, divY);

    window.__ocrRowsFinal = rows.map(function (r) {
      return [Math.round(r.yc), Math.round(r.y1 - r.y0), r.zone || '', r.text || ''];
    });
    /* ⑦ 把新识别内容挂到这里，ocr.js 的「显示识别」会读它 */
    window.__ocrLast = {
      engine: 'PP-OCRv6 tiny（本地内嵌 ONNX，gzip+base64 完全离线）',
      model: 'PP-OCRv6_tiny det+rec .onnx · 字典 ' + (S.dict ? S.dict.length : 0) + ' 行',
      detInput: out.detInput, detTh: out.detTh, confMin: out.confMin,
      lines: out.items.length, boxes: out.boxes, dropped: out.dropped,
      groups: out.lines, ms: out.ms,
      items: out.items.map(function (it) {
        return {
          y: Math.round(it.box.y), x: Math.round(it.box.x),
          conf: it.conf, text: it.text,
          zone: ocrZoneOf(it, templated.width, templated.height)
        };
      }),
      zones: ZONES, divY: divY, combo: combo, pol: polInfo
    };
    return { rows: rows, templated: templated, pol: polInfo, zones: ZONES, ocr: out };
  }

  /* 供 ocr.js 的 probeText 使用（非 file:// 时优先于 inkBlocks） */
  async function onnxDetOnly(canvas) {
    await onnxEnsure();
    var det = await ocrDetBoxes(canvas);
    return det.boxes.map(function (b) {
      return {
        x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height,
        w: b.width, h: b.height,
        cx: b.x + b.width / 2, cy: b.y + b.height / 2, n: b.width * b.height
      };
    });
  }

  /* ------------------------------------------------------------------ *
   * ⑪ 对外导出（一个识别模块，接口名与旧引擎保持一致，ocr.js/app.js 不用改）
   * ------------------------------------------------------------------ */
  window.ortBoot = ortBoot;
  window.onnxEnsure = onnxEnsure;
  window.onnxFullRows = onnxFullRows;
  window.onnxDetOnly = onnxDetOnly;
  window.__ortBootTest = ortBoot;
  window.__onnxSelfTest = onnxEnsure;
  window.__onnxPreload = function () { return onnxEnsure(true).catch(function (e) { void e; }); };
  window.__wakeOnnx = wakeOnnx;
  window.__onnxState = function () {
    return {
      boot: !!S.ort, det: !!S.detSess, rec: !!S.recSess,
      dict: S.dict ? S.dict.length : 0,
      gentle: S.gentle, pending: !!S.ensurePromise, engine: 'local'
    };
  };
  window.__ocrEngine = 'local';
  window.__OCR_ENGINE = {
    run: ocrRecognize,
    ensure: onnxEnsure,
    state: S,
    engine: 'local',
    setDetTh: function (v) { if (isFinite(v)) window.__OCR_DETTH = +v; },
    setConfMin: function (v) { if (isFinite(v)) window.__OCR_CONFMIN = +v; }
  };
})();
