'use strict';
/*
 * check.js — 画面の機械検査。画面のない Chrome（ヘッドレス）で ?auto=1 を開き、ボットに画面を通して遊ばせる。
 *   実行: node check.js          （全部）
 *         node check.js quick    （少なめ）
 * 失敗にするもの（終了コード1）:
 *   ページのエラー / 決着まで行かない / 表示と計算のずれ / 予想と結果のずれ /
 *   文字の重なり / 画面からのはみ出し / 文字の切れ / パソコン寸法でのページのスクロール /
 *   置く前の「つながる数」の表示と、置いた後の本物のつながりのずれ / つながる相手の表示が出ない
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
  // 4つ目の pc1366x768 は、たて長めの窓（棚の札が大きくなる側）。場面を少なめにして回す
  const SIZES = [['pc1366', 1366, 650, true], ['pc1920', 1920, 910, true], ['phone', 375, 812, false], ['pc1366x768', 1366, 768, true, true]];
  // せまい窓（1024×768）は、盤面のマスが45pxほどになり、札の上の印が重なることがある（未対応。REPORT.md 12章）。
  // 確かめたいときは SIZES に ['pc1024', 1024, 768, true, true] を足して node check.js only=pc1024
  const ENEMIES = ['golem', 'hunter', 'hydra', 'mage', 'berserk'];
  const seeds = quick ? [11] : [11, 222, 3333];
  const cases = [];
  for (const [sn, w, h, pc, lite] of SIZES) {
    cases.push({ name: `${sn} タイトル`, sn, w, h, pc, q: 'auto=1', title: true });
    if (sn === 'pc1366' || sn === 'phone') cases.push({ name: `${sn} 場面：敵に毒・持続強化・ひとりの蓄積（直接つくった盤面）`, sn, w, h, pc, q: 'auto=1&speed=0&enemy=golem&seed=11&scene=kept', stop: true, scene: true });
    if (lite) {
      cases.push({ name: `${sn} golem 種11 通し`, sn, w, h, pc, q: 'auto=1&speed=0&enemy=golem&seed=11' });
      cases.push({ name: `${sn} golem 棚の札を選んだ画面（つながる相手の表示）`, sn, w, h, pc, q: 'auto=1&speed=0&enemy=golem&seed=11&stop=5&pick=1', stop: true, pick: true });
      continue;
    }
    for (const id of ENEMIES) for (const seed of (sn === 'pc1366' ? seeds : [seeds[0]])) cases.push({ name: `${sn} ${id} 種${seed} 通し`, sn, w, h, pc, q: `auto=1&speed=0&enemy=${id}&seed=${seed}` });
    cases.push({ name: `${sn} berserk でたらめ置き（負けの画面）`, sn, w, h, pc, q: 'auto=1&speed=0&enemy=berserk&seed=11&bot=random', lose: true });
    for (const id of (quick ? ['mage'] : ENEMIES)) cases.push({ name: `${sn} ${id} 6ターン目で止める`, sn, w, h, pc, q: `auto=1&speed=0&enemy=${id}&seed=11&stop=6`, stop: true });
    cases.push({ name: `${sn} golem 棚の札を選んだ画面（つながる相手の表示）`, sn, w, h, pc, q: 'auto=1&speed=0&enemy=golem&seed=11&stop=5&pick=1', stop: true, pick: true });
  }
  // node check.js only=pc1024 … 名前にその文字が入る場面だけ回す（直しの確かめ用。全体の合格には数えない）
  const only = (process.argv.find(a => a.startsWith('only=')) || '').slice(5);
  if (only) { const keep = cases.filter(c => c.name.indexOf(only) >= 0); cases.length = 0; cases.push(...keep); }
  if (!cases.length) { console.log(`✗ only=${only} に合う場面が1つもない（何も検査していないので、失敗にする）`); server.close(); process.exit(1); }
  let fail = 0, n = 0; const rows = []; const total = { place: 0, swap: 0, zero: 0, shop: 0, line: 0, dead: 0 };
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
      if (c.lose && !(k.result && k.result.phase === 'lost')) bad.push('負けの画面を確かめられなかった（負けなかった）');
      if (!c.title && !c.stop && !c.lose && !(k.zeroMoveChecks > 0)) bad.push('手数0のときの「つながる」表示の検査が、1回も動かなかった');
      if (c.pick && !(k.picked && k.picked.mates > 0 && k.picked.spots > 0)) bad.push('つながる相手の表示が出ていない（光る札・数字のマスがない）');
      if (c.scene && !(k.scene && k.scene.name)) bad.push('決まった場面の検査が動かなかった');
      if (c.pick && !(k.pickedSwap && k.pickedSwap.spots > 0)) bad.push('入れかえの「つながる」表示の検査が動かなかった');
      if (!c.title && !c.stop && !c.lose && !(k.placeChecks > 0)) bad.push('置く前の「つながる」表示の検査が、1回も動かなかった');
      if (k) { total.place += k.placeChecks || 0; total.swap += k.swapChecks || 0; total.zero += k.zeroMoveChecks || 0; total.shop += k.shopChecks || 0; total.line += k.lineChecks || 0; total.dead += k.deadSeen || 0; }
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
    if (c.title || c.stop || c.lose || /種11 通し/.test(c.name)) {
      const file = path.join(ROOT, 'screenshots', `${c.sn}-${c.title ? 'title' : c.q.match(/enemy=(\w+)/)[1] + (c.scene ? '-scene-kept' : c.pick ? '-links' : c.stop ? '-turn6' : c.lose ? '-lose' : '-result')}.png`);
      // 写真をとるときは、窓の大きさがそのまま中身の大きさになる（ふちの分を足さない）
      const shot = c.pc ? `--window-size=${c.w},${c.h}` : `--window-size=500,${c.h}`;
      await chrome(common.concat([shot, `--screenshot=${file}`, url]));
    }
  }
  server.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* 残っても害はない */ }
  console.log(`\n「つながる」表示をくらべた回数: 置く前 ${total.place} / 入れかえ（自動プレイの中）${total.swap} / 手数0 ${total.zero} / 棚の点線 ${total.shop} / 盤面の線 ${total.line}（うち「効いていない線」がある盤面 ${total.dead}）`);
  if (!only && !(total.swap > 0 && total.dead > 0)) { console.log('✗ 入れかえの検査、または「効いていない線」のある盤面が、1回も出なかった（検査が足りない）'); fail++; }
  console.log(`画面の検査${only ? `（only=${only}。一部だけ）` : ''}: ${n - fail} / ${n} 合格、失敗 ${fail}`);
  process.exit(fail ? 1 : 0);
}
main();
