'use strict';
/*
 * bot.js — ボットに何回も遊ばせて、数字を見る（ジグソー版 v2）。
 *   node bot.js            … 型 × 5連戦（勝率・何戦目まで行けたか・敵ごとの決着ターンと へったHP）
 *   node bot.js stage      … 敵 × 何戦目（はじめのデッキ＋でたらめな追加で、1戦だけ）
 *   node bot.js adapt      … 「敵に合わせて置き方が変わるか」：同じ手札で、敵だけ変えたときの いちばん良い置き方のちがい
 *   node bot.js use        … ブロックの使われ方（能力を 攻撃／防御 に わたした・自分で働いた の割合を、敵ごとに）
 *   node bot.js picks      … ごほうびのブロックごとに、取った周回と取らなかった周回の成績
 *   node bot.js rot        … 回せる（?rot=1）と回せないの くらべ
 *   node bot.js hand       … 引く数 5・6・7・8 の くらべ
 *   オプション: n=<回数>  pick=random|sim|none
 * 前提: ボットは1ターン先しか読まない（置き方は ていねいに さがす）。人より計算は正確だが、先の計画は下手。
 */
const R = require('./rules.js'), Bot = require('./botcore.js');
const args = process.argv.slice(2), cmd = args.find(a => a.indexOf('=') < 0) || 'runs';
const arg = (k, d) => { const a = args.find(x => x.startsWith(k + '=')); return a ? a.split('=')[1] : d; };
const NN = +arg('n', 0);
const pct = (a, b) => (b ? Math.round(a / b * 100) + '%' : '–').padStart(4);
const f1 = x => (isFinite(x) ? x.toFixed(1) : '–');
const pad = (s, n) => { s = String(s); let w = 0; for (const ch of s) w += ch.charCodeAt(0) > 255 ? 2 : 1; return s + ' '.repeat(Math.max(0, n - w)); };

function runs() {
  const n = NN || 60;
  const rows = [['smart', 'sim'], ['smart', 'random'], ['smart', 'none'], ['attack', 'random'], ['blind', 'random'], ['solo', 'random'], ['random', 'random']].filter(r => !arg('rows') || arg('rows').split(',').indexOf(r[0] + '-' + r[1]) >= 0);
  console.log(`5連戦 ${n}回ずつ。型（置き方）× ごほうびの えらび方。「戦」＝勝った戦いの数（5で全部クリア）。敵ごとは 勝率・勝ったときのターン・へったHP。`);
  for (const [style, pick] of rows) {
    if (pick === 'sim' && arg('pick') === 'nosim') continue;
    let wins = 0, st = 0; const per = {}, byStage = [0, 0, 0, 0, 0];
    for (let seed = 1; seed <= n; seed++) {
      const r = Bot.playRun(seed, { style, pick, noRemove: arg('remove') === '0' });
      if (r.won) wins++;
      for (const f of r.fights) {
        const k = per[f.enemy] = per[f.enemy] || { n: 0, w: 0, t: 0, hp: 0 }; k.n++;
        if (f.won) { st++; byStage[f.stage]++; k.w++; k.t += f.turns; k.hp += f.hp0 - f.hp1; }
      }
    }
    console.log(`${pad(style, 7)} ${pad(pick, 6)} クリア ${pct(wins, n)}  戦 ${f1(st / n)}  何戦目まで勝ったか ${byStage.map(x => pct(x, n)).join(' ')}  | ` +
      R.ENEMY_IDS.map(id => { const k = per[id] || { n: 0, w: 0, t: 0, hp: 0 }; return `${R.ENEMIES[id].name} ${pct(k.w, k.n)} ${f1(k.t / k.w)}T -${f1(k.hp / k.w)}`; }).join(' | '));
  }
}

function stage() {
  const n = NN || 30, rand = Bot.lcg(99);
  for (const style of (arg('style', 'smart')).split(',')) {
    console.log(`敵 × 何戦目（${style}、各${n}戦、HP100から。デッキは はじめの14個＋2×(何戦目−1)個の でたらめな追加）: 勝率 ターン へったHP 1ターンの与ダメージ`);
    for (const id of R.ENEMY_IDS) {
      let line = pad(R.ENEMIES[id].name, 10);
      for (let st = 0; st < R.STAGES; st++) {
        let w = 0, t = 0, hp = 0, dmg = 0, tt = 0;
        for (let seed = 1; seed <= n; seed++) {
          const deck = R.START_DECK.map(c => c.slice());
          for (let k = 0; k < st * 2; k++) deck.push([R.TYPES[(rand() * R.TYPES.length) | 0], (rand() * 4) | 0]);
          const s = R.newFight({ enemyId: id, stage: st, deck, seed: seed * 13 + st, hp: 100 });
          Bot.playFight(s, { style });
          if (s.phase === 'won') { w++; t += s.turn; hp += 100 - s.p.hp; }
          dmg += s.stats.total; tt += s.turn;
        }
        line += ` | ${st + 1}戦目 ${pct(w, n)} ${f1(t / w)}T -${f1(hp / w)} ${f1(dmg / tt)}/T`;
      }
      console.log(line);
    }
  }
}

// 置き方を「だれが だれに わたしたか」の形にする（マスの場所は見ない）
function shapeOf(s, L) {
  const c = R.cloneState(s); Bot.applyLayout(c, L);
  const d = R.derive(c);
  return d.links.filter(l => l.ok).map(l => `${c.board[l.from]}>${c.board[l.to]}`).sort().join(' ');
}
function adapt() {
  const n = NN || 40, ids = R.ENEMY_IDS, rand = Bot.lcg(7);
  // 同じ手札（同じ種・同じデッキ）で、敵だけ変える。2ターン目の手札でくらべる（1ターン目は どの敵も1つ目の行動なので）。
  let same = 0, diff = 0, total = 0; const pair = {};
  const gain = { n: 0, own: 0, other: 0 };
  for (let k = 0; k < n; k++) {
    const deck = R.START_DECK.map(c => c.slice());
    for (let j = 0; j < 4; j++) deck.push([R.TYPES[(rand() * R.TYPES.length) | 0], (rand() * 4) | 0]);
    const turnAt = 1 + (k % 3), seed = 1000 + k;
    const st = {}, lay = {};
    for (const id of ids) {
      const s = R.newFight({ enemyId: id, stage: 1, deck, seed });
      // 同じ手札にそろえる：何も置かずにターンを進める（引く順は種で決まり、敵によらない…封印・がれき・感電がなければ）
      for (let t = 1; t < turnAt; t++) R.endTurn(s);
      st[id] = s; lay[id] = Bot.search(s, { style: 'smart' });
    }
    const hand0 = st[ids[0]].hand.join(',');
    for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
      const A = ids[a], Bq = ids[b];
      if (st[A].hand.join(',') !== hand0 || st[Bq].hand.join(',') !== hand0 || st[A].sealed.length || st[Bq].sealed.length) continue;
      total++; const eq = shapeOf(st[A], lay[A]) === shapeOf(st[Bq], lay[Bq]);
      if (eq) same++; else diff++;
      const key = A + '/' + Bq; pair[key] = pair[key] || { n: 0, d: 0 }; pair[key].n++; if (!eq) pair[key].d++;
    }
    // ほかの敵むけの置き方を、そのまま使ったら どれだけ損か（点＝与ダメージ − 受けダメージ などの合計）
    for (const A of ids) for (const Bq of ids) {
      if (A === Bq || st[A].hand.join(',') !== hand0 || st[Bq].hand.join(',') !== hand0 || st[A].blocked.length || st[Bq].blocked.length) continue;
      const own = R.cloneState(st[A]); Bot.applyLayout(own, lay[A]);
      const oth = R.cloneState(st[A]); Bot.applyLayout(oth, lay[Bq]);
      const f1x = R.forecast(own), f2x = R.forecast(oth);
      gain.n++; gain.own += f1x.dealt - f1x.taken; gain.other += f2x.dealt - f2x.taken;
    }
  }
  console.log(`同じ手札で敵だけ変えたとき、いちばん良い置き方（だれが だれに わたすか）が ちがった組: ${diff} / ${total}（${pct(diff, total).trim()}）`);
  for (const k of Object.keys(pair)) console.log(`  ${pad(k, 16)} ちがう ${pct(pair[k].d, pair[k].n)}（${pair[k].d}/${pair[k].n}）`);
  console.log(`その敵むけの置き方: 1ターンの（与える − 受ける）平均 ${f1(gain.own / gain.n)} ／ ほかの敵むけの置き方を そのまま使うと ${f1(gain.other / gain.n)}（${gain.n}組）`);
}

function use() {
  const n = NN || 40;
  console.log(`ブロックの使われ方（smart、ごほうびは でたらめ、5連戦 ${n}回）。能力ブロック: 攻撃に わたした／防御に わたした／自分で働いた。強化ブロック: 効いた／働かなかった。`);
  const by = {}; const en = {};
  for (const id of R.ENEMY_IDS) { by[id] = { atk: 0, def: 0, solo: 0, abil: 0, enhOn: 0, enhOff: 0, ampAtk: 0, ampDef: 0, ampAbil: 0, turns: 0, links: 0, pieces: 0 }; }
  const types = {};
  for (let seed = 1; seed <= n; seed++) {
    Bot.playRun(seed, { style: 'smart', pick: 'random', onTurn: s => {
      const d = R.derive(s), b = by[s.enemyId]; b.turns++; b.links += d.links.filter(l => l.ok).length; b.pieces += d.cells.length;
      for (const c of d.cells) {
        const X = d.blk[c], t = types[X.type] = types[X.type] || { n: 0, atk: 0, def: 0, abil: 0, solo: 0, idle: 0 }; t.n++;
        if (X.fam === 'abil') {
          if (!X.gives) { b.solo++; t.solo++; }
          else { const to = X.outs.filter(l => l.ok).map(l => d.blk[l.to].fam); const k = to.indexOf('def') >= 0 ? 'def' : to.indexOf('atk') >= 0 ? 'atk' : to.indexOf('abil') >= 0 ? 'abil' : (X.spreadTo.length ? 'atk' : 'solo'); b[k]++; t[k]++; }
        } else if (X.fam === 'enh') {
          if (X.live) { b.enhOn++; const to = d.blk[X.outs.find(l => l.ok).to].fam; t[to]++; if (X.type === 'amp') b[to === 'atk' ? 'ampAtk' : to === 'def' ? 'ampDef' : 'ampAbil']++; }
          else { b.enhOff++; t.idle++; }
        }
      }
    } });
  }
  for (const id of R.ENEMY_IDS) {
    const b = by[id], a = b.atk + b.def + b.solo + b.abil, am = b.ampAtk + b.ampDef + b.ampAbil;
    console.log(`${pad(R.ENEMIES[id].name, 10)} 能力: 攻撃へ ${pct(b.atk, a)} 防御へ ${pct(b.def, a)} 能力へ ${pct(b.abil, a)} 自分で ${pct(b.solo, a)} ｜ 増幅: 攻撃へ ${pct(b.ampAtk, am)} 防御へ ${pct(b.ampDef, am)} 能力へ ${pct(b.ampAbil, am)} ｜ 強化が働かなかった ${pct(b.enhOff, b.enhOn + b.enhOff)} ｜ 1ターンに はまった数 ${f1(b.links / b.turns)}`);
  }
  console.log('種類ごと（置いた回数。わたした先: 攻撃／防御／能力、自分で、働かず）');
  for (const t of R.TYPES) { const x = types[t]; if (!x || R.B[t].fam === 'atk' || R.B[t].fam === 'def') continue; console.log(`  ${pad(R.B[t].name, 10)} ${String(x.n).padStart(5)}回  攻撃 ${pct(x.atk, x.n)} 防御 ${pct(x.def, x.n)} 能力 ${pct(x.abil, x.n)} 自分で ${pct(x.solo, x.n)} 働かず ${pct(x.idle, x.n)}`); }
}

function picks() {
  const n = NN || 150;
  console.log(`ごほうびのブロックごとの成績（smart、でたらめに えらぶ、5連戦 ${n}回）。取った周回と、取らなかった周回の「勝った戦いの数」。`);
  const t = {}; let all = 0;
  const res = [];
  for (let seed = 1; seed <= n; seed++) { const r = Bot.playRun(seed, { style: 'smart', pick: 'random' }); const w = r.fights.filter(f => f.won).length; all += w; res.push({ added: r.run.added.slice(0, 6), w }); }
  for (const type of R.TYPES) {
    let a = 0, an = 0, b = 0, bn = 0;
    for (const x of res) { if (x.added.indexOf(type) >= 0) { a += x.w; an++; } else { b += x.w; bn++; } }
    t[type] = { with: a / an, without: b / bn, n: an };
  }
  console.log(`全体の平均 ${f1(all / n)} 戦`);
  for (const type of R.TYPES.slice().sort((x, y) => (t[y].with - t[y].without) - (t[x].with - t[x].without)))
    console.log(`  ${pad(R.B[type].name, 10)} 取った ${f1(t[type].with)}戦（${String(t[type].n).padStart(3)}回） 取らない ${f1(t[type].without)}戦  差 ${(t[type].with - t[type].without >= 0 ? '+' : '') + (t[type].with - t[type].without).toFixed(2)}`);
}

function rot() {
  const n = NN || 40;
  console.log(`回せる・回せないの くらべ（smart、ごほうびは でたらめ、5連戦 ${n}回）`);
  for (const r of [false, true]) {
    let st = 0, wins = 0, links = 0, turns = 0, idle = 0, enh = 0, dmg = 0;
    for (let seed = 1; seed <= n; seed++) {
      const x = Bot.playRun(seed, { style: 'smart', pick: 'random', rot: r, restarts: r ? 2 : 3, onTurn: s => {
        const d = R.derive(s); turns++; links += d.links.filter(l => l.ok).length;
        for (const c of d.cells) if (d.blk[c].fam === 'enh') { enh++; if (!d.blk[c].live) idle++; }
      } });
      if (x.won) wins++; st += x.fights.filter(f => f.won).length; dmg += x.fights.reduce((a, f) => a + f.total, 0);
    }
    console.log(`${r ? '回せる  ' : '回せない'} クリア ${pct(wins, n)} 戦 ${f1(st / n)}  1ターンに はまった数 ${f1(links / turns)}  強化が働かなかった ${pct(idle, enh)}  1ターンの与ダメージ ${f1(dmg / turns)}`);
  }
}

function hand() {
  const n = NN || 40;
  console.log(`引く数の くらべ（smart、ごほうびは でたらめ、5連戦 ${n}回）`);
  for (const h of [5, 6, 7, 8]) {
    let st = 0, wins = 0, turns = 0, fights = 0;
    for (let seed = 1; seed <= n; seed++) { const x = Bot.playRun(seed, { style: 'smart', pick: 'random', hand: h }); if (x.won) wins++; st += x.fights.filter(f => f.won).length; for (const f of x.fights) if (f.won) { turns += f.turns; fights++; } }
    console.log(`${h}個  クリア ${pct(wins, n)} 戦 ${f1(st / n)}  勝った戦いのターン ${f1(turns / fights)}`);
  }
}

const t0 = Date.now();
({ runs, stage, adapt, use, picks, rot, hand }[cmd] || runs)();
console.log(`（${((Date.now() - t0) / 1000).toFixed(1)}秒）`);
