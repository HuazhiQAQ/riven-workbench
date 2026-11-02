/* cdp.cjs —— 无头 Chrome + CDP 的最小工具层（Node 22 自带 WebSocket / fetch，不装任何依赖）
 *
 * 被 debug/ocr_e2e.cjs（真卡 OCR 端到端）与 debug/wash_n_e2e.cjs（洗 N 次 UI 回归）共用。
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function toFileUrl(p, hash) {
  let s = path.resolve(p).replace(/\\/g, '/');
  if (!s.startsWith('/')) s = '/' + s;
  const u = 'file:///' + s.split('/').map(seg => encodeURIComponent(seg).replace(/%3A/gi, ':')).join('/');
  return hash ? u + hash : u;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* 最新产物解析：探针不传参时用它，避免把某一天的成品名写死。
 * 优先 产物/ 下的模拟器 HTML，其次 dist/；都按 mtime 取最新，排除备份名。 */
function latestProduct() {
  const root = path.join(__dirname, '..');
  for (const dir of ['产物', 'dist']) {
    const d = path.join(root, dir);
    let files;
    try { files = fs.readdirSync(d); } catch (e) { continue; }
    let best = null, bm = -1;
    for (const f of files) {
      if (!/模拟器.*\.html$/.test(f) || /备份|_无对比/.test(f)) continue;
      const m = fs.statSync(path.join(d, f)).mtimeMs;
      if (m > bm) { bm = m; best = f; }
    }
    if (best) return path.join(d, best);
  }
  throw new Error('找不到产物：web/产物 与 web/dist 下都没有模拟器 html');
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.logs = [];
    this.ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.id && this.pending.has(msg.id)) {
        const { res, rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) rej(new Error(JSON.stringify(msg.error)));
        else res(msg.result);
      } else if (msg.method === 'Runtime.consoleAPICalled') {
        const txt = (msg.params.args || []).map(a => a.value !== undefined ? a.value : (a.description || a.type)).join(' ');
        this.logs.push('[console.' + msg.params.type + '] ' + txt);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails || {};
        this.logs.push('[exception] ' + ((d.exception && (d.exception.description || d.exception.value)) || d.text));
      }
    });
    this.ready = new Promise((res, rej) => {
      this.ws.addEventListener('open', res);
      this.ws.addEventListener('error', (e) => rej(new Error('WS 连接失败: ' + (e.message || ''))));
    });
  }
  send(method, params) {
    const id = ++this.id;
    const p = new Promise((res, rej) => this.pending.set(id, { res, rej }));
    this.ws.send(JSON.stringify({ id, method, params: params || {} }));
    return p;
  }
  async eval(expr, opts) {
    const o = opts || {};
    const r = await this.send('Runtime.evaluate', {
      expression: expr, awaitPromise: !!o.awaitPromise, returnByValue: true,
      timeout: o.timeout || 240000, userGesture: true
    });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error('页面抛错: ' + ((d.exception && (d.exception.description || d.exception.value)) || d.text));
    }
    return r.result ? r.result.value : undefined;
  }
  close() { try { this.ws.close(); } catch (e) {} }
}

/* 打开一个页面（file://），返回 { cdp, kill } */
async function openPage(url) {
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-cdp-'));
  const portFile = path.join(udd, 'DevToolsActivePort');
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-sync', '--disable-extensions',
    '--allow-file-access-from-files', '--remote-debugging-port=0',
    '--user-data-dir=' + udd, url
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  let chromeErr = '';
  chrome.stderr.on('data', d => { chromeErr += d.toString(); });

  let port = null;
  for (let i = 0; i < 120; i++) {
    if (fs.existsSync(portFile)) {
      const t = fs.readFileSync(portFile, 'utf8').split('\n');
      if (t[0]) { port = parseInt(t[0].trim(), 10); break; }
    }
    await sleep(250);
  }
  if (!port) {
    chrome.kill('SIGKILL');
    throw new Error('Chrome 没起来:\n' + chromeErr.slice(-2000));
  }

  let list = null;
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + port + '/json/list');
      list = await r.json();
      if (list && list.length) break;
    } catch (e) { /* 还没起来 */ }
    await sleep(250);
  }
  const page = (list || []).find(t => t.type === 'page');
  if (!page) {
    chrome.kill('SIGKILL');
    throw new Error('找不到 page target');
  }
  const cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  return {
    cdp, chrome,
    kill() {
      try { cdp.close(); } catch (e) {}
      try { chrome.kill('SIGKILL'); } catch (e) {}
      try { fs.rmSync(udd, { recursive: true, force: true }); } catch (e) {}
    }
  };
}

module.exports = { CHROME, toFileUrl, sleep, CDP, openPage, latestProduct };
