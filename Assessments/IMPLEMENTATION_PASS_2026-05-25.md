# Frontend Implementation Pass - 2026-05-25

This pass addresses the frontend-operable P0/P1 findings in `FRONTEND_ASSESSMENT_2026-05-25.md`. Production services remain deferred because the repository currently contains no backend, Clerk configuration, ERP API, or object-storage contract.

## Implemented

- URL-based navigation for `/`, `/studi`, `/immobili`, `/analisi`, `/report`, `/impostazioni`, `/attivita`, study detail routes, and editor routes.
- Clickable sidebar navigation with current-page semantics.
- Useful immobili overview with direct links to studies and the planimetria editor.
- Clear pending-integration screens for sections without implemented data services.
- Disabled states for ERP, presentation, date-period, notification, help, and storage-dependent document actions instead of inert or simulated-success buttons.
- Functional `Ctrl+K` global-search focus shortcut.
- Correct KPI totals when dashboard filters return zero matching studies.
- Correct CSV naming and study-specific property export scope.
- Complete immobile listing in expanded study rows rather than silent truncation after six records.
- Explicit mapping of the three provided demo PDFs to `AU-01`, `AU-02`, and `AU-03`; other immobili start with upload/example selection rather than an arbitrary implicit plan.
- Browser-local editor draft save/restore for masks, usage assignments, source identity, scale, sheet format, and selection parameters.
- Unsaved-change protection when leaving an edited planimetria workflow.
- Cross-page selection totals using the original pixel count for each selected page.
- Mask opacity control now updates existing selected areas as well as future selections.
- Visible indication that displayed area-value coefficients are prototype values requiring validation.
- Lazy loading of the PDF/editor bundle from the editor route.

## Deferred Integration Work

- Clerk employee authentication and role authorization.
- Backend APIs, PostgreSQL/Prisma persistence, study versioning, and server-side analysis drafts.
- ERP import/send/link operations.
- Protected S3-compatible planimetria and visura retrieval/upload.
- Approved cadastral coefficient configuration and calculation audit history.
- Document/presentation generation services.
- Automated test suite and performance profiling on production-size PDFs.

## Prototype Persistence Constraint

Sample-plan drafts reopen automatically from browser local storage. Drafts made from an uploaded PDF keep the saved masks and settings, but the PDF itself is not stored locally; after refresh the operator must upload the same PDF again to restore the visual analysis. This prevents the frontend prototype from silently treating local browser storage as a production document repository.

## Verification

- `npm run build --workspace @soul/web` passes.
- The dashboard and `/immobili` views were rendered in headless Firefox at desktop width.
- A delayed headless browser session verified that the editor loads `floor-plant-example.pdf`, renders a `2051 x 2900` canvas, and reaches `Pronto per selezione`.
- The same browser session selected an area, saved a draft, refreshed the route, and restored one saved area with the same displayed total (`1098,42 m2`) and status `Bozza ripristinata`.
- Code splitting reduces the initial application JavaScript output from approximately 645 kB before this pass to approximately 259 kB; the editor is emitted as a separate approximately 372 kB chunk.
- The existing PDF.js warning about `eval` usage remains and needs dependency/security review before production.
