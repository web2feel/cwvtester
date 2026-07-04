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
});
