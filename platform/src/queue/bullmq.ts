import { Queue, Worker } from 'bullmq';
import type { TaskQueue } from './taskQueue.js';
import type { TaskProcessor } from '../worker/taskProcessor.js';

const QUEUE_NAME = 'pst-environment-tasks';

interface BullTaskData {
  taskId: string;
}

function connectionFromUrl(redisUrl: string): { host: string; port: number; password?: string } {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number.parseInt(url.port || '6379', 10),
    password: url.password || undefined,
  };
}

export class BullTaskQueue implements TaskQueue {
  private readonly queue: Queue<BullTaskData>;

  constructor(redisUrl: string) {
    this.queue = new Queue<BullTaskData>(QUEUE_NAME, {
      connection: connectionFromUrl(redisUrl),
    });
  }

  async enqueue(taskId: string): Promise<void> {
    await this.queue.add(taskId, { taskId }, { removeOnComplete: 1000, removeOnFail: 1000 });
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export function createBullTaskWorker(redisUrl: string, processor: TaskProcessor): Worker<BullTaskData> {
  return new Worker<BullTaskData>(
    QUEUE_NAME,
    async (job) => {
      await processor.processTask(job.data.taskId);
    },
    {
      connection: connectionFromUrl(redisUrl),
      concurrency: 4,
    },
  );
}
