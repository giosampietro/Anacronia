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
  const renderForm = (
    props: Partial<Parameters<typeof NewCollectionForm>[0]> = {},
  ) => (
    <NewCollectionForm
      localFolderAction={() => undefined}
      onlineArchiveAction={() => undefined}
      {...props}
    />
  );

  it("renders the two source trajectories before showing source-specific fields", () => {
    formStatus.pending = false;
    const html = renderToString(renderForm()).replaceAll("<!-- -->", "");

    expect(html).toContain("Name the Collection");
    expect(html).toContain("Choose source");
    expect(html).toContain("Online archive");
    expect(html).toContain("Local folder");
    expect(html).not.toContain("Add search terms");
    expect(html).not.toContain("Import folder");
    expect(html).not.toContain("terms detected");
    expect(html).not.toContain("Batch target");
  });

  it("renders online archive fields with no provider selected by default", () => {
    formStatus.pending = false;
    const html = renderToString(
      renderForm({ initialTrajectory: "online-archive" }),
    ).replaceAll("<!-- -->", "");

    expect(html).toContain("Add search terms");
    expect(html).toContain("Choose provider");
    expect(html).toContain("Choose provider</option>");
    expect(html).toContain("Met</option>");
    expect(html).toContain("V&amp;A</option>");
    expect(html).toContain("Images to find");
    expect(html).toContain("10 images");
    expect(html).toMatch(/value="10" selected="">10\s*images/);
    expect(html).toContain("Start search");
  });

  it("renders local folder fields without keyword or batch controls", () => {
    formStatus.pending = false;
    const html = renderToString(
      renderForm({ initialTrajectory: "local-folder" }),
    ).replaceAll("<!-- -->", "");

    expect(html).toContain("Import folder");
    expect(html).toContain("name=\"folder_path\"");
    expect(html).not.toContain("Add search terms");
    expect(html).not.toContain("Images to find");
    expect(html).not.toContain("Start search");
  });

  it("renders the Collection name entry without browser autofill history", () => {
    formStatus.pending = false;

    const html = renderToString(renderForm());

    expect(html).toContain("autoComplete=\"off\"");
    expect(html).toContain("name=\"collection_name_entry\"");
    expect(html).toContain("name=\"display_name\"");
    expect(html).not.toContain("name=\"display_name\" id=\"display_name\"");
  });

  it("shows a duplicate Collection name error when the server redirects back after rejection", () => {
    formStatus.pending = false;

    const html = renderToString(
      renderForm({
        existingCollections: [{ displayName: "Snake Studies", slug: "snake-studies" }],
        serverError: "duplicate_name",
      }),
    );

    expect(html).toContain("A Collection with this name already exists.");
  });

  it("shows immediate feedback while the start search action is pending", () => {
    formStatus.pending = true;

    const html = renderToString(
      renderForm({ initialTrajectory: "online-archive" }),
    );

    expect(html).toContain("Starting...");
    expect(html).toContain("aria-busy=\"true\"");
    expect(html).toContain("disabled=\"\"");
  });
});
