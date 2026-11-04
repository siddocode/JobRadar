import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useModalScrollLock } from '../utils/useModalScrollLock';

/**
 * CandidateProfileUploadModal
 * Lets users upload their CV in PDF or provide a Portfolio / Personal site URL.
 * Automatically extracts country, years of experience, technical skills, and education,
 * and allows reviewing/editing before saving.
 */
export default function CandidateProfileUploadModal({ isOpen, onClose, onProfileUpdated }) {
  const { token, isAuthenticated, openAuthModal, candidateProfile, updateCandidateProfile, clearCandidateProfile } = useAuth();

  useModalScrollLock(isOpen);

  const [activeTab, setActiveTab] = useState('cv'); // 'cv' | 'url'
  const [selectedFile, setSelectedFile] = useState(null);
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  // Review / Edit state after parsing
  const [parsedData, setParsedData] = useState(candidateProfile || null);
  const [isEditing, setIsEditing] = useState(Boolean(candidateProfile));
  const [newSkillInput, setNewSkillInput] = useState('');

  // Close and prompt auth modal if unauthenticated
  useEffect(() => {
    if (isOpen && !isAuthenticated) {
      onClose();
      openAuthModal('Please sign in or create an account to upload your CV and match your job eligibility.', 'login');
    }
  }, [isOpen, isAuthenticated, onClose, openAuthModal]);

  // Synchronize state when modal opens or candidateProfile changes (including on logout)
  useEffect(() => {
    if (candidateProfile) {
      setParsedData(candidateProfile);
      setIsEditing(true);
    } else {
      setParsedData(null);
      setIsEditing(false);
      setSelectedFile(null);
      setPortfolioUrl('');
      setError(null);
    }
  }, [isOpen, candidateProfile]);

  if (!isOpen) return null;

  // Handle PDF file selection
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
        setError('Please select a valid PDF document (.pdf)');
        return;
      }
      setSelectedFile(file);
      setError(null);
    }
  };

  // Handle Drag & Drop
  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
        setError('Please drop a valid PDF document (.pdf)');
        return;
      }
      setSelectedFile(file);
      setError(null);
    }
  };

  // Upload and parse PDF CV
  const handleUploadCv = async () => {
    if (!isAuthenticated || !token) {
      onClose();
      openAuthModal('Please sign in or create an account to upload your CV.', 'login');
      return;
    }

    if (!selectedFile) {
      setError('Please select a PDF CV to upload');
      return;
    }

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('cv', selectedFile);

    try {
      const res = await fetch('/api/jobs/candidate/parse-cv', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to parse CV PDF');
      }

      setParsedData(data.profile);
      updateCandidateProfile(data.profile);
      if (onProfileUpdated) onProfileUpdated(data.profile);
      setIsEditing(true);
    } catch (err) {
      console.error('CV upload error:', err);
      setError(err.message || 'Error processing your CV. Please check the file and try again.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch and parse Portfolio website URL
  const handleFetchUrl = async () => {
    if (!isAuthenticated || !token) {
      onClose();
      openAuthModal('Please sign in or create an account to parse your portfolio.', 'login');
      return;
    }

    if (!portfolioUrl || !portfolioUrl.trim()) {
      setError('Please enter a valid website URL (e.g. https://myportfolio.com)');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/jobs/candidate/parse-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ portfolioUrl: portfolioUrl.trim() })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch or parse portfolio website');
      }

      setParsedData(data.profile);
      updateCandidateProfile(data.profile);
      if (onProfileUpdated) onProfileUpdated(data.profile);
      setIsEditing(true);
    } catch (err) {
      console.error('Portfolio fetch error:', err);
      setError(err.message || 'Error scraping portfolio. Please ensure the website is public and accessible.');
    } finally {
      setLoading(false);
    }
  };

  // Demo Profile Loaders for 1-click testing
  const handleLoadDemo = (type) => {
    if (!isAuthenticated) {
      onClose();
      openAuthModal('Please sign in or create an account to test candidate profile matching.', 'login');
      return;
    }
    let demo;
    if (type === 'fresher') {
      demo = {
        name: 'Arjun Rao',
        headline: 'Frontend & Fullstack Engineer (Fresher)',
        country: 'India',
        city: 'Bengaluru',
        isIndiaResident: true,
        hasUSWorkAuth: false,
        totalYearsExperience: 0,
        experienceMonths: 0,
        totalExperienceMonths: 0,
        experienceDisplay: 'Fresher (0 Exp)',
        isFresher: true,
        seniorityLevel: 'Fresher / Early Career (0 Exp)',
        skills: ['JavaScript', 'React', 'HTML / CSS', 'Git', 'Node.js', 'Python', 'SQL'],
        education: 'B.Tech in Computer Science (2025)',
        sourceType: 'demo',
        sourceName: 'Demo Fresher Profile'
      };
    } else {
      demo = {
        name: 'Priya Patel',
        headline: 'Senior Full Stack Software Engineer',
        country: 'India',
        city: 'Bengaluru',
        isIndiaResident: true,
        hasUSWorkAuth: false,
        totalYearsExperience: 4,
        experienceMonths: 0,
        totalExperienceMonths: 48,
        experienceDisplay: '4 Years',
        isFresher: false,
        seniorityLevel: 'Mid-Level Professional (2 - 4 Years)',
        skills: ['TypeScript', 'JavaScript', 'React', 'Node.js', 'PostgreSQL', 'Docker', 'AWS', 'REST APIs', 'Git'],
        education: 'B.Tech in Computer Science',
        sourceType: 'demo',
        sourceName: 'Demo 4-Yr Professional Profile'
      };
    }
    setParsedData(demo);
    updateCandidateProfile(demo);
    if (onProfileUpdated) onProfileUpdated(demo);
    setIsEditing(true);
  };

  const updateExperience = (years, months, isFresherExplicit) => {
    const yrs = Math.max(0, parseInt(years, 10) || 0);
    const mos = Math.max(0, Math.min(11, parseInt(months, 10) || 0));
    const totalMos = (yrs * 12) + mos;
    const isF = isFresherExplicit !== undefined ? isFresherExplicit : (totalMos === 0);

    let display = '';
    if (totalMos === 0) {
      display = isF ? 'Fresher (0 Exp)' : '0 Yrs Exp';
    } else if (totalMos < 12) {
      display = `${totalMos} Months`;
    } else if (mos === 0) {
      display = `${yrs} Years`;
    } else {
      display = `${yrs} Yr${yrs > 1 ? 's' : ''} ${mos} Mos`;
    }

    let seniority = '';
    if (isF || totalMos === 0) {
      seniority = 'Fresher / Early Career (0 Exp)';
    } else if (totalMos < 12) {
      seniority = `Early Career (< 1 Year, ${totalMos} Months)`;
    } else if (totalMos < 24) {
      seniority = 'Junior Developer (1 - 2 Years)';
    } else if (totalMos < 48) {
      seniority = 'Mid-Level Professional (2 - 4 Years)';
    } else if (totalMos < 84) {
      seniority = 'Senior Professional (4 - 7 Years)';
    } else {
      seniority = 'Lead / Principal Engineer (7+ Years)';
    }

    setParsedData(prev => ({
      ...prev,
      totalYearsExperience: yrs,
      experienceMonths: mos,
      totalExperienceMonths: totalMos,
      experienceDisplay: display,
      isFresher: isF,
      seniorityLevel: seniority
    }));
  };

  const handleSaveAndConfirm = () => {
    if (parsedData) {
      updateCandidateProfile(parsedData);
      if (onProfileUpdated) onProfileUpdated(parsedData);
    }
    onClose();
  };

  const handleAddSkill = (e) => {
    e.preventDefault();
    if (!newSkillInput.trim()) return;
    const skill = newSkillInput.trim();
    if (!parsedData.skills.includes(skill)) {
      setParsedData({
        ...parsedData,
        skills: [...parsedData.skills, skill]
      });
    }
    setNewSkillInput('');
  };

  const handleRemoveSkill = (skillToRemove) => {
    setParsedData({
      ...parsedData,
      skills: parsedData.skills.filter(s => s !== skillToRemove)
    });
  };

  return (
    <div className="auth-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="candidate-upload-modal-container" onClick={(e) => e.stopPropagation()}>
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
        <div className="candidate-modal-header">
          <div className="candidate-brand-badge">
            <span className="badge-spark-dot"></span>
            <span>Candidate Eligibility Profile</span>
          </div>
          <h2 className="candidate-modal-title">
            {parsedData ? 'Your Candidate Profile & Eligibility Criteria' : 'Upload CV or Portfolio to Match Jobs'}
          </h2>
          <p className="candidate-modal-subtitle">
            Upload your CV in PDF or provide your portfolio URL. We automatically extract your <strong>Country, Experience Level, and Tech Stack</strong> to calculate your eligibility across jobs.
          </p>
        </div>

        {/* Upload Mode Selector (if not editing an existing parsed profile or when user wants to re-upload) */}
        {!isEditing ? (
          <div className="candidate-upload-body">
            {/* Tab Switcher */}
            <div className="candidate-tab-bar">
              <button
                type="button"
                className={`candidate-tab-btn ${activeTab === 'cv' ? 'active' : ''}`}
                onClick={() => { setActiveTab('cv'); setError(null); }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
                <span>Upload CV (PDF)</span>
              </button>

              <button
                type="button"
                className={`candidate-tab-btn ${activeTab === 'url' ? 'active' : ''}`}
                onClick={() => { setActiveTab('url'); setError(null); }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                <span>Portfolio / Personal Website</span>
              </button>
            </div>

            {/* Error Message */}
            {error && (
              <div className="candidate-error-banner">
                <span className="error-icon">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </span>
                <span>{error}</span>
              </div>
            )}

            {/* Tab 1: CV PDF Upload */}
            {activeTab === 'cv' && (
              <div className="candidate-input-panel">
                <div
                  className={`candidate-dropzone ${dragOver ? 'drag-over' : ''} ${selectedFile ? 'has-file' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById('cv-file-input').click()}
                >
                  <input
                    id="cv-file-input"
                    type="file"
                    accept=".pdf,application/pdf"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                  />

                  <div className="dropzone-icon-box">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>

                  {selectedFile ? (
                    <div className="dropzone-file-info">
                      <strong className="dropzone-file-name">{selectedFile.name}</strong>
                      <span className="dropzone-file-size">({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                      <p className="dropzone-hint">Click or drop another file to change</p>
                    </div>
                  ) : (
                    <div className="dropzone-prompt">
                      <p className="dropzone-main-text">
                        <strong>Click to browse</strong> or drag &amp; drop your CV PDF here
                      </p>
                      <p className="dropzone-sub-text">Supports standard PDF resumes (up to 10MB)</p>
                    </div>
                  )}
                </div>

                <div className="candidate-action-row">
                  <button
                    type="button"
                    className="btn-candidate-primary"
                    onClick={handleUploadCv}
                    disabled={!selectedFile || loading}
                  >
                    {loading ? (
                      <>
                        <span className="spinner-sm"></span>
                        <span>Extracting CV &amp; Skills...</span>
                      </>
                    ) : (
                      <>
                        <span>Parse CV &amp; Check Eligibility</span>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="5" y1="12" x2="19" y2="12" />
                          <polyline points="12 5 19 12 12 19" />
                        </svg>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Tab 2: Portfolio URL */}
            {activeTab === 'url' && (
              <div className="candidate-input-panel">
                <div className="url-input-group">
                  <label htmlFor="portfolio-url-input" className="url-input-label">
                    Your Portfolio, Personal Site, or GitHub Page
                  </label>
                  <div className="url-field-wrap">
                    <span className="url-field-icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="2" y1="12" x2="22" y2="12" />
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                      </svg>
                    </span>
                    <input
                      id="portfolio-url-input"
                      type="url"
                      className="url-text-input"
                      placeholder="https://myportfolio.com or https://github.com/username"
                      value={portfolioUrl}
                      onChange={(e) => setPortfolioUrl(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleFetchUrl(); }}
                    />
                  </div>
                  <span className="url-help-text">
                    We will fetch and analyze your projects, tech stack, and experience directly from your website.
                  </span>
                </div>

                <div className="candidate-action-row">
                  <button
                    type="button"
                    className="btn-candidate-primary"
                    onClick={handleFetchUrl}
                    disabled={!portfolioUrl.trim() || loading}
                  >
                    {loading ? (
                      <>
                        <span className="spinner-sm"></span>
                        <span>Scraping &amp; Analyzing Site...</span>
                      </>
                    ) : (
                      <>
                        <span>Fetch &amp; Check Eligibility</span>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="5" y1="12" x2="19" y2="12" />
                          <polyline points="12 5 19 12 12 19" />
                        </svg>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Demo 1-Click Tester */}
            <div className="candidate-demo-box">
              <span className="demo-box-label">Quick Test without uploading:</span>
              <div className="demo-btn-group">
                <button
                  type="button"
                  className="btn-demo-pill"
                  onClick={() => handleLoadDemo('fresher')}
                >
                  Demo Fresher (0-1 Yrs, India)
                </button>
                <button
                  type="button"
                  className="btn-demo-pill"
                  onClick={() => handleLoadDemo('mid')}
                >
                  Demo 4-Yr Engineer (India)
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Profile Review & Edit Form */
          <div className="candidate-review-body">
            <div className="review-banner-success">
              <div className="review-banner-icon">✓</div>
              <div className="review-banner-text">
                <strong>Profile Successfully Analyzed!</strong>
                <span>Review and refine your profile below. These details will be evaluated against all job criteria.</span>
              </div>
              <button
                type="button"
                className="btn-reupload-link"
                onClick={() => setIsEditing(false)}
              >
                Re-upload CV / Change URL
              </button>
            </div>

            <div className="review-form-grid">
              {/* Name & Headline */}
              <div className="review-field-group">
                <label className="review-label">Candidate Name</label>
                <input
                  type="text"
                  className="review-input"
                  value={parsedData.name || ''}
                  onChange={(e) => setParsedData({ ...parsedData, name: e.target.value })}
                  placeholder="Full Name"
                />
              </div>

              <div className="review-field-group">
                <label className="review-label">Professional Headline</label>
                <input
                  type="text"
                  className="review-input"
                  value={parsedData.headline || ''}
                  onChange={(e) => setParsedData({ ...parsedData, headline: e.target.value })}
                  placeholder="e.g., Software Engineer, Full Stack Developer"
                />
              </div>

              {/* Country & Work Auth (Most Important) */}
              <div className="review-field-group">
                <label className="review-label">
                  Country of Residence <span className="highlight-tag">Crucial for Eligibility</span>
                </label>
                <select
                  className="review-select"
                  value={parsedData.country || 'Unspecified'}
                  onChange={(e) => {
                    const c = e.target.value;
                    setParsedData({
                      ...parsedData,
                      country: c,
                      isIndiaResident: c.toLowerCase() === 'india'
                    });
                  }}
                >
                  <option value="Unspecified">Not detected — select your country</option>
                  <option value="India">India (Eligible for Direct India Openings)</option>
                  <option value="United States">United States (Holds US Work Auth)</option>
                  <option value="United Kingdom">United Kingdom</option>
                  <option value="Canada">Canada</option>
                  <option value="Germany">Germany</option>
                  <option value="Singapore">Singapore</option>
                  <option value="Australia">Australia</option>
                  <option value="UAE / Dubai">UAE / Dubai</option>
                  <option value="Other">Other / International</option>
                </select>
              </div>

              {/* City / Base */}
              <div className="review-field-group">
                <label className="review-label">City / Region</label>
                <input
                  type="text"
                  className="review-input"
                  value={parsedData.city || ''}
                  onChange={(e) => setParsedData({ ...parsedData, city: e.target.value })}
                  placeholder="e.g. Bengaluru, Hyderabad, Noida, Pune"
                />
              </div>

              {/* Experience: Years & Months & Fresher */}
              <div className="review-field-group">
                <label className="review-label">
                  Total Experience <span className="highlight-tag">Crucial for Seniority</span>
                </label>
                <div className="exp-dual-input-row">
                  <div className="exp-subfield">
                    <label className="exp-sublabel">Years</label>
                    <input
                      type="number"
                      min="0"
                      max="30"
                      step="1"
                      className="review-input exp-number-input"
                      value={parsedData.totalYearsExperience ?? 0}
                      onChange={(e) => {
                        const yrs = parseInt(e.target.value, 10) || 0;
                        updateExperience(yrs, parsedData.experienceMonths ?? 0);
                      }}
                    />
                  </div>

                  <div className="exp-subfield">
                    <label className="exp-sublabel">Months</label>
                    <input
                      type="number"
                      min="0"
                      max="11"
                      step="1"
                      className="review-input exp-number-input"
                      value={parsedData.experienceMonths ?? 0}
                      onChange={(e) => {
                        const mos = parseInt(e.target.value, 10) || 0;
                        updateExperience(parsedData.totalYearsExperience ?? 0, mos);
                      }}
                    />
                  </div>

                  <div className="exp-preview-badge">
                    <span className="preview-exp-tag">
                      {parsedData.experienceDisplay ||
                        (parsedData.totalExperienceMonths
                          ? `${parsedData.totalExperienceMonths} Months`
                          : (parsedData.isFresher ? 'Fresher (0 Exp)' : `${parsedData.totalYearsExperience || 0} Yrs`))}
                    </span>
                  </div>

                  <label className="fresher-checkbox-label">
                    <input
                      type="checkbox"
                      checked={Boolean(parsedData.isFresher)}
                      onChange={(e) => {
                        const isF = e.target.checked;
                        if (isF) {
                          updateExperience(0, 0, true);
                        } else {
                          updateExperience(parsedData.totalYearsExperience || 0, parsedData.experienceMonths || 8, false);
                        }
                      }}
                    />
                    <span>Fresher / College Grad (0 Exp)</span>
                  </label>
                </div>
              </div>

              {/* Education */}
              <div className="review-field-group">
                <label className="review-label">Degree &amp; Education</label>
                <input
                  type="text"
                  className="review-input"
                  value={parsedData.education || ''}
                  onChange={(e) => setParsedData({ ...parsedData, education: e.target.value })}
                  placeholder="e.g., B.Tech in Computer Science"
                />
              </div>
            </div>

            {/* Technical Skills Section */}
            <div className="review-skills-box">
              <label className="review-label">
                Identified Technical Skills &amp; Tech Stack ({parsedData.skills?.length || 0})
              </label>

              <div className="review-skills-chips">
                {parsedData.skills?.map((skill, idx) => (
                  <span key={`sk-${idx}`} className="candidate-skill-pill">
                    <span>{skill}</span>
                    <button
                      type="button"
                      className="skill-remove-btn"
                      onClick={() => handleRemoveSkill(skill)}
                      title={`Remove ${skill}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>

              {/* Add custom skill */}
              <form onSubmit={handleAddSkill} className="add-skill-form">
                <input
                  type="text"
                  className="add-skill-input"
                  placeholder="+ Add technology (e.g. Next.js, Redis, Docker)"
                  value={newSkillInput}
                  onChange={(e) => setNewSkillInput(e.target.value)}
                />
                <button type="submit" className="btn-add-skill">Add</button>
              </form>
            </div>

            {/* Confirm Actions */}
            <div className="review-footer-actions">
              {candidateProfile && (
                <button
                  type="button"
                  className="btn-clear-profile"
                  onClick={() => {
                    clearCandidateProfile();
                    setParsedData(null);
                    setIsEditing(false);
                  }}
                >
                  Clear Profile
                </button>
              )}

              <button
                type="button"
                className="btn-save-confirm"
                onClick={handleSaveAndConfirm}
              >
                ✓ Save &amp; Check Eligibility Against Jobs
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
