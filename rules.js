'use strict';
/*
 * rules.js — ゲームのルール（計算だけ。画面は描かない）  ※ジグソー版（v2）。前の版は v1/ にある。
 * 画面(ui.js)・ボット(botcore.js)・テスト(tests.js) が同じこのファイルを使う。
 * resolve() は「何が起きたか」の出来事ログを返し、画面はそれを再生するだけ。
 *
 * きまり（凹凸）:
 *   1. ブロックの辺には 凸・凹・平ら がある。となりのブロックの 凸 と 凹 が向かい合うと「はまる」。
 *   2. 能力は 凸 → 凹 の一方向に わたる。わたした側（凸）は、自分では働かない。
 *   3. 受け取ったものは、次のブロックへは わたらない（わたるのは、自分のもとの能力だけ）。
 *   4. 受け取った「能力」は、攻撃ならヒットごとに、防御なら敵のヒット1回ごとに、能力ブロックなら自分が働くときに1回 働く。
 *   5. どこにも わたしていない能力ブロックは、自分で1回 働く。ただし半分の力（切り上げ）。はめた方が強い。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Rules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const W = 5, H = 4, N = W * H, HAND = 7, MAXHP = 100;
  const SHOCK_AT = 8, SHOCK_DMG = 10, FREEZE_AT = 8, COUNTER_MAX = 2, HIT_CAP = 200;
  const STAGES = 5, PICKS = 2, HEAL_AFTER = 20;
  // 何戦目かで敵が強くなる（HP と 攻撃の倍率）
  const STAGE_HP = [1, 1.2, 1.45, 1.7, 2.0], STAGE_ATK = [1, 1.1, 1.2, 1.3, 1.4];

  // ---------------------------------------------------------------- ブロック
  // v = レベルごとの「数字」（Lv1/2/3。1つだけのものはレベルアップしない）。txt はその数字をそのまま使う（文字どおりに動く）。
  // レベルは種類ごと（デッキの同じ種類は、ぜんぶ同じレベル）。
  // sh = 辺の形 [上, 右, 下, 左]。 1 = 凸、-1 = 凹、0 = 平ら。札ごとの向き（rot）で回る。
  // 系統: atk 攻撃（凹だけ）/ def 防御（凹だけ）/ abil 能力（凸1つ・凹1つ）/ enh 強化（凸だけ）
  const B = {
    slash:   { fam: 'atk',  name: '斬撃',     g: '斬', v: [6, 9, 12], hits: 1, sh: [-1, 0, 0, -1],
               txt: v => `${v}ダメージ ×1ヒット。` },
    shot:    { fam: 'atk',  name: '射撃',     g: '射', v: [2, 3, 4], hits: 2, sh: [0, -1, 0, -1],
               txt: v => `${v}ダメージ ×2ヒット。` },
    area:    { fam: 'atk',  name: '範囲攻撃', g: '範', v: [3, 5, 7], hits: 1, sh: [-1, -1, -1, -1],
               txt: v => `${v}ダメージ ×1ヒット。4つの辺が ぜんぶ凹。` },
    shield:  { fam: 'def',  name: '盾',       g: '盾', v: [7, 10, 13], sh: [-1, -1, 0, 0],
               txt: v => `シールド+${v}。敵の攻撃を防ぐ。ターンの終わりに消える。` },
    tough:   { fam: 'def',  name: '堅牢',     g: '堅', v: [2, 3, 4], sh: [-1, 0, 0, 0],
               txt: v => `敵のヒット1回ごとに 受けるダメージ−${v}。` },
    dodge:   { fam: 'def',  name: '回避',     g: '避', v: [1, 2, 3], sh: [-1, 0, 0, 0],
               txt: v => `敵の最初のヒットを ${v}回 よける。` },
    poison:  { fam: 'abil', name: '毒',       g: '毒', v: [2, 3, 4], sh: [0, 1, 0, -1], kw: 'poison',
               txt: v => `毒+${v}。` },
    fire:    { fam: 'abil', name: '炎',       g: '炎', v: [1, 2, 3], sh: [-1, 1, 0, 0], kw: 'fire',
               txt: v => `炎+${v}。` },
    ice:     { fam: 'abil', name: '氷',       g: '氷', v: [2, 3, 4], sh: [0, 1, 0, -1], kw: 'ice',
               txt: v => `氷+${v}。` },
    shock:   { fam: 'abil', name: '雷',       g: '雷', v: [2, 3, 4], sh: [0, 1, -1, 0], kw: 'shock',
               txt: v => `雷+${v}。` },
    regen:   { fam: 'abil', name: '再生',     g: '癒', v: [2, 3, 4], sh: [0, 1, 0, -1],
               txt: v => `HP+${v}。` },
    chase:   { fam: 'abil', name: '追撃',     g: '追', v: [2, 3, 4], sh: [-1, 1, 0, 0],
               txt: v => `${v}ダメージの追加ヒット。敵の状態1種類ごとに ダメージ+${v}。` },
    consume: { fam: 'abil', name: '毒消費',   g: '消', v: [2, 3, 4], sh: [0, 1, -1, 0],
               txt: v => `敵の毒を全部消して、消した数×${v} のダメージ。` },
    charge:  { fam: 'abil', name: '蓄積',     g: '蓄', v: [3, 5, 7], sh: [0, 1, 0, -1], kw: 'charge',
               txt: v => `たまり+${v}。` },
    amp:     { fam: 'enh',  name: '増幅',     g: '増', v: [2, 2.5, 3], sh: [0, 1, 0, 0],
               txt: v => `わたした相手の数字が ${v}倍。` },
    haste:   { fam: 'enh',  name: '加速',     g: '速', v: [1, 2, 3], sh: [0, 1, 0, 0],
               txt: v => `攻撃なら ヒット数+${v}。ほかは もう${v}回 働く。` },
    pierce:  { fam: 'enh',  name: '貫通',     g: '貫', v: [0, 3, 6], sh: [0, 1, 0, 0],
               txt: v => `攻撃・追撃に わたすと、装甲と結界を無視。` + (v ? `さらにヒットダメージ+${v}。` : '') },
    spread:  { fam: 'enh',  name: '拡散',     g: '拡', v: [0], sh: [0, 1, 0, 0],
               txt: () => `能力ブロックに わたすと、その能力が 全部の攻撃・防御ブロックに とどく。` },
    sustain: { fam: 'enh',  name: '持続強化', g: '持', v: [50, 75, 100], sh: [0, 1, 0, 0],
               txt: v => `盾：シールドが${v}%残る。炎：${v}%残る。毒：へらない。` },
    convert: { fam: 'enh',  name: '効果変換', g: '変', v: [100, 150, 200], sh: [0, 1, 0, 0],
               txt: v => `攻撃に わたすと、最初のヒットに ＋いまのシールドの${v}%。` },
    refire:  { fam: 'enh',  name: '再発動',   g: '再', v: [0], sh: [0, 1, 0, 0],
               txt: () => `わたした相手を、次のターンも引く。` },
    counter: { fam: 'enh',  name: '反撃',     g: '反', v: [50, 75, 100], sh: [0, 1, 0, 0],
               txt: v => `攻撃に わたすと、敵のヒット1回ごとに その攻撃が ${v}%の力で発動（1ターン${COUNTER_MAX}回まで）。` },
    mirror:  { fam: 'enh',  name: '反射',     g: '鏡', v: [50, 75, 100], sh: [0, 1, 0, 0],
               txt: v => `盾・堅牢に わたすと、防いだダメージの${v}%を 敵に返す。` },
    leech:   { fam: 'enh',  name: '吸収',     g: '吸', v: [30, 45, 60], sh: [0, 1, 0, 0],
               txt: v => `攻撃：与えたヒットダメージの${v}%回復。盾・堅牢：防いだダメージの${v}%回復。` },
  };
  const TYPES = Object.keys(B);
  const FAMS = { atk: '攻撃', def: '防御', abil: '能力', enh: '強化' };
  const FAM_HINT = {
    atk: '凹だけ。能力を受け取ると、ヒットごとに働く。',
    def: '凹だけ。能力を受け取ると、敵のヒット1回ごとに働く。',
    abil: '凸でわたす。わたさなければ、自分で1回 働く（半分の力）。',
    enh: '凸だけ。はめた相手を強くする。ひとりでは働かない。',
  };
  // ことばの説明（画面はこれをそのまま出す）
  const KW = {
    poison: { name: '毒', text: 'ターンの終わりに 毒の数だけダメージ。そのあと半分にへる。' },
    fire:   { name: '炎', text: '敵がヒットを受けるたび 炎の数だけ追加ダメージ。ターンの終わりに消える。' },
    ice:    { name: '氷', text: `${FREEZE_AT}たまると凍結：このターンの敵の攻撃のダメージが半分。` },
    shock:  { name: '雷', text: `${SHOCK_AT}たまると感電：${SHOCK_DMG}ダメージと、次のターン 1個多く引く。` },
    charge: { name: 'たまり', text: '次のターンから、最初に当たったヒットに ぜんぶ のる。' },
  };
  const STATUS_NAMES = { poison: '毒', fire: '炎', ice: '氷', shock: '雷' };
  const maxLv = type => B[type].v.length;
  const lvOf = (lv, type) => Math.min(maxLv(type), (lv && lv[type]) || 1);
  const val = (lv, type) => B[type].v[lvOf(lv, type) - 1];
  function blockText(type, lv) { const d = B[type]; return d.txt(d.v[Math.min(d.v.length, lv || 1) - 1]); }

  // はじめのデッキ（種類, 向き）。14個。受け取る側（攻撃・防御）8個、わたす側（能力・強化）6個。
  const START_DECK = [
    ['slash', 0], ['slash', 0], ['slash', 2], ['shot', 0], ['area', 0],
    ['shield', 0], ['shield', 2], ['shield', 1],
    ['amp', 0], ['amp', 1], ['haste', 2], ['poison', 1], ['poison', 0], ['regen', 3],
  ];

  // ---------------------------------------------------------------- 形
  const NB = []; // NB[cell][辺] = となりのマス（なければ -1）。辺: 0上 1右 2下 3左
  for (let i = 0; i < N; i++) {
    const x = i % W, y = (i / W) | 0;
    NB.push([y > 0 ? i - W : -1, x < W - 1 ? i + 1 : -1, y < H - 1 ? i + W : -1, x > 0 ? i - 1 : -1]);
  }
  const INNER = []; for (let i = 0; i < N; i++) if (NB[i].every(j => j >= 0)) INNER.push(i);
  const EDGE_CACHE = {};
  // 向き rot（時計回りに 0〜3）で回した辺の形
  function edges(type, rot) {
    const k = type + (rot & 3); let e = EDGE_CACHE[k];
    if (!e) { const s = B[type].sh; e = EDGE_CACHE[k] = [0, 1, 2, 3].map(i => s[(i - (rot & 3) + 4) % 4]); }
    return e;
  }
  const rd = x => Math.round(x);

  // どの組が「効く」か（画面の印も、計算も、この1つの表を使う）。 g … わたす側の種類、x … 受け取る側のブロック
  function accepts(g, x) {
    const gf = B[g].fam;
    if (gf === 'abil') return true; // 能力 → 攻撃・防御・能力（能力が相手のときは、相手が自分で働くときだけ。derive で見る）
    if (g === 'amp' || g === 'haste' || g === 'refire') return true;
    if (g === 'pierce') return x.fam === 'atk' || x.type === 'chase';
    if (g === 'spread') return x.fam === 'abil';
    if (g === 'sustain') return x.type === 'shield' || x.type === 'poison' || x.type === 'fire';
    if (g === 'convert' || g === 'counter') return x.fam === 'atk';
    if (g === 'mirror') return x.type === 'shield' || x.type === 'tough';
    if (g === 'leech') return x.fam === 'atk' || x.type === 'shield' || x.type === 'tough';
    return false;
  }

  // ---------------------------------------------------------------- つながりの計算
  // 盤面から「いま何がどう働くか」を全部出す。resolve も画面もこれだけを見る。
  function derive(s) {
    const board = s.board, cards = s.cards, sealed = s.sealed || [], lv = s.lv;
    const V = t => val(lv, t);
    const blk = new Array(N).fill(null), cells = [];
    for (let i = 0; i < N; i++) {
      const id = board[i]; if (id == null) continue;
      const c = cards[id], def = B[c.type];
      blk[i] = { cell: i, id, type: c.type, fam: def.fam, e: edges(c.type, c.rot), sealed: sealed.indexOf(id) >= 0,
                 ins: [], outs: [], m: {}, gives: false, live: true, got: [], ord: 0 };
      cells.push(i);
    }
    // 1. はまっている所（凸 → 凹）
    const links = [];
    for (const a of cells) {
      const A = blk[a]; if (A.sealed) continue;
      for (let side = 0; side < 4; side++) {
        if (A.e[side] !== 1) continue;
        const b = NB[a][side]; if (b < 0) continue;
        const X = blk[b]; if (!X || X.sealed || X.e[(side + 2) % 4] !== -1) continue;
        const ln = { from: a, to: b, side, ok: false };
        links.push(ln); A.outs.push(ln); X.ins.push(ln);
      }
    }
    // 2. 強化（わたした相手に効くか）
    for (const ln of links) {
      const A = blk[ln.from], X = blk[ln.to];
      if (A.fam !== 'enh') continue;
      if (accepts(A.type, X)) { ln.ok = true; X.m[A.type] = (X.m[A.type] || 0) + 1; }
    }
    const targetsAll = cells.filter(i => blk[i].fam === 'atk' || blk[i].fam === 'def');
    // 3. 能力ブロック：わたすか、自分で働くか。
    //    わたす相手が能力ブロックのときは、その相手が「自分で働く」ときだけ効く（わたす側になった相手には、とどかない）。
    const state = {}; // cell → 1 計算中 / 2 すんだ
    function settle(i) {
      const A = blk[i]; if (state[i] === 2) return A.gives; if (state[i] === 1) return false; // 輪になっているときは、先に見た方が「わたす側」
      state[i] = 1;
      let gives = false;
      for (const ln of A.outs) {
        const X = blk[ln.to];
        ln.ok = X.fam === 'abil' ? !settle(ln.to) : true;
        if (ln.ok) gives = true;
      }
      A.spreadTo = [];
      if (A.m.spread) { A.spreadTo = targetsAll.filter(t => !A.outs.some(ln => ln.to === t)); if (A.spreadTo.length) gives = true; }
      A.gives = gives; state[i] = 2; return gives;
    }
    for (const i of cells) if (blk[i].fam === 'abil') settle(i);
    const multOf = m => 1 + (m.amp || 0) * (V('amp') - 1), againOf = m => 1 + (m.haste || 0) * V('haste');
    const giftOf = A => ({ kind: A.type, amt: rd(V(A.type) * multOf(A.m)), times: againOf(A.m), cell: A.cell, pierce: !!A.m.pierce, bonus: (A.m.pierce || 0) * V('pierce') });
    for (const i of cells) {
      const A = blk[i]; if (A.fam !== 'abil') continue;
      A.gift = giftOf(A);
      if (!A.gives) continue;
      for (const ln of A.outs) if (ln.ok) blk[ln.to].got.push(A.gift);
      for (const t of A.spreadTo) blk[t].got.push(A.gift);
    }
    // 4. 働くもの
    const d = {
      blk, links, cells, atk: [], solo: [], order: [],
      shieldGain: 0, shieldCells: [], tough: 0, toughCells: [], dodge: 0, dodgeCells: [],
      defGifts: [], reflect: 0, mirrorCells: [], leechDef: 0, shieldKeep: 0,
      sustain: { poison: false, fire: false }, fireKeep: V('sustain') / 100, retain: [], lv,
    };
    for (const i of cells) {
      const X = blk[i], m = X.m, v = V(X.type);
      const mult = multOf(m), again = againOf(m);
      if (m.refire) d.retain.push(X.id);
      if (X.fam === 'atk') {
        const a = { cell: i, type: X.type, dmg: rd(v * mult), hits: B[X.type].hits + again - 1, pierce: !!m.pierce, bonus: (m.pierce || 0) * V('pierce'),
                    convert: (m.convert || 0) * V('convert') / 100, counter: m.counter || 0, counterMult: V('counter') / 100, leech: (m.leech || 0) * V('leech') / 100, gifts: X.got };
        X.atk = a; d.atk.push(a); d.order.push(i);
      } else if (X.fam === 'def') {
        const n = rd(v * mult) * again; X.n = n;
        if (X.type === 'shield') { d.shieldGain += n; d.shieldCells.push(i); if (m.sustain) d.shieldKeep = V('sustain') / 100; }
        else if (X.type === 'tough') { d.tough += n; d.toughCells.push(i); }
        else { d.dodge += n; d.dodgeCells.push(i); }
        for (const g of X.got) d.defGifts.push({ g, at: i });
        if (m.mirror) { d.reflect += m.mirror * V('mirror') / 100; d.mirrorCells.push(i); }
        if (m.leech) d.leechDef += m.leech * V('leech') / 100;
      } else if (X.fam === 'abil') {
        if (m.sustain) d.sustain[X.type] = true;
        if (!X.gives) { X.soloGift = Object.assign({}, X.gift, { amt: Math.ceil(X.gift.amt / 2) }); d.solo.push({ cell: i, gift: X.soloGift, extra: X.got }); d.order.push(i); } // ひとりは半分の力
      } else X.live = X.outs.some(ln => ln.ok); // 強化：どこかに効いていれば働いている
    }
    d.order.sort((a, b) => a - b);
    d.order.forEach((c, k) => { blk[c].ord = k + 1; });
    return d;
  }
  // 破壊でねらわれるブロック（いちばん多く はまっているもの。同じ数なら左上が先）
  function destroyTargets(d, n) {
    const c = d.cells.map(i => ({ i, k: d.blk[i].ins.length + d.blk[i].outs.length })).filter(x => x.k > 0);
    c.sort((a, b) => b.k - a.k || a.i - b.i);
    return c.slice(0, n).map(x => x.i);
  }

  // 能力1つの短い文（「毒+2」など）。画面の札・説明・きろくが同じものを使う。
  function giftText(g) {
    const t = g.times > 1 ? ` ×${g.times}回` : '';
    if (g.kind === 'poison' || g.kind === 'fire' || g.kind === 'ice' || g.kind === 'shock') return `${STATUS_NAMES[g.kind]}+${g.amt}${t}`;
    if (g.kind === 'regen') return `HP+${g.amt}${t}`;
    if (g.kind === 'chase') return `追撃${g.amt + (g.bonus || 0)}${g.pierce ? '（貫通）' : ''}${t}`;
    if (g.kind === 'consume') return `毒消費×${g.amt}${t}`;
    if (g.kind === 'charge') return `たまり+${g.amt}${t}`;
    return '';
  }
  // 札の上に出す短い字（種類の字は札に出ているので、数字だけ）
  function shortGift(g) {
    const n = g.kind === 'chase' ? String(g.amt + (g.bonus || 0)) : g.kind === 'consume' ? `×${g.amt}` : `+${g.amt}`;
    return g.times > 1 ? `${n} ${g.times}回` : n;
  }
  // 盤面のブロック1つが「いま何をするか」。 main … 札に大きく出す短い字、 lines … 説明の行、 idle … 働いていない
  function summary(d, cell) {
    const X = d.blk[cell]; if (!X) return null;
    const out = { main: '', lines: [], idle: false, gives: false };
    const m = X.m, V = t => val(d.lv, t);
    if (X.sealed) out.lines.push('封印：このターン、凸も凹も はまらない。');
    if (X.fam === 'atk') {
      const a = X.atk; out.main = `${a.dmg}×${a.hits}`;
      out.lines.push(`${a.dmg}ダメージ ×${a.hits}ヒット`);
      if (a.pierce) out.lines.push('装甲と結界を無視' + (a.bonus ? `（ヒット+${a.bonus}）` : ''));
      for (const g of a.gifts) out.lines.push(`ヒットごとに ${giftText(g)}`);
      if (a.convert) out.lines.push(`最初のヒットに ＋いまのシールドの${rd(a.convert * 100)}%`);
      if (a.leech) out.lines.push(`与えたヒットダメージの${rd(a.leech * 100)}%回復`);
      if (a.counter) out.lines.push(`敵のヒット1回ごとに ${rd(a.counterMult * 100)}%の力で発動（${COUNTER_MAX * a.counter}回まで）`);
    } else if (X.fam === 'def') {
      if (X.type === 'shield') { out.main = `+${X.n}`; out.lines.push(`シールド+${X.n}`); if (m.sustain) out.lines.push(`シールドが${V('sustain')}%残る`); }
      else if (X.type === 'tough') { out.main = `−${X.n}`; out.lines.push(`敵のヒット1回ごとに −${X.n}`); }
      else { out.main = `${X.n}回`; out.lines.push(`敵の最初のヒットを ${X.n}回 よける`); }
      for (const g of X.got) out.lines.push(`敵のヒット1回ごとに ${giftText(g)}`);
      if (m.mirror) out.lines.push(`防いだダメージの${m.mirror * V('mirror')}%を返す`);
      if (m.leech) out.lines.push(`防いだダメージの${m.leech * V('leech')}%回復`);
    } else if (X.fam === 'abil') {
      out.main = shortGift(X.gives ? X.gift : X.soloGift);
      if (X.gives) {
        out.gives = true;
        const to = X.outs.filter(ln => ln.ok).map(ln => B[d.blk[ln.to].type].name);
        out.lines.push(`${giftText(X.gift)} を わたしている（自分では働かない）` + (to.length ? `：${to.join('・')}` : ''));
        if (X.spreadTo.length) out.lines.push(`拡散：攻撃・防御ブロック ${X.spreadTo.length}個にも とどく`);
      } else {
        out.lines.push(`自分で1回 働く（半分の力）：${giftText(X.soloGift)}`);
        for (const g of X.got) out.lines.push(`いっしょに ${giftText(g)}`);
      }
      if (m.sustain) out.lines.push(X.type === 'poison' ? 'このターンの終わりに 毒がへらない' : `炎が${V('sustain')}%残る`);
    } else {
      out.gives = X.live; out.idle = !X.live;
      if (X.live) out.lines.push(`${X.outs.filter(ln => ln.ok).map(ln => B[d.blk[ln.to].type].name).join('・')} を強くしている`);
      else out.lines.push(X.outs.length ? 'はまっているが、この相手には効かない。' : 'どこにも はまっていない（働かない）。');
    }
    if (m.refire) out.lines.push('次のターンも引く');
    return out;
  }

  // ---------------------------------------------------------------- 敵
  // script(c) は c 周目の行動のならび（周がすすむほど強くなる）。数字は「1戦目」の強さ。何戦目かで STAGE_ATK がかかる。
  const A = (dmg, hits) => ({ k: 'atk', dmg, hits: hits || 1 });
  const ENEMIES = {
    golem: {
      name: '岩ゴーレム', g: '岩', hp: 80, armor: 2,
      trait: '装甲2：ヒットのダメージを 1回ごとに2へらす（毒などは へらせない）。',
      hint: '一撃が重い。',
      script: c => [
        { label: 'なぐる', parts: [A(12 + 5 * c)] },
        { label: 'かためる', parts: c >= 1 ? [A(6 * c), { k: 'guard', n: 10 + 5 * c }] : [{ k: 'guard', n: 10 }] },
        { label: '大岩おとし', parts: [A(22 + 9 * c)] },
        { label: 'じならし', parts: [A(8 + 5 * c), { k: 'destroy', n: 1 }] },
      ],
    },
    hunter: {
      name: '影の狩人', g: '影', hp: 90, evade: 2,
      trait: '身かわし：毎ターン、あなたの最初の2ヒットをよける。',
      hint: 'すばやい連続攻撃。',
      script: c => {
        const l = [
          { label: '三連づき', parts: [A(4 + 2 * c, 3)] },
          { label: 'わなをしかける', parts: [A(6 + 3 * c, 2), { k: 'rubble', n: 2 }] },
          { label: '乱れうち', parts: [A(3 + c, 5)] },
        ];
        if (c >= 1) l.push({ label: '影にかくれる', parts: [A(5 + 3 * c, 2), { k: 'guard', n: 8 + 5 * c }] });
        return l;
      },
    },
    hydra: {
      name: 'ヒドラ', g: '蛇', hp: 95, regen: 5,
      trait: '再生5：ターンの終わりに HPを5回復する。ときどき脱皮して 状態を全部消す。',
      hint: '首がふえて ヒット数がふえる。',
      script: c => {
        const h = c >= 2 ? 1 : 0;
        const l = [
          { label: 'かみつく', parts: [A(9 + 3 * c, 1 + h)] },
          { label: '首をふりまわす', parts: [A(5 + 2 * c, 2 + h)] },
          { label: '脱皮', parts: [{ k: 'cleanse' }, { k: 'guard', n: 8 + 4 * c }] },
        ];
        if (c >= 1) l.push({ label: '毒のいき', parts: [A(6 + 4 * c), { k: 'curse', n: 2 + 2 * c }] });
        return l;
      },
    },
    mage: {
      name: '呪いの術師', g: '呪', hp: 105,
      trait: 'じゃまをする：封印・がれき・破壊。呪いはシールドで防げない。',
      hint: '長引くほど じゃまがふえる。',
      script: c => {
        const l = [
          { label: '呪いをかける', parts: [A(9 + 4 * c), { k: 'curse', n: 3 + 2 * c }] },
          { label: '封印の術', parts: [A(13 + 5 * c), { k: 'seal', n: c >= 1 ? 3 : 2 }] },
          { label: '結界をはる', parts: [{ k: 'guard', n: 16 + 8 * c }] },
          { label: 'がれき落とし', parts: [A(14 + 5 * c), { k: 'rubble', n: c >= 1 ? 3 : 2 }] },
        ];
        if (c >= 1) l.push({ label: '大呪文', parts: [A(18 + 12 * c), { k: 'destroy', n: c >= 2 ? 2 : 1 }] });
        return l;
      },
    },
    berserk: {
      name: '狂戦士', g: '狂', hp: 120, thorns: 1,
      trait: 'トゲ1：あなたのヒット1回ごとに、あなたが1ダメージ受ける（シールドで防げる）。',
      hint: '手数の多い連続攻撃。',
      script: c => [
        { label: '三連なぐり', parts: [A(5 + 2 * c, 3)] },
        { label: 'あばれる', parts: [A(4 + 2 * c, 4)] },
        { label: 'めった打ち', parts: [A(3 + c, 6)] },
        { label: '頭突き', parts: [A(6 + 4 * c, 2), { k: 'seal', n: 1 }] },
      ],
    },
    // テスト用（画面には出さない）
    dummy: { name: 'かかし', g: '案', hp: 99999, trait: '', hint: '', hidden: true, script: () => [{ label: '立っている', parts: [] }] },
  };
  const ENEMY_IDS = Object.keys(ENEMIES).filter(k => !ENEMIES[k].hidden);

  // 予告の文（画面はこれをそのまま出す）
  function intentLines(it) {
    const out = [];
    for (const p of it.parts) {
      if (p.k === 'atk') out.push({ k: 'atk', text: p.hits > 1 ? `攻撃 ${p.dmg}×${p.hits}回` : `攻撃 ${p.dmg}` });
      else if (p.k === 'guard') out.push({ k: 'guard', text: `結界 ${p.n}（次のターン、ヒットのダメージを${p.n}まで防ぐ）` });
      else if (p.k === 'seal') out.push({ k: 'seal', text: `封印 ${p.n}個（次のターン、手札の${p.n}個は はまらない）` });
      else if (p.k === 'destroy') out.push({ k: 'destroy', text: `破壊 ${p.n}個（いちばん多く はまっているブロックが、この戦いから消える）` });
      else if (p.k === 'rubble') out.push({ k: 'rubble', text: `がれき ${it.cells.rubble.length}マス（次のターン、そのマスに置けない）` });
      else if (p.k === 'cleanse') out.push({ k: 'cleanse', text: '脱皮（敵の毒・炎・氷・雷を全部消す）' });
      else if (p.k === 'curse') out.push({ k: 'curse', text: `呪い+${p.n}（ターンの終わりに呪いの数だけダメージ、1ずつへる）` });
    }
    if (!out.length) out.push({ k: 'none', text: '何もしない' });
    return out;
  }

  // ---------------------------------------------------------------- 乱数（種で固定）
  function rnd(s) {
    s.rs = (s.rs + 0x6D2B79F5) | 0; let t = s.rs;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function shuffle(s, a) { for (let i = a.length - 1; i > 0; i--) { const j = (rnd(s) * (i + 1)) | 0; const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function pick(s, arr, n) {
    const a = arr.slice(), out = [];
    while (out.length < n && a.length) out.push(a.splice((rnd(s) * a.length) | 0, 1)[0]);
    return out;
  }

  // ---------------------------------------------------------------- 1戦の状態
  // o: { enemyId, stage, deck:[[type,rot]|{type,rot}], seed, hp, rot（回せるか）, hand（引く数） }
  function newFight(o) {
    const def = ENEMIES[o.enemyId], stage = o.stage || 0;
    const cards = (o.deck || START_DECK).map((c, id) => (Array.isArray(c) ? { id, type: c[0], rot: c[1] & 3 } : { id, type: c.type, rot: c.rot & 3 }));
    const hp = Math.round(def.hp * STAGE_HP[stage]);
    const s = {
      rs: (o.seed | 0) || 1, enemyId: o.enemyId, stage, turn: 0, phase: 'place', canRot: !!o.rot, handSize: o.hand || HAND, lv: o.lv || {},
      cards, deck: [], discard: [], gone: [], hand: [], board: new Array(N).fill(null),
      sealed: [], blocked: [], sealNext: 0, blockNext: [], drawBonus: 0,
      p: { hp: o.hp || MAXHP, max: MAXHP, shield: 0, curse: 0, charge: 0, chargeNext: 0 },
      e: { id: o.enemyId, hp, max: hp, armor: def.armor || 0, evade: def.evade || 0, regen: def.regen || 0, thorns: def.thorns || 0,
           poison: 0, fire: 0, ice: 0, shock: 0, guard: 0, frozen: 0, cyc: 0, si: 0 },
      intent: null,
      stats: { dealt: {}, total: 0, taken: 0, blocked: 0, healed: 0 },
    };
    s.deck = shuffle(s, cards.map(c => c.id));
    beginTurn(s);
    return s;
  }
  function cloneState(s) {
    const c = Object.assign({}, s);
    c.cards = s.canRot ? s.cards.map(k => ({ id: k.id, type: k.type, rot: k.rot })) : s.cards; // 回さないなら札は書きかえないので共有
    c.deck = s.deck.slice(); c.discard = s.discard.slice(); c.gone = s.gone.slice(); c.hand = s.hand.slice(); c.board = s.board.slice();
    c.sealed = s.sealed.slice(); c.blocked = s.blocked.slice(); c.blockNext = s.blockNext.slice();
    c.p = Object.assign({}, s.p); c.e = Object.assign({}, s.e);
    c.stats = Object.assign({}, s.stats); c.stats.dealt = Object.assign({}, s.stats.dealt);
    return c; // intent は作ったあと書きかえないので共有してよい
  }

  function makeIntent(s) {
    const def = ENEMIES[s.e.id];
    let list = def.script(s.e.cyc);
    if (s.e.si >= list.length) { s.e.cyc++; s.e.si = 0; list = def.script(s.e.cyc); }
    const raw = list[s.e.si];
    // 3周目からは「怒り」：攻撃がさらに強くなる（長引かせると危ない）
    const rage = s.e.cyc >= 2 ? 1 + 0.3 * (s.e.cyc - 1) : 1, k = STAGE_ATK[s.stage] * rage;
    const parts = raw.parts.map(p => (p.k === 'atk' ? { k: 'atk', dmg: Math.max(1, Math.round(p.dmg * k)), hits: p.hits }
      : p.k === 'guard' ? { k: 'guard', n: Math.round(p.n * STAGE_HP[s.stage]) } : p));
    const it = { label: raw.label, parts, rage: rage > 1, cells: { rubble: [] } };
    for (const part of parts) if (part.k === 'rubble') {
      // がれきは、まん中のマスから落ちる（はしに落ちても じゃまにならないので）
      it.cells.rubble = pick(s, INNER, part.n).sort((a, b) => a - b);
    }
    return it;
  }
  function drawOne(s) {
    if (!s.deck.length) { if (!s.discard.length) return false; s.deck = shuffle(s, s.discard); s.discard = []; }
    s.hand.push(s.deck.pop()); return true;
  }
  function beginTurn(s) {
    s.turn++;
    s.blocked = s.blockNext; s.blockNext = [];
    s.hand = []; s.board = new Array(N).fill(null);
    const n = s.handSize + s.drawBonus; s.drawBonus = 0;
    for (let i = 0; i < n; i++) if (!drawOne(s)) break;
    s.sealed = s.sealNext > 0 ? pick(s, s.hand, s.sealNext) : []; s.sealNext = 0;
    s.intent = makeIntent(s);
    s.phase = 'place';
  }

  // ---------------------------------------------------------------- プレイヤーの手（置き方は、発動するまで何回でも変えられる）
  function cellOf(s, id) { return s.board.indexOf(id); }
  function canPut(s, id, cell) {
    return s.phase === 'place' && cell >= 0 && cell < N && s.hand.indexOf(id) >= 0 && s.blocked.indexOf(cell) < 0 && s.board[cell] !== id;
  }
  // id のブロックを cell に置く。そこに別のブロックがあれば入れかえる（手札から置いたときは、もとのブロックは手札にもどる）。
  function put(s, id, cell) {
    if (!canPut(s, id, cell)) return false;
    const from = s.board.indexOf(id), other = s.board[cell];
    s.board[cell] = id; if (from >= 0) s.board[from] = other;
    return true;
  }
  function take(s, id) { const c = s.board.indexOf(id); if (s.phase !== 'place' || c < 0) return false; s.board[c] = null; return true; }
  function clearBoard(s) { if (s.phase !== 'place') return false; s.board = new Array(N).fill(null); return true; }
  function rotate(s, id) { // ?rot=1 のときだけ（くらべる用）
    if (!s.canRot || s.phase !== 'place' || s.hand.indexOf(id) < 0) return false;
    s.cards[id].rot = (s.cards[id].rot + 1) & 3; return true;
  }
  // 置く前に見せる用：id を cell に置いたら、そのブロックに はまる所（効く・効かない）
  function linksIfPut(s, id, cell) {
    const c = cloneState(s); if (!put(c, id, cell)) return null;
    const d = derive(c);
    return d.links.filter(ln => ln.from === cell || ln.to === cell);
  }

  // ---------------------------------------------------------------- ターンの発動
  // 順番： 1 防御（盾をはる）→ 2 攻撃ブロックと「自分で働く能力ブロック」が左上から順に → 3 敵の行動 → 4 ターンの終わり
  // opt.sim … ボットの先読み用。次のターンの準備（引く・予告）をしない。
  function resolve(s, opt) {
    const ev = []; const e = s.e, p = s.p, st = s.stats;
    const d = derive(s), blk = d.blk;
    let over = false, shocked = false, froze = false, hits = 0, evadeLeft = e.evade;
    const snap = o => { o.eh = Math.max(0, e.hp); o.ph = Math.max(0, p.hp); o.sh = p.shield; o.es = [e.poison, e.fire, e.ice, e.shock, e.guard, e.frozen]; o.pc = p.curse; o.ch = p.charge; ev.push(o); return o; };
    const credit = (k, n) => { if (n > 0) { st.dealt[k] = (st.dealt[k] || 0) + n; st.total += n; } };
    const hurtEnemy = n => { e.hp -= n; if (e.hp <= 0 && !over) { over = true; s.phase = 'won'; } };
    const hurtPlayer = n => { p.hp -= n; st.taken += n; if (p.hp <= 0 && !over) { over = true; s.phase = 'lost'; } };
    const healPlayer = n => { const h = Math.max(0, Math.min(p.max - p.hp, n)); p.hp += h; st.healed += h; return h; };

    // ヒット1回。 cell … 打ったブロック、 src … もとになったブロック（追撃なら追撃ブロック）
    function hit(cell, base, kind, src, pierce, leech, bonus) {
      if (over || hits >= HIT_CAP) return false;
      hits++;
      if (evadeLeft > 0) { evadeLeft--; snap({ t: 'hit', cell, src, kind, dodged: true, dmg: 0 }); return false; }
      const ch = p.charge; p.charge = 0;
      const fireB = e.fire;
      let dmg = Math.max(0, rd(base)) + ch + fireB, armorCut = 0, guardCut = 0;
      if (pierce) dmg += bonus || 0;
      else {
        armorCut = Math.min(dmg, e.armor); dmg -= armorCut;
        guardCut = Math.min(dmg, e.guard); e.guard -= guardCut; dmg -= guardCut;
      }
      const f = Math.min(fireB, dmg), c2 = Math.min(ch, dmg - f);
      credit('fire', f); credit('charge', c2); credit(kind === 'chase' ? 'chase' : blk[cell].type, dmg - f - c2);
      hurtEnemy(dmg);
      let heal = 0;
      if (leech > 0 && dmg > 0 && p.hp > 0) heal = healPlayer(rd(dmg * leech));
      snap({ t: 'hit', cell, src, kind, dmg, fire: f, charge: ch, armorCut, guardCut, heal });
      if (!over && e.thorns > 0) {
        let t = e.thorns; const sc = Math.min(p.shield, t); p.shield -= sc; t -= sc; st.blocked += sc;
        if (t > 0) hurtPlayer(t);
        snap({ t: 'thorn', dmg: t, shield: sc });
      }
      return true;
    }
    // 能力を1回（times 回）使う。 at … 働いたブロック（攻撃・防御・自分）
    function use(g, at) {
      for (let k = 0; k < g.times && !over; k++) {
        if (g.kind === 'poison') { e.poison += g.amt; snap({ t: 'gift', kind: g.kind, cell: g.cell, at, n: g.amt }); }
        else if (g.kind === 'fire') { e.fire += g.amt; snap({ t: 'gift', kind: g.kind, cell: g.cell, at, n: g.amt }); }
        else if (g.kind === 'ice') {
          e.ice += g.amt; snap({ t: 'gift', kind: g.kind, cell: g.cell, at, n: g.amt });
          if (!froze && !e.frozen && e.ice >= FREEZE_AT) { froze = true; e.ice -= FREEZE_AT; e.frozen = 1; snap({ t: 'freeze' }); }
        } else if (g.kind === 'shock') {
          e.shock += g.amt; snap({ t: 'gift', kind: g.kind, cell: g.cell, at, n: g.amt });
          if (!shocked && e.shock >= SHOCK_AT) {
            shocked = true; e.shock -= SHOCK_AT; credit('shock', SHOCK_DMG); hurtEnemy(SHOCK_DMG); s.drawBonus = 1;
            snap({ t: 'shock', dmg: SHOCK_DMG });
          }
        } else if (g.kind === 'regen') { const h = healPlayer(g.amt); snap({ t: 'gift', kind: g.kind, cell: g.cell, at, n: h }); }
        else if (g.kind === 'charge') { p.chargeNext += g.amt; snap({ t: 'gift', kind: g.kind, cell: g.cell, at, n: g.amt }); }
        else if (g.kind === 'consume') {
          const n = e.poison, cd = rd(n * g.amt); e.poison = 0;
          credit('consume', cd); if (cd > 0) hurtEnemy(cd); snap({ t: 'consume', cell: g.cell, at, n, dmg: cd });
        } else if (g.kind === 'chase') {
          const kinds = (e.poison > 0) + (e.fire > 0) + (e.ice > 0) + (e.shock > 0);
          hit(at, g.amt * (1 + kinds), 'chase', g.cell, g.pierce, 0, g.bonus);
        }
      }
    }
    function fire(a, mult, mode) {
      if (over) return;
      snap({ t: 'fire', cell: a.cell, mode, mult });
      for (let i = 0; i < a.hits && !over; i++) {
        const ok = hit(a.cell, (a.dmg + (i === 0 ? p.shield * a.convert : 0)) * mult, 'atk', a.cell, a.pierce, a.leech, a.bonus);
        if (ok) for (const g of a.gifts) { if (over) break; use(g, a.cell); }
      }
    }

    // 1 防御
    if (d.shieldGain > 0) { p.shield += d.shieldGain; snap({ t: 'shield', add: d.shieldGain, cells: d.shieldCells }); }
    // 2 攻撃と、自分で働く能力（左上から順）
    for (const c of d.order) {
      if (over) break;
      const X = blk[c];
      if (X.fam === 'atk') fire(X.atk, 1, 'main');
      else { snap({ t: 'solo', cell: c }); use(X.soloGift, c); for (const g of X.got) { if (over) break; use(g, c); } }
    }
    // 3 敵の行動
    let attacked = false;
    if (!over) {
      e.guard = 0;
      const it = s.intent; snap({ t: 'eact', label: it.label });
      const cUses = {}; let dodgeLeft = d.dodge;
      for (const part of it.parts) {
        if (over) break;
        if (part.k === 'atk') {
          let prevented = 0; attacked = true;
          for (let h = 0; h < part.hits && !over; h++) {
            if (dodgeLeft > 0) { dodgeLeft--; snap({ t: 'ehit', dodged: true, cells: d.dodgeCells, dmg: 0, raw: part.dmg }); }
            else {
              let dmg = part.dmg;
              const ic = e.frozen ? dmg - Math.ceil(dmg / 2) : 0; dmg -= ic;
              const tc = Math.min(dmg, d.tough); dmg -= tc;
              const sc = Math.min(p.shield, dmg); p.shield -= sc; dmg -= sc; prevented += tc + sc;
              st.blocked += ic + tc + sc;
              if (dmg > 0) hurtPlayer(dmg);
              snap({ t: 'ehit', dmg, raw: part.dmg, ice: ic, tough: tc, shield: sc });
            }
            // 防御ブロックが受け取った能力：敵のヒット1回ごとに
            for (const x of d.defGifts) { if (over) break; use(x.g, x.at); }
            // 反撃
            if (!over) for (const a of d.atk) if (a.counter) {
              const u = cUses[a.cell] || 0;
              if (u < COUNTER_MAX * a.counter && !over) { cUses[a.cell] = u + 1; fire(a, a.counterMult, 'counter'); }
            }
          }
          if (!over && prevented > 0 && d.reflect > 0) {
            const r = rd(prevented * d.reflect);
            credit('mirror', r); hurtEnemy(r); snap({ t: 'reflect', dmg: r, cells: d.mirrorCells });
          }
          if (!over && prevented > 0 && d.leechDef > 0) { const h = healPlayer(rd(prevented * d.leechDef)); if (h > 0) snap({ t: 'pheal', n: h }); }
        } else if (part.k === 'guard') { e.guard = part.n; snap({ t: 'guard', n: part.n }); }
        else if (part.k === 'seal') { s.sealNext += part.n; snap({ t: 'seal', n: part.n }); }
        else if (part.k === 'destroy') {
          const cells = destroyTargets(d, part.n), ids = cells.map(c => blk[c].id);
          for (const id of ids) s.gone.push(id);
          snap({ t: 'destroy', cells, ids });
        } else if (part.k === 'rubble') { s.blockNext = it.cells.rubble.slice(); snap({ t: 'rubble', cells: s.blockNext }); }
        else if (part.k === 'cleanse') { e.poison = e.fire = e.ice = e.shock = 0; e.frozen = 0; snap({ t: 'cleanse' }); }
        else if (part.k === 'curse') { p.curse += part.n; snap({ t: 'cursed', n: part.n }); }
      }
    }
    // 4 ターンの終わり
    if (!over && e.poison > 0) { const n = e.poison; credit('poison', n); hurtEnemy(n); snap({ t: 'tick', dmg: n }); }
    if (!over) {
      if (!d.sustain.poison) e.poison = Math.floor(e.poison / 2);
      e.fire = d.sustain.fire ? Math.floor(e.fire * d.fireKeep) : 0;
      e.frozen = 0;
      if (p.curse > 0) { const n = p.curse; hurtPlayer(n); p.curse--; snap({ t: 'curse', dmg: n }); }
    }
    if (!over) {
      if (e.regen > 0 && e.hp < e.max) { const n = Math.min(e.max - e.hp, e.regen); e.hp += n; snap({ t: 'eregen', n }); }
      p.charge += p.chargeNext; p.chargeNext = 0;
      p.shield = Math.floor(p.shield * d.shieldKeep);
      // 手札を全部 捨て札へ。再発動のブロックは山札のいちばん上へ。破壊されたブロックは、この戦いから消える。
      const keep = [];
      for (const id of s.hand) {
        if (s.gone.indexOf(id) >= 0) continue;
        if (d.retain.indexOf(id) >= 0) keep.push(id); else s.discard.push(id);
      }
      for (const id of keep) s.deck.push(id);
      s.hand = []; s.board = new Array(N).fill(null); s.sealed = [];
      e.si++;
      if (!(opt && opt.sim)) beginTurn(s);
      snap({ t: 'end' });
    }
    if (over) snap({ t: s.phase });
    return ev;
  }
  function endTurn(s) { if (s.phase !== 'place') return null; return resolve(s); }

  // 予想：いま「発動」を押したら どうなるか（本物と同じ計算を写しで回す）
  function forecast(s) {
    if (s.phase !== 'place') return null;
    const c = cloneState(s); const t0 = c.stats.total, k0 = c.stats.taken, h0 = c.stats.healed;
    resolve(c, { sim: true });
    return { dealt: c.stats.total - t0, taken: c.stats.taken - k0, healed: c.stats.healed - h0, eHp: Math.max(0, c.e.hp), pHp: Math.max(0, c.p.hp),
             shield: c.p.shield, poison: c.e.poison, charge: c.p.charge, won: c.phase === 'won', lost: c.phase === 'lost' };
  }

  // ---------------------------------------------------------------- 5連戦（デッキを育てる）
  // run.phase: 'fight' | 'reward'（ブロックをえらぶ）| 'remove'（1個はずす）| 'won' | 'lost'
  function newRun(seed, o) {
    o = o || {};
    const run = { rs: ((seed | 0) || 1) ^ 0x5bd1e995, seed: (seed | 0) || 1, stage: 0, hp: MAXHP, max: MAXHP, canRot: !!o.rot, handSize: o.hand || HAND,
                  deck: START_DECK.map(c => ({ type: c[0], rot: c[1] })), order: [], phase: 'fight', fight: null, reward: null, lv: {}, added: [], removed: [], ups: [] };
    run.order = o.order || shuffle(run, ENEMY_IDS.slice());
    startFight(run);
    return run;
  }
  function startFight(run) {
    run.fight = newFight({ enemyId: run.order[run.stage], stage: run.stage, deck: run.deck, lv: Object.assign({}, run.lv), seed: run.seed * 31 + run.stage * 7919 + 17, hp: run.hp, rot: run.canRot, hand: run.handSize });
    run.phase = 'fight';
  }
  // ごほうび3つ。もっている種類は、半分の確率で「レベルアップ」（その種類ぜんぶが強くなる）になる。それ以外は新しいブロック（向きは でたらめ）。
  function rollReward(run) {
    return pick(run, TYPES, 3).map(type => {
      const rot = (rnd(run) * 4) | 0, own = run.deck.some(c => c.type === type), cur = lvOf(run.lv, type);
      const up = own && cur < maxLv(type) && rnd(run) < 0.5;
      return up ? { type, up: true, lv: cur + 1 } : { type, rot };
    });
  }
  // 戦いが終わったら呼ぶ。勝ち：HP を少し回復して、ブロックをえらぶ画面へ（最後の戦いなら全部クリア）。
  function finishFight(run) {
    const f = run.fight; if (run.phase !== 'fight' || !f || (f.phase !== 'won' && f.phase !== 'lost')) return false;
    if (f.phase === 'lost') { run.hp = 0; run.phase = 'lost'; return true; }
    run.healed = Math.min(run.max - f.p.hp, HEAL_AFTER); run.hp = f.p.hp + run.healed;
    if (run.stage >= STAGES - 1) { run.phase = 'won'; return true; }
    run.phase = 'reward'; run.reward = { round: 1, options: rollReward(run) };
    return true;
  }
  // idx … えらんだ番号（0〜2）。-1 … えらばない。
  function pickReward(run, idx) {
    if (run.phase !== 'reward') return false;
    const o = run.reward.options[idx];
    if (o && o.up) { run.lv[o.type] = o.lv; run.ups.push(o.type); }
    else if (o) { run.deck.push({ type: o.type, rot: o.rot }); run.added.push(o.type); }
    if (run.reward.round < PICKS) { run.reward = { round: run.reward.round + 1, options: rollReward(run) }; return true; }
    run.reward = null; run.phase = 'remove';
    return true;
  }
  // ごほうびのあと、デッキからブロックを1個 はずせる。 idx … デッキの中の番号。-1 … はずさない。
  function removeCard(run, idx) {
    if (run.phase !== 'remove') return false;
    if (idx >= 0 && idx < run.deck.length && run.deck.length > HAND) { run.removed.push(run.deck[idx].type); run.deck.splice(idx, 1); }
    run.stage++; startFight(run);
    return true;
  }
  // デッキの中で、このブロックの凸が はまる凹の数（give）と、このブロックの凹に はまる凸の数（take）。えらぶ画面の めやす。
  function fitCount(deck, card) {
    const e = edges(card.type, card.rot); let give = 0, take = 0;
    for (const c of deck) {
      const x = edges(c.type, c.rot);
      for (let sd = 0; sd < 4; sd++) {
        if (e[sd] === 1 && x[(sd + 2) % 4] === -1) give++;
        if (e[sd] === -1 && x[(sd + 2) % 4] === 1) take++;
      }
    }
    return { give, take };
  }

  return {
    W, H, N, HAND, MAXHP, SHOCK_AT, SHOCK_DMG, FREEZE_AT, COUNTER_MAX, STAGES, PICKS, HEAL_AFTER, STAGE_HP, STAGE_ATK,
    B, TYPES, FAMS, FAM_HINT, KW, STATUS_NAMES, ENEMIES, ENEMY_IDS, START_DECK, NB, INNER,
    blockText, maxLv, lvOf, val, edges, accepts, derive, destroyTargets, giftText, summary, intentLines,
    newFight, cloneState, beginTurn, makeIntent, cellOf, canPut, put, take, clearBoard, rotate, linksIfPut,
    resolve, endTurn, forecast,
    newRun, startFight, finishFight, pickReward, removeCard, rollReward, fitCount,
  };
});
