import React, { useState } from 'react';

export default function CompanyCard({ company, onUpdate }) {
  const [followUpStatus, setFollowUpStatus] = useState(company.followUpStatus || 'to_contact');
  const [notes, setNotes] = useState(company.notes || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showJobs, setShowJobs] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [showNotesInput, setShowNotesInput] = useState(Boolean(company.notes));
  const [showAllContacts, setShowAllContacts] = useState(false);
  const [copiedItem, setCopiedItem] = useState(null);

  const handleStatusChange = async (newStatus) => {
    setFollowUpStatus(newStatus);
    saveChanges(newStatus, notes);
  };

  const handleNotesBlur = () => {
    if (notes !== company.notes) {
      saveChanges(followUpStatus, notes);
    }
  };

  const saveChanges = async (statusToSave, notesToSave) => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const res = await fetch(`/api/directory/companies/${company._id}/follow-up`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          followUpStatus: statusToSave,
          notes: notesToSave
        })
      });
      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
        if (onUpdate) onUpdate(company._id, { followUpStatus: statusToSave, notes: notesToSave });
      }
    } catch (err) {
      console.error('Failed to update follow-up:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const copyToClipboard = (text, id) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedItem(id);
    setTimeout(() => setCopiedItem(null), 1600);
  };

  // Generate a clean monogram avatar for the company
  const getInitials = (name) => {
    if (!name) return 'CO';
    const words = name.trim().split(/\s+/);
    if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  };

  const getAvatarGradient = (name = '') => {
    const gradients = [
      'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
      'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
      'linear-gradient(135deg, #10b981 0%, #059669 100%)',
      'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
      'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)'
    ];
    let sum = 0;
    for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
    return gradients[sum % gradients.length];
  };

  // Primary office location display
  const primaryOffice = company.offices && company.offices.length > 0 ? company.offices[0] : null;
  const cityName = primaryOffice?.cityId?.name || '';
  const stateName = primaryOffice?.cityId?.state || '';
  const displayLocation = cityName ? `${cityName}${stateName ? `, ${stateName}` : ''}` : (primaryOffice?.address || 'India');

  // Official careers / job board URL computation
  const getOfficialCareersUrl = () => {
    if (company.careersUrl) return company.careersUrl;
    if (company.atsType && company.atsSlug) {
      if (company.atsType === 'greenhouse') return `https://boards.greenhouse.io/${company.atsSlug}`;
      if (company.atsType === 'lever') return `https://jobs.lever.co/${company.atsSlug}`;
      if (company.atsType === 'ashby') return `https://jobs.ashbyhq.com/${company.atsSlug}`;
      if (company.atsType === 'smartrecruiters') return `https://jobs.smartrecruiters.com/${company.atsSlug}`;
    }
    const firstJobUrl = company.openJobs?.[0]?.applyUrl;
    if (firstJobUrl) {
      try {
        const urlObj = new URL(firstJobUrl);
        if (urlObj.hostname.includes('greenhouse.io')) {
          const parts = urlObj.pathname.split('/').filter(Boolean);
          if (parts[0]) return `https://boards.greenhouse.io/${parts[0]}`;
        }
        if (urlObj.hostname.includes('lever.co')) {
          const parts = urlObj.pathname.split('/').filter(Boolean);
          if (parts[0]) return `https://jobs.lever.co/${parts[0]}`;
        }
        if (urlObj.hostname.includes('ashbyhq.com')) {
          const parts = urlObj.pathname.split('/').filter(Boolean);
          if (parts[0]) return `https://jobs.ashbyhq.com/${parts[0]}`;
        }
        return firstJobUrl;
      } catch {
        return firstJobUrl;
      }
    }
    if (company.website) {
      return company.website.startsWith('http') ? company.website : `https://${company.website}`;
    }
    return null;
  };

  const officialCareersUrl = getOfficialCareersUrl();

  // Primary website URL
  const rawWebsite = company.website || officialCareersUrl;
  const websiteUrl = rawWebsite
    ? (rawWebsite.startsWith('http') ? rawWebsite : `https://${rawWebsite}`)
    : null;

  const displayDomain = company.domain || (websiteUrl ? (() => {
    try { return new URL(websiteUrl).hostname.replace('www.', ''); } catch { return 'Website'; }
  })() : null);

  // Group and limit contacts to prevent card distortion
  const allEmails = company.contact?.emails || [];
  const allPhones = company.contact?.phones || [];
  const totalContacts = allEmails.length + allPhones.length;

  const initialContactsLimit = 2;
  const hasHiddenContacts = totalContacts > initialContactsLimit;
  const hiddenContactsCount = totalContacts - initialContactsLimit;

  const visibleEmails = showAllContacts ? allEmails : allEmails.slice(0, 2);
  const visiblePhones = showAllContacts
    ? allPhones
    : (allEmails.length === 0 ? allPhones.slice(0, 2) : (allEmails.length === 1 ? allPhones.slice(0, 1) : []));

  return (
    <div className={`classy-card ${company.isHiring ? 'is-hiring' : ''}`} id={`company-${company.slug || company._id}`}>
      <div className="card-main-content">
        {/* Card Header: Monogram Avatar, Company Name, Category & Hiring Pill */}
        <div className="card-top-row">
          <div className="avatar-and-info">
            <div className="company-monogram" style={{ background: getAvatarGradient(company.name) }}>
              <span>{getInitials(company.name)}</span>
            </div>

            <div className="company-text-meta">
              <div className="title-and-link">
                <h3 className="company-heading" title={company.name}>
                  {company.name}
                </h3>
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
                <span className="clean-pill category-pill">{company.category || 'Company'}</span>

                {company.atsType && (
                  <span className="clean-pill ats-pill">
                    ATS: {company.atsType}
                  </span>
                )}

                {company.isTech && (
                  <button
                    type="button"
                    className="clean-pill tech-pill"
                    onClick={() => setShowEvidence(!showEvidence)}
                    title="Click to toggle verified tech evidence"
                  >
                    ⚡ Tech {company.techEvidence?.length > 0 && `(${company.techEvidence.length})`}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Hiring Status Pill */}
          <div className="status-pill-wrapper">
            {company.isHiring ? (
              <button
                type="button"
                className="hiring-tag hiring-now"
                onClick={() => setShowJobs(!showJobs)}
                title="Click to view open jobs"
              >
                <span className="green-pulse-dot"></span>
                <span>{company.hiringStatusLabel || `Hiring (${company.openJobs?.length || 0})`}</span>
                <span className="expand-indicator">{showJobs ? '▲' : '▼'}</span>
              </button>
            ) : (
              <span className="hiring-tag no-vacancy">
                <span className="gray-dot"></span>
                <span>No known vacancies</span>
              </span>
            )}
          </div>
        </div>

        {/* Tech Evidence Drawer (Expandable) */}
        {showEvidence && company.techEvidence?.length > 0 && (
          <div className="drawer-container tech-evidence-drawer">
            <div className="drawer-header-text">Verified Tech Evidence:</div>
            <ul className="evidence-items-list">
              {company.techEvidence.map((ev, idx) => (
                <li key={idx} className="evidence-item">
                  <span>{ev.what}</span>
                  {ev.sourceUrl && (
                    <a href={ev.sourceUrl} target="_blank" rel="noopener noreferrer" className="source-mini-anchor">
                      [Source ↗]
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Key Details: Location & Offices with Fixed Height Rhythm */}
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
              <span className="detail-secondary-text" title={primaryOffice?.address || 'India'}>
                {primaryOffice?.address && primaryOffice.address !== cityName ? primaryOffice.address : (company.category || 'Office Address')}
              </span>
            </div>
          </div>
        </div>

        {/* Public Contact Details with Capped Expansion to Prevent Tall Card Explosion */}
        <div className={`card-contacts-bar ${totalContacts === 0 ? 'empty-contacts' : ''}`}>
          <div className="contacts-bar-header">
            <span className="contacts-bar-title">Contact & Outreach</span>
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
                <div key={`em-${idx}`} className="contact-chip" title={em.value}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="chip-icon">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  <a href={`mailto:${em.value}`} className="chip-anchor">{em.value}</a>
                  <button
                    type="button"
                    className="chip-copy-btn"
                    onClick={() => copyToClipboard(em.value, `em-${idx}`)}
                    title="Copy email"
                  >
                    {copiedItem === `em-${idx}` ? '✓' : 'Copy'}
                  </button>
                </div>
              ))}

              {visiblePhones.map((ph, idx) => (
                <div key={`ph-${idx}`} className="contact-chip" title={ph.value}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="chip-icon">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
                  </svg>
                  <a href={`tel:${ph.value}`} className="chip-anchor">{ph.value}</a>
                  <button
                    type="button"
                    className="chip-copy-btn"
                    onClick={() => copyToClipboard(ph.value, `ph-${idx}`)}
                    title="Copy phone"
                  >
                    {copiedItem === `ph-${idx}` ? '✓' : 'Copy'}
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

        {/* Active Jobs Drawer (Expandable when company is hiring) */}
        {showJobs && company.isHiring && company.openJobs?.length > 0 && (
          <div className="drawer-container jobs-drawer">
            <div className="drawer-header-text">Active Openings ({company.openJobs.length}):</div>
            <div className="open-jobs-list">
              {company.openJobs.slice(0, 10).map((j, idx) => (
                <div key={idx} className="job-row-item">
                  <div className="job-row-info">
                    <span className="job-row-title">{j.title}</span>
                    <span className="job-row-meta">
                      📍 {j.city || 'India'} • {j.workMode || 'onsite'}
                    </span>
                  </div>
                  <a
                    href={j.applyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="job-apply-link"
                  >
                    Apply ↗
                  </a>
                </div>
              ))}
              {company.openJobs.length > 10 && (
                officialCareersUrl ? (
                  <a
                    href={officialCareersUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="more-jobs-link"
                    title={`View all ${company.openJobs.length} open positions on official careers page`}
                  >
                    <span>+ {company.openJobs.length - 10} more open positions on official careers page</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mini-icon arrow-icon">
                      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                    </svg>
                  </a>
                ) : (
                  <div className="more-jobs-text">
                    + {company.openJobs.length - 10} more open positions on careers page
                  </div>
                )
              )}
            </div>
          </div>
        )}
      </div>

      {/* Card Divider & Outreach Controls Always Pinned at Bottom */}
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
                <option value="none">None</option>
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

          {/* Collapsible Notes Box */}
          {showNotesInput && (
            <div className="notes-box-wrapper">
              <textarea
                className="clean-notes-input"
                placeholder="Outreach notes (e.g. Sent email to recruiting lead, connected on LinkedIn)..."
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
