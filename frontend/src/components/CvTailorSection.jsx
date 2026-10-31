import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { downloadResumePdf, downloadResumeText, copyResumeToClipboard } from '../utils/pdfGenerator';

export default function CvTailorSection({ job, candidateProfile, token, onProfileUpdated }) {
  const { isAuthenticated, openAuthModal } = useAuth();
  const [selectedFile, setSelectedFile] = useState(null);
  const [sourceType, setSourceType] = useState(() => (candidateProfile ? 'profile' : 'pdf'));
  const [portfolioUrl, setPortfolioUrl] = useState(() => {
    return candidateProfile?.portfolio || (candidateProfile?.sourceType === 'url' ? candidateProfile?.sourceName : '') || '';
  });
  const [tailoring, setTailoring] = useState(false);
  const [tailoringStep, setTailoringStep] = useState(0);
  const [tailoredData, setTailoredData] = useState(null);
  const [error, setError] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Editable resume state initialized to tailored output
  const [editableResume, setEditableResume] = useState(null);

  // Synchronize when candidateProfile changes
  useEffect(() => {
    if (candidateProfile) {
      if (candidateProfile.portfolio) {
        setPortfolioUrl(candidateProfile.portfolio);
      } else if (candidateProfile.sourceType === 'url' && candidateProfile.sourceName) {
        setPortfolioUrl(candidateProfile.sourceName);
      }
    }
  }, [candidateProfile]);

  // Handle PDF file selection
  const handleFileChange = (e) => {
    if (!isAuthenticated) {
      openAuthModal(`Please sign in or create an account to upload your CV and tailor it for ${job?.company || 'this role'}.`, 'login');
      return;
    }
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
        setError('Please select a valid PDF document (.pdf)');
        return;
      }
      setSelectedFile(file);
      setSourceType('pdf');
      setError(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (!isAuthenticated) {
      openAuthModal(`Please sign in or create an account to upload your CV and tailor it for ${job?.company || 'this role'}.`, 'login');
      return;
    }
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
        setError('Please drop a valid PDF document (.pdf)');
        return;
      }
      setSelectedFile(file);
      setSourceType('pdf');
      setError(null);
    }
  };

  // Perform tailoring API call
  const handleTailorCv = async () => {
    if (!isAuthenticated) {
      openAuthModal(`Please sign in or create an account to tailor your CV for ${job?.company || 'this role'}.`, 'login');
      return;
    }
    setError(null);
    setTailoring(true);
    setTailoringStep(1);

    const stepTimer = setInterval(() => {
      setTailoringStep(prev => (prev < 4 ? prev + 1 : prev));
    }, 650);

    try {
      const jobId = job._id || job.sourceJobId;
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      let res;
      if (sourceType === 'pdf' && selectedFile) {
        const formData = new FormData();
        formData.append('cv', selectedFile);
        res = await fetch(`/api/jobs/${jobId}/tailor-cv`, {
          method: 'POST',
          credentials: 'include',
          headers,
          body: formData
        });
      } else if (sourceType === 'profile') {
        headers['Content-Type'] = 'application/json';
        res = await fetch(`/api/jobs/${jobId}/tailor-cv`, {
          method: 'POST',
          credentials: 'include',
          headers,
          body: JSON.stringify({
            candidateProfile: candidateProfile || undefined
          })
        });
      } else if (sourceType === 'portfolio') {
        const cleanUrl = portfolioUrl ? portfolioUrl.trim() : '';
        if (!cleanUrl && !candidateProfile) {
          throw new Error('Please enter your portfolio website URL (e.g. https://myportfolio.com)');
        }
        headers['Content-Type'] = 'application/json';
        res = await fetch(`/api/jobs/${jobId}/tailor-cv`, {
          method: 'POST',
          credentials: 'include',
          headers,
          body: JSON.stringify({
            portfolioUrl: cleanUrl || undefined,
            candidateProfile: candidateProfile || undefined
          })
        });
      } else {
        throw new Error('Please select a CV source to tailor.');
      }

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to tailor CV for this role');
      }

      setTailoredData(data);
      setEditableResume(JSON.parse(JSON.stringify(data.tailoredResume)));
      if (data.parsedProfile && onProfileUpdated) {
        onProfileUpdated(data.parsedProfile);
      }
    } catch (err) {
      console.error('Tailoring error:', err);
      setError(err.message || 'Failed to tailor CV. Please check your document or portfolio link and try again.');
    } finally {
      clearInterval(stepTimer);
      setTailoring(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!editableResume) return;
    const candName = (editableResume.name || '').trim().replace(/\s+/g, '_');
    const compName = (job.company || 'Company').replace(/\s+/g, '_');
    const roleName = (job.title || 'Role').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
    const filename = candName
      ? `${candName}_${compName}_${roleName}_Tailored_Resume.pdf`
      : `${compName}_${roleName}_Tailored_Resume.pdf`;
    downloadResumePdf(editableResume, filename);
  };

  const handleDownloadText = () => {
    if (!editableResume) return;
    const candName = (editableResume.name || '').trim().replace(/\s+/g, '_');
    const compName = (job.company || 'Company').replace(/\s+/g, '_');
    const filename = candName
      ? `${candName}_${compName}_Tailored_Resume.txt`
      : `${compName}_Tailored_Resume.txt`;
    downloadResumeText(editableResume, filename);
  };

  const handleCopy = async () => {
    if (!editableResume) return;
    await copyResumeToClipboard(editableResume);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleSummarySection = () => {
    setEditableResume(prev => ({
      ...prev,
      includeSummary: !prev.includeSummary
    }));
  };

  // Inline edit handlers
  const handleSummaryChange = (val) => {
    setEditableResume(prev => ({ ...prev, summary: val }));
  };

  const handleExpBulletChange = (expIdx, bIdx, val) => {
    setEditableResume(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      copy.experience[expIdx].bullets[bIdx] = val;
      return copy;
    });
  };

  const handleProjBulletChange = (pIdx, bIdx, val) => {
    setEditableResume(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      copy.projects[pIdx].bullets[bIdx] = val;
      return copy;
    });
  };

  const handleProjTechStackChange = (pIdx, val) => {
    setEditableResume(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      copy.projects[pIdx].techStack = val;
      return copy;
    });
  };

  const handleSkillsChange = (catKey, val) => {
    const arr = val.split(',').map(s => s.trim()).filter(Boolean);
    setEditableResume(prev => ({
      ...prev,
      skills: {
        ...prev.skills,
        [catKey]: arr
      }
    }));
  };

  const handleCertificationChange = (idx, val) => {
    setEditableResume(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      if (!copy.certifications) copy.certifications = [];
      copy.certifications[idx] = val;
      return copy;
    });
  };

  const handleAchievementChange = (idx, val) => {
    setEditableResume(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      if (!copy.achievements) copy.achievements = [];
      copy.achievements[idx] = val;
      return copy;
    });
  };

  const handlePublicationChange = (idx, val) => {
    setEditableResume(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      if (!copy.publications) copy.publications = [];
      copy.publications[idx] = val;
      return copy;
    });
  };

  const handleLeadershipChange = (idx, val) => {
    setEditableResume(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      if (!copy.leadership) copy.leadership = [];
      copy.leadership[idx] = val;
      return copy;
    });
  };

  // Helper to highlight injected keywords in document view
  const renderHighlightedText = (text) => {
    if (!text || !tailoredData?.stats?.keywordsIntegrated?.length) return text;
    const keywords = tailoredData.stats.keywordsIntegrated;
    const pattern = new RegExp(`(${keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    const parts = text.split(pattern);

    return parts.map((part, i) => {
      const isMatch = keywords.some(k => k.toLowerCase() === part.toLowerCase());
      if (isMatch) {
        return (
          <mark key={`m-${i}`} className="jake-kw-injected" title="Target keyword optimized for this job">
            {part}
          </mark>
        );
      }
      return part;
    });
  };

  const renderHighlightedSkills = (skillList) => {
    if (!skillList || !skillList.length) return null;
    const injected = tailoredData?.stats?.keywordsIntegrated || [];

    return skillList.map((skill, idx) => {
      const isInjected = injected.some(k => k.toLowerCase() === skill.toLowerCase());
      return (
        <React.Fragment key={`sk-${idx}`}>
          {idx > 0 && ', '}
          {isInjected ? (
            <mark className="jake-kw-injected" title="Injected target competency">
              {skill}
            </mark>
          ) : (
            <span>{skill}</span>
          )}
        </React.Fragment>
      );
    });
  };

  const activeName = candidateProfile?.name && candidateProfile.name.toLowerCase() !== 'candidate'
    ? candidateProfile.name
    : '';

  return (
    <div className="cv-tailor-container">
      {/* 1. Header Banner */}
      <div className="cv-tailor-banner">
        <div className="tailor-banner-left">
          <div className="tailor-magic-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
          <div>
            <h3 className="tailor-title">ATS Resume Tailor (Jake's LaTeX Format)</h3>
            <p className="tailor-subtitle">
              Dynamically infuse required competencies for <strong>{job.title}</strong> at <strong>{job.company}</strong> into your gold-standard ATS CV.
            </p>
          </div>
        </div>
        <div className="tailor-badge-pill">
          <span>Targeting {job.company}</span>
        </div>
      </div>

      {/* 2. Authentication Gate: Displayed when user is NOT signed in */}
      {!isAuthenticated && (
        <div className="cv-tailor-setup-card cv-tailor-auth-gate">
          <div className="tailor-auth-gate-content">
            <div className="tailor-auth-gate-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <div className="tailor-auth-gate-text">
              <h4>Sign in required to tailor and upload your CV</h4>
              <p>
                Uploading your resume, extracting authentic experience, and infusing job-specific competencies for <strong>{job.company}</strong> requires an active account.
              </p>
            </div>
            <div className="tailor-auth-gate-actions">
              <button
                type="button"
                className="btn-tailor-submit"
                onClick={() => openAuthModal(`Sign in or create an account to upload and tailor your CV for ${job.company}.`, 'login')}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
                <span>Sign In to Tailor CV</span>
              </button>
              <button
                type="button"
                className="btn-tailor-register"
                onClick={() => openAuthModal(`Create a free account to upload and tailor your CV for ${job.company}.`, 'signup')}
              >
                Create Free Account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Source CV Selection: Available ONLY when authenticated */}
      {isAuthenticated && !tailoredData && (
        <div className="cv-tailor-setup-card">
          <div className="setup-header">
            <h4>Select CV Source to Tailor</h4>
            <span className="setup-sub">Use your active profile or upload your current PDF resume directly</span>
          </div>

          <div className="setup-source-options">
            {candidateProfile && (
              <label className={`source-option-box ${sourceType === 'profile' ? 'selected' : ''}`}>
                <div className="option-top-row">
                  <input
                    type="radio"
                    name="cvSource"
                    checked={sourceType === 'profile'}
                    onChange={() => {
                      setSourceType('profile');
                      setSelectedFile(null);
                      setError(null);
                    }}
                  />
                  <div className="option-title">
                    <span className="opt-icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </span>
                    <strong>Active Candidate Profile ({candidateProfile.name || 'Siddharth'})</strong>
                  </div>
                </div>
                <p className="option-detail">
                  Tailor using your stored credentials: <strong>{candidateProfile.headline || 'Software Engineer'}</strong>
                  {candidateProfile.city ? ` • ${candidateProfile.city}` : ''}
                  {candidateProfile.experienceDisplay ? ` • ${candidateProfile.experienceDisplay}` : ''}
                </p>
                {candidateProfile.skills?.length > 0 && (
                  <div className="tailor-profile-skills-preview">
                    {candidateProfile.skills.slice(0, 5).map((sk, idx) => (
                      <span key={`sk-prev-${idx}`} className="setup-skill-tag">{sk}</span>
                    ))}
                    {candidateProfile.skills.length > 5 && (
                      <span className="setup-skill-more">+{candidateProfile.skills.length - 5} more</span>
                    )}
                  </div>
                )}
              </label>
            )}
            <label className={`source-option-box ${sourceType === 'portfolio' ? 'selected' : ''}`}>
              <div className="option-top-row">
                <input
                  type="radio"
                  name="cvSource"
                  checked={sourceType === 'portfolio'}
                  onChange={() => {
                    setSourceType('portfolio');
                    setSelectedFile(null);
                    setError(null);
                  }}
                />
                <div className="option-title">
                  <span className="opt-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="2" y1="12" x2="22" y2="12" />
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                  </span>
                  <strong>Portfolio Website / Profile URL</strong>
                </div>
              </div>
              <p className="option-detail">
                Fill in your portfolio link to extract your authentic projects, skills, and background.
              </p>

              {sourceType === 'portfolio' && (
                <div className="tailor-url-input-wrap" onClick={(e) => e.stopPropagation()}>
                  <div className="tailor-url-box">
                    <span className="url-prefix-icon">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                    </span>
                    <input
                      type="url"
                      className="tailor-url-input"
                      placeholder="e.g. https://myportfolio.com or yourname.dev"
                      value={portfolioUrl}
                      onChange={(e) => {
                        setPortfolioUrl(e.target.value);
                        setError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleTailorCv();
                        }
                      }}
                    />
                    {portfolioUrl && (
                      <button
                        type="button"
                        className="btn-clear-url"
                        onClick={() => setPortfolioUrl('')}
                        title="Clear URL"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  {candidateProfile?.headline ? (
                    <div className="tailor-url-hint">
                      <span>Active Profile: <strong>{candidateProfile.headline}</strong></span>
                      {candidateProfile.skills?.length > 0 && <span> • {candidateProfile.skills.slice(0, 4).join(', ')}</span>}
                    </div>
                  ) : (
                    <span className="tailor-url-subtext">
                      We will scrape and extract your authentic projects, skills, and work history directly from your portfolio site.
                    </span>
                  )}
                </div>
              )}
            </label>

            <label className={`source-option-box ${sourceType === 'pdf' ? 'selected' : ''}`}>
              <div className="option-top-row">
                <input
                  type="radio"
                  name="cvSource"
                  checked={sourceType === 'pdf'}
                  onChange={() => {
                    setSourceType('pdf');
                    setError(null);
                  }}
                />
                <div className="option-title">
                  <span className="opt-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </span>
                  <strong>Upload a PDF CV / Resume (.pdf)</strong>
                </div>
              </div>
              <p className="option-detail">Upload your resume PDF to extract your authentic projects, skills, and experience</p>
            </label>
          </div>

          {/* Upload Dropzone (if upload option selected) */}
          {sourceType === 'pdf' && (
            <div
              className={`tailor-dropzone ${dragOver ? 'dragover' : ''} ${selectedFile ? 'has-file' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => document.getElementById('tailor-file-input')?.click()}
            >
              <input
                id="tailor-file-input"
                type="file"
                accept=".pdf,application/pdf"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              {selectedFile ? (
                <div className="dropzone-file-info">
                  <span className="file-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </span>
                  <div className="file-meta">
                    <strong>{selectedFile.name}</strong>
                    <span>{(selectedFile.size / 1024).toFixed(1)} KB • Click to choose a different PDF</span>
                  </div>
                </div>
              ) : (
                <div className="dropzone-prompt">
                  <span className="upload-arrow">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </span>
                  <p className="prompt-text">
                    <strong>Click to upload</strong> or drag &amp; drop your CV PDF here
                  </p>
                  <span className="prompt-sub">Supports standard PDF resumes up to 10MB</span>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="tailor-error-alert">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Tailor Action Button */}
          <div className="tailor-action-bar">
            <button
              type="button"
              className="btn-tailor-submit"
              disabled={tailoring || (sourceType === 'pdf' && !selectedFile) || (sourceType === 'portfolio' && !portfolioUrl.trim() && !candidateProfile)}
              onClick={handleTailorCv}
            >
              {tailoring ? (
                <>
                  <span className="spinner-small" />
                  <span>
                    {tailoringStep === 1 && (sourceType === 'portfolio' ? 'Fetching & scraping portfolio website...' : 'Scanning target job competencies...')}
                    {tailoringStep === 2 && 'Extracting authentic projects, skills & background...'}
                    {tailoringStep === 3 && `Optimizing competencies for ${job.company}...`}
                    {tailoringStep >= 4 && 'Generating ATS-compliant Overleaf LaTeX CV...'}
                  </span>
                </>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  <span>Tailor My CV for {job.company}</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 3. Tailored Results View */}
      {tailoredData && editableResume && (
        <div className="tailored-results-view">
          {/* ATS Impact Score Card */}
          <div className="ats-impact-card">
            <div className="impact-scores-cluster">
              <div className="score-block original">
                <span className="score-lbl">Original Match</span>
                <span className="score-num">{tailoredData.stats.originalScore}%</span>
              </div>
              <div className="score-arrow">➔</div>
              <div className="score-block tailored">
                <span className="score-lbl">Projected ATS Match</span>
                <span className="score-num">{tailoredData.stats.tailoredScore}%</span>
                <span className="score-boost-tag">{tailoredData.stats.scoreBoost} Boost</span>
              </div>
            </div>

            <div className="impact-keywords-col">
              <span className="keywords-title">ATS Keywords &amp; Competencies Injected:</span>
              <div className="injected-chips-row">
                {tailoredData.stats.keywordsIntegrated?.map((kw, idx) => (
                  <span key={`kw-${idx}`} className="injected-chip">
                    <span className="chip-plus">+</span>
                    <span>{kw}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="tailor-toolbar">
            <div className="toolbar-left">
              <button
                type="button"
                className={`btn-mode-toggle ${!isEditing ? 'active' : ''}`}
                onClick={() => setIsEditing(false)}
              >
                ATS Document View
              </button>
              <button
                type="button"
                className={`btn-mode-toggle ${isEditing ? 'active' : ''}`}
                onClick={() => setIsEditing(true)}
              >
                Edit Content
              </button>

              <label className="toggle-summary-label">
                <input
                  type="checkbox"
                  checked={Boolean(editableResume.includeSummary)}
                  onChange={toggleSummarySection}
                />
                <span>Include Summary</span>
              </label>
            </div>

            <div className="toolbar-right">
              <button
                type="button"
                className="btn-download-pdf"
                onClick={handleDownloadPdf}
                title="Download ATS-compliant 1-page PDF resume"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>Download PDF</span>
              </button>

              <button
                type="button"
                className="btn-download-txt"
                onClick={handleDownloadText}
                title="Download as Plain Text / Markdown"
              >
                <span>Text</span>
              </button>

              <button
                type="button"
                className="btn-copy-resume"
                onClick={handleCopy}
                title="Copy all text to clipboard"
              >
                <span>{copied ? '✓ Copied' : 'Copy'}</span>
              </button>

              <button
                type="button"
                className="btn-reset-tailor"
                onClick={() => {
                  setTailoredData(null);
                  setEditableResume(null);
                }}
                title="Retailor or choose another source"
              >
                <span>Reset</span>
              </button>
            </div>
          </div>

          {/* ATS Resume Paper Sheet (Jake's Resume / Overleaf LaTeX Layout) */}
          <div className="ats-resume-sheet jakes-resume-layout">
            {/* Header: Centered Name & Contact */}
            <header className="jake-header">
              {isEditing ? (
                <div className="jake-header-edit">
                  <input
                    type="text"
                    className="edit-name-input"
                    placeholder="Candidate Full Name (Leave empty if not applicable)"
                    value={editableResume.name || ''}
                    onChange={(e) => setEditableResume(prev => ({ ...prev, name: e.target.value }))}
                  />
                  <div className="edit-contact-grid">
                    <input
                      type="text"
                      className="edit-bullet-input"
                      placeholder="Email (e.g. name@domain.com)"
                      value={editableResume.contact?.email || ''}
                      onChange={(e) => setEditableResume(prev => ({
                        ...prev,
                        contact: { ...prev.contact, email: e.target.value }
                      }))}
                    />
                    <input
                      type="text"
                      className="edit-bullet-input"
                      placeholder="Phone (e.g. +91 9876543210)"
                      value={editableResume.contact?.phone || ''}
                      onChange={(e) => setEditableResume(prev => ({
                        ...prev,
                        contact: { ...prev.contact, phone: e.target.value }
                      }))}
                    />
                    <input
                      type="text"
                      className="edit-bullet-input"
                      placeholder="Location (e.g. Bengaluru, India)"
                      value={editableResume.contact?.location || ''}
                      onChange={(e) => setEditableResume(prev => ({
                        ...prev,
                        contact: { ...prev.contact, location: e.target.value }
                      }))}
                    />
                    <input
                      type="text"
                      className="edit-bullet-input"
                      placeholder="Portfolio (e.g. myportfolio.dev)"
                      value={editableResume.contact?.portfolio || ''}
                      onChange={(e) => setEditableResume(prev => ({
                        ...prev,
                        contact: { ...prev.contact, portfolio: e.target.value }
                      }))}
                    />
                    <input
                      type="text"
                      className="edit-bullet-input"
                      placeholder="GitHub (e.g. github.com/username)"
                      value={editableResume.contact?.github || ''}
                      onChange={(e) => setEditableResume(prev => ({
                        ...prev,
                        contact: { ...prev.contact, github: e.target.value }
                      }))}
                    />
                    <input
                      type="text"
                      className="edit-bullet-input"
                      placeholder="LinkedIn (e.g. linkedin.com/in/username)"
                      value={editableResume.contact?.linkedin || ''}
                      onChange={(e) => setEditableResume(prev => ({
                        ...prev,
                        contact: { ...prev.contact, linkedin: e.target.value }
                      }))}
                    />
                  </div>
                </div>
              ) : (
                <>
                  {editableResume.name && editableResume.name.trim() && (
                    <h1 className="jake-name">{editableResume.name.trim().toUpperCase()}</h1>
                  )}
                  {(() => {
                    const contactItems = [];
                    if (editableResume.contact?.phone) {
                      contactItems.push(<span key="c-phone">{editableResume.contact.phone}</span>);
                    }
                    if (editableResume.contact?.email) {
                      contactItems.push(<span key="c-email">{editableResume.contact.email}</span>);
                    }
                    if (editableResume.contact?.portfolio) {
                      const pClean = editableResume.contact.portfolio.replace(/^https?:\/\/(?:www\.)?/, '').replace(/\/$/, '');
                      const pUrl = editableResume.contact.portfolio.startsWith('http') ? editableResume.contact.portfolio : `https://${editableResume.contact.portfolio}`;
                      contactItems.push(
                        <a key="c-port" href={pUrl} target="_blank" rel="noopener noreferrer">{pClean}</a>
                      );
                    }
                    if (editableResume.contact?.github) {
                      const ghClean = editableResume.contact.github.replace(/^https?:\/\/(?:www\.)?/, '').replace(/\/$/, '');
                      const ghUrl = editableResume.contact.github.startsWith('http') ? editableResume.contact.github : `https://${editableResume.contact.github}`;
                      contactItems.push(
                        <a key="c-gh" href={ghUrl} target="_blank" rel="noopener noreferrer">{ghClean}</a>
                      );
                    }
                    if (editableResume.contact?.linkedin) {
                      const liClean = editableResume.contact.linkedin.replace(/^https?:\/\/(?:www\.)?/, '').replace(/\/$/, '');
                      const liUrl = editableResume.contact.linkedin.startsWith('http') ? editableResume.contact.linkedin : `https://${editableResume.contact.linkedin}`;
                      contactItems.push(
                        <a key="c-li" href={liUrl} target="_blank" rel="noopener noreferrer">{liClean}</a>
                      );
                    }
                    if (editableResume.contact?.location) {
                      contactItems.push(<span key="c-loc">{editableResume.contact.location}</span>);
                    }

                    if (contactItems.length === 0) return null;

                    return (
                      <div className="jake-contact-line">
                        {contactItems.map((item, idx) => (
                          <React.Fragment key={`ci-${idx}`}>
                            {idx > 0 && <span className="jake-sep">|</span>}
                            {item}
                          </React.Fragment>
                        ))}
                      </div>
                    );
                  })()}
                </>
              )}
            </header>

            {/* Optional Summary */}
            {editableResume.includeSummary && (
              <section className="jake-section">
                <h2 className="jake-section-title">Summary</h2>
                <div className="jake-divider" />
                {isEditing ? (
                  <textarea
                    className="edit-textarea"
                    rows={3}
                    value={editableResume.summary}
                    onChange={(e) => handleSummaryChange(e.target.value)}
                  />
                ) : (
                  <p className="jake-summary-text">{renderHighlightedText(editableResume.summary)}</p>
                )}
              </section>
            )}

            {/* 1. Experience */}
            {editableResume.experience?.length > 0 && (
              <section className="jake-section">
                <h2 className="jake-section-title">Experience</h2>
                <div className="jake-divider" />
                <div className="jake-entries-list">
                  {editableResume.experience.map((exp, eIdx) => (
                    <div key={`exp-${eIdx}`} className="jake-entry">
                      <div className="jake-row-between">
                        <span className="jake-title-left">
                          <strong>{exp.role}</strong>
                          {exp.company ? `, ${exp.company}` : ''}
                          {exp.location ? ` – ${exp.location}` : ''}
                        </span>
                        <span className="jake-date-right">{exp.duration}</span>
                      </div>
                      <ul className="jake-bullets-list">
                        {exp.bullets?.map((bullet, bIdx) => (
                          <li key={`eb-${bIdx}`}>
                            {isEditing ? (
                              <input
                                type="text"
                                className="edit-bullet-input"
                                value={bullet}
                                onChange={(e) => handleExpBulletChange(eIdx, bIdx, e.target.value)}
                              />
                            ) : (
                              <span>{renderHighlightedText(bullet)}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 2. Projects */}
            {editableResume.projects?.length > 0 && (
              <section className="jake-section">
                <h2 className="jake-section-title">Projects</h2>
                <div className="jake-divider" />
                <div className="jake-entries-list">
                  {editableResume.projects.map((proj, pIdx) => (
                    <div key={`proj-${pIdx}`} className="jake-entry">
                      <div className="jake-row-between">
                        <span className="jake-title-left">
                          <strong>{proj.name}</strong>
                          {proj.tagline ? ` — ${proj.tagline}` : ''}
                        </span>
                      </div>
                      <ul className="jake-bullets-list">
                        {proj.bullets?.map((pBullet, pbIdx) => (
                          <li key={`pb-${pbIdx}`}>
                            {isEditing ? (
                              <input
                                type="text"
                                className="edit-bullet-input"
                                value={pBullet}
                                onChange={(e) => handleProjBulletChange(pIdx, pbIdx, e.target.value)}
                              />
                            ) : (
                              <span>{renderHighlightedText(pBullet)}</span>
                            )}
                          </li>
                        ))}
                        {proj.techStack && (
                          <li className="jake-tech-stack-bullet">
                            <strong>Tech Stack: </strong>
                            {isEditing ? (
                              <input
                                type="text"
                                className="edit-bullet-input"
                                value={proj.techStack}
                                onChange={(e) => handleProjTechStackChange(pIdx, e.target.value)}
                              />
                            ) : (
                              <span>{renderHighlightedText(proj.techStack)}</span>
                            )}
                          </li>
                        )}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 3. Education */}
            {editableResume.education?.length > 0 && (
              <section className="jake-section">
                <h2 className="jake-section-title">Education</h2>
                <div className="jake-divider" />
                <div className="jake-entries-list">
                  {editableResume.education.map((edu, eduIdx) => (
                    <div key={`edu-${eduIdx}`} className="jake-entry">
                      <div className="jake-row-between">
                        <span className="jake-title-left">
                          <strong>{edu.institution}</strong>
                          {edu.degree ? `, ${edu.degree}` : ''}
                        </span>
                        <span className="jake-date-right">{edu.year}</span>
                      </div>
                      {edu.details && (
                        <ul className="jake-bullets-list">
                          <li>{edu.details}</li>
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 4. Skills */}
            {editableResume.skills && (isEditing || Object.values(editableResume.skills).some(arr => arr && arr.length > 0)) && (
              <section className="jake-section">
                <h2 className="jake-section-title">Skills</h2>
                <div className="jake-divider" />
                <div className="jake-skills-block">
                  {(isEditing || editableResume.skills.languages?.length > 0) && (
                    <div className="jake-skill-line">
                      <strong className="jake-skill-lbl">Languages: </strong>
                      {isEditing ? (
                        <input
                          type="text"
                          className="edit-bullet-input"
                          value={editableResume.skills.languages?.join(', ') || ''}
                          onChange={(e) => handleSkillsChange('languages', e.target.value)}
                        />
                      ) : (
                        <span>{renderHighlightedSkills(editableResume.skills.languages)}</span>
                      )}
                    </div>
                  )}

                  {(isEditing || editableResume.skills.frameworks?.length > 0) && (
                    <div className="jake-skill-line">
                      <strong className="jake-skill-lbl">Frameworks &amp; Libraries: </strong>
                      {isEditing ? (
                        <input
                          type="text"
                          className="edit-bullet-input"
                          value={editableResume.skills.frameworks?.join(', ') || ''}
                          onChange={(e) => handleSkillsChange('frameworks', e.target.value)}
                        />
                      ) : (
                        <span>{renderHighlightedSkills(editableResume.skills.frameworks)}</span>
                      )}
                    </div>
                  )}

                  {(isEditing || editableResume.skills.databases?.length > 0) && (
                    <div className="jake-skill-line">
                      <strong className="jake-skill-lbl">Databases: </strong>
                      {isEditing ? (
                        <input
                          type="text"
                          className="edit-bullet-input"
                          value={editableResume.skills.databases?.join(', ') || ''}
                          onChange={(e) => handleSkillsChange('databases', e.target.value)}
                        />
                      ) : (
                        <span>{renderHighlightedSkills(editableResume.skills.databases)}</span>
                      )}
                    </div>
                  )}

                  {(isEditing || editableResume.skills.tools?.length > 0) && (
                    <div className="jake-skill-line">
                      <strong className="jake-skill-lbl">Tools &amp; Platforms: </strong>
                      {isEditing ? (
                        <input
                          type="text"
                          className="edit-bullet-input"
                          value={editableResume.skills.tools?.join(', ') || ''}
                          onChange={(e) => handleSkillsChange('tools', e.target.value)}
                        />
                      ) : (
                        <span>{renderHighlightedSkills(editableResume.skills.tools)}</span>
                      )}
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* 5. Certifications */}
            {editableResume.certifications?.length > 0 && (
              <section className="jake-section">
                <h2 className="jake-section-title">Certifications</h2>
                <div className="jake-divider" />
                <ul className="jake-bullets-list">
                  {editableResume.certifications.map((cert, cIdx) => (
                    <li key={`cert-${cIdx}`}>
                      {isEditing ? (
                        <input
                          type="text"
                          className="edit-bullet-input"
                          value={cert}
                          onChange={(e) => handleCertificationChange(cIdx, e.target.value)}
                        />
                      ) : (
                        <span>{renderHighlightedText(cert)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* 6. Honors & Achievements */}
            {editableResume.achievements?.length > 0 && (
              <section className="jake-section">
                <h2 className="jake-section-title">Honors &amp; Achievements</h2>
                <div className="jake-divider" />
                <ul className="jake-bullets-list">
                  {editableResume.achievements.map((ach, aIdx) => (
                    <li key={`ach-${aIdx}`}>
                      {isEditing ? (
                        <input
                          type="text"
                          className="edit-bullet-input"
                          value={ach}
                          onChange={(e) => handleAchievementChange(aIdx, e.target.value)}
                        />
                      ) : (
                        <span>{renderHighlightedText(ach)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* 7. Publications & Research */}
            {editableResume.publications?.length > 0 && (
              <section className="jake-section">
                <h2 className="jake-section-title">Publications &amp; Research</h2>
                <div className="jake-divider" />
                <ul className="jake-bullets-list">
                  {editableResume.publications.map((pub, pIdx) => (
                    <li key={`pub-${pIdx}`}>
                      {isEditing ? (
                        <input
                          type="text"
                          className="edit-bullet-input"
                          value={pub}
                          onChange={(e) => handlePublicationChange(pIdx, e.target.value)}
                        />
                      ) : (
                        <span>{renderHighlightedText(pub)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* 8. Leadership & Extracurricular */}
            {editableResume.leadership?.length > 0 && (
              <section className="jake-section">
                <h2 className="jake-section-title">Leadership &amp; Extracurricular</h2>
                <div className="jake-divider" />
                <ul className="jake-bullets-list">
                  {editableResume.leadership.map((lead, lIdx) => (
                    <li key={`lead-${lIdx}`}>
                      {isEditing ? (
                        <input
                          type="text"
                          className="edit-bullet-input"
                          value={lead}
                          onChange={(e) => handleLeadershipChange(lIdx, e.target.value)}
                        />
                      ) : (
                        <span>{renderHighlightedText(lead)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {/* Recruiter / ATS Tip */}
          <div className="tailor-tips-banner">
            <span className="tips-icon">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </span>
            <div className="tips-content">
              <strong>Recruiter Insight:</strong> This CV uses the Jake's LaTeX Resume template, which achieves a 100% parse score across Workday, Greenhouse, Lever, and Taleo. Download the PDF and submit it directly to {job.company}.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
