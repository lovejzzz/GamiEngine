# GPT reference-to-3D pipeline

Use this pipeline when generated images define the aesthetic of a 3D browser scene.

## 1. Generate a design study

Generate one coherent object reference under the project style lock. Ask for legible silhouette, believable proportions, construction seams, separate interactive parts, material zones, palette, and wear. Avoid franchise identity and avoid combining unrelated movable objects.

Record only facts that can be modeled consistently:

- bounding dimensions and primary proportions;
- primitive family or intended mesh source;
- material-zone boundaries;
- independently movable parts and their pivot/axis;
- repeated motifs, edge radius, thickness, hardware scale, and wear locations.

Do not photogrammetrically copy accidental lighting, perspective distortion, background context, or impossible geometry from the generated image.

For a whole-room or whole-building study, write an art-direction extraction record before modeling: dominant and accent colors, warm/cool light hierarchy, wall/floor/furniture material zones, human-scale reference dimensions, trim and hardware language, and where wear is allowed to accumulate. The renderer must demonstrate those extracted rules in play; storing a thumbnail alone is not integration.

For a whole-room or whole-building study, write an art-direction extraction record before modeling: dominant and accent colors, warm/cool light hierarchy, wall/floor/furniture material zones, human-scale reference dimensions, trim and hardware language, and where wear is allowed to accumulate. The renderer must demonstrate those extracted rules in play; storing a thumbnail alone is not integration.

## 2. Build interaction-aware geometry

Create the static carcass and every gameplay-relevant moving child as separate meshes. Give each child a stable ID shared by the scene manifest, interaction state, animation track, collider, and save record. A visible seam is not enough: if a player can open it, the part needs real thickness, interior/reveal geometry, and a hinge or slide axis.

Prefer procedural primitives for graybox and compact web demos. Move to glTF when silhouette complexity, authored UVs, skinning, or animation requires it. Keep a procedural missing-asset fallback.

## 3. Generate runtime materials

Generate neutral-lit seamless maps by material zone, not by whole object. Start with base color; add normal, roughness, metalness, opacity, or emissive only when the renderer uses them. Validate a 3×3 repeat, color space, texel density, edge seams, and whether wear repeats too obviously.

Map the materials onto UV-authored geometry. Lighting, cast shadows, fog, night vision, damage overlays, selection, and interaction highlights remain runtime effects.

## 4. Animate and persist

Doors rotate around engine hinges, drawers translate along engine axes, and characters use articulated rigs or verified atlases. Save state by `parentId:partId`; rebuilding or streaming a floor must reapply every transform and visibility state without consulting image pixels.

Before producing a character, keep a clip inventory in the asset recipe with a shared skeleton ID, root-motion policy, duration, loop mode, and `implemented` or `required` status. At minimum separate idle and locomotion; add pushing, searching, stairs, crouching, sleeping, hiding, surrendering, or other poses when the scene actually uses them. Reference images define anatomy and costume, not joint tracks.

Before producing a character, keep a clip inventory in the asset recipe with a shared skeleton ID, root-motion policy, duration, loop mode, and `implemented` or `required` status. At minimum separate idle and locomotion; add pushing, searching, stairs, crouching, sleeping, hiding, surrendering, or other poses when the scene actually uses them. Reference images define anatomy and costume, not joint tracks.

## 5. Validate in play

Walk through the complete space with the actual input scheme. Test collision at corners, pushing both sides of doors, nearest-child selection, one-child-only changes, floor transitions, state restoration, follow/editor cameras, low viewport sizes, missing textures, and console errors. Inspect both visual plausibility and simulation correctness.
