import Link from "next/link";
import { Database, Images, Search } from "lucide-react";

import { imageUrl, type LibraryImageAssetSummary } from "@/lib/collection-objects";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

type UserLibraryWorkspaceProps = {
  apiBaseUrl: string;
  filterText: string;
  imageAssets: LibraryImageAssetSummary[];
  imageCount: number;
};

export function createLibraryImageAssetTileId(imageAssetId: number): string {
  return `library-image-asset-${imageAssetId}`;
}

function createLibraryImageAssetHref(
  imageAsset: LibraryImageAssetSummary,
  filterText: string,
): string {
  const params = new URLSearchParams({
    mode: "user-library",
    image_asset_id: String(imageAsset.image_asset_id),
    object_provider: imageAsset.provider,
    object_id: String(imageAsset.object_id),
  });
  const firstCollection = imageAsset.collections[0];
  if (firstCollection !== undefined) {
    params.set("search_set", firstCollection.slug);
  }
  if (filterText.trim() !== "") {
    params.set("filter", filterText.trim());
  }

  return `/?${params.toString()}`;
}

function providerLabel(provider: string): string {
  if (provider === "met") {
    return "Met";
  }

  return provider;
}

function collectionLabel(imageAsset: LibraryImageAssetSummary): string {
  if (imageAsset.collections.length === 0) {
    return "No Collection";
  }

  const [firstCollection, ...extraCollections] = imageAsset.collections;
  return extraCollections.length === 0
    ? firstCollection.display_name
    : `${firstCollection.display_name} +${extraCollections.length}`;
}

function EmptyLibraryState({
  filterText,
  imageCount,
}: {
  filterText: string;
  imageCount: number;
}) {
  const hasFilter = filterText.trim() !== "";
  const isFilteredEmpty = imageCount > 0 && hasFilter;

  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          {isFilteredEmpty ? <Search /> : <Database />}
        </EmptyMedia>
        <EmptyTitle>
          {isFilteredEmpty ? "No matching Image Assets" : "No Image Assets yet"}
        </EmptyTitle>
        <EmptyDescription>
          {isFilteredEmpty
            ? `No Image Assets matched "${filterText.trim()}".`
            : "Start a Collection search to add local Image Assets to the User Library."}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function UserLibraryWorkspace({
  apiBaseUrl,
  filterText,
  imageAssets,
  imageCount,
}: UserLibraryWorkspaceProps) {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-7">
      <header className="flex flex-col gap-3">
        <p className="text-sm font-medium text-muted-foreground">Library</p>
        <h1 className="font-heading text-4xl leading-tight font-semibold tracking-normal md:text-5xl">
          User Library
        </h1>
        <p className="text-sm text-muted-foreground">
          {`${imageCount} collected Image Asset${imageCount === 1 ? "" : "s"} across all Collections.`}
        </p>
      </header>

      {imageAssets.length === 0 ? (
        <EmptyLibraryState filterText={filterText} imageCount={imageCount} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
          {imageAssets.map((imageAsset) => (
            <Link
              aria-label={`Open ${providerLabel(imageAsset.provider)} Image Asset ${imageAsset.image_asset_id}`}
              className="group relative block overflow-hidden rounded-2xl border bg-muted outline-none transition-colors hover:border-ring focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
              href={createLibraryImageAssetHref(imageAsset, filterText)}
              id={createLibraryImageAssetTileId(imageAsset.image_asset_id)}
              key={imageAsset.image_asset_id}
            >
              <AspectRatio ratio={4 / 5}>
                {/* Anacronia serves already-sized local derivatives from FastAPI. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt={`${providerLabel(imageAsset.provider)} Image Asset ${imageAsset.image_asset_id}`}
                  className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-105"
                  src={imageUrl(apiBaseUrl, imageAsset.thumb_url)}
                />
                <div className="absolute inset-x-2 top-2 flex translate-y-1 items-start justify-between gap-2 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
                  <Badge className="min-w-0 max-w-[70%] truncate" variant="secondary">
                    {collectionLabel(imageAsset)}
                  </Badge>
                  {imageAsset.has_sibling_images ? (
                    <Badge className="shrink-0" variant="secondary">
                      <Images data-icon="inline-start" />
                      {imageAsset.image_count}
                    </Badge>
                  ) : null}
                </div>
                <div className="absolute inset-x-0 bottom-0 translate-y-2 p-3 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
                  <Badge variant="secondary">{providerLabel(imageAsset.provider)}</Badge>
                  <p className="sr-only">
                    {imageAsset.collections
                      .map((collection) => collection.display_name)
                      .join(", ")}
                  </p>
                </div>
              </AspectRatio>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
