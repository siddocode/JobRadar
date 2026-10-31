import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useModalScrollLock } from '../utils/useModalScrollLock';

export default function PersonalizeModal({ company, onClose, onSaveToNotes }) {
  const { user, authFetch } = useAuth();

  useModalScrollLock(Boolean(company));

  const [role, setRole] = useState('Full Stack / Software Engineer');
  const [tone, setTone] = useState('engineering'); // 'engineering' | 'founder' | 'referral'
  const [customSkill, setCustomSkill] = useState('React, Node.js, TypeScript, Cloud APIs');
  const [candidateName, setCandidateName] = useState(user?.name || '');
  const [copiedType, setCopiedType] = useState(null); // 'subject' | 'body' | 'all'
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const primaryOffice = company?.offices?.[0];
  const cityName = primaryOffice?.cityId?.name || primaryOffice?.locality || 'India';
  const companyName = company?.name || 'Company';
  const emails = company?.contact?.emails || [];
  const primaryEmail = emails[0]?.value || `careers@${company?.domain || (company?.slug ? company.slug + '.com' : 'company.com')}`;

  // Generated Subject & Email Pitch Body based on chosen Tone & Inputs
  const { subject, body } = useMemo(() => {
    if (!company) return { subject: '', body: '' };
    const sender = candidateName.trim() || 'Software Engineer';
    const cleanCompany = companyName.trim();
    const cleanRole = role.trim();
    const skills = customSkill.trim() || 'modern web technologies and scalable systems';

    if (tone === 'engineering') {
      return {
        subject: `Application: ${cleanRole} - ${sender} (Interested in ${cleanCompany})`,
        body: `Hi ${cleanCompany} Engineering & Talent Team,

I've been following ${cleanCompany}'s growth and engineering work${cityName !== 'India' ? ` in ${cityName}` : ''}. I am writing to express my strong interest in joining your team as a ${cleanRole}.

With hands-on experience in ${skills}, I specialize in building reliable, high-performance applications and clean user experiences.

I noticed your team's focus and would love the opportunity to contribute to ${cleanCompany}'s core product initiatives. Even if you do not have an active public vacancy right now, I would value a 10-minute introductory conversation to discuss potential fit.

My resume and projects are available for your review. Looking forward to hearing from you!

Best regards,
${sender}
${user?.email ? user.email : ''}`
      };
    }

    if (tone === 'founder') {
      return {
        subject: `Quick question regarding ${cleanCompany}'s tech roadmap (${sender})`,
        body: `Hi ${cleanCompany} Leadership Team,

I've been closely following ${cleanCompany} and was really impressed by what you are building${cityName !== 'India' ? ` out of ${cityName}` : ''}.

I'm a ${cleanRole} with a strong focus on ${skills}. I thrive in high-ownership environments and enjoy tackling tough engineering challenges, from architecture to execution.

I'd love to learn about what engineering challenges are currently top-of-mind for ${cleanCompany} and explore whether my background could add immediate value to your roadmap.

Would you be open to a brief 10-minute virtual chat sometime this week?

Warm regards,
${sender}
${user?.email ? user.email : ''}`
      };
    }

    // Referral / Informative Chat Tone
    return {
      subject: `Connecting with ${cleanCompany} - ${sender} (${cleanRole})`,
      body: `Hello ${cleanCompany} Team,

I came across ${cleanCompany}'s engineering presence and wanted to reach out directly to learn more about the engineering culture and upcoming tech initiatives.

As a ${cleanRole} passionate about ${skills}, I am actively exploring opportunities where I can make a meaningful impact.

Could we schedule a quick 10-minute informal chat? I'd greatly appreciate your perspective on the team and working at ${cleanCompany}.

Thank you for your time!

Best,
${sender}
${user?.email ? user.email : ''}`
    };
  }, [tone, role, customSkill, candidateName, companyName, cityName, user?.email]);

  const copyText = (text, type) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 1800);
  };

  const mailtoHref = `mailto:${encodeURIComponent(primaryEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  const handleSaveToPipelineNotes = async () => {
    setIsSavingNote(true);
    const noteContent = `Pitch drafted (${tone} tone):\nSubject: ${subject}\n\n${body}`;
    const nextStatus = (company.followUpStatus && company.followUpStatus !== 'none')
      ? company.followUpStatus
      : 'to_contact';
    try {
      if (onSaveToNotes) {
        await onSaveToNotes(company._id, noteContent, nextStatus);
      } else {
        await authFetch(`/api/directory/companies/${company._id}/follow-up`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: noteContent, followUpStatus: nextStatus })
        });
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      console.error('Failed to save pitch to notes:', err);
    } finally {
      setIsSavingNote(false);
    }
  };

  if (!company) return null;

  return (
    <div className="auth-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="personalize-modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Modal Close Button */}
        <button className="auth-modal-close" onClick={onClose} title="Close" aria-label="Close modal">
          ×
        </button>

        {/* Modal Header */}
        <div className="personalize-header">
          <div className="personalize-badge">
            <span>Outreach Personalizer</span>
          </div>
          <h2 className="personalize-title">
            Tailor Your Pitch to {companyName}
          </h2>
          <p className="personalize-subtitle">
            Generate professional cold outreach emails for HR, recruiters, and engineering leads.
          </p>

          <div className="target-company-meta-bar">
            <span className="target-meta-item"><strong>{companyName}</strong></span>
            {cityName && <span className="target-meta-item">{cityName}</span>}
            <span className="target-meta-item">Recipient: <code>{primaryEmail}</code></span>
          </div>
        </div>

        {/* Configuration Row */}
        <div className="personalize-config-grid">
          <div className="config-item">
            <label className="config-label">Tone & Goal:</label>
            <div className="tone-pill-selector">
              <button
                type="button"
                className={`tone-pill-btn ${tone === 'engineering' ? 'active' : ''}`}
                onClick={() => setTone('engineering')}
              >
                Engineering Role
              </button>
              <button
                type="button"
                className={`tone-pill-btn ${tone === 'founder' ? 'active' : ''}`}
                onClick={() => setTone('founder')}
              >
                Executive Pitch
              </button>
              <button
                type="button"
                className={`tone-pill-btn ${tone === 'referral' ? 'active' : ''}`}
                onClick={() => setTone('referral')}
              >
                Informal Inquiry
              </button>
            </div>
          </div>

          <div className="config-form-row">
            <div className="config-col">
              <label className="config-label" htmlFor="pers-candidate-name">Your Full Name:</label>
              <input
                id="pers-candidate-name"
                type="text"
                className="config-input"
                placeholder="e.g. Aditi Sharma"
                value={candidateName}
                onChange={(e) => setCandidateName(e.target.value)}
              />
            </div>

            <div className="config-col">
              <label className="config-label" htmlFor="pers-target-role">Target Role:</label>
              <input
                id="pers-target-role"
                type="text"
                className="config-input"
                placeholder="e.g. Senior Frontend Engineer"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              />
            </div>
          </div>

          <div className="config-item">
            <label className="config-label" htmlFor="pers-skills">Key Skills / Stack Highlights:</label>
            <input
              id="pers-skills"
              type="text"
              className="config-input"
              placeholder="e.g. React, Next.js, Node.js, GraphQL, PostgreSQL"
              value={customSkill}
              onChange={(e) => setCustomSkill(e.target.value)}
            />
          </div>
        </div>

        {/* Live Preview Section */}
        <div className="personalize-preview-box">
          <div className="preview-header">
            <span className="preview-label">Live Email Preview</span>
            <div className="preview-quick-actions">
              <button
                type="button"
                className="preview-mini-btn"
                onClick={() => copyText(subject, 'subject')}
              >
                {copiedType === 'subject' ? 'Copied Subject' : 'Copy Subject'}
              </button>
              <button
                type="button"
                className="preview-mini-btn"
                onClick={() => copyText(body, 'body')}
              >
                {copiedType === 'body' ? 'Copied Body' : 'Copy Body'}
              </button>
            </div>
          </div>

          <div className="email-preview-subject-line">
            <span className="subject-prefix">Subject:</span>
            <span className="subject-text">{subject}</span>
          </div>

          <div className="email-preview-body-container">
            <pre className="email-body-text">{body}</pre>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="personalize-footer">
          <div className="personalize-footer-left">
            <button
              type="button"
              className="save-notes-btn"
              onClick={handleSaveToPipelineNotes}
              disabled={isSavingNote}
            >
              {isSavingNote ? 'Saving...' : (saveSuccess ? '✓ Saved to Outreach Pipeline' : 'Save Pitch to Pipeline')}
            </button>
            <span className="save-notes-hint">
              Saves pitch &amp; tracks company in your Outreach Pipeline (To Contact)
            </span>
          </div>

          <div className="personalize-footer-right">
            <button
              type="button"
              className="copy-all-btn"
              onClick={() => copyText(`${subject}\n\n${body}`, 'all')}
            >
              {copiedType === 'all' ? 'Copied All' : 'Copy All'}
            </button>

            <a
              href={mailtoHref}
              className="open-mail-client-btn"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in Email Client
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
