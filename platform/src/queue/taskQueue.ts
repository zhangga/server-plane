export interface TaskQueue {
  enqueue(taskId: string): Promise<void>;
  healthCheck(): Promise<boolean>;
}
