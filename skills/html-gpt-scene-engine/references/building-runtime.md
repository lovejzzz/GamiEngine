# Multi-room building runtime

Read this reference for occupied, multi-floor, low-light, or room-clearing scenes.

## Spatial structure

Model the building as a graph:

- floors are streamable nodes;
- stairs, ladders, elevators, and exterior entrances are portals;
- rooms are semantic zones used by AI, audio, objectives, and lighting;
- doors are dynamic graph edges whose open/locked/damaged state affects movement, visibility, and sound.

Keep a floor's geometry in local coordinates and preserve actor state when unloading it. Avoid rendering all floors superimposed; select one active floor and optionally show adjacent floors as debug context.

## Stair portals

Model stairs as walkable ramps or stepped surfaces plus a portal at each reachable end. Store the travel axis, uphill direction, physical rise, upper/lower floor IDs, and destination landing anchors. While the actor is inside the flight, derive vertical root height from normalized progress and blend a stair locomotion pose from actual movement. Trigger streaming only when velocity points through the corresponding end band. Place the actor on a clear destination landing and disarm the portal until the actor exits its trigger, so a held key cannot cascade through several floors. Keep direct floor-selection UI and explicit up/down keys as editor/debug paths, not the primary play interaction.

## Collision policy

Inventory collision separately from visuals and interactions. Walls, substantial furniture, movable chairs, and standing occupants are usually blocking bodies; stair portals and rugs are usually pass-through triggers. State-linked parts such as open drawers may need a different shape from their closed state. Move saved colliders with their instance transform and resolve diagonal motion with axis sliding so actors do not stick at corners.

## Door simulation

For a hinged door, store hinge position, closed angle, min/max angles, width, mass/inertia approximation, angular velocity, damping, optional closer/motor target, and lock state. Contact torque is based on the cross product between hinge-to-contact arm and actor velocity/force. Clamp at angle limits and block passage when the door capsule still intersects the actor.

## Visibility and sound

Use runtime light/visibility layers. Asset art should remain neutrally lit so power switches, night vision, flashlights, smoke, and broken bulbs can change the same room.

Room/portal graphs provide a cheap first audio model: closed doors and wall materials attenuate voices and footsteps; open doors reduce occlusion. Add ray tests only where audible precision materially improves play.

## Occupants

Separate:

- appearance asset;
- affiliation/role state;
- current behavior;
- perceived information and alertness;
- navigation position and collider;
- animation clip.

Do not encode “hostile-looking” appearance as role truth. Unknown occupants should become identified through behavior, game rules, or authored state transitions.

Patrol and investigate behaviors require navigation waypoints or a navigation mesh, persistent actor position, collision against props and other actors, and a locomotion clip blended from actual movement speed. An in-place walk cycle is an animation preview, not navigation.

## Interaction targeting

Select one stable target using distance plus facing, reject targets hidden behind blocking walls, and show which target will receive input. Use a short actor-level busy interval for hinged, sliding, searching, or pickup actions. This serializes the actor's operation without forcing sibling parts to share one state; multiple cabinet children may remain independently open after separate completed actions.

## Originality when using references

When the user references a known level, derive qualities such as pacing, claustrophobia, floor-by-floor progression, domestic set dressing, low light, and uncertain occupants. Create a different footprint, room connections, resident placement, names, props, and narrative identity.
