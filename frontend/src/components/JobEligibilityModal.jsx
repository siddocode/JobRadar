import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { evaluateCandidateMatch, generateClientEligibility } from '../utils/candidateMatcher';
import CvTailorSection from './CvTailorSection';

/**
 * JobEligibilityModal Component
 * Evaluates both:
 * 1. Personalized Candidate Match against uploaded CV (PDF) or Portfolio URL:
 *    - Country & Work Authorization eligibility (Most Important)
 *    - Experience & Seniority fit (Most Important)
 *    - Technical skills matched vs missing
 *    - Clear breakdown: ELIGIBLE factors, NON-ELIGIBLE factors, and OVERALL verdict
 * 2. Standalone Job Requirements & Criteria
 */
export default function JobEligibilityModal({
  job,
  onClose,
  onAddToPipeline,
  onOpenProfileModal,
  isInPipeline = false
}) {
  const { candidateProfile, isAuthenticated, openAuthModal, token, updateCandidateProfile } = useAuth();

  const [eligibility, setEligibility] = useState(() => job?.eligibility || null);
  const [loading, setLoading] = useState(() => !job?.eligibility);
  const [copiedSummary, setCopiedSummary] = useState(false);

  // Tab: 'match' (Personalized Candidate Match) | 'job' (General Job Requirements)
  const [viewTab, setViewTab] = useState((isAuthenticated && candidateProfile) ? 'match' : 'job');

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Fetch or analyze job eligibility
  useEffect(() => {
    if (!job) return;

    // If job already has server-analyzed eligibility, use it immediately
    if (job.eligibility) {
      setEligibility(job.eligibility);
      setLoading(false);
      return;
    }

    let isMounted = true;
    const fetchEligibility = async () => {
      setLoading(true);

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

  // Evaluate candidate match whenever eligibility and candidateProfile are available
  const candidateMatch = useMemo(() => {
    if (!eligibility || !candidateProfile) return null;
    return evaluateCandidateMatch(eligibility, candidateProfile);
  }, [eligibility, candidateProfile]);

  // Copy summary to clipboard
  const handleCopySummary = () => {
    if (!eligibility) return;

    const lines = [
      `Job: ${job.title} at ${job.company}`,
      `Location: ${job.city || job.locationRaw || 'India'} (${job.workMode || 'Unspecified'})`,
      `Apply URL: ${job.applyUrl}`
    ];

    if (candidateMatch) {
      lines.push(
        `--- CANDIDATE ELIGIBILITY EVALUATION ---`,
        `Candidate: ${candidateMatch.candidateSummary.name} (${candidateMatch.candidateSummary.country}, ${candidateMatch.candidateSummary.experienceDisplay || `${candidateMatch.candidateSummary.totalYearsExperience} Yrs Exp`})`,
        `Overall Verdict: ${candidateMatch.overall.status} (${candidateMatch.overall.score}% Match)`,
        `Headline: ${candidateMatch.overall.headline}`,
        `Summary: ${candidateMatch.overall.summary}`,
        `Eligible Factors: ${candidateMatch.eligibleFactors.map(f => f.title).join('; ')}`
      );
      if (candidateMatch.nonEligibleFactors.length > 0) {
        lines.push(`Non-Eligible Factors / Gaps: ${candidateMatch.nonEligibleFactors.map(f => f.title).join('; ')}`);
      }
    } else {
      lines.push(
        `Experience Level: ${eligibility.seniority?.experienceText || 'Not specified'}`,
        `Freshers Eligible: ${eligibility.seniority?.isFresher ? 'Yes' : 'No'}`,
        `Work Mode: ${eligibility.workplace?.mode || job.workMode || 'Unspecified'} (${eligibility.workplace?.locationDisplay || 'India'})`,
        `India Hiring Policy: ${eligibility.indiaEligibility?.verdictTitle || 'Direct India Opening'}`,
        `Top Skills: ${eligibility.skills?.slice(0, 6).join(', ') || 'Software Engineering'}`
      );
    }

    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  if (!job) return null;

  const companyInitial = (job.company || 'C').charAt(0).toUpperCase();

  return (
    <div className="auth-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="eligibility-modal-container enhanced-modal" onClick={(e) => e.stopPropagation()}>
        {/* Close Button */}
        <button
          className="auth-modal-close"
          onClick={onClose}
          title="Close modal"
          aria-label="Close"
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

          {/* Dual Navigation Tabs: Candidate Match vs Job Criteria */}
          <div className="modal-tabs-header">
            <button
              type="button"
              className={`modal-tab-link ${viewTab === 'match' ? 'active' : ''}`}
              onClick={() => setViewTab('match')}
            >
              <span className="tab-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="6" />
                  <circle cx="12" cy="12" r="2" />
                </svg>
              </span>
              <span>Candidate Match</span>
              {candidateMatch && (
                <span className={`tab-score-pill ${candidateMatch.overall.badgeTone}`}>
                  {candidateMatch.overall.score}% Fit
                </span>
              )}
            </button>

            <button
              type="button"
              className={`modal-tab-link ${viewTab === 'job' ? 'active' : ''}`}
              onClick={() => setViewTab('job')}
            >
              <span className="tab-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                  <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
              </span>
              <span>Job Requirements &amp; Criteria</span>
            </button>

            <button
              type="button"
              className={`modal-tab-link ${viewTab === 'tailor' ? 'active' : ''}`}
              onClick={() => setViewTab('tailor')}
            >
              <span className="tab-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </span>
              <span>Tailor &amp; Download CV</span>
              <span className="tab-score-pill special-ats-pill">ATS Optimizer</span>
            </button>
          </div>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="eligibility-loading-box">
            <div className="spinner"></div>
            <p className="loading-text">Analyzing job requirements, seniority tier &amp; work authorization...</p>
          </div>
        ) : (
          <div className="eligibility-body-content">
            {/* =========================================================================
                TAB 1: CANDIDATE MATCH ANALYZER (CV / PORTFOLIO)
               ========================================================================= */}
            {viewTab === 'match' && (
              <div className="candidate-match-tab-content">
                {/* 1. If user is not authenticated */}
                {!isAuthenticated ? (
                  <div className="in-modal-no-profile-box">
                    <div className="no-profile-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </div>
                    <h3 className="no-profile-title">Sign In Required for Personalized Fit</h3>
                    <p className="no-profile-desc">
                      Create an account or sign in to upload your CV, verify ATS eligibility, and evaluate your match score, country authorization, and missing skills for this role.
                    </p>
                    <button
                      type="button"
                      className="btn-primary-open-profile"
                      onClick={() => {
                        onClose();
                        openAuthModal('Please sign in or create an account to view your personalized eligibility match for this job.', 'login');
                      }}
                    >
                      Sign In to Check Match
                    </button>
                  </div>
                ) : !candidateProfile ? (
                  <div className="in-modal-no-profile-box">
                    <div className="no-profile-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                      </svg>
                    </div>
                    <h3 className="no-profile-title">Personalized Match Requires Active CV or Portfolio</h3>
                    <p className="no-profile-desc">
                      Upload your CV in PDF or enter your portfolio site URL using the <strong>+ Match My CV / Portfolio</strong> button on the main dashboard.
                      JobRadar will automatically evaluate your country work authorization, experience fit, and skills match for this position and across all jobs.
                    </p>
                    {onOpenProfileModal && (
                      <button
                        type="button"
                        className="btn-primary-open-profile"
                        onClick={() => {
                          onClose();
                          onOpenProfileModal();
                        }}
                      >
                        + Upload CV or Portfolio (One-time)
                      </button>
                    )}
                  </div>
                ) : (
                  /* 2. Candidate Match Results Display */
                  candidateMatch && (
                    <div className="candidate-match-results">
                      {/* Active Candidate Profile Bar */}
                      <div className="active-candidate-bar">
                        <div className="candidate-bar-left">
                          <div className="candidate-avatar-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                              <circle cx="12" cy="7" r="4" />
                            </svg>
                          </div>
                          <div className="candidate-bar-info">
                            <div className="candidate-bar-name">
                              <strong>{candidateMatch.candidateSummary.name}</strong>
                              <span className="candidate-country-tag">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ display: 'inline-block', verticalAlign: '-1px', marginRight: '3px' }}>
                                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                                  <circle cx="12" cy="10" r="3" />
                                </svg>
                                {candidateMatch.candidateSummary.country}
                                {candidateMatch.candidateSummary.city ? `, ${candidateMatch.candidateSummary.city}` : ''}
                              </span>
                            </div>
                            <div className="candidate-bar-meta">
                              <span>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'inline-block', verticalAlign: '-1.5px', marginRight: '3px' }}>
                                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                                </svg>
                                {candidateMatch.candidateSummary.experienceDisplay || (candidateMatch.candidateSummary.totalExperienceMonths ? `${candidateMatch.candidateSummary.totalExperienceMonths} Mos Experience` : `${candidateMatch.candidateSummary.totalYearsExperience || 0} Yrs Experience`)}
                              </span>
                              <span className="meta-dot">•</span>
                              <span>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'inline-block', verticalAlign: '-1.5px', marginRight: '3px' }}>
                                  <polyline points="16 18 22 12 16 6" />
                                  <polyline points="8 6 2 12 8 18" />
                                </svg>
                                {candidateMatch.candidateSummary.skillsDetectedCount} Skills Detected
                              </span>
                              <span className="meta-dot">•</span>
                              <span className="source-label">Source: {candidateMatch.candidateSummary.sourceName}</span>
                            </div>
                          </div>
                        </div>

                        {onOpenProfileModal && (
                          <button
                            type="button"
                            className="btn-change-cv"
                            onClick={() => {
                              onClose();
                              onOpenProfileModal();
                            }}
                            title="Upload a different CV or portfolio URL"
                          >
                            ↻ Change CV / URL
                          </button>
                        )}
                      </div>

                      {/* HERO OVERALL VERDICT BANNER */}
                      <div className={`match-verdict-hero ${candidateMatch.overall.badgeTone}`}>
                        <div className="verdict-hero-top">
                          <div className="verdict-score-badge">
                            <span className="score-number">{candidateMatch.overall.score}%</span>
                            <span className="score-label">MATCH SCORE</span>
                          </div>

                          <div className="verdict-status-column">
                            <div className="verdict-status-pill-row">
                              <span className={`status-pill ${candidateMatch.overall.badgeTone}`}>
                                {candidateMatch.overall.status.replace('_', ' ')}
                              </span>
                              {candidateMatch.overall.isHardBlocker && (
                                <span className="blocker-pill">COUNTRY BLOCKER</span>
                              )}
                            </div>
                            <h3 className="verdict-headline-text">
                              {candidateMatch.overall.headline}
                            </h3>
                          </div>
                        </div>

                        <p className="verdict-summary-paragraph">
                          {candidateMatch.overall.summary}
                        </p>

                        {/* Actionable Tips */}
                        {candidateMatch.overall.actionableTips?.length > 0 && (
                          <div className="actionable-tips-box">
                            <span className="tips-title">Actionable Recommendations:</span>
                            <ul className="tips-list">
                              {candidateMatch.overall.actionableTips.map((tip, idx) => (
                                <li key={`tip-${idx}`}>{tip}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      {/* SECTION A: ELIGIBLE FACTORS (What Candidate Qualifies For) */}
                      <div className="factors-section eligible-section">
                        <div className="factors-section-header">
                          <div className="section-header-left">
                            <span className="section-header-icon eligible-check">✓</span>
                            <h4 className="section-heading">
                              Eligible Factors ({candidateMatch.eligibleFactors.length} Passed)
                            </h4>
                          </div>
                          <span className="section-sub-badge">Requirements You Satisfy</span>
                        </div>

                        <div className="factors-grid">
                          {candidateMatch.eligibleFactors.map((factor) => (
                            <div key={factor.id} className="factor-card factor-pass">
                              <div className="factor-card-header">
                                <span className="factor-icon-bubble pass-bubble">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                </span>
                                <div className="factor-title-box">
                                  <span className="factor-category">{factor.category}</span>
                                  <h5 className="factor-card-title">{factor.title}</h5>
                                </div>
                                <span className="factor-status-badge pass">ELIGIBLE</span>
                              </div>

                              <p className="factor-card-detail">{factor.detail}</p>

                              {factor.chips && factor.chips.length > 0 && (
                                <div className="factor-chips-flow">
                                  {factor.chips.map((chip, cIdx) => (
                                    <span key={`fc-${cIdx}`} className="factor-chip pass-chip">
                                      {chip}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* CALLOUT TO TAILOR CV FOR THIS ROLE */}
                      <div className="tailor-cta-banner">
                        <div className="cta-left-content">
                          <span className="cta-sparkle">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                              <line x1="16" y1="13" x2="8" y2="13" />
                              <line x1="16" y1="17" x2="8" y2="17" />
                            </svg>
                          </span>
                          <div className="cta-text">
                            <strong>Want to optimize your CV for {job.company}?</strong>
                            <span>Automatically modify and align your CV with the target keywords for this role, then download your tailored ATS document.</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn-cta-tailor"
                          onClick={() => setViewTab('tailor')}
                        >
                          <span>Tailor My CV</span>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="5" y1="12" x2="19" y2="12" />
                            <polyline points="12 5 19 12 12 19" />
                          </svg>
                        </button>
                      </div>

                      {/* SECTION B: NON-ELIGIBLE FACTORS & GAPS (What is Missing or Blocking) */}
                      <div className="factors-section non-eligible-section">
                        <div className="factors-section-header">
                          <div className="section-header-left">
                            <span className="section-header-icon gap-warn">
                              {candidateMatch.nonEligibleFactors.length > 0 ? (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <circle cx="12" cy="12" r="10" />
                                  <line x1="12" y1="8" x2="12" y2="12" />
                                  <line x1="12" y1="16" x2="12.01" y2="16" />
                                </svg>
                              ) : (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                            </span>
                            <h4 className="section-heading">
                              Non-Eligible Factors &amp; Gaps ({candidateMatch.nonEligibleFactors.length})
                            </h4>
                          </div>
                          <span className="section-sub-badge">
                            {candidateMatch.nonEligibleFactors.length > 0 ? 'Attention Needed' : 'Zero Blockers'}
                          </span>
                        </div>

                        {candidateMatch.nonEligibleFactors.length === 0 ? (
                          <div className="zero-blockers-card">
                            <span className="zero-icon">
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                <path d="M9 12l2 2 4-4" />
                              </svg>
                            </span>
                            <div className="zero-text">
                              <strong>Zero Blockers or Disqualifiers Found</strong>
                              <span>Your profile satisfies all key country work authorization, experience, and primary skill requirements.</span>
                            </div>
                          </div>
                        ) : (
                          <div className="factors-grid">
                            {candidateMatch.nonEligibleFactors.map((factor) => (
                              <div
                                key={factor.id}
                                className={`factor-card factor-fail ${factor.isBlocker ? 'hard-blocker-card' : 'gap-card'}`}
                              >
                                <div className="factor-card-header">
                                  <span className={`factor-icon-bubble ${factor.isBlocker ? 'blocker-bubble' : 'gap-bubble'}`}>
                                    {factor.isBlocker ? (
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <circle cx="12" cy="12" r="10" />
                                        <line x1="15" y1="9" x2="9" y2="15" />
                                        <line x1="9" y1="9" x2="15" y2="15" />
                                      </svg>
                                    ) : (
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <circle cx="12" cy="12" r="10" />
                                        <line x1="12" y1="8" x2="12" y2="12" />
                                        <line x1="12" y1="16" x2="12.01" y2="16" />
                                      </svg>
                                    )}
                                  </span>
                                  <div className="factor-title-box">
                                    <span className="factor-category">{factor.category}</span>
                                    <h5 className="factor-card-title">{factor.title}</h5>
                                  </div>
                                  <span className={`factor-status-badge ${factor.isBlocker ? 'blocker' : 'gap'}`}>
                                    {factor.isBlocker ? 'NON-ELIGIBLE' : 'SKILL GAP'}
                                  </span>
                                </div>

                                <p className="factor-card-detail">{factor.detail}</p>

                                {factor.missingItems && factor.missingItems.length > 0 && (
                                  <div className="factor-chips-flow">
                                    <span className="missing-label">Missing:</span>
                                    {factor.missingItems.map((item, mIdx) => (
                                      <span key={`mi-${mIdx}`} className="factor-chip missing-chip">
                                        {item}
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {factor.recommendation && (
                                  <div className="factor-recommendation-note">
                                    <span className="rec-icon">
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <circle cx="12" cy="12" r="10" />
                                        <line x1="12" y1="16" x2="12" y2="12" />
                                        <line x1="12" y1="8" x2="12.01" y2="8" />
                                      </svg>
                                    </span>
                                    <span className="rec-text">{factor.recommendation}</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>
            )}

            {/* =========================================================================
                TAB 2: GENERAL JOB REQUIREMENTS & CRITERIA
               ========================================================================= */}
            {viewTab === 'job' && (
              <div className="job-requirements-tab-content">
                {/* 1. India Hiring & US Policy Verdict Banner */}
                <div className={`eligibility-verdict-banner ${eligibility.indiaEligibility?.badgeTone || 'success'}`}>
                  <div className="verdict-banner-left">
                    <div className="verdict-icon-box">
                      <span className="verdict-emoji">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                          <path d="M9 12l2 2 4-4" />
                        </svg>
                      </span>
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
                      <div className="card-icon-bubble bubble-purple">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                          <path d="M6 12v5c3 3 9 3 12 0v-5" />
                        </svg>
                      </div>
                      <span className="card-header-label">Seniority &amp; Experience</span>
                    </div>

                    <div className="card-primary-stat">
                      <span className="stat-highlight">
                        {eligibility.seniority?.isFresher ? 'Freshers Allowed' : 'Experience Required'}
                      </span>
                      <span className={`fresher-tag ${eligibility.seniority?.isFresher ? 'fresher-yes' : 'fresher-no'}`}>
                        {eligibility.seniority?.isFresher ? 'Freshers Eligible' : 'Experienced Role'}
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
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
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
                      <div className="card-icon-bubble bubble-green">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="16 18 22 12 16 6" />
                          <polyline points="8 6 2 12 8 18" />
                        </svg>
                      </div>
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
                        <span className="edu-icon">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                          </svg>
                        </span>
                        <span className="edu-text">
                          <strong>Education:</strong> {eligibility.education}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. Candidate Eligibility Checklist */}
                <div className="eligibility-takeaways-box">
                  <h4 className="takeaways-title">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    <span>General Candidate Eligibility Checklist</span>
                  </h4>

                  <div className="takeaways-grid">
                    {eligibility.keyHighlights?.map((item, idx) => (
                      <div key={`th-${idx}`} className="takeaway-item">
                        <span className="takeaway-icon">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </span>
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
            )}

            {/* =========================================================================
                TAB 3: TAILOR CV FOR THIS SPECIFIC JOB (ATS OPTIMIZER & DOWNLOAD)
               ========================================================================= */}
            {viewTab === 'tailor' && (
              <CvTailorSection
                job={job}
                candidateProfile={candidateProfile}
                token={token}
                onProfileUpdated={(newProfile) => {
                  if (updateCandidateProfile) updateCandidateProfile(newProfile);
                }}
              />
            )}
          </div>
        )}

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

            {viewTab !== 'tailor' && (
              <button
                type="button"
                className="btn-eligibility-pipeline"
                style={{ background: 'rgba(99, 102, 241, 0.1)', borderColor: 'rgba(99, 102, 241, 0.3)', color: '#4f46e5' }}
                onClick={() => setViewTab('tailor')}
                title="Modify and optimize your CV for this job"
              >
                <span>Tailor CV</span>
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
