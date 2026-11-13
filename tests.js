'use strict';
/*
 * tests.js — ルールのテスト（ジグソー版 v2）。 実行: node tests.js
 * 見ること：凹凸の きまり（一方向・わたした側は働かない・先へは わたらない）、ブロックの文が文字どおりに動くか、
 *           敵の性質と じゃま、山札（7個引く・全部すてる・切り直す）、5連戦の流れ、予想＝結果、同じ種なら同じ結果。
 * マスの番号: 横5 × たて4。 0〜4 が1段目、5〜9 が2段目…。
 * 向き(rot)の おぼえ方: 能力・強化は rot0 で凸が右、rot1 で凸が下、rot2 で凸が左。斬撃 rot0 は凹が上と左。盾 rot0 は凹が上と右。
 */
const R = require('./rules.js'), Bot = require('./botcore.js');
let pass = 0, fail = 0;
function eq(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++; else { fail++; console.log(`✗ ${name}\n    出た: ${g}\n    文どおりなら: ${w}`); }
}
function ok(name, cond, note) { if (cond) pass++; else { fail++; console.log(`✗ ${name}${note ? '  ' + note : ''}`); } }
const A = (dmg, hits) => ({ k: 'atk', dmg, hits: hits || 1 });
// 盤面を直接つくる。 spec: [[種類, 向き, マス], …]（札の番号は ならべた順）。 opt: { enemy, parts（敵の行動）, e, p, lv, sealed }
function mk(spec, opt) {
  opt = opt || {};
  const s = R.newFight({ enemyId: opt.enemy || 'dummy', deck: spec.map(x => [x[0], x[1]]), hand: spec.length, seed: 5, lv: opt.lv });
  s.sealed = opt.sealed || [];
  spec.forEach((x, id) => { if (x[2] != null && !R.put(s, id, x[2])) throw new Error('置けない: ' + x); });
  s.intent = { label: 'テスト', parts: opt.parts || [], cells: { rubble: [] } };
  if (opt.e) Object.assign(s.e, opt.e);
  if (opt.p) Object.assign(s.p, opt.p);
  return s;
}
// 1ターン回す（次のターンの準備はしない）
function go(spec, opt) {
  const s = mk(spec, opt), e0 = s.e.hp, p0 = s.p.hp;
  const ev = R.resolve(s, { sim: true });
  return { s, ev, dealt: e0 - s.e.hp, taken: p0 - s.p.hp, n: t => ev.filter(x => x.t === t).length, gifts: k => ev.filter(x => x.t === 'gift' && x.kind === k).length };
}
const okLinks = s => R.derive(s).links.map(l => `${l.from}>${l.to}${l.ok ? '' : '×'}`).join(' ');

// ------------------------------------------------------------ 1. 形（凸と凹）
eq('斬撃 rot0 の辺（上・右・下・左）', R.edges('slash', 0), [-1, 0, 0, -1]);
eq('斬撃 rot1 は時計回りに回る', R.edges('slash', 1), [-1, -1, 0, 0]);
eq('増幅 rot0 は凸が右', R.edges('amp', 0), [0, 1, 0, 0]);
eq('増幅 rot1 は凸が下', R.edges('amp', 1), [0, 0, 1, 0]);
eq('毒 rot1 は凹が上・凸が下', R.edges('poison', 1), [-1, 0, 1, 0]);
for (const t of R.TYPES) {
  const e = R.edges(t, 0), tabs = e.filter(x => x === 1).length, socks = e.filter(x => x === -1).length, f = R.B[t].fam;
  ok(`形のきまり ${t}`, f === 'atk' || f === 'def' ? tabs === 0 && socks >= 1 : f === 'abil' ? tabs === 1 && socks === 1 : tabs === 1 && socks === 0);
}
eq('凸→凹で はまる（増幅の下に斬撃）', okLinks(mk([['amp', 1, 1], ['slash', 0, 6]])), '1>6');
eq('凸が向いていない となりとは はまらない（増幅の右に斬撃。凸は下）', okLinks(mk([['amp', 1, 1], ['slash', 0, 2]])), '');
eq('凸の先が平らな辺なら はまらない（増幅の凸は右、斬撃 rot2 の左は平ら）', okLinks(mk([['amp', 0, 5], ['slash', 2, 6]])), '');
eq('凹と凹は はまらない', okLinks(mk([['slash', 0, 6], ['shield', 0, 5]])), '');
eq('はなれていると はまらない', okLinks(mk([['amp', 1, 1], ['slash', 0, 11]])), '');

// ------------------------------------------------------------ 2. ひとりで働く（文の数字のまま）
eq('斬撃 6ダメージ×1', go([['slash', 0, 6]]).dealt, 6);
eq('射撃 2ダメージ×2', go([['shot', 0, 6]]).dealt, 4);
eq('射撃は2ヒット', go([['shot', 0, 6]]).n('hit'), 2);
eq('範囲攻撃 3ダメージ×1', go([['area', 0, 6]]).dealt, 3);
eq('盾 シールド+7（攻撃10を受けて3）', go([['shield', 0, 6]], { parts: [A(10)] }).taken, 3);
eq('盾 シールドはターンの終わりに消える', go([['shield', 0, 6]]).s.p.shield, 0);
eq('堅牢 ヒット1回ごとに−2（3×3回 → 1×3）', go([['tough', 0, 6]], { parts: [A(3, 3)] }).taken, 3);
eq('回避 最初のヒットを1回よける（10×2回 → 10）', go([['dodge', 0, 6]], { parts: [A(10, 2)] }).taken, 10);
eq('強化は ひとりでは働かない（増幅だけ）', go([['amp', 0, 6]]).dealt, 0);
eq('置いていないブロックは働かない', go([['slash', 0, null]]).dealt, 0);

// ------------------------------------------------------------ 3. 強化（わたした相手を変える）
eq('増幅→斬撃 2倍 = 12', go([['amp', 1, 1], ['slash', 0, 6]]).dealt, 12);
eq('増幅2個→斬撃 = 18（+100% ずつ）', go([['amp', 1, 1], ['amp', 0, 5], ['slash', 0, 6]]).dealt, 18);
eq('加速→斬撃 ヒット数+1 = 6×2', go([['haste', 1, 1], ['slash', 0, 6]]).dealt, 12);
eq('加速→斬撃 は2ヒット', go([['haste', 1, 1], ['slash', 0, 6]]).n('hit'), 2);
eq('加速→射撃 = 2×3', go([['haste', 0, 5], ['shot', 0, 6]]).dealt, 6);
eq('増幅＋加速→斬撃 = 12×2', go([['amp', 1, 1], ['haste', 0, 5], ['slash', 0, 6]]).dealt, 24);
eq('増幅→盾 = シールド14', go([['amp', 1, 1], ['shield', 0, 6]], { parts: [A(20)] }).taken, 6);
eq('加速→盾 = もう1回働く（14）', go([['haste', 1, 1], ['shield', 0, 6]], { parts: [A(20)] }).taken, 6);
eq('増幅→堅牢 = −4', go([['amp', 1, 1], ['tough', 0, 6]], { parts: [A(5, 2)] }).taken, 2);
eq('増幅→回避 = 2回よける', go([['amp', 1, 1], ['dodge', 0, 6]], { parts: [A(10, 3)] }).taken, 10);
eq('加速→回避 = 2回よける', go([['haste', 1, 1], ['dodge', 0, 6]], { parts: [A(10, 3)] }).taken, 10);
eq('貫通→斬撃 装甲を無視', go([['pierce', 1, 1], ['slash', 0, 6]], { e: { armor: 3 } }).dealt, 6);
eq('貫通なしなら 装甲3で 6→3', go([['slash', 0, 6]], { e: { armor: 3 } }).dealt, 3);
eq('貫通→斬撃 結界を無視', go([['pierce', 1, 1], ['slash', 0, 6]], { e: { guard: 10 } }).dealt, 6);
eq('貫通なしなら 結界10で 0', go([['slash', 0, 6]], { e: { guard: 10 } }).dealt, 0);
eq('効果変換→斬撃 最初のヒットに＋シールド（6+7）', go([['convert', 1, 1], ['slash', 0, 6], ['shield', 0, 13]]).dealt, 13);
eq('効果変換は最初のヒットだけ（加速つき 13+6）', go([['convert', 1, 1], ['haste', 0, 5], ['slash', 0, 6], ['shield', 0, 13]]).dealt, 19);
eq('反撃→斬撃 敵のヒットごとに半分の力（6 + 3×2回まで）', go([['counter', 1, 1], ['slash', 0, 6]], { parts: [A(1, 3)] }).dealt, 12);
eq('反撃は 敵が攻撃しなければ出ない', go([['counter', 1, 1], ['slash', 0, 6]]).dealt, 6);
eq('反射→盾 防いだ7の50% = 4（四捨五入）', go([['mirror', 1, 1], ['shield', 0, 6]], { parts: [A(10)] }).dealt, 4);
eq('反射→堅牢 防いだ分（2×3回=6）の50% = 3', go([['mirror', 1, 1], ['tough', 0, 6]], { parts: [A(5, 3)] }).dealt, 3);
eq('吸収→斬撃 与えた6の30% = 2回復', go([['leech', 1, 1], ['slash', 0, 6]], { p: { hp: 50 } }).s.p.hp, 52);
eq('吸収→盾 防いだ7の30% = 2回復（10受けて3へり、2もどる）', go([['leech', 1, 1], ['shield', 0, 6]], { p: { hp: 50 }, parts: [A(10)] }).s.p.hp, 49);
eq('持続強化→盾 シールドが50%残る（7→3）', go([['sustain', 1, 1], ['shield', 0, 6]]).s.p.shield, 3);
// 反射・吸収・持続強化は、受け取ったブロックの分にだけ効く（Codex レビュー 8f22671 の指摘1・2）
eq('反射→盾 と 別の堅牢：堅牢が防いだ2は数えない（盾の7だけ → 4）', go([['mirror', 1, 1], ['shield', 0, 6], ['tough', 0, 13]], { parts: [A(10)] }).dealt, 4);
eq('吸収→盾 と 別の堅牢：盾の7の30% = 2回復（10 − 2 − 7 = 1受けて、2もどる）', go([['leech', 1, 1], ['shield', 0, 6], ['tough', 0, 13]], { p: { hp: 50 }, parts: [A(10)] }).s.p.hp, 51);
eq('反射→堅牢 と 別の盾：堅牢が防いだ2だけ（50% = 1）', go([['mirror', 1, 1], ['tough', 0, 6], ['shield', 0, 13]], { parts: [A(10)] }).dealt, 1);
eq('持続強化→盾 と 別の盾：受け取った盾の分だけ残る（7の半分 = 3。合計14の半分ではない）', go([['sustain', 1, 1], ['shield', 0, 6], ['shield', 0, 13]]).s.p.shield, 3);
eq('シールドは左上の盾から使う：反射なしの盾が先だと、反射の盾は のこりの3だけ防ぐ（50% = 2）', go([['shield', 0, 3], ['mirror', 1, 6], ['shield', 0, 11]], { parts: [A(10)] }).dealt, 2);
eq('シールドは左上の盾から使う：反射の盾が先なら 7防いで 4返す', go([['mirror', 1, 1], ['shield', 0, 6], ['shield', 0, 13]], { parts: [A(10)] }).dealt, 4);
eq('持続強化の盾が先に使われると、のこりは へる（攻撃5：7−5=2 の半分 = 1）', go([['sustain', 1, 1], ['shield', 0, 6], ['shield', 0, 13]], { parts: [A(5)] }).s.p.shield, 1);
eq('前のターンから残ったシールドは、先に使われて、ターンの終わりに消える', (r => [r.taken, r.s.p.shield])(go([['slash', 0, 6]], { p: { shield: 4 }, parts: [A(10)] })), [6, 0]);
eq('トゲも 左上の盾から へらす（合計は合う）', go([['shot', 0, 6], ['shield', 0, 13]], { enemy: 'berserk', parts: [A(5)] }).taken, 0);
eq('持続強化→毒 このターンは へらない（3+1=4 のまま）', go([['sustain', 1, 1], ['poison', 1, 6]], { e: { poison: 3 } }).s.e.poison, 4);
eq('持続強化なしなら 毒は半分（4→2）', go([['poison', 1, 6]], { e: { poison: 3 } }).s.e.poison, 2);
eq('持続強化→炎 50%残る（3+1=4 → 2）', go([['sustain', 2, 7], ['fire', 1, 6]], { e: { fire: 3 } }).s.e.fire, 2);
eq('持続強化なしなら 炎は消える', go([['fire', 1, 6]], { e: { fire: 3 } }).s.e.fire, 0);
{ // 拡散：能力が 全部の攻撃・防御に とどく
  const r = go([['spread', 1, 1], ['poison', 1, 6], ['slash', 0, 13], ['shot', 0, 18]]);
  eq('拡散→毒：斬撃1ヒット＋射撃2ヒットで 毒+2 が3回', r.gifts('poison'), 3);
  eq('拡散→毒：毒ブロックは自分では働かない（順番の札は2つだけ）', R.derive(mk([['spread', 1, 1], ['poison', 1, 6], ['slash', 0, 13], ['shot', 0, 18]])).order, [13, 18]);
  const r2 = go([['spread', 1, 1], ['poison', 1, 6], ['shield', 0, 13]], { parts: [A(1, 4)] });
  eq('拡散→毒：盾にも とどく（敵の4ヒットで 毒+2 が4回）', r2.gifts('poison'), 4);
  eq('拡散→毒：攻撃も防御もなければ、自分で1回', go([['spread', 1, 1], ['poison', 1, 6]]).gifts('poison'), 1);
}
{ // 効かない組：はまっても何も起きない（線は「効かない」になる）
  eq('貫通→盾 は効かない', okLinks(mk([['pierce', 1, 1], ['shield', 0, 6]])), '1>6×');
  eq('拡散→斬撃 は効かない', okLinks(mk([['spread', 1, 1], ['slash', 0, 6]])), '1>6×');
  eq('反射→回避 は効かない', okLinks(mk([['mirror', 1, 1], ['dodge', 0, 6]])), '1>6×');
  eq('持続強化→斬撃 は効かない', okLinks(mk([['sustain', 1, 1], ['slash', 0, 6]])), '1>6×');
  eq('効かない強化は「働いていない」', R.summary(R.derive(mk([['pierce', 1, 1], ['shield', 0, 6]])), 1).idle, true);
  eq('効く強化は「働いている」', R.summary(R.derive(mk([['amp', 1, 1], ['shield', 0, 6]])), 1).idle, false);
  eq('貫通→盾 でも盾はふつうに働く', go([['pierce', 1, 1], ['shield', 0, 6]], { parts: [A(10)] }).taken, 3);
}

// ------------------------------------------------------------ 4. 能力：ひとり＝1回／攻撃に わたす＝ヒットごと／防御に わたす＝敵のヒットごと
{
  const solo = go([['poison', 1, 6]]);
  eq('毒 ひとり：半分の力で1回（毒+1。ターンの終わりに1ダメージ）', [solo.gifts('poison'), solo.dealt], [1, 1]);
  eq('ひとりは半分・切り上げ（毒 Lv2 は 3 → 2）', go([['poison', 1, 6]], { lv: { poison: 2 } }).dealt, 2);
  eq('ひとりは半分（増幅つきの毒 4 → 2）', go([['amp', 1, 1], ['poison', 1, 6]]).dealt, 2);
  eq('わたせば 半分にならない（毒→斬撃：6 + 毒2）', go([['poison', 1, 1], ['slash', 0, 6]]).dealt, 8);
  const a = go([['poison', 0, 5], ['shot', 0, 6]]);
  eq('毒→射撃：ヒットごとに毒+2（2ヒットで4。4ダメージ＋毒4）', [a.gifts('poison'), a.dealt, a.s.e.poison], [2, 8, 2]);
  const dfn = go([['poison', 1, 1], ['shield', 0, 6]], { parts: [A(1, 3)] });
  eq('毒→盾：敵のヒット1回ごとに毒+2（3ヒットで6）', [dfn.gifts('poison'), dfn.dealt], [3, 6]);
  eq('毒→盾：敵が攻撃しないターンは 0回', go([['poison', 1, 1], ['shield', 0, 6]]).gifts('poison'), 0);
  const one = go([['poison', 1, 1], ['slash', 0, 6]]);
  eq('わたした毒は 自分では働かない（斬撃1ヒットで 毒+2 は1回だけ）', one.gifts('poison'), 1);
  eq('毒→堅牢 でも 敵のヒットごと', go([['poison', 1, 1], ['tough', 0, 6]], { parts: [A(1, 4)] }).gifts('poison'), 4);
  eq('毒→回避：よけたヒットでも働く', go([['poison', 1, 1], ['dodge', 0, 6]], { parts: [A(9, 2)] }).gifts('poison'), 2);
}
{ // 受け取ったものは、次へは わたらない
  const r = go([['amp', 1, 1], ['poison', 1, 6], ['slash', 0, 11]]);
  eq('増幅→毒→斬撃：斬撃は6のまま（増幅は斬撃に とどかない）', r.ev.filter(x => x.t === 'hit')[0].dmg, 6);
  eq('増幅→毒→斬撃：毒は自分の数字が2倍（ヒットで毒+4）', r.ev.filter(x => x.t === 'gift')[0].n, 4);
  const s = mk([['poison', 2, 7], ['fire', 1, 6], ['slash', 0, 11]]);
  eq('毒→炎→斬撃：炎は斬撃へ。毒は炎に とどかない（効かない線）', okLinks(s), '6>11 7>6×');
  const q = go([['poison', 2, 7], ['fire', 1, 6], ['slash', 0, 11]]);
  eq('毒→炎→斬撃：毒は ひとりで1回、炎は斬撃のヒットで1回', [q.gifts('poison'), q.gifts('fire')], [1, 1]);
  const t = go([['poison', 2, 7], ['fire', 1, 6]]);
  eq('毒→炎（炎が自分で働く）：炎+1 と 毒+2 が いっしょに1回ずつ', [t.gifts('poison'), t.gifts('fire'), R.derive(mk([['poison', 2, 7], ['fire', 1, 6]])).order], [1, 1, [6]]);
  const h = go([['haste', 1, 1], ['poison', 1, 6]]);
  eq('加速→毒（ひとり）：もう1回働く（毒+2 が2回）', h.gifts('poison'), 2);
  const h2 = go([['haste', 1, 1], ['poison', 1, 6], ['slash', 0, 11]]);
  eq('加速→毒→斬撃：ヒットごとに2回', h2.gifts('poison'), 2);
}
// それぞれの能力
eq('炎 ひとり → あとの射撃2ヒットが +1 ずつ（3+3）', go([['fire', 1, 0], ['shot', 0, 6]]).dealt, 6);
eq('炎→射撃：1ヒット目のあと炎1（2 + 3）', go([['fire', 0, 5], ['shot', 0, 6]]).dealt, 5);
eq('炎は たまる（ヒットごとに+1。加速つき射撃 2+3+4）', go([['fire', 0, 5], ['haste', 2, 7], ['shot', 0, 6]]).dealt, 9);
eq('炎は 装甲でへる（装甲2：2+1−2 = 1 が2回）', go([['fire', 1, 0], ['shot', 0, 6]], { e: { armor: 2 } }).dealt, 2);
{
  const r = go([['ice', 1, 6]], { e: { ice: 7 }, parts: [A(10)] });
  eq(`氷 ${R.FREEZE_AT}たまると凍結：攻撃10が半分`, [r.taken, r.s.e.ice, r.n('freeze')], [5, 0, 1]);
  eq('氷 たりなければ凍結しない', go([['ice', 1, 6]], { e: { ice: 3 }, parts: [A(10)] }).taken, 10);
  const m = go([['ice', 1, 1], ['shield', 0, 6]], { e: { ice: 6 }, parts: [A(10, 3)] });
  eq('氷→盾：1ヒット目のあとで凍結 → のこりの2ヒットが半分（10−7=3、5、5）', m.taken, 13);
  const sh = go([['shock', 1, 6]], { e: { shock: 7 } });
  eq(`雷 ${R.SHOCK_AT}たまると感電：${R.SHOCK_DMG}ダメージ、次のターン1個多く引く`, [sh.dealt, sh.s.drawBonus, sh.s.e.shock], [10, 1, 0]);
  eq('雷 たりなければ感電しない', go([['shock', 1, 6]], { e: { shock: 3 } }).dealt, 0);
  eq('感電は1ターンに1回', go([['amp', 0, 5], ['shock', 1, 6]], { e: { shock: 14 } }).n('shock'), 1);
}
eq('再生 ひとり：半分の力（HP+1）', go([['regen', 1, 6]], { p: { hp: 50 } }).s.p.hp, 51);
eq('再生→射撃：ヒットごとにHP+2', go([['regen', 0, 5], ['shot', 0, 6]], { p: { hp: 50 } }).s.p.hp, 54);
eq('再生→盾：敵のヒットごとにHP+2（1×3回はシールドで防いで +6）', go([['regen', 1, 1], ['shield', 0, 6]], { p: { hp: 50 }, parts: [A(1, 3)] }).s.p.hp, 56);
eq('再生は最大HPをこえない', go([['regen', 1, 6]]).s.p.hp, 100);
eq('追撃 ひとり：半分の力（1ダメージのヒット）', go([['chase', 1, 6]]).dealt, 1);
eq('追撃→斬撃：敵の状態1種類ごとに+2（毒あり → 斬撃6 + 追撃4 + 毒3）', go([['chase', 1, 6], ['slash', 0, 11]], { e: { poison: 3 } }).dealt, 13);
eq('追撃→斬撃：状態3種類なら 2×4 = 8（炎1がのって9）', go([['chase', 1, 6], ['slash', 0, 11]], { e: { ice: 1, shock: 1, fire: 1 } }).ev.filter(x => x.t === 'hit' && x.kind === 'chase')[0].dmg, 8 + 1);
eq('追撃→斬撃：ヒットごとに追加ヒット（6+2）', go([['chase', 1, 6], ['slash', 0, 11]]).dealt, 8);
eq('追撃→盾：敵のヒットごとに追加ヒット（2×3）', go([['chase', 1, 6], ['shield', 0, 11]], { parts: [A(1, 3)] }).dealt, 6);
eq('貫通→追撃→盾：追撃のヒットが装甲を無視（2×2回）', go([['pierce', 2, 7], ['chase', 1, 6], ['shield', 0, 11]], { e: { armor: 3 }, parts: [A(1, 2)] }).dealt, 4);
eq('貫通なしの追撃は 装甲3で 0', go([['chase', 1, 6], ['shield', 0, 11]], { e: { armor: 3 }, parts: [A(1, 2)] }).dealt, 0);
eq('毒消費→斬撃：毒5を全部消して ×2 = 10（斬撃6とで16。毒は0になる）', (r => [r.dealt, r.s.e.poison])(go([['consume', 0, 5], ['slash', 0, 6]], { e: { poison: 5 } })), [16, 0]);
eq('毒消費 ひとり：半分の力（×1）', (r => [r.dealt, r.s.e.poison])(go([['consume', 1, 6]], { e: { poison: 5 } })), [5, 0]);
eq('毒消費：毒がなければ 0', go([['consume', 1, 6]]).dealt, 0);
eq('順番：毒つき斬撃が先、毒消費つき斬撃が後（6 + 6 + 2×2）', go([['poison', 0, 0], ['slash', 0, 1], ['consume', 0, 5], ['slash', 0, 6]]).dealt, 16);
eq('順番：毒消費つき斬撃が先だと消費できない（6 + 6 + 毒2）', go([['consume', 0, 0], ['slash', 0, 1], ['poison', 0, 5], ['slash', 0, 6]]).dealt, 14);
{
  const r = go([['charge', 1, 6]]);
  eq('蓄積 ひとり：半分の力（たまり+2。次のターンから使える）', [r.s.p.charge, r.dealt], [2, 0]);
  eq('たまり：最初に当たったヒットに ぜんぶ のる（6+5）、使うと0', (x => [x.dealt, x.s.p.charge])(go([['slash', 0, 6]], { p: { charge: 5 } })), [11, 0]);
  eq('たまり：よけられたヒットでは へらない（狩人。射撃2ヒットをよけられ、斬撃 6+5）', go([['shot', 0, 1], ['slash', 0, 6]], { p: { charge: 5 }, e: { evade: 2 } }).dealt, 11);
  eq('たまり：このターンに ためた分は、このターンには のらない', go([['charge', 1, 0], ['slash', 0, 6]]).dealt, 6);
  eq('蓄積→盾：敵のヒットごとに たまり+3', go([['charge', 1, 1], ['shield', 0, 6]], { parts: [A(1, 4)] }).s.p.charge, 12);
}
eq('発動の順：左上から（攻撃と、自分で働く能力）', R.derive(mk([['slash', 0, 13], ['poison', 1, 2], ['shot', 0, 6], ['amp', 1, 8], ['shield', 0, 0]])).order, [2, 6, 13]);

// ------------------------------------------------------------ 5. レベル（種類ごと）
eq('斬撃 Lv2 = 9', go([['slash', 0, 6]], { lv: { slash: 2 } }).dealt, 9);
eq('斬撃 Lv3 = 12', go([['slash', 0, 6]], { lv: { slash: 3 } }).dealt, 12);
eq('増幅 Lv2 = 2.5倍（6→15）', go([['amp', 1, 1], ['slash', 0, 6]], { lv: { amp: 2 } }).dealt, 15);
eq('加速 Lv2 = ヒット数+2', go([['haste', 1, 1], ['slash', 0, 6]], { lv: { haste: 2 } }).dealt, 18);
eq('貫通 Lv2 = さらにヒット+3', go([['pierce', 1, 1], ['slash', 0, 6]], { lv: { pierce: 2 }, e: { armor: 3 } }).dealt, 9);
eq('盾 Lv2 = 10', go([['shield', 0, 6]], { lv: { shield: 2 }, parts: [A(10)] }).taken, 0);
eq('毒 Lv3 = 毒+4（毒→斬撃：6 + 毒4）', go([['poison', 1, 1], ['slash', 0, 6]], { lv: { poison: 3 } }).dealt, 10);
eq('持続強化 Lv2：シールド75%残る（7→5）', go([['sustain', 1, 1], ['shield', 0, 6]], { lv: { sustain: 2 } }).s.p.shield, 5);
for (const t of R.TYPES) for (let lv = 1; lv <= R.maxLv(t); lv++) {
  const v = R.B[t].v[lv - 1], txt = R.blockText(t, lv);
  ok(`文に数字が入っている ${t} Lv${lv}`, v === 0 || txt.indexOf(String(v)) >= 0, txt);
}

// ------------------------------------------------------------ 6. 敵の性質と じゃま
eq('装甲2（ゴーレム）：斬撃 6→4', go([['slash', 0, 6]], { enemy: 'golem' }).dealt, 4);
eq('装甲2（ゴーレム）：射撃 2→0 が2回', go([['shot', 0, 6]], { enemy: 'golem' }).dealt, 0);
eq('装甲は 毒のダメージを へらせない（毒→盾、敵の2ヒットで毒4）', go([['poison', 1, 1], ['shield', 0, 6]], { enemy: 'golem', parts: [A(1, 2)] }).dealt, 4);
eq('身かわし（狩人）：最初の2ヒットをよける（射撃が先なら 斬撃は当たる）', go([['shot', 0, 1], ['slash', 0, 6]], { enemy: 'hunter' }).dealt, 6);
eq('身かわし（狩人）：斬撃が先だと 斬撃と射撃1ヒットをよけられる', go([['slash', 0, 1], ['shot', 0, 6]], { enemy: 'hunter' }).dealt, 2);
eq('身かわし：よけられたヒットでは 能力は働かない', go([['poison', 1, 1], ['slash', 0, 6]], { enemy: 'hunter' }).gifts('poison'), 0);
eq('身かわし：自分で働く能力は よけられない', go([['poison', 1, 6]], { enemy: 'hunter' }).gifts('poison'), 1);
eq('トゲ1（狂戦士）：ヒット1回ごとに1ダメージ（射撃2ヒットで2）', go([['shot', 0, 6]], { enemy: 'berserk' }).taken, 2);
eq('トゲはシールドで防げる', go([['shot', 0, 6], ['shield', 0, 13]], { enemy: 'berserk' }).taken, 0);
eq('再生5（ヒドラ）：ターンの終わりに5回復（6与えて5もどる）', go([['slash', 0, 6]], { enemy: 'hydra', e: { hp: 50 } }).dealt, 1);
eq('結界：次のターンのヒットを防ぐ（結界8、斬撃6 → 0、結界のこり2）', (r => [r.dealt, r.ev.filter(x => x.t === 'hit')[0].guardCut])(go([['slash', 0, 6]], { e: { guard: 8 } })), [0, 6]);
eq('結界は 敵の行動の前に消える', go([['slash', 0, 6]], { e: { guard: 99 }, parts: [A(1)] }).s.e.guard, 0);
eq('脱皮：毒・炎・氷・雷を全部消す', (e => [e.poison, e.ice, e.shock])(go([['poison', 1, 6]], { e: { ice: 3, shock: 3 }, parts: [{ k: 'cleanse' }] }).s.e), [0, 0, 0]);
eq('呪い：シールドで防げない。ターンの終わりに呪いの数だけ、1ずつへる', (r => [r.taken, r.s.p.curse])(go([['shield', 0, 6]], { parts: [{ k: 'curse', n: 4 }] })), [4, 3]);
{ // 封印：凸も凹も はまらない
  eq('封印された増幅は はまらない（斬撃は6のまま）', go([['amp', 1, 1], ['slash', 0, 6]], { sealed: [0] }).dealt, 6);
  eq('封印された斬撃は 受け取れない（でも自分では働く）', go([['amp', 1, 1], ['slash', 0, 6]], { sealed: [1] }).dealt, 6);
  eq('封印された毒は ひとりで働く', go([['poison', 1, 1], ['slash', 0, 6]], { sealed: [0] }).gifts('poison'), 1);
  const s = R.newFight({ enemyId: 'dummy', seed: 3 });
  s.intent = { label: 'テスト', parts: [{ k: 'seal', n: 2 }], cells: { rubble: [] } };
  R.endTurn(s);
  eq('封印2個：次のターン、手札の2個が封印される', [s.sealed.length, s.sealed.every(id => s.hand.indexOf(id) >= 0)], [2, true]);
  R.endTurn(s);
  eq('封印は1ターンだけ', s.sealed.length, 0);
}
{ // がれき：次のターン、そのマスに置けない
  const s = R.newFight({ enemyId: 'dummy', seed: 3 });
  s.intent = { label: 'テスト', parts: [{ k: 'rubble', n: 2 }], cells: { rubble: [6, 7] } };
  eq('がれきは このターンには まだ置ける', R.canPut(s, s.hand[0], 6), true);
  R.endTurn(s);
  eq('がれき：次のターン、そのマスに置けない', [s.blocked, R.canPut(s, s.hand[0], 6), R.put(s, s.hand[0], 7), R.canPut(s, s.hand[0], 8)], [[6, 7], false, false, true]);
  R.endTurn(s);
  eq('がれきは1ターンだけ', s.blocked, []);
  const h = R.newFight({ enemyId: 'hunter', seed: 3 }); R.endTurn(h);
  ok('狩人の がれきは まん中のマスに落ちる', h.intent.cells.rubble.length === 2 && h.intent.cells.rubble.every(c => R.INNER.indexOf(c) >= 0));
}
{ // 破壊：いちばん多く はまっているブロックが、この戦いから消える
  const spec = [['amp', 1, 1], ['poison', 0, 5], ['slash', 0, 6], ['shield', 0, 13]];
  const s = mk(spec, { parts: [{ k: 'destroy', n: 1 }] });
  eq('破壊のねらい：2つ はまっている斬撃', R.destroyTargets(R.derive(s), 1), [6]);
  const s2 = R.newFight({ enemyId: 'dummy', deck: spec.map(x => [x[0], x[1]]).concat([['slash', 0], ['slash', 0], ['slash', 0], ['slash', 0], ['slash', 0], ['slash', 0], ['slash', 0], ['slash', 0]]), hand: 12, seed: 5 });
  spec.forEach((x, id) => R.put(s2, id, x[2]));
  s2.intent = { label: 'テスト', parts: [{ k: 'destroy', n: 1 }], cells: { rubble: [] } };
  R.endTurn(s2);
  eq('破壊されたブロックは、山札にも捨て札にも手札にも ない', [s2.gone, s2.deck.concat(s2.discard, s2.hand).indexOf(2)], [[2], -1]);
  for (let i = 0; i < 6; i++) R.endTurn(s2);
  eq('破壊されたブロックは、その戦いでは もう引かない', s2.deck.concat(s2.discard, s2.hand).indexOf(2), -1);
  eq('どこも はまっていなければ、何も こわれない', R.destroyTargets(R.derive(mk([['slash', 0, 6], ['shield', 0, 13]])), 1), []);
  eq('同じ数なら 左上が先', R.destroyTargets(R.derive(mk([['amp', 1, 1], ['slash', 0, 6], ['amp', 1, 3], ['slash', 0, 8]])), 1), [1]);
  eq('破壊2個', R.destroyTargets(R.derive(mk(spec)), 2), [6, 1]);
}
{ // 予告の文
  const it = { parts: [A(5, 3), { k: 'guard', n: 8 }, { k: 'seal', n: 2 }, { k: 'destroy', n: 1 }, { k: 'rubble', n: 2 }, { k: 'curse', n: 3 }], cells: { rubble: [6, 7] } };
  eq('予告の文', R.intentLines(it).map(x => x.text.split('（')[0]), ['攻撃 5×3回', '結界 8', '封印 2個', '破壊 1個', 'がれき 2マス', '呪い+3']);
  const g = R.newFight({ enemyId: 'golem', seed: 1, stage: 0 });
  eq('ゴーレム 1戦目の1つ目の予告は「なぐる 攻撃12」', [g.intent.label, g.intent.parts[0].dmg], ['なぐる', 12]);
  const g4 = R.newFight({ enemyId: 'golem', seed: 1, stage: 4 });
  eq('5戦目は 攻撃とHPが倍率どおり', [g4.intent.parts[0].dmg, g4.e.max], [Math.round(12 * R.STAGE_ATK[4]), Math.round(80 * R.STAGE_HP[4])]);
}

// ------------------------------------------------------------ 7. 山札：7個引く → 全部すてる → なくなったら切り直す
{
  const s = R.newFight({ enemyId: 'dummy', seed: 9 });
  const all = id => s.deck.concat(s.discard, s.hand, s.gone).sort((a, b) => a - b).join(',');
  const want = s.cards.map(c => c.id).join(',');
  eq('はじめのデッキは14個', s.cards.length, 14);
  eq('1ターン目に7個引く', [s.hand.length, s.deck.length, s.discard.length], [7, 7, 0]);
  const h1 = s.hand.slice();
  R.put(s, s.hand[0], 6); R.put(s, s.hand[1], 7);
  R.endTurn(s);
  eq('ターンの終わりに 手札を全部（置いたものも、置かなかったものも）捨て札へ', [s.discard.slice().sort((a, b) => a - b), s.board.every(x => x == null)], [h1.slice().sort((a, b) => a - b), true]);
  eq('2ターン目も7個引く（山札は0に）', [s.hand.length, s.deck.length], [7, 0]);
  eq('2ターンで14個ぜんぶを1回ずつ引く', h1.concat(s.hand).sort((a, b) => a - b).join(','), want);
  R.endTurn(s);
  eq('山札がなくなったら 捨て札を切り直して引く', [s.hand.length, s.deck.length, s.discard.length], [7, 7, 0]);
  let good = true; const seen = {};
  for (let t = 0; t < 40; t++) { if (all() !== want || s.hand.length !== 7) good = false; for (const id of s.hand) seen[id] = (seen[id] || 0) + 1; R.endTurn(s); }
  ok('40ターン回しても、札の数は変わらない（山札＋捨て札＋手札＝14）', good);
  const cnt = Object.values(seen);
  ok('どの札も同じ回数だけ引く（40ターンで各20回）', Math.max(...cnt) - Math.min(...cnt) <= 1, JSON.stringify(cnt));
}
{ // 感電：次のターン1個多く引く／再発動：次のターンも引く
  const s = R.newFight({ enemyId: 'dummy', seed: 9 }); s.drawBonus = 1; R.endTurn(s);
  eq('感電のあとは 8個引く', s.hand.length, 8);
  R.endTurn(s); eq('その次は 7個にもどる', s.hand.length, 7);
  const deck = [['refire', 1], ['slash', 0]]; for (let i = 0; i < 14; i++) deck.push(['shot', 0]);
  const r = R.newFight({ enemyId: 'dummy', deck, hand: 16, seed: 2 }); r.handSize = 7;
  R.put(r, 0, 1); R.put(r, 1, 6);
  eq('再発動→斬撃 は効く', okLinks(r), '1>6');
  R.endTurn(r);
  eq('再発動：わたした相手（斬撃）を 次のターンの最初に引く', [r.hand[0], r.hand.length], [1, 7]);
}
{ // 置く・もどす・入れかえる
  const s = R.newFight({ enemyId: 'dummy', seed: 4 }), a = s.hand[0], b = s.hand[1];
  eq('置く', [R.put(s, a, 6), s.board[6]], [true, a]);
  eq('同じマスに もう一度は置けない', R.put(s, a, 6), false);
  eq('動かす', [R.put(s, a, 7), s.board[6], s.board[7]], [true, null, a]);
  R.put(s, b, 6);
  eq('盤面どうしは入れかえ', [R.put(s, a, 6), s.board[6], s.board[7]], [true, a, b]);
  const c = s.hand[2];
  eq('手札から 札のあるマスに置くと、もとの札は手札にもどる', [R.put(s, c, 6), s.board[6], R.cellOf(s, a)], [true, c, -1]);
  eq('もどす', [R.take(s, c), s.board[6]], [true, null]);
  eq('手札にない札は置けない', R.put(s, 99, 3), false);
  eq('回すのは ?rot=1 のときだけ', R.rotate(s, b), false);
  const r = R.newFight({ enemyId: 'dummy', seed: 4, rot: true }), id = r.hand[0], r0 = r.cards[id].rot;
  eq('?rot=1 なら回せる', [R.rotate(r, id), r.cards[id].rot], [true, (r0 + 1) & 3]);
  R.clearBoard(s); eq('全部もどす', s.board.every(x => x == null), true);
}

// ------------------------------------------------------------ 8. 札に出す字（summary）は、計算と同じ
{
  const s = mk([['amp', 1, 1], ['haste', 0, 5], ['slash', 0, 6], ['poison', 1, 3], ['shield', 0, 8], ['regen', 1, 10]]), d = R.derive(s);
  eq('斬撃の字（増幅＋加速）', R.summary(d, 6).main, '12×2');
  eq('盾の字', R.summary(d, 8).main, '+7');
  eq('盾が受け取った毒', R.summary(d, 8).lines, ['シールド+7', '敵のヒット1回ごとに 毒+2']);
  eq('わたした毒は「わたしている」', R.summary(d, 3).gives, true);
  eq('ひとりの再生は「自分で1回」', [R.summary(d, 10).gives, R.summary(d, 10).main], [false, '+1']);
  const f = R.forecast(s);
  eq('予想（与える24、毒は敵が攻撃しないので0）', [f.dealt, f.poison], [24, 0]);
  eq('ごほうびの めやす：増幅(凸が下)が はまる凹は、はじめのデッキに5つ', R.fitCount(R.START_DECK.map(c => ({ type: c[0], rot: c[1] })), { type: 'amp', rot: 1 }).give, 5);
}

// ------------------------------------------------------------ 9. 5連戦の流れ
{
  const run = R.newRun(7);
  eq('5連戦：敵5体を1回ずつ', run.order.slice().sort().join(','), R.ENEMY_IDS.slice().sort().join(','));
  eq('1戦目', [run.phase, run.stage, run.fight.stage, run.fight.p.hp], ['fight', 0, 0, 100]);
  eq('戦いの途中では finishFight できない', R.finishFight(run), false);
  run.fight.p.hp = 60; run.fight.phase = 'won';
  eq('勝つと HP+20 して、ブロックをえらぶ', [R.finishFight(run), run.phase, run.hp, run.reward.round, run.reward.options.length], [true, 'reward', 80, 1, 3]);
  const n0 = run.deck.length, o = run.reward.options[0];
  R.pickReward(run, 0);
  eq('えらぶと デッキに入る（レベルアップなら その種類が強くなる）', o.up ? [run.deck.length, run.lv[o.type]] : [run.deck.length, run.deck[n0].type], o.up ? [n0, o.lv] : [n0 + 1, o.type]);
  eq('2回えらぶ', [run.phase, run.reward.round], ['reward', 2]);
  R.pickReward(run, -1);
  eq('えらばないこともできる。そのあと 1個はずせる', run.phase, 'remove');
  const n1 = run.deck.length, t0 = run.deck[0].type;
  R.removeCard(run, 0);
  eq('はずすと デッキから消えて、2戦目へ', [run.deck.length, run.removed, run.phase, run.stage, run.fight.stage, run.fight.p.hp, run.fight.cards.length], [n1 - 1, [t0], 'fight', 1, 1, 80, n1 - 1]);
  run.fight.phase = 'lost'; R.finishFight(run);
  eq('負けたら そこで終わり', run.phase, 'lost');
  const r2 = R.newRun(8);
  for (let i = 0; i < 5; i++) { r2.fight.phase = 'won'; R.finishFight(r2); if (r2.phase === 'reward') { R.pickReward(r2, -1); R.pickReward(r2, -1); R.removeCard(r2, -1); } }
  eq('5戦ぜんぶ勝つと クリア', [r2.phase, r2.stage], ['won', 4]);
  // レベルアップの ごほうびは、もっている種類だけ・上限まで
  let bad = 0, ups = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const r = R.newRun(seed); r.lv.slash = 3;
    for (const o2 of R.rollReward(r)) if (o2.up) { ups++; if (!r.deck.some(c => c.type === o2.type) || o2.lv !== R.lvOf(r.lv, o2.type) + 1 || o2.lv > R.maxLv(o2.type)) bad++; }
  }
  ok('レベルアップの ごほうびは、もっている種類だけ・上限まで', bad === 0 && ups > 20, `bad ${bad} ups ${ups}`);
}

// ------------------------------------------------------------ 10. ボットに通しで遊ばせる：予想＝結果、札の数、同じ種なら同じ結果
{
  let mism = 0, turns = 0, cons = 0, linkBad = 0;
  for (const style of ['smart', 'attack', 'blind', 'solo', 'random']) for (let seed = 1; seed <= 4; seed++) {
    Bot.playRun(seed * 3 + 1, { style, pick: 'random', remove: 'random', onTurn: s => {
      turns++;
      const f = R.forecast(s), c = R.cloneState(s); const t0 = c.stats.total, k0 = c.stats.taken; R.endTurn(c);
      if (f.dealt !== c.stats.total - t0 || f.taken !== c.stats.taken - k0 || f.eHp !== Math.max(0, c.e.hp) || f.pHp !== Math.max(0, c.p.hp)) mism++;
      if (s.deck.length + s.discard.length + s.hand.length + s.gone.length !== s.cards.length) cons++;
      const d = R.derive(s);
      // 効いている線の両はしは、封印されていない。わたす側は 自分では働かない（順番に入らない）
      for (const l of d.links) { if (d.blk[l.from].sealed || d.blk[l.to].sealed) linkBad++; if (l.ok && d.blk[l.from].fam === 'abil' && d.order.indexOf(l.from) >= 0) linkBad++; }
      if (style === 'solo' && d.links.length) linkBad++;
    } });
  }
  ok(`予想と結果が同じ（${turns}ターン）`, mism === 0 && turns > 300, `ずれ ${mism} / ${turns}`);
  ok('札の数が変わらない（山札＋捨て札＋手札＋破壊）', cons === 0);
  ok('線のきまり（封印・わたす側は働かない・solo は はめない）', linkBad === 0, `${linkBad}`);
  const a = Bot.playRun(42, { style: 'smart', pick: 'random' }), b = Bot.playRun(42, { style: 'smart', pick: 'random' });
  eq('同じ種なら同じ結果', a.fights.map(f => [f.enemy, f.turns, f.hp1, f.total]), b.fights.map(f => [f.enemy, f.turns, f.hp1, f.total]));
  const c = Bot.playRun(43, { style: 'smart', pick: 'random' });
  ok('種がちがえば ちがう結果', JSON.stringify(a.fights) !== JSON.stringify(c.fights));
  // 回せる設定でも こわれない
  const r = Bot.playRun(5, { style: 'smart', pick: 'random', rot: true, restarts: 1, passes: 1 });
  ok('回せる設定（?rot=1）でも最後まで動く', r.fights.length >= 1);
}

console.log(`\n合格 ${pass} / 失敗 ${fail}`);
process.exit(fail ? 1 : 0);
