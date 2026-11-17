import { lazy, Suspense, useMemo, useState } from 'react';
import { buildDirectory } from './directory';
import { buildSecondFloor } from './secondFloor';
import { registerName } from './registerNames';
import { FACILITY_IDS, FILTER_TINTS, PHOTO_AREAS, PHOTO_COLORS, PHOTO_POSITIONS, SECTION_LABELS, STATUS_COLORS, UPPER_POSITIONS, inOverview, statusGroup } from './photoLayout';
import type { PhotoView, StatusFilter } from './photoLayout';
import { isSharedStrip, ownerLabel, searchKey } from './stallOwner';
import type { ExistingStall } from './types';
import type { ColorBy, SceneStall } from './PhotoScene';
import './PhotoFloorPlan.css';

const PhotoScene=lazy(()=>import('./PhotoScene'));

/* Every stall the map can place: the ground floor from the layout photographs,
   matched to the directory by number, and the 2nd floor from its vendor list. */
const directory=buildDirectory().stalls;
const groundMapped:SceneStall[]=PHOTO_POSITIONS.map(position=>{
 const row=directory.find(s=>Number(s.id.split('-')[1])===position.number);
 if(!row)throw new Error(`Photo position ${position.number} has no directory record`);
 return {...position,...row};
});
const upperList=buildSecondFloor().stalls;
const upperMapped:SceneStall[]=UPPER_POSITIONS.map(position=>{
 const row=upperList.find(s=>s.id===`PS-${position.number}`);
 if(!row)throw new Error(`2nd floor position ${position.number} has no stall on the vendor list`);
 return {...position,...row};
});
const mapped=[...groundMapped,...upperMapped];

type Floor='ground'|'upper';
type CurrentRecord=ExistingStall&{tenant?:string;permit?:string;note?:string};
const FLOORS:{id:Floor;name:string}[]=[{id:'ground',name:'Ground floor'},{id:'upper',name:'2nd floor'}];
const views:{id:PhotoView;name:string}[]=[{id:'all',name:'All sections'},...PHOTO_AREAS];
const FILTERS:{id:Exclude<StatusFilter,''>;name:string;cls:string}[]=[{id:'Available',name:'Available',cls:'available'},{id:'Occupied',name:'Occupied',cls:'occupied'},{id:'Inactive',name:'Not operating',cls:'inactive'}];
const floorOf=(s:{area:string})=>s.area==='upper'?'upper':'ground';
/* "ps-01", "PS 1" and "ps1" all mean PS-1. */
const normalizeId=(q:string)=>q.replace(/^([a-z]{2})\s*-?\s*0*(\d+)$/,'$1-$2');

export default function PhotoFloorPlan({existingStalls}:{existingStalls:ExistingStall[]}) {
 const [area,setArea]=useState<PhotoView>('all'),[selected,setSelected]=useState('');
 const [statusFilter,setStatusFilter]=useState<StatusFilter>('');
 const [colorBy,setColorBy]=useState<ColorBy>('section');
 const [query,setQuery]=useState(''),[searchOpen,setSearchOpen]=useState(false);
 const [focusRequest,setFocusRequest]=useState<{id:string;n:number}>();
 const floor:Floor=area==='upper'?'upper':'ground';
 const records=useMemo(()=>new Map((existingStalls as CurrentRecord[]).map(s=>[s.id,s])),[existingStalls]);
 /* Tenant names and statuses come from the current records wherever the records hold the stall. */
 const liveMapped=useMemo(()=>mapped.map(s=>{const current=records.get(s.id);return current?{...s,...current} as SceneStall:s;}),[records]);
 const stalls=useMemo(()=>area==='all'?liveMapped.filter(s=>floorOf(s)==='ground').map(inOverview):liveMapped.filter(s=>s.area===area),[area,liveMapped]);
 const matches=useMemo(()=>new Set(liveMapped.filter(s=>!statusFilter||(!FACILITY_IDS.has(s.id)&&statusGroup(s.status)===statusFilter)).map(s=>s.id)),[liveMapped,statusFilter]);
 const counts=useMemo(()=>{const c={Available:0,Occupied:0,Inactive:0};for(const s of stalls)if(!FACILITY_IDS.has(s.id))c[statusGroup(s.status)]+=1;return c;},[stalls]);
 const floorTotals=useMemo(()=>({ground:liveMapped.filter(s=>floorOf(s)==='ground').length,upper:liveMapped.filter(s=>floorOf(s)==='upper').length}),[liveMapped]);
 const results=useMemo(()=>{
  const q=searchKey(query.trim());if(!q)return [];
  const id=normalizeId(q).toUpperCase();const words=q.split(/\s+/);
  const exact=liveMapped.filter(s=>s.id===id);
  const rest=liveMapped.filter(s=>s.id!==id&&words.every(w=>searchKey(`${s.id} ${s.tenant} ${registerName(s.tenant)} ${s.section}`).includes(w)));
  return [...exact,...rest].slice(0,8);
 },[query,liveMapped]);
 const chosen=liveMapped.find(s=>s.id===selected);
 const original=mapped.find(s=>s.id===selected);
 const current=records.get(selected);
 /* Clicking in the plan keeps the view; choosing from search goes to the stall's floor and section. */
 const pick=(id:string)=>{const s=mapped.find(s=>s.id===id);if(s){setSelected(id);if(area!=='all')setArea(s.area);}};
 const find=(id:string)=>{const s=mapped.find(s=>s.id===id);if(!s)return;
  if(floorOf(s)==='upper')setArea('upper');else if(area==='upper'||(area!=='all'&&area!==s.area))setArea(area==='upper'?'all':s.area);
  setSelected(id);setQuery('');setFocusRequest({id,n:Date.now()});};
 const changeFloor=(next:Floor)=>{if(next===floor)return;setArea(next==='upper'?'upper':'all');setSelected('');};
 const legend=colorBy==='status'
  ?Object.entries(STATUS_COLORS).map(([name,color])=>({name,color}))
  :Object.entries(PHOTO_COLORS).filter(([code])=>floor==='upper'?code==='PS':code!=='PS').map(([code,color])=>({name:SECTION_LABELS[code],color}));
 const scope=floor==='upper'?' on the 2nd floor':area==='all'?' across all ground-floor sections':' in this section';
 return <section className="panel photo-plan" aria-labelledby="photo-plan-title">
  <header className="photo-heading"><div><span className="photo-eyebrow">TANAUAN PUBLIC MARKET</span><h3 id="photo-plan-title">Market floor plan</h3><p>View stall locations and current occupancy on both floors.</p></div>
   {/* The results stay open while focus is anywhere inside the search, so they can be reached with Tab. */}
   <div className="photo-search" role="search" onFocus={()=>setSearchOpen(true)} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setSearchOpen(false);}}><span className="material-symbols-outlined" aria-hidden="true">search</span>
    <input type="search" aria-label="Find a stall or tenant" placeholder="Find a stall or tenant…" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&results[0]){e.preventDefault();find(results[0].id);}else if(e.key==='Escape')setQuery('');}}/>
    {searchOpen&&query.trim()&&<ul className="photo-search-results" aria-label="Matching stalls">{results.length===0?<li className="photo-search-empty">No stall or tenant matches “{query.trim()}”.</li>:results.map(s=><li key={s.id}><button type="button" onClick={()=>find(s.id)}><strong>{s.id}</strong><span>{ownerLabel(s)}</span><small>{floorOf(s)==='upper'?'2nd floor':'Ground floor'} · {s.section}</small></button></li>)}</ul>}
   </div>
  </header>
  <div className="photo-filters">
   <div className="photo-floor-switch"><span>Floor</span><div role="group" aria-label="Floor">{FLOORS.map(f=><button key={f.id} type="button" aria-pressed={floor===f.id} onClick={()=>changeFloor(f.id)}>{f.name} <b>{floorTotals[f.id]}</b></button>)}</div></div>
   {floor==='ground'?<label className="photo-section-select"><span>Market section</span><select aria-label="Market section" value={area} onChange={e=>{setArea(e.target.value as PhotoView);setSelected('');}}>{views.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
    :<div className="photo-section-select"><span>Market section</span><p className="photo-floor-note">2nd Floor · PS-1 to PS-54</p></div>}
   <div className="photo-color-by"><span>Color stalls by</span><div role="group" aria-label="Color stalls by">{(['section','status'] as const).map(c=><button key={c} type="button" aria-pressed={colorBy===c} onClick={()=>setColorBy(c)}>{c==='section'?'Section':'Status'}</button>)}</div></div>
   <div className="photo-status-filter"><span>Highlight stalls</span><div role="group" aria-label="Highlight stalls by occupancy"><button type="button" aria-pressed={!statusFilter} onClick={()=>setStatusFilter('')}>All stalls</button>{FILTERS.map(f=><button key={f.id} type="button" className={f.cls} aria-pressed={statusFilter===f.id} onClick={()=>setStatusFilter(s=>s===f.id?'':f.id)}><i/>{f.name} <b>{counts[f.id]}</b></button>)}</div></div>
  </div>
  {statusFilter&&<p className="photo-filter-summary" role="status">{counts[statusFilter]} {FILTERS.find(f=>f.id===statusFilter)!.name.toLowerCase()} stalls highlighted{scope}.{statusFilter==='Inactive'?' This covers temporarily closed, closed, abandoned and under-maintenance stalls.':''} Other stalls are dimmed.</p>}
  <div className="photo-workspace"><div className="photo-stage"><Suspense fallback={<div className="photo-loading">Opening the 3D stall plan…</div>}><PhotoScene area={area} stalls={stalls} selected={selected} matches={matches} statusFilter={statusFilter} colorBy={colorBy} focusRequest={focusRequest} onSelect={pick} onShowAll={()=>setArea(a=>a==='upper'?'upper':'all')}/></Suspense>
   <div className="photo-legend">{legend.map(l=><span key={l.name}><i style={{background:l.color}}/>{l.name}</span>)}</div></div>
   <aside className="photo-details" aria-label="Selected stall details"><div aria-live="polite">{chosen?<>
    <div className="photo-details-head"><span className="photo-eyebrow">{FACILITY_IDS.has(chosen.id)?'MARKET FACILITY':floorOf(chosen)==='upper'?'2ND FLOOR STALL':'GROUND FLOOR STALL'}</span><button type="button" className="photo-close" aria-label="Clear selection" onClick={()=>setSelected('')}><span className="material-symbols-outlined" aria-hidden="true">close</span></button></div>
    <h4>{chosen.id}</h4><span className="photo-section-name">{chosen.section}</span>
    <div className="photo-owner"><span>Current tenant / stallholder</span><strong>{ownerLabel(chosen)}</strong></div>
    <dl>
     <dt>Status</dt><dd><span className="photo-status-dot" style={{background:FACILITY_IDS.has(chosen.id)?'#8296aa':STATUS_COLORS[chosen.status]??FILTER_TINTS[statusGroup(chosen.status)]}}/>{FACILITY_IDS.has(chosen.id)?'Guard station':isSharedStrip(chosen)&&chosen.number>=207?'Unlabelled shared area':chosen.status==='Available'?'Vacant':chosen.status}</dd>
     <dt>Floor</dt><dd>{floorOf(chosen)==='upper'?'2nd floor':'Ground floor'}</dd>
     {current?.permit&&current.permit!=='Not Recorded'&&<><dt>Business permit</dt><dd>{current.permit}</dd></>}
     <dt>{floorOf(chosen)==='upper'?'Number on the vendor list':'Number on photograph'}</dt><dd>{chosen.number}</dd>
    </dl>
    {floorOf(chosen)==='ground'&&original&&current?.tenant&&current.tenant!==original.tenant&&<p className="photo-note">Current records list <strong>{current.status==='Available'?'VACANT':registerName(current.tenant)}</strong>. The photograph lists {ownerLabel(original)}.</p>}
    {chosen.note&&<p className="photo-note"><strong>{floorOf(chosen)==='upper'?'Record note':'Photo note'}</strong>{chosen.note}.{floorOf(chosen)==='ground'&&!FACILITY_IDS.has(chosen.id)?' Confirm marked or unclear entries with the market office.':''}</p>}
    {isSharedStrip(chosen)&&<p className="photo-note">This number belongs to a shared strip on the sheet. Displayed markers do not imply measured stall partitions.</p>}
    {floorOf(chosen)==='upper'&&<p className="photo-note">The 2nd floor list gives stall numbers but no layout drawing, so this position is schematic.</p>}
   </>:<div className="photo-empty"><span className="material-symbols-outlined">touch_app</span><h4>Select a stall</h4><p>Click any stall in the plan, or find one by ID or tenant name above.</p></div>}</div>
   </aside></div>
  <p className="photo-footnote">{floor==='upper'
   ?'The 2nd floor list (as of September 30, 2026) gives stall numbers but no layout drawing, so its stalls are set out schematically in number order. Tenant names and occupancy update automatically from rental records.'
   :'Arrangement follows the supplied layout sheets. Dimensions and the connections between separate sheets are schematic. Tenant names and occupancy update automatically from rental records. Handwritten layout uncertainties appear in the stall details.'}</p>
 </section>;
}
