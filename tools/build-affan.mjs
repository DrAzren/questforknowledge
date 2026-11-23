// Builds public/assets/models/affan.glb from the generated source files:
// base.glb (the rigged model with its idle clip) plus one <clip>.glb per
// animation.
//
// Every animation order re-rigs the model, so each clip file has a slightly
// different skeleton (joint positions, bone axes, even skin weights). Clips
// are therefore retargeted, not copied: for each bone and frame we solve for
// the base-rig transform that moves the bone's vertices exactly as the source
// rig did,
//
//     W_base(bone, t) = W_src(bone, t) * IB_src(bone) * inverse(IB_base(bone))
//
// (W = world matrix, IB = inverse bind matrix), then convert back to local
// transforms on the base hierarchy. Root motion is removed because the game
// moves Affan itself. Finally textures are shrunk and the mesh compressed.
//
//   node tools/build-affan.mjs <sourceDir> [outFile]
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, resample, textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { Matrix4, Quaternion, Vector3 } from 'three';

const [srcDir, outFile = 'public/assets/models/affan.glb'] = process.argv.slice(2);
if (!srcDir) throw new Error('usage: node tools/build-affan.mjs <sourceDir> [outFile]');

/** Clips whose vertical root motion is also removed: the game supplies the jump arc and the fall. */
const AIRBORNE = new Set(['jump', 'fall']);

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const base = await io.read(path.join(srcDir, 'base.glb'));
const root = base.getRoot();
const buffer = root.listBuffers()[0];
const baseSkin = root.listSkins()[0];
const baseJoints = baseSkin.listJoints();
const rootBone = baseJoints[0].getName();

function inverseBinds(skin) {
  const arr = skin.getInverseBindMatrices().getArray();
  const map = new Map();
  skin.listJoints().forEach((j, i) => map.set(j.getName(), new Matrix4().fromArray(arr, i * 16)));
  return map;
}

const localOf = (node) => new Matrix4().compose(
  new Vector3(...node.getTranslation()), new Quaternion(...node.getRotation()), new Vector3(...node.getScale()),
);

/** World matrix of a node from its static transforms (used for non-animated parents such as the armature). */
function staticWorld(node) {
  const m = localOf(node);
  const parent = node.getParentNode();
  return parent ? staticWorld(parent).multiply(m) : m;
}

/** Value of one animation channel at time t (linear / spherical interpolation). */
function sample(sampler, t, isRotation) {
  const times = sampler.getInput().getArray();
  const values = sampler.getOutput().getArray();
  const size = isRotation ? 4 : 3;
  let i = 0;
  while (i < times.length - 2 && times[i + 1] <= t) i++;
  const t0 = times[i];
  const t1 = times[Math.min(i + 1, times.length - 1)];
  const k = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 0;
  const a = values.subarray(i * size, i * size + size);
  const j = Math.min(i + 1, times.length - 1);
  const b = values.subarray(j * size, j * size + size);
  if (isRotation) return new Quaternion(a[0], a[1], a[2], a[3]).slerp(new Quaternion(b[0], b[1], b[2], b[3]), k);
  return new Vector3(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k);
}

const baseIB = inverseBinds(baseSkin);
const baseParent = new Map(baseJoints.map((j) => [j.getName(), j.getParentNode()]));
const baseJointNames = new Set(baseJoints.map((j) => j.getName()));
const baseByName = new Map(baseJoints.map((j) => [j.getName(), j]));

function retarget(doc, name) {
  const src = doc.getRoot().listAnimations()[0];
  const skin = doc.getRoot().listSkins()[0];
  if (!src || !skin) throw new Error(`${name}: no animation or skin`);
  const srcIB = inverseBinds(skin);
  const channels = new Map(); // node name -> { translation, rotation, scale }
  for (const ch of src.listChannels()) {
    const n = ch.getTargetNode()?.getName();
    if (!n) continue;
    if (!channels.has(n)) channels.set(n, {});
    channels.get(n)[ch.getTargetPath()] = ch.getSampler();
  }
  const times = Array.from(src.listSamplers()[0].getInput().getArray());

  // Source world matrix of a node at time t.
  const srcWorld = (node, t, memo) => {
    const key = node.getName();
    if (memo.has(key)) return memo.get(key);
    const c = channels.get(key) ?? {};
    const local = new Matrix4().compose(
      c.translation ? sample(c.translation, t, false) : new Vector3(...node.getTranslation()),
      c.rotation ? sample(c.rotation, t, true) : new Quaternion(...node.getRotation()),
      c.scale ? sample(c.scale, t, false) : new Vector3(...node.getScale()),
    );
    const parent = node.getParentNode();
    const world = parent ? srcWorld(parent, t, memo).clone().multiply(local) : local;
    memo.set(key, world);
    return world;
  };

  const tracks = new Map(baseJoints.map((j) => [j.getName(), { t: [], r: [] }]));
  let maxScaleError = 0;
  const srcJoints = new Map(skin.listJoints().map((j) => [j.getName(), j]));
  for (const time of times) {
    const memo = new Map();
    const world = new Map();
    for (const joint of baseJoints) {
      const n = joint.getName();
      const sj = srcJoints.get(n);
      if (!sj) throw new Error(`${name}: source rig has no bone ${n}`);
      world.set(n, srcWorld(sj, time, memo).clone().multiply(srcIB.get(n)).multiply(baseIB.get(n).clone().invert()));
    }
    for (const joint of baseJoints) {
      const n = joint.getName();
      const parent = baseParent.get(n);
      const parentWorld = parent && baseJointNames.has(parent.getName()) ? world.get(parent.getName()) : parent ? staticWorld(parent) : new Matrix4();
      const local = parentWorld.clone().invert().multiply(world.get(n));
      const p = new Vector3();
      const q = new Quaternion();
      const s = new Vector3();
      local.decompose(p, q, s);
      maxScaleError = Math.max(maxScaleError, Math.abs(s.x - 1), Math.abs(s.y - 1), Math.abs(s.z - 1));
      const tr = tracks.get(n);
      // Keep neighbouring quaternions on the same hemisphere so playback interpolates the short way.
      if (tr.r.length) {
        const last = tr.r.length - 4;
        if (tr.r[last] * q.x + tr.r[last + 1] * q.y + tr.r[last + 2] * q.z + tr.r[last + 3] * q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
      }
      tr.t.push(p.x, p.y, p.z);
      tr.r.push(q.x, q.y, q.z, q.w);
    }
  }

  // Root motion: remove the steady drift (walking forward), keep the natural sway.
  const hips = tracks.get(rootBone).t;
  const frames = times.length;
  const drift = [0, 1, 2].map((a) => hips[(frames - 1) * 3 + a] - hips[a]);
  for (let f = 0; f < frames; f++) {
    const k = frames > 1 ? f / (frames - 1) : 0;
    hips[f * 3] -= drift[0] * k;
    hips[f * 3 + 2] -= drift[2] * k;
    if (AIRBORNE.has(name)) hips[f * 3 + 1] = hips[1];
  }

  const anim = base.createAnimation(name);
  const input = base.createAccessor().setType('SCALAR').setArray(new Float32Array(times)).setBuffer(buffer);
  for (const [n, tr] of tracks) {
    const node = baseByName.get(n);
    const tAcc = base.createAccessor().setType('VEC3').setArray(new Float32Array(tr.t)).setBuffer(buffer);
    const rAcc = base.createAccessor().setType('VEC4').setArray(new Float32Array(tr.r)).setBuffer(buffer);
    const ts = base.createAnimationSampler().setInput(input).setOutput(tAcc).setInterpolation('LINEAR');
    const rs = base.createAnimationSampler().setInput(input).setOutput(rAcc).setInterpolation('LINEAR');
    anim.addSampler(ts).addSampler(rs);
    anim.addChannel(base.createAnimationChannel().setTargetNode(node).setTargetPath('translation').setSampler(ts));
    anim.addChannel(base.createAnimationChannel().setTargetNode(node).setTargetPath('rotation').setSampler(rs));
  }
  const ys = [];
  for (let f = 0; f < frames; f++) ys.push(hips[f * 3 + 1]);
  console.log(
    `${name}: ${frames} frames, ${times[frames - 1].toFixed(2)} s, drift removed (cm) x ${drift[0].toFixed(1)} y ${drift[1].toFixed(1)} z ${drift[2].toFixed(1)}, ` +
    `hips height ${Math.min(...ys).toFixed(1)}..${Math.max(...ys).toFixed(1)} cm, scale error ${maxScaleError.toFixed(4)}`,
  );
}

// The base file carries the idle clip on its own rig.
root.listAnimations().forEach((a, i) => a.setName(i === 0 ? 'idle' : `idle_${i}`));

for (const file of fs.readdirSync(srcDir).sort()) {
  if (!file.endsWith('.glb') || file === 'base.glb') continue;
  retarget(await io.read(path.join(srcDir, file)), path.basename(file, '.glb'));
}

await base.transform(
  dedup(),
  resample(),
  prune(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 85 }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
await io.write(outFile, base);
console.log('wrote', outFile, (fs.statSync(outFile).size / 1024).toFixed(0), 'KB');
