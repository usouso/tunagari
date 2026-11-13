// 能力の行き先（攻撃 or 防御）の値打ちの差を、能力の種類ごとに測る。
// ボットが選んだ盤面で、わたしている能力1つの行き先だけを、盤面の別の攻撃・防御ブロックに付けかえて（形は無視）、1ターンの点をくらべる。
const R = require('./rules.js'), Bot = require('./botcore.js');
if (process.env.DECK === 'ice') R.START_DECK[13] = ['ice', 3];
if (process.env.DECK === 'time') { R.START_DECK[13] = ['ice', 3]; R.START_DECK[12] = ['consume', 0]; }
const V = +(process.argv.find(a => a.startsWith('v=')) || 'v=0').slice(2);
const n = +(process.argv.find(a => a.startsWith('n=')) || 'n=40').slice(2);
const T = {}; const tot = { cases: 0, same: 0, bigger: 0, against: 0, tie: 0, gap: 0, atkWin: 0, defWin: 0 };
function add(k, f) { const t = T[k] = T[k] || { cases: 0, same: 0, bigger: 0, against: 0, tie: 0, gap: 0, atkWin: 0, defWin: 0 }; f(t); f(tot); }
let wins = 0, st = 0;
for (let seed = 1; seed <= n; seed++) {
  const r = Bot.playRun(seed, { style: 'smart', pick: 'random', abil: process.env.ABIL === '1', onTurn: s => {
    s.__v = V;
    const d = R.derive(s);
    const atk = d.cells.filter(c => d.blk[c].fam === 'atk'), def = d.cells.filter(c => d.blk[c].fam === 'def');
    if (!atk.length || !def.length) return;
    const eh = s.intent.parts.filter(p => p.k === 'atk').reduce((a, p) => a + p.hits, 0);
    for (const c of d.cells) {
      const A = d.blk[c]; if (A.fam !== 'abil' || !A.gives) continue;
      const score = to => { const w = R.cloneState(s); w.__force = { from: c, to }; const x = R.cloneState(w); R.resolve(x, { sim: true }); return Bot.scoreOf(s, x, {}); };
      const ba = Math.max(...atk.map(score)), bd = Math.max(...def.map(score));
      const oh = Math.max(...atk.map(a => d.blk[a].atk.hits));
      add(A.type, t => {
        t.cases++; t.gap += Math.min(40, Math.abs(ba - bd));
        if (Math.abs(ba - bd) < 1) { t.same++; if (oh === eh) t.sameTie = (t.sameTie || 0) + 1; else if (ba > 4000) t.sameWon = (t.sameWon || 0) + 1; return; }
        if (ba > bd) t.atkWin++; else t.defWin++;
        if (oh === eh) t.tie++;
        else if ((oh > eh) === (ba > bd)) t.bigger++; else t.against++;
      });
    }
  } });
  if (r.won) wins++; st += r.fights.filter(f => f.won).length;
}
const p = (a, b) => (b ? Math.round(a / b * 100) + '%' : '-').padStart(4);
console.log(`v=${V} n=${n}  クリア ${p(wins, n)}  勝った戦い ${(st / n).toFixed(2)}`);
console.log('ほぼ同じのうち 回数が同じ', tot.sameTie, ' 勝ちが決まっていた', tot.sameWon, ' のこり', tot.same - (tot.sameTie||0) - (tot.sameWon||0));
console.log('能力      場面  ほぼ同じ(差<1)  攻撃が上 防御が上 | 差がある場面で「回数の多い方」が当たり / 外れ / 回数同じ | 差の平均');
for (const k of Object.keys(T).concat(['合計'])) {
  const t = k === '合計' ? tot : T[k], dif = t.cases - t.same;
  console.log(`${(R.B[k] ? R.B[k].name : k).padEnd(5, '　')} ${String(t.cases).padStart(5)}  ${p(t.same, t.cases)}           ${p(t.atkWin, dif)}    ${p(t.defWin, dif)}  |  ${p(t.bigger, dif)} / ${p(t.against, dif)} / ${p(t.tie, dif)}  | ${(t.gap / t.cases).toFixed(1)}`);
}
