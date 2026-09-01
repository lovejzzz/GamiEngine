# Scene manifest schema

Use this reference when creating or changing scene data. Names may adapt to the host engine, but preserve the boundaries.

## Building

- `version`: migration boundary for saved scenes.
- `name`: user-facing identity.
- `world`: dimensions and pixels/meters (or another explicit unit conversion).
- `styleLock`: projection, neutral material lighting, palette, edge treatment, negative constraints, and optional master-reference ID.
- `floors[]`: independently streamable floor records.
- `assets[]`: generated and fallback asset recipes.

## Floor

- `id`, `index`, `name`: stable identity and display order.
- `rooms[]`: semantic spaces with geometry and floor asset references.
- `walls[]`: collision geometry; optionally include height, material, penetration, and audio occlusion.
- `doors[]`: hinge, length, thickness, angle limits, front/back assets, lock state, and optional motor parameters.
- `occupants[]`: position, facing, visible asset, role, behavior, and persistent state.
- `lights[]`: position, radius/cone, intensity, color, enabled state, and breakable/switchable state when needed.
- `portals` or `stairs`: explicit destination floor IDs and spawn anchors.
- `spawn`: development fallback only; production saves should preserve actor position.

## Asset recipe

Every reusable generated asset should include:

- stable `id` and human-readable `name`;
- kind (`tile`, `wall-face`, `door-face`, `prop`, `character`, or a compatible extension);
- generation prompt and style-lock reference;
- source URI plus generation state (`recipe`, `generating`, `ready`, `rejected`);
- physical size and normalized pivot;
- alpha requirement, tileability, side/orientation, and texel density where relevant;
- collision/navigation metadata only as references to engine-owned shapes, never inferred at runtime from image pixels;
- material behavior such as friction, penetration class, acoustic occlusion, flammability, or destructibility only when gameplay uses it.

## Animation atlas

- source image;
- columns and rows;
- direction row order;
- clip name and frame indexes;
- FPS and loop mode;
- normalized pivot and world footprint;
- optional per-frame events such as footsteps; avoid embedding gameplay hit timing solely in art.

Scene exports must use stable IDs rather than array positions for cross-references. Validate that every referenced asset, destination floor, and door face exists.
