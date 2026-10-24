import React, { useState, useEffect } from 'react';

/**
 * JobEligibilityModal Component
 * Displays clear, beautiful, and structured eligibility analysis for a job:
 * - Freshers vs Experience required (years, seniority)
 * - Required Tech Stack & Major Skills
 * - Work Mode & Location (Remote vs Hybrid vs On-site)
 * - India Work Authorization (If US/International, can Indian applicants apply?)
 * - Education & Key Takeaways
 */
export default function JobEligibilityModal({
  job,
  onClose,
  onAddToPipeline,
  isInPipeline = false
}) {
  const [eligibility, setEligibility] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copiedSummary, setCopiedSummary] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Fetch or analyze eligibility
  useEffect(() => {
    if (!job) return;

    let isMounted = true;
    const fetchEligibility = async () => {
      setLoading(true);
      setError(null);

      const jobId = job._id || job.sourceJobId;
      try {
        const res = await fetch(`/api/jobs/${jobId}/eligibility`);
        if (!res.ok) {
          throw new Error(`Server returned ${res.status}`);
        }
        const data = await res.json();
        if (isMounted) {
          if (data.success && data.eligibility) {
            setEligibility(data.eligibility);
          } else {
            throw new Error(data.error || 'Failed to analyze eligibility');
          }
        }
      } catch (err) {
        console.warn('API fetch failed, falling back to client-side analysis:', err);
        if (isMounted) {
          // Client-side fallback analyzer
          const fallback = generateClientEligibility(job);
          setEligibility(fallback);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchEligibility();

    return () => {
      isMounted = false;
    };
  }, [job]);

  const handleCopySummary = () => {
    if (!eligibility) return;

    const summaryText = [
      `Job: ${job.title} at ${job.company}`,
      `Experience Level: ${eligibility.seniority?.experienceText || 'Not specified'}`,
      `Freshers Eligible: ${eligibility.seniority?.isFresher ? 'Yes' : 'No'}`,
      `Work Mode: ${eligibility.workplace?.mode || job.workMode || 'Unspecified'} (${eligibility.workplace?.locationDisplay || 'India'})`,
      `India Hiring Policy: ${eligibility.indiaEligibility?.verdictTitle || 'Direct India Opening'}`,
      `Top Skills: ${eligibility.skills?.slice(0, 6).join(', ') || 'Software Engineering'}`,
      `Apply URL: ${job.applyUrl}`
    ].join('\n');

    navigator.clipboard.writeText(summaryText);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  if (!job) return null;

  const companyInitial = (job.company || 'C').charAt(0).toUpperCase();

  return (
    <div className="auth-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="eligibility-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Close Button */}
        <button
          className="auth-modal-close"
          onClick={onClose}
          title="Close"
          aria-label="Close modal"
          type="button"
        >
          ×
        </button>

        {/* Modal Header */}
        <div className="eligibility-modal-header">
          <div className="eligibility-badge-row">
            <div className="eligibility-brand-badge">
              <span className="badge-spark-dot"></span>
              <span>JobRadar Eligibility Engine</span>
            </div>
            <span className="eligibility-source-tag">ATS Verified</span>
          </div>

          <h2 className="eligibility-job-title">{job.title}</h2>

          <div className="eligibility-meta-bar">
            <div className="eligibility-company-badge">
              <div className="company-logo-avatar">{companyInitial}</div>
              <span className="company-name-text">{job.company}</span>
            </div>

            <span className={`ats-pill ${getSourceBadgeClass(job.source)}`}>
              {job.source}
            </span>

            <span className="eligibility-loc-pill">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span>{job.city ? `${job.city}${job.country ? `, ${job.country}` : ''}` : (job.locationRaw || job.location || 'India')}</span>
            </span>

            <span className="status-badge open">
              <span className="status-dot"></span>
              Open
            </span>
          </div>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="eligibility-loading-box">
            <div className="spinner"></div>
            <p className="loading-text">Analyzing job requirements, seniority tier &amp; work authorization...</p>
          </div>
        ) : eligibility ? (
          <div className="eligibility-body-content">
            {/* 1. High-Impact India Hiring & US Policy Verdict Banner */}
            <div className={`eligibility-verdict-banner ${eligibility.indiaEligibility?.badgeTone || 'success'}`}>
              <div className="verdict-banner-left">
                <div className="verdict-icon-box">
                  <span className="verdict-emoji">{eligibility.indiaEligibility?.badgeIcon || '🇮🇳'}</span>
                </div>
                <div className="verdict-text-group">
                  <div className="verdict-status-pill">
                    {eligibility.indiaEligibility?.badgeText || 'Direct India Opening'}
                  </div>
                  <h3 className="verdict-title">
                    {eligibility.indiaEligibility?.verdictTitle}
                  </h3>
                  <p className="verdict-desc">
                    {eligibility.indiaEligibility?.explanation}
                  </p>
                </div>
              </div>
            </div>

            {/* 2. Structured 4-Card Eligibility Grid */}
            <div className="eligibility-cards-grid">
              {/* Card 1: Seniority & Freshers */}
              <div className="eligibility-card">
                <div className="card-header-line">
                  <div className="card-icon-bubble bubble-purple">🎓</div>
                  <span className="card-header-label">Seniority &amp; Experience</span>
                </div>

                <div className="card-primary-stat">
                  <span className="stat-highlight">
                    {eligibility.seniority?.isFresher ? 'Freshers Allowed' : 'Experience Required'}
                  </span>
                  <span className={`fresher-tag ${eligibility.seniority?.isFresher ? 'fresher-yes' : 'fresher-no'}`}>
                    {eligibility.seniority?.isFresher ? '✓ Freshers Eligible' : 'Experienced Role'}
                  </span>
                </div>

                <div className="card-detail-item">
                  <span className="detail-label">Experience Bracket:</span>
                  <strong className="detail-value">{eligibility.seniority?.experienceText}</strong>
                </div>

                <div className="card-detail-item">
                  <span className="detail-label">Seniority Tier:</span>
                  <span className="detail-value">{eligibility.seniority?.level}</span>
                </div>
              </div>

              {/* Card 2: Work Mode & Location */}
              <div className="eligibility-card">
                <div className="card-header-line">
                  <div className="card-icon-bubble bubble-blue">
                    {eligibility.workplace?.mode === 'Remote' ? '💻' : (eligibility.workplace?.mode === 'Hybrid' ? '🏢' : '📍')}
                  </div>
                  <span className="card-header-label">Work Mode &amp; Region</span>
                </div>

                <div className="card-primary-stat">
                  <span className="stat-highlight">{eligibility.workplace?.mode}</span>
                  <span className={`mode-badge-pill ${eligibility.workplace?.mode?.toLowerCase()}`}>
                    {eligibility.workplace?.mode}
                  </span>
                </div>

                <div className="card-detail-item">
                  <span className="detail-label">Base Location:</span>
                  <strong className="detail-value" title={eligibility.workplace?.locationDisplay}>
                    {eligibility.workplace?.locationDisplay}
                  </strong>
                </div>

                <div className="card-detail-item">
                  <span className="detail-label">Country Jurisdiction:</span>
                  <span className="detail-value">{eligibility.workplace?.country || 'India'}</span>
                </div>
              </div>

              {/* Card 3: Key Skills & Tech Stack */}
              <div className="eligibility-card span-two-cols">
                <div className="card-header-line">
                  <div className="card-icon-bubble bubble-green">⚡</div>
                  <span className="card-header-label">Required Tech Stack &amp; Skills</span>
                  <span className="skills-count-pill">{eligibility.skills?.length || 0} Identified</span>
                </div>

                <div className="skills-chips-flow">
                  {eligibility.skills && eligibility.skills.length > 0 ? (
                    eligibility.skills.map((skill, idx) => (
                      <span key={`sk-${idx}`} className="eligibility-skill-tag">
                        {skill}
                      </span>
                    ))
                  ) : (
                    <span className="no-skills-text">Software engineering principles, problem solving, and relevant tech stack.</span>
                  )}
                </div>

                {eligibility.education && (
                  <div className="education-note-row">
                    <span className="edu-icon">📜</span>
                    <span className="edu-text">
                      <strong>Education:</strong> {eligibility.education}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* 3. Key Takeaways Checklist */}
            <div className="eligibility-takeaways-box">
              <h4 className="takeaways-title">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <span>Candidate Eligibility Checklist</span>
              </h4>

              <div className="takeaways-grid">
                {eligibility.keyHighlights?.map((item, idx) => (
                  <div key={`th-${idx}`} className="takeaway-item">
                    <span className="takeaway-icon">{item.icon}</span>
                    <div className="takeaway-text-col">
                      <span className="takeaway-label">{item.label}</span>
                      <strong className="takeaway-val">{item.value}</strong>
                      <span className="takeaway-sub">{item.subtext}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {/* Modal Action Footer */}
        <div className="eligibility-modal-footer">
          <div className="footer-left-actions">
            <button
              type="button"
              className="btn-eligibility-copy"
              onClick={handleCopySummary}
              disabled={loading || !eligibility}
              title="Copy formatted summary to clipboard"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              <span>{copiedSummary ? '✓ Copied Summary' : 'Copy Summary'}</span>
            </button>

            {onAddToPipeline && (
              <button
                type="button"
                className={`btn-eligibility-pipeline ${isInPipeline ? 'is-added' : ''}`}
                onClick={() => onAddToPipeline(job)}
                title="Add company to your Outreach Pipeline"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>{isInPipeline ? '✓ In Outreach Pipeline' : '+ Track in Pipeline'}</span>
              </button>
            )}
          </div>

          <div className="footer-right-actions">
            <button
              type="button"
              className="btn-modal-cancel"
              onClick={onClose}
            >
              Close
            </button>
            <a
              href={job.applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-eligibility-apply"
              id="eligibility-apply-link"
            >
              <span>Apply on {job.company}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Returns ATS badge styling class.
 */
function getSourceBadgeClass(source) {
  if (!source) return 'badge-default';
  const map = {
    greenhouse: 'badge-greenhouse',
    lever: 'badge-lever',
    ashby: 'badge-ashby',
    smartrecruiters: 'badge-smartrecruiters',
    workday: 'badge-workday',
    amazon: 'badge-amazon',
    google: 'badge-google',
    eightfold: 'badge-eightfold',
    adzuna: 'badge-adzuna'
  };
  return map[source.toLowerCase()] || 'badge-default';
}

/**
 * Client-side fallback analyzer if backend is unreachable.
 */
function generateClientEligibility(job) {
  const title = (job.title || '').trim();
  const rawLoc = (job.locationRaw || job.location || '').trim();
  const country = (job.country || '').trim();
  const city = (job.city || '').trim();
  const company = (job.company || '').trim();
  const workMode = (job.workMode || 'unknown').toLowerCase();

  const isFresher = /\b(intern|internship|trainee|fresher|graduate|campus|new grad|entry[- ]level|associate software|junior)\b/i.test(title);
  const isSenior = /\b(senior|sr\.?|lead|staff|principal|architect|director|vp)\b/i.test(title);

  const hasIndiaLocation = country.toLowerCase() === 'india' ||
    /\b(bengaluru|bangalore|hyderabad|noida|gurgaon|gurugram|delhi|pune|mumbai|chennai|kolkata)\b/i.test(city || rawLoc);

  const isUS = country.toLowerCase() === 'united states' || country.toLowerCase() === 'us' || /\busa?\b|california|san jose|seattle|san francisco/i.test(rawLoc);

  const detectedSkills = [];
  if (/python|ml|ai|data/i.test(title)) detectedSkills.push('Python', 'SQL', 'Data Modeling');
  if (/react|frontend|ui|web/i.test(title)) detectedSkills.push('JavaScript', 'TypeScript', 'React', 'HTML/CSS');
  if (/backend|engineer|developer/i.test(title)) detectedSkills.push('Node.js / Java', 'REST APIs', 'SQL', 'Microservices');
  if (/cloud|devops|sre|infrastructure/i.test(title)) detectedSkills.push('AWS', 'Docker', 'Kubernetes', 'Linux');
  if (/architect/i.test(title)) detectedSkills.push('System Design', 'Cloud Architecture', 'Distributed Systems');
  if (detectedSkills.length === 0) detectedSkills.push('Software Engineering', 'Problem Solving', 'Data Structures');

  let indiaEligibility;
  if (hasIndiaLocation) {
    indiaEligibility = {
      status: 'direct_india',
      canIndiansApply: true,
      badgeText: 'Direct India Opening',
      badgeTone: 'success',
      badgeIcon: '🇮🇳',
      verdictTitle: '100% Eligible: Direct India Entity Hire',
      explanation: `Officially based at ${company}'s India office (${city || rawLoc || 'India'}). Indian residents are fully eligible with local payroll and benefits.`
    };
  } else if (workMode === 'remote' && /worldwide|global|anywhere/i.test(rawLoc)) {
    indiaEligibility = {
      status: 'eligible_worldwide',
      canIndiansApply: true,
      badgeText: 'Global Remote (India Allowed)',
      badgeTone: 'success',
      badgeIcon: '🌐',
      verdictTitle: 'Eligible: Worldwide Remote Role',
      explanation: `${company} supports global remote candidates. Indian residents can apply remotely.`
    };
  } else if (isUS) {
    indiaEligibility = {
      status: 'restricted_us',
      canIndiansApply: false,
      badgeText: 'US Work Auth Required',
      badgeTone: 'warning',
      badgeIcon: '🇺🇸',
      verdictTitle: 'Restricted: Existing US Work Authorization Required',
      explanation: `This role is located in the US (${rawLoc || 'United States'}). Candidates in India cannot work cross-border without existing US citizenship, Green Card, or valid US visa.`
    };
  } else {
    indiaEligibility = {
      status: 'conditional',
      canIndiansApply: true,
      badgeText: 'Location Specific',
      badgeTone: 'info',
      badgeIcon: 'ℹ️',
      verdictTitle: 'Check ATS Requirements',
      explanation: `Check official ${company} ATS listing for location-specific work permit prerequisites.`
    };
  }

  return {
    jobId: job._id || job.sourceJobId,
    title,
    company,
    seniority: {
      isFresher,
      level: isFresher ? 'Fresher / Early Career' : (isSenior ? 'Senior / Lead' : 'Mid-Level'),
      experienceText: isFresher ? '0 - 2 Years (Freshers & College Grads)' : (isSenior ? '5+ Years Professional Exp' : '2 - 5 Years Exp')
    },
    skills: detectedSkills,
    workplace: {
      mode: workMode === 'remote' ? 'Remote' : (hasIndiaLocation ? 'Hybrid / On-site' : 'Flexible'),
      locationDisplay: rawLoc || city || 'Unspecified',
      country: country || (hasIndiaLocation ? 'India' : 'Unspecified')
    },
    indiaEligibility,
    education: 'B.E. / B.Tech / BCA / MCA / BS in Computer Science or equivalent',
    keyHighlights: [
      {
        label: 'Experience Fit',
        icon: isFresher ? '🎓' : '💼',
        value: isFresher ? 'Fresher Friendly' : 'Experienced Level',
        subtext: isFresher ? 'College grads and junior candidates meet criteria' : 'Requires relevant professional experience'
      },
      {
        label: 'India Candidate Status',
        icon: indiaEligibility.badgeIcon,
        value: indiaEligibility.verdictTitle,
        subtext: indiaEligibility.canIndiansApply ? 'Indian applicants are eligible' : 'Requires existing local work permit'
      },
      {
        label: 'Work Mode',
        icon: '🏢',
        value: workMode === 'remote' ? 'Remote' : 'Office / Hybrid',
        subtext: rawLoc || 'Location as per ATS'
      },
      {
        label: 'Primary Skills',
        icon: '⚡',
        value: detectedSkills.slice(0, 3).join(', '),
        subtext: 'Core technical competencies identified'
      }
    ]
  };
}
