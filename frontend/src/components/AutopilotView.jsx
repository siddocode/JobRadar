import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Zap,
  Play,
  Pause,
  Square,
  ShieldCheck,
  Clock,
  CheckCircle2,
  Check,
  X,
  Plus,
  MapPin,
  Briefcase,
  IndianRupee,
  BarChart2,
  Search,
  Target,
  Send,
  TrendingUp,
  ChevronRight,
  ChevronDown,
  Info,
  RefreshCw,
  Ban,
  Bot,
  User,
  ExternalLink,
  Layers
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './AutopilotView.css';

/**
 * Embedded SVG vector illustration matching the distinctive
 * winding mountain trail & summit flag from the JobRadar reference.
 */
function HeroLandscapeSvg() {
  return (
    <svg viewBox="0 0 540 200" fill="none" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="hillGrad1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1E4B41" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#13362E" stopOpacity="0.95" />
        </linearGradient>
        <linearGradient id="hillGrad2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#24584D" />
          <stop offset="100%" stopColor="#173D35" />
        </linearGradient>
        <linearGradient id="hillGrad3" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2E695D" />
          <stop offset="100%" stopColor="#1A443B" />
        </linearGradient>
      </defs>

      {/* Background Hill Layer */}
      <path d="M120 200 C220 140 320 100 460 100 C500 100 520 110 540 115 L540 200 Z" fill="url(#hillGrad1)" />

      {/* Mid Peak with Summit Flag */}
      <path d="M220 200 C290 145 360 110 430 80 C465 65 485 70 540 105 L540 200 Z" fill="url(#hillGrad2)" />

      {/* Foreground Rolling Hills */}
      <path d="M0 200 C90 180 180 150 280 150 C380 150 450 125 540 135 L540 200 Z" fill="url(#hillGrad3)" />
      <path d="M160 200 C270 165 380 160 540 140 L540 200 Z" fill="#1C453C" opacity="0.9" />

      {/* Winding Trail leading to Summit */}
      <path
        d="M260 200 C305 180 325 165 355 150 C385 135 390 120 415 108 C435 96 445 88 455 75"
        stroke="#D49867"
        strokeWidth="2.5"
        strokeDasharray="4 3"
        strokeLinecap="round"
        opacity="0.85"
      />

      {/* Summit Flag at (455, 75) */}
      <line x1="455" y1="75" x2="455" y2="48" stroke="#F3EFE5" strokeWidth="2" strokeLinecap="round" />
      <polygon points="455,48 476,55 455,62" fill="#B47A49" />
      <circle cx="455" cy="48" r="2.2" fill="#F3EFE5" />
    </svg>
  );
}

/**
 * Accessible inline tooltip for settings explanations.
 */
function InfoTooltip({ text }) {
  const [visible, setVisible] = useState(false);
  return (
    <span
      className="ap-info-trigger"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
      tabIndex={0}
      role="tooltip"
    >
      <Info size={13} />
      {visible && <span className="ap-tooltip">{text}</span>}
    </span>
  );
}

const LOCATION_SUGGESTIONS = ['Bengaluru', 'Hyderabad', 'Pune', 'Gurugram', 'Noida', 'Mumbai', 'Remote', 'All India'];
const ROLE_SUGGESTIONS = ['Software Engineer', 'Full Stack Developer', 'Backend Engineer', 'Frontend Engineer', 'DevOps Engineer', 'Lead Engineer'];

const SALARY_PRESETS = [
  { value: 0, label: 'Any Salary' },
  { value: 600000, label: '₹6.0 LPA+' },
  { value: 1000000, label: '₹10.0 LPA+' },
  { value: 1500000, label: '₹15.0 LPA+' },
  { value: 2000000, label: '₹20.0 LPA+' },
  { value: 2500000, label: '₹25.0 LPA+' },
  { value: 3000000, label: '₹30.0 LPA+' },
  { value: 4000000, label: '₹40.0 LPA+' },
  { value: 5000000, label: '₹50.0 LPA+' }
];

export default function AutopilotView({ onNavigateApplications, onNavigateProfile }) {
  const { authFetch, isAuthenticated, openAuthModal, candidateProfile } = useAuth();

  const [config, setConfig] = useState({
    enabled: false,
    status: 'paused',
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
  });

  const [runs, setRuns] = useState([]);
  const [engineTelemetry, setEngineTelemetry] = useState(null);
  const [appStats, setAppStats] = useState(null);

  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [lastRunResult, setLastRunResult] = useState(null);

  // Expanded runs drawer tracking
  const [expandedRunId, setExpandedRunId] = useState(null);

  // Modals
  const [showAutonomousModal, setShowAutonomousModal] = useState(false);
  const [showStopModal, setShowStopModal] = useState(false);
  const [showAllRunsModal, setShowAllRunsModal] = useState(false);

  // Inline tag add forms
  const [isAddingLocation, setIsAddingLocation] = useState(false);
  const [newLocation, setNewLocation] = useState('');

  const [isAddingRole, setIsAddingRole] = useState(false);
  const [newRole, setNewRole] = useState('');

  const [isAddingBlacklist, setIsAddingBlacklist] = useState(false);
  const [newBlacklist, setNewBlacklist] = useState('');

  // Fetch Autopilot Config, Runs, Status, and Application Stats
  const fetchAutopilotData = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [resConfig, resRuns, resStatus, resAppStats] = await Promise.all([
        authFetch('/api/autopilot/config'),
        authFetch('/api/autopilot/runs'),
        authFetch('/api/autopilot/status').catch(() => null),
        authFetch('/api/applications/stats').catch(() => null)
      ]);

      if (resConfig && resConfig.ok) {
        const data = await resConfig.json();
        if (data.success && data.config) {
          setConfig(data.config);
        }
      }

      if (resRuns && resRuns.ok) {
        const runsData = await resRuns.json();
        if (runsData.success) {
          setRuns(runsData.runs || []);
        }
      }

      if (resStatus && resStatus.ok) {
        const statusData = await resStatus.json();
        if (statusData.success) {
          setEngineTelemetry(statusData);
        }
      }

      if (resAppStats && resAppStats.ok) {
        const appStatsData = await resAppStats.json();
        if (appStatsData.success && appStatsData.stats) {
          setAppStats(appStatsData.stats);
        }
      }
    } catch (err) {
      console.error('Failed to load autopilot configuration:', err);
    } finally {
      setLoading(false);
    }
  }, [authFetch, isAuthenticated]);

  useEffect(() => {
    fetchAutopilotData();
  }, [fetchAutopilotData]);

  // Save Config Changes
  const handleSaveConfig = async (overrideUpdates = null) => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const payload = overrideUpdates || config;
      const res = await authFetch('/api/autopilot/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setConfig(data.config);
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 2000);
        }
      }
    } catch (err) {
      console.error('Failed to save config:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // State controls: Active / Pause / Stop
  const handleSetState = async (targetState) => {
    if (targetState === 'stopped') {
      setShowStopModal(true);
      return;
    }
    await executeSetState(targetState);
  };

  const executeSetState = async (targetState) => {
    try {
      setIsSaving(true);
      const endpoint = targetState === 'active'
        ? '/api/autopilot/resume'
        : (targetState === 'paused' ? '/api/autopilot/pause' : '/api/autopilot/stop');
      const res = await authFetch(endpoint, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.config) {
          setConfig(data.config);
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 2000);
        }
      }
    } catch (err) {
      console.error(`Failed to set autopilot state to ${targetState}:`, err);
    } finally {
      setIsSaving(false);
    }
  };

  // Mode Selection with Autonomous Mode Confirmation
  const handleSelectMode = (targetMode) => {
    if (targetMode === 'autonomous' && config.mode !== 'autonomous') {
      setShowAutonomousModal(true);
      return;
    }
    const updated = { ...config, mode: targetMode };
    setConfig(updated);
    handleSaveConfig(updated);
  };

  const handleConfirmAutonomous = () => {
    setShowAutonomousModal(false);
    const updated = { ...config, mode: 'autonomous' };
    setConfig(updated);
    handleSaveConfig(updated);
  };

  // Trigger On-Demand Autopilot Run
  const handleTriggerRun = async () => {
    setIsRunning(true);
    setLastRunResult(null);
    try {
      const res = await authFetch('/api/autopilot/trigger', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || 'Failed to trigger autopilot run');
        return;
      }
      setLastRunResult(data);
      fetchAutopilotData();
    } catch (err) {
      console.error('Autopilot trigger error:', err);
      alert('Error triggering autopilot: ' + err.message);
    } finally {
      setIsRunning(false);
    }
  };

  // Location Handlers
  const handleAddLocation = (locToAdd) => {
    const loc = (locToAdd || newLocation).trim();
    if (!loc) return;
    if (!config.preferredLocations.includes(loc)) {
      const updated = { ...config, preferredLocations: [...config.preferredLocations, loc] };
      setConfig(updated);
      handleSaveConfig(updated);
    }
    setNewLocation('');
    setIsAddingLocation(false);
  };

  const handleRemoveLocation = (loc) => {
    const updated = { ...config, preferredLocations: config.preferredLocations.filter(l => l !== loc) };
    setConfig(updated);
    handleSaveConfig(updated);
  };

  // Role Handlers
  const handleAddRole = (roleToAdd) => {
    const role = (roleToAdd || newRole).trim();
    if (!role) return;
    if (!config.targetRoles.includes(role)) {
      const updated = { ...config, targetRoles: [...config.targetRoles, role] };
      setConfig(updated);
      handleSaveConfig(updated);
    }
    setNewRole('');
    setIsAddingRole(false);
  };

  const handleRemoveRole = (role) => {
    const updated = { ...config, targetRoles: config.targetRoles.filter(r => r !== role) };
    setConfig(updated);
    handleSaveConfig(updated);
  };

  // Work Modes Handlers
  const handleToggleWorkMode = (mode) => {
    const current = config.workModes || ['remote', 'hybrid', 'onsite'];
    let updatedModes;
    if (current.includes(mode)) {
      if (current.length === 1) return; // Prevent removing all
      updatedModes = current.filter(m => m !== mode);
    } else {
      updatedModes = [...current, mode];
    }
    const updated = { ...config, workModes: updatedModes };
    setConfig(updated);
    handleSaveConfig(updated);
  };

  // Salary Handler
  const handleSalaryPresetChange = (e) => {
    const minSalary = parseInt(e.target.value, 10) || 0;
    const updated = {
      ...config,
      salaryPreferences: {
        ...(config.salaryPreferences || { currency: 'INR', period: 'yearly' }),
        minSalary
      }
    };
    setConfig(updated);
    handleSaveConfig(updated);
  };

  // Blacklist Handlers
  const handleAddBlacklist = (e) => {
    if (e) e.preventDefault();
    const comp = newBlacklist.trim();
    if (!comp) return;
    if (!config.blacklistedCompanies.includes(comp)) {
      const updated = { ...config, blacklistedCompanies: [...config.blacklistedCompanies, comp] };
      setConfig(updated);
      handleSaveConfig(updated);
    }
    setNewBlacklist('');
    setIsAddingBlacklist(false);
  };

  const handleRemoveBlacklist = (comp) => {
    const updated = { ...config, blacklistedCompanies: config.blacklistedCompanies.filter(c => c !== comp) };
    setConfig(updated);
    handleSaveConfig(updated);
  };

  // Compute Performance Analytics from Real Backend Data
  const analytics = useMemo(() => {
    // 1. Jobs Evaluated: sum across runs in last 7 days (or all runs loaded)
    const totalJobsEvaluated = runs.reduce((sum, r) => sum + (r.jobsEvaluated || 0), 0);

    // 2. Shortlisted: real count from Application stats or runs
    const shortlistedCount = appStats
      ? ((appStats.shortlisted || 0) + (appStats.awaiting_approval || 0) + (appStats.resume_ready || 0))
      : runs.reduce((sum, r) => sum + (r.applicationsCreated || 0), 0);

    // 3. Applications Submitted: real submitted applications count
    const applicationsCount = appStats
      ? ((appStats.applied || 0) + (appStats.assessment || 0) + (appStats.interview || 0) + (appStats.offer || 0))
      : runs.reduce((sum, r) => sum + (r.applicationsSubmitted || 0), 0);

    // 4. Response Rate: interview + offer + assessment / total applied
    let responseRate = '—';
    if (appStats) {
      const appliedTotal = (appStats.applied || 0) + (appStats.assessment || 0) + (appStats.interview || 0) + (appStats.offer || 0) + (appStats.rejected || 0);
      const responses = (appStats.interview || 0) + (appStats.offer || 0) + (appStats.assessment || 0);
      if (appliedTotal > 0) {
        responseRate = `${Math.round((responses / appliedTotal) * 100)}%`;
      }
    }

    return {
      jobsEvaluated: totalJobsEvaluated.toLocaleString(),
      shortlisted: shortlistedCount.toLocaleString(),
      applications: applicationsCount.toLocaleString(),
      responseRate
    };
  }, [runs, appStats]);

  // Formatter for relative run date
  const formatRunTimestamp = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (isToday) return `Today, ${timeStr}`;
    if (isYesterday) return `Yesterday, ${timeStr}`;
    return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${timeStr}`;
  };

  // Unauthenticated Gate
  if (!isAuthenticated) {
    return (
      <div className="autopilot-page">
        <div className="ap-auth-gate">
          <div className="ap-auth-gate-icon">
            <Bot size={32} />
          </div>
          <h2 className="ap-auth-gate-title">Sign in to configure Application Autopilot</h2>
          <p className="ap-auth-gate-text">
            Automate continuous job screening, deterministic eligibility checks, and assisted application preparation across 34+ Indian tech hubs.
          </p>

          <div className="ap-auth-gate-features">
            <div className="ap-auth-feature-row">
              <Check size={16} className="text-forest" />
              <span>Verified ATS public career portal monitoring</span>
            </div>
            <div className="ap-auth-feature-row">
              <Check size={16} className="text-forest" />
              <span>Deterministic resume tailoring without credential hallucination</span>
            </div>
            <div className="ap-auth-feature-row">
              <Check size={16} className="text-forest" />
              <span>Anti-bot safety halt & human-in-the-loop fallback</span>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-primary btn-md"
            onClick={() => openAuthModal('Sign in to configure autopilot', 'login')}
          >
            Sign In / Create Account
          </button>
        </div>
      </div>
    );
  }

  // Initial Loading Skeleton
  if (loading && !config.targetRoles) {
    return (
      <div className="autopilot-page">
        <div className="ap-skeleton" style={{ height: 160, borderRadius: 16 }} />
        <div className="ap-grid" style={{ marginTop: 24 }}>
          <div className="ap-skeleton" style={{ height: 500, borderRadius: 16 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div className="ap-skeleton" style={{ height: 260, borderRadius: 16 }} />
            <div className="ap-skeleton" style={{ height: 180, borderRadius: 16 }} />
          </div>
        </div>
      </div>
    );
  }

  const isConfigActive = config.status === 'active' || (config.enabled && config.status !== 'stopped');
  const isConfigPaused = config.status === 'paused' || (!config.enabled && config.status !== 'stopped');
  const isConfigStopped = config.status === 'stopped';

  return (
    <div className="autopilot-page">

      {/* ====================================================================
          1. HERO SECTION: Distinctive Forest Green Surface + Summit Flag Vector
          ==================================================================== */}
      <section className="ap-hero" aria-label="Autopilot Engine Overview">
        {/* Landscape Vector Background */}
        <div className="ap-hero-landscape" aria-hidden="true">
          <HeroLandscapeSvg />
        </div>

        {/* Content Block */}
        <div className="ap-hero-content">
          <div className="ap-hero-icon-badge">
            <Zap size={22} />
          </div>
          <div className="ap-hero-text-block">
            <div className="ap-hero-title-row">
              <h1 className="ap-hero-title">Autopilot Engine</h1>
              <span className="ap-hero-status-tag">
                {isConfigActive ? '● Active' : (isConfigPaused ? '⏸ Paused' : '⏹ Stopped')}
              </span>
            </div>
            <p className="ap-hero-subtitle">
              Discovers relevant jobs, checks eligibility, tailors your resume, and applies on your behalf — safely and automatically.
            </p>
          </div>
        </div>

        {/* Action Button */}
        <div className="ap-hero-actions">
          <button
            type="button"
            className="btn-hero-cta"
            onClick={handleTriggerRun}
            disabled={isRunning}
            id="trigger-autopilot-btn"
          >
            {isRunning ? (
              <RefreshCw size={15} className="ap-spin" />
            ) : (
              <Play size={15} fill="currentColor" />
            )}
            <span>{isRunning ? 'Evaluating Postings...' : 'Run Autopilot Now'}</span>
          </button>
        </div>
      </section>

      {/* ====================================================================
          2. FEEDBACK BANNER: Last Execution Outcome (Dismissible)
          ==================================================================== */}
      {lastRunResult && (
        <aside className="ap-alert-box" role="status">
          <div className="ap-alert-content">
            <CheckCircle2 size={20} className="ap-alert-icon" />
            <div className="ap-alert-text">
              <span className="ap-alert-title">{lastRunResult.message}</span>
              <span className="ap-alert-meta">
                Evaluated {lastRunResult.jobsEvaluated} opportunities • Staged {lastRunResult.applicationsCreated} applications • Daily quota remaining: {lastRunResult.quotaRemaining}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="ap-alert-btn"
            onClick={onNavigateApplications}
          >
            <span>View Applications</span>
            <ExternalLink size={13} />
          </button>
        </aside>
      )}

      {/* Candidate CV Missing Warning Notice */}
      {isAuthenticated && (!candidateProfile || !candidateProfile?.skills?.length) && (
        <aside className="ap-alert-box" style={{ borderLeftColor: '#B47A49' }} role="alert">
          <div className="ap-alert-content">
            <Info size={19} style={{ color: '#B47A49' }} />
            <div className="ap-alert-text">
              <span className="ap-alert-title">Candidate Profile Required for Tailoring</span>
              <span className="ap-alert-meta">
                Upload your CV in My Profile to enable skill extraction, deterministic scoring, and custom resume tailoring.
              </span>
            </div>
          </div>
          {onNavigateProfile && (
            <button
              type="button"
              className="ap-alert-btn"
              onClick={onNavigateProfile}
            >
              Go to Profile
            </button>
          )}
        </aside>
      )}

      {/* ====================================================================
          3. MAIN 2-COLUMN GRID: Automation Settings (Left) & Telemetry (Right)
          ==================================================================== */}
      <div className="ap-grid">

        {/* ==================================================================
            LEFT COLUMN: AUTOMATION & SAFETY CONTROLS
            ================================================================== */}
        <div className="ap-card" id="automation-safety-controls">

          {/* Section Header */}
          <div className="ap-card-header">
            <div className="ap-card-title-group">
              <div className="ap-card-icon-badge">
                <ShieldCheck size={19} />
              </div>
              <div>
                <h2 className="ap-card-title">Automation & Safety Controls</h2>
                <p className="ap-card-subtitle">
                  Configures how JobRadar finds, prepares, and applies to jobs.
                </p>
              </div>
            </div>

            <div className="ap-card-header-actions">
              {/* Ready / Status Pill */}
              <span className={`ap-status-pill ${isConfigActive ? 'ready' : (isConfigPaused ? 'paused' : 'stopped')}`}>
                <span className="ap-pulsing-dot" />
                <span>{isConfigActive ? 'Ready' : (isConfigPaused ? 'Paused' : 'Stopped')}</span>
              </span>

              {/* Saved indicator */}
              {saveSuccess && (
                <span className="text-xs text-forest font-semibold" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <Check size={12} /> Saved
                </span>
              )}
            </div>
          </div>

          {/* Quick Active / Pause / Stop Segmented Buttons */}
          <div className="ap-state-controls">
            <div className="ap-state-btn-group" role="group" aria-label="Autopilot Execution State">
              <button
                type="button"
                className={`ap-state-btn ${isConfigActive ? 'is-active' : ''}`}
                onClick={() => handleSetState('active')}
                title="Resume automated screening"
              >
                <Play size={11} fill="currentColor" />
                <span>Active</span>
              </button>

              <button
                type="button"
                className={`ap-state-btn ${isConfigPaused ? 'is-active' : ''}`}
                onClick={() => handleSetState('paused')}
                title="Pause automated screening"
              >
                <Pause size={11} fill="currentColor" />
                <span>Pause</span>
              </button>

              <button
                type="button"
                className={`ap-state-btn ${isConfigStopped ? 'is-active' : ''}`}
                onClick={() => handleSetState('stopped')}
                title="Stop Autopilot execution"
              >
                <Square size={11} fill="currentColor" />
                <span>Stop</span>
              </button>
            </div>
          </div>

          {/* Automation Mode Selector Cards */}
          <div className="ap-mode-section">
            <span className="ap-section-heading">Automation Mode</span>
            <div className="ap-mode-grid">

              {/* Mode 1: Autonomous Mode */}
              <div
                className={`ap-mode-card ${config.mode === 'autonomous' ? 'is-selected' : ''}`}
                onClick={() => handleSelectMode('autonomous')}
                role="button"
                tabIndex={0}
                aria-pressed={config.mode === 'autonomous'}
              >
                <div className="ap-mode-card-icon">
                  <Zap size={16} />
                </div>
                <div className="ap-mode-card-body">
                  <span className="ap-mode-card-title">Autonomous Mode</span>
                  <span className="ap-mode-card-desc">
                    Automatically prepares and submits applications within your set rules.
                  </span>
                </div>
                <div className="ap-mode-check">
                  {config.mode === 'autonomous' && <Check size={12} strokeWidth={3} />}
                </div>
              </div>

              {/* Mode 2: Assisted Mode */}
              <div
                className={`ap-mode-card ${config.mode === 'assisted' ? 'is-selected' : ''}`}
                onClick={() => handleSelectMode('assisted')}
                role="button"
                tabIndex={0}
                aria-pressed={config.mode === 'assisted'}
              >
                <div className="ap-mode-card-icon">
                  <User size={16} />
                </div>
                <div className="ap-mode-card-body">
                  <span className="ap-mode-card-title">Assisted Mode</span>
                  <span className="ap-mode-card-desc">
                    Prepares everything and waits for your 1-click approval.
                  </span>
                </div>
                <div className="ap-mode-check">
                  {config.mode === 'assisted' && <Check size={12} strokeWidth={3} />}
                </div>
              </div>

            </div>
          </div>

          {/* Cohesive Settings Surface */}
          <div className="ap-settings-surface">

            {/* Row 1: Daily Application Quota */}
            <div className="ap-setting-row">
              <div className="ap-setting-left">
                <div className="ap-setting-title-line">
                  <span className="ap-setting-title">Daily Application Quota</span>
                  <InfoTooltip text="Maximum number of applications dispatched or staged per day. Restricts submissions to protect response rates." />
                </div>
                <span className="ap-setting-desc">Maximum applications per day.</span>
              </div>

              <div className="ap-setting-right">
                <div className="ap-slider-container">
                  <input
                    type="range"
                    min="1"
                    max="20"
                    value={config.dailyLimit || 5}
                    className="ap-slider-input"
                    onChange={(e) => {
                      const updated = { ...config, dailyLimit: parseInt(e.target.value, 10) };
                      setConfig(updated);
                    }}
                    onMouseUp={() => handleSaveConfig()}
                    onTouchEnd={() => handleSaveConfig()}
                    onKeyUp={() => handleSaveConfig()}
                    aria-label="Daily Application Quota"
                  />
                  <span className="ap-slider-badge">{config.dailyLimit || 5} / day</span>
                </div>
              </div>
            </div>

            {/* Row 2: Minimum Match Compatibility */}
            <div className="ap-setting-row">
              <div className="ap-setting-left">
                <div className="ap-setting-title-line">
                  <span className="ap-setting-title">Minimum Match Compatibility</span>
                  <InfoTooltip text="Deterministic matching threshold evaluating experience, required skills, and work authorization. Postings below this score are filtered." />
                </div>
                <span className="ap-setting-desc">Only apply to jobs that meet this score or higher.</span>
              </div>

              <div className="ap-setting-right">
                <div className="ap-slider-container">
                  <input
                    type="range"
                    min="50"
                    max="95"
                    step="5"
                    value={config.minMatchScore || 70}
                    className="ap-slider-input"
                    onChange={(e) => {
                      const updated = { ...config, minMatchScore: parseInt(e.target.value, 10) };
                      setConfig(updated);
                    }}
                    onMouseUp={() => handleSaveConfig()}
                    onTouchEnd={() => handleSaveConfig()}
                    onKeyUp={() => handleSaveConfig()}
                    aria-label="Minimum Match Compatibility"
                  />
                  <span className="ap-slider-badge copper">{config.minMatchScore || 70}%</span>
                </div>
              </div>
            </div>

            {/* Row 3: Expected Minimum Salary */}
            <div className="ap-setting-row">
              <div className="ap-setting-left">
                <div className="ap-setting-title-line">
                  <span className="ap-setting-title">Expected Minimum Salary</span>
                  <InfoTooltip text="Filters out verified opportunities with explicit salary ranges falling below your threshold." />
                </div>
                <span className="ap-setting-desc">Filter out opportunities below your preference.</span>
              </div>

              <div className="ap-setting-right">
                <div className="ap-select-box">
                  <select
                    className="ap-native-select"
                    value={config.salaryPreferences?.minSalary || 0}
                    onChange={handleSalaryPresetChange}
                    aria-label="Expected Minimum Salary"
                  >
                    {SALARY_PRESETS.map(preset => (
                      <option key={preset.value} value={preset.value}>
                        {preset.label}
                      </option>
                    ))}
                    {config.salaryPreferences?.minSalary > 0 &&
                      !SALARY_PRESETS.some(p => p.value === config.salaryPreferences.minSalary) && (
                        <option value={config.salaryPreferences.minSalary}>
                          {`₹${(config.salaryPreferences.minSalary / 100000).toFixed(1)} LPA`}
                        </option>
                    )}
                  </select>
                  <ChevronDown size={14} className="ap-select-chevron" />
                </div>
              </div>
            </div>

            {/* Row 4: Preferred Locations */}
            <div className="ap-setting-row">
              <div className="ap-setting-left">
                <div className="ap-setting-title-line">
                  <span className="ap-setting-title">Preferred Locations</span>
                  <InfoTooltip text="Target Indian tech capitals (Bengaluru, Hyderabad, Pune, etc.) or Remote positions." />
                </div>
                <span className="ap-setting-desc">Target cities or work modes.</span>
              </div>

              <div className="ap-setting-right">
                <div className="ap-chips-group">
                  {(config.preferredLocations || []).map((loc, idx) => (
                    <span key={idx} className="ap-chip">
                      <span>{loc}</span>
                      <button
                        type="button"
                        className="ap-chip-remove"
                        onClick={() => handleRemoveLocation(loc)}
                        title={`Remove ${loc}`}
                        aria-label={`Remove ${loc}`}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}

                  {isAddingLocation ? (
                    <div className="ap-inline-add-wrap">
                      <input
                        type="text"
                        className="ap-inline-input"
                        placeholder="e.g. Pune, Noida..."
                        value={newLocation}
                        onChange={(e) => setNewLocation(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddLocation();
                          } else if (e.key === 'Escape') {
                            setIsAddingLocation(false);
                          }
                        }}
                        autoFocus
                      />
                      <button type="button" className="ap-inline-btn-submit" onClick={() => handleAddLocation()}>
                        Add
                      </button>
                      <button type="button" className="ap-inline-btn-cancel" onClick={() => setIsAddingLocation(false)}>
                        ✕
                      </button>
                      <div className="ap-suggestions-dropdown">
                        {LOCATION_SUGGESTIONS.filter(s => !(config.preferredLocations || []).includes(s)).slice(0, 5).map(s => (
                          <button
                            key={s}
                            type="button"
                            className="ap-suggestion-pill"
                            onClick={() => handleAddLocation(s)}
                          >
                            + {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="ap-chip-add-btn"
                      onClick={() => setIsAddingLocation(true)}
                    >
                      <Plus size={12} /> Add
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Row 5: Target Role Titles */}
            <div className="ap-setting-row">
              <div className="ap-setting-left">
                <div className="ap-setting-title-line">
                  <span className="ap-setting-title">Target Role Titles</span>
                  <InfoTooltip text="Keywords used to match relevant job family postings." />
                </div>
                <span className="ap-setting-desc">Roles you want to apply for.</span>
              </div>

              <div className="ap-setting-right">
                <div className="ap-chips-group">
                  {(config.targetRoles || []).map((role, idx) => (
                    <span key={idx} className="ap-chip">
                      <span>{role}</span>
                      <button
                        type="button"
                        className="ap-chip-remove"
                        onClick={() => handleRemoveRole(role)}
                        title={`Remove ${role}`}
                        aria-label={`Remove ${role}`}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}

                  {isAddingRole ? (
                    <div className="ap-inline-add-wrap">
                      <input
                        type="text"
                        className="ap-inline-input"
                        placeholder="e.g. Lead SDE..."
                        value={newRole}
                        onChange={(e) => setNewRole(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddRole();
                          } else if (e.key === 'Escape') {
                            setIsAddingRole(false);
                          }
                        }}
                        autoFocus
                      />
                      <button type="button" className="ap-inline-btn-submit" onClick={() => handleAddRole()}>
                        Add
                      </button>
                      <button type="button" className="ap-inline-btn-cancel" onClick={() => setIsAddingRole(false)}>
                        ✕
                      </button>
                      <div className="ap-suggestions-dropdown">
                        {ROLE_SUGGESTIONS.filter(r => !(config.targetRoles || []).includes(r)).slice(0, 4).map(r => (
                          <button
                            key={r}
                            type="button"
                            className="ap-suggestion-pill"
                            onClick={() => handleAddRole(r)}
                          >
                            + {r}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="ap-chip-add-btn"
                      onClick={() => setIsAddingRole(true)}
                    >
                      <Plus size={12} /> Add
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Row 6: Work Modes */}
            <div className="ap-setting-row">
              <div className="ap-setting-left">
                <div className="ap-setting-title-line">
                  <span className="ap-setting-title">Work Modes</span>
                </div>
                <span className="ap-setting-desc">Filter by physical or remote workplace arrangement.</span>
              </div>

              <div className="ap-setting-right">
                <div className="ap-workmode-group">
                  {['remote', 'hybrid', 'onsite'].map(mode => {
                    const isActive = (config.workModes || ['remote', 'hybrid', 'onsite']).includes(mode);
                    return (
                      <button
                        key={mode}
                        type="button"
                        className={`ap-workmode-btn ${isActive ? 'is-active' : ''}`}
                        onClick={() => handleToggleWorkMode(mode)}
                      >
                        {isActive && <Check size={11} strokeWidth={3} />}
                        <span>{mode.charAt(0).toUpperCase() + mode.slice(1)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Row 7: Excluded / Blacklisted Companies */}
            <div className="ap-setting-row">
              <div className="ap-setting-left">
                <div className="ap-setting-title-line">
                  <span className="ap-setting-title">Excluded Companies</span>
                  <InfoTooltip text="Companies you never want Autopilot to evaluate or submit applications to." />
                </div>
                <span className="ap-setting-desc">Never evaluate or apply to roles from these employers.</span>
              </div>

              <div className="ap-setting-right">
                <div className="ap-chips-group">
                  {(config.blacklistedCompanies || []).map((comp, idx) => (
                    <span key={idx} className="ap-chip">
                      <span>{comp}</span>
                      <button
                        type="button"
                        className="ap-chip-remove"
                        onClick={() => handleRemoveBlacklist(comp)}
                        title={`Remove ${comp}`}
                        aria-label={`Remove ${comp}`}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}

                  {isAddingBlacklist ? (
                    <div className="ap-inline-add-wrap">
                      <input
                        type="text"
                        className="ap-inline-input"
                        placeholder="Company name..."
                        value={newBlacklist}
                        onChange={(e) => setNewBlacklist(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddBlacklist();
                          } else if (e.key === 'Escape') {
                            setIsAddingBlacklist(false);
                          }
                        }}
                        autoFocus
                      />
                      <button type="button" className="ap-inline-btn-submit" onClick={handleAddBlacklist}>
                        Add
                      </button>
                      <button type="button" className="ap-inline-btn-cancel" onClick={() => setIsAddingBlacklist(false)}>
                        ✕
                      </button>
                      <div className="ap-suggestions-dropdown">
                        {['TCS', 'Infosys', 'Wipro', 'Cognizant'].filter(c => !(config.blacklistedCompanies || []).includes(c)).map(c => (
                          <button
                            key={c}
                            type="button"
                            className="ap-suggestion-pill"
                            onClick={() => {
                              if (!config.blacklistedCompanies.includes(c)) {
                                const updated = { ...config, blacklistedCompanies: [...config.blacklistedCompanies, c] };
                                setConfig(updated);
                                handleSaveConfig(updated);
                              }
                              setIsAddingBlacklist(false);
                            }}
                          >
                            + {c}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="ap-chip-add-btn"
                      onClick={() => setIsAddingBlacklist(true)}
                    >
                      <Plus size={12} /> Add
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Row 8: Auto-Tailor Resume */}
            <div className="ap-setting-row">
              <div className="ap-setting-left">
                <div className="ap-setting-title-line">
                  <span className="ap-setting-title">Deterministic Resume Tailoring</span>
                  <InfoTooltip text="Reorders and emphasizes verified candidate competencies matching the JD keywords without fabricating unmentioned qualifications." />
                </div>
                <span className="ap-setting-desc">Align resume keywords to job description without hallucinating credentials.</span>
              </div>

              <div className="ap-setting-right">
                <label className="ap-switch">
                  <input
                    type="checkbox"
                    checked={config.autoTailorResume !== false}
                    onChange={(e) => {
                      const updated = { ...config, autoTailorResume: e.target.checked };
                      setConfig(updated);
                      handleSaveConfig(updated);
                    }}
                    aria-label="Toggle Deterministic Resume Tailoring"
                  />
                  <span className="ap-switch-slider" />
                </label>
              </div>
            </div>

            {/* Row 9: Notification on Submission */}
            <div className="ap-setting-row">
              <div className="ap-setting-left">
                <div className="ap-setting-title-line">
                  <span className="ap-setting-title">Email & In-App Notifications</span>
                  <InfoTooltip text="Receive email alerts via Brevo and in-app timeline notifications when opportunities are staged or dispatched." />
                </div>
                <span className="ap-setting-desc">Alert me whenever an application is prepared or dispatched.</span>
              </div>

              <div className="ap-setting-right">
                <label className="ap-switch">
                  <input
                    type="checkbox"
                    checked={config.notifyOnSubmission !== false}
                    onChange={(e) => {
                      const updated = { ...config, notifyOnSubmission: e.target.checked };
                      setConfig(updated);
                      handleSaveConfig(updated);
                    }}
                    aria-label="Toggle Email and In-App Notifications"
                  />
                  <span className="ap-switch-slider" />
                </label>
              </div>
            </div>

          </div>
        </div>

        {/* ==================================================================
            RIGHT COLUMN: RECENT EXECUTION HISTORY & PERFORMANCE ANALYTICS
            ================================================================== */}
        <div className="ap-right-col">

          {/* Card 1: Recent Execution History */}
          <div className="ap-card" id="recent-execution-history">
            <div className="ap-card-header">
              <div className="ap-card-title-group">
                <div className="ap-card-icon-badge" style={{ color: '#B47A49', background: 'rgba(180, 122, 73, 0.12)' }}>
                  <Clock size={19} />
                </div>
                <div>
                  <h2 className="ap-card-title">Recent Execution History</h2>
                  <p className="ap-card-subtitle">Your latest Autopilot runs and results.</p>
                </div>
              </div>

              <div className="ap-card-header-actions">
                {runs.length > 3 && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={() => setShowAllRunsModal(true)}
                  >
                    View All →
                  </button>
                )}
                <button
                  type="button"
                  className="icon-btn-subtle"
                  onClick={fetchAutopilotData}
                  title="Refresh Execution History"
                  aria-label="Refresh Execution History"
                >
                  <RefreshCw size={13} className={loading ? 'ap-spin' : ''} />
                </button>
              </div>
            </div>

            {/* Runs List */}
            {runs.length === 0 ? (
              <div className="ap-empty-state">
                <Bot size={34} className="ap-empty-icon" />
                <h3 className="ap-empty-title">No Autopilot runs recorded yet</h3>
                <p className="ap-empty-desc">
                  Trigger an initial evaluation to screen active ATS postings against your criteria.
                </p>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleTriggerRun}
                  disabled={isRunning}
                  style={{ marginTop: 8 }}
                >
                  Trigger Initial Evaluation
                </button>
              </div>
            ) : (
              <div className="ap-history-list">
                {runs.slice(0, 4).map((run, idx) => {
                  const runNumber = runs.length - idx;
                  const isExpanded = expandedRunId === run._id;
                  const shortlisted = run.actions?.filter(a => a.status === 'matched' || a.status === 'prepared').length || run.applicationsCreated || 0;
                  const applications = run.applicationsSubmitted || (run.status === 'completed' && config.mode === 'autonomous' ? run.applicationsCreated : 0);

                  return (
                    <div key={run._id || idx}>
                      <div
                        className={`ap-history-row ${isExpanded ? 'is-expanded' : ''}`}
                        onClick={() => setExpandedRunId(isExpanded ? null : run._id)}
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                      >
                        <div className="ap-history-left">
                          <div className="ap-history-icon-circle">
                            <Play size={12} fill="currentColor" />
                          </div>
                          <div className="ap-history-title-block">
                            <span className="ap-history-run-title">
                              Autopilot Run #{runNumber}
                            </span>
                            <span className="ap-history-run-meta">
                              {formatRunTimestamp(run.startedAt)} • {run.jobsEvaluated || 0} jobs evaluated
                            </span>
                          </div>
                        </div>

                        <div className="ap-history-right">
                          <span className={`ap-history-badge ${run.status}`}>
                            {run.status === 'completed' ? '✓ Completed' : run.status}
                          </span>

                          <div className="ap-history-stat-col">
                            <span><strong>{shortlisted}</strong> Shortlisted</span>
                            <span><strong>{applications}</strong> Applications</span>
                          </div>

                          <ChevronRight size={15} className="ap-history-chevron" />
                        </div>
                      </div>

                      {/* Expandable Action Breakdown Drawer */}
                      {isExpanded && (
                        <div className="ap-actions-drawer">
                          {(!run.actions || run.actions.length === 0) ? (
                            <span className="text-muted text-xs italic">
                              Evaluated {run.jobsEvaluated} postings. No applications staged in this run.
                            </span>
                          ) : (
                            run.actions.map((act, aIdx) => (
                              <div key={aIdx} className="ap-action-item">
                                <div className="ap-action-info">
                                  <span className={`ap-action-dot ${act.status}`} />
                                  <span className="ap-action-text">
                                    <strong>{act.companyName || 'Employer'}</strong> — {act.jobTitle || 'Role'}
                                  </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span className="ap-action-status-tag">{act.status}</span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Card 2: Autopilot Performance (Last 7 Days) */}
          <div className="ap-card" id="autopilot-performance">
            <div className="ap-card-header">
              <div className="ap-card-title-group">
                <div className="ap-card-icon-badge" style={{ color: '#206E4E', background: 'var(--success-light)' }}>
                  <BarChart2 size={19} />
                </div>
                <div>
                  <h2 className="ap-card-title">Autopilot Performance</h2>
                  <p className="ap-card-subtitle">Aggregated screening metrics and response telemetry.</p>
                </div>
              </div>
            </div>

            {/* 4 Metric Tiles Grid */}
            <div className="ap-perf-grid">

              {/* Metric 1: Jobs Evaluated */}
              <div className="ap-perf-card">
                <div className="ap-perf-icon-badge">
                  <Search size={14} />
                </div>
                <span className="ap-perf-value">{analytics.jobsEvaluated}</span>
                <span className="ap-perf-label">Jobs Evaluated</span>
              </div>

              {/* Metric 2: Shortlisted */}
              <div className="ap-perf-card">
                <div className="ap-perf-icon-badge">
                  <Target size={14} />
                </div>
                <span className="ap-perf-value">{analytics.shortlisted}</span>
                <span className="ap-perf-label">Shortlisted</span>
              </div>

              {/* Metric 3: Applications */}
              <div className="ap-perf-card">
                <div className="ap-perf-icon-badge">
                  <Send size={14} />
                </div>
                <span className="ap-perf-value">{analytics.applications}</span>
                <span className="ap-perf-label">Applications</span>
              </div>

              {/* Metric 4: Response Rate */}
              <div className="ap-perf-card">
                <div className="ap-perf-icon-badge">
                  <TrendingUp size={14} />
                </div>
                <span className="ap-perf-value">{analytics.responseRate}</span>
                <span className="ap-perf-label">Response Rate</span>
              </div>

            </div>
          </div>

        </div>

      </div>

      {/* ====================================================================
          MODALS: Safety Confirmations & Full History
          ==================================================================== */}

      {/* Modal 1: Autonomous Mode Confirmation */}
      {showAutonomousModal && (
        <div className="ap-modal-overlay" onClick={() => setShowAutonomousModal(false)}>
          <div className="ap-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="ap-modal-header">
              <div className="ap-modal-title-row">
                <Zap size={18} className="text-forest" />
                <h3 className="ap-modal-title">Enable Autonomous Mode?</h3>
              </div>
              <button
                type="button"
                className="ap-modal-close-btn"
                onClick={() => setShowAutonomousModal(false)}
                aria-label="Close dialog"
              >
                <X size={16} />
              </button>
            </div>

            <div className="ap-modal-body">
              <p>
                In <strong>Autonomous Mode</strong>, JobRadar will automatically prepare tailored ATS single-column resumes and submit applications directly to supported career portals up to your daily quota ({config.dailyLimit} applications/day).
              </p>

              <div className="ap-modal-safeguards-list">
                <div className="ap-modal-safeguard-item">
                  <Check size={14} className="text-forest" style={{ flexShrink: 0, marginTop: 2 }} />
                  <span><strong>Truthfulness Invariant:</strong> Only verified competencies from your profile are highlighted. Hallucinating credentials is strictly blocked.</span>
                </div>
                <div className="ap-modal-safeguard-item">
                  <Check size={14} className="text-forest" style={{ flexShrink: 0, marginTop: 2 }} />
                  <span><strong>Anti-Bot Safety Halt:</strong> The engine will never bypass or trick CAPTCHAs, pausing for your explicit confirmation if a challenge appears.</span>
                </div>
                <div className="ap-modal-safeguard-item">
                  <Check size={14} className="text-forest" style={{ flexShrink: 0, marginTop: 2 }} />
                  <span><strong>Daily Cap Protection:</strong> Submissions strictly respect your quota to maintain recruiter trust.</span>
                </div>
              </div>
            </div>

            <div className="ap-modal-footer">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowAutonomousModal(false)}
              >
                Keep Assisted Mode
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleConfirmAutonomous}
              >
                Enable Autonomous Mode
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Stop Autopilot Confirmation */}
      {showStopModal && (
        <div className="ap-modal-overlay" onClick={() => setShowStopModal(false)}>
          <div className="ap-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="ap-modal-header">
              <div className="ap-modal-title-row">
                <Square size={16} style={{ color: '#B43428' }} />
                <h3 className="ap-modal-title">Stop Autopilot Execution?</h3>
              </div>
              <button
                type="button"
                className="ap-modal-close-btn"
                onClick={() => setShowStopModal(false)}
                aria-label="Close dialog"
              >
                <X size={16} />
              </button>
            </div>

            <div className="ap-modal-body">
              <p>
                Stopping Autopilot will halt scheduled morning ATS discovery runs and disable automated resume preparation until you choose to activate it again.
              </p>
            </div>

            <div className="ap-modal-footer">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowStopModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={async () => {
                  setShowStopModal(false);
                  await executeSetState('stopped');
                }}
              >
                Stop Autopilot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: View All Execution Runs */}
      {showAllRunsModal && (
        <div className="ap-modal-overlay" onClick={() => setShowAllRunsModal(false)}>
          <div className="ap-modal-dialog" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="ap-modal-header">
              <div className="ap-modal-title-row">
                <Clock size={18} className="text-forest" />
                <h3 className="ap-modal-title">All Execution History ({runs.length} Runs)</h3>
              </div>
              <button
                type="button"
                className="ap-modal-close-btn"
                onClick={() => setShowAllRunsModal(false)}
                aria-label="Close dialog"
              >
                <X size={16} />
              </button>
            </div>

            <div className="ap-modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              <div className="ap-history-list">
                {runs.map((run, idx) => {
                  const runNumber = runs.length - idx;
                  const shortlisted = run.actions?.filter(a => a.status === 'matched' || a.status === 'prepared').length || run.applicationsCreated || 0;
                  const applications = run.applicationsSubmitted || (run.status === 'completed' && config.mode === 'autonomous' ? run.applicationsCreated : 0);

                  return (
                    <div key={run._id || idx} className="ap-history-row">
                      <div className="ap-history-left">
                        <div className="ap-history-icon-circle">
                          <Play size={12} fill="currentColor" />
                        </div>
                        <div className="ap-history-title-block">
                          <span className="ap-history-run-title">
                            Autopilot Run #{runNumber}
                          </span>
                          <span className="ap-history-run-meta">
                            {formatRunTimestamp(run.startedAt)} • {run.jobsEvaluated || 0} jobs evaluated
                          </span>
                        </div>
                      </div>

                      <div className="ap-history-right">
                        <span className={`ap-history-badge ${run.status}`}>
                          {run.status === 'completed' ? '✓ Completed' : run.status}
                        </span>
                        <div className="ap-history-stat-col">
                          <span><strong>{shortlisted}</strong> Shortlisted</span>
                          <span><strong>{applications}</strong> Applied</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="ap-modal-footer">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowAllRunsModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
