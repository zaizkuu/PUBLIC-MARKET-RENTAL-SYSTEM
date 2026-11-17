import { footprints } from './site-plan.mjs';
import type { StallRecord } from './types';

type Props = {
 records: StallRecord[];
 onOpenSavedMap: () => void;
};

const points = (building: typeof footprints[number]) =>
 building.points.map(point => `${point.x},${point.y}`).join(' ');

export default function ProposedFloorPlan({ records, onOpenSavedMap }: Props) {
 return <section className="market-proposed-plan" aria-labelledby="market-proposed-title">
  <div className="market-proposed-copy">
   <span className="market-eyebrow">REFERENCE ONLY · NOT A VERIFIED FLOOR PLAN</span>
   <h4 id="market-proposed-title">Mapped market building outlines</h4>
   <p>Historical OpenStreetMap outlines show the approximate position and orientation of the main and wet-market buildings. They do not show current interior stalls, entrances, or walkways.</p>
   <div className="market-proposed-buildings" aria-label="Mapped buildings">
    {footprints.map(building => <div key={building.id}><span aria-hidden="true" />{building.name}</div>)}
   </div>
   <p className="market-proposed-records">{records.length} existing stall {records.length === 1 ? 'record' : 'records'} are available in the saved map. Their physical locations are not inferred here.</p>
   <button className="market-primary" type="button" onClick={onOpenSavedMap}>Open saved stall map</button>
  </div>
  <div className="market-proposed-map">
   <svg viewBox="0 0 600 1000" role="img" aria-labelledby="proposed-map-title proposed-map-description">
    <title id="proposed-map-title">Historical mapped building outlines in Tanauan, Leyte</title>
    <desc id="proposed-map-description">Two elongated building footprints, with the main market to the north and the wet market to the south. Interiors and stall positions are not shown.</desc>
    <path className="market-proposed-street" d="M75 160H510" />
    <text className="market-proposed-street-label" x="292" y="145" textAnchor="middle">REAL STREET · NORTH</text>
    {footprints.map(building => {
     const centerX = building.points.reduce((sum, point) => sum + point.x, 0) / building.points.length;
     const centerY = building.points.reduce((sum, point) => sum + point.y, 0) / building.points.length;
     return <g key={building.id}>
      <polygon className="market-proposed-footprint" points={points(building)} />
      <text className="market-proposed-building-label" x={centerX} y={centerY} textAnchor="middle">{building.id === 'main' ? 'MAIN MARKET' : 'WET MARKET'}</text>
      <text className="market-proposed-building-caption" x={centerX} y={centerY + 23} textAnchor="middle">HISTORICAL OUTLINE</text>
     </g>;
    })}
    <path className="market-proposed-street" d="M75 870H510" />
    <text className="market-proposed-street-label" x="292" y="897" textAnchor="middle">PIEDAD STREET · SOUTH</text>
    <text className="market-proposed-north" x="535" y="216" textAnchor="middle">N</text>
    <path className="market-proposed-north-arrow" d="M535 260V228M526 238l9-10 9 10" />
   </svg>
   <p>Building geometry: OpenStreetMap · corner coordinates dated 2011 · schematic display, not to scale.</p>
  </div>
 </section>;
}
