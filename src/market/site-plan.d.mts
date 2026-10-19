export type BuildingId = 'main' | 'wet';
export type SitePoint = { x:number; y:number };
export type Footprint = { id:BuildingId; name:string; points:SitePoint[] };
export const projection: { originLongitude:number; originLatitude:number; referenceLatitude:number; scale:number; padding:number };
export const sourceCoordinates: Record<BuildingId, [number, number][]>;
export const sourceInfo: { provider:string; coordinateSystem:string; geometryDate:string; features:Record<BuildingId, {wayId:number; version:number; featureDate:string}> };
export const footprints: Footprint[];
export function project(lon:number, lat:number):SitePoint;
export function buildingAt(x:number, y:number):BuildingId|undefined;
