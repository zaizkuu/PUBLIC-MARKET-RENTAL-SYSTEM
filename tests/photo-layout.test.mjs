import test from 'node:test';
import assert from 'node:assert/strict';
import { PHOTO_POSITIONS, PHOTO_FEATURES, inOverview } from '../src/market/photoLayout.ts';
import { buildDirectory } from '../src/market/directory.ts';

test('every numbered directory position appears exactly once in the photo layout',()=>{
 const numbers=PHOTO_POSITIONS.map(s=>s.number).sort((a,b)=>a-b);
 assert.equal(new Set(numbers).size,numbers.length);
 assert.deepEqual(numbers,buildDirectory().stalls.map(s=>Number(s.id.split('-')[1])).sort((a,b)=>a-b));
});
test('stalls and photographed facilities never overlap',()=>{
 const all=[...PHOTO_POSITIONS,...PHOTO_FEATURES];
 for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
  const a=all[i],b=all[j];if(a.area!==b.area)continue;
  assert.ok(!(a.x<b.x+b.w-.001&&a.x+a.w>b.x+.001&&a.z<b.z+b.d-.001&&a.z+a.d>b.z+.001),`Overlap: ${a.number??a.label} and ${b.number??b.label}`);
 }
});
test('facing rows follow the photographs, including the break for stairs',()=>{
 const p=n=>PHOTO_POSITIONS.find(s=>s.number===n);
 assert.equal(p(38).x,p(39).x);assert.equal(p(15).x,p(62).x);
 assert.equal(p(116).x,p(138).x);assert.equal(p(105).x,p(149).x);
 assert.equal(p(125).x,p(126).x);assert.equal(p(123).x,p(131).x);
 assert.ok(p(123).x-p(124).x>5);
 assert.equal(p(95).x,p(159).x);
});
test('combined overview keeps all sections separate without changing their internal arrangements',()=>{
 const all=[...PHOTO_POSITIONS,...PHOTO_FEATURES].map(inOverview);
 for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
  const a=all[i],b=all[j];
  assert.ok(!(a.x<b.x+b.w-.001&&a.x+a.w>b.x+.001&&a.z<b.z+b.d-.001&&a.z+a.d>b.z+.001));
 }
 for(const a of PHOTO_POSITIONS)for(const b of PHOTO_POSITIONS.filter(b=>b.area===a.area)){
  assert.ok(Math.abs((inOverview(a).z-inOverview(b).z)-(a.z-b.z))<.00001);
 }
});
test('the 2nd floor places every stall on its vendor list once, without overlaps, in number order',async()=>{
 const {UPPER_POSITIONS,statusGroup}=await import('../src/market/photoLayout.ts');
 const {SECOND_FLOOR_ROWS}=await import('../src/market/secondFloor.ts');
 assert.deepEqual(UPPER_POSITIONS.map(p=>p.number),SECOND_FLOOR_ROWS.map(r=>r.number));
 assert.ok(UPPER_POSITIONS.every(p=>p.area==='upper'));
 for(let i=0;i<UPPER_POSITIONS.length;i++)for(let j=i+1;j<UPPER_POSITIONS.length;j++){
  const a=UPPER_POSITIONS[i],b=UPPER_POSITIONS[j];
  assert.ok(!(a.x<b.x+b.w-.001&&a.x+a.w>b.x+.001&&a.z<b.z+b.d-.001&&a.z+a.d>b.z+.001),`Overlap: PS-${a.number} and PS-${b.number}`);
 }
 const p=n=>UPPER_POSITIONS.find(s=>s.number===n);
 assert.ok(p(2).x>p(1).x&&p(1).z===p(14).z,'a row runs left to right');
 assert.ok(PHOTO_POSITIONS.every(s=>s.area!=='upper'),'the ground-floor photo layout is unchanged');
 assert.equal(statusGroup('Temporarily Closed'),'Inactive');
 assert.equal(statusGroup('Abandoned'),'Inactive');
 assert.equal(statusGroup('Available'),'Available');
 assert.equal(statusGroup('Occupied'),'Occupied');
});
