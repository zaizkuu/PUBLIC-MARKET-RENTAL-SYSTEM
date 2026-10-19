import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateLayout, publicLayout } from '../src/market/domain.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export function createMapAPI(file=resolve(root,'.market-data/map.sqlite')) {
 if(file!==':memory:')mkdirSync(dirname(file),{recursive:true});
 const db=new DatabaseSync(file);db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');
 // Schema migration 1. Existing market-office tables are never modified.
 db.exec(`CREATE TABLE IF NOT EXISTS map_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS map_users(id INTEGER PRIMARY KEY,username TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,salt TEXT NOT NULL,role TEXT NOT NULL CHECK(role='admin'),created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS map_markets(id TEXT PRIMARY KEY,name TEXT NOT NULL,address TEXT NOT NULL,latitude REAL,longitude REAL);
 CREATE TABLE IF NOT EXISTS map_sections(id TEXT PRIMARY KEY,market_id TEXT NOT NULL REFERENCES map_markets(id),name TEXT NOT NULL,code TEXT NOT NULL,geometry TEXT NOT NULL,color TEXT NOT NULL,active INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS map_stalls(id TEXT PRIMARY KEY,section_id TEXT NOT NULL,code TEXT NOT NULL,geometry TEXT,occupancy_status TEXT NOT NULL,visible INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS map_vendors(id TEXT PRIMARY KEY,business_name TEXT NOT NULL,vendor_name TEXT NOT NULL,contact TEXT NOT NULL,description TEXT NOT NULL,public_vendor INTEGER NOT NULL,public_contact INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS map_assignments(stall_id TEXT PRIMARY KEY REFERENCES map_stalls(id) ON DELETE CASCADE,vendor_id TEXT NOT NULL REFERENCES map_vendors(id) ON DELETE CASCADE);
 CREATE TABLE IF NOT EXISTS map_categories(id INTEGER PRIMARY KEY,name TEXT NOT NULL UNIQUE);
 CREATE TABLE IF NOT EXISTS map_vendor_products(vendor_id TEXT NOT NULL REFERENCES map_vendors(id) ON DELETE CASCADE,category_id INTEGER NOT NULL REFERENCES map_categories(id),PRIMARY KEY(vendor_id,category_id));
 CREATE TABLE IF NOT EXISTS map_versions(version INTEGER PRIMARY KEY,layout_data TEXT NOT NULL,publication_status TEXT NOT NULL,created_at TEXT NOT NULL,created_by TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS map_draft(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,layout_data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS map_walkway_nodes(id TEXT PRIMARY KEY,x REAL NOT NULL,y REAL NOT NULL,name TEXT NOT NULL,is_entrance INTEGER NOT NULL,verified INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS map_walkway_edges(a TEXT NOT NULL REFERENCES map_walkway_nodes(id),b TEXT NOT NULL REFERENCES map_walkway_nodes(id),PRIMARY KEY(a,b));
 INSERT OR REPLACE INTO map_meta VALUES('schema_version','1');`);
 const seed=JSON.parse(readFileSync(resolve(root,'src/market/seed.json'),'utf8'));
 if(!db.prepare('SELECT id FROM map_draft WHERE id=1').get()) {
  db.prepare('INSERT INTO map_draft VALUES(1,0,?)').run(JSON.stringify(seed));
  db.prepare('INSERT INTO map_versions VALUES(0,?,\'published\',?,\'seed\')').run(JSON.stringify(seed),new Date().toISOString());
 }
 const sessions=new Map();const attempts=new Map();
 const readDraft=()=>JSON.parse(db.prepare('SELECT layout_data FROM map_draft WHERE id=1').get().layout_data);
 function normalized(layout) {
  db.exec('DELETE FROM map_assignments;DELETE FROM map_vendor_products;DELETE FROM map_stalls;DELETE FROM map_vendors;DELETE FROM map_sections;DELETE FROM map_walkway_edges;DELETE FROM map_walkway_nodes;');
  db.prepare('INSERT OR REPLACE INTO map_markets VALUES(?,?,?,?,?)').run('tanauan',layout.market.name,layout.market.address,layout.market.latitude??null,layout.market.longitude??null);
  for(const s of layout.sections)db.prepare('INSERT INTO map_sections VALUES(?,?,?,?,?,?,?)').run(s.id,'tanauan',s.name,s.code,JSON.stringify({x:s.x,y:s.y,w:s.w,h:s.h}),s.color,+s.active);
  for(const r of layout.records) {
   const unit=layout.stalls.find(s=>s.recordId===r.id);
   db.prepare('INSERT INTO map_stalls VALUES(?,?,?,?,?,?)').run(r.id,unit?.sectionId??r.section,r.id,unit?JSON.stringify(unit):null,r.status,+r.visible);
   db.prepare('INSERT INTO map_vendors VALUES(?,?,?,?,?,?,?)').run(r.id,r.businessName,r.vendorName,r.contact,r.description,+r.publicVendor,+r.publicContact);
   db.prepare('INSERT INTO map_assignments VALUES(?,?)').run(r.id,r.id);
   for(const product of new Set(r.products)){db.prepare('INSERT OR IGNORE INTO map_categories(name) VALUES(?)').run(product);const category=db.prepare('SELECT id FROM map_categories WHERE name=?').get(product);db.prepare('INSERT INTO map_vendor_products VALUES(?,?)').run(r.id,category.id);}
  }
  for(const n of layout.nodes)db.prepare('INSERT INTO map_walkway_nodes VALUES(?,?,?,?,?,?)').run(n.id,n.x,n.y,n.name,+n.entrance,+n.verified);
  for(const [a,b] of layout.edges)db.prepare('INSERT OR IGNORE INTO map_walkway_edges VALUES(?,?)').run(a,b);
 }
 normalized(readDraft());
 const send=(res,status,data,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(data));};
 function session(req){const token=(req.headers.cookie??'').split(';').map(s=>s.trim()).find(s=>s.startsWith('market_session='))?.slice(15);const s=sessions.get(token);if(!s||s.expires<Date.now()){sessions.delete(token);return null;}return {...s,token};}
 async function body(req){let text='';for await(const chunk of req){text+=chunk;if(text.length>2_000_000){const e=new Error('Request is too large.');e.status=413;throw e;}}try{return JSON.parse(text);}catch{throw new Error('Invalid JSON request.');}}
 function login(res,user){const token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');sessions.set(token,{username:user.username,role:'admin',csrf,expires:Date.now()+8*60*60*1000});send(res,200,{authenticated:true,setupRequired:false,username:user.username,role:'admin',csrf},{'Set-Cookie':`market_session=${token}; HttpOnly; SameSite=Strict; Path=/api/market; Max-Age=28800`});}
 async function middleware(req,res,next=()=>{res.writeHead(404);res.end();}) {
  const url=new URL(req.url,'http://localhost');if(!url.pathname.startsWith('/api/market/'))return next();
  const route=url.pathname.slice('/api/market'.length); const host=req.headers.host??'';
  if(!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host))return send(res,403,{error:'Map administration is available only on this computer.'});
  if(req.method==='OPTIONS')return send(res,405,{error:'Cross-origin requests are unavailable.'});
  if(req.method!=='GET' && (req.headers.origin!==`http://${host}` && req.headers.origin!==`https://${host}`))return send(res,403,{error:'A same-origin request is required.'});
  try {
   const user=session(req);
   if(req.method==='GET'&&route==='/session')return send(res,200,user?{authenticated:true,setupRequired:false,username:user.username,role:user.role,csrf:user.csrf}:{authenticated:false,setupRequired:!db.prepare('SELECT id FROM map_users LIMIT 1').get()});
   if(req.method==='GET'&&route==='/public'){const row=db.prepare("SELECT version,layout_data,created_at FROM map_versions WHERE publication_status='published' ORDER BY version DESC LIMIT 1").get();return send(res,200,{layout:publicLayout(JSON.parse(row.layout_data)),publishedAt:row.created_at});}
   if(req.method==='POST'&&(route==='/setup'||route==='/login')) {
    const ip=req.socket.remoteAddress??'local';const recent=(attempts.get(ip)??[]).filter(t=>t>Date.now()-60000);if(recent.length>=10)return send(res,429,{error:'Too many sign-in attempts. Try again in one minute.'});recent.push(Date.now());attempts.set(ip,recent);
    const data=await body(req);if(typeof data.username!=='string'||typeof data.password!=='string'||data.username.length>80||data.password.length>256)return send(res,400,{error:'Invalid credentials.'});
    if(route==='/setup') {
     if(db.prepare('SELECT id FROM map_users LIMIT 1').get())return send(res,409,{error:'An administrator already exists. Sign in instead.'});
     if(!/^[a-zA-Z0-9_.-]{3,40}$/.test(data.username)||data.password.length<12)return send(res,400,{error:'Use a 3–40 character username and a password of at least 12 characters.'});
     const salt=randomBytes(16).toString('hex');db.prepare('INSERT INTO map_users(username,password_hash,salt,role,created_at) VALUES(?,?,?,?,?)').run(data.username,scryptSync(data.password,salt,64).toString('hex'),salt,'admin',new Date().toISOString());return login(res,{username:data.username});
    }
    const found=db.prepare('SELECT * FROM map_users WHERE username=?').get(data.username);const hash=scryptSync(data.password,found?.salt??'invalid-user-timing-salt',64);if(!found||!timingSafeEqual(hash,Buffer.from(found.password_hash,'hex')))return send(res,401,{error:'Incorrect username or password.'});return login(res,found);
   }
   if(!user||user.role!=='admin')return send(res,401,{error:'Sign in as a map administrator.'});
   if(req.method!=='GET'&&req.headers['x-map-csrf']!==user.csrf)return send(res,403,{error:'Your sign-in token has expired. Sign in again.'});
   if(req.method==='POST'&&route==='/logout'){sessions.delete(user.token);return send(res,200,{ok:true},{'Set-Cookie':'market_session=; HttpOnly; SameSite=Strict; Path=/api/market; Max-Age=0'});}
   if(req.method==='GET'&&route==='/draft')return send(res,200,{layout:readDraft(),versions:db.prepare('SELECT version,publication_status,created_at,created_by FROM map_versions ORDER BY version DESC LIMIT 15').all()});
   if(req.method==='POST'&&(route==='/draft'||route==='/publish')) {
    const {layout,baseRevision}=await body(req);const problems=validateLayout(layout);if(problems.length)return send(res,422,{error:problems.join(' ')});
    const current=readDraft();if(baseRevision!==current.revision)return send(res,409,{error:'The layout changed in another window. Reload the draft before saving.'});
    const next={...layout,market:{...layout.market,aerial:'market/aerial-reference.jpg',latitude:null,longitude:null},revision:current.revision+1};const json=JSON.stringify(next);const stamp=new Date().toISOString();
    db.exec('BEGIN IMMEDIATE');try{normalized(next);db.prepare('UPDATE map_draft SET revision=?,layout_data=? WHERE id=1').run(next.revision,json);db.prepare('INSERT INTO map_versions VALUES(?,?,?,?,?)').run(next.revision,json,route==='/publish'?'published':'draft',stamp,user.username);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
    return send(res,200,{layout:next,published:route==='/publish'});
   }
   send(res,404,{error:'Unknown map endpoint.'});
  }catch(e){send(res,e.status??400,{error:e.message??'The map request failed.'});}
 }
 return {middleware,close:()=>db.close()};
}
export default function marketMapPlugin(){return {name:'tanauan-map-api',configureServer(server){const api=createMapAPI();server.middlewares.use(api.middleware);server.httpServer?.once('close',api.close);},configurePreviewServer(server){const api=createMapAPI();server.middlewares.use(api.middleware);server.httpServer?.once('close',api.close);}};}
// Serve the production build and same-origin API with: node server/map-api.mjs
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const {createServer}=await import('node:http');const api=createMapAPI();
 createServer((req,res)=>api.middleware(req,res,()=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=resolve(root,'dist','.'+pathname);const base=resolve(root,'dist');
  if(!file.startsWith(base+'/')&&!file.startsWith(base+'\\')&&file!==base){res.writeHead(403);return res.end();}
  const target=existsSync(file)&&statSync(file).isFile()?file:resolve(base,'index.html');
  if(!existsSync(target)){res.writeHead(503);return res.end('Run npm run build first.');}
  const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.json':'application/json','.woff2':'font/woff2','.svg':'image/svg+xml'};
  res.setHeader('Content-Type',mime[extname(target)]??'application/octet-stream');createReadStream(target).pipe(res);
 })).listen(5173,'127.0.0.1',()=>process.stdout.write('Market system: http://127.0.0.1:5173\n'));
}