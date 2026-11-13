'use strict';
/*
 * botcore.js — 自動で遊ぶ手の選び方（Node のボットと、画面の ?auto=1 が同じものを使う）  ※ジグソー版（v2）
 * やり方：手札の置き方をいろいろ ためして、本物のルールで1ターン回し、いちばん点の高い置き方を選ぶ。
 *   まず1個ずつ「いちばん点が上がるマス」に置き（受け取る側が先）、そのあと 動かす・入れかえる で良くなるかぎり直す。
 * 型（opt.style）:
 *   smart   … 与えるダメージと受けるダメージの両方を見る（ふつうのボット）
 *   attack  … 与えるダメージだけ見る（守りを考えない）
 *   blind   … 敵の性質と予告を見ないで置く（いつも同じ考え方で置く）
 *   solo    … どこにも はめない（全部ばらばらに置く）
 *   random  … でたらめに置く
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rules.js'));
  else root.BotCore = factory(root.Rules);
})(typeof self !== 'undefined' ? self : this, function (R) {
  const N = R.N;
  const FAM_ORDER = { atk: 0, def: 1, abil: 2, enh: 3 };
  function lcg(seed) { let x = (seed | 0) || 1; return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; }; }

  // 1ターン回したあとの点。 s0 … 回す前、 c … 回したあと
  function scoreOf(s0, c, opt) {
    const style = opt.style || 'smart';
    const dealt = c.stats.total - s0.stats.total, lost = s0.p.hp - Math.max(0, c.p.hp);
    if (c.phase === 'won') return 5000 - lost;
    if (c.phase === 'lost') return -5000 + dealt;
    let wD = 1.0 + (s0.p.hp < 50 ? 0.8 : 0) + (s0.p.hp < 25 ? 1.2 : 0);
    if (style === 'attack') wD = 0;
    let sc = dealt - wD * lost;
    // 次のターンより後に効くもの
    sc += c.e.poison * 1.3 + c.e.fire * 1.5 + c.e.ice * 0.5 + c.e.shock * 0.8 + c.p.charge * 0.9 + c.drawBonus * 6;
    if (style !== 'attack') sc += c.p.shield * 0.5;
    sc -= (c.gone.length - s0.gone.length) * 8;
    if (c.deck.length && c.discard.length) sc += Math.min(c.deck.length, 2) * 1.5; // 再発動で山札の上にもどした札（次のターンも引ける）
    return sc;
  }
  function evalBoard(w, s0, opt) {
    const c = R.cloneState(w); R.resolve(c, { sim: true });
    return scoreOf(s0, c, opt);
  }
  // 敵の性質と予告を見ない写し（blind 用）
  function blindCopy(s) {
    const w = R.cloneState(s);
    w.e = Object.assign({}, w.e, { armor: 0, evade: 0, thorns: 0, regen: 0, guard: 0, hp: 99999, max: 99999 });
    w.intent = { label: '', parts: [{ k: 'atk', dmg: 6, hits: 2 }], cells: { rubble: [] } };
    return w;
  }

  // いちばん点の高い置き方をさがす。返すのは { board:[id|null…], rots:{id:rot}, score }
  function search(s, opt) {
    opt = opt || {};
    const style = opt.style || 'smart', rand = opt.rand || lcg(s.rs ^ (s.turn * 7919));
    const ids = s.hand.slice(), free = [];
    for (let i = 0; i < N; i++) if (s.blocked.indexOf(i) < 0) free.push(i);
    if (style === 'random' || style === 'solo') {
      const board = new Array(N).fill(null);
      const pool = free.slice();
      if (style === 'solo') { // 1マスおきに置けば、どこも はまらない
        const apart = pool.filter(i => ((i % R.W) + ((i / R.W) | 0)) % 2 === 0);
        ids.forEach((id, k) => { if (k < apart.length) board[apart[k]] = id; });
      } else for (const id of ids) { if (!pool.length) break; board[pool.splice((rand() * pool.length) | 0, 1)[0]] = id; }
      return { board, rots: {}, score: 0 };
    }
    const base = style === 'blind' ? blindCopy(s) : R.cloneState(s);
    const s0 = style === 'blind' ? base : s;
    const canRot = !!s.canRot, rotN = canRot ? 4 : 1;
    const restarts = opt.restarts || 3, passes = opt.passes || 3;
    let best = null;
    const nbFree = i => R.NB[i].filter(j => j >= 0 && free.indexOf(j) >= 0).length;
    for (let r = 0; r < restarts; r++) {
      const w = R.cloneState(base); w.board = new Array(N).fill(null);
      if (canRot) w.cards = base.cards.map(k => ({ id: k.id, type: k.type, rot: k.rot }));
      const order = ids.slice();
      if (r === 0) order.sort((a, b) => FAM_ORDER[R.B[w.cards[a].type].fam] - FAM_ORDER[R.B[w.cards[b].type].fam]);
      else { for (let i = order.length - 1; i > 0; i--) { const j = (rand() * (i + 1)) | 0; const t = order[i]; order[i] = order[j]; order[j] = t; } order.sort((a, b) => (R.B[w.cards[a].type].fam === 'enh') - (R.B[w.cards[b].type].fam === 'enh')); }
      let cur = evalBoard(w, s0, opt);
      // 1個ずつ、いちばん点が上がるマスへ
      for (const id of order) {
        let bc = -1, br = w.cards[id].rot, bs = -Infinity;
        const rot0 = w.cards[id].rot;
        for (const cell of free) {
          if (w.board[cell] != null) continue;
          w.board[cell] = id;
          for (let q = 0; q < rotN; q++) {
            if (canRot) w.cards[id].rot = (rot0 + q) & 3;
            const sc = evalBoard(w, s0, opt) + nbFree(cell) * 0.01 + (r > 0 ? rand() * 0.02 : 0);
            if (sc > bs) { bs = sc; bc = cell; br = w.cards[id].rot; }
          }
          w.board[cell] = null;
        }
        if (canRot) w.cards[id].rot = br;
        if (bc >= 0) { w.board[bc] = id; cur = bs; }
      }
      // 動かす・入れかえる・回す で良くなるかぎり直す
      cur = evalBoard(w, s0, opt);
      for (let pass = 0; pass < passes; pass++) {
        let improved = false;
        for (const id of ids) {
          const from = w.board.indexOf(id); if (from < 0) continue;
          let bc = from, br = w.cards[id].rot, bs = cur;
          const rot0 = w.cards[id].rot;
          for (const cell of free) {
            if (cell === from && !canRot) continue;
            const other = w.board[cell];
            w.board[from] = cell === from ? id : other; w.board[cell] = id;
            for (let q = 0; q < rotN; q++) {
              if (cell === from && q === 0) continue;
              if (canRot) w.cards[id].rot = (rot0 + q) & 3;
              const sc = evalBoard(w, s0, opt);
              if (sc > bs + 1e-6) { bs = sc; bc = cell; br = w.cards[id].rot; }
            }
            w.board[cell] = other; w.board[from] = id; if (canRot) w.cards[id].rot = rot0;
          }
          if (bc !== from || br !== rot0) {
            const other = w.board[bc]; w.board[from] = bc === from ? id : other; w.board[bc] = id; if (canRot) w.cards[id].rot = br;
            cur = bs; improved = true;
          }
        }
        if (!improved) break;
      }
      if (!best || cur > best.score + 1e-6) {
        const rots = {}; if (canRot) for (const id of ids) rots[id] = w.cards[id].rot;
        best = { board: w.board.slice(), rots, score: cur };
      }
    }
    return best;
  }

  // 置き方を、ルールの手（put / rotate）で実際に置く
  function applyLayout(s, L) {
    R.clearBoard(s);
    for (let cell = 0; cell < N; cell++) {
      const id = L.board[cell]; if (id == null) continue;
      if (s.canRot && L.rots[id] != null) { let g = 0; while (s.cards[id].rot !== L.rots[id] && g++ < 4) R.rotate(s, id); }
      R.put(s, id, cell);
    }
  }

  // 1戦を最後まで自動で遊ぶ（s を書きかえる）。 onTurn(s, layout) … 発動の直前に呼ばれる（集計用）
  function playFight(s, opt) {
    opt = opt || {}; const maxTurns = opt.maxTurns || 40;
    while (s.phase === 'place' && s.turn <= maxTurns) {
      const L = search(s, opt);
      applyLayout(s, L);
      if (opt.onTurn) opt.onTurn(s, L);
      R.endTurn(s);
    }
    return s;
  }
  // ごほうびの えらび方。 opt.pick: 'random'（3つから でたらめに1つ）| 'none'（えらばない）| fn(run, rand) → 番号
  function choosePick(run, opt, rand) {
    const p = opt.pick || 'random';
    if (typeof p === 'function') return p(run, rand);
    if (p === 'none') return -1;
    if (p === 'sim') return simPick(run, opt);
    if (opt.allow) { const ok = run.reward.options.map((o, i) => (opt.allow.has(o.type) ? i : -1)).filter(i => i >= 0); return ok.length ? ok[(rand() * ok.length) | 0] : -1; }
    if (opt.ban) { const ok = run.reward.options.map((o, i) => (opt.ban.has(o.type) ? -1 : i)).filter(i => i >= 0); return ok.length ? ok[(rand() * ok.length) | 0] : -1; }
    return (rand() * run.reward.options.length) | 0;
  }
  // ためしてから えらぶ：3つのそれぞれ（と、えらばない）を入れたデッキで、次の敵と何戦かして、いちばん良かったものを取る。
  // 次の敵が見えている人の えらび方の めやす（人より ていねい）。
  function trial(run, deck, opt, lv) {
    const next = run.stage + 1, enemyId = run.order[next], K = opt.simFights || 3; let sc = 0;
    for (let k = 0; k < K; k++) {
      const f = R.newFight({ enemyId, stage: next, deck, lv: lv || run.lv, seed: run.seed * 131 + next * 17 + k * 7 + 3, hp: run.hp, rot: run.canRot, hand: run.handSize });
      playFight(f, { style: 'smart', restarts: 1, passes: 1, maxTurns: 14 });
      sc += f.phase === 'won' ? 200 + f.p.hp - f.turn : -(f.e.hp / f.e.max) * 100;
    }
    return sc / K;
  }
  function simPick(run, opt) {
    let best = -1, bs = -Infinity;
    for (let i = -1; i < run.reward.options.length; i++) {
      const o = run.reward.options[i], deck = run.deck.slice(); let lv = run.lv;
      if (o && o.up) { lv = Object.assign({}, run.lv); lv[o.type] = o.lv; } else if (o) deck.push(o);
      const sc = trial(run, deck, opt, lv);
      if (sc > bs + 1e-6) { bs = sc; best = i; }
    }
    return best;
  }
  // はずすブロックも、ためしてから決める（種類ごとに1個ずつ ためす）
  function simRemove(run, opt) {
    let best = -1, bs = trial(run, run.deck, opt) + 2; const seen = {};
    for (let i = 0; i < run.deck.length; i++) {
      const t = run.deck[i].type; if (seen[t]) continue; seen[t] = 1;
      const deck = run.deck.slice(); deck.splice(i, 1);
      const sc = trial(run, deck, opt);
      if (sc > bs + 1e-6) { bs = sc; best = i; }
    }
    return best;
  }
  // 5連戦を最後まで自動で遊ぶ
  function playRun(seed, opt) {
    opt = opt || {};
    const run = R.newRun(seed, { rot: opt.rot, hand: opt.hand, order: opt.order }), rand = lcg(seed * 977 + 5);
    const fights = [];
    let guard = 0;
    while (guard++ < 50) {
      if (run.phase === 'fight') {
        const f = run.fight, hp0 = f.p.hp;
        playFight(f, opt);
        if (f.phase === 'place') f.phase = 'lost'; // 長すぎる戦いは負けにする
        fights.push({ enemy: f.enemyId, stage: f.stage, turns: f.turn, won: f.phase === 'won', hp0, hp1: Math.max(0, f.p.hp), dealt: f.stats.dealt, total: f.stats.total });
        R.finishFight(run);
      } else if (run.phase === 'reward') R.pickReward(run, choosePick(run, opt, rand));
      else if (run.phase === 'remove') R.removeCard(run, opt.pick === 'sim' && !opt.noRemove ? simRemove(run, opt) : opt.remove === 'random' ? (rand() * run.deck.length) | 0 : -1);
      else break;
    }
    return { run, fights, won: run.phase === 'won' };
  }

  return { search, applyLayout, playFight, playRun, scoreOf, evalBoard, lcg };
});
