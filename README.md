# Anacronia

Anacronia is a local-first tool for building museum image collections for later visual analysis, AI, OpenCV, machine learning, clustering, and semantic enrichment.

The MVP targets the Metropolitan Museum of Art collection API. It collects public-domain museum records, stores raw provider metadata, generates local image derivatives, extracts searchable descriptors, and exposes the result through a dense operational web interface.

## Current Status

This repository now contains the local app shell plus planning artifacts:

- `CONTEXT.md` - domain vocabulary and decisions
- `docs/prd/anacronia-mvp-prd.md` - MVP product requirements
- `src/anacronia/` - FastAPI backend, Python worker, CLI, and storage foundation
- `web/` - Next.js and shadcn/ui interface
- `batch-cmd/` - double-clickable Mac commands for local setup and checks

## Planned MVP Shape

- Local Apple Silicon Mac-first application
- Next.js + shadcn/ui web interface
- FastAPI backend
- Python 3.12 worker and image pipeline
- SQLite database
- `standard-1024` and `thumb-256` local image derivatives
- Met provider first
- One active collect job at a time

## Data Directory

Generated data belongs under `./data` by default. The directory is ignored by git except for `data/README.md`.

## Credits

Anacronia is designed and developed by Giorgio Olivero, working publicly as Gio Sampietro.

## Local Setup

Anacronia targets Apple Silicon Macs, M1 or newer. Python work uses Python 3.12.

Double-click these files from Finder when you do not want to type terminal commands:

- `batch-cmd/setup-local-environment.command`
- `batch-cmd/verify-bootstrap.command`
- `batch-cmd/start-anacronia.command`
