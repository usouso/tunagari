'use strict';
/*
 * rules.js — ゲームのルール（計算だけ。画面は描かない）
 * 画面(ui.js)・ボット(botcore.js)・テスト(tests.js) が同じこのファイルを使う。
 * resolve() は「何が起きたか」の出来事ログを返し、画面はそれを再生するだけ。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Rules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const W = 5, H = 5, N = W * H, MAXLV = 3, SHOP = 8, MAXHP = 100;
  const SHOCK_AT = 15, SHOCK_DMG = 10, FREEZE_AT = 20, COUNTER_MAX = 2, HIT_CAP = 300;
  const START_CELL = 12;

  // ---------------------------------------------------------------- ブロック
  // v = レベルごとの「数字」。txt はその数字をそのまま使う（文字どおりに動く）。
  const B = {
    slash:   { fam: 'atk',  name: '斬撃',     g: '斬', v: [5, 8, 11], hits: 1,
               txt: v => `${v}ダメージ ×1ヒット。` },
    shot:    { fam: 'atk',  name: '射撃',     g: '射', v: [2, 3, 4], hits: 2,
               txt: v => `${v}ダメージ ×2ヒット。` },
    area:    { fam: 'atk',  name: '範囲攻撃', g: '範', v: [3, 5, 7], hits: 1, diag: true,
               txt: v => `${v}ダメージ ×1ヒット。ななめのブロックとも つながる（まわり8マス）。` },
    poison:  { fam: 'elem', name: '毒',       g: '毒', v: [1, 2, 3],
               txt: v => `ヒットごとに 毒+${v}。毒：ターンの終わりに 毒の数だけダメージ。そのあと半分にへる。` },
    fire:    { fam: 'elem', name: '炎',       g: '炎', v: [1, 2, 3],
               txt: v => `ヒットすると 敵が燃える（炎${v}。もっと大きい炎があれば そのまま）。炎：敵がヒットを受けるたび 炎の数だけ追加ダメージ。ターンの終わりに消える。` },
    ice:     { fam: 'elem', name: '氷',       g: '氷', v: [1, 2, 3],
               txt: v => `ヒットごとに 氷+${v}。氷が${FREEZE_AT}たまると凍結：敵の次の攻撃のダメージが半分になる（1ターンに1回）。` },
    shock:   { fam: 'elem', name: '雷',       g: '雷', v: [1, 2, 3],
               txt: v => `ヒットごとに 雷+${v}。雷が${SHOCK_AT}たまると感電：${SHOCK_DMG}ダメージと、次のターンの手数+1（1ターンに1回）。` },
    chase:   { fam: 'spec', name: '追撃',     g: '追', v: [2, 3, 4],
               txt: v => `攻撃のあと 追加で1ヒット。ダメージは ${v}×（1＋敵についている状態の種類）。` },
    counter: { fam: 'spec', name: '反撃',     g: '反', v: [40, 60, 80],
               txt: v => `敵のヒットを受けるたび、つながった攻撃が ${v}%の力で発動（1ターン${COUNTER_MAX}回まで）。` },
    consume: { fam: 'spec', name: '毒消費',   g: '消', v: [2, 2.5, 3],
               txt: v => `ヒットしたとき 敵の毒を全部消して、消した数×${v} のダメージ。` },
    charge:  { fam: 'spec', name: '蓄積',     g: '蓄', v: [2, 3, 4],
               txt: v => `ターンの終わりに たまり+${v}。つながった攻撃は、発動するたび 最初のヒットに +たまり。` },
    refire:  { fam: 'spec', name: '再発動',   g: '再', v: [50, 75, 100],
               txt: v => `つながった攻撃が もう1回 発動する（${v}%の力）。` },
    amp:     { fam: 'enh',  name: '増幅',     g: '増', v: [50, 75, 100],
               txt: v => `つながった攻撃・属性・防御ブロックの数字 +${v}%（回避には きかない）。` },
    pierce:  { fam: 'enh',  name: '貫通',     g: '貫', v: [0, 2, 4],
               txt: v => `つながった攻撃は 敵の装甲と結界を無視する。` + (v ? `さらにヒットダメージ+${v}。` : '') },
    spread:  { fam: 'enh',  name: '拡散',     g: '拡', v: [50, 75, 100],
               txt: v => `つながった属性を、はなれた攻撃にも ${v}%の力でのせる。` },
    sustain: { fam: 'enh',  name: '持続強化', g: '持', v: [2, 4, 8], v2: [50, 65, 80],
               txt: (v, lv) => `つながった毒・炎は ターンの終わりにへる量が 1/${v} になる。つながった盾は シールドが${B.sustain.v2[lv - 1]}%残る。` },
    haste:   { fam: 'enh',  name: '発動加速', g: '速', v: [1, 2, 3],
               txt: v => `つながった攻撃・追撃の ヒット数+${v}。つながった回避の 休み−${v}（1より短くはならない）。` },
    convert: { fam: 'enh',  name: '効果変換', g: '変', v: [50, 100, 150],
               txt: v => `つながった攻撃の 最初のヒットに、いまのシールドの${v}%を上乗せ。` },
    shield:  { fam: 'def',  name: '盾',       g: '盾', v: [6, 10, 14],
               txt: v => `ターンごとに シールド+${v}。シールドは敵の攻撃を防ぎ、ターンの終わりに消える。` },
    dodge:   { fam: 'def',  name: '回避',     g: '避', v: [3, 2, 1],
               txt: v => `敵のヒットを1回よける。よけたあと ${v}ターン休む（回避が何個あっても、休みは全部いっしょ）。` },
    leech:   { fam: 'def',  name: '吸収',     g: '吸', v: [20, 30, 40],
               txt: v => `つながった攻撃が与えたヒットダメージの ${v}%だけ HP回復。` },
    tough:   { fam: 'def',  name: '堅牢',     g: '堅', v: [2, 3, 4],
               txt: v => `敵のヒット1回ごとに 受けるダメージ−${v}。` },
    mirror:  { fam: 'def',  name: '反射',     g: '鏡', v: [50, 100, 150],
               txt: v => `盾とつなぐと働く。シールドで防いだダメージの ${v}%を 敵に返す。` },
    regen:   { fam: 'def',  name: '再生',     g: '癒', v: [3, 5, 7],
               txt: v => `ターンの終わりに HP+${v}。` },
    rubble:  { fam: 'junk', name: 'がれき',   g: '岩', v: [0, 0, 0],
               txt: () => `何もしない。上にブロックを置けば消える。` },
  };
  const TYPES = Object.keys(B).filter(t => t !== 'rubble');
  const FAMS = { atk: '攻撃', elem: '属性', spec: '特殊', enh: '強化', def: '防御', junk: 'じゃま' };
  const STATUS_NAMES = { poison: '毒', fire: '炎', ice: '氷', shock: '雷' };
  // つながっていないと働かないブロック
  const NEEDS_LINK = { elem: 1, spec: 1, enh: 1 };
  function needsLink(type) { return !!NEEDS_LINK[B[type].fam] || type === 'leech' || type === 'mirror'; }
  function blockText(type, lv) { const d = B[type]; return d.txt(d.v[lv - 1], lv); }

  // どの組み合わせが「つながる」か（画面の線も、計算も、この1つの表を使う）
  function worksOne(a, b) {
    const fa = B[a].fam, fb = B[b].fam;
    if (fa === 'atk') return fb === 'elem' || fb === 'spec' || b === 'amp' || b === 'pierce' || b === 'haste' || b === 'convert' || b === 'leech';
    if (a === 'amp') return fb === 'elem' || (fb === 'def' && b !== 'dodge');
    if (a === 'haste') return b === 'chase' || b === 'dodge';
    if (a === 'sustain') return b === 'poison' || b === 'fire' || b === 'shield';
    if (a === 'spread') return fb === 'elem';
    if (a === 'mirror') return b === 'shield' || b === 'pierce';
    return false;
  }
  function works(a, b) { return worksOne(a, b) || worksOne(b, a); }

  // ---------------------------------------------------------------- 盤面の形
  const NEAR4 = [], NEAR8 = [];
  for (let i = 0; i < N; i++) {
    const x = i % W, y = (i / W) | 0; const n4 = [], n8 = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      n8.push(ny * W + nx); if (!dx || !dy) n4.push(ny * W + nx);
    }
    NEAR4.push(n4); NEAR8.push(n8);
  }
  function isActive(b) { return !!b && !b.sealed && b.type !== 'rubble'; }
  function mk(type) { return { type, lv: 1, sealed: 0, charge: 0, cd: 0 }; }
  const rd = x => Math.round(x);
  const rd1 = x => (x > 0 ? Math.max(1, Math.round(x)) : 0);
  const fmt = x => (Math.abs(x - Math.round(x)) < 1e-9 ? String(Math.round(x)) : (Math.round(x * 10) / 10).toFixed(1));

  // ---------------------------------------------------------------- つながりの計算
  // 盤面から「いま何がどう働くか」を全部出す。resolve も画面もこれだけを見る。
  function derive(board) {
    const L = []; const links = [];
    for (let i = 0; i < N; i++) L.push([]);
    for (let a = 0; a < N; a++) {
      const ba = board[a]; if (!isActive(ba)) continue;
      const near = NEAR8[a];
      for (let k = 0; k < near.length; k++) {
        const b = near[k]; if (b < a) continue;
        const bb = board[b]; if (!isActive(bb)) continue;
        const straight = (a % W === b % W) || ((a / W) | 0) === ((b / W) | 0);
        if (!straight && !(ba.type === 'area' || bb.type === 'area')) continue;
        if (!works(ba.type, bb.type)) continue;
        L[a].push(b); L[b].push(a); links.push([a, b]);
      }
    }
    // 反射は「盾とつながっているとき」だけ働く。盾がないときは、貫通との線を出さない（線が出ているのに働かない、をなくす）
    for (let i = 0; i < N; i++) {
      const b = board[i]; if (!isActive(b) || b.type !== 'mirror') continue;
      if (L[i].some(j => board[j].type === 'shield')) continue;
      for (const j of L[i].filter(k => board[k].type === 'pierce')) {
        L[i].splice(L[i].indexOf(j), 1); L[j].splice(L[j].indexOf(i), 1);
        const at = links.findIndex(p => (p[0] === i && p[1] === j) || (p[0] === j && p[1] === i)); if (at >= 0) links.splice(at, 1);
      }
    }
    const val = i => B[board[i].type].v[board[i].lv - 1];
    const ampOf = i => { let m = 1; const l = L[i]; for (let k = 0; k < l.length; k++) if (board[l[k]].type === 'amp') m += val(l[k]) / 100; return m; };

    const elems = []; // {cell, kind, amt, spread}
    const d = {
      L, links, atk: [], dodgeCells: [], dodgeRest: 0, shieldGain: 0, shieldCells: [], shieldKeep: 0, tough: 0, toughCells: [],
      reflect: 0, reflectPierce: false, mirrorCells: [], regen: 0, regenCells: [], chargeCells: [],
      keep: { poison: 0.5, fire: 0 }, lossDiv: { poison: 1, fire: 1 },
    };
    for (let i = 0; i < N; i++) {
      const b = board[i]; if (!isActive(b)) continue;
      const def = B[b.type], l = L[i];
      if (def.fam === 'elem') {
        let sp = 0;
        for (let k = 0; k < l.length; k++) {
          const t = board[l[k]].type;
          if (t === 'spread') sp = Math.max(sp, val(l[k]) / 100);
          if (t === 'sustain') d.lossDiv[b.type] = Math.max(d.lossDiv[b.type], val(l[k]));
        }
        elems.push({ cell: i, kind: b.type, amt: val(i) * ampOf(i), spread: sp });
      } else if (b.type === 'shield') {
        d.shieldGain += rd(val(i) * ampOf(i)); d.shieldCells.push(i);
        for (let k = 0; k < l.length; k++) if (board[l[k]].type === 'sustain') d.shieldKeep = Math.max(d.shieldKeep, B.sustain.v2[board[l[k]].lv - 1] / 100);
      } else if (b.type === 'tough') { d.tough += rd(val(i) * ampOf(i)); d.toughCells.push(i); }
      else if (b.type === 'regen') { d.regen += rd(val(i) * ampOf(i)); d.regenCells.push(i); }
      else if (b.type === 'dodge') {
        let h = 0; for (let k = 0; k < l.length; k++) if (board[l[k]].type === 'haste') h += val(l[k]);
        const rest = Math.max(1, val(i) - h); d.dodgeCells.push(i); if (d.dodgeRest === 0 || rest < d.dodgeRest) d.dodgeRest = rest;
      } else if (b.type === 'mirror') {
        let on = false, pc = false;
        for (let k = 0; k < l.length; k++) { const t = board[l[k]].type; if (t === 'shield') on = true; if (t === 'pierce') pc = true; }
        if (on) { d.reflect += val(i) / 100 * ampOf(i); d.mirrorCells.push(i); if (pc) d.reflectPierce = true; }
      } else if (b.type === 'charge') { d.chargeCells.push({ cell: i, gain: val(i) }); }
    }
    d.keep.poison = 1 - 0.5 / d.lossDiv.poison;
    d.keep.fire = 1 - 1 / d.lossDiv.fire;

    for (let i = 0; i < N; i++) {
      const b = board[i]; if (!isActive(b) || B[b.type].fam !== 'atk') continue;
      const def = B[b.type], l = L[i];
      const a = {
        cell: i, type: b.type, lv: b.lv, order: d.atk.length + 1,
        dmg: val(i) * ampOf(i), hits: def.hits, charge: 0, pierce: false, pierceBonus: 0,
        elem: { poison: 0, fire: 0, ice: 0, shock: 0 }, chase: [], refire: [], counter: [],
        consume: 0, consumeCells: [], leech: 0, convert: 0,
      };
      const raw = { poison: 0, fire: 0, ice: 0, shock: 0 };
      for (let k = 0; k < l.length; k++) {
        const j = l[k], t = board[j].type;
        if (t === 'haste') a.hits += val(j);
        else if (t === 'pierce') { a.pierce = true; a.pierceBonus += val(j); }
        else if (t === 'convert') a.convert += val(j) / 100;
        else if (t === 'leech') a.leech += val(j) / 100 * ampOf(j);
        else if (t === 'charge') a.charge += board[j].charge;
        else if (t === 'consume') { a.consume += val(j) * ampOf(j); a.consumeCells.push(j); }
        else if (t === 'refire') a.refire.push({ cell: j, mult: val(j) / 100 * ampOf(j) });
        else if (t === 'counter') a.counter.push({ cell: j, mult: val(j) / 100 * ampOf(j) });
        else if (t === 'chase') {
          let h = 1; const lq = L[j];
          for (let q = 0; q < lq.length; q++) if (board[lq[q]].type === 'haste') h += val(lq[q]);
          a.chase.push({ cell: j, base: val(j) * ampOf(j), hits: h });
        }
      }
      for (let k = 0; k < elems.length; k++) {
        const e = elems[k];
        if (l.indexOf(e.cell) >= 0) raw[e.kind] += e.amt;
        else if (e.spread > 0) raw[e.kind] += e.amt * e.spread;
      }
      a.elem.poison = rd1(raw.poison); a.elem.fire = rd1(raw.fire); a.elem.ice = rd1(raw.ice); a.elem.shock = rd1(raw.shock);
      d.atk.push(a);
    }
    d.elems = elems;

    // ---- 「いま効いているか」（画面の線・点線の札・置く前の数字は、これを使う。戦いの計算には使わない）
    //   live[i] … マス i のブロックが、いま何かの役に立っているか。
    //   LL[i]   … マス i と「効いている線」でつながっているマス。 liveLinks … 効いている線の一覧。
    //   線が効いているのは、両はしが効いているとき（拡散だけは、のせる先の攻撃があるときに限る）。
    const live = [], LL = [], liveLinks = [];
    for (let i = 0; i < N; i++) { live.push(false); LL.push([]); }
    const tp = i => board[i].type, fm = i => B[board[i].type].fam;
    const near = (i, f) => { const l = L[i]; for (let k = 0; k < l.length; k++) if (f(l[k])) return true; return false; };
    const atkCells = d.atk.map(a => a.cell);
    // その属性が、まだ のっていない攻撃があるか（あれば、拡散が役に立つ）
    const spreadHelps = e => atkCells.some(a => L[a].indexOf(e) < 0);
    // 1回目：ひとりで働くもの
    for (let i = 0; i < N; i++) if (isActive(board[i])) { const t = tp(i); if (fm(i) === 'atk' || t === 'shield' || t === 'tough' || t === 'regen' || t === 'dodge') live[i] = true; }
    // 2回目：攻撃に のるもの（属性・特殊・吸収）、盾がいる反射
    for (let i = 0; i < N; i++) if (isActive(board[i]) && !live[i]) {
      const t = tp(i), f = fm(i);
      if (f === 'spec' || t === 'leech') live[i] = near(i, j => fm(j) === 'atk');
      else if (f === 'elem') live[i] = near(i, j => fm(j) === 'atk') || (near(i, j => tp(j) === 'spread') && spreadHelps(i));
      else if (t === 'mirror') live[i] = near(i, j => tp(j) === 'shield');
    }
    // 3回目：強化（効いている相手につながっているとき）
    for (let i = 0; i < N; i++) if (isActive(board[i]) && fm(i) === 'enh') {
      const t = tp(i);
      if (t === 'amp') live[i] = near(i, j => live[j] && (fm(j) === 'atk' || fm(j) === 'elem' || (fm(j) === 'def' && tp(j) !== 'dodge')));
      else if (t === 'pierce') live[i] = near(i, j => fm(j) === 'atk' || (tp(j) === 'mirror' && live[j]));
      else if (t === 'spread') live[i] = near(i, j => fm(j) === 'elem' && spreadHelps(j));
      else if (t === 'sustain') live[i] = near(i, j => tp(j) === 'shield' || ((tp(j) === 'poison' || tp(j) === 'fire') && live[j]));
      else if (t === 'haste') live[i] = near(i, j => fm(j) === 'atk' || tp(j) === 'dodge' || (tp(j) === 'chase' && live[j]));
      else if (t === 'convert') live[i] = near(i, j => fm(j) === 'atk');
    }
    for (let k = 0; k < links.length; k++) {
      const a = links[k][0], b = links[k][1];
      let ok = live[a] && live[b];
      if (ok && tp(a) === 'spread' && fm(b) === 'elem') ok = spreadHelps(b);
      if (ok && tp(b) === 'spread' && fm(a) === 'elem') ok = spreadHelps(a);
      if (ok) { LL[a].push(b); LL[b].push(a); liveLinks.push(links[k]); }
    }
    d.live = live; d.LL = LL; d.liveLinks = liveLinks;
    return d;
  }

  // 働いていないブロックに出す ひとこと（何につなげば働くか）
  function idleHint(type) {
    const f = B[type].fam;
    if (f === 'elem') return '攻撃ブロックにつなぐと働く（拡散でも とどく）。';
    if (f === 'spec' || type === 'leech' || type === 'convert') return '攻撃ブロックにつなぐと働く。';
    if (type === 'mirror') return '盾につなぐと働く。';
    if (type === 'spread') return '攻撃につながった属性に つなぐと働く（ほかの攻撃があるとき）。';
    if (f === 'enh') return '働いているブロックにつなぐと働く。';
    return '';
  }

  // 攻撃スキル1つの説明（画面の「スキル一覧」と同じ数字）
  function attackLines(a) {
    const out = [`${rd(a.dmg)}ダメージ ×${a.hits}ヒット`];
    if (a.charge) out.push(`最初のヒット＋たまり${a.charge}`);
    if (a.pierce) out.push('装甲と結界を無視' + (a.pierceBonus ? `（ヒット+${a.pierceBonus}）` : ''));
    for (const k of ['poison', 'fire', 'ice', 'shock']) if (a.elem[k]) out.push(k === 'fire' ? `ヒットで 炎${a.elem[k]}` : `ヒットごとに ${STATUS_NAMES[k]}+${a.elem[k]}`);
    for (const q of a.chase) out.push(`追撃 ${fmt(q.base)}×（1＋状態の種類）×${q.hits}ヒット`);
    if (a.consume) out.push(`毒消費 ×${fmt(a.consume)}`);
    if (a.convert) out.push(`最初のヒット＋シールドの${rd(a.convert * 100)}%`);
    if (a.leech) out.push(`吸収 ${rd(a.leech * 100)}%`);
    for (const r of a.refire) out.push(`再発動 ${rd(r.mult * 100)}%`);
    for (const c of a.counter) out.push(`反撃 ${rd(c.mult * 100)}%`);
    return out;
  }

  // ---------------------------------------------------------------- 敵
  // 敵。script(c) は c 周目の行動のならび（周がすすむほど強くなる）
  const A = (dmg, hits) => ({ k: 'atk', dmg, hits: hits || 1 });
  const ENEMIES = {
    golem: {
      name: '岩ゴーレム', g: '岩', hp: 400, armor: 3,
      trait: '装甲3：ヒットのダメージを 1回ごとに3へらす（毒などの状態のダメージは へらせない）。',
      hint: '一撃が重い。行動はおそい。',
      script: c => {
        const l = [
          { m: 3, label: 'なぐる', parts: [A(16 + 22 * c)] },
          { m: 2, label: 'かためる', parts: c >= 1 ? [A(20 * c), { k: 'guard', n: 14 + 12 * c }] : [{ k: 'guard', n: 14 }] },
          { m: 4, label: '大岩おとし', parts: [A(28 + 34 * c)] },
        ];
        if (c >= 1) l.push({ m: 3, label: 'じならし', parts: [A(10 + 20 * c), { k: 'destroy', n: 1 }] });
        return l;
      },
    },
    hunter: {
      name: '影の狩人', g: '影', hp: 330, evade: 2,
      trait: '身かわし：毎ターン、あなたの最初の2ヒットをよける。',
      hint: 'すばやい連続攻撃。手数が少ない。',
      script: c => {
        const l = [
          { m: 2, label: '三連づき', parts: [A(5 + 7 * c, 3)] },
          { m: 3, label: 'わなをしかける', parts: [A(7 + 9 * c, 2), { k: 'rubble', n: 1 }] },
          { m: 2, label: '乱れうち', parts: [A(3 + 5 * c, 5)] },
        ];
        if (c >= 1) l.push({ m: 3, label: '影にかくれる', parts: [A(4 + 10 * c, 2), { k: 'guard', n: 8 + 8 * c }] });
        return l;
      },
    },
    hydra: {
      name: 'ヒドラ', g: '蛇', hp: 380, regen: 8,
      trait: '再生8：ターンの終わりに HPを8回復する。ときどき脱皮して 状態を全部消す。',
      hint: '首がふえて ヒット数がふえる。',
      script: c => {
        const h = Math.min(c, 2);
        const l = [
          { m: 3, label: 'かみつく', parts: [A(16 + 10 * c, 1 + h)] },
          { m: 3, label: '首をふりまわす', parts: [A(9 + 5 * c, 2 + h)] },
          { m: 2, label: '脱皮', parts: [{ k: 'cleanse' }, { k: 'guard', n: 10 + 6 * c }] },
        ];
        if (c >= 1) l.push({ m: 3, label: '毒のいき', parts: [A(8 + 12 * c), { k: 'curse', n: 2 + 3 * c }] });
        return l;
      },
    },
    mage: {
      name: '呪いの術師', g: '呪', hp: 400,
      trait: '盤面をじゃまする：封印（働かなくなる）・がれき・破壊。呪いはシールドで防げない。',
      hint: '長引くほど盤面がこわれる。',
      script: c => {
        const l = [
          { m: 3, label: '呪いをかける', parts: [A(13 + 14 * c), { k: 'curse', n: 6 + 4 * c }] },
          { m: 3, label: '封印の術', parts: [A(22 + 16 * c), { k: 'seal', n: c >= 1 ? 3 : 2, dur: 2 }] },
          { m: 2, label: '結界をはる', parts: [{ k: 'guard', n: 26 + 14 * c }] },
          { m: 3, label: 'がれき落とし', parts: [A(24 + 16 * c), { k: 'rubble', n: 2 }] },
        ];
        if (c >= 1) l.push({ m: 4, label: '大呪文', parts: [A(30 + 44 * c), { k: 'destroy', n: c >= 2 ? 2 : 1 }] });
        return l;
      },
    },
    berserk: {
      name: '狂戦士', g: '狂', hp: 400, thorns: 1,
      trait: 'トゲ1：あなたのヒット1回ごとに、あなたが1ダメージ受ける（シールドで防げる）。',
      hint: '手数の多い連続攻撃。',
      script: c => {
        const l = [
          { m: 2, label: '三連なぐり', parts: [A(5 + 6 * c, 3)] },
          { m: 3, label: 'あばれる', parts: [A(5 + 6 * c, 4)] },
          { m: 2, label: 'めった打ち', parts: [A(3 + 4 * c, 6)] },
        ];
        if (c >= 1) l.push({ m: 3, label: '頭突き', parts: [A(4 + 12 * c, 2), { k: 'seal', n: 1, dur: 2 }] });
        return l;
      },
    },
    // テスト用（画面には出さない）
    dummy: { name: 'かかし', g: '案', hp: 99999, trait: '', hint: '', hidden: true, script: () => [{ m: 3, label: '立っている', parts: [] }] },
  };
  const ENEMY_IDS = Object.keys(ENEMIES).filter(k => !ENEMIES[k].hidden);

  // 予告の文（画面はこれをそのまま出す）
  function intentLines(it) {
    const out = [];
    for (const p of it.parts) {
      if (p.k === 'atk') out.push({ k: 'atk', text: p.hits > 1 ? `攻撃 ${p.dmg}×${p.hits}回` : `攻撃 ${p.dmg}` });
      else if (p.k === 'guard') out.push({ k: 'guard', text: `結界 ${p.n}（次のターン、ヒットのダメージを${p.n}まで防ぐ）` });
      else if (p.k === 'seal') out.push({ k: 'seal', text: `封印 ${it.cells.seal.length}マス（${p.dur}ターン働かない）` });
      else if (p.k === 'destroy') out.push({ k: 'destroy', text: `破壊 ${it.cells.destroy.length}マス（そのマスのブロックが消える）` });
      else if (p.k === 'rubble') out.push({ k: 'rubble', text: `がれき ${it.cells.rubble.length}マス（空いていれば置かれる）` });
      else if (p.k === 'cleanse') out.push({ k: 'cleanse', text: '脱皮（敵の毒・炎・氷・雷を全部消す）' });
      else if (p.k === 'curse') out.push({ k: 'curse', text: `呪い+${p.n}（ターンの終わりに呪いの数だけダメージ、1ずつへる）` });
      else if (p.k === 'heal') out.push({ k: 'heal', text: `回復 ${p.n}` });
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
  function pick(s, arr, n) {
    const a = arr.slice(), out = [];
    while (out.length < n && a.length) out.push(a.splice((rnd(s) * a.length) | 0, 1)[0]);
    return out;
  }
  function draw(s) {
    if (!s.bag.length) {
      const b = TYPES.concat(TYPES);
      for (let i = b.length - 1; i > 0; i--) { const j = (rnd(s) * (i + 1)) | 0; const t = b[i]; b[i] = b[j]; b[j] = t; }
      s.bag = b;
    }
    return s.bag.pop();
  }

  // ---------------------------------------------------------------- 状態
  function newGame(enemyId, seed) {
    const def = ENEMIES[enemyId];
    const s = {
      rs: (seed | 0) || 1, enemyId, turn: 0, phase: 'start', moves: 1, bonus: 0,
      board: new Array(N).fill(null),
      p: { hp: MAXHP, max: MAXHP, shield: 0, curse: 0, dodgeCd: 0 },
      e: { id: enemyId, hp: def.hp, max: def.hp, armor: def.armor || 0, evade: def.evade || 0, regen: def.regen || 0, thorns: def.thorns || 0,
           poison: 0, fire: 0, ice: 0, shock: 0, guard: 0, frozen: 0, cyc: 0, si: 0 },
      shop: ['slash', 'shot', 'area', null, null, null, null, null], keep: null, bag: [],
      intent: null,
      stats: { dealt: {}, total: 0, taken: 0, blocked: 0, healed: 0, placed: {} },
    };
    return s;
  }
  function cloneState(s) {
    const c = Object.assign({}, s);
    c.board = s.board.map(b => (b ? { type: b.type, lv: b.lv, sealed: b.sealed, charge: b.charge, cd: b.cd } : null));
    c.p = Object.assign({}, s.p); c.e = Object.assign({}, s.e);
    c.shop = s.shop.slice(); c.bag = s.bag.slice();
    c.stats = Object.assign({}, s.stats); c.stats.dealt = Object.assign({}, s.stats.dealt); c.stats.placed = Object.assign({}, s.stats.placed);
    return c; // intent は作ったあと書きかえないので共有してよい
  }

  function makeIntent(s) {
    const def = ENEMIES[s.e.id];
    let list = def.script(s.e.cyc);
    if (s.e.si >= list.length) { s.e.cyc++; s.e.si = 0; list = def.script(s.e.cyc); }
    const raw = list[s.e.si];
    // 3周目からは「怒り」：攻撃がさらに強くなる（長引かせると危ない）
    const rage = s.e.cyc >= 2 ? 1 + 0.4 * (s.e.cyc - 1) : 1;
    const parts = raw.parts.map(p => (p.k === 'atk' && rage > 1 ? { k: 'atk', dmg: Math.round(p.dmg * rage), hits: p.hits } : p));
    const it = { moves: raw.m, label: raw.label, parts, rage: rage > 1, cells: { seal: [], destroy: [], rubble: [] } };
    for (const part of parts) {
      if (part.k === 'seal' || part.k === 'destroy' || part.k === 'rubble') {
        const pool = [];
        for (let i = 0; i < N; i++) {
          const b = s.board[i];
          if (part.k === 'rubble') { if (!b) pool.push(i); }
          else if (b && b.type !== 'rubble' && !(part.k === 'seal' && b.sealed)) pool.push(i);
        }
        it.cells[part.k] = pick(s, pool, part.n).sort((a, b) => a - b);
      }
    }
    return it;
  }
  function beginTurn(s) {
    s.turn++;
    for (let i = 0; i < SHOP; i++) s.shop[i] = draw(s);
    s.intent = makeIntent(s);
    s.moves = s.intent.moves + s.bonus; s.bonusUsed = s.bonus; s.bonus = 0;
    s.phase = 'place';
  }

  // ---------------------------------------------------------------- プレイヤーの手
  function srcType(s, src) { return src === 'keep' ? s.keep : s.shop[src]; }
  // 'new' | 'up' | 'replace' | null（置けない）
  function placeKind(s, src, cell) {
    const type = srcType(s, src);
    if (!type || (s.phase !== 'place' && s.phase !== 'start') || s.moves <= 0 || cell < 0 || cell >= N) return null;
    const b = s.board[cell];
    if (!b) return 'new';
    if (b.type === type) return b.lv < MAXLV ? 'up' : null;
    return 'replace';
  }
  function place(s, src, cell) {
    const kind = placeKind(s, src, cell); if (!kind) return null;
    const type = srcType(s, src);
    if (kind === 'up') s.board[cell].lv++;
    else s.board[cell] = mk(type);
    if (src === 'keep') s.keep = null; else s.shop[src] = null;
    s.stats.placed[type] = (s.stats.placed[type] || 0) + 1;
    s.moves--;
    if (s.phase === 'start') beginTurn(s);
    return kind;
  }
  function canSwap(s, a, b) { return s.phase === 'place' && s.moves > 0 && a !== b && a >= 0 && b >= 0 && a < N && b < N && !!(s.board[a] || s.board[b]); }
  function swap(s, a, b) {
    if (!canSwap(s, a, b)) return false;
    const t = s.board[a]; s.board[a] = s.board[b]; s.board[b] = t; s.moves--; return true;
  }
  // ---- 置く前に見せる用（画面の「つながる」表示は、ここだけを使う。どれも derive をそのまま使う）
  // type を cell に置いたら（同じ種類なら重ねたら）、どのマスとつながるか。
  function linksIfPlaced(board, type, cell) {
    const b = board.slice(), old = b[cell];
    if (!(old && old.type === type)) b[cell] = mk(type); // 同じ種類に重ねるときは、いまのブロックのまま（レベルが上がるだけ）
    return derive(b).LL[cell].slice(); // 数えるのは「効いている線」だけ
  }
  // 盤面の a のブロックを b と入れかえたら、動かしたブロックがどのマスとつながるか。
  function linksIfSwapped(board, a, b) {
    const c = board.slice(), t = c[a]; c[a] = c[b]; c[b] = t;
    return c[b] ? derive(c).LL[b].slice() : [];
  }
  // 置く前に「数字を出すマス」は、ここ1か所で決める。
  //   ① 空きマスと、がれきのマスで、つながる所。
  //   ② ①が1つもないとき（満杯のときなど）だけ、札のあるマス（置きかえ・重ね）で つながる所。
  //   札の上にいつも数字を出すと、画面の情報が多くなりすぎた（本人の感想 2026-11-13）ので、①があるときは出さない。
  function pickSpots(board, countAt, skip) {
    const open = [], rest = [];
    for (let i = 0; i < N; i++) {
      if (skip(i)) continue;
      const n = countAt(i); if (n <= 0) continue;
      (!board[i] || board[i].type === 'rubble' ? open : rest).push({ cell: i, n });
    }
    return open.length ? open : rest;
  }
  // type を置くと つながるマスと、その数。[{ cell, n }]
  function linkSpots(board, type) {
    return pickSpots(board, i => linksIfPlaced(board, type, i).length,
      i => { const b = board[i]; return !!b && b.type === type && b.lv >= MAXLV; }); // Lv3 の同じ種類には、もう重ねられない
  }
  // 盤面の a のブロックを動かすと つながるマスと、その数。封印中のブロックは、動かしても つながらない。
  function swapSpots(board, a) {
    if (!isActive(board[a])) return [];
    return pickSpots(board, i => linksIfSwapped(board, a, i).length, i => i === a);
  }
  // 光らせる相手：数字のマスのどれかに置いた（動かした）とき、本当に つながる札のマス。
  // works の表だけで決めない（表では合っていても、盾のない反射と貫通のように、つながらない組がある）。
  function linkMates(board, type) {
    const set = {};
    for (const sp of linkSpots(board, type)) for (const j of linksIfPlaced(board, type, sp.cell)) set[j] = 1;
    return Object.keys(set).map(Number).sort((x, y) => x - y);
  }
  function swapMates(board, a) {
    const set = {};
    for (const sp of swapSpots(board, a)) for (const j of linksIfSwapped(board, a, sp.cell)) if (j !== a) set[j] = 1;
    return Object.keys(set).map(Number).sort((x, y) => x - y);
  }
  // type を いま置くなら、いちばん多くて何本つながるか（置けるマス全部の中で。置きかえ・重ねもふくむ）。
  // 棚の札を「いまは相手がいない（点線）」にするかどうかに使う。
  function bestLinks(board, type) {
    let m = 0;
    for (let i = 0; i < N; i++) {
      const b = board[i]; if (b && b.type === type && b.lv >= MAXLV) continue; // Lv3 の同じ種類には、もう重ねられない
      m = Math.max(m, linksIfPlaced(board, type, i).length);
    }
    return m;
  }

  // キープ：棚のブロックを1個とっておく（手数を使わない）
  function toKeep(s, idx) {
    if (s.phase !== 'place' || !s.shop[idx]) return false;
    const t = s.keep; s.keep = s.shop[idx]; s.shop[idx] = t; return true;
  }

  // ---------------------------------------------------------------- ターンの発動
  // 順番： 1 盾をはる → 2 攻撃ブロックが左上から順に発動 → 3 敵の行動 → 4 ターンの終わり
  function resolve(s) {
    const ev = []; const board = s.board, e = s.e, p = s.p, st = s.stats;
    const d = derive(board);
    let over = false, shocked = false, froze = false, hits = 0, evadeLeft = e.evade;
    const snap = o => { o.eh = Math.max(0, e.hp); o.ph = Math.max(0, p.hp); o.sh = p.shield; o.es = [e.poison, e.fire, e.ice, e.shock, e.guard, e.frozen]; o.pc = p.curse; ev.push(o); return o; };
    const credit = (k, n) => { if (n > 0) { st.dealt[k] = (st.dealt[k] || 0) + n; st.total += n; } };
    const hurtEnemy = n => { e.hp -= n; if (e.hp <= 0 && !over) { over = true; s.phase = 'won'; } };
    const hurtPlayer = n => { p.hp -= n; st.taken += n; if (p.hp <= 0 && !over) { over = true; s.phase = 'lost'; } };

    function hit(a, base, kind, src) {
      if (over || hits >= HIT_CAP) return;
      hits++;
      if (evadeLeft > 0) { evadeLeft--; snap({ t: 'hit', cell: a.cell, src, kind, dodged: true, dmg: 0 }); return; }
      const fireB = e.fire;
      let dmg = Math.max(0, rd(base)) + fireB, armorCut = 0, guardCut = 0;
      if (a.pierce) dmg += a.pierceBonus;
      else {
        armorCut = Math.min(dmg, e.armor); dmg -= armorCut;
        guardCut = Math.min(dmg, e.guard); e.guard -= guardCut; dmg -= guardCut;
      }
      const f = Math.min(fireB, dmg);
      credit('fire', f); credit(kind === 'chase' ? 'chase' : a.type, dmg - f);
      hurtEnemy(dmg);
      let heal = 0;
      if (a.leech > 0 && dmg > 0 && p.hp > 0) { heal = Math.min(p.max - p.hp, rd(dmg * a.leech)); p.hp += heal; st.healed += heal; }
      const el = a.elem;
      e.poison += el.poison; if (el.fire > e.fire) e.fire = el.fire; e.ice += el.ice; e.shock += el.shock;
      snap({ t: 'hit', cell: a.cell, src, kind, dmg, fire: f, armorCut, guardCut, heal, add: el });
      if (!over && a.consume > 0 && e.poison > 0) {
        const n = e.poison, cd = rd(n * a.consume); e.poison = 0;
        credit('consume', cd); hurtEnemy(cd); snap({ t: 'consume', cell: a.cell, cells: a.consumeCells, n, dmg: cd });
      }
      if (!over && !shocked && e.shock >= SHOCK_AT) {
        shocked = true; e.shock -= SHOCK_AT; credit('shock', SHOCK_DMG); hurtEnemy(SHOCK_DMG); s.bonus = 1;
        snap({ t: 'shock', dmg: SHOCK_DMG });
      }
      if (!over && !froze && !e.frozen && e.ice >= FREEZE_AT) { froze = true; e.ice -= FREEZE_AT; e.frozen = 1; snap({ t: 'freeze' }); }
      if (!over && e.thorns > 0) {
        let t = e.thorns; const sc = Math.min(p.shield, t); p.shield -= sc; t -= sc; st.blocked += sc;
        if (t > 0) hurtPlayer(t);
        snap({ t: 'thorn', dmg: t, shield: sc });
      }
    }
    function fire(a, mult, mode, src) {
      if (over) return;
      snap({ t: 'fire', cell: a.cell, mode, mult, src });
      for (let i = 0; i < a.hits && !over; i++) hit(a, (a.dmg + (i === 0 ? a.charge + p.shield * a.convert : 0)) * mult, 'atk', a.cell);
      for (const q of a.chase) for (let j = 0; j < q.hits && !over; j++) {
        const kinds = (e.poison > 0) + (e.fire > 0) + (e.ice > 0) + (e.shock > 0);
        hit(a, q.base * (1 + kinds) * mult, 'chase', q.cell);
      }
    }

    // 1 盾
    if (d.shieldGain > 0) { p.shield += d.shieldGain; snap({ t: 'shield', add: d.shieldGain, cells: d.shieldCells }); }
    // 2 攻撃（左上から順）
    for (const a of d.atk) {
      if (over) break;
      fire(a, 1, 'main', a.cell);
      for (const r of a.refire) fire(a, r.mult, 're', r.cell);
    }
    // 3 敵の行動
    if (!over) {
      e.guard = 0;
      const it = s.intent; snap({ t: 'eact', label: it.label });
      const cUses = {}; let attacked = false;
      for (const part of it.parts) {
        if (over) break;
        if (part.k === 'atk') {
          let absorbed = 0; attacked = true;
          for (let h = 0; h < part.hits && !over; h++) {
            if (d.dodgeRest > 0 && p.dodgeCd === 0) { p.dodgeCd = d.dodgeRest + 1; snap({ t: 'ehit', dodged: true, cells: d.dodgeCells, dmg: 0, raw: part.dmg }); }
            else {
              let dmg = part.dmg;
              const ic = e.frozen ? dmg - Math.ceil(dmg / 2) : 0; dmg -= ic;
              const tc = Math.min(dmg, d.tough); dmg -= tc;
              const sc = Math.min(p.shield, dmg); p.shield -= sc; dmg -= sc; absorbed += sc;
              st.blocked += ic + tc + sc;
              if (dmg > 0) hurtPlayer(dmg);
              snap({ t: 'ehit', dmg, raw: part.dmg, ice: ic, tough: tc, shield: sc });
            }
            if (!over) for (const a of d.atk) for (const c of a.counter) {
              const u = cUses[c.cell] || 0;
              if (u < COUNTER_MAX && !over) { cUses[c.cell] = u + 1; fire(a, c.mult, 'counter', c.cell); }
            }
          }
          if (!over && absorbed > 0 && d.reflect > 0) {
            let r = rd(absorbed * d.reflect);
            if (!d.reflectPierce) r -= Math.min(r, e.armor);
            credit('mirror', r); hurtEnemy(r); snap({ t: 'reflect', dmg: r, cells: d.mirrorCells });
          }
        } else if (part.k === 'guard') { e.guard = part.n; snap({ t: 'guard', n: part.n }); }
        else if (part.k === 'seal') {
          const done = [];
          for (const c of it.cells.seal) if (board[c] && board[c].type !== 'rubble') { board[c].sealed = part.dur + 1; done.push(c); }
          snap({ t: 'seal', cells: done });
        } else if (part.k === 'destroy') {
          const done = [];
          for (const c of it.cells.destroy) if (board[c]) { board[c] = null; done.push(c); }
          snap({ t: 'destroy', cells: done, aimed: it.cells.destroy });
        } else if (part.k === 'rubble') {
          const done = [];
          for (const c of it.cells.rubble) if (!board[c]) { board[c] = mk('rubble'); done.push(c); }
          snap({ t: 'rubble', cells: done, aimed: it.cells.rubble });
        } else if (part.k === 'cleanse') { e.poison = e.fire = e.ice = e.shock = 0; e.frozen = 0; snap({ t: 'cleanse' }); }
        else if (part.k === 'curse') { p.curse += part.n; snap({ t: 'cursed', n: part.n }); }
        else if (part.k === 'heal') { const n = Math.min(e.max - e.hp, part.n); e.hp += n; snap({ t: 'eheal', n }); }
      }
      if (attacked) e.frozen = 0;
    }
    // 4 ターンの終わり
    if (!over && e.poison > 0) { const n = e.poison; credit('poison', n); hurtEnemy(n); snap({ t: 'tick', dmg: n }); }
    if (!over) {
      const d3 = derive(board); // 封印や破壊のあとの盤面で数える
      e.poison = Math.floor(e.poison * d3.keep.poison + 1e-9);
      e.fire = Math.floor(e.fire * d3.keep.fire + 1e-9);
      if (p.curse > 0) { const n = p.curse; hurtPlayer(n); p.curse--; snap({ t: 'curse', dmg: n }); }
      if (!over) {
        if (d3.regen > 0 && p.hp < p.max) { const n = Math.min(p.max - p.hp, d3.regen); p.hp += n; st.healed += n; snap({ t: 'regen', n, cells: d3.regenCells }); }
        if (e.regen > 0 && e.hp < e.max) { const n = Math.min(e.max - e.hp, e.regen); e.hp += n; snap({ t: 'eregen', n }); }
        for (const c of d3.chargeCells) board[c.cell].charge += c.gain;
        p.shield = Math.floor(p.shield * d3.shieldKeep + 1e-9);
        for (let i = 0; i < N; i++) { const b = board[i]; if (b && b.sealed > 0) b.sealed--; }
        if (p.dodgeCd > 0) p.dodgeCd--;
        e.si++;
        beginTurn(s);
        snap({ t: 'end' });
      }
    }
    if (over) snap({ t: s.phase });
    return ev;
  }
  function endTurn(s) { if (s.phase !== 'place') return null; return resolve(s); }

  // 予想：いま「発動」を押したら どうなるか（本物と同じ計算を写しで回す）
  function forecast(s) {
    if (s.phase !== 'place') return null;
    const c = cloneState(s); const t0 = c.stats.total, k0 = c.stats.taken, h0 = c.stats.healed;
    resolve(c);
    return { dealt: c.stats.total - t0, taken: c.stats.taken - k0, healed: c.stats.healed - h0, eHp: Math.max(0, c.e.hp), pHp: Math.max(0, c.p.hp), won: c.phase === 'won', lost: c.phase === 'lost' };
  }

  return {
    W, H, N, MAXLV, SHOP, MAXHP, SHOCK_AT, SHOCK_DMG, FREEZE_AT, COUNTER_MAX, START_CELL,
    B, TYPES, FAMS, STATUS_NAMES, ENEMIES, ENEMY_IDS, NEAR4, NEAR8,
    needsLink, blockText, works, isActive, mk, derive, attackLines, intentLines, fmt, idleHint,
    newGame, cloneState, beginTurn, makeIntent, srcType, placeKind, place, canSwap, swap, toKeep,
    linksIfPlaced, linksIfSwapped, linkSpots, swapSpots, linkMates, swapMates, bestLinks,
    resolve, endTurn, forecast,
  };
});
