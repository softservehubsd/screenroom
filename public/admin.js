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
    '<div class="item"><div class="thumb" style="background:'+esc(x.color||'#263549')+'">'+esc(x.title.slice(0,1))+'</div>'+
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

function uploadVideo(id,file,onProgress){
  return new Promise((resolve,reject)=>{
    const x=new XMLHttpRequest();
    x.open('PUT','/api/admin/items/'+id+'/video');
    x.setRequestHeader('Content-Type',file.type||'video/mp4');
    x.upload.onprogress=e=>{if(e.lengthComputable)onProgress(e.loaded/e.total)};
    x.onload=()=>{if(x.status<300)return resolve();let m='Upload failed.';try{m=JSON.parse(x.responseText).error||m}catch{}reject(Error(m))};
    x.onerror=()=>reject(Error('Network error during upload.'));
    x.send(file);
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
    await uploadVideo(item.id,file,p=>{bar.style.width=(p*100)+'%';st.textContent='Uploading… '+Math.round(p*100)+'%'});
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
