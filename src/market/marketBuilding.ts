import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ============================================================
   The market building around the stalls
   ============================================================

   Modelled on the real Tanauan Public Market as the aerial photograph shows it
   (public/market/aerial-reference.jpg): one large hall under a low-pitched
   roof of faded green corrugated sheets with a raised vent along the ridge,
   on a concrete frame — square columns, painted half-walls, a concrete apron —
   with the street (P. Garcia St.) in front and a painted signboard over the
   entrance. Materials are drawn as textures (concrete, ceramic tile,
   corrugated sheet, asphalt) rather than flat colours, and there is no
   decoration that is not on the building. Nothing is drawn round it: the
   plan shows the market alone.

   It is sized to whatever stalls are on show, so it frames the whole ground
   floor, one section, or the 2nd floor alike. `overhead` is the roof and the
   eaves, which the plan leaves off until "Show roof" so the stalls are seen. */

export type FloorBounds = { minX: number; maxX: number; minZ: number; maxZ: number };
type Track = (r: THREE.BufferGeometry | THREE.Material | THREE.Texture) => void;

export const WALKWAY = 2.6;          // covered walkway round the stalls
const EAVE = 4.2;                    // height of the roof's edge above the floor
const FLOOR_TOP = -0.17;             // the stall floor sits on the plinth here
const PITCH = 0.2;                   // roof pitch, radians (about 11°)

/* A small, fixed random sequence, so every texture looks the same each time. */
function sequence(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

function canvasTexture(size: number, draw: (c: CanvasRenderingContext2D, size: number) => void, track: Track) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d')!, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  track(texture);
  return texture;
}

/* Poured concrete: an even grey with fine speckle and faint patches. */
function concrete(c: CanvasRenderingContext2D, size: number) {
  const rand = sequence(11);
  c.fillStyle = '#c9c6bf'; c.fillRect(0, 0, size, size);
  for (let i = 0; i < 14; i++) {
    c.fillStyle = `rgba(${rand() > 0.5 ? '255,255,255' : '90,88,84'},${0.035 + rand() * 0.04})`;
    c.beginPath(); c.arc(rand() * size, rand() * size, 20 + rand() * 60, 0, Math.PI * 2); c.fill();
  }
  for (let i = 0; i < 5200; i++) {
    const v = rand() > 0.5 ? 235 : 120;
    c.fillStyle = `rgba(${v},${v - 2},${v - 6},${0.15 + rand() * 0.25})`;
    c.fillRect(rand() * size, rand() * size, 1 + rand() * 1.4, 1 + rand() * 1.4);
  }
}

/* Ceramic floor or counter tiles with grey grout. */
function tiles(c: CanvasRenderingContext2D, size: number) {
  const rand = sequence(23), n = 4, cell = size / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = 236 + Math.round(rand() * 10);
    c.fillStyle = `rgb(${v},${v - 3},${v - 9})`;
    c.fillRect(x * cell, y * cell, cell, cell);
  }
  c.strokeStyle = 'rgba(120,116,108,0.55)'; c.lineWidth = 3;
  for (let i = 0; i <= n; i++) {
    c.beginPath(); c.moveTo(i * cell, 0); c.lineTo(i * cell, size); c.stroke();
    c.beginPath(); c.moveTo(0, i * cell); c.lineTo(size, i * cell); c.stroke();
  }
}

/* Corrugated sheet: ribs across the width, with weathering streaks down the slope. */
function corrugated(c: CanvasRenderingContext2D, size: number) {
  const rand = sequence(37);
  for (let x = 0; x < size; x++) {
    const v = Math.round(200 + 45 * Math.sin((x / size) * Math.PI * 2 * 8));
    c.fillStyle = `rgb(${v},${v},${v})`;
    c.fillRect(x, 0, 1, size);
  }
  for (let i = 0; i < 60; i++) {
    c.fillStyle = `rgba(${rand() > 0.7 ? '120,80,50' : '70,70,70'},${0.05 + rand() * 0.08})`;
    c.fillRect(rand() * size, 0, 1 + rand() * 3, size);
  }
}

/* Asphalt: dark, fine-grained. */
function asphalt(c: CanvasRenderingContext2D, size: number) {
  const rand = sequence(53);
  c.fillStyle = '#5b5f63'; c.fillRect(0, 0, size, size);
  for (let i = 0; i < 6000; i++) {
    const v = 60 + Math.round(rand() * 70);
    c.fillStyle = `rgba(${v},${v},${v + 4},0.5)`;
    c.fillRect(rand() * size, rand() * size, 1.3, 1.3);
  }
}

export type MarketTextures = { concrete: THREE.Texture; tiles: THREE.Texture; corrugated: THREE.Texture; asphalt: THREE.Texture };

/* The textures the building and the stalls share. Repeats are set per use on clones. */
export function marketTextures(track: Track): MarketTextures {
  return {
    concrete: canvasTexture(512, concrete, track),
    tiles: canvasTexture(256, tiles, track),
    corrugated: canvasTexture(256, corrugated, track),
    asphalt: canvasTexture(512, asphalt, track),
  };
}

/* A clone of a texture repeated so one pattern covers `unit` scene units. */
export function repeated(texture: THREE.Texture, w: number, h: number, unit: number, track: Track) {
  const t = texture.clone();
  t.repeat.set(Math.max(1, w / unit), Math.max(1, h / unit));
  t.needsUpdate = true;
  track(t);
  return t;
}

type Finish = { light: string; dark: string; map?: THREE.Texture; roughness?: number; metalness?: number; side?: THREE.Side };

export function buildMarket(scene: THREE.Scene, bounds: FloorBounds, opts: {
  isDark: () => boolean;
  track: Track;
  textures: MarketTextures;
  title: string;
  subtitle: string;
  entrance: boolean;
  /** Width of the entrance opening; by default a fifth of the front, 6 to 10 units. */
  gate?: number;
}) {
  const { track, textures } = opts;
  const themeUpdates: (() => void)[] = [];
  const overhead: THREE.Object3D[] = [];
  const material = (f: Finish) => {
    const m = new THREE.MeshStandardMaterial({ color: f.light, map: f.map ?? null, roughness: f.roughness ?? 0.9, metalness: f.metalness ?? 0, side: f.side ?? THREE.FrontSide });
    track(m);
    themeUpdates.push(() => m.color.set(opts.isDark() ? f.dark : f.light));
    return m;
  };
  const add = (geometry: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, cast = true) => {
    track(geometry);
    const mesh = new THREE.Mesh(geometry, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = cast; mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };
  const slab = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, m: THREE.Material, cast = true) =>
    add(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, cast);

  const bx0 = bounds.minX - WALKWAY, bx1 = bounds.maxX + WALKWAY;
  const bz0 = bounds.minZ - WALKWAY, bz1 = bounds.maxZ + WALKWAY;
  const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2, width = bx1 - bx0, depth = bz1 - bz0;
  const gate = opts.gate ?? Math.min(10, Math.max(6, width * 0.2));   // the front entrance, centred
  const inGate = (x: number) => opts.entrance && Math.abs(x - cx) < gate / 2 + 0.2;

  /* Only the market itself: no lot, forecourt, streets or neighbourhood round it. */

  /* The raised floor: a concrete plinth and walkway, with steps at the entrance. */
  const concreteGrey = material({ light: '#bdb9b1', dark: '#4a515b', map: repeated(textures.concrete, width, depth, 6, track) });
  slab(bx0, bx1, -0.64, FLOOR_TOP - 0.02, bz0, bz1, concreteGrey);
  slab(bx0 + 0.1, bx1 - 0.1, FLOOR_TOP - 0.02, FLOOR_TOP, bz0 + 0.1, bz1 - 0.1, material({ light: '#cfcbc3', dark: '#3f4650', map: repeated(textures.concrete, width, depth, 5, track) }), false);
  if (opts.entrance) for (let i = 0; i < 3; i++) slab(cx - gate / 2 - 0.3, cx + gate / 2 + 0.3, -0.64, FLOOR_TOP - 0.15 * (i + 1), bz1, bz1 + 0.5 * (i + 1), concreteGrey);

  /* The frame: square concrete columns to the eaves, painted half-walls between. */
  const column = material({ light: '#d2cec6', dark: '#56606c', map: repeated(textures.concrete, 0.5, EAVE, 2, track) });
  const wall = material({ light: '#e8e4da', dark: '#4d5663', map: repeated(textures.concrete, 4, 1.2, 3, track), roughness: 0.85 });
  const band = material({ light: '#5d7c94', dark: '#3a5266', roughness: 0.6 });
  const spacing = (from: number, to: number) => {
    const n = Math.max(2, Math.round((to - from) / 4));
    return Array.from({ length: n + 1 }, (_, i) => from + (to - from) * (i / n));
  };
  const post = (x: number, z: number) => slab(x - 0.25, x + 0.25, FLOOR_TOP, FLOOR_TOP + EAVE, z - 0.25, z + 0.25, column);
  const xs = spacing(bx0 + 0.25, bx1 - 0.25), zs = spacing(bz0 + 0.25, bz1 - 0.25);
  for (const x of xs) { post(x, bz0 + 0.25); if (!inGate(x)) post(x, bz1 - 0.25); }
  for (const z of zs.slice(1, -1)) { post(bx0 + 0.25, z); post(bx1 - 0.25, z); }
  const halfWall = (x0: number, x1: number, z0: number, z1: number) => {
    slab(x0, x1, FLOOR_TOP, FLOOR_TOP + 1.05, z0, z1, wall);
    slab(x0, x1, FLOOR_TOP, FLOOR_TOP + 0.22, z0 - 0.01, z1 + 0.01, band, false);
  };
  halfWall(bx0 + 0.18, bx0 + 0.32, bz0 + 0.25, bz1 - 0.25);
  halfWall(bx1 - 0.32, bx1 - 0.18, bz0 + 0.25, bz1 - 0.25);
  halfWall(bx0 + 0.25, bx1 - 0.25, bz0 + 0.18, bz0 + 0.32);
  if (opts.entrance) {
    halfWall(bx0 + 0.25, cx - gate / 2 - 0.4, bz1 - 0.32, bz1 - 0.18);
    halfWall(cx + gate / 2 + 0.4, bx1 - 0.25, bz1 - 0.32, bz1 - 0.18);
  } else halfWall(bx0 + 0.25, bx1 - 0.25, bz1 - 0.32, bz1 - 0.18);

  /* The entrance: two concrete piers and a lintel carrying the painted signboard. */
  if (opts.entrance) {
    for (const side of [-1, 1]) slab(cx + side * (gate / 2 + 0.2) - 0.4, cx + side * (gate / 2 + 0.2) + 0.4, FLOOR_TOP, FLOOR_TOP + EAVE - 0.2, bz1 - 0.6, bz1 + 0.15, column);
    slab(cx - gate / 2 - 0.6, cx + gate / 2 + 0.6, FLOOR_TOP + EAVE - 1.5, FLOOR_TOP + EAVE - 0.2, bz1 - 0.5, bz1 + 0.1, column);
    const sign = signBoard(scene, opts, cx, FLOOR_TOP + EAVE - 0.85, bz1 + 0.12, gate + 0.6, 1.05);
    themeUpdates.push(sign.userData.repaint as () => void);
  }

  /* The roof: two planes of corrugated sheet meeting at a ridge along the hall's
     length, a raised vent strip over the ridge, and eave trims. */
  const overhang = 0.6;
  const ridgeAlongX = width >= depth;
  const span = (ridgeAlongX ? depth : width) / 2 + overhang;       // eave to ridge, on the ground
  const length = (ridgeAlongX ? width : depth) + overhang * 2;
  const rise = Math.tan(PITCH) * span, slope = span / Math.cos(PITCH);
  const roofFinish = { light: '#86ab9a', dark: '#3d5a50', roughness: 0.55, metalness: 0.35, side: THREE.DoubleSide };
  const eaveY = FLOOR_TOP + EAVE;
  for (const side of [-1, 1]) {
    const sheet = material({ ...roofFinish, map: repeated(textures.corrugated, length, slope, 2.2, track) });
    const g = new THREE.BoxGeometry(length, 0.07, slope);
    if (!ridgeAlongX) g.rotateY(Math.PI / 2);
    const mesh = add(g, sheet, cx, eaveY + rise / 2, cz);
    if (ridgeAlongX) { mesh.position.z = cz + side * span / 2; mesh.rotation.x = side * PITCH; }
    else { mesh.position.x = cx + side * span / 2; mesh.rotation.z = -side * PITCH; }
    overhead.push(mesh);
  }
  const ventFinish = material({ light: '#9dbcae', dark: '#4a6a5e', roughness: 0.5, metalness: 0.3, map: repeated(textures.corrugated, length, 2, 2.2, track) });
  const vent = ridgeAlongX ? new THREE.BoxGeometry(length * 0.86, 0.06, 2.2) : new THREE.BoxGeometry(2.2, 0.06, length * 0.86);
  overhead.push(add(vent, ventFinish, cx, eaveY + rise + 0.55, cz));
  const ventSide = material({ light: '#6f7a80', dark: '#2f363d', roughness: 0.6 });
  for (const side of [-1, 1]) {
    const louvre = ridgeAlongX ? new THREE.BoxGeometry(length * 0.86, 0.5, 0.05) : new THREE.BoxGeometry(0.05, 0.5, length * 0.86);
    overhead.push(add(louvre, ventSide, ridgeAlongX ? cx : cx + side * 1.05, eaveY + rise + 0.3, ridgeAlongX ? cz + side * 1.05 : cz));
  }
  const trim = material({ light: '#e3e0d8', dark: '#5a636e', roughness: 0.6 });
  for (const side of [-1, 1]) {
    const fascia = ridgeAlongX ? new THREE.BoxGeometry(length, 0.3, 0.08) : new THREE.BoxGeometry(0.08, 0.3, length);
    overhead.push(add(fascia, trim, ridgeAlongX ? cx : cx + side * span, eaveY - 0.12, ridgeAlongX ? cz + side * span : cz));
  }

  /* Under the roof: steel trusses across the hall, purlins along it, and
     fluorescent fixtures hung from the trusses. Built in a frame where x runs
     across the span and z along the ridge, then turned to fit, and merged per
     material so the whole structure is a handful of draws. */
  const halfSpan = (ridgeAlongX ? depth : width) / 2, run = ridgeAlongX ? width : depth;
  const riseIn = Math.tan(PITCH) * halfSpan;
  const steel: THREE.BufferGeometry[] = [], housings: THREE.BufferGeometry[] = [], tubes: THREE.BufferGeometry[] = [];
  const piece = (into: THREE.BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number, rz = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    into.push(g);
  };
  const strut = (x0: number, y0: number, x1: number, y1: number, z: number, t = 0.07) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    piece(steel, len, t, t, (x0 + x1) / 2, (y0 + y1) / 2, z, Math.atan2(y1 - y0, x1 - x0));
  };
  const trussCount = Math.max(2, Math.round(run / 4.5));
  const lights: THREE.Vector3[] = [];
  for (let i = 0; i <= trussCount; i++) {
    const t = -run / 2 + 0.8 + (run - 1.6) * (i / trussCount);
    piece(steel, halfSpan * 2, 0.16, 0.12, 0, eaveY - 0.08, t);                                   // bottom chord
    strut(-halfSpan, eaveY, 0, eaveY + riseIn - 0.08, t, 0.14);                                    // top chords
    strut(halfSpan, eaveY, 0, eaveY + riseIn - 0.08, t, 0.14);
    piece(steel, 0.1, riseIn, 0.1, 0, eaveY + riseIn / 2, t);                                      // king post
    for (const side of [-1, 1]) {
      piece(steel, 0.08, riseIn / 2, 0.08, side * halfSpan / 2, eaveY + riseIn / 4, t);            // web posts
      strut(side * halfSpan / 2, eaveY, 0, eaveY + riseIn * 0.55, t, 0.06);                        // diagonals
      strut(side * halfSpan, eaveY, side * halfSpan / 2, eaveY + riseIn / 2, t, 0.06);
    }
    /* Fixtures between this truss and the next, over the aisles. */
    if (i < trussCount) {
      const mid = t + (run - 1.6) / trussCount / 2;
      for (const f of [-0.62, -0.21, 0.21, 0.62]) {
        const x = f * halfSpan, y = eaveY - 0.75;
        piece(housings, 0.04, 0.68, 0.04, x, eaveY - 0.41, mid);                                  // hanger
        piece(housings, 0.22, 0.07, 1.35, x, y, mid);                                              // housing
        piece(tubes, 0.1, 0.035, 1.25, x, y - 0.05, mid);                                          // the lit tube
        if (f === -0.21 || f === 0.21) lights.push(new THREE.Vector3(x, y - 0.2, mid));
      }
    }
  }
  const purlins = 4;
  for (const side of [-1, 1]) for (let k = 1; k <= purlins; k++) {
    const x = side * halfSpan * (k / (purlins + 1));
    piece(steel, 0.09, 0.12, run, x, eaveY + Math.tan(PITCH) * (halfSpan - Math.abs(x)) - 0.12, 0);
  }
  const placeFrame = (g: THREE.BufferGeometry) => { if (ridgeAlongX) g.rotateY(-Math.PI / 2); g.translate(cx, 0, cz); return g; };
  const steelMaterial = material({ light: '#7c848c', dark: '#4b535c', roughness: 0.45, metalness: 0.6 });
  const housingMaterial = material({ light: '#e2e5e7', dark: '#9aa2ab', roughness: 0.5, metalness: 0.3 });
  const tubeMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff6e0', emissiveIntensity: 2.2, roughness: 0.3 });
  track(tubeMaterial);
  for (const [parts, m, cast] of [[steel, steelMaterial, true], [housings, housingMaterial, true], [tubes, tubeMaterial, false]] as const) {
    const g = placeFrame(mergeGeometries(parts));
    parts.forEach((p) => p.dispose());
    overhead.push(add(g, m, 0, 0, 0, cast));
  }
  /* Fixture positions in the world, for the lamps that light the hall when walking through it. */
  const lamps = lights.map((p) => {
    /* The same turn placeFrame gives the structure: rotateY(-90°) sends (x, z) to (-z, x). */
    const v = ridgeAlongX ? new THREE.Vector3(-p.z, p.y, p.x) : p.clone();
    return v.add(new THREE.Vector3(cx, 0, cz));
  });

  const applyTheme = () => themeUpdates.forEach((update) => update());
  return { overhead, applyTheme, lamps, outer: { minX: bx0, maxX: bx1, minZ: bz0, maxZ: bz1 } };
}

/* The market's name over the entrance, as a painted board would carry it. */
function signBoard(scene: THREE.Scene, opts: { isDark: () => boolean; track: Track; title: string; subtitle: string }, x: number, y: number, z: number, w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 2048; canvas.height = Math.round(2048 * h / w);
  const c = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const m = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.75 });
  opts.track(texture); opts.track(m);
  const paint = () => {
    const dark = opts.isDark();
    c.fillStyle = dark ? '#16324d' : '#1d4466';
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = 'rgba(255,255,255,0.06)';
    c.fillRect(0, 0, canvas.width, canvas.height * 0.08);
    c.fillStyle = '#f5f1e6';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `700 ${Math.round(canvas.height * 0.44)}px Inter, Arial, sans-serif`;
    c.fillText(opts.title, canvas.width / 2, canvas.height * 0.42, canvas.width - 90);
    c.font = `500 ${Math.round(canvas.height * 0.19)}px Inter, Arial, sans-serif`;
    c.fillStyle = 'rgba(245,241,230,0.85)';
    c.fillText(opts.subtitle, canvas.width / 2, canvas.height * 0.8, canvas.width - 90);
    texture.needsUpdate = true;
  };
  paint();
  const geometry = new THREE.BoxGeometry(w, h, 0.06);
  opts.track(geometry);
  const mesh = new THREE.Mesh(geometry, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.userData.repaint = paint;
  scene.add(mesh);
  return mesh;
}
