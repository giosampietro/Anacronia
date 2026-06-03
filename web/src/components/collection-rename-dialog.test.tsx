import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CollectionRenameDialogForm } from "./collection-rename-dialog";
import { Dialog } from "./ui/dialog";

describe("CollectionRenameDialogForm", () => {
  it("renders Anacronia rename copy with the current Collection name selected", () => {
    const html = renderToString(
      <Dialog open>
        <CollectionRenameDialogForm
          collectionName="Snake Studies"
          onCancel={() => undefined}
          onRename={async () => undefined}
        />
      </Dialog>,
    );

    expect(html).toContain("Rename collection");
    expect(html).toContain("Keep it short and recognizable.");
    expect(html).toContain("value=\"Snake Studies\"");
    expect(html).toContain("data-select-on-focus=\"true\"");
    expect(html).toContain("Cancel");
    expect(html).toContain("Save");
  });
});
