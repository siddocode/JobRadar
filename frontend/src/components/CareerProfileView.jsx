import React, { useState, useEffect } from 'react';
import {
  User,
  FileText,
  Mail,
  Phone,
  Globe,
  MapPin,
  Briefcase,
  GraduationCap,
  Plus,
  Trash2,
  Check,
  Save,
  Upload,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  FolderGit2,
  ExternalLink,
  Code2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function CareerProfileView({ onOpenUploadModal }) {
  const { user, candidateProfile, updateCandidateProfile, isAuthenticated, openAuthModal } = useAuth();

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
    seniorityLevel: 'Junior',
    education: '',
    skills: [],
    experience: [],
    projects: [],
    educationEntries: []
  });

  const [newSkill, setNewSkill] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Quick-add states for Experience & Projects
  const [showAddExp, setShowAddExp] = useState(false);
  const [newExp, setNewExp] = useState({ role: '', company: '', location: '', duration: '', bulletsText: '' });

  const [showAddProj, setShowAddProj] = useState(false);
  const [newProj, setNewProj] = useState({ name: '', tagline: '', techStack: '', bulletsText: '' });

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
        city: candidateProfile.city || '',
        isIndiaResident: candidateProfile.isIndiaResident !== undefined ? candidateProfile.isIndiaResident : true,
        hasUSWorkAuth: Boolean(candidateProfile.hasUSWorkAuth),
        totalYearsExperience: candidateProfile.totalYearsExperience || 0,
        seniorityLevel: candidateProfile.seniorityLevel || 'Early Career',
        education: candidateProfile.education || '',
        skills: Array.isArray(candidateProfile.skills) ? [...candidateProfile.skills] : [],
        experience: Array.isArray(candidateProfile.experience) ? [...candidateProfile.experience] : [],
        projects: Array.isArray(candidateProfile.projects) ? [...candidateProfile.projects] : [],
        educationEntries: Array.isArray(candidateProfile.educationEntries) ? [...candidateProfile.educationEntries] : []
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

  const handleAddProject = (e) => {
    e.preventDefault();
    if (!newProj.name.trim()) return;
    const bullets = newProj.bulletsText
      .split(/\r?\n/)
      .map(b => b.replace(/^[•\-\*]\s*/, '').trim())
      .filter(Boolean);

    const project = {
      name: newProj.name.trim(),
      tagline: newProj.tagline.trim(),
      techStack: newProj.techStack.trim(),
      bullets
    };

    setFormData(prev => ({
      ...prev,
      projects: [project, ...prev.projects]
    }));
    setNewProj({ name: '', tagline: '', techStack: '', bulletsText: '' });
    setShowAddProj(false);
  };

  const handleRemoveProject = (index) => {
    setFormData(prev => ({
      ...prev,
      projects: prev.projects.filter((_, idx) => idx !== index)
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

  return (
    <div className="profile-container">
      {/* View Header */}
      <div className="view-header">
        <div>
          <h1 className="view-title">Master Career Profile</h1>
          <p className="view-subtitle">
            Your single source of truth for technical competencies, residency, and job eligibility criteria.
          </p>
        </div>
        <div className="view-header-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onOpenUploadModal}
          >
            <Upload size={14} /> Re-Upload CV / Resync URL
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleSaveProfile}
            disabled={isSaving}
          >
            {isSaving ? <RefreshCw size={14} className="spin" /> : <Save size={14} />}
            {saveSuccess ? 'Saved!' : 'Save Master Profile'}
          </button>
        </div>
      </div>

      {/* Profile Form Card */}
      <div className="profile-card">
        {/* Section 1: Core Identity & Links */}
        <div className="profile-section">
          <h2 className="profile-section-title">
            <User size={18} className="text-forest" /> Personal Details & Links
          </h2>
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input
                type="text"
                className="form-input"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Siddharth Sharma"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                className="form-input"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="name@domain.com"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <input
                type="text"
                className="form-input"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+91 98765 43210"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Professional Headline</label>
              <input
                type="text"
                className="form-input"
                value={formData.headline}
                onChange={(e) => setFormData({ ...formData, headline: e.target.value })}
                placeholder="Senior Backend Engineer | Distributed Systems & Node.js"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Portfolio / Personal Website</label>
              <input
                type="text"
                className="form-input"
                value={formData.portfolio}
                onChange={(e) => setFormData({ ...formData, portfolio: e.target.value })}
                placeholder="https://myportfolio.dev"
              />
            </div>
            <div className="form-group">
              <label className="form-label">GitHub Profile URL</label>
              <input
                type="text"
                className="form-input"
                value={formData.github}
                onChange={(e) => setFormData({ ...formData, github: e.target.value })}
                placeholder="https://github.com/username"
              />
            </div>
            <div className="form-group">
              <label className="form-label">LinkedIn Profile URL</label>
              <input
                type="text"
                className="form-input"
                value={formData.linkedin}
                onChange={(e) => setFormData({ ...formData, linkedin: e.target.value })}
                placeholder="https://linkedin.com/in/username"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Residency & Work Authorization */}
        <div className="profile-section">
          <h2 className="profile-section-title">
            <ShieldCheck size={18} className="text-copper" /> Residency & Work Authorization
          </h2>
          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Country of Residence</label>
              <input
                type="text"
                className="form-input"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                placeholder="India"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Current City</label>
              <input
                type="text"
                className="form-input"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                placeholder="Bengaluru, Karnataka"
              />
            </div>
          </div>

          <div className="checkbox-options-grid mt-4">
            <label className="checkbox-card">
              <input
                type="checkbox"
                checked={formData.isIndiaResident}
                onChange={(e) => setFormData({ ...formData, isIndiaResident: e.target.checked })}
              />
              <div>
                <span className="font-semibold block text-forest">Indian Resident & Right to Work</span>
                <span className="text-muted text-xs">Eligible for Indian payroll, EPF, and statutory benefits without visa requirements.</span>
              </div>
            </label>

            <label className="checkbox-card">
              <input
                type="checkbox"
                checked={formData.hasUSWorkAuth}
                onChange={(e) => setFormData({ ...formData, hasUSWorkAuth: e.target.checked })}
              />
              <div>
                <span className="font-semibold block text-forest">US Work Authorization (Citizen, Green Card, or EAD)</span>
                <span className="text-muted text-xs">Enables matching for US-only domestic positions.</span>
              </div>
            </label>
          </div>
        </div>

        {/* Section 3: Experience & Seniority */}
        <div className="profile-section">
          <div className="flex-between mb-3">
            <h2 className="profile-section-title" style={{ margin: 0 }}>
              <Briefcase size={18} className="text-forest" /> Work Experience & Seniority
            </h2>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowAddExp(!showAddExp)}
            >
              <Plus size={14} /> {showAddExp ? 'Cancel' : 'Add Experience Entry'}
            </button>
          </div>

          <div className="form-grid-2 mb-4">
            <div className="form-group">
              <label className="form-label">Total Years of Experience</label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="30"
                className="form-input"
                value={formData.totalYearsExperience}
                onChange={(e) => setFormData({ ...formData, totalYearsExperience: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Seniority Tier</label>
              <select
                className="form-select"
                value={formData.seniorityLevel}
                onChange={(e) => setFormData({ ...formData, seniorityLevel: e.target.value })}
              >
                <option value="Fresher / College Graduate">Fresher / College Graduate (0 - 1 Year)</option>
                <option value="Junior Developer">Junior Developer (1 - 2 Years)</option>
                <option value="Mid-Level Professional">Mid-Level Professional (2 - 5 Years)</option>
                <option value="Senior Professional">Senior Professional (5 - 8 Years)</option>
                <option value="Lead / Principal Engineer">Lead / Principal Engineer (8+ Years)</option>
              </select>
            </div>
          </div>

          {/* New Experience Entry Form */}
          {showAddExp && (
            <div className="p-3 mb-4 rounded border bg-surface" style={{ borderColor: 'var(--border-subtle, #e2e8f0)' }}>
              <h3 className="text-sm font-semibold mb-2">New Experience Entry</h3>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Job Title / Role</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newExp.role}
                    onChange={(e) => setNewExp({ ...newExp, role: e.target.value })}
                    placeholder="Senior Software Engineer"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Company Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newExp.company}
                    onChange={(e) => setNewExp({ ...newExp, company: e.target.value })}
                    placeholder="Acme Technologies"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Duration</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newExp.duration}
                    onChange={(e) => setNewExp({ ...newExp, duration: e.target.value })}
                    placeholder="Jan 2023 – Present"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Location</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newExp.location}
                    onChange={(e) => setNewExp({ ...newExp, location: e.target.value })}
                    placeholder="Bengaluru, India"
                  />
                </div>
              </div>
              <div className="form-group mt-2">
                <label className="form-label">Key Highlights / Bullets (One per line)</label>
                <textarea
                  className="form-input"
                  rows={3}
                  value={newExp.bulletsText}
                  onChange={(e) => setNewExp({ ...newExp, bulletsText: e.target.value })}
                  placeholder="• Architected microservices with Node.js and Redis&#10;• Reduced p95 latency by 35%"
                />
              </div>
              <div className="flex-inline-gap mt-2">
                <button type="button" className="btn btn-primary btn-sm" onClick={handleAddExperience}>
                  <Check size={14} /> Add to Profile
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAddExp(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Existing Experience Entries */}
          <div className="experience-list-container">
            {formData.experience.map((exp, idx) => (
              <div key={idx} className="p-3 mb-2 rounded border" style={{ borderColor: 'var(--border-subtle, #e2e8f0)', background: 'var(--bg-surface-elevated, #fafafa)' }}>
                <div className="flex-between">
                  <div>
                    <strong className="text-forest text-sm">{exp.role || 'Role'}</strong>
                    {exp.company && <span className="text-muted text-sm"> at {exp.company}</span>}
                    {exp.location && <span className="text-muted text-xs"> — {exp.location}</span>}
                  </div>
                  <div className="flex-inline-gap">
                    {exp.duration && <span className="text-xs text-muted font-mono">{exp.duration}</span>}
                    <button
                      type="button"
                      className="btn-icon text-danger"
                      onClick={() => handleRemoveExperience(idx)}
                      title="Remove experience entry"
                      style={{ padding: '2px 6px', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {exp.bullets && exp.bullets.length > 0 && (
                  <ul className="text-xs text-muted mt-2 pl-4" style={{ listStyleType: 'disc', paddingLeft: '1.25rem' }}>
                    {exp.bullets.map((b, bIdx) => (
                      <li key={bIdx} className="mb-1">{b}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {formData.experience.length === 0 && (
              <p className="text-muted text-xs italic">
                No work history entries detected yet. Upload your CV or click "Add Experience Entry" above.
              </p>
            )}
          </div>
        </div>

        {/* Section 4: Projects & Portfolio Work */}
        <div className="profile-section">
          <div className="flex-between mb-3">
            <h2 className="profile-section-title" style={{ margin: 0 }}>
              <FolderGit2 size={18} className="text-forest" /> Featured Projects & Works
            </h2>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowAddProj(!showAddProj)}
            >
              <Plus size={14} /> {showAddProj ? 'Cancel' : 'Add Project'}
            </button>
          </div>

          {showAddProj && (
            <div className="p-3 mb-4 rounded border bg-surface" style={{ borderColor: 'var(--border-subtle, #e2e8f0)' }}>
              <h3 className="text-sm font-semibold mb-2">New Project</h3>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Project Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newProj.name}
                    onChange={(e) => setNewProj({ ...newProj, name: e.target.value })}
                    placeholder="TaskFlow"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Tagline / Short Description</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newProj.tagline}
                    onChange={(e) => setNewProj({ ...newProj, tagline: e.target.value })}
                    placeholder="Real-time Task Manager"
                  />
                </div>
              </div>
              <div className="form-group mt-2">
                <label className="form-label">Tech Stack (comma-separated)</label>
                <input
                  type="text"
                  className="form-input"
                  value={newProj.techStack}
                  onChange={(e) => setNewProj({ ...newProj, techStack: e.target.value })}
                  placeholder="React, Node.js, Socket.io, AWS"
                />
              </div>
              <div className="form-group mt-2">
                <label className="form-label">Key Highlights / Bullets (One per line)</label>
                <textarea
                  className="form-input"
                  rows={2}
                  value={newProj.bulletsText}
                  onChange={(e) => setNewProj({ ...newProj, bulletsText: e.target.value })}
                  placeholder="• Built collaborative task board with live updates&#10;• Containerized via Docker"
                />
              </div>
              <div className="flex-inline-gap mt-2">
                <button type="button" className="btn btn-primary btn-sm" onClick={handleAddProject}>
                  <Check size={14} /> Add Project
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAddProj(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="projects-list-container">
            {formData.projects.map((proj, idx) => (
              <div key={idx} className="p-3 mb-2 rounded border" style={{ borderColor: 'var(--border-subtle, #e2e8f0)', background: 'var(--bg-surface-elevated, #fafafa)' }}>
                <div className="flex-between">
                  <div>
                    <strong className="text-forest text-sm">{proj.name}</strong>
                    {proj.tagline && <span className="text-muted text-sm"> — {proj.tagline}</span>}
                  </div>
                  <button
                    type="button"
                    className="btn-icon text-danger"
                    onClick={() => handleRemoveProject(idx)}
                    title="Remove project"
                    style={{ padding: '2px 6px', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {proj.techStack && (
                  <div className="text-xs font-mono text-muted mt-1">
                    Tech Stack: {proj.techStack}
                  </div>
                )}
                {proj.bullets && proj.bullets.length > 0 && (
                  <ul className="text-xs text-muted mt-2 pl-4" style={{ listStyleType: 'disc', paddingLeft: '1.25rem' }}>
                    {proj.bullets.map((b, bIdx) => (
                      <li key={bIdx} className="mb-1">{b}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {formData.projects.length === 0 && (
              <p className="text-muted text-xs italic">
                No projects added yet. Upload your CV or click "Add Project" to add your notable works.
              </p>
            )}
          </div>
        </div>

        {/* Section 5: Education & Credentials */}
        <div className="profile-section">
          <div className="flex-between mb-3">
            <h2 className="profile-section-title" style={{ margin: 0 }}>
              <GraduationCap size={18} className="text-forest" /> Education & Credentials
            </h2>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowAddEdu(!showAddEdu)}
            >
              <Plus size={14} /> {showAddEdu ? 'Cancel' : 'Add Degree'}
            </button>
          </div>

          <div className="form-group mb-3">
            <label className="form-label">Highest Degree / Summary</label>
            <input
              type="text"
              className="form-input"
              value={formData.education}
              onChange={(e) => setFormData({ ...formData, education: e.target.value })}
              placeholder="B.Tech in Computer Science and Engineering"
            />
          </div>

          {showAddEdu && (
            <div className="p-3 mb-4 rounded border bg-surface" style={{ borderColor: 'var(--border-subtle, #e2e8f0)' }}>
              <h3 className="text-sm font-semibold mb-2">New Education Credential</h3>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Degree / Certificate</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newEdu.degree}
                    onChange={(e) => setNewEdu({ ...newEdu, degree: e.target.value })}
                    placeholder="B.Tech in Computer Science"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Institution / College</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newEdu.institution}
                    onChange={(e) => setNewEdu({ ...newEdu, institution: e.target.value })}
                    placeholder="National Institute of Technology"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Year / Duration</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newEdu.year}
                    onChange={(e) => setNewEdu({ ...newEdu, year: e.target.value })}
                    placeholder="2018 – 2022"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Details / GPA</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newEdu.details}
                    onChange={(e) => setNewEdu({ ...newEdu, details: e.target.value })}
                    placeholder="CGPA: 8.9/10"
                  />
                </div>
              </div>
              <div className="flex-inline-gap mt-2">
                <button type="button" className="btn btn-primary btn-sm" onClick={handleAddEducationEntry}>
                  <Check size={14} /> Add Degree
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAddEdu(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="education-list-container">
            {formData.educationEntries.map((edu, idx) => (
              <div key={idx} className="p-3 mb-2 rounded border" style={{ borderColor: 'var(--border-subtle, #e2e8f0)', background: 'var(--bg-surface-elevated, #fafafa)' }}>
                <div className="flex-between">
                  <div>
                    <strong className="text-forest text-sm">{edu.degree || 'Degree'}</strong>
                    {edu.institution && <span className="text-muted text-sm"> — {edu.institution}</span>}
                  </div>
                  <div className="flex-inline-gap">
                    {edu.year && <span className="text-xs text-muted font-mono">{edu.year}</span>}
                    <button
                      type="button"
                      className="btn-icon text-danger"
                      onClick={() => handleRemoveEducationEntry(idx)}
                      title="Remove education"
                      style={{ padding: '2px 6px', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {edu.details && (
                  <div className="text-xs text-muted mt-1">{edu.details}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Section 6: Verified Skills & Tech Stack */}
        <div className="profile-section">
          <h2 className="profile-section-title">
            <Sparkles size={18} className="text-copper" /> Technical Skills & Competencies
          </h2>
          <p className="text-muted text-xs mb-3">
            Skills are used by the smart matching engine to calculate compatibility without hallucinating unverified claims.
          </p>

          <form onSubmit={handleAddSkill} className="skill-add-form">
            <input
              type="text"
              className="form-input skill-input"
              placeholder="Add skill (e.g. Docker, TypeScript, Kafka, Next.js)..."
              value={newSkill}
              onChange={(e) => setNewSkill(e.target.value)}
            />
            <button type="submit" className="btn btn-secondary btn-sm">
              <Plus size={14} /> Add Skill
            </button>
          </form>

          <div className="skills-tags-wrap">
            {formData.skills.map((skill, index) => (
              <span key={index} className="skill-pill-tag">
                {skill}
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
            {formData.skills.length === 0 && (
              <span className="text-muted text-sm italic">
                No technical skills added yet. Add competencies above or upload your CV to auto-extract.
              </span>
            )}
          </div>
        </div>

        {/* Save Footer Bar */}
        <div className="profile-footer-bar">
          <button
            type="button"
            className="btn btn-primary btn-md"
            onClick={handleSaveProfile}
            disabled={isSaving}
          >
            {isSaving ? <RefreshCw size={15} className="spin" /> : <Save size={15} />}
            {saveSuccess ? 'Profile Saved Successfully!' : 'Save Master Profile'}
          </button>
        </div>
      </div>
    </div>
  );
}


