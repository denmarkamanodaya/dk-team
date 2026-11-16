#!/usr/bin/env node
// dk-watch — live browser view of a dk-agents team. Dependency-free Node ESM (Node ≥ 20).
// Receives hook events from hooks/h8-watch.mjs on POST /events, keeps the last MAX_EVENTS in
// memory (and appends them to a JSONL file), and streams them to the page over Server-Sent Events.
// Binds to 127.0.0.1 only. Usage: node server.mjs [--port 4777]   then open http://127.0.0.1:4777
import { createServer } from 'node:http';
import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const argPort = process.argv.indexOf('--port');
const PORT = Number(argPort > -1 ? process.argv[argPort + 1] : process.env.DK_WATCH_PORT ?? 4777);
const HOST = '127.0.0.1';
const MAX_EVENTS = 5000;
const MAX_BODY = 64 * 1024;
const LOG_DIR = process.env.DK_WATCH_DIR ?? join(tmpdir(), 'dk-watch');
mkdirSync(LOG_DIR, { recursive: true });
const LOG_FILE = join(LOG_DIR, `events-${new Date().toISOString().slice(0, 10)}.jsonl`);

const events = [];
const clients = new Set();
let seq = 0;

function record(ev) {
  const e = { seq: ++seq, at: Date.now(), ...ev };
  events.push(e);
  if (events.length > MAX_EVENTS) events.shift();
  try { appendFileSync(LOG_FILE, JSON.stringify(e) + '\n'); } catch { /* disk issues never stop the view */ }
  const line = `data: ${JSON.stringify(e)}\n\n`;
  for (const res of clients) res.write(line);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const page = () => readFileSync(join(HERE, 'index.html'));

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}`);
  if (req.method === 'POST' && url.pathname === '/events') {
    try {
      const ev = JSON.parse(await readBody(req));
      if (typeof ev !== 'object' || ev === null || typeof ev.event !== 'string') throw new Error('bad event');
      record(ev);
      res.writeHead(204).end();
    } catch (e) {
      res.writeHead(400, { 'content-type': 'text/plain' }).end(String(e.message));
    }
    return;
  }
  if (req.method === 'GET' && url.pathname === '/stream') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    res.write(': hello\n\n');
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/events') {
    const since = Number(url.searchParams.get('since') ?? 0);
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(events.filter((e) => e.seq > since)));
    return;
  }
  if (req.method === 'POST' && url.pathname === '/clear') {
    events.length = 0; record({ event: 'Cleared', agent: 'dk-watch' });
    res.writeHead(204).end();
    return;
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page());
    return;
  }
  res.writeHead(404).end();
});

server.listen(PORT, HOST, () => {
  console.log(`dk-watch on http://${HOST}:${PORT}  (log: ${LOG_FILE})`);
});
