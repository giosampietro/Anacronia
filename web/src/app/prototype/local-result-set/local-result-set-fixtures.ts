export type PrototypeScope = "collection" | "library";
export type PrototypeView = "objects" | "images";
export type PrototypeProvider = "all" | "met" | "vam";
export type PrototypeScenario = "normal" | "empty" | "error";
export type PrototypeVariant = "A" | "B";

export type PrototypeCollection = {
  displayName: string;
  importedImageCount: number;
  importedObjectCount: number;
  providerStatus: "ready" | "searching" | "stopped";
  slug: string;
  terms: string[];
};

export type PrototypeImageAsset = {
  descriptors: string[];
  imageAssetId: number;
  imageIndex: number;
  imageRole: "primary" | "additional";
  objectId: number;
  provider: Exclude<PrototypeProvider, "all">;
  thumb: string;
  title: string;
};

export type PrototypeMuseumObject = {
  artistDisplayName: string;
  collectionSlugs: string[];
  descriptors: string[];
  images: PrototypeImageAsset[];
  objectId: number;
  objectName: string;
  provider: Exclude<PrototypeProvider, "all">;
  title: string;
};

function svgThumb({
  accent,
  background,
}: {
  accent: string;
  background: string;
}): string {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 400">
    <defs>
      <linearGradient id="swatch" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stop-color="${accent}"/>
        <stop offset="1" stop-color="${background}"/>
      </linearGradient>
    </defs>
    <rect width="320" height="400" fill="url(#swatch)"/>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const thumbs = {
  antelope: svgThumb({
    accent: "#8bbf9f",
    background: "#29332d",
  }),
  cobra: svgThumb({
    accent: "#d5b16f",
    background: "#3a3024",
  }),
  faience: svgThumb({
    accent: "#5e9eb8",
    background: "#253341",
  }),
  hand: svgThumb({
    accent: "#c18d72",
    background: "#342c2a",
  }),
  mask: svgThumb({
    accent: "#b07f60",
    background: "#2f2d33",
  }),
  serpent: svgThumb({
    accent: "#9baa63",
    background: "#263126",
  }),
  vessel: svgThumb({
    accent: "#a98f73",
    background: "#343025",
  }),
  wing: svgThumb({
    accent: "#8ea4c8",
    background: "#28313c",
  }),
};

export const prototypeCollections: PrototypeCollection[] = [
  {
    displayName: "Snake Study",
    importedImageCount: 10,
    importedObjectCount: 5,
    providerStatus: "searching",
    slug: "snake-study",
    terms: ["snake", "serpent", "cobra"],
  },
  {
    displayName: "Ritual Vessels",
    importedImageCount: 4,
    importedObjectCount: 2,
    providerStatus: "ready",
    slug: "ritual-vessels",
    terms: ["vessel", "libation", "offering"],
  },
  {
    displayName: "Winged Figures",
    importedImageCount: 3,
    importedObjectCount: 2,
    providerStatus: "ready",
    slug: "winged-figures",
    terms: ["wing", "victory", "angel"],
  },
  {
    displayName: "Hands and Gesture",
    importedImageCount: 4,
    importedObjectCount: 2,
    providerStatus: "stopped",
    slug: "hands-and-gesture",
    terms: ["hand", "gesture", "fingers"],
  },
];

export const incomingObject: PrototypeMuseumObject = {
  artistDisplayName: "Unknown maker",
  collectionSlugs: ["snake-study"],
  descriptors: ["snake", "bronze", "amulet", "late period", "egypt"],
  images: [
    {
      descriptors: ["snake", "bronze", "amulet", "inserted while searching"],
      imageAssetId: 901,
      imageIndex: 0,
      imageRole: "primary",
      objectId: 5091,
      provider: "met",
      thumb: thumbs.serpent,
      title: "Bronze serpent amulet",
    },
  ],
  objectId: 5091,
  objectName: "Amulet",
  provider: "met",
  title: "Bronze serpent amulet",
};

export const prototypeObjects: PrototypeMuseumObject[] = [
  {
    artistDisplayName: "Unknown artist",
    collectionSlugs: ["snake-study"],
    descriptors: ["snake", "serpent", "limestone", "egypt", "animal"],
    images: [
      {
        descriptors: ["snake", "limestone", "primary"],
        imageAssetId: 101,
        imageIndex: 0,
        imageRole: "primary",
        objectId: 4101,
        provider: "met",
        thumb: thumbs.serpent,
        title: "Relief fragment with serpent",
      },
      {
        descriptors: ["snake", "detail", "secondary"],
        imageAssetId: 102,
        imageIndex: 1,
        imageRole: "additional",
        objectId: 4101,
        provider: "met",
        thumb: thumbs.cobra,
        title: "Serpent relief detail",
      },
    ],
    objectId: 4101,
    objectName: "Relief fragment",
    provider: "met",
    title: "Relief fragment with serpent",
  },
  {
    artistDisplayName: "Unknown maker",
    collectionSlugs: ["snake-study"],
    descriptors: ["cobra", "faience", "egypt", "blue", "amulet"],
    images: [
      {
        descriptors: ["cobra", "faience", "blue"],
        imageAssetId: 111,
        imageIndex: 0,
        imageRole: "primary",
        objectId: 4111,
        provider: "met",
        thumb: thumbs.cobra,
        title: "Faience cobra amulet",
      },
      {
        descriptors: ["cobra", "side view"],
        imageAssetId: 112,
        imageIndex: 1,
        imageRole: "additional",
        objectId: 4111,
        provider: "met",
        thumb: thumbs.faience,
        title: "Faience cobra side view",
      },
    ],
    objectId: 4111,
    objectName: "Amulet",
    provider: "met",
    title: "Faience cobra amulet",
  },
  {
    artistDisplayName: "Unknown sculptor",
    collectionSlugs: ["snake-study", "ritual-vessels"],
    descriptors: ["serpent", "vessel", "bronze", "ritual", "handle"],
    images: [
      {
        descriptors: ["serpent", "vessel", "handle"],
        imageAssetId: 121,
        imageIndex: 0,
        imageRole: "primary",
        objectId: 4121,
        provider: "met",
        thumb: thumbs.vessel,
        title: "Vessel with serpent handle",
      },
      {
        descriptors: ["serpent", "handle detail"],
        imageAssetId: 122,
        imageIndex: 1,
        imageRole: "additional",
        objectId: 4121,
        provider: "met",
        thumb: thumbs.serpent,
        title: "Serpent handle detail",
      },
    ],
    objectId: 4121,
    objectName: "Vessel",
    provider: "met",
    title: "Vessel with serpent handle",
  },
  {
    artistDisplayName: "Unknown maker",
    collectionSlugs: ["ritual-vessels"],
    descriptors: ["vessel", "libation", "ceramic", "offering"],
    images: [
      {
        descriptors: ["vessel", "ceramic", "offering"],
        imageAssetId: 201,
        imageIndex: 0,
        imageRole: "primary",
        objectId: 4201,
        provider: "met",
        thumb: thumbs.vessel,
        title: "Ritual libation vessel",
      },
      {
        descriptors: ["vessel", "mouth detail"],
        imageAssetId: 202,
        imageIndex: 1,
        imageRole: "additional",
        objectId: 4201,
        provider: "met",
        thumb: thumbs.faience,
        title: "Libation vessel rim",
      },
    ],
    objectId: 4201,
    objectName: "Vessel",
    provider: "met",
    title: "Ritual libation vessel",
  },
  {
    artistDisplayName: "Workshop of Veneto",
    collectionSlugs: ["winged-figures"],
    descriptors: ["wing", "angel", "wood", "painted", "figure"],
    images: [
      {
        descriptors: ["wing", "angel", "painted"],
        imageAssetId: 301,
        imageIndex: 0,
        imageRole: "primary",
        objectId: 4301,
        provider: "vam",
        thumb: thumbs.wing,
        title: "Painted winged figure",
      },
    ],
    objectId: 4301,
    objectName: "Figure",
    provider: "vam",
    title: "Painted winged figure",
  },
  {
    artistDisplayName: "Unknown carver",
    collectionSlugs: ["winged-figures", "hands-and-gesture"],
    descriptors: ["wing", "hand", "gesture", "wood", "saint"],
    images: [
      {
        descriptors: ["wing", "hand", "gesture"],
        imageAssetId: 311,
        imageIndex: 0,
        imageRole: "primary",
        objectId: 4311,
        provider: "met",
        thumb: thumbs.hand,
        title: "Winged figure with raised hand",
      },
      {
        descriptors: ["wing", "profile"],
        imageAssetId: 312,
        imageIndex: 1,
        imageRole: "additional",
        objectId: 4311,
        provider: "met",
        thumb: thumbs.wing,
        title: "Winged figure profile",
      },
    ],
    objectId: 4311,
    objectName: "Figure",
    provider: "met",
    title: "Winged figure with raised hand",
  },
  {
    artistDisplayName: "Unknown maker",
    collectionSlugs: ["hands-and-gesture"],
    descriptors: ["hand", "gesture", "terracotta", "fragment"],
    images: [
      {
        descriptors: ["hand", "gesture", "terracotta"],
        imageAssetId: 401,
        imageIndex: 0,
        imageRole: "primary",
        objectId: 4401,
        provider: "met",
        thumb: thumbs.hand,
        title: "Terracotta hand fragment",
      },
      {
        descriptors: ["hand", "finger detail"],
        imageAssetId: 402,
        imageIndex: 1,
        imageRole: "additional",
        objectId: 4401,
        provider: "met",
        thumb: thumbs.mask,
        title: "Hand fragment detail",
      },
    ],
    objectId: 4401,
    objectName: "Fragment",
    provider: "met",
    title: "Terracotta hand fragment",
  },
  {
    artistDisplayName: "Unknown maker",
    collectionSlugs: ["snake-study", "hands-and-gesture"],
    descriptors: ["mask", "serpent", "hand", "ritual", "wood"],
    images: [
      {
        descriptors: ["mask", "serpent", "ritual"],
        imageAssetId: 501,
        imageIndex: 0,
        imageRole: "primary",
        objectId: 4501,
        provider: "vam",
        thumb: thumbs.mask,
        title: "Ritual mask with serpent pattern",
      },
      {
        descriptors: ["mask", "hand grip"],
        imageAssetId: 502,
        imageIndex: 1,
        imageRole: "additional",
        objectId: 4501,
        provider: "vam",
        thumb: thumbs.antelope,
        title: "Mask hand grip detail",
      },
    ],
    objectId: 4501,
    objectName: "Mask",
    provider: "vam",
    title: "Ritual mask with serpent pattern",
  },
];
