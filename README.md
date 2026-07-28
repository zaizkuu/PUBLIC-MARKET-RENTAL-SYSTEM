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

**Data location.** Records live in the app's own storage at
`%APPDATA%\Tanauan Public Market System`. The data is per-Windows-user and
survives app updates, but it is *not* copied by reinstalling — use
**Support → Backup & Restore** to move data between computers or to keep
recovery copies. `Help → Open Data Folder` in the app menu opens that folder.

**Offline.** The app makes zero network requests. Fonts and icons are vendored
in `public/fonts/`; regenerate them with `scripts/fetch-fonts.mjs` if the
typefaces ever change. Do not reintroduce the Google Fonts `<link>` tags — with
no internet the Material Symbols ligatures fail and every icon renders as its
literal name.

**Code signing.** Builds are unsigned, so Windows SmartScreen shows a
"Windows protected your PC" warning on first launch; the client clicks
*More info → Run anyway*. Signing needs a purchased certificate.

## Current scope

- Fully offline browser app, also packaged as a Windows desktop application
- Mock seed data stored in local state and persisted to `localStorage`
- Dashboard, stall management, tenant records, applicants, utility billing, violations, analytics, logbook, settings, and support modules

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

- Pick **Electricity** or **Water** — the rate, fixed charge, and unit (kWh / m³) switch to that utility's preset and stay editable per bill.
- Choose the **stall number** or the **tenant**; selecting either one fills in the other, so a bill is always attached to a stall and, when one exists, to that tenant's record.
- The **previous reading** is carried over automatically from the last bill for that stall and utility.
- Total is `(current − previous) × rate + fixed charge`, shown live before saving.
- Saving posts the bill to Billing Records, the stall and tenant detail views, the Analytics utility panel, the Logbook (as a Collection entry), and all exports/backups.
- Bills can be marked paid/unpaid or deleted, and are flagged **Overdue** once the due date passes while unpaid.

## Violations

The Violations module is the register of citations issued to tenants.

- **Record Violation** captures the party cited, the offence, demerit points, the date, and notes. The tenant field suggests tenants on record but stays free text, since a stall or an applicant may also be cited; the offence field suggests the `VIOLATION_ISSUES` list in `src/App.tsx`.
- Every citation starts **Open**. **Resolve** on a row stamps the resolution date; **Reopen** clears it, so a reopened citation never shows a stale resolution date.
- Rows sort open-first, then newest, and **Open Points by Tenant** ranks who is carrying the most unresolved demerit points.
- Adding, resolving, reopening, and deleting all write an Incident entry to the Logbook. Violations also feed the Analytics summary panel, the notification list, and all exports and backups.

## Editing records

Applicant, tenant, and stall detail views are all edit forms — click **Review** or
**View Details** on any row. Two invariants are enforced when saving:

- Reassigning a tenant's stall releases the old one and marks the new one Occupied, and only genuinely free stalls are offered, so two tenants can never hold the same stall.
- On a stall held by a tenant record, the tenant name and Occupied status are locked — Tenant Records owns that change. Changing the stall's section moves its tenant with it.

Record IDs are never reused. The highest number issued per prefix is persisted
in `localStorage` (`pmrms-id-counters`), so deleting the newest record does not
hand its ID to the next one created — which would otherwise let an old utility
bill attach itself to an unrelated new tenant. **Settings → Reset to Defaults**
clears the counters along with the data.