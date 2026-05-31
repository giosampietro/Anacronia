"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent,
  ReactNode,
} from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Box, ImageIcon, Trash2, X } from "lucide-react";

import type { LibraryImageAssetSummary } from "@/lib/collection-objects";
import { imageUrl } from "@/lib/collection-objects";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type ImageAssetDetailOverlayProps = {
  apiBaseUrl: string;
  closeHref: string;
  imageAsset: LibraryImageAssetSummary;
  nextImageHref?: string | null;
  objectHref: string;
  previousImageHref?: string | null;
  returnFocusId: string;
};

type ImageAssetDetailPendingLinkProps = {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  closeHref: string;
  href: string;
  id: string;
  initialPending?: boolean;
  preview: ImageAssetDetailPreview;
};

type ImageAssetDetailPreview = {
  alt: string;
  height?: number;
  parentTitle?: string;
  providerLabel: string;
  src: string;
  title?: string;
  width?: number;
};

const topActionClassName =
  "inline-flex h-9 items-center gap-2 rounded-md px-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30";

function providerLabel(provider: string): string {
  if (provider === "met") {
    return "Met";
  }

  return provider.trim() || "Unknown";
}

function presentValue(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value).trim();
  return text || "Unknown";
}

function imageAspectRatioStyle(
  width: number | undefined,
  height: number | undefined,
): CSSProperties | undefined {
  if (!width || !height || width <= 0 || height <= 0) {
    return undefined;
  }

  return { aspectRatio: `${width} / ${height}` };
}

function isStandardNavigationClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.shiftKey
  );
}

function ImageAssetStage({
  apiBaseUrl,
  imageAsset,
}: {
  apiBaseUrl: string;
  imageAsset: LibraryImageAssetSummary;
}) {
  const [loadedStandardImageSrc, setLoadedStandardImageSrc] = useState<string | null>(
    null,
  );
  const standardImageSrc = imageUrl(apiBaseUrl, imageAsset.standard_url);
  const thumbImageSrc = imageUrl(apiBaseUrl, imageAsset.thumb_url);
  const standardImageLoaded = loadedStandardImageSrc === standardImageSrc;
  const aspectRatioStyle = imageAspectRatioStyle(
    imageAsset.original_width,
    imageAsset.original_height,
  );
  const alt =
    imageAsset.title ||
    `${providerLabel(imageAsset.provider)} Image Asset ${imageAsset.image_asset_id}`;

  return (
    <figure className="relative overflow-hidden border-y bg-background leading-none">
      <span
        className={cn(
          "relative block w-full overflow-hidden bg-muted",
          !aspectRatioStyle && "min-h-[320px] md:min-h-[520px]",
        )}
        style={aspectRatioStyle}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt=""
          aria-hidden="true"
          className={cn(
            "absolute inset-0 size-full opacity-80 blur-[1px] transition-opacity duration-300",
            aspectRatioStyle ? "object-cover" : "object-contain",
            standardImageLoaded && "opacity-0",
          )}
          height={imageAsset.original_height}
          src={thumbImageSrc}
          width={imageAsset.original_width}
        />
        <span aria-hidden="true" className="absolute inset-0 bg-background/15" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={alt}
          className={cn(
            "absolute inset-0 size-full transition-opacity duration-300",
            aspectRatioStyle ? "object-cover" : "object-contain",
            standardImageLoaded ? "opacity-100" : "opacity-0",
          )}
          height={imageAsset.original_height}
          onLoad={() => setLoadedStandardImageSrc(standardImageSrc)}
          src={standardImageSrc}
          width={imageAsset.original_width}
        />
      </span>
    </figure>
  );
}

function ImageAssetMetadata({ imageAsset }: { imageAsset: LibraryImageAssetSummary }) {
  const fields = [
    {
      label: "Provider",
      value: providerLabel(imageAsset.provider),
    },
    {
      label: "Image Asset ID",
      value: imageAsset.image_asset_id,
    },
    {
      label: "Object ID",
      value: imageAsset.object_id,
    },
    {
      label: "Dimensions",
      value:
        imageAsset.original_width > 0 && imageAsset.original_height > 0
          ? `${imageAsset.original_width} x ${imageAsset.original_height}`
          : "Unknown",
    },
  ];

  return (
    <dl className="grid overflow-hidden rounded-lg border bg-card sm:grid-cols-4 sm:divide-x">
      {fields.map((field) => (
        <div className="min-w-0 p-4" key={field.label}>
          <dt className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
            {field.label}
          </dt>
          <dd className="mt-1 break-words text-sm">{presentValue(field.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function PendingImagePreview({ preview }: { preview: ImageAssetDetailPreview }) {
  const aspectRatioStyle = imageAspectRatioStyle(preview.width, preview.height);

  return (
    <figure className="relative overflow-hidden border-y bg-background leading-none">
      <span
        className={cn(
          "relative block w-full overflow-hidden bg-muted",
          !aspectRatioStyle && "min-h-[320px] md:min-h-[520px]",
        )}
        style={aspectRatioStyle}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={preview.alt}
          className={cn(
            "absolute inset-0 size-full opacity-70 blur-[2px] saturate-75",
            aspectRatioStyle ? "object-cover" : "object-contain",
          )}
          decoding="async"
          fetchPriority="high"
          height={preview.height}
          src={preview.src}
          width={preview.width}
        />
        <span aria-hidden="true" className="absolute inset-0 bg-background/10" />
      </span>
    </figure>
  );
}

function ImageAssetPendingOverlay({
  onClose,
  preview,
}: {
  onClose: () => void;
  preview: ImageAssetDetailPreview;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      aria-label="Loading image detail"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto bg-background/80 p-3 backdrop-blur-sm md:p-5"
      role="dialog"
    >
      <button
        aria-hidden="true"
        className="fixed inset-0 cursor-default"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <div className="relative mx-auto max-w-[1180px] overflow-hidden rounded-lg border bg-background shadow-2xl">
        <header className="relative grid gap-2 border-b p-4 pr-14">
          <Badge className="w-fit" variant="secondary">
            {preview.providerLabel}
          </Badge>
          <h2 className="font-heading text-3xl font-semibold md:text-4xl">
            {preview.title || "Loading image detail"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {preview.parentTitle || "Museum Object"}
          </p>
          <Button
            aria-label="Close image detail"
            className="absolute right-3 top-3"
            onClick={onClose}
            ref={closeRef}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X data-icon="inline-start" />
          </Button>
        </header>

        <PendingImagePreview preview={preview} />

        <div className="grid gap-5 p-4 md:p-5">
          <div className="grid overflow-hidden rounded-lg border bg-card sm:grid-cols-4 sm:divide-x">
            {Array.from({ length: 4 }).map((_, index) => (
              <div className="grid gap-2 p-4" key={index}>
                <Skeleton className="h-3 w-20 rounded-md" />
                <Skeleton className="h-4 w-full rounded-md" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ImageAssetDetailPendingLink({
  ariaLabel,
  children,
  className,
  closeHref,
  href,
  id,
  initialPending = false,
  preview,
}: ImageAssetDetailPendingLinkProps) {
  const router = useRouter();
  const [pending, setPending] = useState(initialPending);

  const closePendingOverlay = useCallback(() => {
    setPending(false);
    router.push(closeHref);
  }, [closeHref, router]);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (isStandardNavigationClick(event)) {
      setPending(true);
    }
  }

  return (
    <>
      <Link
        aria-label={ariaLabel}
        className={className}
        href={href}
        id={id}
        onClick={handleClick}
      >
        {children}
      </Link>
      {pending ? (
        <ImageAssetPendingOverlay
          onClose={closePendingOverlay}
          preview={preview}
        />
      ) : null}
    </>
  );
}

export function ImageAssetDetailOverlay({
  apiBaseUrl,
  closeHref,
  imageAsset,
  nextImageHref = null,
  objectHref,
  previousImageHref = null,
  returnFocusId,
}: ImageAssetDetailOverlayProps) {
  const router = useRouter();
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const title = imageAsset.title || "Untitled object";

  const closeOverlay = useCallback(() => {
    document.getElementById(returnFocusId)?.focus();
    router.push(closeHref);
  }, [closeHref, returnFocusId, router]);

  const navigateToImage = useCallback(
    (href: string) => {
      router.push(href);
    },
    [router],
  );

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const panel = panelRef.current;
      const activeElement = document.activeElement;
      if (
        panel !== null &&
        activeElement instanceof Node &&
        !panel.contains(activeElement)
      ) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closeOverlay();
        return;
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (previousImageHref) {
          navigateToImage(previousImageHref);
        }
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (nextImageHref) {
          navigateToImage(nextImageHref);
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeOverlay, navigateToImage, nextImageHref, previousImageHref]);

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
      aria-label={`${title} image detail`}
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto bg-background/80 p-3 backdrop-blur-sm md:p-5"
      role="dialog"
    >
      <button
        aria-hidden="true"
        className="fixed inset-0 cursor-default"
        onClick={closeOverlay}
        tabIndex={-1}
        type="button"
      />
      <div
        className="relative mx-auto max-w-[1180px] overflow-hidden rounded-lg border bg-background shadow-2xl"
        onKeyDown={handlePanelKeyDown}
        ref={panelRef}
      >
        <header className="relative grid gap-4 border-b p-4 pr-14 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{providerLabel(imageAsset.provider)}</Badge>
              <Badge variant="outline">Image Asset {imageAsset.image_asset_id}</Badge>
            </div>
            <h2 className="truncate font-heading text-3xl font-semibold md:text-4xl">
              Image Asset
            </h2>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {title}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link className={topActionClassName} href={objectHref}>
              <Box data-icon="inline-start" />
              Open object
            </Link>
            <Button disabled type="button" variant="destructive">
              <Trash2 data-icon="inline-start" />
              Delete image
            </Button>
          </div>
          <Button
            aria-label="Close image detail"
            className="absolute right-3 top-3"
            onClick={closeOverlay}
            ref={closeRef}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X data-icon="inline-start" />
          </Button>
        </header>

        <ImageAssetStage apiBaseUrl={apiBaseUrl} imageAsset={imageAsset} />

        <div className="grid gap-5 p-4 md:p-5">
          <ImageAssetMetadata imageAsset={imageAsset} />
          <section className="grid gap-3 rounded-lg border bg-card p-4">
            <h3 className="flex items-center gap-2 text-base font-medium">
              <ImageIcon />
              Parent object
            </h3>
            <p className="text-sm text-muted-foreground">
              {presentValue(imageAsset.object_name)}
              {imageAsset.artist_display_name.trim() !== ""
                ? `, ${imageAsset.artist_display_name}`
                : ""}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
