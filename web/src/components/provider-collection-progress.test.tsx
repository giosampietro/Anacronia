import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProviderCollectionProgress } from "./provider-collection-progress";

describe("ProviderCollectionProgress", () => {
  it("renders Provider Source counters without candidate mechanics", () => {
    const html = renderToString(
      <ProviderCollectionProgress
        batchTarget={10}
        importedObjectCount={3}
        importedImageCount={5}
      />,
    );

    expect(html).toContain("Objects");
    expect(html).toContain("3");
    expect(html).toContain("Images");
    expect(html).toContain("5");
    expect(html).toContain("Batch target");
    expect(html).toContain("10");
    expect(html).not.toContain("Candidate");
    expect(html).not.toContain("Progress");
    expect(html).not.toContain("Candidate offset");
  });
});
