import { Fragment } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { VirtualizedImageGrid } from "./virtualized-image-grid";

describe("VirtualizedImageGrid", () => {
  it("owns stable keys for rendered grid items", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      renderToString(
        <VirtualizedImageGrid
          className="grid"
          getItemKey={(item) => item.id}
          items={[
            { id: "image:1", label: "First image" },
            { id: "image:2", label: "Second image" },
          ]}
          renderItem={(item) => (
            <Fragment>
              <span>{item.label}</span>
            </Fragment>
          )}
        />,
      );

      expect(consoleErrorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("Each child in a list should have a unique"),
        expect.anything(),
        expect.anything(),
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
