/**
 * Candidate Eligibility Matcher Engine
 * Evaluates candidate profile against job requirements.
 * 
 * Evaluates:
 * 1. Country & Work Authorization Eligibility (Most Important)
 * 2. Experience & Seniority Level (Most Important)
 * 3. Required Tech Stack & Skills
 * 4. Education & Work Mode Compatibility
 * 
 * Generates:
 * - List of ELIGIBLE factors (Passing criteria)
 * - List of NON-ELIGIBLE factors (Gaps, blockers, warnings)
 * - OVERALL Verdict & Match Score (0 - 100%) with actionable guidance
 */

/**
 * Compares job eligibility requirements against a candidate profile.
 * 
 * @param {Object} jobEligibility - Output of analyzeJobEligibility(job)
 * @param {Object} candidateProfile - Output of extractCandidateProfile(text)
 * @returns {Object} Comprehensive evaluation breakdown
 */
function evaluateCandidateEligibility(jobEligibility, candidateProfile) {
  if (!jobEligibility || !candidateProfile) {
    return null;
  }

  const eligibleFactors = [];
  const nonEligibleFactors = [];

  let countryScore = 0;
  let experienceScore = 0;
  let skillsScore = 0;
  let educationScore = 10;
  let isHardBlocker = false;

  // --------------------------------------------------------------------------
  // 1. COUNTRY & WORK AUTHORIZATION ELIGIBILITY (CRITICAL FACTOR)
  // --------------------------------------------------------------------------
  const indiaPolicy = jobEligibility.indiaEligibility || {};
  const candCountry = (candidateProfile.country || 'Unspecified').trim();
  const candidateCountryKnown = !/^(?:unspecified|unknown|not detected)$/i.test(candCountry);
  const candIsIndia = candidateProfile.isIndiaResident || candCountry.toLowerCase() === 'india';
  const candHasUSAuth = candidateProfile.hasUSWorkAuth || false;
  const jobCountry = (jobEligibility.workplace?.country || 'India').trim();
  const jobCity = (jobEligibility.workplace?.city || jobEligibility.workplace?.locationDisplay || 'India').trim();

  let countryResult = {
    id: 'country-eligibility',
    category: 'Work Authorization & Country',
    title: '',
    status: 'ELIGIBLE',
    isEligible: true,
    isBlocker: false,
    badgeTone: 'success',
    icon: '🇮🇳',
    detail: '',
    recommendation: null
  };

  if (!candidateCountryKnown) {
    countryScore = 25;
    countryResult.title = 'Country Fit: Confirm Your Work Location';
    countryResult.detail = 'Your profile does not include a detected country. Verify the job’s location and work authorization requirements before applying.';
    countryResult.icon = 'ℹ️';
    countryResult.badgeTone = 'info';
    eligibleFactors.push(countryResult);
  } else if (indiaPolicy.status === 'direct_india') {
    // DIRECT INDIA ROLE
    if (candIsIndia) {
      countryScore = 35;
      countryResult.title = 'Country Fit: 100% Eligible (Direct India Entity)';
      countryResult.detail = `This job is based in India (${jobCity}). You reside in India and are 100% eligible for direct domestic hiring with Indian payroll, EPF, and statutory benefits.`;
      countryResult.icon = '✓';
      countryResult.badgeTone = 'success';
      eligibleFactors.push(countryResult);
    } else {
      countryScore = 10;
      countryResult.status = 'NOT_ELIGIBLE';
      countryResult.isEligible = false;
      countryResult.isBlocker = true;
      countryResult.badgeTone = 'danger';
      countryResult.icon = '🚫';
      countryResult.title = 'Country Mismatch: India Employment Required';
      countryResult.detail = `Role is contracted under ${jobEligibility.company}'s Indian entity. Candidate profile indicates location in ${candCountry}. Legal right-to-work in India or relocation required.`;
      countryResult.recommendation = 'Confirm whether company sponsors relocation to India or look for roles in your country.';
      nonEligibleFactors.push(countryResult);
      isHardBlocker = true;
    }
  } else if (indiaPolicy.status === 'eligible_worldwide') {
    // WORLDWIDE REMOTE ROLE
    countryScore = 35;
    countryResult.title = 'Country Fit: 100% Eligible (Global Remote)';
    countryResult.detail = `${jobEligibility.company} allows international remote candidates. Residing in ${candCountry} is fully eligible for remote contract or Employer of Record (EOR) hiring.`;
    countryResult.icon = '🌐';
    countryResult.badgeTone = 'success';
    eligibleFactors.push(countryResult);
  } else if (indiaPolicy.status === 'restricted_us') {
    // US RESTRICTED ROLE
    if (candCountry.toLowerCase().includes('united states') || candCountry.toLowerCase() === 'us' || candHasUSAuth) {
      countryScore = 35;
      countryResult.title = 'Country Fit: US Work Authorization Satisfied';
      countryResult.detail = `Role is US-based. Your profile indicates US residency or work authorization.`;
      countryResult.icon = '🇺🇸';
      countryResult.badgeTone = 'success';
      eligibleFactors.push(countryResult);
    } else {
      countryScore = 0;
      countryResult.status = 'NOT_ELIGIBLE';
      countryResult.isEligible = false;
      countryResult.isBlocker = true;
      countryResult.badgeTone = 'danger';
      countryResult.icon = '🚫';
      countryResult.title = 'Country Blocker: US Work Authorization Required';
      countryResult.detail = `This role is hosted in the United States (${jobEligibility.workplace?.locationDisplay || 'USA'}). Indian candidates cannot work cross-border without existing US citizenship, Green Card, or valid US visa.`;
      countryResult.recommendation = 'Filter for India-based openings or global remote roles on JobRadar to avoid visa rejection.';
      nonEligibleFactors.push(countryResult);
      isHardBlocker = true;
    }
  } else if (indiaPolicy.status === 'restricted_other') {
    // OTHER INTERNATIONAL ROLE
    if (candCountry.toLowerCase() === jobCountry.toLowerCase()) {
      countryScore = 35;
      countryResult.title = `Country Fit: Local ${jobCountry} Candidate`;
      countryResult.detail = `Role is located in ${jobCountry} and matches your location.`;
      countryResult.icon = '✓';
      countryResult.badgeTone = 'success';
      eligibleFactors.push(countryResult);
    } else {
      countryScore = 5;
      countryResult.status = 'NOT_ELIGIBLE';
      countryResult.isEligible = false;
      countryResult.isBlocker = true;
      countryResult.badgeTone = 'danger';
      countryResult.icon = '🚫';
      countryResult.title = `Country Blocker: Requires ${jobCountry} Work Visa`;
      countryResult.detail = `This role is based in ${jobCountry}. Candidate is in ${candCountry}. Cross-border hiring without local visa is generally not supported.`;
      countryResult.recommendation = `Check company ATS for visa sponsorship availability before applying.`;
      nonEligibleFactors.push(countryResult);
      isHardBlocker = true;
    }
  } else {
    // CONDITIONAL
    countryScore = 30;
    countryResult.title = 'Country Fit: Location-Dependent (Check ATS)';
    countryResult.detail = `Location requirements are flexible or unstated. If ${jobEligibility.company} has an Indian entity or offers remote work, you can apply directly.`;
    countryResult.icon = 'ℹ️';
    countryResult.badgeTone = 'info';
    eligibleFactors.push(countryResult);
  }

  // --------------------------------------------------------------------------
  // 2. EXPERIENCE & SENIORITY ELIGIBILITY (CRITICAL FACTOR)
  // --------------------------------------------------------------------------
  const jobSeniority = jobEligibility.seniority || {};
  const jobIsFresher = Boolean(jobSeniority.isFresher);
  const jobMinYears = jobSeniority.minYears !== null && jobSeniority.minYears !== undefined ? jobSeniority.minYears : 2;
  const candYears = candidateProfile.totalYearsExperience !== null && candidateProfile.totalYearsExperience !== undefined ? candidateProfile.totalYearsExperience : 0;
  const candMonths = candidateProfile.experienceMonths || 0;
  const candTotalMonths = candidateProfile.totalExperienceMonths !== undefined ? candidateProfile.totalExperienceMonths : (candYears * 12 + candMonths);
  const candIsFresher = Boolean(candidateProfile.isFresher);
  const candExpDisplay = candidateProfile.experienceDisplay || (candTotalMonths < 12 ? `${candTotalMonths} Months` : (candMonths > 0 ? `${candYears} Yrs ${candMonths} Mos` : `${candYears} Yrs`));

  let expResult = {
    id: 'experience-eligibility',
    category: 'Experience & Seniority',
    title: '',
    status: 'ELIGIBLE',
    isEligible: true,
    isBlocker: false,
    badgeTone: 'success',
    icon: '🎓',
    detail: '',
    recommendation: null
  };

  const jobMinMonths = jobMinYears * 12;

  if (jobIsFresher) {
    // ROLE WELCOMES FRESHERS
    if (candIsFresher || candTotalMonths <= 24) {
      experienceScore = 30;
      expResult.title = `Experience Fit: 100% Eligible (${candExpDisplay} Exp)`;
      expResult.detail = `Job specifically welcomes college grads, early career talent, and candidates with 0-2 years of experience. Your profile (${candExpDisplay}, ${candidateProfile.seniorityLevel || 'Early Career'}) is an ideal fit.`;
      expResult.icon = '✓';
      expResult.badgeTone = 'success';
      eligibleFactors.push(expResult);
    } else {
      // Experienced candidate applying for fresher role
      experienceScore = 28;
      expResult.title = 'Experience Fit: Exceeds Minimum Entry-Level Requirement';
      expResult.detail = `Role is entry-level, but your ${candExpDisplay} of experience gives you strong foundational qualification.`;
      expResult.icon = '✓';
      expResult.badgeTone = 'success';
      eligibleFactors.push(expResult);
    }
  } else {
    // ROLE REQUIRES EXPERIENCE
    if (candTotalMonths >= jobMinMonths) {
      experienceScore = 30;
      expResult.title = `Experience Fit: Meets Seniority Requirement (${candExpDisplay} Exp)`;
      expResult.detail = `Job specifies ${jobSeniority.experienceText}. Your profile reflects ${candExpDisplay} of experience (${candidateProfile.seniorityLevel}).`;
      expResult.icon = '✓';
      expResult.badgeTone = 'success';
      eligibleFactors.push(expResult);
    } else if (candTotalMonths >= jobMinMonths - 6 || (jobMinYears <= 1 && candTotalMonths >= 6)) {
      // Borderline (within 6 months, or 6+ months for 1-year role)
      experienceScore = 22;
      expResult.title = `Experience Level: Close Match (${candExpDisplay} vs ${jobMinYears}+ Yrs)`;
      expResult.detail = `Role prefers ${jobSeniority.experienceText}; your profile shows ${candExpDisplay}. Your practical engineering experience and skill match provide strong qualification.`;
      expResult.icon = '✓';
      expResult.badgeTone = 'success';
      eligibleFactors.push(expResult);
    } else {
      // Experience Gap
      experienceScore = Math.max(5, Math.round((candTotalMonths / Math.max(12, jobMinMonths)) * 25));
      expResult.status = 'NOT_ELIGIBLE';
      expResult.isEligible = false;
      expResult.badgeTone = 'warning';
      expResult.icon = '⚠️';
      expResult.title = `Experience Gap: Seniority Requirement Not Met`;
      expResult.detail = `Job requires ${jobSeniority.experienceText} (${jobSeniority.level}). Your profile reflects ${candExpDisplay} (${candidateProfile.seniorityLevel}).`;
      expResult.recommendation = `Target roles matching your current experience level (0-${Math.max(2, candYears + 1)} years) or highlight deep hands-on project work in your application.`;
      
      // If gap is large (e.g. Senior/Lead/Architect/Director requiring 4+ years while candidate has < 24 months)
      if (jobMinYears >= 4 && candTotalMonths < 24) {
        expResult.isBlocker = true;
        isHardBlocker = true;
      }
      nonEligibleFactors.push(expResult);
    }
  }

  // --------------------------------------------------------------------------
  // 3. REQUIRED TECH STACK & SKILLS (CRITICAL FACTOR)
  // --------------------------------------------------------------------------
  const jobSkills = jobEligibility.skills || [];
  const candSkills = candidateProfile.skills || [];

  const matchedSkills = [];
  const missingSkills = [];

  // Match case-insensitively
  for (const js of jobSkills) {
    const isMatched = candSkills.some(cs => {
      const cleanCs = cs.toLowerCase().replace(/[^a-z0-9]/g, '');
      const cleanJs = js.toLowerCase().replace(/[^a-z0-9]/g, '');
      return cleanCs === cleanJs || cleanCs.includes(cleanJs) || cleanJs.includes(cleanCs);
    });

    if (isMatched) {
      matchedSkills.push(js);
    } else {
      missingSkills.push(js);
    }
  }

  const matchRatio = jobSkills.length > 0 ? (matchedSkills.length / jobSkills.length) : 1;

  if (matchedSkills.length > 0) {
    skillsScore = Math.round(matchRatio * 25);

    eligibleFactors.push({
      id: 'matched-skills',
      category: 'Technical Stack',
      title: `Technical Skills: ${matchedSkills.length} Core Requirements Matched`,
      status: 'ELIGIBLE',
      isEligible: true,
      badgeTone: 'success',
      icon: '⚡',
      detail: `Your profile matches key technical competencies required for this position.`,
      chips: matchedSkills
    });
  }

  if (missingSkills.length > 0) {
    const isMajorGap = matchRatio < 0.35 && jobSkills.length >= 3;
    nonEligibleFactors.push({
      id: 'missing-skills',
      category: 'Skill Gaps',
      title: isMajorGap ? `Skill Gap: ${missingSkills.length} Required Technologies Missing` : `Recommended Additional Skills (${missingSkills.length})`,
      status: isMajorGap ? 'NOT_ELIGIBLE' : 'RECOMMENDATION',
      isEligible: !isMajorGap,
      badgeTone: isMajorGap ? 'warning' : 'info',
      icon: isMajorGap ? '⚠️' : '💡',
      detail: isMajorGap
        ? `The job prioritizes several technologies not detected in your CV/portfolio.`
        : `These skills are mentioned in the job description and could strengthen your application if added.`,
      missingItems: missingSkills,
      recommendation: `Add experience, projects, or certifications covering ${missingSkills.slice(0, 3).join(', ')} to boost your ATS resume score.`
    });
  }

  // --------------------------------------------------------------------------
  // 4. EDUCATION & DEGREE FIT
  // --------------------------------------------------------------------------
  const candEdu = candidateProfile.education || 'B.Tech / B.E. in Computer Science or Equivalent';
  educationScore = 10;
  eligibleFactors.push({
    id: 'education-fit',
    category: 'Education & Credentials',
    title: 'Education Requirement Satisfied',
    status: 'ELIGIBLE',
    isEligible: true,
    badgeTone: 'success',
    icon: '📜',
    detail: `Candidate credentials (${candEdu}) align with the standard education requirements for this engineering role.`,
    chips: [candEdu]
  });

  // --------------------------------------------------------------------------
  // 5. WORK MODE & LOCATION COMPATIBILITY
  // --------------------------------------------------------------------------
  const jobMode = jobEligibility.workplace?.mode || 'On-site';
  const jobLoc = jobEligibility.workplace?.locationDisplay || 'Office';

  if (jobMode === 'Remote') {
    eligibleFactors.push({
      id: 'work-mode',
      category: 'Workplace & Commute',
      title: 'Work Mode: 100% Remote Compatible',
      status: 'ELIGIBLE',
      isEligible: true,
      badgeTone: 'success',
      icon: '💻',
      detail: `This is a Remote position. You can work comfortably from your current location without office commuting.`,
      chips: ['Remote Work']
    });
  } else {
    eligibleFactors.push({
      id: 'work-mode',
      category: 'Workplace & Commute',
      title: `Work Mode: ${jobMode} (${jobLoc})`,
      status: 'ELIGIBLE',
      isEligible: true,
      badgeTone: 'info',
      icon: '🏢',
      detail: `Role involves ${jobMode} presence in ${jobLoc}. Candidate should be based in or open to commuting/relocating to ${jobLoc}.`,
      chips: [jobMode, jobLoc]
    });
  }

  // --------------------------------------------------------------------------
  // 6. OVERALL VERDICT & SCORING
  // --------------------------------------------------------------------------
  let totalScore = countryScore + experienceScore + skillsScore + educationScore;
  totalScore = Math.max(5, Math.min(100, totalScore));

  // If hard blocker exists (e.g. US visa restriction for Indian resident), cap score
  if (isHardBlocker) {
    totalScore = Math.min(35, totalScore);
  }

  let overallStatus = 'ELIGIBLE';
  let badgeTone = 'success';
  let verdictHeadline = '';
  let executiveSummary = '';
  let canApply = true;

  if (isHardBlocker || totalScore < 50) {
    overallStatus = 'NOT_ELIGIBLE';
    badgeTone = 'danger';
    canApply = false;
    if (countryResult.isBlocker) {
      verdictHeadline = `Not Eligible: ${countryResult.title}`;
      executiveSummary = countryResult.detail;
    } else if (expResult.isBlocker) {
      verdictHeadline = `Not Eligible: ${expResult.title}`;
      executiveSummary = expResult.detail;
    } else {
      verdictHeadline = isHardBlocker
        ? 'Not Eligible: Core Requirements Blocker'
        : 'Low Eligibility: Significant Requirements Mismatch';
      executiveSummary = isHardBlocker
        ? (nonEligibleFactors.find(f => f.isBlocker)?.detail || 'Core prerequisites are not satisfied.')
        : `Your profile currently shows significant gaps in both required experience seniority (${jobSeniority.experienceText}) and technical competencies.`;
    }
  } else if (totalScore < 75 || nonEligibleFactors.some(f => f.status === 'NOT_ELIGIBLE')) {
    overallStatus = 'PARTIALLY_ELIGIBLE';
    badgeTone = 'warning';
    canApply = true;
    verdictHeadline = 'Partially Eligible: Moderate Fit with Notable Gaps';
    executiveSummary = `You qualify for the country and work authorization requirements, but have minor experience or skill gaps that should be addressed in your resume.`;
  } else {
    overallStatus = 'ELIGIBLE';
    badgeTone = 'success';
    canApply = true;
    verdictHeadline = 'Fully Eligible: Strong Candidate Fit!';
    executiveSummary = `You meet all essential requirements! Your location (${candCountry}), experience (${candYears} yrs), and technical skills strongly align with this opening at ${jobEligibility.company}.`;
  }

  const actionableTips = [];
  if (isHardBlocker) {
    actionableTips.push('Target Indian entity openings or worldwide remote roles on JobRadar to ensure smooth hiring.');
  }
  if (missingSkills.length > 0) {
    actionableTips.push(`Highlight any experience with ${missingSkills.slice(0, 3).join(', ')} in your application or cover note.`);
  }
  if (candIsIndia && indiaPolicy.status === 'direct_india') {
    actionableTips.push(`Emphasize your immediate availability and right-to-work in India for faster recruiter shortlisting.`);
  }
  if (jobIsFresher && candIsFresher) {
    actionableTips.push(`Mention relevant coursework, college capstone projects, and GitHub links prominently.`);
  }

  return {
    jobId: jobEligibility.jobId,
    jobTitle: jobEligibility.title,
    company: jobEligibility.company,
    evaluatedAt: new Date().toISOString(),
    overall: {
      status: overallStatus,
      score: totalScore,
      badgeTone,
      headline: verdictHeadline,
      summary: executiveSummary,
      canApply,
      isHardBlocker,
      actionableTips
    },
    candidateSummary: {
      name: candidateProfile.name || 'Candidate',
      country: candCountry,
      city: candidateProfile.city || '',
      isIndiaResident: candIsIndia,
      totalYearsExperience: candYears,
      experienceMonths: candMonths,
      totalExperienceMonths: candTotalMonths,
      experienceDisplay: candExpDisplay,
      isFresher: candIsFresher,
      seniorityLevel: candidateProfile.seniorityLevel,
      skillsDetectedCount: candSkills.length,
      education: candEdu,
      sourceType: candidateProfile.sourceType,
      sourceName: candidateProfile.sourceName
    },
    stats: {
      eligibleCount: eligibleFactors.length,
      nonEligibleCount: nonEligibleFactors.length,
      matchedSkillsCount: matchedSkills.length,
      missingSkillsCount: missingSkills.length,
      matchRatio: Math.round(matchRatio * 100)
    },
    eligibleFactors,
    nonEligibleFactors
  };
}

module.exports = {
  evaluateCandidateEligibility
};
