# Soul Prospect Qualifier

Soul Prospect Qualifier is an internal web application for Soul employees who manage `studi di fattibilita` for cadastral rent recalculation (`rideterminazione catastale`).

The product helps operators review feasibility studies imported from Soul's ERP, inspect the related real estate assets, open their cadastral documents, and use a planimetria editor to select areas and assign a `destinazione d'uso`.

## Current Scope

This repository currently focuses on the frontend prototype.

Implemented:

- Vite + React frontend inside an npm workspaces monorepo.
- Dashboard for ERP-imported `studi di fattibilita`.
- Filtering and sorting by commercial and technical metrics.
- Expandable company rows with real estate asset details.
- Study detail view.
- Planimetria editor opened from a selected real estate item.
- PDF rendering with PDF.js.
- Smart area selection for planimetria PDFs.
- Area calculation from selected mask pixels, sheet size, and scale.
- Assignment of `destinazione d'uso` to selected areas.
- Prototype export actions and mocked data.

Not implemented yet:

- Clerk authentication.
- NestJS backend.
- PostgreSQL and Prisma persistence.
- S3-compatible object storage integration.
- ERP API integration.
- Server-side saving of selected planimetria masks.

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

Available prototype actions:

- `Invia a ERP`
- `Download presentazione`
- `Link allo studio sull'ERP`
- `Scarica lista Excel`

## Planimetria Editor

The planimetria editor opens from a selected real estate object. For now, it uses the three sample PDFs in:

```text
apps/web/public/planimetrie/
```

The editor supports:

- Opening one of the sample planimetrie.
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

Planned backend stack:

- NestJS
- PostgreSQL
- Prisma
- S3-compatible object storage
- Clerk authentication

## Repository Structure

```text
.
├── apps/
│   └── web/
│       ├── public/
│       │   ├── planimetrie/
│       │   └── soul_logo_blu.png
│       └── src/
│           ├── App.tsx
│           ├── PlanimetriaEditor.tsx
│           ├── main.tsx
│           └── styles.css
├── docs/
│   ├── project-description.md
│   └── smart-selection.md
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

Run the frontend:

```sh
npm run dev
```

Open:

```text
http://localhost:5173/
```

Direct editor test URL:

```text
http://localhost:5173/?editorStudy=S-2026-0187&editorProperty=AU-01
```

Build:

```sh
npm run build
```

Preview production build:

```sh
npm run preview
```

## Notes

`pdfjs-dist` is pinned to `3.11.174` because newer PDF.js versions rendered the provided cadastral PDFs mostly blank during testing. This version matches the working functional reference.

The current UI uses mocked studies and mocked document references. Backend persistence, ERP import, authentication, and object storage should be added in later phases.
