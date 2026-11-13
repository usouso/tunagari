// ボットが選んだ盤面で、能力を受け取ったブロックが 増幅・加速 も受け取っていた割合（組み合わせて使っているか）
const R = require('./rules.js'), Bot = require('./botcore.js');
if (process.env.DECK === 'ice') R.START_DECK[13] = ['ice', 3];
const V = +(process.argv[2] || 0), n = 40; const T = {};
for (let seed = 1; seed <= n; seed++) Bot.playRun(seed, { style: 'smart', pick: 'random', onTurn: s => {
  s.__v = V; const d = R.derive(s);
  const ampHere = d.cells.some(c => d.blk[c].type === 'amp'), hasteHere = d.cells.some(c => d.blk[c].type === 'haste');
  for (const c of d.cells) { const A = d.blk[c]; if (A.fam !== 'abil' || !A.gives) continue;
    const t = T[A.type] = T[A.type] || { n: 0, ampN: 0, amp: 0, hasteN: 0, haste: 0 }; t.n++;
    const rec = A.outs.filter(l => l.ok).map(l => d.blk[l.to]);
    if (ampHere) { t.ampN++; if (rec.some(X => X.m.amp)) t.amp++; }
    if (hasteHere) { t.hasteN++; if (rec.some(X => X.m.haste)) t.haste++; }
  } } });
for (const k in T) { const t = T[k]; console.log(`v=${V} ${R.B[k].name} ${t.n}回  増幅が盤面にあるとき 同じ札に増幅 ${Math.round(t.amp / t.ampN * 100)}%（${t.ampN}）  加速が盤面にあるとき 同じ札に加速 ${Math.round(t.haste / t.hasteN * 100)}%（${t.hasteN}）`); }
