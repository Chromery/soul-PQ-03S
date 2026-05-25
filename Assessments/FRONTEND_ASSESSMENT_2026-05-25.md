# Frontend Assessment - Soul Prospect Qualifier

Date: 2026-05-25  
Scope: Current Vite/React frontend in `apps/web`; dashboard, study detail, and editor planimetrie.

Implementation follow-up: several frontend-operable findings were addressed later on the same date; see `IMPLEMENTATION_PASS_2026-05-25.md` for current implementation status.

## Executive Summary

The current frontend is a visually developed prototype with a useful smart-selection proof of concept. It can display mocked feasibility studies, filter and sort the dashboard, expand company rows, open a study detail screen, display example/uploaded planimetria PDFs, select enclosed areas, assign a destination usage, and calculate displayed square meters from sheet size and scale.

It is not yet an operational internal tool. The primary workflow is blocked by inert navigation and action controls, unsaved editor work, placeholder documents/data, and no authentication, routing, API, ERP, S3, or persistent data integration. Some displayed outputs can also be misleading: dashboard KPIs fall back to unfiltered totals for a zero-result filter, an Excel action actually downloads CSV data, and the editor exposes estimated cadastral amounts using prototype coefficients without domain validation or auditability.

The next implementation pass should first make the navigation and core actions truthful and usable, then introduce a persistable study/editor model and validated calculation rules before connecting backend integrations.

## Method

This assessment is based on:

- Source inspection of `apps/web/src/App.tsx`, `apps/web/src/PlanimetriaEditor.tsx`, `apps/web/src/styles.css`, and package configuration.
- Verification of frontend production compilation with `npm run build --workspace @soul/web`.
- Inspection for routing, authentication, API/integration, and automated-test infrastructure.

No frontend behavior has been changed as part of this assessment.

## Severity

| Priority | Meaning |
| --- | --- |
| P0 | Blocks a real operator workflow or makes production use unsafe. |
| P1 | Important functional defect or architecture gap that should be fixed before pilot use. |
| P2 | Material usability, quality, accessibility, or maintainability issue. |
| P3 | Polish or optimization improvement. |

## Findings

### P0-01: Navigation is presented as functional but is inert

Evidence:

- `apps/web/src/App.tsx:1626-1636` builds the left navigation menu.
- `apps/web/src/App.tsx:1696-1709` renders every navigation item as a `button` without an `onClick`, link, route, or disabled state.
- There is no router dependency or routing setup in `apps/web/package.json` or `apps/web/src`.

Impact:

- The sidebar buttons reported as non-clickable are not a runtime glitch; they are not implemented.
- Operators cannot move between dashboard, assigned studies, documents, activity, or settings.
- Study and editor navigation relies on local component state, so browser back/forward and reliable deep links are absent.

Recommendation:

- Add explicit application routes and connect all visible navigation entries to real pages or clearly disabled placeholders.
- Use URL routes for the dashboard, study detail, and editor, for example `/studi/:studyId` and `/studi/:studyId/immobili/:propertyId/planimetria`.
- Mark the current route with accessible navigation state.

### P0-02: Planimetria analysis cannot be saved or resumed

Evidence:

- `apps/web/src/PlanimetriaEditor.tsx:1731-1734` displays `Salva bozza` as a button with no action.
- `apps/web/src/PlanimetriaEditor.tsx:174-193` and `251-313` store selected regions only in in-memory runtime structures.
- `apps/web/src/PlanimetriaEditor.tsx:315-336` resets editor runtime data when opening a different property and loads a sample PDF.

Impact:

- Selected areas, destination usage assignments, scale settings, and computed results are lost when leaving or refreshing the editor.
- A technical operator cannot complete or version a feasibility study.
- The editor is unsuitable for real documents until it has a saved draft and audit path.

Recommendation:

- Define a serializable analysis model: document reference, page, scale, sheet size, masks/polygons, usage, area, coefficient version, calculated values, author, and timestamps.
- Implement `Salva bozza`, unsaved-change protection, reload/resume behavior, and study-version linkage.
- Initially this can persist through a frontend repository abstraction/mock API, provided its contract matches the later backend.

### P0-03: Production-critical identity, data, and document integrations do not exist yet

Evidence:

- Studies and properties are embedded mock objects in `apps/web/src/App.tsx`.
- The only detected frontend network read is `fetch(url)` for a planimetria PDF in `apps/web/src/PlanimetriaEditor.tsx:378`.
- No Clerk, API client, router, S3 access integration, ERP synchronization, or backend persistence is configured in the frontend package.

Impact:

- There is no employee authentication or authorization.
- Displayed companies, studies, documents, and workflow statuses are demonstration data.
- The product cannot yet process Soul data or protect sensitive cadastral documents.

Recommendation:

- Treat this as a known product-readiness gap rather than a styling defect.
- Establish frontend domain interfaces and authentication/routing first, then connect ERP-import, object-storage signed document access, and saved analyses through backend APIs.

### P1-01: Multiple primary commands have no behavior

Evidence:

- Header and global controls without actions: `apps/web/src/App.tsx:1651-1685`, including the displayed `Ctrl K` shortcut, import, notifications, help, and settings.
- Activity controls without actions: `apps/web/src/App.tsx:1570` and `1596-1599`.
- Detail `Invia a ERP` without an action: `apps/web/src/App.tsx:1984-1987`.
- `Visura` document buttons without an action: `apps/web/src/App.tsx:1931-1934` and `2088-2091`.
- Dashboard ERP/PPT commands at `apps/web/src/App.tsx:1301-1304` and `1413-1423` only display messages rather than performing the operation.

Impact:

- The application exposes commands that imply operational effects but either do nothing or only acknowledge a mock operation.
- This creates avoidable operator uncertainty and would be unsafe in a pilot where ERP synchronization matters.

Recommendation:

- Until integrations exist, mark unavailable commands as disabled with a clear prototype status rather than allowing false-success interactions.
- Implement actions from a typed command/service layer so loading, failure, permission, and audit states can be handled consistently.

### P1-02: Opening an immobile does not open its actual planimetria

Evidence:

- `apps/web/src/PlanimetriaEditor.tsx:136-152` contains three fixed example PDFs.
- `apps/web/src/PlanimetriaEditor.tsx:233-236` selects one of those samples from a property-id hash.

Impact:

- Different properties do not have their own document identity.
- The operator cannot trust that the displayed sheet belongs to the selected immobile.

Recommendation:

- Attach `planimetria` and `visura` document metadata to each immobile and pass that exact document reference into the editor.
- Keep example/upload modes only as explicit demo or replacement-document actions.

### P1-03: Area and rendita outputs are not sufficiently controlled for cadastral use

Evidence:

- `apps/web/src/PlanimetriaEditor.tsx:115-134` hardcodes destination usage rates in frontend source.
- `apps/web/src/PlanimetriaEditor.tsx:216-231` computes area from selected rendered pixels, declared A3/A4 sheet area, and manually entered scale.
- The operator can alter sheet format and scale, immediately changing displayed values, without calibration confirmation or recorded provenance.
- `apps/web/src/PlanimetriaEditor.tsx:1780-1784` displays scale constraints but accepts state values using a different lower bound.

Impact:

- Incorrect scale, sheet format, or coefficients can produce authoritative-looking but incorrect areas and estimated rent values.
- Results are not reproducible or auditable for a later review.

Recommendation:

- Validate with Soul which destination categories, coefficients, unit rules, rounding, inclusions/exclusions, and versioning rules constitute the approved calculation.
- Require explicit document calibration and save its source and confirmation state with every analysis version.
- Store coefficient versions server-side or as governed configuration, not only as frontend constants.
- Label any unvalidated output as prototype estimation until the rule set is approved.

### P1-04: Dashboard totals are incorrect when filters have zero matches

Evidence:

- `apps/web/src/App.tsx:1153-1166` uses all studies for summary KPIs when `filteredStudies.length` is zero.
- `apps/web/src/App.tsx:1523-1529` correctly shows that no studies matched in the table.

Impact:

- After a filter returns no companies, the table says zero results while KPI values show totals for the entire dataset.
- An operator can draw incorrect conclusions from filtered reporting.

Recommendation:

- Use an empty filtered set for KPI aggregation whenever filters are active or, more simply, always aggregate `filteredStudies`.
- Provide a distinct empty-state label for zero matching results.

### P1-05: Detail/editor navigation state is fragile and not addressable

Evidence:

- `apps/web/src/App.tsx:1108-1116` initializes local state from limited editor query parameters.
- `apps/web/src/App.tsx:1252-1285` selects screens through component state, not routes.

Impact:

- Refresh, copied links, browser navigation, and concurrent tabs do not consistently preserve operator context.
- A study detail view cannot be linked directly.

Recommendation:

- Move screen identity into routes and keep only UI-local state, such as currently expanded dashboard rows, in components.

### P1-06: Smart selection performance and PDF bundling need hardening

Evidence:

- The editor performs image reading, wall-map construction, and flood-fill style selection in frontend JavaScript over rendered canvas data.
- The production build succeeds but reports PDF.js `eval` usage.
- Production output includes an approximately 1.98 MB PDF worker asset and an approximately 632 KB main JavaScript bundle, triggering Vite chunk-size warnings.

Impact:

- Large scanned plans or high-resolution sheets may block the UI or make selections feel unreliable.
- Bundling and PDF.js version constraints will affect initial load time and security review.

Recommendation:

- Profile selection on representative high-resolution Soul documents and define maximum input/resolution behavior.
- Move expensive analysis to a worker if profiling shows UI blocking.
- Lazy-load the editor/PDF dependencies from its route.
- Review the chosen PDF.js version and worker deployment as part of security and compatibility work.

### P2-01: Export actions do not match their labels or context

Evidence:

- `apps/web/src/App.tsx:1180-1234` implements `Scarica lista Excel` by generating a `.csv` file with `text/csv`, not an `.xlsx` workbook.
- From study detail, the export callback at `apps/web/src/App.tsx:1276-1279` downloads the current dashboard-filtered studies rather than the open study's property data.

Impact:

- Users receive a different format or dataset than the visible action implies.

Recommendation:

- Rename to `Esporta CSV` or produce a valid `.xlsx`.
- Define distinct exports for dashboard study lists and a study's immobili/analysis results.

### P2-02: Expanded company rows conceal part of the immobile list

Evidence:

- `apps/web/src/App.tsx:1863-1888` presents the total number of immobili but renders only `study.properties.slice(0, 6)` with no explicit continuation action in that expanded section.

Impact:

- The expanded summary implies a full detail view while concealing properties after the first six.

Recommendation:

- Show an explicit `Altri N immobili` / `Apri studio completo` affordance adjacent to the truncated preview, or render the complete manageable list.

### P2-03: Accessibility and Italian copy require a pass

Evidence:

- Several search/control inputs rely primarily on placeholder text rather than a persistent label, for example `apps/web/src/App.tsx:1347-1355` and `1651-1659`.
- Icon controls use visual/title cues without consistently expressed accessible names and navigation semantics.
- User-facing Italian copy is written without normal accents in multiple places, such as `fattibilita`, `attivita`, `priorita`, and `Opacita`.

Impact:

- Keyboard and assistive-technology use will be difficult to validate.
- The UI feels unfinished for Italian employees.

Recommendation:

- Add accessible labels, focus/keyboard tests, route/current-page semantics, and dialog/status announcements where relevant.
- Correct Italian UI text as part of a centralized copy review.

### P2-04: Responsive editor layout is likely inefficient on limited-height screens

Evidence:

- `apps/web/src/styles.css:1677-1687` sets substantial minimum heights for the plan canvas.
- `apps/web/src/styles.css:2145-2148` retains a large minimum canvas height on compact screens.
- In stacked layouts, editor controls precede the canvas in document order.

Impact:

- Operators on a laptop or tablet may need excessive scrolling between plan selection and area controls.

Recommendation:

- Validate on the target office hardware and viewports.
- Keep essential selection controls visible near the canvas through a compact/sticky tool strip or reorganized responsive layout.

### P2-05: The frontend has no regression safety net

Evidence:

- No automated test, Playwright, Vitest, or lint configuration was found in the frontend.
- The principal interface code is concentrated in three large files: `App.tsx`, `PlanimetriaEditor.tsx`, and `styles.css`.

Impact:

- Changes to selection geometry, totals, filters, and workflows can regress without detection.
- Feature implementation will become slower as single-file state and rendering responsibilities grow.

Recommendation:

- Introduce targeted automated coverage before substantial integrations: dashboard filter/KPI tests, navigation workflow tests, editor area-calculation tests, PDF/editor smoke tests, and basic accessibility checks.
- Split domain types/data/services and screen-level components along established workflows, without broad cosmetic refactoring.

## What Works Today

The following behaviors are implemented in frontend code and form a usable prototype baseline:

| Area | Current capability | Readiness |
| --- | --- | --- |
| Dashboard presentation | Recent studies table and KPI cards rendered from demo data | Prototype |
| Search/filter/sort | Company/text filtering, status/region/appointment filtering, sorting, and reset logic | Functional on mock data; KPI zero-result defect |
| Company row expansion | Expanded statistics and immobile preview | Functional with six-property truncation |
| Study detail | Opens an individual study screen and lists immobili | Functional local-state view |
| Editor launch | Opens editor from a listed immobile | Functional, using mapped example documents |
| PDF handling | Loads bundled example PDFs or a locally uploaded PDF | Functional prototype |
| Smart selection | Click-based mask/region detection and destination usage assignment | Functional proof of concept |
| Area calculation | Updates square-meter totals based on format and scale | Functional calculation mechanism; rules require validation |
| Editor image export | Composite plan/mask output is available | Functional prototype |
| Dashboard export | CSV download of filtered study rows | Functional but mislabelled as Excel |
| Responsive styling | Desktop and narrow-width layout rules exist | Requires workflow testing on target devices |

## Missing Product Capabilities

| Required capability | Status | Required direction |
| --- | --- | --- |
| Clerk employee authentication | Missing | Authenticated app shell and authorization rules |
| Route-based navigation | Missing | Dashboard, study, editor, documents, activity, and settings routes |
| ERP import and send-back | Mock/inert | API-driven sync status, errors, permissions, and audit trail |
| PostgreSQL/Prisma data persistence | Missing from frontend integration | API contracts and loading/error/state handling |
| S3-compatible documents | Display text only | Signed/read-authorized document retrieval and upload workflow |
| Per-immobile planimetria/visura | Placeholder | Document metadata and correct editor binding |
| Saved editor drafts | Missing | Create/update/resume analysis versions |
| Versioned studies and technical owner | Presentation data only | Persisted version history and ownership workflow |
| Approved rendita computation rules | Prototype constants | Validated configuration and calculation auditability |
| PowerPoint generation/download | Mock | Server-generated artifact and download status |
| Notification/activity workflow | Inert UI | Actual events, timestamps, and navigable actions |

## Recommended Implementation Sequence

### Phase 1: Make the current frontend truthful and navigable

1. Add routing for dashboard, study detail, and planimetria editor.
2. Make sidebar and browser navigation work; disable or label not-yet-built destinations.
3. Remove false-success interactions for ERP, presentation, and document commands until they call implemented services.
4. Fix filtered KPI empty-state behavior and export naming/scope.
5. Add a small smoke-test suite for route navigation, dashboard filtering, and key visible actions.

### Phase 2: Make the editor an actual saved workflow

1. Define types for immobile documents, analysis drafts, selected areas, usage assignments, calibration data, and version metadata.
2. Bind the editor to each immobile's actual planimetria reference.
3. Implement save/resume, unsaved-change warnings, and stored analysis totals through an API-shaped data layer.
4. Validate calibration and computation rules with domain owners before describing outputs as cadastral results.
5. Add tests for area computation, scale changes, save/reload, and representative PDF selection behavior.

### Phase 3: Connect production services

1. Add Clerk authentication and authorized app entry.
2. Integrate backend endpoints for studies, immobili, versions, owners, ERP status, and audit events.
3. Integrate protected S3-compatible PDF retrieval/upload.
4. Implement ERP exchange and generated export/presentation artifacts with explicit progress and error states.

### Phase 4: Quality and operational hardening

1. Profile editor performance on representative multi-page/scanned files.
2. Code-split the editor/PDF worker path and review PDF.js deployment/security constraints.
3. Complete accessibility, keyboard, responsive-height, and Italian copy testing.
4. Add end-to-end tests for the operator's full study workflow.

## Suggested Acceptance Criteria For The Next Implementation Pass

- All sidebar entries either navigate correctly or are visibly disabled as unavailable.
- Dashboard, study detail, and editor have stable URLs and work with browser back/forward.
- Zero-result filters display zero/empty KPIs rather than unfiltered totals.
- Dashboard export label and generated format match; study-level export has the correct content.
- No primary visible button silently does nothing.
- An immobile opens its own configured planimetria reference, not an implicit sample mapping.
- An editor analysis can be saved, reopened, and shown as a draft/version.
- Scale, sheet size, destination usage, coefficients, and total output are recorded in saved analysis data.
- Core route/filter/calculation/save workflows have automated test coverage.

## Verification Notes

- `npm run build --workspace @soul/web` succeeds on 2026-05-25.
- Build warnings remain for PDF.js `eval` usage and large generated JavaScript/PDF worker chunks.
- No automated frontend tests or lint configuration were found.
- Findings about inert buttons and missing integrations are source-confirmed; no production backend or real ERP/S3 environment was available for integration verification.
