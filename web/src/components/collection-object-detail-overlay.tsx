"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Database,
  ExternalLink,
  FolderMinus,
  Heart,
  ImageIcon,
  Info,
  SearchCheck,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";

import type {
  CollectionObjectDetail,
  CollectionObjectImage,
} from "@/lib/collection-objects";
import { imageUrl } from "@/lib/collection-objects";
import { nextCarouselIndex, previousCarouselIndex } from "@/lib/carousel";
import { formatCollectionDisplayName } from "@/lib/collection-display";
import {
  getObjectDetailOverlayKeyAction,
  shouldHandleObjectDetailOverlayKey,
} from "@/lib/detail-overlay-keyboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type CollectionObjectDetailOverlayProps = {
  apiBaseUrl: string;
  closeHref: string;
  collectionLabels?: string[];
  curationActionsDisabled?: boolean;
  deleteCompletionHref?: string;
  deleteEndpoint?: string;
  detail: CollectionObjectDetail;
  detailKind?: "image" | "object";
  initialImageAssetId?: number | null;
  nextObjectHref?: string | null;
  previousObjectHref?: string | null;
  removeFromCollectionEndpoint?: string;
  returnFocusId: string;
};

type MetadataField = {
  label: string;
  value: string | number | null | undefined;
};

type ProviderMetadataSection = {
  fields: MetadataField[];
  title: string;
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

function rightsStatement(object: CollectionObjectDetail["object"]): string {
  if (object.rights_and_reproduction.trim() !== "") {
    return object.rights_and_reproduction;
  }

  if (object.is_public_domain) {
    return "Public domain";
  }

  return "No rights statement provided.";
}

function imageReferenceLabel(image: CollectionObjectImage, index: number): string {
  const role = image.image_role.trim() || "image";
  const providerIndex =
    image.image_index === null ? "" : `, provider index ${image.image_index}`;
  return `Image ${index + 1} (${role}${providerIndex})`;
}

function imageAspectRatioStyle(image: CollectionObjectImage): CSSProperties | undefined {
  if (image.original_width <= 0 || image.original_height <= 0) {
    return undefined;
  }

  return { aspectRatio: `${image.original_width} / ${image.original_height}` };
}

function imageIndexForAssetId(
  images: CollectionObjectImage[],
  imageAssetId: number | null | undefined,
): number {
  if (imageAssetId === null || imageAssetId === undefined) {
    return 0;
  }

  const index = images.findIndex((image) => image.image_asset_id === imageAssetId);
  return index === -1 ? 0 : index;
}

function imageRoleLabel(image: CollectionObjectImage): string {
  const role = image.image_role.trim();
  return role || "image";
}

function DataPair({ label, value }: MetadataField) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm">{presentValue(value)}</dd>
    </div>
  );
}

function MetadataGrid({ fields }: { fields: MetadataField[] }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {fields.map((field) => (
        <DataPair
          key={`${field.label}-${presentValue(field.value)}`}
          label={field.label}
          value={field.value}
        />
      ))}
    </dl>
  );
}

function ProviderMetadataSectionView({
  section,
}: {
  section: ProviderMetadataSection;
}) {
  return (
    <section className="grid gap-3 rounded-lg border bg-background p-4">
      <h4 className="text-sm font-medium">{section.title}</h4>
      <MetadataGrid fields={section.fields} />
    </section>
  );
}

function createProviderMetadataSections(
  detail: CollectionObjectDetail,
  displayRightsStatement: string,
): ProviderMetadataSection[] {
  return [
    {
      title: "Identity",
      fields: [
        { label: "Provider", value: providerLabel(detail.object.provider) },
        { label: "Object ID", value: detail.object.object_id },
        { label: "Title", value: detail.object.title },
        { label: "Object name", value: detail.object.object_name },
        { label: "Accession", value: detail.object.accession_number },
        { label: "Repository", value: detail.object.repository },
      ],
    },
    {
      title: "Catalog description",
      fields: [
        { label: "Artist", value: detail.object.artist_display_name },
        { label: "Artist bio", value: detail.object.artist_display_bio },
        { label: "Artist nationality", value: detail.object.artist_nationality },
        { label: "Date", value: detail.object.object_date },
        { label: "Department", value: detail.object.department },
        { label: "Classification", value: detail.object.classification },
        { label: "Medium", value: detail.object.medium },
        { label: "Dimensions", value: detail.object.dimensions },
        { label: "Credit line", value: detail.object.credit_line },
      ],
    },
    {
      title: "Rights and record state",
      fields: [
        { label: "Rights", value: displayRightsStatement },
        {
          label: "Public domain",
          value: detail.object.is_public_domain ? "Yes" : "No",
        },
        { label: "Metadata date", value: detail.object.metadata_date },
        { label: "Provider URL", value: detail.object.object_url },
      ],
    },
  ];
}

function ProviderMetadata({
  detail,
  displayRightsStatement,
}: {
  detail: CollectionObjectDetail;
  displayRightsStatement: string;
}) {
  const providerMetadataSections = createProviderMetadataSections(
    detail,
    displayRightsStatement,
  );

  return (
    <section className="grid gap-4">
      <div className="grid gap-1">
        <h3 className="text-base font-medium">Provider metadata</h3>
        <p className="text-sm text-muted-foreground">
          Formatted view of the provider record values available to Anacronia.
        </p>
      </div>

      {providerMetadataSections.map((section) => (
        <ProviderMetadataSectionView key={section.title} section={section} />
      ))}

      <section className="grid gap-3 rounded-lg border bg-background p-4">
        <h4 className="text-sm font-medium">Provider tags</h4>
        {detail.object.tags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {detail.object.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No tags stored.</p>
        )}
      </section>

      <section className="grid gap-3 rounded-lg border bg-background p-4">
        <h4 className="text-sm font-medium">Provider image references</h4>
        <dl className="grid gap-4">
          {detail.images.map((image, index) => (
            <div className="grid gap-1" key={image.image_asset_id}>
              <dt className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
                {imageReferenceLabel(image, index)}
              </dt>
              <dd className="break-all text-sm">{image.source_image_url}</dd>
              <dd className="text-xs text-muted-foreground">
                {image.original_width} x {image.original_height}
              </dd>
            </div>
          ))}
          {detail.skipped_image_references.map((image, index) => (
            <div
              className="grid gap-1"
              key={`${image.source_image_url}-${image.image_role}-${index}`}
            >
              <dt className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
                Skipped image {index + 1}
              </dt>
              <dd className="break-all text-sm">{image.source_image_url}</dd>
              <dd className="text-xs text-muted-foreground">
                {presentValue(image.reason)}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </section>
  );
}

function DetailCard({
  children,
  icon,
  title,
}: {
  children: ReactNode;
  icon: ReactNode;
  title: string;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ObjectFacts({ detail }: { detail: CollectionObjectDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Info className="size-4" />
          Object facts
        </CardTitle>
      </CardHeader>
      <CardContent>
        <MetadataGrid
          fields={[
            { label: "Object name", value: detail.object.object_name },
            { label: "Artist", value: detail.object.artist_display_name },
            { label: "Artist bio", value: detail.object.artist_display_bio },
            { label: "Artist nationality", value: detail.object.artist_nationality },
            { label: "Date", value: detail.object.object_date },
            { label: "Medium", value: detail.object.medium },
            { label: "Dimensions", value: detail.object.dimensions },
            { label: "Department", value: detail.object.department },
            { label: "Classification", value: detail.object.classification },
            { label: "Accession", value: detail.object.accession_number },
            { label: "Credit line", value: detail.object.credit_line },
          ]}
        />
      </CardContent>
    </Card>
  );
}

function ActiveImageCard({
  activeImage,
  activeImageIndex,
}: {
  activeImage: CollectionObjectImage | undefined;
  activeImageIndex: number;
}) {
  if (!activeImage) {
    return null;
  }

  return (
    <DetailCard icon={<ImageIcon className="size-4" />} title="Active image">
      <MetadataGrid
        fields={[
          { label: "Image Asset ID", value: activeImage.image_asset_id },
          { label: "Image number", value: activeImageIndex + 1 },
          { label: "Role", value: imageRoleLabel(activeImage) },
          {
            label: "Provider index",
            value: activeImage.image_index === null ? "Primary" : activeImage.image_index,
          },
          {
            label: "Dimensions",
            value:
              activeImage.original_width > 0 && activeImage.original_height > 0
                ? `${activeImage.original_width} x ${activeImage.original_height}`
                : "Unknown",
          },
          { label: "Source image URL", value: activeImage.source_image_url },
        ]}
      />
    </DetailCard>
  );
}

function ProviderRecordCard({ detail }: { detail: CollectionObjectDetail }) {
  return (
    <DetailCard icon={<ExternalLink className="size-4" />} title="Provider record">
      <MetadataGrid
        fields={[
          { label: "Provider", value: providerLabel(detail.object.provider) },
          { label: "Object ID", value: detail.object.object_id },
          { label: "Metadata date", value: detail.object.metadata_date },
          { label: "Repository", value: detail.object.repository },
        ]}
      />
    </DetailCard>
  );
}

function CollectionsCard({ collectionLabels }: { collectionLabels: string[] }) {
  return (
    <DetailCard icon={<Database className="size-4" />} title="Collections">
      {collectionLabels.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {collectionLabels.map((label) => (
            <Badge key={label} variant="secondary">
              {formatCollectionDisplayName(label)}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No Collection membership stored for this view.
        </p>
      )}
    </DetailCard>
  );
}

function RightsCard({
  displayRightsStatement,
  skippedImageCount,
}: {
  displayRightsStatement: string;
  skippedImageCount: number;
}) {
  return (
    <DetailCard icon={<ShieldCheck className="size-4" />} title="Rights">
      <div className="grid gap-3 text-sm">
        <p>{displayRightsStatement}</p>
        {skippedImageCount > 0 ? (
          <p className="text-muted-foreground">
            {skippedImageCount} related provider image
            {skippedImageCount === 1 ? " was" : "s were"} not imported.
          </p>
        ) : null}
      </div>
    </DetailCard>
  );
}

function MatchDisclosure({
  detail,
  displayRightsStatement,
}: {
  detail: CollectionObjectDetail;
  displayRightsStatement: string;
}) {
  return (
    <details className="group rounded-lg border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4 text-base font-medium">
        <SearchCheck className="size-4 shrink-0" />
        <span className="min-w-0 flex-1">
          Why this object appeared in the Collection
        </span>
        <Badge variant="outline">
          {detail.matches.length} term{detail.matches.length === 1 ? "" : "s"}
        </Badge>
      </summary>
      <div className="grid gap-5 border-t p-4">
        <p className="text-sm text-muted-foreground">
          These terms were found in provider metadata stored locally by Anacronia.
        </p>

        {detail.matches.length === 0 ? (
          <p className="text-sm text-muted-foreground">No match details stored.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {detail.matches.map((match) => (
              <div className="grid gap-3 rounded-lg border bg-background p-4" key={match.search_term}>
                <div className="flex items-start justify-between gap-3">
                  <h4 className="text-base font-medium">{match.search_term}</h4>
                  <Badge variant="secondary">
                    {match.verified ? "Verified" : "Unverified"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {match.matched_fields.length > 0
                    ? `Found in ${match.matched_fields.join(", ")}.`
                    : "No matched fields stored."}
                </p>
              </div>
            ))}
          </div>
        )}

        {detail.object.tags.length > 0 ? (
          <>
            <Separator />
            <div className="flex flex-wrap gap-2">
              {detail.object.tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          </>
        ) : null}

        <Separator />
        <ProviderMetadata
          detail={detail}
          displayRightsStatement={displayRightsStatement}
        />
      </div>
    </details>
  );
}

function ImageStage({
  activeImage,
  activeImageIndex,
  apiBaseUrl,
  detail,
  hasMultipleImages,
  imageCount,
  onImageSelect,
  onNextImage,
  onPreviousImage,
}: {
  activeImage: CollectionObjectImage | undefined;
  activeImageIndex: number;
  apiBaseUrl: string;
  detail: CollectionObjectDetail;
  hasMultipleImages: boolean;
  imageCount: number;
  onImageSelect: (index: number) => void;
  onNextImage: () => void;
  onPreviousImage: () => void;
}) {
  const [loadedStandardImageSrc, setLoadedStandardImageSrc] = useState<string | null>(
    null,
  );

  if (!activeImage) {
    return (
      <figure className="grid min-h-[320px] place-items-center border-y bg-background text-sm text-muted-foreground">
        No image available
      </figure>
    );
  }

  const standardImageSrc = imageUrl(apiBaseUrl, activeImage.standard_url);
  const thumbImageSrc = imageUrl(apiBaseUrl, activeImage.thumb_url);
  const standardImageLoaded = loadedStandardImageSrc === standardImageSrc;
  const aspectRatioStyle = imageAspectRatioStyle(activeImage);
  const image = (
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
        height={activeImage.original_height}
        src={thumbImageSrc}
        width={activeImage.original_width}
      />
      <span aria-hidden="true" className="absolute inset-0 bg-background/15" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt={detail.object.title || `${providerLabel(detail.object.provider)} object ${detail.object.object_id}`}
        className={cn(
          "absolute inset-0 size-full transition-opacity duration-300",
          aspectRatioStyle ? "object-cover" : "object-contain",
          standardImageLoaded ? "opacity-100" : "opacity-0",
        )}
        height={activeImage.original_height}
        onLoad={() => setLoadedStandardImageSrc(standardImageSrc)}
        src={standardImageSrc}
        width={activeImage.original_width}
      />
    </span>
  );

  return (
    <figure className="relative overflow-hidden border-y bg-background leading-none">
      {hasMultipleImages ? (
        <button
          aria-label="Show next image"
          className="block w-full cursor-pointer appearance-none border-0 bg-transparent p-0 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
          onClick={onNextImage}
          type="button"
        >
          {image}
        </button>
      ) : (
        image
      )}

      {hasMultipleImages ? (
        <>
          <Button
            aria-label="Previous image"
            className="absolute left-3 top-1/2 -translate-y-1/2"
            onClick={onPreviousImage}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ChevronLeft data-icon="inline-start" />
          </Button>
          <Button
            aria-label="Next image"
            className="absolute right-3 top-1/2 -translate-y-1/2"
            onClick={onNextImage}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ChevronRight data-icon="inline-start" />
          </Button>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full bg-background/90 px-3 py-1.5 text-sm shadow-sm">
            <span className="tabular-nums">
              {activeImageIndex + 1} / {imageCount}
            </span>
            <span aria-hidden="true" className="h-4 w-px bg-border" />
            <span className="flex gap-2">
              {Array.from({ length: imageCount }).map((_, index) => (
                <button
                  aria-label={`Show image ${index + 1}`}
                  className={cn(
                    "size-2 rounded-full bg-muted-foreground/40 transition-colors",
                    index === activeImageIndex && "bg-foreground",
                  )}
                  key={index}
                  onClick={() => onImageSelect(index)}
                  type="button"
                />
              ))}
            </span>
          </div>
        </>
      ) : null}
    </figure>
  );
}

export function CollectionObjectDetailOverlay({
  apiBaseUrl,
  closeHref,
  collectionLabels = [],
  curationActionsDisabled = false,
  deleteCompletionHref,
  deleteEndpoint,
  detail,
  detailKind = "object",
  initialImageAssetId = null,
  nextObjectHref = null,
  previousObjectHref = null,
  removeFromCollectionEndpoint,
  returnFocusId,
}: CollectionObjectDetailOverlayProps) {
  const router = useRouter();
  const images = detail.images;
  const initialActiveImageIndex = imageIndexForAssetId(images, initialImageAssetId);
  const [activeImageIndex, setActiveImageIndex] = useState(initialActiveImageIndex);
  const [objectFavorite, setObjectFavorite] = useState(detail.object.is_favorite);
  const [imageFavoritesById, setImageFavoritesById] = useState(
    () =>
      new Map(
        images.map((image) => [image.image_asset_id, image.is_favorite] as const),
      ),
  );
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const activeImage = images[Math.min(activeImageIndex, Math.max(images.length - 1, 0))];
  const activeImageFavorite =
    activeImage === undefined
      ? false
      : imageFavoritesById.get(activeImage.image_asset_id) ?? activeImage.is_favorite;
  const hasMultipleImages = images.length > 1;
  const displayRightsStatement = rightsStatement(detail.object);
  const actionNoun = detailKind === "image" ? "image" : "object";
  const activeFavorite = detailKind === "image" ? activeImageFavorite : objectFavorite;

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

  const showPreviousImage = useCallback(() => {
    if (!hasMultipleImages) {
      return;
    }

    setActiveImageIndex((current) => previousCarouselIndex(current, images.length));
  }, [hasMultipleImages, images.length]);

  const navigateToObject = useCallback(
    (href: string) => {
      router.push(href);
    },
    [router],
  );

  async function runDetailCurationAction(
    endpoint: string | undefined,
    action: "delete" | "remove",
  ) {
    if (endpoint === undefined || curationActionsDisabled) {
      return;
    }
    if (detailKind === "image" && activeImage === undefined) {
      return;
    }

    const confirmed = window.confirm(
      action === "remove"
        ? `Remove this ${actionNoun} from this Collection?`
        : `Delete this ${actionNoun}?`,
    );
    if (!confirmed) {
      return;
    }

    const selection =
      detailKind === "image" && activeImage !== undefined
        ? {
            image_asset_ids: [activeImage.image_asset_id],
            objects: [],
          }
        : {
            image_asset_ids: [],
            objects: [
              {
                provider: detail.object.provider,
                object_id: detail.object.object_id,
              },
            ],
          };
    const response = await fetch(endpoint, {
      body: JSON.stringify({ selection }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    if (response.ok) {
      router.push(action === "delete" && deleteCompletionHref ? deleteCompletionHref : closeHref);
      router.refresh();
    }
  }

  async function toggleDetailFavorite() {
    if (detailKind === "image") {
      if (activeImage === undefined) {
        return;
      }

      const nextFavorite = !activeImageFavorite;
      const response = await fetch(
        `/api/image-assets/${activeImage.image_asset_id}/favorite`,
        {
          method: nextFavorite ? "PUT" : "DELETE",
        },
      );

      if (response.ok) {
        setImageFavoritesById((currentFavorites) => {
          const nextFavorites = new Map(currentFavorites);
          nextFavorites.set(activeImage.image_asset_id, nextFavorite);
          return nextFavorites;
        });
        router.refresh();
      }
      return;
    }

    const nextFavorite = !objectFavorite;
    const response = await fetch(
      `/api/objects/${encodeURIComponent(detail.object.provider)}/${detail.object.object_id}/favorite`,
      {
        method: nextFavorite ? "PUT" : "DELETE",
      },
    );

    if (response.ok) {
      setObjectFavorite(nextFavorite);
      router.refresh();
    }
  }

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const panel = panelRef.current;
      const activeElement = document.activeElement;
      const focusIsInsidePanel =
        panel !== null &&
        activeElement instanceof Node &&
        panel.contains(activeElement);

      if (
        !shouldHandleObjectDetailOverlayKey({
          focusIsInsidePanel,
          key: event.key,
        })
      ) {
        return;
      }

      const action = getObjectDetailOverlayKeyAction(event.key, {
        hasMultipleImages,
        nextObjectHref,
        previousObjectHref,
      });

      if (action === null) {
        return;
      }

      if (action.preventDefault) {
        event.preventDefault();
      }

      if (action.kind === "close") {
        closeOverlay();
        return;
      }

      if (action.kind === "previous-image") {
        showPreviousImage();
        return;
      }

      if (action.kind === "next-image") {
        showNextImage();
        return;
      }

      if (action.kind === "next-object" || action.kind === "previous-object") {
        navigateToObject(action.href);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    closeOverlay,
    hasMultipleImages,
    navigateToObject,
    nextObjectHref,
    previousObjectHref,
    showNextImage,
    showPreviousImage,
  ]);

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
      aria-label={`${detail.object.title || "Object"} detail`}
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
        className="relative mx-auto max-w-[1480px] overflow-hidden rounded-lg border bg-background shadow-2xl"
        onKeyDown={handlePanelKeyDown}
        ref={panelRef}
      >
        <header className="relative grid gap-4 border-b p-4 pr-14 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <h2 className="truncate font-heading text-3xl font-semibold md:text-4xl">
              {detail.object.title || "Untitled object"}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {detail.object.object_url ? (
              <a
                className={topActionClassName}
                href={detail.object.object_url}
                rel="noreferrer"
                target="_blank"
              >
                <ExternalLink data-icon="inline-start" />
                Open provider record
              </a>
            ) : null}
            {activeImage?.source_image_url ? (
              <a
                className={topActionClassName}
                href={activeImage.source_image_url}
                rel="noreferrer"
                target="_blank"
              >
                <ImageIcon data-icon="inline-start" />
                Source image
              </a>
            ) : null}
            <Button
              aria-pressed={activeFavorite}
              disabled={detailKind === "image" && activeImage === undefined}
              onClick={toggleDetailFavorite}
              type="button"
              variant="outline"
            >
              <Heart
                className={activeFavorite ? "fill-current" : undefined}
                data-icon="inline-start"
              />
              {activeFavorite ? "Unfavorite" : "Favorite"} {actionNoun}
            </Button>
            {removeFromCollectionEndpoint !== undefined ? (
              <Button
                disabled={curationActionsDisabled}
                onClick={() =>
                  runDetailCurationAction(removeFromCollectionEndpoint, "remove")
                }
                type="button"
                variant="outline"
              >
                <FolderMinus data-icon="inline-start" />
                Remove {actionNoun}
              </Button>
            ) : null}
            <Button
              disabled={curationActionsDisabled || deleteEndpoint === undefined}
              onClick={() => runDetailCurationAction(deleteEndpoint, "delete")}
              type="button"
              variant="destructive"
            >
              <Trash2 data-icon="inline-start" />
              Delete {actionNoun}
            </Button>
          </div>
          <Button
            aria-label="Close object detail"
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

        <ImageStage
          activeImage={activeImage}
          activeImageIndex={activeImageIndex}
          apiBaseUrl={apiBaseUrl}
          detail={detail}
          hasMultipleImages={hasMultipleImages}
          imageCount={images.length}
          onImageSelect={setActiveImageIndex}
          onNextImage={showNextImage}
          onPreviousImage={showPreviousImage}
        />

        <div className="grid gap-5 p-4 md:p-5">
          <ObjectFacts detail={detail} />
          <ActiveImageCard
            activeImage={activeImage}
            activeImageIndex={activeImageIndex}
          />

          <div className="grid gap-4 lg:grid-cols-3">
            <ProviderRecordCard detail={detail} />
            <CollectionsCard collectionLabels={collectionLabels} />
            <RightsCard
              displayRightsStatement={displayRightsStatement}
              skippedImageCount={detail.skipped_image_references.length}
            />
          </div>

          <MatchDisclosure
            detail={detail}
            displayRightsStatement={displayRightsStatement}
          />
        </div>
      </div>
    </div>
  );
}
