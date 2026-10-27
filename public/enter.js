document.getElementById('f').onsubmit=async e=>{
  e.preventDefault();
  const err=document.getElementById('e');err.textContent='';
  try{
    const r=await fetch('/api/viewer/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:document.getElementById('p').value})});
    const x=await r.json().catch(()=>({}));
    if(!r.ok)throw Error(x.error||'Could not sign in.');
    location.href='/';
  }catch(ex){err.textContent=ex.message}
};
