'use strict';
/*
 * bot.js — ボットに何百回も遊ばせて、ビルドのかたよりを調べる。
 *   node bot.js            … ビルドの型 × 敵 の表（勝率と決着ターン）
 *   node bot.js picks      … 自由に選ぶボットが どのブロックをどれだけ使ったか
 *   node bot.js ban        … ブロックを1種類ずつ禁止したときの勝率の変化（同じ種で A/B）
 *   node bot.js growth     … ターンごとの与ダメージ（成長の形）
 * 前提：ボットは「3ターン先まで本物のルールで回して点の高い手を選ぶ」欲ばり型。
 *       キープは使わない。入れかえは破壊・封印をよけるときだけ。人より下手。
 */
const R = require('./rules.js');
const Bot = require('./botcore.js');
const mode = process.argv[2] || 'matrix';
const NG = +(process.argv[3] || 40);

const DEF = ['shield', 'regen', 'tough', 'dodge'];
const ARCH = {
  'なんでも':   { allow: null, start: null },
  '毒':         { start: 'shot',  allow: ['shot', 'slash', 'area', 'poison', 'consume', 'sustain', 'spread', 'amp', 'haste', 'chase', ...DEF] },
  '炎・連打':   { start: 'shot',  allow: ['shot', 'area', 'fire', 'haste', 'chase', 'refire', 'sustain', 'spread', 'amp', 'leech', ...DEF] },
  '一撃':       { start: 'slash', allow: ['slash', 'amp', 'pierce', 'charge', 'haste', 'refire', 'leech', 'convert', ...DEF] },
  '守り・反撃': { start: 'slash', allow: ['slash', 'area', 'shield', 'mirror', 'convert', 'sustain', 'counter', 'tough', 'dodge', 'regen', 'amp', 'pierce', 'ice'] },
  '氷・雷':     { start: 'shot',  allow: ['shot', 'area', 'ice', 'shock', 'haste', 'chase', 'refire', 'spread', 'sustain', 'amp', 'leech', ...DEF] },
  'でたらめ':   { random: true },
};
function optFor(name, seed) {
  const a = ARCH[name];
  if (a.random) { let x = seed * 31 + 7; return { random: true, rand: () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; }, start: ['slash', 'shot', 'area'][seed % 3] }; }
  return { allow: a.allow ? new Set(a.allow) : null, start: a.start || ['slash', 'shot', 'area'][seed % 3] };
}
function runSet(name, id, n, extra) {
  let win = 0, turnsW = 0, turnsAll = 0, hpW = 0; const res = [];
  for (let i = 0; i < n; i++) {
    const seed = 1000 + i * 37;
    const s = Bot.playGame(id, seed, Object.assign(optFor(name, seed), extra || {}));
    const w = s.phase === 'won'; if (w) { win++; turnsW += s.turn; hpW += s.p.hp; }
    turnsAll += s.turn; res.push(s);
  }
  return { win: win / n, turns: win ? turnsW / win : NaN, turnsAll: turnsAll / n, hp: win ? hpW / win : NaN, res };
}
const pct = x => (x * 100).toFixed(0).padStart(3) + '%';
const pad = (s, n) => { let w = 0; for (const ch of s) w += ch.charCodeAt(0) > 255 ? 2 : 1; return s + ' '.repeat(Math.max(0, n - w)); };

if (mode === 'matrix') {
  console.log(`ビルドの型 × 敵（各 ${NG} 戦） 勝率 / 勝ったときの決着ターン`);
  console.log(pad('', 12) + R.ENEMY_IDS.map(id => pad(R.ENEMIES[id].name, 16)).join('') + '平均');
  const best = {};
  for (const name of Object.keys(ARCH)) {
    let line = pad(name, 12), sum = 0;
    for (const id of R.ENEMY_IDS) {
      const r = runSet(name, id, NG); sum += r.win;
      line += pad(`${pct(r.win)} ${isNaN(r.turns) ? ' -- ' : r.turns.toFixed(1).padStart(4)}T ${isNaN(r.hp)?'--':r.hp.toFixed(0)}`, 16);
      if (name !== 'なんでも' && name !== 'でたらめ' && (!best[id] || r.win > best[id].win)) best[id] = { name, win: r.win };
    }
    console.log(line + pct(sum / R.ENEMY_IDS.length));
  }
  console.log('\n敵ごとの いちばん勝てる型: ' + R.ENEMY_IDS.map(id => `${R.ENEMIES[id].name}→${best[id].name}(${pct(best[id].win).trim()})`).join(' / '));
} else if (mode === 'picks') {
  console.log(`「なんでも」ボットが置いた数（1戦あたり）と、与ダメージの内訳（各 ${NG} 戦）`);
  const tot = {}; const per = {};
  for (const id of R.ENEMY_IDS) {
    const r = runSet('なんでも', id, NG); per[id] = { placed: {}, dealt: {}, win: r.win };
    for (const s of r.res) {
      for (const t in s.stats.placed) { per[id].placed[t] = (per[id].placed[t] || 0) + s.stats.placed[t] / NG; tot[t] = (tot[t] || 0) + s.stats.placed[t] / NG / R.ENEMY_IDS.length; }
      for (const k in s.stats.dealt) per[id].dealt[k] = (per[id].dealt[k] || 0) + s.stats.dealt[k] / NG;
    }
  }
  console.log(pad('ブロック', 12) + R.ENEMY_IDS.map(id => pad(R.ENEMIES[id].name, 12)).join('') + '平均');
  for (const t of R.TYPES.slice().sort((a, b) => (tot[b] || 0) - (tot[a] || 0)))
    console.log(pad(R.B[t].name, 12) + R.ENEMY_IDS.map(id => pad((per[id].placed[t] || 0).toFixed(2), 12)).join('') + (tot[t] || 0).toFixed(2));
  console.log('\n与ダメージの内訳（1戦あたり）');
  const keys = new Set(); for (const id of R.ENEMY_IDS) for (const k in per[id].dealt) keys.add(k);
  const nm = k => (R.B[k] ? R.B[k].name : { fire: '炎', chase: '追撃', consume: '毒消費', poison: '毒', shock: '感電', mirror: '反射' }[k] || k);
  for (const k of keys) console.log(pad(nm(k), 12) + R.ENEMY_IDS.map(id => pad((per[id].dealt[k] || 0).toFixed(0), 12)).join(''));
} else if (mode === 'ban') {
  console.log(`1種類だけ禁止したときの「なんでも」ボットの勝率（各 ${NG} 戦、同じ種）。差が大きいほど そのブロックに頼っている。`);
  const baseRow = R.ENEMY_IDS.map(id => runSet('なんでも', id, NG).win);
  const avg0 = baseRow.reduce((a, b) => a + b, 0) / baseRow.length;
  console.log(pad('禁止なし', 12) + baseRow.map(w => pad(pct(w), 12)).join('') + pct(avg0));
  const rows = [];
  for (const t of R.TYPES) {
    const allow = new Set(R.TYPES.filter(x => x !== t));
    const row = R.ENEMY_IDS.map(id => { let win = 0; for (let i = 0; i < NG; i++) { const seed = 1000 + i * 37; const s = Bot.playGame(id, seed, { allow, start: t === 'slash' ? 'shot' : ['slash', 'shot', 'area'][seed % 3] === t ? 'slash' : ['slash', 'shot', 'area'][seed % 3] }); if (s.phase === 'won') win++; } return win / NG; });
    rows.push({ t, row, avg: row.reduce((a, b) => a + b, 0) / row.length });
  }
  rows.sort((a, b) => a.avg - b.avg);
  for (const r of rows) console.log(pad(R.B[r.t].name + 'なし', 12) + r.row.map(w => pad(pct(w), 12)).join('') + pct(r.avg) + `  (${((r.avg - avg0) * 100).toFixed(0)})`);
} else if (mode === 'growth') {
  console.log(`ターンごとの与ダメージ（「なんでも」ボット、各 ${NG} 戦の平均。まだ戦っている戦だけ）`);
  for (const id of R.ENEMY_IDS) {
    const sum = [], cnt = []; let blocks = [];
    for (let i = 0; i < NG; i++) {
      const seed = 1000 + i * 37; const opt = optFor('なんでも', seed);
      const s = R.newGame(id, seed); let g = 0;
      while ((s.phase === 'start' || s.phase === 'place') && s.turn <= 40 && g++ < 5000) {
        const act = Bot.chooseAction(s, opt);
        if (act.type !== 'end' && Bot.apply(s, act) !== 'bad') continue;
        const t = s.turn, t0 = s.stats.total; R.endTurn(s);
        sum[t] = (sum[t] || 0) + s.stats.total - t0; cnt[t] = (cnt[t] || 0) + 1;
      }
    }
    let line = pad(R.ENEMIES[id].name, 12);
    for (let t = 1; t <= 14; t++) line += (cnt[t] >= NG / 5 ? String(Math.round(sum[t] / cnt[t])) : '-').padStart(5);
    console.log(line);
  }
}
