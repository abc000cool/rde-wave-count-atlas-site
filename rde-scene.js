// RDE Atlas — three.js scroll-scrubbed world
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/+esm';

const PP_BASE = 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/';
const PI2 = Math.PI * 2;
const clamp01 = x => Math.min(1, Math.max(0, x));
const S = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const L = (a, b, t) => a + (b - a) * t;
const hash = i => { const x = Math.sin(i * 127.1 + 31.7) * 43758.5453; return x - Math.floor(x); };

// glow multipliers stay <= 1 so the atlas reads as distinct bands: the plane
// fills the frame during beats 03-06, and pushing these into HDR (>1) made
// bloom saturate the whole screen to white. Hot cores (wave fronts, ignition,
// staircase marker) are still deliberately >1 and carry the glow.
const BANDS = [
  { max: 0.06, type: 'none',   n: 0, color: '#31363c', h: 0.07, glow: 0.5 },
  { max: 0.24, type: 'wave',   n: 1, color: '#2fe08c', h: 0.72, glow: 0.9 },
  { max: 0.29, type: 'gallop', n: 0, color: '#ffd23d', h: 0.50, glow: 0.72 },
  { max: 0.47, type: 'wave',   n: 2, color: '#ff9a3d', h: 0.94, glow: 0.9 },
  { max: 0.52, type: 'gallop', n: 0, color: '#ffd23d', h: 0.55, glow: 0.72 },
  { max: 0.70, type: 'wave',   n: 3, color: '#ff4433', h: 1.16, glow: 0.9 },
  { max: 0.75, type: 'gallop', n: 0, color: '#ffd23d', h: 0.60, glow: 0.72 },
  { max: 0.92, type: 'wave',   n: 4, color: '#d0154e', h: 1.38, glow: 0.95 },
  { max: 99,   type: 'none',   n: 0, color: '#31363c', h: 0.07, glow: 0.5 },
];
function regime(gx, gz) {
  const s = gx * 1.15 - 0.32 * gz + 0.02 * (hash(gx * 57.3 + gz * 131.7) - 0.5);
  for (const b of BANDS) if (s < b.max) return b;
  return BANDS[0];
}

const KEYS = [
  [0.000, [0, 2.6, 9.6],    [0, 0.1, 0]],
  [0.095, [6.6, 3.6, 6.6],  [0, 0, 0]],
  [0.150, [-3.5, 5.2, 8.2], [0, 0, 0]],
  [0.205, [0, 4.6, 9.8],    [0, 0, 0]],
  [0.235, [0, 2.2, 12.8],   [0, 0.2, 0]],
  [0.315, [0, 1.6, 13.4],   [0, 0.3, 0]],
  [0.360, [0, 3.8, 13],     [0, -4, -0.5]],
  [0.455, [0, 8.2, 11],     [0, -6.5, -1]],
  [0.478, [-14, -3.0, 5.4], [-9, -5.6, 0.6]],
  [0.585, [11, -3.4, 5.4],  [16, -5.6, 0.6]],
  [0.625, [-2, 3.4, 11.5],  [0, -6.2, -1]],
  [0.705, [2.5, 2.4, 12],   [0.5, -6.2, -1]],
  [0.745, [0, 0.2, 13.6],   [0, -1.4, -1.6]],
  [0.885, [0, 0.2, 13.9],   [0, -1.4, -1.6]],
  [0.930, [0, 2.6, 13.5],   [0, 0, 0]],
  [1.000, [0, 5.5, 19.5],   [0, 0, 0]],
];

export function createScene({ container, reduced, options, onFrame }) {
  let opts = Object.assign({ bloom: 1.15, waveSpeed: 1, palette: ['#ff7a29', '#ff3300', '#33e0ff'] }, options);
  const mobile = Math.min(innerWidth, innerHeight) < 700 || innerWidth < 720;
  let dead = false, raf = 0;

  const renderer = new THREE.WebGLRenderer({ antialias: !mobile, powerPreference: 'high-performance' });
  renderer.setClearColor(0x050507, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050507, 0.012);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3();

  const ember = new THREE.Color(opts.palette[0]), red = new THREE.Color(opts.palette[1]), cool = new THREE.Color(opts.palette[2]);

  // ---- Ring (torus that unwraps into a line) ----
  const R = 3.2, r = 0.55;
  const ringGeo = new THREE.PlaneGeometry(1, 1, mobile ? 360 : 640, mobile ? 24 : 36);
  const ringU = {
    uTime: { value: 0 }, uSpeed: { value: 0.45 * opts.waveSpeed },
    uCA: { value: 1 }, uCB: { value: 2 }, uCM: { value: 0 },
    uUnwrap: { value: 0 }, uDim: { value: 1 },
    uEmber: { value: ember.clone() }, uRed: { value: red.clone() }, uCool: { value: cool.clone() },
  };
  const ringMat = new THREE.ShaderMaterial({
    uniforms: ringU, side: THREE.DoubleSide,
    vertexShader: `
      uniform float uUnwrap; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        float b = uv.y*${PI2};
        float R = ${R.toFixed(2)}; float r = ${r.toFixed(2)};
        float k = max(1.0 - uUnwrap, 0.0015);
        float th = (uv.x - 0.5)*${PI2}*k;
        vec3 rad = vec3(sin(th), 0.0, cos(th));
        vec3 c = vec3(R*sin(th)/k, 0.0, -2.0*R*sin(th*0.5)*sin(th*0.5)/k + R*k);
        vec3 p = c + rad*(r*cos(b)) + vec3(0.0, r*sin(b), 0.0);
        vec3 n = normalize(rad*cos(b) + vec3(0.0, sin(b), 0.0));
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vN = normalMatrix * n; vV = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uTime,uSpeed,uCA,uCB,uCM,uDim;
      uniform vec3 uEmber,uRed,uCool;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        float dA = fract(uCA*(uTime*uSpeed - vUv.x));
        float dB = fract(uCB*(uTime*uSpeed - vUv.x));
        float tr = mix(exp(-dA*5.5), exp(-dB*5.5), uCM);
        float core = mix(exp(-dA*70.0), exp(-dB*70.0), uCM);
        vec3 base = vec3(0.05, 0.055, 0.065);
        float fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        vec3 col = base + uCool * fr * 0.22 * (1.0 - tr);
        col += mix(uRed, uEmber, tr) * tr * 1.35;
        col += vec3(1.35, 1.2, 1.0) * core;
        col *= uDim;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  scene.add(ringMesh);

  // ---- Atlas group ----
  const W = 24, D = 14;
  const NX = mobile ? 44 : 64, NZ = mobile ? 26 : 36, N = NX * NZ;
  const atlasGroup = new THREE.Group();
  atlasGroup.position.set(0, -6.5, -1);
  atlasGroup.visible = false;
  scene.add(atlasGroup);

  const boxGeo = new THREE.BoxGeometry(1, 1, 1); boxGeo.translate(0, 0.5, 0);
  const atlasMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 1, toneMapped: true });
  const atlas = new THREE.InstancedMesh(boxGeo, atlasMat, N);
  const tx = new Float32Array(N), tz = new Float32Array(N), th = new Float32Array(N);
  const scat = new Float32Array(N * 3), stag = new Float32Array(N);
  const dx = W / NX, dz = D / NZ, tmpC = new THREE.Color(), tmpM = new THREE.Matrix4();
  for (let ix = 0; ix < NX; ix++) for (let iz = 0; iz < NZ; iz++) {
    const i = ix * NZ + iz, gx = (ix + 0.5) / NX, gz = (iz + 0.5) / NZ;
    const b = regime(gx, gz);
    tx[i] = (gx - 0.5) * W; tz[i] = (gz - 0.5) * D;
    th[i] = b.h * (1 + 0.16 * (hash(i * 1.7) - 0.5));
    scat[i * 3] = (hash(i) - 0.5) * 22; scat[i * 3 + 1] = 6 + hash(i * 2.3) * 9; scat[i * 3 + 2] = (hash(i * 3.1) - 0.5) * 16 + 1;
    stag[i] = hash(i * 5.7);
    tmpC.set(b.color).multiplyScalar(b.glow);
    atlas.setColorAt(i, tmpC);
    tmpM.set(dx * 0.86, 0, 0, tx[i], 0, 0.001, 0, 0, 0, 0, dz * 0.86, tz[i], 0, 0, 0, 1);
    atlas.setMatrixAt(i, tmpM);
  }
  atlas.instanceColor.needsUpdate = true;
  atlasGroup.add(atlas);
  let lastAsm = -1;
  function updateAtlasMatrices(asmT) {
    for (let i = 0; i < N; i++) {
      const tt = clamp01((asmT * 1.45 - stag[i] * 0.45)); const e = tt * tt * (3 - 2 * tt);
      const px = L(scat[i * 3], tx[i], e), py = L(scat[i * 3 + 1], 0, e), pz = L(scat[i * 3 + 2], tz[i], e);
      const sy = Math.max(0.001, th[i] * e);
      tmpM.set(dx * 0.86, 0, 0, px, 0, sy, 0, py, 0, 0, dz * 0.86, pz, 0, 0, 0, 1);
      atlas.setMatrixAt(i, tmpM);
    }
    atlas.instanceMatrix.needsUpdate = true;
  }

  // path shader (reveal along length)
  function pathMaterial(colA, colB, fadeToGray) {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uReveal: { value: 0 }, uA: { value: new THREE.Color(colA) }, uB: { value: new THREE.Color(colB) }, uGray: { value: fadeToGray ? 1 : 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `
        uniform float uReveal,uGray; uniform vec3 uA,uB; varying vec2 vUv;
        void main(){
          if (vUv.x > uReveal) discard;
          vec3 c = mix(uA*2.6, uB*1.4, smoothstep(0.35, 0.95, vUv.x));
          if (uGray > 0.5) c = mix(uA*2.3, vec3(0.3), smoothstep(0.4, 0.92, vUv.x));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
  }
  // staircase along gz = 0.614
  const stairPts = [];
  for (let k = 0; k <= 48; k++) {
    const gx = 0.04 + 0.92 * (k / 48), gz = 0.614;
    stairPts.push(new THREE.Vector3((gx - 0.5) * W, regime(gx, gz).h + 0.5, (gz - 0.5) * D));
  }
  const stairCurve = new THREE.CatmullRomCurve3(stairPts);
  const stairMat = pathMaterial(opts.palette[0], '#ffffff', false);
  const stair = new THREE.Mesh(new THREE.TubeGeometry(stairCurve, 140, 0.11, 8), stairMat);
  stair.visible = false; atlasGroup.add(stair);
  const marker = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(opts.palette[0]).multiplyScalar(2.8) }));
  marker.visible = false; atlasGroup.add(marker);
  const markerPos = new THREE.Vector3();

  // trap path (hugs the gray zone)
  const trapPts = [[0.03, 0.16], [0.07, 0.36], [0.11, 0.56], [0.15, 0.78], [0.185, 0.96]]
    .map(([gx, gz]) => new THREE.Vector3((gx - 0.5) * W, 0.4, (gz - 0.5) * D));
  const trapCurve = new THREE.CatmullRomCurve3(trapPts);
  const trapMat = pathMaterial(opts.palette[0], '#484848', true);
  const trap = new THREE.Mesh(new THREE.TubeGeometry(trapCurve, 90, 0.10, 8), trapMat);
  trap.visible = false; atlasGroup.add(trap);

  // ignition
  const igniteLocal = new THREE.Vector3((0.62 - 0.5) * W, regime(0.62, 0.25).h + 0.15, (0.25 - 0.5) * D);
  const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff2d8, transparent: true, opacity: 0.95 }));
  flash.position.copy(igniteLocal); flash.visible = false; atlasGroup.add(flash);
  const NS = 130, sparkDir = new Float32Array(NS * 3), sparkSpd = new Float32Array(NS);
  const sparkPos = new Float32Array(NS * 3);
  for (let i = 0; i < NS; i++) {
    const th2 = hash(i * 9.1) * PI2, ph = Math.acos(2 * hash(i * 4.4) - 1);
    sparkDir[i * 3] = Math.sin(ph) * Math.cos(th2); sparkDir[i * 3 + 1] = Math.abs(Math.cos(ph)) * 0.9 + 0.15; sparkDir[i * 3 + 2] = Math.sin(ph) * Math.sin(th2);
    sparkSpd[i] = 0.5 + hash(i * 7.7);
  }
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = new THREE.PointsMaterial({ color: new THREE.Color(opts.palette[0]).multiplyScalar(1.8), size: 0.14, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.visible = false; atlasGroup.add(sparks);
  function updateSparks(b) {
    const rr = b * 3.4;
    for (let i = 0; i < NS; i++) {
      sparkPos[i * 3] = igniteLocal.x + sparkDir[i * 3] * rr * sparkSpd[i];
      sparkPos[i * 3 + 1] = igniteLocal.y + sparkDir[i * 3 + 1] * rr * sparkSpd[i] - 1.4 * b * b;
      sparkPos[i * 3 + 2] = igniteLocal.z + sparkDir[i * 3 + 2] * rr * sparkSpd[i];
    }
    sparkGeo.attributes.position.needsUpdate = true;
    sparkMat.opacity = 1 - b;
  }

  // ---- labels ----
  function makeLabel(text, color, scale) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const g = c.getContext('2d');
    g.font = '600 44px "IBM Plex Mono", ui-monospace, monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    // dark stroke first: these labels sit over the hot atlas bands
    g.lineWidth = 7; g.strokeStyle = 'rgba(3,4,6,0.92)'; g.lineJoin = 'round';
    g.strokeText(text, 256, 68);
    g.fillStyle = color;
    g.fillText(text, 256, 68);
    const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.scale.set(scale, scale * 0.25, 1);
    return sp;
  }
  const LABS = [['UW', 0.30, 0.35], ['AFRL', 0.42, 0.30], ['TU BERLIN', 0.55, 0.45], ['CINCINNATI', 0.62, 0.32], ['PURDUE', 0.72, 0.50], ['LAVRENTYEV', 0.83, 0.42]];
  const pins = new THREE.Group(); pins.visible = false; atlasGroup.add(pins);
  const pinItems = [];
  const pinMat = new THREE.MeshBasicMaterial({ color: cool.clone().multiplyScalar(1.7) });
  // Heads are deliberately hot (>1) and a touch larger: the plane tilts to face
  // the camera on beat 06, so the stems foreshorten away and the head is what
  // has to read as a data point against the bright bands.
  const pinHeadMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#eaffff').multiplyScalar(2.2) });
  for (const [name, gx, gz] of LABS) {
    const g = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 8), pinMat); stem.position.y = 0.55;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), pinHeadMat); head.position.y = 1.1;
    const lab = makeLabel(name, '#d9f4ff', 3.1); lab.position.y = 1.65;
    g.add(stem, head, lab);
    const y = regime(gx, gz).h;
    g.position.set((gx - 0.5) * W, y + 4, (gz - 0.5) * D); g.visible = false;
    pins.add(g); pinItems.push({ g, y });
  }
  let lastPin = -1;
  const axP = makeLabel('INJECTOR PRESSURE →', '#8a92a0', 6.5); axP.position.set(0, 0.15, D / 2 + 1.1); atlasGroup.add(axP);
  const axS = makeLabel('INJECTOR STIFFNESS', '#8a92a0', 6.0); axS.position.set(-W / 2 - 2.6, 0.15, 0); atlasGroup.add(axS);

  // ---- stars + grid ----
  const NST = mobile ? 350 : 900;
  const starPos = new Float32Array(NST * 3), starCol = new Float32Array(NST * 3);
  for (let i = 0; i < NST; i++) {
    const rad = 18 + hash(i * 3.3) * 26, th3 = hash(i * 1.9) * PI2, ph = Math.acos(2 * hash(i * 8.8) - 1);
    starPos[i * 3] = rad * Math.sin(ph) * Math.cos(th3); starPos[i * 3 + 1] = rad * Math.cos(ph) * 0.7; starPos[i * 3 + 2] = rad * Math.sin(ph) * Math.sin(th3);
    const warm = hash(i * 6.1) < 0.22;
    tmpC.set(warm ? opts.palette[0] : '#9fb8c4').multiplyScalar(0.35 + hash(i * 2.2) * 0.5);
    starCol[i * 3] = tmpC.r; starCol[i * 3 + 1] = tmpC.g; starCol[i * 3 + 2] = tmpC.b;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 0.07, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false }));
  scene.add(stars);
  const grid = new THREE.GridHelper(90, 45, 0x181d22, 0x111519);
  grid.position.y = -10.5; scene.add(grid);

  // ---- post-processing ----
  let composer = null, bloomPass = null;
  (async () => {
    try {
      const [ec, rp, ub] = await Promise.all([
        import(PP_BASE + 'EffectComposer.js/+esm'),
        import(PP_BASE + 'RenderPass.js/+esm'),
        import(PP_BASE + 'UnrealBloomPass.js/+esm'),
      ]);
      if (dead) return;
      composer = new ec.EffectComposer(renderer);
      composer.addPass(new rp.RenderPass(scene, camera));
      bloomPass = new ub.UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), opts.bloom, 0.7, 0.22);
      composer.addPass(bloomPass);
      onResize();
      if (reduced) renderOnce();
    } catch (e) { console.warn('bloom disabled:', e); }
  })();

  function onResize() {
    const w = container.clientWidth || innerWidth, h = container.clientHeight || innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, mobile ? 1.3 : 1.8);
    renderer.setPixelRatio(dpr); renderer.setSize(w, h);
    composer && composer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    if (reduced) renderOnce();
  }
  addEventListener('resize', onResize);
  onResize();

  // ---- timeline ----
  function update(p, t) {
    let c = 1 + S(0.115, 0.135, p) + S(0.150, 0.170, p) + S(0.185, 0.205, p) - S(0.215, 0.245, p)
      - 2 * S(0.465, 0.485, p) + S(0.505, 0.520, p) + S(0.545, 0.560, p);
    ringU.uCA.value = Math.floor(c); ringU.uCB.value = Math.floor(c) + 1; ringU.uCM.value = c - Math.floor(c);
    ringU.uTime.value = t;
    ringU.uUnwrap.value = S(0.215, 0.305, p) * (1 - S(0.915, 0.970, p));
    const win = (a, b) => S(a, a + 0.03, p) * (1 - S(b - 0.03, b, p));
    // The unwrapped line fully clears the frame while the atlas is the subject
    // (beats 06-07); it returns for the finale re-wrap.
    const dim = Math.max(0, 1 - 0.55 * win(0.46, 0.735) - 1.0 * win(0.745, 0.925));
    ringU.uDim.value = dim;
    ringMesh.visible = dim > 0.02;

    // Scroll-aware bloom: the ring beats want heavy glow, but once the
    // emissive atlas plane fills the frame the same settings blow it out to a
    // white sheet. Ease strength down and threshold up across those beats.
    if (bloomPass) {
      const atlasDom = S(0.315, 0.40, p) * (1 - S(0.925, 0.965, p));
      bloomPass.strength = opts.bloom * (1 - 0.58 * atlasDom);
      bloomPass.threshold = 0.22 + 0.34 * atlasDom;
    }

    let i = 0; while (i < KEYS.length - 2 && p > KEYS[i + 1][0]) i++;
    const k0 = KEYS[i], k1 = KEYS[i + 1], kt = clamp01((p - k0[0]) / (k1[0] - k0[0]));
    camPos.set(L(k0[1][0], k1[1][0], kt), L(k0[1][1], k1[1][1], kt), L(k0[1][2], k1[1][2], kt));
    camTgt.set(L(k0[2][0], k1[2][0], kt), L(k0[2][1], k1[2][1], kt), L(k0[2][2], k1[2][2], kt));
    const idle = 1 - S(0.02, 0.09, p);
    if (idle > 0.001) {
      const a = t * 0.05 * idle, x = camPos.x, z = camPos.z;
      camPos.x = x * Math.cos(a) - z * Math.sin(a); camPos.z = x * Math.sin(a) + z * Math.cos(a);
    }
    camera.position.copy(camPos); camera.lookAt(camTgt);

    const asmT = S(0.315, 0.425, p);
    atlasGroup.visible = asmT > 0.001;
    if (atlasGroup.visible) {
      if (Math.abs(asmT - lastAsm) > 0.0008) { lastAsm = asmT; updateAtlasMatrices(asmT); }
      const tiltT = S(0.73, 0.79, p) * (1 - S(0.885, 0.925, p));
      const finT = S(0.915, 0.985, p);
      const ang = t * 0.22 + 1.2;
      atlasGroup.position.set(
        L(0, Math.cos(ang) * 7.6, finT),
        L(L(-6.5, -1.35, tiltT), 0.7, finT),
        L(L(-1, -1.6, tiltT), Math.sin(ang) * 7.6, finT));
      atlasGroup.rotation.x = -Math.PI / 2 * tiltT * (1 - finT);
      atlasGroup.rotation.y = finT * t * 0.35;
      atlasGroup.scale.setScalar(1 - 0.87 * finT);
      atlasMat.opacity = 1 - 0.35 * win(0.83, 0.91) - 0.5 * win(0.465, 0.60) - 0.3 * win(0.595, 0.73);

      const rev = S(0.48, 0.575, p);
      stairMat.uniforms.uReveal.value = rev;
      stair.visible = p > 0.46 && p < 0.64;
      marker.visible = stair.visible && rev > 0.01 && rev < 0.995;
      if (marker.visible) { stairCurve.getPoint(Math.min(rev, 0.999), markerPos); marker.position.copy(markerPos); marker.position.y += 0.05; }

      trapMat.uniforms.uReveal.value = S(0.60, 0.655, p);
      trap.visible = p > 0.59 && p < 0.73;
      const ig = S(0.663, 0.678, p), burst = S(0.665, 0.715, p);
      flash.visible = ig > 0.01 && p < 0.75;
      if (flash.visible) {
        const pulse = ig * (1 - S(0.70, 0.74, p));
        flash.scale.setScalar(Math.max(0.02, pulse * (0.55 + 0.1 * Math.sin(t * 26))));
      }
      sparks.visible = burst > 0.005 && burst < 0.995 && p < 0.75;
      if (sparks.visible) updateSparks(burst);

      const pinT = S(0.74, 0.815, p);
      pins.visible = pinT > 0.001;
      // The plane tilts up to face the camera, which would swing the pins to
      // point away from the viewer and hide them behind it. Counter-rotate so
      // heads and labels stay on the camera side and descend toward the viewer.
      pins.rotation.x = Math.PI * tiltT;
      if (pins.visible && Math.abs(pinT - lastPin) > 0.0008) {
        lastPin = pinT;
        pinItems.forEach((it, j) => {
          const tj = clamp01((pinT * 1.6 - j * 0.1)); const e = tj * tj * (3 - 2 * tj);
          it.g.visible = tj > 0.001;
          it.g.position.y = it.y + (1 - e) * 4;
        });
      }
    }
    stars.rotation.y = t * 0.005;
    onFrame && onFrame(p, { count: c });
  }

  function render() { composer ? composer.render() : renderer.render(scene, camera); }
  function renderOnce() { update(0.0001, 1.0); render(); }

  let cur = 0, lastT = performance.now();
  function loop(now) {
    if (dead) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const target = clamp01((window.scrollY || document.documentElement.scrollTop) / max);
    cur += (target - cur) * (1 - Math.exp(-dt * 5.5));
    if (Math.abs(target - cur) < 0.0004) cur = target;
    update(cur, now * 0.001);
    render();
  }
  if (reduced) { renderOnce(); onFrame && onFrame(0, { count: 1 }); }
  else raf = requestAnimationFrame(loop);

  return {
    setOptions(o) {
      opts = Object.assign(opts, o);
      ringU.uSpeed.value = 0.45 * opts.waveSpeed;
      ringU.uEmber.value.set(opts.palette[0]); ringU.uRed.value.set(opts.palette[1]); ringU.uCool.value.set(opts.palette[2]);
      stairMat.uniforms.uA.value.set(opts.palette[0]);
      trapMat.uniforms.uA.value.set(opts.palette[0]);
      marker.material.color.set(opts.palette[0]).multiplyScalar(2.8);
      sparkMat.color.set(opts.palette[0]).multiplyScalar(1.8);
      pinMat.color.set(opts.palette[2]).multiplyScalar(1.7);
      if (bloomPass) bloomPass.strength = opts.bloom;
      if (reduced) renderOnce();
    },
    dispose() {
      dead = true; cancelAnimationFrame(raf);
      removeEventListener('resize', onResize);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
