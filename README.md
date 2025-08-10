# Mediatheque

<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <title>WigglyPaint iOS</title>
  <link rel="manifest" href="manifest.webmanifest">
  <meta name="theme-color" content="#111111"/>
  <style>
    :root{--bg:#111;--fg:#f1f1f1;--muted:#777;--accent:#4fd1c5}
    html,body{height:100%;margin:0;background:var(--bg);color:var(--fg);font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
    #app{display:grid;grid-template-rows:auto 1fr auto;height:100%}
    header,footer{display:flex;gap:.5rem;align-items:center;padding:.5rem .75rem;background:#0d0d0d;border-bottom:1px solid #222}
    footer{border-top:1px solid #222;border-bottom:none;justify-content:space-between;flex-wrap:wrap}
    button,select,input[type="color"],input[type="range"]{background:#1a1a1a;color:#f1f1f1;border:1px solid #333;border-radius:.5rem;padding:.45rem .7rem}
    button:hover{border-color:#444}
    button[aria-pressed="true"]{background:var(--accent);color:#072220;border-color:#2bbbb0}
    label{font-size:.9rem;color:#c9c9c9}
    #canvas-wrap{position:relative;display:grid;place-items:center;background:#121212}
    canvas{background:#141414;touch-action:none;max-width:100%;max-height:100%;box-shadow:0 0 0 1px #222 inset}
    .spacer{flex:1}
    .row{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}
    .hint{color:var(--muted);font-size:.85rem}
    a.button{cursor:pointer;text-decoration:none}
  </style>
</head>
<body>
<div id="app">
  <header class="row">
    <button id="tool-pen" aria-pressed="true" title="펜 (P)">✒️ 펜</button>
    <button id="tool-eraser" aria-pressed="false" title="지우개 (E)">🩹 지우개</button>
    <div class="row">
      <label>색상 <input type="color" id="color" value="#f5f5f5"/></label>
      <label>굵기 <input type="range" id="size" min="1" max="32" value="6"/></label>
    </div>
    <div class="row">
      <label><input type="checkbox" id="wiggle" checked/> 흔들림</label>
      <label>세기 <input type="range" id="wiggleAmp" min="0" max="12" value="4"/></label>
      <label>속도 <input type="range" id="wiggleSpeed" min="1" max="120" value="30"/></label>
    </div>
    <div class="spacer"></div>
    <button id="undo" title="되돌리기 (Ctrl/Cmd+Z)">↶ 되돌리기</button>
    <button id="redo" title="다시하기 (Ctrl/Cmd+Y)">↷ 다시하기</button>
    <button id="clear">🗑️ 전체 지우기</button>
  </header>

  <div id="canvas-wrap">
    <canvas id="c" width="1600" height="900"></canvas>
  </div>

  <footer>
    <div class="row">
      <button id="play" aria-pressed="true" title="재생/일시정지 (Space)">▶︎ 재생</button>
      <button id="savePNG">🖼️ PNG 저장</button>
      <button id="exportVIDEO">🎞️ 애니메이션 내보내기</button>
      <a id="shareLink" class="button" download="wigglypaint.json">🔗 공유 저장</a>
      <input id="loadFile" type="file" accept="application/json" style="display:none"/>
      <button id="loadBtn">📂 불러오기</button>
      <span class="hint">iPhone은 가능한 코덱으로 자동 저장됩니다.</span>
    </div>
    <div class="row">
      <a id="installBtn" hidden>+ 설치</a>
      <span class="hint">오프라인 사용 가능 (PWA)</span>
    </div>
  </footer>
</div>

<script type="module">
/* --- Service Worker --- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', ()=> {
    navigator.serviceWorker.register('./sw.js').catch(console.warn);
  });
}

/* --- PWA 설치 버튼 --- */
let deferredPrompt=null;
const installBtn=document.getElementById('installBtn');
window.addEventListener('beforeinstallprompt', (e)=>{ e.preventDefault(); deferredPrompt=e; installBtn.hidden=false; });
installBtn?.addEventListener('click', async ()=>{ if(!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; installBtn.hidden=true; });

/* --- 상태 --- */
const canvas=document.getElementById('c');
const ctx=canvas.getContext('2d',{alpha:true, desynchronized:true});
let playing=true;
let tool='pen';
let color=document.getElementById('color').value;
let size=+document.getElementById('size').value;
let wiggleOn=document.getElementById('wiggle').checked;
let wiggleAmp=+document.getElementById('wiggleAmp').value;
let wiggleSpeed=+document.getElementById('wiggleSpeed').value;
let frame=0;
const strokes=[];  // {color,size,erase,points:[{x,y}]}
const undone=[];

/* --- UI --- */
const $ = (id)=>document.getElementById(id);
const pressToggle=(btn,val)=>btn.setAttribute('aria-pressed', String(!!val));
$('tool-pen').onclick=()=>{tool='pen'; pressToggle($('tool-pen'),true); pressToggle($('tool-eraser'),false);};
$('tool-eraser').onclick=()=>{tool='eraser'; pressToggle($('tool-pen'),false); pressToggle($('tool-eraser'),true);};
$('color').oninput=(e)=>color=e.target.value;
$('size').oninput=(e)=>size=+e.target.value;
$('wiggle').oninput=(e)=>wiggleOn=e.target.checked;
$('wiggleAmp').oninput=(e)=>wiggleAmp=+e.target.value;
$('wiggleSpeed').oninput=(e)=>wiggleSpeed=+e.target.value;
$('play').onclick=()=>{playing=!playing; pressToggle($('play'),playing);};
$('undo').onclick=()=>{ if(strokes.length){undone.push(strokes.pop()); saveLocal();}};
$('redo').onclick=()=>{ if(undone.length){strokes.push(undone.pop()); saveLocal();}};
$('clear').onclick=()=>{strokes.length=0; undone.length=0; saveLocal();};

$('savePNG').onclick=()=>{ const a=document.createElement('a'); a.download='wiggly.png'; a.href=canvas.toDataURL('image/png'); a.click(); };

$('loadBtn').onclick=()=> $('loadFile').click();
$('loadFile').addEventListener('change', async (e)=>{ const f=e.target.files?.[0]; if(!f) return; const text=await f.text(); try{ loadDoc(JSON.parse(text)); saveLocal(); }catch{ alert('잘못된 파일입니다.'); } });

const shareLink=$('shareLink');
shareLink.addEventListener('click', ()=>{ const blob=new Blob([JSON.stringify(doc(),null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); shareLink.href=url; setTimeout(()=>URL.revokeObjectURL(url),10000); });

window.addEventListener('keydown',(e)=>{ if(e.key==='p'||e.key==='P'){$('tool-pen').click();} if(e.key==='e'||e.key==='E'){$('tool-eraser').click();} if(e.code==='Space'){e.preventDefault();$('play').click();} });

/* --- 그리기 --- */
let drawing=false;
const getPos=(ev)=>{ const r=canvas.getBoundingClientRect(); return { x:(ev.clientX-r.left)*canvas.width/r.width, y:(ev.clientY-r.top)*canvas.height/r.height }; };
const startStroke=(p)=>{ undone.length=0; strokes.push({color: tool==='pen'?color:'#000', size, erase: tool==='eraser', points:[p]}); };
const addPoint=(p)=>{ const s=strokes[strokes.length-1]; if(!s) return; const prev=s.points[s.points.length-1]; const dx=p.x-prev.x, dy=p.y-prev.y; const dist=Math.hypot(dx,dy); const steps=Math.max(1, Math.floor(dist/2)); for(let i=1;i<=steps;i++){ s.points.push({x: prev.x + dx*i/steps, y: prev.y + dy*i/steps}); } };
canvas.addEventListener('pointerdown',(e)=>{ canvas.setPointerCapture(e.pointerId); drawing=true; const p=getPos(e); startStroke(p); saveLocal(); });
canvas.addEventListener('pointermove',(e)=>{ if(!drawing) return; addPoint(getPos(e)); saveLocalDebounced(); });
canvas.addEventListener('pointerup',()=>{ drawing=false; saveLocal(); });
canvas.addEventListener('pointercancel',()=>{ drawing=false; saveLocal(); });

/* --- Wiggle 렌더링 --- */
function seedNoise(n){ n = Math.sin(n)*43758.5453; return n - Math.floor(n); }
function noise2d(x,y){ const i=Math.floor(x), j=Math.floor(y), fx=x-i, fy=y-j; const v00=seedNoise(i*57+j*131), v10=seedNoise((i+1)*57+j*131), v01=seedNoise(i*57+(j+1)*131), v11=seedNoise((i+1)*57+(j+1)*131); const ix0=v00+(v10-v00)*fx, ix1=v01+(v11-v01)*fx; return ix0+(ix1-ix0)*fy; }
function jitterPoint(p, t, amp){ if(!wiggleOn||amp<=0) return p; const nx=noise2d(p.x*0.02 + t, p.y*0.02)-0.5; const ny=noise2d(p.x*0.02 - t, p.y*0.02)-0.5; return {x:p.x+nx*amp, y:p.y+ny*amp}; }
function drawStroke(s, t){ if(s.points.length<2) return; ctx.save(); ctx.lineCap='round'; ctx.lineJoin='round'; if(s.erase){ ctx.globalCompositeOperation='destination-out'; ctx.strokeStyle='rgba(0,0,0,1)'; } else { ctx.globalCompositeOperation='source-over'; ctx.strokeStyle=s.color; } ctx.lineWidth=s.size; ctx.beginPath(); let p0=jitterPoint(s.points[0], t, wiggleAmp); ctx.moveTo(p0.x, p0.y); for(let i=1;i<s.points.length;i++){ const p=jitterPoint(s.points[i], t+i*0.002, wiggleAmp); ctx.lineTo(p.x, p.y); } ctx.stroke(); ctx.restore(); }
function render(){ if(playing) frame++; ctx.clearRect(0,0,canvas.width,canvas.height); const t=frame/Math.max(1,wiggleSpeed); for(const s of strokes) drawStroke(s,t); requestAnimationFrame(render); }
render();

/* --- 저장/복원 --- */
function doc(){ return {strokes, color, size, wiggleOn, wiggleAmp, wiggleSpeed}; }
function loadDoc(d){ strokes.length=0; if(Array.isArray(d.strokes)) strokes.push(...d.strokes); color=d.color ?? color; $('color').value=color; size=d.size ?? size; $('size').value=size; wiggleOn=d.wiggleOn ?? wiggleOn; $('wiggle').checked=wiggleOn; wiggleAmp=d.wiggleAmp ?? wiggleAmp; $('wiggleAmp').value=wiggleAmp; wiggleSpeed=d.wiggleSpeed ?? wiggleSpeed; $('wiggleSpeed').value=wiggleSpeed; }
function saveLocal(){ try{ localStorage.setItem('wigglypaint-doc', JSON.stringify(doc())); }catch(e){} }
let saveTimer=null; function saveLocalDebounced(){ clearTimeout(saveTimer); saveTimer=setTimeout(saveLocal,250); }
(function restore(){ try{ const raw=localStorage.getItem('wigglypaint-doc'); if(raw) loadDoc(JSON.parse(raw)); }catch(e){} })();

/* --- iOS 친화 비디오 내보내기 --- */
document.getElementById('exportVIDEO').onclick = async function exportVideo(){
  if(!('MediaRecorder' in window)){ alert('이 브라우저는 내보내기를 지원하지 않습니다.'); return; }
  const fps=30, seconds=3;
  const stream=canvas.captureStream(fps);
  const chunks=[];
  const candidates=[
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/mp4;codecs=h264' // iOS Safari용 후보
  ];
  let mime=null;
  for(const m of candidates){ if(MediaRecorder.isTypeSupported(m)){ mime=m; break; } }
  if(!mime){ alert('지원 코덱을 찾지 못했습니다. PNG 저장을 이용해 주세요.'); return; }
  const rec=new MediaRecorder(stream,{mimeType:mime, videoBitsPerSecond:4_000_000});
  rec.ondataavailable=(e)=>{ if(e.data.size>0) chunks.push(e.data); };
  rec.onstop=()=>{ const ext=mime.includes('mp4')?'mp4':'webm'; const blob=new Blob(chunks,{type:mime}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='wiggly.'+ext; a.click(); setTimeout(()=>URL.revokeObjectURL(url),10000); };
  const wasPlaying=playing; playing=true; rec.start(); setTimeout(()=>{ rec.stop(); playing=wasPlaying; }, seconds*1000);
};
</script>
</body>
</html>