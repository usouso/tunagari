# ツナガリ・ビルド（試作）

敵の予告の「手数」だけブロックを置き、となり同士をつなげてスキルを育てる、ターン制バトルの試作。
くわしい設計・確かめた結果・質問は [REPORT.md](REPORT.md)。

## ファイル
- `rules.js` … ルール（計算だけ）。画面・ボット・テストが同じものを使う。ブロックの文と数字はここ1か所。
- `botcore.js` … 自動で遊ぶ手の選び方（Node のボットと、画面の `?auto=1` が共用）。
- `ui.js` / `index.html` / `style.css` … 画面。ルールが返す出来事ログを再生するだけ。
- `tests.js` … ブロックの文が文字どおりに動くかのテスト（`node tests.js`）。
- `bot.js` … ビルドのかたよりを調べる集計（`node bot.js` / `picks` / `ban` / `growth`）。
- `check.js` … 画面の機械検査（ヘッドレスの Chrome。`node check.js`）。写真は `screenshots/`。
- `server.js` … 確認用の小さなサーバー（127.0.0.1:8437）。`index.html` を直接開いても遊べる。
- `review.js` … Codex に独立レビューを頼む（`node review.js` / `all` / `dry`）。結果は `reviews/` に残る。

## きまり
- ルールを変えたら `node tests.js` と `node check.js` を通す。数字を変えたら `node bot.js` の表も見る。
- 画面の側で条件や数字を書き直さない（`rules.js` の `derive` / `attackLines` / `intentLines` を使う）。
- 演出用の CSS の class は `fx-` で始める。「つながる」表示の class は `lk-` で始める。
- 線と点線の札は「いま効いているか」（`rules.js` の `derive` が出す `live` / `LL` / `liveLinks`）で決める。置く前の数字も同じ。
- 画面に出す文字をふやすときは、`?auto=1` の検査結果の `screen`（見えている文字の数）を前後でくらべる。
- ルールや画面を変えてコミットしたら、`node review.js` で Codex にレビューを頼む。指摘は読んで、`reviews/` のファイルの「受け取り」と REPORT.md の8章に書く。直したら、もう一度 `node review.js`（同じ指摘の直しと再テストは3回まで）。Codex のレビューは「コードと `node tests.js`」まで。画面と通常入力は別に確かめる。
- 公開：2026-11-12 に本人が「GitHub Pages で公開する」と決めた。公開先は https://usouso.github.io/tunagari/ （リポジトリ usouso/tunagari、branch は main。2026-11-12 に公開ずみ）。main への push が1〜2分後に公開版になる。
- merge・課金・新規ログイン・アクセスやネットワークの拡大はしない（ユーザー全体の CLAUDE.md のとおり）。ほかのゲームの公開もしない。
- `docs/game-development/` は公開リポジトリに入れていない（`.gitignore`）。このPCの中だけにあるコピーで、元は `DocumentsGameDevelopment`。
- 統括は本人。独立レビューの担当は Codex（本人の指定）。dot は 2026-11-12 から使えない。担当と証拠の記録は、この REPORT.md と `reviews/` に書く（共通標準 v1.3）。

## Game development standard entry v1.2
ゲーム作業の最初に [全ゲーム共通標準](docs/game-development/GAME-DEVELOPMENT-STANDARD.md) を読む。
[独立レビュー手順](docs/game-development/REVIEW-PROCEDURE.md) と [引継ぎ書式](docs/game-development/HANDOFF-TEMPLATE.md) を使う。
本人が制作担当と異なる独立担当を指定する。独立担当が未確保なら完了にしない。担当は読んだ版・パス・時刻を返す。
同時に動いている制作・LOCK・対象commitを確認してから着手する。画面と通常入力はコードレビューとは別に実証する。
