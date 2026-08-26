# Public Market Rental Monitoring System

Local-first admin dashboard for tracking tenant applicants, tenants, stalls, violations, utility billing, logbook entries, analytics, and downloadable reports.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Desktop application (Windows)

The system ships as a double-clickable Windows app so a non-technical operator
never has to touch a terminal or a dev server.

```bash
npm run dist
```

That produces two files in `release/`:

| File | Use |
| --- | --- |
| `TanauanPublicMarketSystem-Setup-0.1.0.exe` | Installer — adds desktop and Start Menu shortcuts. Normal deployment. |
| `TanauanPublicMarketSystem-Portable-0.1.0.exe` | Single portable file. Runs from a USB stick, installs nothing. |

Build one target at a time with `npm run dist:installer` or `npm run dist:portable`.
To run the desktop shell against the live dev server while developing, start
`npm run dev` in one terminal and `npm run electron:dev` in another.

**Data location.** Records live in a SQLite database at
`%APPDATA%\public-market-rental-monitoring-system\market-records.db` (the
folder is named after the `name` field in `package.json`, not the display name).
The data is
per-Windows-user and survives app updates, but it is *not* copied by
reinstalling — use `Help → Back Up Records Database…` (or
**Settings → Records Database → Save a Copy**) to keep recovery copies, and
**Support → Backup & Restore** to move records between computers as a `.json`
file. `Help → Open Data Folder` opens the folder holding the database.

Copying `market-records.db` copies the whole system. The file is ordinary
SQLite, so it can be opened with any SQLite tool (DB Browser for SQLite, the
`sqlite3` CLI) for ad-hoc reporting — but close the app first, and treat direct
edits as a last resort. Two sidecar files, `market-records.db-wal` and
`-shm`, appear while the app is running; they are folded back into the database
when it closes, so copy the folder rather than the single file if the app is
open.

**Offline.** The app makes zero network requests. Fonts and icons are vendored
in `public/fonts/`; regenerate them with `scripts/fetch-fonts.mjs` if the
typefaces ever change. Do not reintroduce the Google Fonts `<link>` tags — with
no internet the Material Symbols ligatures fail and every icon renders as its
literal name.

**Code signing.** Builds are unsigned, so Windows SmartScreen shows a
"Windows protected your PC" warning on first launch; the client clicks
*More info → Run anyway*. Signing needs a purchased certificate.

## Database

Records are held in SQLite. The Electron main process owns the file; the React
app never touches it directly, reaching it only through the calls exposed in
`electron/preload.cjs`, so the renderer keeps no Node or filesystem access.

| File | Role |
| --- | --- |
| `electron/db.cjs` | Schema, migrations, reads and writes. The only code that opens the database. |
| `electron/preload.cjs` | The calls the interface is allowed to make, over IPC. |
| `src/db.ts` | Renderer side. Uses the bridge when present, `localStorage` when not. |

Tables: `stalls`, `tenants`, `stallkeepers`, `applicants`,
`applicant_requirements`, `utility_bills`, `violations`, `logs`, `activities`,
plus `id_counters` and a `meta` key/value table holding the schema version and
last save time. Stallkeepers and applicant requirements are child rows keyed to
their parent and removed with it, rather than JSON packed into a column, so they
can be queried and counted like anything else.

The interface still works with one object holding a list per record type. Saving
walks that object and writes only what changed — rows that are new or edited are
upserted, rows the operator deleted are removed — all inside one transaction, so
an interrupted save leaves the previous records intact rather than half of each.
The database runs in WAL mode, which keeps reads working while a save is in
flight and survives a power cut mid-write.

**Changing the schema.** Add the column to the `SCHEMA` statements and the field
to the matching entry in `TABLES` in `electron/db.cjs`, then raise
`SCHEMA_VERSION`. The read, write and delete statements are generated from
`TABLES`, so nothing else needs editing. `src/db.ts` passes records through
untouched and never needs a change when a field is added.

**Upgrading from a pre-database installation.** The first launch finds an empty
database, reads the records the old version left in `localStorage`, and files
them into the tables. Nothing is lost and the import happens once.

**Native module.** `better-sqlite3` ships a Node-API binary that Electron loads
as-is, so no compiler and no `electron-rebuild` step is involved. The build sets
`npmRebuild: false` to keep electron-builder from trying to compile it from
source, and `asarUnpack` to place the binary beside the archive, since a `.node`
file cannot be loaded from inside `app.asar`.

## Current scope

- Fully offline browser app, also packaged as a Windows desktop application
- Records held in a local SQLite database (`market-records.db`), written by the
  Electron main process; a new installation starts from sample seed data
- In a plain browser (`npm run dev`) there is no database, so the same records
  fall back to `localStorage` — the interface behaves identically
- Dashboard, stall management, tenant records, applicants, utility billing, violations, analytics, logbook, settings, and support modules

## Monthly rent

Rent is recorded a month at a time from the Tenant Records register — tick the
box in the **Rent** column for the month shown in the picker.

### Early-payment discount

Settling a month **on or before its due date** earns **20% off** that month's
rent. Paying on the due date itself still counts.

Unlike the utility surcharge, the discount **is** recorded on the payment,
because it changes what was actually collected. Each payment stores the amount
taken and the discount given separately, so:

- A past month always shows why it came to less than the monthly rent.
- Changing the rate later never rewrites what an earlier month was given.
- A payment recorded before the discount existed keeps a discount of zero
  rather than being back-dated into one.

The register shows the discounted figure on offer (*"₱800.00 if paid today"*)
while it is still available, and the discount actually given once the month is
settled. Because collected then sits below the rent roll, the dashboard reports
the total discount given as its own figure — and **Rent Outstanding is summed
from the tenants who have not paid**, never `roll − collected`, which would
otherwise report a fully-collected month as still partly unpaid.

## Applicants

Requirements are a **checklist**, not file uploads — the office ticks off each
document as it is physically handed in. The document list lives in the
`REQUIREMENTS` constant in `src/App.tsx`; edit that array to change it.

Click **Review** on any applicant row to edit their details, tick requirements,
and **Approve** or **Reject** the application. While an application is in
progress its status tracks the checklist automatically (Incomplete → Pending
Review once everything is ticked); Approved and Rejected are officer decisions
and are never overwritten by ticking a box.

**Approving opens the stall assignment step.** Name and phone carry over from
the application, only genuinely vacant stalls are offered, and confirming
creates the tenant record and marks the stall Occupied in one action. Choose
**Skip for now** to approve without assigning yet — the tenant can be created
later from Tenant Records. The applicant record stays in the list as
application history, and the resulting tenant keeps an `applicantId` back-link.

## Utility billing

The Utility Billing module computes electricity and water charges per stall:

- Pick **Electricity** or **Water** — the rate and unit (kWh / cu.m) switch to that utility's preset and stay editable per bill. There is no fixed or service charge: a bill is consumption × rate and nothing else.
- Choose the **stall number** or the **tenant**; selecting either one fills in the other, so a bill is always attached to a stall and, when one exists, to that tenant's record.
- Set the **period covered** with a From and a To date — a bill is read to the day, so a stall that opened mid-month or a meter read early is billed for exactly the days it covers. **Cover all of &lt;month&gt;** fills in the whole month in one click. The day count and the month the bill is filed under are shown under the To date.
- The **due date** follows the period: it defaults to 15 days after the period ends and moves with the end date until you set one yourself. A due date that falls before the period ends is refused.
- Bills are still grouped and de-duplicated by the **month the period ends in**, so "a second electricity bill for this stall this month" is still caught.
- The **previous reading** is carried over automatically from the last bill for that stall and utility.
- Total is `(current − previous) × rate`, shown live before saving. The rate per kWh and per cu.m are both shown on screen and on the printed receipt.
- Saving posts the bill to Billing Records, the stall and tenant detail views, the Analytics utility panel, the Logbook (as a Collection entry), and all exports/backups.
- Bills can be marked paid/unpaid or deleted, and are flagged **Overdue** once the due date passes while unpaid.

### Late surcharge

A bill printed **after its due date has passed** picks up a late surcharge automatically:

| Utility | Surcharge |
| --- | --- |
| Electricity | 3.35% of the billed amount |
| Water | 10% of the billed amount |

The surcharge is applied **at the moment of printing**, not stored on the bill. This is deliberate:

- The figure held on record stays the amount actually billed for the consumption. Every total, aggregate, export, and outstanding-balance figure in the system uses that amount, so the books never drift.
- A bill settled before it ever goes out late never carries one; reprinting a still-overdue bill next month recomputes it against that day's date.
- It is driven by the same `isOverdue` test as the OVERDUE badge on the Billing Records table, so a receipt can never disagree with what the office sees on screen.

The calculator, the bill detail sheet, and the print preview all warn before printing when a surcharge will be added, and the receipt itself prints the rate, the peso amount, and the date the bill fell due.

### Printing receipts

Nothing reaches the printer without a preview. **Print Receipt** on a bill opens a preview showing the exact A4 sheet that will print, four receipts to a sheet, cut apart afterwards.

- **One bill** can print in 1, 2 or 4 labelled copies (Tenant's, Market Office, Treasurer's, File).
- **Up to four different bills** can go on one sheet: tick the boxes in the Billing Records table and use **Print *n* Receipts**. Selection survives paging and refiltering, and the header box selects everything on the page in view. Anything past four rolls onto further sheets.
- The preview has **zoom** (Fit / Actual size / step in and out, 35%–200%) and a **fullscreen** mode for checking small print. `Esc` leaves fullscreen first and only closes the dialog on a second press, so a half-filled form is never lost.

## Violations

The Violations module is the register of citations issued to tenants.

- **Record Violation** captures the party cited, the offence, demerit points, the date, and notes. The tenant field suggests tenants on record but stays free text, since a stall or an applicant may also be cited; the offence field suggests the `VIOLATION_ISSUES` list in `src/App.tsx`.
- Every citation starts **Open**. Resolving and reopening are done in the **edit form**, not from the row: Status sits at the top of the form beside the violation ID — set it to *Resolved* to close the citation (the resolution date is stamped on save) or back to *Open* to reopen it (the resolution date is cleared), so a reopened citation never shows a stale resolution date.
- Rows sort open-first, then newest, and **Open Points by Tenant** ranks who is carrying the most unresolved demerit points.
- Adding, resolving, reopening, and deleting all write an Incident entry to the Logbook. Violations also feed the Analytics summary panel, the notification list, and all exports and backups.

## Editing records

Applicant, tenant, stall, and violation detail views are all edit forms — click
**Review** or **View Details** on any row.

**Nothing is written until Save Changes is pressed.** Every edit form ends in
**Cancel** and **Save Changes**; Save stays disabled until a field has actually
been changed. Cancel discards the draft and leaves the record exactly as it was.
Once saved, the change is visible immediately in View Details, the tables,
exports, and backups.

**Edit forms open blank.** The inputs are empty and every dropdown starts on
*— Keep &lt;current value&gt;*, so the form only ever carries what is being changed
right now. **A blank field keeps the value on record** — the placeholder shows
what that value is (`On record: DUZON, DULCE CORAZON — leave blank to keep`). Reopening
the form after a save therefore shows blank inputs again, ready for the next
change, while the record itself keeps everything previously entered.

Two consequences worth knowing:

- Because blank means "keep", a value can be replaced but not blanked by
  clearing the box. Releasing a stall is therefore the explicit *Release the
  stall* option in the Stall ID dropdown, which takes effect when the form is
  saved.
- **Stallkeepers are a roster**, kept as a compact table — name, relationship,
  contact number, barangay — so the tenant form stays the same length whether
  a stall has one keeper or six. Each entry costs one table row (~59px); no
  input cards are stacked into the page.
  - **Add Stallkeeper** opens a **dialog over the form**, not an inline panel.
    Fill it in, press *Add to List*, and the person appears as a row while the
    dialog closes. The form underneath does not move.
  - **Amend** on a row opens the same dialog for that person, with its fields
    blank and *On record:* placeholders, so filling one field changes only that
    field. **Remove** takes someone off the roster.
  - The dialog only **stages** into the draft. Nothing reaches the tenant
    record until the form's own **Save Changes** — so several keepers can be
    entered and then committed in one go. Cancel or Escape in the dialog
    discards just that entry and leaves the form and roster untouched.
  - The same person cannot be listed twice. Records saved before this change
    carried a single stallkeeper in four flat fields; those are read as a
    roster of one.
- The applicant **requirements checklist** is the exception to opening blank —
  it shows what has physically been handed in, so a ticked document stays
  possible to untick. Those ticks are part of the same draft and are written
  with Save Changes. **Approve** and **Reject** are decisions in their own
  right: they save the whole draft along with the decision.

A change that would break an invariant is not saved: the note at the top of the
form turns into the error instead, and the record keeps its last good state
until the draft is fixed.

Two invariants are enforced when saving:

- Reassigning a tenant's stall releases the old one and marks the new one Occupied, and only genuinely free stalls are offered, so two tenants can never hold the same stall.
- On a stall held by a tenant record, the tenant name and Occupied status are locked — Tenant Records owns that change. Changing the stall's section moves its tenant with it.

Record IDs are never reused. The highest number issued per prefix is persisted
in the database (`id_counters`), so deleting the newest record does not
hand its ID to the next one created — which would otherwise let an old utility
bill attach itself to an unrelated new tenant. **Settings → Reset to Defaults**
clears the counters along with the data.