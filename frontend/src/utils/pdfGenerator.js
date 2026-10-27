import { jsPDF } from 'jspdf';

/**
 * ATS Gold-Standard PDF Resume Generator (Jake's Resume / Overleaf LaTeX Template)
 * - Single column, ATS-guaranteed sequential reading.
 * - Serif typography (Times New Roman style) with full-width horizontal section dividers.
 * - Fits cleanly on 1 single page.
 */
export function downloadResumePdf(tailoredResume, filename) {
  if (!tailoredResume) return;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter' // Standard Letter 612 x 792 pt
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 612 pt
  const pageHeight = doc.internal.pageSize.getHeight(); // 792 pt
  const margin = 28.8; // Exact LaTeX margin from sid.pdf (0.4 in)
  const contentWidth = pageWidth - (margin * 2); // 554.4 pt
  let y = 36;

  const { name, contact, summary, includeSummary, experience, projects, education, skills } = tailoredResume;

  // 1. NAME (Centered, Times Bold, 20pt)
  const hasName = Boolean(name && name.trim());
  if (hasName) {
    doc.setFont('times', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(0, 0, 0);
    doc.text(name.trim().toUpperCase(), pageWidth / 2, y, { align: 'center' });
    y += 18;
  }

  // 2. CONTACT ROW (Centered, Times Normal, 9.5pt)
  const contactList = [];
  if (contact?.phone) contactList.push(contact.phone);
  if (contact?.email) contactList.push(contact.email);
  if (contact?.portfolio) {
    const p = contact.portfolio.replace(/^https?:\/\/(?:www\.)?/, '').replace(/\/$/, '');
    if (p) contactList.push(p);
  }
  if (contact?.github) {
    const gh = contact.github.replace(/^https?:\/\/(?:www\.)?/, '').replace(/\/$/, '');
    if (gh) contactList.push(gh);
  }
  if (contact?.linkedin) {
    const li = contact.linkedin.replace(/^https?:\/\/(?:www\.)?/, '').replace(/\/$/, '');
    if (li) contactList.push(li);
  }
  if (contact?.location) contactList.push(contact.location);

  if (contactList.length > 0) {
    doc.setFont('times', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 30, 30);
    const contactLine = contactList.join('   |   ');
    doc.text(contactLine, pageWidth / 2, y, { align: 'center' });
    y += 8;
  }

  // SECTION DIVIDER HELPER
  let isFirstSection = true;
  function drawSection(title) {
    if (isFirstSection) {
      y += (hasName || contactList.length > 0 ? 12 : 0);
      isFirstSection = false;
    } else {
      y += (includeSummary ? 18 : 22); // LaTeX spacing before section title
    }
    doc.setFont('times', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(0, 0, 0);
    doc.text(title, margin, y);
    
    // Draw horizontal rule 3.5pt below text baseline
    const lineY = y + 3.5;
    doc.setLineWidth(0.65);
    doc.setDrawColor(0, 0, 0);
    doc.line(margin, lineY, pageWidth - margin, lineY);
    
    // Advance cleanly past the rule before content
    y = lineY + 13;
  }

  // OPTIONAL PROFESSIONAL SUMMARY
  if (includeSummary && summary) {
    drawSection('Summary');
    doc.setFont('times', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 30, 30);
    const sumLines = doc.splitTextToSize(summary, contentWidth);
    doc.text(sumLines, margin, y);
    y += (sumLines.length * 13) + 4;
  }

  // 3. EXPERIENCE SECTION
  if (experience && experience.length > 0) {
    drawSection('Experience');
    for (let i = 0; i < experience.length; i++) {
      const exp = experience[i];
      if (i > 0) y += 12;

      doc.setFont('times', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      const roleStr = exp.role || 'Intern';
      doc.text(roleStr, margin, y);
      const roleWidth = doc.getTextWidth(roleStr);

      const compStr = exp.company ? `, ${exp.company}` : '';
      const locStr = exp.location ? ` – ${exp.location}` : '';
      doc.setFont('times', 'normal');
      doc.text(compStr + locStr, margin + roleWidth, y);

      if (exp.duration) {
        doc.text(exp.duration, pageWidth - margin, y, { align: 'right' });
      }
      y += 14;

      if (exp.bullets && exp.bullets.length > 0) {
        for (const b of exp.bullets) {
          doc.setFont('times', 'normal');
          doc.setFontSize(9.5);
          doc.text('•', margin + 6, y);
          const lines = doc.splitTextToSize(b, contentWidth - 18);
          doc.text(lines, margin + 16, y);
          y += (lines.length * 13.2) + 1.2;
        }
      }
    }
  }

  // 4. PROJECTS SECTION
  if (projects && projects.length > 0) {
    drawSection('Projects');
    for (let i = 0; i < projects.length; i++) {
      const p = projects[i];
      if (i > 0) y += 14; // Breathing room between projects

      doc.setFont('times', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text(p.name, margin, y);
      // Measure name width while font is still bold
      const nameWidth = doc.getTextWidth(p.name);

      if (p.tagline) {
        doc.setFont('times', 'normal');
        doc.text(' — ' + p.tagline, margin + nameWidth, y);
      }
      y += 14;

      if (p.bullets && p.bullets.length > 0) {
        for (const pb of p.bullets) {
          doc.setFont('times', 'normal');
          doc.setFontSize(9.5);
          doc.text('•', margin + 6, y);
          const lines = doc.splitTextToSize(pb, contentWidth - 18);
          doc.text(lines, margin + 16, y);
          y += (lines.length * 13.2) + 1.2;
        }
      }

      if (p.techStack) {
        doc.setFont('times', 'bold');
        doc.setFontSize(9.5);
        const prefix = '• Tech Stack: ';
        doc.text(prefix, margin + 6, y);
        const pw = doc.getTextWidth(prefix);
        doc.setFont('times', 'normal');
        const tLines = doc.splitTextToSize(p.techStack, contentWidth - 18 - pw);
        doc.text(tLines, margin + 6 + pw, y);
        y += (tLines.length * 13.2) + 1.5;
      }
    }
  }

  // 5. EDUCATION SECTION
  if (education && education.length > 0) {
    drawSection('Education');
    for (let i = 0; i < education.length; i++) {
      const edu = education[i];
      if (i > 0) y += 12; // Gap between education institutions

      doc.setFont('times', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      const instStr = edu.institution || '';
      doc.text(instStr, margin, y);
      const instWidth = doc.getTextWidth(instStr);

      if (edu.degree) {
        doc.setFont('times', 'normal');
        doc.text(`, ${edu.degree}`, margin + instWidth, y);
      }

      if (edu.year) {
        doc.setFont('times', 'normal');
        doc.text(edu.year, pageWidth - margin, y, { align: 'right' });
      }
      y += 13.5;

      if (edu.details) {
        doc.setFont('times', 'normal');
        doc.setFontSize(9.5);
        doc.text('• ' + edu.details, margin + 6, y);
        y += 12.5;
      }
    }
  }

  // 6. SKILLS SECTION
  if (skills) {
    drawSection('Skills');
    const skillRows = [
      { label: 'Languages', items: skills.languages },
      { label: 'Frameworks & Libraries', items: skills.frameworks },
      { label: 'Databases', items: skills.databases },
      { label: 'Tools & Platforms', items: skills.tools }
    ].filter(r => r.items && r.items.length > 0);

    for (let i = 0; i < skillRows.length; i++) {
      const sr = skillRows[i];
      doc.setFont('times', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(0, 0, 0);
      const prefix = sr.label + ': ';
      doc.text(prefix, margin, y);
      const pw = doc.getTextWidth(prefix);

      doc.setFont('times', 'normal');
      const valStr = sr.items.join(', ');
      const sLines = doc.splitTextToSize(valStr, contentWidth - pw);
      doc.text(sLines, margin + pw, y);
      y += (sLines.length * 14) + 3;
    }
  }

  const defaultFilename = hasName
    ? `${name.trim().replace(/\s+/g, '_')}_Resume.pdf`
    : 'Tailored_Resume.pdf';
  doc.save(filename || defaultFilename);
}

/**
 * Generates plain text / markdown representation of tailored resume in Jake's format.
 */
export function generateResumeMarkdown(tailoredResume) {
  if (!tailoredResume) return '';

  const { name, contact, summary, includeSummary, experience, projects, education, skills } = tailoredResume;
  const lines = [];

  // Header
  if (name && name.trim()) {
    lines.push(`# ${name.trim()}`);
  }
  const contactParts = [
    contact?.phone,
    contact?.email,
    contact?.portfolio,
    contact?.github,
    contact?.linkedin,
    contact?.location
  ].filter(Boolean);
  if (contactParts.length > 0) {
    lines.push(contactParts.join(' | '));
  }
  if (lines.length > 0) {
    lines.push('\n---\n');
  }

  // Summary
  if (includeSummary && summary) {
    lines.push('## Summary');
    lines.push(summary);
    lines.push('');
  }

  // Experience
  if (experience && experience.length > 0) {
    lines.push('## Experience');
    for (const exp of experience) {
      lines.push(`### ${exp.role || ''}, ${exp.company || ''} – ${exp.location || ''} (${exp.duration || ''})`);
      if (exp.bullets) {
        for (const b of exp.bullets) {
          lines.push(`- ${b}`);
        }
      }
      lines.push('');
    }
  }

  // Projects
  if (projects && projects.length > 0) {
    lines.push('## Projects');
    for (const p of projects) {
      const tag = p.tagline ? ` — ${p.tagline}` : '';
      lines.push(`### ${p.name || ''}${tag}`);
      if (p.bullets) {
        for (const pb of p.bullets) {
          lines.push(`- ${pb}`);
        }
      }
      if (p.techStack) {
        lines.push(`- **Tech Stack:** ${p.techStack}`);
      }
      lines.push('');
    }
  }

  // Education
  if (education && education.length > 0) {
    lines.push('## Education');
    for (const edu of education) {
      lines.push(`- **${edu.institution || ''}${edu.degree ? `, ${edu.degree}` : ''}** (${edu.year || ''})`);
      if (edu.details) {
        lines.push(`  - ${edu.details}`);
      }
    }
    lines.push('');
  }

  // Skills
  if (skills) {
    lines.push('## Skills');
    if (skills.languages?.length) lines.push(`- **Languages:** ${skills.languages.join(', ')}`);
    if (skills.frameworks?.length) lines.push(`- **Frameworks & Libraries:** ${skills.frameworks.join(', ')}`);
    if (skills.databases?.length) lines.push(`- **Databases:** ${skills.databases.join(', ')}`);
    if (skills.tools?.length) lines.push(`- **Tools & Platforms:** ${skills.tools.join(', ')}`);
    lines.push('');
  }

  return lines.join('\n');
}

export function downloadResumeText(tailoredResume, filename) {
  const content = generateResumeMarkdown(tailoredResume);
  const defaultFilename = (tailoredResume?.name?.trim())
    ? `${tailoredResume.name.trim().replace(/\s+/g, '_')}_Resume.txt`
    : 'Tailored_Resume.txt';
  const saveName = filename || defaultFilename;
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = saveName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function copyResumeToClipboard(tailoredResume) {
  const content = generateResumeMarkdown(tailoredResume);
  await navigator.clipboard.writeText(content);
}
