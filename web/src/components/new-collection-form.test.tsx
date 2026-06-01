import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { NewCollectionForm } from "./new-collection-form";

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

describe("NewCollectionForm", () => {
  it("renders the compact locked-definition form without duplicate visible helper state", () => {
    formStatus.pending = false;
    const html = renderToString(<NewCollectionForm action={() => undefined} />)
      .replaceAll("<!-- -->", "");

    expect(html).toContain("Name the Collection");
    expect(html).toContain("Add search terms");
    expect(html).toContain("Search image source");
    expect(html).toContain("Images to find");
    expect(html).toContain("100 images");
    expect(html).toContain("Start search");
    expect(html).not.toContain("terms detected");
    expect(html).not.toContain("Batch target");
  });

  it("renders the Collection name entry without browser autofill history", () => {
    formStatus.pending = false;

    const html = renderToString(<NewCollectionForm action={() => undefined} />);

    expect(html).toContain("autoComplete=\"off\"");
    expect(html).toContain("name=\"collection_name_entry\"");
    expect(html).toContain("name=\"display_name\"");
    expect(html).not.toContain("name=\"display_name\" id=\"display_name\"");
  });

  it("shows a duplicate Collection name error when the server redirects back after rejection", () => {
    formStatus.pending = false;

    const html = renderToString(
      <NewCollectionForm
        action={() => undefined}
        existingCollections={[{ displayName: "Snake Studies", slug: "snake-studies" }]}
        serverError="duplicate_name"
      />,
    );

    expect(html).toContain("A Collection with this name already exists.");
    expect(html).toContain("disabled=\"\"");
  });

  it("shows immediate feedback while the start search action is pending", () => {
    formStatus.pending = true;

    const html = renderToString(<NewCollectionForm action={() => undefined} />);

    expect(html).toContain("Starting...");
    expect(html).toContain("aria-busy=\"true\"");
    expect(html).toContain("disabled=\"\"");
  });
});
