const AutopilotConfig = require('../models/AutopilotConfig');
const AutopilotRun = require('../models/AutopilotRun');
const Application = require('../models/Application');
const Job = require('../models/Job');
const User = require('../models/User');
const { analyzeJobEligibility } = require('../services/eligibilityAnalyzer');
const { evaluateCandidateEligibility } = require('../services/eligibilityMatcher');
const { tailorCandidateResume } = require('../services/cvTailorService');

/**
 * GET /api/autopilot/config
 */
exports.getConfig = async (req, res) => {
  try {
    const userId = req.user.id;
    let config = await AutopilotConfig.findOne({ userId });
    if (!config) {
      config = await AutopilotConfig.create({ userId });
    }
    res.status(200).json({ success: true, config });
  } catch (err) {
    console.error('Error fetching autopilot config:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve autopilot configuration' });
  }
};

/**
 * PUT /api/autopilot/config
 */
exports.updateConfig = async (req, res) => {
  try {
    const userId = req.user.id;
    const updates = req.body;

    const allowedFields = [
      'enabled',
      'mode',
      'targetRoles',
      'preferredLocations',
      'workModes',
      'minMatchScore',
      'dailyLimit',
      'blacklistedCompanies',
      'autoTailorResume',
      'notifyOnSubmission'
    ];

    const sanitized = {};
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        sanitized[field] = updates[field];
      }
    }

    const config = await AutopilotConfig.findOneAndUpdate(
      { userId },
      { $set: sanitized },
      { new: true, upsert: true }
    );

    res.status(200).json({ success: true, config });
  } catch (err) {
    console.error('Error updating autopilot config:', err);
    res.status(500).json({ success: false, error: 'Failed to update autopilot configuration' });
  }
};

/**
 * GET /api/autopilot/runs
 */
exports.getRuns = async (req, res) => {
  try {
    const userId = req.user.id;
    const runs = await AutopilotRun.find({ userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    res.status(200).json({ success: true, runs });
  } catch (err) {
    console.error('Error fetching autopilot runs:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve autopilot run history' });
  }
};

/**
 * POST /api/autopilot/trigger
 * Manually or on-demand triggers the autopilot matching & staging engine
 */
exports.triggerRun = async (req, res) => {
  const userId = req.user.id;
  const startedAt = new Date();

  try {
    const [user, config] = await Promise.all([
      User.findById(userId).lean(),
      AutopilotConfig.findOne({ userId })
    ]);

    if (!user || !user.candidateProfile) {
      return res.status(400).json({
        success: false,
        error: 'Candidate profile required. Please upload your CV in the Profile tab first.'
      });
    }

    const currentConfig = config || {
      mode: 'assisted',
      minMatchScore: 70,
      dailyLimit: 5,
      targetRoles: [],
      preferredLocations: [],
      blacklistedCompanies: []
    };

    // Count applications created today
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const appsToday = await Application.countDocuments({
      userId,
      createdAt: { $gte: startOfDay }
    });

    const quotaRemaining = Math.max(0, (currentConfig.dailyLimit || 5) - appsToday);
    if (quotaRemaining <= 0) {
      return res.status(200).json({
        success: true,
        message: `Daily application limit (${currentConfig.dailyLimit}) reached for today. Autopilot will resume tomorrow.`,
        applicationsStaged: 0,
        quotaRemaining: 0
      });
    }

    // Find candidate open jobs not already in Application collection
    const existingJobIds = await Application.find({ userId }).distinct('jobId');

    const jobQuery = {
      status: 'open',
      _id: { $nin: existingJobIds }
    };

    if (currentConfig.blacklistedCompanies?.length > 0) {
      const blacklistRegexes = currentConfig.blacklistedCompanies.map(c => new RegExp(c.trim(), 'i'));
      jobQuery.company = { $nin: blacklistRegexes };
    }

    const openJobs = await Job.find(jobQuery)
      .sort({ lastSeenAt: -1 })
      .limit(60)
      .lean();

    let jobsEvaluated = 0;
    let applicationsCreated = 0;
    const actions = [];

    for (const job of openJobs) {
      if (applicationsCreated >= quotaRemaining) break;
      jobsEvaluated++;

      // 1. Evaluate job requirements & candidate match
      const jobEligibility = analyzeJobEligibility(job);
      const matchEval = evaluateCandidateEligibility(jobEligibility, user.candidateProfile);

      if (!matchEval) continue;

      const score = matchEval.overallScore || 0;
      const isHardBlocker = matchEval.isHardBlocker || false;

      // Skip hard blockers (e.g. US work auth required for India-based candidate)
      if (isHardBlocker) {
        actions.push({
          action: 'evaluated',
          jobId: job._id,
          jobTitle: job.title,
          companyName: job.company,
          status: 'blocked',
          reason: matchEval.executiveSummary || 'Hard work authorization or location blocker',
          timestamp: new Date()
        });
        continue;
      }

      // Check minimum match score threshold
      if (score < (currentConfig.minMatchScore || 70)) {
        actions.push({
          action: 'evaluated',
          jobId: job._id,
          jobTitle: job.title,
          companyName: job.company,
          status: 'skipped',
          reason: `Score ${score}% below minimum threshold (${currentConfig.minMatchScore}%)`,
          timestamp: new Date()
        });
        continue;
      }

      // 2. Prepare tailored resume packet
      let tailoredResume = null;
      try {
        const tailoredRes = tailorCandidateResume({
          candidateProfile: user.candidateProfile,
          rawCvText: user.candidateProfile.rawCvText || '',
          job,
          jobEligibility
        });
        tailoredResume = tailoredRes?.tailoredResume;
      } catch (err) {
        console.warn('Auto-tailoring warning:', err.message);
      }

      // 3. Stage application
      const targetStatus = currentConfig.mode === 'autonomous' ? 'awaiting_approval' : 'awaiting_approval'; // Always stage to awaiting_approval for verified human safety
      const app = await Application.create({
        userId,
        jobId: job._id,
        companyId: job.companyId || null,
        jobTitle: job.title,
        companyName: job.company,
        location: job.location || 'India',
        city: job.city || null,
        applyUrl: job.applyUrl,
        status: targetStatus,
        matchScore: score,
        tailoredResumeSnapshot: tailoredResume,
        submissionMethod: currentConfig.mode === 'autonomous' ? 'autonomous' : 'assisted',
        notes: `Autopilot matched: ${score}% match. ${matchEval.executiveSummary || ''}`,
        events: [
          {
            status: targetStatus,
            timestamp: new Date(),
            note: `Autopilot staged opportunity (${score}% match score)`
          }
        ]
      });

      applicationsCreated++;
      actions.push({
        action: 'staged',
        jobId: job._id,
        jobTitle: job.title,
        companyName: job.company,
        status: 'prepared',
        reason: `Successfully prepared application with ${score}% match score`,
        timestamp: new Date()
      });
    }

    // Record execution run
    const run = await AutopilotRun.create({
      userId,
      startedAt,
      finishedAt: new Date(),
      status: 'completed',
      jobsEvaluated,
      applicationsCreated,
      applicationsSubmitted: 0,
      actions
    });

    if (config) {
      config.lastRunAt = new Date();
      await config.save();
    }

    res.status(200).json({
      success: true,
      message: `Autopilot evaluated ${jobsEvaluated} jobs and staged ${applicationsCreated} applications.`,
      jobsEvaluated,
      applicationsCreated,
      quotaRemaining: quotaRemaining - applicationsCreated,
      run
    });
  } catch (err) {
    console.error('Autopilot run error:', err);
    res.status(500).json({ success: false, error: 'Autopilot run failed: ' + err.message });
  }
};

/**
 * Scheduled Autopilot Batch Runner
 * Invoked by background cron scheduler for all users with enabled: true
 */
exports.runScheduledAutopilotBatch = async () => {
  try {
    const activeConfigs = await AutopilotConfig.find({ enabled: true });
    if (!activeConfigs || activeConfigs.length === 0) {
      console.log('[AutopilotScheduler] No active autopilot subscribers.');
      return;
    }

    console.log(`[AutopilotScheduler] Processing ${activeConfigs.length} active autopilot subscribers...`);
    for (const config of activeConfigs) {
      try {
        const user = await User.findById(config.userId).lean();
        if (!user || !user.candidateProfile) continue;

        // Count applications created today
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const appsToday = await Application.countDocuments({
          userId: config.userId,
          createdAt: { $gte: startOfDay }
        });

        const quotaRemaining = Math.max(0, (config.dailyLimit || 5) - appsToday);
        if (quotaRemaining <= 0) continue;

        const existingJobIds = await Application.find({ userId: config.userId }).distinct('jobId');
        const jobQuery = {
          status: 'open',
          _id: { $nin: existingJobIds }
        };

        if (config.blacklistedCompanies?.length > 0) {
          const blacklistRegexes = config.blacklistedCompanies.map(c => new RegExp(c.trim(), 'i'));
          jobQuery.company = { $nin: blacklistRegexes };
        }

        const openJobs = await Job.find(jobQuery)
          .sort({ lastSeenAt: -1 })
          .limit(40)
          .lean();

        let stagedCount = 0;
        const actions = [];

        for (const job of openJobs) {
          if (stagedCount >= quotaRemaining) break;

          const jobEligibility = analyzeJobEligibility(job);
          const matchEval = evaluateCandidateEligibility(jobEligibility, user.candidateProfile);
          if (!matchEval || matchEval.isHardBlocker) continue;

          const score = matchEval.overallScore || 0;
          if (score < (config.minMatchScore || 70)) continue;

          let tailoredResume = null;
          try {
            const tailoredRes = tailorCandidateResume({
              candidateProfile: user.candidateProfile,
              rawCvText: user.candidateProfile.rawCvText || '',
              job,
              jobEligibility
            });
            tailoredResume = tailoredRes?.tailoredResume;
          } catch (_) {}

          await Application.create({
            userId: config.userId,
            jobId: job._id,
            companyId: job.companyId || null,
            jobTitle: job.title,
            companyName: job.company,
            location: job.location || 'India',
            city: job.city || null,
            applyUrl: job.applyUrl,
            status: 'awaiting_approval',
            matchScore: score,
            tailoredResumeSnapshot: tailoredResume,
            submissionMethod: config.mode === 'autonomous' ? 'autonomous' : 'assisted',
            notes: `Autopilot scheduled match: ${score}% fit.`,
            events: [
              {
                status: 'awaiting_approval',
                timestamp: new Date(),
                note: `Autopilot scheduled screening (${score}% match)`
              }
            ]
          });

          stagedCount++;
          actions.push({
            action: 'staged',
            jobId: job._id,
            jobTitle: job.title,
            companyName: job.company,
            status: 'prepared',
            reason: `Scheduled match with ${score}% score`,
            timestamp: new Date()
          });
        }

        if (stagedCount > 0) {
          await AutopilotRun.create({
            userId: config.userId,
            startedAt: new Date(),
            finishedAt: new Date(),
            status: 'completed',
            jobsEvaluated: openJobs.length,
            applicationsCreated: stagedCount,
            applicationsSubmitted: 0,
            actions
          });
          config.lastRunAt = new Date();
          await config.save();
        }
      } catch (userErr) {
        console.warn(`[AutopilotScheduler] Failed for user ${config.userId}:`, userErr.message);
      }
    }
  } catch (batchErr) {
    console.error('[AutopilotScheduler] Batch failure:', batchErr.message);
  }
};


