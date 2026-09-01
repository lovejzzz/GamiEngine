# Evidence-backed craft gate

Use this gate to prevent a functional AI-generated demo from being mislabeled as a finished work.

## Two levels of readiness

An asset gate answers whether one runtime asset is production-ready. A scene gate answers whether the complete player experience is production-ready. Passing Hero furniture does not compensate for placeholder characters, crude animation, unfinished architecture, weak lighting, or untested routes.

For each Hero asset, require evidence for:

- identity-consistent reference views and `never-render-directly` separation;
- measured geometry bridge and characteristic construction parts;
- topology appropriate to the object rather than one global primitive family;
- runtime base color, normal, roughness and adequate texel density;
- bevel, triangle, draw-call and LOD budgets;
- close-up silhouette, proportion, construction and material-response review;
- interaction and collision playtest when the object participates in gameplay.

Reject generic shortcuts explicitly. Record prohibited patterns such as one inflated rounded box, one baked whole-object image, or one global bevel radius across hard and soft materials.

## Whole-scene scoring

Score separate dimensions such as original art direction, non-toy form language, Hero construction, materials, interaction/simulation, lighting, character fidelity, animation performance, and architectural/set-dressing completion. Give full weight only to passed dimensions. In-progress work may receive small progress credit but must not satisfy a critical gate; failed work receives none.

The form-language dimension fails when the full frame reads as a miniature or construction kit: repeated capsules and boxes dominate silhouettes, hard and soft materials share one edge radius, people stand in display poses, fixtures repeat mechanically, rooms are perfectly staged, or conspicuous graybox bodies remain. Judge both the complete cutaway and a close player-follow view; an attractive furniture close-up cannot pass this dimension by itself.

Character fidelity fails when a rigged carrier body is visible as the costume, clothing leaves large anatomy-texture patches around shoulders/hips/knees, rigid add-ons detach during motion, feet slide or penetrate stairs, the fallback is mistaken for the authored load, or roles differ only by one tint. Require a runtime-ready signal plus idle, locomotion, stair and interaction captures from at least front and back presentation angles.

Production requires both a minimum score and every critical dimension passed. Report the blockers beside the score. Never raise the score to match a desired release label.

Use honest stages:

- `prototype`: the concept and systems are demonstrated, but important craft areas remain placeholders or incomplete;
- `candidate`: the complete experience is present and undergoing final evidence-based correction;
- `production`: the threshold is met, all critical gates pass, and browser/playtest evidence matches the shipped source.

## Evidence quality

Prefer evidence that can disprove readiness: cross-section variation and geometry hierarchy tests, missing-map checks, budget checks, full-frame and follow-camera captures, collision walks, one-child-only interaction tests, stair traversal, and console/runtime-error checks. A manifest field is a claim; a test or inspected runtime artifact is evidence.

## Visual bottleneck audit

Use this audit when repeated polishing produces only small gains. Evaluate in order and identify the first failing layer; downstream effects cannot compensate for it.

1. **Framing and readable range:** compare the shipped viewport to the art-direction study at a matched aspect ratio. Measure building frame coverage and luminance distribution. Large near-black regions are allowed only when they preserve readable silhouettes and navigation; a mood grade must not erase material or construction evidence.
2. **Geometry and silhouette:** render each Hero asset in a neutral-light turntable at a matched reference view. Compare outer contour and reference-defining landmarks. Geometry-type names, child counts and declared part lists do not prove resemblance.
3. **UV and maps:** inspect real UV scale and orientation on the shipped mesh. Test base-color seam continuity, normal-map channel validity, grayscale roughness, and pixels per meter. A texture path in the manifest is not proof that the shader uses a valid map at visible strength.
4. **Material calibration:** test the asset with a white base-color factor under a neutral HDR environment before grading. Record any deliberate tint. Reject accidental double-darkening from a colored albedo multiplied by a dark factor.
5. **Lighting transport:** separate direct light, indirect fill, contact shading and post-processing during review. Ambient occlusion is a subtle contact cue, not global illumination; adding AO to a scene with insufficient bounce usually deepens black cavities instead of making them believable.
6. **Scene variation:** check repeated fixtures, empty floor area, prop scale hierarchy, decals, localized wear and resident evidence. More copies of the same primitive family do not increase authored density.
7. **Character presentation:** inspect the actual dressed, animated character at a useful close distance. Rigid cylinders and spheres attached to a quality body rig still read as a toy costume, and a high triangle count in the hidden carrier does not improve the visible garment silhouette.

Evidence must come from the current shipped revision. Do not reuse one screenshot to pass unrelated assets, and do not encode all review booleans through a helper that always returns `true`. A valid gate should fail when the renderer changes, the wrong asset loads, maps become invalid, the camera hides construction, or the comparison capture visibly diverges from its reference.
