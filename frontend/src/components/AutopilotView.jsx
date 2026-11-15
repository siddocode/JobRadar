import React, { useState, useEffect, useCallback } from 'react';
import {
  Bot,
  Play,
  ShieldCheck,
  Clock,
  CheckCircle2,
  RefreshCw,
  Plus
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function AutopilotView({ onNavigateApplications }) {
  const { authFetch, isAuthenticated, openAuthModal } = useAuth();

  const [config, setConfig] = useState({
    enabled: false,
    mode: 'assisted',
    minMatchScore: 70,
    dailyLimit: 5,
    targetRoles: ['Software Engineer', 'Full Stack Developer', 'Backend Engineer'],
    preferredLocations: ['All India'],
    workModes: ['remote', 'hybrid', 'onsite'],
    blacklistedCompanies: []
  });

  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [lastRunResult, setLastRunResult] = useState(null);

  const [newRole, setNewRole] = useState('');
  const [newBlacklist, setNewBlacklist] = useState('');

  // Fetch Autopilot Config & Recent Runs
  const fetchAutopilotData = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [resConfig, resRuns] = await Promise.all([
        authFetch('/api/autopilot/config'),
        authFetch('/api/autopilot/runs')
      ]);

      if (resConfig.ok) {
        const data = await resConfig.json();
        if (data.success && data.config) {
          setConfig(data.config);
        }
      }

      if (resRuns.ok) {
        const runsData = await resRuns.json();
        if (runsData.success) {
          setRuns(runsData.runs || []);
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

  // Toggle master active state
  const handleToggleEnabled = async () => {
    const updated = { ...config, enabled: !config.enabled };
    setConfig(updated);
    await handleSaveConfig(updated);
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

  const handleAddRole = (e) => {
    e.preventDefault();
    if (!newRole.trim()) return;
    const trimmed = newRole.trim();
    if (!config.targetRoles.includes(trimmed)) {
      const updated = { ...config, targetRoles: [...config.targetRoles, trimmed] };
      setConfig(updated);
      handleSaveConfig(updated);
    }
    setNewRole('');
  };

  const handleRemoveRole = (role) => {
    const updated = { ...config, targetRoles: config.targetRoles.filter(r => r !== role) };
    setConfig(updated);
    handleSaveConfig(updated);
  };

  const handleAddBlacklist = (e) => {
    e.preventDefault();
    if (!newBlacklist.trim()) return;
    const trimmed = newBlacklist.trim();
    if (!config.blacklistedCompanies.includes(trimmed)) {
      const updated = { ...config, blacklistedCompanies: [...config.blacklistedCompanies, trimmed] };
      setConfig(updated);
      handleSaveConfig(updated);
    }
    setNewBlacklist('');
  };

  const handleRemoveBlacklist = (comp) => {
    const updated = { ...config, blacklistedCompanies: config.blacklistedCompanies.filter(c => c !== comp) };
    setConfig(updated);
    handleSaveConfig(updated);
  };

  if (!isAuthenticated) {
    return (
      <div className="auth-gate-box">
        <Bot size={48} className="text-forest opacity-80" />
        <h2 className="auth-gate-title">Sign in to configure Application Autopilot</h2>
        <p className="auth-gate-text">
          Automate repetitive job screening, tailor verified resumes, and stage applications for instant review.
        </p>
        <button
          type="button"
          className="btn btn-primary btn-md"
          onClick={() => openAuthModal('Sign in to configure autopilot', 'login')}
        >
          Sign In / Create Account
        </button>
      </div>
    );
  }

  return (
    <div className="autopilot-container">
      {/* View Header */}
      <div className="view-header">
        <div>
          <h1 className="view-title">Application Autopilot Engine</h1>
          <p className="view-subtitle">
            Autonomous job screening, deterministic eligibility checks, and assisted application preparation.
          </p>
        </div>
        <div className="view-header-actions">
          <button
            type="button"
            className="btn btn-primary btn-md"
            onClick={handleTriggerRun}
            disabled={isRunning}
          >
            {isRunning ? <RefreshCw size={15} className="spin" /> : <Play size={15} />}
            {isRunning ? 'Evaluating Postings...' : 'Run Autopilot Now'}
          </button>
        </div>
      </div>

      {/* Live Run Banner Alert (if run completed) */}
      {lastRunResult && (
        <div className="autopilot-alert-box">
          <div className="flex-inline-gap">
            <CheckCircle2 size={18} className="text-forest" />
            <div>
              <span className="font-semibold block">{lastRunResult.message}</span>
              <span className="text-muted text-xs">
                Evaluated {lastRunResult.jobsEvaluated} opportunities • Staged {lastRunResult.applicationsCreated} applications • Daily quota remaining: {lastRunResult.quotaRemaining}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={onNavigateApplications}
          >
            View Applications
          </button>
        </div>
      )}

      {/* Settings Grid */}
      <div className="autopilot-grid">
        {/* Left Column: Autonomy & Safety Settings */}
        <div className="autopilot-card">
          <div className="autopilot-card-header">
            <div className="flex-inline-gap">
              <ShieldCheck size={18} className="text-forest" />
              <h2 className="autopilot-card-title">Automation & Safety Controls</h2>
            </div>
            <button
              type="button"
              className={`toggle-switch-btn ${config.enabled ? 'active' : ''}`}
              onClick={handleToggleEnabled}
            >
              {config.enabled ? 'Autopilot Active' : 'Autopilot Paused'}
            </button>
          </div>

          <div className="autopilot-card-body">
            {/* Mode Selector */}
            <div className="form-group mb-4">
              <label className="form-label">Autonomy Mode</label>
              <div className="mode-toggle-group">
                <button
                  type="button"
                  className={`mode-btn ${config.mode === 'assisted' ? 'active' : ''}`}
                  onClick={() => {
                    const updated = { ...config, mode: 'assisted' };
                    setConfig(updated);
                    handleSaveConfig(updated);
                  }}
                >
                  <div className="font-semibold text-sm">Assisted Mode (Recommended)</div>
                  <p className="text-muted text-xs mt-1">
                    Evaluates jobs and prepares tailored resumes, staging each opportunity under "Awaiting Approval" for your 1-click review.
                  </p>
                </button>

                <button
                  type="button"
                  className={`mode-btn ${config.mode === 'autonomous' ? 'active' : ''}`}
                  onClick={() => {
                    const updated = { ...config, mode: 'autonomous' };
                    setConfig(updated);
                    handleSaveConfig(updated);
                  }}
                >
                  <div className="font-semibold text-sm">Autonomous Mode</div>
                  <p className="text-muted text-xs mt-1">
                    Automatically pre-fills supported career portals up to your daily submission cap with safety fallbacks on CAPTCHAs.
                  </p>
                </button>
              </div>
            </div>

            {/* Daily Submission Cap Slider */}
            <div className="form-group mb-4">
              <div className="flex-between">
                <label className="form-label">Daily Application Quota</label>
                <span className="font-semibold text-forest text-sm">{config.dailyLimit} applications / day</span>
              </div>
              <input
                type="range"
                min="1"
                max="20"
                value={config.dailyLimit}
                className="range-slider"
                onChange={(e) => {
                  const updated = { ...config, dailyLimit: parseInt(e.target.value, 10) };
                  setConfig(updated);
                }}
                onMouseUp={() => handleSaveConfig()}
                onTouchEnd={() => handleSaveConfig()}
              />
              <span className="text-muted text-xs">
                Restricts daily submissions to protect recruiter response rates and prevent platform flagging.
              </span>
            </div>

            {/* Minimum Match Score Threshold */}
            <div className="form-group mb-4">
              <div className="flex-between">
                <label className="form-label">Minimum Match Compatibility Threshold</label>
                <span className="font-semibold text-copper text-sm">{config.minMatchScore}% Match</span>
              </div>
              <input
                type="range"
                min="50"
                max="95"
                step="5"
                value={config.minMatchScore}
                className="range-slider"
                onChange={(e) => {
                  const updated = { ...config, minMatchScore: parseInt(e.target.value, 10) };
                  setConfig(updated);
                }}
                onMouseUp={() => handleSaveConfig()}
                onTouchEnd={() => handleSaveConfig()}
              />
              <span className="text-muted text-xs">
                Jobs below this score or with hard residency/work authorization blockers are automatically filtered out.
              </span>
            </div>

            {/* Target Role Filters */}
            <div className="form-group mb-4">
              <label className="form-label">Target Role Titles</label>
              <form onSubmit={handleAddRole} className="skill-add-form mb-2">
                <input
                  type="text"
                  className="form-input text-xs"
                  placeholder="e.g. SDE II, Lead Frontend Engineer..."
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                />
                <button type="submit" className="btn btn-secondary btn-xs">
                  <Plus size={13} /> Add
                </button>
              </form>
              <div className="skills-tags-wrap">
                {config.targetRoles.map((role, idx) => (
                  <span key={idx} className="skill-pill-tag">
                    {role}
                    <button type="button" className="skill-remove-btn" onClick={() => handleRemoveRole(role)}>×</button>
                  </span>
                ))}
              </div>
            </div>

            {/* Blacklisted Companies */}
            <div className="form-group">
              <label className="form-label">Excluded / Blacklisted Companies</label>
              <form onSubmit={handleAddBlacklist} className="skill-add-form mb-2">
                <input
                  type="text"
                  className="form-input text-xs"
                  placeholder="Company name to exclude..."
                  value={newBlacklist}
                  onChange={(e) => setNewBlacklist(e.target.value)}
                />
                <button type="submit" className="btn btn-secondary btn-xs">
                  <Plus size={13} /> Add
                </button>
              </form>
              <div className="skills-tags-wrap">
                {config.blacklistedCompanies.map((c, idx) => (
                  <span key={idx} className="skill-pill-tag tag-muted">
                    {c}
                    <button type="button" className="skill-remove-btn" onClick={() => handleRemoveBlacklist(c)}>×</button>
                  </span>
                ))}
                {config.blacklistedCompanies.length === 0 && (
                  <span className="text-muted text-xs italic">No companies blacklisted.</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Execution History & Activity Stream */}
        <div className="autopilot-card">
          <div className="autopilot-card-header">
            <div className="flex-inline-gap">
              <Clock size={18} className="text-copper" />
              <h2 className="autopilot-card-title">Recent Execution History</h2>
            </div>
            <button
              type="button"
              className="icon-btn-subtle"
              onClick={fetchAutopilotData}
              title="Refresh History"
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
            </button>
          </div>

          <div className="autopilot-card-body">
            {runs.length === 0 ? (
              <div className="empty-state-mini">
                <Bot size={36} className="text-muted opacity-40" />
                <p className="empty-text-mini">No autopilot runs recorded yet.</p>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleTriggerRun}
                  disabled={isRunning}
                >
                  Trigger Initial Evaluation
                </button>
              </div>
            ) : (
              <div className="runs-history-list">
                {runs.map(run => (
                  <div key={run._id} className="run-history-item">
                    <div className="run-history-header">
                      <span className="run-history-date">
                        {new Date(run.startedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                      <span className={`status-pill status-${run.status}`}>
                        {run.status}
                      </span>
                    </div>

                    <div className="run-history-metrics">
                      <span className="text-xs text-muted">
                        Evaluated: <strong className="text-forest">{run.jobsEvaluated}</strong>
                      </span>
                      <span className="dot-divider">•</span>
                      <span className="text-xs text-muted">
                        Staged: <strong className="text-copper">{run.applicationsCreated}</strong>
                      </span>
                    </div>

                    {run.actions && run.actions.length > 0 && (
                      <div className="run-actions-snippet">
                        {run.actions.slice(0, 3).map((act, aIdx) => (
                          <div key={aIdx} className="run-action-row">
                            <span className={`action-status-dot dot-${act.status}`} />
                            <span className="action-text">
                              <strong>{act.companyName}</strong> — {act.jobTitle} ({act.status})
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
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

