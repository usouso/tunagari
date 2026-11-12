# ツナガリ・ビルド（試作）

作業の入口は [CLAUDE.md](CLAUDE.md)（ファイルの役割ときまり）と [REPORT.md](REPORT.md)（設計・確かめた結果・質問）。
制作は Claude、独立レビューは Codex（2026-11-12 本人の指定）。dot は 2026-11-12 から使えない（本人がプランを変えたため）。下の入口の「dot が…指定する」は「本人が指定する」と読みかえる。`node tests.js`・`node check.js` の合格だけで全体の合格にしない（通常入力の通し確認は別工程）。

公開は本人が決めた（2026-11-12）。予定の公開先は https://usouso.github.io/tunagari/ 。もう出ているかどうかは REPORT.md の8章で確かめる。`docs/game-development/` は公開リポジトリに入れていない（このPCの中だけのコピー。元は `DocumentsGameDevelopment`）。

## Game development standard entry v1.2
ゲーム作業の最初に [全ゲーム共通標準](docs/game-development/GAME-DEVELOPMENT-STANDARD.md) を読む。
[独立レビュー手順](docs/game-development/REVIEW-PROCEDURE.md) と [引継ぎ書式](docs/game-development/HANDOFF-TEMPLATE.md) を使う。
dot が制作担当と異なる独立担当を指定する。独立担当が未確保なら完了にしない。担当は読んだ版・パス・時刻を返す。
同時に動いている制作・LOCK・対象commitを確認してから着手する。画面と通常入力はコードレビューとは別に実証する。
