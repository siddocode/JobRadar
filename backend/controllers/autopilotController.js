const AutopilotConfig = require('../models/AutopilotConfig');
const AutopilotRun = require('../models/AutopilotRun');
const Application = require('../models/Application');
const Job = require('../models/Job');
const User = require('../models/User');
const { analyzeJobEligibility } = require('../services/eligibilityAnalyzer');
const { evaluateCandidateEligibility } = require('../services/eligibilityMatcher');
const { tailorCandidateResume } = require('../services/cvTailorService');
const { generateFormBlueprint } = require('../workers/browserWorker');
const { dispatchApplication } = require('../services/browserSubmissionService');

/**
 * Normalizes role match against configured target role keywords.
 */
function matchesTargetRoles(jobTitle, roleFamily, targetRoles = []) {
  if (!targetRoles || targetRoles.length === 0) return true;
  const lowerTitle = (jobTitle || '').toLowerCase();
  const lowerFamily = (roleFamily || '').toLowerCase();

  return targetRoles.some(target => {
    const term = target.toLowerCase().trim();
    if (!term) return false;
    if (lowerTitle.includes(term)) return true;

    // Family heuristic matching
    if (term.includes('software') || term.includes('sde') || term.includes('developer') || term.includes('engineer')) {
      if (lowerFamily.includes('sde') || lowerFamily.includes('dev')) return true;
    }
    if (term.includes('frontend') && (lowerTitle.includes('front') || lowerTitle.includes('react') || lowerTitle.includes('ui'))) return true;
    if (term.includes('backend') && (lowerTitle.includes('back') || lowerTitle.includes('node') || lowerTitle.includes('api'))) return true;
    if (term.includes('fullstack') || term.includes('full stack')) {
      if (lowerTitle.includes('fullstack') || lowerTitle.includes('full stack') || lowerTitle.includes('full-stack')) return true;
    }
    return false;
  });
}

/**
 * Evaluates whether job matches candidate's preferred location filters.
 */
function matchesPreferredLocations(job, preferredLocations = []) {
  if (!preferredLocations || preferredLocations.length === 0) return true;
  if (preferredLocations.some(l => l.toLowerCase() === 'all india' || l.toLowerCase() === 'all')) return true;

  const jobLoc = (job.location || '').toLowerCase();
  const jobCity = (job.city || '').toLowerCase();
  const jobCountry = (job.country || '').toLowerCase();
  const isRemote = job.workMode === 'remote' || jobLoc.includes('remote');

  return preferredLocations.some(pref => {
    const term = pref.toLowerCase().trim();
    if (!term) return false;
    if (term === 'remote' && isRemote) return true;
    if (jobCity.includes(term) || jobLoc.includes(term) || jobCountry.includes(term)) return true;
    return false;
  });
}

/**
 * Checks whether company is blacklisted by user.
 */
function isBlacklisted(companyName, blacklistedCompanies = []) {
  if (!blacklistedCompanies || blacklistedCompanies.length === 0) return false;
  const lowerComp = (companyName || '').toLowerCase().trim();
  return blacklistedCompanies.some(b => {
    const term = b.toLowerCase().trim();
    return term && lowerComp.includes(term);
  });
}

/**
 * Core End-to-End Autopilot Pipeline Execution Engine
 *
 * Pipeline sequence:
 * 1. Job Discovery & Deduplication
 * 2. Eligibility & Hard Blocker Verification
 * 3. Preference Matching (Roles, Locations, Salary, Work Modes)
 * 4. Match Scoring & Minimum Threshold Filtering
 * 5. Resume Tailoring (Truthfulness Invariant: no hallucinated credentials)
 * 6. Application Preparation (ATS blueprint & prefilled fields)
 * 7. Approval / Authorised Submission (Assisted 1-click or Autonomous dispatch with anti-bot safety)
 * 8. Confirmation & Timeline Event Tracking
 */
async function executeAutopilotPipelineForUser(userId, options = {}) {
  const startedAt = new Date();

  const [user, userConfig] = await Promise.all([
    User.findById(userId).lean(),
    AutopilotConfig.findOne({ userId })
  ]);

  if (!user || !user.candidateProfile) {
    throw new Error('Candidate profile required. Please upload your CV in the Profile tab first.');
  }

  const config = userConfig || {
    enabled: true,
    status: 'active',
    mode: 'assisted',
    minMatchScore: 70,
    dailyLimit: 5,
    targetRoles: ['Software Engineer', 'Full Stack Developer', 'Backend Engineer'],
    preferredLocations: ['All India'],
    workModes: ['remote', 'hybrid', 'onsite'],
    salaryPreferences: { minSalary: 0, currency: 'INR', period: 'yearly' },
    blacklistedCompanies: [],
    autoTailorResume: true,
    notifyOnSubmission: true
  };

  // 1. Daily Application Limit / Quota Enforcement
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const appsToday = await Application.countDocuments({
    userId,
    createdAt: { $gte: startOfDay }
  });

  const dailyLimit = config.dailyLimit || 5;
  const quotaRemaining = Math.max(0, dailyLimit - appsToday);

  if (quotaRemaining <= 0) {
    return {
      message: `Daily application limit (${dailyLimit}) reached for today. Autopilot will resume tomorrow.`,
      jobsEvaluated: 0,
      applicationsCreated: 0,
      applicationsSubmitted: 0,
      quotaRemaining: 0,
      actions: []
    };
  }

  // 2. Job Discovery & Cross-Source Deduplication
  const existingJobIds = await Application.find({ userId }).distinct('jobId');
  const existingApps = await Application.find({ userId }).select('companyName jobTitle').lean();
  const existingSignatures = new Set(
    existingApps.map(a => `${(a.companyName || '').toLowerCase().trim()}:::${(a.jobTitle || '').toLowerCase().trim()}`)
  );

  const jobQuery = {
    status: 'open',
    _id: { $nin: existingJobIds }
  };

  if (config.blacklistedCompanies?.length > 0) {
    const blacklistRegexes = config.blacklistedCompanies
      .filter(Boolean)
      .map(c => new RegExp(c.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    if (blacklistRegexes.length > 0) {
      jobQuery.company = { $nin: blacklistRegexes };
    }
  }

  if (config.workModes?.length > 0 && !config.workModes.includes('all')) {
    jobQuery.$or = [
      { workMode: { $in: config.workModes } },
      { workMode: 'unknown' }
    ];
  }

  const openJobs = await Job.find(jobQuery)
    .sort({ lastSeenAt: -1, createdAt: -1 })
    .limit(80)
    .lean();

  let jobsEvaluated = 0;
  let applicationsCreated = 0;
  let applicationsSubmitted = 0;
  const actions = [];

  for (const job of openJobs) {
    if (applicationsCreated >= quotaRemaining) break;
    jobsEvaluated++;

    // Deduplication check across company + title signature
    const sig = `${(job.company || '').toLowerCase().trim()}:::${(job.title || '').toLowerCase().trim()}`;
    if (existingSignatures.has(sig)) {
      actions.push({
        action: 'evaluated',
        jobId: job._id,
        jobTitle: job.title,
        companyName: job.company,
        status: 'skipped',
        reason: 'Duplicate application already exists for this role and company',
        timestamp: new Date()
      });
      continue;
    }

    // Blacklist check
    if (isBlacklisted(job.company, config.blacklistedCompanies)) {
      actions.push({
        action: 'evaluated',
        jobId: job._id,
        jobTitle: job.title,
        companyName: job.company,
        status: 'blocked',
        reason: 'Company is in user exclusion/blacklist',
        timestamp: new Date()
      });
      continue;
    }

    // Target roles check
    if (config.targetRoles?.length > 0) {
      const isRoleMatch = matchesTargetRoles(job.title, job.roleFamily, config.targetRoles);
      if (!isRoleMatch) {
        actions.push({
          action: 'evaluated',
          jobId: job._id,
          jobTitle: job.title,
          companyName: job.company,
          status: 'skipped',
          reason: `Role does not match target roles: [${config.targetRoles.join(', ')}]`,
          timestamp: new Date()
        });
        continue;
      }
    }

    // Location preferences check
    if (config.preferredLocations?.length > 0) {
      const isLocMatch = matchesPreferredLocations(job, config.preferredLocations);
      if (!isLocMatch) {
        actions.push({
          action: 'evaluated',
          jobId: job._id,
          jobTitle: job.title,
          companyName: job.company,
          status: 'skipped',
          reason: `Location "${job.location || job.city}" outside preferred locations`,
          timestamp: new Date()
        });
        continue;
      }
    }

    // Salary preferences check
    if (config.salaryPreferences?.minSalary > 0) {
      if (job.salaryMax && job.salaryMax < config.salaryPreferences.minSalary) {
        actions.push({
          action: 'evaluated',
          jobId: job._id,
          jobTitle: job.title,
          companyName: job.company,
          status: 'skipped',
          reason: `Salary cap (${job.salaryMax}) below candidate minimum (${config.salaryPreferences.minSalary})`,
          timestamp: new Date()
        });
        continue;
      }
    }

    // 3. Eligibility & Hard Blocker Analysis
    const jobEligibility = analyzeJobEligibility(job);
    const matchEval = evaluateCandidateEligibility(jobEligibility, user.candidateProfile);
    if (!matchEval) continue;

    const score = matchEval.overallScore || matchEval.overall?.score || 0;
    const isHardBlocker = matchEval.isHardBlocker || matchEval.overall?.isHardBlocker || false;

    if (isHardBlocker) {
      actions.push({
        action: 'evaluated',
        jobId: job._id,
        jobTitle: job.title,
        companyName: job.company,
        status: 'blocked',
        reason: matchEval.executiveSummary || 'Hard work authorization or residency blocker',
        timestamp: new Date()
      });
      continue;
    }

    // 4. Match Score Threshold
    const minScore = config.minMatchScore !== undefined ? config.minMatchScore : 70;
    if (score < minScore) {
      actions.push({
        action: 'evaluated',
        jobId: job._id,
        jobTitle: job.title,
        companyName: job.company,
        status: 'skipped',
        reason: `Match score ${score}% is below minimum threshold (${minScore}%)`,
        timestamp: new Date()
      });
      continue;
    }

    // 5. Resume Tailoring (Truthfulness Invariant: highlight verified candidate skills without fabricating credentials)
    let tailoredResume = null;
    let resumeSnapshot = null;
    if (config.autoTailorResume !== false) {
      try {
        const tailoredRes = tailorCandidateResume({
          candidateProfile: user.candidateProfile,
          rawCvText: user.candidateProfile.rawCvText || '',
          job,
          jobEligibility
        });
        tailoredResume = tailoredRes?.tailoredResume || tailoredRes?.resume || null;
        resumeSnapshot = {
          tailoredText: JSON.stringify(tailoredResume),
          resumeData: tailoredResume,
          tailoredAt: new Date()
        };
      } catch (err) {
        console.warn('[Autopilot] CV tailor error:', err.message);
      }
    }

    // 6. Application Preparation (ATS blueprint generation & prefilling)
    const atsType = job.source || 'greenhouse';
    const blueprint = generateFormBlueprint(atsType, job.applyUrl, user.candidateProfile, job);
    const matchSummary = matchEval.executiveSummary || `${score}% match for ${job.title}`;
    const initialStatus = 'awaiting_approval';

    const application = await Application.create({
      userId,
      jobId: job._id,
      companyId: job.companyId || null,
      jobTitle: job.title,
      companyName: job.company,
      location: job.location || job.city || 'India',
      city: job.city || null,
      applyUrl: job.applyUrl || '',
      status: initialStatus,
      matchScore: score,
      tailoredResumeSnapshot: tailoredResume,
      resumeSnapshot,
      prefilledData: blueprint.prefilledFields,
      screeningAnswers: blueprint.screeningAnswers,
      submissionMethod: config.mode === 'autonomous' ? 'autonomous' : 'assisted',
      submissionMode: config.mode === 'autonomous' ? 'autonomous_browser' : 'assisted_browser',
      notes: `Autopilot matched: ${score}% fit. ${matchSummary}`,
      events: [
        {
          status: initialStatus,
          timestamp: new Date(),
          note: `Autopilot prepared application with tailored resume (${score}% match score)`
        }
      ]
    });

    existingSignatures.add(sig);

    // 7. Approval / Authorised Submission
    if (config.mode === 'autonomous') {
      try {
        const dispatchResult = await dispatchApplication(application._id, userId);

        if (dispatchResult.halted && dispatchResult.requiresHumanVerification) {
          // Strict Safety Invariant: CAPTCHA/Turnstile challenge encountered.
          // Never attempt bypass. Safely flag for 1-click human verification dispatch.
          applicationsCreated++;
          actions.push({
            action: 'staged',
            jobId: job._id,
            jobTitle: job.title,
            companyName: job.company,
            status: 'human_verification_required',
            reason: `Anti-bot challenge (${dispatchResult.challengeType || 'CAPTCHA'}) detected. Safely flagged for 1-click human verification.`,
            timestamp: new Date()
          });
        } else if (dispatchResult.success && !dispatchResult.halted) {
          applicationsCreated++;
          applicationsSubmitted++;
          actions.push({
            action: 'submitted',
            jobId: job._id,
            jobTitle: job.title,
            companyName: job.company,
            status: 'applied',
            reason: `Dispatched submission via ${atsType} blueprint automation`,
            timestamp: new Date()
          });
        } else {
          applicationsCreated++;
          actions.push({
            action: 'staged',
            jobId: job._id,
            jobTitle: job.title,
            companyName: job.company,
            status: 'prepared',
            reason: 'Application prepared and staged under Awaiting Approval',
            timestamp: new Date()
          });
        }
      } catch (dispatchErr) {
        console.warn('[Autopilot] Dispatch error:', dispatchErr.message);
        applicationsCreated++;
        actions.push({
          action: 'staged',
          jobId: job._id,
          jobTitle: job.title,
          companyName: job.company,
          status: 'prepared',
          reason: `Prepared with ${score}% match. Dispatch error: ${dispatchErr.message}`,
          timestamp: new Date()
        });
      }
    } else {
      // Assisted Mode: Staged under awaiting_approval for 1-click candidate review
      applicationsCreated++;
      actions.push({
        action: 'staged',
        jobId: job._id,
        jobTitle: job.title,
        companyName: job.company,
        status: 'prepared',
        reason: `Prepared application with tailored resume packet (${score}% match score) staged for review`,
        timestamp: new Date()
      });
    }
  }

  // 8. Execution Telemetry & Audit Log
  const run = await AutopilotRun.create({
    userId,
    startedAt,
    finishedAt: new Date(),
    status: 'completed',
    jobsEvaluated,
    applicationsCreated,
    applicationsSubmitted,
    actions
  });

  if (userConfig) {
    userConfig.lastRunAt = new Date();
    await userConfig.save();
  }

  return {
    message: `Autopilot evaluated ${jobsEvaluated} opportunities, staged ${applicationsCreated} applications (${applicationsSubmitted} submitted).`,
    jobsEvaluated,
    applicationsCreated,
    applicationsSubmitted,
    quotaRemaining: Math.max(0, quotaRemaining - applicationsCreated),
    run
  };
}

/**
 * GET /api/autopilot/config
 */
exports.getConfig = async (req, res) => {
  try {
    const userId = req.user.id;
    let config = await AutopilotConfig.findOne({ userId });
    if (!config) {
      config = await AutopilotConfig.create({
        userId,
        enabled: false,
        status: 'paused',
        mode: 'assisted',
        targetRoles: ['Software Engineer', 'Full Stack Developer', 'Backend Engineer'],
        preferredLocations: ['All India'],
        workModes: ['remote', 'hybrid', 'onsite'],
        salaryPreferences: { minSalary: 0, currency: 'INR', period: 'yearly' },
        minMatchScore: 70,
        dailyLimit: 5
      });
    }
    res.status(200).json({ success: true, config });
  } catch (err) {
    console.error('Error fetching autopilot config:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve autopilot configuration' });
  }
};

/**
 * PUT /api/autopilot/config
 * Updates configuration with full support for target roles, locations, salary, quotas, and state.
 */
exports.updateConfig = async (req, res) => {
  try {
    const userId = req.user.id;
    const updates = req.body;

    const allowedFields = [
      'enabled',
      'status',
      'mode',
      'targetRoles',
      'preferredLocations',
      'workModes',
      'salaryPreferences',
      'minSalary',
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

    // Support minSalary shortcut
    if (updates.minSalary !== undefined) {
      sanitized.salaryPreferences = {
        minSalary: Number(updates.minSalary) || 0,
        currency: updates.salaryPreferences?.currency || 'INR',
        period: updates.salaryPreferences?.period || 'yearly'
      };
    }

    // Synchronize enabled and status
    if (sanitized.status !== undefined) {
      if (sanitized.status === 'active') {
        sanitized.enabled = true;
      } else {
        sanitized.enabled = false;
      }
    } else if (sanitized.enabled !== undefined) {
      sanitized.status = sanitized.enabled ? 'active' : 'paused';
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
 * POST /api/autopilot/pause
 * Pauses autopilot execution.
 */
exports.pauseAutopilot = async (req, res) => {
  try {
    const userId = req.user.id;
    const config = await AutopilotConfig.findOneAndUpdate(
      { userId },
      { $set: { status: 'paused', enabled: false } },
      { new: true, upsert: true }
    );
    res.status(200).json({
      success: true,
      message: 'Autopilot paused successfully.',
      config
    });
  } catch (err) {
    console.error('Error pausing autopilot:', err);
    res.status(500).json({ success: false, error: 'Failed to pause autopilot' });
  }
};

/**
 * POST /api/autopilot/resume
 * Resumes autopilot execution into active state.
 */
exports.resumeAutopilot = async (req, res) => {
  try {
    const userId = req.user.id;
    const config = await AutopilotConfig.findOneAndUpdate(
      { userId },
      { $set: { status: 'active', enabled: true } },
      { new: true, upsert: true }
    );
    res.status(200).json({
      success: true,
      message: 'Autopilot resumed and active.',
      config
    });
  } catch (err) {
    console.error('Error resuming autopilot:', err);
    res.status(500).json({ success: false, error: 'Failed to resume autopilot' });
  }
};

/**
 * POST /api/autopilot/stop
 * Completely stops autopilot execution.
 */
exports.stopAutopilot = async (req, res) => {
  try {
    const userId = req.user.id;
    const config = await AutopilotConfig.findOneAndUpdate(
      { userId },
      { $set: { status: 'stopped', enabled: false } },
      { new: true, upsert: true }
    );
    res.status(200).json({
      success: true,
      message: 'Autopilot stopped.',
      config
    });
  } catch (err) {
    console.error('Error stopping autopilot:', err);
    res.status(500).json({ success: false, error: 'Failed to stop autopilot' });
  }
};

/**
 * GET /api/autopilot/runs
 * Returns recent execution runs for user.
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
 * On-demand execution of the end-to-end pipeline.
 */
exports.triggerRun = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await executeAutopilotPipelineForUser(userId);
    res.status(200).json({
      success: true,
      ...result
    });
  } catch (err) {
    console.error('Autopilot trigger run error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/autopilot/status
 * Telemetry endpoint returning engine status, queue metrics, and active subscribers.
 */
exports.getEngineStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const { getQueueStats } = require('../services/jobQueue');

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [activeSubscribers, userConfig, appsToday, queueMetrics] = await Promise.all([
      AutopilotConfig.countDocuments({ enabled: true, status: 'active' }),
      AutopilotConfig.findOne({ userId }).lean(),
      Application.countDocuments({ userId, createdAt: { $gte: startOfDay } }),
      getQueueStats()
    ]);

    const dailyLimit = userConfig?.dailyLimit || 5;

    res.status(200).json({
      success: true,
      engineOnline: true,
      activeSubscribers,
      userConfig: userConfig || null,
      quota: {
        dailyLimit,
        appsToday,
        quotaRemaining: Math.max(0, dailyLimit - appsToday)
      },
      queue: queueMetrics
    });
  } catch (err) {
    console.error('Error fetching autopilot status:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve engine status' });
  }
};

/**
 * POST /api/autopilot/maintenance
 * Triggers safe 90-day job archival and old queue task cleanup.
 */
exports.triggerMaintenance = async (req, res) => {
  try {
    const { runMaintenanceCleanup } = require('../services/jobQueue');
    const result = await runMaintenanceCleanup({
      jobRetentionDays: parseInt(req.body?.jobRetentionDays, 10) || 90,
      taskRetentionDays: parseInt(req.body?.taskRetentionDays, 10) || 7
    });

    res.status(200).json({
      success: true,
      message: `Maintenance completed: ${result.jobsArchived} stale jobs archived, ${result.tasksCleaned} old queue tasks cleaned.`,
      result
    });
  } catch (err) {
    console.error('Error triggering maintenance:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * Scheduled Autopilot Batch Runner
 * Executed periodically by in-app cron scheduler for all active subscribers.
 */
exports.runScheduledAutopilotBatch = async () => {
  try {
    const activeConfigs = await AutopilotConfig.find({
      enabled: true,
      status: 'active'
    });

    if (!activeConfigs || activeConfigs.length === 0) {
      console.log('[AutopilotScheduler] No active autopilot subscribers.');
      return;
    }

    console.log(`[AutopilotScheduler] Processing ${activeConfigs.length} active autopilot subscribers...`);
    for (const config of activeConfigs) {
      try {
        await executeAutopilotPipelineForUser(config.userId);
      } catch (userErr) {
        console.warn(`[AutopilotScheduler] Failed for user ${config.userId}:`, userErr.message);
      }
    }
    console.log('[AutopilotScheduler] Scheduled batch completed.');
  } catch (batchErr) {
    console.error('[AutopilotScheduler] Batch failure:', batchErr.message);
  }
};

// Export helper for background queue worker
exports.executeAutopilotPipelineForUser = executeAutopilotPipelineForUser;
