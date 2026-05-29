# Anacronia Data

This directory is the default local data root for Anacronia.

Generated databases, raw provider records, image derivatives, temporary downloads, logs, and exports are ignored by git. Keep only this README in version control.

Planned structure:

```text
data/
  anacronia.sqlite
  met/
    raw-api/
      objects/
        436000-436999/
          436535.json
    images/
      436000-436999/
        436535/
          primary-standard-1024.jpg
          primary-thumb-256.jpg
          additional-001-standard-1024.jpg
          additional-001-thumb-256.jpg
  temp/
```
