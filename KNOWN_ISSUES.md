# Known Issues

Last reviewed: 2026-07-28. Nothing outstanding — all seven bugs recorded in the previous review are fixed, and the missing Violations module is built. Both are verified against a running build and kept below as a record of what changed and where.

## Fixed

### 8. No CRUD for Violations — built
Violations are now a first-class module with its own sidebar entry (between Utility Billing and Analytics), matching the pattern of every other record type. It was given its own page rather than a section of Analytics because violations are records an officer manages, while Analytics is a read-only reporting view; the Analytics summary panel now links across to it.

The `Violation` type gained `dateRecorded`, `dateResolved`, and `notes` — a citation register without dates could not show how long a case stayed open. Records saved before this normalize to an empty date and render as "—", the same way legacy log entries do.

- Record, edit, resolve/reopen, and delete, with a status filter, search, pagination, and CSV export.
- Resolving stamps the resolution date; reopening clears it, so a reopened citation never shows a stale one. Saving rejects a resolution date earlier than the date recorded.
- Rows sort open-first, then newest, so what needs action is on page 1.
- Stat cards for total / open / resolved / open demerit points, plus an "Open Points by Tenant" panel that ranks who needs following up.
- The tenant field offers tenants on record via a datalist but stays free text, since a stall or applicant may also be cited. The issue field suggests `VIOLATION_ISSUES` the same way.
- Every add, status change, and delete writes an Incident entry to the Logbook and an entry to the activity feed. The notification row now targets the Violations page instead of Analytics.
- `src/App.tsx` — `ViolationsPage`, `ViolationForm`, `addViolation()`, `updateViolation()`, `toggleViolationStatus()`, `deleteViolation()`

## Previously fixed

### 1. ID reuse can misattribute historical records — fixed
`nextId()` derived the next ID from `max(existing IDs) + 1`, so deleting the newest record handed the same ID back to the next one created, and back-links kept for history (`UtilityBill.tenantId`, `Tenant.applicantId`) could then point at an unrelated record. The highest number issued is now persisted per prefix in the database (`id_counters`) and only ever moves forward; `max(existing)` stays the floor so a restored backup with higher IDs still numbers correctly. A factory reset clears the counters. Callers generate the ID after validation so a rejected submit does not burn a number.
- `src/App.tsx` — `nextId()`, `readIdCounters()`, `resetIdCounters()`, `resetData()`, `AddStallForm.handleSubmit`

### 2. Negative numbers accepted in money and meter fields — fixed
`min="0"` was never enforced because these forms save from a plain button rather than a real form submit. All amounts now go through `toAmount()` (clamps to ≥ 0), and the calculator rejects negative readings and a negative fixed charge on save with an explicit message.
- `src/App.tsx` — `toAmount()`, `isNegative()`, `BillCalculator`, `AddTenantForm`, `AssignStallForm`, `TenantDetailView`

### 3. "Occupied" stall can be saved with no tenant name — fixed
Add Stall and the stall detail view both block saving `status: 'Occupied'` with a blank tenant; the Tenant field is marked required and the placeholder changes while Occupied is selected.
- `src/App.tsx` — `AddStallForm.handleSubmit`, `StallDetailView.handleSave`

### 4. CSV export doesn't escape embedded quotes — fixed
Every cell (and header) goes through `csvCell()`, which doubles internal `"` characters. A note like `Tenant said "the meter is broken"` now exports as a well-formed field.
- `src/App.tsx` — `csvCell()`, `downloadCSV()`

### 5. Interactive elements aren't keyboard-accessible — fixed
Every row action, the dashboard stat links, the toast close control, and the FAQ question rows are real `<button type="button">` elements now, so all are tab-reachable and Enter/Space-activatable. The CSS for `.action-link`, `.stat-link`, `.toast-close`, and `.faq-question` resets the button chrome so the appearance is unchanged, and a `:focus-visible` outline was added.
- `src/App.tsx`, `src/styles.css`

### 6. Native `window.confirm` breaks the app's own modal styling — fixed
The duplicate-bill check uses the app's `ConfirmDialog` component instead of `window.confirm`. `handleSave` validates and raises the prompt; `commitBill()` posts the bill once confirmed.
- `src/App.tsx` — `BillCalculator.handleSave`, `BillCalculator.commitBill`

### 7. Tenant and Stall detail views are still read-only — fixed
Both are edit forms now, matching the Applicant module.
- **Tenant**: name, phone, stall, section, rent, and status are editable. Only the tenant's own stall and genuinely free stalls are offered, so two tenants can't claim one. Saving mirrors the change into the stall registry (release the old stall, claim the new one, follow a rename through), and a rename updates `tenantName` on that tenant's bills so history isn't attributed to a name that no longer exists.
- **Stall**: section, status, tenant, and last inspection are editable, with an "Inspected Today" shortcut. When a tenant record holds the stall, the tenant name and Occupied status are locked — Tenant Records owns that change — and a section change moves the occupying tenant with it.
- `src/App.tsx` — `TenantDetailView`, `StallDetailView`, `updateTenant()`, `updateStall()`
