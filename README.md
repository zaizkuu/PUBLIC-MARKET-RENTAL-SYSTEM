# Public Market Rental Monitoring System

Local-first admin dashboard for tracking tenant applicants, tenants, stalls, violations, utility billing, logbook entries, analytics, and downloadable reports.

## Run locally

```bash
npm install
npm run dev
```

## Test

```bash
npm test
```

Runs every suite in `tests/`: the stall directory against the PDF's own
summary, password hashing and lockout, backups, the market map, and — where
`better-sqlite3` is built for the local Node — the database file itself.

## Signing in

The system opens on a sign-in page every time it starts. The person picks
their account from the list, then types their password.

- **Three accounts, fixed.** Engr. Luz M. Maderazo (Market Supervisor III,
  **Administrator**), and the two officers in charge of market operation
  under her, Manuel G. Mercado and Felmar Pica (**Staff**). Accounts are not
  added or removed from the interface; the list is `OFFICE_ACCOUNTS` in
  `src/security/accounts.ts`.
- **First sign-in.** Each account starts with no password: choosing it asks
  for a new one. The administrator is then shown a **recovery code** once —
  written down and kept in the office, it is the way back in if the password
  is forgotten (*Forgot password?* on the sign-in page). Using it issues a
  new one.
- **Forgotten passwords.** The administrator sets a temporary password for
  either officer in **Settings → User Accounts**, which its owner replaces at
  the next sign-in. The same panel unlocks a locked account.
- **Passwords** are never stored — only a PBKDF2-SHA-256 hash with a random
  salt per account (600,000 iterations), computed by the browser engine's own
  Web Crypto, offline. A new password needs 8+ characters, a letter and a
  number, must not contain the person's name, and must not be a common one.
- **Wrong passwords.** Five in a row lock the account for 5 minutes, doubling
  each further round up to an hour. The lock survives a restart.
- **Leaving the desk.** *Lock Screen* in the account menu (top right), or no
  use for 15 minutes (Settings → Sign-in Security), locks the screen over the
  page without closing it, so a half-filled form is still there after
  unlocking. *Log Out* returns to the account list.
- **Who did what.** Sign-ins, sign-outs, locks, failed attempts and account
  changes go to the Logbook as *Security* entries, and every logbook entry
  records who was signed in. Receipts and verification slips start with the
  signed-in officer's name.
- **Administrator-only:** importing or restoring a backup, resetting to
  defaults, deleting logbook entries, resetting the officers' passwords, and
  the screen-lock setting.

Accounts live in their own `accounts` table, apart from the records:
restoring a backup or resetting the records never changes who can sign in.
The logic is in `src/security/accounts.ts`; the screens are
`src/security/LoginScreen.tsx` and `src/security/AccountSettings.tsx`.

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

**Offline.** Everything works with no internet connection: records, sign-in,
printing and the market map. The desktop app enforces it — the main process
refuses every outgoing network request from the window (`keepOffline()` in
`electron/main.cjs`), so nothing can quietly start depending on the internet or
send records anywhere. Links the operator clicks (the Support page's e-mail
addresses, the map's source references) open in the system browser. Fonts and icons are vendored
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
`officers`, `verifications`, `rent_payments`, plus `id_counters`, the sign-in
`accounts`, and a `meta` key/value table holding the schema version, last save
time, and the stall-directory edition the records are at. Stallkeepers and applicant requirements are child rows keyed to
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

## Stall directory, sections and stall IDs

The register holds the **Market Stall Directory** the office compiled from its
final layout sheets: 194 stalls in seven sections, each vendor's name exactly
as printed on the sheet, and the sheet's margin notes (illegible edits,
smudged numbers, crossed-out names) kept on the stall as its note. The rows
are in `src/market/directory.ts`; `tests/directory.test.mjs` checks them
against the directory's own summary table.

A stall ID is its **section code** and the number exactly as the directory
prints it, so stall 1 is `KS-1` and stall 105 is `FS-105`:

| Section | Code | Stalls | Vacant | Monthly rent |
| --- | --- | --- | --- | --- |
| Kakanin | KS | 12 | 2 | ₱1,000 |
| Dried Fish/Eggs | DS | 24 | 10 | ₱1,000 |
| Fruits/Duma | FD | 12 | 0 | ₱1,000 |
| Vegetable | VS | 53 | 5 | ₱1,000 |
| Fish | FS | 45 | 8 | ₱1,000 |
| Meat - Chicken | CS | 22 | 4 | ₱1,500 (charged as meat) |
| Meat - Carabeef/Beef & Pork | MS | 26 | 2 | ₱1,500 |

The codes live in one place, `SECTION_LIST` in `src/market/directory.ts`.

- **Tenant records** are one per stall a vendor holds (156 in all), at the
  section's Section 43 rate, and follow the directory's numbering: the vendor
  on stall 5 is tenant record 5, and the register lists them in stall order.
  The directory has no phone numbers, permits or inspection dates, so those
  start blank / *Not Recorded*.
- **Electric meters** come from the cooperative's calibration sheets: 107
  tenant records start with their meter's serial number, which utility
  billing fills in on choosing the stall. See
  [docs/ELECTRIC-METERS.md](docs/ELECTRIC-METERS.md) for how each was matched,
  the stalls still without one, and the readings worth checking.
- **Not counted as vacancies:** stalls 207–212 (an open area with no name on
  the layout) are listed as Available with that note, and stall 95, the
  PNP/Guard Station, is held but has no tenant record and pays no rent.
- **New stalls** take their section's code and the next free number
  (`KS-213`…). Typing just the number (`74`) adds the prefix; a prefix from
  another section is refused.
- **Moving a stall to another section** renumbers it under that section's
  code (`KS-74` → `FS-74`); its tenant record, applications and utility
  bills follow it, and the logbook notes the old number.
- **Tenant IDs are not shown.** Tenant Records, its print-out, the detail and
  edit forms, dialogs and logbook entries identify a tenant by name and stall.
  The internal `TEN-` key still exists so bills and rent payments stay
  attached to the right person.

**Upgrading an existing installation: the old data is removed.** The
directory is the office's latest record of the market, so the first start of
this version clears everything recorded before it — stalls, tenants,
applications, utility bills, violations, verification slips, the logbook and
the activity feed — and starts again from the directory alone. Only the
office board is kept, and the sign-in accounts, which are stored apart.

Nothing is lost for good: before clearing anything it saves a copy of the
whole database to
`backups\market-records-before-market-stall-directory-2026-10b-<date>.db` in
the data folder (in a browser, under the
`pmrms-state-before-market-stall-directory-2026-10b` key), and the one
logbook entry left says where that copy is. If the copy cannot be made,
nothing is changed and it is tried again at the next start. It runs once per
directory edition; a backup restored afterwards is respected.

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
- Choose the **stall number**; the tenant's name and the electric meter's serial number fill in from the tenant record. **Billed To** stays editable, for a bill made out to a stallkeeper or under a new name — the bill still belongs to the stall's tenancy. The meter box offers every serial from the calibration sheets.
- Set the **period covered** with a From and a To date — a bill is read to the day, so a stall that opened mid-month or a meter read early is billed for exactly the days it covers. **Cover all of &lt;month&gt;** fills in the whole month in one click. The day count and the month the bill is filed under are shown under the To date.
- The **due date** defaults to 15 days after the period ends and moves with the end date until you set one yourself; any date can be set, and a date before the period ends is pointed out rather than refused.
- Bills are still grouped and de-duplicated by the **month the period ends in**, so "a second electricity bill for this stall this month" is still caught.
- The **previous reading** is carried over automatically from the last bill for that stall and utility.
- Total is `(current − previous) × rate`, shown live before saving. The rate per kWh and per cu.m are both shown on screen and on the printed receipt.
- Saving posts the bill to Billing Records, the stall and tenant detail views, the Analytics utility panel, the Logbook (as a Collection entry), and all exports/backups.
- Bills can be marked paid/unpaid or deleted, and are flagged **Overdue** once the due date passes while unpaid.
- **Edit Details** on a saved bill changes who it is billed to, its due date and its notes, and writes what changed to the Logbook. The readings and the amount stay as billed.

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

- **Record Violation** captures the party cited, the offence, demerit points, the date, and notes. The tenant field suggests tenants on record but stays free text, since a stall or an applicant may also be cited.
- The offence is chosen from the office's **Market Violations dropdown list** — `VIOLATION_GROUPS` in `src/App.tsx`: Section 22 prohibited acts (22-i … 22-xi), Section 23 duties not followed (23-a … 23-i), and *Other* (no health certificate / yearly medical exam). The code is shown beside the offence in the register, the detail sheet (as its ordinance reference), the printed list and the CSV export. *Not on this list — describe it* allows a free-text offence; citations recorded before the list keep their wording.
- **Offence — 1st, 2nd or 3rd.** A new citation counts the party's earlier citations for the same violation and fills in the next offence (a fourth and later still read as the 3rd); the officer can change it, and it can be changed later in the edit form. It shows in the register, the detail sheet, the printed list, the CSV export and the logbook entry.
- Every citation starts **Open**. Once the offender has been reprimanded, set its status to **Reprimanded** in the **edit form** — the date reprimanded is stamped on save — or back to *Open* to reopen it, which clears that date. Citations recorded as *Resolved* before this change read as Reprimanded.
- Rows sort open-first, then newest, and **Open Points by Tenant** ranks who is carrying the most demerit points not yet reprimanded.
- Adding, reprimanding, reopening, and deleting all write an Incident entry to the Logbook. Violations also feed the Analytics summary panel, the notification list, and all exports and backups.

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
## Quality (ISO/IEC 25010)

How the system answers the product-quality characteristics of ISO/IEC 25010:

| Characteristic | What the system does |
| --- | --- |
| **Functional suitability** | Register, sections, stall IDs and rates follow the office's own directory and Section 43 schedule; violations follow Sections 22–23; automated tests check the transcription against the source summary. |
| **Performance efficiency** | Local SQLite in WAL mode, writes batched and diffed; sign-in hashing tuned to ~0.1 s on a modern PC. |
| **Compatibility** | Runs as a Windows desktop app or in any current browser; backups are plain JSON, the database plain SQLite readable by standard tools. |
| **Interaction capability (usability)** | Same visual language on the sign-in page as the rest of the system; labelled fields, keyboard operation, visible focus, live password-rule checklist, Caps Lock warning, show-password toggle, plain-language errors, and a layout that works at phone width. |
| **Reliability** | Transactional saves; a full database copy before the directory update, which is skipped (not half-done) if the copy fails; start-up runs once; restoring and resetting never touch the sign-in accounts. |
| **Security** | Per-person accounts; salted PBKDF2 password hashes; lockout with back-off; recovery code for administrators; forced change of temporary passwords; idle and manual screen lock; role-based limits on destructive actions; every sign-in, failure and account change logged with who did it; no network access from the app. |
| **Maintainability** | Directory data, account logic and sign-in screens are separate modules with their own tests; section codes, violation list and lock timings are each defined in one place. |
| **Flexibility (portability)** | Installer or portable `.exe`; the data folder (or one `.db` file) moves the whole system to another computer. |

## Interactive market mapping

The dashboard includes aerial-to-indoor navigation, a stall directory, and a local authenticated layout editor. See [MARKET-MAP.md](MARKET-MAP.md) for setup, privacy, database storage, publication, verification and tests.
