const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {pipeline,Transform}=require('node:stream'),{promisify}=require('node:util'),pipe=promisify(pipeline);
const PORT=Number(process.env.PORT||3000),HOST=process.env.HOST||'0.0.0.0',ADMIN_PASSWORD=process.env.ADMIN_PASSWORD,SESSION_SECRET=process.env.SESSION_SECRET||ADMIN_PASSWORD,VIEWER_PASSWORD=process.env.VIEWER_PASSWORD||'';
const DATA=path.resolve(process.env.DATA_DIR||'./data'),VIDEOS=path.join(DATA,'videos'),DB=path.join(DATA,'catalog.json'),PUBLIC=path.join(__dirname,'public'),MAX=8*1024*1024*1024;
if(!ADMIN_PASSWORD||ADMIN_PASSWORD.length<12){console.error('Set ADMIN_PASSWORD to a unique password with at least 12 characters.');process.exit(1)}
if(!SESSION_SECRET||SESSION_SECRET.length<32){console.error('Set SESSION_SECRET to a random secret with at least 32 characters.');process.exit(1)}
if(!VIEWER_PASSWORD)console.warn('WARNING: VIEWER_PASSWORD is not set, so anyone with the link can watch.');
fs.mkdirSync(VIDEOS,{recursive:true});if(!fs.existsSync(DB))fs.writeFileSync(DB,'[]',{flag:'wx'});
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
const poster=id=>path.join(VIDEOS,id+'.poster'),catalog=()=>JSON.parse(fs.readFileSync(DB,'utf8')),saveCatalog=x=>fs.writeFileSync(DB,JSON.stringify(x,null,2)),vid=id=>path.join(VIDEOS,id+'.video');
const eq=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y)};
const sign=s=>crypto.createHmac('sha256',SESSION_SECRET).update(s).digest('base64url');
const token=(r='admin')=>{const p=Buffer.from(JSON.stringify({r,exp:Date.now()+28800000,n:crypto.randomBytes(16).toString('hex')})).toString('base64url');return p+'.'+sign(p)};
function cookieAuth(req,name,role){const c=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='));if(!c)return false;const [p,s]=c.slice(name.length+1).split('.');if(!p||!s||!eq(sign(p),s))return false;try{const j=JSON.parse(Buffer.from(p,'base64url'));return j.r===role&&j.exp>Date.now()}catch{return false}}
const admin=req=>cookieAuth(req,'screenroom_session','admin'),viewer=req=>!VIEWER_PASSWORD||admin(req)||cookieAuth(req,'screenroom_viewer','viewer');
const tries=new Map(),ip=req=>String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim(),blocked=req=>{const x=tries.get(ip(req));return x&&x.n>=8&&Date.now()<x.until},fail=req=>{const k=ip(req),x=tries.get(k)||{n:0};x.n++;x.until=Date.now()+900000;tries.set(k,x)},ok=req=>tries.delete(ip(req));
const secure=process.env.NODE_ENV==='production'?'; Secure':'';
const send=(res,status,body,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(body))};
async function body(req,limit=1048576){let n=0,a=[];for await(const c of req){n+=c.length;if(n>limit)throw Error('Request too large');a.push(c)}return Buffer.concat(a)}

function optimizeAudio(inp,out){
  return new Promise(res=>{
    const proc=spawn('ffmpeg',['-y','-i',inp,'-c:v','copy','-c:a','aac','-b:a','192k','-movflags','+faststart',out],{stdio:'ignore'});
    proc.on('close',c=>res(c===0));
    proc.on('error',()=>res(false));
  });
}

function cleanOrphanParts(){
  try{
    const now=Date.now(),files=fs.readdirSync(VIDEOS);
    for(const f of files){
      if(f.endsWith('.part')||f.endsWith('.opt.mp4')){
        const fp=path.join(VIDEOS,f),st=fs.statSync(fp);
        if(now-st.mtimeMs>30*60*1000) fs.rmSync(fp,{force:true});
      }
    }
  }catch(e){}
}
cleanOrphanParts();
setInterval(cleanOrphanParts,30*60*1000);
const clean=(x,n=180)=>String(x||'').trim().slice(0,n);
async function route(req,res){
 const u=new URL(req.url,'http://'+(req.headers.host||'localhost'));
 if(u.pathname==='/api/viewer/session')return send(res,200,{authenticated:viewer(req),required:!!VIEWER_PASSWORD});
  if(u.pathname==='/api/viewer/login'&&req.method==='POST'){let x;try{x=JSON.parse(await body(req))}catch{return send(res,400,{error:'Invalid request.'})}if(blocked(req))return send(res,429,{error:'Too many attempts. Try again in 15 minutes.'});if(!VIEWER_PASSWORD||!eq(x.password||'',VIEWER_PASSWORD)){fail(req);return send(res,401,{error:'Wrong password.'})}ok(req);return send(res,200,{authenticated:true},{'Set-Cookie':'screenroom_viewer='+token('viewer')+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000'+secure})}
  if((u.pathname==='/api/catalog'||u.pathname.startsWith('/api/video/')||u.pathname.startsWith('/api/poster/'))&&!viewer(req))return send(res,401,{error:'Sign in required.'});
if(u.pathname==='/api/catalog'&&req.method==='GET')return send(res,200,catalog().filter(x=>x.videoFile&&fs.existsSync(vid(x.id))).map(({videoFile,...x})=>x));
 if(u.pathname==='/api/admin/session'&&req.method==='GET')return send(res,200,{authenticated:admin(req)});
 if(u.pathname==='/api/admin/login'&&req.method==='POST'){let x;try{x=JSON.parse(await body(req))}catch{return send(res,400,{error:'Invalid request.'})}if(blocked(req))return send(res,429,{error:'Too many attempts. Try again in 15 minutes.'});if(!eq(x.password||'',ADMIN_PASSWORD)){fail(req);return send(res,401,{error:'The password was not accepted.'})}ok(req);return send(res,200,{authenticated:true},{'Set-Cookie':'screenroom_session='+token('admin')+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800'+(process.env.NODE_ENV==='production'?'; Secure':'')})}
 if(u.pathname==='/api/admin/logout'&&req.method==='POST')return send(res,200,{ok:true},{'Set-Cookie':'screenroom_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});
 if(u.pathname.startsWith('/api/admin/')&&!admin(req))return send(res,401,{error:'Admin sign-in required.'});
  if(u.pathname==='/api/admin/storage'&&req.method==='GET'){
    try{
      const stats=fs.statfsSync(VIDEOS);
      const total=Number(stats.bsize)*Number(stats.blocks);
      const free=Number(stats.bsize)*Number(stats.bavail);
      const used=total-free;
      const pct=total>0?Math.round((used/total)*100):0;
      const cat=catalog();
      const movieSize=cat.reduce((acc,x)=>acc+(x.size||0),0);
      return send(res,200,{
        totalGB:(total/(1024**3)).toFixed(1),
        freeGB:(free/(1024**3)).toFixed(1),
        usedGB:(used/(1024**3)).toFixed(1),
        percentUsed:pct,
        movieCount:cat.filter(x=>x.videoFile).length,
        moviesSizeGB:(movieSize/(1024**3)).toFixed(1)
      });
    }catch(e){
      return send(res,500,{error:e.message||'Could not read disk storage.'});
    }
  }

 if(u.pathname==='/api/admin/items'&&req.method==='GET')return send(res,200,catalog().map(({videoFile,...x})=>({...x,videoFile:!!x.videoFile})));
 if(u.pathname==='/api/admin/items'&&req.method==='POST'){let d;try{d=JSON.parse(await body(req))}catch{return send(res,400,{error:'Invalid item details.'})}const kind=d.kind==='episode'?'episode':'movie',title=clean(d.title),seriesTitle=kind==='episode'?clean(d.seriesTitle):'';if(!title||(kind==='episode'&&!seriesTitle))return send(res,400,{error:'Add a title and, for episodes, a series name.'});const x={id:crypto.randomUUID(),kind,title,seriesTitle,season:kind==='episode'?Math.max(1,Number(d.season)||1):null,episode:kind==='episode'?Math.max(1,Number(d.episode)||1):null,year:clean(d.year,4),genre:clean(d.genre,48)||'Featured',synopsis:clean(d.synopsis,1200),runtime:clean(d.runtime,24),color:/^#[0-9a-fA-F]{6}$/.test(d.color)?d.color:'#263549',videoFile:false,createdAt:new Date().toISOString()};const a=catalog();a.push(x);saveCatalog(a);return send(res,201,x)}
   const up=u.pathname.match(/^\/api\/admin\/items\/([a-f0-9-]{36})\/video$/);
  if(up&&req.method==='PUT'){
    const a=catalog(),x=a.find(i=>i.id===up[1]);
    if(!x)return send(res,404,{error:'Library item not found.'});
    let type=(req.headers['content-type']||'').split(';')[0];
    const isVideoType = type.startsWith('video/') || type === 'application/octet-stream' || type === 'application/x-matroska' || !type;
    if(!isVideoType) return send(res,415,{error:'Upload an MP4, MKV, WebM, or MOV video file.'});
    if(type === 'application/octet-stream' || !type) type = 'video/mp4';

    const isChunked = req.headers['x-chunk-index'] !== undefined;
    const chunkIndex = isChunked ? Number(req.headers['x-chunk-index']) : 0;
    const chunkTotal = isChunked ? Number(req.headers['x-chunk-total']) : 1;
    const chunkOffset = isChunked ? Number(req.headers['x-chunk-offset'] || 0) : 0;
    const totalFileSize = Number(req.headers['x-file-size'] || req.headers['content-length'] || 0);

    if (totalFileSize > MAX) return send(res, 413, { error: 'Maximum upload size is 8 GB.' });

    const f=vid(x.id), tmp=f+'.part';
    const writeFlags = (chunkIndex === 0) ? 'w' : 'r+';

    if (chunkIndex > 0 && !fs.existsSync(tmp)) {
      return send(res, 400, { error: 'Upload sequence interrupted. Please restart upload.' });
    }

    let chunkSize = 0;
    const maxChunk = isChunked ? (100 * 1024 * 1024) : MAX;
    const lim = new Transform({
      transform(c, e, cb) {
        chunkSize += c.length;
        cb(chunkSize > maxChunk ? Error('Chunk too large.') : null, c);
      }
    });

    try {
      const outStream = fs.createWriteStream(tmp, { flags: writeFlags, start: chunkOffset });
      await pipe(req, lim, outStream);
      if (!chunkSize) throw Error('Uploaded data was empty.');

      if (chunkIndex < chunkTotal - 1) {
        return send(res, 200, { ok: true, chunk: chunkIndex, next: chunkIndex + 1 });
      }

      // Final chunk complete - immediately finalize and return 200 (zero browser timeout!)
      fs.renameSync(tmp, f);
      x.videoFile = true;
      x.contentType = type;
      x.size = fs.statSync(f).size;
      saveCatalog(a);
      send(res, 200, { ok: true, item: x });

      // Background audio optimization for TV (runs asynchronously without blocking HTTP)
      (async () => {
        try {
          const optTmp = f + '.opt.mp4';
          const success = await optimizeAudio(f, optTmp);
          if (success && fs.existsSync(optTmp) && fs.statSync(optTmp).size > 0) {
            fs.renameSync(optTmp, f);
            const curCat = catalog();
            const cur = curCat.find(i => i.id === x.id);
            if (cur) {
              cur.contentType = 'video/mp4';
              cur.size = fs.statSync(f).size;
              saveCatalog(curCat);
            }
          } else {
            try { fs.rmSync(optTmp, { force: true }); } catch {}
          }
        } catch (e) {}
      })();
      return;
    } catch(e) {
      if (chunkIndex === 0) {
        try { fs.rmSync(tmp, { force: true }); } catch {}
      }
      return send(res, 400, { error: e.message || 'Upload failed.' });
    }
  }
  const pp=u.pathname.match(/^\/api\/admin\/items\/([a-f0-9-]{36})\/poster$/);
  if(pp&&req.method==='PUT'){const a=catalog(),x=a.find(i=>i.id===pp[1]);if(!x)return send(res,404,{error:'Item not found.'});const type=(req.headers['content-type']||'').split(';')[0];if(!['image/jpeg','image/png','image/webp'].includes(type))return send(res,415,{error:'Poster must be JPG, PNG or WebP.'});let b;try{b=await body(req,6*1024*1024)}catch{return send(res,413,{error:'Poster must be under 6 MB.'})}if(!b.length)return send(res,400,{error:'Empty poster.'});fs.writeFileSync(poster(x.id),b);x.hasPoster=true;x.posterType=type;saveCatalog(a);return send(res,200,{ok:true})}
  const gp=u.pathname.match(/^\/api\/poster\/([a-f0-9-]{36})$/);
  if(gp&&req.method==='GET'){const x=catalog().find(i=>i.id===gp[1]&&i.hasPoster);if(!x||!fs.existsSync(poster(x.id)))return send(res,404,{error:'No poster.'});res.writeHead(200,{'Content-Type':x.posterType||'image/jpeg','Cache-Control':'private, max-age=86400','X-Content-Type-Options':'nosniff'});return fs.createReadStream(poster(x.id)).pipe(res)}
  const patch=u.pathname.match(/^\/api\/admin\/items\/([a-f0-9-]{36})$/);
  if(patch&&req.method==='PATCH'){let d;try{d=JSON.parse(await body(req))}catch{return send(res,400,{error:'Invalid item details.'})}const a=catalog(),x=a.find(i=>i.id===patch[1]);if(!x)return send(res,404,{error:'Item not found.'});const t=clean(d.title);if(!t)return send(res,400,{error:'Title is required.'});x.title=t;if(x.kind==='episode'){const s=clean(d.seriesTitle);if(s)x.seriesTitle=s;x.season=Math.max(1,Number(d.season)||1);x.episode=Math.max(1,Number(d.episode)||1)}x.year=clean(d.year,4);x.genre=clean(d.genre,48)||'Featured';x.synopsis=clean(d.synopsis,1200);x.runtime=clean(d.runtime,24);if(/^#[0-9a-fA-F]{6}$/.test(d.color))x.color=d.color;saveCatalog(a);return send(res,200,x)}
  const del=u.pathname.match(/^\/api\/admin\/items\/([a-f0-9-]{36})$/);
 if(del&&req.method==='DELETE'){const a=catalog(),b=a.filter(i=>i.id!==del[1]);if(a.length===b.length)return send(res,404,{error:'Item not found.'});try{fs.rmSync(vid(del[1]),{force:true});fs.rmSync(vid(del[1])+'.part',{force:true});fs.rmSync(vid(del[1])+'.opt.mp4',{force:true});fs.rmSync(poster(del[1]),{force:true})}catch{}saveCatalog(b);return send(res,200,{ok:true})}
 const sm=u.pathname.match(/^\/api\/video\/([a-f0-9-]{36})$/);
 if(sm&&req.method==='GET'){const x=catalog().find(i=>i.id===sm[1]&&i.videoFile);if(!x)return send(res,404,{error:'Video not found.'});let st;try{st=fs.statSync(vid(x.id))}catch{return send(res,404,{error:'Video not found.'})}const h={'Content-Type':x.contentType||'video/mp4','Accept-Ranges':'bytes','Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'},r=req.headers.range;if(r){const m=r.match(/bytes=(\d*)-(\d*)/);if(!m){res.writeHead(416,{'Content-Range':'bytes */'+st.size});return res.end()}const start=m[1]?Number(m[1]):Math.max(0,st.size-Number(m[2])),end=m[2]&&m[1]?Math.min(Number(m[2]),st.size-1):st.size-1;if(start>=st.size||end<start){res.writeHead(416,{'Content-Range':'bytes */'+st.size});return res.end()}res.writeHead(206,{...h,'Content-Length':end-start+1,'Content-Range':'bytes '+start+'-'+end+'/'+st.size});return pipe(fs.createReadStream(vid(x.id),{start,end}),res).catch(()=>{})}res.writeHead(200,{...h,'Content-Length':st.size});return pipe(fs.createReadStream(vid(x.id)),res).catch(()=>{})}
 const rel=u.pathname==='/'?'index.html':u.pathname==='/admin'?'admin.html':u.pathname==='/enter'?'enter.html':decodeURIComponent(u.pathname.slice(1)),file=path.resolve(PUBLIC,rel);if(!file.startsWith(PUBLIC+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return send(res,404,{error:'Not found.'});
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; media-src 'self' blob:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"});fs.createReadStream(file).pipe(res)
}
http.createServer((req,res)=>route(req,res).catch(e=>{if(!res.headersSent)send(res,500,{error:'Something went wrong.'});else res.destroy(e)})).listen(PORT,HOST,()=>console.log('NTR ready at http://localhost:'+PORT));
