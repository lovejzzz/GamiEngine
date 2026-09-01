---
name: html-gpt-scene-engine
description: Build or extend 2D or 3D HTML game scenes whose visual assets come from GPT-generated reference studies, runtime textures, or reusable sprites. Use for buildings, multi-floor interiors, interactive doors and props, occupants, character animation, Three.js scenes, and asset-generation manifests; do not use for ordinary websites or one-off static illustrations.
---

# HTML GPT Scene Engine

Build a playable scene system, not a flattened picture. GPT-generated pixels must remain replaceable without changing world geometry, collision, behavior, animation, or save data.

## Core invariants

- Establish world units, projection, room graph, collision, pivots, and z-order before generating final art.
- Keep a scene manifest as the source of truth. Images may supply albedo or sprites; they do not own scale, collision, hinges, locks, lights, audio occlusion, AI role, or navigation.
- Generate reusable parts rather than a complete room image. At minimum separate floors, wall tops, wall faces, props, characters, and both visible faces of a door.
- A door is a hinged body with front/back assets, thickness, angle limits, optional lock state, and collision. Never bake an open/close interaction into a single background image.
- Keep directional light, cast shadows, night vision, fog, damage, and selection/debug overlays in the runtime. Ask asset generation for neutral material light unless a baked effect is intentionally immutable.
- Use one visual consistency lock across an asset family: projection, texel density, palette, material light, edge treatment, and negative constraints.
- Treat occupant role and visible appearance separately. “Civilian”, “unknown”, and “hostile” are runtime states, not assumptions inferred from clothing.
- Classify interaction before generating any prop. Record actions, independent state IDs, motion model, collision/occlusion changes, and the asset needed for every visually distinct state.
- Decompose compound props into independently addressable child parts. A kitchen is a cabinet carcass plus individual doors and drawers; interacting with one child must never implicitly open every sibling.
- Do not merge independently movable objects into one bitmap. Tables and chairs, shelves and loose boxes, or a bed and an under-bed drawer require separate instances when gameplay can move or reveal them.
- In 3D, classify every generated image as either `reference-study`, `runtime-texture`, or an explicit `runtime-sprite`. A reference study teaches silhouette, proportion, construction, material zones, palette, and wear; never render it directly as 3D geometry.
- Geometry, UVs, pivots, joints, child-part boundaries, collision, LOD, and save-state IDs are engine-owned. Runtime textures may color those meshes, but must not contain object silhouettes, baked lighting, hardware, seams that should move, or interaction state.

## Workflow

1. Inspect the existing engine, package scripts, scene format, assets, and rendering stack. Preserve the established stack unless it blocks required behavior.
2. Create or update the building/scene graph first. For multi-floor work, each floor is independently loadable and stairs/portals explicitly connect floor IDs.
3. Define asset recipes with physical size, pivot, generation prompt, source, state, and material metadata. Read [scene-schema.md](references/scene-schema.md) when adding or changing the manifest format.
   Before generation, complete an interaction inventory for every prop: `none`, `inspect`, `open`, `search`, `push`, `pickup`, `hide`, `break`, `toggle`, or a project extension. Derive the required asset/state matrix from that inventory.
4. Design the generation pipeline. Read [asset-pipeline.md](references/asset-pipeline.md) whenever generating textures, two-sided doors, transparent props, characters, or animation. For a 3D renderer, also read [3d-pipeline.md](references/3d-pipeline.md).
5. Implement a playable graybox or procedural fallback before all art is ready. The scene must remain operable when a generated source is missing.
6. Add runtime systems needed by the request: movement, collision, door torque, floor streaming, lighting/visibility, occupants, navigation, or interaction. Read [building-runtime.md](references/building-runtime.md) for multi-room or tactical building scenes.
7. Integrate generated assets through the manifest only. Do not hardwire image paths throughout renderer logic. In 3D, pass reference studies through a modeling/UV step before runtime; only declared runtime textures or sprite fallbacks may reach the renderer.
8. Validate build/type checks, player traversal, door limits, stairs, missing-asset fallback, sprite alpha, frame slicing, and export/import round trips. Use the scripts in `scripts/` when their inputs are available.
   Also validate that one input changes only the targeted instance/child, every visually distinct state resolves to an asset or declared procedural renderer, reference studies carry `never-render-directly`, and rejected contact sheets or all-open mockups are not referenced by runtime scenes.

## Character animation

Sprite-based walking characters need real frame assets. A static image with CSS or canvas bobbing is acceptable only as an explicit temporary fallback. A 3D character needs an articulated rig and actual joint animation; translating an unarticulated mesh is not a walk cycle.

- Minimum prototype: 4 directions × 4 walk frames plus an idle frame per direction.
- Production target: 8 directions × 6–8 walk frames, with separate action sets only when gameplay needs them.
- Derive an atlas or layered rig from one approved character master. Do not generate every frame independently from unrelated text prompts; identity and equipment will drift.
- Store atlas columns, rows, direction order, FPS, pivot, and physical footprint in the manifest.
- For a 3D rig, store skeleton/part IDs, clips, duration or FPS, root-motion policy, and collider footprint. At minimum animate opposing arms/legs for locomotion and provide a stable idle pose.
- A visible checkerboard is not proof of transparency. Verify PNG alpha. Fractional cell dimensions are allowed only if the renderer slices with floating-point source rectangles; otherwise pad or regenerate the atlas.

## Quality bar

Judge two independent outcomes:

- Visual: consistent projection, scale, palette, alpha edges where used, coherent 3D silhouette and proportions, material response, and no baked effects that conflict at runtime.
- Simulation: all spaces are traversable as intended; walls and doors block correctly; door front/back choice follows camera/side; floor transitions preserve state; occupants and animation remain data-driven.

Do not reproduce a copyrighted game level room-for-room when a user gives it as a reference. Extract the desired design qualities and create an original layout, cast, and asset identity.
