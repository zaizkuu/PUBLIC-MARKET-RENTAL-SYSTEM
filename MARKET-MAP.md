# Interactive Tanauan Public Market map

The dashboard now starts with the uploaded aerial reference. Select the highlighted building or **Explore Inside Market** to open a vector indoor plan. The four bands follow the supplied sketch: Fish & Meat, Fruit & Vegetables, Kakanin, Watson.

The aerial is a user-supplied reference image, not a live tile service or a georeferenced survey. The building outline is approximate. No coordinates, stall counts, dimensions, public entrances, pharmacy identity or vendor assignments have been fabricated. The sketch units are explicitly unassigned. Kakanin and Watson remain unsubdivided until verified.

## Run

Tested with Node 22.20.0 (native `node:sqlite`; Node may print an experimental SQLite notice).

```powershell
npm install
npm run dev -- --host 127.0.0.1
```

Open http://127.0.0.1:5173/. Vite hosts the UI and same-origin map API together. No extra server or external mapping keys are needed.

For a production web build:

```powershell
npm run build
npm run map:start
```

Stop the development server before starting the production server on the same port. `npm run preview` also enables the map API. Map administration is a localhost web feature; the existing Electron `file://` shell can show the reference plan but does not host this new HTTP API. Run the web server for editing/publishing. This is not an internet deployment; authentication protects map endpoints, not the legacy rental system's existing screens.

## Directory, privacy and publishing

- On an initial plan, the directory can show existing office stall IDs, sections and statuses, supplied by `App.tsx`. Vendor names and contacts are not copied into it.
- Select **Map administrator**. On first run, create a local administrator account (3–40 character username, password at least 12 characters). There are no default credentials. Later sessions require sign-in.
- In the editor, **Import existing stall IDs and statuses** adds missing office records and refreshes their imported section/status. It never copies private vendor details. Map publication is separate from the rental records; after subsequent office updates, import and publish again.
- Select a sketch unit, assign a real directory record, and edit approved business, product and vendor information. Drag units to move them; drag the blue lower-right handle or use X/Y/W/H fields to resize. Coordinates are abstract reference units.
- Status is separate from section color: each unit includes a status dot and status text. Available units also have patterned borders. Unassigned units use dashed outlines and carry no occupancy claim.
- Vendor names and contact details require explicit publication checkboxes. Public API responses strip unapproved fields. Hidden records and units are omitted. Search never includes private names or contacts.
- Save a draft, preview it, then publish. Saving alone never changes the public plan. Published layouts are immutable version snapshots; the editable draft has optimistic concurrency checks. Publishing updates the local public view and notifies other tabs. Reload a conflicting draft before retrying.
- The stall code is the actual directory record ID, entered by the administrator. Section code prefixes are editable; no automatic official numbering is assumed.

## Entrances and safe routing

The seed has proposed central aisle points and an unverified possible access point. Production directions are **disabled by default**. In **Entrances and walkable graph**, an administrator can edit waypoint coordinates, label entrances, connect waypoint IDs, and confirm on-site verification. Only then enable verified routing and publish.

Dijkstra runs on the verified aisle graph. Destination access joins the nearest unobstructed aisle point. Both graph edges and destination connectors are checked against every stall rectangle. Routes through stalls are rejected; disconnected destinations show an error. Never verify the seed without an on-site survey. Measurements and estimated travel times are intentionally absent.

## Storage and API

The map API stores `.market-data/map.sqlite` in SQLite WAL mode. This file contains map accounts, directory records, vendors and draft/published geometry; it is separate from the rental application's existing SQLite/localStorage records. The folder is ignored by Git. Back up this database separately when moving map settings to another machine; close the server before copying it or copy all WAL sidecars as well. Existing rental backups do not include map accounts or layouts.

Schema migration 1 runs automatically on first start, preserving existing map data. The relational tables cover users, market, sections, stalls, vendors, assignments, categories/products, version snapshots, and walkway nodes/edges. The reference seed is `src/market/seed.json`. Private drafts remain on the server.

Public endpoints: `GET /api/market/public`, `GET /api/market/session`.

Administrator endpoints: `POST /api/market/setup` (once), `POST /api/market/login`, `POST /api/market/logout`, `GET /api/market/draft`, `POST /api/market/draft`, `POST /api/market/publish`.

Passwords use salted scrypt hashes. Sessions are server-side and expire after eight hours; the cookie is HttpOnly and SameSite=Strict. Mutations require same-origin requests and a session CSRF token. Sign-in attempts are rate limited. The API validates geometry, containment, duplicate assignments, record fields, aisle collisions, version conflicts and administrative role before accepting changes. It binds to the local host and is not configured for shared public hosting.

The optional business images/logos and a public internet deployment with managed accounts/live licensed satellite tiles are not configured. The reference image remains available offline.

## Verification

```powershell
npm run test:map
node tests/market-browser.mjs
npm run build
```

The browser test expects the dev server on port 5173 and Edge at the usual Windows path. Set `MARKET_TEST_BROWSER` to another compatible installed browser executable if needed. It proxies the running UI into an isolated in-memory API, creates a test account there, and tests publication without changing your map database. Screenshots are written to the Windows temporary folder.

Unit/API tests cover geometry validation, public privacy, draft isolation, authentication, CSRF/origin rejection, stale revisions, publication and graph routing. Browser checks cover aerial entry, section geometry, existing-record search, stall details, administrator setup/import/save/publish, and narrow layouts.