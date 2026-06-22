import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '../shared/ipc.js';

const ipcRendererMock = new EventEmitter() as EventEmitter & {
  invoke: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  removeAllListeners: ReturnType<typeof vi.fn>;
};

ipcRendererMock.invoke = vi.fn();
ipcRendererMock.send = vi.fn();
ipcRendererMock.removeAllListeners = vi.fn();

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn()
  },
  ipcRenderer: ipcRendererMock
}));

const randomUUID = vi.fn<() => string>();
Object.defineProperty(globalThis, 'crypto', {
  value: { randomUUID },
  configurable: true
});

const { createStreamInvoker } = await import('./index.js');

describe('createStreamInvoker', () => {
  beforeEach(() => {
    ipcRendererMock.removeAllListeners();
    ipcRendererMock.invoke.mockReset();
    ipcRendererMock.send.mockReset();
    ipcRendererMock.removeAllListeners.mockClear();
    randomUUID.mockReset();
  });

  it('并发流只清理自身 listener，避免 removeAllListeners 误伤动态 channel', async () => {
    randomUUID.mockReturnValueOnce('preload-a').mockReturnValueOnce('preload-b');
    const chunksA: string[] = [];
    const chunksB: string[] = [];
    const sentRequestIds: string[] = [];
    const removeListenerSpy = vi.spyOn(ipcRendererMock, 'removeListener');

    const promiseA = createStreamInvoker<string>({
      channel: IPC_CHANNELS.aiStreamRagAnswer,
      onChunk: (chunk) => chunksA.push(chunk),
      send: (requestId) => {
        sentRequestIds.push(requestId);
      }
    });
    const promiseB = createStreamInvoker<string>({
      channel: IPC_CHANNELS.aiStreamRagAnswer,
      onChunk: (chunk) => chunksB.push(chunk),
      send: (requestId) => {
        sentRequestIds.push(requestId);
      }
    });

    ipcRendererMock.emit(`${IPC_CHANNELS.aiStreamRagAnswer}:chunk:preload-a`, {}, 'a1');
    ipcRendererMock.emit(`${IPC_CHANNELS.aiStreamRagAnswer}:chunk:preload-b`, {}, 'b1');
    ipcRendererMock.emit(`${IPC_CHANNELS.aiStreamRagAnswer}:end:preload-a`, {});
    await promiseA;
    ipcRendererMock.emit(`${IPC_CHANNELS.aiStreamRagAnswer}:chunk:preload-b`, {}, 'b2');
    ipcRendererMock.emit(`${IPC_CHANNELS.aiStreamRagAnswer}:end:preload-b`, {});
    await promiseB;

    expect(sentRequestIds).toEqual(['preload-a', 'preload-b']);
    expect(chunksA).toEqual(['a1']);
    expect(chunksB).toEqual(['b1', 'b2']);
    expect(ipcRendererMock.removeAllListeners).not.toHaveBeenCalledWith(expect.stringContaining(IPC_CHANNELS.aiStreamRagAnswer));
    expect(removeListenerSpy).toHaveBeenCalledWith(`${IPC_CHANNELS.aiStreamRagAnswer}:chunk:preload-a`, expect.any(Function));
    expect(removeListenerSpy).toHaveBeenCalledWith(`${IPC_CHANNELS.aiStreamRagAnswer}:end:preload-a`, expect.any(Function));
    expect(removeListenerSpy).toHaveBeenCalledWith(`${IPC_CHANNELS.aiStreamRagAnswer}:error:preload-a`, expect.any(Function));
    expect(removeListenerSpy).toHaveBeenCalledWith(`${IPC_CHANNELS.aiStreamRagAnswer}:chunk:preload-b`, expect.any(Function));
  });

  it('错误结束时也清理具体 listener 并拒绝 Promise', async () => {
    randomUUID.mockReturnValueOnce('preload-error');
    const removeListenerSpy = vi.spyOn(ipcRendererMock, 'removeListener');

    const promise = createStreamInvoker<string>({
      channel: IPC_CHANNELS.aiStreamValidation,
      onChunk: vi.fn(),
      send: vi.fn()
    });

    ipcRendererMock.emit(`${IPC_CHANNELS.aiStreamValidation}:error:preload-error`, {}, 'boom');

    await expect(promise).rejects.toThrow('boom');
    expect(removeListenerSpy).toHaveBeenCalledWith(`${IPC_CHANNELS.aiStreamValidation}:chunk:preload-error`, expect.any(Function));
    expect(removeListenerSpy).toHaveBeenCalledWith(`${IPC_CHANNELS.aiStreamValidation}:end:preload-error`, expect.any(Function));
    expect(removeListenerSpy).toHaveBeenCalledWith(`${IPC_CHANNELS.aiStreamValidation}:error:preload-error`, expect.any(Function));
  });
});
