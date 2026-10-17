const storage = require('./storage');
const downloader = require('./downloader');

class QueueManager {
  constructor() {
    this.timer = null;
    this.init();
  }

  init() {
    // Listen for task completion or errors to start next item
    downloader.on('task-completed', () => this.processQueues());
    downloader.on('task-error', () => this.processQueues());
    downloader.on('task-paused', () => this.processQueues());

    // Check schedules every 10 seconds
    this.timer = setInterval(() => this.checkSchedules(), 10000);
  }

  processQueues() {
    const tasks = storage.getTasks();
    const queues = storage.getQueues();

    for (const queue of queues) {
      const queueTasks = tasks.filter(t => t.queueId === queue.id);
      const activeTasks = queueTasks.filter(t => t.status === 'downloading');
      const pendingTasks = queueTasks.filter(t => t.status === 'queued');

      const slotsAvailable = queue.maxConcurrent - activeTasks.length;

      if (slotsAvailable > 0 && pendingTasks.length > 0) {
        const toStart = pendingTasks.slice(0, slotsAvailable);
        for (const task of toStart) {
          downloader.startTask(task).catch(err => {
            console.error(`Failed to auto-start queued task ${task.id}:`, err.message);
          });
        }
      }
    }
  }

  checkSchedules() {
    const now = new Date();
    const currentHours = String(now.getHours()).padStart(2, '0');
    const currentMinutes = String(now.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${currentHours}:${currentMinutes}`;
    const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay(); // 1=Mon .. 7=Sun

    const queues = storage.getQueues();
    for (const queue of queues) {
      if (!queue.isScheduled) continue;
      if (!queue.daysOfWeek.includes(dayOfWeek)) continue;

      if (currentTimeStr === queue.startTime) {
        // Start queue
        console.log(`[Scheduler] Starting scheduled queue: ${queue.name}`);
        this.startQueue(queue.id);
      } else if (currentTimeStr === queue.stopTime) {
        // Stop queue
        console.log(`[Scheduler] Stopping scheduled queue: ${queue.name}`);
        this.stopQueue(queue.id);
      }
    }
  }

  startQueue(queueId) {
    const tasks = storage.getTasks();
    const queueTasks = tasks.filter(t => t.queueId === queueId && (t.status === 'paused' || t.status === 'queued'));
    for (const t of queueTasks) {
      t.status = 'queued';
      storage.upsertTask(t);
    }
    this.processQueues();
  }

  stopQueue(queueId) {
    const tasks = storage.getTasks();
    const activeQueueTasks = tasks.filter(t => t.queueId === queueId && t.status === 'downloading');
    for (const t of activeQueueTasks) {
      downloader.pauseTask(t.id);
    }
  }
}

module.exports = new QueueManager();
