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

  const { name, contact, summary, includeSummary, experience, projects, education, skills, certifications, achievements, publications, leadership } = tailoredResume;

  // PAGE BREAK HELPER
  function checkPageBreak(neededHeight = 20) {
    if (y + neededHeight > pageHeight - margin - 15) {
      doc.addPage();
      y = margin + 15;
    }
  }

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
    checkPageBreak(35);
    if (isFirstSection) {
      y += (hasName || contactList.length > 0 ? 12 : 0);
      isFirstSection = false;
    } else {
      y += (includeSummary ? 16 : 20); // LaTeX spacing before section title
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
    checkPageBreak(sumLines.length * 13 + 5);
    doc.text(sumLines, margin, y);
    y += (sumLines.length * 13) + 4;
  }

  // 3. EXPERIENCE SECTION
  if (experience && experience.length > 0) {
    drawSection('Experience');
    for (let i = 0; i < experience.length; i++) {
      const exp = experience[i];
      if (i > 0) y += 10;

      checkPageBreak(25);
      doc.setFont('times', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      const roleStr = exp.role || 'Role';
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
          const lines = doc.splitTextToSize(b, contentWidth - 18);
          const needed = (lines.length * 13.2) + 2;
          checkPageBreak(needed);
          doc.setFont('times', 'normal');
          doc.setFontSize(9.5);
          doc.text('•', margin + 6, y);
          doc.text(lines, margin + 16, y);
          y += needed;
        }
      }
    }
  }

  // 4. PROJECTS SECTION
  if (projects && projects.length > 0) {
    drawSection('Projects');
    for (let i = 0; i < projects.length; i++) {
      const p = projects[i];
      if (i > 0) y += 12; // Breathing room between projects

      checkPageBreak(25);
      doc.setFont('times', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text(p.name, margin, y);
      const nameWidth = doc.getTextWidth(p.name);

      if (p.tagline) {
        doc.setFont('times', 'normal');
        doc.text(' — ' + p.tagline, margin + nameWidth, y);
      }
      y += 14;

      if (p.bullets && p.bullets.length > 0) {
        for (const pb of p.bullets) {
          const lines = doc.splitTextToSize(pb, contentWidth - 18);
          const needed = (lines.length * 13.2) + 2;
          checkPageBreak(needed);
          doc.setFont('times', 'normal');
          doc.setFontSize(9.5);
          doc.text('•', margin + 6, y);
          doc.text(lines, margin + 16, y);
          y += needed;
        }
      }

      if (p.techStack) {
        const prefix = '• Tech Stack: ';
        doc.setFont('times', 'bold');
        doc.setFontSize(9.5);
        const pw = doc.getTextWidth(prefix);
        const tLines = doc.splitTextToSize(p.techStack, contentWidth - 18 - pw);
        const needed = (tLines.length * 13.2) + 2;
        checkPageBreak(needed);
        doc.text(prefix, margin + 6, y);
        doc.setFont('times', 'normal');
        doc.text(tLines, margin + 6 + pw, y);
        y += needed;
      }
    }
  }

  // 5. EDUCATION SECTION
  if (education && education.length > 0) {
    drawSection('Education');
    for (let i = 0; i < education.length; i++) {
      const edu = education[i];
      if (i > 0) y += 10;

      checkPageBreak(25);
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
        const lines = doc.splitTextToSize(edu.details, contentWidth - 18);
        const needed = (lines.length * 12.5) + 2;
        checkPageBreak(needed);
        doc.setFont('times', 'normal');
        doc.setFontSize(9.5);
        doc.text('•', margin + 6, y);
        doc.text(lines, margin + 16, y);
        y += needed;
      }
    }
  }

  // 6. SKILLS SECTION
  if (skills) {
    const skillRows = [
      { label: 'Languages', items: skills.languages },
      { label: 'Frameworks & Libraries', items: skills.frameworks },
      { label: 'Databases', items: skills.databases },
      { label: 'Tools & Platforms', items: skills.tools }
    ].filter(r => r.items && r.items.length > 0);

    if (skillRows.length > 0) {
      drawSection('Skills');
      for (let i = 0; i < skillRows.length; i++) {
        const sr = skillRows[i];
        const prefix = sr.label + ': ';
        doc.setFont('times', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(0, 0, 0);
        const pw = doc.getTextWidth(prefix);

        const valStr = sr.items.join(', ');
        const sLines = doc.splitTextToSize(valStr, contentWidth - pw);
        const needed = (sLines.length * 13.5) + 3;
        checkPageBreak(needed);

        doc.text(prefix, margin, y);
        doc.setFont('times', 'normal');
        doc.text(sLines, margin + pw, y);
        y += needed;
      }
    }
  }

  // 7. CERTIFICATIONS SECTION
  if (certifications && certifications.length > 0) {
    drawSection('Certifications');
    for (const cert of certifications) {
      const lines = doc.splitTextToSize(cert, contentWidth - 18);
      const needed = (lines.length * 13) + 2;
      checkPageBreak(needed);
      doc.setFont('times', 'normal');
      doc.setFontSize(9.5);
      doc.text('•', margin + 6, y);
      doc.text(lines, margin + 16, y);
      y += needed;
    }
  }

  // 8. HONORS & ACHIEVEMENTS SECTION
  if (achievements && achievements.length > 0) {
    drawSection('Honors & Achievements');
    for (const ach of achievements) {
      const lines = doc.splitTextToSize(ach, contentWidth - 18);
      const needed = (lines.length * 13) + 2;
      checkPageBreak(needed);
      doc.setFont('times', 'normal');
      doc.setFontSize(9.5);
      doc.text('•', margin + 6, y);
      doc.text(lines, margin + 16, y);
      y += needed;
    }
  }

  // 9. PUBLICATIONS & RESEARCH SECTION
  if (publications && publications.length > 0) {
    drawSection('Publications & Research');
    for (const pub of publications) {
      const lines = doc.splitTextToSize(pub, contentWidth - 18);
      const needed = (lines.length * 13) + 2;
      checkPageBreak(needed);
      doc.setFont('times', 'normal');
      doc.setFontSize(9.5);
      doc.text('•', margin + 6, y);
      doc.text(lines, margin + 16, y);
      y += needed;
    }
  }

  // 10. LEADERSHIP & EXTRACURRICULAR SECTION
  if (leadership && leadership.length > 0) {
    drawSection('Leadership & Extracurricular');
    for (const lead of leadership) {
      const lines = doc.splitTextToSize(lead, contentWidth - 18);
      const needed = (lines.length * 13) + 2;
      checkPageBreak(needed);
      doc.setFont('times', 'normal');
      doc.setFontSize(9.5);
      doc.text('•', margin + 6, y);
      doc.text(lines, margin + 16, y);
      y += needed;
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

  const { name, contact, summary, includeSummary, experience, projects, education, skills, certifications, achievements, publications, leadership } = tailoredResume;
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

  // Certifications
  if (certifications && certifications.length > 0) {
    lines.push('## Certifications');
    for (const cert of certifications) {
      lines.push(`- ${cert}`);
    }
    lines.push('');
  }

  // Achievements
  if (achievements && achievements.length > 0) {
    lines.push('## Honors & Achievements');
    for (const ach of achievements) {
      lines.push(`- ${ach}`);
    }
    lines.push('');
  }

  // Publications
  if (publications && publications.length > 0) {
    lines.push('## Publications & Research');
    for (const pub of publications) {
      lines.push(`- ${pub}`);
    }
    lines.push('');
  }

  // Leadership
  if (leadership && leadership.length > 0) {
    lines.push('## Leadership & Extracurricular');
    for (const lead of leadership) {
      lines.push(`- ${lead}`);
    }
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
