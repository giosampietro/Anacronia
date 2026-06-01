export function createCollectionObjectTileId(
  provider: string,
  objectId: number,
): string {
  return `collection-object-${provider}-${objectId}`;
}

export function createCollectionImageAssetTileId(imageAssetId: number): string {
  return `collection-image-asset-${imageAssetId}`;
}

export function createLibraryObjectTileId(provider: string, objectId: number): string {
  return `library-object-${provider}-${objectId}`;
}

export function createLibraryImageAssetTileId(imageAssetId: number): string {
  return `library-image-asset-${imageAssetId}`;
}
