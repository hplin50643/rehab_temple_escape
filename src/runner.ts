import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { RunnerAction } from './game';
export type { RunnerAction } from './game';

type Point = [number, number, number];
// Elevation, width, depth, displacement along the spine.
type Ring = [number, number, number, number?];
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;

/** All the differently coloured pieces of a moving bone share one draw call. */
class Sculpture {
  private pieces: THREE.BufferGeometry[] = [];

  private add(shape: THREE.BufferGeometry, color: string) {
    const geo = shape.index ? shape.toNonIndexed() : shape;
    if (geo !== shape) shape.dispose();
    for (const name of Object.keys(geo.attributes)) {
      if (name !== 'position' && name !== 'normal') geo.deleteAttribute(name);
    }
    const tint = new THREE.Color(color);
    const colors = new Float32Array(geo.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) tint.toArray(colors, i);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.pieces.push(geo);
  }

  form(rings: Ring[], color: string, offset: Point = [0, 0, 0], sides = 12) {
    const points: number[] = [];
    const faces: number[] = [];
    for (const [height, width, depth, shift = 0] of rings) {
      for (let j = 0; j < sides; j++) {
        const angle = (j + 0.5) / sides * TAU;
        points.push(offset[0] + width * Math.sin(angle), offset[1] + height, offset[2] + shift + depth * Math.cos(angle));
      }
    }
    for (let row = 0; row < rings.length - 1; row++) {
      for (let j = 0; j < sides; j++) {
        const a = row * sides + j, b = row * sides + (j + 1) % sides;
        faces.push(a, b, a + sides, b, b + sides, a + sides);
      }
    }
    const last = (rings.length - 1) * sides;
    for (let j = 1; j < sides - 1; j++) faces.push(0, j + 1, j, last, last + j, last + j + 1);
    const shape = new THREE.BufferGeometry();
    shape.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    shape.setIndex(faces);
    shape.computeVertexNormals();
    this.add(shape, color);
  }

  oval(center: Point, dimensions: Point, color: string, tilt = 0) {
    const shape = new THREE.SphereGeometry(1, 12, 7);
    shape.scale(...dimensions).rotateZ(tilt).translate(...center);
    this.add(shape, color);
  }

  box(center: Point, dimensions: Point, color: string, tilt = 0) {
    const shape = new THREE.BoxGeometry(...dimensions).rotateZ(tilt).translate(...center);
    this.add(shape, color);
  }

  rod(a: Point, b: Point, radius: number, color: string, endRadius = radius) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const axis = end.clone().sub(start);
    const orientation = new THREE.Quaternion().setFromUnitVectors(UP, axis.clone().normalize());
    const center = start.addScaledVector(axis, 0.5);
    const shape = new THREE.CylinderGeometry(endRadius, radius, axis.length(), 9);
    shape.applyQuaternion(orientation).translate(center.x, center.y, center.z);
    this.add(shape, color);
  }

  attach(parent: THREE.Object3D, at: Point, material: THREE.Material) {
    const merged = mergeGeometries(this.pieces)!;
    this.pieces.forEach(piece => piece.dispose());
    const joint = new THREE.Mesh(merged, material);
    joint.position.set(...at);
    joint.castShadow = true;
    parent.add(joint);
    return joint;
  }
}

function bone(parent: THREE.Object3D, at: Point, material: THREE.Material, sculpt: (part: Sculpture) => void) {
  const part = new Sculpture();
  sculpt(part);
  return part.attach(parent, at, material);
}

function disposeModel(root: THREE.Object3D, material: THREE.Material) {
  root.traverse(part => { if (part instanceof THREE.Mesh) part.geometry.dispose(); });
  material.dispose();
  root.removeFromParent();
}

const ink = '#2d342f', trousers = '#344e4b', skin = '#a96643';
const shirt = '#e3c48d', ochre = '#d59e53', hide = '#78503b';
const leather = '#59392e', brass = '#e6ba69', scarf = '#e44f31';

export class TempleRunner {
  readonly group = new THREE.Group();
  private readonly material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.91 });
  private readonly hip: THREE.Mesh;
  private readonly chest: THREE.Mesh;
  private readonly head: THREE.Mesh;
  private readonly scarfTail: THREE.Mesh;
  private readonly arms: { shoulder: THREE.Mesh; elbow: THREE.Mesh }[] = [];
  private readonly legs: { thigh: THREE.Mesh; shin: THREE.Mesh; foot: THREE.Mesh }[] = [];
  private stride = 0;

  constructor() {
    const make = (parent: THREE.Object3D, point: Point, fn: (part: Sculpture) => void) =>
      bone(parent, point, this.material, fn);
    this.hip = make(this.group, [0, 0.89, 0], s => {
      s.form([[-0.10, .147, .108], [-.035, .20, .14], [.09, .19, .128]], trousers);
      s.form([[.06, .197, .132], [.13, .185, .122]], leather);
      s.box([0, .093, -.124], [.073, .049, .017], brass);
      s.box([.176, .033, .012], [.07, .12, .093], hide, -.1);
    });
    this.chest = make(this.hip, [0, .11, 0], s => {
      s.form([[-.015, .18, .128], [.11, .192, .147], [.31, .252, .152, -.015], [.40, .23, .11], [.445, .108, .086]], shirt);
      for (const side of [-1, 1]) {
        s.rod([side*.15, .075, .102], [side*.165, .38, .087], .031, leather);
        s.rod([side*.12, .08, -.106], [side*.165, .377, -.116], .024, hide);
      }
      // A waxed field pack, bed roll, ochre piping, clasp and brass compass.
      s.form([[.045, .115, .052], [.085, .158, .077], [.259, .151, .08], [.294, .113, .058]], hide, [0, 0, .165]);
      s.form([[.175, .13, .053], [.192, .156, .065], [.257, .158, .068]], ochre, [0, 0, .198]);
      s.box([0, .171, .264], [.027, .08, .014], leather);
      s.box([0, .174, .276], [.04, .03, .009], brass);
      s.rod([-.193, .315, .168], [.193, .315, .168], .061, '#458180');
      for (const side of [-1, 1]) {
        s.rod([side*.124, .315, .168], [side*.144, .315, .168], .063, leather);
      }
      s.oval([-.149, .105, .201], [.039, .063, .038], '#8da9a0', -.18);
      s.form([[.395, .117, .087], [.423, .135, .107], [.454, .102, .08]], scarf);
      s.oval([-.084, .406, .09], [.045, .029, .034], '#bc372b');
    });
    this.scarfTail = make(this.chest, [-.084, .405, .095], s => {
      s.rod([0, 0, 0], [-.049, -.046, .138], .034, scarf, .041);
      s.rod([-.049, -.046, .138], [-.16, -.122, .24], .041, '#e45236', .008);
      s.rod([.004, -.01, .01], [-.026, -.11, .158], .022, '#bd382d', .006);
    });
    this.head = make(this.chest, [0, .442, -.016], s => {
      s.form([[0, .06, .056], [.085, .069, .064]], skin);
      s.form([[.042, .069, .066, -.02], [.078, .1, .089, -.022], [.17, .116, .109], [.232, .099, .094]], skin);
      s.oval([0, .129, -.109], [.024, .031, .022], '#bf8057');
      for (const side of [-1, 1]) {
        s.oval([side*.106, .138, .006], [.018, .034, .024], skin);
        s.box([side*.052, .162, -.099], [.023, .009, .008], ink);
        s.oval([side*.09, .162, .047], [.033, .05, .063], '#362a26');
      }
      s.oval([0, .165, .065], [.106, .067, .061], '#342b27');
      // Rolled brim and pinched crown distinguish the explorer at a distance.
      s.form([[.194, .223, .206, -.018], [.210, .226, .209, -.018], [.224, .142, .14]], ochre, [0, 0, 0], 18);
      s.form([[.210, .145, .138], [.273, .128, .127], [.307, .102, .11], [.321, .066, .071]], '#c4975f');
      s.form([[.220, .146, .14], [.247, .139, .134]], leather);
      s.box([.131, .234, .031], [.015, .029, .043], brass);
    });
    for (const side of [-1, 1]) {
      const shoulder = make(this.chest, [side*.242, .345, -.005], s => {
        s.form([[-.274, .052, .058], [-.15, .062, .068], [-.085, .067, .068]], skin);
        s.form([[-.168, .075, .076], [-.13, .08, .084], [-.02, .089, .096], [.042, .062, .072]], shirt);
        s.form([[-.177, .076, .078], [-.143, .083, .085]], '#efdab3');
      });
      const elbow = make(shoulder, [0, -.261, 0], s => {
        s.form([[-.239, .038, .04], [-.136, .045, .048], [-.058, .056, .061], [.031, .054, .059]], skin);
        s.form([[-.229, .048, .046], [-.171, .051, .05]], side === 1 ? leather : '#aa733f');
        s.oval([0, -.265, -.007], [.054, .074, .05], '#ac7050');
        s.oval([-side*.040, -.25, -.024], [.017, .039, .023], skin);
      });
      this.arms.push({ shoulder, elbow });
      const thigh = make(this.hip, [side*.116, -.014, 0], s => {
        s.form([[-.395, .070, .077], [-.285, .078, .088], [-.11, .095, .108], [.041, .098, .104]], trousers);
        s.box([side*.082, -.143, .014], [.03, .111, .09], '#425f56');
        s.box([side*.10, -.109, .014], [.012, .026, .10], '#5c7262');
      });
      const shin = make(thigh, [0, -.369, 0], s => {
        s.form([[-.371, .051, .056], [-.256, .066, .074], [-.115, .076, .086], [.047, .071, .077]], trousers);
        s.form([[-.359, .063, .067], [-.244, .07, .075], [-.131, .078, .091]], hide);
        for (const y of [-.171, -.222]) s.form([[y, .077, .087], [y+.021, .079, .088]], '#a77b4e');
      });
      const foot = make(shin, [0, -.351, 0], s => {
        s.form([[-.116, .077, .135, -.044], [-.091, .08, .143, -.043]], '#3a3029');
        s.form([[-.092, .078, .14, -.044], [-.052, .076, .126, -.033], [.052, .062, .074, .004]], hide);
        s.box([0, -.030, -.102], [.074, .012, .024], '#ae8856');
      });
      this.legs.push({ thigh, shin, foot });
    }
  }

  update(speedKmh: number, elapsed: number, action: RunnerAction, progress: number, dt: number, reducedMotion = false) {
    const speed = clamp(speedKmh / 30, 0, 2);
    const activity = Math.min(1, speed * 2.4);
    this.stride = (this.stride + Math.min(Math.max(dt, 0), .12) * (1.05 + Math.sqrt(speed) * .58) * TAU * activity) % TAU;
    const p = clamp(progress, 0, 1);
    const arc = Math.sin(Math.PI * p);
    const lift = action === 'jump' ? arc : 0;
    const tuck = action === 'slide' ? Math.min(1, arc * 1.65) : 0;
    const trip = action === 'stumble' ? arc : 0;
    const motion = reducedMotion ? .46 : 1;
    const gait = activity * (1 - Math.max(lift, tuck, trip*.72));
    const step = Math.sin(this.stride);
    this.hip.position.set(step*.028*gait*motion, .855 + Math.abs(Math.cos(this.stride))*.084*gait*motion + lift*.91 - tuck*.53 - trip*.11, 0);
    this.hip.rotation.set(-.05*gait, -step*.114*gait*motion, step*.04*gait*motion + trip*.14);
    this.chest.rotation.set(-.11*gait - lift*.13 + tuck*.96 - trip*.43, step*.214*gait*motion, -step*.045*gait*motion);
    this.head.rotation.set(.08*gait - tuck*.74 + trip*.16, -step*.13*gait*motion, 0);
    this.scarfTail.rotation.set(-.24*activity + Math.cos(this.stride*2)*.13*gait*motion, Math.sin(elapsed*5)*.22*activity*motion, .1);
    for (let i = 0; i < 2; i++) {
      const sign = i === 0 ? -1 : 1;
      const swing = Math.sin(this.stride + i*Math.PI);
      const { thigh, shin, foot } = this.legs[i];
      thigh.rotation.set((.14 + swing*.81)*gait + lift*(i === 0 ? .91 : .23) + tuck*(i === 0 ? 1.25 : .82) + trip*sign*.48, 0, sign*.035);
      shin.rotation.x = -(.17 + Math.max(0, -Math.cos(this.stride+i*Math.PI))*.99)*gait - lift*(i === 0 ? 1.33 : .97) - tuck*(i === 0 ? .33 : 1.89) - trip*.3;
      foot.rotation.x = -thigh.rotation.x*.50 - shin.rotation.x*.55 + lift*.19;
      const { shoulder, elbow } = this.arms[i];
      shoulder.rotation.set(-swing*.69*gait + lift*(.47 + .34*sign) - tuck*.54 + trip*.94, 0, sign*(.088 + lift*.28 + trip*.56));
      elbow.rotation.set(.27 + .91*gait + swing*.18*gait + lift*.62 + tuck*.62 - trip*.23, -sign*.14, 0);
    }
  }

  dispose() { disposeModel(this.group, this.material); }
}

/** The pursuing temple guardian is an obsidian cat with a carved gold collar. */
export class TempleGuardian {
  readonly group = new THREE.Group();
  private readonly material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .76 });
  private readonly body: THREE.Mesh;
  private readonly neck: THREE.Mesh;
  private readonly legs: {upper: THREE.Mesh; lower: THREE.Mesh}[] = [];
  private readonly tail: THREE.Mesh;

  constructor() {
    const make = (parent: THREE.Object3D, point: Point, fn: (part: Sculpture) => void) => bone(parent, point, this.material, fn);
    const stone = '#354e4a', light = '#5a7161', jade = '#58cfad';
    this.body = make(this.group, [0, .74, 0], s => {
      s.oval([0, .05, .12], [.31, .27, .59], stone);
      s.oval([0, .09, -.33], [.34, .31, .34], stone);
      s.oval([0, .09, .55], [.285, .285, .30], stone);
      for (const side of [-1, 1]) {
        for (let j = 0; j < 4; j++) {
          const z = -.26 + j*.2;
          s.rod([side*.20, .25, z], [side*.29, .075, z+.095], .025, light, .007);
        }
      }
      s.rod([0, .145, -.38], [0, .18, -.475], .276, '#bc9055');
    });
    this.neck = make(this.body, [0, .17, -.46], s => {
      s.oval([0, .023, -.21], [.245, .195, .235], stone);
      s.oval([0, -.066, -.41], [.159, .106, .124], light);
      s.oval([0, -.041, -.517], [.079, .046, .029], '#283a35');
      for (const side of [-1, 1]) {
        s.form([[.117, .089, .055], [.28, .025, .025]], stone, [side*.156, 0, -.139], 4);
        s.oval([side*.151, .051, -.391], [.048, .021, .023], '#ffd36a', -side*.18);
        s.rod([side*.176, .02, -.34], [side*.233, -.048, -.218], .015, jade, .008);
      }
    });
    for (const rear of [false, true]) for (const side of [-1, 1]) {
      const upper = make(this.body, [side*.217, -.036, rear ? .55 : -.36], s => {
        s.form([[-.345, .071, .099], [-.105, .12, .142], [.098, .105, .14]], stone);
      });
      const lower = make(upper, [0, -.305, 0], s => {
        s.form([[-.325, .055, .069], [-.217, .059, .065], [.045, .076, .089]], light);
        s.oval([0, -.344, -.054], [.083, .055, .126], stone);
        s.form([[-.30, .061, .073], [-.263, .063, .074]], '#bd995c');
      });
      this.legs.push({upper, lower});
    }
    this.tail = make(this.body, [0, .18, .73], s => {
      s.rod([0, 0, 0], [.045, .14, .28], .067, stone, .047);
      s.rod([.045, .14, .28], [.12, .16, .51], .048, stone, .038);
      s.rod([.12, .16, .51], [.16, .06, .73], .039, light, .027);
      s.rod([.147, .1, .65], [.16, .06, .73], .035, jade, .029);
    });
  }

  update(speedKmh: number, elapsed: number, threat: number, reducedMotion = false) {
    const amount = Math.min(1, Math.max(0, speedKmh / 16));
    const emphasis = reducedMotion ? .4 : 1;
    const beat = elapsed * 10.4;
    this.body.position.y = .76 + Math.sin(beat*2)*.059*amount*emphasis;
    this.body.rotation.x = Math.cos(beat)*.12*amount*emphasis;
    this.neck.rotation.set(-this.body.rotation.x*.65, Math.sin(elapsed*2)*.07*emphasis, 0);
    this.neck.position.y = .17 - clamp(threat, 0, 1)*.085;
    this.tail.rotation.set(.14 + Math.sin(beat)*.14*amount*emphasis, Math.sin(elapsed*3.1)*.32*emphasis, 0);
    this.legs.forEach(({ upper, lower }, i) => {
      const gait = Math.sin(beat + [0, .6, Math.PI, Math.PI + .6][i]);
      upper.rotation.x = gait*.62*amount;
      lower.rotation.x = -Math.max(0, -gait)*.64*amount;
    });
  }

  dispose() { disposeModel(this.group, this.material); }
}
