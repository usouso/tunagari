'use strict';
/*
 * check.js — 画面の機械検査（ジグソー版 v2）。画面のない Chrome（ヘッドレス）で ?auto=1 を開き、ボットに画面を通して遊ばせる。
 *   実行: node check.js          （全部）
 *         node check.js quick    （少なめ）
 *         node check.js only=文字 （名前にその文字が入る場面だけ。全体の合格には数えない）
 * 失敗にするもの（終了コード1）:
 *   ページのエラー / 決着まで行かない / 表示と計算のずれ（はまっている凸・番号・札の字・予想・HP）/ 予想と結果のずれ / 演出の合計と計算のずれ /
 *   「はまるマスの数字」と置いたあとの本当の数のずれ / 文字の重なり / 画面からのはみ出し / 文字の切れ / パソコン寸法でのページのスクロール
 * 画面の写真は screenshots/ に保存する。
 * 注意: これは自動プレイの検査。人が実際にクリック・ドラッグして通す確認は別（REPORT.md を見る）。
 */
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { execFile } = require('child_process');
const ROOT = __dirname;
const CHROME = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && fs.existsSync(p));
const quick = process.argv.indexOf('quick') >= 0;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function chrome(args) {
  return new Promise(res => {
    execFile(CHROME, args, { timeout: 120000, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => res({ err, stdout: String(stdout), stderr: String(stderr) }));
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
  const common = ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--mute-audio', '--hide-scrollbars', `--user-data-dir=${profile}`, '--virtual-time-budget=90000'];
  fs.mkdirSync(path.join(ROOT, 'screenshots'), { recursive: true });
  const read = out => { const m = /<pre id="check-out"[^>]*>([\s\S]*?)<\/pre>/.exec(out); return m ? JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')) : null; };

  // 窓の大きさと中身の大きさの差をはかる（ヘッドレスでも窓のふちの分だけ小さくなる）
  const probe = await chrome(common.concat(['--window-size=1000,800', '--dump-dom', base + '?auto=1&screen=title']));
  const pk = read(probe.stdout) || { w: 1000, h: 800 };
  const DW = 1000 - pk.w, DH = 800 - pk.h;
  console.log(`窓と中身の差: 幅${DW} 高さ${DH}`);
  const SIZES = [['pc1366', 1366, 650, true], ['pc1920', 1920, 910, true], ['phone', 375, 812, false], ['pc1366x768', 1366, 768, true]];
  const ENEMIES = ['golem', 'hunter', 'hydra', 'mage', 'berserk'];
  const cases = [];
  const add = (sn, w, h, pc, name, q, o) => cases.push(Object.assign({ name: `${sn} ${name}`, sn, w, h, pc, q }, o || {}));
  for (const [sn, w, h, pc] of SIZES) {
    const main = sn === 'pc1366', lite = sn === 'pc1366x768';
    add(sn, w, h, pc, 'タイトル', 'auto=1&screen=title&seed=11', { stop: true, shot: 'title' });
    add(sn, w, h, pc, '5連戦 種11 通し', 'auto=1&speed=0&seed=11', { play: true, shot: 'result' });
    add(sn, w, h, pc, '4ターン目で止める（組んだ盤面）', 'auto=1&speed=0&seed=11&stop=4', { stop: true, shot: 'board' });
    add(sn, w, h, pc, 'ブロックをえらんだ画面（はまるマスの表示）', 'auto=1&speed=0&seed=11&stop=2&pick=1', { stop: true, pick: true, shot: 'pick' });
    add(sn, w, h, pc, 'ごほうびの画面', 'auto=1&speed=0&seed=11&screen=reward', { stop: true, screen: 'reward', shot: 'reward' });
    if (lite) continue;
    add(sn, w, h, pc, 'はずす画面', 'auto=1&speed=0&seed=11&screen=remove', { stop: true, screen: 'remove', shot: 'remove' });
    add(sn, w, h, pc, 'あそびかた', 'auto=1&speed=0&seed=11&stop=1&screen=help', { stop: true, screen: 'help', shot: 'help' });
    add(sn, w, h, pc, '山札を見る', 'auto=1&speed=0&seed=11&stop=2&screen=deck', { stop: true, screen: 'deck', shot: 'deck' });
    add(sn, w, h, pc, 'でたらめ置き（負けの画面）', 'auto=1&speed=0&seed=11&bot=random', { play: true, lose: true, shot: 'lose' });
    if (main) {
      if (!quick) for (const seed of [222, 3333]) add(sn, w, h, pc, `5連戦 種${seed} 通し`, `auto=1&speed=0&seed=${seed}`, { play: true });
      for (const id of (quick ? ['mage'] : ENEMIES)) add(sn, w, h, pc, `れんしゅう ${id}（3戦目の強さ）`, `auto=1&speed=0&seed=11&enemy=${id}&stage=2`, { play: true, shot: 'one-' + id });
      add(sn, w, h, pc, '回せる設定（?rot=1）通し', 'auto=1&speed=0&seed=11&rot=1', { play: true });
    }
  }
  const only = (process.argv.find(a => a.startsWith('only=')) || '').slice(5);
  if (only) { const keep = cases.filter(c => c.name.indexOf(only) >= 0); cases.length = 0; cases.push(...keep); }
  if (!cases.length) { console.log(`✗ only=${only} に合う場面が1つもない（何も検査していないので、失敗にする）`); server.close(); process.exit(1); }
  let fail = 0, n = 0; const total = { turns: 0, links: 0, spots: 0, fights: 0 };
  for (const c of cases) {
    n++;
    const win = c.pc ? `--window-size=${c.w + DW},${c.h + DH}` : `--window-size=${500 + DW},${c.h + DH}`;
    const url = base + (c.pc ? '?' : '__frame?') + c.q;
    const r = await chrome(common.concat([win, '--dump-dom', url]));
    const k = read(r.stdout), bad = [];
    if (!k) bad.push('検査の結果が書かれていない（ページが動いていない）');
    else {
      if (k.errors.length) bad.push('ページのエラー ' + k.errors.join(' / '));
      if (c.play && !(k.done && k.result && (k.result.phase === 'won' || k.result.phase === 'lost'))) bad.push('決着まで行かなかった');
      if (c.stop && !k.stopped) bad.push('止まる所まで行かなかった');
      if (c.lose && !(k.result && k.result.phase === 'lost')) bad.push('負けの画面を確かめられなかった（負けなかった）');
      if (c.play && !(k.linkChecks > 0 && k.spotChecks > 0 && k.turns > 0)) bad.push('盤面の表示の検査が、1回も動かなかった');
      if (c.pick && !(k.picked && k.picked.spots > 0)) bad.push('はまるマスの表示が出ていない');
      if (c.screen && !(k.screens && k.screens[c.screen] > 0)) bad.push(`「${c.screen}」の画面が開いていない`);
      total.turns += k.turns || 0; total.links += k.linkChecks || 0; total.spots += k.spotChecks || 0; total.fights += k.fights || 0;
      if (k.mismatches.length) bad.push('表示と計算のずれ ' + k.mismatches.slice(0, 3).join(' / '));
      const L = k.layout;
      if (L.overlaps) bad.push(`文字の重なり ${L.overlaps}（${L.notes.slice(0, 3).join(' / ')}）`);
      if (L.offscreen) bad.push(`はみ出し ${L.offscreen}（${L.notes.slice(0, 3).join(' / ')}）`);
      if (L.clipped) bad.push(`文字の切れ ${L.clipped}（${L.notes.slice(0, 3).join(' / ')}）`);
      if (c.pc && L.pageScroll > 0) bad.push(`ページのスクロール ${L.pageScroll}px`);
      if (k.w !== c.w || k.h !== c.h) bad.push(`画面の大きさが指定とちがう（${k.w}x${k.h}）`);
    }
    if (bad.length) fail++;
    const info = k ? `${k.w}x${k.h} ${k.result ? `${k.result.phase}（${k.result.stage + 1}戦目 ${k.result.turn}T）` : (k.stopped ? '止' : '')} 戦い${k.fights} ターン${k.turns} 配置検査${k.layout.samples} 文字${k.screen ? k.screen.chars : ''}` : '';
    console.log(`${bad.length ? '✗' : '✓'} ${c.name}  ${info}${bad.length ? '\n    → ' + bad.join('\n    → ') : ''}`);
    if (c.shot) {
      const file = path.join(ROOT, 'screenshots', `${c.sn}-${c.shot}.png`);
      // 写真をとるときは、窓の大きさがそのまま中身の大きさになる（ふちの分を足さない）
      const shot = c.pc ? `--window-size=${c.w},${c.h}` : `--window-size=500,${c.h}`;
      await chrome(common.concat([shot, `--screenshot=${file}`, url]));
    }
  }
  server.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* 残っても害はない */ }
  console.log(`\nくらべた回数: 戦い ${total.fights} / ターン ${total.turns}（予想＝結果、演出の合計＝計算、HPの表示）/ 盤面の絵 ${total.links} / はまるマスの数字 ${total.spots}`);
  console.log(`画面の検査${only ? `（only=${only}。一部だけ）` : ''}: ${n - fail} / ${n} 合格、失敗 ${fail}`);
  process.exit(fail ? 1 : 0);
}
main();
