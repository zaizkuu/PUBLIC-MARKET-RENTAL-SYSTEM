import { useMemo, useRef, useState } from 'react';
import MapViewport from './MapViewport';
import { buildingAt, footprints, project } from './site-plan.mjs';
import type { SiteLabel, StallRecord } from './types';
import './EvidenceMap.css';

type Props={
 records:StallRecord[]; labels:SiteLabel[]; canEdit:boolean; busy:boolean;
 onPlace:(label:SiteLabel)=>void; onRemove:(id:string)=>void; onImport:()=>void;
 onSave:()=>void; onPublish:()=>void; onEdit:()=>void; feedback:string;
};
const sources=[
 {title:'Main market · OpenStreetMap',url:'https://www.openstreetmap.org/way/106474064',note:'Mapped building outline. Corner coordinates date to March 2011; feature edited in 2020.'},
 {title:'Wet market · OpenStreetMap',url:'https://www.openstreetmap.org/way/106474048',note:'Mapped building outline. Corner coordinates date to March 2011; feature edited in 2024.'},
 {title:'Real Street · OpenStreetMap',url:'https://www.openstreetmap.org/way/95512699',note:'Street line north of the main market.'},
 {title:'Piedad Street · OpenStreetMap',url:'https://www.openstreetmap.org/way/92616184',note:'Street approaching from the east, south of the wet market.'},
 {title:'Market photographs · April 2010',url:'https://tanauanleytemyhometown.blogspot.com/2010/04/new-pictures-from-pubic-market.html',note:'Historic exterior photos. They do not document current indoor stall boundaries.'},
];
const streetPoints=(points:number[][])=>points.map(([lon,lat])=>{const p=project(lon,lat);return `${p.x},${p.y}`;}).join(' ');
const streets=[
 {id:'real',points:streetPoints([[125.0187,11.109932],[125.0192174,11.1097264],[125.0194273,11.1096682],[125.01965,11.109573]])},
 {id:'piedad',points:streetPoints([[125.0190492,11.1086924],[125.0196,11.10848]])},
];
const serviceRoad=streetPoints([[125.0192174,11.1097264],[125.0186233,11.1082931],[125.0185561,11.1081226],[125.0187915,11.1080360],[125.0188729,11.1082474],[125.0190492,11.1086924],[125.0194273,11.1096682]]);
const statusColor=(status:string)=>status==='Occupied'?'#447b64':status==='Available'?'#417ca5':status==='Maintenance'?'#b38d42':'#8b9197';

export default function EvidenceMap({records,labels,canEdit,busy,onPlace,onRemove,onImport,onSave,onPublish,onEdit,feedback}:Props) {
 const [query,setQuery]=useState(''),[section,setSection]=useState(''),[placement,setPlacement]=useState('');
 const [selectedId,setSelectedId]=useState(''),[selectedBuilding,setSelectedBuilding]=useState('');
 const [placing,setPlacing]=useState(false),[message,setMessage]=useState(''),[limit,setLimit]=useState(30);
 const [focus,setFocus]=useState<{x:number;y:number;key:string}>();
 const drawing=useRef<HTMLDivElement>(null);
 const labelById=useMemo(()=>new Map(labels.map(l=>[l.recordId,l])),[labels]);
 const visibleRecords=canEdit?records:records.filter(r=>r.visible);
 const selected=visibleRecords.find(r=>r.id===selectedId);
 const selectedLabel=selected?labelById.get(selected.id):undefined;
 const building=footprints.find(f=>f.id===selectedBuilding);
 const filtered=visibleRecords.filter(r=>(!section||r.section===section)&&(!placement||(placement==='unplaced'?!labelById.has(r.id):labelById.has(r.id)))&&`${r.id} ${r.section} ${r.businessName} ${r.products.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()));
 const matches=new Set(filtered.map(r=>r.id));
 const positioned=visibleRecords.filter(r=>labelById.has(r.id)).length;
 const shownLabels=labels.filter(l=>visibleRecords.some(r=>r.id===l.recordId));
 function selectRecord(id:string,center=false) {
  setSelectedId(id);setSelectedBuilding('');setPlacing(false);setMessage('');
  const label=labelById.get(id);
  if(center&&label)setFocus({x:label.x,y:label.y,key:crypto.randomUUID()});
 }
 function place(x:number,y:number) {
  if(!canEdit||!placing||!selected)return;
  if(!buildingAt(x,y)){setMessage('Choose a point inside a mapped building.');return;}
  onPlace({recordId:selected.id,x:Math.round(x*10)/10,y:Math.round(y*10)/10,verified:false});
  setPlacing(false);setMessage('Label placed in the draft. Confirm its actual location before marking it verified.');
 }
 function move(dx:number,dy:number) {
  if(!selectedLabel)return;
  const x=selectedLabel.x+dx,y=selectedLabel.y+dy;
  if(!buildingAt(x,y)){setMessage('The label must stay inside a mapped building.');return;}
  onPlace({...selectedLabel,x,y,verified:false});setMessage('Position adjusted. Verify the new location.');
 }
 function download() {
  const svg=drawing.current?.querySelector('svg');if(!svg)return;
  try {
   const copy=svg.cloneNode(true) as SVGSVGElement;
   copy.setAttribute('xmlns','http://www.w3.org/2000/svg');copy.setAttribute('width','720');copy.setAttribute('height','1100');
   copy.removeAttribute('class');copy.removeAttribute('tabindex');copy.querySelector('g')?.removeAttribute('transform');
   copy.querySelectorAll('[tabindex]').forEach(el=>el.removeAttribute('tabindex'));
   copy.querySelectorAll('[opacity]').forEach(el=>el.removeAttribute('opacity'));
   const desc=document.createElementNS('http://www.w3.org/2000/svg','desc');
   desc.textContent='Tanauan, Leyte. Historical mapped building outlines from OpenStreetMap, corner geometry dated 2011. Interior stall boundaries are undocumented. Point labels are administrator placements, not measured boundaries. Sources: '+sources.map(s=>s.url).join('; ');
   copy.prepend(desc);
   const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)],{type:'image/svg+xml;charset=utf-8'}));
   const a=document.createElement('a');a.href=url;a.download='tanauan-leyte-building-reference.svg';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
  } catch {setMessage('The map could not be downloaded. Please try again.');}
 }

 return <div className="evidence-map">
  <div className="evidence-heading"><div><span className="evidence-eyebrow">TANAUAN, LEYTE</span><h4>Market building reference</h4><p>Mapped outlines with labels linked to the stall register.</p></div><button type="button" aria-label="Download map (SVG)" onClick={download}>Download map (SVG)</button></div>
  <div className="evidence-note"><span className="material-symbols-outlined" aria-hidden="true">info</span><p><strong>Interior floor plan not yet verified.</strong> These are historical building outlines from 2011 map coordinates. Available sources do not establish current stall boundaries, aisles or entrances.</p></div>
  {canEdit&&<div className="evidence-edit-bar"><span>Stall labels · draft</span><button type="button" onClick={onImport} disabled={busy}>Import existing stall IDs and statuses</button><button type="button" onClick={onSave} disabled={busy}>Save draft</button><button type="button" onClick={onPublish} disabled={busy}>Publish</button></div>}
  {feedback&&canEdit&&<p className="market-feedback evidence-feedback" role="status">{feedback}</p>}
  <div className="evidence-workspace">
   <div className={`evidence-drawing${canEdit&&placing?' is-placing':''}`} ref={drawing}>
    <MapViewport outdoor={false} bounds={{x:-50,y:-90,w:720,h:1100}} focus={focus} title="Map-derived outlines · north up" onMapPoint={place}>
     <rect x="-50" y="-90" width="720" height="1100" fill="#f6f7f4"/>
     <g fontFamily="Arial, sans-serif">
      <text x="0" y="-27" fontSize="20" fontWeight="700" fill="#2e4d3e">TANAUAN PUBLIC MARKET</text>
      <text x="0" y="-5" fontSize="12" fill="#748276">HISTORICAL BUILDING OUTLINES · INTERIOR NOT MAPPED</text>
      <polyline points={serviceRoad} fill="none" stroke="#dce2d9" strokeWidth="10"/>
      {streets.map(s=><polyline key={s.id} points={s.points} fill="none" stroke="#e1e6dd" strokeWidth="16"/>)}
      <text x="323" y="55" fontSize="15" fill="#758171" transform="rotate(20 323 55)">Real Street</text>
      <text x="326" y="914" fontSize="15" fill="#758171" transform="rotate(20 326 914)">Piedad Street</text>
      <text transform="translate(105 481) rotate(68)" fontSize="11" fill="#879180">Mapped service road</text>
      {footprints.map((f,index)=>{
       const cx=f.points.reduce((s,p)=>s+p.x,0)/f.points.length,cy=f.points.reduce((s,p)=>s+p.y,0)/f.points.length;
       return <g className="evidence-building" key={f.id} role="button" tabIndex={0} aria-label={`Inspect ${f.name} outline`} aria-pressed={selectedBuilding===f.id} onClick={()=>{if(placing&&canEdit)return;setSelectedBuilding(f.id);setSelectedId('');setMessage('');}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelectedBuilding(f.id);setSelectedId('');setPlacing(false);}}}>
        <polygon points={f.points.map(p=>`${p.x},${p.y}`).join(' ')} fill={selectedBuilding===f.id?'#e3ece3':index?'#eaf1ef':'#f0efe7'} stroke={index?'#6c8e87':'#8c9176'} strokeWidth={selectedBuilding===f.id?3:2}/>
        <g transform={`translate(${cx} ${cy}) rotate(68)`} pointerEvents="none"><text textAnchor="middle" y="-12" fontSize="17" fontWeight="700" fill="#4b6958">{index?'WET MARKET':'MAIN MARKET'}</text><text textAnchor="middle" y="10" fontSize="11" fill="#849180">Interior boundaries unknown</text><text textAnchor="middle" y="28" fontSize="10" fill="#849180">OSM outline · 2011 geometry</text></g>
       </g>;
      })}
      {shownLabels.map(l=>{const r=visibleRecords.find(r=>r.id===l.recordId)!;return <g className="evidence-stall-label" role="button" tabIndex={0} aria-label={`${r.id}, ${r.status}, ${l.verified?'confirmed location':'location unverified'}`} aria-pressed={selectedId===r.id} key={r.id} transform={`translate(${l.x} ${l.y})`} opacity={matches.has(r.id)?1:.25} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();selectRecord(r.id);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectRecord(r.id);}}}>
       <circle r={selectedId===r.id?8:6} fill={statusColor(r.status)} stroke="#fff" strokeWidth="2"/>
       <rect x="10" y="-12" width={Math.max(58,r.id.length*7+12)} height="24" rx="4" fill="white" stroke={l.verified?'#78917f':'#b59a65'} strokeDasharray={l.verified?undefined:'3 2'}/>
       <text x="16" y="4" fontSize="11" fontWeight="700" fill="#486452">{r.id}</text>
      </g>;})}
      <g transform="translate(580 70)"><path d="M0 40V0L-7 14M0 0L7 14" fill="none" stroke="#46624f" strokeWidth="2"/><text y="-9" textAnchor="middle" fontSize="13" fontWeight="700" fill="#46624f">N</text></g>
      <text x="0" y="965" fontSize="11" fill="#788875">© OpenStreetMap contributors · openstreetmap.org/copyright</text>
      <text x="0" y="985" fontSize="11" fill="#788875">Labels are location points, not stall boundaries. Dashed label = unverified position.</text>
     </g>
    </MapViewport>
    {canEdit&&placing&&<div className="evidence-placement-prompt" role="status">Click the known location of {selected?.id} inside a building.<button type="button" onClick={()=>setPlacing(false)}>Cancel</button></div>}
   </div>
   <aside className="evidence-sidebar" aria-label="Stall labeling and evidence">
    <div className="evidence-detail">
     <span className="evidence-eyebrow">{selected?'STALL RECORD':building?'MAPPED BUILDING':'REGISTER CONNECTION'}</span>
     <h4>{selected?.id??building?.name??'Locate your stalls'}</h4>
     {selected?<><span className="evidence-status"><i style={{background:statusColor(selected.status)}}/>{selected.status}</span><dl><dt>Office section</dt><dd>{selected.section}</dd><dt>Map position</dt><dd>{selectedLabel?selectedLabel.verified?'Confirmed by administrator':'Placed · awaiting location verification':'Not yet placed'}</dd>{selected.businessName&&<><dt>Business</dt><dd>{selected.businessName}</dd></>}{selected.publicVendor&&selected.vendorName&&<><dt>Vendor</dt><dd>{selected.vendorName}</dd></>}{selected.publicContact&&selected.contact&&<><dt>Contact</dt><dd>{selected.contact}</dd></>}</dl>
      {canEdit?<div className="evidence-label-actions"><button type="button" disabled={busy} onClick={()=>{setPlacing(true);setMessage('');}}>{selectedLabel?'Reposition label':'Place stall label'}</button>{selectedLabel&&<><label><input type="checkbox" checked={selectedLabel.verified} onChange={e=>onPlace({...selectedLabel,verified:e.target.checked})}/> I checked this stall’s location on site or against an approved plan.</label><details><summary>Adjust label position</summary><div className="evidence-nudge" role="group" aria-label="Move selected stall label"><button type="button" aria-label="Move label north" onClick={()=>move(0,-2)}>↑</button><button type="button" aria-label="Move label west" onClick={()=>move(-2,0)}>←</button><button type="button" aria-label="Move label east" onClick={()=>move(2,0)}>→</button><button type="button" aria-label="Move label south" onClick={()=>move(0,2)}>↓</button></div></details><button type="button" onClick={()=>{onRemove(selected.id);setMessage('Label removed from the draft. The stall record is retained.');}}>Remove label</button></>}</div>:<p>Only a map administrator can place or verify this label.</p>}
     </>:building?<p>This outline follows the historical mapped footprint of {building.name}. Interior partitions, stall positions and entrance locations are not established by this geometry.</p>:<p>Select a record, then place its label only where its real location is known. Unplaced records remain in the directory.</p>}
     {!canEdit&&<button type="button" className="evidence-admin-link" onClick={onEdit}>Label stalls as administrator</button>}
     {message&&<p role="status" className="evidence-message">{message}</p>}
    </div>
    <div className="evidence-directory">
     <div className="evidence-directory-heading"><h5>Existing stall records</h5><span>{positioned} / {visibleRecords.length} placed</span></div>
     <form role="search" onSubmit={e=>{e.preventDefault();if(filtered[0])selectRecord(filtered[0].id,true);}}><input aria-label="Search existing stall records" placeholder="Search stall ID or section…" value={query} onChange={e=>{setQuery(e.target.value);setLimit(30);}}/></form>
     <div className="evidence-filters"><select aria-label="Filter records by section" value={section} onChange={e=>{setSection(e.target.value);setLimit(30);}}><option value="">All sections</option>{[...new Set(visibleRecords.map(r=>r.section))].sort().map(s=><option key={s}>{s}</option>)}</select><select aria-label="Filter records by placement" value={placement} onChange={e=>{setPlacement(e.target.value);setLimit(30);}}><option value="">All records</option><option value="unplaced">Unplaced</option><option value="placed">Placed</option></select></div>
     <p className="evidence-directory-caption">IDs, sections and statuses come from the system. Their sequence does not determine their physical location.</p>
     <div className="evidence-record-list">{filtered.slice(0,limit).map(r=><button type="button" key={r.id} aria-label={`Select stall ${r.id}`} aria-pressed={selectedId===r.id} onClick={()=>selectRecord(r.id,true)}><span><strong>{r.id}</strong><small>{r.section}</small></span><span>{r.status}<small>{labelById.has(r.id)?'Placed':'Unplaced'}</small></span></button>)}</div>
     {!filtered.length&&<p>No matching records.{canEdit&&!records.length?' Import the existing stall register to start labeling.':''}</p>}
     {filtered.length>limit&&<button className="evidence-more" type="button" onClick={()=>setLimit(n=>n+30)}>Show more ({filtered.length-limit} remaining)</button>}
    </div>
   </aside>
  </div>
  <details className="evidence-sources"><summary>Map evidence & missing interior information</summary><div className="evidence-source-grid"><div><h5>Source references</h5>{sources.map(s=><p key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title} ↗</a><small>{s.note}</small></p>)}<p><a href="https://www.openstreetmap.org/way/92616182" target="_blank" rel="noreferrer">Service road · OpenStreetMap ↗</a></p><p><a href="https://www.google.com/maps/search/?api=1&query=Tanauan+Public+Market+Leyte" target="_blank" rel="noreferrer">Open location in Google Maps ↗</a><small>Location link only. Current Google imagery could not be inspected.</small></p></div><div><h5>What this map establishes</h5><p>The two historical building outlines, their relative positions and north orientation are traced from map coordinates. Road lines provide surrounding context; they do not show measured road widths.</p><h5>What remains unknown</h5><p>A current indoor floor plan is still needed to draw actual walls, aisles and stall boundaries. Online roof and exterior views cannot establish those details. No trading zones or numbered bays have been invented.</p><p>Use a market-office floor plan, stall-number sketch, or a documented walk-through to confirm label positions. Point labels can be saved without asserting an area or boundary.</p></div></div></details>
 </div>;
}
