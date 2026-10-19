import { buildingAt } from './site-plan.mjs';
// Shared by the API, map renderer and tests. Coordinates are canvas units, never metres.
export function overlap(a,b) { return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y; }
export function segmentBlocked(a,b,rects) {
 return rects.some(r=>{
  // Liang-Barsky clipping, including boundary contact.
  let lo=0,hi=1; const dx=b.x-a.x,dy=b.y-a.y;
  for(const [p,q] of [[-dx,a.x-r.x],[dx,r.x+r.w-a.x],[-dy,a.y-r.y],[dy,r.y+r.h-a.y]]) {
   if(p===0) { if(q<0)return false; } else {const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return false;}
  }
  return true;
 });
}
export function validateLayout(l) {
 const errors=[]; const bad=m=>errors.push(m);
 if(!l || typeof l!=='object')return ['Invalid layout.'];
 if(!l.market || typeof l.market.name!=='string' || l.market.name.length>100 || typeof l.market.address!=='string' || l.market.address.length>200)bad('Invalid market details.');
 if(typeof l.verified!=='boolean')bad('Verification must be true or false.');
 for(const [key,max] of [['sections',30],['stalls',1000],['records',3000],['nodes',500],['edges',1000]])if(!Array.isArray(l[key])||l[key].length>max)bad(`Invalid ${key} list.`);
 if(l.siteLabels!==undefined&&(!Array.isArray(l.siteLabels)||l.siteLabels.length>3000))bad('Invalid siteLabels list.');
 if(errors.length)return errors;
 if(['sections','stalls','records','nodes'].some(key=>l[key].some(row=>!row||typeof row!=='object'||Array.isArray(row))))return ['Invalid map entity.'];
 if(l.siteLabels?.some(row=>!row||typeof row!=='object'||Array.isArray(row)))return ['Invalid site label.'];
 const text=(v,max=120)=>typeof v==='string'&&v.length<=max;
 const statuses=l.statuses??['Occupied','Available','Maintenance','Temporarily Closed','Closed','Abandoned'];
 if(!Array.isArray(statuses)||statuses.length<1||statuses.length>20||statuses.some(s=>!text(s,40)||!s.trim())||new Set(statuses).size!==statuses.length)return ['Invalid status configuration.'];
 const unique=(rows,key)=>new Set(rows.map(r=>r[key])).size===rows.length;
 for(const key of ['sections','stalls','records','nodes'])if(!unique(l[key],'id')||l[key].some(r=>!text(r.id,80)||!r.id))bad(`Duplicate or invalid ${key} IDs.`);
 if(l.siteLabels){
  if(!unique(l.siteLabels,'recordId'))bad('A record may have only one site label.');
  const recordIds=new Set(l.records.map(r=>r.id));
  l.siteLabels.forEach(label=>{
   if(!text(label.recordId,80)||!label.recordId||!recordIds.has(label.recordId))bad('Site labels must reference an existing directory record.');
   if(!Number.isFinite(label.x)||!Number.isFinite(label.y)||!buildingAt(label.x,label.y))bad('Site labels must be inside a mapped building footprint.');
   if(typeof label.verified!=='boolean')bad('Site label verification must be true or false.');
  });
 }
 const rect=r=>['x','y','w','h'].every(k=>Number.isFinite(r[k]))&&r.x>=20&&r.y>=20&&r.w>=12&&r.h>=12&&r.x+r.w<=580&&r.y+r.h<=920;
 l.sections.forEach(s=>{if(!rect(s)||!text(s.name,80)||!s.name||!text(s.code,20)||(s.description!==undefined&&!text(s.description,1000))||!/^#[a-f0-9]{6}$/i.test(s.color)||typeof s.active!=='boolean')bad(`Invalid section ${s.id}.`);});
 l.stalls.forEach(s=>{
  const section=l.sections.find(a=>a.id===s.sectionId);
  if(!rect(s)||!section||s.x<section.x||s.y<section.y||s.x+s.w>section.x+section.w||s.y+s.h>section.y+section.h||!text(s.label,80)||!text(s.recordId,80))bad(`Stall ${s.id} must fit inside its section.`);
  if(s.recordId&&!l.records.some(r=>r.id===s.recordId))bad(`Stall ${s.id} has an unknown record.`);
 });
 const assigned=l.stalls.filter(s=>s.recordId).map(s=>s.recordId);if(new Set(assigned).size!==assigned.length)bad('A record may be placed only once.');
 for(let i=0;i<l.stalls.length;i++)for(let j=i+1;j<l.stalls.length;j++)if(overlap(l.stalls[i],l.stalls[j]))bad(`Stalls ${l.stalls[i].id} and ${l.stalls[j].id} overlap.`);
 for(let i=0;i<l.sections.length;i++)for(let j=i+1;j<l.sections.length;j++)if(overlap(l.sections[i],l.sections[j]))bad(`Sections ${l.sections[i].name} and ${l.sections[j].name} overlap.`);
 l.records.forEach(r=>{if(!text(r.section)||!text(r.status,40)||!statuses.includes(r.status)||!text(r.businessName)||!text(r.vendorName)||!text(r.contact,200)||!text(r.description,1000)||!Array.isArray(r.products)||r.products.length>30||r.products.some(p=>!text(p,80))||['publicVendor','publicContact','visible'].some(k=>typeof r[k]!=='boolean'))bad(`Invalid directory record ${r.id}.`);});
 l.nodes.forEach(n=>{if(!Number.isFinite(n.x)||!Number.isFinite(n.y)||n.x<20||n.x>580||n.y<20||n.y>920||!text(n.name)||typeof n.entrance!=='boolean'||typeof n.verified!=='boolean')bad(`Invalid waypoint ${n.id}.`);});
 l.edges.forEach(edge=>{if(!Array.isArray(edge)||edge.length!==2){bad('Invalid aisle edge.');return;}const [a,b]=edge.map(id=>l.nodes.find(n=>n.id===id));if(!a||!b||a.id===b.id)bad('Aisle edges require two different waypoints.');else if(segmentBlocked(a,b,l.stalls))bad(`Aisle ${a.name} to ${b.name} intersects a stall.`);});
 if(l.verified && (!l.nodes.some(n=>n.entrance&&n.verified)||l.nodes.some(n=>!n.verified)))bad('Verify an entrance and every walkway point before enabling directions.');
 return [...new Set(errors)].slice(0,30);
}
export function findRoute(layout,startId,unit) {
 if(!layout.verified)return null;
 const start=layout.nodes.find(n=>n.id===startId&&n.entrance&&n.verified);if(!start)return null;
 const x=unit.x+unit.w/2,y=unit.y+unit.h/2;
 const doors=[{x:unit.x-5,y},{x:unit.x+unit.w+5,y},{x,y:unit.y-5},{x,y:unit.y+unit.h+5}];
 const others=layout.obstacles??layout.stalls;
 const distances=new Map(layout.nodes.map(n=>[n.id,Infinity]));const prev=new Map();const queue=new Set(layout.nodes.filter(n=>n.verified).map(n=>n.id));distances.set(start.id,0);
 while(queue.size){const id=[...queue].sort((a,b)=>distances.get(a)-distances.get(b))[0];if(!Number.isFinite(distances.get(id)))break;queue.delete(id);const a=layout.nodes.find(n=>n.id===id);
  layout.edges.filter(e=>e.includes(id)).forEach(e=>{const next=e.find(n=>n!==id);if(!queue.has(next))return;const b=layout.nodes.find(n=>n.id===next);if(segmentBlocked(a,b,others))return;const cost=distances.get(id)+Math.hypot(a.x-b.x,a.y-b.y);if(cost<distances.get(next)){distances.set(next,cost);prev.set(next,id);}});
 }
 let best=null;
 for(const node of layout.nodes.filter(n=>n.verified))for(const door of doors){const cost=Math.hypot(node.x-door.x,node.y-door.y);if(!segmentBlocked(node,door,others)&&(!best||cost<best.cost))best={node,door,cost};}
 if(!best||!Number.isFinite(distances.get(best.node.id)))return null;
 const route=[best.door];let id=best.node.id;while(id){const n=layout.nodes.find(n=>n.id===id);route.unshift({x:n.x,y:n.y});id=prev.get(id);}return route;
}
export function publicLayout(layout) {
 const result=structuredClone(layout); result.directoryManaged=layout.records.length>0; result.obstacles=layout.stalls.map(s=>({x:s.x,y:s.y,w:s.w,h:s.h}));
 const hidden=new Set(result.records.filter(r=>!r.visible).map(r=>r.id));
 result.records=result.records.filter(r=>r.visible).map(r=>({id:r.id,section:r.section,status:r.status,businessName:r.businessName,products:r.products,description:r.description,visible:true,publicVendor:r.publicVendor,publicContact:r.publicContact,vendorName:r.publicVendor?r.vendorName:'',contact:r.publicContact?r.contact:''}));
 if(result.siteLabels){
  const visibleRecords=new Set(result.records.map(r=>r.id));
  result.siteLabels=result.siteLabels.filter(label=>visibleRecords.has(label.recordId)).map(label=>({recordId:label.recordId,x:label.x,y:label.y,verified:label.verified}));
 }
 result.stalls=result.stalls.filter(s=>!hidden.has(s.recordId)&&result.sections.some(a=>a.id===s.sectionId&&a.active));
 result.sections=result.sections.filter(s=>s.active);
 return result;
}
export function searchDirectory(layout,query,status='') {
 const q=query.toLowerCase().trim();
 const stop=new Set(['where','can','i','buy','find','locate','stall','section','is','the','a','and','get','me','show','fresh']);
 const tokens=q.replace(/[^a-z0-9-]+/g,' ').split(' ').filter(t=>t&&!stop.has(t));
 return layout.records.filter(r=>r.visible&&(!status||r.status===status)).filter(r=>{const unit=layout.stalls.find(s=>s.recordId===r.id);const section=layout.sections.find(s=>s.id===unit?.sectionId);const hay=[r.id,r.businessName,r.publicVendor?r.vendorName:'',r.description,...r.products,r.section,section?.name].join(' ').toLowerCase();return !q||tokens.length===0||tokens.every(t=>hay.includes(t));});
}
