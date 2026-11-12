'use strict';
// 確認用の小さなサーバー（自分のPCの中だけ: 127.0.0.1）。  実行: node server.js  → http://127.0.0.1:8437/
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = +(process.env.PORT || 8437), ROOT = __dirname;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.md': 'text/plain; charset=utf-8' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, path.normalize(p));
  if (!f.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data);
  });
}).listen(PORT, '127.0.0.1', () => console.log('http://127.0.0.1:' + PORT + '/'));
