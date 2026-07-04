import { describe, expect, it } from 'vitest';
import { createQueue, withTimeout } from '../src/queue';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('createQueue', () => {
  it('runs tasks serially in FIFO order', async () => {
    const queue = createQueue();
    const order: string[] = [];
    const firstGate = deferred();
    const done = deferred();

    queue.enqueue(async () => {
      order.push('first:start');
      await firstGate.promise;
      order.push('first:end');
    });
    queue.enqueue(async () => {
      order.push('second:start');
      done.resolve();
    });

    // Give the queue a tick to start the first task; the second must not have started.
    await new Promise(r => setTimeout(r, 10));
    expect(order).toEqual(['first:start']);

    firstGate.resolve();
    await done.promise;
    expect(order).toEqual(['first:start', 'first:end', 'second:start']);
  });

  it('continues to the next task when one throws', async () => {
    const queue = createQueue();
    const done = deferred();
    const order: string[] = [];

    queue.enqueue(async () => {
      order.push('bad');
      throw new Error('boom');
    });
    queue.enqueue(async () => {
      order.push('good');
      done.resolve();
    });

    await done.promise;
    expect(order).toEqual(['bad', 'good']);
  });
});

describe('withTimeout', () => {
  it('resolves with the value when the promise settles before the deadline', async () => {
    await expect(withTimeout(Promise.resolve(42), 1000, 'too slow')).resolves.toBe(42);
  });

  it('rejects with the given message when the deadline passes', async () => {
    const never = new Promise<void>(() => {});
    await expect(withTimeout(never, 20, 'The audit timed out after 90 seconds.')).rejects.toThrow(
      'The audit timed out after 90 seconds.'
    );
  });

  it('does not leave an unhandled rejection when the losing promise rejects after timeout', async () => {
    let rejectLater!: (e: Error) => void;
    const slow = new Promise<void>((_, reject) => {
      rejectLater = reject;
    });
    await expect(withTimeout(slow, 10, 'timed out')).rejects.toThrow('timed out');
    rejectLater(new Error('late failure'));
    // Give the event loop a tick; Vitest fails the run on unhandled rejections.
    await new Promise(r => setTimeout(r, 10));
  });

  it('still rejects with the original error when the promise rejects before the deadline', async () => {
    await expect(withTimeout(Promise.reject(new Error('real failure')), 1000, 'too slow')).rejects.toThrow(
      'real failure'
    );
  });
});
