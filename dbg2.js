const R=require('./rules.js'),Bot=require('./botcore.js');
const id=process.argv[2]||'golem', seed=+(process.argv[3]||1037);
const allow=process.argv[4]?new Set(process.argv[4].split(',')):null;
const s=R.newGame(id,seed); const opt={start:'shot',allow};
function show(){ let o=''; for(let y=0;y<R.H;y++){ for(let x=0;x<R.W;x++){const b=s.board[y*R.W+x]; o+= b? R.B[b.type].g+b.lv+' ':'・  ';} o+='\n'; } console.log(o); }
while((s.phase==='start'||s.phase==='place')&&s.turn<=30){ const a=Bot.chooseAction(s,opt); if(a.type!=='end'&&Bot.apply(s,a)!=='bad') continue; const t=s.turn,t0=s.stats.total,k0=s.stats.taken,b0=s.stats.blocked,h0=s.stats.healed; const it=R.intentLines(s.intent).map(x=>x.text.split('（')[0]).join('+'); const ev=R.endTurn(s);
 console.log('T'+t,'与',s.stats.total-t0,'受',s.stats.taken-k0,'防',s.stats.blocked-b0,'回復',s.stats.healed-h0,'eHP',s.e.hp,'pHP',s.p.hp,'|',it,'|',ev.filter(e=>e.t==='ehit').map(e=>e.dodged?'よけ':`${e.raw}→${e.dmg}(氷${e.ice}堅${e.tough}盾${e.shield})`).join(' ')); if(t%4===0||s.phase!=='place') show(); }
