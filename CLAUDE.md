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

## きまり
- ルールを変えたら `node tests.js` と `node check.js` を通す。数字を変えたら `node bot.js` の表も見る。
- 画面の側で条件や数字を書き直さない（`rules.js` の `derive` / `attackLines` / `intentLines` を使う）。
- 演出用の CSS の class は `fx-` で始める。
- 公開・merge・課金・新規ログインはしない（ユーザー全体の CLAUDE.md のとおり）。

## Game development standard entry v1.2
ゲーム作業の最初に [全ゲーム共通標準](docs/game-development/GAME-DEVELOPMENT-STANDARD.md) を読む。
[独立レビュー手順](docs/game-development/REVIEW-PROCEDURE.md) と [引継ぎ書式](docs/game-development/HANDOFF-TEMPLATE.md) を使う。
dot が制作担当と異なる独立担当を指定する。独立担当が未確保なら完了にしない。担当は読んだ版・パス・時刻を返す。
同時に動いている制作・LOCK・対象commitを確認してから着手する。画面と通常入力はコードレビューとは別に実証する。
