import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Layers,
  Search,
  Filter,
  Plus,
  ArrowRight,
  Clock,
  Building2,
  MapPin,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  FileText,
  Trash2,
  Edit3,
  Calendar,
  Send,
  Download,
  Eye,
  RefreshCw
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
  const [error, setError] = useState(null);

  // Selected application for detail modal
  const [activeApp, setActiveApp] = useState(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [migrating, setMigrating] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);

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

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  // Stage update
  const handleUpdateStatus = async (appId, newStatus) => {
    try {
      const res = await authFetch(`/api/applications/${appId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        fetchApplications();
        if (activeApp && activeApp._id === appId) {
          setActiveApp(prev => ({ ...prev, status: newStatus }));
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
        setEditingNotes(false);
        fetchApplications();
        if (activeApp && activeApp._id === appId) {
          setActiveApp(prev => ({ ...prev, notes: notesDraft }));
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

  // Group applications by stage for Kanban board
  const kanbanColumns = useMemo(() => {
    const primaryStages = ['shortlisted', 'awaiting_approval', 'applied', 'interview', 'offer', 'rejected'];
    const map = {};
    primaryStages.forEach(s => { map[s] = []; });
    applications.forEach(app => {
      if (map[app.status]) {
        map[app.status].push(app);
      } else {
        // Fallback into shortlisted or applied
        if (!map['shortlisted']) map['shortlisted'] = [];
        map['shortlisted'].push(app);
      }
    });
    return map;
  }, [applications]);

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

              {/* History Timeline */}
              {activeApp.events && activeApp.events.length > 0 && (
                <div className="app-detail-section">
                  <label className="section-label">Activity Timeline</label>
                  <div className="timeline-list">
                    {activeApp.events.map((ev, idx) => (
                      <div key={idx} className="timeline-row">
                        <span className="timeline-dot" />
                        <div className="timeline-content">
                          <span className="timeline-status">{ev.status}</span>
                          <span className="timeline-note">{ev.note}</span>
                        </div>
                        <span className="timeline-time">
                          {new Date(ev.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
    </div>
  );
}

