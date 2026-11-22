import { lazy, Suspense, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { buildDirectory } from './directory';
import { buildSecondFloor } from './secondFloor';
import { registerName } from './registerNames';
import { FACILITY_IDS, FILTER_TINTS, PHOTO_AREAS, PHOTO_COLORS, PHOTO_POSITIONS, SECTION_LABELS, STATUS_COLORS, UPPER_POSITIONS, statusGroup } from './photoLayout';
import type { PhotoView, StatusFilter } from './photoLayout';
import { buildOverview } from './overviewLayout';
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
/* 'All sections' sets the ground floor out as the office sketched it: entrance, then
   Kakanin, Vegetables, Fish, Meat and Chicken on both sides of one hallway. */
const overview=buildOverview(groundMapped);
const inOverview=(s:SceneStall):SceneStall=>({...s,...overview.slots.get(s.id)});
const onMap=new Set(mapped.map(s=>s.id));
/* Who the Tenant Records put on a stall, as the map needs it. */
type TenantOnRecord={name:string;stallId:string};

type Floor='ground'|'upper';
type CurrentRecord=ExistingStall&{tenant?:string;permit?:string;note?:string};
const FLOORS:{id:Floor;name:string}[]=[{id:'ground',name:'Ground floor'},{id:'upper',name:'2nd floor'}];
const views:{id:PhotoView;name:string}[]=[{id:'all',name:'All sections'},...PHOTO_AREAS];
const FILTERS:{id:Exclude<StatusFilter,''>;name:string;cls:string}[]=[{id:'Available',name:'Available',cls:'available'},{id:'Occupied',name:'Occupied',cls:'occupied'},{id:'Inactive',name:'Not operating',cls:'inactive'}];
const floorOf=(s:{area:string})=>s.area==='upper'?'upper':'ground';
/* "ps-01", "PS 1" and "ps1" all mean PS-1. */
const normalizeId=(q:string)=>q.replace(/^([a-z]{2})\s*-?\s*0*(\d+)$/,'$1-$2');

/* A line drawing of the market, for the card before a stall is chosen. */
function MarketSketch() {
 return <svg className="photo-sketch" viewBox="0 0 220 120" aria-hidden="true">
  <path d="M10 112h200" /><path d="M24 112V58h172v54" /><path d="M14 60 110 18l96 42" /><path d="M78 58V36h64v22" />
  <rect x="84" y="40" width="52" height="12" rx="2" />{[40,62,158,180].map(x=><path key={x} d={`M${x} 112V64`} />)}
  <path d="M92 112V80h36v32" /><path d="M110 80v32" /><path d="M30 76h40M150 76h40M30 92h40M150 92h40" />
 </svg>;
}

export default function PhotoFloorPlan({existingStalls,tenants=[],onViewStall}:{existingStalls:ExistingStall[];tenants?:TenantOnRecord[];onViewStall?:(id:string)=>void}) {
 const [area,setArea]=useState<PhotoView>('all'),[selected,setSelected]=useState('');
 const [statusFilter,setStatusFilter]=useState<StatusFilter>('');
 const [colorBy,setColorBy]=useState<ColorBy>('section');
 const [query,setQuery]=useState(''),[searchOpen,setSearchOpen]=useState(false);
 const [focusRequest,setFocusRequest]=useState<{id:string;n:number}>();
 const floor:Floor=area==='upper'?'upper':'ground';
 const records=useMemo(()=>new Map((existingStalls as CurrentRecord[]).map(s=>[s.id,s])),[existingStalls]);
 /* Statuses come from the stall records, and every tenant from the Tenant Records is
    named on the stall they hold; the stall record's name stands where no tenant record does. */
 const holders=useMemo(()=>new Map(tenants.filter(t=>t.stallId&&t.name.trim()).map(t=>[t.stallId,t.name])),[tenants]);
 const liveMapped=useMemo(()=>mapped.map(s=>{const current=records.get(s.id);const merged=current?{...s,...current} as SceneStall:s;const holder=holders.get(s.id);return holder?{...merged,tenant:holder}:merged;}),[records,holders]);
 /* Tenants whose stall number has no place on either floor of the map. */
 const unplaced=useMemo(()=>tenants.filter(t=>t.stallId&&t.stallId!=='—'&&!onMap.has(t.stallId)),[tenants]);
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
   <div className="photo-floor-switch"><span>Floor</span><div role="group" aria-label="Floor">{FLOORS.map(f=><button key={f.id} type="button" aria-pressed={floor===f.id} onClick={()=>changeFloor(f.id)}><span className="material-symbols-outlined" aria-hidden="true">{f.id==='upper'?'layers':'storefront'}</span>{f.name} <b>{floorTotals[f.id]}</b></button>)}</div></div>
   {floor==='ground'?<label className="photo-section-select"><span>Market section</span><select aria-label="Market section" value={area} onChange={e=>{setArea(e.target.value as PhotoView);setSelected('');}}>{views.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
    :<div className="photo-section-select"><span>Market section</span><p className="photo-floor-note">2nd Floor · PS-1 to PS-54</p></div>}
   <div className="photo-color-by"><span>Color stalls by</span><div role="group" aria-label="Color stalls by">{(['section','status'] as const).map(c=><button key={c} type="button" aria-pressed={colorBy===c} onClick={()=>setColorBy(c)}>{c==='section'?'Section':'Status'}</button>)}</div></div>
   <div className="photo-status-filter"><span>Highlight stalls</span><div role="group" aria-label="Highlight stalls by occupancy"><button type="button" aria-pressed={!statusFilter} onClick={()=>setStatusFilter('')}>All stalls</button>{FILTERS.map(f=><button key={f.id} type="button" className={f.cls} aria-pressed={statusFilter===f.id} onClick={()=>setStatusFilter(s=>s===f.id?'':f.id)}><i/>{f.name} <b>{counts[f.id]}</b></button>)}</div></div>
  </div>
  {statusFilter&&<p className="photo-filter-summary" role="status">{counts[statusFilter]} {FILTERS.find(f=>f.id===statusFilter)!.name.toLowerCase()} stalls highlighted{scope}.{statusFilter==='Inactive'?' This covers temporarily closed, closed, abandoned and under-maintenance stalls.':''} Other stalls are dimmed.</p>}
  <div className="photo-workspace"><div className="photo-stage"><Suspense fallback={<div className="photo-loading">Opening the 3D stall plan…</div>}><PhotoScene area={area} areaName={PHOTO_AREAS.find(a=>a.id===area)?.name} overview={overview} stalls={stalls} selected={selected} matches={matches} statusFilter={statusFilter} colorBy={colorBy} focusRequest={focusRequest} onSelect={pick} onShowAll={()=>setArea(a=>a==='upper'?'upper':'all')}/></Suspense>
   <div className="photo-legend">{legend.map(l=><span key={l.name}><i style={{background:l.color}}/>{l.name}</span>)}</div></div>
   <aside className="photo-details" aria-label="Selected stall details"><div className="photo-card-head"><span className="material-symbols-outlined" aria-hidden="true">storefront</span><span>Selected stall</span>{chosen&&<button type="button" className="photo-close" aria-label="Clear selection" onClick={()=>setSelected('')}><span className="material-symbols-outlined" aria-hidden="true">close</span></button>}</div>
    <div className="photo-card-body" aria-live="polite">{chosen?<>
    <span className="photo-eyebrow">{FACILITY_IDS.has(chosen.id)?'MARKET FACILITY':floorOf(chosen)==='upper'?'2ND FLOOR STALL':'GROUND FLOOR STALL'}</span>
    <h4>{chosen.id}</h4>
    {(()=>{const statusText=FACILITY_IDS.has(chosen.id)?'Guard station':isSharedStrip(chosen)&&chosen.number>=207?'Unlabelled shared area':chosen.status==='Available'?'Vacant':chosen.status;
     const dot=FACILITY_IDS.has(chosen.id)?'#8296aa':STATUS_COLORS[chosen.status]??FILTER_TINTS[statusGroup(chosen.status)];
     return <div className="photo-facts">
      <div className="photo-owner photo-fact"><span className="material-symbols-outlined" aria-hidden="true">person</span><div><span>Tenant / stallholder</span><strong>{ownerLabel(chosen)}</strong></div></div>
      <div className="photo-fact"><span className="material-symbols-outlined" aria-hidden="true">grid_view</span><div><span>Section</span><strong>{chosen.section}</strong></div></div>
      <div className="photo-fact"><span className="material-symbols-outlined" aria-hidden="true">fact_check</span><div><span>Status</span><strong><i className="photo-status-pill" style={{'--dot':dot} as CSSProperties}><span className="photo-status-dot" style={{background:dot}}/>{statusText}</i></strong></div></div>
      <div className="photo-fact"><span className="material-symbols-outlined" aria-hidden="true">{floorOf(chosen)==='upper'?'layers':'storefront'}</span><div><span>Floor</span><strong>{floorOf(chosen)==='upper'?'2nd floor':'Ground floor'}{current?.permit&&current.permit!=='Not Recorded'?` · ${current.permit}`:''}</strong></div></div>
     </div>;})()}
    {onViewStall&&records.has(chosen.id)&&!FACILITY_IDS.has(chosen.id)&&<button type="button" className="btn-primary photo-view-details" onClick={()=>onViewStall(chosen.id)}>View details<span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span></button>}
    <dl className="photo-small-print"><dt>{floorOf(chosen)==='upper'?'Number on the vendor list':'Number on photograph'}</dt><dd>{chosen.number}</dd></dl>
    {floorOf(chosen)==='ground'&&original&&current&&chosen.tenant&&chosen.tenant!==original.tenant&&<p className="photo-note">Current records list <strong>{chosen.status==='Available'?'VACANT':registerName(chosen.tenant)}</strong>. The photograph lists {ownerLabel(original)}.</p>}
    {chosen.note&&<p className="photo-note"><strong>{floorOf(chosen)==='upper'?'Record note':'Photo note'}</strong>{chosen.note}.{floorOf(chosen)==='ground'&&!FACILITY_IDS.has(chosen.id)?' Confirm marked or unclear entries with the market office.':''}</p>}
    {isSharedStrip(chosen)&&<p className="photo-note">This number belongs to a shared strip on the sheet. Displayed markers do not imply measured stall partitions.</p>}
    {floorOf(chosen)==='upper'&&<p className="photo-note">The 2nd floor list gives stall numbers but no layout drawing, so this position is schematic.</p>}
   </>:<div className="photo-empty"><MarketSketch/><h4>Select a stall</h4><p>Click any stall in the plan, or find one by ID or tenant name above.</p></div>}</div>
   </aside></div>
  <p className="photo-footnote">{floor==='upper'
   ?'The 2nd floor list (as of September 30, 2026) gives stall numbers but no layout drawing, so its stalls are set out schematically in number order. Tenant names and occupancy update automatically from rental records.'
   :area==='all'
    ?'All sections follow the market office’s sketch: from the entrance, Kakanin, Vegetables (with dried fish/eggs and fruits/duma), Fish, Meat and Chicken on both sides of the hallway. Stalls keep the layout sheets’ order and neighbours, read from the Kakanin end, with long sheet rows folded to fit the blocks; distances are schematic. Choose a section to see its stalls exactly as the layout sheets place them. Tenant names and occupancy update automatically from rental records.'
    :'Arrangement follows the supplied layout sheets. Dimensions are schematic. Tenant names and occupancy update automatically from rental records. Handwritten layout uncertainties appear in the stall details.'}</p>
  {unplaced.length>0&&<p className="photo-footnote photo-unplaced" role="note"><strong>Not on the map:</strong> {unplaced.length===1?'1 tenant holds a stall':`${unplaced.length} tenants hold stalls`} that the floor plan has no place for — {unplaced.map(t=>`${registerName(t.name)} (${t.stallId})`).join('; ')}.</p>}
 </section>;
}
