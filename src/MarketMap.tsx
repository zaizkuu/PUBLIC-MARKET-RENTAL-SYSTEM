import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import MapViewport from './market/MapViewport';
import MapEditor from './market/MapEditor';
import seed from './market/seed.json';
import type { ExistingStall, Layout, MapUnit, Session, StallRecord } from './market/types';
import { STATUSES } from './market/types';
import { findRoute, publicLayout, searchDirectory, validateLayout } from './market/domain.mjs';
import { getPublished, loadAvailableMap, mapRequest } from './market/api';
import './MarketMap.css';

type Selection={kind:'stall'|'section'|'node';id:string}|null;
type Version={version:number;publication_status:string;created_at:string;created_by:string};
const Market3D=lazy(()=>import('./market/Market3D'));
const initial=publicLayout({...seed, edges: seed.edges.map(edge => [edge[0], edge[1]] as [string,string])}) as Layout;
const icon=(name:string)=><span className="material-symbols-outlined" aria-hidden="true">{name}</span>;
const statusClass=(status:string)=>status.toLowerCase().replace(/ /g,'-');
export default function MarketMap({existingStalls=[]}:{existingStalls?:ExistingStall[]}) {
 const [published,setPublished]=useState<Layout>(initial),[draft,setDraft]=useState<Layout|null>(null),[versions,setVersions]=useState<Version[]>([]);
 const [session,setSession]=useState<Session>({authenticated:false,setupRequired:false});
 const [editing,setEditing]=useState(false),[preview,setPreview]=useState(false),[showLogin,setShowLogin]=useState(false);
 const [administrationAvailable,setAdministrationAvailable]=useState(false);
 const [mapSource,setMapSource]=useState<'published'|'cached'|'bundled'>('bundled');
 const [resetKey,setResetKey]=useState(0);
 const [viewMode,setViewMode]=useState<'3d'|'2d'>('3d');
 const [viewNotice,setViewNotice]=useState('');
 const [selected,setSelected]=useState<Selection>(null),[recordId,setRecordId]=useState(''),[query,setQuery]=useState(''),[status,setStatus]=useState('');
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[feedback,setFeedback]=useState(''),[dirty,setDirty]=useState(false);
 const [routeStart,setRouteStart]=useState(''),[showRoute,setShowRoute]=useState(false),[focus,setFocus]=useState<{x:number;y:number;key:string}>();
 const [credentials,setCredentials]=useState({username:'',password:''});
 const drag=useRef<{id:string;x:number;y:number;unit:MapUnit;resize:boolean}|null>(null);
 useEffect(()=>{
  let alive=true;
  const refresh=async()=>{
   try {
    const result=await loadAvailableMap();
    if(alive){setPublished(result.layout);setSession(result.session);setAdministrationAvailable(result.administrationAvailable);setMapSource(result.source);}
   } finally {if(alive)setLoading(false);}
  };
  void refresh();
  const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('tanauan-market-published'):null;
  channel?.addEventListener('message',refresh);window.addEventListener('focus',refresh);
  return()=>{alive=false;channel?.close();window.removeEventListener('focus',refresh);};
 },[]);
 useEffect(()=>{if(!dirty)return;const handler=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[dirty]);
 // Existing office records provide real stall IDs/statuses; geometry stays unassigned until mapped.
 const data=useMemo(()=>{
  const source=editing&&draft?(preview?publicLayout(draft):draft):published;
  const l={...source,sections:source.sections.filter(s=>s.id!=='watson'),stalls:source.stalls.filter(s=>s.sectionId!=='watson')};
  const known=new Set(l.records.map(r=>r.id));
  const local:StallRecord[]=existingStalls.filter(r=>!l.directoryManaged&&!known.has(r.id)).map(r=>({id:r.id,section:r.section,status:r.status,businessName:'',vendorName:'',publicVendor:false,contact:'',publicContact:false,products:[],description:'',visible:true}));
  return editing&&!preview?l:{...l,records:[...l.records,...local]};
 },[published,draft,editing,preview,existingStalls]);
 const selectedUnit=data.stalls.find(s=>selected?.kind==='stall'&&s.id===selected.id);
 const selectedSection=data.sections.find(s=>s.id===(selected?.kind==='section'?selected.id:selectedUnit?.sectionId));
 const selectedRecord=data.records.find(r=>r.id===(selectedUnit?.recordId||recordId));
 const results=useMemo(()=>searchDirectory(data,query,status),[data,query,status]);
 const matchIds=new Set(results.map(r=>r.id));
 const entrances=data.nodes.filter(n=>n.entrance&&n.verified);
 const startId=entrances.some(n=>n.id===routeStart)?routeStart:entrances[0]?.id??'';
 const route=showRoute&&selectedUnit?findRoute(data,startId,selectedUnit):null;
 const canEdit=editing&&!preview&&session.authenticated;
 const hasDetails=!!(selectedUnit||selectedSection||selectedRecord);
 const showInformation=canEdit||preview||hasDetails||!!(query||status);
 function resetView(){setSelected(null);setRecordId('');setShowRoute(false);setQuery('');setStatus('');setFocus(undefined);setResetKey(key=>key+1);}
 function selectSection(id:string,center=true){const section=data.sections.find(s=>s.id===id);setSelected({kind:'section',id});setRecordId('');setShowRoute(false);if(section&&center)setFocus({x:section.x+section.w/2,y:section.y+section.h/2,key:crypto.randomUUID()});}
 function leaveEditor(){if(dirty&&!confirm('Discard unsaved map changes?'))return;setEditing(false);setPreview(false);setDirty(false);setShowLogin(false);resetView();}
 function changeDraft(layout:Layout){setDraft(layout);setDirty(true);setFeedback('');}
 function selectUnit(unit:MapUnit,center=false){setSelected({kind:'stall',id:unit.id});setRecordId(unit.recordId);setShowRoute(false);if(center)setFocus({x:unit.x+unit.w/2,y:unit.y+unit.h/2,key:crypto.randomUUID()});}
 function selectRecord(record:StallRecord){const unit=data.stalls.find(s=>s.recordId===record.id);setRecordId(record.id);setSelected(unit?{kind:'stall',id:unit.id}:null);setShowRoute(false);if(unit)setFocus({x:unit.x+unit.w/2,y:unit.y+unit.h/2,key:crypto.randomUUID()});}
 async function loadDraft(){setBusy(true);setError('');try{const result=await mapRequest<{layout:Layout;versions:Version[]}>('draft');setDraft(result.layout);setVersions(result.versions);setDirty(false);setEditing(true);setPreview(false);resetView();setShowLogin(false);setFeedback('Draft loaded. Published map is unchanged.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function authenticate(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{const auth=await mapRequest<Session>(session.setupRequired?'setup':'login',{method:'POST',body:credentials});setSession(auth);setCredentials({username:'',password:''});await loadDraft();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function save(publish=false){if(!draft)return;const issues=validateLayout(draft);if(issues.length){setError(issues.join(' '));return;}setBusy(true);setError('');try{const result=await mapRequest<{layout:Layout}>(publish?'publish':'draft',{method:'POST',csrf:session.csrf,body:{layout:draft,baseRevision:draft.revision}});setDraft(result.layout);setDirty(false);if(publish){setPublished((await getPublished()).layout);if(typeof BroadcastChannel!=='undefined'){const channel=new BroadcastChannel('tanauan-market-published');channel.postMessage('published');channel.close();}setFeedback(`Revision ${result.layout.revision} published successfully.`);}else setFeedback(`Draft revision ${result.layout.revision} saved.`);const meta=await mapRequest<{versions:Version[]}>('draft');setVersions(meta.versions);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 function unitPointerDown(e:ReactPointerEvent<SVGGElement>,unit:MapUnit,resize=false){if(!canEdit)return;e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(e.currentTarget.getScreenCTM()!.inverse());drag.current={id:unit.id,x:p.x,y:p.y,unit:{...unit},resize};setSelected({kind:'stall',id:unit.id});}
 function unitPointerMove(e:ReactPointerEvent<SVGGElement>){const d=drag.current;if(!d||!draft)return;e.stopPropagation();const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(e.currentTarget.getScreenCTM()!.inverse());const dx=Math.round(p.x-d.x),dy=Math.round(p.y-d.y);const patch=d.resize?{w:Math.max(12,d.unit.w+dx),h:Math.max(12,d.unit.h+dy)}:{x:d.unit.x+dx,y:d.unit.y+dy};changeDraft({...draft,stalls:draft.stalls.map(s=>s.id===d.id?{...s,...patch}:s)});}
 const searchTerms=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
 const sectionMatches=!status?data.sections.filter(s=>searchTerms.length>0&&searchTerms.every(word=>`${s.name} ${s.code}`.toLowerCase().includes(word))):[];
 const unitMatches=searchTerms.length&&!status?data.stalls.filter(s=>!s.recordId&&searchTerms.every(word=>`${s.label} ${s.id}`.toLowerCase().includes(word))):[];
 const activeSections=data.sections.filter(s=>s.active);
 const show3D=viewMode==='3d'&&!canEdit;
 return <section className="panel public-market-map" aria-labelledby="market-heading">
  <header className="market-header">
   <div className="market-brand">{icon('map')}<div><h3 id="market-heading">Market floor plan</h3><p>Tanauan Public Market</p></div></div>
   <div className="market-plan-summary" aria-label="Floor plan summary">
    <div className="market-summary-item"><strong>{activeSections.length}</strong><span>Sections</span></div>
    <div className="market-summary-item"><strong>{data.stalls.length}</strong><span>Layout spaces</span></div>
    <div className="market-summary-item"><strong>{data.records.length}</strong><span>Stall records</span></div>
   </div>
   <div className="market-header-actions"><span className="market-offline-badge">{icon('offline_pin')}Works offline</span>
    {(administrationAvailable||editing)&&<button type="button" className="market-admin-toggle" onClick={()=>{if(editing)leaveEditor();else if(session.authenticated)void loadDraft();else setShowLogin(v=>!v);}}>{icon(editing?'arrow_back':'tune')}{editing?'Back to floor plan':'Manage layout'}</button>}
   </div>
  </header>
  <div className="market-toolbar">
  <div className="market-search-row"><form role="search" onSubmit={e=>{e.preventDefault();if(sectionMatches[0])selectSection(sectionMatches[0].id);else if(unitMatches[0])selectUnit(unitMatches[0],true);else if(results[0])selectRecord(results[0]);}}>{icon('search')}<input aria-label="Search market floor plan" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a section, stall or product…"/>{query&&<button type="button" aria-label="Clear search" onClick={()=>setQuery('')}>{icon('close')}</button>}</form><select aria-label="Filter stalls by status" value={status} onChange={e=>setStatus(e.target.value)}><option value="">All stall statuses</option>{(data.statuses??STATUSES).map(s=><option key={s}>{s}</option>)}</select></div>
  <nav className="market-section-nav" aria-label="Floor plan sections">
   <button type="button" className={!selected&&!recordId?'is-selected':''} aria-pressed={!selected&&!recordId} onClick={resetView}>{icon('grid_view')}Entire floor plan</button>
   {activeSections.map(s=><button type="button" key={s.id} className={selectedSection?.id===s.id?'is-selected':''} aria-pressed={selectedSection?.id===s.id} onClick={()=>{setQuery('');setStatus('');selectSection(s.id);}}><span className="market-section-dot" style={{background:s.color}}/>{s.name}</button>)}
  </nav>
  </div>
  {loading&&<div className="market-notice" role="status">Opening your floor plan…</div>}
  {error&&<div className="market-notice market-error" role="alert">{error}<button type="button" aria-label="Dismiss error" onClick={()=>setError('')}>×</button></div>}
  {showLogin&&<form className="market-login" onSubmit={authenticate}><div><h4>{session.setupRequired?'Set up map administrator':'Administrator sign-in'}</h4><p>Editing and publishing require a local administrator account.</p></div><label>Username<input autoComplete="username" required minLength={3} value={credentials.username} onChange={e=>setCredentials({...credentials,username:e.target.value})}/></label><label>Password<input type="password" required minLength={session.setupRequired?12:1} autoComplete={session.setupRequired?'new-password':'current-password'} value={credentials.password} onChange={e=>setCredentials({...credentials,password:e.target.value})}/></label><button className="market-primary" disabled={busy}>{busy?'Please wait…':session.setupRequired?'Create administrator':'Sign in'}</button></form>}
  <div className={`market-workspace${showInformation?' has-information':''}${canEdit?' is-editing':''}`}>
   <div className="market-main-view">
    <div className="market-breadcrumb"><button type="button" onClick={resetView}>Floor plan</button><span>›</span><span>{selectedRecord?.id??selectedSection?.name??'All sections'}</span>{editing&&<button className="market-reload" type="button" disabled={busy} onClick={()=>{if(!dirty||confirm('Discard unsaved changes and reload the saved draft?'))void loadDraft();}}>Reload saved draft</button>}<div className="market-plan-mode" role="group" aria-label="Floor plan display"><button type="button" aria-label="3D view" aria-pressed={show3D} disabled={canEdit} title={canEdit?'Use Preview to view your edits in 3D.':'View the market in 3D'} onClick={()=>{setViewMode('3d');setViewNotice('');}}>{icon('view_in_ar')}3D</button><button type="button" aria-label="2D view" aria-pressed={!show3D} onClick={()=>{setViewMode('2d');setViewNotice('');}}>{icon('layers')}2D</button></div></div>
    {show3D?<Suspense fallback={<div className="market-three-loading" role="status">Opening 3D floor plan…</div>}><Market3D key={resetKey} sections={data.sections} selectedId={selectedSection?.id} onSelect={id=>selectSection(id,false)} onFallback={()=>{setViewMode('2d');setViewNotice('3D is unavailable on this device. The 2D floor plan is ready to use.');}}/></Suspense>:<MapViewport key="stalls" outdoor={false} focus={focus} resetKey={resetKey} title="Tanauan Public Market">
      <defs><pattern id="market-tile" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" stroke="#dce6e9" strokeWidth=".5" fill="none"/></pattern></defs>
      <rect x="20" y="25" width="560" height="904" rx="14" fill="#173449" fillOpacity=".08"/>
      <rect x="24" y="20" width="552" height="900" rx="10" fill="#fff" stroke="#627f8e" strokeWidth="3"/>
      <rect x="30" y="26" width="540" height="888" rx="7" fill="url(#market-tile)"/>
      {data.sections.map((s,index)=><g key={s.id} role="button" tabIndex={0} aria-label={`Explore ${s.name}`} aria-pressed={selectedSection?.id===s.id} className="market-section" onClick={()=>selectSection(s.id,false)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectSection(s.id,false);}}}>
       <rect x={s.x} y={s.y} width={s.w} height={s.h} rx="4" fill={s.color} fillOpacity={selectedSection?.id===s.id||query&&sectionMatches.some(a=>a.id===s.id)?'.2':'.08'} stroke={selectedSection?.id===s.id?s.color:'#c5d0db'} strokeWidth={selectedSection?.id===s.id?3:1} strokeDasharray={!s.active?'6 4':undefined}/>
       <circle cx={300} cy={s.y+s.h/2-27} r="17" fill={s.color}/><text x="300" y={s.y+s.h/2-21} textAnchor="middle" fontSize="16" fontWeight="700" fill="#fff">{String.fromCharCode(65+index)}</text><text x="300" y={s.y+s.h/2+9} textAnchor="middle" fontSize={s.name.length>20?16:19} fill="#3b5167" fontWeight="700">{s.name.toUpperCase()}</text><text x="300" y={s.y+s.h/2+29} textAnchor="middle" fontSize="11" letterSpacing=".6" fill="#718593">{s.id==='watson'?'USE TO BE VERIFIED':s.id==='kakanin'?'OPEN REFERENCE AREA':'CENTRAL WALKWAY'}</text>
      </g>)}
      {canEdit&&<g className="market-editor-graph">{data.edges.map(([a,b],i)=>{const from=data.nodes.find(n=>n.id===a),to=data.nodes.find(n=>n.id===b);return from&&to?<path key={i} d={`M${from.x} ${from.y}L${to.x} ${to.y}`} stroke="#5089ba" strokeWidth="2" strokeDasharray="6 4" fill="none"/>:null;})}{data.nodes.map(n=><g key={n.id} role="button" tabIndex={0} aria-label={`Edit waypoint ${n.name}`} onClick={()=>setSelected({kind:'node',id:n.id})} onKeyDown={e=>{if(e.key==='Enter')setSelected({kind:'node',id:n.id});}}><circle cx={n.x} cy={n.y} r={selected?.id===n.id?8:5} fill={n.verified?'#267a69':'#d19a41'} stroke="white" strokeWidth="2"/><text x={n.x+10} y={n.y-8} fontSize="9" fill="#698196">{n.name}</text></g>)}</g>}
      {data.stalls.map(unit=>{const r=data.records.find(r=>r.id===unit.recordId);const active=selectedUnit?.id===unit.id;const matches=!query&&!status||!!r&&matchIds.has(r.id)||!status&&(unitMatches.some(s=>s.id===unit.id)||sectionMatches.some(s=>s.id===unit.sectionId));const color=data.sections.find(s=>s.id===unit.sectionId)?.color??'#bbc5ce';return <g key={unit.id} className={`market-stall${active?' selected':''}${canEdit?' draggable':''}`} role="button" tabIndex={0} aria-label={`${r?.id??unit.label}, ${r?.status??'Unassigned sketch unit'}`} aria-pressed={active}
       onClick={()=>selectUnit(unit)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectUnit(unit);}}} onPointerDown={e=>unitPointerDown(e,unit)} onPointerMove={unitPointerMove} onPointerUp={e=>{if(drag.current){e.stopPropagation();drag.current=null;}}} onPointerCancel={()=>{drag.current=null;}} opacity={matches?1:.28}>
        <rect x={unit.x} y={unit.y} width={unit.w} height={unit.h} rx="3" fill={active?'#e6f1ff':color} fillOpacity={active?1:.4} stroke={active?'#1b73e8':color} strokeWidth={active?3:1.5} strokeDasharray={!r?'5 3':r.status==='Available'?'2 3':undefined}/>
        <text x={unit.x+unit.w/2} y={unit.y+unit.h/2-2} textAnchor="middle" fontSize="15" fontWeight="600" fill="#3c5368">{r?.id??unit.label.replace(/^Sketch\s+/,'')}</text><text x={unit.x+unit.w/2} y={unit.y+unit.h/2+15} textAnchor="middle" fontSize="11" fill="#607a91">{r?r.status:'Unassigned'}</text>
        {r&&<circle className={statusClass(r.status)} cx={unit.x+unit.w-9} cy={unit.y+9} r="4" fill="currentColor"/>}
        {canEdit&&active&&<rect className="market-resize" x={unit.x+unit.w-10} y={unit.y+unit.h-10} width="10" height="10" fill="#1a73e8" onPointerDown={e=>{e.preventDefault();e.stopPropagation();const g=e.currentTarget.parentElement as unknown as SVGGElement;g.setPointerCapture(e.pointerId);const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(g.getScreenCTM()!.inverse());drag.current={id:unit.id,x:p.x,y:p.y,unit:{...unit},resize:true};}}/>}
       </g>;})}
      {route&&<g className="market-walking-route" pointerEvents="none"><polyline points={route.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke="white" strokeWidth="9"/><polyline points={route.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke="#1a73e8" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>{route.map((p,i)=>(i===0||i===route.length-1)&&<circle key={i} cx={p.x} cy={p.y} r="7" fill="#1a73e8" stroke="#fff" strokeWidth="2"/>)}</g>}
      <path d="M274 924H326" stroke="white" strokeWidth="5"/><text x="300" y="936" textAnchor="middle" fontSize="9" letterSpacing="1.5" fill="#708198">PUBLIC MARKET · POSSIBLE ACCESS</text>
    </MapViewport>}
    {viewNotice&&<div className="market-view-notice" role="status">{viewNotice}</div>}
    <div className="market-map-footer">{canEdit?'Editing layout · Save your draft before leaving.':`${mapSource==='bundled'?'Built-in floor plan':mapSource==='cached'?'Last saved floor plan':'Published floor plan'} · ${data.verified?'Verified layout':'Reference layout · Locations need on-site confirmation'}`}</div>
   </div>
   {showInformation&&<aside className="market-information" aria-label={canEdit?'Map administration':'Market information'}>
    {canEdit&&draft?<><MapEditor layout={draft} onChange={changeDraft} selection={selected} onSelect={setSelected} existing={existingStalls} onSave={()=>void save()} onPublish={()=>void save(true)} onPreview={()=>setPreview(true)} busy={busy} message={feedback}/><details className="market-version-history"><summary>Layout version history</summary>{versions.map(v=><p key={v.version}>v{v.version} · {v.publication_status}<small>{v.created_at.slice(0,16).replace('T',' ')} UTC · {v.created_by}</small></p>)}</details><button className="market-signout" type="button" onClick={async()=>{if(dirty&&!confirm('Discard unsaved changes and sign out?'))return;try{await mapRequest('logout',{method:'POST',csrf:session.csrf});setSession({authenticated:false,setupRequired:false});setEditing(false);setDirty(false);}catch(e){setError((e as Error).message);}}}>Sign out of map administration</button></>:
    <>{preview&&<div className="market-preview-banner">Draft preview<button type="button" onClick={()=>setPreview(false)}>Return to editor</button></div>}
     {hasDetails&&<div className="market-place"><button type="button" className="market-detail-close" aria-label="Close details" onClick={resetView}>{icon('close')}</button><span className="market-eyebrow">{selectedUnit?'STALL DETAILS':selectedRecord?'DIRECTORY RECORD':'MARKET SECTION'}</span><h4>{selectedRecord?.businessName||selectedRecord?.id||selectedUnit?.label||selectedSection?.name}</h4>
      {selectedRecord?<><span className={`market-status-badge ${statusClass(selectedRecord.status)}`}>{selectedRecord.status}</span><dl><dt>Stall ID / number</dt><dd>{selectedRecord.id}</dd><dt>Market section</dt><dd>{selectedSection?.name??selectedRecord.section}</dd><dt>Stall name</dt><dd>{selectedRecord.businessName||'Not published'}</dd><dt>Products</dt><dd>{selectedRecord.products.join(', ')||'Not yet published'}</dd><dt>Location</dt><dd>{selectedUnit?`${selectedUnit.x<300?'Left':'Right'} side · ${selectedSection?.name??'Mapped section'}`:'Location not yet assigned or verified'}</dd><dt>Business description</dt><dd>{selectedRecord.description||'No public description yet'}</dd><dt>Vendor name</dt><dd>{selectedRecord.publicVendor&&selectedRecord.vendorName?selectedRecord.vendorName:'Not publicly shared'}</dd>{selectedRecord.publicContact&&selectedRecord.contact&&<><dt>Authorized contact</dt><dd>{selectedRecord.contact}</dd></>}</dl></>:
       selectedUnit?<p>This space is part of the reference layout. A stall record has not been assigned yet.</p>:selectedSection?<p>{selectedSection.description||(selectedSection.id==='kakanin'?'Individual stall positions have not yet been mapped.':'Select a space to view its details. Dashed spaces are awaiting a stall assignment.')}</p>:null}
      {(selectedUnit||selectedRecord)&&<div className="market-place-actions"><button type="button" disabled={!selectedUnit} onClick={()=>{if(selectedUnit)selectUnit(selectedUnit,true);}}>Locate / highlight stall</button><button type="button" onClick={()=>{setSelected(selectedSection?{kind:'section',id:selectedSection.id}:null);setRecordId('');setShowRoute(false);}}>Return to section view</button></div>}
      {selectedUnit&&data.verified&&startId&&<div className="market-directions-box"><label>Starting entrance<select value={startId} onChange={e=>setRouteStart(e.target.value)}>{entrances.map(n=><option key={n.id} value={n.id}>{n.name}</option>)}</select></label><button className="market-primary" type="button" onClick={()=>setShowRoute(v=>!v)}>{icon('directions_walk')}{showRoute?'Clear walking route':'Get walking directions'}</button>{showRoute&&!route&&<p role="status">No verified walking route reaches this stall.</p>}{route&&<p role="status">Follow the highlighted aisle from {entrances.find(n=>n.id===startId)?.name}.</p>}</div>}
      {selectedUnit&&!data.verified&&<div className="market-verification-note">{icon('info')}<p>Stall locations and entrances need on-site confirmation.</p></div>}
     </div>}
     {(query||status)&&<div className="market-search-results"><h5 aria-live="polite">Search results · {results.length+sectionMatches.length+unitMatches.length}</h5>{sectionMatches.map(s=><button type="button" key={s.id} onClick={()=>selectSection(s.id)}>{icon('layers')}<span>{s.name}<small>Market section</small></span></button>)}{unitMatches.map(unit=><button type="button" key={unit.id} onClick={()=>selectUnit(unit,true)}>{icon('grid_view')}<span>{unit.label}<small>Layout space · Unassigned</small></span></button>)}{results.slice(0,30).map(r=><button type="button" key={r.id} onClick={()=>selectRecord(r)}>{icon('storefront')}<span>{r.businessName||r.id}<small>{r.id} · {r.status}</small></span></button>)}{results.length>30&&<p>Showing the first 30 stall records. Refine your search to find a specific stall.</p>}{!results.length&&!sectionMatches.length&&!unitMatches.length&&<div className="market-empty-state">{icon('search_off')}<p>No matches found. Try a section name or stall number.</p><button type="button" onClick={()=>{setQuery('');setStatus('');}}>Clear filters</button></div>}</div>}
    </>}
   </aside>}
  </div>
 </section>;
}
