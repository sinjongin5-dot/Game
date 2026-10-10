// ------------------------------------------------------------------ story notes · read at your own pace (PATCH v4)
// A few terminals along the road to each mid-boss. They are optional, never block the way, and can be re-read from any bench ("기록 보관함").
const NOTES={
  'bram.1':{title:'교대 안내문',where:'멈춘 구역',pages:[
    '【교대 규칙】\n제1조. 교대는 전 인원이 복귀해야 끝난다.\n제2조. 복귀하지 않은 이름은 명부에서 지우지 않는다.\n제3조. 교대장은 점호를 멈추지 않는다.',
    '(가장자리에 눌러쓴 손글씨)\n문은 8년째 잠겨 있다.\n열 사람이 없어서가 아니다. 닫는 법만 적혀 있고, 여는 법은 적혀 있지 않다.']},
  'bram.2':{title:'점호 명부 · 3반',where:'정비 연결로',pages:[
    '점호 명부 · 하층 7구역 3반\n제련공 ✓   배관공 ✓   윤활공 ✓\n용접공 ✓   짐꾼 ✓    짐꾼 ✓\n……',
    '거의 모든 이름 옆에 확인 표시가 있다.\n표시가 없는 이름은 단 하나뿐이다.',
    '7구역 공방 담당 · 정비공.\n기어하트 제작자.\n변전소 파견 — 미복귀.\n\n(이름 칸은 닳아서 읽을 수 없다. 누군가 수없이 손가락으로 쓸어 낸 자국이다.)']},
  'bram.3':{title:'교대장의 일지',where:'교대장실 앞',pages:[
    '오늘도 점호를 불렀다. 대답이 없다는 것은 아직 이름이 남아 있다는 뜻이다.\n이름이 남아 있는 한, 나는 퇴근할 수 없다.',
    '변전소로 떠나던 날, 그 정비공이 이 문 앞에서 말했다.\n"점호를 멈추지 말아 주게. 누군가 돌아올 문을 열어 두게."',
    '나는 점호를 멈추지 않았다.\n그리고 문을 닫았다. 돌아올 사람이 안전해야 하니까.\n\n…열어 두라는 말이 닫아 두라는 말은 아니었을 텐데. 나는 그 차이를 계산하지 못했다.']},
  'bram.e':{title:'교대 종료 보고서',where:'교대장실 뒤',needFlag:'boss.bram',pages:[
    '교대 종료 보고서\n미복귀 인원 확인: 1명\n사유 코드: 자원(自願)',
    '7구역 정비공은 파견 명령을 받은 것이 아니었다.\n대동력로의 태엽 장치에 스스로 접속했다.\n"도시의 박자를 멈추지 않으려면, 누군가는 계속 감고 있어야 한다."',
    '하단 비고.\n"손녀가 불을 켜러 오면, 이 문을 열어 주게."\n\n(린은 보고서를 오래 들여다보았다. 8년 동안 몰랐던 문장이 한 줄 더 있었다.)'],
    after:[['lin','…할아버지가 스스로 들어갔다고?'],['lin','나를… 기다리고 있었던 거야?']]},
  'bello.1':{title:'난방 징수 고지서',where:'배관 미로',pages:[
    '【난방 징수 고지서】\n하층 7구역 3동 · 11호\n이번 분기 사용분 징수. 납부 기한: 즉시.\n— 징수관 벨로',
    '(여백에 작은 글씨)\n비고: 잔액 1.']},
  'bello.2':{title:'영수증 뭉치',where:'톱니 탑',pages:[
    '영수증이 수십 장 꽂혀 있다. 전부 같은 줄이 적혀 있다.',
    '"집행 후 잔액 1 유지."\n사유: 영아 거주.   사유: 병상 환자.   사유: 불 켜진 창.',
    '거버너의 지침은 "잔액 0"이었다.\n지침과 영수증 사이에, 누군가의 거짓 한 줄이 있다.']},
  'bello.3':{title:'징수관의 변명',where:'징수실 앞',pages:[
    '거버너는 정직하다. 거짓말을 모른다.\n그래서 나는 장부에 거짓을 적을 수 없었다.',
    '대신 계산을 바꿨다. 같은 합계가 나오는 다른 분배를 찾았다.\n어떤 집은 조금 덜 내고, 어떤 집은 조금 더 낸다. 그리고 모든 집에 1을 남겼다.',
    '"1은 오차가 아니라 인사다."\n…라고 적었다가 지웠다.\n오차는 집행 대상이다. 장부는 그렇게 쓰여 있다.']},
  'bello.e':{title:'집행 종료 보고서',where:'징수실 뒤',needFlag:'boss.bello',pages:[
    '집행 종료.\n오차 1건(징수관 본인) 제거.\n조정 합계: 0.',
    '그러나 각 가구 비고란의 "1"은 남아 있다.\n오차를 지운 장부는 이제 거버너에게 제출된다.',
    '(린은 서둘러야 한다는 것을 알았다. 거버너는 곧 알게 될 것이다.)'],
    after:[['lin','…잔액 1. 그 한 줄 덕분에 아랫동네 불이 아직 켜져 있었구나.']]}
};
const NOTE_ORDER=['bram.1','bram.2','bram.3','bram.e','bello.1','bello.2','bello.3','bello.e'];
const notesRead=g=>NOTE_ORDER.filter(k=>flag(g,'note.'+k)).length;

class ExpNote extends Entity{
  constructor(g,x,y,id){super(g,x,y);this.id=id;this.w=26;this.h=44;this._exNote=true;}
  hidden(){const n=NOTES[this.id];return !!(n&&n.needFlag&&!flag(this.g,n.needFlag));}
  update(dt){this.t+=dt;}
  draw(ctx){if(this.hidden())return;const x=this.x,y=this.y,read=flag(this.g,'note.'+this.id),bob=Math.sin(this.t*2.4)*2;
    ctx.fillStyle='#14181c';ctx.fillRect(x-9,y-4,18,4);ctx.fillStyle='#2a343d';ctx.fillRect(x-2,y-30,4,28);
    ctx.save();ctx.translate(x,y-34);ctx.rotate(-.14);ctx.fillStyle='rgba(0,0,0,.4)';ctx.fillRect(-12,-9,26,22);
    ctx.fillStyle=read?'#a89e86':'#e8ddb8';ctx.fillRect(-13,-11,26,22);ctx.fillStyle=read?'#6a6250':'#8a7a50';ctx.fillRect(-13,-11,26,2);
    ctx.fillStyle='#4a3e28';for(let i=0;i<4;i++)ctx.fillRect(-9,-6+i*4,i%2?14:18,1.4);ctx.restore();
    if(!read){ctx.fillStyle='#ffe28a';ctx.font='bold 13px '+MONO;ctx.textAlign='center';ctx.fillText('…',x,y-58+bob);}
  }
  glow(ctx){if(this.hidden())return;const read=flag(this.g,'note.'+this.id);glow(ctx,this.x,this.y-34,read?22:44,'255,226,150',read?.12:.34+.1*Math.sin(this.t*3));}
  lights(add,CYC,ORG){if(this.hidden()||flag(this.g,'note.'+this.id))return;add(this.x,this.y-34,70,ORG,.35);}
}
function openReader(g,id,sub){
  const N=NOTES[id];if(!N)return;const first=!flag(g,'note.'+id);
  if(first){setFlag(g,'note.'+id);window.GH_WORLD.discover(g,'note.'+id,N.title+' — '+N.pages[0].replace(/\n/g,' ').slice(0,46)+'…');g.persist();}
  const spec={reader:true,id,page:0,typed:0,first};
  if(sub)subModal(g,spec);else openModal(g,spec);}
function closeReader(g,m){
  const N=NOTES[m.id],after=m.first&&N&&N.after;
  if(rt(g).modal&&rt(g).modal.stack&&rt(g).modal.stack.length)backModal(g);else closeModal(g);
  if(after)g.dialogue.show(after);}
function readerPre(g,dt,inp,m){
  const N=NOTES[m.id];if(!N){closeModal(g);return true;}const pg=N.pages[m.page];
  m.typed=Math.min(pg.length,(m.typed||0)+dt*(inp.down('attack')?420:62));
  if(inp.pressed('back')||inp.pressed('pause')){closeReader(g,m);return true;}
  if(inp.pressed('confirm')){
    if(m.typed<pg.length){m.typed=pg.length;}
    else if(m.page<N.pages.length-1){m.page++;m.typed=0;g.audio.play('click');}
    else{closeReader(g,m);return true;}}
  if(inp.pressed('left')&&m.page>0){m.page--;m.typed=N.pages[m.page].length;g.audio.play('click');}
  if(inp.pressed('right')&&m.typed>=pg.length&&m.page<N.pages.length-1){m.page++;m.typed=0;g.audio.play('click');}
  g.input._worldConfirmConsumed=true;return true;}
function drawReader(ctx,g,m){
  const N=NOTES[m.id];if(!N)return;const pg=N.pages[m.page],pw=600,ph=330,px=W/2-pw/2,py=H/2-ph/2-6;
  ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='rgba(4,7,9,.78)';ctx.fillRect(0,0,W,H);
  ctx.fillStyle='rgba(0,0,0,.45)';ctx.fillRect(px+6,py+8,pw,ph);
  const gr=ctx.createLinearGradient(0,py,0,py+ph);gr.addColorStop(0,'#e6dcc0');gr.addColorStop(1,'#cfc3a2');ctx.fillStyle=gr;ctx.fillRect(px,py,pw,ph);
  ctx.strokeStyle='#8a7a50';ctx.lineWidth=2;ctx.strokeRect(px+10,py+10,pw-20,ph-20);
  ctx.fillStyle='rgba(120,90,40,.10)';ctx.beginPath();ctx.ellipse(px+pw-90,py+ph-70,60,40,.3,0,7);ctx.fill();
  ctx.textAlign='left';ctx.font='bold 21px '+FONT;ctx.fillStyle='#2b2118';ctx.fillText(N.title,px+34,py+52);
  ctx.font='12px '+FONT;ctx.fillStyle='#6a5a3a';ctx.fillText(N.where,px+34,py+72);
  ctx.fillStyle='#8a7a50';ctx.fillRect(px+34,py+82,pw-68,2);
  const hand=/^\(/.test(pg)||/^\s*"/.test(pg);
  ctx.font=(hand?'italic ':'')+'17px '+FONT;ctx.fillStyle=hand?'#3a2a58':'#2b2118';
  const txt=pg.slice(0,Math.floor(m.typed));wrapText(ctx,txt,px+36,py+118,pw-72,27);
  ctx.textAlign='right';ctx.font='11px '+MONO;ctx.fillStyle='#6a5a3a';ctx.fillText((m.page+1)+' / '+N.pages.length,px+pw-34,py+ph-24);
  ctx.textAlign='center';ctx.font='11px '+FONT;ctx.fillStyle='#6a5a3a';
  ctx.fillText((m.typed<pg.length?'Enter 전부 보기':m.page<N.pages.length-1?'Enter 다음 쪽':'Enter 닫기')+'  ·  ←→ 쪽 넘기기  ·  Esc 닫기',W/2,py+ph-24);
  ctx.restore();}
function archiveMenu(g){return {title:'기록 보관함',sub:'읽은 기록 '+notesRead(g)+' / '+NOTE_ORDER.length+' · 길에서 찾은 단말의 기록은 여기서 다시 읽는다.',build:(g)=>{
  const items=NOTE_ORDER.map(k=>{const N=NOTES[k],got=flag(g,'note.'+k);return {label:got?N.title:'? ? ?',right:got?N.where:'',enabled:got,desc:got?'':'아직 찾지 못한 기록이다.',run:()=>{openReader(g,k,true);}};});
  items.push({label:'닫기',run:()=>'close'});return items;}};}
// notes stand beside existing benches so they read as "rest a moment, read a page"
function placeNotes(g,ex){
  const S=RT(g),cpOf=(partId,idx)=>{const part=S.parts.find(p=>p.id===partId);if(!part)return null;
    const cps=part.level.entities.filter(e=>e instanceof Checkpoint&&!e._exTunnelBench).sort((a,b)=>a.x-b.x);const c=cps[Math.min(idx,cps.length-1)];
    if(!c)return null;const open=x=>!SOLID.has(tileWorld(g,x,c.y-16));return {x:open(c.x+62)?c.x+62:c.x-62,y:c.y};};
  const A1=ex.arenas[1],A2=ex.arenas[2],ar=(A,tile)=>({x:A.x+tile*T+16,y:A.floor});
  const spots={'bram.1':cpOf('c1:native',2),'bram.2':cpOf('r1.main-annex',0),'bram.3':ar(A1,3),'bram.e':ar(A1,54),
    'bello.1':cpOf('c2:native',1),'bello.2':cpOf('c3:native',1),'bello.3':ar(A2,3),'bello.e':ar(A2,54)};
  removeWhere(g,e=>e._exNote);
  for(const k of NOTE_ORDER){const s=spots[k];if(s)addWorld(g,new ExpNote(g,s.x,s.y,k));}}

// the hub folk react to what you have read on the road (each reaction once)
function lines(g,id){const L=linesBase(g,id),r=res(g),b1=flag(g,'boss.bram'),b2=flag(g,'boss.bello'),once=k=>{if(r.met[k])return false;r.met[k]=true;return true;};
  if(id==='orr'&&!b1&&flag(g,'note.bram.2')&&once('orr.note'))L.push(['orr','명부 보고 왔어? 이름 칸이 닳아 있었지.'],['orr','교대장이 8년 동안 그 칸만 쓸었대. 이기든 지든, 그 자리는 네 몫이야.']);
  if(id==='ine'&&!b2&&flag(g,'note.bello.2')&&once('ine.note'))L.push(['ine','영수증에 "잔액 1"이라고… 우리 집 난로가 꺼지지 않은 이유가 그거였나 봐.'],['ine','징수관이 나쁜 사람이었는지는 모르겠어. 정확한 사람이긴 했고.']);
  if(id==='soi'&&b1&&flag(g,'note.bram.e')&&once('soi.note'))L.push(['soi','언니 얼굴이 그래서 그랬구나. …할아버지 얘기, 맞지?'],['soi','나는 괜찮아. 같이 불 켜러 가자. 이번엔 약속 말고, 같이.']);
  if(id==='mora'&&b2&&flag(g,'note.bello.e')&&once('mora.note'))L.push(['mora','거버너가 장부를 받으면 가만있진 않겠지. 렌치 상태부터 보자.']);
  return L;}
