# Webline MVP

## Run and structure

Open `index.html` in a modern browser, or run `python3 -m http.server` here. There is no build step, dependency, backend, or game engine. `index.html` owns the canvas and HUD; `style.css` owns the responsive overlay; `game.js` is one small IIFE with functions for input, world generation, physics, collision, camera, and drawing. Keep the project plain HTML/CSS/JavaScript and Canvas unless the scope changes.

## Physics and game loop

World coordinates use CSS pixels, with positive Y downward. `requestAnimationFrame` draws; `frame()` advances physics in fixed `1/120` second steps and caps catch-up after a stalled frame. Gravity and automatic rightward acceleration update velocity before position. A web attaches to a selected visible mast node above the player, usually ahead. Its length is set from the current distance; the rope may slacken, but when stretched `constrainRope()` projects the player back to the rope length and removes only outward radial velocity. Tangential velocity remains, so release preserves swing momentum. Speed is capped. `collide()` allows downward roof landings, kills on walls, red vents, or falling below the view. Camera X eases to keep the player about 28% from the left edge. Score is maximum forward distance, and best score uses optional `localStorage`.

## Controls and state

Each new run starts with a three-second countdown; any key or a tap skips it. Hold Space, mouse, or touch to attach/maintain the web; release to detach. Holding while no node is in range retries attachment every 0.09 seconds. The selected eligible node is marked by a ring. Press Ctrl or use the Jump button to jump while grounded. Hold Up/W or the Shorter button to reel in an attached web; hold Down/S or the Longer button to let it out within the configured rope limits. Esc or the Pause button pauses and resumes, clearing held inputs on pause. After death, only S or a mouse/touch click on the Swing more button resets to the countdown; a later key press or tap skips it. R resets during active play, countdown, or pause. A set tracks simultaneous web input sources so releasing one does not detach another. Blur releases all inputs. Resizing resets the run because roof and mast heights depend on viewport height.

## Tuning

Change `TUNE` at the top of `game.js`: `gravity`, `horizontalStartingSpeed`, `airAcceleration`, `swingAcceleration`, `groundAcceleration`, `maxSpeed`, `maxFallSpeed`, `minRopeLength`, `maxRopeLength`, `attachmentRange`, `ropeConstraintStrength`, `jumpSpeed`, `ropeAdjustSpeed`, `countdownSeconds`, `playerRadius`, `buildingSpacing`, `cameraSmoothing`, and `simulationStep`. Keep `ropeConstraintStrength` at `1` for the current taut-rope behavior. Building widths, heights, mast placement, and vent chance are in `makeBuilding()`/`generateAhead()`; attachment scoring is in `findAnchor()`.

## Current limits and checks

Attachment is automatic rather than aimed. Procedural gaps and vents have no difficulty balancing, and a badly timed swing can send the player backward. There are no menus, audio, progression systems, or saved run state by design. Before changing physics, run `node --check game.js` and play several hold/release/re-attach cycles at desktop and mobile sizes; verify roof landing, vent/wall/fall deaths, speed cap, rope length, and immediate restart. Avoid predefined swing arcs or release impulses that replace the momentum model.
