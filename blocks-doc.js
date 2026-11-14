'use strict';
/*
 * blocks-doc.js — ほかの AI に意見を聞くための「ルールとブロックのまとめ」を、rules.js から作る。
 *   実行: node blocks-doc.js   → BLOCKS.md を書く
 * ブロックの文・数字・形・「書いてある相手」・ことば・敵の数字は、rules.js の本物から出す（手で写さない）。
 * ルールの説明文（1〜2章）と、意見を聞きたいこと（8章）だけは、ここに手で書いてある。ルールを変えたら直す。
 */
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const R = require('./rules.js');

let commit = '（不明）';
try { commit = execSync('git log -1 --format=%h -- rules.js', { cwd: __dirname, encoding: 'utf8' }).trim(); } catch (e) { /* git がなくても作れる */ }

const SIDE = ['上', '右', '下', '左'], MARK = { 1: '凸', '-1': '凹', 0: '－' };
const shape = t => R.edges(t, 0).map((v, i) => `${SIDE[i]}${MARK[v]}`).join(' ');
const lvText = t => R.B[t].v.map((v, i) => `Lv${i + 1}「${R.blockText(t, i + 1)}」`).join(' / ');
const lvs = t => R.B[t].v.length > 1 ? R.B[t].v.join(' / ') : String(R.B[t].v[0]);
// 「書いてある相手」：accepts が true になる受け取る側（攻撃・防御・能力の全部の種類で ためす）
const RECEIVERS = R.TYPES.filter(t => R.B[t].fam !== 'enh');
function targets(g) {
  const ok = RECEIVERS.filter(t => R.accepts(g, { fam: R.B[t].fam, type: t }));
  if (ok.length === RECEIVERS.length) return 'すべて';
  const fams = ['atk', 'def', 'abil'].map(f => {
    const all = RECEIVERS.filter(t => R.B[t].fam === f), got = all.filter(t => ok.indexOf(t) >= 0);
    if (!got.length) return null;
    return got.length === all.length ? `${R.FAMS[f]}すべて` : got.map(t => R.B[t].name).join('・');
  }).filter(Boolean);
  return fams.join('、');
}

const L = [];
const p = s => L.push(s === undefined ? '' : s);

p('# ツナガリ・ビルド（ジグソー版 試作2）ルールとブロックのまとめ');
p();
p(`> ほかの AI に意見を聞くための資料（作っている本人が、ほかの AI に渡す）。**ブロックの文・数字・形・敵の数字は、ゲームのルールのファイル（rules.js）から自動で作った**ので、本物と同じ（作った時の commit: \`${commit}\`、${new Date().toISOString().slice(0, 10)}）。`);
p('> 遊べる版：https://usouso.github.io/tunagari/ （攻め・守り版は https://usouso.github.io/tunagari/?abil=1 ）');
p();

p('## 1. どんなゲームか');
p('- ターン制のデッキ構築（Slay the Spire のような形）と、ジグソーパズルを合わせた試作。');
p(`- 毎ターン、山札から **${R.HAND}個** のブロックを引き、**横${R.W}×たて${R.H}** の盤面に置く。7個ぜんぶ置ける（置かなくてもよい）。置き方は「発動」を押すまで何回でも変えられる。`);
p('- ブロックは **いつでも90度ずつ回せる**。');
p('- 「発動」で、組んだブロックが働いて戦う。ターンの終わりに、手札は全部 捨て札へ。山札がなくなったら捨て札を切り直す。');
p(`- 敵の「予告」（次に何をするか）が見えている。予告を見て、毎ターン組み方を考えるのが中心。`);
p(`- **5連戦**（敵5体を1回ずつ、でたらめな順）。自分の HP は ${R.MAXHP}。勝つと HP+${R.HEAL_AFTER}、ごほうびを3つから1つ（${R.PICKS}回）、そのあとデッキから1個はずせる。あとの戦いほど敵が強い（HP ×${R.STAGE_HP.join('→')}、攻撃 ×${R.STAGE_ATK.join('→')}）。`);
p('- ごほうびは「新しいブロック」か「レベルアップ」（その種類がデッキの全部まとめて Lv+1。Lv3まで）。');
p();

p('## 2. 凸凹（でこぼこ）のきまり');
p('1. ブロックの4つの辺は、**凸・凹・平ら** のどれか。となりの **凸が凹に向かい合うと「はまる」**。凸が凹でない辺に向いても置ける（はまらないだけ）。');
p('2. はまると、**凸の側から凹の側へ、一方向に** 働きが「わたる」。');
p('3. **わたした側（凸が はまった側）は、自分では働かない。** 能力ブロックが どこにも わたさないときは、自分で1回 働くが **半分の力**（切り上げ）。強化ブロックは ひとりでは働かない。');
p('4. **受け取ったものは、次のブロックへは わたらない**（ただし、強化を受け取った能力ブロックは、強くなった自分の能力を わたす）。');
p('5. **受け取る側の系統で、能力の働き方が変わる**：攻撃が受け取る＝自分のヒット1回ごと／防御が受け取る＝敵のヒット1回ごと／能力が受け取る＝その能力が自分で働くときに1回。');
p(`6. **強化は、札に「書いてある相手」なら書いてあるとおりに効く。書いてある相手でなくても、はまれば「小さく効く」＝相手の数字 ×${R.WEAK}**。`);
p('7. 発動の順番：① 防御（シールドをはる）→ ② 番号の順（左上から右へ、上の段から）に、攻撃と「自分で働く能力」→ ③ 敵の行動 → ④ ターンの終わり（毒のダメージ、状態がへる など）。');
p('8. **形で役わりが分かる**：攻撃・防御＝凹だけ（受け取る側）。強化＝凸1つだけ（わたす側）。能力＝凸1つ・凹1つ（わたすことも、受け取ることもできる）。');
p();

p(`## 3. ブロック ${R.TYPES.length}種類`);
p('形は「回していない向き」での 上・右・下・左（凸／凹／－＝平ら）。回せるので、凸と凹の「数」と「となり合い方」だけが意味をもつ。数字は Lv1 / Lv2 / Lv3。');
for (const fam of ['atk', 'def', 'abil', 'enh']) {
  p();
  p(`### ${R.FAMS[fam]}（${R.FAM_HINT[fam]}）`);
  p();
  if (fam === 'enh') { p('| ブロック | 形 | 数字 | 文（Lv1） | 書いてある相手（それ以外は 小さく効く） |'); p('|---|---|---|---|---|'); }
  else { p('| ブロック | 形 | 数字 | 文（Lv1） |'); p('|---|---|---|---|'); }
  for (const t of R.TYPES.filter(x => R.B[x].fam === fam)) {
    const row = `| ${R.B[t].name} | ${shape(t)} | ${lvs(t)} | ${R.blockText(t, 1)} |`;
    p(fam === 'enh' ? `${row} ${targets(t)} |` : row);
  }
  // 数字の入れかえだけでは分からない、レベルで文が変わるもの（貫通の Lv2 から など）は、いちばん上のレベルの文も書く
  const norm = x => x.replace(/[\d.]+/g, '#');
  for (const t of R.TYPES.filter(x => R.B[x].fam === fam)) {
    const top = R.B[t].v.length; if (top < 2) continue;
    if (norm(R.blockText(t, 1)) !== norm(R.blockText(t, top))) { p(); p(`- ${R.B[t].name} の Lv${top}：「${R.blockText(t, top)}」（Lv2 から文が変わる。Lv2 は「${R.blockText(t, 2)}」）`); }
  }
}
p();
p('- 能力が「攻撃・防御・能力」のどれに わたると何が起きるかは 2章の5。例：毒を射撃（2ヒット）に わたすと「ヒットごとに 毒+2」、盾に わたすと「敵のヒットごとに 毒+2」。');
p('- 攻撃の「ヒット」：1回の当たり。装甲・結界・身かわし・トゲは ヒット1回ごとに かかる。');
p();

p('## 4. ことば（状態など）');
p();
for (const k of Object.keys(R.TERMS)) p(`- **${R.TERMS[k].name}**：${R.termText(k, null).text}`);
p();

p('## 5. 敵（5体。数字は1戦目。予告は この順に くり返し、周がすすむほど強くなる）');
for (const id of R.ENEMY_IDS) {
  const e = R.ENEMIES[id];
  p();
  p(`### ${e.name}（HP ${Math.round(e.hp * R.STAGE_HP[0])}）`);
  p(`- 性質：${e.trait}`);
  for (const c of [0, 1]) {
    const list = e.script(c).map(it => {
      const parts = it.parts.map(q => (q.k === 'atk' ? Object.assign({}, q, { dmg: Math.max(1, Math.round(q.dmg * R.STAGE_ATK[0])) }) : q.k === 'guard' ? Object.assign({}, q, { n: Math.round(q.n * R.STAGE_HP[0]) }) : q));
      const fake = { parts, cells: { rubble: new Array((parts.find(q => q.k === 'rubble') || {}).n || 0).fill(0) } };
      return `${it.label}（${R.intentLines(fake).map(x => x.text.replace(/（.*$/, '')).join('、')}）`;
    });
    p(`- ${c + 1}周目：${list.join(' → ')}`);
  }
}
p();
p('- 3周目から「怒り」：敵の攻撃がさらに強くなる（長引くほど危ない）。');
p();

p('## 6. はじめのデッキ（14個）');
const cnt = {}; for (const [t] of R.START_DECK) cnt[t] = (cnt[t] || 0) + 1;
p(Object.keys(cnt).map(t => `${R.B[t].name}×${cnt[t]}`).join('、') + '。');
p();

p('## 7. くらべる版：攻め・守り版（URL に ?abil=1）');
p('毒と再生だけ、受け取る側で「ちがう種類のこと」が起きる。ほかの能力は ふだんと同じ。');
p();
for (const t of R.TYPES.filter(x => R.B[x].txt2)) p(`- **${R.B[t].name}**：${R.blockText(t, 1, true)}（ひとりのときと、能力が受け取るときは「攻め」。ひとりは半分の力）`);
p();
p('ねらい：ふだんの版では、能力を攻撃に わたすか防御に わたすかは「自分のヒット数と敵のヒット数の、多い方」で ほぼ決まってしまう（ボットで測ると、毒は 93% がそれで当たる）。攻めと守りで「ちがう種類の得」にすれば、迷いが生まれるはず、という試し。毒は 93% → 63% に下がったが、再生は 79% → 71% で あまり変わらなかった。');
p();

p('## 8. 意見を聞きたいこと（作っている人の質問）');
p('1. **強化の「小さく効く」**：書いてある相手でなくても ×1.5 で効く、という きまりにした（どの強化も、はめれば何か起きるように）。これでよいか、それとも札ごとに効く相手と働きを足すべきか。');
p('2. **攻め・守り版**：毒・再生の「攻め／守り」で、どちらに わたすか考える余地は増えそうか。ほかの能力（炎・氷・雷・追撃・毒消費）にも広げるなら、どんな「攻め／守り」がよいか。');
p('3. **敵の行動を もっと考えさせたい**（Slay the Spire のように、予告を見て組み方を変えるのが楽しい）。案：A 盤面の形への仕返し（「3つ以上 はまっていたら怒って攻撃+6」など）／B デッキに じゃまブロックを入れる／C だんだん強くなる敵／D 2ターン先まで予告を出す。どれが よいか、ほかの案は。');
p('4. **「たまり」が分かりにくい**（次のターンの、最初に当たったヒットに ぜんぶ のる）。蓄積ブロックと、攻め・守り版の再生の「攻め」で使っている。何に変えるのがよいか。案：A すぐ効く「ヒット+○」に変える／B 蓄積を外す／C たまりは残して、どの攻撃に のるかを見えるようにする。');
p('5. ほかに、**ルールが分かりにくい所・強すぎる／弱すぎるブロック・組み合わせの面白さが足りない所** があれば。');
p();
p('（ボットで測った数字や、これまでの記録は、リポジトリの REPORT.md にある：https://github.com/usouso/tunagari ）');

fs.writeFileSync(path.join(__dirname, 'BLOCKS.md'), L.join('\n') + '\n');
console.log(`BLOCKS.md を書いた（${L.length}行、commit ${commit}）`);
