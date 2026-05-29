import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProviderCollectionProgress } from "./provider-collection-progress";

describe("ProviderCollectionProgress", () => {
  it("renders a running Provider Collection progress summary", () => {
    const html = renderToString(
      <ProviderCollectionProgress
        continueCandidateOffset={null}
        importedImageCount={0}
        progressLabel="0/100 candidates"
        progressPercent={0}
      />,
    );

    expect(html).toContain("0/100 candidates");
    expect(html).toContain("0%");
    expect(html).toContain("none");
  });
});
