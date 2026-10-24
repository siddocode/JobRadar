import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import PersonalizeModal from './PersonalizeModal';

function ReachOutCard({ comp, onUpdateFollowUp, copyToClipboard, copiedItem, onPersonalize }) {
  const { isAuthenticated, openAuthModal } = useAuth();
  const [showAllContacts, setShowAllContacts] = useState(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [draftNotes, setDraftNotes] = useState(comp.notes || '');
  const [followUpStatus, setFollowUpStatus] = useState(comp.followUpStatus || 'to_contact');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    setFollowUpStatus(comp.followUpStatus || 'to_contact');
    setDraftNotes(comp.notes || '');
    setIsEditingNotes(false);
  }, [comp.followUpStatus, comp.notes]);

  const handleStatusChange = async (newStatus) => {
    if (!isAuthenticated) {
      openAuthModal('Sign up or log in to manage your personal outreach pipeline.');
      return;
    }
    setFollowUpStatus(newStatus);
    setIsSaving(true);
    await onUpdateFollowUp(comp._id, newStatus, comp.notes);
    setIsSaving(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 1600);
  };

  const handleSaveNotes = async () => {
    if (!isAuthenticated) {
      openAuthModal('Sign up or log in to save personal outreach notes.');
      return;
    }
    setIsSaving(true);
    await onUpdateFollowUp(comp._id, followUpStatus, draftNotes);
    setIsSaving(false);
    setIsEditingNotes(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 1600);
  };

  const handlePersonalizeClick = () => {
    if (!isAuthenticated) {
      openAuthModal('Sign up to generate personalized cold outreach pitches and email drafts.');
      return;
    }
    if (onPersonalize) {
      onPersonalize(comp);
    }
  };

  const getInitials = (name) => {
    if (!name) return 'CO';
    const words = name.trim().split(/\s+/);
    if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  };

  const getAvatarGradient = (name = '') => {
    const gradients = [
      'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
      'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
      'linear-gradient(135deg, #10b981 0%, #047857 100%)',
      'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)',
      'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)'
    ];
    let sum = 0;
    for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
    return gradients[sum % gradients.length];
  };

  const primaryOffice = comp.offices?.[0];
  const cityName = primaryOffice?.cityId?.name || '';
  const stateName = primaryOffice?.cityId?.state || '';
  const displayLocation = cityName ? `${cityName}${stateName ? `, ${stateName}` : ''}` : (primaryOffice?.address || 'India');

  const websiteUrl = comp.website
    ? (comp.website.startsWith('http') ? comp.website : `https://${comp.website}`)
    : (comp.careersUrl || null);

  const displayDomain = comp.domain || (websiteUrl ? (() => {
    try { return new URL(websiteUrl).hostname.replace('www.', ''); } catch { return 'Website'; }
  })() : null);

  const allEmails = comp.contact?.emails || [];
  const allPhones = comp.contact?.phones || [];
  const totalContacts = allEmails.length + allPhones.length;

  const initialContactsLimit = 2;
  const hasHiddenContacts = totalContacts > initialContactsLimit;
  const hiddenContactsCount = totalContacts - initialContactsLimit;

  const visibleEmails = showAllContacts ? allEmails : allEmails.slice(0, 2);
  const visiblePhones = showAllContacts
    ? allPhones
    : (allEmails.length === 0 ? allPhones.slice(0, 2) : (allEmails.length === 1 ? allPhones.slice(0, 1) : []));

  // Detect drafted pitch in notes
  const isPitchDrafted = Boolean(comp.notes && comp.notes.startsWith('Pitch drafted'));
  const pitchTone = useMemo(() => {
    if (!isPitchDrafted) return '';
    const match = comp.notes.match(/Pitch drafted \(([^)]+)\)/);
    return match ? match[1] : 'custom';
  }, [comp.notes, isPitchDrafted]);

  const pitchSubject = useMemo(() => {
    if (!isPitchDrafted) return '';
    const match = comp.notes.match(/Subject:\s*(.+)/);
    return match ? match[1].trim() : '';
  }, [comp.notes, isPitchDrafted]);

  const mailtoPitchHref = useMemo(() => {
    if (!isPitchDrafted) return null;
    const email = allEmails[0]?.value || `careers@${displayDomain || 'company.com'}`;
    const subjectMatch = comp.notes.match(/Subject:\s*(.+)/);
    const subjectStr = subjectMatch ? subjectMatch[1].trim() : `Outreach: ${comp.name}`;
    const bodyStr = comp.notes.replace(/Pitch drafted[^\n]*\nSubject:[^\n]*\n+/, '');
    return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subjectStr)}&body=${encodeURIComponent(bodyStr)}`;
  }, [comp.notes, isPitchDrafted, allEmails, displayDomain, comp.name]);

  return (
    <div className="classy-card outreach-card" id={`reachout-${comp.slug || comp._id}`}>
      <div className="card-main-content">
        {/* Top Header: Monogram Avatar, Company Title & Link, Badges */}
        <div className="card-top-row">
          <div className="avatar-and-info">
            <div className="company-monogram" style={{ background: getAvatarGradient(comp.name) }}>
              <span>{getInitials(comp.name)}</span>
            </div>

            <div className="company-text-meta">
              <div className="title-and-link">
                <h3 className="company-heading" title={comp.name}>{comp.name}</h3>
              </div>

              <div className="badges-inline-row">
                {websiteUrl && (
                  <a
                    href={websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="external-site-link"
                    title={`Visit ${displayDomain || 'Website'}`}
                  >
                    <span>{displayDomain || 'Website'}</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mini-icon arrow-icon">
                      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                    </svg>
                  </a>
                )}
                <span className="clean-pill category-pill">{comp.category || 'Company'}</span>
                {cityName && <span className="clean-pill">{cityName}</span>}
              </div>
            </div>
          </div>

          <div className="status-pill-wrapper">
            {comp.isHiring ? (
              <span className="hiring-tag hiring-now">
                <span className="green-pulse-dot"></span>
                <span>{comp.hiringStatusLabel || 'Hiring'}</span>
              </span>
            ) : (
              <span className="hiring-tag no-vacancy">
                <span className="gray-dot"></span>
                <span>No known vacancies</span>
              </span>
            )}
          </div>
        </div>

        {/* Office Location */}
        <div className="card-details-section">
          <div className="detail-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="detail-svg-icon">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <div className="detail-text-col">
              <div className="detail-primary-row">
                <span className="detail-primary-text">{displayLocation}</span>
                {primaryOffice?.verified && (
                  <span className="verified-badge-mini" title="Verified office address">Verified</span>
                )}
              </div>
              <span className="detail-secondary-text" title={primaryOffice?.address || cityName || 'India'}>
                {primaryOffice?.address && primaryOffice.address !== cityName ? primaryOffice.address : (comp.category || 'Office Address')}
              </span>
            </div>
          </div>
        </div>

        {/* Direct Action Contacts Bar */}
        <div className={`card-contacts-bar ${totalContacts === 0 ? 'empty-contacts' : ''}`}>
          <div className="contacts-bar-header">
            <span className="contacts-bar-title">Direct Outreach Channels</span>
            {hasHiddenContacts && (
              <button
                type="button"
                className="expand-contacts-toggle"
                onClick={() => setShowAllContacts(!showAllContacts)}
                title={showAllContacts ? 'Collapse contacts list' : `Show ${hiddenContactsCount} more contacts`}
              >
                {showAllContacts ? 'Show less' : `+ ${hiddenContactsCount} more`}
              </button>
            )}
          </div>

          {totalContacts > 0 ? (
            <div className={`contact-chips-row ${showAllContacts ? 'expanded-chips' : ''}`}>
              {visibleEmails.map((em, idx) => (
                <div key={`ro-em-${idx}`} className="contact-chip" title={em.value}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="chip-icon">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  <a href={`mailto:${em.value}`} className="chip-anchor">{em.value}</a>
                  <button
                    type="button"
                    className={`chip-copy-btn ${copiedItem === `ro-em-${comp._id}-${idx}` ? 'copied' : ''}`}
                    onClick={() => copyToClipboard(em.value, `ro-em-${comp._id}-${idx}`)}
                    title={copiedItem === `ro-em-${comp._id}-${idx}` ? 'Copied email!' : 'Copy email'}
                    aria-label="Copy email"
                  >
                    {copiedItem === `ro-em-${comp._id}-${idx}` ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    )}
                  </button>
                </div>
              ))}

              {visiblePhones.map((ph, idx) => (
                <div key={`ro-ph-${idx}`} className="contact-chip" title={ph.value}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="chip-icon">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
                  </svg>
                  <a href={`tel:${ph.value}`} className="chip-anchor">{ph.value}</a>
                  <button
                    type="button"
                    className={`chip-copy-btn ${copiedItem === `ro-ph-${comp._id}-${idx}` ? 'copied' : ''}`}
                    onClick={() => copyToClipboard(ph.value, `ro-ph-${comp._id}-${idx}`)}
                    title={copiedItem === `ro-ph-${comp._id}-${idx}` ? 'Copied phone!' : 'Copy phone'}
                    aria-label="Copy phone"
                  >
                    {copiedItem === `ro-ph-${comp._id}-${idx}` ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    )}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="outreach-discovery-row">
              {websiteUrl && (
                <a
                  href={websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="outreach-quick-chip web-chip"
                  onClick={(e) => e.stopPropagation()}
                  title={`Visit ${comp.name}'s official website`}
                >
                  Website
                </a>
              )}
              <a
                href={`https://www.google.com/search?q=${encodeURIComponent(comp.name + ' ' + (primaryOffice?.locality || cityName || '') + ' contact phone email official')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="outreach-quick-chip search-chip"
                onClick={(e) => e.stopPropagation()}
                title={`Search Google for ${comp.name} office contact & phone`}
              >
                Search contacts
              </a>
              <a
                href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(comp.name + ' hr recruiter talent acquisition')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="outreach-quick-chip linkedin-chip"
                onClick={(e) => e.stopPropagation()}
                title={`Find HR recruiters at ${comp.name} on LinkedIn`}
              >
                Find HR on LinkedIn
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Card Pinned Footer: Outreach Management Bar */}
      <div className="card-pinned-footer">
        <div className="card-hairline-divider"></div>

        <div className="card-outreach-footer">
          <div className="outreach-controls-top">
            <div className="stage-selector-wrap">
              <label className="stage-label">Stage:</label>
              <div className={`stage-select-pill stage-${followUpStatus || 'to_contact'}`}>
                <span className={`status-colored-dot dot-${followUpStatus || 'to_contact'}`}></span>
                <select
                  className="clean-stage-dropdown"
                  value={followUpStatus || 'to_contact'}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  aria-label="Outreach stage"
                >
                  <option value="to_contact">To Contact</option>
                  <option value="contacted">Contacted</option>
                  <option value="replied">Replied</option>
                  <option value="not_interested">Not Interested</option>
                </select>
              </div>
            </div>

            <div className="outreach-actions-cluster">
              <button
                type="button"
                className="card-personalize-btn"
                onClick={handlePersonalizeClick}
                title="Draft or edit personalized cold email pitch"
              >
                <svg className="btn-spark-icon" width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L14.39 8.26L21 9.27L16.27 13.88L17.82 20.46L12 17.07L6.18 20.46L7.73 13.88L3 9.27L9.61 8.26L12 2Z" />
                </svg>
                <span>{isPitchDrafted ? 'Edit Pitch' : 'Personalize'}</span>
              </button>

              <button
                type="button"
                className={`card-note-toggle-btn ${isEditingNotes ? 'active' : ''}`}
                onClick={() => {
                  if (!isAuthenticated) {
                    openAuthModal('Sign up or log in to edit outreach notes.');
                    return;
                  }
                  setDraftNotes(comp.notes || '');
                  setIsEditingNotes(!isEditingNotes);
                }}
                title={comp.notes ? 'Edit personal notes' : 'Add note'}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                <span>{comp.notes ? 'Note' : '+ Note'}</span>
              </button>

              <button
                type="button"
                className="card-remove-pipeline-btn"
                onClick={() => handleStatusChange('none')}
                disabled={isSaving}
                title="Remove from your Outreach Pipeline"
                aria-label="Remove from Pipeline"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Feedback status */}
          {isSaving && <span className="mini-status-text saving">Saving changes...</span>}
          {saveSuccess && <span className="mini-status-text saved">✓ Stage updated</span>}

          {/* If actively editing notes */}
          {isEditingNotes ? (
            <div className="notes-box-wrapper editing">
              <textarea
                className="clean-notes-input"
                placeholder="Write outreach notes, recruiter contact names, follow-up dates..."
                value={draftNotes}
                onChange={(e) => setDraftNotes(e.target.value)}
                rows={3}
                autoFocus
              />
              <div className="notes-edit-actions">
                <button
                  type="button"
                  className="btn-note-cancel"
                  onClick={() => {
                    setDraftNotes(comp.notes || '');
                    setIsEditingNotes(false);
                  }}
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-note-save"
                  onClick={handleSaveNotes}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving...' : 'Save note'}
                </button>
              </div>
            </div>
          ) : isPitchDrafted ? (
            <div className="card-pitch-preview-box">
              <div className="pitch-preview-header">
                <div className="pitch-preview-tag">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2L14.39 8.26L21 9.27L16.27 13.88L17.82 20.46L12 17.07L6.18 20.46L7.73 13.88L3 9.27L9.61 8.26L12 2Z" />
                  </svg>
                  <span>Pitch Ready ({pitchTone})</span>
                </div>
                <div className="pitch-quick-actions">
                  <button
                    type="button"
                    className="pitch-mini-action-btn"
                    onClick={() => copyToClipboard(comp.notes, `pitch-${comp._id}`)}
                    title="Copy full drafted email pitch"
                  >
                    {copiedItem === `pitch-${comp._id}` ? '✓ Copied' : 'Copy Pitch'}
                  </button>
                  {mailtoPitchHref && (
                    <a
                      href={mailtoPitchHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="pitch-mini-action-btn mail-btn"
                      title="Open pre-filled in your email client"
                    >
                      Open Mail
                    </a>
                  )}
                </div>
              </div>
              <p className="card-pitch-snippet">{pitchSubject || comp.notes}</p>
            </div>
          ) : Boolean(comp.notes) ? (
            <div className="card-note-read-box">
              <p className="card-note-text">{comp.notes}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function ReachOutView({ cities = [], onNavigateToDirectory, onPipelineChange }) {
  const { isAuthenticated, openAuthModal, authFetch } = useAuth();
  const [personalizeCompany, setPersonalizeCompany] = useState(null);

  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCity, setSelectedCity] = useState('all');
  const [stageFilter, setStageFilter] = useState('all'); // 'all' | 'to_contact' | 'contacted' | 'replied' | 'not_interested'
  const [stageCounts, setStageCounts] = useState({
    all: 0,
    to_contact: 0,
    contacted: 0,
    replied: 0,
    not_interested: 0
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedItem, setCopiedItem] = useState(null);

  const groupedReachoutCities = useMemo(() => {
    const tier1Slugs = ['bengaluru', 'hyderabad', 'pune', 'kolkata', 'mumbai', 'delhi-ncr', 'chennai', 'gurgaon', 'noida'];
    const tier1 = [];
    const others = [];
    let totalOffices = 0;

    (cities || []).forEach(c => {
      totalOffices += (c.officeCount || 0);
      if (tier1Slugs.includes(c.slug.toLowerCase())) {
        tier1.push(c);
      } else {
        others.push(c);
      }
    });

    tier1.sort((a, b) => (b.officeCount || 0) - (a.officeCount || 0) || a.name.localeCompare(b.name));
    others.sort((a, b) => (b.officeCount || 0) - (a.officeCount || 0) || a.name.localeCompare(b.name));

    return { tier1, others, totalOffices };
  }, [cities]);

  const fetchReachOut = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedCity !== 'all') params.append('city', selectedCity);
      if (stageFilter !== 'all') params.append('status', stageFilter);
      if (searchQuery.trim()) params.append('q', searchQuery.trim());

      const res = await authFetch(`/api/directory/reach-out?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (data.success) {
        setCompanies(data.companies || []);
        if (data.stageCounts) {
          setStageCounts(data.stageCounts);
        }
      } else {
        throw new Error(data.error || 'Failed to fetch reach out list');
      }
    } catch (err) {
      setError(err.message);
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  }, [selectedCity, stageFilter, searchQuery, authFetch]);

  useEffect(() => {
    fetchReachOut();
  }, [fetchReachOut]);

  const updateFollowUp = async (id, followUpStatus, notes) => {
    try {
      const res = await authFetch(`/api/directory/companies/${id}/follow-up`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followUpStatus, notes })
      });
      if (res.ok) {
        const currentComp = companies.find(c => c._id === id);
        const oldStatus = currentComp?.followUpStatus;

        // If removing from pipeline entirely (status === 'none')
        if (followUpStatus === 'none') {
          setCompanies(prev => prev.filter(c => c._id !== id));
          setStageCounts(prev => {
            const next = { ...prev };
            if (oldStatus && oldStatus !== 'none' && next[oldStatus] > 0) {
              next[oldStatus] -= 1;
            }
            if (next.all > 0) next.all -= 1;
            return next;
          });
          if (onPipelineChange) onPipelineChange();
          return;
        }

        // Updating stage
        if (followUpStatus && oldStatus && followUpStatus !== oldStatus) {
          setStageCounts(prev => {
            const next = { ...prev };
            if (oldStatus !== 'none' && next[oldStatus] > 0) next[oldStatus] -= 1;
            if (followUpStatus !== 'none') {
              next[followUpStatus] = (next[followUpStatus] || 0) + 1;
            }
            return next;
          });
        }

        if (stageFilter !== 'all' && followUpStatus !== stageFilter) {
          setCompanies(prev => prev.filter(c => c._id !== id));
        } else {
          setCompanies(prev =>
            prev.map(c =>
              c._id === id
                ? {
                  ...c,
                  followUpStatus: followUpStatus !== undefined ? followUpStatus : c.followUpStatus,
                  notes: notes !== undefined ? notes : c.notes
                }
                : c
            )
          );
        }

        if (onPipelineChange) onPipelineChange();
      }
    } catch (err) {
      console.error('Failed to update follow-up:', err);
    }
  };

  const copyToClipboard = (text, id) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedItem(id);
    setTimeout(() => setCopiedItem(null), 1500);
  };

  const handleResetFilters = () => {
    setStageFilter('all');
    setSelectedCity('all');
    setSearchQuery('');
  };

  return (
    <div className="reach-out-container">
      {/* Intro Hero Banner */}
      <div className="reach-out-hero">
        <div className="hero-text">
          <div className="hero-badge-tag">
            <span className="dot dot-green"></span>
            <span>Personal Outreach CRM</span>
          </div>
          <h2>Outreach Pipeline</h2>
          <p>
            Track your personalized job pitches, recruiter email contacts, and follow-up stages in one place.
          </p>
        </div>
        <div className="reach-out-stats-pill">
          <strong>{stageCounts.all}</strong> {stageCounts.all === 1 ? 'Company' : 'Companies'} in Pipeline
        </div>
      </div>

      {/* Guest Mode Callout */}
      {!isAuthenticated && (
        <div className="reach-out-guest-banner">
          <div className="guest-banner-left">
            <div className="guest-banner-icon-box">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <line x1="20" y1="8" x2="20" y2="14" />
                <line x1="23" y1="11" x2="17" y2="11" />
              </svg>
            </div>
            <div className="guest-banner-text">
              <span className="guest-banner-title">Build Your Personal Outreach Pipeline</span>
              <span className="guest-banner-desc">
                Log in or create an account to shortlist target employers, draft cold pitches with custom tones, and track your job application follow-ups.
              </span>
            </div>
          </div>
          <div className="guest-banner-actions">
            <button
              type="button"
              className="guest-banner-btn primary"
              onClick={() => openAuthModal('Sign up or log in to personalize outreach pitches and track pipeline stages.')}
            >
              Sign In / Sign Up
            </button>
            {onNavigateToDirectory && (
              <button
                type="button"
                className="guest-banner-btn secondary"
                onClick={onNavigateToDirectory}
              >
                Explore Directory →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filter Row: Only displayed if user has tracked companies in pipeline */}
      {stageCounts.all > 0 && (
        <div className="directory-filter-bar">
          <div className="filter-row-primary">
            <div className="search-field-wrapper">
              <svg className="search-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                id="reachout-search-input"
                className="search-input"
                placeholder="Search companies in your pipeline..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="clear-search-btn" onClick={() => setSearchQuery('')} aria-label="Clear search">Clear</button>
              )}
            </div>

            <div className="filter-select-wrapper">
              <svg className="filter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <select
                id="reachout-city-select"
                className="directory-select"
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
              >
                <option value="all">All Indian Cities ({groupedReachoutCities.totalOffices} offices)</option>
                {groupedReachoutCities.tier1.length > 0 && (
                  <optgroup label="Major Indian Tech Hubs">
                    {groupedReachoutCities.tier1.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}{c.state ? `, ${c.state}` : ''} {c.officeCount > 0 ? `(${c.officeCount} offices)` : ''}
                      </option>
                    ))}
                  </optgroup>
                )}
                {groupedReachoutCities.others.length > 0 && (
                  <optgroup label="Regional IT Clusters and Cities">
                    {groupedReachoutCities.others.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}{c.state ? `, ${c.state}` : ''} {c.officeCount > 0 ? `(${c.officeCount} offices)` : ''}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          </div>

          {/* Pipeline CRM Stage Tabs */}
          <div className="filter-row-secondary">
            <div className="hiring-toggle-group">
              <button
                className={`hiring-toggle-btn ${stageFilter === 'all' ? 'active' : ''}`}
                onClick={() => setStageFilter('all')}
              >
                All In Pipeline {stageCounts.all > 0 && <span className="pill-badge">{stageCounts.all}</span>}
              </button>
              <button
                className={`hiring-toggle-btn ${stageFilter === 'to_contact' ? 'active' : ''}`}
                onClick={() => setStageFilter('to_contact')}
              >
                <span className="dot dot-to_contact"></span>
                To Contact {stageCounts.to_contact > 0 && <span className="pill-badge">{stageCounts.to_contact}</span>}
              </button>
              <button
                className={`hiring-toggle-btn ${stageFilter === 'contacted' ? 'active' : ''}`}
                onClick={() => setStageFilter('contacted')}
              >
                <span className="dot dot-contacted"></span>
                Contacted {stageCounts.contacted > 0 && <span className="pill-badge">{stageCounts.contacted}</span>}
              </button>
              <button
                className={`hiring-toggle-btn ${stageFilter === 'replied' ? 'active' : ''}`}
                onClick={() => setStageFilter('replied')}
              >
                <span className="dot dot-replied"></span>
                Replied {stageCounts.replied > 0 && <span className="pill-badge">{stageCounts.replied}</span>}
              </button>
              <button
                className={`hiring-toggle-btn ${stageFilter === 'not_interested' ? 'active' : ''}`}
                onClick={() => setStageFilter('not_interested')}
              >
                <span className="dot dot-not_interested"></span>
                Not Interested {stageCounts.not_interested > 0 && <span className="pill-badge">{stageCounts.not_interested}</span>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Candidates Cards Grid or Clean Empty States */}
      {loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading your outreach pipeline...</p>
        </div>
      ) : error ? (
        <div className="error-banner">{error}</div>
      ) : stageCounts.all === 0 ? (
        <div className="pipeline-empty-container">
          <div className="pipeline-empty-hero-card">
            <div className="empty-hero-badge">
              <span className="empty-sparkle-dot"></span>
              <span>Direct Candidate Outreach</span>
            </div>
            <h3 className="empty-hero-title">Your Outreach Pipeline is Empty</h3>
            <p className="empty-hero-subtitle">
              Reach out to tech leads and recruiters directly before jobs are posted publicly. Shortlist target companies from the Directory to craft personalized pitches and manage follow-ups.
            </p>

            <div className="empty-workflow-grid">
              <div className="workflow-card">
                <div className="workflow-icon-box step-1">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </div>
                <div className="workflow-card-body">
                  <span className="workflow-step-badge">Step 1</span>
                  <h4 className="workflow-card-title">Browse Directory</h4>
                  <p className="workflow-card-desc">
                    Explore 500+ verified Indian tech companies with hiring status and verified offices.
                  </p>
                </div>
              </div>

              <div className="workflow-card">
                <div className="workflow-icon-box step-2">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2L14.39 8.26L21 9.27L16.27 13.88L17.82 20.46L12 17.07L6.18 20.46L7.73 13.88L3 9.27L9.61 8.26L12 2Z" />
                  </svg>
                </div>
                <div className="workflow-card-body">
                  <span className="workflow-step-badge">Step 2</span>
                  <h4 className="workflow-card-title">Personalize Pitch</h4>
                  <p className="workflow-card-desc">
                    Generate role-tailored cold pitches for engineering teams or founders with 1 click.
                  </p>
                </div>
              </div>

              <div className="workflow-card">
                <div className="workflow-icon-box step-3">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                </div>
                <div className="workflow-card-body">
                  <span className="workflow-step-badge">Step 3</span>
                  <h4 className="workflow-card-title">Track Stages</h4>
                  <p className="workflow-card-desc">
                    Track progress through To Contact → Contacted → Replied stages as you reach out.
                  </p>
                </div>
              </div>
            </div>

            <div className="empty-hero-actions">
              {onNavigateToDirectory && (
                <button
                  type="button"
                  className="empty-primary-cta"
                  onClick={onNavigateToDirectory}
                >
                  <span>Explore Company Directory</span>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>
              )}
              {!isAuthenticated && (
                <button
                  type="button"
                  className="empty-secondary-cta"
                  onClick={() => openAuthModal('Sign up or log in to manage your outreach pipeline.')}
                >
                  Sign In / Sign Up
                </button>
              )}
            </div>
          </div>
        </div>

      ) : companies.length === 0 ? (
        <div className="empty-state">
          <h3>No companies match the current filter</h3>
          <p>You have {stageCounts.all} {stageCounts.all === 1 ? 'company' : 'companies'} in your pipeline, but none match this stage or search query.</p>
          <button
            type="button"
            className="empty-cta-btn primary"
            onClick={handleResetFilters}
            id="show-all-tracked-btn"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            <span>Show All Tracked Companies</span>
          </button>
        </div>
      ) : (
        <div className="companies-grid">
          {companies.map((comp) => (
            <ReachOutCard
              key={comp._id}
              comp={comp}
              onUpdateFollowUp={updateFollowUp}
              copyToClipboard={copyToClipboard}
              copiedItem={copiedItem}
              onPersonalize={setPersonalizeCompany}
            />
          ))}
        </div>
      )}

      {/* Personalize Pitch Modal */}
      {personalizeCompany && (
        <PersonalizeModal
          company={personalizeCompany}
          onClose={() => setPersonalizeCompany(null)}
          onSaveToNotes={async (id, note, nextStatus) => {
            await updateFollowUp(id, nextStatus || 'to_contact', note);
          }}
        />
      )}
    </div>
  );
}
