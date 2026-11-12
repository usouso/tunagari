'use strict';
/*
 * tests.js — ブロックの文が「文字どおり」に動くかのテスト。  実行: node tests.js
 * かかし（HP 99999、何もしない敵）に盤面を作って1ターン発動し、文に書いてある数と比べる。
 */
const R = require('./rules.js');
const Bot = require('./botcore.js');
let pass = 0, fail = 0; const fails = [];
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; fails.push(`✗ ${name}: 期待 ${JSON.stringify(want)} / 実際 ${JSON.stringify(got)}`); }
}
function ok(name, cond, extra) { if (cond) pass++; else { fail++; fails.push(`✗ ${name}${extra ? ' ' + extra : ''}`); } }

// 盤面を文字で作る。 例: setup({ 12:'slash', 13:'poison2' })  （末尾の数字はレベル）
function setup(cells, enemyParts, enemyMod) {
  const s = R.newGame('dummy', 1);
  R.place(s, 0, 0); s.board[0] = null; // start をぬけて place へ
  for (const k in cells) {
    const m = /^([a-z]+)(\d)?$/.exec(cells[k]); const b = R.mk(m[1]); b.lv = m[2] ? +m[2] : 1; s.board[+k] = b;
  }
  s.intent = { moves: 3, label: 'テスト', parts: enemyParts || [], cells: { seal: [], destroy: [], rubble: [] } };
  if (enemyMod) Object.assign(s.e, enemyMod);
  return s;
}
const dealt = s => s.stats.total;
function run(cells, parts, mod) { const s = setup(cells, parts, mod); const ev = R.resolve(s); return { s, ev }; }
const atk = (dmg, hits) => ({ k: 'atk', dmg, hits: hits || 1 });
const I = (s, parts) => { s.intent = { moves: 3, label: 't', parts, cells: { seal: [], destroy: [], rubble: [] } }; };
// マス番号（5×5）: 12=まん中 13=右 14=右の右 11=左 7=上 17=下 / ななめ 6,8,16,18 / はなれた所 0,1,2,22,23,24
eq('盤面は5×5', [R.W, R.H, R.N], [5, 5, 25]);

// ---- 攻撃
eq('斬撃 5×1', dealt(run({ 12: 'slash' }).s), 5);
eq('斬撃Lv2 8', dealt(run({ 12: 'slash2' }).s), 8);
eq('斬撃Lv3 11', dealt(run({ 12: 'slash3' }).s), 11);
eq('射撃 2×2', dealt(run({ 12: 'shot' }).s), 4);
eq('射撃Lv3 4×2', dealt(run({ 12: 'shot3' }).s), 8);
eq('範囲 3', dealt(run({ 12: 'area' }).s), 3);
{ const r = run({ 12: 'shot' }); eq('射撃のヒット数 2', r.ev.filter(e => e.t === 'hit').length, 2); }
// ---- 属性
{ const r = run({ 12: 'slash', 13: 'poison' }); eq('毒: 5 + 毒1', dealt(r.s), 6); eq('毒は半分にへる 1→0', r.s.e.poison, 0); }
{ const r = run({ 12: 'shot', 13: 'poison' }); eq('射撃+毒: 4 + 毒2', dealt(r.s), 6); eq('毒 2→1', r.s.e.poison, 1); }
{ const r = run({ 12: 'shot', 13: 'fire' }); eq('射撃+炎: 2 → 燃える → 2+1', dealt(r.s), 5); eq('炎はターンの終わりに消える', r.s.e.fire, 0); eq('炎のぶん 1', r.s.stats.dealt.fire, 1); }
{ const r = run({ 12: 'shot', 13: 'fire' }, null, { fire: 3 }); eq('大きい炎があれば そのまま: (2+3)×2', dealt(r.s), 10); }
{ const r = run({ 12: 'slash', 13: 'fire2' }, null, { fire: 1 }); eq('炎1の敵に炎2: このヒットは+1', dealt(r.s), 6); eq('そのあと炎2になる', r.ev.find(e => e.t === 'hit').es[1], 2); }
{ const r = run({ 12: 'shot', 13: 'ice3' }, [atk(15)], { ice: 14 }); eq('氷 14+6=20 で凍結: 攻撃15 → 8', r.s.stats.taken, 8); eq('凍結で氷−20', r.s.e.ice, 0); eq('攻撃されたら凍結はとける', r.s.e.frozen, 0); }
{ const s = setup({ 12: 'shot', 13: 'ice3' }, [], { ice: 14 }); R.resolve(s); eq('攻撃がないターンは凍結が残る', s.e.frozen, 1); I(s, [atk(10)]); R.resolve(s); eq('次の攻撃 10 → 5', s.stats.taken, 5); }
{ const r = run({ 12: 'shot', 13: 'ice' }, [atk(14)]); eq('氷 2 では凍結しない', r.s.stats.taken, 14); eq('氷はへらない', r.s.e.ice, 2); }
{ const r = run({ 12: 'shot', 13: 'shock' }, null, { shock: 13 }); eq('雷 13+2=15 で感電 +10', dealt(r.s), 14); eq('感電で雷−15', r.s.e.shock, 0); eq('次のターンの手数+1', r.s.moves, 4); }
{ const r = run({ 12: 'shot', 13: 'shock' }); eq('雷 2 では感電しない', dealt(r.s), 4); eq('雷はへらない', r.s.e.shock, 2); eq('手数そのまま', r.s.moves, 3); }
{ const r = run({ 12: 'shot', 13: 'shock3', 11: 'haste3' }, null, { shock: 40 }); eq('感電は1ターンに1回', r.ev.filter(e => e.t === 'shock').length, 1); }
// ---- 特殊
eq('追撃: 状態なし 2×1', dealt(run({ 12: 'slash', 13: 'chase' }).s), 7);
eq('追撃: 毒あり 2×2（追撃も毒をのせる）', dealt(run({ 12: 'slash', 13: 'chase', 11: 'poison' }).s), 5 + 4 + 2);
eq('追撃: 状態4種類 2×5', dealt(run({ 12: 'slash', 13: 'chase' }, null, { ice: 1, shock: 1, poison: 1, fire: 1 }).s), (5 + 1) + (10 + 1) + 1);
eq('追撃Lv2: 3×1', dealt(run({ 12: 'slash', 13: 'chase2' }).s), 8);
eq('反撃40%: 5 + 2', dealt(run({ 12: 'slash', 13: 'counter' }, [atk(1, 1)]).s), 7);
eq('反撃: 2ヒットで2回', dealt(run({ 12: 'slash', 13: 'counter' }, [atk(1, 2)]).s), 9);
eq('反撃は1ターン2回まで', dealt(run({ 12: 'slash', 13: 'counter' }, [atk(1, 5)]).s), 9);
eq('反撃Lv3 80%: 5+4', dealt(run({ 12: 'slash', 13: 'counter3' }, [atk(1, 1)]).s), 9);
eq('攻撃されなければ反撃なし', dealt(run({ 12: 'slash', 13: 'counter' }, []).s), 5);
{ const r = run({ 12: 'slash', 13: 'consume' }, null, { poison: 20 }); eq('毒消費: 5 + 20×2', dealt(r.s), 45); eq('毒は全部消える', r.s.e.poison, 0); }
eq('毒消費Lv2: 5 + 20×2.5', dealt(run({ 12: 'slash', 13: 'consume2' }, null, { poison: 20 }).s), 55);
eq('毒消費Lv3: 5 + 20×3', dealt(run({ 12: 'slash', 13: 'consume3' }, null, { poison: 20 }).s), 65);
eq('毒+毒消費: 5 + 1×2', dealt(run({ 12: 'slash', 13: 'consume', 11: 'poison' }).s), 7);
{ const s = setup({ 12: 'slash', 13: 'charge' }); R.resolve(s); eq('蓄積: 1ターン目 5', dealt(s), 5); eq('たまり 2', s.board[13].charge, 2); R.resolve(s); eq('2ターン目 5+2', dealt(s), 12); R.resolve(s); eq('3ターン目 5+4', dealt(s), 21); }
{ const s = setup({ 12: 'shot', 13: 'charge3' }); R.resolve(s); R.resolve(s); eq('蓄積は最初のヒットだけ: 4 + (2+4)+2', dealt(s), 4 + 8); }
eq('再発動 50%: 5+3', dealt(run({ 12: 'slash', 13: 'refire' }).s), 8);
eq('再発動Lv3 100%: 5+5', dealt(run({ 12: 'slash', 13: 'refire3' }).s), 10);
eq('再発動は追撃も半分で出る: 5+2+3+1', dealt(run({ 12: 'slash', 13: 'refire', 11: 'chase' }).s), 11);
// ---- 強化
eq('増幅 +50%: 7.5→8', dealt(run({ 12: 'slash', 13: 'amp' }).s), 8);
eq('増幅Lv3 +100%: 10', dealt(run({ 12: 'slash', 13: 'amp3' }).s), 10);
eq('増幅2個 +100%: 10', dealt(run({ 12: 'slash', 13: 'amp', 11: 'amp' }).s), 10);
{ const r = run({ 12: 'slash', 13: 'poison2', 14: 'amp' }); eq('増幅→毒Lv2: 毒+3', r.ev.find(e => e.t === 'hit').add.poison, 3); eq('合計 5+3', dealt(r.s), 8); }
eq('増幅は増幅にきかない', dealt(run({ 12: 'slash', 13: 'amp', 14: 'amp' }).s), 8);
eq('増幅は加速にきかない', dealt(run({ 12: 'slash', 13: 'haste', 14: 'amp' }).s), 10);
eq('増幅は特殊（再発動）にきかない', dealt(run({ 12: 'slash', 13: 'refire', 14: 'amp' }).s), 8);
eq('貫通: 装甲3を無視', dealt(run({ 12: 'slash', 13: 'pierce' }, null, { armor: 3 }).s), 5);
eq('貫通なし: 装甲3で 5→2', dealt(run({ 12: 'slash' }, null, { armor: 3 }).s), 2);
eq('装甲3: 射撃2は 0', dealt(run({ 12: 'shot' }, null, { armor: 3 }).s), 0);
eq('結界15: 5は全部防がれる', dealt(run({ 12: 'slash' }, null, { guard: 15 }).s), 0);
eq('結界15を貫通', dealt(run({ 12: 'slash', 13: 'pierce' }, null, { guard: 15 }).s), 5);
eq('貫通Lv2: +2', dealt(run({ 12: 'slash', 13: 'pierce2' }).s), 7);
eq('毒は装甲を無視', run({ 12: 'shot', 13: 'poison' }, null, { armor: 3 }).s.stats.dealt.poison, 2);
{ const s = setup({ 12: 'slash', 13: 'poison2', 14: 'spread', 22: 'shot' }); const d = R.derive(s.board); eq('拡散: はなれた射撃に毒+1（2の50%）', d.atk.find(a => a.type === 'shot').elem.poison, 1); eq('つながっている斬撃は そのまま+2', d.atk.find(a => a.type === 'slash').elem.poison, 2); }
{ const s = setup({ 12: 'slash', 13: 'poison2', 14: 'spread3', 22: 'shot' }); const d = R.derive(s.board); eq('拡散Lv3 100%: 毒+2', d.atk.find(a => a.type === 'shot').elem.poison, 2); }
eq('持続なし: 毒 16+2=18 → 9', run({ 12: 'shot', 13: 'poison' }, null, { poison: 16 }).s.e.poison, 9);
eq('持続: へる量1/2 → 18×0.75=13', run({ 12: 'shot', 13: 'poison', 14: 'sustain' }, null, { poison: 16 }).s.e.poison, 13);
eq('持続Lv3: へる量1/8 → 18×(1-1/16)=16', run({ 12: 'shot', 13: 'poison', 14: 'sustain3' }, null, { poison: 16 }).s.e.poison, 16);
eq('持続: 炎2 → 半分のこる 1', run({ 12: 'shot', 13: 'fire2', 14: 'sustain' }).s.e.fire, 1);
{ const s = setup({ 0: 'shield', 1: 'sustain' }); R.resolve(s); eq('持続+盾: シールド6の50%が残る', s.p.shield, 3); R.resolve(s); eq('次のターン 3+6=9 → 4', s.p.shield, 4); }
{ const s = setup({ 0: 'shield', 1: 'sustain3' }); R.resolve(s); eq('持続Lv3+盾: 80%残る 6→4', s.p.shield, 4); }
{ const s = setup({ 0: 'shield' }); R.resolve(s); eq('盾だけ: ターンの終わりに消える', s.p.shield, 0); }
eq('加速: 斬撃 2ヒット', dealt(run({ 12: 'slash', 13: 'haste' }).s), 10);
eq('加速Lv3: 射撃 5ヒット', dealt(run({ 12: 'shot', 13: 'haste3' }).s), 10);
eq('加速→追撃: 追撃2ヒット', dealt(run({ 12: 'slash', 13: 'chase', 14: 'haste' }).s), 5 + 2 + 2);
eq('変換: シールド6の50% = +3', dealt(run({ 12: 'slash', 13: 'convert', 0: 'shield' }).s), 8);
eq('変換Lv2 100%: +6', dealt(run({ 12: 'slash', 13: 'convert2', 0: 'shield' }).s), 11);
eq('変換は最初のヒットだけ', dealt(run({ 12: 'shot', 13: 'convert2', 0: 'shield' }).s), 4 + 6);
// ---- 防御
eq('盾6: 攻撃10 → 4', run({ 0: 'shield' }, [atk(10)]).s.stats.taken, 4);
eq('盾Lv3 14: 攻撃10 → 0', run({ 0: 'shield3' }, [atk(10)]).s.stats.taken, 0);
eq('盾+増幅 9: 攻撃10 → 1', run({ 0: 'shield', 1: 'amp' }, [atk(10)]).s.stats.taken, 1);
{ const s = setup({ 0: 'dodge' }, [atk(10, 2)]); R.resolve(s); eq('回避: 2ヒットのうち1回よける', s.stats.taken, 10); eq('休み3', s.p.dodgeCd, 3); }
function dodgeRun(cells, n) { const s = setup(cells); const out = []; for (let t = 0; t < n; t++) { I(s, [atk(10)]); const k = s.stats.taken; R.resolve(s); out.push(s.stats.taken - k); } return out; }
eq('回避Lv1: よける→3ターン休む のくり返し', dodgeRun({ 0: 'dodge' }, 9), [0, 10, 10, 10, 0, 10, 10, 10, 0]);
eq('回避Lv3: 1ターン休む', dodgeRun({ 0: 'dodge3' }, 4), [0, 10, 0, 10]);
eq('回避+加速Lv2: 休み3-2=1', dodgeRun({ 0: 'dodge', 1: 'haste2' }, 4), [0, 10, 0, 10]);
eq('回避+加速Lv3: 休みは1より短くならない', dodgeRun({ 0: 'dodge', 1: 'haste3' }, 4), [0, 10, 0, 10]);
eq('回避が2個あっても 休みはいっしょ', dodgeRun({ 0: 'dodge', 4: 'dodge' }, 5), [0, 10, 10, 10, 0]);
{ const r = run({ 12: 'slash', 13: 'leech' }, [atk(30)]); eq('吸収: HPが満タンなら回復0', r.s.stats.healed, 0); }
{ const s = setup({ 12: 'slash', 13: 'leech' }); s.p.hp = 50; R.resolve(s); eq('吸収20%: 5の20% = 1回復', s.p.hp, 51); }
{ const s = setup({ 12: 'slash2', 13: 'leech3', 14: 'amp' }); s.p.hp = 50; R.resolve(s); eq('吸収Lv3+増幅 60%: 8の60% = 4.8→5', s.p.hp, 55); }
eq('堅牢2: 3×4回 → 1×4', run({ 0: 'tough' }, [atk(3, 4)]).s.stats.taken, 4);
eq('堅牢Lv3 4: 3×4回 → 0', run({ 0: 'tough3' }, [atk(3, 4)]).s.stats.taken, 0);
eq('反射50%: 盾6で防いで 3返す', dealt(run({ 0: 'shield', 1: 'mirror' }, [atk(10)]).s), 3);
eq('反射は盾とつながないと働かない', dealt(run({ 0: 'shield', 2: 'mirror' }, [atk(10)]).s), 0);
eq('反射Lv2 100%: 6', dealt(run({ 0: 'shield', 1: 'mirror2' }, [atk(10)]).s), 6);
eq('反射は装甲でへる', dealt(run({ 0: 'shield', 1: 'mirror2' }, [atk(10)], { armor: 3 }).s), 3);
eq('反射+貫通は装甲を無視', dealt(run({ 0: 'shield', 1: 'mirror2', 2: 'pierce' }, [atk(10)], { armor: 3 }).s), 6);
{ const s = setup({ 0: 'regen' }); s.p.hp = 50; R.resolve(s); eq('再生 +3', s.p.hp, 53); }
{ const s = setup({ 0: 'regen3', 1: 'amp' }); s.p.hp = 50; R.resolve(s); eq('再生Lv3+増幅: 7×1.5=10.5→11', s.p.hp, 61); }
// ---- つながりの形
eq('ななめは つながらない（斬撃）', dealt(run({ 12: 'slash', 18: 'amp' }).s), 5);
eq('範囲は ななめも つながる: 3×1.5=4.5→5', dealt(run({ 12: 'area', 18: 'amp' }).s), 5);
eq('範囲: 8マス全部の増幅 +400%', dealt(run({ 12: 'area', 6: 'amp', 7: 'amp', 8: 'amp', 11: 'amp', 13: 'amp', 16: 'amp', 17: 'amp', 18: 'amp' }).s), 15);
eq('封印されたブロックは働かない', (() => { const s = setup({ 12: 'slash', 13: 'amp' }); s.board[13].sealed = 2; R.resolve(s); return dealt(s); })(), 5);
eq('封印された攻撃は発動しない', (() => { const s = setup({ 12: 'slash' }); s.board[12].sealed = 1; R.resolve(s); return dealt(s); })(), 0);
// ---- 発動の順番（左上から）
eq('先に毒をつけて、あとで消費: 5 + 5 + 1×2', dealt(run({ 0: 'slash', 1: 'poison', 24: 'slash', 23: 'consume' }).s), 12);
eq('順番が逆だと消費できない: 5+5+毒1', dealt(run({ 24: 'slash', 23: 'poison', 0: 'slash', 1: 'consume' }).s), 11);
// ---- 敵の性質
eq('身かわし2: 斬撃は0', dealt(run({ 12: 'slash' }, null, { evade: 2 }).s), 0);
eq('身かわし2: 射撃+加速は3ヒット目が当たる', dealt(run({ 12: 'shot', 13: 'haste' }, null, { evade: 2 }).s), 2);
eq('トゲ1: 射撃2ヒットで2ダメージ受ける', run({ 12: 'shot' }, null, { thorns: 1 }).s.stats.taken, 2);
eq('トゲはシールドで防げる', run({ 12: 'shot', 0: 'shield' }, null, { thorns: 1 }).s.stats.taken, 0);
{ const s = setup({ 12: 'slash' }, [{ k: 'curse', n: 3 }]); R.resolve(s); eq('呪い3: 3ダメージ', s.stats.taken, 3); eq('呪いは1へる', s.p.curse, 2); }
{ const s = setup({ 12: 'shot', 13: 'poison' }, [{ k: 'cleanse' }]); R.resolve(s); eq('脱皮: 毒が消えてダメージなし', s.stats.dealt.poison || 0, 0); }
{ const s = setup({ 12: 'slash', 13: 'amp' }, [{ k: 'seal', n: 1, dur: 2 }]); s.intent.cells.seal = [13]; R.resolve(s); eq('封印 2ターン', s.board[13].sealed, 2); R.resolve(s); eq('封印中は増幅なし', dealt(s), 8 + 5); R.resolve(s); R.resolve(s); eq('2ターンたつと もどる', dealt(s), 8 + 5 + 5 + 8); }
{ const s = setup({ 12: 'slash' }, [{ k: 'destroy', n: 1 }]); s.intent.cells.destroy = [12]; R.resolve(s); eq('破壊: ブロックが消える', s.board[12], null); }
{ const s = setup({ 12: 'slash' }, [{ k: 'rubble', n: 1 }]); s.intent.cells.rubble = [13]; s.board[13] = R.mk('amp'); R.resolve(s); eq('がれきは ふさがったマスには置かれない', s.board[13].type, 'amp'); }
{ const s = setup({ 12: 'slash' }, [{ k: 'rubble', n: 1 }]); s.intent.cells.rubble = [13]; R.resolve(s); eq('がれきが置かれる', s.board[13].type, 'rubble'); s.shop[0] = 'amp'; eq('がれきの上に置ける', R.place(s, 0, 13), 'replace'); }
{ const s = R.newGame('golem', 3); R.place(s, 0, 12); eq('ゴーレム1周目: なぐる16', s.intent.parts[0].dmg, 16); s.e.cyc = 2; s.e.si = 0; const it = R.makeIntent(s); eq('3周目は怒りで×1.4: (16+44)×1.4=84', it.parts[0].dmg, 84); }

// ---- 手のルール
{ const s = R.newGame('golem', 5); eq('最初は攻撃ブロック3つから', s.shop.slice(0, 3), ['slash', 'shot', 'area']);
  ok('最初の1個を置くとターン1', R.place(s, 0, 12) === 'new' && s.turn === 1 && s.phase === 'place');
  eq('手数は予告どおり', s.moves, s.intent.moves);
  const i = s.shop.findIndex(t => t && t !== 'slash'); const t = s.shop[i];
  eq('空きマスに置く', R.place(s, i, 13), 'new'); eq('置いたものがある', s.board[13].type, t);
  const m = s.moves; ok('入れかえは1手', R.swap(s, 12, 20) && s.moves === m - 1 && s.board[20].type === 'slash' && !s.board[12]);
  const j = s.shop.findIndex(x => x); const kt = s.shop[j]; const m2 = s.moves; ok('キープは手数を使わない', R.toKeep(s, j) && s.keep === kt && s.moves === m2);
  s.moves = 0; eq('手数0では置けない', R.placeKind(s, 'keep', 0), null); }
{ const s = setup({ 12: 'slash' }); s.shop[0] = 'slash'; eq('同じ種類を重ねるとLv2', R.place(s, 0, 12), 'up'); eq('Lv2', s.board[12].lv, 2); s.shop[0] = 'slash'; R.place(s, 0, 12); s.shop[0] = 'slash'; s.moves = 3; eq('Lv3より上はない', R.placeKind(s, 0, 12), null);
  s.shop[1] = 'shot'; eq('ちがう種類は置きかえ', R.place(s, 1, 12), 'replace'); eq('置きかえ後はLv1', s.board[12].lv, 1); }

// ---- 文と数字がそろっているか
for (const t of R.TYPES) for (let lv = 1; lv <= 3; lv++) {
  const txt = R.blockText(t, lv), v = R.B[t].v[lv - 1];
  ok(`文に数字が入っている ${t} Lv${lv}`, v === 0 || txt.indexOf(String(v)) >= 0, txt);
}
eq('ブロックは24種類', R.TYPES.length, 24);
// つながりの表は左右対称で、強化どうしは つながらない
for (const a of R.TYPES) for (const b of R.TYPES) {
  ok(`works 対称 ${a}/${b}`, R.works(a, b) === R.works(b, a));
  if (R.B[a].fam === 'enh' && R.B[b].fam === 'enh') ok(`強化どうしは無関係 ${a}/${b}`, !R.works(a, b));
}
// 置く前の「つながる」表示（linksIfPlaced / linksIfSwapped / bestLinks）
{
  const s = setup({ 12: 'slash' }), b = s.board;
  eq('置く前：毒を斬撃のとなりに → つながる', R.linksIfPlaced(b, 'poison', 13), [12]);
  eq('置く前：毒を1マスあけて → つながらない', R.linksIfPlaced(b, 'poison', 14), []);
  eq('置く前：毒を ななめに → つながらない', R.linksIfPlaced(b, 'poison', 6), []);
  eq('置く前：増幅を斬撃のとなりに → つながる', R.linksIfPlaced(b, 'amp', 13), [12]);
  eq('置く前：拡散を斬撃のとなりに → つながらない（相手は属性だけ）', R.linksIfPlaced(b, 'spread', 13), []);
  eq('置く前：盾を斬撃のとなりに → つながらない', R.linksIfPlaced(b, 'shield', 13), []);
  eq('置く前：いちばん多い数（毒）は1', R.bestLinks(b, 'poison'), 1);
  eq('置く前：相手がいない札（拡散）は0', R.bestLinks(b, 'spread'), 0);
  eq('置く前の計算は盤面を変えない', JSON.stringify(b), JSON.stringify(setup({ 12: 'slash' }).board));
  const a = setup({ 12: 'area' }).board;
  eq('置く前：範囲攻撃には ななめでも つながる', R.linksIfPlaced(a, 'poison', 6), [12]);
  const two = setup({ 12: 'slash', 14: 'shot' }).board;
  eq('置く前：攻撃2つの間に毒 → 2本', R.linksIfPlaced(two, 'poison', 13).sort((x, y) => x - y), [12, 14]);
  eq('置く前：いちばん多い数は2', R.bestLinks(two, 'poison'), 2);
  const st = setup({ 12: 'slash', 13: 'poison' }).board;
  eq('置く前：同じ種類に重ねても つながりは同じ', R.linksIfPlaced(st, 'slash', 12), [13]);
  eq('置く前：ちがう種類で置きかえると、新しい札のつながりになる', R.linksIfPlaced(st, 'shield', 13), []);
  const sl = setup({ 12: 'slash' }).board; sl[12].sealed = 2;
  eq('置く前：封印中の札とは つながらない', R.linksIfPlaced(sl, 'poison', 13), []);
  const mx = setup({ 12: 'slash3' }).board;
  eq('置く前：Lv3の同じ種類しかないとき、そのマスは数えない', R.bestLinks(mx, 'slash'), 0);
  const sw = setup({ 12: 'slash', 0: 'poison' }).board;
  eq('入れかえる前：毒を斬撃のとなりへ → つながる', R.linksIfSwapped(sw, 0, 13), [12]);
  eq('入れかえる前：毒を遠くへ → つながらない', R.linksIfSwapped(sw, 0, 24), []);
  eq('入れかえる前：毒と斬撃を入れかえると、はなれる', R.linksIfSwapped(sw, 0, 12), []);
}
// 数字を出すマス（linkSpots / swapSpots）：空き・がれき。満杯のときは置きかえ
{
  const cells = a => a.map(x => x.cell).sort((x, y) => x - y);
  eq('数字のマス：空きマスだけ（札のあるマスは出さない）', cells(R.linkSpots(setup({ 12: 'slash', 13: 'shield' }).board, 'poison')), [7, 11, 17]);
  eq('数字のマス：がれきのマスは出す', cells(R.linkSpots(setup({ 12: 'slash', 13: 'rubble' }).board, 'poison')), [7, 11, 13, 17]);
  const full = {}; for (let i = 0; i < R.N; i++) full[i] = 'shield'; full[12] = 'slash';
  eq('数字のマス：満杯のときは、置きかえで つながるマスを出す', cells(R.linkSpots(setup(full).board, 'poison')), [7, 11, 13, 17]);
  eq('満杯でも、いちばん多い数が出る', R.bestLinks(setup(full).board, 'poison'), 1);
  const fullRub = Object.assign({}, full, { 13: 'rubble' });
  eq('数字のマス：ほかが満杯で がれきが1つ → がれきのマスだけ', R.linkSpots(setup(fullRub).board, 'poison'), [{ cell: 13, n: 1 }]);
  const full3 = Object.assign({}, full, { 13: 'poison3' });
  ok('数字のマス：満杯で、Lv3の同じ種類のマスは出さない', cells(R.linkSpots(setup(full3).board, 'poison')).indexOf(13) < 0);
  eq('入れかえの数字のマス', cells(R.swapSpots(setup({ 12: 'slash', 0: 'poison' }).board, 0)), [7, 11, 13, 17]);
  const sealed = setup({ 12: 'slash', 0: 'poison' }).board; sealed[0].sealed = 2;
  eq('入れかえの数字のマス：封印中の札は出さない', R.swapSpots(sealed, 0), []);
}
// 空きはあるが、空きでは どこにも つながらないとき → 置きかえで つながるマスを出す（レビュー2回目の指摘1）
{
  const cells = a => a.map(x => x.cell).sort((x, y) => x - y);
  const one = {}; for (let i = 1; i < R.N; i++) one[i] = 'shield'; one[12] = 'slash'; // マス0だけ空き
  eq('数字のマス：空きでは つながらない → 置きかえのマスを出す', cells(R.linkSpots(setup(one).board, 'poison')), [7, 11, 13, 17]);
  eq('数字のマス：空きと同じ数しか つながらない置きかえ先は出さない', cells(R.linkSpots(setup({ 12: 'slash', 13: 'shield', 14: 'shield' }).board, 'poison')), [7, 11, 17]);
  eq('そのときも、棚の数字は0にならない', R.bestLinks(setup(one).board, 'poison'), 1);
  const mv = Object.assign({}, one, { 20: 'poison' });
  eq('入れかえも同じ：空きでは つながらない → 入れかえ先を出す', cells(R.swapSpots(setup(mv).board, 20)), [7, 11, 13, 17]);
  eq('空きで つながるマスがあるときは、空きだけ', cells(R.linkSpots(setup({ 12: 'slash', 13: 'shield' }).board, 'poison')), [7, 11, 17]);
}
// 棚の数字は「置けるマス全部の中の最大」と同じ。置きかえた方が多く つながる所は、数字を出す（レビュー3回目の指摘1）
{
  const cells = a => a.map(x => x.cell + ':' + x.n).join(' ');
  const g = {}; for (let i = 0; i < R.N; i++) g[i] = 'shield'; delete g[6]; g[11] = 'slash'; g[13] = 'slash'; // 6だけ空き、11と13が斬撃
  const b = setup(g).board;
  eq('空きで つながる所があるとき、札の上には数字を出さない（置きかえの方が多くても）', cells(R.linkSpots(b, 'poison')), '6:1');
  eq('いちばん多い数（棚の点線の判定に使う）は、置きかえをふくめた最大', R.bestLinks(b, 'poison'), 2);
  eq('置きかえても同じ数の所は出さない（札の上を数字だらけにしない）', R.linkSpots(b, 'poison').some(x => x.cell === 16), false);
  // 入れかえも同じ決まり（レビュー4回目の指摘2）：0の毒を動かす。空き6は1本、札のある12は2本 → 両方出す
  const m = setup(Object.assign({}, g, { 0: 'poison' })).board;
  eq('入れかえ：空きで つながる所があるとき、札の上には出さない', cells(R.swapSpots(m, 0)), '6:1');
  eq('入れかえの光る相手は、数字のマスの相手だけ', R.swapMates(m, 0), [11]);
  // 小さい数字は、重ね（レベルアップ）先にも出る。がれきは、つながるなら空きより少なくても出る（レビュー4回目の指摘1）
  const up = setup(Object.assign({}, g, { 12: 'poison' })).board;
  eq('重ねる先（同じ種類）にも、空きで つながる所があるときは出さない', cells(R.linkSpots(up, 'poison')), '6:1');
  const rb = Object.assign({}, g, { 6: 'rubble' }); delete rb[12];
  eq('がれきは、空きより少なくても出る', cells(R.linkSpots(setup(rb).board, 'poison')), '6:1 12:2');
  // 棚の数字は、置けるマス全部を1つずつ数えた最大と、いつも同じ（でたらめな盤面300個）
  let x = 7, bad = 0; const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
  const kinds = R.TYPES.concat(['rubble']);
  for (let t = 0; t < 300; t++) {
    const s = setup({}); const fill = rnd();
    for (let i = 0; i < R.N; i++) if (rnd() < fill) { const k = R.mk(kinds[(rnd() * kinds.length) | 0]); k.lv = 1 + ((rnd() * 3) | 0); if (rnd() < 0.08) k.sealed = 2; s.board[i] = k; }
    for (const type of R.TYPES) {
      let max = 0;
      for (let i = 0; i < R.N; i++) { const c = s.board[i]; if (c && c.type === type && c.lv >= R.MAXLV) continue; max = Math.max(max, R.linksIfPlaced(s.board, type, i).length); }
      if (R.bestLinks(s.board, type) !== max) bad++;
      const sp = R.linkSpots(s.board, type), openHit = sp.some(x => !s.board[x.cell] || s.board[x.cell].type === 'rubble');
      if (openHit && sp.some(x => s.board[x.cell] && s.board[x.cell].type !== 'rubble')) bad++; // 空きに出るときは、札の上に出さない
      if (!sp.length && max > 0) bad++; // つながる所があるのに、数字のマスが1つもない、は起きない
      for (const sp of R.linkSpots(s.board, type)) if (R.linksIfPlaced(s.board, type, sp.cell).length !== sp.n) bad++;
    }
  }
  eq('いちばん多い数＝置けるマス全部の最大／数字のマスの決まり（でたらめな盤面300個×24種類）', bad, 0);
}
// 光らせる相手（linkMates / swapMates）は、本当に つながる札だけ（レビュー2回目の指摘2）
{
  eq('光る相手：斬撃に毒', R.linkMates(setup({ 12: 'slash' }).board, 'poison'), [12]);
  eq('光る相手：盾のない反射と貫通 → 光らない（表では合うが、つながらない）', R.linkMates(setup({ 12: 'pierce' }).board, 'mirror'), []);
  ok('表では 反射と貫通は合う', R.works('mirror', 'pierce'));
  eq('光る相手：盾があれば、反射の相手として盾も貫通も光る', R.linkMates(setup({ 12: 'pierce', 14: 'shield' }).board, 'mirror'), [12, 14]);
  eq('光る相手：合う札でも、封印中は光らない', R.linkMates((() => { const b = setup({ 12: 'slash' }).board; b[12].sealed = 2; return b; })(), 'poison'), []);
  eq('光る相手：合わない札は光らない', R.linkMates(setup({ 12: 'slash', 14: 'shield' }).board, 'poison'), [12]);
  eq('入れかえの光る相手', R.swapMates(setup({ 12: 'slash', 0: 'poison' }).board, 0), [12]);
  const sealed = setup({ 12: 'slash', 0: 'poison' }).board; sealed[0].sealed = 2;
  eq('入れかえの光る相手：封印中の札を選んだとき → なし', R.swapMates(sealed, 0), []);
}
// 「効いている」の計算（derive の live / LL / liveLinks）。線は、両はしが効いているときだけ「効いている線」
{
  const D = c => R.derive(setup(c).board);
  const key = l => l.map(p => p.join('-')).join(' ');
  let d = D({ 12: 'poison', 13: 'amp' });
  eq('攻撃のない毒＋増幅：つながってはいる', key(d.links), '12-13');
  eq('攻撃のない毒＋増幅：効いている線はない', key(d.liveLinks), '');
  eq('攻撃のない毒＋増幅：どちらも働いていない', [d.live[12], d.live[13]], [false, false]);
  eq('置く前：攻撃のない毒のとなりに増幅 → 0本', R.linksIfPlaced(setup({ 12: 'poison' }).board, 'amp', 13), []);
  d = D({ 11: 'slash', 12: 'poison', 13: 'amp' });
  eq('斬撃＋毒＋増幅：2本とも効いている', key(d.liveLinks), '11-12 12-13');
  eq('斬撃＋毒＋増幅：全部働いている', [d.live[11], d.live[12], d.live[13]], [true, true, true]);
  eq('置く前：斬撃を置くと、毒と1本（毒と増幅の線は、数に入れない）', R.linksIfPlaced(setup({ 12: 'poison', 13: 'amp' }).board, 'slash', 11), [12]);
  d = D({ 12: 'slash' });
  eq('攻撃はひとりで働く', d.live[12], true);
  d = D({ 0: 'shield', 1: 'tough', 2: 'regen', 3: 'dodge', 10: 'leech', 20: 'mirror', 22: 'chase', 24: 'charge' });
  eq('盾・堅牢・再生・回避はひとりで働く', [d.live[0], d.live[1], d.live[2], d.live[3]], [true, true, true, true]);
  eq('吸収・反射・追撃・蓄積は、相手がいないと働かない', [d.live[10], d.live[20], d.live[22], d.live[24]], [false, false, false, false]);
  d = D({ 12: 'chase', 13: 'haste' });
  eq('攻撃のない追撃＋加速：効いていない', [d.live[12], d.live[13], key(d.liveLinks)], [false, false, '']);
  d = D({ 11: 'slash', 12: 'chase', 13: 'haste' });
  eq('斬撃＋追撃＋加速：効いている', [d.live[12], d.live[13], key(d.liveLinks)], [true, true, '11-12 12-13']);
  d = D({ 12: 'dodge', 13: 'haste' });
  eq('回避＋加速：効いている', [d.live[13], key(d.liveLinks)], [true, '12-13']);
  d = D({ 12: 'shield', 13: 'sustain' });
  eq('盾＋持続強化：効いている', [d.live[13], key(d.liveLinks)], [true, '12-13']);
  d = D({ 12: 'poison', 13: 'sustain' });
  eq('攻撃のない毒＋持続強化：効いていない', [d.live[13], key(d.liveLinks)], [false, '']);
  // 拡散：属性が まだ のっていない攻撃があるときだけ役に立つ
  d = D({ 11: 'slash', 12: 'poison', 13: 'spread' });
  eq('拡散：毒がもう全部の攻撃に のっている → 拡散は効いていない', [d.live[13], key(d.liveLinks)], [false, '11-12']);
  d = D({ 11: 'slash', 12: 'poison', 13: 'spread', 24: 'shot' });
  eq('拡散：はなれた攻撃がある → 効いている', [d.live[13], key(d.liveLinks)], [true, '11-12 12-13']);
  d = D({ 12: 'poison', 13: 'spread', 24: 'shot' });
  eq('拡散：攻撃につながっていない毒も、拡散で とどけば働く', [d.live[12], d.live[13], key(d.liveLinks)], [true, true, '12-13']);
  ok('　そのとき、はなれた攻撃に毒が のっている', d.atk[0].elem.poison > 0);
  d = D({ 12: 'slash', 13: 'pierce' });
  eq('斬撃＋貫通：効いている', key(d.liveLinks), '12-13');
  d = D({ 12: 'leech', 13: 'amp' });
  eq('攻撃のない吸収＋増幅：効いていない', key(d.liveLinks), '');
  const s2 = setup({ 11: 'slash', 12: 'poison' }).board; s2[11].sealed = 2;
  eq('封印中の攻撃につないだ毒は、働いていない', R.derive(s2).live[12], false);
  // 効いている・いないの印は、戦いの計算と合っている：効いていない札を全部どけても、ダメージは同じ（でたらめな盤面200個）
  let x = 99, bad = 0; const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
  for (let t = 0; t < 200; t++) {
    const mk1 = () => { const s = setup({}, [atk(12, 2)]); return s; };
    const a = mk1(), fill = 0.2 + rnd() * 0.6;
    for (let i = 0; i < R.N; i++) if (rnd() < fill) { const k = R.mk(R.TYPES[(rnd() * R.TYPES.length) | 0]); k.lv = 1 + ((rnd() * 3) | 0); a.board[i] = k; }
    const b = mk1(); const dv = R.derive(a.board);
    for (let i = 0; i < R.N; i++) b.board[i] = a.board[i] && dv.live[i] ? JSON.parse(JSON.stringify(a.board[i])) : null;
    R.resolve(a); R.resolve(b);
    if (a.stats.total !== b.stats.total || a.stats.taken !== b.stats.taken || a.e.hp !== b.e.hp || a.p.hp !== b.p.hp) bad++;
  }
  eq('効いていない札を全部どけても、1ターンの結果は同じ（でたらめな盤面200個）', bad, 0);
}
// 反射は、盾とつながっているときだけ働く。盾がないとき、貫通との線は出ない
{
  const a = R.derive(setup({ 12: 'pierce', 13: 'mirror' }).board);
  eq('反射＋貫通だけ → 線なし', a.links, []);
  eq('反射＋貫通だけ → 反射は0', a.reflect, 0);
  eq('置く前：反射を貫通のとなりに → つながらない', R.linksIfPlaced(setup({ 12: 'pierce' }).board, 'mirror', 13), []);
  const b = R.derive(setup({ 12: 'pierce', 13: 'mirror', 14: 'shield' }).board);
  eq('反射＋盾＋貫通 → 反射は両方とつながる', b.L[13].slice().sort((x, y) => x - y), [12, 14]);
  ok('反射＋盾＋貫通 → 反射が働き、装甲を無視する', b.reflect > 0 && b.reflectPierce === true);
  const c = R.derive(setup({ 13: 'mirror', 14: 'shield' }).board);
  eq('反射＋盾 → つながる', c.L[13], [14]);
}
// 画面に出す線（links）と、計算に使うつながりは同じもの
{ const s = setup({ 12: 'area', 18: 'amp', 13: 'poison', 14: 'sustain', 7: 'haste', 2: 'dodge', 0: 'shield', 1: 'mirror' }); const d = R.derive(s.board);
  const key = l => l.map(p => p.join('-')).sort().join(' ');
  eq('線の一覧', key(d.links), key([[12, 18], [12, 13], [13, 14], [13, 18], [7, 12], [2, 7], [0, 1]])); }

// ---- 通し：ボットが遊んでも、こわれない・予想と結果が合う・同じ種なら同じ結果
let fcMismatch = 0, bad = 0, games = 0, maxHits = 0, preMismatch = 0, preChecks = 0;
for (const id of R.ENEMY_IDS) for (let seed = 1; seed <= 6; seed++) {
  const s = R.newGame(id, seed * 7919); games++;
  const rand = (() => { let x = seed * 99 + 1; return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; }; })();
  let guard = 0;
  while ((s.phase === 'start' || s.phase === 'place') && s.turn < 30 && guard++ < 3000) {
    const act = seed % 2 ? Bot.chooseAction(s, {}) : Bot.chooseAction(s, { random: true, rand });
    if (act.type !== 'end') {
      // 置く前の「つながる」予告は、置いた後の本物のつながりと同じ
      const want = act.type === 'place' ? R.linksIfPlaced(s.board, R.srcType(s, act.src), act.cell) : R.linksIfSwapped(s.board, act.a, act.b);
      const at = act.type === 'place' ? act.cell : act.b;
      if (Bot.apply(s, act) !== 'bad') {
        preChecks++;
        const got = s.board[at] ? R.derive(s.board).LL[at] : [];
        if (String(got.slice().sort((x, y) => x - y)) !== String(want.slice().sort((x, y) => x - y))) preMismatch++;
        continue;
      }
    }
    const f = R.forecast(s), t0 = s.stats.total, k0 = s.stats.taken;
    const ev = R.endTurn(s);
    if (f.dealt !== s.stats.total - t0 || f.taken !== s.stats.taken - k0 || f.won !== (s.phase === 'won') || f.lost !== (s.phase === 'lost')) fcMismatch++;
    maxHits = Math.max(maxHits, ev.filter(e => e.t === 'hit').length);
    const last = ev[ev.length - 1];
    if (last.eh !== Math.max(0, s.e.hp) || last.ph !== Math.max(0, s.p.hp)) bad++;
    for (const v of [s.e.hp, s.p.hp, s.p.shield, s.e.poison, s.e.fire, s.e.ice, s.e.shock, s.e.guard, s.p.curse]) if (!Number.isInteger(v)) bad++;
    if (s.p.hp > s.p.max || s.e.hp > s.e.max || s.p.shield < 0 || s.e.poison < 0) bad++;
    if (s.phase === 'place' && (s.moves < 1 || s.shop.filter(x => x).length !== R.SHOP)) bad++;
  }
}
eq(`予想と結果のずれ（${games}戦）`, fcMismatch, 0);
eq('こわれた数字', bad, 0);
eq(`置く前の「つながる」予告と、置いた後のずれ`, preMismatch, 0);
ok('置く前の予告を十分な回数くらべた', preChecks > 300, `回数 ${preChecks}`);
ok('1ターンのヒット数は上限より下', maxHits < 300, `max ${maxHits}`);
{ const a = Bot.playGame('hydra', 4242, {}), b = Bot.playGame('hydra', 4242, {});
  eq('同じ種なら同じ結果', [a.phase, a.turn, a.e.hp, a.p.hp, a.stats.total], [b.phase, b.turn, b.e.hp, b.p.hp, b.stats.total]); }

if (fails.length) console.log(fails.join('\n'));
console.log(`\nテスト: 合格 ${pass} / 失敗 ${fail}   （通しの最大ヒット数/ターン: ${maxHits}）`);
process.exit(fail ? 1 : 0);
