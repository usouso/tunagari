/*
 * ui.js — 画面（ジグソー版 v2）。ルール(rules.js)が返す出来事ログを再生するだけ。条件や数字は、ここで書き直さない。
 * URL: ?seed=数 / ?enemy=golem|hunter|hydra|mage|berserk（1戦だけ。&stage=0〜4）/ ?speed=0 / ?mute=1 / ?rot=1（ブロックを回せる。くらべる用）
 *      ?hp=数（れんしゅうを そのHPで始める。検査用）
 *      ?auto=1（ボットが画面を通して遊ぶ・無音）&bot=smart|random… &picks=sim（ごほうびを ためしてから選ぶ）&stop=ターン &pick=1 &screen=reward|remove|help|deck|tip（&tip=キー）&scene=thorn（攻撃を1個だけ置く）| terms（ことばの説明を全部 出す）
 */
(function () {
  'use strict';
  const R = window.Rules, Bot = window.BotCore;
  const $ = s => document.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const Q = new URLSearchParams(location.search);
  const AUTO = Q.get('auto') === '1', MUTE = AUTO || Q.get('mute') === '1', ROT = Q.get('rot') === '1';
  const STOP = Q.has('stop') ? +Q.get('stop') : 0, SCREEN = Q.get('screen') || '';
  const FAM_COLOR = { atk: 'var(--atk)', def: 'var(--def)', abil: 'var(--abil)', enh: 'var(--enh)' };
  const SRC_NAMES = { fire: '炎', chase: '追撃', consume: '毒消費', poison: '毒', shock: '感電', mirror: '反射', charge: 'たまり' };

  const G = {
    mode: 'run', run: null, s: null, sel: null, busy: false, pre: null, preD: null, view: null, hoverId: null, hoverCell: -1,
    speed: Q.has('speed') ? +Q.get('speed') : (AUTO ? 0 : 1), seed: Q.has('seed') ? (+Q.get('seed') | 0) : ((Date.now() % 90000) + 1),
    turnSum: { e: 0, p: 0 }, gone: {},
  };
  const CHECK = { turns: 0, fights: 0, mismatches: [], errors: [], done: false, stopped: false, result: null, linkChecks: 0, spotChecks: 0, tipChecks: 0, tipSeen: {}, screens: {},
                  layout: { samples: 0, overlaps: 0, offscreen: 0, clipped: 0, pageScroll: 0, notes: [] } };
  window.__check = CHECK; window.__G = G;
  window.addEventListener('error', e => CHECK.errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', e => CHECK.errors.push('promise: ' + String(e.reason && e.reason.message || e.reason)));
  const miss = m => { if (CHECK.mismatches.length < 30) CHECK.mismatches.push(m); };

  // ------------------------------------------------------------ 音（小さめ。?auto / ?mute では鳴らさない）
  let AC = null; let vol = 0.25;
  function sfx(kind, n) {
    if (MUTE || vol <= 0 || G.speed === 0) return;
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
      const P = { place: [520, 0.07, 'triangle'], link: [740, 0.09, 'triangle'], hit: [300 + Math.min(12, n || 0) * 35, 0.06, 'square'], ehit: [120, 0.12, 'sawtooth'], big: [660, 0.2, 'triangle'], win: [880, 0.5, 'triangle'], lose: [90, 0.6, 'sawtooth'], bad: [200, 0.1, 'sine'] }[kind] || [440, 0.05, 'sine'];
      o.type = P[2]; o.frequency.setValueAtTime(P[0], t);
      if (kind === 'win') o.frequency.exponentialRampToValueAtTime(1320, t + 0.3);
      g.gain.setValueAtTime(vol * 0.25, t); g.gain.exponentialRampToValueAtTime(0.0001, t + P[1]);
      o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + P[1] + 0.02);
    } catch (e) { /* 音が出せない環境では何もしない */ }
  }

  // ------------------------------------------------------------ ブロックの絵（凸と凹）
  // 100×100 の中に、体は 7〜93。辺のまん中に 凸（外へ）か 凹（内へ）。 side: 0上 1右 2下 3左。 u … 辺にそって時計回り、v … 外向き
  const f2 = x => Math.round(x * 10) / 10;
  function pt(side, u, v) {
    const p = side === 0 ? [u, 7 - v] : side === 1 ? [93 + v, u] : side === 2 ? [100 - u, 93 + v] : [7 - v, 100 - u];
    return f2(p[0]) + ' ' + f2(p[1]);
  }
  function bodyPath(e) {
    let d = 'M' + pt(0, 15, 0);
    for (let k = 0; k < 4; k++) {
      if (e[k] === -1) d += ` L${pt(k, 39, 0)} L${pt(k, 39, -2)} A11 11 0 0 0 ${pt(k, 61, -2)} L${pt(k, 61, 0)}`;
      d += ` L${pt(k, 85, 0)} A8 8 0 0 1 ${pt((k + 1) % 4, 15, 0)}`;
    }
    return d + 'Z';
  }
  const tabPath = (k, len) => `M${pt(k, 40, -1)} L${pt(k, 40, len - 10)} A10 10 0 0 1 ${pt(k, 60, len - 10)} L${pt(k, 60, -1)}Z`;
  const arrowPath = (k, len) => `M${pt(k, 50, len - 2.5)} L${pt(k, 44, len - 10)} L${pt(k, 56, len - 10)}Z`;
  const crossPath = (k, len) => `M${pt(k, 46, len - 3)} L${pt(k, 54, len - 11)} M${pt(k, 54, len - 3)} L${pt(k, 46, len - 11)}`;
  // o: { d（derive の結果）, cell, lv, name（名前を出す）, mark }
  function pieceEl(card, o) {
    o = o || {};
    const def = R.B[card.type], e = R.edges(card.type, card.rot);
    const p = el('div', 'pc'); p.dataset.fam = def.fam; p.dataset.type = card.type; if (card.id != null) p.dataset.id = card.id;
    const X = o.d && o.cell != null ? o.d.blk[o.cell] : null;
    let svg = `<svg viewBox="0 0 100 100" aria-hidden="true"><path class="pc-body" d="${bodyPath(e)}"/>`;
    for (let k = 0; k < 4; k++) if (e[k] === 1) {
      const ln = X ? X.outs.find(l => l.side === k) : null, len = ln ? 24 : 14;
      svg += `<path class="pc-tab${ln ? (ln.ok ? ' on' : ' off') : ''}"${ln ? ` data-link="${ln.from}-${ln.to}" data-ok="${ln.ok ? 1 : 0}"` : ''} d="${tabPath(k, len)}"/>`;
      if (ln) svg += ln.ok ? `<path class="pc-arrow" d="${arrowPath(k, len)}"/>` : `<path class="pc-x" d="${crossPath(k, len)}"/>`;
    }
    svg += '</svg>';
    let h = svg + `<div class="pc-in"><span class="g">${def.g}</span>`;
    const sum = X ? R.summary(o.d, o.cell) : null;
    if (sum) { if (sum.main) h += `<span class="m" data-main="${sum.main}">${sum.main}</span>`; } else if (o.name !== false && def.name !== def.g) h += `<span class="n">${def.name}</span>`;
    h += '</div>';
    if (X && X.ord) h += `<span class="ord">${X.ord}</span>`;
    if (o.lv > 1) h += `<span class="lv" data-lv="${o.lv}">${'<i></i>'.repeat(o.lv)}</span>`; // レベルは点の数（字にすると、小さい札で ほかの字に重なった）
    if (o.mark) h += `<span class="mark ${o.mark[0]}" data-tip="${o.mark[0]}">${o.mark[1]}</span>`;
    p.innerHTML = h;
    if (sum && sum.idle) p.classList.add('idle');
    if (sum && sum.gives) p.classList.add('gives');
    if (o.sealed) p.classList.add('sealed');
    if (o.mark) p.classList.add('has-mark');
    return p;
  }
  function miniEl(card, lv, cls) { const m = el('div', 'mini' + (cls ? ' ' + cls : '')); m.appendChild(pieceEl(card, { lv, name: false })); return m; }

  const D = () => (G.busy ? G.pre : G.s); // いま画面に出す状態（演出中は発動前の写し）
  // ------------------------------------------------------------ ことばの説明（のせる・押すと出る）。文は rules.js の TERMS
  const TIP_RE = new RegExp(R.TERM_WORDS.map(w => w[0]).join('|'), 'g'), TIP_KEY = {}; for (const w of R.TERM_WORDS) TIP_KEY[w[0]] = w[1];
  // 文（タグの入っていない文）の中の ことばを、説明つきの印にする
  const tipify = text => String(text).replace(TIP_RE, m => `<span class="tip" data-tip="${TIP_KEY[m]}">${m}</span>`);
  let tipOn = null; // いま出している説明の もとの部品
  function showTip(elm) {
    const box = $('#tip');
    if (!elm) { if (tipOn) { tipOn = null; box.hidden = true; } return; }
    const key = elm.dataset.tip; if (elm === tipOn && box.dataset.key === key) return;
    const t = R.termText(key, G.s ? D() : null); if (!t) { tipOn = null; box.hidden = true; return; }
    tipOn = elm; box.dataset.key = key; box.innerHTML = `<b>${t.name}</b>${t.text}`; box.hidden = false;
    const r = elm.getBoundingClientRect(), w = box.offsetWidth, h = box.offsetHeight;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    const top = r.bottom + 6 + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6;
    box.style.left = left + 'px'; box.style.top = top + 'px';
  }
  const tipAt = target => showTip(target && target.closest ? target.closest('[data-tip]') : null);
  document.addEventListener('pointermove', ev => { if (!drag) tipAt(ev.target); });
  document.addEventListener('pointerdown', ev => tipAt(ev.target)); // 指で押したときも出す。ほかの所を押すと消える
  window.addEventListener('scroll', ev => { if (ev.target === document) showTip(null); }, true); // ページを動かしたら消す（きろくの中のスクロールでは消さない）
  const num = (k, real) => (G.view ? G.view[k] : real);
  const lvOf = type => R.lvOf(D() ? D().lv : (G.run ? G.run.lv : {}), type);

  // ------------------------------------------------------------ タイトル
  function previewOrder() { return R.newRun(G.seed, { rot: ROT }).order; }
  function renderTitle() {
    const rules = $('#title-rules'); rules.innerHTML = '';
    const RULES = [
      [{ type: 'amp', rot: 0 }, '凸 → 凹 に はまる', '凸のブロックが、凹のブロックに 能力を わたす。'],
      [{ type: 'poison', rot: 0 }, 'わたすと 自分は働かない', 'わたさない能力ブロックは、自分で1回（半分の力）。'],
      [{ type: 'slash', rot: 0 }, '受け取り方で 変わる', '攻撃は ヒットごと。防御は 敵のヒットごと。'],
      [{ type: 'shield', rot: 0 }, '先へは わたらない', '受け取ったものは、次のブロックへは行かない。'],
    ];
    for (const r of RULES) {
      const c = el('div', 'rule'); const rp = el('div', 'rp'); rp.appendChild(pieceEl(r[0], { name: false }));
      c.appendChild(rp); c.appendChild(el('div', 'rt2', `<b>${r[1]}</b>${r[2]}`)); rules.appendChild(c);
    }
    const box = $('#enemy-cards'); box.innerHTML = '';
    previewOrder().forEach((id, i) => {
      const e = R.ENEMIES[id];
      const c = el('button', 'ecard', `<div class="etop"><div class="eg">${e.g}</div><div><div class="eo">${i + 1}戦目</div><div class="en">${e.name}</div></div></div><div class="et">${tipify(e.trait)}</div><div class="ego">押すと 1戦だけ れんしゅう</div>`);
      c.addEventListener('click', () => startOne(id, 0));
      box.appendChild(c);
    });
  }
  function showTitle() {
    G.s = null; G.run = null; G.busy = false; G.sel = null;
    $('#battle').hidden = true; $('#title-screen').hidden = false; $('#sheet').hidden = true; $('#help').hidden = true;
    $('#btn-quit').hidden = true; $('#turn-label').textContent = ''; $('#route').innerHTML = '';
    renderTitle();
  }
  function startRun() {
    G.mode = 'run'; G.run = R.newRun(G.seed, { rot: ROT }); G.s = G.run.fight; enterBattle();
  }
  function startOne(id, stage) {
    G.mode = 'one'; G.run = null;
    G.s = R.newFight({ enemyId: id, stage: stage || 0, seed: G.seed, rot: ROT, hp: Q.has('hp') ? Math.max(1, +Q.get('hp') | 0) : 0 }); enterBattle(); // ?hp=数 … 検査用
  }
  function enterBattle() {
    G.sel = null; G.busy = false; G.view = null; G.pre = null; G.turnSum = { e: 0, p: 0 }; G.hoverId = null;
    $('#title-screen').hidden = true; $('#battle').hidden = false; $('#sheet').hidden = true; $('#btn-quit').hidden = false;
    $('#btn-rot').hidden = !ROT;
    $('#log').innerHTML = ''; $('#enemy-dmg').innerHTML = ''; $('#player-dmg').innerHTML = '';
    const e = R.ENEMIES[G.s.enemyId];
    $('#enemy-glyph').textContent = e.g; $('#enemy-name').textContent = e.name; $('#enemy-trait').innerHTML = tipify(e.trait);
    log('lt', `${G.mode === 'run' ? (G.s.stage + 1) + '戦目 ' : ''}${e.name}　ターン 1`);
    CHECK.fights++;
    renderAll();
  }

  // ------------------------------------------------------------ 戦闘の画面
  function log(cls, text) { const l = $('#log'); l.appendChild(el('div', cls, text)); l.scrollTop = l.scrollHeight; }
  function chip(cls, text, tip) { return `<span class="chip ${cls}"${tip ? ` data-tip="${tip}"` : ''}>${text}</span>`; }
  function renderTop() {
    const s = D();
    $('#turn-label').textContent = (G.mode === 'run' ? `${s.stage + 1}戦目 ／ ` : 'れんしゅう ／ ') + `ターン ${s.turn}`;
    const r = $('#route'); r.innerHTML = '';
    if (G.run) G.run.order.forEach((id, i) => { const c = el('span', 'rt' + (i < G.run.stage ? ' done' : i === G.run.stage ? ' now' : ''), R.ENEMIES[id].g); c.title = `${i + 1}戦目 ${R.ENEMIES[id].name}`; r.appendChild(c); });
  }
  function renderEnemy() {
    const s = D(), e = s.e, hp = num('eh', Math.max(0, e.hp)), es = G.view ? G.view.es : [e.poison, e.fire, e.ice, e.shock, e.guard, e.frozen];
    $('#enemy-fill').style.width = (hp / e.max * 100) + '%'; $('#enemy-hp').textContent = `${hp} / ${e.max}`;
    let h = '';
    if (es[0]) h += chip('poison', `毒 ${es[0]}`, 'poison'); if (es[1]) h += chip('fire', `炎 ${es[1]}`, 'fire');
    if (es[2]) h += chip('ice', `氷 ${es[2]}/${R.FREEZE_AT}`, 'ice'); if (es[3]) h += chip('shock', `雷 ${es[3]}/${R.SHOCK_AT}`, 'shock');
    if (es[5]) h += chip('ice', '凍結', 'frozen'); if (es[4]) h += chip('guard', `結界 ${es[4]}`, 'guard');
    $('#enemy-status').innerHTML = h || chip('none', '状態なし');
  }
  function renderIntent() {
    const it = D().intent; if (!it) return;
    $('#intent-label').innerHTML = it.label + (it.rage ? '<span class="rage tip" data-tip="rage">怒り</span>' : '');
    $('#intent-lines').innerHTML = R.intentLines(it).map(l => `<li class="${l.k}">${tipify(l.text)}</li>`).join('');
  }
  function renderPlayer() {
    const s = D(), p = s.p, hp = num('ph', Math.max(0, p.hp));
    $('#player-fill').style.width = (hp / p.max * 100) + '%'; $('#player-hp').textContent = `${hp} / ${p.max}`;
    const sh = num('sh', p.shield), cu = num('pc', p.curse), ch = num('ch', p.charge);
    let h = '';
    if (sh) h += chip('shield', `シールド ${sh}`, 'shield'); if (cu) h += chip('curse', `呪い ${cu}`, 'curse'); if (ch) h += chip('charge', `たまり ${ch}`, 'charge');
    $('#player-status').innerHTML = h || chip('none', '状態なし');
  }
  const cellEl = i => $(`#board .cell[data-cell="${i}"]`);
  function renderBoard() {
    const s = D(), board = $('#board'); board.innerHTML = '';
    const d = G.busy ? G.preD : R.derive(s);
    const it = s.intent, nextRub = !G.busy && it && it.parts.some(p => p.k === 'rubble') ? it.cells.rubble : [];
    const dn = it ? it.parts.filter(p => p.k === 'destroy').reduce((a, p) => a + p.n, 0) : 0;
    const aimed = dn ? R.destroyTargets(d, dn) : [];
    for (let i = 0; i < R.N; i++) {
      const c = el('div', 'cell'); c.dataset.cell = i;
      const id = s.board[i];
      if (s.blocked.indexOf(i) >= 0) { c.classList.add('blocked'); const tg = el('span', 'tag', 'がれき'); tg.dataset.tip = 'rubble'; c.appendChild(tg); }
      else if (id == null && nextRub.indexOf(i) >= 0) { c.classList.add('next-rubble'); const tg = el('span', 'tag', '次 がれき'); tg.dataset.tip = 'rubbleNext'; c.appendChild(tg); }
      if (id != null && !G.gone[id]) {
        const card = s.cards[id], sealed = s.sealed.indexOf(id) >= 0;
        const p = pieceEl(card, { d, cell: i, lv: lvOf(card.type), sealed, mark: sealed ? ['seal', '封印'] : aimed.indexOf(i) >= 0 ? ['destroy', '破壊'] : null });
        if (G.sel === id) p.classList.add('sel');
        c.appendChild(p);
      } else if (!G.busy && s.blocked.indexOf(i) < 0) c.classList.add('can');
      board.appendChild(c);
    }
    return d;
  }
  function renderHand() {
    const s = D(), hand = $('#hand'); hand.innerHTML = '';
    hand.style.setProperty('--hn', Math.max(R.HAND, s.hand.length));
    hand.classList.toggle('can', !G.busy && G.sel != null && R.cellOf(s, G.sel) >= 0);
    for (const id of s.hand) {
      const slot = el('div', 'slot'); slot.dataset.slot = id;
      if (s.board.indexOf(id) < 0 && !G.gone[id]) {
        const card = s.cards[id], sealed = s.sealed.indexOf(id) >= 0;
        const p = pieceEl(card, { lv: lvOf(card.type), sealed, mark: sealed ? ['seal', '封印'] : null });
        if (G.sel === id) p.classList.add('sel');
        slot.appendChild(p);
      }
      hand.appendChild(slot);
    }
  }
  let lastF = null;
  function renderForecast() {
    const s = G.s, box = $('#forecast');
    if (G.busy) { box.innerHTML = '<div class="f1">発動中…</div>'; return; }
    const f = lastF = R.forecast(s); if (!f) { box.innerHTML = ''; return; }
    let h = `<div class="f1">いま発動すると（予想）</div><div><span class="deal">与える <b id="fc-deal">${f.dealt}</b></span>　<span class="take">受ける <b id="fc-take">${f.taken}</b></span></div>`;
    h += `<div class="sub">敵HP ${Math.max(0, s.e.hp)} → ${f.eHp} ／ あなた ${s.p.hp} → ${f.pHp}</div>`;
    if (f.won) h += '<div class="big">この発動で 倒せる！</div>';
    else if (f.lost) h += '<div class="delta bad">このままだと 負ける</div>';
    h += '<div id="fc-pre" class="sub"></div>';
    box.innerHTML = h;
  }
  // えらんだブロックを そのマスに置いたら、予想がどう変わるか
  function previewAt(cell) {
    const p = $('#fc-pre'); if (!p) return;
    if (G.sel == null || cell < 0 || !lastF) { p.textContent = ''; return; }
    const c = R.cloneState(G.s); if (!R.put(c, G.sel, cell)) { p.textContent = ''; return; }
    const f = R.forecast(c), a = f.dealt - lastF.dealt, b = f.taken - lastF.taken;
    const sg = x => (x > 0 ? '+' + x : x < 0 ? '−' + (-x) : '±0');
    p.innerHTML = `ここに置くと：与える <span class="delta${a < 0 ? ' bad' : ''}">${sg(a)}</span>　受ける <span class="delta${b > 0 ? ' bad' : ''}">${sg(b)}</span>`;
  }
  function renderDetail() {
    const s = D(), box = $('#detail'), id = G.hoverId != null ? G.hoverId : G.sel;
    if (id == null || !s.cards[id]) {
      box.innerHTML = '<p class="sub">ブロックに カーソルをのせると（スマホは押すと）、説明が出る。</p>' +
        ['atk', 'def', 'abil', 'enh'].map(f => `<p><span class="fam" style="background:${FAM_COLOR[f]}">${R.FAMS[f]}</span> ${R.FAM_HINT[f]}</p>`).join('');
      return;
    }
    const card = s.cards[id], def = R.B[card.type], lv = lvOf(card.type), cell = s.board.indexOf(id);
    let h = `<h3>${def.name}${lv > 1 ? ` Lv${lv}` : ''} <span class="fam" style="background:${FAM_COLOR[def.fam]}">${R.FAMS[def.fam]}</span></h3><p>${tipify(R.blockText(card.type, lv))}</p>`;
    if (def.kw) h += `<p class="kw"><b>${R.KW[def.kw].name}</b>：${R.KW[def.kw].text}</p>`;
    h += `<p class="sub">${R.FAM_HINT[def.fam]}</p>`;
    if (cell >= 0) {
      const sum = R.summary(G.busy ? G.preD : R.derive(s), cell);
      h += `<p class="${sum.idle ? 'warn' : 'now'}">いま：</p><ul>${sum.lines.map(l => `<li>${tipify(l)}</li>`).join('')}</ul>`;
    } else if (s.sealed.indexOf(id) >= 0) h += '<p class="warn">封印：このターン、凸も凹も はまらない。</p>';
    box.innerHTML = h;
  }
  function renderGuide() {
    const s = G.s; let t;
    if (G.busy) t = '発動中…';
    else if (G.sel != null) t = '置くマスを押す。黄色いマスは「はまる」所（数字は はまる数）。';
    else if (s.board.every(x => x == null)) t = '手札のブロックを 盤面に置こう（ドラッグ。または、えらんでからマスを押す）。';
    else t = '組めたら「発動！」。置き方は、発動するまで何回でも変えられる。';
    $('#guide').textContent = t;
  }
  function renderDeckBtn() {
    const s = D(); $('#btn-deck').textContent = `山札 ${s.deck.length} ／ 捨て札 ${s.discard.length}` + (s.gone.length ? ` ／ 破壊 ${s.gone.length}` : '') + '　（見る）';
  }
  // えらんだブロックが はまるマスに、印と数を出す
  function markSpots() {
    document.querySelectorAll('#board .lk-spot').forEach(x => x.remove());
    document.querySelectorAll('#board .cell.lk-good').forEach(x => x.classList.remove('lk-good'));
    if (G.busy || G.sel == null) return;
    const s = G.s, from = R.cellOf(s, G.sel);
    for (let i = 0; i < R.N; i++) {
      if (i === from) continue;
      const ls = R.linksIfPut(s, G.sel, i); if (!ls) continue;
      const n = ls.filter(l => l.ok).length; if (!n) continue;
      if (s.board[i] != null) continue; // 札のあるマス（入れかえ）には印を出さない（札のすきまから色が見えて、まぎらわしかった）
      const c = cellEl(i); c.classList.add('lk-good'); c.dataset.spot = n;
      c.appendChild(el('div', 'lk-spot', String(n)));
    }
  }
  function renderAll() {
    renderTop(); renderEnemy(); renderIntent(); renderPlayer(); renderBoard(); renderHand(); renderForecast(); renderDetail(); renderGuide(); renderDeckBtn(); markSpots();
    const end = $('#btn-end'); end.disabled = G.busy; end.classList.toggle('ready', !G.busy && G.s.board.some(x => x != null));
    $('#btn-clear').disabled = G.busy || G.s.board.every(x => x == null);
    $('#btn-rot').disabled = G.busy || G.sel == null;
  }

  // ------------------------------------------------------------ 操作（置き方は、発動するまで何回でも変えられる）
  function uiSelect(id) { if (G.busy) return; G.sel = G.sel === id ? null : id; renderAll(); }
  function uiPut(id, cell) {
    if (G.busy) return false;
    const before = R.derive(G.s).links.filter(l => l.ok).length;
    if (!R.put(G.s, id, cell)) { sfx('bad'); return false; }
    G.sel = null; G.hoverCell = -1;
    renderAll();
    sfx(R.derive(G.s).links.filter(l => l.ok).length > before ? 'link' : 'place');
    const p = cellEl(cell).querySelector('.pc'); if (p) p.classList.add('fx-new');
    return true;
  }
  function uiTake(id) { if (G.busy || !R.take(G.s, id)) return false; G.sel = null; renderAll(); return true; }
  function uiClear() { if (G.busy) return; R.clearBoard(G.s); G.sel = null; renderAll(); }
  function uiRotate() { if (G.busy || G.sel == null) return; if (R.rotate(G.s, G.sel)) renderAll(); }
  function clickPiece(id) {
    if (G.busy) return;
    const cell = R.cellOf(G.s, id);
    if (G.sel != null && G.sel !== id && cell >= 0) uiPut(G.sel, cell); // 盤面のブロックを押した：そこへ置く（入れかえ）
    else uiSelect(id);
  }
  // ドラッグ（マウスでも指でも）
  let drag = null;
  document.addEventListener('pointerdown', ev => {
    if (G.busy || !G.s || ev.button > 0) return;
    const p = ev.target.closest && ev.target.closest('#board .pc, #hand .pc'); if (!p) return;
    drag = { id: +p.dataset.id, x: ev.clientX, y: ev.clientY, on: false, el: p };
  });
  document.addEventListener('pointermove', ev => {
    if (!drag) return;
    if (!drag.on) {
      if (Math.abs(ev.clientX - drag.x) + Math.abs(ev.clientY - drag.y) < 8) return;
      drag.on = true; G.sel = drag.id; renderAll();
      const g = $('#drag-ghost'); g.innerHTML = ''; g.appendChild(pieceEl(G.s.cards[drag.id], { lv: lvOf(G.s.cards[drag.id].type) })); g.hidden = false;
      const src = document.querySelector(`#board .pc[data-id="${drag.id}"], #hand .pc[data-id="${drag.id}"]`); if (src) src.classList.add('dragging');
    }
    const g = $('#drag-ghost'); g.style.left = ev.clientX + 'px'; g.style.top = ev.clientY + 'px';
    const t = document.elementFromPoint(ev.clientX, ev.clientY), c = t && t.closest ? t.closest('#board .cell') : null;
    setHoverCell(c ? +c.dataset.cell : -1);
  });
  function setHoverCell(i) {
    if (i === G.hoverCell) return;
    document.querySelectorAll('#board .cell.hov').forEach(x => x.classList.remove('hov'));
    G.hoverCell = i; if (i >= 0 && G.sel != null) cellEl(i).classList.add('hov');
    previewAt(i);
  }
  document.addEventListener('pointerup', ev => {
    if (!drag) return;
    const dg = drag; drag = null; $('#drag-ghost').hidden = true;
    if (!dg.on) return; // 動かしていなければ、クリックとして下で処理する
    dg.suppress = true; lastDragEnd = Date.now();
    const t = document.elementFromPoint(ev.clientX, ev.clientY);
    const c = t && t.closest ? t.closest('#board .cell') : null, h = t && t.closest ? t.closest('#hand-wrap') : null;
    if (c) { if (!uiPut(dg.id, +c.dataset.cell)) { G.sel = null; renderAll(); } }
    else if (h && R.cellOf(G.s, dg.id) >= 0) uiTake(dg.id);
    else { G.sel = null; renderAll(); }
  });
  document.addEventListener('pointercancel', () => { if (drag) { drag = null; $('#drag-ghost').hidden = true; G.sel = null; if (G.s && !G.busy) renderAll(); } });
  let lastDragEnd = 0;
  $('#board').addEventListener('click', ev => {
    if (G.busy || Date.now() - lastDragEnd < 250) return;
    const p = ev.target.closest('.pc'); if (p) { clickPiece(+p.dataset.id); return; }
    const c = ev.target.closest('.cell'); if (c && G.sel != null) uiPut(G.sel, +c.dataset.cell);
  });
  $('#hand-wrap').addEventListener('click', ev => {
    if (G.busy || Date.now() - lastDragEnd < 250) return;
    const p = ev.target.closest('.pc'); if (p) { clickPiece(+p.dataset.id); return; }
    if (G.sel != null && R.cellOf(G.s, G.sel) >= 0) uiTake(G.sel); // 盤面のブロックをえらんで手札の所を押す：もどす
  });
  // のせたら説明、マスにのせたら予想の変化
  document.addEventListener('pointerover', ev => {
    if (!G.s || drag) return;
    const p = ev.target.closest && ev.target.closest('#board .pc, #hand .pc');
    const id = p ? +p.dataset.id : null;
    if (id !== G.hoverId) { G.hoverId = id; renderDetail(); }
    const c = ev.target.closest && ev.target.closest('#board .cell');
    if (!G.busy) setHoverCell(c ? +c.dataset.cell : -1);
  });
  $('#btn-end').addEventListener('click', () => doEnd());
  $('#btn-clear').addEventListener('click', uiClear);
  $('#btn-rot').addEventListener('click', uiRotate);
  $('#btn-quit').addEventListener('click', showTitle);
  $('#btn-start').addEventListener('click', startRun);
  $('#btn-reroll').addEventListener('click', () => { G.seed = (G.seed * 7 + 13) % 90000 + 1; renderTitle(); });
  $('#btn-help').addEventListener('click', showHelp);
  $('#btn-deck').addEventListener('click', showDeck);
  $('#speed').addEventListener('change', e => { G.speed = +e.target.value; });
  $('#vol').addEventListener('input', e => { vol = +e.target.value / 100; });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { $('#help').hidden = true; if (G.s && !G.busy && $('#sheet').dataset.kind === 'deck') $('#sheet').hidden = true; if (G.s && !G.busy) { G.sel = null; renderAll(); } }
    if ((e.key === 'r' || e.key === 'R') && ROT) uiRotate();
  });
  window.addEventListener('resize', () => { if (G.s && !$('#battle').hidden) renderAll(); });
  if (Q.has('speed')) { const o = [...$('#speed').options].find(x => +x.value === G.speed); if (o) $('#speed').value = o.value; }

  // ------------------------------------------------------------ 発動（出来事ログを順に再生する）
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function fxCell(c) { const p = cellEl(c) && cellEl(c).querySelector('.pc'); if (p) { p.classList.remove('fx-fire'); void p.offsetWidth; p.classList.add('fx-fire'); } }
  function slot(sel, text, sum, cls) {
    $(sel).innerHTML = `<span class="last fx-pop${cls ? ' ' + cls : ''}">${text}</span>` + (sum ? `<span class="sum">${sum}</span>` : '');
  }
  const nameAt = c => R.B[G.pre.cards[G.pre.board[c]].type].name;
  function show(e) {
    G.view = { eh: e.eh, ph: e.ph, sh: e.sh, es: e.es, pc: e.pc, ch: e.ch };
    renderEnemy(); renderPlayer();
    switch (e.t) {
      case 'shield': e.cells.forEach(fxCell); log('lp', `盾：シールド+${e.add}`); sfx('place'); return 240;
      case 'fire': fxCell(e.cell); if (e.mode === 'counter') log('lp', `反撃：${nameAt(e.cell)}`); return 110;
      case 'solo': fxCell(e.cell); return 110;
      case 'hit': {
        const nm = e.kind === 'chase' ? '追撃' : nameAt(e.cell);
        if (e.dodged) { slot('#enemy-dmg', 'よけられた', `合計 ${G.turnSum.e}`); log('lp', `${nm}：よけられた`); sfx('bad'); return 200; }
        G.turnSum.e += e.dmg;
        slot('#enemy-dmg', `−${e.dmg}`, `合計 ${G.turnSum.e}`);
        const ex = []; if (e.charge) ex.push(`たまり+${e.charge}`); if (e.fire) ex.push(`炎+${e.fire}`); if (e.armorCut) ex.push(`装甲−${e.armorCut}`); if (e.guardCut) ex.push(`結界−${e.guardCut}`); if (e.heal) ex.push(`HP+${e.heal}`);
        log('lp', `${nm}：${e.dmg}ダメージ` + (ex.length ? `（${ex.join('、')}）` : ''));
        const pt2 = $('#enemy-portrait'); pt2.classList.remove('fx-hit'); void pt2.offsetWidth; pt2.classList.add('fx-hit');
        sfx('hit', e.dmg); return 230;
      }
      case 'gift': {
        fxCell(e.cell);
        const nm = { poison: '毒', fire: '炎', ice: '氷', shock: '雷', regen: 'HP', charge: 'たまり' }[e.kind];
        if (e.kind === 'regen') { if (e.n > 0) slot('#player-dmg', `+${e.n}`, '回復', 'heal'); else return 60; } // HPが満タンのときは、きろくに書かない
        log('lp', `${R.B[e.kind].name}：${nm}+${e.n}`); return 130;
      }
      case 'consume': fxCell(e.cell); G.turnSum.e += e.dmg; slot('#enemy-dmg', `−${e.dmg}`, `毒${e.n}を消費`); log('lp', `毒消費：毒${e.n}を消して ${e.dmg}ダメージ`); sfx('big'); return 300;
      case 'shock': G.turnSum.e += e.dmg; slot('#enemy-dmg', `−${e.dmg}`, '感電！ 次は1個多く引く'); log('lp', `感電：${e.dmg}ダメージ。次のターン 1個多く引く`); sfx('big'); return 320;
      case 'freeze': slot('#enemy-dmg', '凍結！', '敵の攻撃が半分'); log('lp', '凍結：このターンの敵の攻撃が半分'); sfx('big'); return 300;
      case 'thorn': if (e.dmg > 0) { G.turnSum.p += e.dmg; slot('#player-dmg', `−${e.dmg}`, 'トゲ'); } return 60;
      case 'eact': G.lastAct = e.label; $('#intent-box').classList.add('fx-act'); log('le', `敵：${e.label}`); return 320;
      case 'ehit': {
        if (e.dodged) { e.cells.forEach(fxCell); slot('#player-dmg', 'よけた', ''); log('le', `　攻撃${e.raw} → よけた`); return 240; }
        G.turnSum.p += e.dmg;
        const cut = []; if (e.ice) cut.push(`凍結−${e.ice}`); if (e.tough) cut.push(`堅牢−${e.tough}`); if (e.shield) cut.push(`シールド−${e.shield}`);
        slot('#player-dmg', `−${e.dmg}`, cut.length ? `防いだ ${e.ice + e.tough + e.shield}` : ''); // くわしい内訳は「きろく」に出す（ここに全部書くと、せまい列で切れた）
        log('le', `　攻撃${e.raw} → ${e.dmg}ダメージ` + (cut.length ? `（${cut.join('、')}）` : '')); sfx('ehit'); return 250;
      }
      case 'reflect': e.cells.forEach(fxCell); G.turnSum.e += e.dmg; slot('#enemy-dmg', `−${e.dmg}`, '反射'); log('lp', `反射：${e.dmg}ダメージ`); return 240;
      case 'pheal': slot('#player-dmg', `+${e.n}`, '吸収', 'heal'); log('lp', `吸収：HP+${e.n}`); return 160;
      case 'guard': log('le', `　結界 ${e.n}`); return 200;
      case 'seal': log('le', `　封印：次のターン、手札の${e.n}個が はまらない`); return 260;
      case 'destroy':
        for (const c of e.cells) { const p = cellEl(c) && cellEl(c).querySelector('.pc'); if (p) p.classList.add('fx-break'); }
        log('le', e.cells.length ? `　破壊：${e.cells.map(nameAt).join('、')} が この戦いから消えた` : '　破壊：はまっているブロックがなく、何も こわれなかった'); sfx('bad'); return 520;
      case 'rubble': log('le', `　がれき：次のターン、${e.cells.length}マスに置けない`); return 260;
      case 'cleanse': log('le', '　脱皮：毒・炎・氷・雷が消えた'); return 260;
      case 'cursed': log('le', `　呪い+${e.n}`); return 200;
      case 'tick': G.turnSum.e += e.dmg; slot('#enemy-dmg', `−${e.dmg}`, '毒'); log('lp', `毒：${e.dmg}ダメージ`); return 240;
      case 'curse': G.turnSum.p += e.dmg; slot('#player-dmg', `−${e.dmg}`, '呪い'); log('le', `呪い：${e.dmg}ダメージ`); return 240;
      case 'eregen': log('le', `敵の再生：HP+${e.n}`); return 160;
      case 'won': sfx('win'); return 500;
      case 'lost': sfx('lose'); return 500;
      default: return 0;
    }
  }
  async function doEnd() {
    if (G.busy || !G.s || G.s.phase !== 'place') return;
    const s = G.s, f = R.forecast(s), turn = s.turn, e0 = s.stats.total, p0 = s.stats.taken;
    G.sel = null; G.pre = R.cloneState(s); G.preD = R.derive(G.pre); G.gone = {}; G.lastAct = null; // 負けの画面に出す「さいごの敵の行動」。敵が本当に動いたとき（eact）にだけ入る
    const ev = R.endTurn(s);
    G.busy = true; G.turnSum = { e: 0, p: 0 }; G.view = { eh: G.pre.e.hp, ph: G.pre.p.hp, sh: G.pre.p.shield, es: [G.pre.e.poison, G.pre.e.fire, G.pre.e.ice, G.pre.e.shock, G.pre.e.guard, G.pre.e.frozen], pc: G.pre.p.curse, ch: G.pre.p.charge };
    renderAll();
    for (const e of ev) { const ms = show(e); if (G.speed > 0 && ms) await sleep(ms / G.speed); }
    $('#intent-box').classList.remove('fx-act');
    // 検査：予想と結果、演出の合計と計算
    CHECK.turns++;
    if (f.dealt !== s.stats.total - e0 || f.taken !== s.stats.taken - p0) miss(`予想と結果がちがう T${turn}: 予想 ${f.dealt}/${f.taken} 結果 ${s.stats.total - e0}/${s.stats.taken - p0}`);
    if (G.turnSum.e !== s.stats.total - e0) miss(`演出の合計（与える）がちがう T${turn}: ${G.turnSum.e} / ${s.stats.total - e0}`);
    if (G.turnSum.p !== s.stats.taken - p0) miss(`演出の合計（受ける）がちがう T${turn}: ${G.turnSum.p} / ${s.stats.taken - p0}`);
    G.busy = false; G.view = null; G.pre = null; G.preD = null; G.gone = {};
    if (s.phase === 'place') { log('lt', `ターン ${s.turn}`); renderAll(); checkNumbers(); if (s.sealed.length) log('le', `封印：手札の${s.sealed.length}個が はまらない`); }
    else { renderTop(); renderEnemy(); renderPlayer(); $('#guide').textContent = ''; $('#forecast').innerHTML = ''; checkNumbers(); fightEnd(); }
  }
  function checkNumbers() { // 画面の数字が、計算と同じか
    const s = G.s;
    if ($('#enemy-hp').textContent !== `${Math.max(0, s.e.hp)} / ${s.e.max}`) miss(`敵HPの表示 ${$('#enemy-hp').textContent} / 計算 ${s.e.hp}`);
    if ($('#player-hp').textContent !== `${Math.max(0, s.p.hp)} / ${s.p.max}`) miss(`自分HPの表示 ${$('#player-hp').textContent} / 計算 ${s.p.hp}`);
  }

  // ------------------------------------------------------------ 戦いの終わり：ごほうび・はずす・結果
  function openSheet(kind, html) { const o = $('#sheet'); o.dataset.kind = kind; $('#sheet-body').innerHTML = html; o.hidden = false; CHECK.screens[kind] = (CHECK.screens[kind] || 0) + 1; return $('#sheet-body'); }
  function deckMinis(deck, lv, pick) {
    const box = el('div', 'minis');
    deck.map((c, i) => ({ c, i })).sort((a, b) => R.TYPES.indexOf(a.c.type) - R.TYPES.indexOf(b.c.type)).forEach(x => {
      const m = miniEl(x.c, R.lvOf(lv, x.c.type), pick ? 'pick' : ''); m.title = R.B[x.c.type].name; if (pick) m.addEventListener('click', () => pick(x.i));
      m.dataset.idx = x.i; box.appendChild(m);
    });
    return box;
  }
  function fightEnd() {
    const s = G.s;
    if (G.mode === 'one') { showResult(s.phase === 'won'); return; }
    R.finishFight(G.run);
    if (G.run.phase === 'reward') showReward(); else showResult(G.run.phase === 'won');
  }
  function showReward() {
    const run = G.run, next = R.ENEMIES[run.order[run.stage + 1]], rw = run.reward;
    const body = openSheet('reward', `<h2 class="res-win">勝った！　ごほうび（${rw.round}／${R.PICKS}）</h2>
      <p>HP +${run.healed} 回復（いま ${run.hp} / ${run.max}）。　次の敵：<b>${next.name}</b> — ${tipify(next.trait)}</p>
      <h3>3つから 1つ えらぶ</h3><div class="opts" id="opts"></div>
      <div class="row"><button class="btn" id="rw-skip">えらばない</button></div>
      <h3>いまのデッキ（${run.deck.length}個）</h3>`);
    rw.options.forEach((o, i) => {
      const def = R.B[o.type], cur = R.lvOf(run.lv, o.type);
      const c = el('button', 'opt'); c.dataset.opt = i;
      const top = el('div', 'otop'), op = el('div', 'op'); op.appendChild(pieceEl({ type: o.type, rot: o.up ? 0 : o.rot }, { lv: o.up ? o.lv : cur, name: false }));
      top.appendChild(op);
      const fit = o.up ? null : R.fitCount(run.deck, o);
      top.appendChild(el('div', '', `<div class="ok">${o.up ? `レベルアップ Lv${cur} → Lv${o.lv}` : '新しいブロック'}</div><div class="on">${def.name} <span class="fam" style="background:${FAM_COLOR[def.fam]}">${R.FAMS[def.fam]}</span></div>`));
      c.appendChild(top);
      c.appendChild(el('div', 'ot', tipify(R.blockText(o.type, o.up ? o.lv : cur))));
      if (def.kw) c.appendChild(el('div', 'os', `${R.KW[def.kw].name}：${R.KW[def.kw].text}`));
      c.appendChild(el('div', 'os', o.up ? `デッキの${def.name}（${run.deck.filter(k => k.type === o.type).length}個）が ぜんぶ強くなる。前：${R.blockText(o.type, cur)}`
        : def.fam === 'atk' || def.fam === 'def' ? `この凹に はまる凸：デッキに ${fit.take}個` : `この凸が はまる凹：デッキに ${fit.give}か所`));
      c.addEventListener('click', () => pickReward(i));
      body.querySelector('#opts').appendChild(c);
    });
    body.querySelector('#rw-skip').addEventListener('click', () => pickReward(-1));
    body.appendChild(deckMinis(run.deck, run.lv));
  }
  function pickReward(i) {
    R.pickReward(G.run, i); sfx('link');
    if (G.run.phase === 'reward') showReward(); else showRemove();
  }
  function showRemove() {
    const run = G.run;
    const body = openSheet('remove', `<h2>デッキから 1個 はずせる</h2><p>いらないブロックを押すと、デッキから なくなる（はずさなくてもよい）。少ないほど、ほしいブロックを引きやすい。</p>
      <div class="row"><button class="btn primary" id="rm-skip">はずさないで 次の戦いへ ▶</button></div><h3>いまのデッキ（${run.deck.length}個）</h3>`);
    body.appendChild(deckMinis(run.deck, run.lv, i => removeCard(i)));
    body.querySelector('#rm-skip').addEventListener('click', () => removeCard(-1));
  }
  function removeCard(i) { R.removeCard(G.run, i); G.s = G.run.fight; enterBattle(); }
  function showResult(won) {
    const s = G.s, run = G.run, e = R.ENEMIES[s.enemyId];
    const st = s.stats, keys = Object.keys(st.dealt).sort((a, b) => st.dealt[b] - st.dealt[a]), max = Math.max(1, ...keys.map(k => st.dealt[k]));
    let h = won ? `<h2 class="res-win">${run ? '5連戦 クリア！' : '勝ち！'}</h2>` : `<h2 class="res-lose">負け…</h2>`;
    h += `<p>${run ? `${s.stage + 1}戦目 ` : ''}${e.name}（${s.turn}ターン）。敵のHP ${Math.max(0, s.e.hp)} / ${s.e.max}、あなたのHP ${Math.max(0, s.p.hp)} / ${s.p.max}。</p>`;
    const last = G.lastAct ? `さいごの敵の行動：<b>${G.lastAct}</b>。` : '敵が動く前に負けた（こちらのヒットへの トゲ）。';
    if (!won) h += `<p id="rs-last">${last}この戦いで 受けたダメージ ${st.taken}、防いだダメージ ${st.blocked}。</p>`;
    h += `<h3>この戦いで 与えたダメージ（合計 ${st.total}）</h3><div class="brk">` + keys.map(k => `<span>${SRC_NAMES[k] || (R.B[k] ? R.B[k].name : k)}</span><span class="bb" style="width:${st.dealt[k] / max * 100}%"></span><span>${st.dealt[k]}</span>`).join('') + '</div>';
    h += `<div class="row"><button class="btn primary ready" id="rs-again">${run ? 'もう一度（相手の順を かえて）' : 'もう一度'}</button><button class="btn" id="rs-same">${run ? '同じ相手の順で もう一度' : '5連戦を はじめる'}</button><button class="btn" id="rs-title">タイトルへ</button></div>`;
    if (run) h += `<h3>さいごのデッキ（${run.deck.length}個）</h3>`;
    const body = openSheet(won ? 'win' : 'lose', h);
    if (run) body.appendChild(deckMinis(run.deck, run.lv));
    CHECK.result = { phase: won ? 'won' : 'lost', stage: s.stage, turn: s.turn, mode: G.mode, runPhase: run ? run.phase : '', lastAct: G.lastAct, lastText: won ? '' : body.querySelector('#rs-last').textContent };
    const enemyId = s.enemyId, stage = s.stage;
    body.querySelector('#rs-again').addEventListener('click', () => { G.seed = (G.seed * 7 + 13) % 90000 + 1; if (run) startRun(); else startOne(enemyId, stage); });
    body.querySelector('#rs-same').addEventListener('click', () => startRun());
    body.querySelector('#rs-title').addEventListener('click', showTitle);
  }

  // ------------------------------------------------------------ あそびかた・ブロック一覧／山札を見る
  function showHelp() {
    const lv = G.s ? G.s.lv : (G.run ? G.run.lv : {});
    let h = `<h2>あそびかた</h2>
      <p>1. 毎ターン、山札から <b>${R.HAND}個</b> 引く。敵の予告を見て、盤面に置く（置き方は、発動するまで何回でも変えられる）。</p>
      <p>2. <b>凸</b>が、となりのブロックの<b>凹</b>に向かい合うと「はまる」。能力は 凸 → 凹 に わたる。わたした側は、自分では働かない。わたさない能力ブロックは、自分で1回 働く（半分の力）。</p>
      <p>3. 受け取ったものは、次のブロックへは わたらない。</p>
      <p>4. 「発動！」の順番：① 防御 → ② 番号の順（左上から）に、攻撃と「自分で働く能力」→ ③ 敵の行動 → ④ ターンの終わり。シールドは、前のターンから残った分 → 左上の盾の分、の順に使う。</p>
      <p>5. ターンの終わりに、手札は全部 捨て札へ。山札がなくなったら、捨て札を切り直す。</p>
      <h3>4つの系統（色と形で分かる）</h3>` +
      ['atk', 'def', 'abil', 'enh'].map(f => `<p><span class="fam" style="background:${FAM_COLOR[f]}">${R.FAMS[f]}</span> ${R.FAM_HINT[f]}</p>`).join('') +
      `<h3>ことば</h3>` + Object.keys(R.KW).map(k => `<p class="kw"><b>${R.KW[k].name}</b>：${R.KW[k].text}</p>`).join('') +
      `<p class="kw"><b>封印</b>：そのブロックは、凸も凹も はまらない（自分では働く）。　<b>がれき</b>：そのマスに置けない。　<b>破壊</b>：いちばん多く はまっているブロックが、この戦いから消える（盤面に「破壊」の印が出る）。</p>
      <h3>ブロック一覧</h3><div class="cat" id="cat"></div><div class="row"><button class="btn primary" id="help-close">とじる</button></div>`;
    $('#help-sheet').innerHTML = h;
    const cat = $('#cat');
    for (const t of R.TYPES) {
      const d = R.B[t], l = R.lvOf(lv, t), ci = el('div', 'ci');
      ci.appendChild(miniEl({ type: t, rot: 0 }, l)); ci.appendChild(el('div', '', `<b>${d.name}</b>${l > 1 ? ` Lv${l}` : ''}　${R.blockText(t, l)}`)); cat.appendChild(ci);
    }
    $('#help-close').addEventListener('click', () => { $('#help').hidden = true; });
    $('#help').hidden = false; CHECK.screens.help = 1;
  }
  function showDeck() {
    if (!G.s || G.busy) return;
    const s = G.s, cards = ids => ids.map(id => s.cards[id]);
    const body = openSheet('deck', `<h2>山札と捨て札</h2><p>引く順は見えない（種類の順に ならべてある）。</p><h3>山札（${s.deck.length}個）</h3><div id="dk1"></div><h3>捨て札（${s.discard.length}個）</h3><div id="dk2"></div>` +
      (s.gone.length ? `<h3>破壊された（この戦いの間 なくなる。${s.gone.length}個）</h3><div id="dk3"></div>` : '') + '<div class="row"><button class="btn primary" id="dk-close">とじる</button></div>');
    body.querySelector('#dk1').appendChild(deckMinis(cards(s.deck), s.lv));
    body.querySelector('#dk2').appendChild(deckMinis(cards(s.discard), s.lv));
    if (s.gone.length) body.querySelector('#dk3').appendChild(deckMinis(cards(s.gone), s.lv));
    body.querySelector('#dk-close').addEventListener('click', () => { $('#sheet').hidden = true; });
  }

  // ------------------------------------------------------------ 文字の重なり・はみ出しの検査（確認用）
  window.__layoutCheck = function () {
    const out = { overlaps: 0, offscreen: 0, clipped: 0, pageScroll: Math.max(0, document.documentElement.scrollHeight - window.innerHeight), samples: [], textItems: 0, textChars: 0, textBy: {} };
    const items = [];
    const top = document.querySelector('.overlay:not([hidden])') || document.body;
    const w = document.createTreeWalker(top, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.nodeValue.trim()) continue;
      const p = n.parentElement; if (!p || p.closest('script,style,option,select,#drag-ghost,#tip')) continue;
      let vis = true, clip = null;
      for (let a = p; a && a !== document.body; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.3) { vis = false; break; }
        if (cs.overflowY !== 'visible' || cs.overflowX !== 'visible') { const r = a.getBoundingClientRect(); clip = clip ? { l: Math.max(clip.l, r.left), t: Math.max(clip.t, r.top), r: Math.min(clip.r, r.right), b: Math.min(clip.b, r.bottom) } : { l: r.left, t: r.top, r: r.right, b: r.bottom }; }
      }
      if (!vis) continue;
      const rg = document.createRange(); rg.selectNodeContents(n); let seen = false;
      for (const r of rg.getClientRects()) {
        if (r.width < 1 || r.height < 1) continue;
        let q = { l: r.left, t: r.top, r: r.right, b: r.bottom };
        if (clip) {
          const full = q; q = { l: Math.max(q.l, clip.l), t: Math.max(q.t, clip.t), r: Math.min(q.r, clip.r), b: Math.min(q.b, clip.b) };
          if (q.r - q.l < 1 || q.b - q.t < 1) continue; // 内側スクロールで見えていない行
          if ((full.r - full.l) - (q.r - q.l) > 2 && !p.closest('#log,#detail-box,.sheet')) { out.clipped++; if (out.samples.length < 8) out.samples.push('切れ: ' + n.nodeValue.trim().slice(0, 20)); }
        }
        if (q.l < -1 || q.r > window.innerWidth + 1) { out.offscreen++; if (out.samples.length < 8) out.samples.push('はみ出し: ' + n.nodeValue.trim().slice(0, 20)); }
        items.push({ q, p, text: n.nodeValue.trim().slice(0, 16) });
        if (!seen && q.t < window.innerHeight && q.b > 0) { seen = true; const c = n.nodeValue.replace(/\s/g, '').length, box = p.closest('.panel, #center, #top, .overlay'), id = box ? box.id : 'other'; out.textItems++; out.textChars += c; out.textBy[id] = (out.textBy[id] || 0) + c; }
      }
    }
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j]; if (a.p === b.p || a.p.contains(b.p) || b.p.contains(a.p)) continue;
      const ox = Math.min(a.q.r, b.q.r) - Math.max(a.q.l, b.q.l), oy = Math.min(a.q.b, b.q.b) - Math.max(a.q.t, b.q.t);
      if (ox > 2 && oy > 2) { out.overlaps++; if (out.samples.length < 8) out.samples.push(`重なり: 「${a.text}」と「${b.text}」`); }
    }
    return out;
  };
  function sampleLayout() {
    const r = window.__layoutCheck(), L = CHECK.layout; L.samples++;
    L.overlaps += r.overlaps; L.offscreen += r.offscreen; L.clipped += r.clipped; L.pageScroll = Math.max(L.pageScroll, r.pageScroll);
    for (const s of r.samples) if (L.notes.length < 12 && L.notes.indexOf(s) < 0) L.notes.push(s);
  }

  // ------------------------------------------------------------ 自動プレイ（?auto=1）：ボットが画面の操作と同じ関数を通して遊ぶ
  function writeCheck() { // 検査の結果をページに書き出す（check.js が読む）
    let p = document.getElementById('check-out'); if (!p) { p = el('pre'); p.id = 'check-out'; p.hidden = true; document.body.appendChild(p); }
    const lc = window.__layoutCheck();
    p.textContent = JSON.stringify(Object.assign({ w: window.innerWidth, h: window.innerHeight, turn: G.s ? G.s.turn : 0, screen: { items: lc.textItems, chars: lc.textChars, by: lc.textBy } }, CHECK));
  }
  let autoSeed = 12345; const autoRand = () => { autoSeed = (autoSeed * 1103515245 + 12345) & 0x7fffffff; return autoSeed / 0x7fffffff; };
  // 盤面の絵（はまっている凸・効く効かない・番号・札の字・働いていない印）が、計算と同じか
  function checkBoardDisplay() {
    const s = G.s, d = R.derive(s);
    const want = d.links.map(l => `${l.from}-${l.to}:${l.ok ? 1 : 0}`).sort().join(' ');
    const got = [...document.querySelectorAll('#board .pc-tab[data-link]')].map(t => `${t.dataset.link}:${t.dataset.ok}`).sort().join(' ');
    if (want !== got) miss(`はまっている凸 画面[${got}] 計算[${want}]`);
    for (const c of d.cells) {
      const p = cellEl(c).querySelector('.pc'), sum = R.summary(d, c);
      if (!p) { miss(`札が出ていない（マス${c}）`); continue; }
      const ord = p.querySelector('.ord'), m = p.querySelector('.m');
      if ((ord ? +ord.textContent : 0) !== d.blk[c].ord) miss(`番号がちがう（マス${c}）`);
      if ((m ? m.textContent : '') !== sum.main) miss(`札の字がちがう（マス${c}）${m ? m.textContent : ''} / ${sum.main}`);
      if (p.classList.contains('idle') !== sum.idle) miss(`働いていない印がちがう（マス${c}）`);
    }
    const f = R.forecast(s);
    if (+$('#fc-deal').textContent !== f.dealt || +$('#fc-take').textContent !== f.taken) miss('予想の数字が計算とちがう');
    CHECK.linkChecks++;
    checkTips();
  }
  // 説明つきの印が、どれも rules.js の ことば か。1つ えらんで出してみて、文が同じか・画面の中に収まるか
  function checkTips(all1) { // all1 … 見えている ことば を全部 出す（決まった場面用）。ふだんは1つずつ
    const all = [...document.querySelectorAll('[data-tip]')].filter(x => x.getClientRects().length);
    for (const x of all) if (!R.TERMS[x.dataset.tip]) miss(`説明のない ことば: ${x.dataset.tip}`);
    // 出してみるのは、いま画面に見えている ことば だけ（スマホでは、下にかくれた ことば には のせられない）
    const els = all.filter(x => { const q = x.getBoundingClientRect(); return q.top >= 0 && q.bottom <= window.innerHeight && q.left >= 0 && q.right <= window.innerWidth; });
    if (!els.length) return;
    for (const x of (all1 ? els : [els[CHECK.tipChecks % els.length]])) {
      const want = R.termText(x.dataset.tip, D());
      showTip(x);
      const box = $('#tip'), r = box.getBoundingClientRect();
      if (box.hidden || box.textContent !== want.name + want.text) miss(`説明の文がちがう（${x.dataset.tip}）`);
      if (r.left < 0 || r.top < 0 || r.right > window.innerWidth + 1 || r.bottom > window.innerHeight + 1) miss(`説明の箱が画面からはみ出す（${x.dataset.tip} ${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}）`);
      CHECK.tipChecks++; CHECK.tipSeen[x.dataset.tip] = 1;
    }
    if (SCREEN !== 'tip') showTip(null);
  }
  // 「はまるマスの数字」を1つ えらんで、本当に置いて、その数だけ はまるかを見る
  function checkSpot(id, cell) {
    uiSelect(id);
    const c = cellEl(cell), shown = c && c.classList.contains('lk-good') ? +c.dataset.spot : 0;
    uiPut(id, cell);
    const d = R.derive(G.s), real = d.links.filter(l => l.ok && (l.from === cell || l.to === cell)).length;
    if (shown !== real) miss(`はまる数の表示 ${shown} / 置いたあと ${real}（マス${cell}）`);
    CHECK.spotChecks++;
  }
  async function autoPlay() {
    const style = Q.get('bot') || 'smart', enemy = Q.get('enemy');
    await sleep(0);
    sampleLayout(); // タイトル
    if (SCREEN === 'title') { CHECK.stopped = true; writeCheck(); return; }
    if (enemy) startOne(enemy, +Q.get('stage') || 0); else startRun();
    let guard = 0;
    while (guard++ < 400) {
      const s = G.s;
      if (s.phase === 'place') {
        if (Q.get('scene') === 'terms') { // 決まった場面：状態と予告を直接つくって、ことばの説明を全部 出す（ふつうの戦いでは出にくい「たまり」「凍結」「次 がれき」など）
          Object.assign(s.e, { poison: 3, fire: 1, ice: 2, shock: 2, frozen: 1, guard: 5 }); Object.assign(s.p, { shield: 4, curse: 2, charge: 5 });
          s.sealed = [s.hand[0]]; s.blocked = [6];
          s.intent = { label: 'ことばの場面', rage: true, parts: [{ k: 'destroy', n: 1 }, { k: 'rubble', n: 2 }, { k: 'cleanse' }], cells: { rubble: [8, 13] } }; // 予告は3行まで（本物の戦いは2行まで。多すぎると左の列が あふれる）
          R.put(s, s.hand[0], 11); renderAll(); checkTips(true); sampleLayout();
          CHECK.stopped = true; writeCheck(); return;
        }
        let L = Bot.search(s, { style });
        if (Q.get('scene') === 'thorn') { // 決まった場面：攻撃ブロックを1個だけ置く（HP1 で狂戦士をなぐると、敵が動く前にトゲで負ける）
          const id = s.hand.find(x => R.B[s.cards[x].type].fam === 'atk'); L = { board: new Array(R.N).fill(null), rots: {} }; if (id != null) L.board[6] = id;
        }
        R.clearBoard(s); renderAll();
        for (let cell = 0; cell < R.N; cell++) {
          const id = L.board[cell]; if (id == null) continue;
          if (ROT && L.rots[id] != null) { let g = 0; while (s.cards[id].rot !== L.rots[id] && g++ < 4) R.rotate(s, id); }
          checkSpot(id, cell);
        }
        checkBoardDisplay(); sampleLayout();
        if (STOP && s.turn === STOP && CHECK.fights === 1) {
          if (Q.get('pick') === '1') { // 盤面のブロックを1個 手札にもどして、えらんだ画面にする
            const cells = R.derive(s).links.filter(l => l.ok).map(l => l.from); const id = cells.length ? s.board[cells[0]] : s.board.find(x => x != null);
            uiTake(id); uiSelect(id); CHECK.picked = { spots: document.querySelectorAll('#board .cell.lk-good').length }; sampleLayout();
          }
          if (SCREEN === 'help') { showHelp(); sampleLayout(); }
          if (SCREEN === 'deck') { showDeck(); sampleLayout(); }
          if (SCREEN === 'tip') { // ことばの説明を出した画面（写真用）。&tip=キー で どれを出すか
            const x = document.querySelector(`[data-tip="${Q.get('tip') || 'guard'}"]`); showTip(x);
            CHECK.tipShown = x ? { key: x.dataset.tip, text: $('#tip').textContent, hidden: $('#tip').hidden } : null;
          }
          CHECK.stopped = true; writeCheck(); return;
        }
        await doEnd();
        sampleLayout();
      }
      const k = $('#sheet').hidden ? '' : $('#sheet').dataset.kind;
      if (k === 'reward') {
        sampleLayout();
        if (SCREEN === 'reward') { CHECK.stopped = true; writeCheck(); return; }
        pickReward(Q.get('picks') === 'sim' ? Bot.simPick(G.run, {}) : (autoRand() * 3) | 0); // &picks=sim … ためしてから選ぶ（5戦目まで行く検査用）
      } else if (k === 'remove') {
        sampleLayout();
        if (SCREEN === 'remove') { CHECK.stopped = true; writeCheck(); return; }
        removeCard(Q.get('picks') === 'sim' ? Bot.simRemove(G.run, {}) : autoRand() < 0.5 ? -1 : (autoRand() * G.run.deck.length) | 0);
      } else if (k === 'win' || k === 'lose') { sampleLayout(); break; }
    }
    CHECK.done = true; writeCheck();
  }

  showTitle();
  if (Q.has('enemy') && !AUTO) startOne(Q.get('enemy'), +Q.get('stage') || 0);
  if (AUTO) autoPlay().catch(e => { CHECK.errors.push('auto: ' + (e && e.stack || e)); writeCheck(); });
})();
