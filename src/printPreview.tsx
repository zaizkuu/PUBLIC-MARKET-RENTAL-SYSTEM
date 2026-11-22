import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

/* ---------- Bond paper ----------

   Every print asks which bond paper is in the printer, and nothing is chosen
   for the officer: a receipt laid out for A4 and printed on short bond loses
   its bottom edge, so the choice is made each time, on purpose. The sheet that
   prints is the paper less an 8 mm margin all round, so receipts and slips
   stretch to fill whichever paper it is. */
export type PaperSize = 'A4' | 'Short' | 'Long';

/* `font` and `signGap` fit four receipts or slips to the sheet: measured so the
   longest receipt (overdue, with notes) is not cut off on that paper. */
export const PAPER: Record<PaperSize, { name: string; detail: string; width: number; height: number; font: number; signGap: string }> = {
  A4: { name: 'A4', detail: '210 × 297 mm', width: 210, height: 297, font: 0.97, signGap: '5mm' },
  Short: { name: 'Short bond', detail: '8.5 × 11 in', width: 215.9, height: 279.4, font: 0.9, signGap: '4mm' },
  Long: { name: 'Long bond', detail: '8.5 × 13 in', width: 215.9, height: 330.2, font: 0.97, signGap: '5mm' },
};
export const PAPER_SIZES = Object.keys(PAPER) as PaperSize[];
export const PAGE_MARGIN_MM = 8;

/* The printed area for a paper, as the CSS custom properties the receipt and
   slip sheets are sized by. Set on the preview so it shows that paper. */
export function sheetVars(paper: PaperSize): CSSProperties {
  const p = PAPER[paper];
  return { '--sheet-width': `${p.width - 2 * PAGE_MARGIN_MM}mm`, '--sheet-height': `${p.height - 2 * PAGE_MARGIN_MM}mm`, '--sheet-font': String(p.font), '--sign-gap': p.signGap } as CSSProperties;
}

/* Called just before the print window opens: sizes the sheets for the paper
   and asks the printer for that page size. A report keeps its own margins. */
export function applyPrintPaper(paper: PaperSize) {
  const p = PAPER[paper];
  const root = document.documentElement.style;
  root.setProperty('--sheet-width', `${p.width - 2 * PAGE_MARGIN_MM}mm`);
  root.setProperty('--sheet-height', `${p.height - 2 * PAGE_MARGIN_MM}mm`);
  root.setProperty('--sheet-font', String(p.font));
  root.setProperty('--sign-gap', p.signGap);
  let style = document.getElementById('print-paper-size') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'print-paper-size';
    document.head.appendChild(style);
  }
  style.textContent = `@media print {
  @page { size: ${p.width}mm ${p.height}mm; margin: ${PAGE_MARGIN_MM}mm; }
  @page report { size: ${p.width}mm ${p.height}mm; margin: 12mm 11mm 16mm; }
}`;
}

/* The three papers as a required choice. Each shows its shape to scale. */
export function PaperSizePicker({ value, onChange, invalid }: { value: PaperSize | ''; onChange: (paper: PaperSize) => void; invalid?: boolean }) {
  return (
    <div className={`paper-size-picker${invalid ? ' invalid' : ''}`} role="radiogroup" aria-label="Bond paper in the printer" aria-required="true">
      {PAPER_SIZES.map((id) => (
        <button key={id} type="button" role="radio" aria-checked={value === id} onClick={() => onChange(id)}>
          <span className="paper-size-shape" aria-hidden="true" style={{ height: `${PAPER[id].height / 10}px`, width: `${PAPER[id].width / 10}px` }} />
          <span className="paper-size-text"><strong>{PAPER[id].name}</strong><small>{PAPER[id].detail}</small></span>
        </button>
      ))}
    </div>
  );
}

/* ---------- Print preview at the size of the real paper ----------

   The preview draws the whole sheet, margins included, so it looks like the
   bond paper that comes out of the printer. "Actual size" means the sheet on
   screen is as big as that paper — which plain CSS millimetres are not: they
   assume 96 dots to the inch whatever the screen, and the interface is drawn
   at --display-scale besides. So Actual size undoes the display scale, and
   on a computer where the office has matched the screen to a real sheet once
   (Match screen), it uses that measurement, kept per computer in device pixels
   per millimetre so a later change of the window's zoom is allowed for too.

   Zoom levels are shown relative to Actual size: 100% is the real paper. */
export const CSS_PX_PER_MM = 96 / 25.4;
const FIT_ZOOM = 0.62;          // fallback before the preview has been measured
const MIN_LEVEL = 0.25;
const MAX_LEVEL = 2;
const screenDensityKey = 'pmrms-screen-px-per-mm';

/* Device pixels per millimetre measured on this screen, or 0 if never measured. */
export function measuredScreenDensity(): number {
  try {
    const value = Number(localStorage.getItem(screenDensityKey));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch { return 0; }
}

/* The interface's own scale (the zoom on #root), which the sheet must undo. */
export function interfaceScale(): number {
  const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--display-scale'));
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/* How much bigger than CSS millimetres a real millimetre is on this screen. */
export function screenFactor(): number {
  const density = measuredScreenDensity();
  return density > 0 ? density / (CSS_PX_PER_MM * (window.devicePixelRatio || 1)) : 1;
}

/* The zoom at which the preview's sheet is exactly as big as the paper. */
export const actualSizeZoom = () => screenFactor() / interfaceScale();

/* Zoom for one print preview of `paper` (A4 until one is chosen): Fit (the
   sheet's width fills the preview), Actual size, or a level in between, with
   Match screen for this computer. */
export function usePaperZoom(paper: PaperSize | '') {
  const paperInfo = PAPER[paper || 'A4'];
  const [actual, setActual] = useState(actualSizeZoom);
  const [fit, setFit] = useState(FIT_ZOOM);
  const [level, setLevel] = useState<number | 'fit'>('fit');
  const [calibrating, setCalibrating] = useState(false);
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);

  /* Fit follows the preview's width — it changes with fullscreen, the window and the paper. */
  useEffect(() => {
    if (!viewport) return;
    const measure = () => {
      const width = viewport.clientWidth - 40;
      if (width > 0) setFit(width / (paperInfo.width * CSS_PX_PER_MM));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [viewport, paperInfo.width]);

  /* The window's zoom can change while the dialog is open (Ctrl + / −). */
  useEffect(() => {
    const update = () => setActual(actualSizeZoom());
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const zoom = level === 'fit' ? fit : level * actual;
  const shown = zoom / actual;
  const step = (delta: number) => setLevel(Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round((shown + delta) * 20) / 20)));
  return {
    zoom,
    shown,
    viewportRef: setViewport,
    /* The preview's scale and the sheet size for the paper, for its style. */
    style: { zoom, ...sheetVars(paper || 'A4') } as CSSProperties,
    controls: (
      <>
        <button type="button" className="row-icon-btn" title="Zoom out" aria-label="Zoom out" disabled={shown <= MIN_LEVEL + 0.001} onClick={() => step(-0.1)}><span className="material-symbols-outlined">zoom_out</span></button>
        <span className="print-preview-level" title="Relative to the real sheet of paper">{Math.round(shown * 100)}%</span>
        <button type="button" className="row-icon-btn" title="Zoom in" aria-label="Zoom in" disabled={shown >= MAX_LEVEL - 0.001} onClick={() => step(0.1)}><span className="material-symbols-outlined">zoom_in</span></button>
        <button type="button" className="btn-outline-sm" aria-pressed={level === 'fit'} onClick={() => setLevel('fit')}>Fit</button>
        <button type="button" className="btn-outline-sm" aria-pressed={level === 1}
          title={measuredScreenDensity() > 0 ? `Show the sheet exactly as big as the ${paperInfo.name} paper` : `Show the sheet as big as the ${paperInfo.name} paper. Use Match screen once on this computer for an exact match.`}
          onClick={() => setLevel(1)}>Actual size</button>
        <button type="button" className="row-icon-btn" title={`Match the screen to a real sheet of ${paperInfo.name} paper`} aria-label="Match screen to real paper" onClick={() => setCalibrating(true)}><span className="material-symbols-outlined">straighten</span></button>
      </>
    ),
    calibration: calibrating && (
      <PaperCalibration
        paper={paper || 'A4'}
        onDone={() => { setCalibrating(false); setActual(actualSizeZoom()); setLevel(1); }}
        onCancel={() => setCalibrating(false)}
      />
    ),
  };
}

/* Match screen: the office holds a sheet of the bond paper against the screen
   and adjusts a bar until it is exactly as wide as the paper. Done once per
   computer; the result is kept with this computer's settings. */
export function PaperCalibration({ paper, onDone, onCancel }: { paper: PaperSize; onDone: () => void; onCancel: () => void }) {
  const sheet = PAPER[paper];
  const [factor, setFactor] = useState(screenFactor);
  const nudge = (delta: number) => setFactor((f) => Math.min(1.6, Math.max(0.6, Math.round((f + delta) * 1000) / 1000)));
  const save = () => {
    try { localStorage.setItem(screenDensityKey, String(factor * CSS_PX_PER_MM * (window.devicePixelRatio || 1))); } catch { /* kept for this session only */ }
    onDone();
  };
  const reset = () => {
    try { localStorage.removeItem(screenDensityKey); } catch { /* nothing stored */ }
    setFactor(1);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); onCancel(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); nudge((e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 0.01 : 0.002)); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);
  const width = `${Math.round(sheet.width * 10) / 10} mm`;
  return (
    <div className="paper-calibration" role="dialog" aria-modal="true" aria-labelledby="paper-calibration-title">
      <div className="paper-calibration-card">
        <h3 id="paper-calibration-title"><span className="material-symbols-outlined">straighten</span>Match the screen to real paper</h3>
        <ol>
          <li>Hold a sheet of <strong>{sheet.name} bond paper</strong> flat against the screen, short edge across.</li>
          <li>Line its left edge up with the start of the blue bar.</li>
          <li>Use the buttons (or the ← → keys) until the bar ends exactly at the paper's right edge.</li>
        </ol>
        {/* The bar is the paper's short edge, drawn at the zoom being tried. */}
        <div className="paper-calibration-track">
          <div className="paper-calibration-bar" style={{ width: `${sheet.width}mm`, zoom: factor / interfaceScale() }}><span>{width} — the width of {sheet.name}</span></div>
        </div>
        <div className="paper-calibration-controls">
          <button type="button" className="btn-outline-sm" onClick={() => nudge(-0.01)}>− more</button>
          <button type="button" className="btn-outline-sm" onClick={() => nudge(-0.002)}>− a little</button>
          <span className="print-preview-level">{(factor * 100).toFixed(1)}%</span>
          <button type="button" className="btn-outline-sm" onClick={() => nudge(0.002)}>+ a little</button>
          <button type="button" className="btn-outline-sm" onClick={() => nudge(0.01)}>+ more</button>
        </div>
        <div className="paper-calibration-actions">
          <button type="button" className="btn-outline" onClick={reset}>Reset</button>
          <span />
          <button type="button" className="btn-outline" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn-primary" onClick={save}>Save for this computer</button>
        </div>
      </div>
    </div>
  );
}
