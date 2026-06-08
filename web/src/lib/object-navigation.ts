type ObjectNavigationItem = {
  object_id: string;
  provider: string;
};

type CreateAdjacentObjectHrefsOptions<TItem extends ObjectNavigationItem> = {
  createHref: (item: TItem) => string;
  currentObjectId: string;
  currentProvider: string;
  isCurrentItem?: (item: TItem) => boolean;
  items: TItem[];
};

type CreateAdjacentItemHrefsOptions<TItem> = {
  createHref: (item: TItem) => string;
  isCurrentItem: (item: TItem) => boolean;
  items: TItem[];
};

export function createAdjacentObjectHrefs<TItem extends ObjectNavigationItem>(
  options: CreateAdjacentObjectHrefsOptions<TItem>,
) {
  const currentIndex = options.items.findIndex((item) =>
    options.isCurrentItem
      ? options.isCurrentItem(item)
      : isSameObject(item, options.currentProvider, options.currentObjectId),
  );

  if (currentIndex === -1) {
    return {
      nextObjectHref: null,
      previousObjectHref: null,
    };
  }

  const nextItem = findAdjacentObjectItem(options.items, currentIndex, 1);
  const previousItem = findAdjacentObjectItem(options.items, currentIndex, -1);

  return {
    nextObjectHref: nextItem ? options.createHref(nextItem) : null,
    previousObjectHref: previousItem ? options.createHref(previousItem) : null,
  };
}

export function createAdjacentItemHrefs<TItem>(
  options: CreateAdjacentItemHrefsOptions<TItem>,
) {
  const currentIndex = options.items.findIndex(options.isCurrentItem);

  if (currentIndex === -1) {
    return {
      nextObjectHref: null,
      previousObjectHref: null,
    };
  }

  const previousItem = options.items[currentIndex - 1];
  const nextItem = options.items[currentIndex + 1];

  return {
    nextObjectHref: nextItem ? options.createHref(nextItem) : null,
    previousObjectHref: previousItem ? options.createHref(previousItem) : null,
  };
}

function findAdjacentObjectItem<TItem extends ObjectNavigationItem>(
  items: TItem[],
  currentIndex: number,
  step: 1 | -1,
): TItem | null {
  const currentItem = items[currentIndex];

  for (
    let index = currentIndex + step;
    index >= 0 && index < items.length;
    index += step
  ) {
    const item = items[index];
    if (!isSameObject(item, currentItem.provider, currentItem.object_id)) {
      return item;
    }
  }

  return null;
}

function isSameObject(
  item: ObjectNavigationItem,
  provider: string,
  objectId: string,
): boolean {
  return item.provider === provider && item.object_id === objectId;
}
