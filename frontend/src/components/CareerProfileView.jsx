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
  ShieldCheck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function CareerProfileView({ onOpenUploadModal }) {
  const { user, candidateProfile, updateCandidateProfile, isAuthenticated, openAuthModal } = useAuth();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    headline: '',
    country: 'India',
    city: 'Bengaluru',
    isIndiaResident: true,
    hasUSWorkAuth: false,
    totalYearsExperience: 0,
    seniorityLevel: 'Junior',
    education: '',
    skills: []
  });

  const [newSkill, setNewSkill] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (candidateProfile) {
      setFormData({
        name: candidateProfile.name || user?.name || '',
        email: candidateProfile.email || user?.email || '',
        phone: candidateProfile.phone || '',
        headline: candidateProfile.headline || '',
        country: candidateProfile.country || 'India',
        city: candidateProfile.city || '',
        isIndiaResident: candidateProfile.isIndiaResident !== undefined ? candidateProfile.isIndiaResident : true,
        hasUSWorkAuth: Boolean(candidateProfile.hasUSWorkAuth),
        totalYearsExperience: candidateProfile.totalYearsExperience || 0,
        seniorityLevel: candidateProfile.seniorityLevel || 'Early Career',
        education: candidateProfile.education || '',
        skills: Array.isArray(candidateProfile.skills) ? [...candidateProfile.skills] : []
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
        {/* Section 1: Core Identity */}
        <div className="profile-section">
          <h2 className="profile-section-title">
            <User size={18} className="text-forest" /> Personal Details & Headline
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

        {/* Section 3: Experience & Education */}
        <div className="profile-section">
          <h2 className="profile-section-title">
            <Briefcase size={18} className="text-forest" /> Experience & Education
          </h2>
          <div className="form-grid-2">
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

          <div className="form-group mt-3">
            <label className="form-label">Highest Degree / Education Credentials</label>
            <input
              type="text"
              className="form-input"
              value={formData.education}
              onChange={(e) => setFormData({ ...formData, education: e.target.value })}
              placeholder="B.Tech in Computer Science and Engineering"
            />
          </div>
        </div>

        {/* Section 4: Verified Skills & Tech Stack */}
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

