import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ProviderSearchActionButton } from "./provider-search-action-button";

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

describe("ProviderSearchActionButton", () => {
  it("renders blocked launch actions as unavailable popover triggers", () => {
    formStatus.pending = false;

    const html = renderToString(
      <form>
        <ProviderSearchActionButton
          actionKind="start"
          disabled
          label="Keep searching"
        />
      </form>,
    );

    expect(html).toContain("Keep searching");
    expect(html).toContain("aria-disabled=\"true\"");
    expect(html).toContain("aria-haspopup=\"dialog\"");
    expect(html).toContain("data-disabled=\"true\"");
    expect(html).toContain("type=\"button\"");
    expect(html).not.toContain("type=\"submit\"");
    expect(html).not.toContain("disabled=\"\"");
  });

  it("shows immediate resume feedback while the form is submitting", () => {
    formStatus.pending = true;

    const html = renderToString(
      <form>
        <ProviderSearchActionButton
          actionKind="resume"
          disabled={false}
          label="Resume search"
        />
      </form>,
    );

    expect(html).toContain("Resuming...");
    expect(html).toContain("disabled=\"\"");
    expect(html).toContain("aria-busy=\"true\"");
  });

  it("keeps the idle label when the form is not submitting", () => {
    formStatus.pending = false;

    const html = renderToString(
      <form>
        <ProviderSearchActionButton
          actionKind="stop"
          disabled={false}
          label="Stop search"
        />
      </form>,
    );

    expect(html).toContain("Stop search");
    expect(html).toContain("aria-busy=\"false\"");
  });
});
