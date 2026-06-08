export function createCollectionObjectTileId(
  provider: string,
  objectId: string,
): string {
  return `collection-object-${provider}-${encodeURIComponent(objectId)}`;
}

export function createCollectionImageAssetTileId(imageAssetId: number): string {
  return `collection-image-asset-${imageAssetId}`;
}

export function createLibraryObjectTileId(provider: string, objectId: string): string {
  return `library-object-${provider}-${encodeURIComponent(objectId)}`;
}

export function createLibraryImageAssetTileId(imageAssetId: number): string {
  return `library-image-asset-${imageAssetId}`;
}
