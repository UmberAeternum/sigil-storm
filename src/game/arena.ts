import * as THREE from 'three';
import { CFG, COL } from './state';
import {
  fresnelShell, makeHalo, portalSwirlMaterial, moodSky, runeCircleTexture, tickFresnel, softGlowTexture,
  plasmaMaterial, beamMaterial, type SkyUniforms,
} from './glow';

export interface Arena {
  world: THREE.Group;
  core: THREE.Group;
  coreCrystal: THREE.Mesh;
  hpRing: THREE.Mesh;
  portal: THREE.Group;
  portalMat: THREE.ShaderMaterial;
  portalSurge: { value: number };
  rackAnchors: THREE.Vector3[];
  startOrb: THREE.Mesh;
  restartOrb: THREE.Mesh;
  runes: THREE.Mesh;
  rim: THREE.Mesh;
  skyUniforms: SkyUniforms;
  lights: {
    hemi: THREE.HemisphereLight;
    coreLight: THREE.PointLight;
    portalLight: THREE.PointLight;
    accentLight: THREE.PointLight;
  };
  fresnels: THREE.Mesh[];
  update(t: number, slowActive: boolean, hpFrac?: number): void;
}

export function buildArena(scene: THREE.Scene, envMap: THREE.Texture): Arena {
  const world = new THREE.Group(); // shaken for impact juice
  scene.add(world);

  // ── mood sky dome (nebula + twin starfields, driven by the director) ──────
  const sky = moodSky();
  world.add(sky.mesh);

  // ── starfield + dust (soft round sprites now) ──────────────────────────────
  const starGeo = new THREE.BufferGeometry();
  const starN = 650;
  const starPos = new Float32Array(starN * 3);
  for (let i = 0; i < starN; i++) {
    const r = 16 + Math.random() * 18;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(Math.random() * 1.6 - 0.8);
    starPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    starPos[i * 3 + 1] = Math.abs(r * Math.cos(ph)) * 0.8 - 2;
    starPos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xa99ce0, size: 0.06, sizeAttenuation: true,
    transparent: true, opacity: 0.85, depthWrite: false,
    map: softGlowTexture(),
    blending: THREE.AdditiveBlending,
  }));
  world.add(stars);

  const dustGeo = new THREE.BufferGeometry();
  const dustN = 220;
  const dustPos = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 3.4;
    dustPos[i * 3 + 1] = 0.3 + Math.random() * 2.0;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * 3.4 - 0.6;
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0x8a7fd0, size: 0.02, sizeAttenuation: true,
    transparent: true, opacity: 0.5, depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  world.add(dust);

  // ── stone altar: dark PBR disc + emissive rune circle ─────────────────────
  const altar = new THREE.Mesh(
    new THREE.CylinderGeometry(1.7, 1.95, 0.16, 48, 1),
    new THREE.MeshStandardMaterial({
      color: 0x1c1830, roughness: 0.38, metalness: 0.25,
      envMap, envMapIntensity: 0.7,
    }),
  );
  altar.position.set(0, -0.14, -0.4);
  world.add(altar);
  const runes = new THREE.Mesh(
    new THREE.RingGeometry(1.05, 1.62, 48),
    new THREE.MeshBasicMaterial({
      map: runeCircleTexture(), color: 0x9682ff, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  runes.rotation.x = -Math.PI / 2;
  runes.position.set(0, -0.055, -0.4);
  world.add(runes);

  // ── under-island halo: the altar floats on a slow magic circle ────────────
  const underHalo = new THREE.Mesh(
    new THREE.PlaneGeometry(7.4, 7.4),
    new THREE.MeshBasicMaterial({
      map: runeCircleTexture(), color: 0x4a3f8f, transparent: true, opacity: 0.14,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  underHalo.rotation.x = -Math.PI / 2;
  underHalo.position.set(0, -1.15, -0.4);
  world.add(underHalo);

  // ── the core crystal: faceted shell over living plasma + orbit motes ──────
  const core = new THREE.Group();
  core.position.copy(CFG.corePos);
  world.add(core);
  const crystalGeo = new THREE.OctahedronGeometry(0.16);
  const coreCrystal = new THREE.Mesh(
    crystalGeo,
    new THREE.MeshPhysicalMaterial({
      color: 0xbfe9ff, roughness: 0.06, metalness: 0,
      envMap, envMapIntensity: 2.4,
      clearcoat: 1, clearcoatRoughness: 0.08,
      emissive: COL.core, emissiveIntensity: 1.2,
      transparent: true, opacity: 0.72,
    }),
  );
  coreCrystal.scale.y = 1.75;
  core.add(coreCrystal);
  const corePlasmaMat = plasmaMaterial(new THREE.Color('#4fb0ff'), new THREE.Color('#d9f6ff'));
  const corePlasma = new THREE.Mesh(new THREE.OctahedronGeometry(0.115), corePlasmaMat);
  corePlasma.scale.y = 1.75;
  core.add(corePlasma);
  const coreShell = fresnelShell(crystalGeo, COL.core, { power: 2.0, intensity: 2.2, scale: 1.5 });
  coreShell.scale.y = 1.75 * 1.5;
  core.add(coreShell);
  const coreHalo = makeHalo(COL.core, 0.85, 0.4);
  core.add(coreHalo);
  const coreLight = new THREE.PointLight(COL.core, 2.4, 6);
  core.add(coreLight);

  // two crossed light shafts rising from the pedestal
  const shaftMat = beamMaterial(COL.core.clone());
  shaftMat.uniforms.uOpacity.value = 0.3;
  const shaftGeo = new THREE.PlaneGeometry(0.5, 1.7);
  const shaftA = new THREE.Mesh(shaftGeo, shaftMat);
  shaftA.position.y = -0.1;
  const shaftB = new THREE.Mesh(shaftGeo, shaftMat);
  shaftB.position.y = -0.1;
  shaftB.rotation.y = Math.PI / 2;
  core.add(shaftA, shaftB);

  // three motes orbiting the crystal on tilted rings
  const motes: THREE.Sprite[] = [];
  for (let i = 0; i < 3; i++) {
    const m = makeHalo(i === 1 ? COL.nova : COL.core, 0.07, 0.9);
    core.add(m);
    motes.push(m);
  }

  const hpRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.3, 0.016, 8, 48),
    new THREE.MeshBasicMaterial({ color: 0x7ef0c2 }),
  );
  hpRing.rotation.x = Math.PI / 2;
  hpRing.position.y = -0.03;
  core.add(hpRing);

  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.12, 0.34, 6),
    new THREE.MeshStandardMaterial({ color: 0x241f42, roughness: 0.3, metalness: 0.5, envMap, envMapIntensity: 0.9 }),
  );
  pedestal.position.y = -0.33;
  core.add(pedestal);

  // ── spawn portal: layered vortex + corona + fresnel rings ─────────────────
  const portal = new THREE.Group();
  portal.position.copy(CFG.portalPos);
  portal.lookAt(CFG.corePos.x, CFG.portalPos.y, CFG.corePos.z);
  world.add(portal);
  const portalMat = portalSwirlMaterial(new THREE.Color('#ff5470'), new THREE.Color('#b36bff'));
  const portalDisc = new THREE.Mesh(new THREE.CircleGeometry(0.8, 48), portalMat);
  portal.add(portalDisc);
  const coronaMat = portalSwirlMaterial(new THREE.Color('#7a2246'), new THREE.Color('#4a2a7f'));
  const portalCorona = new THREE.Mesh(new THREE.CircleGeometry(1.25, 48), coronaMat);
  portalCorona.position.z = -0.02;
  portal.add(portalCorona);
  const ringGeo = new THREE.TorusGeometry(0.85, 0.045, 12, 64);
  const ring1 = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({
    color: 0x3a1030, roughness: 0.25, metalness: 0.85, envMap, envMapIntensity: 1.4,
    emissive: COL.wisp, emissiveIntensity: 0.55,
  }));
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.026, 10, 48), new THREE.MeshBasicMaterial({ color: 0xb36bff, transparent: true, opacity: 0.8 }));
  portal.add(ring1, ring2);
  const portalHalo = makeHalo(COL.wisp, 3.2, 0.3);
  portal.add(portalHalo);
  const portalLight = new THREE.PointLight(COL.wisp, 1.5, 11);
  portalLight.position.copy(CFG.portalPos);
  world.add(portalLight);

  // ── ember field: scattered "bubble homes" + faint nesting rings ───────────
  const rackAnchors: THREE.Vector3[] = [];
  const anchorGeo = new THREE.TorusGeometry(0.062, 0.008, 8, 24);
  for (let i = 0; i < CFG.rackCount; i++) {
    const base = ((-CFG.rackSpreadDeg / 2) + (CFG.rackSpreadDeg * i) / (CFG.rackCount - 1)) * (Math.PI / 180);
    const a = base + (Math.random() - 0.5) * 0.42;
    const r = CFG.rackRadius * (0.85 + Math.random() * 0.35);
    const p = new THREE.Vector3(
      Math.sin(a) * r,
      CFG.rackHeight + (Math.random() - 0.5) * 0.3,
      -Math.cos(a) * r - Math.random() * 0.12,
    );
    rackAnchors.push(p);
    const anchor = new THREE.Mesh(anchorGeo, new THREE.MeshBasicMaterial({
      color: 0x6a5cd0, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending,
    }));
    anchor.position.copy(p);
    anchor.rotation.x = Math.random() * Math.PI;
    anchor.rotation.y = Math.random() * Math.PI;
    world.add(anchor);
  }

  // ── menu / restart orbs with halos ─────────────────────────────────────────
  const orbGeo = new THREE.SphereGeometry(0.07, 24, 16);
  const startOrb = new THREE.Mesh(orbGeo, new THREE.MeshStandardMaterial({
    color: 0x123b2c, roughness: 0.15, metalness: 0.1, envMap, envMapIntensity: 1.6,
    emissive: COL.runeOk, emissiveIntensity: 1.6,
  }));
  startOrb.add(fresnelShell(orbGeo, COL.runeOk, { power: 2.2, intensity: 2.0 }));
  startOrb.add(makeHalo(COL.runeOk, 0.5, 0.6));
  startOrb.position.set(0, 0.9, -0.7);
  startOrb.scale.setScalar(1.4);
  world.add(startOrb);
  const restartOrb = new THREE.Mesh(orbGeo, new THREE.MeshStandardMaterial({
    color: 0x3b2a12, roughness: 0.15, metalness: 0.1, envMap, envMapIntensity: 1.6,
    emissive: COL.ember, emissiveIntensity: 1.6,
  }));
  restartOrb.add(fresnelShell(orbGeo, COL.ember, { power: 2.2, intensity: 2.0 }));
  restartOrb.add(makeHalo(COL.ember, 0.5, 0.6));
  restartOrb.position.set(0, 0.9, -0.7);
  restartOrb.scale.setScalar(1.4);
  restartOrb.visible = false;
  world.add(restartOrb);

  // ── lights ─────────────────────────────────────────────────────────────────
  const hemi = new THREE.HemisphereLight(0x8a7fd0, 0x1a1430, 1.05);
  scene.add(hemi);
  const accentLight = new THREE.PointLight(0x8f7bff, 1.6, 9);
  scene.add(accentLight);

  scene.fog = new THREE.FogExp2(0x05060d, 0.04);

  const fresnels = [coreShell];

  const update = (t: number, slowActive: boolean, hpFrac = 1): void => {
    coreCrystal.rotation.y = t * 0.8;
    coreCrystal.rotation.x = Math.sin(t * 0.6) * 0.2;
    const pulse = 1 + Math.sin(t * 3) * 0.06;
    coreCrystal.scale.set(pulse, 1.75 * pulse, pulse);
    corePlasma.rotation.y = -t * 1.3;
    corePlasmaMat.uniforms.uTime.value = t;
    corePlasmaMat.uniforms.uBoost.value = 0.55 + 0.45 * hpFrac;
    corePlasma.scale.set(pulse, 1.75 * pulse, pulse);
    coreHalo.material.opacity = (0.32 + Math.abs(Math.sin(t * 2.4)) * 0.16) * (0.5 + 0.5 * hpFrac);
    coreLight.intensity = 2.4 * (0.55 + 0.45 * hpFrac);
    shaftMat.uniforms.uTime.value = t;
    shaftMat.uniforms.uOpacity.value = 0.12 + 0.22 * hpFrac + Math.sin(t * 1.7) * 0.04;
    shaftA.rotation.y = t * 0.35;
    shaftB.rotation.y = t * 0.35 + Math.PI / 2;
    for (let i = 0; i < motes.length; i++) {
      const a = t * (0.9 + i * 0.35) + i * 2.1;
      const r = 0.26 + i * 0.05;
      motes[i].position.set(Math.cos(a) * r, Math.sin(a * 1.3) * 0.12, Math.sin(a) * r * 0.6);
    }
    ring1.rotation.z = t * 0.55;
    ring1.rotation.y = Math.sin(t * 0.4) * 0.15;
    ring2.rotation.z = -t * 0.9;
    portalMat.uniforms.uTime.value = t;
    coronaMat.uniforms.uTime.value = -t * 0.8;
    coronaMat.uniforms.uSurge.value = portalMat.uniforms.uSurge.value;
    portalCorona.scale.setScalar(1 + portalMat.uniforms.uSurge.value * 0.08);
    underHalo.rotation.z = t * 0.05;
    dust.rotation.y = t * 0.012;
    stars.rotation.y = t * 0.004;
    startOrb.position.y = 0.9 + Math.sin(t * 2.2) * 0.02;
    startOrb.scale.setScalar(1.4 * (1 + Math.sin(t * 2.2) * 0.08));
    restartOrb.position.y = 0.9 + Math.sin(t * 2.6) * 0.025;
    restartOrb.scale.setScalar(1.4 * (1 + Math.sin(t * 2.6) * 0.1));
    for (const f of fresnels) tickFresnel(f, t);
    void slowActive;
  };

  return {
    world, core, coreCrystal, hpRing, portal, portalMat,
    portalSurge: portalMat.uniforms.uSurge as { value: number },
    rackAnchors, startOrb, restartOrb, runes, rim: runes,
    skyUniforms: sky.uniforms,
    lights: { hemi, coreLight, portalLight, accentLight },
    fresnels, update,
  };
}
