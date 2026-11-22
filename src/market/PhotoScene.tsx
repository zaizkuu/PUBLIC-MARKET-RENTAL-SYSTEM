import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PHOTO_COLORS, PHOTO_FEATURES, FACILITY_IDS, FACILITY_COLOR, FILTER_TINTS, STATUS_COLORS } from './photoLayout';
import type { PhotoView, PhotoPosition, StatusFilter } from './photoLayout';
import type { OverviewPlan } from './overviewLayout';
import { isSharedStrip, mapName } from './stallOwner';
import { WALKWAY, buildMarket, marketTextures, repeated } from './marketBuilding';
import type { FloorBounds } from './marketBuilding';

export type SceneStall = PhotoPosition & { id: string; tenant: string; section: string; status: string; note: string };
export type ColorBy = 'section' | 'status';
type Props = {
  area: PhotoView; areaName?: string; overview: OverviewPlan; stalls: SceneStall[]; selected: string; matches: Set<string>;
  statusFilter: StatusFilter; colorBy: ColorBy; focusRequest?: { id: string; n: number };
  onSelect: (id: string) => void; onShowAll?: () => void;
};
type SceneApi = {
  view: (top: boolean) => void;
  zoom: (factor: number) => void;
  focus: (id: string) => void;
  rotate: (on: boolean) => void;
  roof: (hidden: boolean) => void;
  walk: (on: boolean) => void;
  highlight: (id: string, matches: Set<string>, filter: StatusFilter, colorBy: ColorBy) => void;
};
/* What a stall's part is, so a highlight colours the right thing: the tiled
   counter body, its glossy top, or the concrete partition. */
type Role = 'body' | 'top' | 'wall';
/* Walking input held down on the on-screen pad: forward/back and turning. */
type Hold = { move: number; turn: number };

/* The sketched overview has no rooms or stairs of its own; the layout sheets do. */
const featuresFor = (area: PhotoView) => area === 'all' ? [] : PHOTO_FEATURES.filter((f) => f.area === area);
/* The tiled floor: the sketched hall for the overview, otherwise just round the stalls on show. */
const floorFor = (area: PhotoView, stalls: SceneStall[], overview: OverviewPlan): FloorBounds => area === 'all'
  ? overview.floor
  : { minX: -2.5, maxX: Math.max(...stalls.map((s) => s.x + s.w)) + 2.5, minZ: -1, maxZ: Math.max(...stalls.map((s) => s.z + s.d)) + 1 };
/* A stall's colour when no highlight is on: its section's, or its status's. */
const baseColor = (s: { id: string; status: string }, colorBy: ColorBy) => colorBy === 'status'
  ? (FACILITY_IDS.has(s.id) ? FACILITY_COLOR : STATUS_COLORS[s.status] ?? FACILITY_COLOR)
  : PHOTO_COLORS[s.id.split('-')[0]] ?? FACILITY_COLOR;
/* Section colours as glazed tile on the counters: the colour, lightened. */
const tiled = (hex: string, amount = 0.1) => '#' + new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), amount).getHexString();
const BOARD_W = 7.2;   // a section sign over the hallway

/* The overview looks in from the street, a little to the right; the top view
   looks straight down. Walking puts the camera at a person's eye height. */
const VIEW_3D = new THREE.Vector3(5, 26, 38).normalize();
const VIEW_TOP = new THREE.Vector3(0, 1, 0.0001).normalize();
const FOV = 30, WALK_FOV = 62, EYE = 1.6, WALK_SPEED = 3.4, TURN_SPEED = 1.6;
const ROOM_BELOW = 64, ROOM_ABOVE = 20;   // pixels kept clear for the control bar and the floor badge

/* What sits on an occupied counter, by section: trays, crates or baskets. */
const GOODS: Record<string, { base: string; top?: string; crate?: boolean }> = {
  FS: { base: 'steel', top: '#cfe0e6' },
  MS: { base: 'steel', top: '#b4544e' },
  CS: { base: 'steel', top: '#e6c6a2' },
  VS: { base: '#3d8a4c', top: '#6e9f3f', crate: true },
  FD: { base: '#2f69a8', top: '#e0a23a', crate: true },
  DS: { base: '#b18c5a', top: '#d9c49c' },
  KS: { base: '#4f7f36', top: '#f0e8d6' },
  PS: { base: '#b98f5e' },
};

export default function PhotoScene({ area, areaName, overview, stalls, selected, matches, statusFilter, colorBy, focusRequest, onSelect }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const callback = useRef(onSelect); callback.current = onSelect;
  const api = useRef<SceneApi>();
  const hold = useRef<Hold>({ move: 0, turn: 0 });
  const highlightState = useRef({ selected, matches, statusFilter, colorBy }); highlightState.current = { selected, matches, statusFilter, colorBy };
  const [failed, setFailed] = useState(false), [flat, setFlat] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  /* Kept across rebuilds (a new floor or section), so the view stays as the
     officer left it. The roof starts off, so the stalls under it are seen. */
  const [top, setTop] = useState(false), [rotating, setRotating] = useState(false), [roofHidden, setRoofHidden] = useState(true);
  const [walking, setWalking] = useState(false);
  const viewState = useRef({ top, rotating, roofHidden, walking }); viewState.current = { top, rotating, roofHidden, walking };

  useEffect(() => {
    const change = () => setFullscreen(document.fullscreenElement === root.current);
    document.addEventListener('fullscreenchange', change);
    return () => document.removeEventListener('fullscreenchange', change);
  }, []);

  useEffect(() => {
    const el = host.current; if (!el || flat) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch { setFailed(true); return; }
    setFailed(false);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-label', '3D view of the market. Drag to look around; select a stall to see its owner.');

    /* Drawn only when something changed — the camera moved, a stall was picked,
       the theme turned — so an idle plan costs the office computer nothing. */
    let dirty = true;
    const invalidate = () => { dirty = true; };

    const scene = new THREE.Scene();
    const isDark = () => document.documentElement.dataset.theme === 'dark';
    const resources: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = [];
    const track = (r: THREE.BufferGeometry | THREE.Material | THREE.Texture) => { resources.push(r); };
    const textures = marketTextures(track);
    const themeUpdates: (() => void)[] = [];
    const picks: THREE.Object3D[] = [];
    /* Stall numbers and section boards: hidden with the roof on from above,
       which they would otherwise show through; shown again when walking. */
    const labels: THREE.Sprite[] = [];
    let roofOn = false;
    const fills = new Map<string, THREE.MeshStandardMaterial[]>();
    const signs = new Map<string, THREE.SpriteMaterial>();
    const byId = new Map(stalls.map((s) => [s.id, s]));

    /* Reflections and soft fill from a neutral room, so tile and steel look like tile and steel. */
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = environment;

    const floor = floorFor(area, stalls, overview);
    const width = floor.maxX - floor.minX, depth = floor.maxZ - floor.minZ;
    const center = new THREE.Vector3((floor.minX + floor.maxX) / 2, 0, (floor.minZ + floor.maxZ) / 2);

    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 800);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.enableZoom = false;
    controls.maxPolarAngle = Math.PI / 2.2; controls.minPolarAngle = 0.02;
    controls.autoRotateSpeed = 0.8;
    controls.addEventListener('change', invalidate);

    /* Daylight from the open sides, a sky dome for fill, and under the roof
       the fluorescent fixtures. */
    const sky = new THREE.HemisphereLight(0xf2f4f6, 0x8a8478, 1.2);
    const sun = new THREE.DirectionalLight(0xfff3df, 2.4);
    const reach = Math.max(width, depth) / 2 + 12;
    sun.position.set(center.x - 20, 40, center.z + 26);
    sun.target.position.copy(center);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 160 });
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
    scene.add(sky, sun, sun.target);

    function part(x: number, z: number, w: number, d: number, h: number, finish: { color: string; dark?: string; map?: THREE.Texture; roughness?: number; metalness?: number }, y = h / 2, role?: Role) {
      const geometry = new THREE.BoxGeometry(w, h, d);
      const material = new THREE.MeshStandardMaterial({ color: finish.color, map: finish.map ?? null, roughness: finish.roughness ?? 0.85, metalness: finish.metalness ?? 0 });
      track(geometry); track(material);
      material.userData.lightColor = finish.color; material.userData.darkColor = finish.dark ?? finish.color; material.userData.role = role;
      if (finish.dark) themeUpdates.push(() => material.color.set(isDark() ? finish.dark! : finish.color));
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x + w / 2, y, z + d / 2);
      mesh.castShadow = true; mesh.receiveShadow = true;
      scene.add(mesh);
      return mesh;
    }
    /* `sub` is a second, smaller line under the text: the tenant on a stall's plate. */
    function label(text: string, x: number, z: number, w: number, y = 1.05, id?: string, heading = false, sub = '') {
      /* A sign's canvas has the sign's own proportions, so its lettering is not stretched. */
      const tall = sub ? 216 : 144;
      const canvas = document.createElement('canvas'); canvas.width = heading ? Math.round(144 * w * 0.96 / 1.4) : 384; canvas.height = tall;
      const c = canvas.getContext('2d')!;
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, toneMapped: false });
      track(texture); track(material);
      themeUpdates.push(() => {
        c.clearRect(0, 0, canvas.width, tall);
        if (heading) {
          /* A hanging section board: dark painted plate, white lettering. */
          c.fillStyle = isDark() ? '#13283d' : '#1e3a8a';
          c.fillRect(6, 10, canvas.width - 12, 124);
          c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(6, 10, canvas.width - 12, 8);
        } else {
          c.fillStyle = isDark() ? '#22374b' : '#fbfaf7';
          c.beginPath(); c.roundRect(2, 2, canvas.width - 4, tall - 4, 6); c.fill();
          c.strokeStyle = isDark() ? '#3d5670' : '#c9c4b8'; c.lineWidth = 4; c.stroke();
        }
        c.fillStyle = heading ? '#f5f1e6' : isDark() ? '#f0f6ff' : '#1d2b38';
        let size = heading ? 80 : 92;
        c.font = `700 ${size}px Inter, Arial, sans-serif`;
        while (heading && size > 44 && c.measureText(text).width > canvas.width - 60) { size -= 4; c.font = `700 ${size}px Inter, Arial, sans-serif`; }
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(text, canvas.width / 2, sub ? 66 : 74, canvas.width - 60);
        if (sub) {
          let small = 56;
          c.font = `600 ${small}px Inter, Arial, sans-serif`;
          while (small > 32 && c.measureText(sub).width > canvas.width - 28) { small -= 2; c.font = `600 ${small}px Inter, Arial, sans-serif`; }
          c.fillStyle = isDark() ? '#b9cde2' : '#3f5468';
          c.fillText(sub, canvas.width / 2, 160, canvas.width - 24);
        }
        texture.needsUpdate = true;
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.set(x + w / 2, y, z + 0.85);
      sprite.scale.set(w * 0.96, heading ? 1.4 : w * 0.96 * tall / 384, 1);
      sprite.renderOrder = 2;
      /* Sized for the view from above; walking, they become small plates hung over the counters. */
      sprite.userData.base = { sx: sprite.scale.x, sy: sprite.scale.y, y, kind: heading ? 'heading' : id ? 'stall' : 'feature' };
      scene.add(sprite);
      labels.push(sprite);
      if (id) { sprite.userData.id = id; picks.push(sprite); signs.set(id, material); }
    }
    /* Lettering painted on the floor. `along` runs it up the hallway, read from the entrance. */
    function decal(text: string, x: number, z: number, w: number, d: number, along: boolean) {
      const long = along ? d : w, short = along ? w : d;
      const canvas = document.createElement('canvas');
      canvas.width = 1024; canvas.height = Math.max(64, Math.round(1024 * short / long));
      const c = canvas.getContext('2d')!;
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
      const material = new THREE.MeshStandardMaterial({ map: texture, transparent: true, depthWrite: false, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
      track(texture); track(material);
      themeUpdates.push(() => {
        c.clearRect(0, 0, canvas.width, canvas.height);
        c.fillStyle = isDark() ? 'rgba(214,228,243,0.8)' : 'rgba(36,66,99,0.72)';
        let size = Math.round(canvas.height * 0.78);
        c.font = `800 ${size}px Inter, Arial, sans-serif`;
        while (size > 12 && c.measureText(text).width > canvas.width * 0.94) { size -= 4; c.font = `800 ${size}px Inter, Arial, sans-serif`; }
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(text, canvas.width / 2, canvas.height / 2);
        texture.needsUpdate = true;
      });
      /* Flat on the floor with the text's top toward the far wall; turned a quarter
         for the hallway, so it reads from the entrance inward as on the sketch. */
      const geometry = new THREE.PlaneGeometry(long, short);
      geometry.rotateX(-Math.PI / 2);
      if (along) geometry.rotateY(Math.PI / 2);
      track(geometry);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x + w / 2, 0.02, z + d / 2);
      mesh.receiveShadow = true;
      scene.add(mesh);
    }

    /* The building, sized to what is on show. */
    const floorName = area === 'upper' ? '2nd floor' : 'Ground floor';
    const market = buildMarket(scene, floor, {
      isDark, track, textures,
      title: 'TANAUAN PUBLIC MARKET',
      subtitle: area === 'all' || area === 'upper' ? `${floorName} · P. Garcia St., Tanauan, Leyte` : `${floorName} · ${areaName ?? ''}`,
      entrance: area !== 'upper',
      gate: area === 'all' ? overview.entrance.w : undefined,
    });
    themeUpdates.push(market.applyTheme);

    /* The fluorescent fixtures' light, for when the roof is on: a few lamps
       spread along the hall, without shadows so they stay cheap. */
    const lampEvery = Math.max(1, Math.ceil(market.lamps.length / 8));
    const lamps = market.lamps.filter((_, i) => i % lampEvery === 0).map((p) => {
      const lamp = new THREE.PointLight(0xfff1d6, 26, 18, 2);
      lamp.position.copy(p); lamp.visible = false;
      scene.add(lamp);
      return lamp;
    });

    /* The hall floor in glazed ceramic tile, and in the overview a slightly
       different tile under each section, as the trades are laid out. */
    const floorW = floor.maxX - floor.minX - 0.2, floorD = floor.maxZ - floor.minZ - 0.2;
    part(floor.minX + 0.1, floor.minZ + 0.1, floorW, floorD, 0.15, { color: '#ebe6dc', dark: '#5a6270', map: repeated(textures.tiles, floorW, floorD, 2.4, track), roughness: 0.32 }, -0.095);
    /* The overview as the office sketched it: each block of stalls on its own
       tile, the hallway down the middle on a blue-grey runner, and the entrance
       paved from the first stalls out to the doorway. */
    if (area === 'all') {
      for (const b of overview.blocks) part(b.x, b.z, b.w, b.d, 0.02, { color: b.tone, dark: '#4b5361', map: repeated(textures.tiles, b.w, b.d, 1.6, track), roughness: 0.3 }, 0.002);
      const { hallway: h, entrance: e, hallwayLabel: l } = overview;
      part(h.x, h.z, h.w, h.d, 0.02, { color: '#c9d6e3', dark: '#3e4c5c', map: repeated(textures.tiles, h.w, h.d, 2, track), roughness: 0.3 }, 0.004);
      const paved = e.d + WALKWAY;
      part(e.x, e.z, e.w, paved, 0.19, { color: '#ddd3c1', dark: '#4d5059', map: repeated(textures.concrete, e.w, paved, 4, track), roughness: 0.8 }, -0.083);
      const sign = Math.min(4, e.d * 0.25);
      decal('ENTRANCE', e.x + e.w * 0.15, e.z + (e.d - sign) / 2, e.w * 0.7, sign, false);
      if (l.d > 2) decal('HALLWAY', l.x, l.z, l.w, l.d, true);
    }

    /* Each stall: a tiled concrete counter with a glossy top and a steel edge,
       a concrete partition on one side, and goods on the counter when it is
       let. The steel, goods and the soft shadow under each counter are merged
       across all stalls, so they cost a few draws however many stalls there are. */
    const steelEdges: THREE.BufferGeometry[] = [], shadows: THREE.BufferGeometry[] = [];
    const goods = new Map<string, THREE.BufferGeometry[]>();
    const put = (key: string, w: number, h: number, d: number, x: number, y: number, z: number) => {
      const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z);
      (goods.get(key) ?? goods.set(key, []).get(key)!).push(g);
    };
    for (const s of stalls) {
      const code = s.id.split('-')[0];
      const color = tiled(PHOTO_COLORS[code] ?? '#8296aa');
      const shared = isSharedStrip(s);
      const cx = s.x + s.w / 2, cz = s.z + s.d / 2;
      const body = part(s.x, s.z, s.w, s.d, shared ? 0.2 : 0.82, { color, map: repeated(textures.tiles, s.w, 0.8, 0.45, track), roughness: 0.35 }, undefined, 'body');
      body.userData.id = s.id; picks.push(body);
      const parts = [body.material as THREE.MeshStandardMaterial];
      const shadow = new THREE.PlaneGeometry(s.w + 0.55, s.d + 0.55); shadow.rotateX(-Math.PI / 2); shadow.translate(cx, 0.016, cz); shadows.push(shadow);
      if (!shared) {
        const vacant = s.status === 'Available';
        const topPart = part(s.x + 0.03, s.z + 0.03, s.w - 0.06, s.d - 0.06, 0.05, { color: vacant ? '#d9dcdd' : '#f6f4ef', dark: vacant ? '#59646f' : '#c9cdd2', map: repeated(textures.tiles, s.w, s.d, 0.6, track), roughness: 0.18 }, 0.845, 'top');
        const wall = part(s.x, s.z, 0.07, s.d, 1.5, { color: '#d4d0c8', dark: '#5b6470', map: repeated(textures.concrete, s.d, 1.5, 1.6, track) }, undefined, 'wall');
        parts.push(topPart.material as THREE.MeshStandardMaterial, wall.material as THREE.MeshStandardMaterial);
        /* The steel edge runs along the counter's open front. */
        const edge = new THREE.BoxGeometry(s.w - 0.02, 0.035, 0.035); edge.translate(cx, 0.86, s.face === -1 ? s.z + 0.02 : s.z + s.d - 0.02); steelEdges.push(edge);
        const kind = GOODS[code];
        if (kind && !vacant && s.status === 'Occupied') {
          const tw = Math.max(0.5, s.w - 0.5), td = Math.max(0.5, s.d * 0.55), ty = 0.87;
          if (kind.crate) {
            for (const side of [-1, 1]) {
              put(kind.base, tw / 2 - 0.08, 0.26, td, cx + side * (tw / 4), ty + 0.13, cz);
              if (kind.top) put(kind.top, tw / 2 - 0.16, 0.06, td - 0.08, cx + side * (tw / 4), ty + 0.27, cz);
            }
          } else {
            put(kind.base, tw, 0.05, td, cx, ty + 0.025, cz);
            if (kind.top) put(kind.top, tw - 0.12, 0.05, td - 0.12, cx, ty + 0.07, cz);
          }
        }
      }
      fills.set(s.id, parts);
      label(s.id, s.x, s.z, s.w, shared ? 0.6 : 1.25, s.id, false, mapName(s));
    }
    const steelMaterial = new THREE.MeshStandardMaterial({ color: '#c9ced3', metalness: 0.9, roughness: 0.28 });
    track(steelMaterial);
    const mergedMesh = (parts: THREE.BufferGeometry[], material: THREE.Material, cast = true) => {
      if (!parts.length) return null;
      const g = mergeGeometries(parts); parts.forEach((p) => p.dispose()); track(g);
      const mesh = new THREE.Mesh(g, material); mesh.castShadow = cast; mesh.receiveShadow = true; scene.add(mesh);
      return mesh;
    };
    mergedMesh(steelEdges, steelMaterial);
    /* A soft dark patch where each counter meets the floor, as a room's own shading would give it. */
    const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 128;
    const sc = shadowCanvas.getContext('2d')!;
    sc.filter = 'blur(10px)'; sc.fillStyle = '#000'; sc.fillRect(26, 26, 76, 76);
    const shadowTexture = new THREE.CanvasTexture(shadowCanvas); track(shadowTexture);
    const shadowMaterial = new THREE.MeshBasicMaterial({ map: shadowTexture, color: '#000000', transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false });
    track(shadowMaterial);
    const contactShadows = mergedMesh(shadows, shadowMaterial, false);
    if (contactShadows) { contactShadows.receiveShadow = false; contactShadows.renderOrder = 1; }
    const goodsMeshes: THREE.Mesh[] = [];
    goods.forEach((parts, key) => {
      const m = key === 'steel' ? steelMaterial : new THREE.MeshStandardMaterial({ color: key, roughness: 0.6 });
      if (m !== steelMaterial) track(m);
      const mesh = mergedMesh(parts, m); if (mesh) goodsMeshes.push(mesh);
    });

    for (const f of featuresFor(area)) {
      part(f.x, f.z, f.w, f.d, 2.2, { color: '#d9d5cc', dark: '#4e5764', map: repeated(textures.concrete, f.w, 2.2, 2, track) }, 1.1);
      label(f.label, f.x, f.z, f.w, 2.5);
    }
    /* Section signs hung over the hallway, as the sketch names the blocks. */
    if (area === 'all') for (const b of overview.boards) label(b.text, b.x - BOARD_W / 2, b.z - 0.85, BOARD_W, 2.6, undefined, true);

    const applyTheme = () => {
      scene.background = new THREE.Color(isDark() ? '#141c26' : '#e4e7ea');
      scene.environmentIntensity = isDark() ? 0.25 : 0.4;
      sky.intensity = isDark() ? 0.6 : 0.95; sun.intensity = isDark() ? 1.2 : 2.6;
      themeUpdates.forEach((update) => update());
      const h = highlightState.current;
      api.current?.highlight(h.selected, h.matches, h.statusFilter, h.colorBy);
      invalidate();
    };

    /* ---------- Walking ---------- */
    const outer = market.outer;
    const walk = { on: false, yaw: 0, pitch: -0.06, keys: new Set<string>() };
    const look = () => {
      const dir = new THREE.Vector3(-Math.sin(walk.yaw) * Math.cos(walk.pitch), Math.sin(walk.pitch), -Math.cos(walk.yaw) * Math.cos(walk.pitch));
      camera.lookAt(camera.position.clone().add(dir));
      invalidate();
    };
    const keepInside = () => {
      camera.position.x = THREE.MathUtils.clamp(camera.position.x, outer.minX + 0.7, outer.maxX - 0.7);
      camera.position.z = THREE.MathUtils.clamp(camera.position.z, outer.minZ + 0.7, outer.maxZ + 3.5);
      camera.position.y = EYE;
    };
    let dragging = false, lastX = 0, lastY = 0;
    const lookStart = (e: PointerEvent) => { if (!walk.on) return; dragging = true; lastX = e.clientX; lastY = e.clientY; };
    const lookMove = (e: PointerEvent) => {
      if (!walk.on || !dragging) return;
      walk.yaw -= (e.clientX - lastX) * 0.0045;
      walk.pitch = THREE.MathUtils.clamp(walk.pitch - (e.clientY - lastY) * 0.0035, -1.1, 0.9);
      lastX = e.clientX; lastY = e.clientY; look();
    };
    const lookEnd = () => { dragging = false; };
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const keyDown = (e: KeyboardEvent) => {
      if (!walk.on || typing(e.target)) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { walk.keys.add(k); e.preventDefault(); }
    };
    const keyUp = (e: KeyboardEvent) => { walk.keys.delete(e.key.toLowerCase()); };
    renderer.domElement.addEventListener('pointerdown', lookStart);
    window.addEventListener('pointermove', lookMove);
    window.addEventListener('pointerup', lookEnd);
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);

    /* Picking: a click that did not drag selects the stall under it. */
    const ray = new THREE.Raycaster(), pointer = new THREE.Vector2(); let downX = 0, downY = 0;
    const down = (e: PointerEvent) => { downX = e.clientX; downY = e.clientY; };
    const up = (e: PointerEvent) => {
      /* With the roof on from above, the stalls cannot be seen, so a click picks nothing. */
      if ((roofOn && !walk.on) || e.button !== 0 || Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;
      const r = renderer.domElement.getBoundingClientRect();
      pointer.set((e.clientX - r.left) / r.width * 2 - 1, 1 - (e.clientY - r.top) / r.height * 2);
      ray.setFromCamera(pointer, camera);
      const hit = ray.intersectObjects(picks)[0];
      if (hit) callback.current(String(hit.object.userData.id));
    };
    const lost = (e: Event) => { e.preventDefault(); setFailed(true); };
    renderer.domElement.addEventListener('pointerdown', down);
    renderer.domElement.addEventListener('pointerup', up);
    renderer.domElement.addEventListener('webglcontextlost', lost);

    /* The view keeps clear space below for the control bar and above for the
       floor badge, by rendering a window into a slightly taller picture. */
    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
      camera.aspect = w / h;
      const lift = ROOM_BELOW - ROOM_ABOVE;
      camera.setViewOffset(w, h + lift, 0, lift, w, h);
      camera.updateProjectionMatrix(); renderer.setSize(w, h); invalidate();
    };
    /* Stand far enough back, along `dir`, that the whole building — steps and
       all — fits between the badge and the control bar. */
    const frame = { minX: outer.minX + 0.3, maxX: outer.maxX - 0.3, minZ: outer.minZ + 0.3, maxZ: outer.maxZ + 1.6 };
    const fit = (dir: THREE.Vector3) => {
      const w = el.clientWidth || 800, h = el.clientHeight || 500;
      const usable = Math.max(120, h - ROOM_BELOW - ROOM_ABOVE);
      const tanV = Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * usable / h, tanH = tanV * w / usable;
      const forward = dir.clone().negate();
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
      const upward = new THREE.Vector3().crossVectors(right, forward).normalize();
      let distance = 10;
      /* From the plinth's foot to the tops of the columns: framed closely, so the market fills the view. */
      for (const x of [frame.minX, frame.maxX]) for (const y of [-0.5, 4.1]) for (const z of [frame.minZ, frame.maxZ]) {
        const v = new THREE.Vector3(x, y, z).sub(center);
        const along = v.dot(dir);
        distance = Math.max(distance, along + Math.abs(v.dot(right)) / tanH, along + Math.abs(v.dot(upward)) / tanV);
      }
      return distance;
    };
    const showOverhead = () => {
      const on = roofOn || walk.on;
      market.overhead.forEach((o) => { o.visible = on; });
      lamps.forEach((l) => { l.visible = on; });
      labels.forEach((l) => {
        l.visible = !roofOn || walk.on;
        const base = l.userData.base as { sx: number; sy: number; y: number; kind: string };
        const shrink = walk.on ? (base.kind === 'heading' ? 0.5 : base.kind === 'feature' ? 0.45 : 0.42) : 1;
        l.scale.set(base.sx * shrink, base.sy * shrink, 1);
        l.position.y = walk.on ? (base.kind === 'heading' ? 3.4 : base.kind === 'feature' ? 2.5 : 1.85) : base.y;
      });
      scene.fog = walk.on ? new THREE.Fog(scene.background as THREE.Color, 30, 110) : null;
      invalidate();
      invalidate();
    };

    api.current = {
      view: (topDown) => {
        if (walk.on) return;
        const dir = topDown ? VIEW_TOP : VIEW_3D;
        controls.target.copy(center);
        camera.position.copy(center).addScaledVector(dir, fit(dir));
        camera.zoom = 1; camera.updateProjectionMatrix(); controls.update(); invalidate();
      },
      zoom: (factor) => { camera.zoom = THREE.MathUtils.clamp(camera.zoom * factor, 0.7, walk.on ? 3 : 7); camera.updateProjectionMatrix(); invalidate(); },
      focus: (id) => {
        const s = stalls.find((x) => x.id === id); if (!s) return;
        if (walk.on) {
          /* Stand in the aisle in front of the stall, looking at it. */
          const away = s.face === -1;
          camera.position.set(s.x + s.w / 2, EYE, s.z + s.d / 2 + (away ? -2.4 : 2.4)); keepInside();
          walk.yaw = away ? Math.PI : 0; walk.pitch = -0.32; camera.zoom = 1; camera.updateProjectionMatrix(); look();
          return;
        }
        const target = new THREE.Vector3(s.x + s.w / 2, 0, s.z + s.d / 2);
        camera.position.add(target.clone().sub(controls.target)); controls.target.copy(target);
        camera.zoom = el.clientWidth < 600 ? 3.5 : 2.6; camera.updateProjectionMatrix(); controls.update(); invalidate();
      },
      rotate: (on) => { controls.autoRotate = on && !walk.on; invalidate(); },
      roof: (hidden) => { roofOn = !hidden; showOverhead(); },
      walk: (on) => {
        walk.on = on; walk.keys.clear();
        controls.enabled = !on; controls.autoRotate = false;
        camera.fov = on ? WALK_FOV : FOV; camera.zoom = 1;
        if (on) {
          /* Step in at the entrance (or the middle of the far side upstairs), facing into the hall. */
          camera.position.set(center.x, EYE, (area === 'upper' ? outer.maxZ - 1.2 : outer.maxZ + 2.6));
          walk.yaw = 0; walk.pitch = -0.05;
          camera.updateProjectionMatrix(); look();
        } else {
          camera.updateProjectionMatrix();
          api.current?.view(viewState.current.top);
        }
        showOverhead();
      },
      highlight: (id, matching, filter, mode) => {
        const tint = filter ? FILTER_TINTS[filter] : '';
        fills.forEach((parts, key) => parts.forEach((m) => {
          const match = matching.has(key); const active = key === id; const stall = byId.get(key);
          const role = m.userData.role as Role;
          const own = isDark() ? m.userData.darkColor : m.userData.lightColor;
          /* A highlight colours the counter; tops and partitions stay as built. */
          if (filter) m.color.set(role === 'body' ? (match ? tint : '#8c949b') : own);
          else if (mode === 'status' && stall && role === 'body') m.color.set(tiled(baseColor(stall, 'status'), 0.18));
          else m.color.set(own);
          m.emissive.set(active ? '#e8b12a' : filter && match && role === 'body' ? tint : '#000000');
          m.emissiveIntensity = active ? 0.5 : filter && match ? 0.16 : 0;
          m.transparent = true; m.opacity = match ? 1 : 0.2; m.depthWrite = match;
        }));
        /* Goods would float over faded counters, so they step aside during a highlight. */
        goodsMeshes.forEach((g) => { g.visible = !filter; });
        signs.forEach((m, key) => {
          m.color.set(key === id ? '#ffd66b' : filter && matching.has(key) ? filter === 'Available' ? '#b4ffdc' : filter === 'Inactive' ? '#ffe2b0' : '#bfddff' : '#ffffff');
          m.opacity = matching.has(key) ? 1 : 0.22;
        });
        invalidate();
      },
    };
    applyTheme();
    const themeObserver = new MutationObserver(applyTheme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    resize();
    const v = viewState.current;
    api.current.view(v.top); api.current.rotate(v.rotating); api.current.roof(v.roofHidden);
    if (v.walking) api.current.walk(true);
    const observer = new ResizeObserver(resize); observer.observe(el);
    let visible = true;
    const intersection = new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; if (visible) invalidate(); });
    intersection.observe(el);
    const clock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
      const dt = Math.min(clock.getDelta(), 0.05);
      if (!visible || document.hidden) return;
      if (walk.on) {
        const k = walk.keys;
        const move = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0) + hold.current.move;
        const strafe = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0);
        const turn = (k.has('arrowleft') ? 1 : 0) - (k.has('arrowright') ? 1 : 0) + hold.current.turn;
        if (move || strafe || turn) {
          walk.yaw += turn * TURN_SPEED * dt;
          const fx = -Math.sin(walk.yaw), fz = -Math.cos(walk.yaw);
          camera.position.x += (fx * Math.sign(move) + Math.cos(walk.yaw) * strafe) * WALK_SPEED * dt;
          camera.position.z += (fz * Math.sign(move) - Math.sin(walk.yaw) * strafe) * WALK_SPEED * dt;
          keepInside(); look();
        }
      } else controls.update();
      if (dirty) { dirty = false; renderer.render(scene, camera); }
    });
    return () => {
      themeObserver.disconnect(); observer.disconnect(); intersection.disconnect();
      window.removeEventListener('pointermove', lookMove); window.removeEventListener('pointerup', lookEnd);
      window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp);
      renderer.setAnimationLoop(null); controls.dispose();
      resources.forEach((r) => r.dispose()); environment.dispose(); pmrem.dispose(); renderer.dispose(); renderer.domElement.remove();
      api.current = undefined;
    };
  }, [area, areaName, overview, stalls, flat]);

  useEffect(() => { api.current?.highlight(selected, matches, statusFilter, colorBy); }, [selected, matches, statusFilter, colorBy, area, stalls, flat]);
  /* A stall picked from search: take the camera to it once the scene for its floor is built. */
  useEffect(() => { if (focusRequest && !flat) api.current?.focus(focusRequest.id); }, [focusRequest, flat]);
  useEffect(() => { api.current?.rotate(rotating); }, [rotating]);
  useEffect(() => { api.current?.roof(roofHidden); }, [roofHidden]);
  useEffect(() => { api.current?.walk(walking); }, [walking]);

  /* The 2D plan shows the whole building for the overview, otherwise the stalls on show. */
  const plan = floorFor(area, stalls, overview);
  const box = area === 'all'
    ? [plan.minX - WALKWAY - 0.5, plan.minZ - WALKWAY - 0.5, plan.maxX - plan.minX + 2 * WALKWAY + 1, plan.maxZ - plan.minZ + 2 * WALKWAY + 1]
    : [-3, -1, plan.maxX + 3.5, plan.maxZ + 1];
  const live = !flat && !failed;
  const floorTitle = area === 'upper' ? '2nd Floor' : 'Ground Floor';
  const toggleFull = async () => { try { if (fullscreen) await document.exitFullscreen(); else await root.current?.requestFullscreen(); } catch { /* Some embedded windows do not allow fullscreen. */ } };
  /* The on-screen pad: held down, it walks or turns until let go. */
  const pad = (key: keyof Hold, value: number) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => { e.currentTarget.setPointerCapture(e.pointerId); hold.current[key] = value; },
    onPointerUp: () => { hold.current[key] = 0; },
    onPointerCancel: () => { hold.current[key] = 0; },
    onLostPointerCapture: () => { hold.current[key] = 0; },
  });

  return <div className={`photo-scene${area === 'all' ? ' photo-overview' : ''}${walking ? ' is-walking' : ''}`} ref={root}>
    <div className="photo-viewport">
      <div className="photo-canvas" ref={host} hidden={flat || failed} />
      {(flat || failed) && <svg className="photo-flat" viewBox={box.join(' ')} aria-label={area === 'all' ? 'Interactive plan of the ground floor as sketched by the market office' : 'Interactive photographed stall arrangement'}>
        {area === 'all' && (() => {
          const { entrance: e, hallway: h, hallwayLabel: l } = overview;
          const x0 = plan.minX - WALKWAY, x1 = plan.maxX + WALKWAY, z0 = plan.minZ - WALKWAY, z1 = plan.maxZ + WALKWAY;
          return <g aria-hidden="true">
            <rect x={x0} y={z0} width={x1 - x0} height={z1 - z0} fill="#eef0f1" />
            {overview.blocks.map((b) => <rect key={`${b.key}-${b.side}`} x={b.x} y={b.z} width={b.w} height={b.d} rx=".3" fill={b.tone} stroke="#c58f8a" strokeWidth=".12" />)}
            <rect x={h.x} y={h.z} width={h.w} height={h.d} fill="#d3dfeb" stroke="#7d9cc0" strokeWidth=".12" />
            <rect x={e.x} y={e.z} width={e.w} height={e.d + WALKWAY} fill="#ece2cf" stroke="#c58f8a" strokeWidth=".12" />
            {/* The walls, open at the entrance. */}
            <path d={`M${e.x} ${z1}H${x0}V${z0}H${x1}V${z1}H${e.x + e.w}`} fill="none" stroke="#8a99a8" strokeWidth=".3" />
            <text x={e.x + e.w / 2} y={e.z + e.d / 2} textAnchor="middle" dominantBaseline="middle" fontSize="1.6" fontWeight="800" fill="#33506f">ENTRANCE</text>
            {l.d > 2 && <text transform={`translate(${l.x + l.w / 2} ${l.z + l.d / 2}) rotate(-90)`} textAnchor="middle" dominantBaseline="middle" fontSize="1.4" fontWeight="800" fill="#33506f">HALLWAY</text>}
            {overview.boards.map((b) => <text key={b.text} x={b.x} y={b.z} textAnchor="middle" dominantBaseline="middle" fontSize="1" fontWeight="800" fill="#1e3a8a">{b.text}</text>)}
          </g>;
        })()}
        {featuresFor(area).map((f) => <g key={f.label}><rect x={f.x} y={f.z} width={f.w} height={f.d} fill="#bccad5" /><text x={f.x + f.w / 2} y={f.z + f.d / 2} textAnchor="middle" fontSize=".32">{f.label}</text></g>)}
        {stalls.map((s) => <g key={s.id} role="button" tabIndex={0} aria-label={`${s.id}, ${s.tenant}`} aria-pressed={selected === s.id} onClick={() => onSelect(s.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(s.id); } }} opacity={matches.has(s.id) ? 1 : 0.3}>
          <rect x={s.x} y={s.z} width={s.w} height={s.d} rx=".12" fill={statusFilter ? (matches.has(s.id) ? FILTER_TINTS[statusFilter] : '#87939e') : baseColor(s, colorBy)} stroke={selected === s.id ? '#142d49' : 'white'} strokeWidth={selected === s.id ? 0.12 : 0.035} />
          <text x={s.x + s.w / 2} y={s.z + 0.72} textAnchor="middle" fontSize=".32" fill="#142d49" fontWeight="700">{s.id}</text>
          <text x={s.x + s.w / 2} y={s.z + 1.18} textAnchor="middle" fontSize=".2" fill="#142d49" fontWeight="600" textLength={mapName(s).length > 12 ? s.w - 0.2 : undefined} lengthAdjust="spacingAndGlyphs">{mapName(s)}</text>
        </g>)}
      </svg>}

      {/* Which floor is on show, in the corner of the plan. */}
      <div className="photo-floor-badge" aria-hidden="true">
        <span className="material-symbols-outlined">{walking ? 'directions_walk' : area === 'upper' ? 'layers' : 'storefront'}</span>
        <span><strong>{floorTitle}</strong><small>{walking ? 'Walking inside' : area === 'all' || area === 'upper' ? 'Market stalls' : areaName}</small></span>
      </div>
      {live && <p className="photo-hint" aria-hidden="true">{walking ? 'Drag to look around · W / S to walk · A / D to step · ← → to turn' : 'Drag to rotate · Right-drag to pan'}</p>}
      {failed && !flat && <p className="photo-fallback-note" role="status">3D is unavailable on this computer, so the 2D plan is shown.</p>}

      {walking && live && <div className="photo-walk-pad" role="group" aria-label="Walk">
        <button type="button" className="up" aria-label="Walk forward" {...pad('move', 1)}><span className="material-symbols-outlined" aria-hidden="true">keyboard_arrow_up</span></button>
        <button type="button" className="left" aria-label="Turn left" {...pad('turn', 1)}><span className="material-symbols-outlined" aria-hidden="true">rotate_left</span></button>
        <button type="button" className="right" aria-label="Turn right" {...pad('turn', -1)}><span className="material-symbols-outlined" aria-hidden="true">rotate_right</span></button>
        <button type="button" className="down" aria-label="Walk back" {...pad('move', -1)}><span className="material-symbols-outlined" aria-hidden="true">keyboard_arrow_down</span></button>
      </div>}

      <div className="photo-controls" role="toolbar" aria-label="Floor plan controls">
        {!walking && <button type="button" aria-pressed={rotating} disabled={!live} onClick={() => setRotating((r) => !r)}><span className="material-symbols-outlined" aria-hidden="true">360</span>Rotate</button>}
        <button type="button" aria-label="Zoom in" title="Zoom in" disabled={!live} onClick={() => api.current?.zoom(1.3)}><span className="material-symbols-outlined" aria-hidden="true">zoom_in</span></button>
        <button type="button" aria-label="Zoom out" title="Zoom out" disabled={!live} onClick={() => api.current?.zoom(1 / 1.3)}><span className="material-symbols-outlined" aria-hidden="true">zoom_out</span></button>
        {!walking && <button type="button" disabled={!live} onClick={() => { const next = !top; setTop(next); setRotating(false); api.current?.view(next); }}>
          <span className="material-symbols-outlined" aria-hidden="true">{top ? 'view_in_ar' : 'map'}</span>{top ? '3D view' : 'Top view'}
        </button>}
        <button type="button" aria-pressed={walking} disabled={!live} onClick={() => { setRotating(false); setWalking((v) => !v); }}>
          <span className="material-symbols-outlined" aria-hidden="true">{walking ? 'logout' : 'directions_walk'}</span>{walking ? 'Exit walk' : 'Walk inside'}
        </button>
        {!walking && <button type="button" aria-pressed={flat} onClick={() => setFlat((v) => !v)}><span className="material-symbols-outlined" aria-hidden="true">grid_on</span>2D plan</button>}
        {!walking && <button type="button" aria-pressed={!roofHidden} disabled={!live} onClick={() => setRoofHidden((h) => !h)}><span className="material-symbols-outlined" aria-hidden="true">roofing</span>{roofHidden ? 'Show roof' : 'Hide roof'}</button>}
        {selected && live && <button type="button" onClick={() => api.current?.focus(selected)}><span className="material-symbols-outlined" aria-hidden="true">center_focus_strong</span>Go to {selected}</button>}
        <button type="button" onClick={toggleFull}><span className="material-symbols-outlined" aria-hidden="true">{fullscreen ? 'fullscreen_exit' : 'fullscreen'}</span>{fullscreen ? 'Exit full screen' : 'Full screen'}</button>
      </div>
    </div>
  </div>;
}
