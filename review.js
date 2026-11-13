'use strict';
/*
 * review.js — Codex に独立レビューを頼む（制作は Claude、レビューは Codex）。
 *   実行: node review.js            … 前にレビューした commit から、いまの commit（HEAD）までを見てもらう
 *         node review.js all        … 全部のファイルを見てもらう（最初の1回や、大きく変えたあと）
 *         node review.js <commit>   … その commit から HEAD までを見てもらう
 *         node review.js dry        … 頼む文と命令を出すだけ（Codex は動かさない。お金も回数も使わない）
 *   オプション: --model=<名前>  --minutes=<待つ分数。なければ30>
 *   model を書かないときは Codex の設定の model を使う。それが このアカウントで使えないときは、下の FALLBACK を順に試す。
 *   使える model の名前は `codex debug models` で見られる。
 * やること:
 *   1. コミットしていない変更があれば止める（レビューの対象は commit で決める）。
 *   2. 対象 commit の「隔離したコピー」を一時フォルダーに作る（制作の作業フォルダーは動かさない）。
 *   3. そのコピーの中で `codex exec`（読むだけの sandbox）を動かし、頼む文を渡す。
 *   4. Codex の最後の答えを reviews/ に保存する（上に、対象・命令・終了コードを付ける）。
 *   5. 一時フォルダーを消す。
 * しないこと: commit、push、公開、ファイルの修正。結果を読んで直すのは制作担当（Claude）。
 * 画面と通常入力の確認は、このレビューの外（node check.js と、クリックでの通し）。
 */
const fs = require('fs'), path = require('path'), os = require('os');
const { spawnSync } = require('child_process');
const ROOT = __dirname, OUT = path.join(ROOT, 'reviews');
const args = process.argv.slice(2);
const opt = k => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : null; };
const words = args.filter(a => !a.startsWith('--'));
const DRY = words[0] === 'dry';
const git = (a, cwd) => { const r = spawnSync('git', a, { cwd: cwd || ROOT, encoding: 'utf8' }); return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() }; };
const stop = (msg, code) => { console.log(msg); process.exit(code || 1); };
const FALLBACK = ['gpt-6-sol', 'gpt-6-astra']; // Codex の設定の model が使えないときに、順に試す（2026-11-13 に このアカウントで動くのを確かめた）

// ---- 1. 対象を決める
if (!git(['rev-parse', '--git-dir']).ok) stop('止めた: ここは Git のフォルダーではない。');
const dirty = git(['status', '--porcelain']).out;
if (dirty && !DRY) stop('止めた: コミットしていない変更がある。先にコミットする（レビューの対象は commit で決める）。\n' + dirty);
const head = git(['rev-parse', 'HEAD']).out, head7 = head.slice(0, 7);
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).out;
const remote = git(['remote', 'get-url', 'origin']).out || '（リモートなし）';
// 前にレビューした commit（reviews/ のいちばん新しいファイルの「対象commit」）
let lastFile = null; // 前に完了したレビューのファイル名（直しの確かめを頼むときに使う）
function lastReviewed() {
  if (!fs.existsSync(OUT)) return null;
  const files = fs.readdirSync(OUT).filter(f => /^\d{8}-\d{4}-[0-9a-f]{7}\.md$/.test(f)).sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const txt = fs.readFileSync(path.join(OUT, files[i]), 'utf8');
    if (!/^- 状態: 完了/m.test(txt)) continue; // 失敗・時間切れの回は、レビューした数に入れない
    const m = /^- 対象commit: `([0-9a-f]{7,40})`/m.exec(txt);
    if (m && git(['cat-file', '-e', m[1] + '^{commit}']).ok) { lastFile = files[i]; return m[1]; }
  }
  return null;
}
let base = null;
if (words[0] && words[0] !== 'all' && words[0] !== 'dry') {
  const r = git(['rev-parse', '--verify', words[0] + '^{commit}']); if (!r.ok) stop(`止めた: commit「${words[0]}」が見つからない。`);
  base = r.out;
} else if (words[0] !== 'all') base = lastReviewed();
if (!lastFile) lastReviewed(); // 基準を手で決めたときも、前のレビューがあれば確かめを頼む
if (base === head && !DRY) stop(`止めた: 前のレビュー（${head7}）から commit が進んでいない。全部を見てもらうなら node review.js all`);
const range = base ? `${base.slice(0, 7)}..${head7}` : '全部（基準なし）';
const changed = base ? git(['diff', '--stat', `${base}..${head}`]).out : '';
const logLines = base ? git(['log', '--oneline', `${base}..${head}`]).out : git(['log', '--oneline', '-8']).out;

// ---- 2. 頼む文（引継ぎ）
const STD = path.join(ROOT, 'docs', 'game-development'); // このPCの中だけにあるコピー（公開リポジトリには無い）
const stdNote = fs.existsSync(path.join(STD, 'GAME-DEVELOPMENT-STANDARD.md'))
  ? `共通標準3文書はここにある（読むだけ）: ${STD}`
  : '共通標準3文書は、あなたの AGENTS.md が指す場所にある（このリポジトリには入っていない）。';
const prompt = `あなたは、このゲーム「ツナガリ・ビルド」（ジグソー版・試作2）の独立レビュー担当（Codex）です。制作担当は Claude です。担当は本人（ユーザー）が指定しました。
対象は、いちばん上のフォルダーにある新しい版です。v1/ フォルダーは前の版の保管で、レビューの対象ではありません（読まなくてよい）。
このフォルダーは、対象commitの「隔離したコピー」です。制作の作業フォルダーではありません。

# 引継ぎ
- repo / branch / commit: ${remote} / ${branch} / ${head}
- 見る範囲: ${range}
- 制作担当 / 独立担当: Claude / Codex（dot は 2026-11-12 から使えない。担当の指定は本人がする）
- 最近の commit:
${logLines.split('\n').map(l => '  - ' + l).join('\n')}
${changed ? '- 変わったファイル:\n' + changed.split('\n').map(l => '  ' + l).join('\n') : ''}
- 最初に読むもの: AGENTS.md、CLAUDE.md（ファイルの役割ときまり）、REPORT.md（設計・確かめた結果・懸念）。
- ${stdNote}
- 対象の作業: コードレビューと、\`node tests.js\` の再実行。
- 対象の外: 画面の見え方と通常入力（別の工程で確かめる。\`node check.js\` は Chrome とサーバーを使うので、ここでは動かさない）。

# やること
1. ${base ? `\`git diff ${base.slice(0, 7)}..${head7}\` を読む。まわりのコードも必要なだけ読む。` : 'rules.js、botcore.js、ui.js、tests.js、check.js、index.html、style.css を読む。'}
2. \`node tests.js\` を実行し、終了コードと「合格 / 失敗」の数を書く。実行できなければ、できなかった理由を書く（合格にしない）。
3. 次の点を見る。
   - ルールの正しさ: ブロックの文（rules.js の txt）と、実際の計算が文字どおり合っているか。
   - 凹凸の きまり（rules.js の先頭の 1〜5、REPORT.md の 3章）と、derive / resolve の計算が合っているか。とくに「わたした側は働かない」「ひとりは半分の力（切り上げ）」「受け取ったものは先へ わたらない」「攻撃はヒットごと・防御は敵のヒットごと」。
   - 効く・効かないの表（accepts）と、文（txt）・画面の印が食いちがっていないか。
   - 山札: 7個引く・全部すてる・切り直す・再発動・破壊・感電のあとも、札の数が合うか。5連戦の流れ（finishFight / pickReward / removeCard）。
   - 画面とルールのずれ: ui.js が条件や数字を自分で書き直していないか（rules.js の derive / summary / giftText / intentLines / destroyTargets / linksIfPut / forecast を使っているか）。
   - テストの穴: 変えた所に対して、tests.js と check.js の検査が足りているか。足りない検査を具体的に書く。
   - こわれ方: 例外、無限ループ、0やマイナスの数、手札が7個より少ないとき・デッキが小さいとき、封印・がれき・破壊と重なったとき、能力ブロックが輪になったとき、?rot=1 のとき。
   - きまり: 演出用の CSS class は fx- で始める。文字は小さすぎない・重ならない。
4. ${lastFile ? `前のレビューは reviews/${lastFile}（このコピーの中にある）。その指摘が直ったかを、同じ再現のしかたで1つずつ確かめ、「直った / 直っていない / 確かめられない」を書く。ただし、前のレビューの対象が前の版（いまは v1/ にあるコード）だけなら、「対象が前の版なので確かめない」と1行書けばよい。` : '（前のレビューはない。）'}
5. 見つけたことを、下の形で書く。確かめていないことを「問題なし」と書かない。

# してはいけないこと
- ファイルを変えない。commit・push・公開・merge をしない。
- 何もインストールしない。ネットワークを使わない。
- secrets・認証ファイル・キー・トークンを読まない、書き出さない。
- このフォルダーと、上に書いた共通標準の場所のほかは見ない。

# 出す形（Markdown。やさしい日本語で、短く）
## 判定
「合格」「要修正（重大あり）」「要修正（軽いものだけ）」「環境制約で未実施」のどれか1つと、理由を1〜2行。
## 読んだ確認
共通標準の版・読んだ場所・読んだ日時。読めなかったら、そう書く。
## 実行したこと
命令、終了コード、出た数字。
## 前の指摘の確かめ（前のレビューがあるとき）
| 前の番号 | 直った / 直っていない / 確かめられない | 確かめ方 |
## 指摘（新しく見つけたもの）
| 番号 | 重要度（重大/中/軽） | 場所（ファイル:行） | 内容 | 再現のしかた | 直し方の案 |
指摘がなければ「なし」。
## 確かめられなかったこと
## 制作担当への質問（あれば）
`;

const stamp = (() => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; })();
const outFile = path.join(OUT, `${stamp}-${head7}.md`);
const work = path.join(os.tmpdir(), `tunagari-review-${head7}-${process.pid}`);
const lastPath = path.join(os.tmpdir(), `tunagari-review-${head7}-${process.pid}.md`); // Codex の最後の答えの一時ファイル（作業フォルダーの外）
const cargsFor = model => ['exec', '--sandbox', 'read-only', '--color', 'never', '--ephemeral', '-C', work, '-o', lastPath].concat(model ? ['--model', model] : [], ['-']);
const cargs = cargsFor(opt('model'));

if (DRY) {
  console.log(`対象commit ${head7} / 見る範囲 ${range}${dirty ? ' / ※コミットしていない変更あり（本番では止まる）' : ''}`);
  console.log(`命令: codex ${cargs.join(' ')}`);
  console.log(`保存先: ${path.relative(ROOT, outFile)}`);
  console.log('---- 頼む文 ----\n' + prompt);
  process.exit(0);
}

// ---- 3. 隔離したコピーを作って、Codex を動かす
const ver = spawnSync('codex', ['--version'], { encoding: 'utf8' });
if (ver.status !== 0) stop('環境制約: codex の命令が見つからない（Codex CLI が入っていない、または PATH にない）。', 2);
const wt = git(['worktree', 'add', '--detach', work, head]);
if (!wt.ok) stop('止めた: 隔離したコピーを作れなかった。\n' + wt.err);
let run, lastMsg = '', usedModel = opt('model') || null; const tried = [];
const errOf = r => { const m = /"message":"([^"]+)"/.exec((r.stderr || '') + (r.stdout || '')); return m ? m[1] : ''; };
try {
  console.log(`Codex にレビューを頼む: 対象commit ${head7} / 見る範囲 ${range}（数分かかる）`);
  const t0 = Date.now();
  const call = model => spawnSync('codex', cargsFor(model), { input: prompt, encoding: 'utf8', timeout: (+(opt('minutes') || 30)) * 60000, maxBuffer: 256 * 1024 * 1024 });
  run = call(usedModel);
  // Codex の設定の model が このアカウントで使えないとき（プランが変わったときなど）は、FALLBACK を順に試す
  for (const m of FALLBACK) {
    if (opt('model') || run.status === 0 || !/model_not_found|is not supported when using Codex/.test((run.stderr || '') + (run.stdout || ''))) break;
    tried.push(`${usedModel || 'Codex の設定の model'} → 使えない（${errOf(run)}）`);
    console.log(`  model が使えなかったので ${m} で やり直す`);
    usedModel = m; run = call(m);
  }
  run.sec = Math.round((Date.now() - t0) / 1000);
  if (fs.existsSync(lastPath)) { lastMsg = fs.readFileSync(lastPath, 'utf8'); fs.rmSync(lastPath, { force: true }); }
} finally {
  const rm = git(['worktree', 'remove', '--force', work]);
  if (!rm.ok) { try { fs.rmSync(work, { recursive: true, force: true }); } catch (e) { /* 残っても害はない */ } git(['worktree', 'prune']); }
}

// ---- 4. 保存する
fs.mkdirSync(OUT, { recursive: true });
const timedOut = run.error && run.error.code === 'ETIMEDOUT';
const state = timedOut ? '時間切れ' : run.status === 0 && lastMsg.trim() ? '完了' : '失敗（Codex が答えを返さなかった）';
const why = state === '完了' ? '' : (errOf(run) || (timedOut ? `${opt('minutes') || 30}分で返らなかった` : 'くわしくは .log'));
const header = `# 独立レビュー（Codex） ${stamp}

- 状態: ${state}${why ? `
- 理由: ${why}` : ''}
- 対象commit: \`${head}\`
- 見た範囲: ${range}
- repo / branch: ${remote} / ${branch}
- 制作担当 / 独立担当: Claude / Codex（${(ver.stdout || '').trim()}、model ${usedModel || 'Codex の設定のまま'}）${tried.length ? `
- model のやり直し: ${tried.join(' / ')}` : ''}
- 命令: \`codex exec --sandbox read-only --ephemeral\`（対象commitの隔離したコピーの中で実行。頼む文は review.js が作る）
- 終了コード: ${run.status === null ? 'なし' : run.status} / かかった時間: ${run.sec}秒
- 対象の外: 画面の見え方と通常入力（別の工程）
- 受け取り: 未（制作担当が読んだら、ここを「受け取った・日付」に書きかえる）

---

`;
fs.writeFileSync(outFile, header + (lastMsg.trim() ? lastMsg.trim() + '\n' : '（Codex の答えなし）\n'));
// くわしい記録（Codex が動かした命令など）は、コミットしない .log に残す
fs.writeFileSync(outFile.replace(/\.md$/, '.log'), `--- stdout ---\n${run.stdout || ''}\n--- stderr ---\n${run.stderr || ''}\n`);
console.log(`${state}${why ? '（' + why + '）' : ''}。結果: ${path.relative(ROOT, outFile)}`);
const verdict = /##\s*判定\s*\n+([^\n]+)/.exec(lastMsg);
if (verdict) console.log('判定: ' + verdict[1].trim());
process.exit(state === '完了' ? 0 : 1);
