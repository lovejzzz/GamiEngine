# Scene manifest schema

Use this reference when creating or changing scene data. Names may adapt to the host engine, but preserve the boundaries.

## Building

- `version`: migration boundary for saved scenes.
- `name`: user-facing identity.
- `world`: dimensions and pixels/meters (or another explicit unit conversion).
- `renderer`: 2D/3D mode, implementation, floor-streaming policy, and default camera.
- `styleLock`: projection, neutral material lighting, palette, edge treatment, negative constraints, and optional master-reference ID.
- `floors[]`: independently streamable floor records.
- `assets[]`: generated and fallback asset recipes.

## Floor

- `id`, `index`, `name`: stable identity and display order.
- `rooms[]`: semantic spaces with geometry and floor asset references.
- `walls[]`: collision geometry; optionally include height, material, penetration, and audio occlusion.
- `doors[]`: hinge, length, thickness, angle limits, front/back assets, lock state, and optional motor parameters.
- `occupants[]`: position, facing, visible asset, role, behavior, and persistent state.
- `props[]`: stable instance ID, asset ID, transform, optional collider, interaction profile, current persistent state, and optional independently addressable `parts[]`.
- `lights[]`: position, radius/cone, intensity, color, enabled state, and breakable/switchable state when needed.
- `portals` or `stairs`: explicit destination floor IDs and spawn anchors.
- `spawn`: development fallback only; production saves should preserve actor position.

## Asset recipe

Every reusable generated asset should include:

- stable `id` and human-readable `name`;
- kind (`tile`, `wall-face`, `door-face`, `prop`, `character`, `material`, or a compatible extension);
- `usage`: `reference-study`, `runtime-texture`, or `runtime-sprite`; the renderer must reject reference studies as draw sources;
- generation prompt and style-lock reference;
- source URI plus generation state (`recipe`, `generating`, `ready`, `rejected`);
- physical size and normalized pivot;
- alpha requirement, tileability, side/orientation, and texel density where relevant;
- collision/navigation metadata only as references to engine-owned shapes, never inferred at runtime from image pixels;
- material behavior such as friction, penetration class, acoustic occlusion, flammability, or destructibility only when gameplay uses it.
- interaction capability: prompt, allowed actions, default state, motion model, and a state-to-asset mapping for every visually distinct state.

For `reference-study`, include `referenceStudy.source`, the visual facts to learn (`silhouette`, `proportion`, `material-zones`, `wear-language`, `color-palette`), and `runtimeRule: never-render-directly`. Pair it with `geometry.source` (`procedural` or `gltf`) plus stable independently modeled part IDs.

For `runtime-texture`, include texture semantic, tileability, color space, and world scale (`metersPerTile`). Base color is usually sRGB; normal, roughness, metalness, and masks are linear. A runtime texture describes a surface, not the silhouette or state of an object.

## Compound interactive props

Represent a compound object as one parent prop and stable child parts. Each child owns its own state machine and interaction anchor. For example, a kitchen cabinet has one carcass/base asset and separate door/drawer children; `cabinet-left=open` must not mutate `drawer-sink` or `cabinet-stove`.

Use an `exclusiveGroup` only when design intentionally allows one sibling state at a time. Do not use one parent boolean such as `kitchenOpen` for a multi-door cabinet. Save child state by stable `parentId:partId`, not array index.

## Animation atlas

- source image;
- columns and rows;
- direction row order;
- clip name and frame indexes;
- FPS and loop mode;
- normalized pivot and world footprint;
- optional per-frame events such as footsteps; avoid embedding gameplay hit timing solely in art.

Scene exports must use stable IDs rather than array positions for cross-references. Validate that every referenced asset, destination floor, and door face exists.
