# Smart Selection for Planimetria Areas

This document explains how the current `Editor planimetrie` smart selection works and why it uses a deterministic floor-plan algorithm instead of a heavy AI segmentation approach such as SAM-style image segmentation.

## Goal

The operator opens a planimetria PDF, clicks inside a bounded area, and the app traces that area as a colored mask. The selected mask is then assigned a `destinazione d'uso` such as:

- Capannone
- Uffici
- Tettoie
- Sistemazione esterna
- Verde

`Lotto` is not a destination usage. It is a separate flag that can be applied to any area while retaining that area's actual usage.

The app calculates the selected surface in square meters from the PDF sheet size and scale, then estimates the area contribution using the selected usage coefficient.

The implementation lives in:

- `apps/web/src/PlanimetriaEditor.tsx`

Main functions:

- `buildStructureLayer`
- `buildWallMap`
- `floodFill`
- `makeRegion`
- `areaFromPixels`

## Why Not SAM-Style Segmentation

Earlier experiments with SAM/SAM-style segmentation were more powerful in theory, but overengineered for this task.

For cadastral floor plans, the input is usually not a natural image. It is a technical drawing made of thin vector/raster lines, title blocks, labels, dashed boundaries, and large white areas. A general segmentation model can produce visually impressive masks, but it introduces problems that are bad for an internal cadastral workflow:

- It is probabilistic, while the operator needs predictable behavior.
- It can segment labels, symbols, or page furniture instead of the actual bounded area.
- It does not naturally understand cadastral scale or sheet geometry.
- It adds model hosting, latency, cost, and privacy concerns.
- It is harder to debug when a mask is wrong.
- It can be too broad or too narrow depending on prompt/click behavior.

The current approach is intentionally simpler: treat plan lines as walls, then flood-fill the clicked empty space until those walls are reached. This matches the actual user intent: "select the closed area bounded by the planimetria lines."

## Pipeline Overview

The algorithm has six steps:

1. Render the PDF into a canvas.
2. Build a structural wall map from the PDF linework.
3. Convert the user's click into PDF canvas coordinates.
4. Flood-fill open pixels until wall pixels stop the fill.
5. Convert the filled region into a reusable mask bitmap.
6. Calculate real-world area from selected pixels, sheet size, and scale.

## 1. PDF Rendering

The editor uses `pdfjs-dist` to render the selected PDF page into a canvas.

Important detail: the project currently pins `pdfjs-dist` to `3.11.174` because newer PDF.js versions rendered the provided cadastral PDFs mostly blank. The original working prototype also used `3.11.174`.

The rendered PDF canvas is the base layer. Two additional canvas layers sit above it:

- `maskCanvas`: persistent colored area masks.
- `waveCanvas`: temporary click animation during selection.

## 2. Structure Extraction

The editor tries to extract PDF vector linework using PDF.js operator lists.

`buildStructureLayer` reads drawing operations such as:

- move
- line
- rectangle
- curve
- stroke
- close stroke

It draws those stroked paths into a hidden structure canvas. This is useful because cadastral PDFs often contain real vector paths for walls and boundaries. Vector extraction is cleaner than simply thresholding rendered pixels.

When vector extraction is good enough, the wall map uses this structure canvas. Otherwise it falls back to dark pixels from the rendered PDF.

## 3. Wall Map

`buildWallMap` converts structural linework into a binary map:

- `1` means wall/barrier.
- `0` means open/fillable area.

The map is the same pixel size as the rendered PDF canvas.

The editor applies several cleanup steps:

- **Sensitivity threshold**: decides which dark pixels count as structure when using raster fallback.
- **Structural filtering**: removes small irrelevant components where possible.
- **Gap sealing**: closes small horizontal and vertical gaps.
- **Dashed boundary bridging**: connects dashed lines so flood-fill does not leak through them.
- **Line inflation**: expands wall pixels slightly so thin lines reliably block fill.

These controls are exposed in the UI under `Smart Selection`.

## 4. Click to Seed Point

When the operator clicks the visible planimetria, the app converts browser coordinates into PDF canvas coordinates:

```text
canvasX = clickX * canvasWidth / visibleStageWidth
canvasY = clickY * canvasHeight / visibleStageHeight
```

If the click lands exactly on a line, `findNearestOpen` searches nearby pixels for the best open seed point. This makes the selection more forgiving.

## 5. Flood Fill

`floodFill` starts from the seed point and fills neighboring open pixels until it reaches wall pixels.

It uses a scanline flood-fill strategy instead of recursive fill, so it can handle large planimetria areas without blowing the JavaScript call stack.

The result is:

- pixel count
- bounding box
- seed point
- binary mask

If the filled region is too small, the selection is discarded.

## 6. Mask Creation

`makeRegion` turns the flood-filled binary region into a reusable alpha mask.

Post-processing includes:

- including nearby barrier pixels for a visually complete overlay
- filling small closed holes caused by symbols, labels, or thin artifacts
- computing final bounds
- creating an `alphaCanvas`

Then `createTintedCanvas` paints the selected usage color through that alpha mask. The colored bitmap is drawn onto `maskCanvas`.

If the operator clicks the same region again, the app treats it as a recolor/update rather than creating a duplicate area.

## Area Calculation

Area is calculated from the proportion of selected pixels on the page.

Formula:

```text
selectedAreaM2 =
  selectedPixels / totalPagePixels
  * realSheetWidthM
  * realSheetHeightM
```

The real sheet dimensions come from:

- sheet size: A3 or A4
- scale denominator: for example, `1:500`

Example for A3 at `1:500`:

```text
A3 = 420mm x 297mm
At 1:500:
  0.420m * 500 = 210m
  0.297m * 500 = 148.5m
Full sheet area = 31,185 m2
```

If a mask covers 10% of the rendered page, its calculated area is:

```text
31,185 m2 * 0.10 = 3,118.5 m2
```

This is why the operator must confirm the correct sheet size and scale before trusting the area totals.

## Usage Assignment and Rendita Estimate

Each selected mask has a `destinazione d'uso`. The current frontend uses local coefficients for the prototype.

For each area, the destination value is:

```text
destinationValue = selectedAreaM2 * usageRate
```

Areas marked with the `Lotto` checkbox also receive a lot contribution. The operator chooses one method for the draft:

```text
percentage:
  lotContribution = destinationValue * lotPercentage / 100

per square metre:
  lotContribution = selectedAreaM2 * lotRatePerM2

areaEstimatedValue = destinationValue + lotContribution
```

The initial percentage is `12%`, but it is always editable. This is a fallback reference rather than a universal market coefficient: the Italian Revenue Agency's technical guidance says that the lot should preferably be estimated through a direct market investigation; when suitable information is unavailable, it may normally be estimated at no less than 12% of the construction cost of the structures. Special locations or properties where the land is the predominant component require a specific estimate. See [Agenzia del Territorio, Circolare 6/2012, Allegato Tecnico II, section C1](https://www1.agenziaentrate.gov.it/mt/circolari/Circ_6_Allegato2.pdf).

The proposed cadastral rent then applies the `0.02` saggio di fruttuosita:

```text
newRendita = sum(areaEstimatedValue) * 0.02
```

The editor displays:

- area in square meters
- selected destination usage
- lot inclusion checkbox
- coefficient
- destination value, lot contribution, and their total
- total selected area
- total estimated value
- new rendita
- usage breakdown

These coefficients are placeholders in the frontend and should later come from backend configuration or ERP-derived business rules.

## Strengths

This approach is a good fit for the current product because it is:

- deterministic
- fast in the browser
- private, with no external model call
- explainable to operators and stakeholders
- tunable with visible controls
- naturally aligned with technical drawings
- easy to connect to cadastral scale calculations

## Limitations

The algorithm depends on boundaries being sufficiently closed. It can struggle when:

- the PDF has broken or very faint boundary lines
- labels overlap important boundaries
- the desired area is not actually enclosed
- raster scans are low quality
- title blocks or page furniture are visually denser than the plan itself

The existing controls help mitigate these cases:

- sensitivity
- line width
- gap seal
- dashed boundary bridge
- manual zoom
- upload/reload alternate PDF

## Future Improvements

Good next steps that preserve the current pragmatic approach:

- Save selected masks and usage metadata to the backend.
- Store calibrated sheet size and scale per planimetria.
- Add manual polygon correction for edge cases.
- Add per-area notes.
- Add a "show wall map" debug toggle for internal QA.
- Move usage coefficients to backend configuration.
- Add tests around area calculation and duplicate-region handling.
- Code-split PDF.js so the dashboard bundle stays smaller.

AI segmentation can still be explored later as an optional assistive tool, but it should not replace this deterministic wall-map flood-fill path unless it can prove better accuracy, lower operational complexity, and full traceability.
