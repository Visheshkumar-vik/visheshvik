// Landing: one method, any geometry. Scroll takes four of my projects through
// CAD -> mesh -> FEA -> CFD in a single Three.js scene.
// The stent is the real StentForge geometry (CAD and deployed STL, half models
// mirrored). The quadcopter, heat exchanger and mixing elbow are simplified
// models drawn for this page. All colours are illustrations, not result data.
(function () {
  const section = document.getElementById('pipeline');
  if (!section) return;
  const canvas = section.querySelector('.pipe-canvas');
  const panels = [...section.querySelectorAll('.pipe-panel')];
  const railItems = [...section.querySelectorAll('.pipe-rail li')];
  const methodItems = [...section.querySelectorAll('.pipe-methods li[data-m]')];
  const legend = section.querySelector('.pipe-legend');
  const legendTitle = legend && legend.querySelector('.title');
  const legendLo = legend && legend.querySelector('.lo');
  const legendHi = legend && legend.querySelector('.hi');
  const hudDomain = section.querySelector('[data-hud="domain"]');
  const hudTool = section.querySelector('[data-hud="tool"]');
  const hudGeo = section.querySelector('[data-hud="geo"]');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Panel windows (scroll progress 0..1): intro, four projects, outro
  const WIN = [0, 0.07, 0.40, 0.57, 0.74, 0.90, 1.01];

  function hasWebGL() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl'))); }
    catch (e) { return false; }
  }
  if (!window.THREE || !hasWebGL()) { section.classList.add('pipe-static'); panels.forEach(p => p.classList.add('is-on')); return; }

  const T = window.THREE;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const band = (a, b, c, d, x) => smooth(a, b, x) * (1 - smooth(c, d, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  function turbo(t, o) {
    t = clamp(t, 0, 1);
    o.r = clamp(0.13572138 + t * (4.61539260 + t * (-42.66032258 + t * (132.13108234 + t * (-152.94239396 + t * 59.28637943)))), 0, 1);
    o.g = clamp(0.09140261 + t * (2.19418839 + t * (4.84296658 + t * (-14.18503333 + t * (4.27729857 + t * 2.82956604)))), 0, 1);
    o.b = clamp(0.10667330 + t * (12.64194608 + t * (-60.58204836 + t * (110.36276771 + t * (-89.90310912 + t * 27.34824973)))), 0, 1);
    return o;
  }
  const C = { r: 0, g: 0, b: 0 };

  // ── Renderer, scene, camera ────────────────────────────────────────────────
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(24, 1, 0.1, 300);
  scene.add(new T.HemisphereLight(0xffffff, 0xb9bcc0, 0.95));
  const key = new T.DirectionalLight(0xffffff, 0.85); key.position.set(4, 8, 6); scene.add(key);
  const rim = new T.DirectionalLight(0xffffff, 0.35); rim.position.set(-6, -2, -4); scene.add(rim);
  const grid = new T.GridHelper(60, 60, 0xd4d4d0, 0xe3e3e0);
  grid.position.y = -2.6; grid.material.transparent = true; grid.material.opacity = 0.5; scene.add(grid);

  const INK = 0x16181b, SOLID = 0xd9dbdd, STEEL = 0x8d959e;

  // A drafting-style part: light solid, ink edges, and a mesh overlay
  function cadPart(geo, opts = {}) {
    const solid = new T.Mesh(geo, new T.MeshStandardMaterial({ color: opts.color || SOLID, metalness: opts.metal || 0.1, roughness: 0.6, transparent: true, opacity: 1, vertexColors: !!opts.vc, side: opts.side || T.FrontSide }));
    const edges = new T.LineSegments(new T.EdgesGeometry(geo, opts.edgeAngle || 28), new T.LineBasicMaterial({ color: INK, transparent: true, opacity: 1 }));
    const wire = new T.Mesh(geo, new T.MeshBasicMaterial({ color: INK, wireframe: true, transparent: true, opacity: 0 }));
    const g = new T.Group(); g.add(solid, edges, wire);
    g.userData = { solid, edges, wire };
    return g;
  }
  function look(parts, { alpha = 1, solid = 1, edges = 1, wire = 0 }) {
    for (const p of parts) {
      if (!p) continue;
      const u = p.userData; if (!u.solid) continue;
      u.solid.material.opacity = alpha * solid; u.edges.material.opacity = alpha * edges; u.wire.material.opacity = alpha * wire * 0.35;
      u.solid.material.depthWrite = alpha * solid > 0.95;   // a see-through shell must not hide the flow inside it
      u.solid.visible = alpha * solid > 0.01; u.edges.visible = alpha * edges > 0.01; u.wire.visible = alpha * wire > 0.01;
    }
  }

  // Streaks: short coloured line segments that move through a domain
  function makeStreaks(n) {
    const g = new T.BufferGeometry();
    const pos = new Float32Array(n * 6), col = new Float32Array(n * 6);
    g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3));
    const m = new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false });
    const line = new T.LineSegments(g, m); line.frustumCulled = false; line.visible = false;
    return {
      line, m, n,
      set(i, x, y, z, dx, dy, dz, t) {
        const o = i * 6; pos[o] = x; pos[o + 1] = y; pos[o + 2] = z; pos[o + 3] = x - dx; pos[o + 4] = y - dy; pos[o + 5] = z - dz;
        turbo(t, C); col[o] = C.r; col[o + 1] = C.g; col[o + 2] = C.b; col[o + 3] = C.r * .55 + .45; col[o + 4] = C.g * .55 + .45; col[o + 5] = C.b * .55 + .45;
      },
      done() { g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; },
    };
  }
  const NS = window.innerWidth <= 820 ? 0.45 : 1;   // fewer streaks on phones

  // ── Binary STL, with mirroring for the symmetry (half and quarter) models ──
  function parseSTL(buf) {
    const dv = new DataView(buf), n = dv.getUint32(80, true), out = new Float32Array(n * 9);
    for (let i = 0; i < n; i++) { const o = 84 + i * 50 + 12; for (let k = 0; k < 9; k++) out[i * 9 + k] = dv.getFloat32(o + k * 4, true); }
    return out;
  }
  function mirror(tri, axis) {
    const n = tri.length / 9, out = new Float32Array(tri.length * 2);
    out.set(tri);
    for (let i = 0; i < n; i++) {
      const o = i * 9, d = tri.length + i * 9;
      const v = [[tri[o], tri[o + 1], tri[o + 2]], [tri[o + 6], tri[o + 7], tri[o + 8]], [tri[o + 3], tri[o + 4], tri[o + 5]]];
      for (let k = 0; k < 3; k++) { v[k][axis] = -v[k][axis]; out[d + k * 3] = v[k][0]; out[d + k * 3 + 1] = v[k][1]; out[d + k * 3 + 2] = v[k][2]; }
    }
    return out;
  }
  const load = url => fetch(url).then(r => { if (!r.ok) throw new Error(url); return r.arrayBuffer(); }).then(parseSTL);

  // ── Chapter 1: StentForge (real geometry) ──────────────────────────────────
  const bio = new T.Group(); scene.add(bio);
  const S = 0.36;                     // mm -> scene units
  const F = S / 0.54;                 // flow-streak scale
  const R_MID = 1.73;
  let stentCad = null, stentDep = null, vessel = null, plaque = null, rollBase = null, rollPos = null, edgePairs = null, edgePos = null, ready = false;

  // Feature edges as vertex-index pairs, so the ink lines can follow a mesh that changes shape
  function featureEdges(pos, deg) {
    const lim = Math.cos(deg * Math.PI / 180), open = new Map(), pairs = [], N = [];
    const vk = v => Math.round(pos[v * 3] * 1e3) + ',' + Math.round(pos[v * 3 + 1] * 1e3) + ',' + Math.round(pos[v * 3 + 2] * 1e3);
    for (let t = 0, n = pos.length / 9; t < n; t++) {
      const o = t * 9, ax = pos[o + 3] - pos[o], ay = pos[o + 4] - pos[o + 1], az = pos[o + 5] - pos[o + 2];
      const bx = pos[o + 6] - pos[o], by = pos[o + 7] - pos[o + 1], bz = pos[o + 8] - pos[o + 2];
      const x = ay * bz - az * by, y = az * bx - ax * bz, z = ax * by - ay * bx, l = Math.hypot(x, y, z) || 1;
      N.push([x / l, y / l, z / l]);
      for (let e = 0; e < 3; e++) {
        const a = t * 3 + e, b = t * 3 + (e + 1) % 3, ka = vk(a), kb = vk(b), k = ka < kb ? ka + '|' + kb : kb + '|' + ka, m = open.get(k);
        if (m) { const p = N[m.t], q = N[t]; if (p[0] * q[0] + p[1] * q[1] + p[2] * q[2] <= lim) pairs.push(m.a, m.b); open.delete(k); }
        else open.set(k, { t, a, b });
      }
    }
    for (const m of open.values()) pairs.push(m.a, m.b);
    return new Uint32Array(pairs);
  }
  const bioStreaks = makeStreaks(Math.round(1700 * NS)); bio.add(bioStreaks.line);
  const bioP = []; for (let i = 0; i < bioStreaks.n; i++) bioP.push([Math.random() * 13 - 6.5, Math.sqrt(Math.random()) * 0.92, Math.random() * Math.PI * 2]);

  Promise.all(['stent_cad', 'stent_deployed', 'vessel', 'plaque'].map(f => load('assets/3d/' + f + '.stl')))
    .then(([cad, dep, ves, plq]) => {
      cad = mirror(cad, 0); dep = mirror(dep, 0);                       // half models across x = 0, axis along y
      const centreY = (a, c) => { for (let i = 1; i < a.length; i += 3) a[i] -= c; return a; };
      centreY(cad, 6.04); centreY(dep, 5.8);
      rollBase = new Float32Array(cad.length);                           // flat-pattern coordinates: arc length, axis, thickness
      for (let i = 0; i < cad.length; i += 9) {
        const th = [0, 3, 6].map(k => Math.atan2(cad[i + k + 2], cad[i + k]));
        if (Math.max(...th) - Math.min(...th) > Math.PI) for (let k = 0; k < 3; k++) if (th[k] < 0) th[k] += 2 * Math.PI;   // keep seam triangles whole
        for (let k = 0; k < 3; k++) { const j = i + k * 3; rollBase[j] = R_MID * th[k]; rollBase[j + 1] = cad[j + 1]; rollBase[j + 2] = Math.hypot(cad[j], cad[j + 2]) - R_MID; }
      }
      const gCad = new T.BufferGeometry(); rollPos = new Float32Array(cad); gCad.setAttribute('position', new T.BufferAttribute(rollPos, 3)); gCad.computeVertexNormals();
      stentCad = cadPart(gCad, { color: STEEL, metal: 0.55, edgeAngle: 50 });
      edgePairs = featureEdges(cad, 50); edgePos = new Float32Array(edgePairs.length * 3);   // ink edges that follow the roll
      const eu = stentCad.userData.edges; eu.geometry.dispose();
      eu.geometry = new T.BufferGeometry(); eu.geometry.setAttribute('position', new T.BufferAttribute(edgePos, 3));
      for (const o of [stentCad.userData.solid, eu, stentCad.userData.wire]) o.frustumCulled = false;
      stentCad.scale.setScalar(S); bio.add(stentCad);

      const gDep = new T.BufferGeometry(); gDep.setAttribute('position', new T.BufferAttribute(dep, 3)); gDep.computeVertexNormals();
      const col = new Float32Array(dep.length), PITCH = 1.7659 + 0.2824, H = 1.7659;   // ring height and gap of this design
      for (let i = 0; i < dep.length; i += 3) {
        const y = dep[i + 1] + 5.8 + 0.25, k = Math.floor(y / PITCH), local = y - k * PITCH;
        const s = local > H ? 0.15 : 0.18 + 0.78 * Math.pow(Math.abs(local - H / 2) / (H / 2), 3);   // crowns sit at the ring ends
        turbo(s, C); col[i] = C.r; col[i + 1] = C.g; col[i + 2] = C.b;
      }
      gDep.setAttribute('color', new T.BufferAttribute(col, 3));
      stentDep = cadPart(gDep, { color: 0xffffff, metal: 0.25, vc: true, edgeAngle: 50 });
      stentDep.rotation.y = Math.PI / 2;                                 // the same turn that the roll-up gives the CAD stent
      stentDep.scale.setScalar(S); bio.add(stentDep);

      ves = mirror(mirror(ves, 0), 1); plq = mirror(mirror(plq, 0), 1);  // quarter models, axis along z (0 to 25 mm)
      const toY = a => { for (let i = 0; i < a.length; i += 3) { const z = a[i + 2] - 12.5; a[i + 2] = a[i + 1]; a[i + 1] = z; } return a; };
      toY(ves); toY(plq);
      const SA = S * 1.25;
      const gV = new T.BufferGeometry(); gV.setAttribute('position', new T.BufferAttribute(ves, 3)); gV.computeVertexNormals();
      vessel = cadPart(gV, { color: 0xffffff, side: T.BackSide, edgeAngle: 10 }); vessel.scale.setScalar(SA); bio.add(vessel);
      const gP = new T.BufferGeometry(); gP.setAttribute('position', new T.BufferAttribute(plq, 3)); gP.computeVertexNormals();
      plaque = cadPart(gP, { color: 0xc9c4bc, edgeAngle: 30 }); plaque.scale.setScalar(SA); bio.add(plaque);
      ready = true;
    })
    .catch(e => { console.error('pipeline: model load failed', e); ready = true; });

  let rollNow = -1;
  function rollTo(w) {   // w = 0: the flat pattern, facing the camera; w = 1: rolled into the tube
    const k = Math.max(1e-4, w) / R_MID, off = 1 / k - R_MID * w;
    for (let i = 0; i < rollBase.length; i += 3) {
      const s = rollBase[i], rr = 1 / k + rollBase[i + 2];
      rollPos[i] = rr * Math.sin(k * s); rollPos[i + 1] = rollBase[i + 1]; rollPos[i + 2] = off - rr * Math.cos(k * s);
    }
    const g = stentCad.userData.solid.geometry; g.attributes.position.needsUpdate = true; g.computeVertexNormals();
    for (let j = 0; j < edgePairs.length; j++) { const v = edgePairs[j] * 3; edgePos[j * 3] = rollPos[v]; edgePos[j * 3 + 1] = rollPos[v + 1]; edgePos[j * 3 + 2] = rollPos[v + 2]; }
    stentCad.userData.edges.geometry.attributes.position.needsUpdate = true;
  }

  function updateBio(q, a, dt, now) {
    bio.visible = a > 0.01; if (!bio.visible || !stentCad) return;
    const roll = reduce ? 1 : smooth(0.06, 0.28, q);                    // CAD: the flat pattern rolls into the stent
    const rq = Math.round(roll * 80) / 80; if (rq !== rollNow) { rollNow = rq; rollTo(rq); }
    const mesh = band(0.30, 0.34, 0.44, 0.48, q);                        // mesh
    const crimp = band(0.44, 0.50, 0.55, 0.60, q);                       // FEA: crimp, place, expand
    const swap = smooth(0.56, 0.61, q);
    const art = band(0.47, 0.53, 0.96, 1.0, q);
    stentCad.scale.set(S * (1 - 0.45 * crimp), S, S * (1 - 0.45 * crimp));
    look([stentCad], { alpha: a * (1 - swap), solid: 1, edges: 0.55 * (1 - mesh), wire: mesh });
    const grow = 0.55 + 0.45 * smooth(0.56, 0.64, q);
    stentDep.scale.set(S * grow, S, S * grow);
    look([stentDep], { alpha: a * swap * (1 - 0.7 * smooth(0.70, 0.76, q)), solid: 1, edges: 0.25 });
    look([vessel], { alpha: a * art, solid: 0.18, edges: 0.45 });
    look([plaque], { alpha: a * art * (1 - 0.75 * smooth(0.58, 0.66, q)), solid: 0.6, edges: 0.5 });
    const flow = band(0.70, 0.76, 0.95, 1.0, q) * a;                     // CFD: pulsatile flow in the opened lumen
    bioStreaks.m.opacity = flow; bioStreaks.line.visible = flow > 0.01;
    if (bioStreaks.line.visible) {
      const pulse = reduce ? 1 : 0.7 + 0.45 * Math.max(0, Math.sin(now * 0.0057));
      for (let i = 0; i < bioP.length; i++) {
        const p = bioP[i], u = 1.5 * (1 - p[1] * p[1]);
        if (!reduce) { p[0] += u * pulse * dt; if (p[0] > 6.5) p[0] -= 13; }
        const r = 1.08 * p[1];
        bioStreaks.set(i, F * r * Math.cos(p[2]), F * p[0], F * r * Math.sin(p[2]), 0, F * Math.max(0.04, 0.18 * u * pulse), 0, clamp(u / 1.6, 0, 1));
      }
      bioStreaks.done();
    }
    if (!reduce) {
      if (roll > 0.98 && q < 0.42) bio.rotation.y += dt * 0.25;
      else if (roll <= 0.98) bio.rotation.y = Math.atan2(Math.sin(bio.rotation.y), Math.cos(bio.rotation.y)) * 0.9;   // the flat sheet faces the camera
    }
  }

  // ── Chapter 2: quadcopter (simplified model). What I did: the CAD model,
  // an exploded view and a motion study. No flow is shown, because I did not
  // run CFD on it.
  const aero = new T.Group(); scene.add(aero);
  const aeroParts = [];
  function addAero(part, dir) { part.userData.base = part.position.clone(); part.userData.dir = new T.Vector3(...dir); aero.add(part); aeroParts.push(part); }
  {
    addAero(cadPart(new T.BoxGeometry(1.1, 0.32, 1.1, 2, 1, 2)), [0, 0, 0]);
    const top = cadPart(new T.CylinderGeometry(0.34, 0.42, 0.22, 24)); top.position.y = 0.27; addAero(top, [0, 1.1, 0]);
    for (let i = 0; i < 4; i++) {
      const ang = Math.PI / 4 + i * Math.PI / 2, ux = Math.cos(ang), uz = Math.sin(ang), cx = ux * 1.6, cz = uz * 1.6;
      const arm = cadPart(new T.CylinderGeometry(0.07, 0.07, 2.0, 10)); arm.rotation.z = Math.PI / 2; arm.rotation.y = -ang;
      arm.position.set(ux * 0.95, 0, uz * 0.95); addAero(arm, [ux * 0.55, 0, uz * 0.55]);
      const motor = cadPart(new T.CylinderGeometry(0.16, 0.16, 0.26, 18)); motor.position.set(cx, 0.1, cz); addAero(motor, [ux * 1.1, 0.45, uz * 1.1]);
      const prop = cadPart(new T.BoxGeometry(1.25, 0.02, 0.12)); prop.position.set(cx, 0.27, cz); prop.userData.spin = i % 2 ? 1 : -1; addAero(prop, [ux * 1.1, 1.3, uz * 1.1]);
      const leg = cadPart(new T.CylinderGeometry(0.03, 0.03, 0.5, 6)); leg.position.set(ux * 0.5, -0.38, uz * 0.5); addAero(leg, [ux * 0.3, -0.95, uz * 0.3]);
    }
  }
  function updateAero(q, a, dt) {
    aero.visible = a > 0.01; if (!aero.visible) return;
    look(aeroParts, { alpha: a, solid: 1, edges: 1 });
    const ex = reduce ? band(0.25, 0.26, 0.6, 0.61, q) : band(0.22, 0.38, 0.56, 0.70, q);   // exploded view
    const spin = smooth(0.66, 0.80, q);                                                       // motion study: the rotors turn
    for (const p of aeroParts) {
      p.position.copy(p.userData.base).addScaledVector(p.userData.dir, ex);
      if (p.userData.spin && !reduce) p.rotation.y += p.userData.spin * dt * (0.6 + 28 * spin);
    }
    if (!reduce) aero.rotation.y += dt * 0.18;
  }

  // ── Chapter 3: shell-and-tube heat exchanger (simplified model) ────────────
  const hx = new T.Group(); scene.add(hx);
  const hxBody = new T.Group(); hxBody.rotation.z = Math.PI / 2; hxBody.scale.setScalar(0.85); hx.add(hxBody);
  const HX_L = 6, HX_R = 1.0;
  const shell = cadPart(new T.CylinderGeometry(HX_R, HX_R, HX_L, 40, 1, true), { color: 0xffffff, side: T.DoubleSide, edgeAngle: 5 }); hxBody.add(shell);
  const heads = [];
  for (const s of [-1, 1]) {
    const h = cadPart(new T.SphereGeometry(HX_R, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2)); h.position.y = s * HX_L / 2; if (s < 0) h.rotation.x = Math.PI; hxBody.add(h); heads.push(h);
    const noz = cadPart(new T.CylinderGeometry(0.18, 0.18, 0.6, 16)); noz.position.set(0, s * (HX_L / 2 - 0.7), HX_R + 0.2); noz.rotation.x = Math.PI / 2; hxBody.add(noz); heads.push(noz);
  }
  const tubes = [], tubeCols = [];
  const TP = [[0, 0]];
  for (let i = 0; i < 6; i++) TP.push([0.38 * Math.cos(i * Math.PI / 3), 0.38 * Math.sin(i * Math.PI / 3)]);
  for (let i = 0; i < 12; i++) TP.push([0.72 * Math.cos(i * Math.PI / 6 + 0.26), 0.72 * Math.sin(i * Math.PI / 6 + 0.26)]);
  for (const [x, z] of TP) {
    const g = new T.CylinderGeometry(0.07, 0.07, HX_L, 10, 24);
    const pa = g.attributes.position, col = new Float32Array(pa.count * 3);
    for (let i = 0; i < pa.count; i++) { turbo(0.95 - 0.8 * (pa.getY(i) / HX_L + 0.5), C); col.set([C.r, C.g, C.b], i * 3); }
    const live = new Float32Array(col.length).fill(0.85);
    g.setAttribute('color', new T.BufferAttribute(live, 3));
    const t = cadPart(g, { color: 0xffffff, vc: true, edgeAngle: 60 }); t.position.set(x, 0, z); hxBody.add(t); tubes.push(t);
    tubeCols.push({ g, col, live });
  }
  const baffles = [];
  for (let b = 0; b < 5; b++) {
    const m = cadPart(new T.CircleGeometry(HX_R * 0.98, 40, 0, Math.PI * 1.45), { color: 0xeeeeec, side: T.DoubleSide, edgeAngle: 5 });
    m.rotation.x = Math.PI / 2; m.rotation.z = b % 2 ? 0 : Math.PI; m.position.y = -HX_L / 2 + (b + 1) * HX_L / 6; hxBody.add(m); baffles.push(m);
  }
  const hxStreaks = makeStreaks(Math.round(1800 * NS)); hxBody.add(hxStreaks.line);
  const hxP = []; for (let i = 0; i < hxStreaks.n; i++) hxP.push([Math.random() * HX_L, Math.random() * Math.PI * 2, 0.15 + Math.random() * 0.75]);
  let hxColNow = -1;
  function updateHx(q, a, dt) {
    hx.visible = a > 0.01; if (!hx.visible) return;
    const mesh = band(0.30, 0.36, 0.48, 0.54, q), heat = smooth(0.55, 0.65, q);
    look([shell], { alpha: a, solid: 0.12, edges: 0.6 });
    look(heads, { alpha: a, solid: 0.2, edges: 0.8 });
    look(baffles, { alpha: a, solid: 0.35, edges: 0.7, wire: mesh });
    look(tubes, { alpha: a, solid: 1, edges: 0.4 * (1 - mesh), wire: mesh });
    const hq = Math.round(heat * 30) / 30;
    if (hq !== hxColNow) {
      hxColNow = hq;
      for (const t of tubeCols) { for (let j = 0; j < t.live.length; j++) t.live[j] = lerp(0.85, t.col[j], hq); t.g.attributes.color.needsUpdate = true; }
    }
    const flow = band(0.62, 0.70, 0.95, 1.0, q) * a;
    hxStreaks.m.opacity = flow; hxStreaks.line.visible = flow > 0.01;
    if (hxStreaks.line.visible) {
      const pitch = HX_L / 6;
      for (let i = 0; i < hxP.length; i++) {
        const p = hxP[i]; if (!reduce) { p[0] += 0.9 * dt; if (p[0] > HX_L) p[0] -= HX_L; }
        const y = HX_L / 2 - p[0], k = Math.floor(p[0] / pitch), f = (p[0] % pitch) / pitch, dir = k % 2 ? 1 : -1;
        const x = dir * Math.cos(f * Math.PI) * 0.75 * p[2], z = Math.sin(p[1]) * 0.85 * p[2];   // shell-side flow weaves round the baffles
        hxStreaks.set(i, x, y, z, -0.12 * Math.sin(f * Math.PI) * dir, -0.16, 0, 0.12 + 0.6 * (p[0] / HX_L));
      }
      hxStreaks.done();
    }
    if (!reduce) hx.rotation.y += dt * 0.15;
  }

  // ── Chapter 4: mixing elbow with a swirler (simplified model) ──────────────
  const mix = new T.Group(); scene.add(mix);
  const ER = 1.6, PR = 0.42;
  const elbowPath = new T.CurvePath();
  elbowPath.add(new T.LineCurve3(new T.Vector3(-3.4, ER, 0), new T.Vector3(0, ER, 0)));
  const arcPts = []; for (let i = 0; i <= 24; i++) { const t = (i / 24) * Math.PI / 2; arcPts.push(new T.Vector3(ER * Math.sin(t), ER * Math.cos(t), 0)); }
  elbowPath.add(new T.CatmullRomCurve3(arcPts));
  elbowPath.add(new T.LineCurve3(new T.Vector3(ER, 0, 0), new T.Vector3(ER, -2.6, 0)));
  const pipe = cadPart(new T.TubeGeometry(elbowPath, 120, PR, 28, false), { color: 0xffffff, side: T.DoubleSide, edgeAngle: 8 }); mix.add(pipe);
  const branch = cadPart(new T.CylinderGeometry(0.2, 0.2, 1.5, 18, 1, true), { color: 0xffffff, side: T.DoubleSide, edgeAngle: 8 });
  branch.position.set(-1.5, ER + 0.95, 0); mix.add(branch);
  const vanes = [];
  for (let i = 0; i < 4; i++) {
    const v = cadPart(new T.BoxGeometry(0.5, 0.025, 0.36)); v.position.set(-0.8, ER, 0);
    v.rotation.x = i * Math.PI / 4; v.rotation.y = 0.5; mix.add(v); vanes.push(v);
  }
  const mixStreaks = makeStreaks(Math.round(2200 * NS)); mix.add(mixStreaks.line);
  const mixBody = new T.Group(); mixBody.position.set(0.75, -0.55, 0); mixBody.scale.setScalar(0.85);   // centre the elbow on the axis of turn
  [...mix.children].forEach(o => mixBody.add(o)); mix.add(mixBody);
  const mixP = []; for (let i = 0; i < mixStreaks.n; i++) mixP.push([Math.random(), Math.random() * Math.PI * 2, Math.sqrt(Math.random()) * 0.85, i % 3 === 0 ? 1 : 0]);
  const tmpV = new T.Vector3(), tanV = new T.Vector3();
  const PL = elbowPath.getLength(), SJ = 1.9 / PL, SW = 2.6 / PL;   // where the branch joins, and where the swirler sits
  function updateMix(q, a, dt) {
    mix.visible = a > 0.01; if (!mix.visible) return;
    const mesh = band(0.30, 0.36, 0.48, 0.54, q);
    look([pipe, branch], { alpha: a, solid: 0.14, edges: 0.55, wire: mesh });
    look(vanes, { alpha: a, solid: 1, edges: 1 });
    const flow = band(0.55, 0.63, 0.95, 1.0, q) * a;
    mixStreaks.m.opacity = flow; mixStreaks.line.visible = flow > 0.01;
    if (mixStreaks.line.visible) {
      for (let i = 0; i < mixP.length; i++) {
        const p = mixP[i];
        if (!reduce) { p[0] += 0.16 * dt; if (p[0] > 1) p[0] -= 1; }
        const s = p[0];
        tmpV.copy(elbowPath.getPointAt(s)); elbowPath.getTangentAt(s, tanV);   // r128 CurvePath ignores a target vector here
        if (p[3] && s < SJ) {                                             // stream B comes down the branch
          const rb = p[2] * 0.17;
          mixStreaks.set(i, -1.5 + rb * Math.cos(p[1]), ER + 1.7 * (1 - s / SJ), rb * Math.sin(p[1]), 0, -0.16, 0, 0.92);
          continue;
        }
        const swirl = p[1] + Math.max(0, s - SW) * 14, r = p[2] * PR * 0.9;   // the swirler turns the flow
        const nx = -tanV.y, ny = tanV.x;
        const x = tmpV.x + nx * r * Math.cos(swirl), y = tmpV.y + ny * r * Math.cos(swirl), z = r * Math.sin(swirl);
        const t = lerp(p[3] ? 0.92 : 0.08, 0.5, smooth(SW, 0.9, s));      // the two streams blend downstream
        mixStreaks.set(i, x, y, z, tanV.x * 0.16, tanV.y * 0.16, 0, t);
      }
      mixStreaks.done();
    }
    if (!reduce) mix.rotation.y += dt * 0.14;
  }

  // ── Scroll, panels, HUD ────────────────────────────────────────────────────
  const CH = [
    { domain: 'Biomedical', geo: 'The real StentForge stent. The artery and plaque are scaled to fit.', methods: [0, 1, 2, 3] },
    { domain: 'Aerospace and UAVs', geo: 'A simplified quadcopter model', methods: [0] },
    { domain: 'Thermal', geo: 'A simplified heat exchanger model', methods: [0, 1, 3] },
    { domain: 'Process', geo: 'A simplified mixing elbow model', methods: [0, 1, 3] },
  ];
  let target = 0, prog = 0, active = -1;
  function readScroll() { const r = section.getBoundingClientRect(); target = clamp(-r.top / (section.offsetHeight - window.innerHeight), 0, 1); }
  window.addEventListener('scroll', readScroll, { passive: true }); readScroll(); prog = target;

  function setPanel(p) {
    let idx = 0; while (idx < WIN.length - 2 && p >= WIN[idx + 1]) idx++;
    if (idx === active) return; active = idx;
    panels.forEach((el, i) => el.classList.toggle('is-on', i === idx));
    section.classList.toggle('past-intro', idx > 0 && idx < 5);
    railItems.forEach((li, i) => { li.classList.toggle('is-on', i + 1 === idx); li.classList.toggle('is-done', i + 1 < idx); });
    const c = CH[idx - 1];
    if (c) { if (hudDomain) hudDomain.textContent = c.domain; if (hudGeo) hudGeo.textContent = c.geo; }
  }
  function setMethod(ch, q) {   // which pass is on screen: 0 CAD, 1 mesh, 2 FEA, 3 CFD
    const m = ch === 1 ? 0 : ch === 0 ? (q < 0.3 ? 0 : q < 0.46 ? 1 : q < 0.70 ? 2 : 3) : (q < 0.3 ? 0 : q < 0.55 ? 1 : 3);
    methodItems.forEach((li, i) => { li.classList.toggle('is-on', i === m); li.classList.toggle('is-used', CH[ch].methods.includes(i)); });
    return m;
  }

  // ── Camera: each chapter frames its model at the origin ────────────────────
  const KEYS = [
    { pos: [7.0, 4.6, 16.5], look: [0, -0.35, 0] },
    { pos: [5.5, 5.5, 14.0], look: [0, -0.4, 0] },
    { pos: [6.0, 4.0, 15.5], look: [0, 0, 0] },
    { pos: [5.0, 4.5, 15.0], look: [0, -0.2, 0] },
  ];
  const camPos = new T.Vector3(...KEYS[0].pos), camLook = new T.Vector3(), vT = new T.Vector3(), vL = new T.Vector3();
  const FEA_POS = new T.Vector3(1.2, 2.4, 19.5), CFD_POS = new T.Vector3(-2.8, 1.4, 13.5), OUT_POS = new T.Vector3(0, 4.0, 19.5);
  let narrow = false;
  function frameCamera(ch, q, p, now, raw) {
    vT.fromArray(KEYS[ch].pos); vL.fromArray(KEYS[ch].look);
    if (ch === 0 && p >= WIN[1]) { vT.lerp(FEA_POS, smooth(0.44, 0.56, q)); vT.lerp(CFD_POS, smooth(0.68, 0.78, q)); }
    if (p >= WIN[5]) { vT.copy(OUT_POS); vL.set(0, 0, 0); }
    if (narrow) vT.multiplyScalar(1.35);
    const k = reduce ? 1 : 1 - Math.exp(-raw * 5);   // time-based, so slow devices keep up
    camPos.lerp(vT, k); camLook.lerp(vL, k);
    const drift = reduce ? 0 : Math.sin(now * 0.00018) * 0.3;
    camera.position.set(camPos.x + drift + pointer.x * 0.6, camPos.y + pointer.y * 0.35, camPos.z);
    camera.lookAt(camLook);
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    narrow = w <= 820;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, narrow ? 1.5 : 1.75));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    setOffset(true);
  }
  let offY = 0.3;   // phones: the model sits higher while the hero text is on screen
  function setOffset(force) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!narrow) { if (force) { camera.setViewOffset(w, h, -w * 0.2, h * 0.04, w, h); camera.updateProjectionMatrix(); } return; }
    const want = prog < WIN[1] ? 0.3 : prog >= WIN[5] ? 0.22 : 0.12;
    if (!force && Math.abs(want - offY) < 0.002) return;
    offY = force ? want : offY + (want - offY) * 0.12;
    camera.setViewOffset(w, h, 0, h * offY, w, h); camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); resize();
  const pointer = { x: 0, y: 0 };
  if (!reduce) window.addEventListener('pointermove', e => { pointer.x = e.clientX / innerWidth - 0.5; pointer.y = -(e.clientY / innerHeight - 0.5); }, { passive: true });

  let visible = true;
  if ('IntersectionObserver' in window) new IntersectionObserver(es => es.forEach(e => { visible = e.isIntersecting; })).observe(section);

  const chapters = [updateBio, updateAero, updateHx, updateMix];
  const groups = [bio, aero, hx, mix];
  const GALLERY = [[-1.7, 1.35], [1.8, 1.35], [-1.7, -1.45], [1.8, -1.45]];   // two by two, right of the text
  let last = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible || !ready) { last = now; return; }
    const raw = Math.min(0.5, (now - last) / 1000), dt = Math.min(0.05, raw); last = now;
    prog += (target - prog) * (reduce ? 1 : 1 - Math.exp(-raw * 7));
    const p = prog; setPanel(p);

    const outro = smooth(WIN[5], WIN[5] + 0.04, p);
    let chIdx = 0;
    for (let c = 0; c < 4; c++) {
      const s = WIN[c + 1], e = WIN[c + 2], q = clamp((p - s) / (e - s), 0, 1);
      if (p >= s && p < e) chIdx = c;
      const g = groups[c];
      if (outro > 0) {   // the outro lines every model up, plain CAD look
        const gk = narrow ? 0.7 : 1; g.position.set(GALLERY[c][0] * gk * outro, GALLERY[c][1] * gk * outro, 0); g.scale.setScalar(lerp(1, 0.4 * gk, outro));
        chapters[c](c === 0 ? 0.29 : 0.1, outro, dt, now);
      } else {
        g.position.set(0, 0, 0); g.scale.setScalar(1);
        const a = c === 0 ? 1 - smooth(e - 0.02, e + 0.012, p) : smooth(s - 0.012, s + 0.02, p) * (1 - smooth(e - 0.02, e + 0.012, p));
        chapters[c](c === 0 && p < WIN[1] ? 0 : q, a, dt, now);   // the intro shows the flat pattern
      }
    }
    if (p >= WIN[5]) chIdx = 3;
    const qActive = clamp((p - WIN[chIdx + 1]) / (WIN[chIdx + 2] - WIN[chIdx + 1]), 0, 1);
    const m = p >= WIN[1] && p < WIN[5] ? setMethod(chIdx, qActive) : -1;

    if (legend) {
      const on = ((m === 2 && qActive > 0.56) || m === 3) && outro === 0;
      legend.classList.toggle('is-on', on);
      const mode = !on ? '' : m === 2 ? 'strain' : chIdx === 2 ? 'temp' : chIdx === 3 ? 'mix' : 'flow';
      if (mode && legend.dataset.mode !== mode) {
        legend.dataset.mode = mode;
        legendTitle.textContent = { strain: 'Plastic strain (illustration)', flow: 'Flow speed (illustration)', temp: 'Temperature (illustration)', mix: 'Mixture fraction (illustration)' }[mode];
        legendLo.textContent = { strain: 'low', flow: 'slow', temp: 'cold', mix: 'stream A' }[mode];
        legendHi.textContent = { strain: 'high', flow: 'fast', temp: 'hot', mix: 'stream B' }[mode];
      }
    }
    setOffset(false);
    frameCamera(chIdx, qActive, p, now, raw);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
})();
