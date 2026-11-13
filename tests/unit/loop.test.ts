import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLoop } from '../../client/src/loop.js';

describe('fixed-step game loop', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  it('does not schedule frames before start', () => {
    const raf = vi.fn(() => 1);
    vi.stubGlobal('requestAnimationFrame', raf);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const loop = createLoop({ simulate: vi.fn(), render: vi.fn() });
    expect(raf).not.toHaveBeenCalled(); loop.stop();
  });
  it('simulates fixed steps and renders each animation frame', () => {
    let callback: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { callback = cb; return 1; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('performance', { now: () => 10 });
    const simulate = vi.fn(); const render = vi.fn();
    const loop = createLoop({ step: 1 / 60, simulate, render });
    loop.start(); callback?.(0); callback?.(34);
    expect(simulate).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenCalledTimes(2);
    loop.stop();
  });
  it('does not start duplicate animation chains', () => {
    const raf = vi.fn(() => 1);
    vi.stubGlobal('requestAnimationFrame', raf); vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const loop = createLoop({ simulate: vi.fn(), render: vi.fn() });
    loop.start(); loop.start(); expect(raf).toHaveBeenCalledTimes(1); loop.stop();
  });
});
