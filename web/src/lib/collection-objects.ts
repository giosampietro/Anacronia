export type CollectionObjectSummary = {
  provider: string;
  object_id: number;
  title: string;
  object_name: string;
  artist_display_name: string;
  image_count: number;
  cover_image_asset_id: number;
  cover_thumb_url: string;
  has_sibling_images: boolean;
};

export type CollectionObjectImage = {
  image_asset_id: number;
  source_image_url: string;
  image_role: string;
  image_index: number | null;
  original_width: number;
  original_height: number;
  thumb_url: string;
  standard_url: string;
};

export type CollectionObjectMatch = {
  search_term: string;
  verified: boolean;
  matched_fields: string[];
};

export type CollectionObjectSkippedImageReference = {
  source_image_url: string;
  image_role: string;
  image_index: number | null;
  reason: string;
};

export type CollectionObjectDetail = {
  object: {
    provider: string;
    object_id: number;
    title: string;
    object_name: string;
    artist_display_name: string;
    object_url: string;
    rights_and_reproduction: string;
    metadata_date: string;
  };
  images: CollectionObjectImage[];
  matches: CollectionObjectMatch[];
  skipped_image_references: CollectionObjectSkippedImageReference[];
};

export function imageUrl(apiBaseUrl: string, path: string): string {
  return new URL(path, apiBaseUrl).toString();
}
