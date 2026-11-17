import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PHOTO_COLORS, PHOTO_FEATURES, PHOTO_AREAS, OVERVIEW_OFFSETS, OVERVIEW_X, FACILITY_IDS, FACILITY_COLOR, FILTER_TINTS, STATUS_COLORS, inOverview } from './photoLayout';
import type { PhotoView, PhotoPosition, StatusFilter } from './photoLayout';
import { isSharedStrip, ownerLabel } from './stallOwner';

export type SceneStall = PhotoPosition & { id: string; tenant: string; section: string; status: string; note: string };
export type ColorBy = 'section' | 'status';
type Props = { area: PhotoView; stalls: SceneStall[]; selected: string; matches: Set<string>; statusFilter:StatusFilter; colorBy:ColorBy; focusRequest?:{id:string;n:number}; onSelect: (id:string)=>void; onShowAll: ()=>void };
const featuresFor=(area:PhotoView)=>area==='all'?PHOTO_FEATURES.map(inOverview):PHOTO_FEATURES.filter(f=>f.area===area);
/* A stall's colour when no highlight is on: its section's, or its status's. */
const baseColor=(s:{id:string;status:string},colorBy:ColorBy)=>colorBy==='status'?(FACILITY_IDS.has(s.id)?FACILITY_COLOR:STATUS_COLORS[s.status]??FACILITY_COLOR):PHOTO_COLORS[s.id.split('-')[0]]??FACILITY_COLOR;
export default function PhotoScene({area,stalls,selected,matches,statusFilter,colorBy,focusRequest,onSelect,onShowAll}:Props) {
 const host=useRef<HTMLDivElement>(null);
 const root=useRef<HTMLDivElement>(null);
 const topView=useRef(false);
 const callback=useRef(onSelect);callback.current=onSelect;
 const api=useRef<{view:(top:boolean)=>void;zoom:(factor:number)=>void;focus:(id:string)=>void;highlight:(id:string,matches:Set<string>,filter:StatusFilter,colorBy:ColorBy)=>void}>();
 const highlightState=useRef({selected,matches,statusFilter,colorBy});highlightState.current={selected,matches,statusFilter,colorBy};
 const [failed,setFailed]=useState(false),[flat,setFlat]=useState(false);
 const [fullscreen,setFullscreen]=useState(false);
 useEffect(()=>{const change=()=>setFullscreen(document.fullscreenElement===root.current);document.addEventListener('fullscreenchange',change);return()=>document.removeEventListener('fullscreenchange',change);},[]);
 useEffect(()=>{
  const el=host.current;if(!el||flat)return;
  let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true});}catch{setFailed(true);return;}
  setFailed(false);renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
  el.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label','3D stall plan. Drag to rotate; use zoom controls. Select a stall to see its owner.');
  const scene=new THREE.Scene();scene.background=new THREE.Color('#e7eef3');
  const width=Math.max(...stalls.map(s=>s.x+s.w))+3,depth=Math.max(...stalls.map(s=>s.z+s.d))+2;
  const center=new THREE.Vector3((width-3)/2,0,(depth-2)/2);
  const camera=new THREE.OrthographicCamera(-25,25,15,-15,.1,400);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.enableZoom=false;controls.maxPolarAngle=Math.PI/2.1;controls.minPolarAngle=.03;
  scene.add(new THREE.HemisphereLight(0xffffff,0x8799ab,2));
  const light=new THREE.DirectionalLight(0xffffff,2.2);light.position.set(-15,30,15);scene.add(light);
  const resources:(THREE.BufferGeometry|THREE.Material|THREE.Texture)[]=[];
  const isDark=()=>document.documentElement.dataset.theme==='dark';
  const themeUpdates:(()=>void)[]=[];
  const picks:THREE.Object3D[]=[];const fills=new Map<string,THREE.MeshStandardMaterial[]>();const signs=new Map<string,THREE.SpriteMaterial>();
  const byId=new Map(stalls.map(s=>[s.id,s]));
  function box(x:number,z:number,w:number,d:number,h:number,color:string,y=h/2,darkColor?:string){
   const geometry=new THREE.BoxGeometry(w,h,d),material=new THREE.MeshStandardMaterial({color,roughness:.8});resources.push(geometry,material);
   material.userData.lightColor=color;material.userData.darkColor=darkColor??color;
   if(darkColor)themeUpdates.push(()=>material.color.set(isDark()?darkColor:color));
   const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x+w/2,y,z+d/2);scene.add(mesh);return mesh;
  }
  function label(text:string,x:number,z:number,w:number,y=1.05,id?:string,heading=false){
   const canvas=document.createElement('canvas');canvas.width=heading?1536:384;canvas.height=144;const c=canvas.getContext('2d')!;
   const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const material=new THREE.SpriteMaterial({map:texture,depthTest:false});resources.push(texture,material);
   themeUpdates.push(()=>{
    c.clearRect(0,0,canvas.width,144);
    c.fillStyle=heading?'#203c50':isDark()?'#22374b':'#ffffff';c.beginPath();c.roundRect(0,0,canvas.width,144,heading?22:12);c.fill();
    c.fillStyle=heading||isDark()?'#f0f6ff':'#152c40';c.font='bold 96px Arial';c.textAlign='center';c.textBaseline='middle';c.fillText(text,canvas.width/2,72,canvas.width-24);
    texture.needsUpdate=true;
   });
   const sprite=new THREE.Sprite(material);sprite.position.set(x+w/2,y,z+.85);sprite.scale.set(w*.98,heading?1.65:w*.98*144/384,1);sprite.renderOrder=2;scene.add(sprite);
   if(id){sprite.userData.id=id;picks.push(sprite);signs.set(id,material);}
  }
  box(-2.5,-1,width+2,depth,.3,'#a7b9c6',-.3,'#263749');box(-2.4,-.9,width+1.8,depth-.2,.12,'#fafbf8',-.08,'#1c2938');
  if(area==='all')for(const group of PHOTO_AREAS){
   const members=stalls.filter(s=>s.area===group.id);const left=Math.min(...members.map(s=>s.x)),right=Math.max(...members.map(s=>s.x+s.w));
   const top=Math.min(...members.map(s=>s.z)),bottom=Math.max(...members.map(s=>s.z+s.d));
   box(left-.3,top-.35,right-left+.6,bottom-top+.7,.025,group.id==='produce'?'#e4ecd9':group.id==='meat'?'#f5e8df':'#deedf3',0,group.id==='produce'?'#253c32':group.id==='meat'?'#403337':'#243b49');
  }
  for(const s of stalls){
   const color=PHOTO_COLORS[s.id.split('-')[0]]??'#8296aa';
   const shared=isSharedStrip(s);
   const mesh=box(s.x,s.z,s.w,s.d,shared?.2:.7,color);mesh.userData.id=s.id;picks.push(mesh);const parts=[mesh.material as THREE.MeshStandardMaterial];fills.set(s.id,parts);
   if(!shared){const counter=box(s.x+.06,s.z+.06,s.w-.12,s.d-.12,.08,s.status==='Available'?'#dce5e9':color,.75,s.status==='Available'?'#526476':undefined);const wall=box(s.x,s.z,.06,s.d,.9,color);parts.push(counter.material as THREE.MeshStandardMaterial,wall.material as THREE.MeshStandardMaterial);}
   label(s.id,s.x,s.z,s.w,shared?.6:1.1,s.id);
  }
  for(const f of featuresFor(area)){box(f.x,f.z,f.w,f.d,.35,'#a8b7c2',.175,'#53677b');label(f.label,f.x,f.z,f.w,.8);}
  if(area==='all')for(const group of PHOTO_AREAS)label(group.id==='fish-a'?'FISH · ROW A':group.id==='fish-b'?'FISH · ROW B':group.name.toUpperCase(),OVERVIEW_X[group.id],OVERVIEW_OFFSETS[group.id]-3,group.id.startsWith('fish')?16:24,.3,undefined,true);
  const applyTheme=()=>{scene.background=new THREE.Color(isDark()?'#101b2a':'#e7eef3');themeUpdates.forEach(update=>update());const h=highlightState.current;api.current?.highlight(h.selected,h.matches,h.statusFilter,h.colorBy);};
  applyTheme();
  const themeObserver=new MutationObserver(applyTheme);
  themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let downX=0,downY=0;
  const down=(e:PointerEvent)=>{downX=e.clientX;downY=e.clientY;};
  const up=(e:PointerEvent)=>{if(e.button!==0||Math.hypot(e.clientX-downX,e.clientY-downY)>5)return;const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);ray.setFromCamera(pointer,camera);const hit=ray.intersectObjects(picks)[0];if(hit)callback.current(String(hit.object.userData.id));};
  const lost=(e:Event)=>{e.preventDefault();setFailed(true);};
  renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('webglcontextlost',lost);
  const resize=()=>{const w=el.clientWidth,h=el.clientHeight;if(!w||!h)return;const aspect=w/h;camera.lookAt(controls.target);camera.updateMatrixWorld(true);let span=1;for(const x of [-2.5,width-.5])for(const y of [-.5,2])for(const z of [-1,depth-1]){const corner=new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse);span=Math.max(span,Math.abs(corner.y),Math.abs(corner.x)/aspect);}span*=1.12;camera.left=-span*aspect;camera.right=span*aspect;camera.top=span;camera.bottom=-span;camera.updateProjectionMatrix();renderer.setSize(w,h);};
  api.current={view:(top)=>{topView.current=top;controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(top?0:3,top?60:35,top?.01:30));camera.zoom=1;resize();camera.updateProjectionMatrix();controls.update();},zoom:factor=>{camera.zoom=THREE.MathUtils.clamp(camera.zoom*factor,.6,8);camera.updateProjectionMatrix();},focus:id=>{const s=stalls.find(s=>s.id===id);if(!s)return;const target=new THREE.Vector3(s.x+s.w/2,0,s.z+s.d/2);camera.position.add(target.clone().sub(controls.target));controls.target.copy(target);camera.zoom=el.clientWidth<600?5:3;camera.updateProjectionMatrix();controls.update();},highlight:(id,matching,filter,mode)=>{
   const tint=filter?FILTER_TINTS[filter]:'';
   fills.forEach((parts,key)=>parts.forEach((m,i)=>{
    const match=matching.has(key);const active=key===id;const stall=byId.get(key);
    /* By status, the counter top shows the status too; by section it stays as built (grey when vacant). */
    m.color.set(filter?(match?tint:'#87939e'):mode==='status'&&stall?baseColor(stall,'status'):(isDark()?m.userData.darkColor:m.userData.lightColor));
    if(mode==='status'&&!filter&&i===1&&stall?.status==='Available')m.color.set(isDark()?'#2e6b53':'#c7ead9');
    m.emissive.set(active?'#eab82b':filter&&match?tint:'#000000');
    m.emissiveIntensity=active?.65:filter&&match?.2:0;
    m.transparent=true;m.opacity=match?1:.18;m.depthWrite=match;
   }));
   signs.forEach((m,key)=>{m.color.set(key===id?'#ffd66b':filter&&matching.has(key)?filter==='Available'?'#b4ffdc':filter==='Inactive'?'#ffe2b0':'#bfddff':'#ffffff');m.opacity=matching.has(key)?1:.22;});
  }};
  api.current.view(topView.current);
  const observer=new ResizeObserver(resize);observer.observe(el);resize();
  let visible=true;const intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;});intersection.observe(el);
  renderer.setAnimationLoop(()=>{if(visible&&!document.hidden){controls.update();renderer.render(scene,camera);}});
  return()=>{themeObserver.disconnect();observer.disconnect();intersection.disconnect();renderer.setAnimationLoop(null);controls.dispose();resources.forEach(r=>r.dispose());renderer.dispose();renderer.domElement.remove();api.current=undefined;};
 },[area,stalls,flat]);
 useEffect(()=>{api.current?.highlight(selected,matches,statusFilter,colorBy);},[selected,matches,statusFilter,colorBy,area,stalls,flat]);
 /* A stall picked from search: fly the camera to it once the scene for its floor is built. */
 useEffect(()=>{if(focusRequest&&!flat)api.current?.focus(focusRequest.id);},[focusRequest,flat]);
 const w=Math.max(...stalls.map(s=>s.x+s.w))+3,d=Math.max(...stalls.map(s=>s.z+s.d))+2;
 const chosen=stalls.find(s=>s.id===selected);
 return <div className={`photo-scene${area==='all'?' photo-overview':''}`} ref={root}>
  <div className="photo-camera"><button type="button" onClick={()=>{topView.current=false;setFlat(false);onShowAll();api.current?.view(false);}}>3D perspective</button><button type="button" onClick={()=>{topView.current=true;setFlat(false);api.current?.view(true);}}>Top view</button><button type="button" aria-pressed={flat} onClick={()=>setFlat(v=>!v)}>2D plan</button><button type="button" aria-label="Zoom in" disabled={flat||failed} onClick={()=>api.current?.zoom(1.3)}>+</button><button type="button" aria-label="Zoom out" disabled={flat||failed} onClick={()=>api.current?.zoom(1/1.3)}>−</button>{selected&&!flat&&!failed&&<button type="button" onClick={()=>api.current?.focus(selected)}>Focus {selected}</button>}<button type="button" onClick={async()=>{try{if(fullscreen)await document.exitFullscreen();else await root.current?.requestFullscreen();}catch{/* Some embedded windows do not allow fullscreen. */}}}>{fullscreen?'Exit full screen':'Full screen'}</button></div>
  {failed&&!flat&&<p role="status">3D is unavailable in this browser. The interactive 2D plan is shown below.</p>}
  <div className="photo-canvas" ref={host} hidden={flat||failed}/>
  {(flat||failed)&&<svg className="photo-flat" viewBox={`-3 -1 ${w+3} ${d}`} aria-label="Interactive photographed stall arrangement">
   {area==='all'&&PHOTO_AREAS.map(group=><text key={group.id} x={OVERVIEW_X[group.id]} y={OVERVIEW_OFFSETS[group.id]-1.3} fontSize=".8" fontWeight="700" fill="#20334a">{group.id==='fish-a'?'FISH · ROW A':group.id==='fish-b'?'FISH · ROW B':group.name.toUpperCase()}</text>)}
   {featuresFor(area).map(f=><g key={f.label}><rect x={f.x} y={f.z} width={f.w} height={f.d} fill="#bccad5"/><text x={f.x+f.w/2} y={f.z+f.d/2} textAnchor="middle" fontSize=".32">{f.label}</text></g>)}
   {stalls.map(s=><g key={s.id} role="button" tabIndex={0} aria-label={`${s.id}, ${s.tenant}`} aria-pressed={selected===s.id} onClick={()=>onSelect(s.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(s.id);}}} opacity={matches.has(s.id)?1:.3}><rect x={s.x} y={s.z} width={s.w} height={s.d} fill={statusFilter?(matches.has(s.id)?FILTER_TINTS[statusFilter]:'#87939e'):baseColor(s,colorBy)} stroke={selected===s.id?'#142d49':'white'} strokeWidth={selected===s.id?.12:.035}/><text x={s.x+s.w/2} y={s.z+.95} textAnchor="middle" fontSize=".32" fill="#142d49" fontWeight="700">{s.id}</text></g>)}
  </svg>}
  <div className="photo-selection-strip" aria-live="polite">{chosen?<><span className="photo-selection-dot"/><strong>{chosen.id}</strong><span>{ownerLabel(chosen)}</span></>:<><span className="material-symbols-outlined" aria-hidden="true">touch_app</span><span>Click a stall to reveal its owner. Use + to zoom in for a closer look.</span></>}</div><p className="photo-gesture">Click a stall to see its owner · Drag to rotate · Right-drag to pan · + / − to zoom</p>
 </div>;
}
