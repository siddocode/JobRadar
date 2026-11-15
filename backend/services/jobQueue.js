/**
 * Resilient In-Process / MongoDB-Backed Job Queue
 * Handles asynchronous background ingestion, batch candidate matching,
 * and scheduled autopilot tasks with exponential backoff and concurrency control.
 */

const QueueTask = require('../models/QueueTask');

// Registry of task execution handlers
const taskHandlers = {};

/**
 * Register a handler function for a specific taskType.
 */
function registerHandler(taskType, handlerFn) {
  taskHandlers[taskType] = handlerFn;
}

// Register default system handlers
registerHandler('job_ingestion', async (payload) => {
  const { runCollection } = require('../scripts/collect');
  return await runCollection(payload?.options);
});

registerHandler('autopilot_execution', async () => {
  const { runScheduledAutopilotBatch } = require('../controllers/autopilotController');
  return await runScheduledAutopilotBatch();
});

registerHandler('autopilot_user_run', async (payload) => {
  const { executeAutopilotPipelineForUser } = require('../controllers/autopilotController');
  return await executeAutopilotPipelineForUser(payload?.userId, payload?.options);
});

registerHandler('application_dispatch', async (payload) => {
  const { dispatchApplication } = require('./browserSubmissionService');
  return await dispatchApplication(payload?.applicationId, payload?.userId, payload?.options);
});

registerHandler('maintenance_cleanup', async (payload) => {
  return await runMaintenanceCleanup(payload);
});

registerHandler('portal_scan', async (payload) => {
  const { detectCompanyAts } = require('./atsDetector');
  return await detectCompanyAts(payload?.name, payload?.url);
});

/**
 * Enqueue a task to be processed asynchronously.
 */
async function enqueue(taskType, payload = {}, options = {}) {
  const task = new QueueTask({
    taskType,
    payload,
    priority: options.priority || 0,
    maxAttempts: options.maxAttempts || 3,
    scheduledFor: options.scheduledFor || new Date()
  });

  await task.save();
  return task;
}

/**
 * Fetch and process the next pending task.
 */
async function processNextTask() {
  const now = new Date();

  // Atomically find and mark a pending task as processing
  const task = await QueueTask.findOneAndUpdate(
    {
      status: 'pending',
      scheduledFor: { $lte: now }
    },
    {
      $set: {
        status: 'processing',
        startedAt: now
      },
      $inc: { attempts: 1 }
    },
    {
      sort: { priority: -1, scheduledFor: 1 },
      new: true
    }
  );

  if (!task) return null;

  const handler = taskHandlers[task.taskType];
  if (!handler) {
    task.status = 'failed';
    task.lastError = `No registered handler for taskType: ${task.taskType}`;
    task.finishedAt = new Date();
    await task.save();
    return task;
  }

  try {
    const result = await handler(task.payload, task);
    task.status = 'completed';
    task.finishedAt = new Date();
    task.payload = { ...task.payload, result };
    await task.save();
    return task;
  } catch (err) {
    const isExhausted = task.attempts >= task.maxAttempts;
    task.lastError = err.message || String(err);

    if (isExhausted) {
      task.status = 'failed';
      task.finishedAt = new Date();
    } else {
      // Exponential backoff: 30s * 2^(attempts-1)
      const delayMs = Math.min(30000 * Math.pow(2, task.attempts - 1), 600000);
      task.status = 'pending';
      task.scheduledFor = new Date(Date.now() + delayMs);
    }

    await task.save();
    return task;
  }
}

let workerInterval = null;

/**
 * Starts the in-process queue polling loop.
 */
function startQueueWorker(intervalMs = 4000) {
  if (workerInterval) return;

  console.log(`[JobQueue] Queue worker started (Poll interval: ${intervalMs}ms)`);
  workerInterval = setInterval(async () => {
    try {
      await processNextTask();
    } catch (err) {
      console.warn('[JobQueue] Error during task polling:', err.message);
    }
  }, intervalMs);
}

/**
 * Stops the queue polling loop.
 */
function stopQueueWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    console.log('[JobQueue] Queue worker stopped.');
  }
}

/**
 * Queue aggregate metrics for health checks and admin monitoring.
 */
async function getQueueStats() {
  const [counts, recentTasks] = await Promise.all([
    QueueTask.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]),
    QueueTask.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .lean()
  ]);

  const stats = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    total: 0
  };

  counts.forEach(c => {
    if (stats[c._id] !== undefined) {
      stats[c._id] = c.count;
    }
    stats.total += c.count;
  });

  return {
    stats,
    recentTasks
  };
}

/**
 * Safe 90-day job archival:
 * - Identifies jobs not refreshed/seen in >90 days.
 * - Safely marks them with status: 'archived' rather than deleting them,
 *   so that any existing Application record referencing jobId preserves complete
 *   application history, snapshots, and audit trails.
 */
async function archiveStaleJobs(daysThreshold = 90) {
  const Job = require('../models/Job');
  const cutoffDate = new Date(Date.now() - daysThreshold * 24 * 60 * 60 * 1000);

  const result = await Job.updateMany(
    {
      status: { $in: ['open', 'closed'] },
      lastSeenAt: { $lt: cutoffDate }
    },
    {
      $set: { status: 'archived' }
    }
  );

  return {
    cutoffDate,
    archivedCount: result.modifiedCount || 0
  };
}

/**
 * Safe cleanup of completed and failed background queue tasks:
 * - Leaves pending and processing tasks completely untouched.
 * - Deletes completed/failed tasks older than retention days (default: 7).
 * - Never deletes Application records or AutopilotRun audit events.
 */
async function cleanupOldQueueTasks(daysThreshold = 7) {
  const cutoffDate = new Date(Date.now() - daysThreshold * 24 * 60 * 60 * 1000);

  const result = await QueueTask.deleteMany({
    status: { $in: ['completed', 'failed'] },
    finishedAt: { $lt: cutoffDate }
  });

  return {
    cutoffDate,
    deletedCount: result.deletedCount || 0
  };
}

/**
 * End-to-end maintenance runner for scheduled or on-demand cleanup.
 */
async function runMaintenanceCleanup(options = {}) {
  const jobRetentionDays = options.jobRetentionDays || 90;
  const taskRetentionDays = options.taskRetentionDays || 7;

  const [jobArchival, taskCleanup] = await Promise.all([
    archiveStaleJobs(jobRetentionDays),
    cleanupOldQueueTasks(taskRetentionDays)
  ]);

  return {
    jobsArchived: jobArchival.archivedCount,
    jobCutoffDate: jobArchival.cutoffDate,
    tasksCleaned: taskCleanup.deletedCount,
    taskCutoffDate: taskCleanup.cutoffDate,
    executedAt: new Date()
  };
}

module.exports = {
  enqueue,
  processNextTask,
  registerHandler,
  startQueueWorker,
  stopQueueWorker,
  getQueueStats,
  archiveStaleJobs,
  cleanupOldQueueTasks,
  runMaintenanceCleanup
};
