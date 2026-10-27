import { beforeEach, describe, expect, it, vi } from 'vitest';
import capabilities from '../../src-tauri/capabilities/main.json';

const native = vi.hoisted(() => ({
  active: true,
  ask: vi.fn(),
  close: vi.fn(),
  listen: vi.fn(),
  unlisten: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => native.active }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ ask: native.ask }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ onCloseRequested: native.listen, close: native.close }),
}));
import { guardBrowserUnload, guardNativeClose } from './lifecycle';

describe('window close lifecycle', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    native.active = true;
    native.listen.mockResolvedValue(native.unlisten);
  });
  async function setup(dirty: boolean) {
    const error = vi.fn();
    const unlisten = await guardNativeClose(() => dirty, error);
    const handler = native.listen.mock.calls[0][0] as (event: {
      preventDefault: () => void;
    }) => Promise<void>;
    const preventDefault = vi.fn();
    return { error, unlisten, handler, preventDefault };
  }
  it('grants destroy permission required by the SDK onCloseRequested wrapper', () => {
    expect(capabilities.permissions).toContain('core:window:allow-destroy');
  });
  it('accepts a clean close immediately and returns the listener cleanup', async () => {
    const s = await setup(false);
    await s.handler(s);
    expect(s.preventDefault).not.toHaveBeenCalled();
    expect(native.ask).not.toHaveBeenCalled();
    expect(s.unlisten).toBe(native.unlisten);
  });
  it('accepts the original request after confirmation without recursively closing', async () => {
    native.ask.mockResolvedValue(true);
    const s = await setup(true);
    await s.handler(s);
    expect(native.ask).toHaveBeenCalledOnce();
    expect(s.preventDefault).not.toHaveBeenCalled();
    expect(native.close).not.toHaveBeenCalled();
  });
  it('keeps unsaved work open when discard is cancelled', async () => {
    native.ask.mockResolvedValue(false);
    const s = await setup(true);
    await s.handler(s);
    expect(s.preventDefault).toHaveBeenCalledOnce();
    expect(native.close).not.toHaveBeenCalled();
  });
  it('prevents duplicate prompts while confirmation is pending', async () => {
    let respond!: (value: boolean) => void;
    native.ask.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          respond = resolve;
        }),
    );
    const s = await setup(true),
      second = { preventDefault: vi.fn() };
    const pending = s.handler(s);
    await vi.waitFor(() => expect(native.ask).toHaveBeenCalledOnce());
    await s.handler(second);
    expect(second.preventDefault).toHaveBeenCalledOnce();
    expect(native.ask).toHaveBeenCalledOnce();
    respond(true);
    await pending;
    expect(s.preventDefault).not.toHaveBeenCalled();
  });
  it('preserves work and reports confirmation errors', async () => {
    native.ask.mockRejectedValue(new Error('dialog failed'));
    const s = await setup(true);
    await s.handler(s);
    expect(s.preventDefault).toHaveBeenCalledOnce();
    expect(s.error).toHaveBeenCalledWith(expect.stringContaining('dialog failed'));
  });
  it('uses the unload prompt only in a dirty browser, never in native WebView2', () => {
    const event = { preventDefault: vi.fn(), returnValue: undefined };
    guardBrowserUnload(event as unknown as BeforeUnloadEvent, true);
    expect(event.preventDefault).not.toHaveBeenCalled();
    native.active = false;
    guardBrowserUnload(event as unknown as BeforeUnloadEvent, false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    guardBrowserUnload(event as unknown as BeforeUnloadEvent, true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.returnValue).toBe('');
  });
});
