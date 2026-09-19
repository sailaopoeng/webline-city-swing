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
  const hintNode = document.getElementById('hint');
  const TAU = Math.PI * 2;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const rand = (min, max) => min + Math.random() * (max - min);

  let W = 0, H = 0, dpr = 1, player, rope, buildings, particles, camera, nextBuildingX;
  let state = 'running', retryAt = 0, elapsed = 0, score = 0, best = 0;
  const pressedInputs = new Set();
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
    state = 'running';
    pressedInputs.clear();
    rope = null;
    buildings = [];
    particles = [];
    camera = { x: 0 };
    elapsed = 0;
    score = 0;
    flash = 0;
    retryAt = 0;
    accumulator = 0;
    player = { x: 116, y: H * 0.43, px: 116, py: H * 0.43, vx: TUNE.horizontalStartingSpeed, vy: 0, grounded: false };
    buildings.push(makeBuilding(-260, 600, H * 0.77, 0));
    nextBuildingX = 340 + rand(...TUNE.buildingSpacing);
    generateAhead();
    scoreNode.textContent = '0000';
    deathNode.hidden = true;
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

  function press(event) {
    if (event && event.cancelable) event.preventDefault();
    if (state === 'dead') reset();
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
    pressedInputs.clear();
    release();
    burst(player.x, player.y, '#ff626b', 24, 210);
    flash = 0.28;
    finalNode.textContent = formatScore(score);
    deathNode.hidden = false;
    if (score > best) {
      best = score;
      bestNode.textContent = formatScore(best);
      try { localStorage.setItem('webline-best', String(best)); } catch (_) { /* Storage is optional. */ }
    }
  }

  function collide() {
    const r = TUNE.playerRadius;
    player.grounded = false;
    for (const building of buildings) {
      if (building.x > player.x + r + 40 || building.x + building.w < player.x - r - 40) continue;
      for (const hazard of building.hazards) {
        if (hitCircleRect(player.x, player.y, r, hazard.x, building.top - hazard.h, hazard.w, hazard.h)) { die(); return; }
      }
      if (!hitCircleRect(player.x, player.y, r, building.x, building.top, building.w, H - building.top + 200)) continue;
      const overRoof = player.px + r > building.x && player.px - r < building.x + building.w;
      if (player.py + r <= building.top + 3 && player.vy >= -10 && overRoof) {
        player.y = building.top - r;
        player.vy = 0;
        player.grounded = true;
      } else { die(); return; }
    }
    if (player.y - r > H + 80) die();
  }

  function update(dt) {
    elapsed += dt;
    if (state !== 'running') return;
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

  function drawPlayer() {
    const x = player.x - camera.x, y = player.y;
    if (rope) {
      const ax = rope.x - camera.x, ay = rope.y;
      ctx.strokeStyle = '#91eaff34'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(ax, ay); ctx.stroke();
      ctx.strokeStyle = '#e6fcff'; ctx.lineWidth = 1.7; ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(ax, ay); ctx.stroke();
    }
    ctx.save(); ctx.translate(x, y);
    const lean = clamp(player.vy / 1400, -0.28, 0.32);
    ctx.rotate(lean);
    const stride = Math.sin(elapsed * (player.grounded ? 18 : 9)) * (player.grounded ? 4 : 2);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#a8233b'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(-3, 7); ctx.lineTo(-7 - stride, 20); ctx.moveTo(4, 7); ctx.lineTo(8 + stride, 20); ctx.stroke();
    ctx.strokeStyle = '#ed485b'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(-6, -5); ctx.lineTo(-12, 5 - stride); ctx.moveTo(6, -5); ctx.lineTo(12, rope ? -12 : 5 + stride); ctx.stroke();
    ctx.fillStyle = '#f04e61'; ctx.beginPath(); ctx.roundRect(-8, -10, 16, 20, 5); ctx.fill();
    ctx.fillStyle = '#ba263f'; ctx.fillRect(-2, 0, 4, 8);
    ctx.fillStyle = '#f34e60'; ctx.beginPath(); ctx.arc(0, -18, 9.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#edf8ff'; ctx.beginPath(); ctx.ellipse(-4, -19, 3.5, 2, -0.2, 0, TAU); ctx.ellipse(4, -19, 3.5, 2, 0.2, 0, TAU); ctx.fill();
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
    if (state === 'running') drawPlayer();
    drawParticles(dt);
    if (flash > 0) {
      flash = Math.max(0, flash - dt);
      ctx.fillStyle = state === 'dead' ? `rgba(255,80,95,${flash * 0.55})` : `rgba(135,227,255,${flash * 0.16})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function frame(now) {
    const dt = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;
    accumulator += dt;
    let steps = 0;
    while (accumulator >= TUNE.simulationStep && steps < 6) {
      update(TUNE.simulationStep);
      accumulator -= TUNE.simulationStep;
      steps++;
    }
    if (steps === 6) accumulator = 0;
    draw(dt);
    requestAnimationFrame(frame);
  }

  window.addEventListener('keydown', event => {
    if (event.code === 'Space') { if (!event.repeat) press(event); else event.preventDefault(); }
    if (event.code === 'KeyR') { event.preventDefault(); reset(); }
  });
  window.addEventListener('keyup', event => { if (event.code === 'Space') unpress(event); });
  window.addEventListener('pointerdown', press);
  window.addEventListener('pointerup', unpress);
  window.addEventListener('pointercancel', unpress);
  window.addEventListener('blur', () => { pressedInputs.clear(); release(); });
  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);
})();
