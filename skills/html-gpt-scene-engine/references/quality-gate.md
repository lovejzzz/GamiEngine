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

Score separate dimensions such as original art direction, Hero construction, materials, interaction/simulation, lighting, character fidelity, animation performance, and architectural/set-dressing completion. Give full weight only to passed dimensions. In-progress work may receive small progress credit but must not satisfy a critical gate; failed work receives none.

Production requires both a minimum score and every critical dimension passed. Report the blockers beside the score. Never raise the score to match a desired release label.

Use honest stages:

- `prototype`: the concept and systems are demonstrated, but important craft areas remain placeholders or incomplete;
- `candidate`: the complete experience is present and undergoing final evidence-based correction;
- `production`: the threshold is met, all critical gates pass, and browser/playtest evidence matches the shipped source.

## Evidence quality

Prefer evidence that can disprove readiness: geometry-type or hierarchy tests, missing-map checks, budget checks, close-up runtime captures, collision walks, one-child-only interaction tests, stair traversal, and console/runtime-error checks. A manifest field is a claim; a test or inspected runtime artifact is evidence.
