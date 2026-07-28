## Public Market Rental Monitoring System

- Local-first React + TypeScript app.
- Keep changes offline-only unless the user asks for backend integration.
- Preserve the existing navy and light market-admin visual style.
- Favor small, focused edits that keep the dashboard, stalls, tenants, applicants, utility billing, analytics, logbook, settings, and support modules working in one browser session.
- Use localStorage for persistence until a backend is introduced.
- When adding a new collection to `AppState`, also add it to `mergeState` so state saved by an older build (and older backup files) still loads instead of crashing.