// ------------------------------------------------------------------ boss hazards (campaign-only entities, removed on reset)
class ExpFx extends Entity{constructor(g,x,y){super(g,x,y);this._exFx=true;}}
class ExpWave extends ExpFx{          // Bram's roll-call shock: hugs the floor; jump or stand on a ledge
  constructor(g,x,y,dir,lo,hi){super(g,x,y);this.dir=dir;this.w=34;this.h=30;this.x0=lo;this.x1=hi;this.sp=250;}
  update(dt){const g=this.g;this.t+=dt;this.x+=this.dir*this.sp*dt;
    if(Math.random()<.5)g.particles.dust(this.x-this.dir*10,this.y,1,.7);
    pHit(g,this,this.box(),this.dir);
    if(this.x<this.x0+14||this.x>this.x1-14){this.dead=true;g.particles.dust(this.x,this.y,6,1.2);}}
  draw(ctx){const x=this.x,y=this.y,d=this.dir;ctx.save();ctx.translate(x,y);ctx.scale(d,1);
    ctx.fillStyle='rgba(255,138,42,.85)';ctx.beginPath();ctx.moveTo(-16,0);ctx.quadraticCurveTo(-8,-34,14,-20);ctx.quadraticCurveTo(2,-14,10,0);ctx.fill();
    ctx.fillStyle='rgba(255,226,160,.9)';ctx.beginPath();ctx.moveTo(-10,0);ctx.quadraticCurveTo(-4,-20,8,-13);ctx.quadraticCurveTo(0,-8,4,0);ctx.fill();ctx.restore();}
  glow(ctx){glow(ctx,this.x,this.y-12,38,FI,.55);}
  lights(add,CYC,ORG){add(this.x,this.y-12,80,ORG,.7);}
}
class ExpJet extends ExpFx{           // steam column: warns on the grate, then erupts
  constructor(g,x,y,delay,dur){super(g,x,y);this.w=44;this.h=26;this.delay=delay;this.dur=dur;this.hgt=176;}
  box(){return {l:this.x-22,r:this.x+22,t:this.y-this.hgt,b:this.y};}
  get live(){return this.t>=this.delay&&this.t<this.delay+this.dur;}
  update(dt){const g=this.g,was=this.live;this.t+=dt;
    if(!was&&this.live){g.audio.play('steam');g.camera.shake(.2);}
    if(this.live){for(let i=0;i<2;i++)g.particles.add({x:this.x+rand(-14,14),y:this.y-4,vx:rand(-20,20),vy:rand(-420,-300),life:.5,size:rand(5,9),grow:16,color:'rgb(240,230,220)',type:'steam',drag:.4,alpha:.35});
      pHit(g,this,this.box(),Math.sign(g.player.x-this.x)||1);}
    else if(this.t<this.delay&&Math.random()<.3)g.particles.steam(this.x,this.y-4,1,0,-50,5);
    if(this.t>this.delay+this.dur)this.dead=true;}
  draw(ctx){const x=this.x,y=this.y,warn=this.t<this.delay,k=warn?this.t/this.delay:1;
    ctx.fillStyle='#14181c';ctx.fillRect(x-24,y-6,48,6);ctx.fillStyle='#050708';for(let i=0;i<6;i++)ctx.fillRect(x-20+i*7,y-4,3,3);
    if(warn){ctx.fillStyle=`rgba(255,${100+80*k|0},40,${.25+.5*k})`;ctx.fillRect(x-22,y-8,44,4);ctx.strokeStyle=`rgba(255,160,60,${.2+.4*k})`;ctx.lineWidth=1;ctx.strokeRect(x-22,y-this.hgt,44,this.hgt);}
    else if(this.live){const g=ctx.createLinearGradient(0,y-this.hgt,0,y);g.addColorStop(0,'rgba(240,235,225,0)');g.addColorStop(.3,'rgba(240,235,225,.45)');g.addColorStop(1,'rgba(255,200,150,.7)');ctx.fillStyle=g;ctx.fillRect(x-20,y-this.hgt,40,this.hgt);}}
  glow(ctx){if(this.t<this.delay)glow(ctx,this.x,this.y-6,30,FI,.2+.5*this.t/this.delay);else if(this.live)glow(ctx,this.x,this.y-40,50,FI,.3);}
}
class ExpCanister extends ExpFx{      // Bello's lobbed seizure canister
  constructor(g,x,y,tx,floor){super(g,x,y);this.w=18;this.h=18;this.base=floor;const T_=1.05;this.vx=(tx-x)/T_;this.vy=(floor-y)/T_-.5*900*T_;this.aimX=tx;}
  update(dt){const g=this.g;this.t+=dt;this.vy+=900*dt;this.x+=this.vx*dt;this.y+=this.vy*dt;
    if(Math.random()<.5)g.particles.steam(this.x,this.y,1,0,0,3);
    if(this.y>=this.base||g.level.tm.solid(Math.floor(this.x/T),Math.floor(this.y/T))){this.dead=true;g.level.entities.push(new ExpJet(g,this.x,this.base,.55,1.1));g.audio.play('smallboom');g.particles.dust(this.x,this.base,6,1.4);}
    else pHit(g,this,this.box(),Math.sign(this.vx)||1);}
  box(){return {l:this.x-9,r:this.x+9,t:this.y-18,b:this.y};}
  draw(ctx){const x=this.x,y=this.y-9;ctx.save();ctx.translate(x,y);ctx.rotate(this.t*8);ctx.fillStyle='#8a6a2a';ctx.fillRect(-8,-8,16,16);ctx.fillStyle=C.brassL;ctx.fillRect(-8,-8,16,3);ctx.fillStyle=C.fire;ctx.fillRect(-3,-3,6,6);ctx.restore();
    // landing mark
    ctx.strokeStyle='rgba(255,138,42,.5)';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(this.aimX,this.base-2,22,5,0,0,7);ctx.stroke();}
  glow(ctx){glow(ctx,this.x,this.y-9,20,FI,.5);}
}


// ---- PATCH v4 : more hazards for the rebuilt mid-bosses -----------------------------------------------------
// falls from the ceiling after a floor mark: a bell (stuns the floor with a short shock) or a canister (leaves a steam jet)
class ExpDrop extends ExpFx{
  constructor(g,x,y,delay,kind){super(g,x,y);this.base=y;this.delay=delay;this.kind=kind||'bell';this.w=40;this.h=40;this.fall=.2;this.lastT=0;this.landT=-1;this.rise=330;}
  fy(){const k=clamp((this.t-this.delay)/this.fall,0,1);return this.base-(1-k*k)*this.rise;}
  update(dt){const g=this.g;this.t+=dt;
    if(this.t<this.delay)return;
    if(this.landT<0){
      const fy=this.fy();pHit(g,this,{l:this.x-22,r:this.x+22,t:fy-44,b:fy},Math.sign(g.player.x-this.x)||1);
      if(this.t>=this.delay+this.fall){this.landT=0;g.audio.play(this.kind==='bell'?'boom':'smallboom');g.camera.shake(.25);g.particles.dust(this.x,this.base,8,1.3);g.particles.debris(this.x,this.base-8,6,[C.brass,C.steel,C.rust]);
        if(this.kind==='bell')g.particles.ring(this.x,this.base-6,C.fireL,64,.35);
        else{g.level.entities.push(new ExpJet(g,this.x,this.base,.45,.9));this.dead=true;}}}
    else{this.landT+=dt;pHit(g,this,{l:this.x-48,r:this.x+48,t:this.base-26,b:this.base},Math.sign(g.player.x-this.x)||1);if(this.landT>.4)this.dead=true;}}
  draw(ctx){const x=this.x,y=this.base;
    if(this.t<this.delay){const k=this.t/this.delay;ctx.strokeStyle=`rgba(255,${120+90*k|0},50,${.3+.5*k})`;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,y-2,26,5,0,0,7);ctx.stroke();
      ctx.fillStyle=`rgba(255,120,50,${.12+.25*k})`;ctx.fillRect(x-22,y-this.rise,44,this.rise);return;}
    const fy=this.landT<0?this.fy():y;ctx.save();ctx.translate(x,fy);
    if(this.kind==='bell'){ctx.fillStyle=C.brassD;ctx.beginPath();ctx.moveTo(-18,0);ctx.quadraticCurveTo(-16,-30,0,-34);ctx.quadraticCurveTo(16,-30,18,0);ctx.closePath();ctx.fill();ctx.fillStyle=C.brass;ctx.beginPath();ctx.moveTo(-14,-2);ctx.quadraticCurveTo(-12,-26,0,-30);ctx.quadraticCurveTo(-4,-18,-4,-2);ctx.closePath();ctx.fill();ctx.fillStyle=C.brassL;ctx.fillRect(-20,-2,40,4);ctx.fillStyle='#2a2010';circ(ctx,0,4,4);}
    else{ctx.fillStyle='#8a6a2a';ctx.fillRect(-9,-18,18,18);ctx.fillStyle=C.brassL;ctx.fillRect(-9,-18,18,3);ctx.fillStyle=C.fire;ctx.fillRect(-3,-12,6,6);}
    ctx.restore();
    if(this.landT>=0){ctx.strokeStyle=`rgba(255,226,160,${.8-this.landT*2})`;ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(x,y-4,26+this.landT*160,8,0,0,7);ctx.stroke();}}
  glow(ctx){if(this.t>=this.delay)glow(ctx,this.x,(this.landT<0?this.fy():this.base)-16,38,FI,.5);}
}
// Bello's billing slip: a flat tag that skims the hall at one of three heights
class ExpSlip extends ExpFx{
  constructor(g,x,y,dir,kind,lo,hi){super(g,x,y);this.dir=dir;this.kind=kind;this.w=46;this.h=14;this.x0=lo;this.x1=hi;this.sp=330;}
  box(){return {l:this.x-23,r:this.x+23,t:this.y-7,b:this.y+7};}
  update(dt){const g=this.g;this.t+=dt;this.x+=this.dir*this.sp*dt;
    if(Math.random()<.6)g.particles.add({x:this.x-this.dir*20,y:this.y,vx:-this.dir*40,vy:rand(-10,10),life:.25,size:2,color:this.kind==='high'?'#8fe8ff':C.fireL,type:'dot',add:true});
    pHit(g,this,this.box(),this.dir);
    if(this.x<this.x0||this.x>this.x1||g.level.tm.solid(Math.floor((this.x+this.dir*23)/T),Math.floor(this.y/T))){this.dead=true;g.particles.sparks(this.x,this.y,5,C.brassL);}}
  draw(ctx){const x=this.x,y=this.y,col=this.kind==='high'?'#bff4ff':this.kind==='mid'?'#ffe28a':'#ffb070';
    ctx.save();ctx.translate(x,y);ctx.scale(this.dir,1);ctx.fillStyle='rgba(0,0,0,.35)';ctx.fillRect(-22,-5,46,14);ctx.fillStyle=col;ctx.fillRect(-23,-7,46,14);ctx.fillStyle='#14181c';for(let i=0;i<4;i++)ctx.fillRect(-18+i*9,-3,6,1.4);ctx.fillRect(-18,1,30,1.4);
    ctx.fillStyle=this.kind==='high'?'#2a8a9a':C.rustD;ctx.beginPath();ctx.moveTo(23,-7);ctx.lineTo(32,0);ctx.lineTo(23,7);ctx.fill();ctx.restore();}
  glow(ctx){glow(ctx,this.x,this.y,26,this.kind==='high'?CY:FI,.5);}
  lights(add,CYC,ORG){add(this.x,this.y,60,this.kind==='high'?CYC:ORG,.5);}
}
// small helpers
function segHitsBox(ax,ay,bx,by,box,pad){const n=Math.max(2,Math.ceil(Math.hypot(bx-ax,by-ay)/10));
  for(let i=0;i<=n;i++){const k=i/n,x=ax+(bx-ax)*k,y=ay+(by-ay)*k;if(x>box.l-pad&&x<box.r+pad&&y>box.t-pad&&y<box.b+pad)return true;}return false;}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

// ------------------------------------------------------------------ bosses
class ExpBoss extends Enemy{
  constructor(g,bid,x,y,lo,hi){super(g,x,y);const cfg=BOSSES[bid];this.bid=bid;this.hp=cfg.hp;this.maxHp=cfg.hp;this._combatHealthInitialized=true;
    this.state='dormant';this.dir=-1;this.st_t=0;this.base=y;this.home=x;this.x0=lo;this.x1=hi;this.vx=0;this.flash=0;this.q=[];this.phase=0;this.win=0;this.dyingT=0;this._exBossEnt=true;this.hitFx=0;this.tickT=0;
    this.bag=[];this.last='';this.say=null;this.sayCD=4;this.beatQ=[];}
  get fighting(){return this.state!=='dormant'&&this.state!=='intro'&&this.state!=='dying';}
  start(){this.state='idle';this.st_t=-.6;this.q=[];this.bag=[];this.last='';}
  reset(){this.hp=this.maxHp;this.state='dormant';this.q=[];this.bag=[];this.last='';this.say=null;this.sayCD=4;this.beatQ=[];this.phase=0;this.x=this.home;this.y=this.base;this.dir=-1;this.vx=0;this.st_t=0;this.win=0;this.dead=false;this.stun=0;}
  vuln(){return .2;}
  onHit(hit){
    if(!this.fighting||this.dead)return {hit:false,damage:0,killed:false};
    const g=this.g,m=this.vuln(),dmg=(+hit.damage||0)*m;this.hp-=dmg;this.hitUntil=g.time+.11;this.flash=.12;
    const killed=this.hp<=0.0001;
    if(m<.3){g.particles.sparks(this.x,this.y-this.h*.5,4,C.brassL);g.audio.play('hit');}
    else{g.particles.sparks(this.x,this.y-this.h*.55,8,C.cyan);}
    if(killed){this.hp=0;this.destroy();}
    else this.afterHit&&this.afterHit();
    return {hit:true,damage:dmg,killed,armored:m<.3,weakpoint:m>=1};}
  destroy(){if(this.state==='dying'||this.dead)return;this.state='dying';this.dyingT=0;this.beatQ=[];this.say=null;this.g.hitstop=Math.max(this.g.hitstop,.22);this.g.camera.shake(.9);this.g.audio.play('boom');this._defeat=true;}
  hurtBody(box,dir){pHit(this.g,this,box,dir);}
  // one shuffled bag of attacks per phase: every move shows up once before any repeats, and the first two picks never match the last pick of the previous bag
  nextAct(){if(!this.bag.length){this.bag=this.makeBag();if(this.bag[0]===this.last&&this.bag.length>1)this.bag.push(this.bag.shift());}
    this.last=this.bag.shift();return this.last;}
  bark(text,dur){this.say={text,t:0,dur:dur||3.4};this.sayCD=7;}
  barkMaybe(arr){if(this.sayCD>0||!arr||!arr.length||Math.random()>.6)return;this.bark(arr[Math.floor(Math.random()*arr.length)]);}
  tickSay(dt){this.sayCD=Math.max(0,this.sayCD-dt);if(this.say){this.say.t+=dt;if(this.say.t>this.say.dur)this.say=null;}}
  drawSay(ctx,x,y){const s=this.say;if(!s)return;const a=Math.min(1,s.t/.18)*Math.min(1,(s.dur-s.t)/.35);
    ctx.save();ctx.globalAlpha=Math.max(0,a);ctx.font='bold 13px '+FONT;ctx.textAlign='center';const w=ctx.measureText(s.text).width+24;
    ctx.fillStyle='rgba(8,11,14,.9)';ctx.fillRect(x-w/2,y-28,w,26);ctx.fillStyle=C.brassD;ctx.fillRect(x-w/2,y-28,w,2);ctx.strokeStyle='rgba(120,100,60,.8)';ctx.lineWidth=1;ctx.strokeRect(x-w/2+.5,y-27.5,w-1,25);
    ctx.fillStyle='#ffe9c0';ctx.fillText(s.text,x,y-10);ctx.restore();}
  // a phase change pauses the fight for a short exchange; it waits for a calm moment so no attack is cut in half
  beatReady(){return this.beatQ.length>0&&!this.g.dialogue.active&&!this.g.director.active&&['idle','recover','stagger','overwind','stuck','stall'].includes(this.state);}
  runBeat(){const g=this.g,n=this.beatQ.shift(),L=this.beatLines(n);this.q=[];this.bag=[];this.state='idle';this.st_t=-.5;this.say=null;
    g.camera.shake(.45);g.audio.play('boom');g.particles.ring(this.x,this.y-this.h*.6,C.warn,100,.5);
    if(L&&L.length)g.dialogue.show(L,()=>{this.afterBeat&&this.afterBeat(n);});}
  common(dt){this.t+=dt;this.flash=Math.max(0,this.flash-dt);
    if(this.state==='dying'){this.dyingT+=dt;if(Math.random()<.5)this.g.particles.sparks(this.x+rand(-40,40),this.y-rand(10,this.h),4,C.fireL);
      if(Math.random()<.2)this.g.particles.steam(this.x+rand(-30,30),this.y-this.h*.6,1,0,-60,12);
      if(this.dyingT>2.8){this.dead=true;this.g.particles.debris(this.x,this.y-this.h/2,26,[C.steel,C.rust,C.brass,'#1a2026']);this.g.audio.play('boom');this.g.camera.shake(.8);}return true;}
    return false;}
}

// 마지막 교대장 브람 · 점호(종소리 박자) → 초과 근무(시계바늘 · 낙하 종) → 마지막 점호
//   rhythm fighter: low shockwaves you jump, a long rod you hop or dash through, clock hands you outrun, bells you read off the floor marks.
//   openings: charging into the wall (staggered), the overwound clock after the hands (full damage), the rod stuck in the floor (half damage).
class ExpBram extends ExpBoss{
  constructor(g,x,y,lo,hi){super(g,'bram',x,y,lo,hi);this.w=74;this.h=116;this.tollN=0;this.tollI=0;this.chain=null;this.swung=false;this.hands=null;this.rod=.5;this.fired=false;this.double=false;}
  reset(){super.reset();this.chain=null;this.hands=null;this.tollI=0;this.rod=.5;this.fired=false;}
  vuln(){const s=this.state;if(s==='stagger'||s==='overwind')return 1;if(s==='stuck')return .6;if(s==='recover')return .5;return .2;}
  afterHit(){const f=this.hp/this.maxHp;
    if(this.phase===0&&f<=.66){this.phase=1;this.beatQ.push(1);}
    else if(this.phase===1&&f<=.33){this.phase=2;this.beatQ.push(2);}}
  beatLines(n){return n===1?
    [['bram','…점호 2열. 이름을 읽는다.'],['bram','7구역 공방 담당. 기어하트를 만든 정비공. 변전소 파견 — 미복귀.'],['lin','…할아버지?'],['bram','복귀 확인 전까지 퇴근은 없다. 너도. 나도.']]:
    [['bram','…마지막 점호. 그가 떠나던 날의 문장을 읽겠다.'],['bram','"점호를 멈추지 말아 주게. 누군가 돌아올 문을 열어 두게."'],['lin','열어 두라고… 했잖아. 당신은 문을 닫아 놨어.'],['bram','열어… 두라고?'],['bram','…계산을 정정한다. 정정하는 동안 — 교대를 끝내 주지 않겠다!']];}
  afterBeat(n){const g=this.g;if(n===1)g.toast('브람 · 초과 근무 — 시계바늘과 낙하 종을 조심해라');else g.toast('브람 · 마지막 점호 — 박자가 빨라진다');}
  makeBag(){const ph=this.phase;let a=ph===0?['bell','toll','sweep','charge']:ph===1?['bell2','combo','hands','call','charge','toll']:['toll','peal','hands','combo','charge','bell2'];
    shuffle(a);if(a[0]==='charge'&&a.length>1){const i=a.findIndex(q=>q!=='charge');[a[0],a[i]]=[a[i],a[0]];}return a;}
  update(dt){const g=this.g,p=g.player;if(this.common(dt))return;
    const lo=this.x0+60,hi=this.x1-60,s=this.state;this.st_t+=dt;this.tickSay(dt);
    if(s==='dormant'||s==='intro'){this.y=this.base;return;}
    if(this.beatReady())return this.runBeat();
    this.rod=lerp(this.rod,.5+(s==='charge'||s==='wind'?.6:0),s==='sweep'||s==='smash'||s==='stuck'||s==='peal'?0:.12);
    if(s==='idle'){this.dir=Math.sign(p.x-this.x)||this.dir;
      const want=Math.abs(p.x-this.x)>260?1:Math.abs(p.x-this.x)<150?-1:0;
      this.x=clamp(this.x+this.dir*want*70*dt,lo,hi);
      if(this.st_t>Math.max(.4,.85-this.phase*.17))this.begin(this.nextAct());}
    else if(s==='bell'){                                                   // wind-up 0.9s (bell raised), ring, recover
      if(this.st_t>=.9&&!this.rung){this.rung=true;this.ring(this.double?2:1);}
      if(this.double&&this.st_t>=1.55&&!this.rung2){this.rung2=true;this.ring(1);}
      if(this.st_t>(this.double?2.0:1.35)){this.state='recover';this.st_t=0;this.win=1.1;}}
    else if(s==='toll'){                                                   // N strokes: each throws a low wave in from the far side — jump them on the beat
      const t0=.85,gap=Math.max(.52,.7-this.phase*.06);
      if(this.tollI<this.tollN&&this.st_t>=t0+this.tollI*gap){const i=this.tollI++;g.audio.play('boom');g.camera.shake(.22);
        const side=i%2?1:-1,sx=clamp(p.x+side*(300+rand(0,100)),this.x0+40,this.x1-40),dir=Math.sign(p.x-sx)||-side;
        const w=new ExpWave(g,sx,this.base,dir,this.x0,this.x1);w.sp=265+this.phase*22;g.level.entities.push(w);g.particles.ring(sx,this.base-8,C.fireL,46,.3);g.particles.dust(sx,this.base,6,1.2);}
      if(this.tollI>=this.tollN&&this.st_t>t0+this.tollN*gap+.55){this.state='recover';this.st_t=0;this.win=1.0;}}
    else if(s==='sweep'){                                                  // long rod, low swing: hop it (or dash through) — chained into a slam from phase 2
      const tw=this.chain?.62:.74;
      if(this.st_t<tw){this.dir=Math.sign(p.x-this.x)||this.dir;if(Math.abs(p.x-this.x)>150&&this.st_t<.45)this.x=clamp(this.x+this.dir*190*dt,lo,hi);this.rod=lerp(this.rod,-1.3,.2);}
      else if(this.st_t<tw+.2){if(!this.swung){this.swung=true;g.audio.play('flame');g.camera.shake(.15);g.particles.dust(this.x+this.dir*90,this.base,6,1.2);}
        this.rod=lerp(this.rod,2.2,.5);
        this.hurtBody({l:this.dir>0?this.x+8:this.x-190,r:this.dir>0?this.x+190:this.x-8,t:this.base-44,b:this.base},this.dir);}
      else if(this.chain==='smash')this.begin('smash');
      else{this.state='recover';this.st_t=0;this.win=.65;}}
    else if(s==='smash'){                                                  // overhead slam: the red mark on the floor is where it lands
      const gx=this.x+this.dir*135;
      if(this.st_t<.72)this.rod=lerp(this.rod,-.35,.2);
      else if(this.st_t<.92){if(!this.swung){this.swung=true;g.audio.play('boom');g.camera.shake(.5);g.particles.dust(gx,this.base,10,1.6);g.particles.debris(gx,this.base-10,10,[C.steel,C.rust,'#1a2026']);g.particles.ring(gx,this.base-6,C.fireL,80,.35);
          if(this.phase>=1)for(const d of[-1,1]){const w=new ExpWave(g,gx+d*30,this.base,d,this.x0,this.x1);w.sp=300;g.level.entities.push(w);}}
        this.rod=lerp(this.rod,2.05,.6);pHit(g,this,{l:gx-42,r:gx+42,t:this.base-180,b:this.base},this.dir);}
      else{this.state='stuck';this.st_t=0;this.win=1.15;}}
    else if(s==='stuck'){this.rod=2.05;if(this.st_t>this.win){this.state='idle';this.st_t=-.1;}}
    else if(s==='hands'){                                                  // two clock hands sweep out of the dial — keep your distance or hop them; then the clock is overwound
      const H=this.hands,tel=.95,act=this.phase>=2?3.1:2.7,w1=this.phase>=2?2.4:1.9,w2=-(this.phase>=2?1.5:1.15);H.t+=dt;
      this.dir=Math.sign(p.x-this.x)||this.dir;
      if(H.t>tel){const u=H.t-tel;H.a1=-Math.PI/2+w1*u;H.a2=-Math.PI/2+w2*u;
        const cx=this.x,cy=this.base-71;
        for(const [a,len] of[[H.a1,340],[H.a2,225]]){let tx=cx+Math.cos(a)*len,ty=cy+Math.sin(a)*len;
          if(ty>this.base-4){const k=(this.base-4-cy)/(ty-cy);tx=cx+(tx-cx)*k;ty=this.base-4;}
          if(!p.dead&&segHitsBox(cx,cy,tx,ty,p.hbox(),6))p.hurt(Math.sign(p.x-cx)||1);}
        if(this.phase>=2&&!H.rung&&H.a1>=Math.PI/2){H.rung=true;this.ring(1);}   // the hour strikes when the minute hand reaches the floor
        if(u>act){this.state='overwind';this.st_t=0;this.win=2.3;this.hands=null;g.audio.play('stomp');g.camera.shake(.4);g.particles.steam(this.x,this.y-80,12,0,-70,14);this.bark('…태엽이… 풀린다.');}}}
    else if(s==='overwind'){if(Math.random()<.18)g.particles.steam(this.x+rand(-20,20),this.y-100,1,0,-60,8);if(this.st_t>this.win){this.state='idle';this.st_t=-.1;}}
    else if(s==='peal'){                                                   // bells fall where the marks glow, one beat apart
      const n=this.phase>=2?5:4;
      if(!this.fired){this.fired=true;const offs=shuffle([-270,-135,0,135,270]);
        for(let i=0;i<n;i++)g.level.entities.push(new ExpDrop(g,clamp(p.x+offs[i],this.x0+50,this.x1-50),this.base,.7+i*.3,'bell'));g.audio.play('hum');}
      this.rod=lerp(this.rod,-1,.1);
      if(this.st_t>.7+n*.3+.8){this.state='recover';this.st_t=0;this.win=.9;}}
    else if(s==='call'){
      if(this.st_t>=.8&&!this.rung){this.rung=true;this.summon();}
      if(this.st_t>1.4){this.state='recover';this.st_t=0;this.win=1.3;}}
    else if(s==='recover'){if(this.st_t>this.win){this.state='idle';this.st_t=-.2;}}
    else if(s==='wind'){                                                   // crouch, track the player, lock for the last .25s
      if(this.st_t<(this.phase>=2?.45:.55))this.dir=Math.sign(p.x-this.x)||this.dir;
      if(this.st_t>(this.phase>=2?.7:.8)){this.state='charge';this.st_t=0;g.audio.play('flame');g.camera.shake(.25);}}
    else if(s==='charge'){
      this.x+=this.dir*(this.phase>=2?560:500)*dt;const hit=this.x<=lo||this.x>=hi;this.x=clamp(this.x,lo,hi);
      if(Math.random()<.7)g.particles.sparks(this.x-this.dir*26,this.y,1,C.fireL,.3);
      this.hurtBody({l:this.x-38,r:this.x+38,t:this.y-58,b:this.y},this.dir);
      if(hit){this.state='stagger';this.st_t=0;g.camera.shake(.8);g.audio.play('boom');g.particles.dust(this.x,this.y,16,2.4);g.particles.debris(this.x+this.dir*30,this.y-60,10,[C.steel,C.rust,'#1a2026']);
        this.rung=false;g.toast('브람이 벽에 부딪혀 자세가 무너졌다 · 지금이다');}}
    else if(s==='stagger'){if(this.st_t>(this.phase>=2?2.2:2.5)){this.state='idle';this.st_t=-.1;}}
    // a body that is not charging is only dangerous to lean on
    if(this.state!=='charge'&&this.state!=='dying')this.hurtBody({l:this.x-24,r:this.x+24,t:this.y-96,b:this.y},Math.sign(p.x-this.x)||1);}
  begin(a){const g=this.g,p=g.player;this.st_t=0;this.rung=false;this.rung2=false;this.swung=false;this.chain=null;this.fired=false;this.dir=Math.sign(p.x-this.x)||this.dir;
    const talk={bell:['…점호.','이름을 읽는다.'],toll:['종이 울린다.','박자를 세어라.'],sweep:['정렬.','열을 맞춰라.'],charge:['교대 시간이다!','퇴근이다—!'],hands:['시간이 돈다.','시계를 보라.'],peal:['전원 집합.','종소리에 맞춰 서라.'],call:['신입. 교대 서라.']};
    if(a==='bell'||a==='bell2'){this.state='bell';this.double=a==='bell2';g.audio.play('hum');this.barkMaybe(talk.bell);}
    else if(a==='toll'){this.state='toll';this.tollN=3+this.phase;this.tollI=0;g.audio.play('hum');this.barkMaybe(talk.toll);}
    else if(a==='sweep'){this.state='sweep';g.audio.play('hum');this.barkMaybe(talk.sweep);}
    else if(a==='combo'){this.state='sweep';this.chain='smash';g.audio.play('hum');this.barkMaybe(talk.sweep);}
    else if(a==='smash'){this.state='smash';g.audio.play('hum');}
    else if(a==='charge'){this.state='wind';g.audio.play('hum');this.barkMaybe(talk.charge);}
    else if(a==='hands'){this.state='hands';this.hands={t:0,rung:false};g.audio.play('hum');this.barkMaybe(talk.hands);}
    else if(a==='peal'){this.state='peal';this.barkMaybe(talk.peal);}
    else if(a==='call'){this.state='call';g.audio.play('hum');this.barkMaybe(talk.call);}}
  ring(n){const g=this.g;g.audio.play('boom');g.camera.shake(.45);g.particles.ring(this.x,this.y-4,C.fireL,70,.4);
    for(const d of[-1,1])g.level.entities.push(new ExpWave(g,this.x+d*40,this.y,d,this.x0,this.x1));}
  summon(){const g=this.g,alive=g.level.entities.filter(e=>e instanceof ExpChecker&&!e.dead&&e._exSummon).length;g.audio.play('boom');g.camera.shake(.4);
    const need=Math.max(0,3-alive),pl=g.player;
    for(let i=0;i<Math.min(2,need);i++){const sx=clamp(pl.x+(i?220:-220),this.x0+90,this.x1-90),c=new ExpChecker(g,sx,this.base-170);c._exSummon=true;c._exOf='bram';c.st='scan';c.st_t=.1;g.level.entities.push(c);g.particles.sparks(sx,this.base-170,14,C.fire);}
    g.particles.ring(this.x,this.y-100,C.warn,90,.5);}
  rimBox(){return {x:this.x-60,y:this.y-130,w:120,h:134};}
  draw(ctx){const x=this.x,y=this.y,s=this.state,d=this.dir,t=this.t,dead=s==='dying',H=this.hands;
    const crouch=(s==='wind'||s==='charge')?26:0,sway=(s==='idle'||s==='recover'||s==='dormant'||s==='stuck')?Math.sin(t*1.8)*1.2:0;
    const open=s==='stagger'||s==='overwind';
    ctx.save();ctx.translate(x,y);ctx.scale(d,1);
    if(dead)ctx.translate((Math.random()-.5)*4,0);
    // legs
    ctx.fillStyle='#14181c';ctx.fillRect(-30,-8,26,8);ctx.fillRect(6,-8,26,8);
    ctx.fillStyle='#34414c';ctx.fillRect(-24,-46+crouch*.4,14,40-crouch*.4);ctx.fillRect(12,-46+crouch*.4,14,40-crouch*.4);ctx.fillStyle=C.brassD;ctx.fillRect(-24,-30,14,3);ctx.fillRect(12,-30,14,3);
    // torso (hunches during the charge)
    const ty=-98+crouch+sway;ctx.save();ctx.translate(0,ty);if(crouch)ctx.rotate(.18);
    ctx.fillStyle='#232c34';ctx.fillRect(-36,0,72,56);ctx.fillStyle='#3a4855';ctx.fillRect(-33,3,66,50);ctx.fillStyle=C.brassD;ctx.fillRect(-36,0,72,5);ctx.fillRect(-36,50,72,6);
    rivet(ctx,-30,8,2);rivet(ctx,30,8,2);rivet(ctx,-30,46,2);rivet(ctx,30,46,2);
    // clock face: dark when dormant, red-ringed in the fight, flipped open (core) when exposed
    ctx.fillStyle='#0a0d10';circ(ctx,0,27,23);ctx.fillStyle=open?'#06282c':'#d8d2bc';circ(ctx,0,27,19);
    ctx.strokeStyle=s==='dormant'?'#46566a':(open?C.cyan:C.fire);ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,27,21,0,7);ctx.stroke();
    if(open){ctx.fillStyle=C.cyan;circ(ctx,0,27,8+Math.sin(t*14)*1.5);ctx.fillStyle='#e8ffff';circ(ctx,-2,25,3);
      ctx.strokeStyle='rgba(63,246,255,.7)';ctx.lineWidth=2;for(let i=0;i<8;i++){const a=i/8*6.283+t*2;ctx.beginPath();ctx.moveTo(Math.cos(a)*11,27+Math.sin(a)*11);ctx.lineTo(Math.cos(a)*17,27+Math.sin(a)*17);ctx.stroke();}}
    else{ctx.strokeStyle='#14181c';ctx.lineWidth=2;for(let i=0;i<12;i++){const a=i/12*6.283;ctx.beginPath();ctx.moveTo(Math.cos(a)*15,27+Math.sin(a)*15);ctx.lineTo(Math.cos(a)*18,27+Math.sin(a)*18);ctx.stroke();}
      let a1=s==='dormant'?1.2:t*(s==='bell'||s==='call'||s==='toll'?5:1.2),a2=s==='dormant'?4.1:t*.1;if(H&&H.a1!==undefined){a1=H.a1;a2=H.a2;}
      ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(0,27);ctx.lineTo(Math.cos(a1)*15,27+Math.sin(a1)*15);ctx.stroke();ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,27);ctx.lineTo(Math.cos(a2)*10,27+Math.sin(a2)*10);ctx.stroke();}
    // head
    ctx.fillStyle='#2a343d';ctx.fillRect(-14,-22,28,20);ctx.fillStyle=C.brassD;ctx.fillRect(-16,-24,32,5);
    ctx.fillStyle='#0a0d10';ctx.fillRect(2,-17,12,6);ctx.fillStyle=s==='dormant'?'#2a1a10':(dead?'#3a1a0e':C.fire);ctx.fillRect(4,-16,8,3);
    ctx.fillStyle='#8a96a0';ctx.fillRect(-4,-30,8,8);ctx.fillStyle=C.brass;ctx.fillRect(-2,-34,4,5);   // whistle
    ctx.restore();
    // arms: roll-call rod on the back arm, bell on the front arm
    const bellUp=s==='bell'||s==='call'||s==='toll'?clamp(this.st_t/.5,0,1):0,ba=-.4-bellUp*1.9;
    ctx.save();ctx.translate(30,ty+14);ctx.rotate(ba);ctx.fillStyle='#46566a';ctx.fillRect(0,-5,32,10);
    ctx.translate(32,0);ctx.fillStyle=C.brass;ctx.beginPath();ctx.moveTo(-8,8);ctx.lineTo(-5,-10);ctx.lineTo(5,-10);ctx.lineTo(8,8);ctx.fill();ctx.fillStyle=C.brassL;ctx.fillRect(-4,-12,8,3);
    if(((s==='bell'&&this.st_t>.9&&this.st_t<1.1))||(s==='toll'&&this.tollI>0&&this.st_t%.66<.18)){ctx.strokeStyle='rgba(255,226,160,.9)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,16,0,7);ctx.stroke();}
    ctx.restore();
    const long=s==='sweep'?140:(s==='smash'||s==='stuck')?180:60;
    ctx.save();ctx.translate(-30,ty+16);ctx.rotate(this.rod);ctx.fillStyle='#46566a';ctx.fillRect(-6,-5,18,10);ctx.fillStyle='#8a96a0';ctx.fillRect(-3,-long,6,long+10);ctx.fillStyle=C.brass;ctx.fillRect(-6,-long-2,12,6);
    if(s==='sweep'||s==='smash'){ctx.fillStyle='#5a6c7a';ctx.fillRect(-6,-long*.5,12,3);}ctx.restore();
    if(this.flash>0){ctx.globalAlpha=Math.min(.7,this.flash*6);ctx.fillStyle='#fff';ctx.fillRect(-36,ty,72,56);ctx.globalAlpha=1;}
    ctx.restore();
    // telegraphs
    if(s==='wind'){const k=clamp(this.st_t/.8,0,1),len=Math.abs((this.dir>0?this.x1-60:this.x0+60)-this.x);ctx.fillStyle=`rgba(255,106,40,${.12+.3*k})`;ctx.fillRect(this.dir>0?x:x-len,y-3,len,3);
      ctx.fillStyle=C.fire;ctx.font='bold 16px '+MONO;ctx.textAlign='center';ctx.fillText('!',x,y-148);}
    if(s==='bell'||s==='call'){const k=clamp(this.st_t/.9,0,1);ctx.strokeStyle=`rgba(255,200,120,${.2+.5*k})`;ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y-108,22+k*40,0,7);ctx.stroke();}
    if(s==='toll'){for(let i=0;i<this.tollN;i++){const on=i<this.tollI;ctx.fillStyle=on?'#ffe2a0':'rgba(255,200,120,.25)';circ(ctx,x+(i-(this.tollN-1)/2)*18,y-150,on?5:4);}
      if(this.tollI<this.tollN){const k=clamp((this.st_t-.85)/.5,0,1);ctx.strokeStyle=`rgba(255,200,120,${.2+.4*k})`;ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y-108,22+k*30,0,7);ctx.stroke();}}
    if(s==='sweep'&&this.st_t<(this.chain?.62:.74)){const k=clamp(this.st_t/.7,0,1);ctx.fillStyle=`rgba(255,106,40,${.1+.28*k})`;ctx.fillRect(d>0?x+8:x-190,y-44,182,44);ctx.fillStyle=C.fire;ctx.font='bold 14px '+MONO;ctx.textAlign='center';ctx.fillText(this.chain?'▲ ▼':'▲',x,y-140);}
    if(s==='smash'){const gx=x+d*135,k=clamp(this.st_t/.72,0,1);if(this.st_t<.92){ctx.fillStyle=`rgba(255,80,40,${.14+.34*k})`;ctx.fillRect(gx-42,y-180,84,180);ctx.fillStyle=`rgba(255,160,70,${.5+.4*k})`;ctx.fillRect(gx-42,y-4,84,4);}}
    if(s==='hands'&&H){const cx=x,cy=y-71;
      if(H.a1===undefined){const k=clamp(H.t/.95,0,1);ctx.setLineDash([6,6]);ctx.strokeStyle=`rgba(255,120,60,${.3+.5*k})`;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx,cy-340);ctx.stroke();ctx.setLineDash([]);
        ctx.strokeStyle=`rgba(255,120,60,${.2+.4*k})`;ctx.beginPath();ctx.arc(cx,cy,340,0,7);ctx.stroke();ctx.fillStyle=C.fire;ctx.font='bold 16px '+MONO;ctx.textAlign='center';ctx.fillText('!',x,y-150);}
      else for(const [a,len,wd] of[[H.a1,340,9],[H.a2,225,12]]){let tx=cx+Math.cos(a)*len,ty2=cy+Math.sin(a)*len;if(ty2>y-4){const k=(y-4-cy)/(ty2-cy);tx=cx+(tx-cx)*k;ty2=y-4;}
        ctx.lineCap='round';ctx.strokeStyle='rgba(255,138,42,.35)';ctx.lineWidth=wd+8;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(tx,ty2);ctx.stroke();
        ctx.strokeStyle='#d8d2bc';ctx.lineWidth=wd;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(tx,ty2);ctx.stroke();ctx.strokeStyle=C.fire;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(tx,ty2);ctx.stroke();ctx.lineCap='butt';
        if(Math.random()<.5)this.g.particles.sparks(tx,ty2,1,C.fireL,.3);}}
    if(open){ctx.fillStyle=C.cyan;ctx.font='bold 11px '+MONO;ctx.textAlign='center';ctx.fillText(s==='overwind'?'▼ 태엽 과권 · 노출':'▼ 노출',x,y-150+Math.sin(t*8)*2);}
    if(s==='stuck'){ctx.fillStyle='#ffd27a';ctx.font='bold 11px '+MONO;ctx.textAlign='center';ctx.fillText('▼ 막대가 박혔다',x,y-150+Math.sin(t*8)*2);}
    this.drawSay(ctx,x,y-168);}
  glow(ctx){const s=this.state;if(s==='dormant')return;const open=s==='stagger'||s==='overwind';glow(ctx,this.x,this.y-70,open?90:50,open?CY:FI,open?.6:.3);}
  lights(add,CYC,ORG){if(this.state==='dormant')return;const open=this.state==='stagger'||this.state==='overwind';add(this.x,this.y-70,open?170:130,open?CYC:ORG,.6);}
}

// 압력 징수관 벨로 · 징수(청구서 · 포격 · 증기 사냥) → 압류(굴림 · 일제 포격) → 집행(압류 흡인 · 증기 폭풍)
//   zone fighter: fires at three heights you have to read, hunts you with steam, rolls over the hall, and reels you in for a claim.
//   openings: the purge (core open; clamp minions hold the shell shut) and the wall-slam stall after a roll.
class ExpBello extends ExpBoss{
  constructor(g,x,y,lo,hi){super(g,'bello',x,y,lo,hi);this.w=124;this.h=110;this.gauge=0;this.shield=false;this.aim=0;this.slideT=0;this.fired=false;this.warned=false;this.rollDir=1;this.shots=0;this.slipKinds=[];this.stormT=0;}
  reset(){super.reset();this.gauge=0;this.shield=false;this.slideT=0;this.fired=false;this.warned=false;this.shots=0;this.stormT=0;}
  clamps(){return this.g.level.entities.filter(e=>e instanceof ExpClamp&&!e.dead&&!e._exNeutral);}
  vuln(){const s=this.state;if(s==='purge')return this.shield?.35:1;if(s==='stall')return .8;return .12;}
  afterHit(){const f=this.hp/this.maxHp;
    if(this.phase===0&&f<=.65){this.phase=1;this.beatQ.push(1);this.feed();}
    else if(this.phase===1&&f<=.3){this.phase=2;this.beatQ.push(2);this.feed();}}
  beatLines(n){return n===1?
    [['bello','저항 항목 기록. 비고란에 적는다.'],['bello','이 구역 징수 대상 가구, 4,212. 이번 분기 징수율 97%.'],['lin','97이라고? 그럼 그 사람들은 어떻게 버텼어?'],['bello','버틴 것이 아니다. 버티도록 계산했다. 한 칸씩.']]:
    [['bello','…장부를 펼친다. 모든 가구의 비고란에 같은 숫자가 있다.'],['lin','…"잔액 1".'],['bello','거버너의 지침은 0이었다. 나는 1을 남겼다. 이것이 내 유일한 오차다.'],['bello','오차는 집행되어야 한다. 집행관인 나 자신도 예외가 아니다.'],['lin','그래서 날 막는 거야? 스스로를 집행해 달라고?'],['bello','…대답은 장부에 없다. 압류를 개시한다!']];}
  afterBeat(n){const g=this.g;if(n===1)g.toast('벨로 · 압류 집행 — 굴러 오는 보일러와 일제 포격을 조심해라');else g.toast('벨로 · 집행 개시 — 흡인과 증기 폭풍');}
  feed(){const g=this.g;this.bark('집게 투입.');g.audio.play('boom');g.camera.shake(.5);
    const n=Math.max(0,2-this.clamps().length);
    for(let i=0;i<n;i++){const sx=i?this.x1-110:this.x0+110,c=new ExpClamp(g,sx,this.base);c._exSummon=true;c._exOf='bello';c.dir=i?-1:1;g.level.entities.push(c);g.particles.sparks(sx,this.base-10,14,C.fire);}}
  makeBag(){const ph=this.phase;let a=ph===0?['lob','ledger','vents']:ph===1?['barrage','roll','ledger','vents']:['seize','chase','barrage','roll','ledger'];shuffle(a);return a;}
  update(dt){const g=this.g,p=g.player;if(this.common(dt))return;
    this.shield=this.clamps().length>0&&this.fighting;
    this.st_t+=dt;this.tickSay(dt);const lo=this.x0+90,hi=this.x1-90,s=this.state;
    if(s==='dormant'||s==='intro'){this.y=this.base;return;}
    if(this.beatReady())return this.runBeat();
    this.aim=lerp(this.aim,clamp((p.x-this.x)/260,-1,1),.1);
    if(s==='idle'){this.dir=Math.sign(p.x-this.x)||this.dir;
      const d=Math.abs(p.x-this.x),want=d>340?1:d<200?-1:0;this.x=clamp(this.x+this.dir*want*58*dt,lo,hi);
      if(this.st_t>Math.max(.55,1.0-this.phase*.17)){this.begin(this.gauge>=3?'purge':this.nextAct());}}
    else if(s==='lob'){
      if(this.st_t>=.9&&!this.fired){this.fired=true;g.audio.play('shoot');g.camera.shake(.2);
        g.level.entities.push(new ExpCanister(g,this.x+this.dir*30,this.y-this.h,clamp(p.x,this.x0+30,this.x1-30),this.base));}
      if(this.st_t>1.7){this.gauge++;this.state='idle';this.st_t=0;}}
    else if(s==='barrage'){                                               // three canisters, a beat apart, bracketing where you stood
      const offs=[-150,0,150];
      while(this.shots<3&&this.st_t>=.8+this.shots*.4){const tx=clamp(p.x+offs[this.shots]+rand(-20,20),this.x0+30,this.x1-30);
        g.audio.play('shoot');g.camera.shake(.15);g.level.entities.push(new ExpCanister(g,this.x+this.dir*30,this.y-this.h,tx,this.base));this.shots++;}
      if(this.st_t>2.6){this.gauge++;this.state='idle';this.st_t=0;}}
    else if(s==='vents'){
      if(this.st_t>=.1&&!this.fired){this.fired=true;g.audio.play('hum');
        const xs=this.phase>=2?[-300,-150,0,150,300]:[-200,0,200],off=clamp(p.x,this.x0+300,this.x1-300);
        xs.forEach((dx,i)=>{const vx=clamp(off+dx,this.x0+40,this.x1-40);g.level.entities.push(new ExpJet(g,vx,this.base,.85+(this.phase>=2?i*.16:0),.8));});}
      if(this.st_t>1.9+(this.phase>=2?.5:0)){this.gauge++;this.state='idle';this.st_t=0;}}
    else if(s==='chase'){                                                 // steam hunt: a jet erupts under wherever you stand, again and again
      const n=this.phase>=2?6:5,gap=.62;
      while(this.shots<n&&this.st_t>=.3+this.shots*gap){const lead=clamp(p.vx*.35,-70,70),x=clamp(p.x+lead,this.x0+40,this.x1-40);
        g.level.entities.push(new ExpJet(g,x,this.base,.78,.65));
        if(this.phase>=2&&this.shots%2===1)g.level.entities.push(new ExpJet(g,clamp(p.x+(Math.random()<.5?-1:1)*115,this.x0+40,this.x1-40),this.base,.78,.65));
        this.shots++;g.audio.play('hum');}
      if(this.st_t>.3+n*gap+1.3){this.gauge++;this.state='idle';this.st_t=0;}}
    else if(s==='ledger'){                                                // billing slips at three heights: low = hop, mid = hop or dash, high = stay on the ground
      const kinds=this.slipKinds,t0=.8,gap=.5;
      while(this.shots<kinds.length&&this.st_t>=t0+this.shots*gap){const k=kinds[this.shots++],yy=this.base-(k==='low'?16:k==='mid'?52:96);
        g.audio.play('shoot');g.camera.shake(.1);g.particles.steam(this.x+this.dir*60,yy,3,this.dir*60,0,3);g.level.entities.push(new ExpSlip(g,this.x+this.dir*60,yy,this.dir,k,this.x0,this.x1));}
      if(this.st_t>t0+kinds.length*gap+1.0){this.gauge++;this.state='idle';this.st_t=0;}}
    else if(s==='roll'){                                                  // rev, then roll over the hall — hop it or take the ledge; the wall slam leaves the boiler open
      if(this.st_t<.95){this.dir=Math.sign(p.x-this.x)||this.dir;this.rollDir=this.dir;if(Math.random()<.5)g.particles.steam(this.x-this.dir*52,this.y-8,1,-this.dir*70,-20,6);if(this.st_t<.15)g.audio.play('hum');}
      else{if(!this.fired){this.fired=true;g.audio.play('flame');g.camera.shake(.3);}
        this.x+=this.rollDir*(this.phase>=2?480:430)*dt;if(Math.random()<.7)g.particles.dust(this.x-this.rollDir*56,this.y,1,1.2);
        if(this.x<=lo||this.x>=hi){this.x=clamp(this.x,lo,hi);this.state='stall';this.st_t=0;this.win=2.1;g.camera.shake(.8);g.audio.play('boom');g.particles.dust(this.x,this.y,16,2.4);g.particles.debris(this.x+this.rollDir*50,this.y-70,12,[C.steel,C.rust,C.brass]);
          const offs=shuffle([-170,-40,90,230]);for(let i=0;i<3;i++)g.level.entities.push(new ExpDrop(g,clamp(p.x+offs[i],this.x0+50,this.x1-50),this.base,.55+i*.3,'canister'));
          this.bark('…과열. 장부가 번진다.');}}}
    else if(s==='stall'){if(Math.random()<.35)g.particles.steam(this.x+rand(-40,40),this.y-100,1,0,-70,10);if(this.st_t>this.win){this.state='idle';this.st_t=0;}}
    else if(s==='seize'){                                                 // reels you in, then claims everything within reach: stand firm against the pull, hop the claim
      const T1=1.9+(this.phase>=2?.1:0);
      if(this.st_t<T1){this.dir=Math.sign(p.x-this.x)||this.dir;
        if(!p.dead&&this.st_t>.35){const dx=this.x-p.x;if(Math.abs(dx)>80){const step=Math.sign(dx)*(100+this.phase*12)*dt,b=p.box();if(!g.level.tm.rectSolid(b.l+step,b.t,b.r+step,b.b-1))p.x+=step;}}
        if(Math.random()<.7){const sx=this.x+rand(-260,260);g.particles.add({x:sx,y:this.y-rand(8,80),vx:-Math.sign(sx-this.x)*rand(140,220),vy:0,life:.4,size:1.6,color:'rgba(220,235,240,.8)',type:'dot',add:true});}
        if(this.st_t>T1-.4&&!this.warned){this.warned=true;g.audio.play('hum');}}
      else{if(!this.fired){this.fired=true;this.slam();}
        if(this.st_t>T1+.8){this.gauge++;this.state='idle';this.st_t=0;this.warned=false;}}}
    else if(s==='purge'){                                                 // overpressure: shell hatches open, core exposed
      this.slideT=approach(this.slideT,this.st_t<this.win-.5?1:0,dt*2.5);
      if(Math.random()<.4)g.particles.steam(this.x+rand(-30,30),this.y-this.h,1,rand(-30,30),-80,8);
      if(this.phase>=2&&this.st_t>.7&&this.st_t<this.win-.9){this.stormT-=dt;if(this.stormT<=0){this.stormT=1.15;g.level.entities.push(new ExpJet(g,clamp(p.x+(Math.random()<.5?-90:90),this.x0+40,this.x1-40),this.base,.8,.6));}}
      if(this.st_t>this.win-.35&&!this.warned){this.warned=true;g.audio.play('hum');}
      if(this.st_t>this.win){this.slam();this.state='idle';this.st_t=0;this.gauge=0;this.slideT=0;}}
    this.hurtBody({l:this.x-56,r:this.x+56,t:this.y-80,b:this.y},Math.sign(p.x-this.x)||1);}
  begin(a){const g=this.g;this.st_t=0;this.fired=false;this.shots=0;this.warned=false;this.stormT=0;this.dir=Math.sign(g.player.x-this.x)||this.dir;
    if(this.gauge>=3&&a!=='purge')a='purge';
    if(a==='purge'){this.state='purge';this.win=this.shield?2.2:3.4;g.audio.play('steam');g.toast(this.shield?'벨로 과압 · 집게가 막고 있다 — 집게부터 정리하자':'벨로 과압 방출 · 코어가 노출됐다');}
    else{this.state=a;g.audio.play('hum');
      if(a==='ledger'){const k=shuffle(['low','mid','high']);if(this.phase>=1)k.push(Math.random()<.5?'low':'mid');this.slipKinds=k;this.barkMaybe(['청구서 발송.','항목별로 수령하라.']);}
      else if(a==='roll')this.barkMaybe(['회수 개시.','납기가 지났다.']);
      else if(a==='seize')this.bark('압류 집행.');
      else if(a==='lob'||a==='barrage')this.barkMaybe(['미납분을 징수한다.','온기는 사용분만큼.']);
      else if(a==='chase')this.barkMaybe(['거기, 열이 새고 있다.','발밑을 확인하라.']);}}
  slam(){const g=this.g,p=g.player;g.audio.play('boom');g.camera.shake(.6);g.particles.ring(this.x,this.y-6,C.warn,this.state==='seize'?130:110,.4);g.particles.steam(this.x,this.y-this.h,14,0,-80,14);
    const R=this.state==='seize'?130:120;
    if(!p.dead&&Math.abs(p.x-this.x)<R&&p.y>this.y-50)p.hurt(Math.sign(p.x-this.x)||1);}
  rimBox(){return {x:this.x-76,y:this.y-130,w:152,h:136};}
  draw(ctx){const x=this.x,y=this.y,s=this.state,t=this.t,d=this.dir,rev=s==='roll'&&this.st_t<.95;ctx.save();ctx.translate(x,y);
    if(s==='dying')ctx.translate((Math.random()-.5)*4,0);
    if(rev)ctx.translate((Math.random()-.5)*2.4,0);
    // treads
    const spin=s==='roll'?(this.st_t<.95?18:34):3;
    ctx.fillStyle='#14181c';rr(ctx,-62,-22,124,22,10);ctx.fill();ctx.fillStyle='#232c34';for(let i=0;i<9;i++){circ(ctx,-52+i*13,-11,7);}
    ctx.strokeStyle='#3a4855';ctx.lineWidth=2;for(let i=0;i<9;i++){const a=t*spin+i;ctx.beginPath();ctx.moveTo(-52+i*13,-11);ctx.lineTo(-52+i*13+Math.cos(a)*5,-11+Math.sin(a)*5);ctx.stroke();}
    // boiler
    ctx.fillStyle='#4a3410';ctx.beginPath();ctx.ellipse(0,-62,58,42,0,0,7);ctx.fill();ctx.fillStyle=s==='stall'?'#a4542a':'#8a6a2a';ctx.beginPath();ctx.ellipse(0,-64,54,38,0,0,7);ctx.fill();
    ctx.fillStyle='#b88e3a';ctx.beginPath();ctx.ellipse(-12,-76,34,16,-.2,0,7);ctx.fill();
    ctx.fillStyle='#e4c47c';ctx.fillRect(-52,-70,104,4);ctx.fillRect(-50,-48,100,4);
    for(let i=0;i<7;i++){rivet(ctx,-46+i*15.3,-68,1.6);rivet(ctx,-46+i*15.3,-46,1.6);}
    if(s==='stall'){ctx.strokeStyle='#2a1208';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-20,-96);ctx.lineTo(-8,-76);ctx.lineTo(-18,-60);ctx.moveTo(26,-90);ctx.lineTo(14,-70);ctx.lineTo(22,-52);ctx.stroke();}
    // top shell: slides apart in the purge
    const sl=this.slideT*26;ctx.fillStyle='#3a2a0c';ctx.fillRect(-18-sl,-108,36+sl*2,10);
    ctx.fillStyle='#6a5020';ctx.fillRect(-20-sl,-112,18,8);ctx.fillRect(2+sl,-112,18,8);
    if(s==='purge'&&this.slideT>.1){ctx.fillStyle=this.shield?'#2a6a78':C.cyan;circ(ctx,0,-100,6+this.slideT*4+Math.sin(t*14)*1.5);ctx.fillStyle='#e8ffff';circ(ctx,-1,-101,2.5);}
    // cannon
    ctx.save();ctx.translate(d*20,-96);ctx.rotate(d>0?-.6+(s==='lob'||s==='barrage'||s==='ledger'?-.25:0):Math.PI+.6-(s==='lob'||s==='barrage'||s==='ledger'?-.25:0));ctx.fillStyle='#46566a';ctx.fillRect(0,-7,44,14);ctx.fillStyle=C.brassD;ctx.fillRect(40,-9,8,18);ctx.restore();
    // pressure gauge on the front
    ctx.save();ctx.translate(d*32,-56);ctx.fillStyle='#0a0d10';circ(ctx,0,0,15);ctx.fillStyle='#d8d2bc';circ(ctx,0,0,12);
    ctx.strokeStyle=C.fire;ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,12,-.6,.9);ctx.stroke();
    const ga=-2.4+clamp(this.gauge/3,0,1)*3.6+(s==='purge'?Math.sin(t*40)*.15:0);ctx.strokeStyle='#14181c';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(ga)*10,Math.sin(ga)*10);ctx.stroke();ctx.restore();
    // visor
    ctx.fillStyle='#14181c';ctx.fillRect(d*18-9,-92,18,8);ctx.fillStyle=s==='dormant'?'#2a1a10':C.fire;ctx.fillRect(d*18-6,-90,12,3);
    // ledger tags hanging off the front
    ctx.fillStyle='#eadfc0';for(let i=0;i<5;i++)ctx.fillRect(-40+i*17,-26+(i%2)*4,9,13);
    if(this.flash>0){ctx.globalAlpha=Math.min(.7,this.flash*6);ctx.fillStyle='#fff';ctx.beginPath();ctx.ellipse(0,-62,54,38,0,0,7);ctx.fill();ctx.globalAlpha=1;}
    ctx.restore();
    // shield bubble + feed links
    if(this.shield){const a=.18+.1*Math.sin(t*5);ctx.strokeStyle=`rgba(63,246,255,${a+.25})`;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,y-62,70,56,0,0,7);ctx.stroke();ctx.fillStyle=`rgba(63,246,255,${a*.4})`;ctx.fill();
      for(const c of this.clamps()){ctx.strokeStyle=`rgba(63,246,255,${.3+.3*Math.sin(t*9+c.x)})`;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(c.x,c.y-14);ctx.lineTo(x,y-40);ctx.stroke();}}
    // telegraphs
    if(s==='lob'){const k=clamp(this.st_t/.9,0,1),pl=this.g.player;ctx.fillStyle=`rgba(255,106,40,${.15+.4*k})`;ctx.fillRect(clamp(pl.x,this.x0+30,this.x1-30)-22,this.base-3,44,3);}
    if(s==='ledger'&&this.shots<this.slipKinds.length){const k=clamp(this.st_t/.8,0,1);this.slipKinds.forEach((kd,i)=>{if(i<this.shots)return;const yy=this.base-(kd==='low'?16:kd==='mid'?52:96),col=kd==='high'?'143,232,255':kd==='mid'?'255,226,138':'255,176,112';
      ctx.fillStyle=`rgba(${col},${.18+.4*k})`;ctx.fillRect(d>0?x+60:x-60-160,yy-2,160,4);ctx.fillStyle=`rgba(${col},${.6+.3*k})`;ctx.font='bold 10px '+MONO;ctx.textAlign='center';ctx.fillText(kd==='high'?'▼':'▲',x+d*(60+80),yy-6-i*0);});}
    if(s==='roll'){const k=clamp(this.st_t/.95,0,1),tx=this.rollDir>0?this.x1-90:this.x0+90,len=Math.abs(tx-x);if(this.st_t<.95){ctx.fillStyle=`rgba(255,106,40,${.1+.3*k})`;ctx.fillRect(this.rollDir>0?x:x-len,y-80,len,80);ctx.fillStyle=C.fire;ctx.font='bold 16px '+MONO;ctx.textAlign='center';ctx.fillText('!',x,y-140);}}
    if(s==='seize'){const T1=1.9+(this.phase>=2?.1:0),k=clamp(this.st_t/T1,0,1);for(let i=0;i<3;i++){const rr_=(1-((k*2.2+i/3)%1))*190+20;ctx.strokeStyle=`rgba(210,230,240,${.1+.25*k})`;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,y-6,rr_,rr_*.12+2,0,0,7);ctx.stroke();}
      ctx.strokeStyle=`rgba(255,138,42,${.25+.5*k})`;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,y-4,130,10,0,0,7);ctx.stroke();if(this.warned){ctx.fillStyle='rgba(255,138,42,.18)';ctx.beginPath();ctx.ellipse(x,y-4,130,10,0,0,7);ctx.fill();}}
    if(s==='purge'){ctx.fillStyle=this.shield?'#8bd0da':C.cyan;ctx.font='bold 11px '+MONO;ctx.textAlign='center';ctx.fillText(this.shield?'▼ 집게가 막는 중':'▼ 노출',x,y-132+Math.sin(t*8)*2);
      if(this.warned){ctx.strokeStyle='rgba(255,138,42,.7)';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,y-4,120,10,0,0,7);ctx.stroke();}}
    if(s==='stall'){ctx.fillStyle='#ffd27a';ctx.font='bold 11px '+MONO;ctx.textAlign='center';ctx.fillText('▼ 과열 · 장부가 번졌다',x,y-132+Math.sin(t*8)*2);}
    this.drawSay(ctx,x,y-146);}
  glow(ctx){const s=this.state;if(s==='dormant')return;const open=s==='purge'&&!this.shield;glow(ctx,this.x,this.y-70,s==='purge'?90:55,open?CY:FI,s==='purge'?.55:.3);}
  lights(add,CYC,ORG){if(this.state==='dormant')return;add(this.x,this.y-70,150,this.state==='purge'&&!this.shield?CYC:ORG,.55);}
}

// ------------------------------------------------------------------ boss flow (global frame)
function arenaOf(g,id){return EX(g).arenas[BOSSES[id].ch];}
function bossEnt(g,id){return liveEntities(g,e=>e._exBossEnt&&e.bid===id)[0]||null;}
function inHall(g,ar){const p=playerW(g);return p.x>=ar.x0&&p.x<ar.x1&&p.y>=ar.y&&p.y<ar.floor+90;}
function spawnBoss(g,id){
  const ar=arenaOf(g,id);if(!ar||flag(g,ar.flag))return null;
  removeWhere(g,e=>e._exBossEnt&&e.bid===id);
  const cls=id==='bram'?ExpBram:ExpBello,x=Math.round(ar.x1-(id==='bram'?300:340));
  return addWorld(g,new cls(g,x,ar.floor,ar.x0,ar.x1));}
function clearFx(g){removeWhere(g,e=>e._exFx||e._exSummon);}
function resetBoss(g,id,why){
  const b=bossEnt(g,id);glob(g,()=>{clearFx(g);});
  if(b&&b.state!=='dying'){b.reset();}
  const r=rt(g);if(r.boss[id])r.boss[id]=null;
  if(g.bossActive){g.bossActive=false;}
  if(g.camera.lock)g.camera.lock=null;
  r.bossBar=null;}
function lockCam(g,ar){g.camera.lock=Object.freeze({x0:ar.x0-30,x1:ar.x1+70});}
function introLines(id,g){const read=k=>!!g&&flag(g,'note.'+k);
  if(id==='bram'){const L=[['bram','…점호.'],['bram','미복귀 인원, 한 명. 확인 전에는 교대를 끝낼 수 없다.'],['lin','나는 돌아가는 길을 찾는 중이야. 비켜 줘.'],['bram','귀환 경로는 교대장이 승인한다. 이 문은 승인되지 않았다.']];
    if(read('bram.2'))L.push(['lin','명부를 봤어. 이름 하나만 확인 표시가 없더라.'],['bram','…그 칸을 읽었는가.']);
    else L.push(['lin','…8년이나 문을 닫고 있었다고?']);
    L.push(['bram','8년 3개월 11일. 점호는 하루도 거른 적이 없다. 대답하는 자는 없었다.'],['bram','대답하라. 교대 서라. …서지 않으면 정렬시킨다.']);return L;}
  const L=[['bello','…미납.'],['bello','온기는 사용분만큼 징수한다. 이 아래 숨은 사람들이 낸 건 한 번도 모자라지 않았다.'],['lin','돌려받으러 왔어. 그게 아니면 길만 빌릴게.']];
  if(read('bello.2'))L.push(['lin','영수증마다 "잔액 1"이라고 적혀 있던데. 그건 뭐야?'],['bello','…그 항목은 열람 대상이 아니다.']);
  L.push(['bello','징수표에 없는 말이군. 집행한다.']);return L;}
function afterLines(id){return id==='bram'?
  [['bram','…확인. 미복귀 인원, 없음.'],['bram','…아니. 있다. 아직 도착하지 않은 사람이 한 명 남아 있다.'],['bram','교대 종료. 교대 종료. …문을 열어 둔다. 약속이다.'],['lin','(시계의 초침이 멈췄다. 뒤쪽 배출 장치에 불이 들어온다. 문 옆 단말에 보고서가 떠 있다.)']]:
  [['bello','…집행 종료. 오차 1건 — 제거.'],['bello','압력을 돌려주면 아래 불은 꺼지지 않겠지. 다만 거버너는… 곧 알게 된다.'],['bello','서둘러라, 정비공. 정직한 자는 화를 늦게 내지 않는다.'],['lin','(압력계 바늘이 천천히 영으로 내려간다. 뒤쪽 점검 장치에 불이 들어온다. 문 옆 단말에 집행 보고서가 떠 있다.)']];}
function bossDefeated(g,id){
  const w=W_(g),r=res(g),B=BOSSES[id];if(flag(g,B.flag))return;
  setFlag(g,B.flag);w.bosses[id]=true;
  glob(g,()=>{clearFx(g);});
  neutralizeAll(g);
  g.bossActive=false;g.camera.lock=null;rt(g).bossBar=null;rt(g).boss[id]=null;
  claim(g,'boss.'+id,B.reward,B.name+' 격파');
  r.own[B.relic]=true;
  g.lore={text:id==='bram'?'유물 · 교대장의 안전 래칫\n브람의 가슴에서 떨어진 정지 장치. 멈춘 뒤의 첫 걸음을 지켜 준다. 공방장 모라가 모듈로 만들 수 있다.':
    '유물 · 안전 압력조절기\n벨로의 보일러에서 빠져나온 밸브. 여는 법은 잃었지만 닫는 법은 정확하다. 공방장 모라가 모듈로 만들 수 있다.',t:0};
  window.GH_WORLD.discover(g,'boss.'+id,B.name+' — 격파. '+(id==='bram'?'교대장실 뒤 배출 장치를 열면 정비소로 돌아가는 굴이 열린다.':'징수실 뒤 점검 장치를 열면 정비소로 돌아가는 배관이 열린다.'));
  refreshNPCs(g);g.audio.play('collect');g.persist();
  rt(g).after={id,t:0};   // the closing lines wait for the wreck to finish falling apart
}
// per-frame boss director
function control(g,dt){
  if(!on(g))return;const ex=EX(g),w=W_(g),r=rt(g),pl=playerW(g);
  if(r.after){r.after.t+=dt;
    if(r.after.t>2.9&&!g.dialogue.active&&!g.director.active&&!g.player.dead&&g.state==='play'){const id=r.after.id;r.after=null;
      g.dialogue.show(afterLines(id),()=>{g.toast(id==='bram'?'뒤쪽 단말의 보고서를 읽고, 배출 장치를 열어 보자':'뒤쪽 단말의 보고서를 읽고, 점검 장치를 열어 보자');});}}
  for(const id of['bram','bello']){
    const ar=ex.arenas[BOSSES[id].ch];if(!ar||flag(g,ar.flag))continue;
    const b=bossEnt(g,id);if(!b)continue;
    if(b._defeat&&!r.defeating){r.defeating=id;}
    if(b.state==='dying'){if(b._defeat){b._defeat=false;bossDefeated(g,id);}continue;}
    const inside=inHall(g,ar)&&!g.player.dead;
    if(b.state==='dormant'&&inside&&pl.x>ar.x0+3*T&&g.state==='play'&&!g.dialogue.active&&!g.director.active&&!r.boss[id]){
      r.boss[id]='intro';b.state='intro';g.bossActive=true;lockCam(g,ar);g.player.vx=0;
      g.dialogue.show(introLines(id,g),()=>{if(b.state==='intro'){b.start();r.boss[id]='fight';}});}
    else if(b.state==='intro'&&!g.dialogue.active&&!g.director.active&&!g.player.dead&&inHall(g,ar)){
      // another dialogue (a chapter intro, say) replaced ours and dropped its callback: never leave the fight stuck
      r.introWait=(r.introWait||0)+dt;if(r.introWait>.35){r.introWait=0;b.start();r.boss[id]='fight';}}
    else if(b.state!=='dormant'&&(!inHall(g,ar)||g.player.dead)){resetBoss(g,id,'left');}
    else if(b.fighting){r.bossBar={id,name:BOSSES[id].name,hp:b.hp,max:b.maxHp,shield:id==='bello'&&b.shield,state:b.state,phase:b.phase,exposed:b.vuln()>=.8};}
  }
  if(r.defeating){r.defeating=null;}
}


