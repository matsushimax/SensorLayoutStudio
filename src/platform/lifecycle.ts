import { isTauri } from '@tauri-apps/api/core';

export async function confirmDiscardChanges(): Promise<boolean> {
  if (isTauri()) {
    const { ask } = await import('@tauri-apps/plugin-dialog');
    return ask('This study has unsaved changes. Discard them and continue?', {
      title: 'Unsaved study',
      kind: 'warning',
    });
  }
  return window.confirm('This study has unsaved changes. Discard them and continue?');
}

export async function guardNativeClose(
  isDirty: () => boolean,
  onError: (message: string) => void,
): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const win = getCurrentWindow();
  let asking = false;
  return win.onCloseRequested(async (event) => {
    if (asking) {
      event.preventDefault();
      return;
    }
    if (!isDirty()) return;
    asking = true;
    try {
      // Tauri awaits this handler and then destroys the window if not prevented.
      // Accept the original request instead of issuing another close request.
      if (!(await confirmDiscardChanges())) event.preventDefault();
    } catch (error) {
      event.preventDefault();
      onError(`Could not confirm closing: ${String(error)}`);
    } finally {
      asking = false;
    }
  });
}

// WebView2 uses the native close guard. A second browser unload prompt can
// interfere with closing after the user has already confirmed discarding edits.
export function guardBrowserUnload(event: BeforeUnloadEvent, isDirty: boolean): void {
  if (isTauri() || !isDirty) return;
  event.preventDefault();
  event.returnValue = '';
}
