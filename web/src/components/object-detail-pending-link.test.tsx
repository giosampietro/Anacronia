import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  ObjectDetailErrorOverlay,
  ObjectDetailPendingLink,
} from "./object-detail-pending-link";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe("ObjectDetailPendingLink", () => {
  it("can render an immediate pending overlay with preview, skeletons, and close action", () => {
    const html = renderToString(
      <ObjectDetailPendingLink
        ariaLabel="Open Met Image Asset 9"
        closeHref="/?mode=user-library"
        href="/?mode=user-library&image_asset_id=9&object_provider=met&object_id=40"
        id="library-image-asset-9"
        initialPending
        preview={{
          alt: "Met Image Asset 9",
          collectionLabel: "sNaKe jewelry",
          height: 800,
          imageCount: 3,
          providerLabel: "Met",
          src: "http://127.0.0.1:18670/image-assets/9/thumb",
          title: "Coiled Snake Bowl",
          width: 1600,
        }}
      >
        <span>Tile contents</span>
      </ObjectDetailPendingLink>,
    );

    expect(html).toContain("Tile contents");
    expect(html).toContain("Coiled Snake Bowl");
    expect(html).toContain("left-16");
    expect(html).not.toContain("class=\"fixed inset-0 z-50");
    expect(html).toContain("href=\"/?mode=user-library\"");
    expect(html).toContain("http://127.0.0.1:18670/image-assets/9/thumb");
    expect(html).toContain("aspect-ratio:1600 / 800");
    expect(html).toContain('width="1600"');
    expect(html).toContain('height="800"');
    expect(html).toContain("Met");
    expect(html).toContain("Snake Jewelry");
    expect(html).not.toContain("sNaKe jewelry");
    expect(html).toContain(">3</");
    expect(html).toContain("Close detail");
    expect(html).toContain("data-slot=\"skeleton\"");
  });

  it("does not render the pending overlay until navigation starts", () => {
    const html = renderToString(
      <ObjectDetailPendingLink
        ariaLabel="Open Met object 40"
        closeHref="/?search_set=snake"
        href="/?search_set=snake&object_provider=met&object_id=40"
        id="collection-object-met-40"
        preview={{
          alt: "Met object 40",
          providerLabel: "Met",
          src: "http://127.0.0.1:18670/image-assets/9/thumb",
        }}
      >
        <span>Object tile</span>
      </ObjectDetailPendingLink>,
    );

    expect(html).toContain("Object tile");
    expect(html).not.toContain("Loading object detail");
    expect(html).not.toContain("data-slot=\"skeleton\"");
  });
});

describe("ObjectDetailErrorOverlay", () => {
  it("renders a recoverable failed detail state", () => {
    const html = renderToString(
      <ObjectDetailErrorOverlay
        closeHref="/?search_set=snake"
        objectLabel="Met object 40"
        returnFocusId="collection-object-met-40"
      />,
    );

    expect(html).toContain("Object detail unavailable");
    expect(html).toContain("left-16");
    expect(html).not.toContain("class=\"fixed inset-0 z-50");
    expect(html).toContain("href=\"/?search_set=snake\"");
    expect(html).toContain("Met object 40");
    expect(html).toContain("Close detail");
    expect(html).toContain("Try opening the object again");
  });
});
