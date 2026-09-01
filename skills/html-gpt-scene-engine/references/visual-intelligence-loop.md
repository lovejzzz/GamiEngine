# Visual Intelligence Loop

Use this reference when a scene repeatedly passes technical checks but still looks coarse, toy-like, visually incoherent, or unlike its approved study. The objective is not to make an agent claim better taste. It is to make visual decisions observable, falsifiable, and cheap to revisit.

## The loop

1. Capture a fixed evidence set from the shipped renderer: full composition, player-follow view, one hero-asset close-up, one interaction state, one locomotion sample, and stair traversal when present.
2. Attach machine-readable context to each capture: build revision, floor, camera, viewport, actor position, active interaction states, asset-ready state, and visual-probe metrics.
3. Run narrow automated checks only where pixels are reliable: exposure, black/highlight clipping, midtone coverage, saturation band, subject coverage, edge density, image load state, and capture availability.
4. Keep semantic checks explicitly human-required: reference silhouette, construction logic, proportion, anatomy, garment continuity, animation naturalness, material identity, lived-in storytelling, and overall atmosphere.
5. Identify the earliest dominant failure layer before editing. Change one layer, recapture the same evidence set, and retain the change only when it improves all relevant views.
6. Preserve before/after captures and the reason for acceptance or rejection. Do not replace evidence with a prose claim or a manually entered score.

## False-pass protection

An automatic visual score is a regression signal, not a production score. Its report must include a non-overridable `productionCertifiable: false` or equivalent, list all pending semantic checks, and remain separate from the scene's release gate. A frame with ideal luminance can still contain primitive furniture, broken clothing, wrong proportions, or an incoherent camera.

Do not optimize the scene to the metric. If the black-ratio check counts the intentional void around a cutaway building, add segmentation or label the limitation; do not brighten the entire scene merely to make the number green. Every metric needs a named owner, target range, and explanation of what it cannot prove.

## Evidence layers

Prefer the smallest layer set that localizes the current problem:

- final color: composition, value hierarchy, palette, atmosphere;
- object or material ID: repeated primitives, missing variation, wrong material assignment;
- depth and normals: scale, occlusion, flat geometry, bevel and silhouette behavior;
- direct and indirect light: crushed interiors, floating assets, missing bounce/contact;
- motion samples: foot sliding, joint gaps, clothing discontinuity, collision response.

If the engine cannot emit these buffers yet, store that limitation as a blocker. Do not pretend a beauty capture is equivalent.

## Generated clothing on a skinned base

Use a generated texture as fitted clothing only when the source body has stable UVs and acceptable deformation.

- Edit the original atlas rather than generating a new character render.
- Preserve canvas dimensions, island position, orientation, seams, face, hands, and exposed-skin registration.
- Request flat albedo with no baked light, AO, highlight, cast shadow, logo, or presentation background.
- Resize only back to the exact source dimensions and keep glTF texture orientation/color-space settings.
- Remove rigid limb-cover stand-ins after the texture is connected. Flexible sleeves and trousers must follow skin weights; helmets, plates, pouches, weapons, and silhouette-changing coats remain independent geometry.
- Review face/hands, elbows/knees, torso side seams, ankle/foot islands, idle, walking, turning, interaction, and stairs. A pleasing atlas image is not evidence until it works on the mesh.

## Interaction-aware composition

Visual initial state is part of the asset/scene contract. Save physical rest data separately from presentation state where needed:

- `closedAngle` or equivalent defines interaction semantics and motor targets;
- `initialAngle` defines the authored first-frame pose;
- each independently movable child keeps its own state and save ID;
- first-frame doors, drawers, residents, and movable chairs must preserve the intended focal path and route clearance.

The browser pass must still close/open or move the part and verify collision; an attractive initial pose cannot disable interaction.

## Acceptance record

For each retained visual change record:

- failure layer and named symptom;
- before/after capture paths;
- automated metrics and known blind spots;
- semantic reviewer outcome;
- affected camera/motion/interaction states;
- remaining blockers.

Use this record to improve future prompts, blueprints, and tests. Do not convert one scene-specific preference into a universal rule unless repeated evidence supports it.
