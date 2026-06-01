import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ProviderSourceControls } from "./provider-source-controls";

const formStatus = vi.hoisted(() => ({
  pending: false,
}));

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();

  return {
    ...actual,
    useFormStatus: () => ({ pending: formStatus.pending }),
  };
});

const searchSet = {
  activeTerms: ["snake"],
  displayName: "Snake",
  importedImageCount: 0,
  importedObjectCount: 0,
  inactiveTerms: [],
  isActive: true,
  providerCollections: [],
  slug: "snake",
  termSummary: "snake",
};

async function noopAction() {
  return undefined;
}

describe("ProviderSourceControls", () => {
  it("renders the initial Met source action when no Provider Source exists yet", () => {
    formStatus.pending = false;

    const html = renderToString(
      <ProviderSourceControls
        collectAvailable={true}
        providerCollections={[]}
        resumeAction={noopAction}
        searchSet={searchSet}
        startAction={noopAction}
        stopAction={noopAction}
      />,
    ).replaceAll("<!-- -->", "");

    expect(html).toContain("Provider Source");
    expect(html).toContain("Met");
    expect(html).toContain("ready");
    expect(html).toContain("Objects");
    expect(html).toContain("Images");
    expect(html).toContain("Start search");
    expect(html).toContain("10 images");
  });

  it("renders paused Provider Source status and resume controls", () => {
    formStatus.pending = false;

    const html = renderToString(
      <ProviderSourceControls
        collectAvailable={true}
        providerCollections={[
          {
            batchTarget: 20,
            candidateLimit: 100,
            candidateOffset: 40,
            continueCandidateOffset: 60,
            importedImageCount: 8,
            importedObjectCount: 3,
            latestRunLabel: "latest",
            nextCandidateOffset: 60,
            pauseReason: "repeated_provider_failures",
            progressLabel: "40 / 100",
            progressPercent: 40,
            provider: "met",
            providerLabel: "Met",
            status: "paused",
          },
        ]}
        resumeAction={noopAction}
        searchSet={searchSet}
        startAction={noopAction}
        stopAction={noopAction}
      />,
    ).replaceAll("<!-- -->", "");

    expect(html).toContain("Paused: repeated provider or download failures.");
    expect(html).toContain("Resume search");
    expect(html).toContain("20 images");
    expect(html).toContain("3");
    expect(html).toContain("8");
  });
});
