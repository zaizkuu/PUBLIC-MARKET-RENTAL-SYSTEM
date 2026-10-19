import type { Layout, MapUnit, StallRecord, Rect } from './types';
export function overlap(a:Rect,b:Rect):boolean;
export function segmentBlocked(a:{x:number;y:number},b:{x:number;y:number},rects:Rect[]):boolean;
export function validateLayout(l:unknown):string[];
export function findRoute(l:Layout,startId:string,unit:MapUnit):{x:number;y:number}[]|null;
export function publicLayout(l:Layout):Layout;
export function searchDirectory(l:Layout,query:string,status?:string):StallRecord[];