# Gami Engine visual quality bottleneck audit

Date: 2026-09-01

## Conclusion

The current ceiling is not image-generation quality or Three.js itself. The missing layer is a production bridge between polished reference images and calibrated runtime assets. The engine records what an asset should learn, then manually approximates it with reusable procedural primitives, default UVs, shared materials and direct lights. The quality gate currently rewards those declarations more than visual agreement with the shipped render.

The result is structurally playable but aesthetically capped: increasingly good references and more texture maps produce only small gains because the visible silhouette, UV scale, light transport and costume geometry remain coarse.

## Measured evidence

| Check | Reference study | Current live render | Finding |
| --- | ---: | ---: | --- |
| Pixels below luma 0.03 | 25.0% | 63.5% | Runtime crushes too much of the frame into unreadable black. |
| Pixels below luma 0.08 | 61.6% | 75.3% | Interior midtones are substantially weaker. |
| Mean display-space saturation | 0.529 | 0.299 | Material families lose color separation at runtime. |
| Character body geometry | — | 14,318 triangles | The carrier is adequate, but the visible costume is still cylinders, spheres and rigid shells. |

The runtime also multiplies already-colored base-color maps by dark material colors in linear space. Approximate mean-luminance retention before lighting is only 50% for plaster, 34% for walnut, 64% for leather and 49% for sage paint. This double tinting explains much of the muddy response.

Generated normal and roughness maps are mostly structurally plausible, but some maps have measurable edge discontinuities and the sage normal field is unusually shallow after normalization. More importantly, the maps are assigned to shared procedural materials with default per-primitive UVs. A tiny knob and a two-meter tabletop can therefore each consume one whole texture tile, so declared texel density does not represent shipped texel density or grain direction.

## Root causes, in priority order

1. **No calibrated reference-to-model bridge.** Reference metadata says `learn: silhouette` or names a blueprint, but no matched-view silhouette overlay, landmark error, or render comparison enforces resemblance. The runtime sofa, casework and room shell are interpretations, not reconstructions.
2. **Visible geometry still uses a small procedural vocabulary.** Furniture has more parts than the early graybox, but most secondary objects, architecture and character clothing still resolve to boxes, rounded boxes, cylinders and spheres. Part count does not create believable contour, folds, joinery or manufacturing history.
3. **Material energy is incorrectly reduced.** Colored albedo textures are multiplied by dark color factors. Normal strengths are often tiny, and many visible surfaces still use flat-color materials without complete map sets.
4. **UV and texel-density claims are not measured.** Default UVs and one shared repeat value cannot preserve world-scale grain, directional construction or consistent resolution across unrelated geometry.
5. **Lighting has contact darkening but little believable bounce.** The scene uses direct point/directional lights, a generic room environment and GTAO. Only two practical lights cast shadows per floor, there are no scene-authored lightmaps or equivalent indirect-light representation, and AO cannot substitute for global illumination. The custom grade and vignette further reduce already weak midtones.
6. **Camera and cutaway do not reveal the work.** The full view leaves large unused black areas; the follow camera remains high and can be occluded by walls and fixtures. A detail that is never resolved into enough screen pixels cannot improve perceived quality.
7. **Set dressing is repeated rather than authored.** Identical windows, lamps, books, plants and clean procedural surfaces create a kit impression. The reference gains credibility from irregular object placement, construction age, localized wear, cables, textiles and room-specific evidence.
8. **Character fidelity is measured on the hidden carrier.** The 14k-triangle body and real skeleton improve motion, but visible clothes and equipment are rigid procedural covers. They dominate the silhouette and preserve the toy quality.
9. **The gate contains circular evidence.** `passedCraftReview()` sets every review check to `true`; the same screenshot is reused for several assets; topology tests verify geometry class and child count, not resemblance, UV correctness or material response. The gate can therefore pass an asset that still looks wrong.
10. **The renderer is a monolithic scene constructor rather than an art production system.** There is no independent asset turntable, UV bake/import stage, calibrated material preview, render-diff review or DCC/glTF round trip. Art iteration happens inside a large scene file, making controlled improvement slow.

## Corrective direction

Do not begin with another broad polish pass. Build one small **golden-room vertical slice** and require every layer to pass before propagating it:

1. Add neutral turntable and matched-reference cameras for one table, chair, sofa, cabinet and dressed character.
2. Replace self-declared review booleans with runtime measurements and image evidence from the current commit.
3. Use white base-color factors by default, validate map channels/seams, and implement measured UV scale and grain direction.
4. Move the five visible Hero assets to authored or generated-and-cleaned glTF meshes with real UVs; retain procedural meshes only as fallbacks.
5. Add baked or probe-based indirect lighting for static architecture, then layer restrained GTAO and direct practical lights.
6. Build original skinned garment meshes and role-specific silhouettes instead of attaching rigid limb covers to a generic body.
7. Match camera coverage and luminance distribution to the art contract before increasing prop count.
8. Only after the golden room passes, compile the same asset recipe and lighting rules across the remaining floors.

## Technical references

- [Three.js MeshStandardMaterial](https://threejs.org/docs/pages/MeshStandardMaterial.html)
- [Three.js color management](https://threejs.org/manual/en/color-management.html)
- [Khronos glTF metallic-roughness specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)
- [Epic physically based materials](https://dev.epicgames.com/documentation/en-us/unreal-engine/physically-based-materials-in-unreal-engine)
- [Epic shadowing and global illumination overview](https://dev.epicgames.com/documentation/unreal-engine/shadowing-in-unreal-engine)
- [Epic post-process ambient occlusion](https://dev.epicgames.com/documentation/en-us/unreal-engine/post-process-effects-in-unreal-engine)
