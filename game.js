(() => {
  'use strict';

  // Game feel: change these values first. World units are CSS pixels; time is seconds.
  const TUNE = Object.freeze({
    gravity: 1650,
    horizontalStartingSpeed: 310,
    airAcceleration: 190,
    swingAcceleration: 330,
    groundAcceleration: 850,
    maxSpeed: 930,
    maxFallSpeed: 1100,
    minRopeLength: 95,
    maxRopeLength: 370,
    attachmentRange: 390,
    ropeConstraintStrength: 1, // 1 = a taut, inextensible rope
    jumpSpeed: 620,
    ropeAdjustSpeed: 170,
    countdownSeconds: 3,
    playerRadius: 13,
    buildingSpacing: [88, 135],
    cameraSmoothing: 5.5,
    simulationStep: 1 / 120,
  });

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreNode = document.getElementById('score');
  const bestNode = document.getElementById('best');
  const finalNode = document.getElementById('final-score');
  const deathNode = document.getElementById('death');
  const restartButton = document.getElementById('restart-button');
  const countdownNode = document.getElementById('countdown');
  const countdownNumberNode = document.getElementById('countdown-number');
  const pauseNode = document.getElementById('pause');
  const pauseButton = document.getElementById('pause-button');
  const resumeButton = document.getElementById('resume-button');
  const jumpButton = document.getElementById('jump-button');
  const shortenButton = document.getElementById('shorten-button');
  const lengthenButton = document.getElementById('lengthen-button');
  const controlsNode = document.querySelector('.game-controls');
  const hintNode = document.getElementById('hint');
  const TAU = Math.PI * 2;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const rand = (min, max) => min + Math.random() * (max - min);

  let W = 0, H = 0, dpr = 1, player, rope, buildings, particles, camera, nextBuildingX;
  let state = 'countdown', resumeState = 'running', countdownRemaining = 0;
  let retryAt = 0, elapsed = 0, score = 0, best = 0;
  const pressedInputs = new Set();
  const shortenInputs = new Set();
  const lengthenInputs = new Set();
  let accumulator = 0, lastFrame = 0, flash = 0;

  try { best = Number(localStorage.getItem('webline-best')) || 0; } catch (_) { /* Private browsing can disable storage. */ }
  bestNode.textContent = formatScore(best);

  function formatScore(n) { return String(Math.floor(n)).padStart(4, '0'); }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    reset(); // Geometry scales to the screen height, so resize begins a clean run.
  }

  function reset() {
    state = 'countdown';
    countdownRemaining = TUNE.countdownSeconds;
    pressedInputs.clear();
    shortenInputs.clear();
    lengthenInputs.clear();
    shortenButton.classList.remove('active');
    lengthenButton.classList.remove('active');
    rope = null;
    buildings = [];
    particles = [];
    camera = { x: 0 };
    elapsed = 0;
    score = 0;
    flash = 0;
    retryAt = 0;
    accumulator = 0;
    player = { x: 116, y: H * 0.43, px: 116, py: H * 0.43, vx: TUNE.horizontalStartingSpeed, vy: 0, grounded: false, landingTimer: 0, tumbleTimer: 0, tumbleAngle: 0, pose: null };
    buildings.push(makeBuilding(-260, 600, H * 0.77, 0));
    nextBuildingX = 340 + rand(...TUNE.buildingSpacing);
    generateAhead();
    scoreNode.textContent = '0000';
    deathNode.hidden = true;
    controlsNode.classList.remove('hidden-controls');
    pauseNode.hidden = true;
    pauseButton.firstChild.textContent = 'PAUSE ';
    countdownNode.hidden = false;
    countdownNumberNode.textContent = String(Math.ceil(countdownRemaining));
    lastFrame = performance.now();
  }

  function makeBuilding(x, width, top, index) {
    const anchors = [];
    // Each roof carries a visible mast node. Wide roofs carry two.
    const count = width > 440 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const ax = x + width * (count === 1 ? 0.62 : (i === 0 ? 0.37 : 0.79));
      anchors.push({ x: ax, y: clamp(top - rand(280, 340), H * 0.13, H * 0.28) });
    }
    const hazards = [];
    if (index > 1 && Math.random() < 0.68) {
      hazards.push({ x: x + width * rand(0.45, 0.75), w: 27, h: 26 });
    }
    return { x, w: width, top, anchors, hazards, index };
  }

  function generateAhead() {
    while (nextBuildingX < player.x + W * 2 + 500) {
      const index = buildings.length;
      const width = rand(285, 485);
      const top = clamp(H * rand(0.66, 0.81), H * 0.55, H - 95);
      const building = makeBuilding(nextBuildingX, width, top, index);
      buildings.push(building);
      nextBuildingX += width + rand(...TUNE.buildingSpacing);
    }
    while (buildings.length > 4 && buildings[0].x + buildings[0].w < camera.x - 500) buildings.shift();
  }

  function findAnchor() {
    let choice = null;
    let bestCost = Infinity;
    for (const building of buildings) for (const anchor of building.anchors) {
      const screenX = anchor.x - camera.x;
      if (screenX < 16 || screenX > W - 16) continue;
      const dx = anchor.x - player.x;
      const dy = anchor.y - player.y;
      const length = Math.hypot(dx, dy);
      if (dx < -65 || dx > TUNE.attachmentRange || dy > -60 || length < TUNE.minRopeLength || length > Math.min(TUNE.maxRopeLength, TUNE.attachmentRange)) continue;
      // Prefer a nearby node ahead; a slightly behind node remains usable late in a swing.
      const cost = length + Math.max(0, -dx) * 2.4 + Math.abs(dx - 145) * 0.08;
      if (cost < bestCost) { bestCost = cost; choice = { x: anchor.x, y: anchor.y, length }; }
    }
    return choice;
  }

  function burst(x, y, color, count, speed = 95) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * TAU;
      const velocity = rand(speed * 0.25, speed);
      particles.push({ x, y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity, life: rand(0.22, 0.54), maxLife: 0.54, size: rand(1.5, 3.5), color });
    }
  }

  function attach() {
    if (state !== 'running' || rope) return;
    const point = findAnchor();
    if (!point) return;
    rope = { x: point.x, y: point.y, length: point.length * 0.985 };
    player.grounded = false;
    burst(point.x, point.y, '#96ecff', 9, 75);
    flash = Math.max(flash, 0.09);
  }

  function release() {
    if (!rope) return;
    burst(player.x, player.y, '#d7f8ff', 5, 60);
    rope = null; // Velocity is deliberately unchanged.
  }

  function jump() {
    if (state !== 'running' || !player.grounded) return;
    release();
    player.vy = -TUNE.jumpSpeed;
    player.grounded = false;
    burst(player.x, player.y + TUNE.playerRadius, '#b9efff', 7, 85);
  }

  function startRun() {
    if (state !== 'countdown') return;
    countdownRemaining = 0;
    state = 'running';
    countdownNode.hidden = true;
  }

  function togglePause() {
    if (state === 'dead') return;
    if (state === 'paused') {
      state = resumeState;
      pauseNode.hidden = true;
      countdownNode.hidden = state !== 'countdown';
      pauseButton.firstChild.textContent = 'PAUSE ';
      lastFrame = performance.now();
      accumulator = 0;
      return;
    }
    resumeState = state;
    state = 'paused';
    pressedInputs.clear();
    shortenInputs.clear();
    lengthenInputs.clear();
    shortenButton.classList.remove('active');
    lengthenButton.classList.remove('active');
    release();
    countdownNode.hidden = true;
    pauseNode.hidden = false;
    pauseButton.firstChild.textContent = 'RESUME ';
  }

  function press(event) {
    if (event && event.cancelable) event.preventDefault();
    if (state === 'paused' || state === 'dead') return;
    startRun();
    const key = event && event.code === 'Space' ? 'space' : `pointer-${event?.pointerId ?? 0}`;
    if (pressedInputs.has(key)) return;
    pressedInputs.add(key);
    hintNode.classList.add('faded');
    attach();
  }

  function unpress(event) {
    if (event && event.cancelable) event.preventDefault();
    const key = event && event.code === 'Space' ? 'space' : `pointer-${event?.pointerId ?? 0}`;
    pressedInputs.delete(key);
    if (pressedInputs.size === 0) release();
  }

  function constrainRope() {
    if (!rope) return;
    const dx = player.x - rope.x;
    const dy = player.y - rope.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= rope.length || distance < 0.0001) return; // Rope can go slack.
    const nx = dx / distance;
    const ny = dy / distance;
    const correction = (distance - rope.length) * TUNE.ropeConstraintStrength;
    player.x -= nx * correction;
    player.y -= ny * correction;
    const outwardSpeed = player.vx * nx + player.vy * ny;
    if (outwardSpeed > 0) {
      player.vx -= nx * outwardSpeed;
      player.vy -= ny * outwardSpeed;
    }
  }

  function hitCircleRect(cx, cy, radius, x, y, width, height) {
    const nearestX = clamp(cx, x, x + width);
    const nearestY = clamp(cy, y, y + height);
    const dx = cx - nearestX, dy = cy - nearestY;
    return dx * dx + dy * dy < radius * radius;
  }

  function die() {
    if (state !== 'running') return;
    state = 'dead';
    player.tumbleTimer = 0.4;
    player.tumbleAngle = 0;
    pressedInputs.clear();
    release();
    burst(player.x, player.y, '#ff626b', 24, 210);
    flash = 0.28;
    finalNode.textContent = formatScore(score);
    deathNode.hidden = true;
    controlsNode.classList.add('hidden-controls');
    if (score > best) {
      best = score;
      bestNode.textContent = formatScore(best);
      try { localStorage.setItem('webline-best', String(best)); } catch (_) { /* Storage is optional. */ }
    }
  }

  function collide() {
    const r = TUNE.playerRadius;
    const wasGrounded = player.grounded;
    player.grounded = false;
    for (const building of buildings) {
      if (building.x > player.x + r + 40 || building.x + building.w < player.x - r - 40) continue;
      for (const hazard of building.hazards) {
        if (hitCircleRect(player.x, player.y, r, hazard.x, building.top - hazard.h, hazard.w, hazard.h)) { die(); return; }
      }
      if (!hitCircleRect(player.x, player.y, r, building.x, building.top, building.w, H - building.top + 200)) continue;
      const overRoof = player.px + r > building.x && player.px - r < building.x + building.w;
      if (player.py + r <= building.top + 3 && player.vy >= -10 && overRoof) {
        if (!wasGrounded && player.vy > 90) player.landingTimer = 0.22;
        player.y = building.top - r;
        player.vy = 0;
        player.grounded = true;
      } else { die(); return; }
    }
    if (player.y - r > H + 80) die();
  }

  function update(dt) {
    if (state === 'countdown') {
      countdownRemaining = Math.max(0, countdownRemaining - dt);
      const nextNumber = String(Math.ceil(countdownRemaining));
      if (countdownNumberNode.textContent !== nextNumber) countdownNumberNode.textContent = nextNumber;
      if (countdownRemaining === 0) startRun();
      return;
    }
    if (state !== 'running') return;
    elapsed += dt;
    player.landingTimer = Math.max(0, player.landingTimer - dt);
    if (rope) {
      const direction = Number(lengthenInputs.size > 0) - Number(shortenInputs.size > 0);
      rope.length = clamp(rope.length + direction * TUNE.ropeAdjustSpeed * dt, TUNE.minRopeLength, TUNE.maxRopeLength);
    }
    if (pressedInputs.size && !rope && elapsed >= retryAt) {
      attach();
      retryAt = elapsed + 0.09;
    }
    player.px = player.x;
    player.py = player.y;
    const acceleration = player.grounded ? TUNE.groundAcceleration : (rope ? TUNE.swingAcceleration : TUNE.airAcceleration);
    if (player.vx < TUNE.horizontalStartingSpeed) player.vx = Math.min(TUNE.horizontalStartingSpeed, player.vx + acceleration * dt);
    else player.vx += (rope ? TUNE.swingAcceleration : TUNE.airAcceleration * 0.25) * dt;
    player.vy = Math.min(TUNE.maxFallSpeed, player.vy + TUNE.gravity * dt);
    const speed = Math.hypot(player.vx, player.vy);
    if (speed > TUNE.maxSpeed) {
      const scale = TUNE.maxSpeed / speed;
      player.vx *= scale;
      player.vy *= scale;
    }
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    constrainRope();
    if (!Number.isFinite(player.x) || !Number.isFinite(player.y) || !Number.isFinite(player.vx) || !Number.isFinite(player.vy)) { reset(); return; }
    score = Math.max(score, Math.max(0, player.x - 116) / 10);
    scoreNode.textContent = formatScore(score);
    collide();
    const target = Math.max(0, player.x - W * 0.28);
    camera.x += (target - camera.x) * (1 - Math.exp(-TUNE.cameraSmoothing * dt));
    generateAhead();
  }

  function drawSky() {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#091022'); sky.addColorStop(0.62, '#17243c'); sky.addColorStop(1, '#243249');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    const moonX = W * 0.78 - camera.x * 0.015;
    const moonY = H * 0.20;
    ctx.fillStyle = '#c8d8f118'; ctx.beginPath(); ctx.arc(moonX, moonY, 72, 0, TAU); ctx.fill();
    ctx.fillStyle = '#dbe8f4c9'; ctx.beginPath(); ctx.arc(moonX, moonY, 34, 0, TAU); ctx.fill();
    for (let i = 0; i < 65; i++) {
      const x = ((i * 179.3 - camera.x * 0.07) % (W + 80) + W + 80) % (W + 80);
      const y = 35 + ((i * 137.9) % (H * 0.50));
      ctx.fillStyle = i % 4 === 0 ? '#d8e6fa7a' : '#b7cbed43';
      ctx.fillRect(x, y, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
    }
    drawSkyline(0.14, H * 0.64, '#1c2b40', 114, 0.13);
    drawSkyline(0.31, H * 0.77, '#1a293b', 87, 0.19);
  }

  function drawSkyline(parallax, baseline, color, period, heightScale) {
    const offset = (camera.x * parallax) % period;
    ctx.fillStyle = color;
    for (let i = -2; i < W / period + 3; i++) {
      const id = i + Math.floor(camera.x * parallax / period);
      const height = H * heightScale + ((Math.sin(id * 12.9898) * 43758.5453) % 1 + 1) % 1 * H * heightScale;
      ctx.fillRect(i * period - offset, baseline - height, period * 0.72, H);
    }
  }

  function drawBuildings() {
    for (const building of buildings) {
      const x = building.x - camera.x;
      if (x > W + 80 || x + building.w < -80) continue;
      const top = building.top;
      ctx.fillStyle = '#101b2e'; ctx.fillRect(x, top, building.w, H - top + 10);
      ctx.fillStyle = '#30425b'; ctx.fillRect(x - 3, top - 7, building.w + 6, 9);
      ctx.fillStyle = '#1d3046'; ctx.fillRect(x, top + 2, building.w, 4);
      // Stable window pattern, independent of frame or camera position.
      for (let col = 0; col < Math.floor((building.w - 20) / 30); col++) for (let row = 0; row < Math.ceil((H - top) / 36); row++) {
        const lit = ((col * 17 + row * 31 + building.index * 13) % 7) < 2;
        ctx.fillStyle = lit ? '#e5bc7980' : '#51627d35';
        ctx.fillRect(x + 16 + col * 30, top + 22 + row * 36, 9, 13);
      }
      for (const anchor of building.anchors) {
        const ax = anchor.x - camera.x;
        ctx.strokeStyle = '#6689a27a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(ax, top - 7); ctx.lineTo(ax, anchor.y); ctx.stroke();
        ctx.fillStyle = '#55d6ef26'; ctx.beginPath(); ctx.arc(ax, anchor.y, 16, 0, TAU); ctx.fill();
        ctx.fillStyle = '#a5f2ff'; ctx.beginPath(); ctx.arc(ax, anchor.y, 4.5, 0, TAU); ctx.fill();
      }
      for (const hazard of building.hazards) {
        const hx = hazard.x - camera.x;
        ctx.fillStyle = '#ed5962'; ctx.fillRect(hx, top - hazard.h, hazard.w, hazard.h);
        ctx.fillStyle = '#ff9c92'; ctx.fillRect(hx + 4, top - hazard.h + 4, hazard.w - 8, 4);
        ctx.fillStyle = '#ff666e54'; ctx.fillRect(hx - 5, top - 3, hazard.w + 10, 4);
      }
    }
  }

  function drawAnchorCue() {
    if (state !== 'running' || rope) return;
    const anchor = findAnchor();
    if (!anchor) return;
    const radius = 10 + Math.sin(elapsed * 6) * 2;
    ctx.strokeStyle = '#b3f2ffc2';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(anchor.x - camera.x, anchor.y, radius, 0, TAU);
    ctx.stroke();
  }

  function drawSuitLimb(sx, sy, jointX, jointY, endX, endY, width, accent) {
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(jointX, jointY); ctx.lineTo(endX, endY);
    ctx.strokeStyle = '#080e19'; ctx.lineWidth = width + 2; ctx.stroke();
    ctx.strokeStyle = '#252b36'; ctx.lineWidth = width; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(jointX, jointY); ctx.lineTo(endX, endY);
    ctx.strokeStyle = accent; ctx.lineWidth = width - 2; ctx.stroke();
    ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(endX, endY, width * 0.37, 0, TAU); ctx.fill();
  }

  function drawPlayer(dt) {
    const x = player.x - camera.x, y = player.y - 10;
    const stride = Math.sin(elapsed * 16);
    const landing = clamp(player.landingTimer / 0.22, 0, 1);
    const target = {
      lean: clamp(player.vx / TUNE.maxSpeed * 0.24 + player.vy / TUNE.maxFallSpeed * 0.2, -0.4, 0.48),
      crouch: 0,
      lKx: -7, lKy: 16, lFx: -10, lFy: 25,
      rKx: 7, rKy: 16, rFx: 10, rFy: 25,
      lEx: -15, lEy: -2, lHx: -21, lHy: 3,
      rEx: 15, rEy: -2, rHx: 21, rHy: 3,
    };

    if (state === 'dead') {
      player.tumbleAngle += dt * 9;
      target.lean = player.tumbleAngle;
      target.lKx = -16; target.lKy = 12; target.lFx = -25; target.lFy = 7;
      target.rKx = 14; target.rKy = 14; target.rFx = 22; target.rFy = 23;
      target.lEx = -17; target.lEy = -14; target.lHx = -25; target.lHy = -20;
      target.rEx = 15; target.rEy = 5; target.rHx = 23; target.rHy = 12;
    } else if (rope) {
      const trail = -Math.sign(player.vx || 1);
      target.lean = clamp(player.vx / TUNE.maxSpeed * 0.31 + player.vy / TUNE.maxFallSpeed * 0.21, -0.45, 0.55);
      target.lKx = -5 + trail * 7; target.lKy = 15;
      target.lFx = -6 + trail * 15; target.lFy = 25;
      target.rKx = 5 + trail * 9; target.rKy = 13;
      target.rFx = 6 + trail * 18; target.rFy = 22;
      const side = rope.x >= player.x ? 1 : -1;
      const angle = target.lean;
      const dx = rope.x - player.x, dy = rope.y - player.y;
      const localX = dx * Math.cos(angle) + dy * Math.sin(angle);
      const localY = -dx * Math.sin(angle) + dy * Math.cos(angle);
      const length = Math.hypot(localX, localY) || 1;
      const arm = side > 0 ? 'r' : 'l';
      const other = side > 0 ? 'l' : 'r';
      target[arm + 'Ex'] = side * 8 + localX / length * 12;
      target[arm + 'Ey'] = -7 + localY / length * 11;
      target[arm + 'Hx'] = side * 8 + localX / length * 28;
      target[arm + 'Hy'] = -7 + localY / length * 28;
      target[other + 'Ex'] = -side * 15;
      target[other + 'Ey'] = -1;
      target[other + 'Hx'] = -side * 23;
      target[other + 'Hy'] = 7;
    } else if (player.grounded) {
      target.lean = clamp(player.vx / TUNE.maxSpeed * 0.18, -0.2, 0.28);
      target.lKx = -4 + stride * 6; target.lKy = 15;
      target.lFx = -5 + stride * 12; target.lFy = 25;
      target.rKx = 4 - stride * 6; target.rKy = 15;
      target.rFx = 5 - stride * 12; target.rFy = 25;
      target.lEx = -13 - stride * 4; target.lEy = -1;
      target.lHx = -17 - stride * 8; target.lHy = 6;
      target.rEx = 13 + stride * 4; target.rEy = -1;
      target.rHx = 17 + stride * 8; target.rHy = 6;
      if (landing > 0) {
        target.crouch = landing * 5;
        target.lean += landing * 0.16;
        target.lKx = -13; target.lKy = 13;
        target.lFx = -17; target.lFy = 21;
        target.rKx = 13; target.rKy = 13;
        target.rFx = 17; target.rFy = 21;
        target.lHx = -20; target.lHy = 2;
        target.rHx = 20; target.rHy = 2;
      }
    } else if (player.vy < -80) {
      target.lean -= 0.13;
      target.lKx = -13; target.lKy = 10; target.lFx = -8; target.lFy = 18;
      target.rKx = 13; target.rKy = 10; target.rFx = 8; target.rFy = 18;
      target.lEx = -15; target.lEy = -12; target.lHx = -18; target.lHy = -20;
      target.rEx = 15; target.rEy = -12; target.rHx = 18; target.rHy = -20;
    } else if (player.vy > 90) {
      target.lean += 0.1;
      target.lKx = -12; target.lKy = 18; target.lFx = -20; target.lFy = 25;
      target.rKx = 12; target.rKy = 18; target.rFx = 20; target.rFy = 25;
      target.lEx = -19; target.lEy = -7; target.lHx = -28; target.lHy = -3;
      target.rEx = 19; target.rEy = -7; target.rHx = 28; target.rHy = -3;
    }

    if (!player.pose) player.pose = { ...target };
    const blend = 1 - Math.exp(-18 * dt);
    for (const key in target) player.pose[key] += (target[key] - player.pose[key]) * blend;
    const pose = player.pose;
    const angle = pose.lean;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const reachingSide = rope && rope.x >= player.x ? 'r' : 'l';
    if (rope) {
      const handX = pose[reachingSide + 'Hx'], handY = pose[reachingSide + 'Hy'];
      const fromX = x + handX * cos - handY * sin;
      const fromY = y + pose.crouch + handX * sin + handY * cos;
      const ax = rope.x - camera.x, ay = rope.y;
      ctx.strokeStyle = '#91eaff34'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(fromX, fromY); ctx.lineTo(ax, ay); ctx.stroke();
      ctx.strokeStyle = '#e6fcff'; ctx.lineWidth = 1.7;
      ctx.beginPath(); ctx.moveTo(fromX, fromY); ctx.lineTo(ax, ay); ctx.stroke();
    }

    ctx.save(); ctx.translate(x, y + pose.crouch); ctx.rotate(angle);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    drawSuitLimb(-4, 8, pose.lKx, pose.lKy, pose.lFx, pose.lFy, 7, '#b93349');
    drawSuitLimb(4, 8, pose.rKx, pose.rKy, pose.rFx, pose.rFy, 7, '#d54353');
    if (!rope || reachingSide !== 'l') drawSuitLimb(-7, -7, pose.lEx, pose.lEy, pose.lHx, pose.lHy, 6, '#b93349');
    if (!rope || reachingSide !== 'r') drawSuitLimb(7, -7, pose.rEx, pose.rEy, pose.rHx, pose.rHy, 6, '#b93349');

    // Dark side panels frame one bright, angular chest panel at small sizes.
    ctx.fillStyle = '#080e19'; ctx.beginPath(); ctx.moveTo(-9, -10); ctx.lineTo(9, -10); ctx.lineTo(9, 7); ctx.lineTo(5, 11); ctx.lineTo(-5, 11); ctx.lineTo(-9, 7); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#282d37'; ctx.beginPath(); ctx.moveTo(-8, -9); ctx.lineTo(8, -9); ctx.lineTo(6, 9); ctx.lineTo(-6, 9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c9384b'; ctx.beginPath(); ctx.moveTo(-7, -9); ctx.lineTo(7, -9); ctx.lineTo(5, 1); ctx.lineTo(0, 5); ctx.lineTo(-5, 1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f05b66'; ctx.beginPath(); ctx.moveTo(-4, -7); ctx.lineTo(4, -7); ctx.lineTo(0, -4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#141a25'; ctx.fillRect(-6, 6, 12, 3);

    if (rope && reachingSide === 'l') drawSuitLimb(-7, -7, pose.lEx, pose.lEy, pose.lHx, pose.lHy, 6, '#ec5362');
    if (rope && reachingSide === 'r') drawSuitLimb(7, -7, pose.rEx, pose.rEy, pose.rHx, pose.rHy, 6, '#ec5362');

    // Full-face mask with large angled eyes; no tiny lines needed to read the face.
    ctx.fillStyle = '#080e19'; ctx.beginPath(); ctx.ellipse(0, -19, 10.5, 11.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#be3448'; ctx.beginPath(); ctx.ellipse(0, -19, 9, 10, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#252b36'; ctx.beginPath(); ctx.moveTo(-4, -27); ctx.lineTo(4, -27); ctx.lineTo(6, -13); ctx.lineTo(-6, -13); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f3fbff';
    ctx.beginPath(); ctx.moveTo(-8, -21); ctx.lineTo(-2, -20); ctx.lineTo(-3, -16); ctx.lineTo(-7, -17); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(8, -21); ctx.lineTo(2, -20); ctx.lineTo(3, -16); ctx.lineTo(7, -17); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#98e5f0'; ctx.fillRect(-6, -18, 2, 1); ctx.fillRect(4, -18, 2, 1);
    ctx.restore();
  }

  function drawParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 140 * dt;
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x - camera.x, p.y, p.size, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function draw(dt) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSky();
    drawBuildings();
    drawAnchorCue();
    if (state !== 'dead' || player.tumbleTimer > 0) drawPlayer(dt);
    if (state === 'dead') {
      player.tumbleTimer = Math.max(0, player.tumbleTimer - dt);
      if (player.tumbleTimer === 0) deathNode.hidden = false;
    }
    if (state !== 'paused') drawParticles(dt);
    if (flash > 0 && state !== 'paused') {
      flash = Math.max(0, flash - dt);
      ctx.fillStyle = state === 'dead' ? `rgba(255,80,95,${flash * 0.55})` : `rgba(135,227,255,${flash * 0.16})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function frame(now) {
    const dt = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;
    if (state !== 'paused' && state !== 'dead') accumulator += dt;
    let steps = 0;
    while (accumulator >= TUNE.simulationStep && steps < 6) {
      update(TUNE.simulationStep);
      accumulator -= TUNE.simulationStep;
      steps++;
    }
    if (steps === 6) accumulator = 0;
    draw(state === 'paused' ? 0 : dt);
    requestAnimationFrame(frame);
  }

  window.addEventListener('keydown', event => {
    if (state === 'dead') {
      if (event.code === 'Space' || event.code === 'KeyS') event.preventDefault();
      if (event.code === 'KeyS' && !event.repeat) reset();
      return;
    }
    if (state === 'countdown' && !event.repeat) {
      startRun();
      if (event.code === 'Escape' || event.code === 'KeyR') { event.preventDefault(); return; }
    }
    if (event.code === 'Space') { if (!event.repeat) press(event); else event.preventDefault(); }
    if (event.code === 'KeyR') { event.preventDefault(); if (!event.repeat) reset(); }
    if (event.code === 'Escape') { event.preventDefault(); if (!event.repeat) togglePause(); }
    if (event.code === 'ControlLeft' || event.code === 'ControlRight') { event.preventDefault(); if (!event.repeat) jump(); }
    if (event.code === 'ArrowUp' || event.code === 'KeyW') { event.preventDefault(); if (state === 'running') shortenInputs.add(event.code); }
    if (event.code === 'ArrowDown' || event.code === 'KeyS') { event.preventDefault(); if (state === 'running') lengthenInputs.add(event.code); }
  });
  window.addEventListener('keyup', event => {
    if (event.code === 'Space') unpress(event);
    shortenInputs.delete(event.code);
    lengthenInputs.delete(event.code);
  });
  window.addEventListener('pointerdown', press);
  window.addEventListener('pointerup', unpress);
  window.addEventListener('pointercancel', unpress);
  for (const button of [jumpButton, shortenButton, lengthenButton, pauseButton, resumeButton, restartButton]) {
    button.addEventListener('pointerdown', event => event.stopPropagation());
  }
  restartButton.addEventListener('click', event => {
    if (state === 'dead' && event.detail > 0) reset();
  });
  jumpButton.addEventListener('click', jump);
  pauseButton.addEventListener('click', togglePause);
  resumeButton.addEventListener('click', togglePause);
  for (const [button, inputs] of [[shortenButton, shortenInputs], [lengthenButton, lengthenInputs]]) {
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      if (state !== 'running') return;
      button.setPointerCapture(event.pointerId);
      inputs.add(`pointer-${event.pointerId}`);
      button.classList.add('active');
    });
    const stopAdjusting = event => {
      inputs.delete(`pointer-${event.pointerId}`);
      if (!inputs.size) button.classList.remove('active');
    };
    button.addEventListener('pointerup', stopAdjusting);
    button.addEventListener('pointercancel', stopAdjusting);
    button.addEventListener('lostpointercapture', stopAdjusting);
  }
  window.addEventListener('blur', () => {
    pressedInputs.clear();
    shortenInputs.clear();
    lengthenInputs.clear();
    shortenButton.classList.remove('active');
    lengthenButton.classList.remove('active');
    release();
  });
  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);
})();
