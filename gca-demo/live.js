const $=s=>document.querySelector(s);
let endpoint='',state='connecting',job=null,busy=false,timer=null,started=0,videoURLs=[],displayed=null;
const examples={turtle:'A sea turtle glides through clear turquoise water, sunlight rippling across its shell. A slow underwater tracking shot.',tokyo:'A stylish woman in a black leather jacket and red dress walks down a Tokyo street at night. Neon signs reflect in the wet pavement. Cinematic tracking shot.',coast:'A drone flies above the rugged cliffs of Big Sur. Blue waves crash against the rocks as warm sunset light falls across the coast.'};
function message(text,error=false){$('#message').textContent=text;$('#message').classList.toggle('error',error)}
function controls(s){state=s;$('#status').textContent=({stopped:'Offline',starting:'Starting',ready:'Ready',generating:'Generating',error:'Needs attention',connecting:'Connecting'})[s]||s;$('#start').disabled=!endpoint||!['stopped','error'].includes(s);$('#stop').disabled=!endpoint||!['starting','ready','generating','error'].includes(s);$('#submit').disabled=s!=='ready'||busy||Boolean(job);$('#stage').classList.toggle('busy',['starting','generating'].includes(s));$('#placeholder h3').textContent=s==='starting'?'Getting the model ready…':s==='generating'?'Bringing your scene to life…':'Ready for a prompt';$('#placeholder p').textContent=s==='starting'?'Loading and warming up on one H200.':s==='generating'?'Generating both videos and measuring component times.':'Start the model and describe what you want to see.'}
async function api(path,method='GET',body){const c=new AbortController();const timeout=setTimeout(()=>c.abort(),20000);try{const r=await fetch(endpoint+path,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:c.signal});const data=await r.json();if(!r.ok)throw Error(data.error||'Request failed');return data}finally{clearTimeout(timeout)}}
function chart(timings){
  const groups=[['vae','VAE decode'],['ffn','FFN'],['attention','Attention'],['other','Other']];
  const methods=['full','gca'], names={full:'Full Attention',gca:'GCA C4'};
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
  $('#totals').textContent='Total through MP4 save: Full Attention '+timings.full.total.toFixed(2)+' s · GCA '+timings.gca.total.toFixed(2)+' s';
  $('#timing').hidden=false;
}
function playBoth(){for(const m of ['full','gca']){const v=$('#'+m+'-video');v.currentTime=0;v.play().catch(()=>{});}}
$('#replay').onclick=playBoth;
async function result(record){
  if(!record.timings)throw Error('This job does not contain paired timings.');
  chart(record.timings);
  const blobs=await Promise.all(['-full',''].map(async suffix=>{
    const r=await fetch(endpoint+'/api/video/'+record.id+suffix);
    if(!r.ok)throw Error('Video delivery failed');return r.blob();
  }));
  videoURLs.forEach(url=>URL.revokeObjectURL(url));videoURLs=blobs.map(b=>URL.createObjectURL(b));
  ['full','gca'].forEach((m,i)=>{$('#'+m+'-video').src=videoURLs[i];$('#'+m+'-download').href=videoURLs[i];});
  $('#stage').hidden=true;$('#comparison').hidden=false;playBoth();
}
async function poll(){if(!endpoint)return;try{const s=await api('/api/status');controls(s.state);$('#model-note').textContent=s.detail||'Model status updated.';if(job)s.job=await api('/api/job/'+job);if(s.job){if(s.job.status==='running'&&s.job.method)message('Generating '+(s.job.method==='full'?'Full Attention':'GCA C4')+'…');if(s.job.status==='done'&&job===s.job.id&&displayed!==s.job.id){const id=s.job.id;displayed=id;try{await result(s.job);job=null;controls(s.state)}catch(e){displayed=null;throw e}message('Both videos are ready.');$('#elapsed').textContent=s.job.seconds.toFixed(1)+' s for the pair';}else if(s.job.status==='failed'&&job===s.job.id){job=null;message(s.job.error||'Generation failed.',true);}}}catch(e){controls('error');message('Cannot reach the generation service. '+e.message,true)}finally{timer=setTimeout(poll,2500)}}
async function connect(){try{const c=await fetch('live-config.json',{cache:'no-store'});if(!c.ok)throw Error('Unable to load service settings.');const cfg=await c.json();if(!cfg.api)throw Error('Generation service has not been connected yet.');endpoint=cfg.api.replace(/\/$/,'');poll()}catch(err){controls('error');message(err.message,true);timer=setTimeout(connect,5000)}};
$('#start').onclick=async()=>{controls('starting');message('Checking GPU availability and loading the model…');try{await api('/api/start','POST',{});}catch(e){controls('error');message(e.message,true)}};
$('#stop').onclick=async()=>{try{await api('/api/stop','POST',{});job=null;controls('stopped');message('Model stopped. GPU released.')}catch(e){message(e.message,true)}};
$('#generate').onsubmit=async e=>{e.preventDefault();if(state!=='ready'||busy||job)return;busy=true;controls('generating');message('Generating your video…');started=Date.now();try{const r=await api('/api/generate','POST',{prompt:$('#prompt').value.trim(),seed:Number($('#seed').value)});job=r.id;$('#comparison').hidden=true;$('#timing').hidden=true;$('#stage').hidden=false;for(const m of ['full','gca'])$('#'+m+'-video').pause();$('#elapsed').textContent='';}catch(e){controls('ready');message(e.message,true)}finally{busy=false}};
document.querySelectorAll('[data-example]').forEach(b=>b.onclick=()=>{$('#prompt').value=examples[b.dataset.example]});
setInterval(()=>{if(job)$('#elapsed').textContent=Math.floor((Date.now()-started)/1000)+'s elapsed'},1000);
controls('connecting');
connect();
