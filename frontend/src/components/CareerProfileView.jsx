import React, { useState, useEffect } from 'react';
import {
  User,
  Briefcase,
  GraduationCap,
  Plus,
  Trash2,
  Save,
  Upload,
  RefreshCw,
  Sparkles,
  Download,
  Eye,
  Sliders,
  CheckCircle2,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { downloadResumePdf, downloadLatexFile } from '../utils/pdfGenerator';
import './CareerProfileView.css';

const NAV_SECTIONS = [
  { id: 'basic', label: 'Basic Information', icon: User },
  { id: 'experience', label: 'Work & Experience', icon: Briefcase },
  { id: 'skills', label: 'Skills & Tech Stack', icon: Sparkles },
  { id: 'education', label: 'Education', icon: GraduationCap },
  { id: 'preferences', label: 'Preferences', icon: Sliders }
];

export default function CareerProfileView({ onOpenUploadModal }) {
  const { user, candidateProfile, updateCandidateProfile, isAuthenticated, openAuthModal } = useAuth();
  const [activeSection, setActiveSection] = useState('basic');

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    headline: '',
    portfolio: '',
    github: '',
    linkedin: '',
    country: 'India',
    city: 'Bengaluru',
    isIndiaResident: true,
    hasUSWorkAuth: false,
    totalYearsExperience: 0,
    seniorityLevel: 'Mid-Level',
    education: '',
    skills: [],
    experience: [],
    projects: [],
    educationEntries: [],
    targetRoles: ['Backend Engineer', 'Full-Stack Engineer'],
    preferredLocations: ['Bengaluru', 'Remote', 'Hyderabad'],
    minLpa: 15
  });

  const [newSkill, setNewSkill] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Quick-add states for Experience & Education
  const [showAddExp, setShowAddExp] = useState(false);
  const [newExp, setNewExp] = useState({ role: '', company: '', location: '', duration: '', bulletsText: '' });

  const [showAddEdu, setShowAddEdu] = useState(false);
  const [newEdu, setNewEdu] = useState({ institution: '', degree: '', year: '', details: '' });

  useEffect(() => {
    if (candidateProfile) {
      setFormData({
        name: candidateProfile.name || user?.name || '',
        email: candidateProfile.email || user?.email || '',
        phone: candidateProfile.phone || '',
        headline: candidateProfile.headline || '',
        portfolio: candidateProfile.portfolio || (candidateProfile.sourceType === 'url' ? candidateProfile.sourceName : '') || '',
        github: candidateProfile.github || '',
        linkedin: candidateProfile.linkedin || '',
        country: candidateProfile.country || 'India',
        city: candidateProfile.city || 'Bengaluru',
        isIndiaResident: candidateProfile.isIndiaResident !== undefined ? candidateProfile.isIndiaResident : true,
        hasUSWorkAuth: Boolean(candidateProfile.hasUSWorkAuth),
        totalYearsExperience: candidateProfile.totalYearsExperience || 0,
        seniorityLevel: candidateProfile.seniorityLevel || 'Mid-Level',
        education: candidateProfile.education || '',
        skills: Array.isArray(candidateProfile.skills) ? [...candidateProfile.skills] : [],
        experience: Array.isArray(candidateProfile.experience) ? [...candidateProfile.experience] : [],
        projects: Array.isArray(candidateProfile.projects) ? [...candidateProfile.projects] : [],
        educationEntries: Array.isArray(candidateProfile.educationEntries) ? [...candidateProfile.educationEntries] : [],
        targetRoles: Array.isArray(candidateProfile.targetRoles) && candidateProfile.targetRoles.length > 0
          ? candidateProfile.targetRoles
          : ['Backend Engineer', 'Full-Stack Engineer'],
        preferredLocations: Array.isArray(candidateProfile.preferredLocations) && candidateProfile.preferredLocations.length > 0
          ? candidateProfile.preferredLocations
          : ['Bengaluru', 'Remote', 'Hyderabad'],
        minLpa: candidateProfile.minLpa || 15
      });
    } else if (user) {
      setFormData(prev => ({
        ...prev,
        name: user.name || '',
        email: user.email || ''
      }));
    }
  }, [candidateProfile, user]);

  const handleAddSkill = (e) => {
    e.preventDefault();
    if (!newSkill.trim()) return;
    const trimmed = newSkill.trim();
    if (!formData.skills.includes(trimmed)) {
      setFormData(prev => ({ ...prev, skills: [...prev.skills, trimmed] }));
    }
    setNewSkill('');
  };

  const handleRemoveSkill = (skillToRemove) => {
    setFormData(prev => ({
      ...prev,
      skills: prev.skills.filter(s => s !== skillToRemove)
    }));
  };

  const handleAddExperience = (e) => {
    e.preventDefault();
    if (!newExp.role.trim() && !newExp.company.trim()) return;
    const bullets = newExp.bulletsText
      .split(/\r?\n/)
      .map(b => b.replace(/^[•\-\*]\s*/, '').trim())
      .filter(Boolean);

    const entry = {
      role: newExp.role.trim() || 'Software Engineer',
      company: newExp.company.trim(),
      location: newExp.location.trim(),
      duration: newExp.duration.trim(),
      bullets
    };

    setFormData(prev => ({
      ...prev,
      experience: [entry, ...prev.experience]
    }));
    setNewExp({ role: '', company: '', location: '', duration: '', bulletsText: '' });
    setShowAddExp(false);
  };

  const handleRemoveExperience = (index) => {
    setFormData(prev => ({
      ...prev,
      experience: prev.experience.filter((_, idx) => idx !== index)
    }));
  };

  const handleAddEducationEntry = (e) => {
    e.preventDefault();
    if (!newEdu.institution.trim() && !newEdu.degree.trim()) return;
    const entry = {
      institution: newEdu.institution.trim(),
      degree: newEdu.degree.trim(),
      year: newEdu.year.trim(),
      details: newEdu.details.trim()
    };

    setFormData(prev => ({
      ...prev,
      educationEntries: [...prev.educationEntries, entry],
      education: prev.education || entry.degree || entry.institution
    }));
    setNewEdu({ institution: '', degree: '', year: '', details: '' });
    setShowAddEdu(false);
  };

  const handleRemoveEducationEntry = (index) => {
    setFormData(prev => ({
      ...prev,
      educationEntries: prev.educationEntries.filter((_, idx) => idx !== index)
    }));
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const updated = {
        ...(candidateProfile || {}),
        ...formData,
        skillsCount: formData.skills.length,
        updatedAt: new Date().toISOString()
      };
      await updateCandidateProfile(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      console.error('Failed to save profile:', err);
      alert('Failed to save candidate profile: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="auth-gate-box">
        <User size={48} className="text-forest opacity-80" />
        <h2 className="auth-gate-title">Sign in to manage your Master Profile</h2>
        <p className="auth-gate-text">
          Upload your resume once, manage verified skills, and let our deterministic eligibility engine match you with top Indian tech jobs.
        </p>
        <button
          type="button"
          className="btn btn-primary btn-md"
          onClick={() => openAuthModal('Sign in to view career profile', 'login')}
        >
          Sign In / Create Account
        </button>
      </div>
    );
  }

  // Generate resume object for PDF export / LaTeX download
  const resumeObject = {
    name: formData.name || 'Candidate',
    email: formData.email,
    phone: formData.phone,
    headline: formData.headline,
    linkedin: formData.linkedin,
    github: formData.github,
    portfolio: formData.portfolio,
    skills: formData.skills,
    experience: formData.experience,
    educationEntries: formData.educationEntries,
    projects: formData.projects
  };

  return (
    <div className="profile-page-wrap">
      {/* Top Header matching reference: "Master Career Profile" */}
      <div className="view-header">
        <div>
          <h1 className="view-title">Master Career Profile</h1>
          <p className="view-subtitle">
            Maintain your career credentials and preferences for smart matching.
          </p>
        </div>
        <div className="view-header-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onOpenUploadModal}
          >
            <Upload size={14} /> Re-upload CV
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setShowPreviewModal(true)}
          >
            <Eye size={14} /> Preview Resume
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleSaveProfile}
            disabled={isSaving}
          >
            {isSaving ? <RefreshCw size={14} className="spin" /> : <Save size={14} />}
            {saveSuccess ? 'Saved!' : 'Save Profile'}
          </button>
        </div>
      </div>

      {/* 2-Column Layout */}
      <div className="profile-content-layout">
        {/* Left Navigation Panel matching reference */}
        <div className="profile-side-nav">
          {NAV_SECTIONS.map(sec => {
            const Icon = sec.icon;
            const isActive = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                type="button"
                className={`profile-nav-item ${isActive ? 'is-active' : ''}`}
                onClick={() => {
                  setActiveSection(sec.id);
                  const el = document.getElementById(`profile-sec-${sec.id}`);
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                <Icon size={15} />
                <span>{sec.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right Form Surface */}
        <div className="profile-form-surface">
          {/* Section 1: Personal Details & Links */}
          <div className="profile-section-card" id="profile-sec-basic">
            <div className="profile-card-header">
              <span className="profile-card-title">
                <User size={16} className="text-forest" /> Personal Details & Links
              </span>
            </div>

            <div className="profile-form-grid-2">
              <div className="profile-field-group">
                <label className="profile-field-label">Full Name</label>
                <input
                  type="text"
                  className="profile-field-input"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Siddharth Sharma"
                />
              </div>

              <div className="profile-field-group">
                <label className="profile-field-label">Email Address</label>
                <input
                  type="email"
                  className="profile-field-input"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="name@domain.com"
                />
              </div>

              <div className="profile-field-group">
                <label className="profile-field-label">Phone Number</label>
                <input
                  type="text"
                  className="profile-field-input"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+91 98765 43210"
                />
              </div>

              <div className="profile-field-group">
                <label className="profile-field-label">Professional Headline</label>
                <input
                  type="text"
                  className="profile-field-input"
                  value={formData.headline}
                  onChange={(e) => setFormData({ ...formData, headline: e.target.value })}
                  placeholder="e.g. Senior Backend Engineer | Distributed Systems"
                />
              </div>

              <div className="profile-field-group">
                <label className="profile-field-label">Portfolio Website</label>
                <input
                  type="text"
                  className="profile-field-input"
                  value={formData.portfolio}
                  onChange={(e) => setFormData({ ...formData, portfolio: e.target.value })}
                  placeholder="https://yourportfolio.dev"
                />
              </div>

              <div className="profile-field-group">
                <label className="profile-field-label">GitHub Profile URL</label>
                <input
                  type="text"
                  className="profile-field-input"
                  value={formData.github}
                  onChange={(e) => setFormData({ ...formData, github: e.target.value })}
                  placeholder="https://github.com/username"
                />
              </div>

              <div className="profile-field-group" style={{ gridColumn: '1 / -1' }}>
                <label className="profile-field-label">LinkedIn Profile URL</label>
                <input
                  type="text"
                  className="profile-field-input"
                  value={formData.linkedin}
                  onChange={(e) => setFormData({ ...formData, linkedin: e.target.value })}
                  placeholder="https://linkedin.com/in/username"
                />
              </div>
            </div>

            {/* Residency & Work Authorization matching reference */}
            <div style={{ marginTop: '12px', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
              <span className="profile-card-title" style={{ marginBottom: '14px' }}>
                Residency & Work Authorization
              </span>

              <div className="profile-form-grid-2" style={{ marginBottom: '14px' }}>
                <div className="profile-field-group">
                  <label className="profile-field-label">Country of Residence</label>
                  <select
                    className="profile-field-input"
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  >
                    <option value="India">India</option>
                    <option value="United States">United States</option>
                    <option value="United Kingdom">United Kingdom</option>
                    <option value="Singapore">Singapore</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="profile-field-group">
                  <label className="profile-field-label">Current City</label>
                  <input
                    type="text"
                    className="profile-field-input"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    placeholder="e.g. Bengaluru, Kolkata, Pune"
                  />
                </div>
              </div>

              {/* Exact reference checkbox card */}
              <label className="residency-checkbox-card">
                <input
                  type="checkbox"
                  checked={formData.isIndiaResident}
                  onChange={(e) => setFormData({ ...formData, isIndiaResident: e.target.checked })}
                />
                <div className="residency-text-group">
                  <span className="residency-title">Indian Resident & Right to Work</span>
                  <span className="residency-desc">Eligible for Indian payroll, EPF, and statutory benefits.</span>
                </div>
              </label>
            </div>
          </div>

          {/* Section 2: Work & Experience */}
          <div className="profile-section-card" id="profile-sec-experience">
            <div className="profile-card-header">
              <span className="profile-card-title">
                <Briefcase size={16} className="text-forest" /> Work & Experience ({formData.experience.length})
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => setShowAddExp(prev => !prev)}
              >
                <Plus size={12} /> {showAddExp ? 'Cancel' : 'Add Experience'}
              </button>
            </div>

            {showAddExp && (
              <form onSubmit={handleAddExperience} style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'var(--bg-card-subtle)', padding: '14px', borderRadius: '10px' }}>
                <div className="profile-form-grid-2">
                  <input
                    type="text"
                    className="profile-field-input"
                    placeholder="Role Title (e.g. Senior Backend Engineer)"
                    value={newExp.role}
                    onChange={(e) => setNewExp({ ...newExp, role: e.target.value })}
                    required
                  />
                  <input
                    type="text"
                    className="profile-field-input"
                    placeholder="Company Name (e.g. Swiggy)"
                    value={newExp.company}
                    onChange={(e) => setNewExp({ ...newExp, company: e.target.value })}
                    required
                  />
                  <input
                    type="text"
                    className="profile-field-input"
                    placeholder="Location (e.g. Bengaluru / Hybrid)"
                    value={newExp.location}
                    onChange={(e) => setNewExp({ ...newExp, location: e.target.value })}
                  />
                  <input
                    type="text"
                    className="profile-field-input"
                    placeholder="Duration (e.g. 2022 - Present)"
                    value={newExp.duration}
                    onChange={(e) => setNewExp({ ...newExp, duration: e.target.value })}
                  />
                </div>
                <textarea
                  className="notes-textarea"
                  rows={3}
                  placeholder="Key accomplishments or responsibilities (one per line)..."
                  value={newExp.bulletsText}
                  onChange={(e) => setNewExp({ ...newExp, bulletsText: e.target.value })}
                />
                <button type="submit" className="btn btn-primary btn-xs" style={{ alignSelf: 'flex-start' }}>
                  Save Experience Entry
                </button>
              </form>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {formData.experience.map((exp, idx) => (
                <div key={idx} className="experience-entry-box">
                  <div className="experience-entry-header">
                    <div>
                      <div className="experience-entry-role">{exp.role}</div>
                      <div className="experience-entry-company">{exp.company} {exp.location && `• ${exp.location}`}</div>
                      <div className="experience-entry-duration">{exp.duration}</div>
                    </div>
                    <button
                      type="button"
                      className="icon-btn-subtle"
                      onClick={() => handleRemoveExperience(idx)}
                      title="Remove entry"
                    >
                      <Trash2 size={14} className="text-danger" />
                    </button>
                  </div>
                  {exp.bullets && exp.bullets.length > 0 && (
                    <ul className="experience-bullets-list">
                      {exp.bullets.map((b, bIdx) => (
                        <li key={bIdx}>{b}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              {formData.experience.length === 0 && !showAddExp && (
                <p className="text-muted text-xs" style={{ margin: 0 }}>No work experience added yet.</p>
              )}
            </div>
          </div>

          {/* Section 3: Skills & Tech Stack */}
          <div className="profile-section-card" id="profile-sec-skills">
            <div className="profile-card-header">
              <span className="profile-card-title">
                <Sparkles size={16} className="text-forest" /> Skills & Tech Stack ({formData.skills.length})
              </span>
            </div>

            <div className="profile-skills-cluster">
              {formData.skills.map((skill, idx) => (
                <span key={idx} className="profile-skill-chip">
                  {skill}
                  <button
                    type="button"
                    className="profile-skill-remove-btn"
                    onClick={() => handleRemoveSkill(skill)}
                    title={`Remove ${skill}`}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>

            <form onSubmit={handleAddSkill} className="profile-add-skill-form">
              <input
                type="text"
                className="profile-field-input"
                style={{ maxWidth: '280px' }}
                placeholder="Add skill (e.g. Go, Kubernetes, Kafka)"
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
              />
              <button type="submit" className="btn btn-secondary btn-sm">
                <Plus size={13} /> Add Skill
              </button>
            </form>
          </div>

          {/* Section 4: Education */}
          <div className="profile-section-card" id="profile-sec-education">
            <div className="profile-card-header">
              <span className="profile-card-title">
                <GraduationCap size={16} className="text-forest" /> Education ({formData.educationEntries.length})
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => setShowAddEdu(prev => !prev)}
              >
                <Plus size={12} /> {showAddEdu ? 'Cancel' : 'Add Education'}
              </button>
            </div>

            {showAddEdu && (
              <form onSubmit={handleAddEducationEntry} style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'var(--bg-card-subtle)', padding: '14px', borderRadius: '10px' }}>
                <div className="profile-form-grid-2">
                  <input
                    type="text"
                    className="profile-field-input"
                    placeholder="Institution (e.g. IIT Kharagpur, BITS Pilani)"
                    value={newEdu.institution}
                    onChange={(e) => setNewEdu({ ...newEdu, institution: e.target.value })}
                    required
                  />
                  <input
                    type="text"
                    className="profile-field-input"
                    placeholder="Degree / Major (e.g. B.Tech Computer Science)"
                    value={newEdu.degree}
                    onChange={(e) => setNewEdu({ ...newEdu, degree: e.target.value })}
                    required
                  />
                  <input
                    type="text"
                    className="profile-field-input"
                    placeholder="Graduation Year (e.g. 2021)"
                    value={newEdu.year}
                    onChange={(e) => setNewEdu({ ...newEdu, year: e.target.value })}
                  />
                  <input
                    type="text"
                    className="profile-field-input"
                    placeholder="Honors / GPA / Notes (optional)"
                    value={newEdu.details}
                    onChange={(e) => setNewEdu({ ...newEdu, details: e.target.value })}
                  />
                </div>
                <button type="submit" className="btn btn-primary btn-xs" style={{ alignSelf: 'flex-start' }}>
                  Save Education
                </button>
              </form>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {formData.educationEntries.map((edu, idx) => (
                <div key={idx} className="experience-entry-box">
                  <div className="experience-entry-header">
                    <div>
                      <div className="experience-entry-role">{edu.degree}</div>
                      <div className="experience-entry-company">{edu.institution} {edu.year && `• ${edu.year}`}</div>
                      {edu.details && <div className="experience-entry-duration">{edu.details}</div>}
                    </div>
                    <button
                      type="button"
                      className="icon-btn-subtle"
                      onClick={() => handleRemoveEducationEntry(idx)}
                      title="Remove entry"
                    >
                      <Trash2 size={14} className="text-danger" />
                    </button>
                  </div>
                </div>
              ))}
              {formData.educationEntries.length === 0 && !showAddEdu && (
                <p className="text-muted text-xs" style={{ margin: 0 }}>No formal degrees added yet.</p>
              )}
            </div>
          </div>

          {/* Section 5: Preferences */}
          <div className="profile-section-card" id="profile-sec-preferences">
            <div className="profile-card-header">
              <span className="profile-card-title">
                <Sliders size={16} className="text-forest" /> Career Preferences
              </span>
            </div>

            <div className="profile-form-grid-2">
              <div className="profile-field-group">
                <label className="profile-field-label">Seniority Level</label>
                <select
                  className="profile-field-input"
                  value={formData.seniorityLevel}
                  onChange={(e) => setFormData({ ...formData, seniorityLevel: e.target.value })}
                >
                  <option value="Early Career">Early Career (0–2 yrs)</option>
                  <option value="Mid-Level">Mid-Level (2–5 yrs)</option>
                  <option value="Senior">Senior (5–8 yrs)</option>
                  <option value="Staff / Lead">Staff / Lead (8+ yrs)</option>
                </select>
              </div>

              <div className="profile-field-group">
                <label className="profile-field-label">Total Professional Experience</label>
                <input
                  type="number"
                  min="0"
                  max="40"
                  step="0.5"
                  className="profile-field-input"
                  value={formData.totalYearsExperience}
                  onChange={(e) => setFormData({ ...formData, totalYearsExperience: Number(e.target.value) })}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Resume Preview & LaTeX Modal */}
      {showPreviewModal && (
        <div className="resume-preview-overlay" onClick={() => setShowPreviewModal(false)}>
          <div className="resume-preview-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="flex-between">
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  ATS Single-Column Resume Preview
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Standard Jake's Resume / Overleaf LaTeX rendering engine
                </span>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowPreviewModal(false)}
              >
                ×
              </button>
            </div>

            <div style={{ background: '#FFFFFF', color: '#111827', padding: '24px', borderRadius: '8px', border: '1px solid #E5E7EB', fontFamily: 'serif', lineHeight: 1.4 }}>
              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <h2 style={{ margin: '0 0 4px 0', fontSize: '20px', letterSpacing: '0.04em' }}>{resumeObject.name}</h2>
                <div style={{ fontSize: '11px', color: '#4B5563' }}>
                  {[resumeObject.email, resumeObject.phone, resumeObject.portfolio, resumeObject.github].filter(Boolean).join(' | ')}
                </div>
              </div>

              {resumeObject.skills.length > 0 && (
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 'bold', borderBottom: '1px solid #111827', textTransform: 'uppercase', marginBottom: '6px' }}>
                    Technical Skills
                  </div>
                  <div style={{ fontSize: '11.5px' }}>
                    {resumeObject.skills.join(', ')}
                  </div>
                </div>
              )}

              {resumeObject.experience.length > 0 && (
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 'bold', borderBottom: '1px solid #111827', textTransform: 'uppercase', marginBottom: '6px' }}>
                    Experience
                  </div>
                  {resumeObject.experience.map((exp, i) => (
                    <div key={i} style={{ marginBottom: '8px', fontSize: '11.5px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                        <span>{exp.role} — {exp.company}</span>
                        <span>{exp.duration}</span>
                      </div>
                      {exp.bullets && (
                        <ul style={{ margin: '2px 0 0 0', paddingLeft: '16px' }}>
                          {exp.bullets.map((b, bi) => (
                            <li key={bi}>{b}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-between">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowPreviewModal(false)}
              >
                Close
              </button>
              <div className="flex-inline-gap">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => downloadLatexFile(resumeObject, `${resumeObject.name.replace(/\s+/g, '_')}_Resume`)}
                >
                  <Download size={13} /> Overleaf (.tex)
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => downloadResumePdf(resumeObject, `${resumeObject.name.replace(/\s+/g, '_')}_Resume`)}
                >
                  <Download size={13} /> Download PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
