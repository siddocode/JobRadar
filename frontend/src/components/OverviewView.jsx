import React, { useState, useEffect } from 'react';
import {
  Briefcase,
  Layers,
  Sparkles,
  Bot,
  ArrowRight,
  Clock,
  Building2,
  CheckCircle2,
  AlertCircle,
  MapPin,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function OverviewView({
  jobs = [],
  stats = null,
  onNavigateTab,
  onSelectJob,
  onOpenProfile
}) {
  const { user, isAuthenticated, candidateProfile, openAuthModal } = useAuth();
  const [appStats, setAppStats] = useState({ all: 0, awaiting_approval: 0, applied: 0, interview: 0 });
  const [awaitingApps, setAwaitingApps] = useState([]);
  const [loadingApps, setLoadingApps] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    let isMounted = true;

    const fetchAppOverview = async () => {
      setLoadingApps(true);
      try {
        const [statsRes, listRes] = await Promise.all([
          fetch('/api/applications/stats', { credentials: 'include' }),
          fetch('/api/applications?status=awaiting_approval&limit=4', { credentials: 'include' })
        ]);

        if (statsRes.ok) {
          const data = await statsRes.json();
          if (data.success && isMounted) {
            setAppStats(data.stats);
          }
        }

        if (listRes.ok) {
          const listData = await listRes.json();
          if (listData.success && isMounted) {
            setAwaitingApps(listData.applications || []);
          }
        }
      } catch (err) {
        console.warn('Overview fetch error:', err);
      } finally {
        if (isMounted) setLoadingApps(false);
      }
    };

    fetchAppOverview();
    return () => { isMounted = false; };
  }, [isAuthenticated]);

  // Curate top high-match jobs
  const topJobs = jobs.slice(0, 5);

  return (
    <div className="overview-container">
      {/* Welcome Banner */}
      <div className="overview-welcome-card">
        <div className="overview-welcome-text">
          <span className="overview-pill-badge">
            <Sparkles size={13} className="text-copper" /> Autonomous Tech Career Navigator
          </span>
          <h1 className="overview-title">
            {isAuthenticated
              ? `Welcome back, ${user?.name || user?.email?.split('@')[0] || 'Engineer'}`
              : 'Precision Engineering Career Aggregator'}
          </h1>
          <p className="overview-subtitle">
            Direct public ATS ingestion across 34+ Indian tech hubs. Zero recruiter spam, truthful AI resume tailoring, and assisted application autopilot.
          </p>
        </div>
        <div className="overview-welcome-actions">
          {!isAuthenticated ? (
            <button
              type="button"
              className="btn btn-primary btn-md"
              onClick={() => openAuthModal('Create a profile to unlock personalized job matching and autopilot.', 'signup')}
            >
              Sign Up / Sign In
            </button>
          ) : !candidateProfile ? (
            <button
              type="button"
              className="btn btn-primary btn-md"
              onClick={onOpenProfile}
            >
              Upload Master CV
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-md"
              onClick={() => onNavigateTab('autopilot')}
            >
              <Bot size={16} /> Open Autopilot
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-md"
            onClick={() => onNavigateTab('jobs')}
          >
            Explore Jobs <ArrowRight size={15} />
          </button>
        </div>
      </div>

      {/* Primary Metrics Ribbon */}
      <div className="metrics-grid">
        <div className="metric-box" onClick={() => onNavigateTab('jobs')}>
          <div className="metric-icon-wrap metric-icon-forest">
            <Briefcase size={20} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Live Openings</span>
            <span className="metric-number">
              {stats?.totalJobs ? stats.totalJobs.toLocaleString() : (jobs.length > 0 ? jobs.length : '—')}
            </span>
            <span className="metric-hint">Verified ATS feeds</span>
          </div>
        </div>

        <div className="metric-box" onClick={() => onNavigateTab('applications')}>
          <div className="metric-icon-wrap metric-icon-copper">
            <Layers size={20} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Active Applications</span>
            <span className="metric-number">{appStats.all}</span>
            <span className="metric-hint">
              {appStats.applied} submitted • {appStats.interview} interviewing
            </span>
          </div>
        </div>

        <div className="metric-box" onClick={() => onNavigateTab('applications')}>
          <div className="metric-icon-wrap metric-icon-warning">
            <AlertCircle size={20} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Awaiting Approval</span>
            <span className="metric-number">{appStats.awaiting_approval}</span>
            <span className="metric-hint">Ready for 1-click dispatch</span>
          </div>
        </div>

        <div className="metric-box" onClick={() => onNavigateTab('autopilot')}>
          <div className="metric-icon-wrap metric-icon-sand">
            <Bot size={20} />
          </div>
          <div className="metric-info">
            <span className="metric-label">Autopilot Mode</span>
            <span className="metric-number text-forest">Assisted</span>
            <span className="metric-hint">Human-in-the-loop safety</span>
          </div>
        </div>
      </div>

      {/* Grid: Actionable Awaiting Approval + Top Matching Postings */}
      <div className="overview-split-grid">
        {/* Left Column: Actionable Queue */}
        <div className="overview-card">
          <div className="overview-card-header">
            <div className="overview-card-title-wrap">
              <Clock size={18} className="text-copper" />
              <h2 className="overview-card-title">Staged for Review</h2>
            </div>
            <button
              type="button"
              className="link-btn"
              onClick={() => onNavigateTab('applications')}
            >
              View all ({appStats.awaiting_approval})
            </button>
          </div>

          <div className="overview-card-body">
            {awaitingApps.length === 0 ? (
              <div className="empty-state-mini">
                <CheckCircle2 size={32} className="text-muted opacity-40" />
                <p className="empty-text-mini">No applications currently awaiting your approval.</p>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onNavigateTab('jobs')}
                >
                  Discover new jobs
                </button>
              </div>
            ) : (
              <div className="staged-list">
                {awaitingApps.map(app => (
                  <div key={app._id} className="staged-item">
                    <div className="staged-item-info">
                      <span className="staged-item-role">{app.jobTitle}</span>
                      <span className="staged-item-company">
                        <Building2 size={13} /> {app.companyName}
                        {app.location && (
                          <>
                            <span className="dot-divider">•</span>
                            <MapPin size={12} /> {app.location}
                          </>
                        )}
                      </span>
                    </div>
                    {app.matchScore && (
                      <span className="score-pill-sm">
                        {app.matchScore}% Match
                      </span>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs"
                      onClick={() => onNavigateTab('applications')}
                    >
                      Review
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Fresh High-Match Jobs */}
        <div className="overview-card">
          <div className="overview-card-header">
            <div className="overview-card-title-wrap">
              <Sparkles size={18} className="text-forest" />
              <h2 className="overview-card-title">Featured Opportunities</h2>
            </div>
            <button
              type="button"
              className="link-btn"
              onClick={() => onNavigateTab('jobs')}
            >
              Explore all ({jobs.length})
            </button>
          </div>

          <div className="overview-card-body">
            {topJobs.length === 0 ? (
              <div className="empty-state-mini">
                <Briefcase size={32} className="text-muted opacity-40" />
                <p className="empty-text-mini">Loading live tech opportunities...</p>
              </div>
            ) : (
              <div className="featured-jobs-list">
                {topJobs.map(job => (
                  <div
                    key={job._id || job.sourceJobId}
                    className="featured-job-row"
                    onClick={() => onSelectJob(job)}
                  >
                    <div className="featured-job-main">
                      <h3 className="featured-job-title">{job.title}</h3>
                      <div className="featured-job-meta">
                        <span className="featured-job-company">
                          <Building2 size={13} /> {job.company}
                        </span>
                        <span className="dot-divider">•</span>
                        <span className="featured-job-location">
                          <MapPin size={12} /> {job.location || 'India'}
                        </span>
                        {job.workMode && job.workMode !== 'unknown' && (
                          <>
                            <span className="dot-divider">•</span>
                            <span className="workmode-tag-xs">{job.workMode}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="featured-job-actions">
                      {job.fresherFriendly && (
                        <span className="fresher-tag-xs">Early Career</span>
                      )}
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

