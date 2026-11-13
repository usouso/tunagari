# ツナガリ・ビルド（ジグソー版・試作2）

毎ターン 山札から7個引いたブロックを、ジグソーパズルのように盤面に組む、ターン制デッキ構築の試作。
ブロックの辺に 凸・凹 があり、凸が凹に はまると、能力が 凸 → 凹 に わたる。5連戦で、勝つとブロックがもらえる。
くわしい設計・確かめた結果・質問は [REPORT.md](REPORT.md)。
前の版（つなげて育てる。5×5 の盤面）は `v1/` に そのまま残してある（くらべる用。記録は `v1/REPORT.md`）。**`v1/` の中は直さない。**

## ファイル
- `rules.js` … ルール（計算だけ）。画面・ボット・テストが同じものを使う。ブロックの文と数字・形（凸凹）はここ1か所。
- `botcore.js` … 自動で遊ぶ置き方の選び方（Node のボットと、画面の `?auto=1` が共用）。
- `ui.js` / `index.html` / `style.css` … 画面。ルールが返す出来事ログを再生するだけ。
- `tests.js` … 凹凸の きまりと、ブロックの文が文字どおりに動くかのテスト（`node tests.js`）。
- `bot.js` … ボットの集計（`node bot.js` / `stage` / `adapt` / `use` / `picks` / `hand`）。結果は `evidence/`。
- `check.js` … 画面の機械検査（ヘッドレスの Chrome。`node check.js`）。写真は `screenshots/`。
- `server.js` … 確認用の小さなサーバー（127.0.0.1:8437）。`index.html` を直接開いても遊べる。
- `review.js` … Codex に独立レビューを頼む（`node review.js` / `all` / `dry`）。結果は `reviews/` に残る。
- `v1/` … 前の版の一式（ルール・画面・テスト・検査・写真・証拠・REPORT）。

## きまり
- ルールを変えたら `node tests.js` と `node check.js` を通す。数字を変えたら `node bot.js` の表も見る（`runs` の「ためして選ぶ」「でたらめに選ぶ」「取らない」の3行と、`adapt`）。
- 画面の側で条件や数字を書き直さない（`rules.js` の `derive` / `summary` / `giftText` / `intentLines` / `destroyTargets` / `linksIfPut` を使う）。ことばの説明（のせると出る文）は `rules.js` の `TERMS` に足す。画面で ことば に印を付けるのは `tipify`（文の中）か `data-tip`（ふだ・印）。
- 凸凹の「書いてあるとおりに効く・小さく効く（数字×WEAK）」は `rules.js` の `accepts` の表1つで決める。画面の印（色つきの凸＝効く、点線の凸＝小さく効く）も同じ表から出す。
- 演出用の CSS の class は `fx-` で始める。「はまる所」の表示の class は `lk-` で始める。ブロックの絵の class は `pc-` で始める。
- 札の上に字を足すときは、スマホ幅（マス71px）で重ならないかを `node check.js only=phone` で見る（レベルは字でなく点にしてある）。
- ブロックは いつでも回せる（2026-11-14 本人の答え 1A。`?rot=1` は消した）。
- くらべる用の切りかえ：`?abil=1`（毒・再生が 攻め／守り で変わる）。決まったら消して、決めた方に固定する。
- ルールや画面を変えてコミットしたら、`node review.js` で Codex にレビューを頼む。指摘は読んで、`reviews/` のファイルの「受け取り」と REPORT.md の「工程ごとの状態」に書く。直したら、もう一度 `node review.js`（同じ指摘の直しと再テストは3回まで）。Codex のレビューは「コードと `node tests.js`」まで。画面と通常入力は別に確かめる。
- 公開：2026-11-12 に本人が「GitHub Pages で公開する」と決めた。公開先は https://usouso.github.io/tunagari/ （リポジトリ usouso/tunagari、branch は main。2026-11-12 に公開ずみ）。main への push が1〜2分後に公開版になる。
- merge・課金・新規ログイン・アクセスやネットワークの拡大はしない（ユーザー全体の CLAUDE.md のとおり）。ほかのゲームの公開もしない。
- `docs/game-development/` は公開リポジトリに入れていない（`.gitignore`）。このPCの中だけにあるコピーで、元は `DocumentsGameDevelopment`。
- 統括は本人。独立レビューの担当は Codex（本人の指定）。dot は 2026-11-12 から使えない。担当と証拠の記録は、この REPORT.md と `reviews/` に書く（共通標準 v1.3）。

## Game development standard entry v1.2
ゲーム作業の最初に [全ゲーム共通標準](docs/game-development/GAME-DEVELOPMENT-STANDARD.md) を読む。
[独立レビュー手順](docs/game-development/REVIEW-PROCEDURE.md) と [引継ぎ書式](docs/game-development/HANDOFF-TEMPLATE.md) を使う。
本人が制作担当と異なる独立担当を指定する。独立担当が未確保なら完了にしない。担当は読んだ版・パス・時刻を返す。
同時に動いている制作・LOCK・対象commitを確認してから着手する。画面と通常入力はコードレビューとは別に実証する。
