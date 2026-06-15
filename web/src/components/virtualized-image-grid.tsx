"use client";

import type { CSSProperties, Key, ReactNode } from "react";
import {
  Fragment,
  cloneElement,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export const IMAGE_GRID_INITIAL_RENDER_LIMIT = 112;

const IMAGE_GRID_MIN_RENDER_ROWS = 12;
const IMAGE_GRID_OVERSCAN_ROWS = 6;
const IMAGE_GRID_TILE_HEIGHT_RATIO = 5 / 4;

type VirtualGridRange = {
  bottomSpacerHeight: number;
  endIndex: number;
  startIndex: number;
  topSpacerHeight: number;
};

type VirtualizedImageGridProps<T> = {
  className: string;
  getItemKey: (item: T, index: number) => Key;
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
};

function initialRange(itemCount: number): VirtualGridRange {
  return {
    bottomSpacerHeight: 0,
    endIndex: Math.min(itemCount, IMAGE_GRID_INITIAL_RENDER_LIMIT),
    startIndex: 0,
    topSpacerHeight: 0,
  };
}

function sameRange(
  left: VirtualGridRange,
  right: VirtualGridRange,
): boolean {
  return (
    left.bottomSpacerHeight === right.bottomSpacerHeight &&
    left.endIndex === right.endIndex &&
    left.startIndex === right.startIndex &&
    left.topSpacerHeight === right.topSpacerHeight
  );
}

function parseCssPixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fallbackColumnCount(containerWidth: number): number {
  if (containerWidth >= 1280) {
    return 7;
  }
  if (containerWidth >= 768) {
    return 5;
  }
  if (containerWidth >= 640) {
    return 3;
  }
  return 2;
}

function measuredColumnCount(
  element: HTMLElement,
  computedStyle: CSSStyleDeclaration,
): number {
  const templateColumns = computedStyle.gridTemplateColumns
    .split(" ")
    .filter((column) => column.trim() !== "" && column.trim() !== "none");

  return templateColumns.length || fallbackColumnCount(element.clientWidth);
}

function calculateRange(
  element: HTMLElement,
  itemCount: number,
): VirtualGridRange {
  if (itemCount <= IMAGE_GRID_INITIAL_RENDER_LIMIT) {
    return {
      bottomSpacerHeight: 0,
      endIndex: itemCount,
      startIndex: 0,
      topSpacerHeight: 0,
    };
  }

  const computedStyle = window.getComputedStyle(element);
  const columns = Math.max(1, measuredColumnCount(element, computedStyle));
  const columnGap = parseCssPixels(computedStyle.columnGap || computedStyle.gap);
  const rowGap = parseCssPixels(computedStyle.rowGap || computedStyle.gap);
  const itemWidth = Math.max(
    1,
    (element.clientWidth - columnGap * (columns - 1)) / columns,
  );
  const rowHeight = itemWidth * IMAGE_GRID_TILE_HEIGHT_RATIO;
  const rowStride = rowHeight + rowGap;
  const totalRows = Math.ceil(itemCount / columns);
  const viewportTop = window.scrollY;
  const viewportBottom = viewportTop + window.innerHeight;
  const gridTop = element.getBoundingClientRect().top + viewportTop;
  const firstVisibleRow = Math.floor((viewportTop - gridTop) / rowStride);
  const lastVisibleRow = Math.ceil((viewportBottom - gridTop) / rowStride);
  const startRow = Math.max(0, Math.min(totalRows, firstVisibleRow - IMAGE_GRID_OVERSCAN_ROWS));
  const minimumEndRow = startRow + IMAGE_GRID_MIN_RENDER_ROWS;
  const endRow = Math.max(
    Math.min(totalRows, lastVisibleRow + IMAGE_GRID_OVERSCAN_ROWS),
    Math.min(totalRows, minimumEndRow),
  );

  return {
    bottomSpacerHeight: Math.max(0, totalRows - endRow) * rowStride,
    endIndex: Math.min(itemCount, endRow * columns),
    startIndex: Math.min(itemCount, startRow * columns),
    topSpacerHeight: startRow * rowStride,
  };
}

function spacerStyle(height: number): CSSProperties {
  return {
    gridColumn: "1 / -1",
    height,
  };
}

function keyedItemNode(node: ReactNode, key: Key): ReactNode {
  if (isValidElement(node)) {
    return cloneElement(node, { key });
  }

  return <Fragment key={key}>{node}</Fragment>;
}

export function VirtualizedImageGrid<T>({
  className,
  getItemKey,
  items,
  renderItem,
}: VirtualizedImageGridProps<T>) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<VirtualGridRange>(() =>
    initialRange(items.length),
  );
  const isWindowed = items.length > IMAGE_GRID_INITIAL_RENDER_LIMIT;
  const startIndex = isWindowed
    ? Math.min(range.startIndex, items.length)
    : 0;
  const endIndex = isWindowed
    ? Math.max(startIndex, Math.min(range.endIndex, items.length))
    : items.length;
  const renderedItems = useMemo(
    () => items.slice(startIndex, endIndex),
    [endIndex, items, startIndex],
  );

  useEffect(() => {
    if (!isWindowed) {
      return;
    }

    const element = gridRef.current;
    if (element === null) {
      return;
    }

    let animationFrame: number | null = null;
    const updateRange = () => {
      animationFrame = null;
      const nextRange = calculateRange(element, items.length);
      setRange((currentRange) =>
        sameRange(currentRange, nextRange) ? currentRange : nextRange,
      );
    };
    const scheduleUpdate = () => {
      if (animationFrame !== null) {
        return;
      }
      animationFrame = window.requestAnimationFrame(updateRange);
    };

    scheduleUpdate();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    const resizeObserver =
      "ResizeObserver" in window
        ? new ResizeObserver(scheduleUpdate)
        : null;
    resizeObserver?.observe(element);

    return () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
      resizeObserver?.disconnect();
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [isWindowed, items.length]);

  const gridChildren: ReactNode[] = [];
  if (isWindowed && range.topSpacerHeight > 0) {
    gridChildren.push(
      <div
        aria-hidden="true"
        data-virtualized-grid-spacer="top"
        key="top-spacer"
        style={spacerStyle(range.topSpacerHeight)}
      />,
    );
  }

  renderedItems.forEach((item, index) => {
    const itemIndex = startIndex + index;
    gridChildren.push(
      keyedItemNode(renderItem(item, itemIndex), getItemKey(item, itemIndex)),
    );
  });

  if (isWindowed && range.bottomSpacerHeight > 0) {
    gridChildren.push(
      <div
        aria-hidden="true"
        data-virtualized-grid-spacer="bottom"
        key="bottom-spacer"
        style={spacerStyle(range.bottomSpacerHeight)}
      />,
    );
  }

  return (
    <div
      className={className}
      data-virtualized-grid={isWindowed ? "true" : undefined}
      ref={gridRef}
    >
      {gridChildren}
    </div>
  );
}
