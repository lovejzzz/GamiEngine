---
name: html-gpt-scene-engine
description: Build or extend HTML game scenes whose visual assets are generated as reusable GPT image parts. Use for top-down buildings, multi-floor interiors, interactive doors, occupants, character animation, and asset-generation manifests; do not use for ordinary websites or one-off static illustrations.
---

# HTML GPT Scene Engine

Build a playable scene system, not a flattened picture. GPT-generated pixels must remain replaceable without changing world geometry, collision, behavior, or save data.

## Core invariants

- Establish world units, projection, room graph, collision, pivots, and z-order before generating final art.
- Keep a scene manifest as the source of truth. Images may supply albedo or sprites; they do not own scale, collision, hinges, locks, lights, audio occlusion, AI role, or navigation.
- Generate reusable parts rather than a complete room image. At minimum separate floors, wall tops, wall faces, props, characters, and both visible faces of a door.
- A door is a hinged body with front/back assets, thickness, angle limits, optional lock state, and collision. Never bake an open/close interaction into a single background image.
- Keep directional light, cast shadows, night vision, fog, damage, and selection/debug overlays in the runtime. Ask asset generation for neutral material light unless a baked effect is intentionally immutable.
- Use one visual consistency lock across an asset family: projection, texel density, palette, material light, edge treatment, and negative constraints.
- Treat occupant role and visible appearance separately. “Civilian”, “unknown”, and “hostile” are runtime states, not assumptions inferred from clothing.

## Workflow

1. Inspect the existing engine, package scripts, scene format, assets, and rendering stack. Preserve the established stack unless it blocks required behavior.
2. Create or update the building/scene graph first. For multi-floor work, each floor is independently loadable and stairs/portals explicitly connect floor IDs.
3. Define asset recipes with physical size, pivot, generation prompt, source, state, and material metadata. Read [scene-schema.md](references/scene-schema.md) when adding or changing the manifest format.
4. Design the generation pipeline. Read [asset-pipeline.md](references/asset-pipeline.md) whenever generating textures, two-sided doors, transparent props, characters, or animation.
5. Implement a playable graybox or procedural fallback before all art is ready. The scene must remain operable when a generated source is missing.
6. Add runtime systems needed by the request: movement, collision, door torque, floor streaming, lighting/visibility, occupants, navigation, or interaction. Read [building-runtime.md](references/building-runtime.md) for multi-room or tactical building scenes.
7. Integrate generated assets through the manifest only. Do not hardwire image paths throughout renderer logic.
8. Validate build/type checks, player traversal, door limits, stairs, missing-asset fallback, sprite alpha, frame slicing, and export/import round trips. Use the scripts in `scripts/` when their inputs are available.

## Character animation

Walking characters need real frame assets. A static image with CSS or canvas bobbing is acceptable only as an explicit temporary fallback.

- Minimum prototype: 4 directions × 4 walk frames plus an idle frame per direction.
- Production target: 8 directions × 6–8 walk frames, with separate action sets only when gameplay needs them.
- Derive an atlas or layered rig from one approved character master. Do not generate every frame independently from unrelated text prompts; identity and equipment will drift.
- Store atlas columns, rows, direction order, FPS, pivot, and physical footprint in the manifest.
- A visible checkerboard is not proof of transparency. Verify PNG alpha. Fractional cell dimensions are allowed only if the renderer slices with floating-point source rectangles; otherwise pad or regenerate the atlas.

## Quality bar

Judge two independent outcomes:

- Visual: consistent projection, scale, palette, alpha edges, material response, and no baked effects that conflict at runtime.
- Simulation: all spaces are traversable as intended; walls and doors block correctly; door front/back choice follows camera/side; floor transitions preserve state; occupants and animation remain data-driven.

Do not reproduce a copyrighted game level room-for-room when a user gives it as a reference. Extract the desired design qualities and create an original layout, cast, and asset identity.
