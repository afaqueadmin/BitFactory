# BitFactory Daylight Theme (v1.3) - Design System Reference

## Overview

"Daylight" is the visual redesign of the **client-facing** portal, rolled
out incrementally page-by-page. It is a **CSS/visual layer only** - no
business logic, data fetching, or API contracts change when a page is
"themed." The design tokens, fonts and spacing come from a BitFactory
Daylight v1.3 style guide (PDF + reference `index.html`/`theme.css`, not
checked into this repo).

**Scope discipline:** Daylight only touches the client dashboard and its
sidebar/header. Franchise (`(franchise)`) and admin (`(manage)`) pages must
stay visually unchanged. This is enforced with two patterns, both described
below:
1. New pages get a full rewrite (they're not shared with other roles).
2. Existing components shared across roles get an **opt-in `daylight` prop**
   (default `false`) instead of being changed in place.

---

## Core files

### `src/lib/daylight.ts`

The single source of truth for tokens. Client components call the
`useDaylight()` hook to get:

```ts
const { d, darkMode, fonts } = useDaylight();
```

- **`d`** - a `DaylightPalette` object (see below) already resolved for the
  current light/dark mode. Never hardcode hex colours in a Daylight
  component; always pull from `d`.
- **`darkMode`** - boolean, only needed when a style can't be expressed as a
  single token (e.g. picking between two different gradients).
- **`fonts`** - `{ body, heading }` - `body` is Inter (loaded via
  `next/font/google`), `heading` is Manrope. Body text/tables/nav use
  `fonts.body`; page titles, card headings and big KPI numbers use
  `fonts.heading`.

Key tokens on `DaylightPalette` (see the file for the full list and both
light/dark values): `canvas`, `surface`, `action`/`actionHover`, `skySoft`,
`mint`, `amber`, `dangerSoft`, `success`/`warning`/`danger`, `text`/`muted`,
`border`/`inputBorder`, `hover`, `tableHead`, `shadow`. The guide only
defines a light palette; a dark counterpart was added by hand to keep the
portal's existing dark-mode toggle working - when adding a new token, always
add both.

Also exported from this file:
- `RADIUS_CARD` ("16px") / `RADIUS_CONTROL` ("8px")
- `HEADER_HEIGHT` - `{ desktop: 76, mobile: 72 }`
- `MQ` - breakpoint media queries (`mobile`, `desktop`, `stack`, `compact`)
- `sidebarWidthStyles(prop)` - responsive sidebar width for a given CSS prop
- `focusRing(color)` - the guide's focus-visible outline style

### `src/app/(auth)/layout.tsx`

Gates the Daylight canvas background and page padding via an `isDaylightPage`
boolean, checked against the current `pathname`. **Any new themed page under
`(auth)` must be added to this list**, otherwise it renders on the old plain
white background with old padding even though the page content itself is
themed. Dynamic routes (e.g. `/support/[id]`) need a `pathname.startsWith(...)`
check rather than exact equality.

Pages outside the `(auth)` route group (`/`, `/login`, `/btc-price-predictor`)
render their own `AppBarComponent`/`UserFooter` directly and don't need this
gating - they're themed unconditionally.

---

## Shared Daylight primitives (`src/components/daylight/`)

Reach for these before writing new one-off styles:

| Component | Purpose |
|---|---|
| `StatCard` | KPI card. `tone: "sky" \| "mint" \| "amber" \| "danger"`, optional `valueColor` to override the value's text colour (e.g. a signed 24h delta). |
| `FactoryStatusCard` | The dashboard's "fleet health" card (status ring + legend rows + pool breakdown + "view all miners" link). |
| `Segmented<T>` | Small track of 2-3 mutually exclusive options (e.g. Daily/Monthly). Generic over the option id type. |
| `PillTab` | Single pill for a scrollable row of filters (pool selector, miner filter), with an optional colour dot. |

---

## The opt-in `daylight` prop pattern

Any component **shared across route groups** (client + franchise + admin)
gets a `daylight?: boolean` prop, defaulting to `false`. The component
branches internally - either an early-return old-styling branch plus a
Daylight branch, or an inline ternary for smaller components. The page that
wants the new look passes `daylight` (shorthand for `daylight={true}`);
every other caller is unaffected by default.

Components currently using this pattern:

- `BtcPriceLabel`, `DashboardHeader`
- `HashrateHistoryChart`, `HostedMinersList`, `MiningEarningsChart`,
  `ProfitLossChart`
- `ElectricityCostTable`
- `wallet/WalletChangeRequestHistory`, `wallet/WalletSubaccountCards`
- `PaybackHistoryChart`
- `TwoFactorSettings`, `PasskeySettings`
- `tickets/TicketBadges`, `tickets/TicketListTable`, `tickets/TicketThreadView`

When adding a new opt-in component, grep first to confirm which route
groups actually import it (`grep -rn "ComponentName" src/app`) - that's how
the list above was built each time.

### Deferred-modal policy

Dialog/modal components (`<Dialog>` overlays) are **left on default MUI
styling** rather than reskinned, even inside an otherwise-themed component -
the visual noise isn't worth it for a transient overlay. Examples: `AddMinerModal`,
`RepairNotesModal`, `RequestWalletChangeModal`, `CreateTicketModal`, the
backup-codes/disable-2FA dialogs in `TwoFactorSettings`, the add/rename/delete
dialogs in `PasskeySettings`.

**Exception:** if the "dialog-like" component is actually the page's primary
content rather than an overlay (e.g. `TwoFactorVerification`, which replaces
the entire login card during 2FA; `TicketThreadView`, which *is* the ticket
detail page), it gets full Daylight treatment.

---

## Common inline style patterns

These are re-declared per-page/component (not extracted into shared
constants, since MUI `sx` objects are cheap and inlining keeps each file
self-contained) - copy them rather than reinventing:

```ts
const inputSx = {
  "& .MuiOutlinedInput-root": {
    borderRadius: "8px",
    fontFamily: fonts.body,
    "& fieldset": { borderColor: d.inputBorder },
    "&:hover fieldset": { borderColor: d.action },
  },
  "& .MuiOutlinedInput-root.Mui-focused fieldset": {
    borderColor: d.action,
    borderWidth: "2px",
  },
  "& .MuiInputLabel-root": { fontFamily: fonts.body, color: d.muted },
};

const primaryBtnSx = {
  textTransform: "none",
  fontFamily: fonts.body,
  fontWeight: 650,
  borderRadius: "8px",
  minHeight: 40,
  bgcolor: d.action,
  color: "#fff",
  boxShadow: "none",
  "&:hover": { bgcolor: d.actionHover, boxShadow: "none" },
  "&.Mui-disabled": { bgcolor: d.border, color: d.muted },
} as const;

const outlineBtnSx = {
  textTransform: "none",
  fontFamily: fonts.body,
  fontWeight: 600,
  borderRadius: "8px",
  minHeight: 40,
  color: d.text,
  borderColor: d.inputBorder,
  "&:hover": { bgcolor: d.hover, borderColor: d.action },
} as const;

const alertSx = (tone: "success" | "error") => ({
  borderRadius: "8px",
  bgcolor: tone === "success" ? d.mint : d.dangerSoft,
  color: tone === "success" ? d.success : d.danger,
  fontFamily: fonts.body,
  "& .MuiAlert-icon": { color: tone === "success" ? d.success : d.danger },
});

// Data-table header row
const headerCellSx = {
  fontFamily: fonts.body,
  fontWeight: 600,
  fontSize: 10,
  letterSpacing: ".015em",
  textTransform: "uppercase" as const,
  color: d.muted,
  borderBottomColor: d.border,
};
// <TableHead sx={{ backgroundColor: d.tableHead }}>

// Card chrome (repeated on nearly every themed section)
const cardSx = {
  bgcolor: d.surface,
  border: `1px solid ${d.border}`,
  borderRadius: RADIUS_CARD,
  boxShadow: d.shadow,
  p: { xs: 2.5, sm: 4 },
};
```

Status/priority pills use a small local `*Tone(d, value)` helper per page
returning `{ bg, text }` (see `invoiceStatusTone` in the invoices page,
`daylightStatusTone`/`daylightPriorityTone` in `TicketBadges`) rather than a
single global map, since the tone rules differ per domain.

**Mobile tables:** hide secondary columns below a breakpoint instead of
relying on horizontal scroll - `sx={{ display: { xs: "none", sm: "table-cell" } }}`
on both the header `TableCell` and the body `TableCell`. (A table that
doesn't do this will visually clip on narrow viewports - always check a 390px
screenshot before calling a themed table done.)

---

## Pages themed so far

Client pages under `(auth)`, gated via `isDaylightPage` in
`src/app/(auth)/layout.tsx`:
`/dashboard`, `/miners`, `/wallet`, `/transaction`, `/invoices`,
`/btc-price-history`, `/hashprice-history`, `/payback-analysis`,
`/account-settings`, `/security-setting`, `/support`, `/support/[id]`.

Pages outside `(auth)` (themed unconditionally, no gating needed):
`/` (welcome), `/login` (incl. `TwoFactorVerification`), `/btc-price-predictor`.

**Known gap:** Payback Analysis's alternate "Graphical Analysis" view
(`PaybackGraphicalView.tsx` + `PaybackChartPrimitives.tsx` + `PaybackCharts.tsx`,
~1,800 lines, also shared with the admin `payback-analysis-company` page) is
still on its old MUI-theme styling - it renders acceptably against the new
canvas but hasn't been reskinned. Do this only if asked; it's a secondary
view (the default is "Scenario Table," which is themed).

Everything else under `(auth)`, `(franchise)` and `(manage)` is intentionally
untouched.

---

## Verification pipeline for a themed page/component

1. `npx tsc --noEmit -p tsconfig.json`
2. `npx eslint <changed files>`
3. `npx prettier --write <changed files>`, then re-run tsc/eslint
4. Visual check in light, dark and mobile (390×844) - see "disposable
   preview server" below
5. Full production build: `npx prisma generate && npx next build --turbopack`,
   confirm zero warn/error lines
6. **Delete `.next` before restarting the dev server** - starting `next dev`
   on top of a `.next` folder still holding production build manifests
   causes API routes to silently 404 while page routes keep working (seen
   in practice: this presents to the user as "Invalid authentication
   response" on the dashboard, because the 404 HTML response fails to
   `JSON.parse`). Always `rm -rf .next` between a `next build` and the next
   `next dev`.
7. Commit locally. **Never `git push` unless the user explicitly asks in
   that turn** - this is a standing rule for this repo, not specific to
   Daylight work.

### Disposable preview server (for screenshot review)

Because client pages require auth and a live DB, screenshots are taken
against a throwaway copy rather than the real dev server:

1. `robocopy` the repo into a scratch temp dir, excluding
   `node_modules`/`.next`/`.git`.
2. Junction `node_modules` into the copy (`New-Item -ItemType Junction`)
   instead of reinstalling.
3. Stub `src/lib/auth/tokenBlacklist.ts` to `return false` so no real DB is
   needed.
4. `next dev --webpack` on an unused port with dummy `JWT_SECRET` /
   `DATABASE_URL` env vars.
5. Drive it with Puppeteer: sign a JWT with `jose` matching `JWT_SECRET`,
   set it as the `token` cookie (and a `darkMode=true` cookie for the dark
   variant), intercept and mock every `/api/*` request, block all other
   external network.
6. Screenshot at 1440×900 (desktop) and 390×844 (mobile).
7. Clean up afterward: kill the server process, remove the `node_modules`
   junction, delete the scratch folder.

When mocking `/api/tickets*` responses for this, match the real hook shapes
in `src/lib/hooks/useTickets.ts` - both `useTickets()` and `useTicket(id)`
unwrap the response as `data.data`, not `data.tickets`/`data.ticket`.
