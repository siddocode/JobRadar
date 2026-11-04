/**
 * Client-Side Candidate Eligibility Matcher
 * Evaluates candidate profile against job requirements.
 * Used for instant responsive calculations and client-side fallback.
 */

export function evaluateCandidateMatch(jobEligibility, candidateProfile) {
  if (!jobEligibility || !candidateProfile) return null;

  const eligibleFactors = [];
  const nonEligibleFactors = [];

  let countryScore = 0;
  let experienceScore = 0;
  let skillsScore = 0;
  const educationScore = 10;
  let isHardBlocker = false;

  // 1. Country & Location Eligibility
  // 1. Universal Country & Work Authorization Eligibility
  const candCountry = (candidateProfile.country || 'Unspecified').trim();
  const candCountryLower = candCountry.toLowerCase();
  const candIsIndia = Boolean(candidateProfile.isIndiaResident || candCountryLower === 'india');
  const candHasUSAuth = Boolean(candidateProfile.hasUSWorkAuth);

  const jobCountry = (jobEligibility.workplace?.country || '').trim();
  const jobCountryLower = jobCountry.toLowerCase();
  const jobCity = (jobEligibility.workplace?.city || '').trim();
  const jobLoc = (jobEligibility.workplace?.locationDisplay || 'Office').trim();
  const isWorldwideRemote = Boolean(jobEligibility.workplace?.isWorldwideRemote || jobEligibility.indiaEligibility?.status === 'eligible_worldwide');

  const hasIndiaLocation = jobCountryLower === 'india' ||
    /\b(bengaluru|bangalore|hyderabad|noida|gurgaon|gurugram|delhi|pune|mumbai|chennai|kolkata)\b/i.test((jobCity + ' ' + jobLoc).toLowerCase());
  const isUSRole = jobCountryLower.includes('united states') || jobCountryLower === 'us' ||
    /\b(california|san jose|seattle|san francisco|austin|new york|usa)\b/i.test(jobLoc.toLowerCase());

  const isDomesticFit = 
    (candCountryLower === 'india' && hasIndiaLocation) ||
    ((candCountryLower.includes('united states') || candCountryLower === 'us') && isUSRole) ||
    (candCountryLower.includes('united kingdom') && (jobCountryLower.includes('united kingdom') || jobCountryLower === 'uk' || /\b(london|manchester|england|scotland)\b/i.test(jobLoc.toLowerCase()))) ||
    (candCountryLower.includes('canada') && (jobCountryLower.includes('canada') || /\b(toronto|vancouver|montreal|ontario)\b/i.test(jobLoc.toLowerCase()))) ||
    (candCountryLower.includes('germany') && (jobCountryLower.includes('germany') || /\b(berlin|munich|frankfurt)\b/i.test(jobLoc.toLowerCase()))) ||
    (candCountryLower && jobCountryLower && candCountryLower === jobCountryLower);

  const isUSRoleWithAuth = isUSRole && (candCountryLower.includes('united states') || candCountryLower === 'us' || candHasUSAuth);

  let countryResult = {
    id: 'country-eligibility',
    category: 'Work Authorization & Country',
    title: '',
    status: 'ELIGIBLE',
    isEligible: true,
    isBlocker: false,
    badgeTone: 'success',
    icon: 'globe',
    detail: '',
    recommendation: null
  };

  if (!candCountryLower || /^(unspecified|unknown|not detected)$/.test(candCountryLower)) {
    countryScore = 25;
    countryResult.title = 'Country Fit: Confirm Your Work Location';
    countryResult.detail = 'Your profile does not include a detected country. Verify the job’s location and work authorization requirements before applying.';
    countryResult.icon = 'info';
    countryResult.badgeTone = 'info';
    eligibleFactors.push(countryResult);
  } else if (isDomesticFit) {
    countryScore = 35;
    countryResult.title = `Country Fit: 100% Eligible (Domestic ${candCountry} Opening)`;
    countryResult.detail = `This job is based in ${candCountry} (${jobCity || jobLoc}). You reside in ${candCountry} and qualify for direct domestic employment.`;
    countryResult.icon = 'check';
    countryResult.badgeTone = 'success';
    eligibleFactors.push(countryResult);
  } else if (isWorldwideRemote) {
    countryScore = 35;
    countryResult.title = 'Country Fit: 100% Eligible (Global Remote)';
    countryResult.detail = `${jobEligibility.company} allows worldwide remote candidates. Candidates located in ${candCountry} are fully eligible to apply remotely.`;
    countryResult.icon = 'globe';
    countryResult.badgeTone = 'success';
    eligibleFactors.push(countryResult);
  } else if (isUSRoleWithAuth) {
    countryScore = 35;
    countryResult.title = 'Country Fit: US Work Authorization Satisfied';
    countryResult.detail = 'Role is US-based. Your profile indicates US residency or work authorization.';
    countryResult.icon = 'check';
    countryResult.badgeTone = 'success';
    eligibleFactors.push(countryResult);
  } else if (jobEligibility.indiaEligibility?.status === 'conditional') {
    // Missing or ambiguous location data is not evidence that a candidate is
    // legally ineligible. Keep the job visible and ask them to verify the ATS.
    countryScore = 30;
    countryResult.title = 'Country Fit: Location Requirements Need Confirmation';
    countryResult.detail = `The posting does not establish a location or work authorization restriction. Confirm the requirements with ${jobEligibility.company || 'the employer'} before applying.`;
    countryResult.icon = 'info';
    countryResult.badgeTone = 'info';
    eligibleFactors.push(countryResult);
  } else {
    countryScore = 0;
    countryResult.status = 'NOT_ELIGIBLE';
    countryResult.isEligible = false;
    countryResult.isBlocker = true;
    countryResult.badgeTone = 'danger';
    countryResult.icon = 'blocker';
    const targetCountry = jobCountry || 'a different country';
    countryResult.title = `Country Blocker: Located in ${targetCountry}`;
    countryResult.detail = `This position requires legal work authorization in ${targetCountry} (${jobLoc || targetCountry}). Candidates residing in ${candCountry} cannot work cross-border without local visa/authorization.`;
    countryResult.recommendation = `Target openings in ${candCountry} or Worldwide Remote roles.`;
    nonEligibleFactors.push(countryResult);
    isHardBlocker = true;
  }

  // 2. Experience & Seniority
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
    icon: 'experience',
    detail: '',
    recommendation: null
  };

  const jobMinMonths = jobMinYears * 12;

  if (jobIsFresher) {
    if (candIsFresher || candTotalMonths <= 24) {
      experienceScore = 30;
      expResult.title = `Experience Fit: 100% Eligible (${candExpDisplay} Exp)`;
      expResult.detail = `Job welcomes early career talent, freshers, and developers with 0-2 years of experience. Your profile (${candExpDisplay}, ${candidateProfile.seniorityLevel || 'Early Career'}) is an ideal fit.`;
      expResult.icon = 'check';
      expResult.badgeTone = 'success';
      eligibleFactors.push(expResult);
    } else {
      experienceScore = 28;
      expResult.title = 'Experience Fit: Exceeds Minimum Entry-Level Requirement';
      expResult.detail = `Role is entry-level, but your ${candExpDisplay} of experience gives you strong foundational qualification.`;
      expResult.icon = 'check';
      expResult.badgeTone = 'success';
      eligibleFactors.push(expResult);
    }
  } else {
    if (candTotalMonths >= jobMinMonths) {
      experienceScore = 30;
      expResult.title = `Experience Fit: Meets Seniority Requirement (${candExpDisplay} Exp)`;
      expResult.detail = `Job specifies ${jobSeniority.experienceText}. Your profile reflects ${candExpDisplay} of experience (${candidateProfile.seniorityLevel}).`;
      expResult.icon = 'check';
      expResult.badgeTone = 'success';
      eligibleFactors.push(expResult);
    } else if (candTotalMonths >= jobMinMonths - 6 || (jobMinYears <= 1 && candTotalMonths >= 6)) {
      // Borderline (within 6 months, or 6+ months for 1-year role)
      experienceScore = 22;
      expResult.title = `Experience Level: Close Match (${candExpDisplay} vs ${jobMinYears}+ Yrs)`;
      expResult.detail = `Role prefers ${jobSeniority.experienceText}; your profile shows ${candExpDisplay}. Your practical engineering experience and skill match provide strong qualification.`;
      expResult.icon = 'check';
      expResult.badgeTone = 'success';
      eligibleFactors.push(expResult);
    } else {
      experienceScore = Math.max(5, Math.round((candTotalMonths / Math.max(12, jobMinMonths)) * 25));
      expResult.status = 'NOT_ELIGIBLE';
      expResult.isEligible = false;
      expResult.badgeTone = 'warning';
      expResult.icon = 'warning';
      expResult.title = 'Experience Gap: Seniority Requirement Not Met';
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

  // 3. Technical Skills
  const jobSkills = jobEligibility.skills || [];
  const candSkills = candidateProfile.skills || [];
  const matchedSkills = [];
  const missingSkills = [];

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
      icon: 'skills',
      detail: 'Your profile matches key technical competencies required for this position.',
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
      icon: isMajorGap ? 'warning' : 'info',
      detail: isMajorGap
        ? 'The job prioritizes several technologies not detected in your CV/portfolio.'
        : 'These skills are mentioned in the job description and could strengthen your application if added.',
      missingItems: missingSkills,
      recommendation: `Add experience, projects, or certifications covering ${missingSkills.slice(0, 3).join(', ')} to boost your ATS resume score.`
    });
  }

  // 4. Education
  const candEdu = candidateProfile.education || 'B.Tech / B.E. in Computer Science or Equivalent';
  eligibleFactors.push({
    id: 'education-fit',
    category: 'Education & Credentials',
    title: 'Education Requirement Satisfied',
    status: 'ELIGIBLE',
    isEligible: true,
    badgeTone: 'success',
    icon: 'education',
    detail: `Candidate credentials (${candEdu}) align with standard engineering requirements.`,
    chips: [candEdu]
  });

  // 5. Work Mode
  const jobMode = jobEligibility.workplace?.mode || 'On-site';

  if (jobMode === 'Remote') {
    eligibleFactors.push({
      id: 'work-mode',
      category: 'Workplace & Commute',
      title: 'Work Mode: 100% Remote Compatible',
      status: 'ELIGIBLE',
      isEligible: true,
      badgeTone: 'success',
      icon: 'remote',
      detail: 'This is a Remote position. You can work comfortably from your current location without office commuting.',
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
      icon: 'office',
      detail: `Role involves ${jobMode} presence in ${jobLoc}. Candidate should be based in or open to commuting/relocating to ${jobLoc}.`,
      chips: [jobMode, jobLoc]
    });
  }

  // 6. Overall Calculation
  let totalScore = countryScore + experienceScore + skillsScore + educationScore;
  totalScore = Math.max(5, Math.min(100, totalScore));

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
    executiveSummary = 'You qualify for the country and work authorization requirements, but have minor experience or skill gaps that should be addressed in your resume.';
  } else {
    overallStatus = 'ELIGIBLE';
    badgeTone = 'success';
    canApply = true;
    verdictHeadline = 'Fully Eligible: Strong Candidate Fit!';
    executiveSummary = `You meet all essential requirements! Your location (${candCountry}), experience (${candYears} yrs), and technical skills strongly align with this opening at ${jobEligibility.company}.`;
  }

  const actionableTips = [];
  if (isHardBlocker) {
    actionableTips.push(`Target openings in ${candCountry} or Worldwide Remote roles to ensure smooth hiring.`);
  }
  if (missingSkills.length > 0) {
    actionableTips.push(`Highlight any experience with ${missingSkills.slice(0, 3).join(', ')} in your application or cover note.`);
  }
  if (isDomesticFit) {
    actionableTips.push(`Emphasize your immediate availability and right-to-work in ${candCountry} for faster recruiter shortlisting.`);
  }
  if (jobIsFresher && candIsFresher) {
    actionableTips.push('Mention relevant coursework, college capstone projects, and GitHub links prominently.');
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

/**
 * Generates lightweight client eligibility for quick row calculations.
 */
export function generateClientEligibility(job) {
  if (!job) return null;
  const title = (job.title || '').trim();
  const rawLoc = (job.locationRaw || job.location || '').trim();
  const country = (job.country || '').trim();
  const city = (job.city || '').trim();
  const company = (job.company || '').trim();
  const workMode = (job.workMode || 'unknown').toLowerCase();

  const isExecutive = /\b(director|vp|vice president|chief|head of|general counsel|partner)\b/i.test(title);
  const isArchitectOrLead = /\b(architect|principal|staff|lead|tech lead|engineering manager)\b/i.test(title);
  const isSenior = /\b(senior|sr\.?|sr\b|lead|iii|iv|v|l5|l6|e5|e6|\b3\b|\b4\b|\b5\b)\b/i.test(title);
  const isFresher = /\b(intern|internship|trainee|fresher|graduate|campus|new grad|entry[- ]level|associate software|junior)\b/i.test(title);

  let minYears = 2;
  let level = 'Mid-Level Professional (2 - 4 Years)';
  let experienceText = '2+ Years of Professional Experience';

  if (isExecutive) {
    minYears = 10;
    level = 'Executive / Director (10+ Years)';
    experienceText = '10+ Years Leadership Exp';
  } else if (isArchitectOrLead) {
    minYears = 8;
    level = 'Lead / Principal / Architect (8+ Years)';
    experienceText = '8+ Years Deep Architecture Exp';
  } else if (isSenior) {
    minYears = 5;
    level = 'Senior Professional (5+ Years)';
    experienceText = '5+ Years Professional Exp';
  } else if (isFresher) {
    minYears = 0;
    level = 'Fresher / Early Career (0 - 2 Years)';
    experienceText = '0 - 2 Years (Freshers & College Grads)';
  }

  const hasIndiaLocation = country.toLowerCase() === 'india' ||
    /\b(bengaluru|bangalore|hyderabad|noida|gurgaon|gurugram|delhi|new delhi|ncr|pune|mumbai|chennai|kolkata|ahmedabad|kochi|indore|chandigarh|jaipur|trivandrum|thiruvananthapuram|coimbatore)\b/i.test(city || rawLoc);

  const isWorldwideRemote = (workMode === 'remote' || /remote/i.test(rawLoc)) &&
    (/worldwide|global|anywhere|any location|work from anywhere|all locations/i.test(rawLoc) || (!country && workMode === 'remote'));

  const isUS = country.toLowerCase() === 'united states' || country.toLowerCase() === 'us' || /\busa?\b|california|san jose|seattle|san francisco/i.test(rawLoc);

  const detectedSkills = [];
  if (/machine learning|\bml\b|artificial intelligence|\bai\b|deep learning|data scientist/i.test(title)) {
    detectedSkills.push('Machine Learning', 'Python', 'SQL', 'Data Modeling');
  } else if (/data engineer|big data|analytics engineer/i.test(title)) {
    detectedSkills.push('Python', 'SQL', 'PostgreSQL', 'Kafka', 'Data Pipelines');
  } else if (/frontend|front-end|ui|react|angular|vue|web\s*developer/i.test(title)) {
    detectedSkills.push('JavaScript', 'TypeScript', 'React', 'HTML/CSS', 'REST APIs');
  } else if (/cloud|devops|sre|infrastructure|platform/i.test(title)) {
    detectedSkills.push('AWS', 'Docker', 'Kubernetes', 'Linux', 'CI/CD');
  } else if (/architect/i.test(title)) {
    detectedSkills.push('System Design', 'Cloud Architecture', 'Distributed Systems', 'Microservices');
  } else if (/security|infosec|cyber/i.test(title)) {
    detectedSkills.push('Security', 'Linux', 'Network Protocols');
  } else if (/backend|back-end|api|server|microservices/i.test(title)) {
    detectedSkills.push('Node.js / Java', 'REST APIs', 'SQL', 'Microservices');
  } else if (/software|engineer|developer|swe|programmer/i.test(title)) {
    detectedSkills.push('Software Engineering', 'Problem Solving', 'Data Structures', 'Git');
  } else {
    detectedSkills.push('Software Engineering', 'Problem Solving', 'Git');
  }

  let indiaEligibility;
  if (hasIndiaLocation) {
    indiaEligibility = {
      status: 'direct_india',
      canIndiansApply: true,
      badgeText: 'Direct India Opening',
      badgeTone: 'success',
      badgeIcon: '🇮🇳',
      verdictTitle: '100% Eligible: Direct India Entity Hire',
      explanation: `Officially based at ${company}'s India office (${city || rawLoc || 'India'}). Indian residents are fully eligible with local payroll and benefits.`
    };
  } else if (isWorldwideRemote) {
    indiaEligibility = {
      status: 'eligible_worldwide',
      canIndiansApply: true,
      badgeText: 'Global Remote (India Allowed)',
      badgeTone: 'success',
      badgeIcon: 'globe',
      verdictTitle: 'Eligible: Worldwide Remote Role',
      explanation: `${company} supports global remote candidates. Indian residents can apply remotely.`
    };
  } else if (isUS) {
    indiaEligibility = {
      status: 'restricted_us',
      canIndiansApply: false,
      badgeText: 'US Work Auth Required',
      badgeTone: 'warning',
      badgeIcon: 'restricted',
      verdictTitle: 'Restricted: Existing US Work Authorization Required',
      explanation: `This role is located in the US (${rawLoc || 'United States'}). Candidates in India cannot work cross-border without existing US citizenship, Green Card, or valid US visa.`
    };
  } else {
    indiaEligibility = {
      status: 'conditional',
      canIndiansApply: true,
      badgeText: 'Location Specific',
      badgeTone: 'info',
      badgeIcon: 'ℹ️',
      verdictTitle: 'Check ATS Requirements',
      explanation: `Check official ${company} ATS listing for location-specific work permit prerequisites.`
    };
  }

  return {
    jobId: job._id || job.sourceJobId,
    title,
    company,
    seniority: {
      isFresher,
      isSenior: isSenior || isArchitectOrLead || isExecutive,
      level,
      experienceText,
      minYears
    },
    skills: detectedSkills,
    indiaEligibility,
    workplace: {
      mode: workMode === 'remote' ? 'Remote' : (rawLoc.toLowerCase().includes('hybrid') ? 'Hybrid' : 'Flexible'),
      locationDisplay: rawLoc || city || country || 'Unspecified',
      country: country || (hasIndiaLocation ? 'India' : (isUS ? 'United States' : 'Unspecified')),
      city: city || '',
      isWorldwideRemote
    }
  };
}

/**
 * Computes instantaneous candidate match for a specific job row.
 * Prefers server-precomputed job.eligibility for 100% modal/table consistency.
 * Runs in under 0.05ms for smooth table rendering.
 */
export function getJobMatchQuick(job, candidateProfile) {
  if (!job || !candidateProfile) return null;
  const elig = job.eligibility || generateClientEligibility(job);
  return evaluateCandidateMatch(elig, candidateProfile);
}
