#!/usr/bin/env node
// Tiny reverse proxy that adds a fixed delay to every request (Issue #237).
//
// Used only by the "deliberate slowdown" experiment in
// .github/workflows/perf-budgets.yml: k6 is pointed at this proxy instead of
// the backend, and the job asserts that the budget gate FAILS. If the gate
// passes with injected latency, the budgets are not actually protecting us.
//
// Usage: node scripts/k6-latency-proxy.mjs --target http://localhost:4000 \
//          --port 4100 --delay-ms 750

import http from 'node:http';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);

const target = new URL(args.target || 'http://localhost:4000');
const port = Number(args.port || 4100);
const delayMs = Number(args['delay-ms'] || 750);

http
  .createServer((req, res) => {
    setTimeout(() => {
      const upstream = http.request(
        {
          hostname: target.hostname,
          port: target.port,
          path: req.url,
          method: req.method,
          headers: { ...req.headers, host: target.host },
        },
        (up) => {
          res.writeHead(up.statusCode || 502, up.headers);
          up.pipe(res);
        },
      );
      upstream.on('error', () => {
        res.writeHead(502);
        res.end('upstream error');
      });
      req.pipe(upstream);
    }, delayMs);
  })
  .listen(port, () => {
    console.log(`latency proxy :${port} -> ${target.origin} (+${delayMs}ms)`);
  });
