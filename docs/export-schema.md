# Export Schema

Anacronia exports one row or JSONL object per imported Image Asset.

## Source metadata fields

The following fields are stable across JSONL manifests, CSV metadata, and package metadata:

- `source_type`: the source class. Current values are `online-provider` and `local-folder`.
- `source_identity`: the stable row-level Image Asset source identity for the export row.
- `source_object_identity`: the stable object identity in `provider:object_id` form, such as `met:40`, `vam:O9138`, or `local-folder:sha256-...`.
- `source_image_identity`: the stable source image identity. Online Provider rows use `provider:source_image_url`; local-folder rows use the private local `local-folder:sha256:...` identity.
- `source_system_number`: V&A `systemNumber` when available; otherwise empty.
- `source_iiif_image_url`: V&A IIIF image URL when available; otherwise empty.

`source_image_url` remains the provider-facing image URL for online Provider rows. For `local-folder` rows it is empty by default so exports do not disclose private absolute source-file paths.
