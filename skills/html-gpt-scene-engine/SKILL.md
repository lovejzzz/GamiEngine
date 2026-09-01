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
- Classify collision independently from interaction and visibility. Every substantial body needs an explicit `blocking`, `trigger`, or `pass-through` policy; never assume a table, chair, occupant, or generated silhouette is non-blocking because it lacks an interaction.
- Gate interactions by distance, actor facing, and wall/door visibility. Give long actions a busy interval and visible target feedback so input spam cannot make one actor operate several parts simultaneously.
- Decompose compound props into independently addressable child parts. A kitchen is a cabinet carcass plus individual doors and drawers; interacting with one child must never implicitly open every sibling.
- Do not merge independently movable objects into one bitmap. Tables and chairs, shelves and loose boxes, or a bed and an under-bed drawer require separate instances when gameplay can move or reveal them.
- In 3D, classify every generated image as either `reference-study`, `runtime-texture`, or an explicit `runtime-sprite`. A reference study teaches silhouette, proportion, construction, material zones, palette, and wear; never render it directly as 3D geometry.
- Treat a whole-environment art study as a measurable art-direction contract. Extract palette, warm/cool light hierarchy, material zones, human-scale proportions, construction details, and localized wear into the manifest before changing runtime geometry; do not merely place the study in an asset browser and call the scene art-directed.
- Close the reference-to-runtime gap from macro to micro: first camera/framing and cutaway silhouette, then human-scale wall/door/window proportions, then warm/cool light hierarchy and contact shadowing, then set-dressing density, and only then texture micro-detail. High-resolution materials cannot rescue incorrect architectural scale or a flat editor camera.
- Treat cutaway height as a camera-facing visibility system, not one universal wall height. Preserve full-height back walls and exterior identity, lower or hide foreground occluders, and keep doors, windows, wainscot, art, and fixtures attached to physically plausible full-height hosts.
- Validate room proportions against the runtime character before polishing. A standing adult, doorway, window sill, worktop, handrail, and wall should read as one coherent scale family; reject a scene that reads like a tabletop miniature unless that style is intentional.
- Geometry, UVs, pivots, joints, child-part boundaries, collision, LOD, and save-state IDs are engine-owned. Runtime textures may color those meshes, but must not contain object silhouettes, baked lighting, hardware, seams that should move, or interaction state.
- A polished reference is not a finished asset. A `hero` object needs identity-consistent orthographic views, measured dimensions, either a structured procedural blueprint or validated glTF, separately generated PBR maps, and declared bevel, texel-density, triangle, draw-call, and LOD budgets. Reject it from production when any bridge is missing.
- Do not translate every silhouette into the same rounded-box vocabulary. Classify construction before choosing topology: hard timber and painted casework need thin real-world bevels, panels, rails, stiles, mouldings and joints; turned furniture needs lathed profiles; curved rails need curves or tubes; upholstery may use broad soft radii. A `hero` furniture asset must contain its characteristic construction topology, not merely the correct color and bounding box.
- Treat bevel radius as material- and scale-dependent. Typical visible hard-furniture edges are millimeter-scale, while cushions and rolled upholstery may be centimeter-scale. Reject a hard wooden or metal object whose global edge radius makes it read as plastic, candy, or a toy.
- Treat quality as a release gate, not a compliment. “Loads”, “recognizable”, “generated”, and “feature-complete” are not production evidence. Keep the whole scene at `prototype` or `candidate` while any critical visual, animation, interaction, or runtime-review dimension remains unfinished, even when individual assets pass.
- Production status must be evidence-backed and independently falsifiable. Require manifest checks, runtime topology tests where practical, and an inspected browser capture or playtest record. A manually entered score or an attractive source image cannot certify its own output.
- Audit form language separately from asset correctness. Reject a scene that repeats one primitive family, one global bevel, capsule mannequins, identical fixtures, showroom symmetry, or untouched graybox bodies strongly enough to read as a toy set, even when individual meshes and textures are valid.
- A procedural character fallback needs changing shoulder, waist, pelvis, jaw, calf and forearm cross-sections; differentiated clothing or equipment zones; smaller human-scale hands and head; and a role-appropriate default pose. An articulated capsule stack is still a placeholder.
- Treat a rigged base body as a deformation carrier, not a dressed character. It cannot pass character fidelity while underwear, anatomy texture, T-pose shoulders, exposed joints, or generic base proportions remain conspicuous through missing costume geometry.
- Keep the runtime body and animation library as separate manifest assets with audited provenance. Prune the library to the gameplay clip inventory, crossfade state changes, and keep engine-owned root motion authoritative; when retargeting across similar rigs, begin with joint rotations and reject source translations until limb-length and foot-contact tests prove they are safe.
- Load authored character assets asynchronously behind the procedural fallback. Hide the fallback only after the skinned model and required clips are ready, and expose a runtime-ready signal that browser tests can distinguish from a successful fallback.
- Build atmosphere through readable values, not darkness. Preserve black or cool exterior separation, visible interior midtones, localized practical-light pools, contact shadows and restrained highlights. If the player cannot read construction or collision, the lighting pass has failed.
- Use narrative set dressing in primary, secondary and tertiary scales. Add controlled asymmetry and evidence of residents—moved chairs, mail, shoes, books, textiles and wear—without narrowing required routes or turning every room into random clutter.
- Do not let manifest declarations certify their own quality. A named blueprint, texture path, triangle budget, child count, or manually set `passed` flag is only a claim. Quality evidence must measure or inspect the shipped mesh, UVs, maps, lighting and browser render independently.
- Audit a stalled visual result from upstream to downstream: framing/readability, silhouette and construction, UV and material calibration, indirect/contact lighting, set-dressing variation, then animation and post effects. Stop polishing downstream layers when an upstream layer is still visibly dominant.
- Treat base-color textures as measured albedo. Keep the material color factor white unless a deliberate, measured tint is required; multiplying an already colored map by a dark factor can erase half or more of its luminance and make valid PBR maps look muddy.
- Require a calibrated reference-to-runtime comparison for Hero assets: matching view, silhouette or landmark overlay, neutral-light turntable, and a scene-distance capture. Prose such as “learn silhouette” or a topology-name test is not evidence that the modeled result resembles the reference.
- Iterate one Golden Room before propagating a scene-wide visual change. Capture a full-frame editor view, a player-follow view and interaction/stair evidence; classify every change as geometry, UV/material, lighting, camera or post-processing. Keep only changes whose improvement survives all relevant views—an editor-frame improvement that creates follow-camera occlusion is not a pass.

## Workflow

1. Inspect the existing engine, package scripts, scene format, assets, and rendering stack. Preserve the established stack unless it blocks required behavior.
2. Create or update the building/scene graph first. For multi-floor work, each floor is independently loadable and stairs/portals explicitly connect floor IDs.
   A playable stair needs a walkable trigger volume, travel axis, uphill direction, rise, upper/lower target IDs, safe arrival anchor, and re-entry guard. Drive actor root height from normalized stair progress, then stream floors only at the matching end of the flight; a key-only floor teleport is a temporary debug fallback.
3. Define asset recipes with physical size, pivot, generation prompt, source, state, and material metadata. Read [scene-schema.md](references/scene-schema.md) when adding or changing the manifest format.
   Before generation, complete an interaction inventory for every prop: `none`, `inspect`, `open`, `search`, `push`, `pickup`, `hide`, `break`, `toggle`, or a project extension. Derive the required asset/state matrix from that inventory.
   For a product-level quality system or release decision, also read [quality-gate.md](references/quality-gate.md). Keep asset craft readiness separate from whole-scene release readiness.
4. Design the generation pipeline. Read [asset-pipeline.md](references/asset-pipeline.md) whenever generating textures, two-sided doors, transparent props, characters, or animation. For a 3D renderer, also read [3d-pipeline.md](references/3d-pipeline.md).
5. Implement a playable graybox or procedural fallback before all art is ready. The scene must remain operable when a generated source is missing.
6. Add runtime systems needed by the request: movement, collision, door torque, floor streaming, lighting/visibility, occupants, navigation, or interaction. Read [building-runtime.md](references/building-runtime.md) for multi-room or tactical building scenes.
7. Integrate generated assets through the manifest only. Do not hardwire image paths throughout renderer logic. In 3D, pass reference studies through a modeling/UV step before runtime; only declared runtime textures or sprite fallbacks may reach the renderer.
8. Validate build/type checks, player traversal, door limits, stairs, missing-asset fallback, sprite alpha, frame slicing, and export/import round trips. Use the scripts in `scripts/` when their inputs are available.
   Also validate that one input changes only the targeted instance/child, every visually distinct state resolves to an asset or declared procedural renderer, reference studies carry `never-render-directly`, and rejected contact sheets or all-open mockups are not referenced by runtime scenes.
9. Perform a browser-based art-and-play pass at the intended presentation viewport. Capture a screenshot, compare it to the art-direction contract, then walk the actual route through doors, around furniture and occupants, and across every stair portal. Fix composition or layout blockers found during the run; do not accept a build-only check as visual validation.
   When the scene looks polished in its reference but coarse at runtime, read [quality-gate.md](references/quality-gate.md) and run its bottleneck audit before adding more assets or post-processing.

## Character animation

Sprite-based walking characters need real frame assets. A static image with CSS or canvas bobbing is acceptable only as an explicit temporary fallback. A 3D character needs an articulated rig and actual joint animation; translating an unarticulated mesh is not a walk cycle.

- Minimum prototype: 4 directions × 4 walk frames plus an idle frame per direction.
- Production target: 8 directions × 6–8 walk frames, with separate action sets only when gameplay needs them.
- Derive an atlas or layered rig from one approved character master. Do not generate every frame independently from unrelated text prompts; identity and equipment will drift.
- Store atlas columns, rows, direction order, FPS, pivot, and physical footprint in the manifest.
- For a 3D rig, store skeleton/part IDs, clips, duration or FPS, root-motion policy, and collider footprint. At minimum animate opposing arms/legs for locomotion and provide a stable idle pose.
- Blend into and out of locomotion instead of snapping joint angles. A patrol clip is valid only when the actor changes navigation position; sleeping, hiding, sitting, pushing, and searching need distinct poses or clips rather than a rotated standing cycle.
- Derive the shipped clip subset from the manifest state inventory. Use `node scripts/prune_gltf_animations.mjs input.gltf output.gltf Clip_A Clip_B ...` to remove unrelated clips before deployment; this reduces payload but does not replace retarget and visual review.
- A visible checkerboard is not proof of transparency. Verify PNG alpha. Fractional cell dimensions are allowed only if the renderer slices with floating-point source rectangles; otherwise pad or regenerate the atlas.

## Quality bar

Judge two independent outcomes:

- Visual: consistent projection, scale, palette, alpha edges where used, coherent 3D silhouette and proportions, material response, and no baked effects that conflict at runtime.
- Simulation: all spaces are traversable as intended; walls and doors block correctly; door front/back choice follows camera/side; floor transitions preserve state; occupants and animation remain data-driven.
- Stair traversal: approach from the intended landing, walk the full flight in both directions, verify visible vertical actor motion and stair locomotion, change floors only at an end trigger, spawn clear of the destination trigger, and confirm held movement cannot skip multiple floors.
- Asset fidelity: inspect representative `hero` objects close-up in the running renderer. Compare silhouette, construction, edge softness, material-zone boundaries, micro-surface response, scale, and wear to the approved multi-view study; a thumbnail in the asset browser is not evidence.
- Construction audit: for each `hero` furniture family, identify the reference-defining parts in the running mesh—such as apron and stretchers on a table, posts/spindles/crest on a chair, or carcass/cornice/plinth/inset panels on casework. Require at least one appropriate non-box or profiled topology when the reference calls for it, and fail any asset that still reads as a uniformly inflated primitive.
- Collision audit: walk directly into every substantial prop and occupant, then move diagonally along its edge. Verify blocking bodies stop overlap, pass-through portals remain usable, and moving props carry their colliders with their saved transform.
- Route-clearance audit: traverse every required room-to-room path with dynamic occupants active and with representative movable props in alternate states. Decorative fixtures and frozen occupants must not combine into an accidental choke point; preserve at least one intended actor-width route unless blockage is deliberate gameplay.
- Reference screenshot audit: judge the running viewport at the same approximate aspect ratio and framing as the approved study. Check how much of the frame the building occupies, which walls occlude rooms, location of focal practical lights, cool exterior versus warm interior separation, material-family readability, and whether each hero room has enough secondary and tertiary set dressing to feel inhabited.
- Contact-depth audit: use real shadows and, when performance permits, screen-space ambient occlusion or equivalent contact shading. Bloom is a restrained accent for emissive bulbs and fire, not a substitute for local lights or surface response.
- Runtime-warning audit: inspect console warnings as well as errors. A deprecated renderer option that silently falls back is an unstable implementation, even when the current screenshot looks correct.
- Anti-miniature audit: inspect the full composition and a follow-camera close-up. Fail when heads read as spheres or disks, arms hang in a display pose, wall trim is uniformly metallic, fixtures repeat without hierarchy, hard and soft objects share the same edge radius, or placeholder bathroom/nursery/storage bodies dominate the frame.

Do not reproduce a copyrighted game level room-for-room when a user gives it as a reference. Extract the desired design qualities and create an original layout, cast, and asset identity.
