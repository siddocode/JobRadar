import React, { useState, useEffect } from 'react';
import {
  User,
  Briefcase,
  GraduationCap,
  FolderGit2,
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
  AlertCircle,
  Globe,
  Pencil,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { downloadResumePdf, downloadLatexFile } from '../utils/pdfGenerator';
import './CareerProfileView.css';

const NAV_SECTIONS = [
  { id: 'basic', label: 'Basic Information', icon: User },
  { id: 'experience', label: 'Work & Experience', icon: Briefcase },
  { id: 'projects', label: 'Projects', icon: FolderGit2 },
  { id: 'skills', label: 'Skills & Tech Stack', icon: Sparkles },
  { id: 'education', label: 'Education', icon: GraduationCap },
  { id: 'preferences', label: 'Preferences', icon: Sliders }
];

function splitTechTags(techStack) {
  if (!techStack) return [];
  if (Array.isArray(techStack)) return techStack.map(t => String(t).trim()).filter(Boolean);
  return String(techStack).split(/[,;•|]+/).map(t => t.trim()).filter(Boolean);
}

function renderFormattedBullet(bulletText = '') {
  if (!bulletText) return null;
  const match = bulletText.match(/^([A-Za-z0-9][A-Za-z0-9\s&/–—-]{2,60})\s*:\s*(.+)$/);
  if (match) {
    const lead = match[1].trim();
    const rest = match[2].trim();
    return (
      <>
        <strong className="editorial-bullet-lead">{lead}:</strong> {rest}
      </>
    );
  }
  return bulletText;
}

function sanitizeSkills(skills = []) {
  if (!Array.isArray(skills)) return [];
  return skills.filter(s => {
    const t = String(s).trim();
    if (!t || t.length < 2 || t.length > 40) return false;
    if (/^(?:0\s*)?\d+(?:\s*\d+)?$/.test(t)) return false;
    if (/^all\s+(?:languages|frontend|backend|devops|tools)/i.test(t)) return false;
    if (/\b(?:languages|frontend|backend|devops|tools|database)\b/i.test(t) && /\b(?:&|and)\b/i.test(t) && t.length > 20) return false;
    if (/^(?:code|live|demo|view|download|terminal|theme|present|loading|skills?)\b/i.test(t)) return false;
    return true;
  });
}

function sanitizeProjects(projects = []) {
  if (!Array.isArray(projects)) return [];
  return projects.filter(p => {
    const name = String(p.name || '').trim();
    if (!name || name.length < 2) return false;
    if (/^(?:view project|all projects|0\s*\d|code live|view system architecture)$/i.test(name)) return false;
    return true;
  });
}

function healExperiences(expList = []) {
  if (!Array.isArray(expList) || expList.length === 0) return [];

  const isFragmented = expList.some(e =>
    /^(?:leading backend architecture|multi|api integration)\b/i.test(e.company || '') ||
    /^(?:project client delivery|connected client)\b/i.test(e.role || '') ||
    (!e.company && !e.role)
  );

  if (!isFragmented) return expList;

  const healed = [];
  let curr = null;

  for (const exp of expList) {
    const comp = (exp.company || '').trim();
    const role = (exp.role || '').trim();
    const isSpuriousComp = /^(?:leading backend architecture|multi|api integration)\b/i.test(comp) ||
      /^(?:project client delivery|connected client)\b/i.test(role);

    if (!isSpuriousComp && (comp || role)) {
      if (curr) healed.push(curr);
      curr = {
        role: role,
        company: comp,
        location: exp.location || '',
        duration: exp.duration || '',
        summary: exp.summary || '',
        bullets: Array.isArray(exp.bullets) ? [...exp.bullets] : [],
        techStack: exp.techStack || ''
      };
    } else if (curr) {
      if (exp.summary && !curr.summary) curr.summary = exp.summary;
      else if (comp && !comp.toLowerCase().startsWith('multi') && !curr.summary) {
        curr.summary = comp + (role ? ` • ${role}` : '');
      }
      if (Array.isArray(exp.bullets)) {
        for (const b of exp.bullets) {
          if (!curr.bullets.includes(b)) curr.bullets.push(b);
        }
      }
      if (exp.techStack) {
        const existingTech = splitTechTags(curr.techStack);
        const newTech = splitTechTags(exp.techStack);
        curr.techStack = [...new Set([...existingTech, ...newTech])].join(', ');
      }
    }
  }
  if (curr) healed.push(curr);
  return healed.length > 0 ? healed : expList;
}

function mapSeniorityToOption(seniorityStr = '', totalMonths = 0) {
  const s = String(seniorityStr || '').toLowerCase();
  if (s === 'early career' || s === 'mid-level' || s === 'senior' || s === 'staff / lead') {
    return seniorityStr;
  }
  if (/staff|principal|lead|director|7\+|8\+/.test(s) || totalMonths >= 84) return 'Staff / Lead';
  if (/senior|4\s*-\s*7|5\s*-\s*8/.test(s) || totalMonths >= 48) return 'Senior';
  if (/mid|2\s*-\s*4|2\s*-\s*5/.test(s) || totalMonths >= 24) return 'Mid-Level';
  if (/fresher|early|junior|0\s*exp|1\s*-\s*2/.test(s) || totalMonths < 24) return 'Early Career';
  return 'Early Career';
}

function buildExperienceMeta(yearsInput, monthsInput, isFresherFlag) {
  const yrs = Math.max(0, parseInt(yearsInput, 10) || 0);
  const mos = Math.max(0, Math.min(11, parseInt(monthsInput, 10) || 0));
  const totalMos = yrs * 12 + mos;
  const isFresher = isFresherFlag !== undefined ? Boolean(isFresherFlag && totalMos === 0) : totalMos === 0;

  let experienceDisplay = '';
  if (totalMos === 0) {
    experienceDisplay = 'Fresher (0 Exp)';
  } else if (totalMos < 12) {
    experienceDisplay = `${totalMos} Month${totalMos === 1 ? '' : 's'}`;
  } else if (mos === 0) {
    experienceDisplay = `${yrs} Year${yrs === 1 ? '' : 's'}`;
  } else {
    experienceDisplay = `${yrs} Yr${yrs > 1 ? 's' : ''} ${mos} Mos`;
  }

  let seniorityLabel = 'Fresher / Early Career (0 Exp)';
  if (totalMos > 0 && totalMos < 12) {
    seniorityLabel = `Early Career (< 1 Year, ${totalMos} Months)`;
  } else if (totalMos >= 12 && totalMos < 24) {
    seniorityLabel = 'Junior Developer (1 - 2 Years)';
  } else if (totalMos >= 24 && totalMos < 48) {
    seniorityLabel = 'Mid-Level Professional (2 - 4 Years)';
  } else if (totalMos >= 48 && totalMos < 84) {
    seniorityLabel = 'Senior Professional (4 - 7 Years)';
  } else if (totalMos >= 84) {
    seniorityLabel = 'Lead / Principal Engineer (7+ Years)';
  }

  return {
    totalYearsExperience: yrs,
    experienceMonths: mos,
    totalExperienceMonths: totalMos,
    experienceDisplay,
    isFresher,
    seniorityLabel,
    seniorityOption: mapSeniorityToOption(seniorityLabel, totalMos)
  };
}

export default function CareerProfileView({ onOpenUploadModal }) {
  const { user, candidateProfile, updateCandidateProfile, isAuthenticated, openAuthModal, authFetch } = useAuth();
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
    experienceMonths: 0,
    seniorityLevel: 'Early Career',
    education: '',
    skills: [],
    experience: [],
    projects: [],
    educationEntries: [],
    targetRoles: ['Backend Engineer', 'Full-Stack Engineer'],
    preferredLocations: ['Bengaluru', 'Remote', 'Hyderabad'],
    minLpa: 15,
    rawCvText: '',
    sourceType: 'manual',
    sourceName: 'Manual Entry'
  });

  const [importUrl, setImportUrl] = useState('');
  const [isImportingUrl, setIsImportingUrl] = useState(false);
  const [importStatus, setImportStatus] = useState(null); // { type: 'success' | 'error', text: string }

  const [newSkill, setNewSkill] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [hasUnsavedImport, setHasUnsavedImport] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Quick-add & inline-edit states for Experience, Projects & Education
  const [showAddExp, setShowAddExp] = useState(false);
  const [newExp, setNewExp] = useState({ role: '', company: '', location: '', duration: '', summary: '', techStack: '', bulletsText: '' });
  const [editingExpIdx, setEditingExpIdx] = useState(null);
  const [editingExpDraft, setEditingExpDraft] = useState(null);

  const [showAddProj, setShowAddProj] = useState(false);
  const [newProj, setNewProj] = useState({ name: '', tagline: '', summary: '', techStack: '', bulletsText: '' });
  const [editingProjIdx, setEditingProjIdx] = useState(null);
  const [editingProjDraft, setEditingProjDraft] = useState(null);

  const [showAddEdu, setShowAddEdu] = useState(false);
  const [newEdu, setNewEdu] = useState({ institution: '', degree: '', year: '', details: '' });
  const [editingEduIdx, setEditingEduIdx] = useState(null);
  const [editingEduDraft, setEditingEduDraft] = useState(null);

  useEffect(() => {
    if (candidateProfile) {
      const portfolioVal = candidateProfile.portfolio || (candidateProfile.sourceType === 'url' ? candidateProfile.sourceName : '') || '';
      const totalMos = candidateProfile.totalExperienceMonths ??
        ((Number(candidateProfile.totalYearsExperience) || 0) * 12 + (Number(candidateProfile.experienceMonths) || 0));
      const yrs = candidateProfile.totalYearsExperience ?? Math.floor(totalMos / 12);
      const mos = candidateProfile.experienceMonths ?? (totalMos % 12);

      setFormData({
        name: candidateProfile.name || user?.name || '',
        email: candidateProfile.email || user?.email || '',
        phone: candidateProfile.phone || '',
        headline: candidateProfile.headline || '',
        portfolio: portfolioVal,
        github: candidateProfile.github || '',
        linkedin: candidateProfile.linkedin || '',
        country: candidateProfile.country && candidateProfile.country !== 'Unspecified' ? candidateProfile.country : 'India',
        city: candidateProfile.city || 'Bengaluru',
        isIndiaResident: candidateProfile.isIndiaResident !== undefined ? candidateProfile.isIndiaResident : true,
        hasUSWorkAuth: Boolean(candidateProfile.hasUSWorkAuth),
        totalYearsExperience: yrs,
        experienceMonths: mos,
        seniorityLevel: mapSeniorityToOption(candidateProfile.seniorityLevel, totalMos),
        education: candidateProfile.education || '',
        skills: sanitizeSkills(Array.isArray(candidateProfile.skills) ? candidateProfile.skills : []),
        experience: healExperiences(Array.isArray(candidateProfile.experience) ? candidateProfile.experience : []),
        projects: sanitizeProjects(Array.isArray(candidateProfile.projects) ? candidateProfile.projects : []),
        educationEntries: Array.isArray(candidateProfile.educationEntries) ? [...candidateProfile.educationEntries] : [],
        targetRoles: Array.isArray(candidateProfile.targetRoles) && candidateProfile.targetRoles.length > 0
          ? candidateProfile.targetRoles
          : ['Backend Engineer', 'Full-Stack Engineer'],
        preferredLocations: Array.isArray(candidateProfile.preferredLocations) && candidateProfile.preferredLocations.length > 0
          ? candidateProfile.preferredLocations
          : ['Bengaluru', 'Remote', 'Hyderabad'],
        minLpa: candidateProfile.minLpa || 15,
        rawCvText: candidateProfile.rawCvText || '',
        sourceType: candidateProfile.sourceType || 'manual',
        sourceName: candidateProfile.sourceName || 'Manual Entry'
      });
      if (portfolioVal && !importUrl) {
        setImportUrl(portfolioVal);
      }
    } else if (user) {
      setFormData(prev => ({
        ...prev,
        name: user.name || '',
        email: user.email || ''
      }));
    }
  }, [candidateProfile, user]);

  const handleExtractPortfolioUrl = async (customUrl) => {
    const rawTarget = (typeof customUrl === 'string' ? customUrl : importUrl) || formData.portfolio || '';
    const trimmedTarget = rawTarget.trim();
    if (!trimmedTarget) {
      setImportStatus({ type: 'error', text: 'Please enter your site, portfolio, GitHub, or online CV URL first.' });
      return;
    }

    setIsImportingUrl(true);
    setImportStatus(null);

    try {
      const res = await authFetch('/api/jobs/candidate/parse-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portfolioUrl: trimmedTarget, previewOnly: true })
      });
      const data = await res.json();

      if (!res.ok || !data.success || !data.profile) {
        throw new Error(data.error || 'Could not extract details from that website.');
      }

      const p = data.profile;
      const totalMos = p.totalExperienceMonths ?? ((Number(p.totalYearsExperience) || 0) * 12 + (Number(p.experienceMonths) || 0));
      const yrs = p.totalYearsExperience ?? Math.floor(totalMos / 12);
      const mos = p.experienceMonths ?? (totalMos % 12);
      const normalizedUrl = /^https?:\/\//i.test(trimmedTarget) ? trimmedTarget : `https://${trimmedTarget}`;

      const mergedSkills = sanitizeSkills(Array.isArray(p.skills) && p.skills.length > 0
        ? [...new Set(p.skills)]
        : formData.skills);
      const nextCountry = p.country && p.country !== 'Unspecified' ? p.country : formData.country;
      const nextIsIndia = p.country && p.country !== 'Unspecified' ? Boolean(p.isIndiaResident) : formData.isIndiaResident;

      const nextForm = {
        ...formData,
        name: p.name || formData.name || user?.name || '',
        email: p.email || formData.email || user?.email || '',
        phone: p.phone || formData.phone,
        headline: p.headline || formData.headline,
        portfolio: p.portfolio || (!/github\.com|linkedin\.com/i.test(normalizedUrl) ? normalizedUrl : formData.portfolio),
        github: p.github || formData.github,
        linkedin: p.linkedin || formData.linkedin,
        country: nextCountry,
        city: p.city || formData.city,
        isIndiaResident: nextIsIndia,
        hasUSWorkAuth: Boolean(p.hasUSWorkAuth || formData.hasUSWorkAuth),
        totalYearsExperience: yrs,
        experienceMonths: mos,
        seniorityLevel: mapSeniorityToOption(p.seniorityLevel, totalMos),
        education: p.education || formData.education,
        skills: mergedSkills,
        experience: healExperiences(Array.isArray(p.experience) && p.experience.length > 0 ? p.experience : formData.experience),
        projects: sanitizeProjects(Array.isArray(p.projects) && p.projects.length > 0 ? p.projects : formData.projects),
        educationEntries: Array.isArray(p.educationEntries) && p.educationEntries.length > 0 ? p.educationEntries : formData.educationEntries,
        rawCvText: p.rawCvText || formData.rawCvText,
        sourceType: 'url',
        sourceName: trimmedTarget
      };

      setImportUrl(trimmedTarget);
      setEditingExpIdx(null);
      setEditingProjIdx(null);
      setEditingEduIdx(null);
      setFormData(nextForm);

      // Immediately sync the extracted clean profile so refreshing or switching tabs never reverts to stale saved entries
      const expMeta = buildExperienceMeta(nextForm.totalYearsExperience, nextForm.experienceMonths);
      await updateCandidateProfile({
        ...(candidateProfile || {}),
        ...nextForm,
        totalExperienceMonths: expMeta.totalExperienceMonths,
        experienceDisplay: expMeta.experienceDisplay,
        isFresher: expMeta.isFresher,
        seniorityLevel: expMeta.totalExperienceMonths > 0 ? expMeta.seniorityLabel : nextForm.seniorityLevel,
        skillsCount: nextForm.skills.length,
        updatedAt: new Date().toISOString()
      });

      const foundSummary = [
        p.name ? 'Name' : null,
        p.headline ? 'Headline' : null,
        p.skills?.length ? `${p.skills.length} skills` : null,
        p.experience?.length ? `${p.experience.length} experience` : null,
        p.projects?.length ? `${p.projects.length} projects` : null,
        p.educationEntries?.length ? `${p.educationEntries.length} education` : null,
        p.city ? p.city : null
      ].filter(Boolean);

      setHasUnsavedImport(false);
      setImportStatus({
        type: 'success',
        text: foundSummary.length > 0
          ? `Extracted & saved: ${foundSummary.join(' · ')}. Click the edit icon on any card to adjust details.`
          : 'Site scanned and saved. Use the edit icon on any card to fill or adjust details.'
      });
    } catch (err) {
      setImportStatus({
        type: 'error',
        text: err.message || 'Failed to extract info from URL. Ensure the site is public and accessible.'
      });
    } finally {
      setIsImportingUrl(false);
    }
  };

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
      summary: newExp.summary.trim(),
      techStack: newExp.techStack.trim(),
      bullets
    };

    setFormData(prev => ({
      ...prev,
      experience: [entry, ...prev.experience]
    }));
    setNewExp({ role: '', company: '', location: '', duration: '', summary: '', techStack: '', bulletsText: '' });
    setShowAddExp(false);
  };

  const handleStartEditExp = (idx) => {
    const exp = formData.experience[idx];
    if (!exp) return;
    setEditingExpIdx(idx);
    setEditingExpDraft({
      role: exp.role || '',
      company: exp.company || '',
      location: exp.location || '',
      duration: exp.duration || '',
      summary: exp.summary || '',
      techStack: Array.isArray(exp.techStack) ? exp.techStack.join(', ') : (exp.techStack || ''),
      bulletsText: Array.isArray(exp.bullets) ? exp.bullets.join('\n') : ''
    });
  };

  const handleSaveEditExp = (e) => {
    e.preventDefault();
    if (editingExpIdx === null || !editingExpDraft) return;
    const bullets = editingExpDraft.bulletsText
      .split(/\r?\n/)
      .map(b => b.replace(/^[•\-\*]\s*/, '').trim())
      .filter(Boolean);
    const updated = {
      role: editingExpDraft.role.trim(),
      company: editingExpDraft.company.trim(),
      location: editingExpDraft.location.trim(),
      duration: editingExpDraft.duration.trim(),
      summary: editingExpDraft.summary.trim(),
      techStack: editingExpDraft.techStack.trim(),
      bullets
    };
    setFormData(prev => ({
      ...prev,
      experience: prev.experience.map((item, i) => (i === editingExpIdx ? updated : item))
    }));
    setEditingExpIdx(null);
    setEditingExpDraft(null);
  };

  const handleRemoveExperience = (index) => {
    if (editingExpIdx === index) {
      setEditingExpIdx(null);
      setEditingExpDraft(null);
    }
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

    const entry = {
      name: newProj.name.trim(),
      tagline: newProj.tagline.trim(),
      summary: newProj.summary.trim(),
      techStack: newProj.techStack.trim(),
      bullets
    };

    setFormData(prev => ({
      ...prev,
      projects: [entry, ...prev.projects]
    }));
    setNewProj({ name: '', tagline: '', summary: '', techStack: '', bulletsText: '' });
    setShowAddProj(false);
  };

  const handleStartEditProj = (idx) => {
    const proj = formData.projects[idx];
    if (!proj) return;
    setEditingProjIdx(idx);
    setEditingProjDraft({
      name: proj.name || '',
      tagline: proj.tagline || '',
      summary: proj.summary || '',
      techStack: Array.isArray(proj.techStack) ? proj.techStack.join(', ') : (proj.techStack || ''),
      bulletsText: Array.isArray(proj.bullets) ? proj.bullets.join('\n') : ''
    });
  };

  const handleSaveEditProj = (e) => {
    e.preventDefault();
    if (editingProjIdx === null || !editingProjDraft) return;
    const bullets = editingProjDraft.bulletsText
      .split(/\r?\n/)
      .map(b => b.replace(/^[•\-\*]\s*/, '').trim())
      .filter(Boolean);
    const updated = {
      name: editingProjDraft.name.trim(),
      tagline: editingProjDraft.tagline.trim(),
      summary: editingProjDraft.summary.trim(),
      techStack: editingProjDraft.techStack.trim(),
      bullets
    };
    setFormData(prev => ({
      ...prev,
      projects: prev.projects.map((item, i) => (i === editingProjIdx ? updated : item))
    }));
    setEditingProjIdx(null);
    setEditingProjDraft(null);
  };

  const handleRemoveProject = (index) => {
    if (editingProjIdx === index) {
      setEditingProjIdx(null);
      setEditingProjDraft(null);
    }
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

  const handleStartEditEdu = (idx) => {
    const edu = formData.educationEntries[idx];
    if (!edu) return;
    setEditingEduIdx(idx);
    setEditingEduDraft({
      institution: edu.institution || '',
      degree: edu.degree || '',
      year: edu.year || '',
      details: edu.details || ''
    });
  };

  const handleSaveEditEdu = (e) => {
    e.preventDefault();
    if (editingEduIdx === null || !editingEduDraft) return;
    const updated = {
      institution: editingEduDraft.institution.trim(),
      degree: editingEduDraft.degree.trim(),
      year: editingEduDraft.year.trim(),
      details: editingEduDraft.details.trim()
    };
    setFormData(prev => ({
      ...prev,
      educationEntries: prev.educationEntries.map((item, i) => (i === editingEduIdx ? updated : item))
    }));
    setEditingEduIdx(null);
    setEditingEduDraft(null);
  };

  const handleRemoveEducationEntry = (index) => {
    if (editingEduIdx === index) {
      setEditingEduIdx(null);
      setEditingEduDraft(null);
    }
    setFormData(prev => ({
      ...prev,
      educationEntries: prev.educationEntries.filter((_, idx) => idx !== index)
    }));
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const expMeta = buildExperienceMeta(formData.totalYearsExperience, formData.experienceMonths);
      const effectiveSeniority = expMeta.totalExperienceMonths > 0
        ? expMeta.seniorityLabel
        : formData.seniorityLevel;

      const updated = {
        ...(candidateProfile || {}),
        ...formData,
        totalYearsExperience: expMeta.totalYearsExperience,
        experienceMonths: expMeta.experienceMonths,
        totalExperienceMonths: expMeta.totalExperienceMonths,
        experienceDisplay: expMeta.experienceDisplay,
        isFresher: expMeta.isFresher,
        seniorityLevel: effectiveSeniority,
        workAuthNotes: formData.isIndiaResident
          ? `Candidate based in ${formData.city || 'India'}. Eligible for direct employment in India.`
          : `Located in ${formData.country || 'Unspecified'}`,
        skillsCount: formData.skills.length,
        updatedAt: new Date().toISOString()
      };
      await updateCandidateProfile(updated);
      setSaveSuccess(true);
      setHasUnsavedImport(false);
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
          {/* Quick Import from Site / Portfolio URL */}
          <div className="portfolio-import-card" id="profile-sec-import">
            <div className="portfolio-import-head">
              <div>
                <div className="portfolio-import-title">
                  <Globe size={16} className="text-forest" /> Auto-Fill from Site or Portfolio URL
                </div>
                <p className="portfolio-import-sub">
                  Paste your portfolio site, personal website, GitHub profile, or online PDF resume to extract and auto-fill all profile fields.
                </p>
              </div>
            </div>

            <div className="portfolio-import-row">
              <div className="portfolio-import-input-wrap">
                <span className="portfolio-import-icon">
                  <Globe size={15} />
                </span>
                <input
                  type="url"
                  className="portfolio-import-input"
                  placeholder="https://yourportfolio.dev or https://github.com/username"
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleExtractPortfolioUrl();
                    }
                  }}
                />
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => handleExtractPortfolioUrl()}
                disabled={isImportingUrl || !importUrl.trim()}
                style={{ whiteSpace: 'nowrap', height: '40px' }}
              >
                {isImportingUrl ? (
                  <>
                    <RefreshCw size={14} className="spin" /> Extracting Info...
                  </>
                ) : (
                  <>
                    <Sparkles size={14} /> Extract &amp; Auto-Fill
                  </>
                )}
              </button>
            </div>

            {importStatus && (
              <div className={`portfolio-import-status ${importStatus.type === 'success' ? 'is-success' : 'is-error'}`}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {importStatus.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                  <span>{importStatus.text}</span>
                </span>
                {importStatus.type === 'success' && hasUnsavedImport && (
                  <button
                    type="button"
                    className="btn btn-primary btn-xs"
                    onClick={handleSaveProfile}
                    disabled={isSaving}
                  >
                    <Save size={12} /> {isSaving ? 'Saving...' : 'Save Profile Now'}
                  </button>
                )}
              </div>
            )}
          </div>

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
                <div className="inline-input-with-btn">
                  <input
                    type="text"
                    className="profile-field-input"
                    value={formData.portfolio}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormData({ ...formData, portfolio: val });
                      setImportUrl(val);
                    }}
                    placeholder="https://yourportfolio.dev"
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleExtractPortfolioUrl(formData.portfolio)}
                    disabled={isImportingUrl || !formData.portfolio.trim()}
                    title="Extract and auto-fill your profile from this URL"
                    style={{ whiteSpace: 'nowrap', height: '38px' }}
                  >
                    {isImportingUrl ? <RefreshCw size={13} className="spin" /> : <Sparkles size={13} />}
                    Auto-Fill
                  </button>
                </div>
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
                <input
                  type="text"
                  className="profile-field-input"
                  placeholder="Role Overview / Summary (optional)"
                  value={newExp.summary}
                  onChange={(e) => setNewExp({ ...newExp, summary: e.target.value })}
                />
                <input
                  type="text"
                  className="profile-field-input"
                  placeholder="Tech Stack (e.g. Node.js, TypeScript, React, Docker)"
                  value={newExp.techStack}
                  onChange={(e) => setNewExp({ ...newExp, techStack: e.target.value })}
                />
                <textarea
                  className="notes-textarea"
                  rows={3}
                  placeholder="Key responsibilities or accomplishments (one per line)..."
                  value={newExp.bulletsText}
                  onChange={(e) => setNewExp({ ...newExp, bulletsText: e.target.value })}
                />
                <button type="submit" className="btn btn-primary btn-xs" style={{ alignSelf: 'flex-start' }}>
                  Save Experience Entry
                </button>
              </form>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {formData.experience.map((exp, idx) => {
                const techList = splitTechTags(exp.techStack);
                if (editingExpIdx === idx && editingExpDraft) {
                  return (
                    <form key={idx} onSubmit={handleSaveEditExp} className="inline-edit-card-form">
                      <div className="profile-form-grid-2">
                        <div className="profile-field-group">
                          <label className="structured-field-label">Company Name</label>
                          <input
                            type="text"
                            className="profile-field-input"
                            value={editingExpDraft.company}
                            onChange={(e) => setEditingExpDraft({ ...editingExpDraft, company: e.target.value })}
                            placeholder="Company name"
                          />
                        </div>
                        <div className="profile-field-group">
                          <label className="structured-field-label">Position / Role</label>
                          <input
                            type="text"
                            className="profile-field-input"
                            value={editingExpDraft.role}
                            onChange={(e) => setEditingExpDraft({ ...editingExpDraft, role: e.target.value })}
                            placeholder="Role title"
                          />
                        </div>
                        <div className="profile-field-group">
                          <label className="structured-field-label">Work Period</label>
                          <input
                            type="text"
                            className="profile-field-input"
                            value={editingExpDraft.duration}
                            onChange={(e) => setEditingExpDraft({ ...editingExpDraft, duration: e.target.value })}
                            placeholder="e.g. Jan 2026 - Present"
                          />
                        </div>
                        <div className="profile-field-group">
                          <label className="structured-field-label">Location</label>
                          <input
                            type="text"
                            className="profile-field-input"
                            value={editingExpDraft.location}
                            onChange={(e) => setEditingExpDraft({ ...editingExpDraft, location: e.target.value })}
                            placeholder="e.g. Kolkata / Remote"
                          />
                        </div>
                      </div>
                      <div className="profile-field-group">
                        <label className="structured-field-label">Role Overview</label>
                        <input
                          type="text"
                          className="profile-field-input"
                          value={editingExpDraft.summary}
                          onChange={(e) => setEditingExpDraft({ ...editingExpDraft, summary: e.target.value })}
                          placeholder="Brief summary of role scope"
                        />
                      </div>
                      <div className="profile-field-group">
                        <label className="structured-field-label">Responsibilities &amp; Impact (one per line)</label>
                        <textarea
                          className="notes-textarea"
                          rows={4}
                          value={editingExpDraft.bulletsText}
                          onChange={(e) => setEditingExpDraft({ ...editingExpDraft, bulletsText: e.target.value })}
                        />
                      </div>
                      <div className="profile-field-group">
                        <label className="structured-field-label">Tech Worked On (comma-separated)</label>
                        <input
                          type="text"
                          className="profile-field-input"
                          value={editingExpDraft.techStack}
                          onChange={(e) => setEditingExpDraft({ ...editingExpDraft, techStack: e.target.value })}
                          placeholder="Node.js, TypeScript, React, PostgreSQL"
                        />
                      </div>
                      <div className="inline-edit-actions">
                        <button type="submit" className="btn btn-primary btn-xs">Update Entry</button>
                        <button type="button" className="btn btn-secondary btn-xs" onClick={() => { setEditingExpIdx(null); setEditingExpDraft(null); }}>Cancel</button>
                      </div>
                    </form>
                  );
                }

                const isPresentRole = /present|current/i.test(exp.duration || '');
                return (
                  <div key={idx} className="experience-entry-box">
                    <div className="editorial-card-head">
                      <div className="editorial-card-title-group">
                        <div className="editorial-card-title-row">
                          <span className="editorial-card-title">{exp.company || exp.role || 'Company'}</span>
                          {isPresentRole && (
                            <span className="editorial-status-badge">
                              <span className="editorial-status-dot" />
                              Present
                            </span>
                          )}
                        </div>
                        <div className="editorial-card-subtitle">
                          {exp.role || 'Software Engineer'}{exp.location ? ` • ${exp.location}` : ''}
                        </div>
                      </div>
                      <div className="entry-card-actions">
                        {exp.duration && <span className="entry-pill-duration">{exp.duration}</span>}
                        <button
                          type="button"
                          className="icon-btn-subtle"
                          onClick={() => handleStartEditExp(idx)}
                          title="Edit entry"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn-subtle"
                          onClick={() => handleRemoveExperience(idx)}
                          title="Remove entry"
                        >
                          <Trash2 size={14} className="text-danger" />
                        </button>
                      </div>
                    </div>

                    {exp.summary && <p className="entry-summary-text">{exp.summary}</p>}

                    {exp.bullets && exp.bullets.length > 0 && (
                      <>
                        <hr className="editorial-divider" />
                        <ul className="experience-bullets-list">
                          {exp.bullets.map((b, bIdx) => (
                            <li key={bIdx}>{renderFormattedBullet(b)}</li>
                          ))}
                        </ul>
                      </>
                    )}

                    {techList.length > 0 && (
                      <div className="entry-tech-row">
                        {techList.map((tech, tIdx) => (
                          <span key={tIdx} className="entry-tech-pill">{tech}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {formData.experience.length === 0 && !showAddExp && (
                <p className="text-muted text-xs" style={{ margin: 0 }}>No work experience added yet.</p>
              )}
            </div>
          </div>

          {/* Section 3: Projects */}
          <div className="profile-section-card" id="profile-sec-projects">
            <div className="profile-card-header">
              <span className="profile-card-title">
                <FolderGit2 size={16} className="text-forest" /> Projects ({formData.projects.length})
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => setShowAddProj(prev => !prev)}
              >
                <Plus size={12} /> {showAddProj ? 'Cancel' : 'Add Project'}
              </button>
            </div>

            {showAddProj && (
              <form onSubmit={handleAddProject} style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'var(--bg-card-subtle)', padding: '14px', borderRadius: '10px' }}>
                <div className="profile-form-grid-2">
                  <input
                    type="text"
                    className="profile-field-input"
                    placeholder="Project Name (e.g. JobRadar Platform)"
                    value={newProj.name}
                    onChange={(e) => setNewProj({ ...newProj, name: e.target.value })}
                    required
                  />
                  <input
                    type="text"
                    className="profile-field-input"
                    placeholder="Tagline / Category (e.g. Distributed ATS Aggregator)"
                    value={newProj.tagline}
                    onChange={(e) => setNewProj({ ...newProj, tagline: e.target.value })}
                  />
                </div>
                <input
                  type="text"
                  className="profile-field-input"
                  placeholder="Short Overview / Description (optional)"
                  value={newProj.summary}
                  onChange={(e) => setNewProj({ ...newProj, summary: e.target.value })}
                />
                <input
                  type="text"
                  className="profile-field-input"
                  placeholder="Tech Stack (e.g. React, Node.js, MongoDB, Docker)"
                  value={newProj.techStack}
                  onChange={(e) => setNewProj({ ...newProj, techStack: e.target.value })}
                />
                <textarea
                  className="notes-textarea"
                  rows={3}
                  placeholder="Key highlights or outcomes (one per line)..."
                  value={newProj.bulletsText}
                  onChange={(e) => setNewProj({ ...newProj, bulletsText: e.target.value })}
                />
                <button type="submit" className="btn btn-primary btn-xs" style={{ alignSelf: 'flex-start' }}>
                  Save Project
                </button>
              </form>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {formData.projects.map((proj, idx) => {
                const techList = splitTechTags(proj.techStack);
                if (editingProjIdx === idx && editingProjDraft) {
                  return (
                    <form key={idx} onSubmit={handleSaveEditProj} className="inline-edit-card-form">
                      <div className="profile-form-grid-2">
                        <div className="profile-field-group">
                          <label className="structured-field-label">Project Name</label>
                          <input
                            type="text"
                            className="profile-field-input"
                            value={editingProjDraft.name}
                            onChange={(e) => setEditingProjDraft({ ...editingProjDraft, name: e.target.value })}
                            required
                          />
                        </div>
                        <div className="profile-field-group">
                          <label className="structured-field-label">Category / Tagline</label>
                          <input
                            type="text"
                            className="profile-field-input"
                            value={editingProjDraft.tagline}
                            onChange={(e) => setEditingProjDraft({ ...editingProjDraft, tagline: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="profile-field-group">
                        <label className="structured-field-label">Description</label>
                        <textarea
                          className="notes-textarea"
                          rows={2}
                          value={editingProjDraft.summary}
                          onChange={(e) => setEditingProjDraft({ ...editingProjDraft, summary: e.target.value })}
                        />
                      </div>
                      <div className="profile-field-group">
                        <label className="structured-field-label">Architecture &amp; Key Features (one per line)</label>
                        <textarea
                          className="notes-textarea"
                          rows={4}
                          value={editingProjDraft.bulletsText}
                          onChange={(e) => setEditingProjDraft({ ...editingProjDraft, bulletsText: e.target.value })}
                        />
                      </div>
                      <div className="profile-field-group">
                        <label className="structured-field-label">Tech Used (comma-separated)</label>
                        <input
                          type="text"
                          className="profile-field-input"
                          value={editingProjDraft.techStack}
                          onChange={(e) => setEditingProjDraft({ ...editingProjDraft, techStack: e.target.value })}
                        />
                      </div>
                      <div className="inline-edit-actions">
                        <button type="submit" className="btn btn-primary btn-xs">Update Project</button>
                        <button type="button" className="btn btn-secondary btn-xs" onClick={() => { setEditingProjIdx(null); setEditingProjDraft(null); }}>Cancel</button>
                      </div>
                    </form>
                  );
                }

                return (
                  <div key={idx} className="experience-entry-box">
                    <div className="editorial-card-head">
                      <div className="editorial-card-title-row">
                        <span className="editorial-card-title">{proj.name}</span>
                        {proj.tagline && <span className="entry-pill-tagline">{proj.tagline}</span>}
                      </div>
                      <div className="entry-card-actions">
                        <button
                          type="button"
                          className="icon-btn-subtle"
                          onClick={() => handleStartEditProj(idx)}
                          title="Edit project"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn-subtle"
                          onClick={() => handleRemoveProject(idx)}
                          title="Remove project"
                        >
                          <Trash2 size={14} className="text-danger" />
                        </button>
                      </div>
                    </div>

                    {proj.summary && <p className="entry-summary-text">{proj.summary}</p>}

                    {proj.bullets && proj.bullets.length > 0 && (
                      <div className="editorial-inner-panel">
                        <span className="editorial-inner-heading">Key Features &amp; Architecture</span>
                        <ul className="experience-bullets-list" style={{ margin: 0 }}>
                          {proj.bullets.map((b, bIdx) => (
                            <li key={bIdx}>{renderFormattedBullet(b)}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {techList.length > 0 && (
                      <div className="entry-tech-row">
                        {techList.map((tech, tIdx) => (
                          <span key={tIdx} className="entry-tech-pill">{tech}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {formData.projects.length === 0 && !showAddProj && (
                <p className="text-muted text-xs" style={{ margin: 0 }}>No projects added yet. Paste a portfolio URL above or add one manually.</p>
              )}
            </div>
          </div>

          {/* Section 4: Skills & Tech Stack */}
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {formData.educationEntries.map((edu, idx) => {
                if (editingEduIdx === idx && editingEduDraft) {
                  return (
                    <form key={idx} onSubmit={handleSaveEditEdu} className="inline-edit-card-form">
                      <div className="profile-form-grid-2">
                        <div className="profile-field-group">
                          <label className="structured-field-label">Institution</label>
                          <input
                            type="text"
                            className="profile-field-input"
                            value={editingEduDraft.institution}
                            onChange={(e) => setEditingEduDraft({ ...editingEduDraft, institution: e.target.value })}
                            required
                          />
                        </div>
                        <div className="profile-field-group">
                          <label className="structured-field-label">Degree / Program</label>
                          <input
                            type="text"
                            className="profile-field-input"
                            value={editingEduDraft.degree}
                            onChange={(e) => setEditingEduDraft({ ...editingEduDraft, degree: e.target.value })}
                            required
                          />
                        </div>
                        <div className="profile-field-group">
                          <label className="structured-field-label">Year / Period</label>
                          <input
                            type="text"
                            className="profile-field-input"
                            value={editingEduDraft.year}
                            onChange={(e) => setEditingEduDraft({ ...editingEduDraft, year: e.target.value })}
                          />
                        </div>
                        <div className="profile-field-group">
                          <label className="structured-field-label">Honors / GPA / Notes</label>
                          <input
                            type="text"
                            className="profile-field-input"
                            value={editingEduDraft.details}
                            onChange={(e) => setEditingEduDraft({ ...editingEduDraft, details: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="inline-edit-actions">
                        <button type="submit" className="btn btn-primary btn-xs">Update Education</button>
                        <button type="button" className="btn btn-secondary btn-xs" onClick={() => { setEditingEduIdx(null); setEditingEduDraft(null); }}>Cancel</button>
                      </div>
                    </form>
                  );
                }

                return (
                  <div key={idx} className="experience-entry-box">
                    <div className="editorial-card-head">
                      <div className="editorial-card-title-group">
                        <span className="editorial-card-title">{edu.institution || edu.degree || 'Institution'}</span>
                        {edu.institution && edu.degree && (
                          <span className="editorial-card-subtitle">{edu.degree}</span>
                        )}
                        {edu.details && <span className="experience-entry-duration">{edu.details}</span>}
                      </div>
                      <div className="entry-card-actions">
                        {edu.year && <span className="entry-pill-duration">{edu.year}</span>}
                        <button
                          type="button"
                          className="icon-btn-subtle"
                          onClick={() => handleStartEditEdu(idx)}
                          title="Edit education"
                        >
                          <Pencil size={14} />
                        </button>
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
                  </div>
                );
              })}
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
                <label className="profile-field-label">Total Professional Experience (Years / Months)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="number"
                    min="0"
                    max="40"
                    className="profile-field-input"
                    style={{ flex: 1 }}
                    placeholder="Years"
                    value={formData.totalYearsExperience}
                    onChange={(e) => setFormData({ ...formData, totalYearsExperience: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                  />
                  <input
                    type="number"
                    min="0"
                    max="11"
                    className="profile-field-input"
                    style={{ flex: 1 }}
                    placeholder="Months"
                    value={formData.experienceMonths}
                    onChange={(e) => setFormData({ ...formData, experienceMonths: Math.max(0, Math.min(11, parseInt(e.target.value, 10) || 0)) })}
                  />
                </div>
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
                        <span>{[exp.role, exp.company].filter(Boolean).join(' — ')}</span>
                        <span>{exp.duration}</span>
                      </div>
                      {exp.bullets && (
                        <ul style={{ margin: '2px 0 0 0', paddingLeft: '16px' }}>
                          {exp.bullets.map((b, bi) => (
                            <li key={bi}>{b}</li>
                          ))}
                        </ul>
                      )}
                      {exp.techStack && (
                        <div style={{ fontSize: '10.5px', color: '#4B5563', marginTop: '2px' }}>
                          <strong>Stack:</strong> {Array.isArray(exp.techStack) ? exp.techStack.join(', ') : exp.techStack}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {resumeObject.projects.length > 0 && (
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 'bold', borderBottom: '1px solid #111827', textTransform: 'uppercase', marginBottom: '6px' }}>
                    Projects
                  </div>
                  {resumeObject.projects.map((proj, i) => (
                    <div key={i} style={{ marginBottom: '8px', fontSize: '11.5px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                        <span>{proj.name}{proj.tagline ? ` — ${proj.tagline}` : ''}</span>
                        {proj.techStack && <span style={{ fontWeight: 'normal', fontSize: '10.5px', color: '#4B5563' }}>{proj.techStack}</span>}
                      </div>
                      {proj.bullets && proj.bullets.length > 0 && (
                        <ul style={{ margin: '2px 0 0 0', paddingLeft: '16px' }}>
                          {proj.bullets.map((b, bi) => (
                            <li key={bi}>{b}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {resumeObject.educationEntries.length > 0 && (
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 'bold', borderBottom: '1px solid #111827', textTransform: 'uppercase', marginBottom: '6px' }}>
                    Education
                  </div>
                  {resumeObject.educationEntries.map((edu, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', marginBottom: '4px' }}>
                      <span><strong>{edu.degree}</strong>{edu.institution ? ` — ${edu.institution}` : ''}</span>
                      <span>{edu.year}</span>
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
