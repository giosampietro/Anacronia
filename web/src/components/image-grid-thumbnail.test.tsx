import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ImageGridThumbnail } from "./image-grid-thumbnail";

describe("ImageGridThumbnail", () => {
  it("renders grid thumbnails as lazy async-decoded images", () => {
    const html = renderToString(
      <ImageGridThumbnail alt="Snake bracelet" src="/image-assets/9/thumb" />,
    );

    expect(html).toContain('src="/image-assets/9/thumb"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(html).not.toContain("/standard");
  });
});
