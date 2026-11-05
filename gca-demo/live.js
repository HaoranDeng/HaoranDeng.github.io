const $=s=>document.querySelector(s);
let endpoint='',state='connecting',job=null,busy=false,timer=null,started=0,shown={},loading={};
const examples={turtle:'A sea turtle glides through clear turquoise water, sunlight rippling across its shell. A slow underwater tracking shot.',tokyo:'A stylish woman in a black leather jacket and red dress walks down a Tokyo street at night. Neon signs reflect in the wet pavement. Cinematic tracking shot.',coast:'A drone flies above the rugged cliffs of Big Sur. Blue waves crash against the rocks as warm sunset light falls across the coast.'};
function message(text,error=false){$('#message').textContent=text;$('#message').classList.toggle('error',error)}
function controls(s){state=s;$('#status').textContent=({stopped:'Offline',starting:'Starting',ready:'Ready',generating:'generating',error:'Needs attention',connecting:'Connecting'})[s]||s;$('#start').disabled=!endpoint||!['stopped','error'].includes(s);$('#stop').disabled=!endpoint||!['starting','ready','generating','error'].includes(s);$('#submit').disabled=s!=='ready'||busy||Boolean(job);$('#stage').classList.toggle('busy',['starting','generating'].includes(s));$('#placeholder h3').textContent=s==='starting'?'Getting the model ready…':s==='generating'?'generating':'Ready for a prompt';$('#placeholder p').hidden=s==='generating';$('#placeholder p').textContent=s==='starting'?'Loading and warming up on one H200.':s==='generating'?'':'Start the model and describe what you want to see.'}
async function api(path,method='GET',body){const c=new AbortController();const timeout=setTimeout(()=>c.abort(),20000);try{const r=await fetch(endpoint+path,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:c.signal});const data=await r.json();if(!r.ok)throw Error(data.error||'Request failed');return data}finally{clearTimeout(timeout)}}
function chart(timings){
  const groups=[['attention','Attention'],['ffn','FFN']];
  const methods=['full','gca'], names={full:'Full Attention',gca:'GCA'};
  const max=Math.max(...groups.flatMap(([key])=>methods.map(m=>timings[m][key])));
  const bars=$('#bars');bars.replaceChildren();
  for(const [key,label] of groups){
    const group=document.createElement('div');group.className='bar-group';
    const title=document.createElement('strong');title.textContent=label;group.append(title);
    for(const m of methods){
      const seconds=timings[m][key],row=document.createElement('div');
      row.className='bar-row';row.setAttribute('aria-label',names[m]+': '+seconds.toFixed(2)+' seconds');
      const track=document.createElement('span');track.className='track '+m;
      const bar=document.createElement('i');bar.style.width=(100*seconds/max)+'%';track.append(bar);
      const value=document.createElement('span');value.textContent=seconds.toFixed(2)+' s';
      row.title=names[m]+' · '+label+' · '+value.textContent;row.append(track,value);group.append(row);
    }
    bars.append(group);
  }
  $('#timing').hidden=false;
}
function playBoth(){for(const m of ['full','gca']){const v=$('#'+m+'-video');v.currentTime=0;v.play().catch(()=>{});}}
$('#replay').onclick=playBoth;
function resetResults(){
  for(const m of ['gca','full']){
    const video=$('#'+m+'-video'), link=$('#'+m+'-download');
    video.pause();video.removeAttribute('src');video.load();video.hidden=link.hidden=true;
    link.removeAttribute('href');$('#'+m+'-pending').hidden=false;
    if(shown[m])URL.revokeObjectURL(shown[m]);
  }
  shown={};loading={};$('#comparison').hidden=true;$('#timing').hidden=true;
  $('#stage').hidden=false;$('#replay').hidden=true;
}
async function reveal(id,m){
  if(shown[m]||loading[m]===id)return;
  loading[m]=id;
  try{
    const r=await fetch(endpoint+'/api/video/'+id+(m==='full'?'-full':''));
    if(!r.ok)throw Error('Could not download '+m+' video.');
    const blob=await r.blob();
    if(job!==id)return;
    const url=URL.createObjectURL(blob);shown[m]=url;
    const v=$('#'+m+'-video'),a=$('#'+m+'-download');
    v.src=url;a.href=url;v.hidden=a.hidden=false;$('#'+m+'-pending').hidden=true;
    $('#stage').hidden=true;$('#comparison').hidden=false;
    v.play().catch(()=>{});
    $('#replay').hidden=!(shown.gca&&shown.full);
  }finally{if(loading[m]===id)delete loading[m];}
}
async function poll(){
  if(!endpoint)return;
  try{
    const s=await api('/api/status');controls(s.state);$('#model-note').textContent=s.state==='generating'?'':s.detail;
    const id=job;
    if(id){
      const record=await api('/api/job/'+id);
      if(job!==id)return;
      const tasks=['gca','full'].filter(m=>record.timings?.[m]).map(m=>reveal(id,m));
      if(record.status==='running')message('');
      // Each player updates independently, including when downloads overlap.
      await Promise.all(tasks);
      if(job!==id)return;
      if(record.status==='done'&&shown.gca&&shown.full){
        chart(record.timings);job=null;controls(s.state);message('Both videos are ready.');
        $('#elapsed').textContent=record.seconds.toFixed(1)+' s for the pair';
      }else if(record.status==='failed'){
        job=null;controls(s.state);$('#full-pending').textContent='Full Attention unavailable.';
        message(record.error||'Generation failed.',true);
      }
    }
  }catch(e){message('Could not update the comparison. Retrying… '+e.message,true);}
  finally{timer=setTimeout(poll,job?500:2000);}
}
async function connect(){try{const c=await fetch('live-config.json',{cache:'no-store'});if(!c.ok)throw Error('Unable to load service settings.');const cfg=await c.json();if(!cfg.api)throw Error('Generation service has not been connected yet.');endpoint=cfg.api.replace(/\/$/,'');poll()}catch(err){controls('error');message(err.message,true);timer=setTimeout(connect,5000)}};
$('#start').onclick=async()=>{controls('starting');message('Checking GPU availability and loading the model…');try{await api('/api/start','POST',{});}catch(e){controls('error');message(e.message,true)}};
$('#stop').onclick=async()=>{try{await api('/api/stop','POST',{});job=null;controls('stopped');message('Model stopped. GPU released.')}catch(e){message(e.message,true)}};
$('#generate').onsubmit=async e=>{e.preventDefault();if(state!=='ready'||busy||job)return;busy=true;controls('generating');message('');started=Date.now();try{const r=await api('/api/generate','POST',{prompt:$('#prompt').value.trim(),seed:Number($('#seed').value)});resetResults();job=r.id;$('#full-pending').textContent='generating';$('#elapsed').textContent='';}catch(e){controls('ready');message(e.message,true)}finally{busy=false}};
document.querySelectorAll('[data-example]').forEach(b=>b.onclick=()=>{$('#prompt').value=examples[b.dataset.example]});
setInterval(()=>{if(job)$('#elapsed').textContent=Math.floor((Date.now()-started)/1000)+'s elapsed'},1000);
controls('connecting');
connect();
