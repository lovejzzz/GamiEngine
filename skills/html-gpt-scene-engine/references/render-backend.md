# Replaceable render backend

Use this reference when an HTML game engine needs to reduce dependence on Three.js/WebGL, introduce WebGPU, or define what is actually engine-owned.

## Ownership boundary

Keep these systems owned by the engine and serializable without renderer objects:

- scene/building manifest, stable entity and child-part IDs;
- interaction, collision, navigation, doors, stairs, animation state and persistence;
- asset recipes, physical scale, pivots, material semantics and quality gates;
- camera intent and presentation policy, expressed as data rather than a vendor camera instance.

The backend adapter owns the graphics context, canvas lifecycle, resize, shadow implementation, environment-map compilation, post-processing, final frame submission, frame capture, GPU capability detection, renderer statistics and disposal.

Using a vendor scene graph during an intermediate migration is acceptable when declared honestly. It is not full backend independence, but it is a useful first boundary if gameplay data does not depend on that scene graph.

## Migration order

Move renderer responsibilities in an order that preserves a playable build:

1. Define one small engine contract for canvas, resize, render, visual filter, capture, capabilities, telemetry and disposal.
2. Put every current renderer behavior behind an adapter before changing its output. This includes tone mapping, exposure, AO, bloom, mood grade, environment light and accessibility attributes.
3. Select the concrete adapter in one factory. Game code must not instantiate a vendor renderer or post-processing pass.
4. Replace direct `renderer.domElement.dataset` access with backend debug state, and direct canvas sampling with backend capture.
5. Declare preferred/fallback backends and required capabilities in the scene manifest. Reject a backend with an exact missing-capability list instead of silently degrading critical visuals.
6. Run screenshot and play regressions before starting a WebGPU implementation. A clean abstraction that changes lighting, camera feel, collision timing or interaction feedback has failed.

Do not create a broad abstraction for every mesh and material in the first pass. First isolate lifecycle and final-frame responsibilities; then move scene-graph construction only when a second working backend proves which abstractions are actually shared.

## Capability policy

Express requirements in engine terms such as `post-processing`, `screen-space-ambient-occlusion`, `hdr-tone-mapping`, `shadow-maps`, `frame-capture`, skinning limits, texture limits and compressed-texture families. Do not branch gameplay on a browser user-agent string.

A WebGPU backend should begin as an opt-in path with WebGL fallback. Promote it only after it matches the Golden Room in:

- camera and cutaway composition;
- exposure, warm/cool hierarchy, contact depth and material response;
- authored character skinning and every required clip;
- doors, child-part interaction, collision visualization and stair traversal;
- visual-intelligence capture and stable performance telemetry.

## Evidence

Require type tests or pure unit tests for capability evaluation, then test the concrete adapter in a real browser. Record the active backend and API on the canvas/debug surface so browser automation can prove which path ran. Compare a stable screenshot before and after the migration and inspect console warnings, draw calls, triangles, geometry count and texture count.

Backend abstraction is an architectural quality claim, not a visual-quality claim. It prevents lock-in; it does not make coarse geometry, weak assets or flat lighting look better by itself.
