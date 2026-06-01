import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GridViewSwitch } from "./grid-view-switch";

describe("GridViewSwitch", () => {
  it("renders Object and Image links as one shadcn toggle group", () => {
    const html = renderToString(
      <GridViewSwitch
        ariaLabel="Object and Image result views"
        imageCount={38}
        imageHref="/?search_set=snake&view=images&q=ring"
        objectCount={12}
        objectHref="/?search_set=snake&q=ring"
        viewMode="images"
      />,
    );

    expect(html).toContain("data-slot=\"toggle-group\"");
    expect(html).toContain("aria-label=\"Object and Image result views\"");
    expect(html).toContain("aria-label=\"Show Objects\"");
    expect(html).toContain("aria-label=\"Show Images\"");
    expect(html).toContain("href=\"/?search_set=snake&amp;q=ring\"");
    expect(html).toContain("href=\"/?search_set=snake&amp;view=images&amp;q=ring\"");
    expect(html).toContain("aria-current=\"page\"");
    expect(html).toContain("Objects");
    expect(html).toContain("12");
    expect(html).toContain("Images");
    expect(html).toContain("38");
  });
});
