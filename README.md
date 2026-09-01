# Gami Engine

Gami Engine is a GPT-native 3D HTML game-scene foundation. Generated images define visual taste in two controlled roles: object reference studies teach modeling decisions, and seamless runtime textures color engine-owned geometry. Interaction, collision, lighting, animation, and save state remain deterministic code and scene data.

The included demo is an original four-floor townhouse built around tense, room-by-room exploration. It uses no copied map, characters, branding, or assets from an existing game.

## What is working

- Three.js cutaway renderer with editor-orbit and player-follow cameras
- Four independently streamed floors connected by explicit stair portals
- WASD movement, wall/prop collision, pushable two-sided hinge doors, and door motors
- Nearest-target interaction with independent cabinet doors and drawers
- Persistent door, prop, child-part, and moved-object state across floor streaming
- Articulated 3D operator/resident rigs with procedural walk cycles and behavior poses
- Directional moonlight, dynamic player flashlight shadows, room fill lights, fog, ACES tone mapping, and night vision
- GPT asset lab and server-only image-generation route
- Manifest-enforced separation of `reference-study`, `runtime-texture`, and `runtime-sprite`
- Procedural fallbacks so the scene stays playable when generated art is unavailable

## Run locally

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

```bash
npm test
npm run typecheck
npm run build
```

To enable the Asset Lab generation button, set `OPENAI_API_KEY` only in the server environment. The key is never sent to the browser.

## Demo controls

| Input | Action |
| --- | --- |
| `W A S D` / arrows | Walk |
| `E` | Open/close the nearest door; physical contact can also push it |
| `Q` | Use the nearest prop or one independent child part |
| `R` / `F` | Go up/down while standing on stairs |
| Camera button | Switch editor orbit / player follow |
| NV button | Toggle night vision |
| Collision button | Toggle collider outlines |

## The image-to-3D contract

```text
generated reference study ──learn──> silhouette / proportion / material zones
                                         │
                                         v
                              procedural mesh or glTF
                                         │
generated seamless texture ───UV map─────┤
                                         v
                         runtime light + physics + state
```

A whole-object reference image is never rendered on a plane to impersonate 3D. If a visible piece can move, reveal space, block the player, or retain state, it becomes a separately modeled child with a stable ID, pivot/axis, collider, and state machine. This is why one kitchen interaction cannot accidentally open every cabinet at once.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the engine boundaries and extension path. The reusable Codex skill lives in [skills/html-gpt-scene-engine/SKILL.md](skills/html-gpt-scene-engine/SKILL.md).

## Project map

```text
app/                         Next/Vinext shell and server image route
components/                  Engine studio and Three.js demo viewport
engine/types.ts              Versioned scene contract
engine/demo-scene.ts         Four-floor demo manifest
engine/asset-registry.ts     Runtime/reference asset boundary
engine/runtime.ts            Deterministic collision and door physics
public/assets/               Generated studies, textures, and sprite fallback
skills/html-gpt-scene-engine Reusable scene-building workflow and validators
```

The repository currently has no declared open-source license. Add one before redistributing or accepting external contributions.
