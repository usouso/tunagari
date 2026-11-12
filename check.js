'use strict';
/*
 * check.js — 画面の機械検査。画面のない Chrome（ヘッドレス）で ?auto=1 を開き、ボットに画面を通して遊ばせる。
 *   実行: node check.js          （全部）
 *         node check.js quick    （少なめ）
 * 失敗にするもの（終了コード1）:
 *   ページのエラー / 決着まで行かない / 表示と計算のずれ / 予想と結果のずれ /
 *   文字の重なり / 画面からのはみ出し / 文字の切れ / パソコン寸法でのページのスクロール
 * 画面の写真は screenshots/ に保存する。
 * 注意: これは自動プレイの検査。人が実際にクリックして通す確認は別（REPORT.md を見る）。
 */
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { execFile } = require('child_process');
const ROOT = __dirname;
const CHROME = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && fs.existsSync(p));
const quick = process.argv[2] === 'quick';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function chrome(args) {
  return new Promise(res => {
    execFile(CHROME, args, { timeout: 90000, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => res({ err, stdout: String(stdout), stderr: String(stderr) }));
  });
}
async function main() {
  if (!CHROME) { console.log('環境制約: Chrome が見つからない（CHROME にパスを入れてください）'); process.exit(2); }
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const f = path.join(ROOT, path.normalize(p));
    if (p === '/__frame') { // スマホの大きさは、375×812 の枠の中にページを入れて確かめる（ヘッドレスの窓は幅500より小さくできない）
      const q = req.url.split('?')[1] || '';
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      res.end(`<!doctype html><meta charset="utf-8"><body style="margin:0;background:#444"><iframe id="f" src="/?${q}" style="width:375px;height:812px;border:0;display:block"></iframe><script>const t=setInterval(()=>{try{const p=document.getElementById('f').contentDocument.getElementById('check-out');if(p){const o=document.createElement('pre');o.id='check-out';o.hidden=true;o.textContent=p.textContent;document.body.appendChild(o);clearInterval(t);}}catch(e){}},30);</script>`);
      return;
    }
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(fs.readFileSync(f));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tsunagari-check-'));
  const common = ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--mute-audio', '--hide-scrollbars', `--user-data-dir=${profile}`, '--virtual-time-budget=60000'];
  fs.mkdirSync(path.join(ROOT, 'screenshots'), { recursive: true });

  // 窓の大きさと中身の大きさの差をはかる（ヘッドレスでも窓のふちの分だけ小さくなる）
  const probe = await chrome(common.concat(['--window-size=1000,800', '--dump-dom', base + '?auto=1']));
  const pm = /<pre id="check-out"[^>]*>([\s\S]*?)<\/pre>/.exec(probe.stdout);
  const pk = pm ? JSON.parse(pm[1].replace(/&quot;/g, '"')) : { w: 1000, h: 800 };
  const DW = 1000 - pk.w, DH = 800 - pk.h;
  console.log(`窓と中身の差: 幅${DW} 高さ${DH}`);
  const SIZES = [['pc1366', 1366, 650, true], ['pc1920', 1920, 910, true], ['phone', 375, 812, false]];
  const ENEMIES = ['golem', 'hunter', 'hydra', 'mage', 'berserk'];
  const seeds = quick ? [11] : [11, 222, 3333];
  const cases = [];
  for (const [sn, w, h, pc] of SIZES) {
    cases.push({ name: `${sn} タイトル`, sn, w, h, pc, q: 'auto=1', title: true });
    for (const id of ENEMIES) for (const seed of (sn === 'pc1366' ? seeds : [seeds[0]])) cases.push({ name: `${sn} ${id} 種${seed} 通し`, sn, w, h, pc, q: `auto=1&speed=0&enemy=${id}&seed=${seed}` });
    for (const id of (quick ? ['mage'] : ENEMIES)) cases.push({ name: `${sn} ${id} 6ターン目で止める`, sn, w, h, pc, q: `auto=1&speed=0&enemy=${id}&seed=11&stop=6`, stop: true });
  }
  let fail = 0, n = 0; const rows = [];
  for (const c of cases) {
    n++;
    const win = c.pc ? `--window-size=${c.w + DW},${c.h + DH}` : `--window-size=${500 + DW},${c.h + DH}`;
    const url = base + (c.pc ? '?' : '__frame?') + c.q;
    const r = await chrome(common.concat([win, '--dump-dom', url]));
    const m = /<pre id="check-out"[^>]*>([\s\S]*?)<\/pre>/.exec(r.stdout);
    const bad = [];
    let k = null;
    if (!m) bad.push('検査の結果が書かれていない（ページが動いていない）');
    else {
      k = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
      if (k.errors.length) bad.push('ページのエラー ' + k.errors.join(' / '));
      if (!c.title && !c.stop && !(k.done && k.result && (k.result.phase === 'won' || k.result.phase === 'lost'))) bad.push('決着まで行かなかった');
      if (c.stop && !k.stopped && !k.done) bad.push('止まる所まで行かなかった');
      if (k.mismatches.length) bad.push('表示と計算のずれ ' + k.mismatches.slice(0, 3).join(' / '));
      const L = k.layout;
      if (L.overlaps) bad.push(`文字の重なり ${L.overlaps}（${L.notes.slice(0, 3).join(' / ')}）`);
      if (L.offscreen) bad.push(`はみ出し ${L.offscreen}（${L.notes.slice(0, 3).join(' / ')}）`);
      if (L.clipped) bad.push(`文字の切れ ${L.clipped}（${L.notes.slice(0, 3).join(' / ')}）`);
      if (c.pc && L.pageScroll > 0) bad.push(`ページのスクロール ${L.pageScroll}px`);
      if (k.w !== c.w || k.h !== c.h) bad.push(`画面の大きさが指定とちがう（${k.w}x${k.h}）`);
    }
    if (bad.length) fail++;
    const info = k ? `${k.w}x${k.h} ${k.result ? k.result.phase + ' ' + k.result.turn + 'T' : (k.stopped ? '止' : '')} ターン検査${k.turns} 配置検査${k.layout.samples}` : '';
    rows.push(`${bad.length ? '✗' : '✓'} ${c.name}  ${info}${bad.length ? '\n    → ' + bad.join('\n    → ') : ''}`);
    console.log(rows[rows.length - 1]);
    if (c.title || c.stop || /種11 通し/.test(c.name)) {
      const file = path.join(ROOT, 'screenshots', `${c.sn}-${c.title ? 'title' : c.q.match(/enemy=(\w+)/)[1] + (c.stop ? '-turn6' : '-result')}.png`);
      await chrome(common.concat([win, `--screenshot=${file}`, url]));
    }
  }
  server.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* 残っても害はない */ }
  console.log(`\n画面の検査: ${n - fail} / ${n} 合格、失敗 ${fail}`);
  process.exit(fail ? 1 : 0);
}
main();
