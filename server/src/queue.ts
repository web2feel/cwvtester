export interface SerialQueue {
  enqueue(task: () => Promise<void>): void;
}

// Serial FIFO task queue (concurrency 1). A failing task never blocks the
// tasks queued behind it.
export function createQueue(): SerialQueue {
  const pending: (() => Promise<void>)[] = [];
  let running = false;

  async function drain(): Promise<void> {
    if (running) return;
    running = true;
    while (pending.length > 0) {
      const task = pending.shift()!;
      try {
        await task();
      } catch {
        // The task owner is responsible for reporting its own failure.
      }
    }
    running = false;
  }

  return {
    enqueue(task: () => Promise<void>): void {
      pending.push(task);
      void drain();
    },
  };
}

export async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  // If the timeout wins the race, the losing promise may still reject later
  // (e.g. after resources it depends on are torn down). Attach a no-op
  // handler so that late rejection can't crash the process as unhandled.
  promise.catch(() => {});
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}
