# Multi-room building runtime

Read this reference for occupied, multi-floor, low-light, or room-clearing scenes.

## Spatial structure

Model the building as a graph:

- floors are streamable nodes;
- stairs, ladders, elevators, and exterior entrances are portals;
- rooms are semantic zones used by AI, audio, objectives, and lighting;
- doors are dynamic graph edges whose open/locked/damaged state affects movement, visibility, and sound.

Keep a floor's geometry in local coordinates and preserve actor state when unloading it. Avoid rendering all floors superimposed; select one active floor and optionally show adjacent floors as debug context.

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

## Originality when using references

When the user references a known level, derive qualities such as pacing, claustrophobia, floor-by-floor progression, domestic set dressing, low light, and uncertain occupants. Create a different footprint, room connections, resident placement, names, props, and narrative identity.
