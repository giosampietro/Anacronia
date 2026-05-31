import { IMAGE_GRID_IMAGE_CLASS_NAME } from "@/lib/image-grid-style";

type ImageGridThumbnailProps = {
  alt: string;
  className?: string;
  src: string;
};

export function ImageGridThumbnail({
  alt,
  className = IMAGE_GRID_IMAGE_CLASS_NAME,
  src,
}: ImageGridThumbnailProps) {
  return (
    // Anacronia serves already-sized local thumb-256 derivatives from FastAPI.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={alt}
      className={className}
      decoding="async"
      loading="lazy"
      src={src}
    />
  );
}
