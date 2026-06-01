"use client";

import Link from "next/link";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Images, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCollectionDisplayName } from "@/lib/collection-display";
import { cn } from "@/lib/utils";

type ObjectDetailPreview = {
  alt: string;
  collectionLabel?: string;
  height?: number;
  imageCount?: number;
  providerLabel: string;
  src: string;
  title?: string;
  width?: number;
};

type ObjectDetailPendingLinkProps = {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  closeHref: string;
  href: string;
  id: string;
  initialPending?: boolean;
  preview: ObjectDetailPreview;
};

type ObjectDetailErrorOverlayProps = {
  closeHref: string;
  objectLabel: string;
  returnFocusId: string;
};

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

function PendingSkeletonCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border bg-card p-4", className)}>
      {children}
    </section>
  );
}

function PendingMetadataSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 9 }).map((_, index) => (
        <div className="grid gap-2" key={index}>
          <Skeleton className="h-3 w-20 rounded-md" />
          <Skeleton className="h-4 w-full rounded-md" />
        </div>
      ))}
    </div>
  );
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

function PendingImagePreview({ preview }: { preview: ObjectDetailPreview }) {
  const aspectRatioStyle = imageAspectRatioStyle(preview.width, preview.height);

  return (
    <figure className="relative overflow-hidden border-b bg-background leading-none">
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

function ObjectDetailPendingOverlay({
  onClose,
  preview,
}: {
  onClose: () => void;
  preview: ObjectDetailPreview;
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
      aria-label="Loading object detail"
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
      <div className="relative mx-auto max-w-[1480px] overflow-hidden rounded-lg border bg-background shadow-2xl">
        <header className="relative grid gap-3 border-b p-4 pr-14 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{preview.providerLabel}</Badge>
              {preview.collectionLabel ? (
                <Badge variant="outline">
                  {formatCollectionDisplayName(preview.collectionLabel)}
                </Badge>
              ) : null}
              {preview.imageCount && preview.imageCount > 1 ? (
                <Badge variant="secondary">
                  <Images data-icon="inline-start" />
                  {preview.imageCount}
                </Badge>
              ) : null}
            </div>
            <h2 className="font-heading text-3xl font-semibold md:text-4xl">
              {preview.title || "Loading object detail"}
            </h2>
          </div>
          <div aria-hidden="true" className="hidden gap-2 lg:flex">
            <Skeleton className="h-8 w-36 rounded-md" />
            <Skeleton className="h-8 w-28 rounded-md" />
          </div>
          <Button
            aria-label="Close detail"
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
          <PendingSkeletonCard>
            <div className="mb-4 flex items-center gap-2">
              <Skeleton className="size-4 rounded-md" />
              <Skeleton className="h-5 w-28 rounded-md" />
            </div>
            <PendingMetadataSkeleton />
          </PendingSkeletonCard>

          <div className="grid gap-4 lg:grid-cols-3">
            {["Provider record", "Collections", "Rights"].map((label) => (
              <PendingSkeletonCard key={label}>
                <Skeleton className="mb-4 h-5 w-32 rounded-md" />
                <div className="grid gap-3">
                  <Skeleton className="h-4 w-full rounded-md" />
                  <Skeleton className="h-4 w-3/4 rounded-md" />
                </div>
              </PendingSkeletonCard>
            ))}
          </div>

          <PendingSkeletonCard>
            <div className="mb-4 flex items-center justify-between gap-4">
              <Skeleton className="h-5 w-64 max-w-full rounded-md" />
              <Skeleton className="h-5 w-16 rounded-2xl" />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Skeleton className="h-20 rounded-lg" />
              <Skeleton className="h-20 rounded-lg" />
            </div>
          </PendingSkeletonCard>
        </div>
      </div>
    </div>
  );
}

export function ObjectDetailPendingLink({
  ariaLabel,
  children,
  className,
  closeHref,
  href,
  id,
  initialPending = false,
  preview,
}: ObjectDetailPendingLinkProps) {
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
        <ObjectDetailPendingOverlay
          onClose={closePendingOverlay}
          preview={preview}
        />
      ) : null}
    </>
  );
}

export function ObjectDetailErrorOverlay({
  closeHref,
  objectLabel,
  returnFocusId,
}: ObjectDetailErrorOverlayProps) {
  const router = useRouter();
  const closeRef = useRef<HTMLButtonElement>(null);

  const closeOverlay = useCallback(() => {
    document.getElementById(returnFocusId)?.focus();
    router.push(closeHref);
  }, [closeHref, returnFocusId, router]);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeOverlay();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeOverlay]);

  return (
    <div
      aria-label="Object detail unavailable"
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
      <div className="relative mx-auto grid max-w-xl gap-5 rounded-lg border bg-background p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-2">
            <Badge variant="destructive">
              <AlertCircle data-icon="inline-start" />
              Detail failed
            </Badge>
            <h2 className="font-heading text-3xl font-semibold">
              Object detail unavailable
            </h2>
          </div>
          <Button
            aria-label="Close detail"
            onClick={closeOverlay}
            ref={closeRef}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X data-icon="inline-start" />
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Anacronia could not load {objectLabel}. Try opening the object again.
        </p>
      </div>
    </div>
  );
}
