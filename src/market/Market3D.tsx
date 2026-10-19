import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Section } from './types';

type Props={sections:Section[];selectedId?:string;onSelect:(id:string)=>void};
const zones:Record<string,{z:number;rows:number[];color:string;label:string}>={
 fish:{z:-6.5,rows:[-8.5,-5.2],color:'#397ec3',label:'A  FISH & MEAT'},
 produce:{z:.1,rows:[-1.9,1.4],color:'#47815a',label:'B  FRUIT & VEGETABLES'},
 kakanin:{z:5,rows:[5],color:'#bd763c',label:'C  KAKANIN'}
};
export default function Market3D({sections,selectedId,onSelect}:Props){
 const host=useRef<HTMLDivElement>(null),root=useRef<HTMLDivElement>(null);
 const api=useRef<{view:(top?:boolean)=>void;zoom:(factor:number)=>void;select:(id?:string)=>void}>();
 const selectRef=useRef(onSelect);selectRef.current=onSelect;
 const [failed,setFailed]=useState(false),[fullscreen,setFullscreen]=useState(false);
 const sectionKey=sections.filter(s=>s.active).map(s=>s.id).join(',');
 useEffect(()=>{
  const el=host.current;if(!el)return;
  let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true});}catch{setFailed(true);return;}
  setFailed(false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','Interactive 3D market. Drag to rotate, right-drag to pan. Use the view and zoom buttons or select a section in the sidebar.');
  el.appendChild(renderer.domElement);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#e9eef4');
  const camera=new THREE.PerspectiveCamera(39,1,.1,200);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;controls.enableZoom=true;controls.minDistance=10;controls.maxDistance=65;
  controls.maxPolarAngle=Math.PI/2.15;controls.minPolarAngle=.05;
  controls.target.set(0,0,0);
  scene.add(new THREE.HemisphereLight('#fff8e8','#7e8c9c',2.4));
  const sun=new THREE.DirectionalLight('#fff4dd',3);sun.position.set(-12,25,12);sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-22,right:22,top:22,bottom:-22,far:70});sun.shadow.normalBias=.04;scene.add(sun);
  const materials:THREE.Material[]=[],textures:THREE.Texture[]=[],geometries:THREE.BufferGeometry[]=[];
  function material(color:string,metalness=0){const m=new THREE.MeshStandardMaterial({color,roughness:.72,metalness});materials.push(m);return m;}
  const cream=material('#e4ce9c'),trim=material('#344b5f',.25),tile=material('#f4eee0'),floor=material('#d8ccb8'),walk=material('#8c949b');
  function box(w:number,h:number,d:number,x:number,y:number,z:number,m:THREE.Material){const g=new THREE.BoxGeometry(w,h,d);geometries.push(g);const mesh=new THREE.Mesh(g,m);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);return mesh;}
  function label(text:string,x:number,z:number,color='#334155',width=4.1){
   const c=document.createElement('canvas');c.width=768;c.height=128;const ctx=c.getContext('2d')!;
   ctx.fillStyle='#ffffff';ctx.beginPath();ctx.roundRect(0,0,768,128,22);ctx.fill();ctx.fillStyle=color;ctx.font='bold 54px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,384,64,730);
   const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;textures.push(t);
   const m=new THREE.SpriteMaterial({map:t,depthTest:false});materials.push(m);const sprite=new THREE.Sprite(m);sprite.position.set(x,1.9,z);sprite.scale.set(width,width/6,1);sprite.renderOrder=10;scene.add(sprite);
  }
  box(29,.45,26,0,-.3,0,trim);box(28,.15,25,0,0,0,floor);
  box(3.8,.04,24,0,.1,0,tile);
  for(const x of [-11.7,11.7])box(2,.04,23,x,.1,0,walk);
  // Low exterior walls keep the building open for viewing from every angle.
  for(const x of [-13.7,13.7]){box(.38,1.65,25,x,.85,0,cream);box(.45,.16,25,x,1.74,0,trim);}
  for(const z of [-12.3,12.3])for(const x of [-7.8,7.8]){box(11.8,1.3,.35,x,.65,z,cream);box(11.8,.13,.4,x,1.35,z,trim);}
  for(const x of [-10.5,10.5])for(const z of [-11.6,-7,-2.4,2.2,6.8,11.4]){box(.42,2.4,.42,x,1.2,z,cream);box(.58,.18,.58,x,2.45,z,trim);}
  const grid=new THREE.GridHelper(24,24,'#bcae96','#cfc3ae');grid.position.y=.105;scene.add(grid);geometries.push(grid.geometry);if(Array.isArray(grid.material))materials.push(...grid.material);else materials.push(grid.material);
  const picks:THREE.Object3D[]=[],highlights=new Map<string,THREE.MeshStandardMaterial>();
  for(const id of sectionKey.split(',')){
   const zone=zones[id];if(!zone)continue;
   const accent=material(zone.color);const highlight=new THREE.MeshStandardMaterial({color:zone.color,transparent:true,opacity:0,depthWrite:false});materials.push(highlight);highlights.set(id,highlight);
   const patch=box(19,.025,id==='fish'||id==='produce'?6.1:2.9,0,.13,zone.z,highlight);patch.userData.section=id;picks.push(patch);
   for(const z of zone.rows)for(const x of [-5.9,5.9]){
    const base=box(7.5,.95,1.55,x,.65,z,cream);base.userData.section=id;picks.push(base);
    const counter=box(7.8,.16,1.8,x,1.2,z,tile);counter.userData.section=id;picks.push(counter);
    box(7.8,.09,.09,x,1.12,z+.9,accent);
    for(let i=0;i<5;i++){box(.035,.025,1.8,x-3.1+i*1.55,1.295,z,trim);}
    for(const end of [-3.8,3.8]){box(.35,1.6,1.8,x+end,.85,z,cream);box(.42,.12,1.86,x+end,1.7,z,trim);}
   }
   label(zone.label,0,zone.z,zone.color,5.5);
  }
  for(const z of [-13,13]){for(let i=0;i<3;i++)box(3.8,.16,1.3,0,-.14-i*.12,z+(z>0?1:-1)*i*.45,tile);label(z<0?'NORTH ENTRANCE':'SOUTH ENTRANCE',0,z,'#334155',4.2);}
  label('HALLWAY',-11.7,0,'#475569',2.5);label('HALLWAY',11.7,0,'#475569',2.5);
  const ray=new THREE.Raycaster(),mouse=new THREE.Vector2();let start={x:0,y:0};
  const down=(e:PointerEvent)=>{start={x:e.clientX,y:e.clientY};};
  const up=(e:PointerEvent)=>{if(e.button!==0||Math.hypot(e.clientX-start.x,e.clientY-start.y)>5)return;const r=renderer.domElement.getBoundingClientRect();mouse.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(mouse,camera);const hit=ray.intersectObjects(picks)[0];if(hit)selectRef.current(hit.object.userData.section as string);};
  renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointerup',up);
  const zoom=(factor:number)=>{const offset=camera.position.clone().sub(controls.target);offset.setLength(THREE.MathUtils.clamp(offset.length()*factor,10,65));camera.position.copy(controls.target).add(offset);controls.update();};
  const wheel=(e:WheelEvent)=>{e.stopImmediatePropagation();if(e.ctrlKey||e.metaKey||document.fullscreenElement===root.current){e.preventDefault();zoom(e.deltaY>0?1.1:.9);}};
  renderer.domElement.addEventListener('wheel',wheel,{passive:false,capture:true});
  api.current={view:(top=false)=>{controls.target.set(0,0,0);const distance=el.clientWidth/el.clientHeight<1?49:39;camera.position.set(top?0:distance*.48,top?distance:distance*.76,top ? .01 : distance*.76);controls.update();},zoom,select:(id)=>{highlights.forEach((m,key)=>{m.opacity=key===id ? .19 : 0;});}};
  api.current.view();api.current.select(selectedId);
  const resize=()=>{const w=el.clientWidth,h=el.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();};
  const observer=new ResizeObserver(resize);observer.observe(el);resize();
  let visible=true;const intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;});intersection.observe(el);
  renderer.setAnimationLoop(()=>{if(visible&&!document.hidden){controls.update();renderer.render(scene,camera);}});
  const lost=(e:Event)=>{e.preventDefault();setFailed(true);};renderer.domElement.addEventListener('webglcontextlost',lost);
  return()=>{observer.disconnect();intersection.disconnect();renderer.setAnimationLoop(null);controls.dispose();renderer.domElement.removeEventListener('pointerdown',down);renderer.domElement.removeEventListener('pointerup',up);renderer.domElement.removeEventListener('wheel',wheel,true);renderer.domElement.removeEventListener('webglcontextlost',lost);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());renderer.dispose();renderer.domElement.remove();api.current=undefined;};
 },[sectionKey]);
 useEffect(()=>{api.current?.select(selectedId);},[selectedId]);
 useEffect(()=>{const change=()=>setFullscreen(document.fullscreenElement===root.current);document.addEventListener('fullscreenchange',change);return()=>document.removeEventListener('fullscreenchange',change);},[]);
 return <div className="market-three" ref={root}>
  <div className="market-three-host" ref={host}/>
  <div className="market-view-tag"><span className="material-symbols-outlined" aria-hidden="true">view_in_ar</span>Virtual market - 3D</div>
  {failed?<div className="market-three-fallback" role="status"><p>3D is unavailable in this browser.</p><p>Enable hardware acceleration or try another browser to view the market.</p></div>:<>
   <div className="market-three-views" role="group" aria-label="3D camera views"><button type="button" onClick={()=>api.current?.view()}>Perspective</button><button type="button" onClick={()=>api.current?.view(true)}>Top view</button></div>
   <div className="market-map-controls" role="toolbar" aria-label="3D map controls"><button type="button" title="Zoom in" aria-label="Zoom into 3D map" onClick={()=>api.current?.zoom(.85)}>+</button><button type="button" title="Zoom out" aria-label="Zoom out of 3D map" onClick={()=>api.current?.zoom(1.15)}>-</button><button type="button" title="Reset 3D view" aria-label="Reset 3D view" onClick={()=>api.current?.view()}><span className="material-symbols-outlined">center_focus_strong</span></button><button type="button" title="Fullscreen" aria-label={fullscreen?'Exit 3D fullscreen':'Enter 3D fullscreen'} onClick={async()=>{try{if(fullscreen)await document.exitFullscreen();else await root.current?.requestFullscreen();}catch{/* Embedded windows can disallow fullscreen. */}}}><span className="material-symbols-outlined">{fullscreen?'fullscreen_exit':'fullscreen'}</span></button></div>
   <span className="market-zoom-level">Drag to rotate / Right-drag to pan / Pinch to zoom</span>
  </>}
 </div>;
}
