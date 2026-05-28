# Anacronia

Anacronia is a local-first tool for building museum image collections for later visual analysis, AI, OpenCV, machine learning, clustering, and semantic enrichment.

The MVP targets the Metropolitan Museum of Art collection API. It collects public-domain museum records, stores raw provider metadata, generates local image derivatives, extracts searchable descriptors, and exposes the result through a dense operational web interface.

## Current Status

This repository currently contains planning artifacts only:

- `CONTEXT.md` - domain vocabulary and decisions
- `docs/prd/anacronia-mvp-prd.md` - MVP product requirements

Implementation will be broken into issues before coding starts.

## Planned MVP Shape

- Local Mac-first application
- Next.js + shadcn/ui web interface
- FastAPI backend
- Python worker and image pipeline
- SQLite database
- `standard-1024` and `thumb-256` local image derivatives
- Met provider first
- One active collect job at a time

## Data Directory

Generated data belongs under `./data` by default. The directory is ignored by git except for `data/README.md`.

