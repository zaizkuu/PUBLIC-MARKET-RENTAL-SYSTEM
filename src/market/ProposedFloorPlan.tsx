import { useMemo, useState } from 'react';
import type { StallRecord } from './types';
import { SECTION_LIST, sectionInfo } from './directory';

/* The "Proposed layout" tab of the market map: the register's own stall
   records grouped by section and set out in the two mapped blocks. Which
   section sits in which block is a proposal — wet goods in the wet market —
   and nothing here claims a measured position, as the floor-plan proposal
   (docs/TANAUAN-FLOOR-PLAN-PROPOSAL.md) asks. */

const BLOCKS: Array<{ title: string; note: string; sections: string[] }> = [
  { title: 'Main market block', note: 'Toward Real Street', sections: ['Kakanin', 'Fruits/Duma', 'Vegetable', 'Dried Fish/Eggs'] },
  { title: 'Wet market block', note: 'South-southwest of the main block', sections: ['Fish', 'Meat - Chicken', 'Meat - Carabeef/Beef & Pork'] },
];

const COLORS = ['#c58a2b', '#b4573e', '#5e9b4c', '#2f8f6a', '#2f73b5', '#c46a8a', '#a04545'];

const statusClass = (status: string) => status.toLowerCase().replace(/ /g, '-');

export default function ProposedFloorPlan({ records, onOpenSavedMap }: { records: StallRecord[]; onOpenSavedMap: () => void }) {
  const [open, setOpen] = useState('');
  const bySection = useMemo(() => {
    const map = new Map<string, StallRecord[]>();
    records.forEach((r) => map.set(r.section, [...(map.get(r.section) ?? []), r]));
    return map;
  }, [records]);
  /* Sections the register holds that no block names (an older backup) still get a place. */
  const placed = new Set(BLOCKS.flatMap((b) => b.sections));
  const others = [...bySection.keys()].filter((s) => !placed.has(s));
  const blocks = others.length ? [...BLOCKS, { title: 'Other sections', note: 'Not yet placed', sections: others }] : BLOCKS;
  const shown = open ? bySection.get(open) ?? [] : [];

  return (
    <div className="proposal-plan">
      <p className="proposal-caption">Proposed layout · not to scale · positions require site verification</p>
      <div className="proposal-blocks">
        {blocks.map((block) => (
          <section key={block.title} className="proposal-block" aria-label={block.title}>
            <header><strong>{block.title}</strong><span>{block.note}</span></header>
            <div className="proposal-sections">
              {block.sections.map((name) => {
                const stalls = bySection.get(name) ?? [];
                const occupied = stalls.filter((s) => s.status === 'Occupied').length;
                const available = stalls.filter((s) => s.status === 'Available').length;
                const color = COLORS[SECTION_LIST.findIndex((s) => s.name === name)] ?? '#7d8b99';
                return (
                  <button key={name} type="button" className="proposal-section" aria-pressed={open === name} style={{ borderTopColor: color }} onClick={() => setOpen(open === name ? '' : name)}>
                    <span className="proposal-code" style={{ background: color }}>{sectionInfo(name)?.code ?? '—'}</span>
                    <span className="proposal-name">{name}</span>
                    <span className="proposal-count">{stalls.length} stall{stalls.length === 1 ? '' : 's'} · {occupied} occupied · {available} available</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      {open && (
        <section className="proposal-stalls" aria-live="polite" aria-label={`${open} stalls`}>
          <header><strong>{open}</strong><span>{shown.length} stall{shown.length === 1 ? '' : 's'} on the register</span></header>
          <ul>
            {shown.map((r) => <li key={r.id} className={`proposal-stall ${statusClass(r.status)}`} title={r.status}>{r.id}</li>)}
          </ul>
        </section>
      )}
      <div className="proposal-footer">
        <span>Bay counts follow the stall register, not a survey. No stall has a verified position yet.</span>
        <button type="button" className="market-primary" onClick={onOpenSavedMap}>Open the saved stall map</button>
      </div>
    </div>
  );
}
