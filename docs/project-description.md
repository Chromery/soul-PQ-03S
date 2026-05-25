# Project Description

Soul Prospect Qualifier is an internal operational tool for Soul employees who perform feasibility analysis for cadastral rent recalculation.

The application centralizes `studi di fattibilita` imported from Soul's ERP and gives commercial and technical operators a single place to prioritize work, inspect real estate assets, open cadastral documents, and calculate planimetria-based area contributions.

## Problem

Soul's feasibility workflow depends on several pieces of information:

- client company data
- commercial owner
- technical owner
- deadlines and appointments
- current and prospective rendita catastale
- current and prospective IMU
- real estate item count
- planimetrie and visure catastali
- notes and feasibility outcome

Without a dedicated tool, operators must move between ERP records, PDFs, manual calculations, and presentation/export workflows. This slows down analysis and makes prioritization harder.

## Product Goal

The goal is to create a focused internal web app that helps operators:

- monitor recent ERP-imported feasibility studies
- identify urgent studies, especially those with appointments
- compare current and prospective cadastral values
- inspect all properties belonging to a company
- open planimetrie and select relevant areas
- assign cadastral usage categories to selected areas
- calculate area totals from plan scale and sheet size
- prepare results for ERP sync and presentation export

## Current Prototype

The current frontend prototype includes two main work areas.

### Dashboard

The dashboard shows recent `studi di fattibilita` as a dense operational table.

Each row represents a company and can be expanded to show:

- number of real estate assets
- number of assets in category D
- total rendita
- rendita in category D
- notes
- property-level outcomes
- PDF document actions
- a button to open the study detail page

The dashboard also includes search, filters, sorting, summary metrics, and recent activity cards.

### Planimetria Editor

The editor opens from a selected real estate object. In the frontend prototype, three demo immobili are explicitly mapped to the available planimetria PDFs; other immobili accept an uploaded PDF until document storage is integrated.

The operator can:

- select a `destinazione d'uso`
- set sheet size, A3 or A4
- set plan scale, for example `1:500`
- click a bounded area on the planimetria
- generate a colored area mask
- review selected square meters
- review estimated value by usage type
- upload a replacement PDF
- save and restore a browser-local draft of masks and calibration settings
- collapse tool and results panels while the planimetria remains in a fixed central workspace

## Smart Selection Approach

The editor uses a deterministic wall-map flood-fill algorithm instead of SAM-style AI segmentation.

This is intentional. Cadastral floor plans are technical documents with linework, labels, title blocks, and white space. A deterministic line-based method is easier to reason about, cheaper to run, private by default, and better aligned with the operator's action: click inside a bounded area and fill it until the plan lines stop the selection.

Detailed implementation notes are in:

- [Smart Selection for Planimetria Areas](smart-selection.md)

## Intended Architecture

The intended full project architecture is a monorepo with:

- Vite frontend
- NestJS backend
- PostgreSQL database
- Prisma ORM
- S3-compatible object storage
- Clerk authentication

The frontend is currently implemented first. Backend integrations will later replace mocked data, local draft storage, and local PDF examples.

## Intended Users

Primary users:

- Soul commercial operators
- Soul technical operators
- internal reviewers or managers monitoring study progress

The UI is designed in Italian because the operational workflow and cadastral terminology are Italian.

## Future Milestones

Recommended next milestones:

- Add Clerk authentication.
- Add backend app scaffold.
- Model feasibility studies, properties, documents, and planimetria masks in Prisma.
- Persist selected areas and usage assignments.
- Load planimetrie and visure from S3-compatible storage.
- Replace mocked ERP data with real import/sync workflows.
- Generate presentation exports from study data.
- Add role-based access for commercial and technical operators.
- Add audit/history for study versions.
- Add tests around area calculation and smart selection edge cases.
