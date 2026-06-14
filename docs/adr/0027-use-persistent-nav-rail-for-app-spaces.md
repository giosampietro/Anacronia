# Use a persistent nav rail for app spaces

Anacronia should use a persistent narrow navigation rail to switch between the three primary App Spaces: Library / Collections, Analysis Studio, and Latent Space Explorer. The Explorer remains a peer App Space in the normal app shell by default; it does not become a separate full-screen-only application shell.

**Status:** accepted

**Context:** The product model now separates source material, analysis production, and visual exploration. A tab bar would imply small sibling views inside one page, while these are larger work areas. The Latent Space Explorer needs substantial canvas space, but Anacronia already has a focus shortcut, `f`, that can hide UI chrome when the user wants a fully immersive view.

**Decision:** Use a persistent narrow Navigation Rail for app-level switching. Library / Collections, Analysis Studio, and Latent Space Explorer are first-class peers in that rail. The rail remains visible in Explorer by default. Pressing `f` enters Focus Mode and hides the rail and other UI until the user exits focus.

**Considered Options:**

- Top tabs: simple, but too small a pattern for switching between whole app spaces.
- Separate full-screen Explorer shell by default: maximizes canvas space, but makes Explorer feel detached from the rest of Anacronia and duplicates navigation behavior.
- Contextual buttons only: useful as shortcuts, but not enough to teach or preserve the three-space mental model.
- Persistent nav rail plus Focus Mode: keeps the app structure stable and lets the user intentionally remove chrome when inspecting the latent map.

**Consequences:** The app shell should reserve stable space for the rail across the three App Spaces. Explorer implementation should support both normal shell mode and Focus Mode. Navigation rail state should not start analysis or mutate results; it changes App Space. Computation remains owned by Analysis Studio, and visual navigation remains owned by the Explorer.

**UX Consequences:** Contextual entry points can still exist, such as opening an Analysis Result in Explorer or starting Analysis Studio from a Collection, but they should be conservative and should not replace the rail as the primary mental model. The first product sequence remains: Library creates source material, Analysis Studio creates durable Analysis Results, and Explorer visualizes one Analysis Result.
