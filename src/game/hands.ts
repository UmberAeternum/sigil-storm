import * as THREE from 'three';
import { CFG, type GameState } from './state';
import type { Orbs, Orb } from './projectiles';
import type { GameAudio } from './audio';

export interface PinchContext {
  orbs: Orbs;
  audio: GameAudio;
  state(): GameState;
  /** Main checks menu/restart orbs first. Return true if the pinch was consumed. */
  onPinchStart(pos: THREE.Vector3): boolean;
  /** Stroke finished → main classifies and casts. Points are camera-plane 2D. */
  onStroke(points: { x: number; y: number }[]): void;
  onFist(): void;
  /** An ember was successfully grabbed (tutorial hook). */
  onGrab?(pos: THREE.Vector3): void;
  haptic(handIndex: number, intensity: number, ms: number): void;
}

const INK_POINTS = 128;

/**
 * One pinch channel (a VR hand, or the mouse in flat preview).
 * Pinch = grab an ember and throw it; pinch empty air = draw a rune stroke;
 * a closed fist = bullet time. All driven by positions fed once per frame.
 */
class PinchTracker {
  active = false;        // channel has tracking this frame
  pinching = false;
  wasPinching = false;
  readonly pos = new THREE.Vector3();
  private readonly prev = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();
  private readonly velSmooth = new THREE.Vector3();
  private grabbed: Orb | null = null;
  private readonly stroke: { x: number; y: number }[] = [];
  private readonly strokeWorld: THREE.Vector3[] = [];
  private fistTime = 0;
  private fistFired = false;
  private hapticHand = -1;
  /** Flat mode adds camera-forward to throws (mouse has no depth velocity). */
  forwardBias = 0;
  private readonly camForward = new THREE.Vector3(0, 0, -1);

  readonly inkGeo = new THREE.BufferGeometry();
  readonly inkLine: THREE.Line;

  constructor(scene: THREE.Scene, private ctx: PinchContext, private handIndex: number) {
    this.inkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(INK_POINTS * 3), 3));
    this.inkGeo.setDrawRange(0, 0);
    const mat = new THREE.LineBasicMaterial({
      color: 0x8f7bff, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.inkLine = new THREE.Line(this.inkGeo, mat);
    this.inkLine.frustumCulled = false;
    this.inkLine.visible = false;
    scene.add(this.inkLine);
  }

  /** Feed this frame's tracked pinch point (or null when tracking is lost). */
  feed(pos: THREE.Vector3 | null, pinching: boolean, dt: number, camera: THREE.Camera, s: GameState): void {
    this.active = pos !== null;
    if (!pos) {
      this.trackingLost();
      return;
    }
    this.prev.copy(this.pos);
    this.pos.copy(pos);
    if (this.wasPinching) {
      this.vel.copy(pos).sub(this.prev).divideScalar(Math.max(dt, 1e-4));
      this.velSmooth.lerp(this.vel, 0.45);
    }

    // pinch edge detection with hysteresis handled by the driver
    if (pinching && !this.wasPinching) this.pinchStart(camera, s);
    if (this.wasPinching && pinching) this.pinchHold(dt, camera);
    if (!pinching && this.wasPinching) this.pinchEnd(s);

    // fist → bullet time (tracked in the driver, trigger fires from here)
    this.wasPinching = pinching;
  }

  pinchStart(camera: THREE.Camera, _s: GameState): void {
    if (this.ctx.onPinchStart(this.pos)) {
      this.grabbed = null;
      this.clearStroke();
      return;
    }
    const orb = this.ctx.orbs.grabNearest(this.pos);
    if (orb) {
      this.grabbed = orb;
      this.clearStroke();
      this.ctx.haptic(this.hapticHand, 0.5, 30);
      this.ctx.onGrab?.(this.pos);
    } else {
      this.grabbed = null;
      this.stroke.length = 0;
      this.strokeWorld.length = 0;
      this.pushStrokePoint(camera);
      this.inkLine.visible = true;
    }
  }

  pinchHold(dt: number, camera: THREE.Camera): void {
    camera.getWorldDirection(this.camForward);
    if (this.grabbed) {
      // spring the orb to the pinch point; its velocity becomes the throw impulse
      const o = this.grabbed;
      o.vel.copy(this.pos).sub(o.mesh.position).multiplyScalar(26);
      if (o.vel.length() > 14) o.vel.setLength(14);
      o.mesh.position.addScaledVector(o.vel, dt);
      return;
    }
    if (this.strokeWorld.length > 0) {
      const last = this.strokeWorld[this.strokeWorld.length - 1];
      if (last.distanceTo(this.pos) > 0.009 && this.strokeWorld.length < CFG.strokeMaxPoints) {
        this.pushStrokePoint(camera);
      }
    }
  }

  pinchEnd(s: GameState): void {
    if (this.grabbed) {
      const v = this.velSmooth.lengthSq() > 0.02 ? this.velSmooth : new THREE.Vector3(0, 0.2, -3);
      if (this.forwardBias > 0) {
        v.addScaledVector(this.camForward, v.length() * this.forwardBias);
      }
      this.ctx.orbs.release(this.grabbed, v, s);
      this.ctx.haptic(this.hapticHand, 0.35, 45);
      this.grabbed = null;
    } else if (this.stroke.length >= CFG.strokeMinPoints) {
      if (s.phase === 'playing' || s.phase === 'menu') {
        this.ctx.onStroke(this.stroke.map((p) => ({ x: p.x, y: p.y })));
      }
    }
    this.clearStroke();
  }

  /** Fist detection given the driver's per-frame fist metric (0..1). */
  feedFist(fist: number, dt: number, s: GameState): void {
    if (fist > 0.72 && s.phase === 'playing') {
      this.fistTime += dt;
      if (this.fistTime > CFG.fistHoldSec && !this.fistFired) {
        this.fistFired = true;
        this.ctx.onFist();
        this.ctx.haptic(this.hapticHand, 0.8, 90);
      }
    } else {
      this.fistTime = Math.max(0, this.fistTime - dt * 2);
      if (fist < 0.5) this.fistFired = false;
    }
  }

  trackingLost(): void {
    if (this.grabbed) {
      this.ctx.orbs.cancel(this.grabbed);
      this.grabbed = null;
    }
    this.clearStroke();
    this.wasPinching = false;
    this.pinching = false;
    this.active = false;
  }

  private pushStrokePoint(camera: THREE.Camera): void {
    this.strokeWorld.push(this.pos.clone());
    // project into camera plane: camera-space x/y gives a natural drawing surface
    const p = this.pos.clone().applyMatrix4(camera.matrixWorldInverse);
    this.stroke.push({ x: p.x, y: p.y });
    const n = this.strokeWorld.length;
    const attr = this.inkGeo.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < n && i < INK_POINTS; i++) {
      arr[i * 3] = this.strokeWorld[i].x;
      arr[i * 3 + 1] = this.strokeWorld[i].y;
      arr[i * 3 + 2] = this.strokeWorld[i].z;
    }
    attr.needsUpdate = true;
    this.inkGeo.setDrawRange(0, Math.min(n, INK_POINTS));
  }

  private clearStroke(): void {
    this.stroke.length = 0;
    this.strokeWorld.length = 0;
    this.inkGeo.setDrawRange(0, 0);
    this.inkLine.visible = false;
  }

  setHapticHand(i: number): void { this.hapticHand = i; }
}

function jointWorld(hand: THREE.Group, name: string, out: THREE.Vector3): boolean {
  const joints = (hand as unknown as { joints?: Record<string, THREE.Object3D> }).joints;
  const j = joints?.[name] ?? hand.getObjectByName(name);
  if (!j) return false;
  j.getWorldPosition(out);
  return true;
}

export class Hands {
  private readonly trackers: PinchTracker[];
  private readonly handGroups: THREE.Group[] = [];
  private readonly thumb = new THREE.Vector3();
  private readonly index = new THREE.Vector3();
  private readonly mid = new THREE.Vector3();
  private readonly wrist = new THREE.Vector3();
  private readonly tip = new THREE.Vector3();

  constructor(
    private renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    private ctx: PinchContext,
  ) {
    this.trackers = [new PinchTracker(scene, ctx, 0), new PinchTracker(scene, ctx, 1)];
    for (let i = 0; i < 2; i++) {
      const hand = renderer.xr.getHand(i);
      hand.addEventListener('connected', (ev) => {
        const src = (ev as unknown as { data: XRInputSource }).data;
        const h = src?.handedness === 'left' ? 0 : 1;
        this.trackers[i].setHapticHand(h);
        hand.userData.handedness = src?.handedness ?? '';
      });
      this.handGroups.push(hand);
      scene.add(hand);
    }
  }

  /** haptics through the session input sources (hand or controller). */
  haptic(handIndex: number, intensity: number, ms: number): void {
    const session = this.renderer.xr.getSession();
    if (!session) return;
    for (const src of session.inputSources) {
      if (!src.gamepad) continue;
      const handed = src.handedness === 'left' ? 0 : 1;
      if (handed !== handIndex) continue;
      try { void src.gamepad.hapticActuators?.[0]?.pulse(intensity, ms); } catch { /* haptics optional */ }
    }
  }

  update(dt: number, camera: THREE.Camera, s: GameState): void {
    const xr = this.renderer.xr;
    for (let i = 0; i < 2; i++) {
      const tracker = this.trackers[i];
      const hand = this.handGroups[i];
      const t = xr.isPresenting && jointWorld(hand, 'thumb-tip', this.thumb)
        && jointWorld(hand, 'index-finger-tip', this.index)
        ? true : false;
      if (!t) {
        tracker.feed(null, false, dt, camera, s);
        tracker.feedFist(0, dt, s);
        continue;
      }
      this.mid.copy(this.thumb).add(this.index).multiplyScalar(0.5);
      const d = this.thumb.distanceTo(this.index);
      // hysteresis: close at 2.0 cm, open at 3.2 cm
      if (!tracker.pinching && d < CFG.pinchOn) tracker.pinching = true;
      else if (tracker.pinching && d > CFG.pinchOff) tracker.pinching = false;
      tracker.feed(this.mid, tracker.pinching, dt, camera, s);

      // fist metric: mean finger-tip curl toward the wrist
      if (jointWorld(hand, 'wrist', this.wrist)) {
        let acc = 0; let n = 0;
        for (const name of ['middle-finger-tip', 'ring-finger-tip', 'pinky-finger-tip']) {
          if (jointWorld(hand, name, this.tip)) {
            acc += this.tip.distanceTo(this.wrist);
            n += 1;
          }
        }
        const avg = n ? acc / n : 1;
        const fist = THREE.MathUtils.clamp(1 - (avg - 0.055) / 0.075, 0, 1);
        tracker.feedFist(fist, dt, s);
      } else {
        tracker.feedFist(0, dt, s);
      }
    }
  }

  /** Pinch-point probes for menu orbs (either hand). */
  pinchPositions(out: (THREE.Vector3 | null)[]): void {
    out[0] = this.trackers[0].active ? this.trackers[0].pos : null;
    out[1] = this.trackers[1].active ? this.trackers[1].pos : null;
  }
}

/** Mouse driver for the flat preview — feeds the same PinchTracker pipeline. */
export class FlatInput {
  private readonly tracker: PinchTracker;
  private readonly ray = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly point = new THREE.Vector3();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 1.15);
  private readonly camPos = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private pinching = false;
  private readonly fistFake = { t: 0 };
  enabled = false;

  constructor(
    canvas: HTMLCanvasElement,
    scene: THREE.Scene,
    private getCamera: () => THREE.Camera,
    private orbs: Orbs,
    ctx: PinchContext,
  ) {
    this.tracker = new PinchTracker(scene, ctx, 0);
    this.tracker.setHapticHand(-1);
    this.tracker.forwardBias = 0.9;
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      this.updatePoint(e);
      this.pinching = true;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.enabled) return;
      this.updatePoint(e);
    });
    const end = () => { this.pinching = false; };
    window.addEventListener('pointerup', end);
    window.addEventListener('blur', end);
  }

  /**
   * The pinch point rides the pointer ray. Depth adapts: at an ember's depth
   * when one is under the cursor (so grabs connect), otherwise the 1.15 m
   * drawing plane.
   */
  private updatePoint(e: PointerEvent): void {
    const cam = this.getCamera() as THREE.PerspectiveCamera;
    this.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, cam);
    cam.getWorldPosition(this.camPos);
    cam.getWorldDirection(this.dir);
    let depth = 1.15;
    for (const o of this.orbs.pool) {
      if (!o.active || o.held) continue;
      if (this.ray.ray.distanceToPoint(o.mesh.position) < 0.2) {
        const along = this.ray.ray.direction.dot(this.tmpA.copy(o.mesh.position).sub(this.ray.ray.origin));
        if (along > 0.2) { depth = along; break; }
      }
    }
    this.plane.setFromNormalAndCoplanarPoint(this.dir, this.tmpB.copy(this.camPos).addScaledVector(this.dir, depth));
    if (!this.ray.ray.intersectPlane(this.plane, this.point)) {
      this.point.copy(this.camPos).addScaledVector(this.dir, depth);
    }
  }

  /** Keyboard 1/2/3 casts; Shift/F simulates the fist for bullet time. */
  update(dt: number, camera: THREE.Camera, s: GameState): void {
    this.tracker.feed(this.enabled ? this.point : null, this.enabled && this.pinching, dt, camera, s);
  }

  pinchPoint(): THREE.Vector3 | null {
    return this.enabled ? this.point : null;
  }

  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
}
