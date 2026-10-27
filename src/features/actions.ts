import { useStudio } from '../state/store';
import { filePlatform } from '../platform/files';
import { parseScene } from '../domain/scene';
import { parseModel } from '../platform/model';
import { exportTransforms } from '../domain/pose';
import { confirmDiscardChanges } from '../platform/lifecycle';

async function task(action: () => Promise<void>) {
  const state = useStudio.getState();
  if (state.busy) return;
  state.setBusy(true);
  state.setError(null);
  try {
    await action();
  } catch (e) {
    state.setError(e instanceof Error ? e.message : 'The operation failed.');
  } finally {
    state.setBusy(false);
  }
}
export async function confirmReplace(): Promise<boolean> {
  const state = useStudio.getState();
  return JSON.stringify(state.scene) === state.saved || (await confirmDiscardChanges());
}
export const importModel = () =>
  task(async () => {
    const file = await filePlatform.pick('model');
    if (!file) return;
    useStudio
      .getState()
      .setNotice(
        /\.(step|stp)$/i.test(file.name)
          ? 'Converting STEP locally… large models may take up to 60 seconds.'
          : `Reading ${file.name}…`,
      );
    const object = await parseModel(file.name, file.data);
    useStudio.getState().importModel(file.name, object);
    useStudio
      .getState()
      .setNotice(
        `Imported ${file.name}. ${/\.stl$/i.test(file.name) ? 'STL assumes millimeters and Z-up; confirm units and orientation in the inspector.' : /\.(step|stp)$/i.test(file.name) ? 'STEP converted to meters; confirm orientation and origin.' : 'Check the proposed Y-up → Z-up alignment and model origin.'}`,
      );
  });
export const openScene = () =>
  task(async () => {
    const file = await filePlatform.pick('json');
    if (!file) return;
    if (!file.data.length)
      throw new Error('The file is empty, unreadable, or exceeds the 100 MB limit.');
    const scene = parseScene(new TextDecoder().decode(file.data));
    if (!(await confirmReplace())) return;
    useStudio.getState().load(scene);
    useStudio
      .getState()
      .setNotice(
        scene.model
          ? `Scene opened. Re-select ${scene.model.fileName} to restore the external model.`
          : `Opened ${file.name}.`,
      );
  });
export const saveScene = () =>
  task(async () => {
    const scene = useStudio.getState().scene;
    if (await filePlatform.save('scene.json', JSON.stringify(scene, null, 2))) {
      // Do not clear changes made while the native dialog was open.
      if (JSON.stringify(scene) === JSON.stringify(useStudio.getState().scene))
        useStudio.getState().markSaved();
      useStudio
        .getState()
        .setNotice('Scene saved. External model files are referenced by filename only.');
    }
  });
export const saveTransforms = () =>
  task(async () => {
    const scene = useStudio.getState().scene;
    if (
      await filePlatform.save('transforms.json', JSON.stringify(exportTransforms(scene), null, 2))
    )
      useStudio
        .getState()
        .setNotice(
          `Exported ${scene.sensors.length} sensor transforms. Matrices use row-major storage.`,
        );
  });
