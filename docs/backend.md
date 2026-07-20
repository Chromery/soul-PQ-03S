# Backend Foundation

## Scope

The current backend establishes persistence for feasibility studies, properties, documents metadata, study versions, and planimetria analysis drafts. Authentication is intentionally not applied yet; Clerk will be introduced in a later phase.

PDF binary storage is not connected in this phase. `PropertyDocument.storageKey` reserves the storage reference needed for an S3-compatible service, while the demonstration PDFs continue to load from frontend public assets.

## Runtime

The application is an npm workspaces monorepo:

- `apps/web`: React and Vite frontend.
- `apps/api`: NestJS API.
- `postgres`: PostgreSQL container managed in `compose.yaml`.
- `postgres-backup`: daily PostgreSQL dump writer managed in `compose.yaml`.

Configuration lives in the root `.env` only. Start from:

```sh
cp .env.example .env
```

Run the deployed-style local stack with:

```sh
docker compose up --build
```

Services:

| Service | URL | Purpose |
| --- | --- | --- |
| Web | `http://localhost:8080` | Nginx-served frontend and `/api` proxy |
| API | `http://localhost:3000/api` | NestJS API |
| PostgreSQL | `localhost:5432` | Prisma-managed database, configurable with `DB_PORT` |
| PostgreSQL backups | `backups/postgres/*.dump` | Daily custom-format `pg_dump` files |

The API container runs `prisma migrate deploy` and the idempotent Prisma seed before starting NestJS.
The backup container creates a dump every day at `BACKUP_TIME_LOCAL` in `BACKUP_TZ`, with local retention controlled by `BACKUP_RETENTION_DAYS`. Each dump is uploaded to the configured B2/S3 bucket under `BACKUP_REMOTE_PREFIX`.

## Database Model

`FeasibilityStudy` stores one ERP-importable study per company. It contains dashboard metrics, commercial and technical ownership, deadlines, appointment state, rendita totals, and notes.

`Property` stores real estate assets linked to a study and their current/prospected rendita and analysis outcome.

`PropertyDocument` stores metadata and object-storage keys for one `PLANIMETRIA`, one `VISURA`, and one `ELENCO_SUBALTERNI` per property. The `(propertyId, type)` unique key keeps each document type singular and allows idempotent replacement.

`StudyVersion` establishes the versioning boundary for technical analysis revisions.

`PlanAnalysisDraft` stores the serialized editor mask payload, calibration values, calculated totals, and its optional associated study version.

## API Endpoints

| Method | Endpoint | Behavior |
| --- | --- | --- |
| `GET` | `/api/health` | Confirms API and database connectivity. |
| `GET` | `/api/studies` | Returns dashboard studies with properties and document filenames. |
| `GET` | `/api/studies/:id` | Returns a single study or `404`. |
| `GET` | `/api/properties/:id/analysis-draft` | Returns a saved editor draft or `null`. |
| `PUT` | `/api/properties/:id/analysis-draft` | Upserts a validated editor draft and links it to the latest study version. |

The editor draft endpoint accepts large JSON bodies because selected area masks include PNG data URLs.

## Prisma Development

With PostgreSQL running, use:

```sh
npm run db:generate
npm run db:migrate
npm run db:seed
npm run db:studio
```

Prisma reads the root `.env`. If `DATABASE_URL` is omitted, local scripts derive it from `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, and `DB_PORT`.

## Backups

Backups are stored outside Git in `backups/postgres`.
They are also uploaded daily to B2/S3. The job runs even if no data changes are detected, because the DB is small and predictable daily restore points are safer than change detection.

List available dumps:

```sh
ls -lh backups/postgres
```

Restore a dump manually:

```sh
docker compose exec -T postgres pg_restore -U soul -d soul_pq --clean --if-exists < backups/postgres/soul_pq-YYYYMMDDTHHMMSSZ.dump
```

Run and upload one backup immediately:

```sh
docker compose run --rm -e BACKUP_ONCE=true postgres-backup
```

## Integration Boundary

Not implemented in this backend phase:

- Clerk authentication and role enforcement.
- ERP import or write-back.
- S3-compatible upload, download, and signed PDF retrieval.
- Presentation generation.
- Audit events and full study version lifecycle operations.
