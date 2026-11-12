# ツナガリ・ビルド（試作）

作業の入口は [CLAUDE.md](CLAUDE.md)（ファイルの役割ときまり）と [REPORT.md](REPORT.md)（設計・確かめた結果・質問）。
独立レビューをする担当は、制作担当（Claude）と別の AI であること。`node tests.js`・`node check.js` の合格だけで全体の合格にしない（通常入力の通し確認は別工程）。

## Game development standard entry v1.2
ゲーム作業の最初に [全ゲーム共通標準](docs/game-development/GAME-DEVELOPMENT-STANDARD.md) を読む。
[独立レビュー手順](docs/game-development/REVIEW-PROCEDURE.md) と [引継ぎ書式](docs/game-development/HANDOFF-TEMPLATE.md) を使う。
dot が制作担当と異なる独立担当を指定する。独立担当が未確保なら完了にしない。担当は読んだ版・パス・時刻を返す。
同時に動いている制作・LOCK・対象commitを確認してから着手する。画面と通常入力はコードレビューとは別に実証する。
