import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Layers,
  Search,
  Plus,
  Clock,
  Building2,
  MapPin,
  ExternalLink,
  Trash2,
  Edit3,
  Send,
  Download,
  Eye,
  RefreshCw,
  Mail,
  Sparkles,
  Inbox,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { downloadResumePdf, downloadLatexFile } from '../utils/pdfGenerator';

const STAGES = [
  { key: 'all', label: 'All Stages', color: 'neutral' },
  { key: 'shortlisted', label: 'Shortlisted', color: 'sand' },
  { key: 'resume_ready', label: 'Resume Ready', color: 'info' },
  { key: 'awaiting_approval', label: 'Awaiting Approval', color: 'warning' },
  { key: 'applied', label: 'Applied', color: 'copper' },
  { key: 'assessment', label: 'Assessment', color: 'info' },
  { key: 'interview', label: 'Interview', color: 'forest' },
  { key: 'offer', label: 'Offer', color: 'success' },
  { key: 'rejected', label: 'Rejected', color: 'danger' },
  { key: 'withdrawn', label: 'Withdrawn', color: 'neutral' }
];

export default function ApplicationsView({ onNavigateJobs }) {
  const { authFetch, isAuthenticated, openAuthModal } = useAuth();
  const [applications, setApplications] = useState([]);
  const [stats, setStats] = useState({});
  const [selectedStage, setSelectedStage] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('kanban'); // 'kanban' | 'table'
  const [loading, setLoading] = useState(true);
  const [, setError] = useState(null);

  // Selected application for detail modal
  const [activeApp, setActiveApp] = useState(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [migrating, setMigrating] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);

  // Inbound Recruiter Email Ingestion & Testing State
  const [showIngestModal, setShowIngestModal] = useState(false);
  const [ingestDraft, setIngestDraft] = useState({
    from: '',
    subject: '',
    body: '',
    date: new Date().toISOString().slice(0, 10)
  });
  const [ingesting, setIngesting] = useState(false);
  const [ingestFeedback, setIngestFeedback] = useState(null);

  // Gmail OAuth status
  const [gmailStatus, setGmailStatus] = useState({ configured: false, connected: false });
  const [syncingGmail, setSyncingGmail] = useState(false);
  const [showGmailModal, setShowGmailModal] = useState(false);

  // Fetch applications list & stats
  const fetchApplications = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedStage !== 'all') params.set('status', selectedStage);
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      params.set('limit', '100');

      const [resApps, resStats] = await Promise.all([
        authFetch(`/api/applications?${params.toString()}`),
        authFetch('/api/applications/stats')
      ]);

      if (resApps.ok) {
        const data = await resApps.json();
        if (data.success) {
          setApplications(data.applications || []);
        }
      }

      if (resStats.ok) {
        const statsData = await resStats.json();
        if (statsData.success) {
          setStats(statsData.stats || {});
        }
      }
    } catch (err) {
      console.error('Failed to load applications:', err);
      setError('Could not retrieve your application lifecycle board.');
    } finally {
      setLoading(false);
    }
  }, [authFetch, isAuthenticated, selectedStage, searchQuery]);

  // Fetch Gmail OAuth connection status
  const fetchGmailStatus = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await authFetch('/api/applications/gmail/status');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setGmailStatus(data);
        }
      }
    } catch (_) {}
  }, [authFetch, isAuthenticated]);

  useEffect(() => {
    fetchApplications();
    fetchGmailStatus();
  }, [fetchApplications, fetchGmailStatus]);

  // Stage update
  const handleUpdateStatus = async (appId, newStatus) => {
    try {
      const res = await authFetch(`/api/applications/${appId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        const data = await res.json();
        fetchApplications();
        if (activeApp && activeApp._id === appId) {
          setActiveApp(data.application || (prev => ({ ...prev, status: newStatus })));
        }
      }
    } catch (err) {
      console.error('Failed to update stage:', err);
    }
  };

  // Save notes
  const handleSaveNotes = async (appId) => {
    try {
      const res = await authFetch(`/api/applications/${appId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notesDraft })
      });
      if (res.ok) {
        const data = await res.json();
        setEditingNotes(false);
        fetchApplications();
        if (activeApp && activeApp._id === appId) {
          setActiveApp(data.application || (prev => ({ ...prev, notes: notesDraft })));
        }
      }
    } catch (err) {
      console.error('Failed to save notes:', err);
    }
  };

  // Delete application
  const handleDeleteApplication = async (appId) => {
    if (!window.confirm('Are you sure you want to remove this application record?')) return;
    try {
      const res = await authFetch(`/api/applications/${appId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setActiveApp(null);
        fetchApplications();
      }
    } catch (err) {
      console.error('Failed to delete application:', err);
    }
  };

  // Migrate legacy pipeline
  const handleMigratePipeline = async () => {
    setMigrating(true);
    try {
      const res = await authFetch('/api/applications/migrate-pipeline', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(data.message || 'Pipeline successfully migrated to applications.');
        fetchApplications();
      }
    } catch (err) {
      alert('Failed to migrate pipeline entries: ' + err.message);
    } finally {
      setMigrating(false);
    }
  };

  // 1-Click Dispatch & Apply
  const handleDispatch = async (appId) => {
    setIsDispatching(true);
    try {
      const res = await authFetch(`/api/applications/${appId}/dispatch`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(data.message || 'Application dispatched successfully!');
        if (data.applyUrl) {
          window.open(data.applyUrl, '_blank', 'noopener,noreferrer');
        }
        fetchApplications();
        if (activeApp && activeApp._id === appId) {
          setActiveApp(prev => ({ ...prev, status: 'applied' }));
        }
      } else {
        alert(data.error || 'Failed to dispatch application');
      }
    } catch (err) {
      alert('Error dispatching application: ' + err.message);
    } finally {
      setIsDispatching(false);
    }
  };

  // Ingest & match recruiter response email
  const handleIngestMessage = async (customDraft = null) => {
    const payload = customDraft || ingestDraft;
    if (!payload.subject && !payload.body) {
      alert('Please provide at least a subject or body for the recruiter message.');
      return;
    }
    setIngesting(true);
    setIngestFeedback(null);
    try {
      const res = await authFetch('/api/applications/ingest-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIngestFeedback(data);
        fetchApplications();
        // If an active app matches or is affected, update activeApp with new event timeline
        if (data.linked && data.applicationId) {
          const updatedRes = await authFetch(`/api/applications?q=${encodeURIComponent(data.company || '')}`);
          if (updatedRes.ok) {
            const listData = await updatedRes.json();
            const matched = listData.applications?.find(a => a._id === data.applicationId);
            if (matched && activeApp && activeApp._id === data.applicationId) {
              setActiveApp(matched);
            }
          }
        }
      } else {
        setIngestFeedback({ success: false, error: data.error || 'Failed to process message' });
      }
    } catch (err) {
      setIngestFeedback({ success: false, error: err.message });
    } finally {
      setIngesting(false);
    }
  };

  // Trigger Gmail Inbox Scan & Synchronization
  const handleSyncGmail = async () => {
    setSyncingGmail(true);
    try {
      const res = await authFetch('/api/applications/gmail/sync', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(`Gmail scan complete! Scanned ${data.processedCount || 0} messages. Linked ${data.linkedCount || 0} application updates.`);
        fetchApplications();
        fetchGmailStatus();
      } else {
        alert(data.error || 'Gmail sync failed. Please check your credentials or connect Gmail.');
      }
    } catch (err) {
      alert('Error during Gmail sync: ' + err.message);
    } finally {
      setSyncingGmail(false);
    }
  };

  // Initiate Gmail OAuth 2.0 connection
  const handleConnectGmail = async () => {
    try {
      const res = await authFetch('/api/applications/gmail/auth-url');
      const data = await res.json();
      if (res.ok && data.success && data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        setShowGmailModal(true);
      }
    } catch (_) {
      setShowGmailModal(true);
    }
  };

  // Group applications by stage for Kanban board
  const kanbanColumns = useMemo(() => {
    const primaryStages = ['shortlisted', 'awaiting_approval', 'applied', 'interview', 'offer', 'rejected'];
    const map = {};
    primaryStages.forEach(s => { map[s] = []; });
    applications.forEach(app => {
      if (map[app.status]) {
        map[app.status].push(app);
      } else {
        if (!map['shortlisted']) map['shortlisted'] = [];
        map['shortlisted'].push(app);
      }
    });
    return map;
  }, [applications]);

  // Sample templates for testing recruiter emails
  const sampleTemplates = useMemo(() => [
    {
      label: 'Interview Invite',
      tag: 'interview',
      from: activeApp ? `recruiter@${activeApp.companyName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com` : 'recruiting@swiggy.in',
      subject: activeApp ? `Interview Invitation - ${activeApp.companyName}` : 'Invitation to Interview - Swiggy Engineering',
      body: 'Hi, we would like to invite you for a 45-minute technical interview on Google Meet to discuss your experience.'
    },
    {
      label: 'Coding Assessment',
      tag: 'assessment',
      from: 'challenges@hackerrank.net',
      subject: activeApp ? `HackerRank Online Assessment: ${activeApp.companyName}` : 'HackerRank Online Assessment - Software Engineer',
      body: 'Please complete your online assessment coding challenge on HackerRank within 48 hours to proceed.'
    },
    {
      label: 'Job Offer',
      tag: 'offer',
      from: activeApp ? `hr@${activeApp.companyName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com` : 'talent@razorpay.com',
      subject: activeApp ? `Formal Offer of Employment - ${activeApp.jobTitle} at ${activeApp.companyName}` : 'Formal Offer of Employment - Senior Backend Engineer',
      body: 'We are pleased to offer you the position. Welcome to the team! Details on compensation and joining are attached.'
    },
    {
      label: 'Rejection Notice',
      tag: 'rejected',
      from: activeApp ? `careers@${activeApp.companyName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com` : 'careers@startup.io',
      subject: activeApp ? `Update regarding your application to ${activeApp.companyName}` : 'Update regarding your application',
      body: 'Thank you for your interest and time. Unfortunately, after careful consideration, we have decided to move forward with other candidates.'
    },
    {
      label: 'Application Received',
      tag: 'applied',
      from: 'no-reply@greenhouse.io',
      subject: activeApp ? `Thank you for applying to ${activeApp.companyName}` : 'Thank you for applying to PhonePe',
      body: 'We have received your application. Our recruiting team will review your qualifications and reach out if there is a match.'
    }
  ], [activeApp]);

  if (!isAuthenticated) {
    return (
      <div className="auth-gate-box">
        <Layers size={48} className="text-copper opacity-80" />
        <h2 className="auth-gate-title">Sign in to manage your Application Lifecycle</h2>
        <p className="auth-gate-text">
          Track end-to-end applications from discovery to offer, preserve submitted resume snapshots, and schedule interview prep.
        </p>
        <button
          type="button"
          className="btn btn-primary btn-md"
          onClick={() => openAuthModal('Sign in to track applications', 'login')}
        >
          Sign In / Create Account
        </button>
      </div>
    );
  }

  return (
    <div className="applications-container">
      {/* Top Header Bar */}
      <div className="view-header">
        <div>
          <h1 className="view-title">Application Lifecycle Board</h1>
          <p className="view-subtitle">
            Track and manage your engineering applications across all stages of the recruitment funnel.
          </p>
        </div>
        <div className="view-header-actions">
          {/* Recruiter Email Tracking & Ingestion Trigger */}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setIngestFeedback(null);
              setShowIngestModal(true);
            }}
            title="Simulate or ingest recruiter replies to advance application stages"
          >
            <Mail size={14} className="text-forest" />
            Track Recruiter Email
          </button>

          {/* Gmail OAuth Integration Button */}
          {gmailStatus.connected ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleSyncGmail}
              disabled={syncingGmail}
              title="Sync recent recruiter replies from your connected Gmail inbox (read-only)"
            >
              <RefreshCw size={14} className={syncingGmail ? 'spin' : 'text-forest'} />
              {syncingGmail ? 'Scanning Gmail...' : 'Sync Gmail'}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleConnectGmail}
              title="Connect Gmail to automatically detect recruiter interviews, assessments, and offers"
            >
              <Inbox size={14} />
              {gmailStatus.configured ? 'Connect Gmail' : 'Gmail Sync (Free)'}
            </button>
          )}

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleMigratePipeline}
            disabled={migrating}
            title="Import existing cold-outreach contacts into this lifecycle board"
          >
            <RefreshCw size={14} className={migrating ? 'spin' : ''} />
            {migrating ? 'Importing...' : 'Sync Outreach Pipeline'}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={onNavigateJobs}
          >
            <Plus size={15} /> Find New Jobs
          </button>
        </div>
      </div>

      {/* Filter Ribbon & View Controls */}
      <div className="applications-controls-bar">
        <div className="search-input-wrap">
          <Search size={15} className="search-icon" />
          <input
            type="text"
            className="search-input-field"
            placeholder="Search by role, company, or notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="stage-filter-pills">
          {STAGES.slice(0, 7).map(stage => (
            <button
              key={stage.key}
              type="button"
              className={`stage-filter-pill ${selectedStage === stage.key ? 'active' : ''}`}
              onClick={() => setSelectedStage(stage.key)}
            >
              {stage.label}
              {stats[stage.key] !== undefined && (
                <span className="stage-pill-count">{stats[stage.key]}</span>
              )}
            </button>
          ))}
        </div>

        <div className="view-toggle-btns">
          <button
            type="button"
            className={`view-toggle-btn ${viewMode === 'kanban' ? 'active' : ''}`}
            onClick={() => setViewMode('kanban')}
          >
            Kanban
          </button>
          <button
            type="button"
            className={`view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
            onClick={() => setViewMode('table')}
          >
            List
          </button>
        </div>
      </div>

      {/* Main View Area */}
      {loading ? (
        <div className="loading-state-box">
          <RefreshCw size={24} className="spin text-copper" />
          <p>Loading application pipeline...</p>
        </div>
      ) : applications.length === 0 ? (
        <div className="empty-state-large">
          <Layers size={48} className="text-muted opacity-40" />
          <h3>No applications found</h3>
          <p>Discover tech jobs from direct ATS boards and stage them here to track your progress.</p>
          <button
            type="button"
            className="btn btn-primary btn-md"
            onClick={onNavigateJobs}
          >
            Discover Jobs Now
          </button>
        </div>
      ) : viewMode === 'kanban' ? (
        /* Kanban Columns View */
        <div className="kanban-grid">
          {Object.entries(kanbanColumns).map(([stageKey, items]) => {
            const stageMeta = STAGES.find(s => s.key === stageKey) || { label: stageKey, color: 'neutral' };
            return (
              <div key={stageKey} className="kanban-column">
                <div className="kanban-column-header">
                  <span className={`stage-indicator-dot dot-${stageMeta.color}`} />
                  <span className="kanban-column-title">{stageMeta.label}</span>
                  <span className="kanban-column-count">{items.length}</span>
                </div>
                <div className="kanban-cards-list">
                  {items.map(app => (
                    <div
                      key={app._id}
                      className="kanban-card"
                      onClick={() => {
                        setActiveApp(app);
                        setNotesDraft(app.notes || '');
                        setEditingNotes(false);
                      }}
                    >
                      <div className="kanban-card-top">
                        <span className="kanban-card-company">{app.companyName}</span>
                        {app.matchScore && (
                          <span className="match-tag-micro">{app.matchScore}%</span>
                        )}
                      </div>
                      <h4 className="kanban-card-role">{app.jobTitle}</h4>
                      <div className="kanban-card-meta">
                        <span className="kanban-meta-item">
                          <MapPin size={11} /> {app.location || 'India'}
                        </span>
                        {app.appliedAt && (
                          <span className="kanban-meta-item">
                            <Clock size={11} /> {new Date(app.appliedAt).toLocaleDateString()}
                          </span>
                        )}
                        {app.events && app.events.length > 0 && (
                          <span className="kanban-meta-item text-forest" title="Timeline events recorded">
                            • {app.events.length} event{app.events.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <div className="kanban-card-footer">
                        <select
                          className="kanban-stage-select"
                          value={app.status}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => handleUpdateStatus(app._id, e.target.value)}
                        >
                          {STAGES.filter(s => s.key !== 'all').map(st => (
                            <option key={st.key} value={st.key}>{st.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && (
                    <div className="kanban-column-empty">No applications</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table List View */
        <div className="app-table-container">
          <table className="app-table">
            <thead>
              <tr>
                <th>Job Title & Role</th>
                <th>Company</th>
                <th>Location</th>
                <th>Stage</th>
                <th>Match</th>
                <th>Events</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {applications.map(app => (
                <tr
                  key={app._id}
                  onClick={() => {
                    setActiveApp(app);
                    setNotesDraft(app.notes || '');
                    setEditingNotes(false);
                  }}
                >
                  <td className="font-semibold text-forest">{app.jobTitle}</td>
                  <td>
                    <span className="flex-inline-gap">
                      <Building2 size={13} className="text-muted" /> {app.companyName}
                    </span>
                  </td>
                  <td>{app.location || 'India'}</td>
                  <td>
                    <span className={`status-pill status-${app.status}`}>
                      {app.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td>
                    {app.matchScore ? `${app.matchScore}%` : '—'}
                  </td>
                  <td>
                    <span className="text-xs text-muted">
                      {app.events?.length || 0}
                    </span>
                  </td>
                  <td className="text-muted">
                    {new Date(app.updatedAt).toLocaleDateString()}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="icon-btn-subtle"
                      title="View Details"
                      onClick={() => {
                        setActiveApp(app);
                        setNotesDraft(app.notes || '');
                        setEditingNotes(false);
                      }}
                    >
                      <Eye size={15} />
                    </button>
                    {app.applyUrl && (
                      <a
                        href={app.applyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="icon-btn-subtle"
                        title="Open Job Posting"
                      >
                        <ExternalLink size={15} />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Application Detail Modal / Drawer */}
      {activeApp && (
        <div className="modal-backdrop" onClick={() => setActiveApp(null)}>
          <div className="modal-card modal-md" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="modal-eyebrow">Application Details</span>
                <h2 className="modal-title">{activeApp.jobTitle}</h2>
                <span className="modal-subtitle">
                  <Building2 size={14} /> {activeApp.companyName}
                  {activeApp.location && ` • ${activeApp.location}`}
                </span>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setActiveApp(null)}
              >
                ×
              </button>
            </div>

            <div className="modal-body">
              {/* Stage Progression Bar */}
              <div className="app-detail-section">
                <label className="section-label">Lifecycle Stage</label>
                <div className="stage-selector-grid">
                  {STAGES.filter(s => s.key !== 'all').map(stage => (
                    <button
                      key={stage.key}
                      type="button"
                      className={`stage-select-btn ${activeApp.status === stage.key ? 'active' : ''}`}
                      onClick={() => handleUpdateStatus(activeApp._id, stage.key)}
                    >
                      {stage.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tailored Resume Snapshot (if available) */}
              {activeApp.tailoredResumeSnapshot && (
                <div className="app-detail-section">
                  <label className="section-label">Submitted Resume Snapshot</label>
                  <div className="resume-snapshot-box">
                    <div>
                      <span className="font-semibold text-forest">
                        {activeApp.tailoredResumeSnapshot.name || 'Candidate Resume'}
                      </span>
                      <p className="text-muted text-xs">
                        Single-column ATS LaTeX format tailored specifically for {activeApp.companyName}.
                      </p>
                    </div>
                    <div className="flex-inline-gap">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => downloadResumePdf(activeApp.tailoredResumeSnapshot, `${activeApp.companyName}_Tailored_Resume`)}
                      >
                        <Download size={14} /> Download PDF
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => downloadLatexFile(activeApp.tailoredResumeSnapshot, `${activeApp.companyName}_Tailored_Resume`)}
                      >
                        <Download size={14} /> Overleaf (.tex)
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Notes & Follow-up Log */}
              <div className="app-detail-section">
                <div className="flex-between">
                  <label className="section-label">Private Notes & Follow-up History</label>
                  {!editingNotes && (
                    <button
                      type="button"
                      className="link-btn text-xs"
                      onClick={() => setEditingNotes(true)}
                    >
                      <Edit3 size={12} /> Edit
                    </button>
                  )}
                </div>

                {editingNotes ? (
                  <div className="notes-edit-wrap">
                    <textarea
                      className="notes-textarea"
                      rows={4}
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      placeholder="Add recruiter details, interview rounds, salary discussed..."
                    />
                    <div className="notes-actions">
                      <button
                        type="button"
                        className="btn btn-secondary btn-xs"
                        onClick={() => setEditingNotes(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-xs"
                        onClick={() => handleSaveNotes(activeApp._id)}
                      >
                        Save Notes
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="notes-display">
                    {activeApp.notes || 'No private notes added yet.'}
                  </p>
                )}
              </div>

              {/* Real-time Activity Timeline */}
              <div className="app-detail-section">
                <div className="flex-between" style={{ marginBottom: '8px' }}>
                  <label className="section-label">
                    Activity Timeline {activeApp.events?.length ? `(${activeApp.events.length})` : ''}
                  </label>
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={() => {
                      setIngestDraft({
                        from: `recruiter@${activeApp.companyName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
                        subject: `Interview Invitation - ${activeApp.companyName}`,
                        body: `Hi, we would like to schedule a technical interview on Google Meet for the ${activeApp.jobTitle} position.`,
                        date: new Date().toISOString().slice(0, 10)
                      });
                      setIngestFeedback(null);
                      setShowIngestModal(true);
                    }}
                  >
                    <Mail size={12} /> Test Recruiter Email for this Role
                  </button>
                </div>

                {activeApp.events && activeApp.events.length > 0 ? (
                  <div className="timeline-list">
                    {activeApp.events.map((ev, idx) => {
                      const stageMeta = STAGES.find(s => s.key === ev.status) || { label: ev.status, color: 'neutral' };
                      return (
                        <div key={idx} className="timeline-row">
                          <span className={`timeline-dot dot-${stageMeta.color}`} />
                          <div className="timeline-content">
                            <div className="flex-inline-gap" style={{ alignItems: 'center', marginBottom: '2px' }}>
                              <span className={`status-pill status-${ev.status}`} style={{ fontSize: '11px', padding: '1px 8px' }}>
                                {stageMeta.label}
                              </span>
                              <span className="timeline-time" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                {new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}, {new Date(ev.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                            </div>
                            <span className="timeline-note" style={{ fontSize: '12.5px', color: 'var(--text-primary)' }}>{ev.note}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ padding: '14px', background: 'var(--bg-card-subtle)', borderRadius: 'var(--radius-md)', textAlign: 'center', border: '1px dashed var(--border-subtle)' }}>
                    <Clock size={18} className="text-muted" style={{ margin: '0 auto 6px auto', display: 'block' }} />
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                      No recruiter communication events recorded yet. Ingest an inbound recruiter email to see updates here.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer flex-between">
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => handleDeleteApplication(activeApp._id)}
              >
                <Trash2 size={14} /> Delete
              </button>
              <div className="flex-inline-gap">
                {activeApp.applyUrl && (
                  <a
                    href={activeApp.applyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary btn-sm"
                  >
                    Open Career Portal <ExternalLink size={13} />
                  </a>
                )}
                {(activeApp.status === 'awaiting_approval' || activeApp.status === 'shortlisted' || activeApp.status === 'resume_ready') && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={isDispatching}
                    onClick={() => handleDispatch(activeApp._id)}
                  >
                    {isDispatching ? <RefreshCw size={13} className="spin" /> : <Send size={13} />}
                    1-Click Dispatch & Apply
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setActiveApp(null)}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recruiter Email Ingestion & Testing Modal */}
      {showIngestModal && (
        <div className="modal-backdrop" onClick={() => setShowIngestModal(false)}>
          <div className="modal-card modal-md" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="modal-eyebrow">Inbound Recruiter Tracking Engine</span>
                <h2 className="modal-title">Track & Ingest Recruiter Email</h2>
                <span className="modal-subtitle">
                  Classifies responses into lifecycle stages (Interview, Assessment, Offer, Rejection) and records timeline events in real-time.
                </span>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowIngestModal(false)}
              >
                ×
              </button>
            </div>

            <div className="modal-body">
              {/* Sample Templates Ribbon */}
              <div style={{ marginBottom: '16px' }}>
                <label className="section-label" style={{ marginBottom: '6px' }}>
                  <Sparkles size={13} className="text-copper" /> Quick-Test Sample Templates:
                </label>
                <div className="flex-inline-gap" style={{ flexWrap: 'wrap', gap: '6px' }}>
                  {sampleTemplates.map((tpl, i) => (
                    <button
                      key={i}
                      type="button"
                      className="btn btn-secondary btn-xs"
                      onClick={() => {
                        setIngestDraft({
                          from: tpl.from,
                          subject: tpl.subject,
                          body: tpl.body,
                          date: new Date().toISOString().slice(0, 10)
                        });
                        setIngestFeedback(null);
                      }}
                    >
                      {tpl.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Form Inputs */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label className="section-label">Sender Email (From):</label>
                  <input
                    type="text"
                    className="search-input-field"
                    style={{ width: '100%', padding: '8px 12px' }}
                    placeholder="e.g. recruiter@swiggy.in or hr@razorpay.com"
                    value={ingestDraft.from}
                    onChange={(e) => setIngestDraft(prev => ({ ...prev, from: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="section-label">Subject Line:</label>
                  <input
                    type="text"
                    className="search-input-field"
                    style={{ width: '100%', padding: '8px 12px' }}
                    placeholder="e.g. Invitation to Interview with Engineering Team"
                    value={ingestDraft.subject}
                    onChange={(e) => setIngestDraft(prev => ({ ...prev, subject: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="section-label">Email Body Content:</label>
                  <textarea
                    className="notes-textarea"
                    rows={4}
                    style={{ width: '100%', padding: '8px 12px', fontSize: '13px' }}
                    placeholder="Paste the recruiter message or email content here..."
                    value={ingestDraft.body}
                    onChange={(e) => setIngestDraft(prev => ({ ...prev, body: e.target.value }))}
                  />
                </div>
              </div>

              {/* Ingestion Feedback Result */}
              {ingestFeedback && (
                <div
                  style={{
                    marginTop: '16px',
                    padding: '12px 16px',
                    borderRadius: 'var(--radius-md)',
                    background: ingestFeedback.linked ? 'var(--bg-card-subtle)' : 'var(--bg-card)',
                    border: ingestFeedback.linked ? '1px solid var(--forest)' : '1px solid var(--border-color)'
                  }}
                >
                  {ingestFeedback.linked ? (
                    <div>
                      <div className="flex-inline-gap" style={{ alignItems: 'center', marginBottom: '4px' }}>
                        <CheckCircle2 size={16} className="text-success" />
                        <span className="font-semibold" style={{ color: 'var(--forest)' }}>
                          Matched to {ingestFeedback.company} ({ingestFeedback.jobTitle})
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                        Stage: <strong style={{ textTransform: 'capitalize' }}>{ingestFeedback.previousStatus}</strong> → <strong style={{ textTransform: 'capitalize', color: 'var(--forest)' }}>{ingestFeedback.newStatus}</strong>
                        {ingestFeedback.stageAdvanced ? ' (Advanced!)' : ' (Preserved)'}. New event appended to timeline!
                      </p>
                    </div>
                  ) : (
                    <div>
                      <div className="flex-inline-gap" style={{ alignItems: 'center', marginBottom: '4px' }}>
                        <AlertCircle size={16} className="text-warning" />
                        <span className="font-semibold" style={{ color: 'var(--warning)' }}>
                          {ingestFeedback.detectedStatus ? `Detected: ${ingestFeedback.detectedStatus}` : 'No Match'}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-muted)' }}>
                        {ingestFeedback.reason || ingestFeedback.error || 'Could not link message to an active application.'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="modal-footer flex-between">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowIngestModal(false)}
              >
                Close
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={ingesting}
                onClick={() => handleIngestMessage()}
              >
                {ingesting ? <RefreshCw size={13} className="spin" /> : <Send size={13} />}
                Process & Advance Stage
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gmail Setup & Information Modal */}
      {showGmailModal && (
        <div className="modal-backdrop" onClick={() => setShowGmailModal(false)}>
          <div className="modal-card modal-md" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="modal-eyebrow">Google Cloud Gmail Integration</span>
                <h2 className="modal-title">Gmail Recruiter Reply Sync</h2>
                <span className="modal-subtitle">
                  100% Free tier • Read-only scope (https://www.googleapis.com/auth/gmail.readonly)
                </span>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowGmailModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="modal-body" style={{ fontSize: '13px', lineHeight: 1.6 }}>
              <div style={{ padding: '12px', background: 'var(--bg-card-subtle)', borderRadius: 'var(--radius-md)', marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 6px 0', fontSize: '14px', color: 'var(--text-primary)' }}>
                  How Gmail Integration Works in JobRadar
                </h4>
                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                  JobRadar uses Google's standard OAuth 2.0 flow with strict <strong>read-only</strong> access. It scans inbound emails matching recruiter keywords (interviews, assessments, offers, rejections) and advances your applications automatically.
                </p>
              </div>

              <h4 style={{ margin: '14px 0 8px 0', fontSize: '13.5px', fontWeight: 600 }}>
                Free Setup Checklist (Google Cloud Console):
              </h4>
              <ol style={{ paddingLeft: '20px', margin: 0, display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--text-secondary)' }}>
                <li>
                  Go to <strong>Google Cloud Console</strong> & create a free project (e.g. <em>JobRadar Tracker</em>).
                </li>
                <li>
                  Enable <strong>Gmail API</strong> in APIs & Services (Free, 1B quota units/day).
                </li>
                <li>
                  Under <em>OAuth consent screen</em>, choose <strong>External</strong>, status <strong>Testing</strong> (allows your personal Gmail with 0 cost and no verification review).
                </li>
                <li>
                  Add scope: <code>https://www.googleapis.com/auth/gmail.readonly</code>.
                </li>
                <li>
                  Create <strong>OAuth Client ID</strong> (Web Application) and add redirect URI:
                  <br />
                  <code>http://localhost:5000/api/applications/gmail/callback</code>
                </li>
                <li>
                  Set <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> in <code>backend/.env</code>.
                </li>
              </ol>

              <div style={{ marginTop: '16px', padding: '10px 14px', background: 'var(--bg-card-subtle)', borderRadius: 'var(--radius-md)', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <HelpCircle size={18} className="text-copper" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Full architecture and step-by-step credentials instructions are documented in <strong>docs/API_AND_SERVICES.md</strong>. You can also test with the &quot;Track Recruiter Email&quot; button anytime without Google credentials!
                </span>
              </div>
            </div>

            <div className="modal-footer flex-between">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowGmailModal(false)}
              >
                Close
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setShowGmailModal(false);
                  setShowIngestModal(true);
                }}
              >
                <Mail size={13} /> Test with Recruiter Email Simulator
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
