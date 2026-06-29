# Soul Prospect Qualifier

Soul Prospect Qualifier is an internal web application for Soul employees who manage `studi di fattibilita` for cadastral rent recalculation (`rideterminazione catastale`).

The product helps operators review feasibility studies imported from Soul's ERP, inspect the related real estate assets, open their cadastral documents, and use a planimetria editor to select areas and assign a `destinazione d'uso`.

## Current Scope

This repository contains the operational frontend and its initial persistence backend.

Implemented:

- Vite + React frontend inside an npm workspaces monorepo.
- NestJS API inside `apps/api`.
- PostgreSQL persistence through Prisma 7, including an initial migration and idempotent seed data.
- Docker Compose runtime for the web app, API, and PostgreSQL database.
- Dashboard for ERP-imported `studi di fattibilita`.
- URL-based navigation between dashboard, studies, immobili, study detail, and editor views.
- Collapsible primary navigation sidebar.
- Filtering and sorting by commercial and technical metrics.
- Expandable company rows with real estate asset details.
- Study detail view.
- Immobili overview with direct editor entry.
- Planimetria editor opened from a selected real estate item.
- PDF rendering with PDF.js.
- Smart area selection for planimetria PDFs.
- Area calculation from selected mask pixels, sheet size, and scale.
- Assignment of `destinazione d'uso` to selected areas.
- Server-persisted editor drafts, including masks and calibration settings, with a local fallback when the API is unavailable.
- Collapsible editor panels with an anchored plan workspace and independently scrolling controls.
- CSV export actions.
- Database-loaded studies with a demonstration data fallback for frontend-only development.

Not implemented yet:

- Clerk authentication.
- S3-compatible object storage integration.
- ERP API integration.
- Document upload/download endpoints and signed storage access.
- Full version-management UI for study analysis revisions.

## Product Workflow

1. Soul imports feasibility studies from its ERP.
2. An employee opens the dashboard and searches or filters recent studies.
3. Each table row represents one company.
4. Expanding a row shows the company's real estate assets and analysis status.
5. The operator opens a study or opens a property's planimetria editor.
6. In the editor, the operator selects areas on the planimetria.
7. Each selected area receives a `destinazione d'uso`.
8. The app calculates selected square meters from the planimetria scale and sheet size.
9. The selected areas contribute to the estimated cadastral value workflow.

## Dashboard Features

The dashboard is built around `studi di fattibilita` imported from the ERP.

Current filtering and sorting supports:

- Company text search.
- Study status.
- Region.
- Studies with scheduled appointments.
- Creation date.
- Conclusion date.
- Deadline.
- Next appointment.
- Rendita difference.
- IMU difference.
- Original total rendita.
- Real estate item count.
- Commercial owner.
- Technical owner.

Available frontend action:

- `Esporta lista CSV`
- `Esporta immobili CSV` from a study detail

ERP send/sync, ERP links, presentation generation, and protected document downloads are visible as disabled integration points until their services exist.

## Planimetria Editor

The planimetria editor opens from a selected real estate object. When an imported ERP/S3 planimetria is available for the property, the editor can open it directly from protected document storage.

The editor supports:

- Opening the ERP/S3 planimetria associated with the selected property.
- Uploading a PDF planimetria.
- Smart area selection by clicking inside bounded areas.
- Destination usage selection:
  - Capannone
  - Uffici
  - Tettoie
  - Sistemazione esterna
  - Verde
  - Lotto
- Scale input, for example `1:500`.
- Sheet size selection, with A3 selected by default.
- Area calculation in square meters for every selected mask.
- Per-usage breakdown and estimated area contribution.
- Undo, clear, and PNG export controls.
- Database draft saving and restoration for sample planimetrie, with local fallback.
- Collapsible tools/results panels so the planimetria remains the primary work surface.

Drafts for uploaded PDFs retain the selection analysis but require the operator to reload the uploaded PDF after refreshing the browser. Persistent source-document storage is deferred to the S3-compatible object storage integration.

More detail is documented in:

- [Smart Selection for Planimetria Areas](docs/smart-selection.md)

## Smart Selection Summary

Smart selection is deterministic and tuned for cadastral floor plans. It does not use a segmentation model such as SAM.

The editor renders the PDF into a canvas, extracts or detects linework, builds a wall map, then flood-fills from the clicked point until it reaches detected boundaries. The resulting mask is colored according to the selected `destinazione d'uso`.

This approach was chosen because cadastral planimetrie are technical drawings, not natural images. Deterministic wall-map selection is faster, easier to debug, private by default, and more predictable for operators than model-based segmentation.

## Tech Stack

Frontend:

- React 19
- Vite 6
- TypeScript
- Lucide React icons
- PDF.js via `pdfjs-dist@3.11.174`

Backend and runtime:

- NestJS
- PostgreSQL
- Prisma 7
- Docker Compose

Planned integrations:

- S3-compatible object storage for PDF documents
- Clerk authentication

## Repository Structure

```text
.
├── apps/
│   ├── api/
│   │   ├── prisma/
│   │   │   ├── migrations/
│   │   │   ├── schema.prisma
│   │   │   └── seed.ts
│   │   └── src/
│   └── web/
│       ├── public/
│       │   └── soul_logo_blu.png
│       └── src/
│           ├── App.tsx
│           ├── PlanimetriaEditor.tsx
│           ├── main.tsx
│           └── styles.css
├── docs/
│   ├── project-description.md
│   ├── backend.md
│   └── smart-selection.md
├── compose.yaml
├── editor planimetrie functional reference/
├── visual reference/
├── package.json
└── package-lock.json
```

## Local Development

Install dependencies:

```sh
npm install
```

Create the single root environment file:

```sh
cp .env.example .env
```

Run the complete stack:

```sh
docker compose up --build
```

Open:

```text
Web app:       http://localhost:8080/
API health:    http://localhost:3000/api/health
```

The API container applies migrations and seeds demonstration ERP studies on startup.

Open Prisma Studio against the Compose database from another terminal:

```sh
npm run db:studio
```

For local frontend/API development, start only PostgreSQL through Compose and prepare the database:

```sh
docker compose up -d postgres
npm run db:migrate
npm run db:seed
```

Run the API and frontend with hot reload in separate terminals:

```sh
# Terminal 1
npm run dev:api

# Terminal 2
npm run dev
```

Vite serves the frontend at `http://localhost:5173/` and proxies `/api` to the NestJS application at port `3000`.

Direct editor test URL in local frontend development:

```text
http://localhost:5173/studi/S-2026-0187/immobili/AU-01/planimetria
```

Generate the Prisma client and build:

```sh
npm run build
```

Preview production build:

```sh
npm run preview
```

## Environment And Backups

The root `.env` is the only environment file used by Docker Compose, the API, Prisma, seeds, and import scripts. `apps/api/.env` is obsolete and ignored if it still exists locally.

Compose also starts `postgres-backup`, which creates a PostgreSQL custom-format dump in `backups/postgres` every day at `BACKUP_TIME_LOCAL` in `BACKUP_TZ`. The default is `03:00` Europe/Rome with `BACKUP_RETENTION_DAYS=14`.

Every dump is also uploaded to the configured B2/S3 bucket under `BACKUP_REMOTE_PREFIX`. The backup runs every day regardless of detected changes: the database is small, the cost is negligible, and this avoids fragile change-detection logic.

List available backups:

```sh
ls -lh backups/postgres
```

Restore a dump manually:

```sh
docker compose exec -T postgres pg_restore -U soul -d soul_pq --clean --if-exists < backups/postgres/soul_pq-YYYYMMDDTHHMMSSZ.dump
```

Run and upload one backup immediately for verification:

```sh
docker compose run --rm -e BACKUP_ONCE=true postgres-backup
```

## Notes

`pdfjs-dist` is pinned to `3.11.174` because newer PDF.js versions rendered the provided cadastral PDFs mostly blank during testing. This version matches the working functional reference. Document loading sets `isEvalSupported: false` as the published mitigation for the JavaScript-execution advisory affecting that version.

The seed database uses explicit demo planimetria links stored with each property; actual PDFs are still served from frontend sample assets. ERP import, Clerk authentication, and S3-compatible document storage remain later integrations.

Backend endpoints and database operations are documented in [Backend Foundation](docs/backend.md).
