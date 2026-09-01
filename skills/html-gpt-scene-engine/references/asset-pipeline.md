# GPT asset pipeline

Read this reference when generating or integrating images.

## Style consistency lock

Approve one asset-family contract before bulk generation:

- exact camera/projection wording;
- physical scale or texel density;
- neutral material-light direction and softness;
- palette and surface age;
- silhouette/edge treatment;
- transparent or tileable background requirement;
- negative constraints: no scene context, perspective, text, watermark, baked cast shadow, or franchise identity.

Use a visual master as an input reference for related character frames and two-sided object variants when the image tool supports references. Keep the textual lock as well; the reference does not replace metadata.

## Generation units

- Tile: fills the canvas edge-to-edge, no perspective, verify seams on a 3×3 repeat.
- Wall: generate wall top/cut surface separately from vertical faces. A floor-plan renderer often needs the top; a pseudo-3D renderer may need both side faces.
- Door: generate front and back from the same master. Keep frame, hinge, thickness, knob collision, lock, and angle outside the bitmap.
- Prop: isolated alpha, strict overhead view, no cast shadow, physical size and pivot recorded.
- Character: approve one master, then derive directional atlas or layered rig. Keep name/role labels outside the image.

## 3D image roles

Do not send every generated image straight to the renderer. Assign one role first:

- `reference-study`: an object-design image used to extract silhouette, proportions, construction, material zones, palette, and wear. It may show the whole object, but it must never become a plane or object texture at runtime.
- `runtime-texture`: a seamless, neutral-lit surface map applied to UV-authored geometry. It must contain no whole-object silhouette, perspective, handles, hinges, cast shadows, or movable seams.
- `runtime-sprite`: an intentionally 2D character/FX atlas or fallback with declared projection, alpha, frame layout, pivot, and world footprint.

For a reference study, annotate which visible pieces must become separate meshes before modeling. For a cabinet this usually means carcass, worktop, every usable door leaf, every usable drawer box/front, handle, and hinge/slide anchor. Preserve these IDs in interaction and save data.

## Interaction-first asset coverage

Before making a prop image, write its capability and state matrix:

| Capability | Minimum reusable assets |
| --- | --- |
| Static / inspect | One approved base image |
| Push / move | One isolated image; transform and collision remain runtime data |
| Open / search | Closed/base plus every visually distinct opened or revealed state |
| Hinged subparts | Carcass/base plus each reusable leaf/front; animate each child hinge independently |
| Break / damage | Intact, transition/debris if visible, and damaged/destroyed states |
| Character movement | Approved master plus real directional walk frames and required action clips |

Do not use an “all doors open” image as the state of a cabinet with several independently usable doors. It may be kept as a rejected contact-sheet reference, but runtime assets must support one-child-at-a-time state changes.

## Character animation choices

Use an atlas when the renderer is sprite-based and action count is bounded. Use a layered 2D rig when many motions, equipment swaps, or aim directions would cause atlas explosion.

Atlas baseline:

- prototype: N/E/S/W rows, four walk phases per row, 6–10 FPS;
- production: eight directions and 6–8 phases when close camera scale reveals foot sliding;
- retain idle, interaction, hurt, and other clips only if the game actually uses them.

Generate the atlas from an approved master in one consistent operation where possible. If an image model returns a painted checkerboard, perform a background-extraction edit and verify the resulting file has alpha. Also inspect frame count, row order, stable scale, complete limbs, equipment continuity, and usable per-cell margins.

Run:

```bash
node scripts/inspect_png_atlas.mjs path/to/atlas.png 4 4
```

This verifies PNG structure, dimensions, color type, alpha support, and reports cell geometry. It does not prove pose quality; inspect the image as well.

## Integration

Register final files in the asset manifest. Renderer code should resolve by asset ID and provide a procedural or neutral missing-asset fallback. The asset resolver must refuse `reference-study` as a runtime map. Never expose an API key to the browser: generation requests go through a server endpoint, and returned files should move into durable project or object storage before being treated as ready.
