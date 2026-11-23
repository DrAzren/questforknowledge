// Prints a summary of a GLB: meshes, skeleton, animations, textures.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
const r = doc.getRoot();
for (const m of r.listMeshes()) for (const p of m.listPrimitives()) {
  const pos = p.getAttribute('POSITION');
  console.log('mesh', m.getName(), 'verts', pos.getCount(), 'tris', (p.getIndices()?.getCount() ?? pos.getCount()) / 3, 'min', pos.getMin([]).map((v) => +v.toFixed(3)), 'max', pos.getMax([]).map((v) => +v.toFixed(3)), 'attrs', p.listSemantics().join(','));
}
for (const s of r.listSkins()) console.log('skin joints', s.listJoints().length, s.listJoints().map((j) => j.getName()).join(' '));
for (const n of r.listNodes()) if (!n.getParentNode() || n.getMesh()) console.log('node', n.getName(), 't', n.getTranslation().map((v) => +v.toFixed(3)), 'r', n.getRotation().map((v) => +v.toFixed(3)), 's', n.getScale().map((v) => +v.toFixed(3)), n.getMesh() ? '[mesh]' : '', n.getSkin() ? '[skin]' : '');
for (const a of r.listAnimations()) {
  const dur = Math.max(...a.listSamplers().map((s) => s.getInput().getMax([])[0]));
  const hips = a.listChannels().filter((c) => c.getTargetPath() === 'translation').map((c) => { const o = c.getSampler().getOutput(); const arr = o.getArray(); const n = arr.length; return `${c.getTargetNode().getName()}: start(${[arr[0], arr[1], arr[2]].map((v) => v.toFixed(2))}) end(${[arr[n - 3], arr[n - 2], arr[n - 1]].map((v) => v.toFixed(2))}) keys ${n / 3}`; });
  console.log('anim', a.getName(), 'channels', a.listChannels().length, 'dur', dur.toFixed(2), '| translations:', hips.slice(0, 3).join(' ; '), hips.length > 3 ? `(+${hips.length - 3})` : '');
}
for (const t of r.listTextures()) console.log('tex', t.getName(), t.getMimeType(), t.getSize(), (t.getImage().byteLength / 1024).toFixed(0) + 'KB');
for (const m of r.listMaterials()) console.log('mat', m.getName(), 'metal', m.getMetallicFactor(), 'rough', m.getRoughnessFactor(), 'base', !!m.getBaseColorTexture(), 'mr', !!m.getMetallicRoughnessTexture(), 'normal', !!m.getNormalTexture());
