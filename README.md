# DOF Pro Simulator/JSON Builder V1.2

DOF Pro Simulator/JSON Builder is a browser-based workflow tool for **DirectOutput Framework (DOF)** development, preview, and table-specific editing.

It combines four major capabilities in one app:

- **DOF simulator** for testing standard DOF effects against your cabinet layout
- **Animation Simulator** for Pinup Popper / VPCLE menu animation effects
- **Visual DOF Builder** for designing DOF strings without hand-authoring every token
- **DOF JSON Builder** for importing, editing, previewing, and exporting table JSON files used with the online DOF Config Tool

This project is intended for virtual pinball builders, DOF authors, cabinet modders, and users who want a safer way to preview complex effects before writing them back to their live config.

## What This App Does

At a high level, the app lets you:

- import your **standard DOF config folder** in one step
- classify and load:
  - `DirectOutputConfig*.ini`
  - `Cabinet.xml`
  - `Cabinet.json`
  - `DirectOutputShapes.xml`
  - `DirectOutputShapes.png`
- simulate matrix, strip, RGB, and toy outputs against your cabinet definition
- preview **Pinup Popper animation effects** from effects CSV/XLSX + GIF + PUPDatabase
- design new effects in a **multi-layer Builder**
- import table JSON files, edit triggers card-by-card, and export updated JSON back to the DOF Config Tool workflow
- author and preview **GIF-backed bitmap effects** for MX targets

## Core Workflows

### 1. Standard DOF File Ingest

The app is built around a **folder-first ingest flow**.

Use **Import DOF Folder** and point the app at the root folder that contains your standard DOF files. The app scans the **folder root only** and automatically loads/categorizes the expected files.

Typical standard files:

- `DirectOutputConfig.ini`
- `DirectOutputConfig2.ini`
- `DirectOutputConfig30.ini`
- `Cabinet.xml`
- `Cabinet.json`
- `DirectOutputShapes.xml`
- `DirectOutputShapes.png`

Manual file slots still exist as a fallback, but the primary workflow is now the DOF folder import.

### 2. Resume / Reset Session

The Configuration panel supports two session recovery tools:

- **Resume Last Workspace**
  - restores the most recent cached session when available
  - useful when continuing the same project without manually reloading everything
- **Start Clean**
  - clears cached workspace state, Builder draft/session references, and imported DOF folder indexes
  - use this when changing cabinets, troubleshooting suspicious cached labels, or forcing a clean reload

### 3. Table View Simulation

Once your DOF files are loaded, the app can simulate standard DOF behavior for ROM-triggered table outputs.

This includes:

- matrix/mx sections
- LED strips
- RGB toys
- physical toy mappings
- combo/group routing where cabinet data is available

The simulator is designed to help you understand how a trigger resolves visually and where that output is routed on your cabinet.

### 4. Animation Simulator

The Animation Simulator is for **Pinup Popper / VPCLE** users.

Load:

- the effects spreadsheet (`.xlsx` or `.csv`)
- the menu GIF
- `PUPDatabase.db`

Then the app can:

- browse E-code entries
- render the selected bitmap frame(s) on the matrix
- fire associated LED strip and RGB toy effects
- show row details in the monitor for preview and troubleshooting

This is especially useful for menu animation work where the matrix bitmap and the supporting cabinet effects need to be previewed together.

### 5. DOF Builder

The DOF Builder is the visual effect designer.

Instead of hand-typing a full DOF string from scratch, you can build it layer by layer using visual controls for:

- color
- effect/timing
- plasma
- area/motion
- bitmap
- sparkle
- shapes

The Builder generates the DOF string in real time and previews it on the matrix and target sections.

Key Builder concepts:

- multi-layer design
- add / copy / delete layers
- generated DOF string window
- live matrix preview
- target section isolation
- filter bars for supported/modified/unsupported/combo categories
- link/sync behavior for coordinated preview

### 6. DOF JSON Builder

The JSON Builder is the table-specific editing mode.

Import a table JSON exported from the online DOF Config Tool and the app will:

- parse the table definition
- split toys into cards
- show trigger chips and effect rows per card
- let you preview/edit line-level effects using the same Builder controls
- export the edited JSON back out for round-trip use with the DOF Config Tool

This is the safest way in the app to make table-specific edits that preserve:

- table context
- toy IDs / ports
- trigger grouping
- public/user effect rows

## Bitmap Workflow

One of the biggest additions in this version is Builder-side bitmap authoring for MX targets.

### Required Concept

Bitmap preview in JSON Builder depends on:

- the **table JSON**
- the **matching GIF bitmap source**

The app can now auto-load a bitmap GIF for a table if:

- a DOF folder has already been imported, and
- a root-level GIF exists whose filename matches the table ROM name

Example:

- ROM: `flashgdn`
- GIF: `flashgdn.gif`

If a matching `ROM.gif` exists in the imported DOF folder root, the Builder can auto-load it for that table.

### Manual Bitmap Loading

If no matching `ROM.gif` is available, you can still use **Load Table Bitmap** in the Builder.

### Bitmap Parameters

The bitmap section exposes the authored DOF controls used for GIF-backed matrix effects:

- `ABL`, `ABT`
  - crop origin (left/top)
- `ABW`, `ABH`
  - crop size (width/height)
- `ABF`
  - base frame
- `AAC`
  - animation frame count
- `AAF`
  - animation speed (frames per second)
- `AAD`
  - step direction
- `AAS`
  - step amount
- `AAB`
  - behavior (loop / one-shot / etc.)

### Important Bitmap Notes

- Builder bitmap preview is an **authoring aid**
- the matrix **Trim** slider is preview-only and does **not** write into the DOF string
- to see the same bitmap behavior in live gameplay, the authored effect must be exported back into your table JSON / DOF Config Tool workflow and the appropriate GIF must exist in your real DOF environment

## Plasma, Motion, and Advanced Controls

This version also expands Builder authoring coverage for advanced effect tokens, including:

- plasma controls
- bitmap controls
- `ASS`
- `ASSMS`
- `ASA`

These can now be previewed and authored through the Builder/JSON Builder instead of requiring manual token entry for many workflows.

## Layout and Workspace Features

The Builder workspace now supports richer editing ergonomics:

- drag cards to reorder them
- save **global layout**
- save **table layout**
- reset table layout
- resizable windows/panels in the Builder workspace
- scroll/paging when more than six layers are present
- generated DOF string highlighting for currently active effect segments during preview

These features are meant to make larger table projects easier to manage over repeated sessions.

## What This App Does Not Do

This is important:

- the **standard simulator side** of the app is a simulator and preview tool
- it does **not** directly edit your INI files on disk

The two safe write-back paths are:

- manual transcription into the online DOF Config Tool
- JSON Builder export back to a table JSON file, which is then re-imported into the online DOF Config Tool

The DOF Config Tool remains the authoritative source for generating the final `DirectOutputConfig*.ini` files your cabinet runs.

## Typical End-to-End Workflow

### Standard DOF authoring workflow

1. Import your DOF folder
2. Load or confirm your cabinet/shapes/config files
3. Open the simulator or Builder
4. Design or tune the effect
5. Copy the generated DOF string or export staged output
6. Enter the result into the online DOF Config Tool
7. Regenerate your real DOF config files

### Table JSON round-trip workflow

1. Export a table JSON from the online DOF Config Tool
2. Import that JSON into DOF JSON Builder
3. Edit trigger rows / cards / layers
4. Load or auto-load the matching table bitmap if needed
5. Preview and tune the effect
6. Export the edited JSON
7. Re-import the JSON into the online DOF Config Tool
8. Regenerate the live DOF config files

## File Expectations

### Standard DOF files

Expected in the selected DOF folder root:

- `DirectOutputConfig*.ini`
- `Cabinet.xml`
- `Cabinet.json`
- `DirectOutputShapes.xml`
- `DirectOutputShapes.png`

### Animation Simulator files

Required only for Anim Sim workflows:

- Pinup menu effects spreadsheet (`.xlsx` / `.csv`)
- Pinup menu GIF
- `PUPDatabase.db`

### Table JSON Builder files

For full bitmap-authoring workflows:

- exported table JSON
- matching `ROM.gif` in the imported DOF folder root, or manual bitmap load

## Running Locally

You can run the app directly from this folder, but a local web server is usually the easiest way to avoid browser edge cases.

Simple Python example:

```bash
python -m http.server 8123
```

Then open:

```text
http://127.0.0.1:8123/
```

## Main Files

- `index.html`
- `style_V1.2.css`
- `app_V1.2.js`
- `builder_json.js`
- `dof_shared_core.js`
- `dof_shared_parser.js`
- `dof_shared_matrix_model.js`
- `dof_shared_matrix_eval.js`
- `dof_shared_qa.js`
- `example_library.js`
- `example_library_matrix.js`
- `example_library_strip.js`

## Repo Scope

This repository should contain the app source and publish-safe project files only.

Included:

- application source in this folder
- minimal package metadata for local tooling
- documentation such as this README

Excluded:

- personal cabinet files
- downloaded/private DOF config sets
- local cache/output folders
- temporary scratch files
- unrelated historical working directories from the larger workspace

See [REPO_FILE_LIST.md](./REPO_FILE_LIST.md) for the repo include/exclude checklist.

## Audience

This project is best suited for:

- virtual pinball cabinet builders
- DOF effect authors
- Pinup Popper / VPCLE authors
- users who want a safer preview/edit loop before pushing changes into their live cabinet config

## Status

This repository is the cleaned `V1.2` release candidate prepared for GitHub publication from the current DOF Pro-Series Simulator codebase.
