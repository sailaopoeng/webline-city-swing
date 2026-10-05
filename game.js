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
    glideGravity: 520,
    glideMaxFallSpeed: 340,
    glideAirAcceleration: 240,
    glideMinSpeed: 360,
    glideLift: 180,
    glideSwingCount: 10,
    spikeBase: 18,
    spikeGap: 6,
    swingPump: 520,
    maxZoomOut: 0.1,
    trailLength: 20,
    // Levels: each [level 1, level 100] pair is interpolated linearly, about 1% harder per level.
    levelCount: 100,
    levelBaseLength: 1000, // metres (10 px each) to the level 1 finish gate
    levelLengthStep: 15, // extra metres per level
    attemptsPerLevel: 5,
    parSpeed: 40, // metres per second; beating length / parSpeed earns a time bonus and stars
    levelClearAutoSeconds: 6,
    gapScale: [1, 2.3], // multiplies buildingSpacing
    hazardChance: [0.45, 0.92],
    tripleSpikeChance: [0.25, 0.85],
    roofShrink: [0, 90],
    roofDrop: [0, 0.08], // fraction of screen height
  });

  // One sky and building palette per ten levels; the last entry is endless mode.
  const DISTRICTS = [
    { name: 'Downtown', sky: ['#091022', '#17243c', '#243249'], far: '#1c2b40', near: '#1a293b', body: '#101b2e', ledge: '#30425b', trim: '#1d3046', lit: '#e5bc7980', unlit: '#51627d35' },
    { name: 'Harbor Lights', sky: ['#06141f', '#0f2c3d', '#1b4152'], far: '#123444', near: '#10303e', body: '#0b1d27', ledge: '#2a4f5c', trim: '#163845', lit: '#9fe7e080', unlit: '#3f6b7535' },
    { name: 'Old Town', sky: ['#140d1f', '#2b1d36', '#3d2a40'], far: '#2a1f37', near: '#271c31', body: '#171222', ledge: '#4a3a52', trim: '#2c2236', lit: '#f2c27a90', unlit: '#6a587535' },
    { name: 'Neon District', sky: ['#0d0221', '#240b45', '#3a0f55'], far: '#2a0f4a', near: '#260c40', body: '#12062a', ledge: '#4c1f78', trim: '#2d1250', lit: '#ff5be1a0', unlit: '#6b3d9a35' },
    { name: 'Ironworks', sky: ['#120f0c', '#2b2118', '#43301f'], far: '#2e241b', near: '#2a2018', body: '#16110d', ledge: '#4d3a2a', trim: '#2f241a', lit: '#ffad5c90', unlit: '#7a604535' },
    { name: 'Financial Row', sky: ['#08101a', '#1a2a3a', '#2d4256'], far: '#1f3142', near: '#1c2d3d', body: '#0e1824', ledge: '#3a5068', trim: '#1e3245', lit: '#cfe8ff90', unlit: '#56708a35' },
    { name: 'Rain Quarter', sky: ['#0a0f14', '#18232c', '#24323b'], far: '#1a2630', near: '#17222b', body: '#0d141a', ledge: '#33434f', trim: '#1c2a33', lit: '#a7d3ff80', unlit: '#4d607035' },
    { name: 'Sunset Heights', sky: ['#1a0f2e', '#5a2a4a', '#c0605a'], far: '#4a2440', near: '#3e1f37', body: '#1d1024', ledge: '#6a3550', trim: '#3a1c33', lit: '#ffd27aa0', unlit: '#8a4f6a35' },
    { name: 'Storm Front', sky: ['#05070c', '#141a26', '#222a38'], far: '#161c28', near: '#131924', body: '#0a0e15', ledge: '#2a3242', trim: '#161d29', lit: '#e8f0ff80', unlit: '#47526535' },
    { name: 'Summit Spires', sky: ['#020617', '#0c1f3f', '#1b3b63'], far: '#13284a', near: '#112442', body: '#081226', ledge: '#2a4a78', trim: '#14284a', lit: '#fff1b0a0', unlit: '#4a6a9a35' },
    { name: 'Endless Skyline', sky: ['#04020a', '#1a0b2e', '#3b1053'], far: '#24103a', near: '#1f0d33', body: '#0e0618', ledge: '#5a2d82', trim: '#2e1548', lit: '#ffd166b0', unlit: '#5a3a7a35' },
  ];
  const START_X = 116;
  const STORAGE = { progress: 'webline-progress', bestPoints: 'webline-best-points', bestLevel: 'webline-best-level' };

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);
  const scoreNode = $('score');
  const bestNode = $('best');
  const levelNode = $('level');
  const levelSubNode = $('level-sub');
  const progressNode = $('level-progress');
  const progressFillNode = $('progress-fill');
  const levelBanner = $('level-banner');
  const finalNode = $('final-score');
  const deathNode = $('death');
  const deathEyebrowNode = $('death-eyebrow');
  const deathDetailNode = $('death-detail');
  const deathTitleNode = $('death-title');
  const deathDancerCanvas = $('death-dancer');
  const deathDancerCtx = deathDancerCanvas ? deathDancerCanvas.getContext('2d') : null;
  const restartButton = $('restart-button');
  const restartLabelNode = $('restart-label');
  const clearNode = $('level-clear');
  const clearDancerCanvas = $('clear-dancer');
  const clearDancerCtx = clearDancerCanvas ? clearDancerCanvas.getContext('2d') : null;
  const nextButton = $('next-button');
  const countdownNode = $('countdown');
  const countdownNumberNode = $('countdown-number');
  const countdownLevelNode = $('countdown-level');
  const countdownDistrictNode = $('countdown-district');
  const countdownAttemptNode = $('countdown-attempt');
  const pauseNode = $('pause');
  const pauseButton = $('pause-button');
  const resumeButton = $('resume-button');
  const startOverButtons = document.querySelectorAll('.start-over-button');
  const webButton = $('web-button');
  const jumpButton = $('jump-button');
  const shortenButton = $('shorten-button');
  const lengthenButton = $('lengthen-button');
  const controlsNode = document.querySelector('.game-controls');
  const hintNode = $('hint');
  const shellNode = document.querySelector('.game-shell');
  const countdownPauseButton = $('countdown-pause-button');
  const glideHud = $('glide-hud');
  const comboHud = $('combo-hud');
  const TAU = Math.PI * 2;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const rand = (min, max) => min + Math.random() * (max - min);
  const lerp = (a, b, t) => a + (b - a) * t;

  let W = 0, H = 0, dpr = 1, player, rope, buildings, particles, popups, camera, nextBuildingX, swings;
  let state = 'countdown', resumeState = 'running', countdownRemaining = 0;
  let retryAt = 0, elapsed = 0, zoom = 1;
  // Points: banked from cleared levels, plus this attempt's distance and bonus points.
  let level = 1, attemptsLeft = TUNE.attemptsPerLevel, bankedPoints = 0, points = 0, levelDistance = 0, bonusPoints = 0, comboChain = 0;
  let bestPoints = 0, bestLevel = 0, gateX = Infinity, goalPlaced = false, levelResult = null, levelClearTimer = 0;
  const pressedInputs = new Set();
  const webButtonInputs = new Set();
  const shortenInputs = new Set();
  const lengthenInputs = new Set();
  const leftInputs = new Set();
  const rightInputs = new Set();
  let accumulator = 0, lastFrame = 0, flash = 0;
  const attachEffects = [];

  function loadNumber(key) {
    try { return Number(localStorage.getItem(key)) || 0; } catch (_) { return 0; } // Private browsing can disable storage.
  }
  function store(key, value) {
    try { localStorage.setItem(key, value); } catch (_) { /* Storage is optional. */ }
  }
  function saveProgress(savedLevel = level, banked = bankedPoints, attempts = attemptsLeft) {
    store(STORAGE.progress, JSON.stringify({ level: savedLevel, banked: Math.floor(banked), attempts }));
  }
  function loadProgress() {
    const requested = Number(new URLSearchParams(location.search).get('level'));
    if (requested >= 1) { // Testing shortcut: ?level=N starts a fresh run at level N.
      level = clamp(Math.floor(requested), 1, TUNE.levelCount + 1);
      return;
    }
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE.progress));
      if (saved && saved.level >= 1 && saved.attempts >= 1) {
        level = clamp(Math.floor(saved.level), 1, TUNE.levelCount + 1);
        bankedPoints = Math.max(0, Math.floor(saved.banked) || 0);
        attemptsLeft = clamp(Math.floor(saved.attempts), 1, TUNE.attemptsPerLevel);
      }
    } catch (_) { /* Missing or unreadable progress starts at level 1. */ }
  }

  bestPoints = loadNumber(STORAGE.bestPoints);
  bestLevel = loadNumber(STORAGE.bestLevel);
  loadProgress();
  bestNode.textContent = formatPoints(bestPoints);

  function formatPoints(n) { return String(Math.floor(n)).padStart(6, '0'); }
  function isEndless() { return level > TUNE.levelCount; }
  function district() { return DISTRICTS[isEndless() ? DISTRICTS.length - 1 : Math.min(DISTRICTS.length - 2, Math.floor((level - 1) / 10))]; }
  function levelProgress() { return clamp((level - 1) / (TUNE.levelCount - 1), 0, 1); }
  function levelScaled(range) { return lerp(range[0], range[1], levelProgress()); }
  function levelLength() { return TUNE.levelBaseLength + TUNE.levelLengthStep * (Math.min(level, TUNE.levelCount) - 1); }
  function levelMultiplier() { return 1 + 0.1 * (level - 1); }
  function runPoints() { return Math.floor(levelDistance * levelMultiplier() + bonusPoints); }
  function vibrate(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (_) { /* Haptics are optional. */ }
  }

  function updateBest() {
    if (points > bestPoints) {
      bestPoints = points;
      store(STORAGE.bestPoints, String(Math.floor(bestPoints)));
    }
    bestNode.textContent = formatPoints(bestPoints);
  }

  function updateHud() {
    points = bankedPoints + runPoints();
    scoreNode.textContent = formatPoints(points);
    levelNode.textContent = isEndless() ? '∞' : String(level);
    levelSubNode.textContent = isEndless() ? `${Math.floor(levelDistance)} M` : `TRY ${TUNE.attemptsPerLevel - attemptsLeft + 1}/${TUNE.attemptsPerLevel}`;
    progressNode.hidden = isEndless();
    if (!isEndless()) progressFillNode.style.transform = `scaleX(${clamp(levelDistance / ((gateX - START_X) / 10), 0, 1)})`;
    if (comboHud) {
      comboHud.hidden = comboChain < 2 || state !== 'running';
      if (!comboHud.hidden) comboHud.textContent = `COMBO ×${comboChain}`;
    }
  }

  function addPoints(amount, label, x, y, color = '#ffd166') {
    const value = Math.round(amount * levelMultiplier());
    if (value <= 0) return;
    bonusPoints += value;
    popups.push({ x, y, text: `+${value} ${label}`, life: 1.1, maxLife: 1.1, color });
  }

  function placeHint(target) {
    target.appendChild(hintNode);
    hintNode.classList.remove('faded');
  }

  function updateGlideHud() {
    if (!glideHud) return;
    if (player && player.gliding) {
      glideHud.textContent = 'GLIDING';
      glideHud.classList.add('gliding');
      glideHud.hidden = false;
    } else if (swings >= TUNE.glideSwingCount) {
      glideHud.textContent = 'GLIDE READY';
      glideHud.classList.remove('gliding');
      glideHud.hidden = false;
    } else if (swings > 0) {
      glideHud.textContent = `SWINGS ${swings}/${TUNE.glideSwingCount}`;
      glideHud.classList.remove('gliding');
      glideHud.hidden = false;
    } else {
      glideHud.hidden = true;
    }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Geometry scales to the screen height, so resize restarts the level without using an attempt.
    if (state === 'levelclear') advanceLevel();
    else if (state === 'dead') continueAfterDeath();
    else startLevel();
  }

  function clearHeldInputs() {
    pressedInputs.clear();
    webButtonInputs.clear();
    webButton.classList.remove('active');
    shortenInputs.clear();
    lengthenInputs.clear();
    leftInputs.clear();
    rightInputs.clear();
    shortenButton.classList.remove('active');
    lengthenButton.classList.remove('active');
  }

  function newGame() {
    level = 1;
    bankedPoints = 0;
    attemptsLeft = TUNE.attemptsPerLevel;
    saveProgress();
    startLevel();
  }

  function advanceLevel() {
    level++;
    attemptsLeft = TUNE.attemptsPerLevel;
    saveProgress();
    startLevel();
  }

  function continueAfterDeath() {
    if (!isEndless() && attemptsLeft <= 0) newGame();
    else startLevel();
  }

  function startLevel() {
    state = 'countdown';
    placeHint(countdownNode);
    countdownRemaining = TUNE.countdownSeconds;
    clearHeldInputs();
    rope = null;
    buildings = [];
    particles = [];
    popups = [];
    attachEffects.length = 0;
    camera = { x: 0 };
    elapsed = 0;
    levelDistance = 0;
    bonusPoints = 0;
    comboChain = 0;
    swings = 0;
    zoom = 1;
    flash = 0;
    retryAt = 0;
    accumulator = 0;
    levelResult = null;
    levelClearTimer = 0;
    gateX = isEndless() ? Infinity : START_X + levelLength() * 10;
    goalPlaced = isEndless();
    // A safe runway gives the player time to try Jump or web before the first gap.
    const startingRoof = makeBuilding(-260, 1180, H * 0.72, 0);
    const mastY = startingRoof.top - Math.min(250, H * 0.28);
    startingRoof.anchors[0] = { x: 276, y: mastY };
    startingRoof.anchors[1] = { x: startingRoof.x + startingRoof.w - 150, y: mastY };
    buildings.push(startingRoof);
    player = { x: START_X, y: startingRoof.top - TUNE.playerRadius, px: START_X, py: startingRoof.top - TUNE.playerRadius, vx: TUNE.horizontalStartingSpeed, vy: 0, grounded: true, landingTimer: 0, tumbleTimer: 0, tumbleAngle: 0, pose: null, gliding: false, trail: [], speed: 0, dancing: false, danceTimer: 0 };
    nextBuildingX = startingRoof.x + startingRoof.w + rand(...TUNE.buildingSpacing);
    generateAhead();
    updateHud();
    if (glideHud) glideHud.hidden = true;
    deathNode.hidden = true;
    clearNode.hidden = true;
    levelBanner.hidden = true;
    for (const dancer of [[deathDancerCtx, deathDancerCanvas], [clearDancerCtx, clearDancerCanvas]]) {
      if (!dancer[0]) continue;
      dancer[0].setTransform(1, 0, 0, 1, 0, 0);
      dancer[0].clearRect(0, 0, dancer[1].width, dancer[1].height);
    }
    resetStartOver();
    controlsNode.classList.remove('hidden-controls');
    pauseNode.hidden = true;
    pauseButton.firstChild.textContent = 'PAUSE ';
    countdownLevelNode.textContent = isEndless() ? 'ENDLESS' : `LEVEL ${level}`;
    countdownDistrictNode.textContent = district().name.toUpperCase();
    countdownAttemptNode.textContent = isEndless()
      ? 'Max difficulty · swing as far as you can'
      : `Goal ${levelLength()} m · Attempt ${TUNE.attemptsPerLevel - attemptsLeft + 1} of ${TUNE.attemptsPerLevel}`;
    countdownNode.hidden = false;
    countdownNumberNode.textContent = String(Math.ceil(countdownRemaining));
    lastFrame = performance.now();
  }

  function makeBuilding(x, width, top, index, finish = false) {
    if (index > 1 && !finish) {
      width = clamp(width - levelScaled(TUNE.roofShrink), 220, 600);
      top = clamp(top + levelScaled(TUNE.roofDrop) * H, H * 0.55, H - 95);
    }
    const anchors = [];
    // Each roof carries a visible mast node. Wide roofs carry two.
    const count = width > 440 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const ax = x + width * (count === 1 ? 0.62 : (i === 0 ? 0.37 : 0.79));
      anchors.push({ x: ax, y: clamp(top - rand(280, 340), H * 0.13, H * 0.28) });
    }
    const hazards = [];
    if (index > 1 && !finish && Math.random() < levelScaled(TUNE.hazardChance)) {
      const spikeCount = Math.random() < levelScaled(TUNE.tripleSpikeChance) ? 3 : 2;
      const hazardWidth = spikeCount * TUNE.spikeBase + (spikeCount - 1) * TUNE.spikeGap;
      const hx = x + width * rand(0.18, 0.82) - hazardWidth / 2;
      const clampedHx = clamp(hx, x + 14, x + width - hazardWidth - 14);
      hazards.push({ x: clampedHx, spikeCount, spikeBase: TUNE.spikeBase, spikeGap: TUNE.spikeGap, h: 26, type: 'spikes' });
    }
    return { x, w: width, top, anchors, hazards, index, finish };
  }

  function generateAhead() {
    while (nextBuildingX < player.x + W * 2.5 + 500) {
      const index = buildings.length;
      let building;
      if (!goalPlaced && nextBuildingX + 635 >= gateX) {
        // A wide, hazard-free finish roof keeps the gate at the level's goal distance.
        const width = Math.max(gateX - nextBuildingX + 320, 520);
        building = makeBuilding(nextBuildingX, width, clamp(H * 0.7, H * 0.55, H - 95), index, true);
        gateX = Math.max(gateX, building.x + 150);
        goalPlaced = true;
      } else {
        const width = rand(285, 485);
        const top = clamp(H * rand(0.66, 0.81), H * 0.55, H - 95);
        building = makeBuilding(nextBuildingX, width, top, index);
      }
      buildings.push(building);
      const gap = rand(TUNE.buildingSpacing[0], TUNE.buildingSpacing[1]) * levelScaled(TUNE.gapScale);
      nextBuildingX += building.w + gap;
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

  function spawnConfetti(x, y, count) {
    const colors = ['#ff5b64', '#ffd166', '#06d6a0', '#118ab2', '#ef476f', '#9b5de5', '#ffffff'];
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const velocity = rand(160, 420);
      const size = rand(5, 11);
      particles.push({
        x: x + (Math.random() - 0.5) * 30,
        y: y + (Math.random() - 0.5) * 20,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: rand(1.4, 2.8),
        maxLife: 2.8,
        size,
        color: colors[Math.floor(Math.random() * colors.length)],
        confetti: true,
        rotation: Math.random() * TAU,
        spin: rand(-12, 12)
      });
    }
  }

  function attach() {
    if (state !== 'running' || rope) return;
    const point = findAnchor();
    if (!point) return;
    rope = { x: point.x, y: point.y, length: point.length * 0.985 };
    endGlide();
    if (!player.grounded) {
      // Chaining webs without touching a roof builds a combo.
      comboChain++;
      if (comboChain >= 2) addPoints(10 * Math.min(comboChain, 10), `COMBO ×${comboChain}`, point.x, point.y - 18, '#9beaf3');
    }
    // Ground contact persists until movement actually lifts the player, so Space + V can jump.
    burst(point.x, point.y, '#96ecff', 9, 75);
    attachEffects.push({ x: point.x, y: point.y, radius: 8, maxRadius: 55, life: 0.35, maxLife: 0.35, color: '#b3f2ff' });
    flash = Math.max(flash, 0.09);
  }

  function release(countAsSwing = true) {
    if (!rope) return;
    burst(player.x, player.y, '#d7f8ff', 5, 60);
    rope = null; // Velocity is deliberately unchanged.
    if (state !== 'running') return;
    if (countAsSwing && !player.grounded) swings++;
    if (swings >= TUNE.glideSwingCount && !player.grounded) {
      player.gliding = true;
      player.glideStartX = player.x;
      swings = 0;
      if (Math.abs(player.vx) < TUNE.glideMinSpeed) {
        player.vx = Math.sign(player.vx || 1) * TUNE.glideMinSpeed;
      }
    }
  }

  function endGlide() {
    if (!player.gliding) return;
    player.gliding = false;
    const meters = (player.x - player.glideStartX) / 10;
    if (meters >= 10) addPoints(meters, 'GLIDE', player.x, player.y - 30, '#b8f8ff');
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
    placeHint(shellNode);
    countdownNode.hidden = true;
    levelBanner.textContent = `${isEndless() ? 'ENDLESS' : `LEVEL ${level}`} · ${district().name.toUpperCase()}`;
    levelBanner.hidden = false;
    levelBanner.classList.remove('show');
    void levelBanner.offsetWidth; // Restart the fade animation.
    levelBanner.classList.add('show');
  }

  // R restarts the level. Once play has begun it costs an attempt; the last one ends the run instead.
  function restartLevel() {
    if (state === 'countdown' || (state === 'paused' && resumeState === 'countdown')) { startLevel(); return; }
    if (state !== 'running' && state !== 'paused') return;
    if (isEndless() || attemptsLeft > 1) {
      if (!isEndless()) { attemptsLeft--; saveProgress(); }
      startLevel();
      return;
    }
    if (state === 'paused') togglePause();
    die();
  }

  // Start-over buttons need a second tap within three seconds so progress is not lost by accident.
  let startOverArmedUntil = 0;
  function resetStartOver() {
    startOverArmedUntil = 0;
    for (const button of startOverButtons) button.textContent = 'Start over from level 1';
  }
  function startOver(event) {
    event.stopPropagation();
    if (performance.now() > startOverArmedUntil) {
      startOverArmedUntil = performance.now() + 3000;
      for (const button of startOverButtons) button.textContent = 'Tap again to lose progress';
      setTimeout(() => { if (performance.now() > startOverArmedUntil) resetStartOver(); }, 3100);
      return;
    }
    newGame();
  }

  function togglePause() {
    if (state === 'dead' || state === 'levelclear') return;
    if (state === 'paused') {
      state = resumeState;
      placeHint(state === 'countdown' ? countdownNode : shellNode);
      pauseNode.hidden = true;
      countdownNode.hidden = state !== 'countdown';
      pauseButton.firstChild.textContent = 'PAUSE ';
      lastFrame = performance.now();
      accumulator = 0;
      return;
    }
    resumeState = state;
    state = 'paused';
    clearHeldInputs();
    release(false);
    resetStartOver();
    placeHint(pauseNode);
    countdownNode.hidden = true;
    pauseNode.hidden = false;
    pauseButton.firstChild.textContent = 'RESUME ';
  }

  function press(event) {
    if (event && event.cancelable) event.preventDefault();
    if (state === 'paused' || state === 'dead' || state === 'levelclear') return;
    startRun();
    const key = event && event.code === 'Space' ? 'space' : `pointer-${event?.pointerId ?? 0}`;
    if (pressedInputs.has(key)) return;
    pressedInputs.add(key);
    if (hintNode) hintNode.classList.add('faded');
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

  function sign(p1, p2, p3) { return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y); }
  function pointInTriangle(p, a, b, c) {
    const d1 = sign(p, a, b), d2 = sign(p, b, c), d3 = sign(p, c, a);
    const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
    const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(hasNeg && hasPos);
  }
  function dist2PointSegment(p, a, b) {
    const l2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
    if (l2 === 0) return (p.x - a.x) ** 2 + (p.y - a.y) ** 2;
    let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
    t = clamp(t, 0, 1);
    const projX = a.x + t * (b.x - a.x), projY = a.y + t * (b.y - a.y);
    return (p.x - projX) ** 2 + (p.y - projY) ** 2;
  }
  function hitCircleTriangle(cx, cy, radius, a, b, c) {
    const p = { x: cx, y: cy };
    if (pointInTriangle(p, a, b, c)) return true;
    const r2 = radius * radius;
    if (dist2PointSegment(p, a, b) < r2) return true;
    if (dist2PointSegment(p, b, c) < r2) return true;
    if (dist2PointSegment(p, c, a) < r2) return true;
    return false;
  }

  function die() {
    if (state !== 'running') return;
    state = 'dead';
    player.tumbleTimer = 0.4;
    player.tumbleAngle = 0;
    player.dancing = false;
    player.danceTimer = 0;
    clearHeldInputs();
    if (glideHud) glideHud.hidden = true;
    release(false);
    burst(player.x, player.y, '#ff626b', 24, 210);
    flash = 0.28;
    vibrate(120);
    updateHud();
    updateBest();
    if (!isEndless()) {
      attemptsLeft--;
      // Out of attempts: the saved run already points back at level 1.
      if (attemptsLeft > 0) saveProgress();
      else saveProgress(1, 0, TUNE.attemptsPerLevel);
    }
    finalNode.textContent = formatPoints(points);
    deathDetailNode.textContent = isEndless()
      ? `Endless · ${Math.floor(levelDistance)} m`
      : `Level ${level} · ${Math.floor(levelDistance)} / ${levelLength()} m`;
    const outOfAttempts = !isEndless() && attemptsLeft <= 0;
    deathEyebrowNode.textContent = isEndless() ? 'ENDLESS RUN OVER' : outOfAttempts ? 'OUT OF ATTEMPTS' : 'SWING ENDED';
    deathTitleNode.textContent = isEndless() ? 'One more swing?'
      : outOfAttempts ? 'Back to level 1'
      : `${attemptsLeft} ${attemptsLeft === 1 ? 'attempt' : 'attempts'} left`;
    restartLabelNode.textContent = isEndless() ? 'Swing endless again' : outOfAttempts ? 'Start from level 1' : `Retry level ${level}`;
    for (const button of startOverButtons) if (deathNode.contains(button)) button.hidden = outOfAttempts || level === 1;
    deathNode.hidden = true;
    controlsNode.classList.add('hidden-controls');
  }

  function clearLevel() {
    state = 'levelclear';
    clearHeldInputs();
    release(false);
    endGlide();
    const par = levelLength() / TUNE.parSpeed;
    const clearBonus = 500 + 50 * level;
    const timeBonus = Math.round(Math.max(0, par - elapsed) * 20 * levelMultiplier());
    const run = runPoints();
    levelResult = {
      level, run, clearBonus, timeBonus, total: run + clearBonus + timeBonus,
      stars: elapsed <= par * 0.8 ? 3 : elapsed <= par ? 2 : 1,
      time: elapsed, par, final: level === TUNE.levelCount,
    };
    bankedPoints += levelResult.total;
    bonusPoints = 0;
    levelDistance = 0;
    points = bankedPoints;
    updateBest();
    if (level > bestLevel) { bestLevel = level; store(STORAGE.bestLevel, String(bestLevel)); }
    saveProgress(level + 1, bankedPoints, TUNE.attemptsPerLevel);
    scoreNode.textContent = formatPoints(points);
    progressFillNode.style.transform = 'scaleX(1)';
    if (glideHud) glideHud.hidden = true;
    if (comboHud) comboHud.hidden = true;
    controlsNode.classList.add('hidden-controls');
    flash = 0.3;
    vibrate([40, 60, 90]);
    spawnConfetti(player.x, player.y - 20, 110);
    spawnConfetti(camera.x + W * 0.15, H * 0.75, 70);
    spawnConfetti(camera.x + W * 0.85, H * 0.75, 70);
    $('clear-eyebrow').textContent = levelResult.final ? 'CITY CONQUERED' : `LEVEL ${level} CLEAR`;
    $('clear-title').textContent = levelResult.final ? 'All 100 levels cleared!' : ['Nice swinging!', 'Great run!', 'Perfect line!'][levelResult.stars - 1];
    $('clear-stars').textContent = '★'.repeat(levelResult.stars) + '☆'.repeat(3 - levelResult.stars);
    $('clear-stars').setAttribute('aria-label', `${levelResult.stars} of 3 stars`);
    $('clear-time').textContent = `${elapsed.toFixed(1)} s / par ${Math.round(par)} s`;
    $('clear-run').textContent = `+${levelResult.run}`;
    $('clear-bonus').textContent = `+${clearBonus}`;
    $('clear-time-bonus').textContent = `+${timeBonus}`;
    $('clear-total').textContent = formatPoints(points);
    $('clear-note').textContent = levelResult.final ? 'Endless mode unlocked. Max difficulty, no finish line.' : `Next: ${DISTRICTS[Math.min(DISTRICTS.length - 2, Math.floor(level / 10))].name}`;
    $('next-label').textContent = levelResult.final ? 'Swing endless' : `Level ${level + 1}`;
  }

  function finishLevelClear() {
    if (state === 'levelclear' && levelClearTimer >= 0.8) advanceLevel();
  }

  function collide() {
    const r = TUNE.playerRadius;
    const wasGrounded = player.grounded;
    player.grounded = false;
    for (const building of buildings) {
      if (building.x > player.x + r + 40 || building.x + building.w < player.x - r - 40) continue;
      for (const hazard of building.hazards) {
        if (hazard.type === 'spikes') {
          for (let i = 0; i < hazard.spikeCount; i++) {
            const bx = hazard.x + i * (hazard.spikeBase + hazard.spikeGap);
            const a = { x: bx, y: building.top };
            const b = { x: bx + hazard.spikeBase, y: building.top };
            const c = { x: bx + hazard.spikeBase * 0.5, y: building.top - hazard.h };
            if (hitCircleTriangle(player.x, player.y, r, a, b, c)) { die(); return; }
          }
          // Clearing the spike tips by a hair earns a one-time near-miss bonus.
          const clearance = building.top - hazard.h - (player.y + r);
          const hazardEnd = hazard.x + hazard.spikeCount * (hazard.spikeBase + hazard.spikeGap);
          if (!hazard.nearMiss && clearance >= 0 && clearance < 22 && player.x > hazard.x && player.x < hazardEnd) {
            hazard.nearMiss = true;
            addPoints(50, 'NEAR MISS', player.x, player.y - 30, '#ff9c92');
          }
        } else if (hitCircleRect(player.x, player.y, r, hazard.x, building.top - hazard.h, hazard.w, hazard.h)) {
          die(); return;
        }
      }
      if (!hitCircleRect(player.x, player.y, r, building.x, building.top, building.w, H - building.top + 200)) continue;
      const overRoof = player.px + r > building.x && player.px - r < building.x + building.w;
      if (player.py + r <= building.top + 3 && player.vy >= -10 && overRoof) {
        if (!wasGrounded && player.vy > 90) player.landingTimer = 0.22;
        player.y = building.top - r;
        player.vy = 0;
        player.grounded = true;
        endGlide();
        comboChain = 0;
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
    let acceleration;
    if (player.grounded) acceleration = TUNE.groundAcceleration;
    else if (rope) acceleration = TUNE.swingAcceleration;
    else if (player.gliding) acceleration = TUNE.glideAirAcceleration;
    else acceleration = TUNE.airAcceleration;
    if (player.vx < TUNE.horizontalStartingSpeed) player.vx = Math.min(TUNE.horizontalStartingSpeed, player.vx + acceleration * dt);
    else player.vx += (rope ? TUNE.swingAcceleration : (player.gliding ? TUNE.glideAirAcceleration : TUNE.airAcceleration * 0.25)) * dt;

    if (player.gliding && !rope) {
      player.vy = Math.min(TUNE.glideMaxFallSpeed, player.vy + TUNE.glideGravity * dt);
      if (player.vy > 0 && Math.abs(player.vx) > TUNE.glideMinSpeed) {
        player.vy = Math.max(0, player.vy - TUNE.glideLift * dt);
      }
    } else {
      player.vy = Math.min(TUNE.maxFallSpeed, player.vy + TUNE.gravity * dt);
    }

    const pumpDir = (rightInputs.size > 0 ? 1 : 0) - (leftInputs.size > 0 ? 1 : 0);
    if (rope && pumpDir !== 0) {
      player.vx += pumpDir * TUNE.swingPump * dt;
    }

    let speed = Math.hypot(player.vx, player.vy);
    if (speed > TUNE.maxSpeed) {
      const scale = TUNE.maxSpeed / speed;
      player.vx *= scale;
      player.vy *= scale;
      speed = TUNE.maxSpeed;
    }
    player.speed = speed;
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    if (!player.trail) player.trail = [];
    player.trail.push({ x: player.x, y: player.y });
    if (player.trail.length > TUNE.trailLength) player.trail.shift();
    constrainRope();
    if (!Number.isFinite(player.x) || !Number.isFinite(player.y) || !Number.isFinite(player.vx) || !Number.isFinite(player.vy)) { startLevel(); return; }
    levelDistance = Math.max(levelDistance, Math.max(0, player.x - START_X) / 10);
    updateGlideHud();
    collide();
    if (state === 'running') updateHud();
    if (state === 'running' && player.x >= gateX) { clearLevel(); return; }
    for (let i = attachEffects.length - 1; i >= 0; i--) {
      const e = attachEffects[i];
      e.life -= dt;
      e.radius += (e.maxRadius - e.radius) * (1 - Math.exp(-12 * dt));
      if (e.life <= 0) attachEffects.splice(i, 1);
    }
    const target = Math.max(0, player.x - W * 0.28);
    camera.x += (target - camera.x) * (1 - Math.exp(-TUNE.cameraSmoothing * dt));
    generateAhead();
  }

  function drawSky() {
    const palette = district();
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, palette.sky[0]); sky.addColorStop(0.62, palette.sky[1]); sky.addColorStop(1, palette.sky[2]);
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
    drawSkyline(0.14, H * 0.64, palette.far, 114, 0.13);
    drawSkyline(0.31, H * 0.77, palette.near, 87, 0.19);
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
    const palette = district();
    for (const building of buildings) {
      const x = building.x - camera.x;
      if (x > W + 80 || x + building.w < -80) continue;
      const top = building.top;
      ctx.fillStyle = palette.body; ctx.fillRect(x, top, building.w, H - top + 10);
      ctx.fillStyle = palette.ledge; ctx.fillRect(x - 3, top - 7, building.w + 6, 9);
      ctx.fillStyle = palette.trim; ctx.fillRect(x, top + 2, building.w, 4);
      // Stable window pattern, independent of frame or camera position.
      for (let col = 0; col < Math.floor((building.w - 20) / 30); col++) for (let row = 0; row < Math.ceil((H - top) / 36); row++) {
        const lit = ((col * 17 + row * 31 + building.index * 13) % 7) < 2;
        ctx.fillStyle = lit ? palette.lit : palette.unlit;
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
        if (hazard.type === 'spikes') {
          for (let i = 0; i < hazard.spikeCount; i++) {
            const bx = hx + i * (hazard.spikeBase + hazard.spikeGap);
            ctx.fillStyle = '#ed5962';
            ctx.beginPath();
            ctx.moveTo(bx, top);
            ctx.lineTo(bx + hazard.spikeBase, top);
            ctx.lineTo(bx + hazard.spikeBase * 0.5, top - hazard.h);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#ff9c92';
            ctx.beginPath();
            ctx.moveTo(bx + hazard.spikeBase * 0.5, top - hazard.h);
            ctx.lineTo(bx + hazard.spikeBase * 0.62, top - hazard.h * 0.55);
            ctx.lineTo(bx + hazard.spikeBase * 0.38, top - hazard.h * 0.55);
            ctx.closePath();
            ctx.fill();
          }
          ctx.fillStyle = '#ff666e54';
          ctx.fillRect(hx - 4, top - 3, hazard.spikeCount * hazard.spikeBase + (hazard.spikeCount - 1) * hazard.spikeGap + 8, 4);
        } else {
          ctx.fillStyle = '#ed5962'; ctx.fillRect(hx, top - hazard.h, hazard.w, hazard.h);
          ctx.fillStyle = '#ff9c92'; ctx.fillRect(hx + 4, top - hazard.h + 4, hazard.w - 8, 4);
          ctx.fillStyle = '#ff666e54'; ctx.fillRect(hx - 5, top - 3, hazard.w + 10, 4);
        }
      }
      if (building.finish) drawFinishGate(building);
    }
  }

  function drawFinishGate(building) {
    const gx = gateX - camera.x, top = building.top - 7;
    const poleTop = top - 190;
    const beam = ctx.createLinearGradient(gx - 26, 0, gx + 26, 0);
    beam.addColorStop(0, '#ffd16600'); beam.addColorStop(0.5, '#ffd16638'); beam.addColorStop(1, '#ffd16600');
    ctx.fillStyle = beam; ctx.fillRect(gx - 26, 0, 52, top);
    ctx.strokeStyle = '#e8eef8'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(gx, top); ctx.lineTo(gx, poleTop); ctx.stroke();
    // Waving checkered flag.
    const cell = 9, cols = 8, rows = 4;
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
      ctx.fillStyle = (c + r) % 2 ? '#101420' : '#f6f8fc';
      ctx.fillRect(gx + 2 + c * cell, poleTop + r * cell + Math.sin(elapsed * 5 + c * 0.7) * 3, cell, cell);
    }
    ctx.fillStyle = '#ffd166';
    ctx.font = '900 13px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FINISH', gx, poleTop - 12);
    ctx.textAlign = 'left';
  }

  function drawPopups(dt) {
    ctx.font = '900 13px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i];
      p.life -= dt;
      if (p.life <= 0) { popups.splice(i, 1); continue; }
      p.y -= 38 * dt;
      ctx.globalAlpha = clamp(p.life / p.maxLife * 1.6, 0, 1);
      ctx.fillStyle = '#050a16'; ctx.fillText(p.text, p.x - camera.x + 1, p.y + 1);
      ctx.fillStyle = p.color; ctx.fillText(p.text, p.x - camera.x, p.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
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

  function drawAttachEffects(dt) {
    for (let i = attachEffects.length - 1; i >= 0; i--) {
      const e = attachEffects[i];
      const alpha = clamp(e.life / e.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(e.x - camera.x, e.y, e.radius, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawSuitLimb(sx, sy, jointX, jointY, endX, endY, width, accent) {
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(jointX, jointY); ctx.lineTo(endX, endY);
    ctx.strokeStyle = '#080e19'; ctx.lineWidth = width + 2; ctx.stroke();
    ctx.strokeStyle = '#252b36'; ctx.lineWidth = width; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(jointX, jointY); ctx.lineTo(endX, endY);
    ctx.strokeStyle = accent; ctx.lineWidth = width - 2; ctx.stroke();
    ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(endX, endY, width * 0.37, 0, TAU); ctx.fill();
  }

  function drawDeathLimb(targetCtx, sx, sy, jointX, jointY, endX, endY, width, accent) {
    targetCtx.beginPath(); targetCtx.moveTo(sx, sy); targetCtx.lineTo(jointX, jointY); targetCtx.lineTo(endX, endY);
    targetCtx.strokeStyle = '#080e19'; targetCtx.lineWidth = width + 2; targetCtx.stroke();
    targetCtx.strokeStyle = '#252b36'; targetCtx.lineWidth = width; targetCtx.stroke();
    targetCtx.beginPath(); targetCtx.moveTo(jointX, jointY); targetCtx.lineTo(endX, endY);
    targetCtx.strokeStyle = accent; targetCtx.lineWidth = width - 2; targetCtx.stroke();
    targetCtx.fillStyle = accent; targetCtx.beginPath(); targetCtx.arc(endX, endY, width * 0.37, 0, TAU); targetCtx.fill();
  }

  function drawDancer(c, target) {
    if (!c || !target) return;
    const t = player.danceTimer || 0;
    const beat = Math.sin(t * 8);
    const beat2 = Math.sin(t * 8 + Math.PI / 2);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, target.width, target.height);
    c.save();
    c.translate(target.width * 0.5, 87 + beat * 2);
    c.scale(2.08, 2.08);
    c.rotate(beat * 0.1);
    c.lineCap = 'round';
    c.lineJoin = 'round';

    c.fillStyle = '#55d6ef22';
    c.beginPath(); c.ellipse(0, 28, 24, 7, 0, 0, TAU); c.fill();
    drawDeathLimb(c, -4, 8, -10 + beat2 * 8, 14, -12 + beat2 * 14, 24, 7, '#b93349');
    drawDeathLimb(c, 4, 8, 10 - beat2 * 8, 14, 12 - beat2 * 14, 24, 7, '#d54353');
    drawDeathLimb(c, -7, -7, -18, -12 + beat * 14, -26, -22 + beat * 16, 6, '#b93349');
    drawDeathLimb(c, 7, -7, 18, -12 - beat * 14, 26, -22 - beat * 16, 6, '#b93349');

    c.fillStyle = '#080e19';
    c.beginPath(); c.moveTo(-9, -10); c.lineTo(9, -10); c.lineTo(9, 7); c.lineTo(5, 11); c.lineTo(-5, 11); c.lineTo(-9, 7); c.closePath(); c.fill();
    c.fillStyle = '#282d37';
    c.beginPath(); c.moveTo(-8, -9); c.lineTo(8, -9); c.lineTo(6, 9); c.lineTo(-6, 9); c.closePath(); c.fill();
    c.fillStyle = '#c9384b';
    c.beginPath(); c.moveTo(-7, -9); c.lineTo(7, -9); c.lineTo(5, 1); c.lineTo(0, 5); c.lineTo(-5, 1); c.closePath(); c.fill();
    c.fillStyle = '#f05b66';
    c.beginPath(); c.moveTo(-4, -7); c.lineTo(4, -7); c.lineTo(0, -4); c.closePath(); c.fill();
    c.fillStyle = '#141a25'; c.fillRect(-6, 6, 12, 3);

    c.fillStyle = '#080e19'; c.beginPath(); c.ellipse(0, -19, 10.5, 11.5, 0, 0, TAU); c.fill();
    c.fillStyle = '#be3448'; c.beginPath(); c.ellipse(0, -19, 9, 10, 0, 0, TAU); c.fill();
    c.fillStyle = '#252b36'; c.beginPath(); c.moveTo(-4, -27); c.lineTo(4, -27); c.lineTo(6, -13); c.lineTo(-6, -13); c.closePath(); c.fill();
    c.fillStyle = '#f3fbff';
    c.beginPath(); c.moveTo(-8, -21); c.lineTo(-2, -20); c.lineTo(-3, -16); c.lineTo(-7, -17); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(8, -21); c.lineTo(2, -20); c.lineTo(3, -16); c.lineTo(7, -17); c.closePath(); c.fill();
    c.fillStyle = '#98e5f0'; c.fillRect(-6, -18, 2, 1); c.fillRect(4, -18, 2, 1);
    c.restore();
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

    if (player.dancing || state === 'levelclear') {
      const t = player.danceTimer || 0;
      const beat = Math.sin(t * 8);
      const beat2 = Math.sin(t * 8 + Math.PI / 2);
      target.lean = beat * 0.14;
      target.crouch = Math.abs(beat) * 5;
      target.lKx = -10 + beat2 * 8; target.lKy = 14; target.lFx = -12 + beat2 * 14; target.lFy = 24;
      target.rKx = 10 - beat2 * 8; target.rKy = 14; target.rFx = 12 - beat2 * 14; target.rFy = 24;
      target.lEx = -18; target.lEy = -12 + beat * 14; target.lHx = -26; target.lHy = -22 + beat * 16;
      target.rEx = 18; target.rEy = -12 - beat * 14; target.rHx = 26; target.rHy = -22 - beat * 16;
    } else if (state === 'dead') {
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
    } else if (player.gliding) {
      target.lean = clamp(player.vx / TUNE.maxSpeed * 0.08 - 0.06, -0.12, 0.12);
      target.lKx = -3; target.lKy = 16; target.lFx = -3; target.lFy = 26;
      target.rKx = 3; target.rKy = 16; target.rFx = 3; target.rFy = 26;
      target.lEx = -28; target.lEy = -4; target.lHx = -40; target.lHy = -8;
      target.rEx = 28; target.rEy = -4; target.rHx = 40; target.rHy = -8;
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

    if (player.gliding && !rope) {
      ctx.save(); ctx.translate(x, y + pose.crouch); ctx.rotate(angle);
      ctx.strokeStyle = '#91eaff55'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(pose.lHx, pose.lHy);
      ctx.quadraticCurveTo(pose.lHx * 0.55, pose.lHy * 0.35 + 18, -6, 10);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pose.rHx, pose.rHy);
      ctx.quadraticCurveTo(pose.rHx * 0.55, pose.rHy * 0.35 + 18, 6, 10);
      ctx.stroke();
      ctx.fillStyle = '#55d6ef18';
      ctx.beginPath();
      ctx.moveTo(pose.lHx, pose.lHy);
      ctx.quadraticCurveTo(pose.lHx * 0.5, pose.lHy * 0.3 + 22, 0, 12);
      ctx.quadraticCurveTo(pose.rHx * 0.5, pose.rHy * 0.3 + 22, pose.rHx, pose.rHy);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    if (player.speed > TUNE.maxSpeed * 0.55 && player.trail && player.trail.length > 1) {
      ctx.save();
      ctx.lineCap = 'round';
      const speedRatio = Math.min(player.speed / TUNE.maxSpeed, 1);
      for (let i = 0; i < player.trail.length - 1; i++) {
        const a = player.trail[i], b = player.trail[i + 1];
        const alpha = (i / (player.trail.length - 1)) * speedRatio * 0.55;
        ctx.strokeStyle = `rgba(145,234,255,${alpha})`;
        ctx.lineWidth = 1 + speedRatio * 2;
        ctx.beginPath();
        ctx.moveTo(a.x - camera.x, a.y);
        ctx.lineTo(b.x - camera.x, b.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.save(); ctx.translate(x, y + pose.crouch); ctx.rotate(angle);
    if (player.dancing) { ctx.translate(0, 26); ctx.scale(1.6, 1.6); ctx.translate(0, -26); }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (player.dancing) {
      ctx.fillStyle = 'rgba(145,234,255,0.22)';
      ctx.beginPath(); ctx.ellipse(0, 28, 24, 7, 0, 0, TAU); ctx.fill();
    }
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
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.confetti ? 360 : 140) * dt;
      if (p.confetti) p.rotation += p.spin * dt;
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color;
      if (p.confetti) {
        ctx.save();
        ctx.translate(p.x - camera.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillRect(-p.size * 0.5, -p.size * 0.5, p.size, p.size);
        ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(p.x - camera.x, p.y, p.size, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function draw(dt) {
    const speedRatio = Math.min((player.speed || 0) / TUNE.maxSpeed, 1);
    zoom = 1 - TUNE.maxZoomOut * speedRatio;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, 0, 0);
    drawSky();
    drawBuildings();
    drawAnchorCue();
    drawAttachEffects(dt);
    if (state !== 'dead' || player.tumbleTimer > 0) drawPlayer(dt);
    if (state === 'dead') {
      player.tumbleTimer = Math.max(0, player.tumbleTimer - dt);
      if (player.tumbleTimer === 0) {
        deathNode.hidden = false;
        player.dancing = true;
        player.x = camera.x + W * 0.5;
        player.y = H * 0.92;
        player.danceTimer = (player.danceTimer || 0) + dt;
        drawDancer(deathDancerCtx, deathDancerCanvas);
      }
    }
    if (state === 'levelclear') {
      levelClearTimer += dt;
      player.danceTimer = (player.danceTimer || 0) + dt;
      if (levelClearTimer >= 0.6) {
        clearNode.hidden = false;
        drawDancer(clearDancerCtx, clearDancerCanvas);
        const left = Math.ceil(TUNE.levelClearAutoSeconds - levelClearTimer);
        const autoText = levelResult.final ? '' : `Next level in ${left}`;
        if ($('clear-auto').textContent !== autoText) $('clear-auto').textContent = autoText;
      }
      // The final level waits for the player; every other level moves on by itself.
      if (!levelResult.final && levelClearTimer >= TUNE.levelClearAutoSeconds) advanceLevel();
    }
    if (state !== 'paused') { drawParticles(dt); drawPopups(dt); }
    if (flash > 0 && state !== 'paused') {
      flash = Math.max(0, flash - dt);
      ctx.fillStyle = state === 'dead' ? `rgba(255,80,95,${flash * 0.55})` : `rgba(135,227,255,${flash * 0.16})`;
      ctx.fillRect(0, 0, W / zoom, H / zoom);
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
      if (event.code === 'Space' || event.code === 'Enter') event.preventDefault();
      if (event.code === 'Enter' && !event.repeat) continueAfterDeath();
      return;
    }
    if (state === 'levelclear') {
      if (event.code === 'Space' || event.code === 'Enter') event.preventDefault();
      if ((event.code === 'Enter' || event.code === 'Space') && !event.repeat) finishLevelClear();
      return;
    }
    if (state === 'countdown' && !event.repeat && event.code !== 'Escape' && event.code !== 'KeyR') startRun();
    if (event.code === 'Space') { if (!event.repeat) press(event); else event.preventDefault(); }
    if (event.code === 'KeyR') { event.preventDefault(); if (!event.repeat) restartLevel(); }
    if (event.code === 'Escape') { event.preventDefault(); if (!event.repeat) togglePause(); }
    if (event.code === 'KeyV') { event.preventDefault(); if (!event.repeat) jump(); }
    if (event.code === 'ArrowUp' || event.code === 'KeyW') { event.preventDefault(); if (state === 'running') shortenInputs.add(event.code); }
    if (event.code === 'ArrowDown' || event.code === 'KeyS') { event.preventDefault(); if (state === 'running') lengthenInputs.add(event.code); }
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') { event.preventDefault(); if (state === 'running') leftInputs.add(event.code); }
    if (event.code === 'ArrowRight' || event.code === 'KeyD') { event.preventDefault(); if (state === 'running') rightInputs.add(event.code); }
  });
  window.addEventListener('keyup', event => {
    if (event.code === 'Space') unpress(event);
    shortenInputs.delete(event.code);
    lengthenInputs.delete(event.code);
    leftInputs.delete(event.code);
    rightInputs.delete(event.code);
  });
  window.addEventListener('pointerdown', press);
  window.addEventListener('pointerup', unpress);
  window.addEventListener('pointercancel', unpress);
  for (const button of [webButton, jumpButton, shortenButton, lengthenButton, pauseButton, resumeButton, restartButton, countdownPauseButton, nextButton, ...startOverButtons]) {
    button.addEventListener('pointerdown', event => event.stopPropagation());
  }
  webButton.addEventListener('pointerdown', event => {
    event.preventDefault();
    webButton.setPointerCapture(event.pointerId);
    webButtonInputs.add(event.pointerId);
    webButton.classList.add('active');
    press(event);
  });
  const releaseWebButton = event => {
    event.stopPropagation();
    webButtonInputs.delete(event.pointerId);
    if (!webButtonInputs.size) webButton.classList.remove('active');
    unpress(event);
  };
  webButton.addEventListener('pointerup', releaseWebButton);
  webButton.addEventListener('pointercancel', releaseWebButton);
  webButton.addEventListener('lostpointercapture', releaseWebButton);
  restartButton.addEventListener('click', event => {
    if (state === 'dead' && event.detail > 0) continueAfterDeath();
  });
  nextButton.addEventListener('click', finishLevelClear);
  for (const button of startOverButtons) button.addEventListener('click', startOver);
  jumpButton.addEventListener('click', () => { startRun(); jump(); });
  pauseButton.addEventListener('click', togglePause);
  resumeButton.addEventListener('click', togglePause);
  countdownPauseButton.addEventListener('click', togglePause);
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
    clearHeldInputs();
    release(false);
  });
  levelBanner.addEventListener('animationend', () => { levelBanner.hidden = true; });
  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);
})();
