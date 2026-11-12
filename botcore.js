'use strict';
/*
 * botcore.js — 自動で遊ぶ手の選び方（Node のボットと、画面の ?auto=1 が同じものを使う）
 * やり方：置ける手を全部ためして、数ターン先まで本物のルールで回し、いちばん点の高い手を選ぶ。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rules.js'));
  else root.BotCore = factory(root.Rules);
})(typeof self !== 'undefined' ? self : this, function (R) {
  const N = R.N;

  // 何も置かずに H ターン進めたときの点
  function evalAfter(c, H, wDef) {
    const hp0 = c.p.hp, t0 = c.stats.total; let turns = 0;
    while (turns < H && c.phase === 'place') { R.resolve(c); turns++; }
    let sc = (c.stats.total - t0) - wDef * (hp0 - Math.max(0, c.p.hp));
    if (c.phase === 'won') sc += 500 - 50 * turns;
    else if (c.phase === 'lost') sc -= 800 - 50 * turns;
    else {
      sc += c.e.poison * 1.5 + c.p.shield * 0.3;
      for (let i = 0; i < N; i++) { const b = c.board[i]; if (b && b.type === 'charge') sc += b.charge * 2; }
    }
    return sc;
  }
  function tie(c) { // 同点のときは、つながりが多い方
    const d = R.derive(c.board); let n = 0;
    for (let i = 0; i < N; i++) if (c.board[i] && c.board[i].type !== 'rubble') n++;
    return d.links.length * 0.6 + n * 0.3;
  }

  // opt: { allow:Set|null, H, wDef, start:'slash'|'shot'|'area', noSwap, rand:fn }
  function chooseAction(s, opt) {
    opt = opt || {};
    const H = opt.H || 3, wDef = opt.wDef == null ? 2.5 : opt.wDef, allow = opt.allow || null;
    if (s.phase === 'start') {
      const want = opt.start || 'slash';
      let src = s.shop.indexOf(want); if (src < 0) src = 0;
      return { type: 'place', src, cell: R.START_CELL };
    }
    if (s.phase !== 'place' || s.moves <= 0) return { type: 'end' };
    if (opt.random) return randomAction(s, opt.rand || Math.random);

    const base = evalAfter(R.cloneState(s), H, wDef) + tie(s);
    let best = { type: 'end' }, bestSc = base - 0.01;
    let empties = 0; const frontier = new Set();
    for (let i = 0; i < N; i++) {
      if (s.board[i]) { for (const j of R.NEAR8[i]) if (!s.board[j]) frontier.add(j); } else empties++;
    }
    if (!frontier.size && empties) frontier.add(R.START_CELL);
    const seen = new Set();
    const srcs = []; for (let i = 0; i < R.SHOP; i++) srcs.push(i); srcs.push('keep');
    for (const src of srcs) {
      const type = R.srcType(s, src); if (!type || seen.has(type)) continue;
      if (allow && !allow.has(type)) continue;
      seen.add(type);
      for (let cell = 0; cell < N; cell++) {
        const b = s.board[cell];
        if (!b) { if (!frontier.has(cell)) continue; }
        else if (b.type === type) { if (b.lv >= R.MAXLV) continue; }
        else if (!(b.type === 'rubble' || empties <= 3)) continue;
        const c = R.cloneState(s);
        if (!R.place(c, src, cell)) continue;
        const sc = evalAfter(c, H, wDef) + tie(c);
        if (sc > bestSc) { bestSc = sc; best = { type: 'place', src, cell }; }
      }
    }
    // 破壊・封印をねらわれたマスは、入れかえで逃がす手もためす
    if (!opt.noSwap && s.intent) {
      const aimed = s.intent.cells.destroy.concat(s.intent.cells.seal);
      for (const a of aimed) {
        if (!s.board[a]) continue;
        for (let b = 0; b < N; b++) {
          if (b === a) continue;
          const c = R.cloneState(s); if (!R.swap(c, a, b)) continue;
          const sc = evalAfter(c, H, wDef) + tie(c);
          if (sc > bestSc) { bestSc = sc; best = { type: 'swap', a, b }; }
        }
      }
    }
    return best;
  }

  // でたらめに置く（くらべる相手）
  function randomAction(s, rand) {
    const srcs = []; for (let i = 0; i < R.SHOP; i++) if (s.shop[i]) srcs.push(i);
    if (!srcs.length) return { type: 'end' };
    for (let k = 0; k < 20; k++) {
      const src = srcs[(rand() * srcs.length) | 0], cell = (rand() * N) | 0;
      const kind = R.placeKind(s, src, cell);
      if (kind === 'new' || kind === 'up') return { type: 'place', src, cell };
    }
    return { type: 'end' };
  }

  function apply(s, act) {
    if (act.type === 'place') return R.place(s, act.src, act.cell) ? null : 'bad';
    if (act.type === 'swap') return R.swap(s, act.a, act.b) ? null : 'bad';
    return R.endTurn(s);
  }

  // 1戦を最後まで自動で遊ぶ
  function playGame(enemyId, seed, opt) {
    const s = R.newGame(enemyId, seed); const maxTurns = (opt && opt.maxTurns) || 40;
    let guard = 0;
    while ((s.phase === 'start' || s.phase === 'place') && s.turn <= maxTurns && guard++ < 5000) {
      const act = chooseAction(s, opt);
      if (act.type === 'end') R.endTurn(s); else if (apply(s, act) === 'bad') R.endTurn(s);
    }
    return s;
  }

  return { chooseAction, playGame, evalAfter, randomAction, apply };
});
