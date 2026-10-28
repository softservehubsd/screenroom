
async function updateStorage(){
  try{
    const s = await api('/api/admin/storage');
    const fill = $('#storageFill');
    const num = $('#storageNumbers');
    const det = $('#storageDetail');
    const dot = $('#storageDot');
    if(!fill || !num) return;

    fill.style.width = Math.min(100, Math.max(2, s.percentUsed)) + '%';
    num.textContent = s.freeGB + ' GB free of ' + s.totalGB + ' GB';
    det.textContent = s.usedGB + ' GB used (' + s.percentUsed + '%) · Movies: ' + s.moviesSizeGB + ' GB (' + s.movieCount + ' titles)';

    if (s.percentUsed > 90) {
      fill.style.background = '#ef4444';
      if (dot) dot.style.background = '#ef4444';
    } else if (s.percentUsed > 75) {
      fill.style.background = '#f59e0b';
      if (dot) dot.style.background = '#f59e0b';
    } else {
      fill.style.background = 'var(--accent)';
      if (dot) dot.style.background = '#22c55e';
    }
  }catch(e){}
}
const $=s=>document.querySelector(s);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let items=[];

function toast(t){const el=$('#toast');el.textContent=t;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2600)}
async function api(url,opts={}){
  const r=await fetch(url,{credentials:'same-origin',...opts});
  let x={};try{x=await r.json()}catch{}
  if(!r.ok)throw Error(x.error||'Request failed.');
  return x;
}
const json=(method,body)=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});

function show(authed){$('#loginView').hidden=authed;$('#appView').hidden=!authed;if(authed)refresh()}

async function refresh(){
  updateStorage();
  try{items=await api('/api/admin/items')}catch(e){if(/sign-in/i.test(e.message))return show(false);toast(e.message);return}
  render();
}

function title(x){return x.kind==='episode'?x.seriesTitle+' · S'+x.season+'E'+x.episode+' · '+x.title:x.title}

function render(){
  const q=$('#filter').value.toLowerCase().trim();
  const list=items.filter(x=>!q||(title(x)+' '+(x.genre||'')).toLowerCase().includes(q))
    .sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
  $('#count').textContent='('+items.length+')';
  $('#list').innerHTML=list.length?list.map(x=>
    '<div class="item"><div class="thumb" style="background:'+(x.hasPoster?'url(/api/poster/'+x.id+') center/cover':esc(x.color||'#263549'))+'">'+(x.hasPoster?'':esc(x.title.slice(0,1)))+'</div>'+
    '<div class="info"><b>'+esc(title(x))+'</b><small>'+esc([x.genre,x.year,x.runtime].filter(Boolean).join(' · '))+'</small></div>'+
    '<span class="badge '+(x.videoFile?'':'warn')+'">'+(x.videoFile?'Ready':'No video')+'</span>'+
    '<div class="acts"><button class="btn small" data-edit="'+x.id+'">Edit</button><button class="btn danger" data-del="'+x.id+'">Delete</button></div></div>'
  ).join(''):'<div class="empty">'+(items.length?'No matches.':'No movies yet. Upload your first one.')+'</div>';
}

$('#list').onclick=async e=>{
  const d=e.target.dataset.del,ed=e.target.dataset.edit;
  if(d){const x=items.find(i=>i.id===d);if(!confirm('Delete "'+title(x)+'" and its video file?'))return;
    try{await api('/api/admin/items/'+d,{method:'DELETE'});toast('Deleted');refresh()}catch(err){toast(err.message)}}
  if(ed)openEdit(items.find(i=>i.id===ed));
};
$('#filter').oninput=render;

let editing=null;
function openEdit(x){
  editing=x;const f=$('#editForm'),ep=x.kind==='episode';
  $('#eSeriesWrap').hidden=!ep;$('#eSeasonWrap').hidden=!ep;$('#eEpisodeWrap').hidden=!ep;
  for(const k of ['seriesTitle','title','season','episode','year','genre','runtime','synopsis'])f.elements[k].value=x[k]??'';
  $('#editDialog').showModal();
}
$('#editCancel').onclick=()=>$('#editDialog').close();
$('#editForm').onsubmit=async e=>{
  e.preventDefault();const f=e.currentTarget,b={color:editing.color};
  for(const k of ['seriesTitle','title','season','episode','year','genre','runtime','synopsis'])b[k]=f.elements[k].value;
  try{await api('/api/admin/items/'+editing.id,json('PATCH',b));$('#editDialog').close();toast('Saved');refresh()}catch(err){toast(err.message)}
};

$('#kind').onchange=()=>{
  const ep=$('#kind').value==='episode';
  $('#seriesWrap').hidden=!ep;$('#seasonWrap').hidden=!ep;$('#episodeWrap').hidden=!ep;
  $('#seriesWrap input').required=ep;
};

function uploadChunk(id, chunk, index, total, offset, totalSize, mime, onChunkProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', '/api/admin/items/' + id + '/video');
    x.setRequestHeader('Content-Type', mime);
    x.setRequestHeader('X-Chunk-Index', String(index));
    x.setRequestHeader('X-Chunk-Total', String(total));
    x.setRequestHeader('X-Chunk-Offset', String(offset));
    x.setRequestHeader('X-File-Size', String(totalSize));
    x.upload.onprogress = e => {
      if (e.lengthComputable) onChunkProgress(e.loaded / e.total);
    };
    x.onload = () => {
      if (x.status < 300) return resolve();
      let m = 'Chunk upload failed.';
      try { m = JSON.parse(x.responseText).error || m; } catch {}
      reject(Error(m));
    };
    x.onerror = () => reject(Error('Network error during upload.'));
    x.send(chunk);
  });
}

function uploadVideo(id, file, onProgress, onStatus) {
  return new Promise(async (resolve, reject) => {
    // 16 MB chunks: works reliably on all mobile & desktop browsers, never hits 2GB buffer limits
    const CHUNK_SIZE = 16 * 1024 * 1024;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const mime = file.type || (file.name.endsWith('.mkv') ? 'video/x-matroska' : 'video/mp4');

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(file.size, start + CHUNK_SIZE);
      const chunk = file.slice(start, end);

      if (onStatus) {
        if (i === totalChunks - 1) {
          onStatus('Uploading final part (' + (i + 1) + '/' + totalChunks + ')…');
        } else {
          const pct = Math.round((start / file.size) * 100);
          onStatus('Uploading… ' + pct + '% (Part ' + (i + 1) + '/' + totalChunks + ')');
        }
      }

      let attempt = 0;
      let success = false;
      let lastErr = null;

      while (attempt < 3 && !success) {
        attempt++;
        try {
          await uploadChunk(id, chunk, i, totalChunks, start, file.size, mime, p => {
            const uploadedBytes = start + (p * chunk.size);
            onProgress(uploadedBytes / file.size);
          });
          success = true;
        } catch (e) {
          lastErr = e;
          if (attempt < 3) {
            if (onStatus) onStatus('Retrying part ' + (i + 1) + '/' + totalChunks + '…');
            await new Promise(r => setTimeout(r, 1200 * attempt));
          }
        }
      }

      if (!success) {
        return reject(Error(lastErr?.message || 'Failed to upload part ' + (i + 1) + ' of ' + totalChunks));
      }
    }

    if (onStatus) onStatus('Processing & optimizing video audio on server…');
    resolve();
  });
}

$('#uploadForm').onsubmit=async e=>{
  e.preventDefault();
  const form=e.currentTarget,d=new FormData(form),file=$('#file').files[0],st=$('#status'),btn=$('#uploadBtn'),bar=$('#progressBar');
  if(!file)return;
  btn.disabled=true;st.textContent='Creating entry…';
  let item;
  try{
    item=await api('/api/admin/items',json('POST',Object.fromEntries(d)));
    $('#progressWrap').hidden=false;bar.style.width='0';
    await uploadVideo(item.id,file,p=>{bar.style.width=(p*100)+'%';},msg=>{st.textContent=msg;});
    const pf=$('#poster').files[0];
    if(pf){st.textContent='Uploading poster…';const r=await fetch('/api/admin/items/'+item.id+'/poster',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':pf.type},body:pf});if(!r.ok){const e=await r.json().catch(()=>({}));toast(e.error||'Poster upload failed')}}
    st.textContent='Done!';toast('Movie added');form.reset();$('#kind').onchange();refresh();
  }catch(err){
    st.textContent=err.message;
    if(item){try{await api('/api/admin/items/'+item.id,{method:'DELETE'})}catch{}refresh()}
  }finally{btn.disabled=false;setTimeout(()=>{$('#progressWrap').hidden=true},1500)}
};

$('#loginForm').onsubmit=async e=>{
  e.preventDefault();$('#loginError').textContent='';
  try{await api('/api/admin/login',json('POST',{password:$('#password').value}));$('#password').value='';show(true)}
  catch(err){$('#loginError').textContent=err.message}
};
$('#logout').onclick=async()=>{await api('/api/admin/logout',{method:'POST'});show(false)};

api('/api/admin/session').then(x=>show(x.authenticated)).catch(()=>show(false));
