import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
export default function MapViewport({ children, outdoor, focus, title, onMapPoint, bounds }: { children:ReactNode;outdoor:boolean;bounds?:{x:number;y:number;w:number;h:number};focus?:{x:number;y:number;key:string};title:string;onMapPoint?:(x:number,y:number)=>void }) {
 const root=useRef<HTMLDivElement>(null),svg=useRef<SVGSVGElement>(null),group=useRef<SVGGElement>(null);
 const [camera,setCamera]=useState({x:0,y:0,z:1});const cameraRef=useRef(camera);cameraRef.current=camera;
 const pointers=useRef(new Map<number,{x:number;y:number}>());
 const gesture=useRef<{distance:number;camera:typeof camera;mid:{x:number;y:number}}|null>(null);
 const last=useRef<{x:number;y:number}|null>(null);const moved=useRef(false);
 const [fullscreen,setFullscreen]=useState(false),[message,setMessage]=useState('');
 const box=bounds??(outdoor?{x:0,y:340,w:828,h:1000}:{x:0,y:0,w:600,h:940});
 function toSvg(x:number,y:number){const m=svg.current?.getScreenCTM()?.inverse();if(!m)return{x:0,y:0};return new DOMPoint(x,y).matrixTransform(m);}
 useEffect(()=>{setCamera({x:0,y:0,z:1});},[outdoor]);
 useEffect(()=>{if(focus&&!outdoor)setCamera({x:box.x+box.w/2-focus.x*1.8,y:box.y+box.h/2-focus.y*1.8,z:1.8});},[focus?.key]); // A new selected result recenters the map.
 useEffect(()=>{
  const el=svg.current;const wheel=(event:WheelEvent)=>{if(!event.ctrlKey&&!event.metaKey&&document.fullscreenElement!==root.current)return;event.preventDefault();const p=toSvg(event.clientX,event.clientY);setCamera(old=>{const z=Math.max(.7,Math.min(4,old.z*Math.exp(-event.deltaY*.001)));const ratio=z/old.z;return{x:p.x-(p.x-old.x)*ratio,y:p.y-(p.y-old.y)*ratio,z};});};
  el?.addEventListener('wheel',wheel,{passive:false});const changed=()=>setFullscreen(document.fullscreenElement===root.current);document.addEventListener('fullscreenchange',changed);
  return()=>{el?.removeEventListener('wheel',wheel);document.removeEventListener('fullscreenchange',changed);};
 },[]);
 function zoom(delta:number){setCamera(old=>{const z=Math.max(.7,Math.min(4,old.z+delta)),cx=box.x+box.w/2,cy=box.y+box.h/2;return{x:cx-(cx-old.x)*z/old.z,y:cy-(cy-old.y)*z/old.z,z};});}
 return <div className="market-canvas" ref={root}>
  <div className="market-view-tag"><span className="material-symbols-outlined" aria-hidden="true">{outdoor?'satellite_alt':'layers'}</span>{title}</div>
  <svg ref={svg} viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} className="market-svg" aria-label={`${title}. Use arrow keys to pan, plus and minus to zoom, and Home to reset.`} role="group" tabIndex={0}
   onKeyDown={e=>{if(e.target!==e.currentTarget)return;if(e.key==='+'||e.key==='='){e.preventDefault();zoom(.25);}else if(e.key==='-'){e.preventDefault();zoom(-.25);}else if(e.key==='Home'){e.preventDefault();setCamera({x:0,y:0,z:1});}else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();setCamera(c=>({...c,x:c.x+(e.key==='ArrowLeft'?40:e.key==='ArrowRight'?-40:0),y:c.y+(e.key==='ArrowUp'?40:e.key==='ArrowDown'?-40:0)}));}}}
   onPointerDown={e=>{if(e.defaultPrevented||e.button!==0)return;pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});last.current={x:e.clientX,y:e.clientY};moved.current=false;if(pointers.current.size===2){const [a,b]=[...pointers.current.values()];gesture.current={distance:Math.hypot(a.x-b.x,a.y-b.y),camera:cameraRef.current,mid:toSvg((a.x+b.x)/2,(a.y+b.y)/2)};}}}
   onPointerMove={e=>{if(!pointers.current.has(e.pointerId))return;const old=pointers.current.get(e.pointerId)!;pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.current.size===2&&gesture.current){const [a,b]=[...pointers.current.values()];const g=gesture.current,z=Math.max(.7,Math.min(4,g.camera.z*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,g.distance)));const mid=toSvg((a.x+b.x)/2,(a.y+b.y)/2);setCamera({x:mid.x-(g.mid.x-g.camera.x)*z/g.camera.z,y:mid.y-(g.mid.y-g.camera.y)*z/g.camera.z,z});moved.current=true;}else{const a=toSvg(old.x,old.y),b=toSvg(e.clientX,e.clientY);setCamera(c=>({...c,x:c.x+b.x-a.x,y:c.y+b.y-a.y}));if(last.current&&Math.hypot(e.clientX-last.current.x,e.clientY-last.current.y)>4){moved.current=true;svg.current?.setPointerCapture(e.pointerId);}}}}
   onPointerUp={e=>{pointers.current.delete(e.pointerId);gesture.current=null;if(!moved.current&&onMapPoint&&group.current){const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(group.current.getScreenCTM()!.inverse());onMapPoint(p.x,p.y);}setTimeout(()=>{moved.current=false;},0);}}
   onPointerCancel={e=>{pointers.current.delete(e.pointerId);gesture.current=null;}} onClickCapture={e=>{if(moved.current){e.preventDefault();e.stopPropagation();}}}>
   <g ref={group} transform={`translate(${camera.x} ${camera.y}) scale(${camera.z})`}>{children}</g>
  </svg>
  <div className="market-map-controls" role="toolbar" aria-label="Map controls"><button type="button" title="Zoom in (+)" aria-label="Zoom in" disabled={camera.z>=4} onClick={()=>zoom(.25)}>+</button><button type="button" title="Zoom out (-)" aria-label="Zoom out" disabled={camera.z<=.7} onClick={()=>zoom(-.25)}>−</button><button type="button" title="Fit entire map (Home)" aria-label="Reset map view" onClick={()=>setCamera({x:0,y:0,z:1})}><span className="material-symbols-outlined" aria-hidden="true">center_focus_strong</span></button><button type="button" title={fullscreen?'Exit fullscreen':'Open larger map'} aria-label={fullscreen?'Exit fullscreen':'Enter fullscreen'} onClick={async()=>{try{if(fullscreen)await document.exitFullscreen();else await root.current?.requestFullscreen();}catch{setMessage('Fullscreen is unavailable in this window.');}}}><span className="material-symbols-outlined" aria-hidden="true">{fullscreen?'fullscreen_exit':'fullscreen'}</span></button></div>
  <span className="market-zoom-level" aria-live="polite">{message||`${Math.round(camera.z*100)}% · Drag to pan · Ctrl + scroll to zoom`}</span>
 </div>;
}