import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';

// A bounded, shared pool: idle workers do not keep tests or shutdown alive.
export class BotPool {
  constructor({ size = Math.max(1, Math.min(4, availableParallelism() - 1)), maxQueue = 64, timeoutMs = 5000 } = {}) {
    this.size = size;
    this.maxQueue = maxQueue;
    this.timeoutMs = timeoutMs;
    this.queue = [];
    this.workers = new Set();
    this.sequence = 0;
    this.closed = false;
  }

  run(state, level) {
    if (this.closed) return Promise.reject(new Error('Bot pool đã đóng'));
    if (this.queue.length >= this.maxQueue) return Promise.reject(new Error('Máy đang quá tải'));
    return new Promise((resolve, reject) => {
      this.queue.push({ id: ++this.sequence, state, level, resolve, reject });
      this.dispatch();
    });
  }

  dispatch() {
    if (this.closed) return;
    while (this.queue.length) {
      let slot = [...this.workers].find((s) => !s.job);
      if (!slot && this.workers.size < this.size) slot = this.spawn();
      if (!slot) break;
      const job = this.queue.shift();
      slot.job = job;
      slot.worker.ref();
      slot.timer = setTimeout(() => this.fail(slot, new Error('Máy tính quá lâu')), this.timeoutMs);
      slot.worker.postMessage({ id: job.id, state: job.state, level: job.level });
    }
  }

  spawn() {
    const slot = { worker: new Worker(new URL('./botWorker.js', import.meta.url)), job: null, timer: null };
    this.workers.add(slot);
    slot.worker.on('message', (result) => {
      if (result.id !== slot.job?.id) return;
      const job = slot.job;
      clearTimeout(slot.timer);
      slot.job = null;
      slot.worker.unref();
      if (result.error) job.reject(new Error(result.error));
      else job.resolve(result.move);
      this.dispatch();
    });
    slot.worker.on('error', (error) => this.fail(slot, error));
    slot.worker.on('exit', (code) => {
      if (this.workers.has(slot)) this.fail(slot, new Error(`Bot worker thoát (${code})`));
    });
    slot.worker.unref();
    return slot;
  }

  fail(slot, error) {
    if (!this.workers.delete(slot)) return;
    clearTimeout(slot.timer);
    slot.job?.reject(error);
    slot.worker.terminate();
    this.dispatch();
  }

  async close() {
    this.closed = true;
    for (const job of this.queue.splice(0)) job.reject(new Error('Bot pool đã đóng'));
    const slots = [...this.workers];
    this.workers.clear();
    await Promise.all(slots.map((slot) => {
      clearTimeout(slot.timer);
      slot.job?.reject(new Error('Bot pool đã đóng'));
      return slot.worker.terminate();
    }));
  }
}

export const botPool = new BotPool();
