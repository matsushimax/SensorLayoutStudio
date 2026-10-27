import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Box3, BoxGeometry, Mesh, Vector3 } from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { parseStl } from './meshImport';
import { parseModel } from './model';
import { useStudio } from '../state/store';

describe('mesh import boundaries', () => {
  it('imports ASCII and binary STL with matching geometry and keeps CAD source axes', () => {
    const ascii = parseStl(readFileSync('examples/calibration-block.stl'));
    const geometry = new BoxGeometry(1000, 2000, 3000);
    geometry.translate(500, 1000, 1500);
    const binary = new STLExporter().parse(new Mesh(geometry), { binary: true });
    const loaded = parseStl(new Uint8Array(binary.buffer));
    for (const object of [ascii, loaded]) {
      expect(new Box3().setFromObject(object).getSize(new Vector3()).toArray()).toEqual([
        1000, 2000, 3000,
      ]);
      useStudio.getState().reset(false);
      useStudio.getState().importModel('block.STL', object);
      expect(useStudio.getState().scene.model?.scaleFactor).toBe(0.001);
      expect(useStudio.getState().scene.model?.poseInBase.quaternionXYZW).toEqual([0, 0, 0, 1]);
      object.geometry.dispose();
      object.material.dispose();
    }
    geometry.dispose();
  });
  it('preserves edited units, alignment and model history on relink', () => {
    useStudio.getState().reset(false);
    const original = parseStl(readFileSync('examples/calibration-block.stl'));
    useStudio.getState().importModel('block.stl', original);
    useStudio.getState().updateModel({
      scaleFactor: 0.0254,
      poseInBase: { positionM: [4, 5, 6], quaternionXYZW: [0, 0, 0, 1] },
    });
    const alignment = useStudio.getState().scene.model;
    const replacement = parseStl(readFileSync('examples/calibration-block.stl'));
    useStudio.getState().importModel('block.stl', replacement);
    expect(useStudio.getState().scene.model).toEqual(alignment);
    useStudio.getState().undo();
    expect(useStudio.getState().modelObject).toBe(original);
  });
  it('rejects truncated/invalid STL and non-finite coordinates before replacing the scene', async () => {
    expect(() => parseStl(new Uint8Array(90))).toThrow();
    const geometry = new BoxGeometry();
    const view = new STLExporter().parse(new Mesh(geometry), { binary: true });
    view.setFloat32(96, NaN, true);
    expect(() => parseStl(new Uint8Array(view.buffer))).toThrow('invalid vertex');
    expect(() =>
      parseStl(new TextEncoder().encode('solid broken\n' + ' '.repeat(90) + '\nendsolid broken')),
    ).toThrow();
    await expect(parseModel('unsupported.iges', new Uint8Array(100))).rejects.toThrow(
      'Supported models',
    );
    geometry.dispose();
  });
});
