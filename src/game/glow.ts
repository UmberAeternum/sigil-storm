import * as THREE from 'three';

/**
 * The "Lumen" look: fresnel energy shells, halo billboards, soft particles,
 * a swirling portal shader and a mood-driven sky — all custom, zero assets.
 */

// ── soft radial glow texture (shared) ──────────────────────────────────────
let glowTex: THREE.Texture | null = null;
export function softGlowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.65)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.18)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

// ── fresnel energy shell (BackSide additive glow around any mesh) ──────────
const fresnelVert = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const fresnelFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uPower;
  uniform float uIntensity;
  uniform float uTime;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPower);
    float shimmer = 0.85 + 0.15 * sin(uTime * 5.0 + vN.y * 8.0);
    gl_FragColor = vec4(uColor * f * uIntensity * shimmer, f);
  }
`;

export function fresnelShell(geometry: THREE.BufferGeometry, color: THREE.Color, opts: { power?: number; intensity?: number; scale?: number } = {}): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color.clone() },
      uPower: { value: opts.power ?? 2.4 },
      uIntensity: { value: opts.intensity ?? 1.6 },
      uTime: { value: 0 },
    },
    vertexShader: fresnelVert,
    fragmentShader: fresnelFrag,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.scale.setScalar(opts.scale ?? 1.18);
  return mesh;
}

export function tickFresnel(mesh: THREE.Mesh, time: number): void {
  const mat = mesh.material as THREE.ShaderMaterial;
  if (mat.uniforms?.uTime) mat.uniforms.uTime.value = time;
}

// ── halo billboard (fake bloom that works on Quest) ────────────────────────
export function makeHalo(color: THREE.Color, size: number, opacity = 0.55): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({
    map: softGlowTexture(),
    color: color.clone(),
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(size);
  return s;
}

// ── swirling portal shader ─────────────────────────────────────────────────
export function portalSwirlMaterial(colorA: THREE.Color, colorB: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColorA: { value: colorA.clone() },
      uColorB: { value: colorB.clone() },
      uSurge: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uSurge;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
                   mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      void main() {
        vec2 c = vUv - 0.5;
        float r = length(c) * 2.0;
        float ang = atan(c.y, c.x);
        float swirl = noise(vec2(ang * 2.2 + r * 4.0 - uTime * 1.4, r * 6.0 - uTime * 0.9));
        float arms = 0.5 + 0.5 * sin(ang * 5.0 + r * 9.0 - uTime * 2.2);
        float core = smoothstep(0.85, 0.0, r);
        float edge = smoothstep(1.0, 0.82, r);
        vec3 col = mix(uColorA, uColorB, swirl * 0.85 + arms * 0.3);
        float energy = (0.35 * arms + 0.5 * swirl) * core + core * 0.35;
        energy *= edge * (0.75 + uSurge * 1.6);
        gl_FragColor = vec4(col * energy, energy);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

// ── mood sky: gradient dome tinted by the ambient director ─────────────────
export function moodSky(): { mesh: THREE.Mesh; uniforms: { top: { value: THREE.Color }; bottom: { value: THREE.Color }; horizon: { value: THREE.Color } } } {
  const uniforms = {
    top: { value: new THREE.Color('#0a0d22') },
    bottom: { value: new THREE.Color('#04050c') },
    horizon: { value: new THREE.Color('#2a1e52') },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 top;
      uniform vec3 bottom;
      uniform vec3 horizon;
      varying vec3 vPos;
      void main() {
        float h = normalize(vPos).y;
        vec3 col = mix(bottom, top, smoothstep(-0.15, 0.65, h));
        col += horizon * (1.0 - smoothstep(0.0, 0.38, abs(h + 0.02)));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(40, 24, 16), mat);
  return { mesh, uniforms };
}

// ── custom environment for PBR reflections (mood-matched, tiny) ────────────
export function buildMoodEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const panel = (color: number, intensity: number, w: number, h: number, x: number, y: number, z: number, ry = 0): void => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity) }),
    );
    m.position.set(x, y, z);
    m.rotation.y = ry;
    envScene.add(m);
  };
  panel(0x8f7bff, 3.2, 8, 4, 0, 6, -4);        // violet key from above
  panel(0xffb347, 1.6, 6, 3, -6, 1, 0, Math.PI / 2); // warm side
  panel(0xff5470, 1.1, 6, 3, 6, 0.5, 0, -Math.PI / 2); // crimson rim
  panel(0x1b1433, 1.0, 12, 12, 0, -4, 0, -Math.PI / 2); // dark floor bounce
  const tex = pmrem.fromScene(envScene, 0.08).texture;
  pmrem.dispose();
  return tex;
}

// ── procedural rune circle for the altar (emissive canvas) ─────────────────
export function runeCircleTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(150, 130, 255, 0.9)';
  g.lineWidth = 3;
  g.shadowColor = 'rgba(150, 130, 255, 1)';
  g.shadowBlur = 12;
  const circle = (r: number): void => {
    g.beginPath();
    g.arc(256, 256, r, 0, Math.PI * 2);
    g.stroke();
  };
  circle(236);
  circle(200);
  circle(150);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.beginPath();
    g.moveTo(256 + Math.cos(a) * 200, 256 + Math.sin(a) * 200);
    g.lineTo(256 + Math.cos(a) * 236, 256 + Math.sin(a) * 236);
    g.stroke();
  }
  // glyph marks
  g.font = '700 30px serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const glyphs = ['◆', '▲', '⬡', '✦', '◈', '✶'];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.26;
    g.fillStyle = i % 2 ? 'rgba(255, 179, 71, 0.95)' : 'rgba(150, 130, 255, 0.95)';
    g.fillText(glyphs[i], 256 + Math.cos(a) * 176, 256 + Math.sin(a) * 176);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
