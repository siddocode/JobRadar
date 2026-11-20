import React, { useState, useEffect, useMemo } from 'react';
import { AlertCircle, Check, User, MapPin, Sparkles, ExternalLink, Briefcase, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { evaluateCandidateMatch, generateClientEligibility } from '../utils/candidateMatcher';
import CvTailorSection from './CvTailorSection';
import { useModalScrollLock } from '../utils/useModalScrollLock';

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
  const { candidateProfile, isAuthenticated, openAuthModal, token, updateCandidateProfile, authFetch } = useAuth();

  useModalScrollLock(Boolean(job));

  const [eligibility, setEligibility] = useState(() => job?.eligibility || null);
  const [loading, setLoading] = useState(() => !job?.eligibility);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [isStaged, setIsStaged] = useState(false);
  const [isStaging, setIsStaging] = useState(false);
  const [stageFeedback, setStageFeedback] = useState(null);

  // Check if job is already staged in user's Application collection
  useEffect(() => {
    if (!isAuthenticated || !job) return;
    let isMounted = true;
    const checkStagedStatus = async () => {
      try {
        const jobId = job._id || job.id;
        const res = await authFetch('/api/applications?limit=100');
        if (res.ok) {
          const data = await res.json();
          if (data.success && isMounted) {
            const found = data.applications?.some(app =>
              (app.jobId && (app.jobId._id === jobId || app.jobId === jobId)) ||
              (app.jobTitle === job.title && app.companyName === job.company)
            );
            if (found) setIsStaged(true);
          }
        }
      } catch {}
    };
    checkStagedStatus();
    return () => { isMounted = false; };
  }, [isAuthenticated, job, authFetch]);

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

  // 1-Click Autopilot Application Staging
  const handleStageWithAutopilot = async () => {
    if (!isAuthenticated) {
      openAuthModal('Please sign in or create an account to stage this job with Autopilot.', 'login');
      return;
    }
    if (!candidateProfile) {
      if (onOpenProfileModal) {
        onClose();
        onOpenProfileModal();
      } else {
        alert('Please upload your CV in the Career Profile tab to stage with a tailored snapshot.');
      }
      return;
    }

    setIsStaging(true);
    setStageFeedback(null);
    try {
      const jobId = job._id || job.id;
      const res = await authFetch('/api/applications/stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          submissionMode: 'assisted_browser',
          matchScore: candidateMatch?.overall?.score || null
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsStaged(true);
        // Let the dashboard refresh its stage counts while it stays mounted.
        window.dispatchEvent(new Event('jobradar:applications-changed'));
        setStageFeedback({
          type: 'success',
          message: 'Job successfully staged into your Applications pipeline with prefilled ATS blueprint & tailored resume snapshot!'
        });
        setTimeout(() => setStageFeedback(null), 6000);
      } else {
        setStageFeedback({
          type: 'error',
          message: data.error || 'Failed to stage application with Autopilot.'
        });
      }
    } catch (err) {
      setStageFeedback({
        type: 'error',
        message: 'Error staging application: ' + err.message
      });
    } finally {
      setIsStaging(false);
    }
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
                            <User size={15} />
                          </div>
                          <div className="candidate-bar-info">
                            <div className="candidate-bar-name">
                              <strong>{candidateMatch.candidateSummary.name || 'Your Profile'}</strong>
                              <span className="candidate-country-tag">
                                <MapPin size={11} style={{ display: 'inline-block', verticalAlign: '-1px', marginRight: '3px' }} />
                                {candidateMatch.candidateSummary.country || 'India'}{candidateMatch.candidateSummary.city ? `, ${candidateMatch.candidateSummary.city}` : ''}
                              </span>
                            </div>
                            <div className="candidate-bar-meta">
                              <span>{candidateMatch.candidateSummary.experienceDisplay}</span>
                              <span className="meta-dot">•</span>
                              <span>{candidateMatch.candidateSummary.skillsDetectedCount} Skills</span>
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
                            title="Edit profile or upload another CV"
                          >
                            Edit Profile
                          </button>
                        )}
                      </div>

                      {/* HERO OVERALL VERDICT BANNER */}
                      <div className={`match-verdict-hero ${candidateMatch.overall.badgeTone}`}>
                        <div className="verdict-hero-top">
                          <div className="verdict-score-badge">
                            <span className="score-number">{candidateMatch.overall.score}%</span>
                            <span className="score-label">MATCH</span>
                          </div>

                          <div className="verdict-status-column">
                            <div className="verdict-status-pill-row">
                              <span className={`status-pill ${candidateMatch.overall.badgeTone}`}>
                                {candidateMatch.overall.status.replace('_', ' ')}
                              </span>
                              {candidateMatch.overall.isHardBlocker && (
                                <span className="blocker-pill">
                                  {candidateMatch.overall.blockerTag || 'REQUIREMENT GAP'}
                                </span>
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
                      </div>

                      {/* QUALIFICATIONS COMPARISON MATRIX (Clean 2-Column Side-by-Side) */}
                      <div className="modal-qualifications-matrix">
                        <div className="matrix-col requirements-col">
                          <h4 className="matrix-col-title">Role Requirements</h4>
                          <div className="matrix-item">
                            <span className="matrix-item-label">Experience Seniority</span>
                            <span className="matrix-item-val">{eligibility?.seniority?.experienceText || 'Required experience specified in JD'}</span>
                          </div>
                          <div className="matrix-item">
                            <span className="matrix-item-label">Location & Work Mode</span>
                            <span className="matrix-item-val">{eligibility?.workplace?.mode || 'On-site'} • {eligibility?.workplace?.locationDisplay || 'India'}</span>
                          </div>
                          <div className="matrix-item">
                            <span className="matrix-item-label">Key Technical Skills</span>
                            <div className="matrix-chips-wrap">
                              {eligibility?.skills && eligibility.skills.length > 0 ? (
                                eligibility.skills.slice(0, 10).map((s, idx) => (
                                  <span key={idx} className="matrix-tech-chip">{s}</span>
                                ))
                              ) : (
                                <span className="matrix-muted-text">General engineering competencies</span>
                              )}
                            </div>
                          </div>
                          <div className="matrix-item">
                            <span className="matrix-item-label">Education</span>
                            <span className="matrix-item-val">{eligibility?.education?.degreeRequirement || 'B.Tech / Bachelor’s in CS or Engineering'}</span>
                          </div>
                        </div>

                        <div className="matrix-col profile-col">
                          <h4 className="matrix-col-title">Your Profile Alignment</h4>
                          <div className="matrix-item">
                            <span className="matrix-item-label">Your Seniority</span>
                            <span className={`matrix-item-val ${candidateMatch.overall.blockerCategory === 'experience' ? 'is-gap' : 'is-match'}`}>
                              {candidateMatch.candidateSummary.experienceDisplay}
                              {candidateMatch.overall.blockerCategory === 'experience' ? ' (Seniority Gap)' : ' ✓ Qualified'}
                            </span>
                          </div>
                          <div className="matrix-item">
                            <span className="matrix-item-label">Your Location</span>
                            <span className={`matrix-item-val ${candidateMatch.overall.blockerCategory === 'location' ? 'is-gap' : 'is-match'}`}>
                              {candidateMatch.candidateSummary.country || 'India'}
                              {candidateMatch.overall.blockerCategory === 'location' ? ' (Work Auth Mismatch)' : ' ✓ Eligible'}
                            </span>
                          </div>
                          <div className="matrix-item">
                            <span className="matrix-item-label">Skills Matched</span>
                            <div className="matrix-chips-wrap">
                              {candidateMatch.stats?.matchedSkillsCount > 0 ? (
                                candidateMatch.eligibleFactors.find(f => f.id === 'matched-skills')?.chips?.map((s, idx) => (
                                  <span key={idx} className="matrix-tech-chip match-chip">✓ {s}</span>
                                ))
                              ) : (
                                <span className="matrix-muted-text">No direct skills overlap detected</span>
                              )}
                            </div>
                          </div>
                          <div className="matrix-item">
                            <span className="matrix-item-label">Your Credentials</span>
                            <span className="matrix-item-val is-match">{candidateMatch.candidateSummary.education || 'Degree in Engineering'} ✓</span>
                          </div>
                        </div>
                      </div>

                      {/* DIRECT ACTIONS BAR */}
                      <div className="modal-direct-actions-bar">
                        <button
                          type="button"
                          className="btn-modal-tailor"
                          onClick={() => setViewTab('tailor')}
                        >
                          <Sparkles size={14} />
                          <span>Tailor My CV for {job.company}</span>
                        </button>

                        <button
                          type="button"
                          className={`btn-stage-autopilot ${isStaged ? 'staged' : ''}`}
                          onClick={handleStageWithAutopilot}
                          disabled={isStaging || isStaged}
                        >
                          {isStaging ? 'Staging...' : isStaged ? '✓ Staged in Pipeline' : 'Stage with Autopilot'}
                        </button>

                        {job.applyUrl && (
                          <a
                            href={job.applyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-modal-apply"
                          >
                            <span>Apply Direct</span>
                            <ExternalLink size={13} />
                          </a>
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

        {/* Stage Feedback Notification */}
        {stageFeedback && (
          <div className={`modal-stage-feedback-banner ${stageFeedback.type}`}>
            <span className="feedback-icon">{stageFeedback.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}</span>
            <span className="feedback-text">{stageFeedback.message}</span>
            <button
              type="button"
              className="feedback-dismiss-btn"
              onClick={() => setStageFeedback(null)}
              aria-label="Dismiss notification"
            >
              ×
            </button>
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
            <button
              type="button"
              className={`btn-stage-autopilot ${isStaged ? 'staged' : ''}`}
              onClick={handleStageWithAutopilot}
              disabled={isStaging || isStaged}
              title={isStaged ? 'Job is already staged in your Applications pipeline' : '1-click stage into application pipeline with prefilled snapshot'}
            >
              {isStaging ? (
                <span>Staging...</span>
              ) : isStaged ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>✓ Staged with Autopilot</span>
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  <span>Stage with Autopilot</span>
                </>
              )}
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
