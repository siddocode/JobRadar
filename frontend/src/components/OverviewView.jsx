import React, { useState, useEffect, useCallback } from 'react';
import {
  Briefcase,
  Layers,
  Sparkles,
  Bot,
  ArrowRight,
  Building2,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Target,
  Zap,
  Loader2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './OverviewView.css';

/** Subtle rolling hills SVG landscape for the welcome card. */
function WelcomeLandscapeSvg() {
  return (
    <svg viewBox="0 0 460 160" fill="none" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ovHill1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1E4B41" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#13362E" stopOpacity="0.25" />
        </linearGradient>
        <linearGradient id="ovHill2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#24584D" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#173D35" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <path d="M60 160 C160 110 260 70 380 70 C420 70 440 80 460 85 L460 160 Z" fill="url(#ovHill1)" />
      <path d="M0 160 C80 140 160 115 250 115 C340 115 400 95 460 105 L460 160 Z" fill="url(#ovHill2)" />
    </svg>
  );
}

const AUTOPILOT_LABELS = {
  assisted: 'Assisted',
  semi_autonomous: 'Semi-autonomous',
  autonomous: 'Autonomous'
};

const activateOnKey = (handler) => (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    handler();
  }
};

export default function OverviewView({
  jobs = [],
  stats = null,
  onNavigateTab,
  onSelectJob,
  onOpenProfile,
  onReviewApplication
}) {
  const { user, isAuthenticated, candidateProfile, openAuthModal, authFetch } = useAuth();
  const [appStats, setAppStats] = useState(null);
  const [awaitingApps, setAwaitingApps] = useState([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsError, setAppsError] = useState(false);
  const [autoConfig, setAutoConfig] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Refresh when an application is staged/updated elsewhere in the app.
  useEffect(() => {
    const onChange = () => setRefreshKey((k) => k + 1);
    window.addEventListener('jobradar:applications-changed', onChange);
    return () => window.removeEventListener('jobradar:applications-changed', onChange);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setAppStats(null);
      setAwaitingApps([]);
      setAutoConfig(null);
      setAppsError(false);
      return;
    }
    let active = true;
    const load = async () => {
      setAppsLoading(true);
      setAppsError(false);
      const [statsRes, listRes, configRes] = await Promise.allSettled([
        authFetch('/api/applications/stats'),
        authFetch('/api/applications?status=awaiting_approval&limit=4'),
        authFetch('/api/autopilot/config')
      ]);

      if (!active) return;
      let anyError = false;

      if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
        const data = await statsRes.value.json();
        if (data.success) setAppStats(data.stats);
        else anyError = true;
      } else anyError = true;

      if (listRes.status === 'fulfilled' && listRes.value.ok) {
        const data = await listRes.value.json();
        if (data.success) setAwaitingApps(Array.isArray(data.applications) ? data.applications : []);
        else anyError = true;
      } else anyError = true;

      if (configRes.status === 'fulfilled' && configRes.value.ok) {
        const data = await configRes.value.json();
        if (data.success) setAutoConfig(data.config);
      }

      setAppsError(anyError);
      setAppsLoading(false);
    };
    load();
    return () => { active = false; };
  }, [isAuthenticated, authFetch, refreshKey]);

  const topJobs = jobs.slice(0, 5);

  const getMonogram = (name) => {
    if (!name) return 'CO';
    const clean = String(name).replace(/[^a-zA-Z0-9\s]/g, '').trim();
    const parts = clean.split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return clean.slice(0, 2).toUpperCase() || 'CO';
  };

  const displayName = user?.name
    ? user.name.split(' ')[0]
    : (user?.email ? user.email.split('@')[0] : 'there');

  // Values are never invented: "—" means unavailable, 0 means genuinely zero.
  const metric = (value) => (value == null ? '—' : Number(value).toLocaleString());
  const appsMetric = (value) => {
    if (!isAuthenticated) return '—';
    if (appsLoading && appStats == null) return <Loader2 size={20} className="ov-spin" />;
    if (appsError && appStats == null) return '—';
    return metric(value ?? 0);
  };

  return (
    <div className="overview-page">
      {/* Welcome */}
      <section className="ov-welcome-card" aria-label="Mission Control Welcome">
        <div className="ov-welcome-landscape" aria-hidden="true"><WelcomeLandscapeSvg /></div>
        <div className="ov-welcome-content">
          <h1 className="ov-welcome-title">
            {isAuthenticated ? `Welcome back, ${displayName}` : 'Welcome to JobRadar'}
          </h1>
          <p className="ov-welcome-subtitle">
            {isAuthenticated
              ? 'Track live openings, tailor your resume, and manage every application in one place.'
              : 'Direct public ATS job discovery across Indian tech hubs. No recruiter spam.'}
          </p>
        </div>
        <div className="ov-welcome-actions">
          {!isAuthenticated ? (
            <button type="button" className="btn-ov-primary" onClick={() => openAuthModal('Create a free account to unlock personalized matching.', 'signup')}>
              Sign Up / Sign In
            </button>
          ) : !candidateProfile ? (
            <button type="button" className="btn-ov-primary" onClick={onOpenProfile}>
              <Sparkles size={15} /> Upload Master CV
            </button>
          ) : (
            <button type="button" className="btn-ov-primary" onClick={() => onNavigateTab('autopilot')}>
              <Zap size={15} fill="currentColor" /> Open Autopilot
            </button>
          )}
          <button type="button" className="btn-ov-secondary" onClick={() => onNavigateTab('jobs')}>
            Explore Jobs <ArrowRight size={14} />
          </button>
        </div>
      </section>

      {/* Metrics */}
      <div className="ov-metrics-grid" role="region" aria-label="Key Metrics">
        <div
          className="ov-metric-card"
          onClick={() => onNavigateTab('jobs')}
          onKeyDown={activateOnKey(() => onNavigateTab('jobs'))}
          role="button" tabIndex={0}
        >
          <div className="ov-metric-icon-badge forest"><Briefcase size={20} /></div>
          <div className="ov-metric-body">
            <span className="ov-metric-value">{stats?.open != null ? metric(stats.open) : '—'}</span>
            <span className="ov-metric-label">Live Openings</span>
            <span className="ov-metric-hint">Currently open ATS roles</span>
          </div>
        </div>

        <div
          className="ov-metric-card"
          onClick={() => onNavigateTab('applications')}
          onKeyDown={activateOnKey(() => onNavigateTab('applications'))}
          role="button" tabIndex={0}
        >
          <div className="ov-metric-icon-badge copper"><Layers size={20} /></div>
          <div className="ov-metric-body">
            <span className="ov-metric-value">{appsMetric(appStats?.all)}</span>
            <span className="ov-metric-label">Tracked Applications</span>
            <span className="ov-metric-hint">
              {!isAuthenticated ? 'Sign in to view' : appsError && appStats == null ? 'Unavailable' : `${appsMetric(appStats?.applied)} submitted · ${appsMetric(appStats?.interview)} in interview`}
            </span>
          </div>
        </div>

        <div
          className="ov-metric-card"
          onClick={() => onNavigateTab('applications')}
          onKeyDown={activateOnKey(() => onNavigateTab('applications'))}
          role="button" tabIndex={0}
        >
          <div className="ov-metric-icon-badge warning"><AlertCircle size={20} /></div>
          <div className="ov-metric-body">
            <span className="ov-metric-value">{appsMetric(appStats?.awaiting_approval)}</span>
            <span className="ov-metric-label">Awaiting Approval</span>
            <span className="ov-metric-hint">Staged for your review</span>
          </div>
        </div>

        <div
          className="ov-metric-card"
          onClick={() => onNavigateTab('autopilot')}
          onKeyDown={activateOnKey(() => onNavigateTab('autopilot'))}
          role="button" tabIndex={0}
        >
          <div className="ov-metric-icon-badge sand"><Bot size={20} /></div>
          <div className="ov-metric-body">
            <span className="ov-metric-value ov-metric-text-value">
              {autoConfig ? (AUTOPILOT_LABELS[autoConfig.mode] || autoConfig.mode) : '—'}
            </span>
            <span className="ov-metric-label">Autopilot Mode</span>
            <span className="ov-metric-hint">
              {autoConfig ? `${autoConfig.enabled ? 'Enabled' : 'Disabled'} · ${autoConfig.status || 'paused'}` : 'Configure your automation'}
            </span>
          </div>
        </div>
      </div>

      {/* Panels */}
      <div className="ov-split-grid">
        <div className="ov-panel-card" id="staged-for-review-panel">
          <div className="ov-panel-header">
            <div className="ov-panel-title-group">
              <Zap size={16} className="text-copper" />
              <h2 className="ov-panel-title">Staged for Review</h2>
              {awaitingApps.length > 0 && <span className="ov-badge-copper">{awaitingApps.length} new</span>}
            </div>
            <button type="button" className="ov-panel-link" onClick={() => onNavigateTab('applications')}>
              View all {appStats?.awaiting_approval != null ? `(${appStats.awaiting_approval})` : ''}
            </button>
          </div>
          <div className="ov-panel-body">
            {!isAuthenticated ? (
              <div className="ov-empty-mini">
                <AlertCircle size={28} className="text-muted opacity-40" />
                <p className="ov-empty-text">Sign in to see applications awaiting your approval.</p>
                <button type="button" className="btn btn-secondary btn-xs" onClick={() => openAuthModal('Sign in to review staged applications.', 'login')}>Sign in</button>
              </div>
            ) : appsLoading && appStats == null ? (
              <div className="ov-empty-mini"><Loader2 size={26} className="ov-spin" /><p className="ov-empty-text">Loading your applications…</p></div>
            ) : appsError && appStats == null ? (
              <div className="ov-empty-mini">
                <AlertCircle size={28} className="text-muted opacity-40" />
                <p className="ov-empty-text">We couldn't load your applications. Please try again.</p>
                <button type="button" className="btn btn-secondary btn-xs" onClick={() => setRefreshKey((k) => k + 1)}>Retry</button>
              </div>
            ) : awaitingApps.length === 0 ? (
              <div className="ov-empty-mini">
                <CheckCircle2 size={30} className="text-muted opacity-40" />
                <p className="ov-empty-text">No applications currently awaiting your approval.</p>
                <button type="button" className="btn btn-secondary btn-xs" onClick={() => onNavigateTab('jobs')}>Discover new jobs</button>
              </div>
            ) : (
              <div className="ov-staged-list">
                {awaitingApps.map((app) => (
                  <div key={app._id} className="ov-staged-row">
                    <div className="ov-staged-left">
                      <div className="ov-company-monogram">{getMonogram(app.companyName)}</div>
                      <div className="ov-staged-info">
                        <span className="ov-staged-title">{app.jobTitle}</span>
                        <div className="ov-staged-meta">
                          <span>{app.companyName}</span>
                          {app.matchScore > 0 && <><span className="dot-divider">•</span><span className="ov-match-tag">{app.matchScore}% match</span></>}
                          {app.location && <><span className="dot-divider">•</span><span>{app.location}</span></>}
                        </div>
                      </div>
                    </div>
                    <button type="button" className="btn-ov-review" onClick={() => onReviewApplication ? onReviewApplication(app) : onNavigateTab('applications')}>
                      Review
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="ov-panel-card" id="recommended-for-you-panel">
          <div className="ov-panel-header">
            <div className="ov-panel-title-group">
              <Target size={16} className="text-forest" />
              <h2 className="ov-panel-title">Recommended for You</h2>
            </div>
            <button type="button" className="ov-panel-link" onClick={() => onNavigateTab('jobs')}>Explore all ({jobs.length})</button>
          </div>
          <div className="ov-panel-body">
            {topJobs.length === 0 ? (
              <div className="ov-empty-mini">
                <Building2 size={28} className="text-muted opacity-40" />
                <p className="ov-empty-text">No live opportunities to show yet. Discover jobs to fill this list.</p>
                <button type="button" className="btn btn-secondary btn-xs" onClick={() => onNavigateTab('jobs')}>Discover jobs</button>
              </div>
            ) : (
              <div className="ov-recommended-list">
                {topJobs.map((job) => (
                  <div
                    key={job._id || job.sourceJobId}
                    className="ov-recommended-row"
                    onClick={() => onSelectJob(job)}
                    onKeyDown={activateOnKey(() => onSelectJob(job))}
                    role="button" tabIndex={0}
                  >
                    <div className="ov-recommended-left">
                      <div className="ov-company-monogram">{getMonogram(job.company)}</div>
                      <div className="ov-recommended-info">
                        <span className="ov-recommended-title">{job.title}</span>
                        <div className="ov-recommended-meta">
                          <span>{job.company}</span>
                          <span className="dot-divider">•</span>
                          <span>{job.location || 'India'}</span>
                          {job.workMode && job.workMode !== 'unknown' && (
                            <><span className="dot-divider">•</span><span className="workmode-tag-xs">{job.workMode}</span></>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="ov-recommended-right">
                      {job.fresherFriendly && <span className="ov-match-tag">Early Career</span>}
                      <ChevronRight size={16} className="text-muted" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
