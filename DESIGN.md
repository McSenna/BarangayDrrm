# Barangay Binitayan DRRM — Design System

Operational UI for barangay administrators, relief personnel and residents during and after a disaster. Flat, high-contrast and calm: navy carries the structure, and red, orange and green are used only to mean critical, needs action and done/available.

## Where things live

| What | File |
|---|---|
| All UI tokens (colour, radius, spacing, shadow, shell sizes, hazard tape) | `frontend/src/styles/tokens.css` |
| Tailwind theme (every value points at a token; no hex) | `frontend/tailwind.config.js` |
| Map / Leaflet colours (Leaflet cannot read CSS variables) | `frontend/src/theme/mapTokens.js` |
| Component classes (`.btn`, `.badge-*`, `.card`, shell, dashboard) | `frontend/src/index.css` |
| UI primitives | `frontend/src/components/ui/` |
| App shell | `frontend/src/components/shell/`, `components/Sidebar.jsx` |
| Dashboard pieces | `frontend/src/components/dashboard/` (styles in `dashboard.css`), `components/HazardBanner.jsx`, data `backend/dashboard/overview.php` |

**Rule:** no hex or rgb values outside `tokens.css` and `mapTokens.js`. In components, use the Tailwind names (`bg-navy`, `text-red-ink`) or `var(--color-…)`.

## Colour

| Token | Value | Use |
|---|---|---|
| `--color-navy` | #16324F | sidebar, header, primary buttons, headings |
| `--color-navy-deep` | #0F2740 | recessed panels on navy (hotline card) |
| `--color-white` | #FFFFFF | cards, tables |
| `--color-slate` | #F1F5F9 | page background, card headers, table header band |
| `--color-red` | #DC2626 | critical: fills only, with white text |
| `--color-orange` | #F59E0B | pending / warning: fills only, with navy text |
| `--color-green` | #16A34A | available / done: fills and bars only, never text |
| `--color-red-ink` | #B91C1C | red text (on white or the red tint) |
| `--color-orange-ink` | #B45309 | orange text, only on `--color-orange-tint` |
| `--color-green-ink` | #166534 | green text |
| `--color-text` / `-muted` / `-subtle` | #1A2433 / #475569 / #64748B | body / secondary / tertiary text |

Contrast rules (WCAG AA):
- Never put orange text on white.
- `--color-text-subtle` (#64748B) goes on **white only**: it is 4.3:1 on slate, which fails. Use `-muted` on slate.
- `--color-red` is 4.4:1 on the red tint, so red text always uses `--color-red-ink`.

## Type, shape and depth

- **Font:** Plus Jakarta Sans 400–800. `tabular-nums` is on globally, so counts line up.
- **Radius:** cards 16px, buttons, nav items and inputs 10px, pills 999px.
- **Spacing:** 4px base. Page padding 28px (16px under 640px). Grid gap 16px.
- **Depth:** flat. `--shadow-card` is a 1px hairline; `--shadow-popover` is used only for the account menu.
- **Stripes:** only the hazard tape (`--hazard-tape`: orange and navy at 135°; `--hazard-tape-red`: red and white). It appears at the top of the sidebar, the public navbar and the hazard banner, and nowhere else.
- **Tone bands:** cards show tone with a 4px top band clipped by the card's corners (`.stat-card`, `.kpi-card`, `.card-band`). Never use a thick left or right border stripe.

## Status language (one mapping, everywhere)

`StatusBadge` (`components/ui/StatusBadge.jsx`, `STATUS_TONE`) maps stored status text to a tone:

| Tone | Look | Examples |
|---|---|---|
| critical | solid red, white | Critical, Critical Priority, Failed, shortages, low stock |
| high | red tint, red-ink, red border | High, Partially Approved, Full |
| attention | solid orange, navy | hazard level Warning |
| warning | orange tint, orange-ink | Pending, Medium, Under Review, Alert |
| ok | green tint, green-ink | Verified, Approved, Distributed, Low, Normal |
| danger | red tint, red-ink | Rejected, Cancelled, Inactive, failed login |
| ready | navy, white | Ready for Distribution |
| neutral | white, outlined, muted | Not Assessed, Disabled, Closed |

Relief allocation rounds (`ALLOCATION_STATUS_BADGE` in `utils/householdAssessment.js`): Pending Assessment = neutral (`badge-unassessed`), Assessment in Progress = warning (`badge-pending`), Ready for Distribution = ready (navy), Completed = ok (`badge-verified`), Cancelled = danger (`badge-rejected`). Priority badges come from the final score (/100) only; before the visit the label is Pending Assessment, with missing data For Verification.

Metric values use `StatValue` with tones `critical | pending | ok | neutral`. The tone comes from the data via `deriveTone(value, alertWhen)`: a watched metric shows its alert tone when above zero, and `ok` (green, with a check) at zero.

## Shell

- **Sidebar:** 252px navy with the hazard tape, round seal (`public/logo.png`; a placeholder until it is added), wordmark and the nav sections OVERVIEW, OPERATIONS and SYSTEM. Items are at least 44px tall. The current page is a white pill with bold navy text. Live badges: orange = pending, red = active hazards, "Off" = SMS disabled. The emergency hotline card at the bottom shows `contact_phone` from System Settings.
- **Below 1024px:** the sidebar is an off-canvas dialog. Focus is trapped inside; Esc, the backdrop or navigating closes it; focus returns to the menu button.
- **Header:** 64px, sticky, navy. Hazard status chip (red = Critical, orange = Warning/Alert, green = Normal), notification bell (residents and personnel only; admins receive no notifications), account menu with Profile and Log out. Pages refresh automatically and silently; there is no "last updated" indicator.
- **Live data:** `ShellStatusContext` polls hazard status (all roles), dashboard statistics (admin) and unread count (residents and personnel) every 60s.

## Dashboard

Administrator Dashboard (`pages/admin/AdminDashboard.jsx`, styles in `components/dashboard/dashboard.css`, data from `backend/dashboard/overview.php`). A tabbed work queue with the live situation beside it. Layout uses container queries on the page's own width (`.dash`), not viewport media queries, because the sidebar changes the room available.

- **Header:** title, one-line description and the DRRM `PhaseTracker`; three actions on the right from 900px: Send SMS (ghost), Issue hazard alert (danger), Record disaster report (primary). Under 600px the actions go full width with the primary first, and the phase tracker becomes a 2 × 2 grid.
- **Filters** (`DashboardFilters`): one white card row with the period as a segmented radio group (7 days / 30 days / 90 days / 1 year / All, default 30 days; checked = navy fill), Purok and disaster event as native selects, and "Reset filters" only when something differs from the default. Values live in the URL (`?range=&purok=&event=`). A polite live line under the bar states the scope in words. Period, Purok and event scope the overview cards, charts and queue; DSS priorities follow the Purok filter only; evacuation, stock, hazard and activity are barangay-wide.
- **Overview:** four `KpiCard`s: Reports to verify, Critical / High priority households, Allocations not yet ready, Evacuation slots available (with a `CapacityBar`). Each whole card is one link. 4 across from 1280px, 2 × 2 below, and still 2 × 2 (compact) under a 600px page width.
- **Main column**, in order:
  - **Work queue** (`WorkQueue`): tabs Reports to verify / Priority households / Allocations (ARIA tablist, arrow keys, Home/End), each with a count pill (navy when selected). Per tab: search, one dropdown filter, sortable columns, a row action button (Verify / Review / Open). Body scrolls at 520px with a sticky header; under 600px rows become stacked cards labelled from `data-label`.
  - **Charts:** "Disaster reports" (`ReportsChart`, Recharts stacked bars: Critical/High red over Medium/Low navy, a dashed orange-ink line where a hazard alert was issued, with a visually hidden data table) and "Relief pipeline" (`PipelineChart`, plain-HTML horizontal bars: Awaiting approval orange, Approved not ready subtle grey, Ready navy, Distributed green; each row links to Relief Allocations). Side by side from a 760px container, 1.35 : 1.

- **Rail** (`LiveRail`, `aside`, barangay-wide): Hazard status, Evacuation centers, Stock to watch, Recent activity, as white `rail-card`s. From a 1040px page width it sits beside the main column at 320px; below that it drops under the main column as an auto-fit grid (min 280px), the rail hazard card is hidden and the compact `HazardBanner` shows above the body instead. The rail is not sticky.
- **Hazard tape on the dashboard:** only on the rail hazard card while alerts are active (red/white tape for Critical, orange/navy for Warning), plus the compact hazard banner below 1040px. Normal shows a green-tint tile and no tape.
- **New since last visit** (`useSeenMarkers`, per browser in `localStorage`): report and allocation rows with an ID above the stored watermark carry an orange dot (with sr-only "New since your last visit") and a faint orange-tint row until opened from the queue; tabs show an orange "N new" pill; "Mark all as seen" raises the watermark. The first visit sets the watermark, so nothing is marked. Filters never move it.
- **KpiCard tones:** `critical` (red band, red-tint icon tile), `pending` (orange band, the default) and `ok` (green band). All three are defined with the other dashboard classes in `index.css`.
- **Chart colours:** SVG chart colours come from `CHART_COLORS` in `frontend/src/theme/mapTokens.js` (urgent red, other navy, alert orange-ink, grid border, axis subtle, cursor slate), because Recharts cannot read CSS variables. HTML legends and pipeline bars use the CSS tokens.
- **Loading and refresh:** skeletons on first load; while a new filter loads, the body dims and the scope line reads "Updating…". Refreshes silently every 60s; the rail reuses the shell's statistics poll.

**DRRM phase** (`utils/drrmPhase.js`) is derived, not stored:
- **Response:** any active hazard alert.
- **Recovery:** no active alerts, but allocations are pending or approved, or evacuees are still in centers.
- **Preparedness:** otherwise.
- **Prevention** is never selected automatically.

## Public site (landing page)

Same tokens and components as the dashboard, with slightly larger shapes (`--radius-card-lg` 20px, `--radius-tile-lg` 14px, `--radius-control-lg` 12px; 52px `btn-lg`). Full-bleed sections with `--gutter` 48px (20px under 640px). The hazard tape sits above the header and the register band (orange/navy) and above the Live Situation band (red/navy).

- **Files:**
  - `components/site/` holds `SiteHeader` and `SiteFooter`, shared by Home, About, Contact, Login and Register.
  - `features/landing/` holds the sections.
  - `features/landing/api.js` is the only data adapter, with its pure mapping functions in `mappers.js` (tested by `tests/landing_adapter_test.mjs`).
- **Public data only:** `hazards/get_public_status.php`, `evacuation/get_public_summary.php` (totals only) and `settings/get_settings.php`. Relief stock counts are deliberately not published.
- **Admin-edited copy:** the "What to do now" steps and preparedness tips are the System Settings keys `public_advisory_steps`, `public_advisory_steps_warning` and `public_preparedness_tips`, one step per line.
- **Alert card colours:** Critical gets a red header, Warning/Alert an orange header with navy text, Normal a green-tint header. Evacuation space is green above 50% free, orange from 20–50%, red with "Nearly full" below 20%, and the card is hidden when no center is open.
- **Weather:** shown as "Weather now" only when the reading is from the last 24 hours.
- **Focus ring:** navy on light surfaces and orange on navy. An orange ring on white would be only 2:1, which fails WCAG 1.4.11.

## GIS map (staff Barangay Map)

`components/BarangayMapView.jsx` + `components/gis/` (styles in `components/gis/gis.css`). Admin and Relief Personnel only.

- **Locked view:** no dragging, keyboard panning or box zoom. Wheel, double-click and pinch zoom keep the centre; the whole-barangay view is the minimum zoom, and zooming fully out re-centres. Everything outside the PSA boundary is covered by an opaque slate mask.
- **Layer order:** tiles → mask (380) → Purok polygons (410) → boundary (430) → Purok labels (450) → household markers (600) → popups.
- **Purok designation:** red is reserved for designated flood-prone Puroks 1–4 (`--color-zone-flood` fill at 35%, red-ink border, red-ink label pill). Others are neutral slate and are called *not currently designated*, never “safe”.
- **Households:** a white rounded tile with the lucide House glyph and a navy edge; dashed orange edge = location needs review; navy fill + orange ring = selected; corner dot = DSS priority (switchable). Sizes step with zoom (`data-zoom` far/mid/near).
- **Summary ledger:** one card split into five figures; each figure is a filter (pressed = 3px inset bottom bar).
- **Key bar:** the legend sits along the bottom edge of the map frame, never over the map.
- **Assigning a location:** orange tone band on the panel (`card-band-orange`), navy banner over the map, orange preview tile, ghost of the old location, inline confirm before saving.

## Barangay alerts (active alerts on the maps)

`features/alerts/` (styles in `alerts.css`), admin page `pages/admin/HazardAlerts.jsx` ("Barangay Alerts"), data `hazards/alerts/get_active_alerts.php` (public, resident-facing fields), lifecycle `backend/lib/barangay_alerts.php`.

- **Lifecycle:** Draft → Active → Inactive (final; kept with its history, never deleted). Activation sends nothing by SMS; nothing expires by itself.
- **Severity scale (alerts only):** Advisory amber (`--color-sev-advisory*`, Info icon), Warning orange (`--color-sev-warning*`, TriangleAlert), Critical red (Siren). `SeverityBadge` always shows icon + label; Critical is the solid pill, the others tint + ink. The header chip gains an amber Advisory state.
- **"Active Barangay Alerts" panel:** above the Home map and the staff Barangay Map. 4px tone band in the highest active severity; count; every alert listed highest severity first with area, activation time (Asia/Manila) and "What to do". Selecting one expands its details and emphasises its area. Empty: "No active barangay alerts." plus a line that this does not mean an area is safe. A failed refresh keeps the last alerts with an orange-tint "may be outdated" line; it never shows the empty state.
- **Map layer:** its own pane (440: above the boundary, below Purok labels and household markers), non-interactive. A dark casing under a severity-coloured outline (Critical solid, Warning long dash, Advisory short dash) with a light tint; the selected alert's areas thicken, others dim. Whole Purok boundaries or the barangay boundary only; areas without verified geometry are listed as text, never drawn. The permanent flood-prone fill is a separate layer and never changes with alerts.
- **Home map:** zoom buttons (44px), double-click and pinch zoom keep the centre; no dragging, no wheel zoom (the wheel scrolls the page). The legend sits under the map.
- **Refresh:** about every 15 s (`VITE_ALERT_POLL_MS`), on tab return, and at once in every tab of the browser where an administrator changed an alert.

## Accessibility conventions

- Landmarks: `nav`, `header`, `main#main` with a skip link, and `section aria-labelledby` for each section.
- Icon-only buttons carry `aria-label`. Accessible names contain the visible text; extra context is added with `.sr-only` text.
- Horizontal scrollers (`.table-wrap`, the phase tracker) are focusable named regions.
- Focus ring: 2px navy, or orange on navy surfaces.
- Motion: one pulse on the Critical status chip, plus short ease-out transitions. All of it is disabled under `prefers-reduced-motion`.
