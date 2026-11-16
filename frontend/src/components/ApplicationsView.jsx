import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Layers,
  Search,
  Plus,
  Clock,
  Building2,
  ExternalLink,
  Trash2,
  Edit3,
  Send,
  Download,
  RefreshCw,
  Mail,
  Sparkles,
  Inbox,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ChevronRight,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { downloadResumePdf, downloadLatexFile } from '../utils/pdfGenerator';
import './ApplicationsView.css';

const STAGES = [
  { key: 'all', label: 'All', color: 'neutral' },
  { key: 'applied', label: 'Applied', color: 'copper' },
  { key: 'awaiting_approval', label: 'Reviewing', color: 'sand' },
  { key: 'interview', label: 'Interview', color: 'forest' },
  { key: 'assessment', label: 'Assessment', color: 'info' },
  { key: 'rejected', label: 'Rejected', color: 'danger' },
  { key: 'offer', label: 'Offer', color: 'success' },
  { key: 'shortlisted', label: 'Shortlisted', color: 'neutral' },
  { key: 'resume_ready', label: 'Resume Ready', color: 'neutral' },
  { key: 'withdrawn', label: 'Withdrawn', color: 'neutral' }
];

// 4 Core funnel steps for the visual progress bar
const FUNNEL_STEPS = [
  { id: 'applied', label: 'Applied' },
  { id: 'reviewing', label: 'Reviewing' },
  { id: 'interview', label: 'Interview' },
  { id: 'offer', label: 'Offer' }
];

// Deterministic monogram and company branding
function getCompanyBranding(companyName = '') {
  const name = companyName.trim();
  const lower = name.toLowerCase();

  if (lower.includes('razorpay')) {
    return { bg: '#EBF3FC', color: '#0C66E4', monogram: 'R' };
  }
  if (lower.includes('swiggy')) {
    return { bg: '#FFF2E8', color: '#FC8019', monogram: 'S' };
  }
  if (lower.includes('cred')) {
    return { bg: '#1B1C1D', color: '#FFFFFF', monogram: 'C' };
  }
  if (lower.includes('groww')) {
    return { bg: '#E6FAF3', color: '#00D09C', monogram: 'G' };
  }
  if (lower.includes('zepto')) {
    return { bg: '#FDF0F4', color: '#FF3269', monogram: 'Z' };
  }
  if (lower.includes('phonepe')) {
    return { bg: '#F4EEFB', color: '#6739B7', monogram: 'P' };
  }
  if (lower.includes('meesho')) {
    return { bg: '#FDEEF5', color: '#E4287C', monogram: 'M' };
  }
  if (lower.includes('zomato')) {
    return { bg: '#FEECEC', color: '#CB202D', monogram: 'Z' };
  }

  // Consistent hash for any other company
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hues = [168, 205, 32, 280, 195, 150];
  const hue = hues[Math.abs(hash) % hues.length];
  return {
    bg: `hsl(${hue}, 40%, 93%)`,
    color: `hsl(${hue}, 65%, 28%)`,
    monogram: (name[0] || 'C').toUpperCase()
  };
}

// Calculate recruitment step progress
function calculateProgress(status) {
  switch (status) {
    case 'applied':
      return { fillPercent: 12, completedSteps: ['applied'], currentStep: 'applied' };
    case 'shortlisted':
    case 'resume_ready':
    case 'awaiting_approval':
      return { fillPercent: 42, completedSteps: ['applied', 'reviewing'], currentStep: 'reviewing' };
    case 'assessment':
      return { fillPercent: 50, completedSteps: ['applied', 'reviewing'], currentStep: 'reviewing' };
    case 'interview':
      return { fillPercent: 75, completedSteps: ['applied', 'reviewing', 'interview'], currentStep: 'interview' };
    case 'offer':
      return { fillPercent: 100, completedSteps: ['applied', 'reviewing', 'interview', 'offer'], currentStep: 'offer' };
    case 'rejected':
      return { fillPercent: 20, completedSteps: ['applied'], currentStep: 'rejected' };
    default:
      return { fillPercent: 0, completedSteps: [], currentStep: 'applied' };
  }
}

export default function ApplicationsView({ onNavigateJobs, initialStage = 'all', focusApplicationId = null, onFocusHandled }) {
  const { authFetch, isAuthenticated, openAuthModal } = useAuth();
  const [applications, setApplications] = useState([]);
  const [stats, setStats] = useState({});
  const [selectedStage, setSelectedStage] = useState(initialStage);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('updated'); // 'updated' | 'applied' | 'match'
  const [viewMode, setViewMode] = useState('list'); // Default to clean 'list' as in visual reference, with 'kanban' toggle
  const [loading, setLoading] = useState(true);
  const [, setError] = useState(null);

  // Selected application for detail modal
  const [activeApp, setActiveApp] = useState(null);

  // Deep-link support: open a specific application requested by the dashboard
  useEffect(() => {
    if (!focusApplicationId || !applications.length) return;
    const match = applications.find((a) => a._id === focusApplicationId);
    if (match) {
      setActiveApp(match);
      if (onFocusHandled) onFocusHandled();
    }
  }, [focusApplicationId, applications, onFocusHandled]);
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
    } catch {}
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
    } catch {
      setShowGmailModal(true);
    }
  };

  // Filter & sort applications
  const filteredApplications = useMemo(() => {
    let result = [...applications];

    if (sortBy === 'updated') {
      result.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    } else if (sortBy === 'applied') {
      result.sort((a, b) => new Date(b.appliedAt || b.createdAt || 0) - new Date(a.appliedAt || a.createdAt || 0));
    } else if (sortBy === 'match') {
      result.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
    }

    return result;
  }, [applications, sortBy]);

  // Group applications by stage for Kanban board
  const kanbanColumns = useMemo(() => {
    const primaryStages = ['shortlisted', 'awaiting_approval', 'applied', 'interview', 'offer', 'rejected'];
    const map = {};
    primaryStages.forEach(s => { map[s] = []; });
    filteredApplications.forEach(app => {
      if (map[app.status]) {
        map[app.status].push(app);
      } else {
        if (!map['shortlisted']) map['shortlisted'] = [];
        map['shortlisted'].push(app);
      }
    });
    return map;
  }, [filteredApplications]);

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

  // Calculate total count for "All"
  const totalCount = Object.values(stats).reduce((acc, c) => acc + (typeof c === 'number' ? c : 0), 0) || applications.length;

  return (
    <div className="apps-page">
      {/* Top Header Bar matching reference: "Application Lifecycle" */}
      <div className="view-header">
        <div>
          <h1 className="view-title">Application Lifecycle</h1>
          <p className="view-subtitle">
            Track and manage your applications across all recruitment stages.
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
            {migrating ? 'Importing...' : 'Sync Outreach'}
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

      {/* 1. Stage Filter Pills Strip (Matching reference: All (12), Applied (3), Reviewing (2), etc.) */}
      <div className="apps-stage-bar">
        {STAGES.slice(0, 7).map(stage => {
          const isActive = selectedStage === stage.key;
          let count = 0;
          if (stage.key === 'all') {
            count = totalCount;
          } else if (stage.key === 'awaiting_approval') {
            // Count reviewing / awaiting approval / resume ready
            count = (stats['awaiting_approval'] || 0) + (stats['resume_ready'] || 0) + (stats['shortlisted'] || 0);
          } else {
            count = stats[stage.key] || 0;
          }

          return (
            <button
              key={stage.key}
              type="button"
              className={`apps-stage-pill ${isActive ? 'is-active' : ''}`}
              onClick={() => setSelectedStage(stage.key)}
            >
              <span>{stage.label}</span>
              <span className="apps-stage-count">{count}</span>
            </button>
          );
        })}
      </div>

      {/* 2. Search & Toolbar Controls (Search input, Sort dropdown, List/Kanban switch) */}
      <div className="apps-toolbar">
        <div className="apps-search-wrap">
          <Search size={15} className="apps-search-icon" />
          <input
            type="text"
            className="apps-search-input"
            placeholder="Search by company, role or stage..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="apps-actions-wrap">
          <select
            className="apps-sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="updated">Last Updated</option>
            <option value="applied">Applied Date</option>
            <option value="match">Match Score</option>
          </select>

          <div className="apps-view-toggle">
            <button
              type="button"
              className={`apps-view-btn ${viewMode === 'list' ? 'is-active' : ''}`}
              onClick={() => setViewMode('list')}
              title="List View with Progress Track"
            >
              List
            </button>
            <button
              type="button"
              className={`apps-view-btn ${viewMode === 'kanban' ? 'is-active' : ''}`}
              onClick={() => setViewMode('kanban')}
              title="Kanban Board View"
            >
              Kanban
            </button>
          </div>
        </div>
      </div>

      {/* Main Applications Content */}
      {loading ? (
        <div className="loading-state-box">
          <RefreshCw size={24} className="spin text-copper" />
          <p>Loading application pipeline...</p>
        </div>
      ) : filteredApplications.length === 0 ? (
        <div className="empty-state-large">
          <Layers size={48} className="text-muted opacity-40" />
          <h3>No applications found</h3>
          <p>
            {selectedStage !== 'all'
              ? `No applications currently in the "${STAGES.find(s => s.key === selectedStage)?.label}" stage.`
              : 'Discover tech jobs from direct ATS boards and stage them here to track your progress.'}
          </p>
          <button
            type="button"
            className="btn btn-primary btn-md"
            onClick={onNavigateJobs}
          >
            Discover Jobs Now
          </button>
        </div>
      ) : viewMode === 'list' ? (
        /* List View: Matching Visual Reference Card Rows */
        <div className="apps-list">
          {filteredApplications.map(app => {
            const branding = getCompanyBranding(app.companyName);
            const progress = calculateProgress(app.status);
            const appliedDate = app.appliedAt || app.createdAt;
            const timeAgo = appliedDate
              ? new Date(appliedDate).toLocaleDateString([], { month: 'short', day: 'numeric' })
              : 'Recent';

            return (
              <div
                key={app._id}
                className="apps-card-row"
                onClick={() => {
                  setActiveApp(app);
                  setNotesDraft(app.notes || '');
                  setEditingNotes(false);
                }}
              >
                {/* Left: Monogram, Company, Role, Date */}
                <div className="apps-row-left">
                  <div
                    className="apps-monogram"
                    style={{ backgroundColor: branding.bg, color: branding.color }}
                  >
                    {branding.monogram}
                  </div>
                  <div className="apps-title-col">
                    <div className="apps-title-line">
                      <span className="apps-company-name">{app.companyName}</span>
                      <span className="apps-role-title">{app.jobTitle}</span>
                    </div>
                    <span className="text-xs text-muted">
                      {app.location || 'India'} • {timeAgo}
                    </span>
                  </div>
                </div>

                {/* Center: 4-Step Recruitment Progress Bar */}
                <div className="apps-progress-track-wrap" onClick={(e) => e.stopPropagation()}>
                  <div className="apps-progress-bar">
                    <div className="apps-progress-line-bg" />
                    <div
                      className="apps-progress-line-fill"
                      style={{ width: `${progress.fillPercent}%` }}
                    />
                    {FUNNEL_STEPS.map(step => {
                      const isCompleted = progress.completedSteps.includes(step.id);
                      const isActive = progress.currentStep === step.id;

                      return (
                        <div
                          key={step.id}
                          className={`apps-step-node ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}`}
                        >
                          <div className="apps-step-circle" />
                          <span className="apps-step-label">{step.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right: Stage Badge & Quick Actions */}
                <div className="apps-row-right" onClick={(e) => e.stopPropagation()}>
                  <span className={`apps-status-badge ${app.status}`}>
                    ● {app.status.replace('_', ' ')}
                  </span>

                  <button
                    type="button"
                    className="icon-btn-subtle"
                    title="View details & timeline"
                    onClick={() => {
                      setActiveApp(app);
                      setNotesDraft(app.notes || '');
                      setEditingNotes(false);
                    }}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Kanban Columns View */
        <div className="apps-kanban-board">
          {Object.entries(kanbanColumns).map(([stageKey, items]) => {
            const stageMeta = STAGES.find(s => s.key === stageKey) || { label: stageKey, color: 'neutral' };
            return (
              <div key={stageKey} className="apps-kanban-col">
                <div className="apps-kanban-header">
                  <div className="flex-inline-gap" style={{ alignItems: 'center' }}>
                    <span className={`stage-indicator-dot dot-${stageMeta.color}`} />
                    <span className="apps-kanban-title">{stageMeta.label}</span>
                  </div>
                  <span className="apps-stage-count">{items.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {items.map(app => {
                    const branding = getCompanyBranding(app.companyName);
                    return (
                      <div
                        key={app._id}
                        className="apps-kanban-card"
                        onClick={() => {
                          setActiveApp(app);
                          setNotesDraft(app.notes || '');
                          setEditingNotes(false);
                        }}
                      >
                        <div className="flex-between">
                          <div className="flex-inline-gap" style={{ alignItems: 'center' }}>
                            <div
                              className="apps-monogram"
                              style={{
                                width: '24px',
                                height: '24px',
                                fontSize: '11px',
                                borderRadius: '6px',
                                backgroundColor: branding.bg,
                                color: branding.color
                              }}
                            >
                              {branding.monogram}
                            </div>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                              {app.companyName}
                            </span>
                          </div>
                          {app.matchScore && (
                            <span className="match-tag-micro">{app.matchScore}%</span>
                          )}
                        </div>

                        <h4 style={{ margin: 0, fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {app.jobTitle}
                        </h4>

                        <div className="flex-between" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          <span>{app.location || 'India'}</span>
                          <span>{new Date(app.updatedAt || app.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    );
                  })}
                  {items.length === 0 && (
                    <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', border: '1px dashed var(--border-subtle)', borderRadius: '8px' }}>
                      No applications
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Application Detail Modal / Notes Drawer */}
      {activeApp && (
        <div className="modal-backdrop" onClick={() => setActiveApp(null)}>
          <div className="modal-card modal-md" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="flex-inline-gap" style={{ alignItems: 'center', gap: '12px' }}>
                <div
                  className="apps-monogram"
                  style={{
                    backgroundColor: getCompanyBranding(activeApp.companyName).bg,
                    color: getCompanyBranding(activeApp.companyName).color
                  }}
                >
                  {getCompanyBranding(activeApp.companyName).monogram}
                </div>
                <div>
                  <span className="modal-eyebrow">Application Lifecycle Record</span>
                  <h2 className="modal-title">{activeApp.jobTitle}</h2>
                  <span className="modal-subtitle">
                    <Building2 size={13} /> {activeApp.companyName}
                    {activeApp.location && ` • ${activeApp.location}`}
                  </span>
                </div>
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
              {/* Stage Progression Buttons */}
              <div className="app-detail-section">
                <label className="section-label">Advance Lifecycle Stage</label>
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

              {/* Submitted Resume Snapshot */}
              {activeApp.tailoredResumeSnapshot && (
                <div className="app-detail-section">
                  <label className="section-label">Tailored Resume Snapshot</label>
                  <div className="resume-snapshot-box">
                    <div>
                      <span className="font-semibold text-forest">
                        {activeApp.tailoredResumeSnapshot.name || 'Candidate Resume'}
                      </span>
                      <p className="text-muted text-xs" style={{ margin: '2px 0 0 0' }}>
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

              {/* Private Notes */}
              <div className="app-detail-section">
                <div className="flex-between">
                  <label className="section-label">Private Notes & Recruiter Contacts</label>
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
                    <Mail size={12} /> Simulate Recruiter Email
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
                  Classifies responses into lifecycle stages and records timeline events in real-time.
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
                    className="apps-search-input"
                    style={{ height: '36px' }}
                    placeholder="e.g. recruiter@swiggy.in or hr@razorpay.com"
                    value={ingestDraft.from}
                    onChange={(e) => setIngestDraft(prev => ({ ...prev, from: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="section-label">Subject Line:</label>
                  <input
                    type="text"
                    className="apps-search-input"
                    style={{ height: '36px' }}
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
