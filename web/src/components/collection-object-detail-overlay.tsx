"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Images,
  X,
} from "lucide-react";

import type { CollectionObjectDetail } from "@/lib/collection-objects";
import { imageUrl } from "@/lib/collection-objects";
import { nextCarouselIndex, previousCarouselIndex } from "@/lib/carousel";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type CollectionObjectDetailOverlayProps = {
  apiBaseUrl: string;
  closeHref: string;
  detail: CollectionObjectDetail;
  returnFocusId: string;
};

type MetadataRow = {
  label: string;
  value: string;
};

function presentMetadataRows(rows: MetadataRow[]): MetadataRow[] {
  return rows;
}

function hasMetadataRows(rows: MetadataRow[]): boolean {
  return rows.length > 0;
}

function MetadataRows({ rows }: { rows: MetadataRow[] }) {
  const presentRows = presentMetadataRows(rows);
  if (presentRows.length === 0) {
    return null;
  }

  return (
    <dl className="grid gap-2 text-sm">
      {presentRows.map((row) => (
        <div className="grid gap-0.5" key={row.label}>
          <dt className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
            {row.label}
          </dt>
          <dd className="text-foreground">{row.value.trim() || "Unknown"}</dd>
        </div>
      ))}
    </dl>
  );
}

function rightsStatement(object: CollectionObjectDetail["object"]): string {
  if (object.rights_and_reproduction.trim() !== "") {
    return object.rights_and_reproduction;
  }

  if (object.is_public_domain) {
    return "Public domain";
  }

  return "No rights statement provided.";
}

export function CollectionObjectDetailOverlay({
  apiBaseUrl,
  closeHref,
  detail,
  returnFocusId,
}: CollectionObjectDetailOverlayProps) {
  const router = useRouter();
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const closeRef = useRef<HTMLAnchorElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const images = detail.images;
  const activeImage = images[Math.min(activeImageIndex, Math.max(images.length - 1, 0))];
  const hasMultipleImages = images.length > 1;
  const sourceRows = [
    { label: "Department", value: detail.object.department },
    { label: "Classification", value: detail.object.classification },
    { label: "Object type", value: detail.object.object_name },
    { label: "Object date", value: detail.object.object_date },
  ];
  const makerRows = [
    { label: "Artist", value: detail.object.artist_display_name },
    { label: "Artist bio", value: detail.object.artist_display_bio },
    { label: "Nationality", value: detail.object.artist_nationality },
  ];
  const physicalRows = [
    { label: "Medium", value: detail.object.medium },
    { label: "Dimensions", value: detail.object.dimensions },
  ];
  const recordRows = [
    { label: "Accession number", value: detail.object.accession_number },
    { label: "Credit line", value: detail.object.credit_line },
    { label: "Repository", value: detail.object.repository },
    { label: "Met metadata date", value: detail.object.metadata_date },
  ];
  const displayRightsStatement = rightsStatement(detail.object);

  const closeOverlay = useCallback(() => {
    document.getElementById(returnFocusId)?.focus();
    router.push(closeHref);
  }, [closeHref, returnFocusId, router]);

  const showNextImage = useCallback(() => {
    if (!hasMultipleImages) {
      return;
    }

    setActiveImageIndex((current) => nextCarouselIndex(current, images.length));
  }, [hasMultipleImages, images.length]);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeOverlay();
      }

      if (!hasMultipleImages) {
        return;
      }

      if (event.key === "ArrowLeft") {
        setActiveImageIndex((current) => previousCarouselIndex(current, images.length));
      }

      if (event.key === "ArrowRight") {
        setActiveImageIndex((current) => nextCarouselIndex(current, images.length));
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeOverlay, hasMultipleImages, images.length]);

  function handlePanelKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") {
      return;
    }

    const panel = panelRef.current;
    if (panel === null) {
      return;
    }

    const focusableElements = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => !element.hasAttribute("disabled"));

    if (focusableElements.length === 0) {
      event.preventDefault();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  return (
    <div
      aria-label={`${detail.object.title} detail`}
      aria-modal="true"
      className="fixed inset-0 z-50 grid bg-background/80 backdrop-blur-sm lg:grid-cols-[340px_minmax(0,1fr)]"
      role="dialog"
    >
      <button
        aria-label="Close object detail"
        className="hidden cursor-default lg:block"
        onClick={closeOverlay}
        type="button"
      />
      <div
        className="min-h-0 overflow-y-auto border-l bg-background shadow-2xl"
        onKeyDown={handlePanelKeyDown}
        ref={panelRef}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-background/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <h2 className="font-heading text-2xl font-semibold leading-tight">
              {detail.object.title || "Untitled object"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Met object {detail.object.object_id}
            </p>
          </div>
          <a
            className={cn(buttonVariants({ size: "icon", variant: "outline" }), "shrink-0")}
            href={closeHref}
            onClick={(event) => {
              event.preventDefault();
              closeOverlay();
            }}
            ref={closeRef}
          >
            <X data-icon="inline-start" />
            <span className="sr-only">Close</span>
          </a>
        </div>

        <div className="flex flex-col gap-5 p-5">
          <div className="relative overflow-hidden rounded-2xl border bg-muted">
            {activeImage ? (
              <>
              {/* Anacronia serves already-sized local derivatives from FastAPI. */}
              {hasMultipleImages ? (
                <button
                  aria-label="Show next image"
                  className="block w-full cursor-pointer appearance-none border-0 bg-transparent p-0 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                  onClick={showNextImage}
                  type="button"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={detail.object.title || `Met object ${detail.object.object_id}`}
                    className="block aspect-[4/3] w-full object-contain"
                    src={imageUrl(apiBaseUrl, activeImage.standard_url)}
                  />
                </button>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={detail.object.title || `Met object ${detail.object.object_id}`}
                  className="block aspect-[4/3] w-full object-contain"
                  src={imageUrl(apiBaseUrl, activeImage.standard_url)}
                />
              )}
              </>
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center text-sm text-muted-foreground">
                No image available
              </div>
            )}

            {hasMultipleImages ? (
              <>
                <Button
                  aria-label="Previous image"
                  className="absolute left-3 top-1/2 -translate-y-1/2"
                  onClick={() =>
                    setActiveImageIndex((current) =>
                      previousCarouselIndex(current, images.length),
                    )
                  }
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <ChevronLeft data-icon="inline-start" />
                </Button>
                <Button
                  aria-label="Next image"
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  onClick={() =>
                    setActiveImageIndex((current) =>
                      nextCarouselIndex(current, images.length),
                    )
                  }
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <ChevronRight data-icon="inline-start" />
                </Button>
                <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1 rounded-full bg-background/80 px-2 py-1">
                  {images.map((image, index) => (
                    <button
                      aria-label={`Show image ${index + 1}`}
                      className={cn(
                        "size-2 rounded-full bg-muted-foreground/40",
                        index === activeImageIndex && "bg-foreground",
                      )}
                      key={image.image_asset_id}
                      onClick={() => setActiveImageIndex(index)}
                      type="button"
                    />
                  ))}
                </div>
              </>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>{`image ${activeImageIndex + 1} of ${Math.max(images.length, 1)}`}</span>
            {hasMultipleImages ? (
              <span className="inline-flex items-center gap-1">
                <Images className="size-4" />
                {images.length} images
              </span>
            ) : null}
          </div>

          <section className="grid gap-3">
            <h3 className="text-sm font-medium">Source</h3>
            <div className="grid gap-3">
              <MetadataRows rows={sourceRows} />
              {detail.object.tags.length > 0 ? (
                <div className="grid gap-2">
                  <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
                    Met tags
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {detail.object.tags.map((tag) => (
                      <Badge key={tag} variant="outline">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="grid gap-0.5 text-sm">
                  <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
                    Met tags
                  </p>
                  <p className="text-foreground">Unknown</p>
                </div>
              )}
              {detail.object.object_url ? (
                <a
                  className="inline-flex w-fit items-center gap-1 text-foreground underline underline-offset-4"
                  href={detail.object.object_url}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open Met object
                  <ExternalLink className="size-3" />
                </a>
              ) : null}
            </div>
          </section>

          {hasMetadataRows(makerRows) ? (
            <>
              <Separator />
              <section className="grid gap-3">
                <h3 className="text-sm font-medium">Maker</h3>
                <MetadataRows rows={makerRows} />
              </section>
            </>
          ) : null}

          {hasMetadataRows(physicalRows) ? (
            <>
              <Separator />
              <section className="grid gap-3">
                <h3 className="text-sm font-medium">Physical details</h3>
                <MetadataRows rows={physicalRows} />
              </section>
            </>
          ) : null}

          {hasMetadataRows(recordRows) ? (
            <>
              <Separator />
              <section className="grid gap-3">
                <h3 className="text-sm font-medium">Record</h3>
                <MetadataRows rows={recordRows} />
              </section>
            </>
          ) : null}

          <Separator />
          <section className="grid gap-3">
            <h3 className="text-sm font-medium">Rights</h3>
            <p className="text-sm text-muted-foreground">
              {displayRightsStatement}
            </p>
          </section>

          <Separator />
          <section className="grid gap-3">
            <h3 className="text-sm font-medium">Why included</h3>
            {detail.matches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No match details stored.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {detail.matches.map((match) => (
                  <Badge key={match.search_term} variant="secondary">
                    {match.search_term}
                    {" · "}
                    {match.verified ? "verified" : "unverified"}
                    {match.matched_fields.length > 0
                      ? ` · ${match.matched_fields.join(", ")}`
                      : ""}
                  </Badge>
                ))}
              </div>
            )}
          </section>

          <Separator />
          <section className="grid gap-3">
            <h3 className="text-sm font-medium">Related images</h3>
            {detail.skipped_image_references.length === 0 ? (
              <p className="text-sm text-muted-foreground">No related images were skipped.</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {`${detail.skipped_image_references.length} related image${
                  detail.skipped_image_references.length === 1 ? "" : "s"
                } skipped by the per-object image limit.`}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
