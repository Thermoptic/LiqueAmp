// Local servers for the acceptance test:
//  - the production build, served like GitHub Pages (base path, 404.html
//    fallback with HTTP 404, no SPA rewrites)
//  - two audio servers with generated test signals: one sends CORS headers
//    (real analysis possible), one does not (analysis must be reported as
//    unavailable). Both support Range requests, so seeking works.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/** The base path the build was made for, read from its own index.html. */
export function detectBase(dist) {
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  const m = html.match(/src="([^"]*?)assets\//);
  return m ? m[1] : '/';
}

export function serveDist(dist, port) {
  const base = detectBase(dist);
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (!path.startsWith(base)) return res.writeHead(404).end('not found');
    let file = normalize(join(dist, path.slice(base.length)));
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!file.startsWith(normalize(dist)) || !existsSync(file)) {
      return res.writeHead(404, { 'content-type': 'text/html' }).end(readFileSync(join(dist, '404.html')));
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(port, () => resolve({ server, base, url: `http://localhost:${port}${base}` })));
}

/** 16-bit mono PCM WAV of `seconds` of signal. */
function wav(seconds, sample) {
  const rate = 22050;
  const n = rate * seconds;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(sample(i / rate) * 32767), 44 + i * 2);
  return buf;
}

let seed = 1;
const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

const FILES = {
  '/noise.wav': wav(60, () => 0.3 * random()),
  '/tone.wav': wav(60, (t) => 0.3 * Math.sin(2 * Math.PI * 440 * t)),
};

export function serveAudio(port, { cors }) {
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    const body = FILES[path];
    const headers = { 'content-type': 'audio/wav', 'accept-ranges': 'bytes' };
    if (cors) Object.assign(headers, { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'Content-Length, Content-Range' });
    if (!body) return res.writeHead(404, headers).end();
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
      res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${body.length}`, 'content-length': end - start + 1 });
      return res.end(body.subarray(start, end + 1));
    }
    res.writeHead(200, { ...headers, 'content-length': body.length }).end(body);
  });
  return new Promise((resolve) => server.listen(port, () => resolve({ server, url: `http://localhost:${port}` })));
}
