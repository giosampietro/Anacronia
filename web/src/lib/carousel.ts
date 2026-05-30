export function nextCarouselIndex(currentIndex: number, imageCount: number): number {
  if (imageCount <= 0) {
    return 0;
  }

  return (currentIndex + 1) % imageCount;
}

export function previousCarouselIndex(currentIndex: number, imageCount: number): number {
  if (imageCount <= 0) {
    return 0;
  }

  return (currentIndex - 1 + imageCount) % imageCount;
}
