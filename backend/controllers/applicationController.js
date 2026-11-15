const Application = require('../models/Application');
const Job = require('../models/Job');
const Company = require('../models/Company');
const UserPipeline = require('../models/UserPipeline');

/**
 * GET /api/applications
 * Query: status, q, page, limit, sortBy
 */
exports.getApplications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, q, page = 1, limit = 50, sortBy = 'updatedAt' } = req.query;

    const query = { userId };
    if (status && status !== 'all') {
      query.status = status;
    }

    if (q && q.trim()) {
      const regex = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [
        { jobTitle: regex },
        { companyName: regex },
        { location: regex },
        { notes: regex }
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const sortOption = {};
    if (sortBy === 'appliedAt') sortOption.appliedAt = -1;
    else if (sortBy === 'matchScore') sortOption.matchScore = -1;
    else sortOption.updatedAt = -1;

    const [applications, total] = await Promise.all([
      Application.find(query)
        .populate('jobId', 'source title location workMode applyUrl status fresherFriendly')
        .populate('companyId', 'name domain website logoUrl careersUrl')
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Application.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      applications,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1
    });
  } catch (err) {
    console.error('Error fetching applications:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve applications' });
  }
};

/**
 * GET /api/applications/stats
 */
exports.getApplicationStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const statsAgg = await Application.aggregate([
      { $match: { userId: new (require('mongoose').Types.ObjectId)(userId) } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const counts = {
      all: 0,
      discovered: 0,
      shortlisted: 0,
      resume_ready: 0,
      awaiting_approval: 0,
      applied: 0,
      assessment: 0,
      interview: 0,
      offer: 0,
      rejected: 0,
      withdrawn: 0
    };

    let total = 0;
    statsAgg.forEach(item => {
      if (counts[item._id] !== undefined) {
        counts[item._id] = item.count;
      }
      total += item.count;
    });
    counts.all = total;

    res.status(200).json({ success: true, stats: counts });
  } catch (err) {
    console.error('Error fetching application stats:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve application stats' });
  }
};

/**
 * POST /api/applications
 * Body: { jobId, companyId, jobTitle, companyName, location, applyUrl, status, notes, matchScore, tailoredResumeSnapshot }
 */
exports.createApplication = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      jobId,
      companyId,
      jobTitle,
      companyName,
      location = 'Unspecified',
      city = null,
      applyUrl = '',
      status = 'shortlisted',
      notes = '',
      matchScore = null,
      tailoredResumeSnapshot = null,
      screeningAnswers = null,
      submissionMethod = 'manual'
    } = req.body;

    if (!jobTitle || !companyName) {
      return res.status(400).json({ success: false, error: 'Job title and company name are required.' });
    }

    // Check if application for this job already exists
    if (jobId) {
      const existing = await Application.findOne({ userId, jobId });
      if (existing) {
        return res.status(409).json({
          success: false,
          error: `Application for "${jobTitle}" at "${companyName}" already exists.`,
          application: existing
        });
      }
    }

    const application = await Application.create({
      userId,
      jobId: jobId || null,
      companyId: companyId || null,
      jobTitle: jobTitle.trim(),
      companyName: companyName.trim(),
      location: location.trim(),
      city,
      applyUrl: applyUrl.trim(),
      status,
      matchScore,
      tailoredResumeSnapshot,
      screeningAnswers,
      submissionMethod,
      appliedAt: status === 'applied' ? new Date() : null,
      notes: notes.trim(),
      events: [
        {
          status,
          timestamp: new Date(),
          note: `Application created with status: ${status}`
        }
      ]
    });

    res.status(201).json({ success: true, application });
  } catch (err) {
    console.error('Error creating application:', err);
    res.status(500).json({ success: false, error: 'Failed to create application record' });
  }
};

/**
 * PATCH /api/applications/:id
 */
exports.updateApplication = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const {
      status,
      notes,
      confirmationNumber,
      screeningAnswers,
      tailoredResumeSnapshot,
      eventNote
    } = req.body;

    const application = await Application.findOne({ _id: id, userId });
    if (!application) {
      return res.status(404).json({ success: false, error: 'Application record not found' });
    }

    if (status !== undefined && status !== application.status) {
      application.status = status;
      if (status === 'applied' && !application.appliedAt) {
        application.appliedAt = new Date();
      }
      application.events.push({
        status,
        timestamp: new Date(),
        note: eventNote || `Status updated to ${status}`
      });
    }

    if (notes !== undefined) application.notes = String(notes);
    if (confirmationNumber !== undefined) application.confirmationNumber = String(confirmationNumber);
    if (screeningAnswers !== undefined) application.screeningAnswers = screeningAnswers;
    if (tailoredResumeSnapshot !== undefined) application.tailoredResumeSnapshot = tailoredResumeSnapshot;

    await application.save();

    res.status(200).json({ success: true, application });
  } catch (err) {
    console.error('Error updating application:', err);
    res.status(500).json({ success: false, error: 'Failed to update application' });
  }
};

/**
 * DELETE /api/applications/:id
 */
exports.deleteApplication = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const result = await Application.findOneAndDelete({ _id: id, userId });
    if (!result) {
      return res.status(404).json({ success: false, error: 'Application record not found' });
    }

    res.status(200).json({ success: true, message: 'Application deleted successfully' });
  } catch (err) {
    console.error('Error deleting application:', err);
    res.status(500).json({ success: false, error: 'Failed to delete application' });
  }
};

/**
 * POST /api/applications/migrate-pipeline
 * Backfills legacy UserPipeline entries into the new Application collection
 */
exports.migratePipelineToApplications = async (req, res) => {
  try {
    const userId = req.user.id;
    const pipelines = await UserPipeline.find({ userId }).populate('companyId').lean();

    let createdCount = 0;
    for (const pipe of pipelines) {
      if (!pipe.companyId) continue;
      const comp = pipe.companyId;

      // Status translation
      let appStatus = 'shortlisted';
      if (pipe.followUpStatus === 'contacted') appStatus = 'applied';
      else if (pipe.followUpStatus === 'replied') appStatus = 'interview';
      else if (pipe.followUpStatus === 'not_interested') appStatus = 'withdrawn';

      const existing = await Application.findOne({ userId, companyId: comp._id });
      if (!existing) {
        await Application.create({
          userId,
          companyId: comp._id,
          jobTitle: 'General Tech Candidate / Unlisted Role',
          companyName: comp.name,
          location: comp.locality || 'India',
          applyUrl: comp.careersUrl || comp.website || '',
          status: appStatus,
          notes: pipe.notes || '',
          events: [
            {
              status: appStatus,
              timestamp: pipe.updatedAt || new Date(),
              note: `Migrated from outreach pipeline: ${pipe.followUpStatus}`
            }
          ]
        });
        createdCount++;
      }
    }

    res.status(200).json({
      success: true,
      message: `Migrated ${createdCount} pipeline records to Applications`,
      count: createdCount
    });
  } catch (err) {
    console.error('Error migrating pipeline records:', err);
    res.status(500).json({ success: false, error: 'Migration failed' });
  }
};

/**
 * Stages an application with Autopilot (prefilled snapshot & ATS blueprint).
 * POST /api/applications/stage
 */
exports.stageApplication = async (req, res) => {
  try {
    const userId = req.user.id;
    const { jobId, submissionMode, notes, matchScore, status } = req.body;
    if (!jobId) {
      return res.status(400).json({ success: false, error: 'jobId is required to stage application.' });
    }
    const { stageApplication } = require('../services/browserSubmissionService');
    const application = await stageApplication(userId, jobId, {
      submissionMode,
      notes,
      matchScore,
      status
    });
    return res.status(200).json({
      success: true,
      application,
      message: 'Job staged with Autopilot prefilled snapshot.'
    });
  } catch (err) {
    console.error('[ApplicationController] Stage error:', err.message);
    return res.status(400).json({ success: false, error: err.message });
  }
};

/**
 * Dispatches an application (1-click assisted or automated dispatch).
 * POST /api/applications/:id/dispatch
 */
exports.dispatchApplication = async (req, res) => {
  try {
    const { dispatchApplication } = require('../services/browserSubmissionService');
    const result = await dispatchApplication(req.params.id, req.user.id, req.body);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('[ApplicationController] Dispatch error:', err.message);
    return res.status(400).json({ success: false, error: err.message });
  }
};

/**
 * Ingests a recruiter response email or text and matches to active application.
 * POST /api/applications/ingest-message
 */
exports.ingestRecruiterMessage = async (req, res) => {
  try {
    const { processRecruiterEmail } = require('../services/emailTrackingService');
    const result = await processRecruiterEmail(req.user.id, req.body);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('[ApplicationController] Recruiter email ingest error:', err.message);
    return res.status(400).json({ success: false, error: err.message });
  }
};

/**
 * Returns Google OAuth 2.0 authorization URL for read-only Gmail access.
 * GET /api/applications/gmail/auth-url
 */
exports.getGmailAuthUrl = (req, res) => {
  try {
    const { getGmailAuthUrl } = require('../services/emailTrackingService');
    const state = Buffer.from(JSON.stringify({ userId: req.user.id, timestamp: Date.now() })).toString('base64');
    const result = getGmailAuthUrl(state);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('[ApplicationController] Gmail auth URL error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * Handles Google OAuth 2.0 browser redirect callback.
 * GET /api/applications/gmail/callback?code=...&state=...
 */
exports.handleGmailCallback = async (req, res) => {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  try {
    const { code, state, error } = req.query;

    if (error) {
      console.warn('[ApplicationController] Google OAuth callback error query:', error);
      return res.redirect(`${clientUrl}/?tab=applications&gmail_error=${encodeURIComponent(error)}`);
    }

    if (!code) {
      return res.redirect(`${clientUrl}/?tab=applications&gmail_error=missing_code`);
    }

    // Determine target user from active session or state parameter
    let targetUserId = req.user?.id || null;
    if (!targetUserId && state) {
      try {
        const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
        if (decoded.userId) {
          targetUserId = decoded.userId;
        }
      } catch (_) {}
    }

    if (!targetUserId) {
      return res.redirect(`${clientUrl}/?tab=applications&gmail_error=unauthorized_session`);
    }

    const { exchangeGmailCode, fetchGmailUserProfile } = require('../services/emailTrackingService');
    const tokens = await exchangeGmailCode(code);

    let profileEmail = null;
    if (tokens.accessToken) {
      const profile = await fetchGmailUserProfile(tokens.accessToken);
      if (profile?.emailAddress) {
        profileEmail = profile.emailAddress;
      }
    }

    const User = require('../models/User');
    const user = await User.findById(targetUserId);
    if (user) {
      if (!user.candidateProfile) user.candidateProfile = {};
      const existingRefresh = user.candidateProfile.gmailIntegration?.refreshToken || null;
      user.candidateProfile.gmailIntegration = {
        connected: true,
        email: profileEmail || user.email,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken || existingRefresh,
        expiresAt: tokens.expiresAt,
        scope: tokens.scope,
        connectedAt: new Date(),
        lastSyncedAt: new Date()
      };
      user.markModified('candidateProfile');
      await user.save();
    }

    return res.redirect(`${clientUrl}/?tab=applications&gmail=connected`);
  } catch (err) {
    console.error('[ApplicationController] Gmail callback handling error:', err.message);
    return res.redirect(`${clientUrl}/?tab=applications&gmail_error=${encodeURIComponent(err.message)}`);
  }
};

/**
 * Exchanges Google OAuth 2.0 authorization code and associates credentials with user.
 * POST /api/applications/gmail/exchange
 */
exports.exchangeGmailAuthCode = async (req, res) => {
  try {
    const { code, redirectUri } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, error: 'Authorization code is required' });
    }
    const { exchangeGmailCode, fetchGmailUserProfile } = require('../services/emailTrackingService');
    const tokens = await exchangeGmailCode(code, redirectUri);

    let profileEmail = null;
    if (tokens.accessToken) {
      const profile = await fetchGmailUserProfile(tokens.accessToken);
      if (profile?.emailAddress) {
        profileEmail = profile.emailAddress;
      }
    }

    const User = require('../models/User');
    const user = await User.findById(req.user.id);
    if (user) {
      if (!user.candidateProfile) user.candidateProfile = {};
      const existingRefresh = user.candidateProfile.gmailIntegration?.refreshToken || null;
      user.candidateProfile.gmailIntegration = {
        connected: true,
        email: profileEmail || user.email,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken || existingRefresh,
        expiresAt: tokens.expiresAt,
        scope: tokens.scope,
        connectedAt: new Date(),
        lastSyncedAt: new Date()
      };
      user.markModified('candidateProfile');
      await user.save();
    }

    return res.status(200).json({
      success: true,
      connected: true,
      email: profileEmail || user?.email,
      message: 'Gmail successfully connected for recruiter response tracking.'
    });
  } catch (err) {
    console.error('[ApplicationController] Gmail exchange error:', err.message);
    return res.status(400).json({ success: false, error: err.message });
  }
};

/**
 * Gets Gmail integration configuration & connection status for current user.
 * GET /api/applications/gmail/status
 */
exports.getGmailStatus = async (req, res) => {
  try {
    const configured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    const User = require('../models/User');
    const user = await User.findById(req.user.id).select('email candidateProfile');
    const gmail = user?.candidateProfile?.gmailIntegration;

    const isConnected = Boolean(gmail && gmail.connected && (gmail.accessToken || gmail.refreshToken));

    return res.status(200).json({
      success: true,
      configured,
      connected: isConnected,
      email: gmail?.email || (isConnected ? user?.email : null),
      lastSyncedAt: gmail?.lastSyncedAt || null
    });
  } catch (err) {
    console.error('[ApplicationController] Gmail status error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * Scans recent candidate inbox messages from Gmail and advances matching applications.
 * POST /api/applications/gmail/sync
 */
exports.syncGmailInbox = async (req, res) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.user.id);
    const gmail = user?.candidateProfile?.gmailIntegration;

    if (!gmail || !gmail.connected) {
      return res.status(400).json({
        success: false,
        error: 'Gmail is not connected. Please connect your Gmail account first.'
      });
    }

    const { syncUserGmailInbox } = require('../services/emailTrackingService');
    const result = await syncUserGmailInbox(req.user.id, req.body || {});

    return res.status(200).json(result);
  } catch (err) {
    console.error('[ApplicationController] Gmail sync error:', err.message);
    return res.status(400).json({ success: false, error: err.message });
  }
};

/**
 * Synchronizes Gmail messages for all connected candidate accounts (Scheduled / Admin batch).
 * POST /api/applications/gmail/sync-all
 */
exports.syncAllConnectedGmailAccounts = async (req, res) => {
  try {
    const { runScheduledGmailSyncForAllUsers } = require('../services/emailTrackingService');
    const result = await runScheduledGmailSyncForAllUsers(req.body || {});
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('[ApplicationController] Gmail batch sync error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * Disconnects Gmail integration, revokes token with Google, and clears stored credentials.
 * POST /api/applications/gmail/disconnect
 */
exports.disconnectGmail = async (req, res) => {
  try {
    const User = require('../models/User');
    const { revokeGmailToken } = require('../services/emailTrackingService');
    const user = await User.findById(req.user.id);

    if (user && user.candidateProfile?.gmailIntegration) {
      const currentToken = user.candidateProfile.gmailIntegration.refreshToken || user.candidateProfile.gmailIntegration.accessToken;
      if (currentToken) {
        await revokeGmailToken(currentToken);
      }

      user.candidateProfile.gmailIntegration = {
        connected: false,
        email: null,
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
        lastSyncedAt: null,
        disconnectedAt: new Date()
      };
      user.markModified('candidateProfile');
      await user.save();
    }

    return res.status(200).json({
      success: true,
      connected: false,
      message: 'Gmail account successfully disconnected and access tokens cleared.'
    });
  } catch (err) {
    console.error('[ApplicationController] Gmail disconnect error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};




