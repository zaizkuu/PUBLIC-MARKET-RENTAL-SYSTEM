import { lazy, Suspense, useMemo, useState } from 'react';
import { buildDirectory } from './directory';
import { registerName } from './registerNames';
import { PHOTO_AREAS, PHOTO_COLORS, PHOTO_POSITIONS, inOverview } from './photoLayout';
import type { PhotoView } from './photoLayout';
import type { ExistingStall } from './types';
import type { SceneStall } from './PhotoScene';
import './PhotoFloorPlan.css';

const PhotoScene=lazy(()=>import('./PhotoScene'));
const directory=buildDirectory().stalls;
const mapped:SceneStall[]=PHOTO_POSITIONS.map(position=>{
 const row=directory.find(s=>Number(s.id.split('-')[1])===position.number);
 if(!row)throw new Error(`Photo position ${position.number} has no directory record`);
 return {...position,...row};
});
const owner=(s:SceneStall)=>s.number===95?'PNP / GUARD STATION':s.number>=207?'NO NAME ON SHEET':s.status==='Available'?'VACANT':registerName(s.tenant);
const views: {id:PhotoView;name:string;caption:string}[]=[{id:'all',name:'All sections',caption:'All 194 positions · Combined view of the supplied sheets'},...PHOTO_AREAS];
export default function PhotoFloorPlan({existingStalls}:{existingStalls:ExistingStall[]}) {
 const [area,setArea]=useState<PhotoView>('all'),[selected,setSelected]=useState('');
 const [statusFilter,setStatusFilter]=useState<''|'Available'|'Occupied'>('');
 const liveMapped=useMemo(()=>mapped.map(s=>{const current=existingStalls.find(row=>row.id===s.id);return current?{...s,...current}:s;}),[existingStalls]);
 const stalls=useMemo(()=>area==='all'?liveMapped.map(inOverview):liveMapped.filter(s=>s.area===area),[area,liveMapped]);
 const statuses=useMemo(()=>new Map(existingStalls.map(s=>[s.id,s.status])),[existingStalls]);
 const matches=useMemo(()=>new Set(mapped.filter(s=>!statusFilter||(s.number!==95&&(statuses.get(s.id)??s.status)===statusFilter)).map(s=>s.id)),[statuses,statusFilter]);
 const available=stalls.filter(s=>s.number!==95&&(statuses.get(s.id)??s.status)==='Available').length;
 const occupied=stalls.filter(s=>s.number!==95&&(statuses.get(s.id)??s.status)==='Occupied').length;
 const chosen=liveMapped.find(s=>s.id===selected);
 const current=existingStalls.find(s=>s.id===selected) as (ExistingStall & {tenant?:string})|undefined;
 const pick=(id:string)=>{const s=mapped.find(s=>s.id===id);if(s){setSelected(id);if(area!=='all')setArea(s.area);}};
 return <section className="panel photo-plan" aria-labelledby="photo-plan-title">
  <header className="photo-heading"><div><span className="photo-eyebrow">TANAUAN PUBLIC MARKET</span><h3 id="photo-plan-title">Market floor plan</h3><p>View stall locations and current occupancy.</p></div></header>
   <div className="photo-filters"><label className="photo-section-select"><span>Market section</span><select aria-label="Market section" value={area} onChange={e=>{setArea(e.target.value as PhotoView);setSelected('');}}>{views.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><div className="photo-status-filter"><span>Highlight stalls</span><div role="group" aria-label="Highlight stalls by occupancy"><button type="button" aria-pressed={!statusFilter} onClick={()=>setStatusFilter('')}>All stalls</button><button type="button" className="available" aria-pressed={statusFilter==='Available'} onClick={()=>setStatusFilter(s=>s==='Available'?'':'Available')}><i/>Available <b>{available}</b></button><button type="button" className="occupied" aria-pressed={statusFilter==='Occupied'} onClick={()=>setStatusFilter(s=>s==='Occupied'?'':'Occupied')}><i/>Occupied <b>{occupied}</b></button></div></div></div>
   {statusFilter&&<p className="photo-filter-summary" role="status">{statusFilter==='Available'?available:occupied} {statusFilter.toLowerCase()} stalls highlighted{area==='all'?' across all sections':' in this section'}. Other stalls are dimmed.</p>}
   <div className="photo-workspace"><div className="photo-stage"><Suspense fallback={<div className="photo-loading">Opening the 3D stall plan…</div>}><PhotoScene area={area} stalls={stalls} selected={selected} matches={matches} statusFilter={statusFilter} onSelect={pick} onShowAll={()=>{setArea('all');}}/></Suspense><div className="photo-legend">{Object.entries(PHOTO_COLORS).map(([code,color])=><span key={code}><i style={{background:color}}/>{({VS:'Vegetable',FD:'Fruits/Duma',DS:'Dried fish/Eggs',KS:'Kakanin',CS:'Chicken',MS:'Beef & Pork',FS:'Fish'})[code]}</span>)}</div></div>
   <aside className="photo-details" aria-label="Selected stall details"><div aria-live="polite">{chosen?<>
    <span className="photo-eyebrow">{chosen.number===95?'MARKET FACILITY':'SELECTED STALL'}</span><h4>{chosen.id}</h4><span className="photo-section-name">{chosen.section}</span><div className="photo-owner"><span>Current tenant / stallholder</span><strong>{owner(chosen)}</strong></div>
    <dl><dt>Number on photograph</dt><dd>{chosen.number}</dd><dt>Current occupancy</dt><dd>{chosen.number===95?'Guard station':chosen.number>=207?'Unlabelled shared area':chosen.status==='Available'?'Vacant':'Occupied'}</dd>{current&&<><dt>Current record status</dt><dd>{current.status}</dd></>}</dl>
    {current?.tenant&&current.tenant!==chosen.tenant&&<p className="photo-note">Current records list <strong>{current.status==='Available'?'VACANT':registerName(current.tenant)}</strong>. The photograph lists {owner(chosen)}.</p>}
    {chosen.note&&<p className="photo-note"><strong>Photo note</strong>{chosen.note}. {chosen.number!==95?'Confirm marked or unclear entries with the market office.':''}</p>}
    {chosen.number>=173&&chosen.number<=179||chosen.number>=207?<p className="photo-note">This number belongs to a shared strip on the sheet. Displayed markers do not imply measured stall partitions.</p>:null}
   </>:<div className="photo-empty"><span className="material-symbols-outlined">touch_app</span><h4>Select a stall</h4><p>Click any stall ID in the plan to display the owner’s name.</p></div>}</div>
   </aside></div>
   <p className="photo-footnote">Arrangement follows the supplied layout sheets. Dimensions and the connections between separate sheets are schematic. Tenant names and occupancy update automatically from rental records. Handwritten layout uncertainties appear in the stall details.</p>
 </section>;
}
