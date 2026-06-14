export type LatentMapNeighborhoodClickAction =
  | {
      imageId: string;
      kind: "select";
    }
  | {
      kind: "none";
    };

export function getLatentMapNeighborhoodClickAction({
  activeImageIds,
  clickedImageId,
  isActive,
  selectedImageId,
}: {
  activeImageIds: Set<string>;
  clickedImageId: string | null;
  isActive: boolean;
  selectedImageId: string | null;
}): LatentMapNeighborhoodClickAction {
  if (!isActive || !clickedImageId) {
    return { kind: "none" };
  }

  if (clickedImageId === selectedImageId) {
    return { kind: "none" };
  }

  if (!activeImageIds.has(clickedImageId)) {
    return { kind: "none" };
  }

  return {
    imageId: clickedImageId,
    kind: "select",
  };
}

export function isLatentMapNeighborRequestCurrent({
  latestRequestId,
  requestId,
}: {
  latestRequestId: number;
  requestId: number;
}) {
  return requestId === latestRequestId;
}
