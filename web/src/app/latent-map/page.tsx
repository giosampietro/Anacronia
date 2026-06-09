import type { Metadata } from "next";

import { LatentMapViewer } from "@/components/latent-map-viewer";
import { latentMapFixture } from "@/lib/latent-map-fixture";

export const metadata: Metadata = {
  title: "Latent Map | Anacronia",
};

export default function LatentMapPage() {
  return <LatentMapViewer data={latentMapFixture} />;
}
