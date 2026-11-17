import { publicLayout, validateLayout } from './domain.mjs';
import seed from './seed.json';
import type { Layout, Session } from './types';

const PUBLIC_CACHE_KEY = 'tanauan-market-public-layout-v1';
const SERVICE_TIMEOUT_MS = 5000;
const offlineSession = (): Session => ({ authenticated: false, setupRequired: false });
const isDesktopFile = () => typeof window !== 'undefined' && window.location.protocol === 'file:';

export type AvailableMap = {
 layout: Layout;
 session: Session;
 administrationAvailable: boolean;
 source: 'published' | 'cached' | 'bundled';
};

// Cache only the public projection, never drafts, credentials, or session state.
function safePublicLayout(value: unknown): Layout {
 if (validateLayout(value).length) throw new Error('The saved floor plan is invalid.');
 const layout = value as Layout;
 if (!Number.isInteger(layout.revision) || layout.revision < 0 ||
     typeof layout.market.aerial !== 'string' ||
     (layout.directoryManaged !== undefined && typeof layout.directoryManaged !== 'boolean') ||
     (layout.obstacles !== undefined && (!Array.isArray(layout.obstacles) || layout.obstacles.length > 1000 ||
      layout.obstacles.some(rect => !rect || !['x', 'y', 'w', 'h'].every(key => Number.isFinite(rect[key as keyof typeof rect])) || rect.w <= 0 || rect.h <= 0)))) {
  throw new Error('The saved floor plan is invalid.');
 }
 const projected = publicLayout(layout);
 // A public response may have no visible records but still own the directory.
 projected.directoryManaged = layout.directoryManaged === true || projected.directoryManaged;
 // Retain anonymous obstacles from hidden stalls without exposing their records.
 if (layout.obstacles) projected.obstacles = layout.obstacles.map(({ x, y, w, h }) => ({ x, y, w, h }));
 return projected;
}

function cachedLayout(): Layout | null {
 try {
  const saved = window.localStorage.getItem(PUBLIC_CACHE_KEY);
  if (!saved) return null;
  const cache = JSON.parse(saved) as { version?: number; layout?: unknown };
  return cache?.version === 1 ? safePublicLayout(cache.layout) : null;
 } catch {
  return null;
 }
}

function fallbackMap(): Pick<AvailableMap, 'layout' | 'source'> {
 const cached = cachedLayout();
 if (cached) return { layout: cached, source: 'cached' };
 const layout = safePublicLayout(seed);
 // The bundled reference leaves the rental system's local directory in charge.
 delete layout.directoryManaged;
 return { layout, source: 'bundled' };
}

export async function mapRequest<T>(path: string, options: { method?: string; body?: unknown; csrf?: string; signal?: AbortSignal } = {}): Promise<T> {
 if (isDesktopFile()) throw new Error('Map administration is unavailable in this desktop session.');
 const response = await fetch(`./api/market/${path}`, {
  method: options.method ?? 'GET', credentials: 'same-origin', signal: options.signal,
  headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.csrf ? { 'X-Map-CSRF': options.csrf } : {}) },
  body: options.body ? JSON.stringify(options.body) : undefined,
 });
 const data = await response.json().catch(() => ({ error: 'The map service is unavailable. Run the app with npm run dev or npm run map:start.' }));
 if (!response.ok) throw new Error(data.error ?? 'The request failed.');
 return data as T;
}

export async function getPublished(): Promise<{ layout: Layout; publishedAt: string }> {
 const result = await mapRequest<{ layout: Layout; publishedAt: string }>('public', { signal: AbortSignal.timeout(SERVICE_TIMEOUT_MS) });
 const layout = safePublicLayout(result.layout);
 try {
  window.localStorage.setItem(PUBLIC_CACHE_KEY, JSON.stringify({ version: 1, layout }));
 } catch {
  // A blocked or full storage area must not prevent opening the floor plan.
 }
 return { ...result, layout };
}

export async function getSession(): Promise<Session> {
 const session = await mapRequest<Session>('session', { signal: AbortSignal.timeout(SERVICE_TIMEOUT_MS) });
 if (!session || typeof session.authenticated !== 'boolean' || typeof session.setupRequired !== 'boolean') {
  throw new Error('The map session service is unavailable.');
 }
 return session;
}

export async function loadAvailableMap(): Promise<AvailableMap> {
 if (isDesktopFile()) return { ...fallbackMap(), session: offlineSession(), administrationAvailable: false };
 const [published, auth] = await Promise.allSettled([getPublished(), getSession()]);
 return {
  ...(published.status === 'fulfilled' ? { layout: published.value.layout, source: 'published' as const } : fallbackMap()),
  session: auth.status === 'fulfilled' ? auth.value : offlineSession(),
  administrationAvailable: auth.status === 'fulfilled',
 };
}
