import React, { useState, useEffect, useCallback, useMemo } from 'react';

function ReachOutCard({ comp, onUpdateFollowUp, copyToClipboard, copiedItem }) {
  const [showAllContacts, setShowAllContacts] = useState(false);
  const [showNotesInput, setShowNotesInput] = useState(Boolean(comp.notes));
  const [notes, setNotes] = useState(comp.notes || '');
  const [followUpStatus, setFollowUpStatus] = useState(comp.followUpStatus || 'to_contact');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    setFollowUpStatus(comp.followUpStatus || 'to_contact');
    setNotes(comp.notes || '');
    setShowNotesInput(Boolean(comp.notes));
  }, [comp.followUpStatus, comp.notes]);

  const handleStatusChange = async (newStatus) => {
    setFollowUpStatus(newStatus);
    setIsSaving(true);
    await onUpdateFollowUp(comp._id, newStatus, notes);
    setIsSaving(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 1600);
  };

  const handleNotesBlur = async () => {
    if (notes !== comp.notes) {
      setIsSaving(true);
      await onUpdateFollowUp(comp._id, followUpStatus, notes);
      setIsSaving(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 1600);
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

  return (
    <div className="classy-card" id={`reachout-${comp.slug || comp._id}`}>
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
                {cityName && <span className="clean-pill">📍 {cityName}</span>}
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
                  <span className="verified-badge-mini" title="Verified office address">✓ Verified</span>
                )}
              </div>
              <span className="detail-secondary-text" title={primaryOffice?.address || cityName || 'India'}>
                {primaryOffice?.address && primaryOffice.address !== cityName ? primaryOffice.address : (comp.category || 'Office Address')}
              </span>
            </div>
          </div>
        </div>

        {/* Direct Action Contacts Bar (Capped at 2 to preserve grid alignment) */}
        <div className={`card-contacts-bar ${totalContacts === 0 ? 'empty-contacts' : ''}`}>
          <div className="contacts-bar-header">
            <span className="contacts-bar-title">Direct Outreach</span>
            {hasHiddenContacts && (
              <button
                type="button"
                className="expand-contacts-toggle"
                onClick={() => setShowAllContacts(!showAllContacts)}
                title={showAllContacts ? 'Collapse contacts list' : `Show ${hiddenContactsCount} more contacts`}
              >
                {showAllContacts ? 'Show less ▲' : `+ ${hiddenContactsCount} more ▼`}
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
            <div className="no-contacts-row">
              <span className="no-contact-text">
                {websiteUrl ? (
                  <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className="inquire-site-link">
                    🌐 Direct outreach via company website ↗
                  </a>
                ) : (
                  'No public phone/email listed'
                )}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Card Pinned Footer: Always Anchored to Bottom */}
      <div className="card-pinned-footer">
        <div className="card-hairline-divider"></div>

        <div className="card-outreach-footer">
          <div className="status-selector-row">
            <label className="outreach-field-label">Outreach:</label>
            <div className="status-select-container">
              <span className={`status-colored-dot dot-${followUpStatus}`}></span>
              <select
                className={`clean-status-select select-${followUpStatus}`}
                value={followUpStatus}
                onChange={(e) => handleStatusChange(e.target.value)}
              >
                <option value="to_contact">To Contact</option>
                <option value="contacted">Contacted</option>
                <option value="replied">Replied</option>
                <option value="not_interested">Not Interested</option>
                <option value="none">✕ Remove from Pipeline</option>
              </select>
            </div>

            <button
              type="button"
              className="toggle-note-btn"
              onClick={() => setShowNotesInput(!showNotesInput)}
              title="Toggle outreach notes"
            >
              {notes ? '📝 Edit note' : '+ Add note'}
            </button>

            {isSaving && <span className="mini-status-text saving">Saving...</span>}
            {saveSuccess && <span className="mini-status-text saved">✓ Saved</span>}
          </div>

          {/* Expandable Notes Box */}
          {showNotesInput && (
            <div className="notes-box-wrapper">
              <textarea
                className="clean-notes-input"
                placeholder="Outreach notes (e.g. Sent cold message to VP Eng, following up next week)..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={handleNotesBlur}
                rows={2}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ReachOutView({ cities = [] }) {
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

      const res = await fetch(`/api/directory/reach-out?${params.toString()}`);
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
  }, [selectedCity, stageFilter, searchQuery]);

  useEffect(() => {
    fetchReachOut();
  }, [fetchReachOut]);

  const updateFollowUp = async (id, followUpStatus, notes) => {
    try {
      const res = await fetch(`/api/directory/companies/${id}/follow-up`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followUpStatus, notes })
      });
      if (res.ok) {
        if (followUpStatus === 'none' || (stageFilter !== 'all' && followUpStatus !== stageFilter)) {
          // If removed from pipeline or moved out of current filtered stage, remove from view
          setCompanies(prev => prev.filter(c => c._id !== id));
        } else {
          setCompanies(prev =>
            prev.map(c =>
              c._id === id
                ? { ...c, followUpStatus: followUpStatus || c.followUpStatus, notes: notes !== undefined ? notes : c.notes }
                : c
            )
          );
        }
        // Refresh stage counts quietly
        fetchReachOut();
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

  return (
    <div className="reach-out-container">
      {/* Intro Hero Banner */}
      <div className="reach-out-hero">
        <div className="hero-text">
          <h2>🎯 Proactive Outreach Pipeline</h2>
          <p>
            Track your cold outreach and hiring inquiries across Indian tech companies. Manage communication stages, HR emails, and outreach logs.
          </p>
        </div>
        <div className="reach-out-stats-pill">
          {stageCounts.all} Target Companies in Pipeline
        </div>
      </div>

      {/* Filter Row */}
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
              placeholder="Search outreach candidates by company name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="clear-search-btn" onClick={() => setSearchQuery('')}>✕</button>
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
              <option value="all">🌐 All Indian Cities ({groupedReachoutCities.totalOffices} offices)</option>
              {groupedReachoutCities.tier1.length > 0 && (
                <optgroup label="🏢 Major Indian Tech Hubs">
                  {groupedReachoutCities.tier1.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}{c.state ? `, ${c.state}` : ''} {c.officeCount > 0 ? `— ${c.officeCount} offices` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
              {groupedReachoutCities.others.length > 0 && (
                <optgroup label="📍 Regional IT Clusters & Cities">
                  {groupedReachoutCities.others.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}{c.state ? `, ${c.state}` : ''} {c.officeCount > 0 ? `— ${c.officeCount} offices` : ''}
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

      {/* Candidates Cards Grid */}
      {loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading outreach candidates...</p>
        </div>
      ) : error ? (
        <div className="error-banner">⚠️ {error}</div>
      ) : companies.length === 0 ? (
        <div className="empty-state">
          <h3>No outreach candidates found</h3>
          <p>Try resetting the search keyword or city filter.</p>
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
            />
          ))}
        </div>
      )}
    </div>
  );
}
