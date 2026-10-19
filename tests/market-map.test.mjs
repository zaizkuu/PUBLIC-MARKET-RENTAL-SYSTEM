import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { createMapAPI } from '../server/map-api.mjs';
import { validateLayout, segmentBlocked, findRoute, publicLayout, searchDirectory } from '../src/market/domain.mjs';
import { footprints, project, buildingAt, sourceCoordinates, sourceInfo } from '../src/market/site-plan.mjs';
const seed=JSON.parse(readFileSync(new URL('../src/market/seed.json',import.meta.url),'utf8'));
const copy=()=>structuredClone(seed);
const record={tenant:'must not escape via extra properties',id:'TEST-FV-003',section:'Vegetables & Fruits',status:'Occupied',businessName:'Test-only vegetables',vendorName:'Private test name',publicVendor:false,contact:'private test contact',publicContact:false,products:['Tomatoes','Vegetables'],description:'Test fixture',visible:true};
const buildingCenter=id=>{const points=footprints.find(building=>building.id===id).points;return {x:points.reduce((sum,p)=>sum+p.x,0)/points.length,y:points.reduce((sum,p)=>sum+p.y,0)/points.length};};
const siteLabel=(id='main')=>({recordId:record.id,...buildingCenter(id),verified:false});
test('historical footprints preserve source coordinates, north-up proportions and polygon containment',()=>{
 assert.deepEqual(project(125.01878,11.1098),{x:35,y:35});
 assert.deepEqual(sourceCoordinates.main[0],[125.0192039,11.10958]);
 assert.deepEqual(sourceCoordinates.wet[0],[125.0188996,11.1088662]);
 assert.equal(sourceInfo.geometryDate,'2011-03-30');
 assert.equal(sourceInfo.features.main.wayId,106474064);
 assert.equal(sourceInfo.features.wet.wayId,106474048);
 const origin=project(125.019,11.109),east=project(125.0191,11.109),north=project(125.019,11.1091);
 assert.ok(east.x>origin.x&&north.y<origin.y);
 assert.ok(Math.abs((east.x-origin.x)/(origin.y-north.y)-Math.cos(11.1092*Math.PI/180))<1e-8);
 for(const footprint of footprints){
  const center=buildingCenter(footprint.id);assert.equal(buildingAt(center.x,center.y),footprint.id);
  for(const point of footprint.points)assert.equal(buildingAt(point.x,point.y),footprint.id,'boundary vertices belong to their building');
  const [a,b]=footprint.points;assert.equal(buildingAt((a.x+b.x)/2,(a.y+b.y)/2),footprint.id);
 }
 const main=footprints[0].points;
 assert.equal(buildingAt(Math.min(...main.map(p=>p.x)),Math.min(...main.map(p=>p.y))),undefined,'a bounding rectangle cannot stand in for the rotated outline');
 for(const [x,y] of [[35,35],[NaN,250],[250,Infinity]])assert.equal(buildingAt(x,y),undefined);
});
test('site labels are optional and accept only unique existing records within actual building footprints',()=>{
 assert.deepEqual(validateLayout(copy()),[],'old saved maps remain valid without siteLabels');
 const layout=copy();layout.records=[record];layout.siteLabels=[siteLabel()];
 assert.deepEqual(validateLayout(layout),[]);
 layout.siteLabels=[{...siteLabel('wet'),verified:true}];assert.deepEqual(validateLayout(layout),[],'label verification is independent of legacy walking routes');
 const invalid=[
  [null,'Invalid siteLabels list.'],
  [{},'Invalid siteLabels list.'],
  [[null],'Invalid site label.'],
  [[[]],'Invalid site label.'],
  [[siteLabel(),siteLabel('wet')],'only one site label'],
  [[{...siteLabel(),recordId:'MISSING'}],'existing directory record'],
  [[{...siteLabel(),recordId:''}],'existing directory record'],
  [[{...siteLabel(),x:35,y:35}],'mapped building footprint'],
  [[{...siteLabel(),x:NaN}],'mapped building footprint'],
  [[{...siteLabel(),y:Infinity}],'mapped building footprint'],
  [[{...siteLabel(),x:'350'}],'mapped building footprint'],
  [[{...siteLabel(),verified:'yes'}],'verification'],
  [Array.from({length:3001},()=>siteLabel()),'Invalid siteLabels list.'],
 ];
 for(const [labels,message] of invalid){layout.siteLabels=labels;assert.ok(validateLayout(layout).some(error=>error.includes(message)),message);}
});
test('public site labels omit hidden and unknown records and strip additional private fields',()=>{
 const layout=copy();layout.records=[record,{...record,id:'PRIVATE',visible:false}];
 const label=siteLabel();layout.siteLabels=[{...label,vendorName:'Private label name',contact:'Private label contact',notes:{tenant:'private'}},{...siteLabel('wet'),recordId:'PRIVATE'},{...siteLabel(),recordId:'ORPHAN'}];
 const pub=publicLayout(layout);
 assert.deepEqual(pub.siteLabels,[label]);
 assert.deepEqual(Object.keys(pub.siteLabels[0]).sort(),['recordId','verified','x','y']);
 assert.equal(layout.siteLabels[0].contact,'Private label contact','public projection does not mutate private drafts');
 assert.equal('siteLabels' in publicLayout(copy()),false,'legacy snapshots retain their shape');
});
test('reference layout follows four bands, contains no invented official records and has valid geometry',()=>{assert.deepEqual(seed.sections.map(s=>s.id),['fish','produce','kakanin','watson']);assert.equal(seed.records.length,0);assert.ok(seed.stalls.every(s=>!s.recordId));assert.deepEqual(validateLayout(seed),[]);});
test('validation blocks overlap, out-of-section geometry, repeated record assignments and blocked aisles',()=>{const l=copy();l.records=[record];l.stalls[0].recordId=record.id;l.stalls[1]={...l.stalls[1],x:l.stalls[0].x,y:l.stalls[0].y,recordId:record.id};assert.ok(validateLayout(l).some(e=>e.includes('overlap')));assert.ok(validateLayout(l).some(e=>e.includes('only once')));l.stalls[0].x=2;assert.ok(validateLayout(l).some(e=>e.includes('fit inside')));const blocked=copy();blocked.edges.push(['entry','fish-aisle']);blocked.stalls[0]={...blocked.stalls[0],x:260,y:100};assert.ok(validateLayout(blocked).some(e=>e.includes('intersects a stall')));});
test('routes stay disabled until verified and Dijkstra routes avoid stall rectangles',()=>{const l=copy();const unit=l.stalls.find(s=>s.id==='ref-v1');assert.equal(findRoute(l,'entry',unit),null);l.verified=true;l.nodes=l.nodes.map(n=>({...n,verified:true}));const route=findRoute(l,'entry',unit);assert.ok(route?.length>2);for(let i=1;i<route.length;i++)assert.equal(segmentBlocked(route[i-1],route[i],l.stalls),false);l.edges=[];l.stalls.push({id:'block',x:170,y:590,w:260,h:15,sectionId:'kakanin',recordId:'',label:'blocked'});assert.equal(findRoute(l,'entry',unit),null);});
test('public projection strips unapproved contacts and names and hides private records',()=>{const l=copy();l.records=[record,{...record,id:'PRIVATE',visible:false}];l.stalls[0].recordId='PRIVATE';const pub=publicLayout(l);assert.equal(pub.records.length,1);assert.equal(pub.records[0].vendorName,'');assert.equal(pub.records[0].contact,'');assert.equal(pub.records[0].tenant,undefined);assert.equal(pub.obstacles.length,seed.stalls.length);assert.ok(!pub.stalls.some(s=>s.recordId==='PRIVATE'));assert.equal(pub.directoryManaged,true);assert.equal(searchDirectory(pub,'Private test name').length,0);assert.equal(searchDirectory(pub,'Where can I buy vegetables?')[0].id,record.id);assert.equal(searchDirectory(pub,'Locate Stall TEST-FV-003')[0].id,record.id);});
test('authenticated API protects drafts, checks CSRF, versions publication, strips PII, rejects stale/invalid writes and persists published snapshots',async()=>{
 const api=createMapAPI(':memory:');const server=createServer(api.middleware);await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;let cookie='',csrf='';
 const call=async(path,body,extra={})=>{const response=await fetch(origin+'/api/market/'+path,{method:body?'POST':'GET',headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-Map-CSRF':csrf}:{}),'Content-Type':'application/json',...extra},body:body?JSON.stringify(body):undefined});const set=response.headers.get('set-cookie');if(set)cookie=set.split(';')[0];return{status:response.status,data:await response.json()};};
 try{
  assert.equal((await call('draft')).status,401);
  assert.equal((await call('session')).data.setupRequired,true);
  const signed=await call('setup',{username:'test-admin',password:'test-only-long-password'});assert.equal(signed.status,200);csrf=signed.data.csrf;
  assert.equal((await call('setup',{username:'another',password:'test-only-long-password'})).status,409);
  assert.equal((await call('draft',{} ,{'X-Map-CSRF':'wrong'})).status,403);
  const draft=(await call('draft')).data.layout;draft.records=[record];draft.stalls[5].recordId=record.id;draft.siteLabels=[{...siteLabel(),contact:'Private label contact'}];
  const saved=await call('draft',{layout:draft,baseRevision:0});assert.equal(saved.status,200);assert.equal(saved.data.layout.revision,1);
  assert.deepEqual(saved.data.layout.siteLabels,draft.siteLabels,'site labels persist in draft snapshots without schema changes');
  assert.equal((await call('public')).data.layout.records.length,0,'saving a draft cannot change public data');
  assert.equal((await call('draft',{layout:draft,baseRevision:0})).status,409);
  const published=await call('publish',{layout:saved.data.layout,baseRevision:1});assert.equal(published.status,200);
  const pub=(await call('public')).data.layout;assert.equal(pub.records[0].vendorName,'');assert.equal(pub.records[0].contact,'');assert.equal(pub.records[0].tenant,undefined);assert.equal(pub.obstacles.length,seed.stalls.length);assert.equal(pub.stalls.find(s=>s.recordId===record.id).id,'ref-v1');
  assert.deepEqual(pub.siteLabels,[siteLabel()],'public API exposes only approved label fields');
  const outside=structuredClone(published.data.layout);outside.siteLabels[0].x=0;assert.equal((await call('publish',{layout:outside,baseRevision:2})).status,422);assert.equal((await call('public')).data.layout.revision,2);
  const invalid=structuredClone(published.data.layout);invalid.stalls[0].x=-50;assert.equal((await call('publish',{layout:invalid,baseRevision:2})).status,422);assert.equal((await call('public')).data.layout.revision,2);
  assert.equal((await call('draft',{layout:published.data.layout,baseRevision:2},{Origin:'https://attacker.invalid'})).status,403);
  await call('logout',{});csrf='';assert.equal((await call('draft')).status,401);
  assert.equal((await call('login',{username:'test-admin',password:'incorrect'})).status,401);
  const login=await call('login',{username:'test-admin',password:'test-only-long-password'});assert.equal(login.status,200);csrf=login.data.csrf;assert.equal((await call('draft')).data.versions.length,3);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));api.close();}
});
test('SQLite layout versions and password hashes survive service restarts',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'tanauan-map-test-'));const file=join(folder,'map.sqlite');let api=createMapAPI(file);let server=createServer(api.middleware);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let origin=`http://127.0.0.1:${server.address().port}`;
 try {
  const setup=await fetch(origin+'/api/market/setup',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'restart-admin',password:'restart-test-password'})});assert.equal(setup.status,200);
  const auth=await setup.json(),cookie=setup.headers.get('set-cookie').split(';')[0];const l=copy();l.sections[3].description='Verified use remains editable';l.records=[record];l.siteLabels=[siteLabel('wet')];
  const publish=await fetch(origin+'/api/market/publish',{method:'POST',headers:{Origin:origin,Cookie:cookie,'X-Map-CSRF':auth.csrf,'Content-Type':'application/json'},body:JSON.stringify({layout:l,baseRevision:0})});assert.equal(publish.status,200);
  server.closeAllConnections();await new Promise(r=>server.close(r));api.close();api=createMapAPI(file);server=createServer(api.middleware);await new Promise(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${server.address().port}`;
  const pub=await(await fetch(origin+'/api/market/public')).json();assert.equal(pub.layout.revision,1);assert.equal(pub.layout.sections[3].description,'Verified use remains editable');
  assert.deepEqual(pub.layout.siteLabels,[siteLabel('wet')],'site label snapshots survive a database restart');
  const login=await fetch(origin+'/api/market/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'restart-admin',password:'restart-test-password'})});assert.equal(login.status,200);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));api.close();assert.ok(resolve(folder).startsWith(resolve(tmpdir())+ '\\')||resolve(folder).startsWith(resolve(tmpdir())+'/'));rmSync(folder,{recursive:true,force:true});}
});
