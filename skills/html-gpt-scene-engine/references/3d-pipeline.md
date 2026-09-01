# GPT reference-to-3D pipeline

Use this pipeline when generated images define the aesthetic of a 3D browser scene.

## 1. Generate a design study

Generate one coherent object reference under the project style lock. Ask for legible silhouette, believable proportions, construction seams, separate interactive parts, material zones, palette, and wear. Avoid franchise identity and avoid combining unrelated movable objects.

For a `hero` asset, use identity-consistent orthographic front/back/side/top views at one scale. Treat them as measurements, not mood boards. If view identity drifts, regenerate before modeling; do not average contradictory shapes into a crude mesh.

Record only facts that can be modeled consistently:

- bounding dimensions and primary proportions;
- primitive family or intended mesh source;
- material-zone boundaries;
- independently movable parts and their pivot/axis;
- repeated motifs, edge radius, thickness, hardware scale, and wear locations.

Convert those facts into a construction blueprint before writing mesh code. The blueprint should name the topology family for each defining part—box/extrusion for slabs and panels, lathe for turned legs or posts, curve/tube for bent rails, authored/glTF topology for irregular carving—and record real dimensions instead of one shared visual roundness value. Color and texture matching do not count as construction matching.

Do not photogrammetrically copy accidental lighting, perspective distortion, background context, or impossible geometry from the generated image.

For a whole-room or whole-building study, write an art-direction extraction record before modeling: dominant and accent colors, warm/cool light hierarchy, wall/floor/furniture material zones, human-scale reference dimensions, trim and hardware language, and where wear is allowed to accumulate. The renderer must demonstrate those extracted rules in play; storing a thumbnail alone is not integration.

## 2. Build interaction-aware geometry

Create the static carcass and every gameplay-relevant moving child as separate meshes. Give each child a stable ID shared by the scene manifest, interaction state, animation track, collider, and save record. A visible seam is not enough: if a player can open it, the part needs real thickness, interior/reveal geometry, and a hinge or slide axis.

Prefer procedural primitives for graybox and compact web demos. Move to glTF when silhouette complexity, authored UVs, skinning, or animation requires it. Keep a procedural missing-asset fallback.

For production procedural furniture, use primitives according to construction rather than convenience:

- hard wood, stone and metal: millimeter-scale bevels, visible thickness, joinery and profile layers;
- casework: carcass, face frame, rails, stiles, inset or raised panels, cornice, plinth and hardware as legible parts;
- turned furniture: lathed legs/posts plus real aprons, stretchers and joints;
- upholstery: frame/deck, cushions, piping, seams or tufting, rolled parts and support feet; broad radii belong only to genuinely soft volumes.

Do not mark an asset `production` solely because the reference board is attractive or the mesh has many parts. Inspect it at gameplay distance and close-up; if its characteristic joints and profiles do not read, keep it as a fallback and revise the blueprint.

## 3. Generate runtime materials

Generate neutral-lit seamless maps by material zone, not by whole object. Start with base color; add normal, roughness, metalness, opacity, or emissive only when the renderer uses them. Validate a 3×3 repeat, color space, texel density, edge seams, and whether wear repeats too obviously.

Map the materials onto UV-authored geometry. Lighting, cast shadows, fog, night vision, damage overlays, selection, and interaction highlights remain runtime effects.

## 4. Cross the production bridge

Choose the bridge by asset class: structured architecture, stairs, doors, and cabinets usually compile from measured parametric blueprints; irregular static props may use an image-to-3D or authored glTF cleanup path; characters reuse a shared rig and authored clips. Preserve a renderer-safe procedural fallback.

Before marking a `hero` asset production-ready, require: reference view metadata; physical dimensions and pivots; a blueprint ID or validated glTF source; independent gameplay parts; base-color, normal, and roughness maps where appropriate; texel density; minimum bevel; triangle and draw-call budgets; at least one runtime LOD; and close-up browser inspection. A polished source image with no geometry bridge must fail the gate.

## 5. Animate and persist

Doors rotate around engine hinges, drawers translate along engine axes, and characters use articulated rigs or verified atlases. Save state by `parentId:partId`; rebuilding or streaming a floor must reapply every transform and visibility state without consulting image pixels.

Before producing a character, keep a clip inventory in the asset recipe with a shared skeleton ID, root-motion policy, duration, loop mode, and `implemented` or `required` status. At minimum separate idle and locomotion; add pushing, searching, stairs, crouching, sleeping, hiding, surrendering, or other poses when the scene actually uses them. Reference images define anatomy and costume, not joint tracks.

For an external or generated rig, record creator/source/license and keep the model and animation-library IDs separate. Prune clips from the interaction and locomotion inventory instead of shipping a complete library. Retarget rotations first; if the engine owns root motion, discard source root and per-bone translations until a measured test proves they preserve target proportions and foot contact. Crossfade state changes and verify that locomotion advances only when simulation position advances.

Clip names are claims, not evidence. After retargeting, inspect the actual silhouette at the action extreme: a source clip named `push`, `stairs`, `aim` or `interact` may produce raised hands, inverted elbows, detached equipment or a mismatched center of gravity on the target rig. Map gameplay to the best verified result and leave semantically named but visually wrong clips unused.

Clip names are claims, not evidence. After retargeting, inspect the actual silhouette at the action extreme: a source clip named `push`, `stairs`, `aim` or `interact` may produce raised hands, inverted elbows, detached equipment or a mismatched center of gravity on the target rig. Map gameplay to the best verified result and leave semantically named but visually wrong clips unused.

A skinned nude, underwear, superhero-base or neutral scan is only a deformation carrier. Build or generate independent costume geometry that covers the carrier from front, back and side while moving. Review elbows, knees, hips, shoulders, shoes, neckline and equipment attachment in idle, stride extremes, crouch and interaction. Exposed carrier patches or detached equipment fail character fidelity even when the skeleton and clip technically work.

Keep a renderer-safe procedural fallback, but expose whether the authored model is `loading`, `ready`, or `failed`. A screenshot of the fallback cannot certify the glTF path.

For an external or generated rig, record creator/source/license and keep the model and animation-library IDs separate. Prune clips from the interaction and locomotion inventory instead of shipping a complete library. Retarget rotations first; if the engine owns root motion, discard source root and per-bone translations until a measured test proves they preserve target proportions and foot contact. Crossfade state changes and verify that locomotion advances only when simulation position advances.

A skinned nude, underwear, superhero-base or neutral scan is only a deformation carrier. Build or generate independent costume geometry that covers the carrier from front, back and side while moving. Review elbows, knees, hips, shoulders, shoes, neckline and equipment attachment in idle, stride extremes, crouch and interaction. Exposed carrier patches or detached equipment fail character fidelity even when the skeleton and clip technically work.

Keep a renderer-safe procedural fallback, but expose whether the authored model is `loading`, `ready`, or `failed`. A screenshot of the fallback cannot certify the glTF path.

## 6. Validate in play

Walk through the complete space with the actual input scheme. Test collision at corners, pushing both sides of doors, nearest-child selection, one-child-only changes, floor transitions, state restoration, follow/editor cameras, low viewport sizes, missing textures, and console errors. Inspect both visual plausibility and simulation correctness.
