export type CollectionObjectSummary = {
  provider: string;
  object_id: number;
  title: string;
  object_name: string;
  artist_display_name: string;
  image_count: number;
  cover_image_asset_id: number;
  cover_original_width: number;
  cover_original_height: number;
  cover_thumb_url: string;
  has_sibling_images: boolean;
};

export type CollectionResultCounts = {
  objects: number;
  images: number;
};

export type CollectionProviderFacet = {
  provider: string;
  objectCount: number;
  imageCount: number;
};

export type LibraryImageAssetCollection = {
  slug: string;
  display_name: string;
};

export type LibraryObjectSummary = CollectionObjectSummary & {
  collections: LibraryImageAssetCollection[];
};

export type LibraryImageAssetSummary = {
  image_asset_id: number;
  provider: string;
  object_id: number;
  title: string;
  object_name: string;
  artist_display_name: string;
  image_role: string;
  image_index: number | null;
  original_width: number;
  original_height: number;
  image_count: number;
  has_sibling_images: boolean;
  thumb_url: string;
  standard_url: string;
  collections: LibraryImageAssetCollection[];
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
    artist_display_bio: string;
    artist_nationality: string;
    department: string;
    object_date: string;
    medium: string;
    dimensions: string;
    classification: string;
    credit_line: string;
    accession_number: string;
    repository: string;
    tags: string[];
    object_url: string;
    is_public_domain: boolean;
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
