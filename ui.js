'use strict';
/*
 * ui.js — 画面。ルールは rules.js にあり、ここは「見せる・クリックを受ける」だけ。
 * 発動の演出は、rules.js が返す出来事ログを順番に再生する。
 * URL: ?seed=数  ?enemy=golem|hunter|hydra|mage|berserk  ?auto=1（ボットが画面を通して遊ぶ・無音） ?mute=1 ?speed=0
 */
(function () {
  const R = window.Rules, Bot = window.BotCore;
  const $ = s => document.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const Q = new URLSearchParams(location.search);
  const AUTO = Q.get('auto') === '1';
  const MUTE = AUTO || Q.get('mute') === '1';
  const STOP = Q.has('stop') ? +Q.get('stop') : 0; // ?auto=1&stop=5 … 5ターン目で止める（画面の写真用）。&pick=1 … 止めたとき、つながる相手がいる棚の札を1つ選んだ画面にする
  const FAM_COLOR = { atk: 'var(--atk)', elem: 'var(--elem)', spec: 'var(--spec)', enh: 'var(--enh)', def: 'var(--def)', junk: 'var(--junk)' };
  const SRC_NAMES = { fire: '炎', chase: '追撃', consume: '毒消費', poison: '毒', shock: '感電', mirror: '反射' };

  const G = {
    s: null, pre: null, view: null, undo: [], sel: null, busy: false, hoverInfo: null, preview: null,
    speed: Q.has('speed') ? +Q.get('speed') : (AUTO ? 0 : 1), enemyId: null, seed: 0, turnSum: { e: 0, p: 0 }, lastBlow: null,
  };
  const CHECK = { turns: 0, mismatches: [], errors: [], done: false, result: null, layout: { samples: 0, overlaps: 0, offscreen: 0, clipped: 0, pageScroll: 0, notes: [] } };
  function sampleLayout() {
    const r = window.__layoutCheck(), L = CHECK.layout; L.samples++;
    L.overlaps += r.overlaps; L.offscreen += r.offscreen; L.clipped += r.clipped; L.pageScroll = Math.max(L.pageScroll, r.pageScroll);
    for (const s of r.samples) if (L.notes.length < 12 && L.notes.indexOf(s) < 0) L.notes.push(s);
  }
  window.__check = CHECK; window.__G = G;
  window.addEventListener('error', e => CHECK.errors.push(String(e.message)));

  // ------------------------------------------------------------ 音（小さめ。?auto / ?mute では鳴らさない）
  let AC = null; let vol = 0.25;
  function sfx(kind, n) {
    if (MUTE || vol <= 0) return;
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
      const P = { place: [520, 0.07, 'triangle'], hit: [300 + Math.min(12, n || 0) * 35, 0.06, 'square'], ehit: [120, 0.12, 'sawtooth'], big: [660, 0.2, 'triangle'], win: [880, 0.5, 'triangle'], lose: [90, 0.6, 'sawtooth'], bad: [200, 0.1, 'sine'] }[kind] || [440, 0.05, 'sine'];
      o.type = P[2]; o.frequency.setValueAtTime(P[0], t);
      if (kind === 'win') o.frequency.exponentialRampToValueAtTime(1320, t + 0.3);
      g.gain.setValueAtTime(vol * 0.25, t); g.gain.exponentialRampToValueAtTime(0.0001, t + P[1]);
      o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + P[1] + 0.02);
    } catch (e) { /* 音が出せない環境では何もしない */ }
  }

  // ------------------------------------------------------------ 部品
  function tileEl(type, lv, opt) {
    opt = opt || {};
    const d = R.B[type]; const t = el('div', 'tile');
    t.dataset.fam = d.fam; t.dataset.type = type;
    let h = `<span class="g">${d.g}</span><span class="n${opt.badge && !opt.sealed ? ' nb' : ''}">${opt.sealed ? `封印 あと${opt.sealed}` : (opt.badge || d.name)}</span>`;
    if (type !== 'rubble') h += `<span class="lv">${[1, 2, 3].map(i => `<i class="${i <= lv ? 'on' : ''}"></i>`).join('')}</span>`;
    if (opt.order) h += `<span class="ord">${opt.order}</span>`;
    t.innerHTML = h;
    if (opt.sealed) t.classList.add('sealed');
    if (opt.idle) t.classList.add('idle');
    return t;
  }
  const D = () => (G.busy ? G.pre : G.s); // いま画面に出す状態（演出中は発動前の写し）
  const num = (k, real) => (G.view ? G.view[k] : real);

  // ------------------------------------------------------------ 敵をえらぶ画面
  function renderTitle() {
    const box = $('#enemy-cards'); box.innerHTML = '';
    for (const id of R.ENEMY_IDS) {
      const e = R.ENEMIES[id];
      const c = el('button', 'ecard', `<div class="eg">${e.g}</div><div class="en">${e.name}</div><div class="eh">HP ${e.hp}</div><div class="et">${e.trait}</div><div class="ei">${e.hint}</div><div class="ego">この敵と戦う ▶</div>`);
      c.dataset.enemy = id;
      c.addEventListener('click', () => startGame(id));
      box.appendChild(c);
    }
  }
  function showTitle() {
    $('#battle').hidden = true; $('#title-screen').hidden = false; $('#result').hidden = true;
    $('#turn-label').textContent = ''; G.s = null;
  }
  function startGame(id, seed) {
    G.enemyId = id; G.seed = seed || (Q.has('seed') ? +Q.get('seed') : ((Date.now() % 100000) + 1));
    G.s = R.newGame(id, G.seed); G.undo = []; G.sel = null; G.busy = false; G.view = null; G.pre = null; G.preview = null; G.hoverInfo = null; G.lastBlow = null;
    $('#log').innerHTML = ''; $('#enemy-dmg').innerHTML = ''; $('#player-dmg').innerHTML = '';
    $('#title-screen').hidden = true; $('#battle').hidden = false; $('#result').hidden = true;
    buildBoard(); renderAll();
  }

  // ------------------------------------------------------------ 盤面
  function buildBoard() {
    const b = $('#board'); b.innerHTML = '';
    for (let i = 0; i < R.N; i++) { const c = el('div', 'cell'); c.dataset.cell = i; b.appendChild(c); }
  }
  function cellEl(i) { return $('#board').children[i]; }
  function renderBoard() {
    const s = D(); const d = R.derive(s.board); G.derived = d;
    const ord = {}; for (const a of d.atk) ord[a.cell] = a.order;
    const it = s.phase === 'place' ? s.intent : null;
    for (let i = 0; i < R.N; i++) {
      const c = cellEl(i), b = s.board[i];
      c.className = 'cell'; c.innerHTML = '';
      if (b) {
        const idle = R.isActive(b) && R.needsLink(b.type) && d.L[i].length === 0;
        let badge = '';
        if (b.type === 'charge') badge = `たまり${b.charge}`;
        if (b.type === 'dodge' && s.p.dodgeCd > 0) badge = `休み${s.p.dodgeCd}`;
        const t = tileEl(b.type, b.lv, { order: ord[i], badge: b.sealed ? '' : badge, sealed: b.sealed, idle });
        c.appendChild(t);
      }
      if (it) {
        if (it.cells.destroy.indexOf(i) >= 0) { c.classList.add('aim-destroy'); c.appendChild(el('div', 'aim', '✕ 破壊')); }
        else if (it.cells.seal.indexOf(i) >= 0) { c.classList.add('aim-seal'); c.appendChild(el('div', 'aim', '封印')); }
        else if (it.cells.rubble.indexOf(i) >= 0) { c.classList.add('aim-rubble'); c.appendChild(el('div', 'aim', '▼ がれき')); }
      }
      if (!G.busy && G.sel) {
        if (G.sel.src != null && R.placeKind(G.s, G.sel.src, i)) c.classList.add('can');
        if (G.sel.cell != null) { if (G.sel.cell === i) c.classList.add('sel'); else if (R.canSwap(G.s, G.sel.cell, i)) c.classList.add('can'); }
      }
    }
    drawLinks(d, s.board);
  }
  // つながりの線：となり合うマスのすきまに、短い太線を引く（計算と同じ links をそのまま描く）
  function jointXY(a, b) { // マス a と b のすきまに引く短い線の両はし
    const wrap = $('#board-wrap').getBoundingClientRect();
    const ra = cellEl(a).getBoundingClientRect(), rb = cellEl(b).getBoundingClientRect();
    const ax = ra.left + ra.width / 2 - wrap.left, ay = ra.top + ra.height / 2 - wrap.top;
    const bx = rb.left + rb.width / 2 - wrap.left, by = rb.top + rb.height / 2 - wrap.top;
    const mx = (ax + bx) / 2, my = (ay + by) / 2, len = Math.hypot(bx - ax, by - ay) || 1;
    const ux = (bx - ax) / len, uy = (by - ay) / len, L = Math.max(9, ra.width * 0.13);
    return `x1="${(mx - ux * L).toFixed(1)}" y1="${(my - uy * L).toFixed(1)}" x2="${(mx + ux * L).toFixed(1)}" y2="${(my + uy * L).toFixed(1)}"`;
  }
  function drawLinks(d, board) {
    const svg = $('#links'), wrap = $('#board-wrap').getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${wrap.width} ${wrap.height}`);
    let h = '';
    for (const [a, b] of d.links) {
      const xy = jointXY(a, b);
      const fa = R.B[board[a].type].fam, fb = R.B[board[b].type].fam;
      const col = FAM_COLOR[fa === 'atk' ? fb : (fb === 'atk' ? fa : (fa === 'enh' ? fa : fb))];
      h += `<line ${xy} stroke="#0d0f14" stroke-width="11" stroke-linecap="round"/>`;
      h += `<line ${xy} stroke="${col}" stroke-width="6" stroke-linecap="round" data-link="${a}-${b}"/>`;
    }
    svg.innerHTML = h + '<g id="links-pre"></g>'; // links-pre … 置く前の「ここに置くと つながる」点線
  }

  // ------------------------------------------------------------ つながる相手を見せる（置く前）
  // 持っている札（選んだ札。なければ、マウスをのせた棚の札）について、
  //   盤面の「相手になれる札」を光らせ、空きマスに「置いたら何本つながるか」を出す。
  // 数は rules.js の linksIfPlaced / linksIfSwapped（画面の側で条件を書き直さない）。
  function heldInfo() {
    if (G.sel) return G.sel.src != null ? { src: G.sel.src, picked: true } : { cell: G.sel.cell, picked: true };
    const h = G.hoverInfo; if (h && h.src != null) return { src: h.src, picked: false };
    return null;
  }
  function markLinks() {
    for (const t of document.querySelectorAll('.tile.lk-mate, .tile.lk-dim')) t.classList.remove('lk-mate', 'lk-dim');
    for (const c of document.querySelectorAll('#board .cell.lk-good')) c.classList.remove('lk-good');
    for (const m of document.querySelectorAll('#board .lk-spot, #board .lk-pin')) m.remove();
    const pre = $('#links-pre'); if (pre) pre.innerHTML = '';
    const s = G.s; if (!s || G.busy || (s.phase !== 'place' && s.phase !== 'start')) return;
    const held = heldInfo();
    if (held) {
      const hb = held.cell != null ? s.board[held.cell] : null;
      const type = held.src != null ? R.srcType(s, held.src) : (hb && hb.type);
      if (!type) return;
      const live = held.src != null || R.isActive(hb); // 封印中の札を選んだときは、相手を光らせない（いまは つながらない）
      for (let i = 0; i < R.N; i++) {
        if (held.cell === i) continue;
        const b = s.board[i], t = b && cellEl(i).querySelector('.tile'); if (!t) continue;
        if (live && R.isActive(b) && R.works(type, b.type)) t.classList.add('lk-mate'); else if (held.picked) t.classList.add('lk-dim');
      }
      // 数字を出すマスは rules.js が決める（空き・がれき。満杯のときは置きかえ）。置けないマス（手数0など）には出さない
      const spots = held.src != null ? R.linkSpots(s.board, type) : R.swapSpots(s.board, held.cell);
      for (const sp of spots) {
        if (held.src != null ? !R.placeKind(s, held.src, sp.cell) : !R.canSwap(s, held.cell, sp.cell)) continue;
        const c = cellEl(sp.cell); c.classList.add('lk-good');
        if (s.board[sp.cell]) c.appendChild(el('span', 'lk lk-pin', `<i></i>${sp.n}`)); // 札があるマス（がれき・満杯のときの置きかえ）は小さい印
        else c.appendChild(el('div', 'lk-spot', `<b>${sp.n}</b><span>つながる</span>`));
      }
    } else if (G.hoverInfo && G.hoverInfo.cell != null && R.isActive(s.board[G.hoverInfo.cell])) {
      // 盤面の札にマウスをのせたとき：棚の中の「この札につながる札」を光らせる
      const bt = s.board[G.hoverInfo.cell].type;
      for (const t of document.querySelectorAll('#shop .tile, #keep .tile')) if (R.works(bt, t.dataset.type)) t.classList.add('lk-mate');
    }
  }
  // 選んだ札を このマスに置いたら（入れかえたら）出る線を、点線で先に見せる
  function drawPreLinks(cell) {
    const pre = $('#links-pre'); if (!pre) return; pre.innerHTML = '';
    const s = G.s; if (cell == null || !G.sel || G.busy || !s) return;
    let ls = null;
    if (G.sel.src != null) { if (R.placeKind(s, G.sel.src, cell)) ls = R.linksIfPlaced(s.board, R.srcType(s, G.sel.src), cell); }
    else if (G.sel.cell != null && R.canSwap(s, G.sel.cell, cell)) ls = R.linksIfSwapped(s.board, G.sel.cell, cell);
    if (!ls) return;
    let h = '';
    for (const j of ls) {
      const xy = jointXY(cell, j);
      h += `<line ${xy} stroke="#0d0f14" stroke-width="11" stroke-linecap="round"/><line ${xy} stroke="#ffe27a" stroke-width="6" stroke-linecap="round" stroke-dasharray="1 9" data-prelink="${cell}-${j}"/>`;
      const t = cellEl(j).querySelector('.tile'); if (t) t.classList.add('hl');
    }
    pre.innerHTML = h;
  }

  // ------------------------------------------------------------ 敵・予告・自分
  function chip(cls, text) { return `<span class="chip ${cls}">${text}</span>`; }
  function renderEnemy() {
    const s = D(), e = s.e, def = R.ENEMIES[e.id];
    const hp = num('eh', Math.max(0, e.hp));
    $('#enemy-glyph').textContent = def.g; $('#enemy-name').textContent = def.name; $('#enemy-trait').textContent = def.trait;
    $('#enemy-fill').style.width = (100 * hp / e.max) + '%'; $('#enemy-hp').textContent = `${hp} / ${e.max}`;
    const es = G.view ? G.view.es : [e.poison, e.fire, e.ice, e.shock, e.guard, e.frozen];
    let h = '';
    if (es[0]) h += chip('poison', `毒 ${es[0]}`);
    if (es[1]) h += chip('fire', `炎 ${es[1]}`);
    if (es[2]) h += chip('ice', `氷 ${es[2]}/${R.FREEZE_AT}`);
    if (es[5]) h += chip('ice', '凍結（次の攻撃が半分）');
    if (es[3]) h += chip('shock', `雷 ${es[3]}/${R.SHOCK_AT}`);
    if (es[4]) h += chip('guard', `結界 ${es[4]}`);
    $('#enemy-status').innerHTML = h || chip('none', '状態なし');
  }
  function renderIntent() {
    const s = D(), it = s.intent;
    if (s.phase === 'start' || !it) {
      $('#intent-moves').innerHTML = '戦いの前'; $('#intent-label').textContent = ''; $('#intent-lines').innerHTML = '<li>最初の攻撃ブロックを置くと、敵が予告を出す。</li>';
      return;
    }
    const total = it.moves + (s.bonusUsed || 0), left = G.busy ? 0 : s.moves;
    let pips = ''; for (let i = 0; i < total; i++) pips += `<span class="pip ${i < left ? 'on' : ''}"></span>`;
    $('#intent-moves').innerHTML = `あと ${left} 手 <span class="pips">${pips}</span>` + (s.bonusUsed ? '<span class="rage" style="color:var(--shock)">感電で+1</span>' : '');
    $('#intent-label').innerHTML = `${it.label}` + (it.rage ? '<span class="rage">怒り（攻撃が強い）</span>' : '');
    $('#intent-lines').innerHTML = R.intentLines(it).map(l => `<li class="${l.k}">${l.text}</li>`).join('');
  }
  function renderPlayer() {
    const s = D(), p = s.p; const hp = num('ph', Math.max(0, p.hp)), sh = num('sh', p.shield), pc = num('pc', p.curse);
    $('#player-fill').style.width = (100 * hp / p.max) + '%'; $('#player-hp').textContent = `${hp} / ${p.max}`;
    let h = '';
    if (sh) h += chip('shield', `シールド ${sh}`);
    if (pc) h += chip('curse', `呪い ${pc}`);
    $('#player-status').innerHTML = h || chip('none', '状態なし');
  }

  // ------------------------------------------------------------ 棚・キープ
  function fillSlot(slot, s, type, src) { // 棚・キープの1わく。数字の印は札の外（わくの右上）に出す
    const t = tileEl(type, 1), n = R.bestLinks(s.board, type);
    if (n === 0 && R.needsLink(type)) t.classList.add('lk-none');
    if (G.sel && G.sel.src === src) t.classList.add('sel');
    slot.appendChild(t);
    if (n > 0) slot.appendChild(el('span', 'lk', `<i></i>${n}`));
  }
  function renderShop() {
    const s = D(); const box = $('#shop'); box.innerHTML = '';
    for (let i = 0; i < R.SHOP; i++) {
      const slot = el('div', 'slot'); slot.dataset.shop = i;
      if (s.shop[i]) fillSlot(slot, s, s.shop[i], i);
      box.appendChild(slot);
    }
    const k = $('#keep'); k.innerHTML = ''; k.className = 'slot';
    if (s.keep) fillSlot(k, s, s.keep, 'keep');
    if (!G.busy && G.sel && typeof G.sel.src === 'number' && s.phase === 'place') k.classList.add('can');
    $('#shop-box').classList.toggle('off', G.busy || s.phase === 'won' || s.phase === 'lost');
    $('#moves-label').textContent = s.phase === 'start' ? '最初の1個（手数なし）' : `のこり ${G.busy ? 0 : s.moves} 手`;
    $('#keep-wrap').style.visibility = s.phase === 'start' ? 'hidden' : 'visible';
  }

  // ------------------------------------------------------------ 予想・ボタン・案内
  function renderForecast() {
    const s = G.s, box = $('#forecast');
    if (G.busy) { box.innerHTML = '<span class="f1">発動中…</span>'; return; }
    if (s.phase !== 'place') { box.innerHTML = '<span class="f1">最初の攻撃ブロックを置くと、ここに「このターンの予想」が出る。</span>'; return; }
    const f = R.forecast(s); G.fc = f;
    let h = `<span class="f1">いま発動したときの予想</span><span><span class="deal">与える <b id="fc-deal">${f.dealt}</b></span>　<span class="take">受ける <b id="fc-take">${f.taken}</b></span>`;
    if (f.won) h += '　<span class="big">たおせる！</span>';
    if (f.lost) h += '　<span class="big" style="color:#ff8f8f">このままだと負ける</span>';
    h += '</span>';
    const p = G.preview;
    if (p) {
      const dd = p.f.dealt - f.dealt, dt = p.f.taken - f.taken;
      h += `<span>${p.label} → 与える <span class="delta ${dd < 0 ? 'bad' : ''}">${dd >= 0 ? '+' : ''}${dd}</span>　受ける <span class="delta ${dt > 0 ? 'bad' : ''}">${dt >= 0 ? '+' : ''}${dt}</span>${p.f.won ? '　<span class="big">たおせる！</span>' : ''}</span>`;
    }
    box.innerHTML = h;
  }
  function renderButtons() {
    const s = G.s, end = $('#btn-end'), undo = $('#btn-undo');
    undo.disabled = G.busy || !G.undo.length;
    end.disabled = G.busy || s.phase !== 'place';
    end.classList.toggle('ready', !G.busy && s.phase === 'place' && s.moves === 0);
    end.textContent = (s.phase === 'place' && s.moves > 0) ? `発動（${s.moves}手のこす）` : '発動！';
    $('#turn-label').textContent = s.phase === 'start' ? 'じゅんび' : `ターン ${D().turn}`;
  }
  function renderGuide() {
    const s = G.s; let t = '';
    if (G.busy) t = 'あなたの攻撃 → 敵の行動 → ターンの終わり';
    else if (s.phase === 'start') t = G.sel ? '置くマスを選ぼう' : '最初の攻撃ブロックを 棚から1つ選ぼう';
    else if (s.phase === 'place') {
      if (G.sel && G.sel.src != null) t = '置くマスを選ぼう（数字＝つながる数。重ねるとLvアップ）';
      else if (G.sel && G.sel.cell != null) t = '入れかえる相手のマスを選ぼう（1手つかう）';
      else if (s.moves > 0) t = `棚のブロックを選んで盤面へ（あと ${s.moves} 手）`;
      else t = '「発動！」を押そう';
    }
    $('#guide').textContent = t;
  }

  // ------------------------------------------------------------ 説明（右下）
  function partnersOf(type) {
    const fams = {}; const names = [];
    for (const t of R.TYPES) if (R.works(type, t)) { (fams[R.B[t].fam] = fams[R.B[t].fam] || []).push(R.B[t].name); }
    for (const f of ['atk', 'elem', 'spec', 'enh', 'def']) if (fams[f]) {
      const all = R.TYPES.filter(t => R.B[t].fam === f).length;
      names.push(fams[f].length === all ? `${R.FAMS[f]}ブロック全部` : fams[f].join('・'));
    }
    return names;
  }
  function blockHead(type, lv) {
    const d = R.B[type];
    return `<h3>${d.name}${type !== 'rubble' ? ` <span class="sub">Lv${lv}</span>` : ''}<span class="fam" style="background:${FAM_COLOR[d.fam]}">${R.FAMS[d.fam]}</span></h3>`;
  }
  function renderDetail() {
    const box = $('#detail'), s = D(), info = G.hoverInfo || (G.sel && (G.sel.src != null ? { src: G.sel.src } : { cell: G.sel.cell }));
    let h = '';
    if (info && info.src != null && R.srcType(s, info.src)) {
      const type = R.srcType(s, info.src);
      h += blockHead(type, 1) + `<p>${R.blockText(type, 1)}</p>`;
      const pn = partnersOf(type);
      h += pn.length ? `<p class="sub">つながる相手：${pn.join(' / ')}</p>` : `<p class="sub">ひとりで働く（どこに置いてもよい）。</p>`;
      h += `<p class="sub">Lv2：${R.blockText(type, 2)}</p>`;
    } else if (info && info.cell != null && s.board[info.cell]) {
      const b = s.board[info.cell], d = G.derived || R.derive(s.board);
      h += blockHead(b.type, b.lv) + `<p>${R.blockText(b.type, b.lv)}</p>`;
      if (b.sealed) h += `<p class="warn">封印中（あと${b.sealed}ターン働かない）。</p>`;
      else if (b.type !== 'rubble') {
        const a = d.atk.find(x => x.cell === info.cell);
        if (a) h += `<p class="now">いまの働き（${a.order}番目に発動）</p><ul>${R.attackLines(a).map(l => `<li>${l}</li>`).join('')}</ul>`;
        else {
          const ln = d.L[info.cell].map(j => R.B[s.board[j].type].name);
          if (ln.length) h += `<p class="now">つながっている：${ln.join('・')}</p>`;
          else if (R.needsLink(b.type)) h += `<p class="warn">どこにも つながっていない（いまは働いていない）。</p>`;
          if (b.type === 'charge') h += `<p class="now">たまり ${b.charge}</p>`;
          if (b.type === 'dodge') h += `<p class="now">${s.p.dodgeCd > 0 ? `休み中（あと${s.p.dodgeCd}ターン）` : 'よける準備ができている'}（休みは ${d.dodgeRest} ターン）</p>`;
        }
        if (b.lv < R.MAXLV) h += `<p class="sub">Lv${b.lv + 1}：${R.blockText(b.type, b.lv + 1)}</p>`;
      }
    } else {
      // 何も選んでいないとき：スキルの一覧（発動の順）
      const d = G.derived || R.derive(s.board);
      h += `<h3>スキル一覧 <span class="sub">発動の順</span></h3>`;
      if (!d.atk.length) h += `<p class="sub">攻撃ブロックがない。攻撃ブロックを置くと、ターンごとに発動する。</p>`;
      for (const a of d.atk) h += `<div class="sk"><b>${a.order}　${R.B[a.type].name} Lv${a.lv}</b><br>${R.attackLines(a).join(' ／ ')}</div>`;
      const df = [];
      if (d.shieldGain) df.push(`シールド+${d.shieldGain}` + (d.shieldKeep ? `（${Math.round(d.shieldKeep * 100)}%残る）` : ''));
      if (d.tough) df.push(`堅牢 ヒットごと−${d.tough}`);
      if (d.dodgeRest) df.push(`回避（休み${d.dodgeRest}ターン）`);
      if (d.reflect) df.push(`反射 ${Math.round(d.reflect * 100)}%`);
      if (d.regen) df.push(`再生 +${d.regen}`);
      if (df.length) h += `<div class="sk defn"><b>守り</b><br>${df.join(' ／ ')}</div>`;
      h += `<p class="sub">ブロックにマウスをのせると説明が出る。</p>`;
    }
    box.innerHTML = h;
  }
  function highlightLinks(cell) {
    for (const t of document.querySelectorAll('#board .tile.hl')) t.classList.remove('hl');
    if (cell == null || !G.derived) return;
    for (const j of G.derived.L[cell]) { const t = cellEl(j).querySelector('.tile'); if (t) t.classList.add('hl'); }
  }

  function renderAll() {
    renderBoard(); renderEnemy(); renderIntent(); renderPlayer(); renderShop(); renderForecast(); renderButtons(); renderGuide(); renderDetail();
    markLinks();
  }

  // ------------------------------------------------------------ 手（クリックでもドラッグでも、ここを通る）
  function pushUndo() { G.undo.push(R.cloneState(G.s)); }
  function doPlace(src, cell) {
    if (G.busy || !R.placeKind(G.s, src, cell)) { sfx('bad'); return false; }
    const wasStart = G.s.phase === 'start';
    if (!wasStart) pushUndo();
    R.place(G.s, src, cell);
    if (wasStart) { G.undo = []; logLine('lt', `ターン ${G.s.turn}`); }
    G.sel = null; G.preview = null; G.hoverInfo = null; sfx('place'); renderAll();
    const t = cellEl(cell).querySelector('.tile'); if (t) t.classList.add('fx-new');
    return true;
  }
  function doSwap(a, b) {
    if (G.busy || !R.canSwap(G.s, a, b)) { sfx('bad'); return false; }
    pushUndo(); R.swap(G.s, a, b); G.sel = null; G.preview = null; G.hoverInfo = null; sfx('place'); renderAll(); return true;
  }
  function doKeep(idx) {
    if (G.busy || G.s.phase !== 'place' || !G.s.shop[idx]) return false;
    pushUndo(); R.toKeep(G.s, idx); G.sel = null; G.preview = null; sfx('place'); renderAll(); return true;
  }
  function doUndo() {
    if (G.busy || !G.undo.length) return;
    G.s = G.undo.pop(); G.sel = null; G.preview = null; G.hoverInfo = null; renderAll();
  }
  function doEnd() {
    if (G.busy || G.s.phase !== 'place') return false;
    const fc = R.forecast(G.s); const shown = { deal: $('#fc-deal') ? +$('#fc-deal').textContent : null, take: $('#fc-take') ? +$('#fc-take').textContent : null };
    G.pre = R.cloneState(G.s); const t0 = G.s.stats.total, k0 = G.s.stats.taken, turn = G.s.turn;
    const ev = R.endTurn(G.s);
    G.undo = []; G.sel = null; G.preview = null; G.hoverInfo = null; G.busy = true; G.turnSum = { e: 0, p: 0 };
    G.view = { eh: G.pre.e.hp, ph: G.pre.p.hp, sh: G.pre.p.shield, pc: G.pre.p.curse, es: [G.pre.e.poison, G.pre.e.fire, G.pre.e.ice, G.pre.e.shock, G.pre.e.guard, G.pre.e.frozen] };
    renderAll();
    play(ev, () => {
      // 画面に出ている数字と、ルールの計算結果を比べる（ずれたら記録）
      const dispE = parseInt($('#enemy-hp').textContent, 10), dispP = parseInt($('#player-hp').textContent, 10);
      const dealt = G.s.stats.total - t0, taken = G.s.stats.taken - k0;
      const bad = [];
      if (dispE !== Math.max(0, G.s.e.hp)) bad.push(`敵HP 表示${dispE} 計算${G.s.e.hp}`);
      if (dispP !== Math.max(0, G.s.p.hp)) bad.push(`自分HP 表示${dispP} 計算${G.s.p.hp}`);
      if (shown.deal !== dealt || fc.dealt !== dealt) bad.push(`与える予想 表示${shown.deal} 実際${dealt}`);
      if (shown.take !== taken || fc.taken !== taken) bad.push(`受ける予想 表示${shown.take} 実際${taken}`);
      if (G.turnSum.e !== dealt) bad.push(`演出の合計 ${G.turnSum.e} 実際${dealt}`);
      if (G.turnSum.p !== taken) bad.push(`演出の被ダメ合計 ${G.turnSum.p} 実際${taken}`);
      CHECK.turns++; for (const b of bad) CHECK.mismatches.push(`T${turn}: ${b}`);
      if (AUTO) sampleLayout();
      G.busy = false; G.view = null; G.pre = null;
      renderAll();
      if (G.s.phase === 'place') logLine('lt', `ターン ${G.s.turn}`);
      if (G.s.phase === 'won' || G.s.phase === 'lost') showResult();
    });
    return true;
  }

  // ------------------------------------------------------------ 発動の再生
  function logLine(cls, text) { const l = $('#log'); l.appendChild(el('div', cls, text)); l.scrollTop = l.scrollHeight; }
  function pulse(cell, cls) {
    if (cell == null) return; const t = cellEl(cell) && cellEl(cell).querySelector('.tile'); if (!t) return;
    t.classList.remove(cls || 'fx-fire'); void t.offsetWidth; t.classList.add(cls || 'fx-fire');
  }
  function showDmg(who, n, extra, heal) {
    const slot = $(who === 'e' ? '#enemy-dmg' : '#player-dmg');
    if (!heal) G.turnSum[who] += n;
    slot.innerHTML = `<span class="last fx-pop ${heal ? 'heal' : ''}">${heal ? '+' : '−'}${n}${extra ? ' ' + extra : ''}</span><span class="sum">合計 −${G.turnSum[who]}</span>`;
  }
  const DELAY = { fire: 230, hit: 170, consume: 300, shock: 420, freeze: 420, shield: 240, eact: 520, ehit: 330, reflect: 300, tick: 320, curse: 320, end: 60 };
  function applyEvent(e, st) {
    const B = R.B, pre = G.pre;
    G.view = { eh: e.eh, ph: e.ph, sh: e.sh, pc: e.pc, es: e.es };
    switch (e.t) {
      case 'shield': for (const c of e.cells) pulse(c); logLine('lp', `盾：シールド+${e.add}`); break;
      case 'fire': {
        st.hitN = 0; pulse(e.cell); if (e.src !== e.cell) pulse(e.src);
        const b = pre.board[e.cell], nm = b ? B[b.type].name : '攻撃', o = (G.derived.atk.find(a => a.cell === e.cell) || {}).order || '';
        logLine('lp', e.mode === 'main' ? `${o} ${nm} が発動` : e.mode === 're' ? `　再発動（${Math.round(e.mult * 100)}%）` : `　反撃（${Math.round(e.mult * 100)}%）`);
        break;
      }
      case 'hit': {
        if (e.dodged) { logLine('', '　→ よけられた'); break; }
        if (e.kind === 'chase') pulse(e.src);
        const ex = []; if (e.fire) ex.push(`炎+${e.fire}`); if (e.armorCut) ex.push(`装甲−${e.armorCut}`); if (e.guardCut) ex.push(`結界−${e.guardCut}`);
        logLine('', `　→ ${e.kind === 'chase' ? '追撃 ' : ''}${e.dmg}ダメージ${ex.length ? '（' + ex.join('・') + '）' : ''}${e.heal ? `　HP+${e.heal}` : ''}`);
        showDmg('e', e.dmg); $('#enemy-portrait').classList.remove('fx-hit'); void $('#enemy-portrait').offsetWidth; if (e.dmg > 0) $('#enemy-portrait').classList.add('fx-hit');
        sfx('hit', st.hitN++); break;
      }
      case 'consume': for (const c of e.cells) pulse(c); logLine('lp', `　毒消費：毒${e.n}を消して ${e.dmg}ダメージ`); showDmg('e', e.dmg, '毒消費'); sfx('big'); break;
      case 'shock': logLine('lp', `　感電！ ${e.dmg}ダメージ、次のターンの手数+1`); showDmg('e', e.dmg, '感電'); sfx('big'); break;
      case 'freeze': logLine('lp', '　凍結！ 敵の次の攻撃が半分になる'); sfx('big'); break;
      case 'thorn': logLine('le', `　トゲ：${e.dmg}ダメージ受けた${e.shield ? `（シールド−${e.shield}）` : ''}`); if (e.dmg) showDmg('p', e.dmg, 'トゲ'); break;
      case 'eact': logLine('le', `敵の行動：${e.label}`); break;
      case 'ehit': {
        if (e.dodged) { for (const c of e.cells) pulse(c); logLine('le', `　← ${e.raw}の攻撃を よけた！`); sfx('place'); break; }
        const ex = []; if (e.ice) ex.push(`凍結−${e.ice}`); if (e.tough) ex.push(`堅牢−${e.tough}`); if (e.shield) ex.push(`シールド−${e.shield}`);
        logLine('le', `　← ${e.raw}の攻撃 → ${e.dmg}ダメージ${ex.length ? '（' + ex.join('・') + '）' : ''}`);
        showDmg('p', e.dmg); if (e.dmg > 0) G.lastBlow = `${pre.intent.label}（${e.raw}）`; sfx('ehit'); break;
      }
      case 'reflect': for (const c of e.cells) pulse(c); logLine('lp', `　反射：${e.dmg}ダメージ`); showDmg('e', e.dmg, '反射'); break;
      case 'guard': logLine('le', `　敵が結界 ${e.n} をはった`); break;
      case 'seal': for (const c of e.cells) if (pre.board[c]) pre.board[c].sealed = 2; renderBoard(); logLine('le', `　封印：${e.cells.length}個のブロックが働かなくなった`); break;
      case 'destroy': for (const c of e.cells) pre.board[c] = null; renderBoard(); logLine('le', e.cells.length ? `　破壊：${e.cells.length}個のブロックが消えた` : '　破壊：ねらわれたマスは空だった'); break;
      case 'rubble': for (const c of e.cells) pre.board[c] = R.mk('rubble'); renderBoard(); logLine('le', e.cells.length ? `　がれきが${e.cells.length}個落ちた` : '　がれき：マスがふさがっていて落ちなかった'); break;
      case 'cleanse': logLine('le', '　脱皮：敵の状態が全部消えた'); break;
      case 'cursed': logLine('le', `　呪い+${e.n}`); break;
      case 'eheal': logLine('le', `　敵がHPを${e.n}回復`); break;
      case 'tick': logLine('lp', `毒：${e.dmg}ダメージ`); showDmg('e', e.dmg, '毒'); break;
      case 'curse': logLine('le', `呪い：${e.dmg}ダメージ受けた`); showDmg('p', e.dmg, '呪い'); G.lastBlow = `呪い（${e.dmg}）`; break;
      case 'regen': for (const c of e.cells) pulse(c); logLine('lp', `再生：HP+${e.n}`); break;
      case 'eregen': logLine('le', `敵の再生：HP+${e.n}`); break;
      case 'won': sfx('win'); break;
      case 'lost': sfx('lose'); break;
    }
    renderEnemy(); renderPlayer();
  }
  function play(ev, done) {
    let i = 0; const st = { hitN: 0 };
    const step = () => {
      for (;;) {
        if (i >= ev.length) { done(); return; }
        const e = ev[i++];
        try { applyEvent(e, st); if (AUTO && G.speed > 0) sampleLayout(); } catch (err) { CHECK.errors.push('play: ' + err.message); }
        const d = G.speed > 0 ? (DELAY[e.t] == null ? 260 : DELAY[e.t]) / G.speed : 0;
        if (d > 0) { setTimeout(step, d); return; }
      }
    };
    step();
  }

  // ------------------------------------------------------------ 結果
  function showResult() {
    const s = G.s, won = s.phase === 'won', st = s.stats;
    const rows = Object.keys(st.dealt).map(k => [R.B[k] ? R.B[k].name : (SRC_NAMES[k] || k), st.dealt[k]]).sort((a, b) => b[1] - a[1]);
    const max = rows.length ? rows[0][1] : 1;
    let h = `<h2 class="${won ? 'res-win' : 'res-lose'}" id="result-title">${won ? '勝ち！' : '負け…'}</h2>`;
    h += `<p>${R.ENEMIES[s.enemyId].name}　／　${s.turn}ターン　／　のこりHP ${Math.max(0, s.p.hp)}（敵 ${Math.max(0, s.e.hp)}）</p>`;
    if (!won) h += `<p class="res-lose">最後に受けた攻撃：${G.lastBlow || '—'}。受けたダメージ ${st.taken}、防いだ ${st.blocked}、回復 ${st.healed}。</p>`;
    else h += `<p>受けたダメージ ${st.taken}、防いだ ${st.blocked}、回復 ${st.healed}。</p>`;
    h += `<h3>何が効いたか（与えたダメージの内訳）</h3><div class="brk">`;
    for (const [n, v] of rows) h += `<span>${n}</span><span><span class="bb" style="display:block;width:${Math.max(2, 100 * v / max)}%"></span></span><span>${v}</span>`;
    h += `</div><div class="row"><button class="btn primary" id="btn-again">もう一度（同じ敵）</button><button class="btn" id="btn-back">敵をえらぶ</button></div>`;
    $('#result-sheet').innerHTML = h; $('#result').hidden = false;
    $('#btn-again').addEventListener('click', () => startGame(G.enemyId));
    $('#btn-back').addEventListener('click', showTitle);
    if (AUTO) sampleLayout();
    CHECK.done = true; CHECK.result = { phase: s.phase, turn: s.turn, pHp: s.p.hp, eHp: s.e.hp };
  }

  // ------------------------------------------------------------ あそびかた
  function showHelp() {
    let h = `<h2>あそびかた</h2><ul>
      <li>敵は「次の行動」と「あと何手か」を予告する。その<b>手数</b>だけ、棚のブロックを盤面に置ける。</li>
      <li>置きおわって「発動！」を押すと、<b>あなたの攻撃ブロックが番号順（左上から）に発動 → 敵の行動 → ターンの終わり</b>。盤面は次のターンにも残る。</li>
      <li><b>たて・よこに となり合うブロックは つながる</b>（線が出る）。攻撃ブロックに属性や特殊をつなげると、その攻撃にのる。強化ブロックは、つながったブロックを強くする。</li>
      <li>範囲攻撃だけは、ななめのブロックとも つながる。</li>
      <li>同じ種類の上に重ねると<b>レベルアップ</b>（Lv3まで）。ちがう種類の上に置くと置きかえ。</li>
      <li>盤面のブロックを選んで別のマスを選ぶと<b>入れかえ</b>（1手）。棚の1個を<b>キープ</b>に取っておける（手数なし）。</li>
      <li>線が出ていない点線のブロックは、つながる相手がいなくて働いていない。</li>
      <li><b>置く前に、つながる相手が見える。</b>棚のブロックの右上の数字は「いま置くと つながる数」（いちばん多いマスで）。点線の棚ブロックは、いまは相手がいない。</li>
      <li>棚のブロックを選ぶと、<b>相手になれるブロックが黄色く光り</b>、つながるマスに数字が出る。マスにマウスをのせると、出る線が点線で見える。</li>
    </ul><h3>ブロック一覧（Lv1の数字）</h3>`;
    for (const f of ['atk', 'elem', 'spec', 'enh', 'def']) {
      h += `<h3 style="color:${FAM_COLOR[f]}">${R.FAMS[f]}</h3><div class="cat">`;
      for (const t of R.TYPES) if (R.B[t].fam === f) h += `<div class="ci"><span class="cg" style="border-color:${FAM_COLOR[f]}">${R.B[t].g}</span><span><b>${R.B[t].name}</b>　${R.blockText(t, 1)}</span></div>`;
      h += '</div>';
    }
    h += `<div class="row"><button class="btn primary" id="btn-help-close">とじる</button></div>`;
    $('#help-sheet').innerHTML = h; $('#help').hidden = false;
    $('#btn-help-close').addEventListener('click', () => { $('#help').hidden = true; });
  }

  // ------------------------------------------------------------ 入力（クリックとドラッグ）
  function targetInfo(node) {
    const slot = node.closest && node.closest('[data-shop]'); if (slot) return { src: +slot.dataset.shop };
    if (node.closest && node.closest('#keep')) return { keep: true };
    const c = node.closest && node.closest('.cell'); if (c) return { cell: +c.dataset.cell };
    return null;
  }
  function clickOn(info) {
    if (!info || G.busy || !G.s) return;
    const s = G.s;
    if (info.src != null) { // 棚
      if (!s.shop[info.src]) return;
      G.sel = (G.sel && G.sel.src === info.src) ? null : { src: info.src };
    } else if (info.keep) { // キープ
      if (G.sel && typeof G.sel.src === 'number') { doKeep(G.sel.src); return; }
      if (s.keep) G.sel = (G.sel && G.sel.src === 'keep') ? null : { src: 'keep' };
    } else if (info.cell != null) { // 盤面
      if (G.sel && G.sel.src != null) { doPlace(G.sel.src, info.cell); return; }
      if (G.sel && G.sel.cell != null) { if (G.sel.cell === info.cell) G.sel = null; else { doSwap(G.sel.cell, info.cell); return; } }
      else if (s.board[info.cell] && s.phase === 'place') G.sel = { cell: info.cell };
    }
    G.preview = null; renderAll();
  }
  function previewFor(info) {
    // 選んだブロックを このマスに置いたら（入れかえたら）予想がどう変わるか
    if (!G.sel || G.busy || G.s.phase !== 'place' || !info || info.cell == null) return null;
    const c = R.cloneState(G.s); let label;
    if (G.sel.src != null) {
      const kind = R.placeKind(c, G.sel.src, info.cell); if (!kind) return null;
      R.place(c, G.sel.src, info.cell); label = { new: 'ここに置くと', up: 'レベルアップすると', replace: '置きかえると' }[kind];
    } else if (G.sel.cell != null) {
      if (!R.swap(c, G.sel.cell, info.cell)) return null; label = '入れかえると';
    } else return null;
    return { f: R.forecast(c), label };
  }
  let drag = null;
  document.addEventListener('pointerdown', e => {
    if (e.button !== 0 || G.busy || !G.s) return;
    const info = targetInfo(e.target); if (!info) return;
    drag = { info, x: e.clientX, y: e.clientY, moved: false };
  });
  document.addEventListener('pointermove', e => {
    if (drag) {
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8) {
        const s = G.s, i = drag.info;
        const type = i.src != null ? s.shop[i.src] : i.keep ? s.keep : (s.board[i.cell] && s.phase === 'place' ? s.board[i.cell].type : null);
        if (!type) { drag = null; return; }
        drag.moved = true;
        G.sel = i.src != null ? { src: i.src } : i.keep ? { src: 'keep' } : { cell: i.cell };
        const gh = $('#drag-ghost'); gh.innerHTML = ''; gh.appendChild(tileEl(type, i.cell != null ? s.board[i.cell].lv : 1)); gh.hidden = false;
        renderAll();
      }
      if (drag && drag.moved) { const gh = $('#drag-ghost'); gh.style.left = e.clientX + 'px'; gh.style.top = e.clientY + 'px'; }
    }
    // のせたマス・ブロックの説明と、置いたときの予想
    const info = targetInfo(e.target);
    const key = info ? JSON.stringify(info) : '';
    if (key !== G.hoverKey) {
      G.hoverKey = key;
      if (G.busy || !G.s) return;
      G.hoverInfo = info && (info.keep ? (G.s.keep ? { src: 'keep' } : null) : info.src != null ? (G.s.shop[info.src] ? info : null) : (G.s.board[info.cell] ? info : null));
      G.preview = previewFor(info);
      renderForecast(); renderDetail(); markLinks();
      highlightLinks(!G.sel && info && info.cell != null && G.s.board[info.cell] ? info.cell : null);
      drawPreLinks(info && info.cell != null ? info.cell : null);
    }
  });
  document.addEventListener('pointerup', e => {
    if (!drag) return;
    const d = drag; drag = null; $('#drag-ghost').hidden = true;
    const under = document.elementFromPoint(e.clientX, e.clientY); const info = under ? targetInfo(under) : null;
    if (!d.moved) { clickOn(d.info); return; }
    if (!info) { G.sel = null; renderAll(); return; }
    if (info.keep && typeof G.sel.src === 'number') doKeep(G.sel.src);
    else if (info.cell != null && G.sel.src != null) { if (!doPlace(G.sel.src, info.cell)) { G.sel = null; renderAll(); } }
    else if (info.cell != null && G.sel.cell != null && G.sel.cell !== info.cell) { if (!doSwap(G.sel.cell, info.cell)) { G.sel = null; renderAll(); } }
    else { G.sel = null; renderAll(); }
  });
  $('#btn-end').addEventListener('click', doEnd);
  $('#btn-undo').addEventListener('click', doUndo);
  $('#btn-help').addEventListener('click', showHelp);
  $('#btn-quit').addEventListener('click', () => { if (!G.busy) showTitle(); });
  $('#speed').addEventListener('change', e => { G.speed = +e.target.value; });
  $('#vol').addEventListener('input', e => { vol = +e.target.value / 100; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { $('#help').hidden = true; if (G.s && !G.busy) { G.sel = null; renderAll(); } } });
  window.addEventListener('resize', () => { if (G.s) { renderBoard(); markLinks(); } }); // 盤面を作り直すので、「つながる」表示も付け直す
  if (Q.has('speed')) { const o = [...$('#speed').options].find(x => +x.value === G.speed); if (o) $('#speed').value = o.value; }

  // ------------------------------------------------------------ 文字の重なり・はみ出しの検査（確認用）
  window.__layoutCheck = function () {
    const out = { overlaps: 0, offscreen: 0, clipped: 0, pageScroll: Math.max(0, document.documentElement.scrollHeight - window.innerHeight), samples: [] };
    const items = [];
    const top = document.querySelector('.overlay:not([hidden])') || document.body;
    const w = document.createTreeWalker(top, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.nodeValue.trim()) continue;
      const p = n.parentElement; if (!p || p.closest('script,style,option,select')) continue;
      let vis = true, clip = null;
      for (let a = p; a && a !== document.body; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.3) { vis = false; break; }
        if (cs.overflowY !== 'visible' || cs.overflowX !== 'visible') { const r = a.getBoundingClientRect(); clip = clip ? { l: Math.max(clip.l, r.left), t: Math.max(clip.t, r.top), r: Math.min(clip.r, r.right), b: Math.min(clip.b, r.bottom) } : { l: r.left, t: r.top, r: r.right, b: r.bottom }; }
      }
      if (!vis) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
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
      }
    }
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j]; if (a.p === b.p || a.p.contains(b.p) || b.p.contains(a.p)) continue;
      const ox = Math.min(a.q.r, b.q.r) - Math.max(a.q.l, b.q.l), oy = Math.min(a.q.b, b.q.b) - Math.max(a.q.t, b.q.t);
      if (ox > 2 && oy > 2) { out.overlaps++; if (out.samples.length < 8) out.samples.push(`重なり: 「${a.text}」と「${b.text}」`); }
    }
    return out;
  };

  // ------------------------------------------------------------ 自動プレイ（?auto=1）：ボットが画面の操作と同じ関数を通して遊ぶ
  function writeCheck() { // 検査の結果をページに書き出す（check.js が読む）
    let p = document.getElementById('check-out'); if (!p) { p = el('pre'); p.id = 'check-out'; p.hidden = true; document.body.appendChild(p); }
    p.textContent = JSON.stringify(Object.assign({ w: window.innerWidth, h: window.innerHeight, turn: G.s ? G.s.turn : 0 }, CHECK));
  }
  let autoSeed = 12345; const autoRand = () => { autoSeed = (autoSeed * 1103515245 + 12345) & 0x7fffffff; return autoSeed / 0x7fffffff; };
  function autoStep() {
    if (!G.s) return;
    if (G.s.phase === 'won' || G.s.phase === 'lost') { writeCheck(); return; }
    if (G.busy) { setTimeout(autoStep, 30); return; }
    if (STOP && G.s.phase === 'place' && G.s.turn >= STOP) {
      if (Q.get('pick') === '1') { // 「つながる」表示の写真用：線の数がいちばん多い棚の札を選ぶ
        let best = -1, bn = 0;
        for (let i = 0; i < R.SHOP; i++) if (G.s.shop[i]) { const n = R.bestLinks(G.s.board, G.s.shop[i]); if (n > bn) { bn = n; best = i; } }
        if (best >= 0) { G.sel = { src: best }; renderAll(); }
        CHECK.picked = best >= 0 ? { src: best, spots: document.querySelectorAll('#board .lk-spot').length, mates: document.querySelectorAll('#board .tile.lk-mate').length } : null;
      }
      sampleLayout(); CHECK.stopped = true; writeCheck(); return;
    }
    // ?bot=random … でたらめに置くボット（負けの画面を確かめる用）
    const act = Bot.chooseAction(G.s, Q.get('bot') === 'random' ? { random: true, rand: autoRand, start: 'slash' } : { start: ['slash', 'shot', 'area'][G.seed % 3] });
    let ok = true;
    const sorted = a => a.slice().sort((x, y) => x - y);
    const shownAt = cell => { const m = cellEl(cell).querySelector('.lk-spot b, .lk-pin'); return m ? +m.textContent : 0; };
    if (act.type === 'place') {
      const type = R.srcType(G.s, act.src), board = G.s.board;
      const want = sorted(R.linksIfPlaced(board, type, act.cell)), spots = R.linkSpots(board, type);
      const exp = (spots.find(x => x.cell === act.cell) || { n: 0 }).n; // このマスに出るはずの数字（数字を出さないマスなら0）
      G.sel = { src: act.src }; renderAll(); // 人が棚の札を選んだときと同じ表示を出す
      if (shownAt(act.cell) !== exp) CHECK.mismatches.push(`つながる数の表示 ${shownAt(act.cell)} / 計算 ${exp}（マス${act.cell}）`);
      // 数字のマスに置いたときの相手は、全部 光っていること
      for (const sp of spots) for (const j of R.linksIfPlaced(board, type, sp.cell)) {
        const t = cellEl(j).querySelector('.tile');
        if (!t || !t.classList.contains('lk-mate')) CHECK.mismatches.push(`数字のマス${sp.cell}の相手（マス${j}）が光っていない`);
      }
      sampleLayout();
      ok = doPlace(act.src, act.cell);
      const got = ok ? sorted(G.derived.L[act.cell]) : want;
      if (String(got) !== String(want)) CHECK.mismatches.push(`置く前の予告と置いた後のつながりがちがう（マス${act.cell}）`);
    } else if (act.type === 'swap') {
      const want = sorted(R.linksIfSwapped(G.s.board, act.a, act.b));
      const exp = (R.swapSpots(G.s.board, act.a).find(x => x.cell === act.b) || { n: 0 }).n;
      G.sel = { cell: act.a }; renderAll(); // 人が盤面の札を選んだときと同じ表示を出す
      if (shownAt(act.b) !== exp) CHECK.mismatches.push(`入れかえの つながる数の表示 ${shownAt(act.b)} / 計算 ${exp}（マス${act.b}）`);
      sampleLayout();
      ok = doSwap(act.a, act.b);
      const got = ok && G.s.board[act.b] ? sorted(G.derived.L[act.b]) : want;
      if (String(got) !== String(want)) CHECK.mismatches.push(`入れかえる前の予告と、入れかえた後のつながりがちがう（マス${act.b}）`);
    } else {
      // 手数が0のとき：棚の札を選んでも、置けないマスに数字が出ないこと
      const i = G.s.shop.findIndex(x => x);
      if (G.s.phase === 'place' && G.s.moves === 0 && i >= 0) {
        G.sel = { src: i }; renderAll();
        const n = document.querySelectorAll('#board .lk-spot, #board .lk-pin').length;
        if (n) CHECK.mismatches.push(`手数0なのに「つながる」数字が${n}マスに出ている`);
        CHECK.zeroMoveChecks = (CHECK.zeroMoveChecks || 0) + 1;
        G.sel = null; renderAll();
      }
      ok = doEnd();
    }
    if (!ok) doEnd();
    setTimeout(autoStep, G.speed > 0 ? 250 : 0);
  }

  window.__autoRun = (id, seed) => new Promise(res => {
    CHECK.turns = 0; CHECK.mismatches = []; CHECK.errors = []; CHECK.done = false; CHECK.result = null; CHECK.layout = { samples: 0, overlaps: 0, offscreen: 0, clipped: 0, pageScroll: 0, notes: [] };
    startGame(id, seed); sampleLayout(); autoStep();
    const t = setInterval(() => { if (CHECK.done) { clearInterval(t); res(JSON.parse(JSON.stringify(CHECK))); } }, 20);
  });

  renderTitle();
  if (Q.has('enemy') && R.ENEMIES[Q.get('enemy')]) { startGame(Q.get('enemy')); if (AUTO) setTimeout(autoStep, 50); }
  else { showTitle(); if (AUTO) { sampleLayout(); CHECK.stopped = true; writeCheck(); } }
})();
