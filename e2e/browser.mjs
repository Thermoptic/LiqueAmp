// Headless Chromium (Chrome or Edge) driven over the DevTools protocol.
// No test framework or browser download: it uses a browser already on the
// machine, in a throwaway profile that is deleted afterwards.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = {
  chrome: [
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ],
  edge: [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/microsoft-edge',
  ],
};

/** LIQUEAMP_BROWSER=<path> overrides; otherwise the first installed Chrome/Edge. */
export function findBrowsers() {
  if (process.env.LIQUEAMP_BROWSER) return [{ name: 'custom', path: process.env.LIQUEAMP_BROWSER }];
  return Object.entries(CANDIDATES)
    .map(([name, paths]) => ({ name, path: paths.find((p) => p && existsSync(p)) }))
    .filter((b) => b.path);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch(browserPath, port) {
  const profile = mkdtempSync(join(tmpdir(), 'liqueamp-e2e-'));
  const child = spawn(
    browserPath,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      // real audio output is not needed; playback still runs and is measurable
      '--autoplay-policy=no-user-gesture-required',
      '--mute-audio',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  let target;
  for (let i = 0; i < 100 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t) => t.type === 'page');
    } catch {
      /* not up yet */
    }
    if (!target) await sleep(150);
  }
  if (!target) {
    child.kill();
    throw new Error(`Browser did not start: ${browserPath}`);
  }
  const page = await connect(target.webSocketDebuggerUrl);
  const close = async () => {
    page.close();
    child.kill();
    await sleep(800);
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      /* browser still releasing files; the OS temp folder will clean up */
    }
  };
  return { page, close };
}

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(`${msg.error.message}`)) : resolve(msg.result);
    } else if (msg.method) {
      for (const fn of listeners.get(msg.method) ?? []) fn(msg.params);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      pending.set(n, { resolve, reject });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const on = (method, fn) => listeners.set(method, [...(listeners.get(method) ?? []), fn]);

  /** Evaluates an async function body in the page; returns its JSON value. */
  const evaluate = async (body) => {
    const r = await send('Runtime.evaluate', { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };

  /** Real mouse click in the middle of the first element matching `selector`. */
  const click = async (selector) => {
    const box = await evaluate(`
      const el = ${selector.startsWith('//') ? `document.evaluate(${JSON.stringify(selector)}, document, null, 9, null).singleNodeValue` : `document.querySelector(${JSON.stringify(selector)})`};
      if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
    if (!box) throw new Error(`Not found: ${selector}`);
    for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
  };

  const key = async (keyName, code, text) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code, text, windowsVirtualKeyCode: keyName === ' ' ? 32 : keyName.toUpperCase().charCodeAt(0) });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code, windowsVirtualKeyCode: keyName === ' ' ? 32 : keyName.toUpperCase().charCodeAt(0) });
  };

  await send('Page.enable');
  await send('Runtime.enable');
  return { send, on, evaluate, click, key, close: () => ws.close() };
}
