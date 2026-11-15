const R = require(process.cwd() + '/rules.js'), Bot = require(process.cwd() + '/botcore.js');
const atkx = process.argv[2] === '1';
const k = { placed: 0, got: [0, 0, 0, 0, 0], shotPlaced: 0, shotGot: 0, shotDmg: 0, areaDmg: 0, slashDmg: 0, fights: 0 };
for (let seed = 1; seed <= 30; seed++) {
  const r = Bot.playRun(seed, { style: 'smart', pick: 'random', atkx, abil: +process.argv[3] || 0, onTurn: s => {
    const d = R.derive(s);
    for (const c of d.cells) { const X = d.blk[c];
      if (X.type === 'area') { k.placed++; k.got[Math.min(4, new Set(X.got.map(g => g.from || g.kind)).size)]++; }
      if (X.type === 'shot') { k.shotPlaced++; if (X.got.length) k.shotGot++; }
    }
  } });
  for (const f of r.fights) { k.fights++; k.shotDmg += f.dealt.shot || 0; k.areaDmg += f.dealt.area || 0; k.slashDmg += f.dealt.slash || 0; }
}
console.log(`atk=${atkx ? 1 : 0}  範囲攻撃 置いた ${k.placed}回  受け取った能力の種類 0:${k.got[0]} 1:${k.got[1]} 2:${k.got[2]} 3:${k.got[3]} 4:${k.got[4]}  射撃 置いた ${k.shotPlaced} 能力つき ${Math.round(k.shotGot / k.shotPlaced * 100)}%  1戦あたりのダメージ 斬撃 ${(k.slashDmg / k.fights).toFixed(1)} 射撃 ${(k.shotDmg / k.fights).toFixed(1)} 範囲 ${(k.areaDmg / k.fights).toFixed(1)}`);
