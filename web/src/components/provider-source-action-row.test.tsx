import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProviderSourceActionRow } from "./provider-source-action-row";

async function submitAction() {}

describe("ProviderSourceActionRow", () => {
  it("hides batch selection when a launch action is unavailable", () => {
    const html = renderToString(
      <ProviderSourceActionRow
        action={{
          disabled: false,
          kind: "start",
          label: "Keep searching",
          showBatchTarget: true,
        }}
        actionAvailable={false}
        batchTarget={5}
        formAction={submitAction}
        idPrefix="snake_met"
        provider="met"
        searchSetSlug="snake"
      />,
    );

    expect(html).toContain("Keep searching");
    expect(html).toContain("aria-disabled=\"true\"");
    expect(html).toContain("aria-haspopup=\"dialog\"");
    expect(html).not.toContain("Images to find");
    expect(html).not.toContain("name=\"batch_target\"");
  });

  it("keeps stop search available while the worker is busy", () => {
    const html = renderToString(
      <ProviderSourceActionRow
        action={{
          disabled: false,
          kind: "stop",
          label: "Stop search",
          showBatchTarget: false,
        }}
        actionAvailable
        batchTarget={5}
        formAction={submitAction}
        idPrefix="grotto_met"
        provider="vam"
        searchSetSlug="grotto"
      />,
    );

    expect(html).toContain("Stop search");
    expect(html).toContain("type=\"submit\"");
    expect(html).toContain("name=\"provider\" value=\"vam\"");
    expect(html).not.toContain("aria-disabled=\"true\"");
  });
});
