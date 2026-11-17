import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

type Camera = { x: number; y: number; z: number };
type Point = { x: number; y: number };
type MapViewportProps = {
 children: ReactNode;
 outdoor: boolean;
 bounds?: { x: number; y: number; w: number; h: number };
 focus?: Point & { key: string };
 resetKey?: string | number;
 title: string;
 onMapPoint?: (x: number, y: number) => void;
};
const initialCamera: Camera = { x: 0, y: 0, z: 1 };
const limitZoom = (zoom: number) => Math.max(.7, Math.min(4, zoom));

export default function MapViewport({ children, outdoor, focus, resetKey, title, onMapPoint, bounds }: MapViewportProps) {
 const root = useRef<HTMLDivElement>(null);
 const svg = useRef<SVGSVGElement>(null);
 const group = useRef<SVGGElement>(null);
 const [camera, setCamera] = useState(initialCamera);
 const cameraRef = useRef(camera);
 cameraRef.current = camera;
 const pointers = useRef(new Map<number, Point>());
 const gesture = useRef<{ distance: number; camera: Camera; mid: Point } | null>(null);
 const start = useRef<Point | null>(null);
 const moved = useRef(false);
 const [fullscreen, setFullscreen] = useState(false);
 const [expanded, setExpanded] = useState(false);
 const box = bounds ?? (outdoor ? { x: 0, y: 340, w: 828, h: 1000 } : { x: 0, y: 0, w: 600, h: 960 });

 function toSvg(x: number, y: number) {
  const matrix = svg.current?.getScreenCTM()?.inverse();
  return matrix ? new DOMPoint(x, y).matrixTransform(matrix) : { x: 0, y: 0 };
 }

 useEffect(() => { setCamera(initialCamera); }, [outdoor, resetKey]);
 useEffect(() => {
  if (focus && !outdoor) setCamera({ x: box.x + box.w / 2 - focus.x * 1.8, y: box.y + box.h / 2 - focus.y * 1.8, z: 1.8 });
 }, [focus?.key, outdoor, box.x, box.y, box.w, box.h]);

 useEffect(() => {
  const element = svg.current;
  const wheel = (event: WheelEvent) => {
   if (!event.ctrlKey && !event.metaKey && document.fullscreenElement !== root.current && !expanded) return;
   event.preventDefault();
   const point = toSvg(event.clientX, event.clientY);
   setCamera(old => {
    const z = limitZoom(old.z * Math.exp(-event.deltaY * .001));
    const ratio = z / old.z;
    return { x: point.x - (point.x - old.x) * ratio, y: point.y - (point.y - old.y) * ratio, z };
   });
  };
  const changed = () => setFullscreen(document.fullscreenElement === root.current);
  element?.addEventListener('wheel', wheel, { passive: false });
  document.addEventListener('fullscreenchange', changed);
  return () => {
   element?.removeEventListener('wheel', wheel);
   document.removeEventListener('fullscreenchange', changed);
  };
 }, [expanded]);

 useEffect(() => {
  if (!expanded) return;
  const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false); };
  const oldOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', escape);
  return () => {
   document.body.style.overflow = oldOverflow;
   document.removeEventListener('keydown', escape);
  };
 }, [expanded]);

 function zoom(delta: number) {
  setCamera(old => {
   const z = limitZoom(old.z + delta), cx = box.x + box.w / 2, cy = box.y + box.h / 2;
   return { x: cx - (cx - old.x) * z / old.z, y: cy - (cy - old.y) * z / old.z, z };
  });
 }

 async function toggleFullscreen() {
  if (expanded) { setExpanded(false); return; }
  if (fullscreen) { await document.exitFullscreen(); return; }
  try {
   if (!root.current?.requestFullscreen) { setExpanded(true); return; }
   await root.current.requestFullscreen();
  } catch {
   // Embedded windows without Fullscreen API support can still show a larger local view.
   setExpanded(true);
  }
 }

 return <div className={`market-canvas${expanded ? ' is-expanded' : ''}`} ref={root}>
  <div className="market-view-tag"><span className="material-symbols-outlined" aria-hidden="true">{outdoor ? 'satellite_alt' : 'layers'}</span>{title}</div>
  <svg ref={svg} viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} className="market-svg" aria-label={`${title}. Use arrow keys to pan, plus and minus to zoom, and Home to reset.`} role="group" tabIndex={0}
   onKeyDown={event => {
    if (event.target !== event.currentTarget) return;
    if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(.25); }
    else if (event.key === '-') { event.preventDefault(); zoom(-.25); }
    else if (event.key === 'Home') { event.preventDefault(); setCamera(initialCamera); }
    else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
     event.preventDefault();
     setCamera(old => ({ ...old, x: old.x + (event.key === 'ArrowLeft' ? 40 : event.key === 'ArrowRight' ? -40 : 0), y: old.y + (event.key === 'ArrowUp' ? 40 : event.key === 'ArrowDown' ? -40 : 0) }));
    }
   }}
   onPointerDown={event => {
    if (event.defaultPrevented || event.button !== 0) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    start.current = { x: event.clientX, y: event.clientY };
    moved.current = false;
    if (pointers.current.size === 2) {
     const [a, b] = [...pointers.current.values()];
     gesture.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), camera: cameraRef.current, mid: toSvg((a.x + b.x) / 2, (a.y + b.y) / 2) };
    }
   }}
   onPointerMove={event => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2 && gesture.current) {
     const [a, b] = [...pointers.current.values()];
     const initial = gesture.current;
     const z = limitZoom(initial.camera.z * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, initial.distance));
     const mid = toSvg((a.x + b.x) / 2, (a.y + b.y) / 2);
     setCamera({ x: mid.x - (initial.mid.x - initial.camera.x) * z / initial.camera.z, y: mid.y - (initial.mid.y - initial.camera.y) * z / initial.camera.z, z });
     moved.current = true;
    } else {
     const a = toSvg(previous.x, previous.y), b = toSvg(event.clientX, event.clientY);
     setCamera(old => ({ ...old, x: old.x + b.x - a.x, y: old.y + b.y - a.y }));
     if (start.current && Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > 4) {
      moved.current = true;
      svg.current?.setPointerCapture(event.pointerId);
     }
    }
   }}
   onPointerUp={event => {
    const tracked = pointers.current.delete(event.pointerId);
    gesture.current = null;
    const matrix = group.current?.getScreenCTM();
    if (tracked && !moved.current && onMapPoint && matrix) {
     const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
     onMapPoint(point.x, point.y);
    }
    setTimeout(() => { if (!pointers.current.size) moved.current = false; }, 0);
   }}
   onPointerCancel={event => { pointers.current.delete(event.pointerId); gesture.current = null; }}
   onClickCapture={event => { if (moved.current) { event.preventDefault(); event.stopPropagation(); } }}>
   <g ref={group} transform={`translate(${camera.x} ${camera.y}) scale(${camera.z})`}>{children}</g>
  </svg>
  <div className="market-map-controls" role="group" aria-label="Floor plan controls">
   <button type="button" title="Zoom out (-)" aria-label="Zoom out" disabled={camera.z <= .7} onClick={() => zoom(-.25)}><span className="material-symbols-outlined" aria-hidden="true">remove</span></button>
   <output className="market-zoom-value" aria-label="Zoom level" aria-live="polite">{Math.round(camera.z * 100)}%</output>
   <button type="button" title="Zoom in (+)" aria-label="Zoom in" disabled={camera.z >= 4} onClick={() => zoom(.25)}><span className="material-symbols-outlined" aria-hidden="true">add</span></button>
   <span className="market-control-divider" aria-hidden="true"/>
   <button type="button" className="market-fit-button" title="Fit entire floor plan (Home)" aria-label="Reset map view" onClick={() => setCamera(initialCamera)}><span className="material-symbols-outlined" aria-hidden="true">center_focus_strong</span><span>Fit</span></button>
   <button type="button" title={fullscreen || expanded ? 'Exit full screen' : 'Open full screen'} aria-label={fullscreen || expanded ? 'Exit fullscreen' : 'Enter fullscreen'} onClick={() => void toggleFullscreen()}><span className="material-symbols-outlined" aria-hidden="true">{fullscreen || expanded ? 'fullscreen_exit' : 'fullscreen'}</span></button>
  </div>
  <span className="market-zoom-level">Drag to move <span aria-hidden="true">·</span> Ctrl + scroll to zoom</span>
 </div>;
}
