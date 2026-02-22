(function () {
  'use strict';

  const CFG = {
    arenaSize: 44,
    wallHeight: 7,
    moveSpeed: 0.20,
    sprintSpeed: 0.34,
    turnSpeed: 0.045,
    bulletSpeed: 1.4,
    bulletRadius: 0.1,
    shootCooldown: 220,
    maxAmmo: 30,
    reloadTime: 1500,
    playerEye: 1.65,
    hitRadius: 0.85,
    playerDmg: 20,
    maxHp: 100,
    maxStamina: 100,
    staminaDrain: 0.8,
    staminaRegen: 0.35,
    aiHp: 120,
    aiSpeed: 0.10,
    aiShootCooldown: 550,
    aiDmg: 12,
    aiAccuracy: 0.92,
    aiLeadFactor: 0.4,
    aiBurstCount: 2,
    aiBurstDelay: 150,
    pickupSpawnInterval: 8000,
    maxPickups: 4,
  };

  const DIFFICULTIES = {
    easy: {
      label: 'Easy', color: '#4a4',
      aiHp: 80, aiSpeed: 0.055, aiShootCooldown: 1200,
      aiDmg: 8, aiAccuracy: 0.65, aiLeadFactor: 0.1,
      aiBurstCount: 1, aiBurstDelay: 200,
      playerDmg: 30, maxHp: 120,
    },
    normal: {
      label: 'Normal', color: '#4af',
      aiHp: 110, aiSpeed: 0.08, aiShootCooldown: 750,
      aiDmg: 12, aiAccuracy: 0.82, aiLeadFactor: 0.3,
      aiBurstCount: 2, aiBurstDelay: 180,
      playerDmg: 22, maxHp: 100,
    },
    hard: {
      label: 'Hard', color: '#fa4',
      aiHp: 150, aiSpeed: 0.12, aiShootCooldown: 450,
      aiDmg: 16, aiAccuracy: 0.93, aiLeadFactor: 0.5,
      aiBurstCount: 3, aiBurstDelay: 120,
      playerDmg: 18, maxHp: 90,
    },
    nightmare: {
      label: 'Nightmare', color: '#f33',
      aiHp: 200, aiSpeed: 0.15, aiShootCooldown: 320,
      aiDmg: 22, aiAccuracy: 0.97, aiLeadFactor: 0.7,
      aiBurstCount: 4, aiBurstDelay: 90,
      playerDmg: 15, maxHp: 75,
    },
  };

  let currentDifficulty = 'normal';
  let scene, camera, renderer;
  let playerBullets = [], aiBullets = [], particles = [], pickups = [];
  let gameRunning = false;
  let gameStartTime = 0;
  let shotsFired = 0, shotsHit = 0;
  let score = 0, combo = 0, comboTimer = 0;
  let wave = 1;
  let lastPickupSpawn = 0;

  const keys = { up: false, down: false, left: false, right: false, space: false, shift: false };

  const player = { x: 0, z: 12, yaw: Math.PI, hp: 100, ammo: 30, reloading: false, reloadStart: 0, stamina: 100 };
  const enemy = {
    x: 0, z: -12, hp: 120, mesh: null, lastShot: 0,
    targetX: 0, targetZ: -12, retargetAt: 0,
    state: 'patrol', strafeDir: 1, strafeTimer: 0,
    hitFlashTime: 0, burstRemaining: 0, burstTimer: 0,
  };

  let camShakeX = 0, camShakeY = 0, camShakeDecay = 0;
  let headBobPhase = 0;
  let smoothYaw = Math.PI;

  const dom = {};
  function cacheDom() {
    ['playerBar', 'enemyBar', 'playerHp', 'enemyHp', 'hitFlash', 'overlay',
     'overlayTitle', 'overlaySub', 'restartBtn', 'gameTimer', 'ammoCount',
     'hitmarker', 'lowHealthPulse', 'killFeed', 'scoreDisplay',
     'waveIndicator', 'staminaBar', 'pickupNotify', 'waveBanner', 'comboDisplay',
     'statHits', 'statAcc', 'statTime', 'statScore', 'statWave'].forEach(id => {
      const elId = id.replace(/([A-Z])/g, '-$1').toLowerCase();
      dom[id] = document.getElementById(elId);
    });
    dom.minimapCanvas = document.getElementById('minimap-canvas');
    dom.minimapCtx = dom.minimapCanvas.getContext('2d');
  }

  function applyDifficulty(key) {
    currentDifficulty = key;
    const d = DIFFICULTIES[key];
    Object.keys(d).forEach(k => {
      if (k !== 'label' && k !== 'color') CFG[k] = d[k];
    });
    const badge = document.getElementById('diff-badge');
    if (badge) {
      badge.textContent = d.label;
      badge.style.color = d.color;
      badge.style.border = '1px solid ' + d.color + '44';
      badge.style.background = d.color + '18';
    }
    document.querySelectorAll('.end-diff-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.diff === key);
    });
  }

  let loopRunning = false;

  function init() {
    cacheDom();

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080810);
    scene.fog = new THREE.FogExp2(0x080810, 0.018);

    camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 200);
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.prepend(renderer.domElement);

    buildLights();
    buildArena();
    buildEnemy();
    buildGun();

    bindInput();
    window.addEventListener('resize', onResize);

    document.querySelectorAll('.diff-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        applyDifficulty(btn.dataset.diff);
        document.getElementById('start-menu').classList.add('hidden');
        document.body.classList.add('in-game');
        resetGame();
        if (!loopRunning) loop();
      });
    });

    document.querySelectorAll('.end-diff-btn').forEach(btn => {
      btn.addEventListener('click', () => applyDifficulty(btn.dataset.diff));
    });

    dom.restartBtn.addEventListener('click', resetGame);

    applyDifficulty('normal');
    camera.position.set(0, CFG.playerEye, 12);
    camera.rotation.set(0, Math.PI, 0);
    renderer.render(scene, camera);
  }

  // ---- Lights ----
  function buildLights() {
    scene.add(new THREE.AmbientLight(0x334466, 0.5));

    const sun = new THREE.DirectionalLight(0xddeeff, 0.7);
    sun.position.set(20, 30, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 80;
    const sc = 28;
    sun.shadow.camera.left = -sc; sun.shadow.camera.right = sc;
    sun.shadow.camera.top = sc; sun.shadow.camera.bottom = -sc;
    sun.shadow.bias = -0.001;
    scene.add(sun);

    const accents = [
      { color: 0xff2200, x: -CFG.arenaSize/2+1, z: 0, y: 4, intensity: 1.2, dist: 18 },
      { color: 0x0044ff, x: CFG.arenaSize/2-1, z: 0, y: 4, intensity: 1.2, dist: 18 },
      { color: 0xff6600, x: 0, z: -CFG.arenaSize/2+1, y: 4, intensity: 0.8, dist: 15 },
      { color: 0x00aaff, x: 0, z: CFG.arenaSize/2-1, y: 4, intensity: 0.8, dist: 15 },
    ];
    accents.forEach(a => {
      const light = new THREE.PointLight(a.color, a.intensity, a.dist);
      light.position.set(a.x, a.y, a.z);
      scene.add(light);
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 8, 8),
        new THREE.MeshBasicMaterial({ color: a.color })
      );
      glow.position.copy(light.position);
      scene.add(glow);
    });
  }

  // ---- Arena ----
  function buildArena() {
    const S = CFG.arenaSize;
    const H = CFG.wallHeight;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(S, S),
      new THREE.MeshStandardMaterial({ color: 0x12131f, roughness: 0.85, metalness: 0.1 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(S, 22, 0x1a1a35, 0x15152a);
    grid.position.y = 0.01;
    scene.add(grid);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x1a2240, roughness: 0.6, metalness: 0.3 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x334466, roughness: 0.4, metalness: 0.5 });

    [
      { w: S, h: H, d: 0.8, px: 0, pz: -S/2 },
      { w: S, h: H, d: 0.8, px: 0, pz: S/2 },
      { w: 0.8, h: H, d: S, px: -S/2, pz: 0 },
      { w: 0.8, h: H, d: S, px: S/2, pz: 0 },
    ].forEach(c => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(c.w, c.h, c.d), wallMat);
      wall.position.set(c.px, c.h/2, c.pz);
      wall.castShadow = true; wall.receiveShadow = true;
      scene.add(wall);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(c.w + 0.1, 0.15, c.d + 0.1), trimMat);
      trim.position.set(c.px, c.h, c.pz);
      scene.add(trim);
    });

    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x222844, roughness: 0.5, metalness: 0.4 });
    [[-S/2,-S/2],[S/2,-S/2],[-S/2,S/2],[S/2,S/2],[0,-S/2],[0,S/2],[-S/2,0],[S/2,0]].forEach(([px,pz]) => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, H, 8), pillarMat);
      p.position.set(px, H/2, pz); p.castShadow = true; scene.add(p);
    });

    const cMat1 = new THREE.MeshStandardMaterial({ color: 0x222a44, roughness: 0.55, metalness: 0.35 });
    const cMat2 = new THREE.MeshStandardMaterial({ color: 0x2a3355, roughness: 0.5, metalness: 0.4 });
    [
      { x:-9, z:-6, sx:2.5, sy:2.2, sz:2.5, m:cMat1 },
      { x:9, z:5, sx:3, sy:1.8, sz:1.8, m:cMat2 },
      { x:-6, z:9, sx:1.8, sy:3.5, sz:1.8, m:cMat1 },
      { x:7, z:-9, sx:2.2, sy:2.8, sz:2.2, m:cMat2 },
      { x:0, z:0, sx:2, sy:1.2, sz:5, m:cMat1 },
      { x:-12, z:0, sx:1.5, sy:2, sz:3, m:cMat2 },
      { x:12, z:0, sx:1.5, sy:2, sz:3, m:cMat1 },
      { x:0, z:-13, sx:4, sy:1.5, sz:1.5, m:cMat2 },
      { x:0, z:13, sx:4, sy:1.5, sz:1.5, m:cMat1 },
      { x:-14, z:-14, sx:2, sy:2, sz:2, m:cMat2 },
      { x:14, z:14, sx:2, sy:2, sz:2, m:cMat1 },
      { x:14, z:-14, sx:1.5, sy:3, sz:1.5, m:cMat2 },
      { x:-14, z:14, sx:1.5, sy:3, sz:1.5, m:cMat1 },
    ].forEach(b => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.sx, b.sy, b.sz), b.m);
      mesh.position.set(b.x, b.sy/2, b.z);
      mesh.castShadow = true; mesh.receiveShadow = true;
      scene.add(mesh);
    });
  }

  // ---- Enemy ----
  let enemyParts = {};
  function buildEnemy() {
    const group = new THREE.Group();
    const mDark = new THREE.MeshStandardMaterial({ color: 0x441111, roughness: 0.4, metalness: 0.7 });
    const mRed = new THREE.MeshStandardMaterial({ color: 0xaa2222, roughness: 0.35, metalness: 0.6 });
    const mAcc = new THREE.MeshStandardMaterial({ color: 0x661111, roughness: 0.3, metalness: 0.8 });
    const visorMat = new THREE.MeshBasicMaterial({ color: 0xff2200 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff4400 });

    [-0.2, 0.2].forEach(ox => {
      group.add(makeMesh(new THREE.CylinderGeometry(0.12, 0.14, 0.5, 8), mDark, ox, 0.35, 0));
      group.add(makeMesh(new THREE.CylinderGeometry(0.1, 0.12, 0.4, 8), mDark, ox, 0.1, 0));
      group.add(makeMesh(new THREE.BoxGeometry(0.16, 0.06, 0.25), mAcc, ox, 0.03, -0.04));
    });

    group.add(makeMesh(new THREE.BoxGeometry(0.5, 0.2, 0.3), mDark, 0, 0.55, 0));
    const torso = makeMesh(new THREE.BoxGeometry(0.65, 0.6, 0.4), mRed, 0, 0.95, 0);
    torso.castShadow = true; group.add(torso);
    group.add(makeMesh(new THREE.BoxGeometry(0.55, 0.35, 0.12), mAcc, 0, 1.0, -0.22));

    const core = makeMesh(new THREE.SphereGeometry(0.08, 8, 8), glowMat, 0, 0.95, -0.3);
    group.add(core); enemyParts.core = core;
    const coreLight = new THREE.PointLight(0xff4400, 0.6, 5);
    coreLight.position.set(0, 0.95, -0.3); group.add(coreLight);
    enemyParts.coreLight = coreLight;

    [-0.45, 0.45].forEach(ox => {
      group.add(makeMesh(new THREE.BoxGeometry(0.22, 0.18, 0.3), mAcc, ox, 1.15, 0));
      group.add(makeMesh(new THREE.ConeGeometry(0.06, 0.2, 6), mDark, ox, 1.28, 0));
    });

    [-0.42, 0.42].forEach(ox => {
      group.add(makeMesh(new THREE.CylinderGeometry(0.08, 0.1, 0.35, 8), mDark, ox, 0.9, 0));
      const fa = makeMesh(new THREE.CylinderGeometry(0.07, 0.09, 0.3, 8), mRed, ox, 0.68, -0.08);
      fa.rotation.x = 0.3; group.add(fa);
    });

    group.add(makeMesh(new THREE.CylinderGeometry(0.1, 0.12, 0.15, 8), mDark, 0, 1.32, 0));
    const head = makeMesh(new THREE.BoxGeometry(0.4, 0.35, 0.38), mRed, 0, 1.55, 0);
    head.castShadow = true; group.add(head);
    group.add(makeMesh(new THREE.BoxGeometry(0.08, 0.15, 0.3), mAcc, 0, 1.78, 0));

    const visor = makeMesh(new THREE.BoxGeometry(0.32, 0.08, 0.05), visorMat, 0, 1.55, -0.2);
    group.add(visor); enemyParts.visor = visor;
    const vLight = new THREE.PointLight(0xff2200, 0.4, 4);
    vLight.position.set(0, 1.55, -0.3); group.add(vLight);
    enemyParts.visorLight = vLight;

    group.add(makeMesh(new THREE.BoxGeometry(0.12, 0.12, 0.7), mDark, 0.42, 0.75, -0.35));
    const gb = makeMesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8), mAcc, 0.42, 0.75, -0.7);
    gb.rotation.x = Math.PI/2; group.add(gb);
    group.add(makeMesh(new THREE.SphereGeometry(0.035, 6, 6), glowMat, 0.42, 0.75, -0.85));

    group.position.set(enemy.x, 0, enemy.z);
    group.castShadow = true;
    enemy.mesh = group;
    scene.add(group);
  }

  function makeMesh(geo, mat, x, y, z) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    return m;
  }

  // ---- Player gun ----
  let gunGroup, gunDefaultZ = -0.45;
  function buildGun() {
    gunGroup = new THREE.Group();
    const gM = new THREE.MeshStandardMaterial({ color: 0x3a4455, roughness: 0.25, metalness: 0.8 });
    const gD = new THREE.MeshStandardMaterial({ color: 0x222833, roughness: 0.3, metalness: 0.7 });
    const gA = new THREE.MeshStandardMaterial({ color: 0x4488cc, roughness: 0.2, metalness: 0.9 });

    gunGroup.add(makeMesh(new THREE.BoxGeometry(0.1, 0.1, 0.4), gM, 0, 0, 0));
    const brl = makeMesh(new THREE.CylinderGeometry(0.025, 0.03, 0.35, 8), gD, 0, 0.02, -0.35);
    brl.rotation.x = Math.PI/2; gunGroup.add(brl);
    const mzl = makeMesh(new THREE.CylinderGeometry(0.035, 0.025, 0.06, 8), gA, 0, 0.02, -0.53);
    mzl.rotation.x = Math.PI/2; gunGroup.add(mzl);
    const grp = makeMesh(new THREE.BoxGeometry(0.07, 0.14, 0.08), gD, 0, -0.1, 0.08);
    grp.rotation.x = 0.2; gunGroup.add(grp);
    gunGroup.add(makeMesh(new THREE.BoxGeometry(0.06, 0.12, 0.06), gM, 0, -0.1, -0.05));
    gunGroup.add(makeMesh(new THREE.BoxGeometry(0.06, 0.03, 0.25), gA, 0, 0.06, -0.05));
    gunGroup.add(makeMesh(new THREE.BoxGeometry(0.03, 0.04, 0.03), gA, 0, 0.09, -0.12));

    gunGroup.position.set(0.28, -0.22, gunDefaultZ);
    camera.add(gunGroup);
    scene.add(camera);
  }

  // ---- Pickups ----
  function spawnPickup() {
    if (pickups.length >= CFG.maxPickups) return;
    const half = CFG.arenaSize / 2 - 3;
    const x = (Math.random() - 0.5) * half * 2;
    const z = (Math.random() - 0.5) * half * 2;
    const type = Math.random() < 0.5 ? 'health' : 'ammo';

    const color = type === 'health' ? 0x44ff44 : 0x4488ff;
    const group = new THREE.Group();

    const inner = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.3, 0),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
    );
    group.add(inner);

    const outer = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.45, 0),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.15, wireframe: true })
    );
    group.add(outer);

    const light = new THREE.PointLight(color, 0.6, 6);
    light.position.y = 0.5;
    group.add(light);

    group.position.set(x, 0.8, z);
    group.userData = { type, born: performance.now() };
    scene.add(group);
    pickups.push(group);
  }

  function updatePickups(dt) {
    const now = performance.now();

    if (now - lastPickupSpawn > CFG.pickupSpawnInterval && pickups.length < CFG.maxPickups) {
      spawnPickup();
      lastPickupSpawn = now;
    }

    const pickupRadius = 1.5;
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];

      // Hover and rotate animation
      p.rotation.y += 0.03 * dt;
      p.position.y = 0.8 + Math.sin(now * 0.003 + i) * 0.15;

      const dx = p.position.x - player.x;
      const dz = p.position.z - player.z;
      if (dx * dx + dz * dz < pickupRadius * pickupRadius) {
        const type = p.userData.type;
        if (type === 'health' && player.hp < CFG.maxHp) {
          player.hp = Math.min(CFG.maxHp, player.hp + 30);
          showPickupNotify('+30 HEALTH', '#44ff44');
          addScore(50, 'Heal');
        } else if (type === 'ammo') {
          player.ammo = Math.min(CFG.maxAmmo, player.ammo + 15);
          if (player.reloading) { player.reloading = false; }
          showPickupNotify('+15 AMMO', '#4488ff');
          addScore(25, 'Ammo');
        } else {
          continue;
        }
        spawnParticles(p.position.x, p.position.y, p.position.z,
          type === 'health' ? 0x44ff44 : 0x4488ff, 10, 0.3);
        scene.remove(p);
        pickups.splice(i, 1);
        continue;
      }

      // Despawn after 20s
      if (now - p.userData.born > 20000) {
        scene.remove(p);
        pickups.splice(i, 1);
      }
    }
  }

  function showPickupNotify(text, color) {
    dom.pickupNotify.textContent = text;
    dom.pickupNotify.style.color = color;
    dom.pickupNotify.classList.add('show');
    setTimeout(() => dom.pickupNotify.classList.remove('show'), 1200);
  }

  // ---- Score & Combo ----
  function addScore(pts, reason) {
    const multiplier = 1 + combo * 0.25;
    const gained = Math.round(pts * multiplier);
    score += gained;
    if (reason) addKillFeedEntry('+' + gained + ' ' + reason + (combo > 0 ? ' (x' + (1 + combo * 0.25).toFixed(1) + ')' : ''));
  }

  function hitCombo() {
    combo++;
    comboTimer = performance.now();
    if (combo >= 2) {
      dom.comboDisplay.textContent = combo + 'x COMBO';
      dom.comboDisplay.classList.add('show');
    }
  }

  function updateCombo() {
    if (combo > 0 && performance.now() - comboTimer > 2500) {
      combo = 0;
      dom.comboDisplay.classList.remove('show');
    }
  }

  // ---- Waves ----
  function startNextWave() {
    wave++;
    const hpScale = 1 + (wave - 1) * 0.2;
    const spdScale = 1 + (wave - 1) * 0.08;
    const cdScale = Math.max(0.4, 1 - (wave - 1) * 0.06);

    enemy.hp = Math.round(CFG.aiHp * hpScale);
    enemy.x = (Math.random() - 0.5) * (CFG.arenaSize * 0.6);
    enemy.z = (Math.random() - 0.5) * (CFG.arenaSize * 0.6);
    enemy.lastShot = performance.now();
    enemy.retargetAt = 0;
    enemy.state = 'patrol';
    enemy.burstRemaining = 0;
    enemy.mesh.position.set(enemy.x, 0, enemy.z);
    enemy.mesh.visible = true;
    enemy._speedMult = spdScale;
    enemy._cdMult = cdScale;

    dom.waveIndicator.textContent = 'WAVE ' + wave;

    dom.waveBanner.textContent = 'WAVE ' + wave;
    dom.waveBanner.classList.remove('show');
    void dom.waveBanner.offsetWidth;
    dom.waveBanner.classList.add('show');

    addScore(wave * 100, 'Wave ' + wave);
    addKillFeedEntry('Wave ' + wave + ' — Enemy HP: ' + enemy.hp);
  }

  // ---- Particles ----
  function spawnParticles(x, y, z, color, count, speed) {
    for (let i = 0; i < count; i++) {
      const geo = new THREE.SphereGeometry(0.04 + Math.random() * 0.04, 4, 4);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
      const p = new THREE.Mesh(geo, mat);
      p.position.set(x, y, z);
      const angle = Math.random() * Math.PI * 2;
      const upward = 0.3 + Math.random() * 0.7;
      const spd = speed * (0.5 + Math.random());
      p.userData = { vx: Math.cos(angle)*spd, vy: upward*spd, vz: Math.sin(angle)*spd, life: 1, decay: 0.02 + Math.random()*0.03 };
      scene.add(p);
      particles.push(p);
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i], d = p.userData;
      p.position.x += d.vx * dt;
      p.position.y += d.vy * dt;
      p.position.z += d.vz * dt;
      d.vy -= 0.02 * dt;
      d.life -= d.decay * dt;
      p.material.opacity = Math.max(0, d.life);
      if (d.life <= 0) { scene.remove(p); particles.splice(i, 1); }
    }
  }

  // ---- Minimap ----
  function drawMinimap() {
    const ctx = dom.minimapCtx;
    const w = 140, h = 140, cx = w/2, cy = h/2;
    const scale = w / CFG.arenaSize;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(10,12,25,0.8)';
    ctx.beginPath(); ctx.arc(cx, cy, 68, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(100,180,255,0.15)';
    ctx.lineWidth = 0.5;
    for (let r = 15; r < 70; r += 15) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.stroke(); }

    const cosY = Math.cos(-player.yaw + Math.PI);
    const sinY = Math.sin(-player.yaw + Math.PI);

    // Pickups
    pickups.forEach(p => {
      const rx = (p.position.x - player.x) * scale;
      const rz = (p.position.z - player.z) * scale;
      const mx = cx + rx * cosY - rz * sinY;
      const my = cy + rx * sinY + rz * cosY;
      if (mx > 4 && mx < w-4 && my > 4 && my < h-4) {
        ctx.fillStyle = p.userData.type === 'health' ? '#44ff44' : '#4488ff';
        ctx.beginPath(); ctx.arc(mx, my, 3, 0, Math.PI*2); ctx.fill();
      }
    });

    // Enemy
    if (enemy.hp > 0) {
      const rx = (enemy.x - player.x) * scale;
      const rz = (enemy.z - player.z) * scale;
      const mx = cx + rx * cosY - rz * sinY;
      const my = cy + rx * sinY + rz * cosY;
      if (mx > 2 && mx < w-2 && my > 2 && my < h-2) {
        ctx.fillStyle = '#ff3333';
        ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(mx, my, 4, 0, Math.PI*2); ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // Player
    ctx.fillStyle = '#4af'; ctx.shadowColor = '#4af'; ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(68,170,255,0.6)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx, cy-8); ctx.lineTo(cx+4, cy+2); ctx.lineTo(cx-4, cy+2);
    ctx.closePath(); ctx.stroke();
  }

  // ---- Reset ----
  function resetGame() {
    player.x = 0; player.z = 12; player.yaw = Math.PI; player.hp = CFG.maxHp;
    player.ammo = CFG.maxAmmo; player.reloading = false; player.stamina = CFG.maxStamina;
    enemy.x = 0; enemy.z = -12; enemy.hp = CFG.aiHp; enemy.lastShot = 0;
    enemy.retargetAt = 0; enemy.state = 'patrol'; enemy.burstRemaining = 0;
    enemy._speedMult = 1; enemy._cdMult = 1;
    smoothYaw = player.yaw;
    shotsFired = 0; shotsHit = 0; score = 0; combo = 0; wave = 1;
    gameStartTime = performance.now();
    lastTime = performance.now();
    lastPickupSpawn = performance.now();

    if (enemy.mesh) {
      enemy.mesh.position.set(enemy.x, 0, enemy.z);
      enemy.mesh.visible = true;
    }

    [...playerBullets, ...aiBullets, ...particles, ...pickups].forEach(b => scene.remove(b));
    playerBullets = []; aiBullets = []; particles = []; pickups = [];

    dom.overlay.classList.remove('active');
    document.body.classList.add('in-game');
    dom.killFeed.innerHTML = '';
    dom.waveIndicator.textContent = 'WAVE 1';
    dom.comboDisplay.classList.remove('show');
    updateHUD();
    gameRunning = true;
  }

  // ---- Input ----
  function bindInput() {
    window.addEventListener('keydown', e => {
      if (handleKey(e.code, true)) e.preventDefault();
      if (e.code === 'KeyR' && !player.reloading && player.ammo < CFG.maxAmmo && gameRunning) startReload();
    });
    window.addEventListener('keyup', e => { handleKey(e.code, false); });
  }

  function handleKey(code, pressed) {
    switch (code) {
      case 'ArrowUp':    case 'KeyW': keys.up    = pressed; return true;
      case 'ArrowDown':  case 'KeyS': keys.down  = pressed; return true;
      case 'ArrowLeft':  case 'KeyA': keys.left  = pressed; return true;
      case 'ArrowRight': case 'KeyD': keys.right = pressed; return true;
      case 'Space':                   keys.space = pressed; return true;
      case 'ShiftLeft': case 'ShiftRight': keys.shift = pressed; return true;
    }
    return false;
  }

  // ---- Reload ----
  function startReload() {
    player.reloading = true;
    player.reloadStart = performance.now();
    addKillFeedEntry('Reloading...');
  }

  function updateReload() {
    if (!player.reloading) return;
    if (performance.now() - player.reloadStart >= CFG.reloadTime) {
      player.ammo = CFG.maxAmmo;
      player.reloading = false;
    }
  }

  // ---- Shooting ----
  let lastPlayerShot = 0;

  function playerShoot() {
    const now = performance.now();
    if (now - lastPlayerShot < CFG.shootCooldown) return;
    if (player.reloading) return;
    if (player.ammo <= 0) { startReload(); return; }
    lastPlayerShot = now;
    player.ammo--;
    shotsFired++;

    const dx = Math.sin(player.yaw);
    const dz = Math.cos(player.yaw);
    spawnBullet(player.x + dx * 0.5, player.z + dz * 0.5, dx, dz, true);

    if (gunGroup) {
      gunGroup.position.z = gunDefaultZ + 0.12;
      gunGroup.rotation.x = -0.08;
    }
    addScreenShake(0.015);
  }

  function spawnBullet(x, z, dx, dz, isPlayer) {
    const color = isPlayer ? 0x44ffaa : 0xff3300;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(CFG.bulletRadius, 6, 6),
      new THREE.MeshBasicMaterial({ color })
    );
    mesh.position.set(x, CFG.playerEye * 0.65, z);
    mesh.userData = { vx: dx * CFG.bulletSpeed, vz: dz * CFG.bulletSpeed };
    mesh.add(new THREE.PointLight(color, 0.4, 3));
    scene.add(mesh);
    (isPlayer ? playerBullets : aiBullets).push(mesh);
  }

  function addScreenShake(intensity) { camShakeDecay = Math.max(camShakeDecay, intensity); }

  // ---- AI ----
  let waveTransition = 0;

  function updateAI(dt) {
    if (enemy.hp <= 0) {
      if (waveTransition === 0) {
        waveTransition = performance.now();
      } else if (performance.now() - waveTransition > 2000) {
        startNextWave();
        waveTransition = 0;
      }
      return;
    }

    const now = performance.now();
    const sMult = enemy._speedMult || 1;
    const cdMult = enemy._cdMult || 1;

    const toPx = player.x - enemy.x;
    const toPz = player.z - enemy.z;
    const toPDist = Math.sqrt(toPx * toPx + toPz * toPz);

    if (toPDist < 6) enemy.state = 'retreat';
    else if (toPDist < 18) enemy.state = 'strafe';
    else enemy.state = 'chase';

    const half = CFG.arenaSize / 2 - 2;
    const baseSpeed = CFG.aiSpeed * sMult;

    if (enemy.state === 'chase' && toPDist > 3) {
      const speed = baseSpeed * dt;
      enemy.x += (toPx / toPDist) * speed;
      enemy.z += (toPz / toPDist) * speed;
    } else if (enemy.state === 'strafe') {
      enemy.strafeTimer -= dt;
      if (enemy.strafeTimer <= 0) {
        enemy.strafeDir = Math.random() > 0.5 ? 1 : -1;
        enemy.strafeTimer = 40 + Math.random() * 60;
      }
      const perpX = -toPz / toPDist, perpZ = toPx / toPDist;
      const speed = baseSpeed * 1.1 * dt;
      enemy.x += perpX * enemy.strafeDir * speed + (toPx / toPDist) * speed * 0.2;
      enemy.z += perpZ * enemy.strafeDir * speed + (toPz / toPDist) * speed * 0.2;
    } else if (enemy.state === 'retreat') {
      const speed = baseSpeed * 1.3 * dt;
      enemy.x -= (toPx / toPDist) * speed;
      enemy.z -= (toPz / toPDist) * speed;
    }

    enemy.x = clamp(enemy.x, -half, half);
    enemy.z = clamp(enemy.z, -half, half);
    enemy.mesh.position.set(enemy.x, 0, enemy.z);

    const targetRot = Math.atan2(toPx, toPz);
    let diff = targetRot - enemy.mesh.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    enemy.mesh.rotation.y += diff * 0.1 * dt;

    const effectiveCooldown = CFG.aiShootCooldown * cdMult;
    if (enemy.burstRemaining > 0 && now > enemy.burstTimer) {
      enemy.burstRemaining--;
      enemy.burstTimer = now + CFG.aiBurstDelay;
      fireAIShot(toPx, toPz, toPDist);
    } else if (toPDist < 30 && toPDist > 2 && now - enemy.lastShot > effectiveCooldown) {
      enemy.lastShot = now;
      enemy.burstRemaining = CFG.aiBurstCount - 1;
      enemy.burstTimer = now + CFG.aiBurstDelay;
      fireAIShot(toPx, toPz, toPDist);
    }

    if (now - enemy.hitFlashTime < 100) {
      enemy.mesh.traverse(c => {
        if (c.isMesh && c.material.color) {
          c.material.emissive = c.material.emissive || new THREE.Color();
          c.material.emissive.setHex(0xffffff);
          c.material.emissiveIntensity = 0.5;
        }
      });
    } else {
      enemy.mesh.traverse(c => {
        if (c.isMesh && c.material.emissiveIntensity) c.material.emissiveIntensity = 0;
      });
    }

    if (enemyParts.coreLight) {
      enemyParts.coreLight.intensity = 0.4 + Math.sin(now * 0.005) * 0.3;
    }
  }

  function fireAIShot(toPx, toPz, toPDist) {
    const timeToHit = toPDist / CFG.bulletSpeed;
    const pVelX = keys.up ? Math.sin(player.yaw) * CFG.moveSpeed : keys.down ? -Math.sin(player.yaw) * CFG.moveSpeed : 0;
    const pVelZ = keys.up ? Math.cos(player.yaw) * CFG.moveSpeed : keys.down ? -Math.cos(player.yaw) * CFG.moveSpeed : 0;

    let aimX = toPx + pVelX * timeToHit * CFG.aiLeadFactor * 16;
    let aimZ = toPz + pVelZ * timeToHit * CFG.aiLeadFactor * 16;

    const spread = (1 - CFG.aiAccuracy) * 2;
    aimX += (Math.random() - 0.5) * spread * toPDist * 0.1;
    aimZ += (Math.random() - 0.5) * spread * toPDist * 0.1;

    const aimDist = Math.sqrt(aimX * aimX + aimZ * aimZ);
    spawnBullet(enemy.x + (aimX/aimDist)*0.9, enemy.z + (aimZ/aimDist)*0.9, aimX/aimDist, aimZ/aimDist, false);
  }

  // ---- Bullets ----
  function updateBullets(dt) {
    const half = CFG.arenaSize / 2;
    const hr2 = CFG.hitRadius * CFG.hitRadius;

    for (let i = playerBullets.length - 1; i >= 0; i--) {
      const b = playerBullets[i];
      b.position.x += b.userData.vx * dt;
      b.position.z += b.userData.vz * dt;
      if (Math.abs(b.position.x) > half || Math.abs(b.position.z) > half) {
        spawnParticles(b.position.x, b.position.y, b.position.z, 0x44ffaa, 4, 0.15);
        scene.remove(b); playerBullets.splice(i, 1); continue;
      }
      if (enemy.hp > 0) {
        const dx = b.position.x - enemy.x, dz = b.position.z - enemy.z;
        if (dx*dx + dz*dz < hr2) {
          enemy.hp = Math.max(0, enemy.hp - CFG.playerDmg);
          enemy.hitFlashTime = performance.now();
          shotsHit++;
          hitCombo();
          addScore(100, 'Hit');
          spawnParticles(b.position.x, CFG.playerEye*0.7, b.position.z, 0xff4444, 8, 0.25);
          scene.remove(b); playerBullets.splice(i, 1);
          showHitmarker();
          if (enemy.hp <= 0) {
            addScore(500 + wave * 200, 'Kill');
            spawnParticles(enemy.x, 1, enemy.z, 0xff4400, 30, 0.5);
            spawnParticles(enemy.x, 1, enemy.z, 0xffaa00, 20, 0.3);
            enemy.mesh.visible = false;
            addKillFeedEntry('Enemy eliminated — Wave ' + wave + ' complete');
          }
        }
      }
    }

    for (let i = aiBullets.length - 1; i >= 0; i--) {
      const b = aiBullets[i];
      b.position.x += b.userData.vx * dt;
      b.position.z += b.userData.vz * dt;
      if (Math.abs(b.position.x) > half || Math.abs(b.position.z) > half) {
        spawnParticles(b.position.x, b.position.y, b.position.z, 0xff3300, 4, 0.15);
        scene.remove(b); aiBullets.splice(i, 1); continue;
      }
      const dx = b.position.x - player.x, dz = b.position.z - player.z;
      if (dx*dx + dz*dz < hr2) {
        player.hp = Math.max(0, player.hp - CFG.aiDmg);
        scene.remove(b); aiBullets.splice(i, 1);
        spawnParticles(player.x, CFG.playerEye*0.5, player.z, 0xff2200, 6, 0.2);
        showHitFlash();
        addScreenShake(0.04);
        combo = 0;
        dom.comboDisplay.classList.remove('show');
      }
    }
  }

  function showHitmarker() {
    dom.hitmarker.classList.add('active');
    setTimeout(() => dom.hitmarker.classList.remove('active'), 120);
  }

  function showHitFlash() {
    dom.hitFlash.style.background = 'radial-gradient(ellipse at center, transparent 40%, rgba(255,20,0,0.5))';
    dom.hitFlash.classList.add('active');
    setTimeout(() => dom.hitFlash.classList.remove('active'), 130);
  }

  // ---- Kill feed ----
  function addKillFeedEntry(text) {
    const el = document.createElement('div');
    el.className = 'feed-entry';
    el.textContent = text;
    dom.killFeed.prepend(el);
    if (dom.killFeed.children.length > 5) dom.killFeed.lastChild.remove();
    setTimeout(() => { if (el.parentNode) el.remove(); }, 4000);
  }

  function formatTime(ms) {
    const s = Math.floor(ms / 1000);
    return String(Math.floor(s/60)).padStart(2, '0') + ':' + String(s%60).padStart(2, '0');
  }

  // ---- HUD ----
  function updateHUD() {
    const php = Math.max(0, Math.round(player.hp));
    const ehp = Math.max(0, Math.round(enemy.hp));
    dom.playerHp.textContent = php;
    dom.enemyHp.textContent = ehp;
    dom.playerBar.style.width = (php / CFG.maxHp * 100) + '%';

    const maxEhp = (CFG.aiHp * (1 + (wave - 1) * 0.2));
    dom.enemyBar.style.width = (ehp / maxEhp * 100) + '%';

    dom.ammoCount.textContent = player.reloading ? '...' : player.ammo;
    dom.gameTimer.textContent = formatTime(performance.now() - gameStartTime);
    dom.scoreDisplay.textContent = score;
    dom.staminaBar.style.width = (player.stamina / CFG.maxStamina * 100) + '%';

    if (php <= 30 && php > 0) {
      dom.lowHealthPulse.style.opacity = 0.3 + Math.sin(performance.now() * 0.006) * 0.2;
    } else {
      dom.lowHealthPulse.style.opacity = 0;
    }
  }

  // ---- End ----
  function checkEnd() {
    if (player.hp <= 0) {
      gameRunning = false;
      const elapsed = formatTime(performance.now() - gameStartTime);
      const acc = shotsFired > 0 ? Math.round(shotsHit/shotsFired*100)+'%' : '0%';
      dom.overlayTitle.textContent = 'DEFEATED';
      dom.overlayTitle.style.color = '#ff3333';
      dom.overlaySub.textContent = 'Survived to Wave ' + wave;
      document.getElementById('stat-score').textContent = score;
      document.getElementById('stat-wave').textContent = wave;
      document.getElementById('stat-hits').textContent = shotsHit;
      document.getElementById('stat-acc').textContent = acc;
      document.getElementById('stat-time').textContent = elapsed;
      dom.overlay.classList.add('active');
      document.body.classList.remove('in-game');
      return true;
    }
    return false;
  }

  // ---- Main loop ----
  let lastTime = performance.now();

  function loop() {
    if (!loopRunning) loopRunning = true;
    requestAnimationFrame(loop);
    if (!gameRunning) {
      updateParticles(1);
      renderer.render(scene, camera);
      return;
    }

    const now = performance.now();
    const dt = Math.min((now - lastTime) / 16.667, 4);
    lastTime = now;

    // Turn (left arrow = turn left = increase yaw)
    if (keys.left) player.yaw += CFG.turnSpeed * dt;
    if (keys.right) player.yaw -= CFG.turnSpeed * dt;
    smoothYaw += (player.yaw - smoothYaw) * 0.3 * dt;

    // Sprint
    const sprinting = keys.shift && player.stamina > 0 && (keys.up || keys.down);
    const currentSpeed = sprinting ? CFG.sprintSpeed : CFG.moveSpeed;
    if (sprinting) {
      player.stamina = Math.max(0, player.stamina - CFG.staminaDrain * dt);
    } else {
      player.stamina = Math.min(CFG.maxStamina, player.stamina + CFG.staminaRegen * dt);
    }

    // Movement
    let mx = 0, mz = 0, isMoving = false;
    if (keys.up) { mx += Math.sin(smoothYaw); mz += Math.cos(smoothYaw); isMoving = true; }
    if (keys.down) { mx -= Math.sin(smoothYaw); mz -= Math.cos(smoothYaw); isMoving = true; }
    if (mx !== 0 || mz !== 0) {
      const len = Math.sqrt(mx*mx + mz*mz);
      player.x += (mx/len) * currentSpeed * dt;
      player.z += (mz/len) * currentSpeed * dt;
    }

    const half = CFG.arenaSize / 2 - 1;
    player.x = clamp(player.x, -half, half);
    player.z = clamp(player.z, -half, half);

    // Head bob
    const bobRate = sprinting ? 0.18 : isMoving ? 0.12 : 0.02;
    headBobPhase += bobRate * dt;
    const bobAmp = sprinting ? 0.06 : isMoving ? 0.04 : 0.008;
    const bobY = Math.sin(headBobPhase) * bobAmp;
    const bobX = isMoving ? Math.cos(headBobPhase * 0.5) * 0.02 : 0;

    // Screen shake
    if (camShakeDecay > 0.001) {
      camShakeX = (Math.random()-0.5) * camShakeDecay;
      camShakeY = (Math.random()-0.5) * camShakeDecay;
      camShakeDecay *= 0.88;
    } else { camShakeX = 0; camShakeY = 0; camShakeDecay = 0; }

    if (keys.space) playerShoot();
    updateReload();
    updateCombo();

    if (gunGroup) {
      gunGroup.position.z += (gunDefaultZ - gunGroup.position.z) * 0.15 * dt;
      gunGroup.rotation.x += (0 - gunGroup.rotation.x) * 0.15 * dt;
      gunGroup.position.y = -0.22 + bobY * 0.5;
    }

    camera.position.set(player.x + bobX + camShakeX, CFG.playerEye + bobY + camShakeY, player.z);
    camera.rotation.set(0, 0, 0);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = smoothYaw;

    updateAI(dt);
    updateBullets(dt);
    updatePickups(dt);
    updateParticles(dt);
    updateHUD();
    drawMinimap();

    renderer.render(scene, camera);
    checkEnd();
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
