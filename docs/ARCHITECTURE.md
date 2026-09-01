# Gami Engine architecture

## Design goal

Gami Engine treats generation as an art-direction input, not as the simulation. The base must survive replacing every image, changing the renderer, or streaming a floor out of memory without changing gameplay identity or saved state.

## Stable boundaries

### Scene manifest

`engine/types.ts` is the versioned contract. Stable IDs connect floors, rooms, assets, doors, occupants, props, and child parts. World geometry is stored in explicit units and converted through `pixelsPerMeter`; image dimensions never define physical dimensions.

Version 2 declares the renderer and the role of each generated image:

- `reference-study`: modeling input only; must carry `never-render-directly` and a geometry plan.
- `runtime-texture`: surface data with semantic, color space, tileability, and meters per tile.
- `runtime-sprite`: an intentionally 2D atlas/fallback with frame and pivot metadata.

`engine/asset-registry.ts` is the runtime gate. The renderer receives only assets whose declared role matches its request, so an object reference cannot accidentally ship as a fake 3D billboard.

### Simulation

`engine/runtime.ts` contains deterministic, renderer-independent rectangle/circle collision, axis sliding, line-of-sight targeting, and hinge math. Runtime door state stores angle, angular velocity, limits, and optional motor target. The scene component owns a persistent memory record per floor for door angles, parent prop states, child states, moved-object offsets, and occupant navigation positions.

Compound interactions are addressed by `parentId:partId`. The input system scores one target by distance and facing, rejects targets occluded by walls or fixtures, displays the selected target, and serializes operations through an actor-level busy interval. Streaming a floor back in rebuilds geometry and then reapplies saved transforms and visibility.

Collision is declared independently from appearance. Walls and fixed room details use rectangles; movable props carry their collider with their saved offset; standing occupants use persistent circles; stairs remain explicit pass-through portal zones.

### Rendering

The demo uses Three.js WebGL with sRGB output and ACES tone mapping. Generated base-color maps are declared sRGB; a later roughness/normal/metalness pipeline should load those data maps as linear. One directional light and one player spotlight own dynamic shadows. Room point lights are fill-only because a shadowed point light renders six shadow views.

The cutaway keeps the south wall low, side walls medium, and internal walls readable. The editor camera supports inspection; follow mode evaluates the actual play experience. Fog and night vision are runtime effects rather than baked into generated textures.

### Characters

The current demo builds articulated two-joint procedural limbs, blends idle/walk weights, and drives patrol/investigate clips from real waypoint movement. Sleeping and hiding are separate poses. Every character recipe carries a shared skeleton ID plus an implemented/required clip inventory. The existing 4×4 generated sprite atlas remains a declared runtime fallback. Production characters can move to skinned glTF clips without changing occupant IDs or AI behavior.

## Asset production pipeline

1. Inventory gameplay capabilities before generation.
2. Generate a coherent reference study under the scene style lock.
3. Extract dimensions, silhouette, construction, material zones, and every movable child.
4. Build procedural geometry or glTF with stable child IDs, pivots, UVs, and colliders.
5. Generate neutral, seamless textures by material zone.
6. Apply runtime light, shadow, fog, animation, and interaction.
7. Walk the scene; validate one-child-only mutation and state restoration.

## Production extension points

- Add an async glTF loader behind the existing `geometry.source` contract.
- Use KTX2/Basis textures and meshopt/Draco compression for larger scenes.
- Add normal/roughness maps and environment lighting without changing asset roles.
- Move floor memory into a serializable save service.
- Replace the lightweight circle/rectangle solver with a physics adapter while preserving stable body IDs.
- Replace waypoint patrols with navigation meshes and behavior trees keyed by occupant IDs.
- Pool shared geometries/materials and use instancing for repeated props.
- Add accessibility input remapping and gamepad controls.

## Performance policy

- Stream one floor at a time and dispose GPU resources on unmount.
- Cap device pixel ratio at 2.
- Keep shadow-casting lights scarce and their frusta tight.
- Use procedural fallback meshes while authored assets load.
- Compress production glTF and textures; generated PNGs in this demo favor inspectability over download size.
- Profile draw calls, triangles, texture memory, and frame time before increasing visual complexity.

The rendering choices follow current Three.js guidance on [color management](https://threejs.org/manual/en/color-management.html), [shadow costs](https://threejs.org/manual/en/shadows.html), and the [glTF loader extension path](https://threejs.org/docs/pages/GLTFLoader.html).
