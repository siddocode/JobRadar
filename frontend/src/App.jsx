import React, { useState, useEffect, useCallback, useMemo } from 'react';
import CompanyDirectory from './components/CompanyDirectory';
import ReachOutView from './components/ReachOutView';
import AuthModal from './components/AuthModal';
import JobEligibilityModal from './components/JobEligibilityModal';
import CandidateProfileUploadModal from './components/CandidateProfileUploadModal';
import TechCorridorMapView from './components/TechCorridorMapView';
import { useAuth } from './context/AuthContext';
import { getJobMatchQuick } from './utils/candidateMatcher';

const PRIMARY_TECH_HUBS = [
  { key: 'all', name: 'All India' },
  { key: 'Bengaluru', name: 'Bengaluru' },
  { key: 'Hyderabad', name: 'Hyderabad' },
  { key: 'Gurugram', name: 'Gurugram' },
  { key: 'Pune', name: 'Pune' },
  { key: 'Noida', name: 'Noida' },
  { key: 'New Delhi', name: 'Delhi NCR' },
  { key: 'Mumbai', name: 'Mumbai' },
  { key: 'Chennai', name: 'Chennai' },
  { key: 'Kolkata', name: 'Kolkata' }
];

export default function App() {
  const { user, isAuthenticated, logout, openAuthModal, authFetch, candidateProfile } = useAuth();
  const [activeTab, setActiveTab] = useState('jobs'); // 'jobs' | 'directory' | 'reachout'
  const [theme, setTheme] = useState(() => localStorage.getItem('jobradar_theme') || 'light');

  const [directoryCities, setDirectoryCities] = useState([]);
  const [companyCount, setCompanyCount] = useState(0);
  const [reachOutCount, setReachOutCount] = useState(0);
  const [eligibilityJob, setEligibilityJob] = useState(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  const [jobs, setJobs] = useState([]);
  const [cities, setCities] = useState([]);
  const [meta, setMeta] = useState({ total: 0, openTotal: 0, totalInDb: 0, page: 1, limit: 25, totalPages: 1 });
  const [stats, setStats] = useState(null);

  // Filters & Pan-India Tech Hub Controls
  const [onlyEligibleJobs, setOnlyEligibleJobs] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('all');
  const [countries, setCountries] = useState([]);
  const [selectedCity, setSelectedCity] = useState('all');
  const [selectedCorridor, setSelectedCorridor] = useState('all');
  const [availableCorridors, setAvailableCorridors] = useState([]);
  const [experienceLevel, setExperienceLevel] = useState('all'); // 'all' | 'freshers' | 'mid' | 'senior'
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'
  const [workModeFilter, setWorkModeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('open');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [techOnlyJobs, setTechOnlyJobs] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [mobileFiltersExpanded, setMobileFiltersExpanded] = useState(false);

  // Status
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState(null);

  // Sync theme attribute on document root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('jobradar_theme', theme);
  }, [theme]);

  // Reset eligibility filter if user is not authenticated
  useEffect(() => {
    if (!isAuthenticated && onlyEligibleJobs) {
      setOnlyEligibleJobs(false);
    }
  }, [isAuthenticated, onlyEligibleJobs]);

  // Fetch aggregate stats
  const fetchStats = async () => {
    try {
      const res = await fetch('/api/jobs/stats');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setStats(data.stats);
        }
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  // Fetch countries list with job counts
  const fetchCountries = async () => {
    try {
      const res = await fetch('/api/countries');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setCountries(data.countries || []);
        }
      }
    } catch (err) {
      console.error('Failed to load countries:', err);
    }
  };

  // Fetch cities list with job counts (cascades by selectedCountry)
  const fetchCities = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedCountry && selectedCountry !== 'all') {
        params.append('country', selectedCountry);
      }
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const res = await fetch(`/api/cities?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setCities(data.cities || []);
        }
      }
    } catch (err) {
      console.error('Failed to load cities:', err);
    }
  }, [selectedCountry, statusFilter]);

  // Fetch tech corridors dynamically when city changes
  useEffect(() => {
    if (selectedCity && selectedCity !== 'all') {
      fetch(`/api/corridors?city=${encodeURIComponent(selectedCity)}&status=${statusFilter}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && data.success && Array.isArray(data.corridors)) {
            setAvailableCorridors(data.corridors);
          } else {
            setAvailableCorridors([]);
          }
        })
        .catch(() => setAvailableCorridors([]));
    } else {
      setAvailableCorridors([]);
    }
    setSelectedCorridor('all');
  }, [selectedCity, statusFilter]);

  // Fetch jobs with comprehensive filters including corridors & experience
  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.append('q', searchQuery.trim());
      if (selectedCountry && selectedCountry !== 'all') params.append('country', selectedCountry);
      if (selectedCity !== 'all') params.append('city', selectedCity);
      if (selectedCorridor && selectedCorridor !== 'all') params.append('corridor', selectedCorridor);

      if (experienceLevel === 'freshers') {
        params.append('fresherFriendly', 'true');
      } else if (experienceLevel === 'mid') {
        params.append('seniority', 'mid');
      } else if (experienceLevel === 'senior') {
        params.append('seniority', 'senior');
      }

      if (workModeFilter !== 'all') params.append('workMode', workModeFilter);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (companyFilter !== 'all') params.append('company', companyFilter);
      if (techOnlyJobs) params.append('techOnly', 'true');
      params.append('page', String(page));
      params.append('limit', String(viewMode === 'map' ? 100 : limit));

      const res = await fetch(`/api/jobs?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`API error: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      if (data.success) {
        setJobs(data.jobs || []);
        if (data.meta) {
          setMeta(data.meta);
        }
      } else {
        throw new Error(data.message || 'Failed to fetch jobs');
      }
    } catch (err) {
      setError(err.message);
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, selectedCountry, selectedCity, selectedCorridor, experienceLevel, workModeFilter, statusFilter, companyFilter, techOnlyJobs, page, limit, viewMode]);

  const fetchDirectoryMeta = useCallback(async () => {
    try {
      const [citiesRes, compRes, reachRes] = await Promise.all([
        fetch('/api/directory/cities'),
        fetch('/api/directory/companies?limit=1'),
        authFetch('/api/directory/reach-out')
      ]);
      if (citiesRes.ok) {
        const data = await citiesRes.json();
        if (data.success) setDirectoryCities(data.cities || []);
      }
      if (compRes.ok) {
        const data = await compRes.json();
        if (data.success) setCompanyCount(data.total || 0);
      }
      if (reachRes.ok) {
        const data = await reachRes.json();
        if (data.success) setReachOutCount(data.total || 0);
      }
    } catch (err) {
      console.error('Failed to load directory metadata:', err);
    }
  }, [authFetch]);

  const pollSyncStatus = useCallback(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/jobs/sync/status');
        if (!res.ok) return;
        const data = await res.json();
        if (!data.syncState?.isRunning) {
          clearInterval(interval);
          setIsSyncing(false);
          const summary = data.syncState?.lastSummary;
          if (summary) {
            setSyncToast({
              message: `Sync complete: ${summary.totalUpserted} jobs updated (${summary.totalFetched} fetched) in ${summary.durationSeconds}s`,
              type: 'success'
            });
          } else if (data.syncState?.error) {
            setSyncToast({
              message: `Sync error: ${data.syncState.error}`,
              type: 'error'
            });
          } else {
            setSyncToast({
              message: 'Job collection finished successfully.',
              type: 'success'
            });
          }
          fetchStats();
          fetchJobs();
          fetchCities();
          fetchCountries();
          fetchDirectoryMeta();
          setTimeout(() => setSyncToast(null), 6000);
        }
      } catch (_) {
        clearInterval(interval);
        setIsSyncing(false);
      }
    }, 2500);
  }, [fetchCities, fetchJobs]);

  const handleTriggerSync = async () => {
    if (isSyncing) return;
    try {
      setIsSyncing(true);
      setSyncToast({ message: 'Starting job collection across ATS boards...', type: 'info' });
      const res = await fetch('/api/jobs/sync', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setSyncToast({ message: 'Syncing live ATS boards in background...', type: 'info' });
        pollSyncStatus();
      } else {
        setIsSyncing(false);
        setSyncToast({ message: data.message || 'Failed to start sync', type: 'error' });
      }
    } catch (err) {
      setIsSyncing(false);
      setSyncToast({ message: `Failed to trigger sync: ${err.message}`, type: 'error' });
    }
  };

  // Check sync status on initial load
  useEffect(() => {
    async function checkInitialSyncStatus() {
      try {
        const res = await fetch('/api/jobs/sync/status');
        if (res.ok) {
          const data = await res.json();
          if (data.syncState?.isRunning) {
            setIsSyncing(true);
            setSyncToast({ message: 'A sync run is actively running in background...', type: 'info' });
            pollSyncStatus();
          }
        }
      } catch (_) { }
    }
    checkInitialSyncStatus();
  }, [pollSyncStatus]);

  useEffect(() => {
    fetchStats();
    fetchCountries();
  }, []);

  useEffect(() => {
    fetchDirectoryMeta();
  }, [fetchDirectoryMeta, isAuthenticated]);

  useEffect(() => {
    fetchCities();
  }, [fetchCities]);


  // Debounced fetch on filter changes
  useEffect(() => {
    const handler = setTimeout(() => {
      fetchJobs();
    }, 250);

    return () => clearTimeout(handler);
  }, [fetchJobs]);

  // Synchronize country filter with candidate's location when candidate profile is loaded or changed
  useEffect(() => {
    if (candidateProfile?.country) {
      setSelectedCountry(candidateProfile.country);
    }
  }, [candidateProfile]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedCountry('all');
    setSelectedCity('all');
    setSelectedCorridor('all');
    setExperienceLevel('all');
    setWorkModeFilter('all');
    setStatusFilter('open');
    setCompanyFilter('all');
    setTechOnlyJobs(false);
    setOnlyEligibleJobs(false);
    setPage(1);
  };

  // Memoize counts for India tech hub pills
  const hubCityCounts = useMemo(() => {
    const map = {};
    let totalIndia = 0;
    for (const c of cities) {
      if (!c || !c.city) continue;
      const lower = c.city.toLowerCase().trim();
      const count = c.count || 0;
      if (c.country === 'India' || !c.country) {
        totalIndia += count;
      }
      map[c.city] = (map[c.city] || 0) + count;
      if (lower === 'gurgaon') map['Gurugram'] = (map['Gurugram'] || 0) + count;
      if (lower === 'bangalore') map['Bengaluru'] = (map['Bengaluru'] || 0) + count;
      if (lower === 'delhi' || lower === 'delhi ncr') map['New Delhi'] = (map['New Delhi'] || 0) + count;
    }
    map['all'] = totalIndia;
    return map;
  }, [cities]);

  // Memoize city counts & structured groups for clear, classy dropdowns
  // Filter cities by selectedCountry to guarantee strict country-city cascading
  const filteredCities = useMemo(() => {
    if (!cities || cities.length === 0) return [];
    if (!selectedCountry || selectedCountry === 'all') return cities;
    return cities.filter(c => {
      if (!c.country) return false;
      return c.country.toLowerCase() === selectedCountry.toLowerCase();
    });
  }, [cities, selectedCountry]);

  const totalCityJobs = useMemo(() => {
    return filteredCities.reduce((sum, c) => sum + (c.count || 0), 0);
  }, [filteredCities]);

  const cityGroups = useMemo(() => {
    if (!filteredCities || filteredCities.length === 0) return { major: [], remote: [], other: [] };

    const INDIAN_MAJOR = new Set([
      'bengaluru', 'bangalore', 'hyderabad', 'pune', 'mumbai', 'delhi', 'delhi ncr', 'new delhi',
      'gurgaon', 'gurugram', 'noida', 'chennai', 'kolkata', 'ahmedabad', 'kochi',
      'jaipur', 'indore', 'chandigarh'
    ]);

    const GLOBAL_MAJOR = new Set([
      ...INDIAN_MAJOR,
      'san francisco', 'san jose', 'new york', 'seattle', 'austin', 'sunnyvale',
      'los angeles', 'chicago', 'boston', 'london', 'toronto', 'vancouver', 'berlin',
      'munich', 'dublin', 'sydney', 'paris', 'singapore', 'amsterdam', 'tokyo'
    ]);

    const activeMajorSet = (selectedCountry === 'India') ? INDIAN_MAJOR : GLOBAL_MAJOR;

    const major = [];
    const remote = [];
    const other = [];

    const sorted = [...filteredCities].sort((a, b) => (b.count || 0) - (a.count || 0));

    for (const c of sorted) {
      const lower = (c.city || '').toLowerCase().trim();
      if (lower.includes('remote') || lower.includes('anywhere')) {
        remote.push(c);
      } else if (activeMajorSet.has(lower) || activeMajorSet.has(lower.replace(/\s+/g, ''))) {
        major.push(c);
      } else {
        other.push(c);
      }
    }

    return { major, remote, other };
  }, [filteredCities, selectedCountry]);

  // Auto-reset city & corridor if current city doesn't exist in the selected country
  useEffect(() => {
    if (selectedCity && selectedCity !== 'all' && filteredCities.length > 0) {
      const cityExists = filteredCities.some(
        c => c.city.toLowerCase() === selectedCity.toLowerCase()
      );
      if (!cityExists) {
        setSelectedCity('all');
        setSelectedCorridor('all');
      }
    }
  }, [filteredCities, selectedCity]);

  const companyGroups = useMemo(() => {
    if (!stats || !stats.companies) return { tier1: [], other: [] };

    const TIER1_SET = new Set([
      'Google', 'Amazon', 'Twitter / X (xAI)', 'Netflix', 'Salesforce', 'Adobe',
      'Visa', 'Mastercard', 'OpenAI', 'Anthropic', 'Stripe', 'Figma', 'DoorDash',
      'Datadog', 'Coinbase', 'Spotify', 'Swiggy', 'Razorpay', 'PhonePe', 'Freshworks',
      'Groww', 'CRED', 'Uber', 'Cloudflare', 'GitLab', 'MongoDB', 'Elastic'
    ]);

    const tier1 = [];
    const other = [];

    for (const comp of stats.companies) {
      if (TIER1_SET.has(comp)) {
        tier1.push(comp);
      } else {
        other.push(comp);
      }
    }

    tier1.sort((a, b) => a.localeCompare(b));
    other.sort((a, b) => a.localeCompare(b));

    return { tier1, other };
  }, [stats]);

  // Derive all active filters for transparent display and individual dismissals
  const activeFilters = useMemo(() => {
    const list = [];

    if (searchQuery.trim()) {
      list.push({
        id: 'q',
        label: 'Keyword',
        value: `"${searchQuery.trim()}"`,
        onRemove: () => {
          setSearchQuery('');
          setPage(1);
        }
      });
    }

    if (selectedCountry && selectedCountry !== 'all') {
      list.push({
        id: 'country',
        label: 'Country',
        value: selectedCountry,
        onRemove: () => {
          setSelectedCountry('all');
          setSelectedCity('all');
          setPage(1);
        }
      });
    }

    if (selectedCity && selectedCity !== 'all') {
      list.push({
        id: 'city',
        label: 'Hub',
        value: selectedCity,
        onRemove: () => {
          setSelectedCity('all');
          setSelectedCorridor('all');
          setPage(1);
        }
      });
    }

    if (selectedCorridor && selectedCorridor !== 'all') {
      const corr = availableCorridors.find(c => c.key === selectedCorridor);
      list.push({
        id: 'corridor',
        label: 'Tech Corridor',
        value: corr ? (corr.shortName || corr.name) : selectedCorridor,
        onRemove: () => {
          setSelectedCorridor('all');
          setPage(1);
        }
      });
    }

    if (experienceLevel && experienceLevel !== 'all') {
      const expLabels = {
        freshers: 'Freshers (0–1y)',
        mid: 'Mid-Level (2–5y)',
        senior: 'Senior & Staff (5y+)'
      };
      list.push({
        id: 'experience',
        label: 'Experience',
        value: expLabels[experienceLevel] || experienceLevel,
        onRemove: () => {
          setExperienceLevel('all');
          setPage(1);
        }
      });
    }

    if (workModeFilter && workModeFilter !== 'all') {
      const modeLabels = {
        onsite: 'On-site',
        hybrid: 'Hybrid',
        remote: 'Remote',
        unknown: 'Unspecified'
      };
      list.push({
        id: 'workMode',
        label: 'Work Mode',
        value: modeLabels[workModeFilter] || workModeFilter,
        onRemove: () => {
          setWorkModeFilter('all');
          setPage(1);
        }
      });
    }

    if (companyFilter && companyFilter !== 'all') {
      list.push({
        id: 'company',
        label: 'Company',
        value: companyFilter,
        onRemove: () => {
          setCompanyFilter('all');
          setPage(1);
        }
      });
    }

    if (statusFilter && statusFilter !== 'open') {
      list.push({
        id: 'status',
        label: 'Status',
        value: statusFilter === 'all' ? 'All (Open + Closed)' : 'Closed Only',
        onRemove: () => {
          setStatusFilter('open');
          setPage(1);
        }
      });
    }

    if (techOnlyJobs) {
      list.push({
        id: 'techOnly',
        label: 'Domain',
        value: 'Tech Roles Only',
        onRemove: () => {
          setTechOnlyJobs(false);
          setPage(1);
        }
      });
    }

    if (onlyEligibleJobs && isAuthenticated && candidateProfile) {
      list.push({
        id: 'onlyEligible',
        label: 'Eligibility',
        value: `Eligible Only (${candidateProfile.country || 'Global'})`,
        onRemove: () => {
          setOnlyEligibleJobs(false);
          setPage(1);
        }
      });
    }

    return list;
  }, [searchQuery, selectedCountry, selectedCity, selectedCorridor, availableCorridors, experienceLevel, workModeFilter, companyFilter, statusFilter, techOnlyJobs, onlyEligibleJobs, isAuthenticated, candidateProfile]);

  const hasNonDefaultFilters = useMemo(() => {
    return activeFilters.length > 0;
  }, [activeFilters]);

  // Compute displayed jobs, with filtering for candidate eligibility across country & seniority
  const displayedJobs = useMemo(() => {
    if (!onlyEligibleJobs || !isAuthenticated || !candidateProfile) return jobs;
    return jobs.filter((job) => {
      const qm = getJobMatchQuick(job, candidateProfile);
      if (!qm) return false;
      return qm.overall.canApply && !qm.overall.isHardBlocker && qm.overall.status !== 'NOT_ELIGIBLE';
    });
  }, [jobs, onlyEligibleJobs, isAuthenticated, candidateProfile]);

  const formatDate = (isoString) => {
    if (!isoString) return 'N/A';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return isoString;
    }
  };

  const getSourceBadgeClass = (source) => {
    switch (source) {
      case 'greenhouse': return 'badge-greenhouse';
      case 'lever': return 'badge-lever';
      case 'ashby': return 'badge-ashby';
      case 'smartrecruiters': return 'badge-smartrecruiters';
      case 'workday': return 'badge-workday';
      case 'amazon': return 'badge-amazon';
      case 'google': return 'badge-google';
      case 'eightfold': return 'badge-eightfold';
      case 'adzuna': return 'badge-adzuna';
      default: return 'badge-default';
    }
  };

  const getWorkModeBadgeClass = (mode) => {
    switch (mode) {
      case 'remote': return 'mode-remote';
      case 'hybrid': return 'mode-hybrid';
      case 'onsite': return 'mode-onsite';
      default: return 'mode-unknown';
    }
  };

  const handleGoHome = () => {
    setActiveTab('jobs');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="app-shell" data-theme={theme}>
      {/* Sidebar Navigation */}
      <aside className="app-sidebar">
        <div
          className="sidebar-brand"
          onClick={handleGoHome}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleGoHome();
            }
          }}
          role="button"
          tabIndex={0}
          title="Go to Home (Live jobs)"
        >
          <div className="brand-logo-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="9" />
              <line x1="12" y1="3" x2="12" y2="7" />
              <line x1="12" y1="17" x2="12" y2="21" />
              <line x1="3" y1="12" x2="7" y2="12" />
              <line x1="17" y1="12" x2="21" y2="12" />
            </svg>
          </div>
          <div className="brand-text-block">
            <h2 className="brand-title">JobRadar</h2>
            <span className="brand-tagline">Verified Multi-ATS Job Search</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeTab === 'jobs' ? 'active' : ''}`}
            onClick={() => setActiveTab('jobs')}
            id="tab-jobs"
          >
            <span className="nav-item-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
            </span>
            <span className="nav-item-text">Live jobs</span>
            {meta.totalInDb > 0 && <span className="nav-item-badge">{meta.totalInDb.toLocaleString()}</span>}
          </button>

          <button
            className={`nav-item ${activeTab === 'directory' ? 'active' : ''}`}
            onClick={() => setActiveTab('directory')}
            id="tab-directory"
          >
            <span className="nav-item-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
                <line x1="9" y1="22" x2="9" y2="22.01" />
                <line x1="15" y1="22" x2="15" y2="22.01" />
                <line x1="9" y1="6" x2="9" y2="6.01" />
                <line x1="15" y1="6" x2="15" y2="6.01" />
                <line x1="9" y1="10" x2="9" y2="10.01" />
                <line x1="15" y1="10" x2="15" y2="10.01" />
                <line x1="9" y1="14" x2="9" y2="14.01" />
                <line x1="15" y1="14" x2="15" y2="14.01" />
                <line x1="9" y1="18" x2="9" y2="18.01" />
                <line x1="15" y1="18" x2="15" y2="18.01" />
              </svg>
            </span>
            <span className="nav-item-text">Company directory</span>
            {companyCount > 0 && <span className="nav-item-badge">{companyCount}</span>}
          </button>

          <button
            className={`nav-item ${activeTab === 'reachout' ? 'active' : ''}`}
            onClick={() => setActiveTab('reachout')}
            id="tab-reachout"
          >
            <span className="nav-item-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="6" />
                <circle cx="12" cy="12" r="2" />
              </svg>
            </span>
            <span className="nav-item-text">Outreach pipeline</span>
            {reachOutCount > 0 && <span className="nav-item-badge">{reachOutCount}</span>}
          </button>
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="app-main-area">
        <header className="main-topbar">
          {/* Mobile Topbar Brand Block (Active on Mobile/Tablet screens) */}
          <div
            className="topbar-mobile-brand"
            onClick={handleGoHome}
            role="button"
            tabIndex={0}
            title="Go to Home"
          >
            <div className="mobile-brand-logo-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="9" />
                <line x1="12" y1="3" x2="12" y2="7" />
                <line x1="12" y1="17" x2="12" y2="21" />
                <line x1="3" y1="12" x2="7" y2="12" />
                <line x1="17" y1="12" x2="21" y2="12" />
              </svg>
            </div>
            <div className="mobile-brand-info">
              <span className="mobile-brand-title">JobRadar</span>
              <span className="mobile-brand-tag">Verified ATS</span>
            </div>
          </div>

          <div className="topbar-title-block">
            <h1 className="page-heading">
              {activeTab === 'jobs' && 'Live jobs'}
              {activeTab === 'directory' && 'Company directory'}
              {activeTab === 'reachout' && 'Outreach pipeline'}
            </h1>
            <p className="page-subheading">
              {activeTab === 'jobs' && 'Real-time verified job openings directly from ATS boards.'}
              {activeTab === 'directory' && 'Discover verified employers and track your outreach.'}
              {activeTab === 'reachout' && 'Proactive outreach to companies before jobs are posted publicly.'}
            </p>
          </div>

          <div className="topbar-actions">
            {/* Contextual Region Scope Switcher (Live Jobs View) */}
            {activeTab === 'jobs' && (
              <div className="topbar-scope-switch" role="group" aria-label="Job region filter">
                <button
                  type="button"
                  id="scope-india-btn"
                  className={`scope-switch-btn ${selectedCountry === 'India' ? 'is-active' : ''}`}
                  onClick={() => {
                    setSelectedCountry('India');
                    setSelectedCity('all');
                    setPage(1);
                  }}
                  title="Filter jobs located in India"
                >
                  <span className="scope-flag">🇮🇳</span>
                  <span className="scope-label">India</span>
                </button>
                <button
                  type="button"
                  id="scope-worldwide-btn"
                  className={`scope-switch-btn ${selectedCountry !== 'India' ? 'is-active' : ''}`}
                  onClick={() => {
                    setSelectedCountry('all');
                    setSelectedCity('all');
                    setPage(1);
                  }}
                  title="Show all verified jobs worldwide across all countries"
                >
                  <span className="scope-flag">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="2" y1="12" x2="22" y2="12" />
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                  </span>
                  <span className="scope-label">
                    {selectedCountry !== 'all' && selectedCountry !== 'India' ? selectedCountry : 'Worldwide'}
                  </span>
                </button>
              </div>
            )}

            <button
              className={`sync-action-btn ${isSyncing ? 'is-syncing' : ''}`}
              onClick={handleTriggerSync}
              disabled={isSyncing}
              title={isSyncing ? "Sync in progress..." : "Fetch latest jobs from ATS boards"}
              id="sync-jobs-btn"
            >
              <span className={`sync-icon ${isSyncing ? 'spin-animation' : ''}`}>
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
              </span>
              <span className="sync-text">{isSyncing ? 'Syncing...' : 'Sync Jobs'}</span>
            </button>

            <div className="topbar-divider" />

            <button
              className="theme-switch-btn"
              onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
              title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
              id="theme-toggle-btn"
              aria-label="Toggle color theme"
            >
              {theme === 'light' ? (
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              )}
            </button>

            <div className="ats-live-pill" id="source-indicator" title="Connected to ATS boards with real-time verification">
              <span className="live-dot" />
              <span>Live ATS Verified</span>
            </div>

            {/* User Profile or Sign In Button */}
            {isAuthenticated ? (
              <div className="user-profile-badge" title={`Signed in as ${user?.email || 'User'}`}>
                <div className="user-avatar-monogram">
                  {user?.name ? user.name.slice(0, 2).toUpperCase() : (user?.email ? user.email.slice(0, 2).toUpperCase() : 'UR')}
                </div>
                <div className="user-meta-col">
                  <span className="user-display-name">{user?.name || user?.email?.split('@')[0]}</span>
                </div>
                <button
                  type="button"
                  className="user-logout-btn"
                  onClick={logout}
                  title="Sign out of JobRadar"
                  id="header-logout-btn"
                >
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  <span>Sign Out</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="auth-topbar-btn"
                onClick={() => openAuthModal()}
                title="Sign in or create free account"
                id="header-signin-btn"
              >
                <span className="auth-btn-text">Sign In</span>
              </button>
            )}
          </div>
        </header>

        {syncToast && (
          <div className={`sync-toast-banner ${syncToast.type}`} role="status">
            <span className="toast-text">{syncToast.message}</span>
            <button className="toast-close" onClick={() => setSyncToast(null)} aria-label="Close notification">×</button>
          </div>
        )}

        <div className="main-content-body">

          {/* View 1: Company Directory */}
          {activeTab === 'directory' && (
            <CompanyDirectory
              cities={directoryCities}
              onRefreshMeta={fetchDirectoryMeta}
            />
          )}

          {/* View 2: Reach Out View */}
          {activeTab === 'reachout' && (
            <ReachOutView
              cities={directoryCities}
              onNavigateToDirectory={() => setActiveTab('directory')}
              onPipelineChange={fetchDirectoryMeta}
            />
          )}

          {/* View 3: Live Jobs View */}
          {activeTab === 'jobs' && (
            <div className="live-jobs-container">
              {/* Aggregate Stats Ribbon */}
              <section className="stats-ribbon" aria-label="Job Statistics">
                <div className="stat-card">
                  <span className="stat-label">Total Tracked Jobs</span>
                  <span className="stat-value">{stats ? stats.total.toLocaleString() : meta.totalInDb.toLocaleString()}</span>
                  <span className="stat-subtext">Across {stats ? stats.companiesCount : 0} companies</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Currently Open</span>
                  <span className="stat-value text-green">
                    {stats ? stats.open.toLocaleString() : meta.openTotal.toLocaleString()}
                  </span>
                  <span className="stat-subtext">Verified active postings</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Cities With Openings</span>
                  <span className="stat-value text-purple">
                    {cities.length}
                  </span>
                  <span className="stat-subtext">
                    {selectedCountry === 'India' ? 'Across India' : (selectedCountry !== 'all' ? `In ${selectedCountry}` : 'Worldwide')}
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Matching Current View</span>
                  <span className="stat-value text-blue">{meta.total.toLocaleString()}</span>
                  <span className="stat-subtext">Filtered results</span>
                </div>
              </section>

              {/* Pan-India Tech Hub & Corridors Selector */}
              <div className="tech-hubs-container">
                <div className="tech-hubs-bar">
                  {PRIMARY_TECH_HUBS.map((hub) => {
                    const isSelected = (hub.key === 'all' && selectedCity === 'all') || selectedCity.toLowerCase() === hub.key.toLowerCase();
                    const count = hubCityCounts[hub.key] || 0;
                    const hubClass = `hub-pill-${hub.key.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
                    return (
                      <button
                        key={hub.key}
                        type="button"
                        className={`tech-hub-pill ${isSelected ? 'active' : ''} ${hubClass}`}
                        onClick={() => {
                          if (hub.key === 'all') {
                            setSelectedCity('all');
                            setSelectedCountry('India');
                          } else {
                            setSelectedCity(hub.key);
                            setSelectedCountry('India');
                          }
                          setSelectedCorridor('all');
                          setPage(1);
                        }}
                      >
                        <span className="tech-hub-name">{hub.name}</span>
                        {count > 0 && (
                          <span className="tech-hub-count">
                            {count > 999 ? `${(count / 1000).toFixed(1)}k` : count}
                          </span>
                        )}
                      </button>
                    );
                  })}

                  {/* Prominent Quick Map View Toggle */}
                  <button
                    type="button"
                    id="tech-hubs-map-btn"
                    className={`tech-hub-pill map-quick-toggle ${viewMode === 'map' ? 'active' : ''}`}
                    onClick={() => {
                      setViewMode(viewMode === 'map' ? 'grid' : 'map');
                      const anchor = document.getElementById('results-header-anchor');
                      if (anchor) anchor.scrollIntoView({ behavior: 'smooth' });
                    }}
                    title="Toggle Interactive GIS Tech Corridor Map"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '5px' }}>
                      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                      <line x1="8" y1="2" x2="8" y2="18" />
                      <line x1="16" y1="6" x2="16" y2="22" />
                    </svg>
                    <span>{viewMode === 'map' ? 'Exit Map View' : 'Corridor Map View'}</span>
                  </button>
                </div>

                {/* Dynamic Micro-Corridors Bar */}
                {availableCorridors.length > 0 && (
                  <div className="corridors-bar">
                    <span className="corridors-label">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                      </svg>
                      Corridors:
                    </span>
                    <button
                      type="button"
                      className={`corridor-chip ${selectedCorridor === 'all' ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedCorridor('all');
                        setPage(1);
                      }}
                    >
                      All {selectedCity}
                    </button>
                    {availableCorridors.map((c) => (
                      <button
                        key={c.key}
                        type="button"
                        className={`corridor-chip ${selectedCorridor === c.key ? 'active' : ''}`}
                        onClick={() => {
                          setSelectedCorridor(c.key);
                          setPage(1);
                        }}
                      >
                        <span>{c.shortName || c.name}</span>
                        {c.count > 0 && <span className="corridor-count">({c.count})</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Filter Card */}
              <section className="filter-card" aria-label="Filters">
                <div className="filter-card-header">
                  <div className="filter-header-title">
                    <span className="filter-header-icon-badge">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                      </svg>
                    </span>
                    <span className="filter-header-title-text">Filter Openings</span>
                    {activeFilters.length > 0 && (
                      <span className="filter-active-count-badge">
                        <span className="filter-pulse-dot" />
                        {activeFilters.length} active
                      </span>
                    )}
                  </div>
                  <div className="filter-header-right-actions">
                    <button
                      type="button"
                      id="mobile-filter-expand-btn"
                      className="mobile-filter-expand-btn"
                      onClick={() => setMobileFiltersExpanded(prev => !prev)}
                      aria-expanded={mobileFiltersExpanded}
                      title={mobileFiltersExpanded ? "Collapse additional filters" : "Show more filter options"}
                    >
                      <span>{mobileFiltersExpanded ? 'Less Filters' : 'More Filters'}</span>
                      <svg
                        viewBox="0 0 24 24"
                        width="12"
                        height="12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        style={{ transform: mobileFiltersExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>

                    {hasNonDefaultFilters && (
                      <button
                        type="button"
                        id="clear-filters-btn"
                        className="filter-reset-header-btn"
                        onClick={handleResetFilters}
                        title="Reset all filters to default"
                      >
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                          <path d="M3 3v5h5" />
                        </svg>
                        Reset Filters
                      </button>
                    )}
                  </div>
                </div>

                <div className={`filter-grid ${mobileFiltersExpanded ? 'is-mobile-expanded' : ''}`}>
                  {/* Search Box */}
                  <div className="input-group">
                    <label htmlFor="search-title-input" className="native-sr-only">Job Title / Keyword</label>
                    <div className="input-field-wrapper">
                      <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                      <input
                        id="search-title-input"
                        type="text"
                        className="custom-input"
                        placeholder="Search position (e.g. SRE, Frontend, Manager)..."
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setPage(1);
                        }}
                      />
                    </div>
                  </div>

                  {/* Country Dropdown */}
                  <div className="input-group">
                    <label htmlFor="filter-country-select" className="native-sr-only">Country</label>
                    <div className="filter-dropdown-wrapper">
                      <span className="filter-select-icon icon-country" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                      </span>
                      <select
                        id="filter-country-select"
                        className="custom-select custom-select-with-icon"
                        value={selectedCountry}
                        onChange={(e) => {
                          const nextCountry = e.target.value;
                          setSelectedCountry(nextCountry);
                          setSelectedCity('all');
                          setSelectedCorridor('all');
                          setPage(1);
                        }}
                      >
                        <option value="all">All Countries (Global)</option>
                        <option value="India">
                          India ({countries.find(c => c.country === 'India')?.count || 0} jobs)
                        </option>
                        <optgroup label="International Countries">
                          {countries
                            .filter(c => c.country && c.country !== 'India')
                            .map(c => (
                              <option key={c.country} value={c.country}>
                                {c.country} ({c.count} {c.count === 1 ? 'job' : 'jobs'})
                              </option>
                            ))}
                        </optgroup>
                      </select>
                    </div>
                  </div>

                  {/* City Dropdown */}
                  <div className="input-group">
                    <label htmlFor="filter-city-select" className="native-sr-only">City</label>
                    <div className="filter-dropdown-wrapper">
                      <span className="filter-select-icon icon-city" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                      </span>
                      <select
                        id="filter-city-select"
                        className="custom-select custom-select-with-icon"
                        value={selectedCity}
                        onChange={(e) => {
                          setSelectedCity(e.target.value);
                          setPage(1);
                        }}
                      >
                        <option value="all">
                          {selectedCountry === 'India'
                            ? `All Indian Cities (${totalCityJobs} jobs)`
                            : selectedCountry !== 'all'
                              ? `All Cities in ${selectedCountry} (${totalCityJobs} jobs)`
                              : `All Cities Worldwide (${totalCityJobs} jobs)`}
                        </option>
                        {cityGroups.remote.length > 0 && (
                          <optgroup label="Remote and Distributed">
                            {cityGroups.remote.map((c) => (
                              <option key={c.city} value={c.city}>
                                {c.city} ({c.count} {c.count === 1 ? 'job' : 'jobs'})
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {cityGroups.major.length > 0 && (
                          <optgroup label={selectedCountry === 'India' ? 'Major Indian Tech Hubs' : (selectedCountry !== 'all' ? `Major Tech Hubs in ${selectedCountry}` : 'Major Hubs')}>
                            {cityGroups.major.map((c) => (
                              <option key={c.city} value={c.city}>
                                {c.city} {c.state ? `(${c.state})` : ''} ({c.count} {c.count === 1 ? 'job' : 'jobs'})
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {cityGroups.other.length > 0 && (
                          <optgroup label={selectedCountry === 'India' ? 'Other Cities and Tech Clusters' : 'Other Locations'}>
                            {cityGroups.other.slice(0, 100).map((c) => (
                              <option key={c.city} value={c.city}>
                                {c.city} ({c.count} {c.count === 1 ? 'job' : 'jobs'})
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </div>
                  </div>

                  {/* Work Mode Filter */}
                  <div className="input-group">
                    <label htmlFor="filter-workmode-select" className="native-sr-only">Work Mode</label>
                    <div className="filter-dropdown-wrapper">
                      <span className="filter-select-icon icon-workmode" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                      </span>
                      <select
                        id="filter-workmode-select"
                        className="custom-select custom-select-with-icon"
                        value={workModeFilter}
                        onChange={(e) => {
                          setWorkModeFilter(e.target.value);
                          setPage(1);
                        }}
                      >
                        <option value="all">All Work Modes</option>
                        <option value="onsite">On-site Work</option>
                        <option value="hybrid">Hybrid (Office + Remote)</option>
                        <option value="remote">Remote</option>
                        <option value="unknown">Unspecified Location</option>
                      </select>
                    </div>
                  </div>

                  {/* Company Filter */}
                  {stats && stats.companies && stats.companies.length > 0 && (
                    <div className="input-group">
                      <label htmlFor="filter-company-select" className="native-sr-only">Company</label>
                      <div className="filter-dropdown-wrapper">
                        <span className="filter-select-icon icon-company" aria-hidden="true">
                          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                        </span>
                        <select
                          id="filter-company-select"
                          className="custom-select custom-select-with-icon"
                          value={companyFilter}
                          onChange={(e) => {
                            setCompanyFilter(e.target.value);
                            setPage(1);
                          }}
                        >
                          <option value="all">All Companies ({stats.companies.length})</option>
                          {companyGroups.tier1.length > 0 && (
                            <optgroup label="Tier-1 Product Companies">
                              {companyGroups.tier1.map((comp) => (
                                <option key={comp} value={comp}>{comp}</option>
                              ))}
                            </optgroup>
                          )}
                          {companyGroups.other.length > 0 && (
                            <optgroup label="Other Tech Companies">
                              {companyGroups.other.map((comp) => (
                                <option key={comp} value={comp}>{comp}</option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Experience Level Filter (Integrated Classy Segmented Control) */}
                  <div className="input-group filter-group-experience">
                    <label htmlFor="filter-experience-select" className="native-sr-only">Experience Level</label>
                    <div className="experience-segmented" role="group" aria-label="Experience level filter">
                      <button
                        type="button"
                        className={`segmented-option exp-option-all ${experienceLevel === 'all' ? 'active' : ''}`}
                        onClick={() => { setExperienceLevel('all'); setPage(1); }}
                        title="Show all verified roles across all seniority levels"
                      >
                        <span className="exp-sig-dot dot-all" />
                        <span>All Exp</span>
                      </button>
                      <button
                        type="button"
                        className={`segmented-option exp-option-freshers ${experienceLevel === 'freshers' ? 'active' : ''}`}
                        onClick={() => { setExperienceLevel('freshers'); setPage(1); }}
                        title="Filter entry-level &amp; fresher roles (0 to 1 year experience)"
                      >
                        <span className="exp-sig-dot dot-freshers" />
                        <span>Freshers (0–1y)</span>
                        <span className="exp-badge-pill badge-freshers">Entry</span>
                      </button>
                      <button
                        type="button"
                        className={`segmented-option exp-option-mid ${experienceLevel === 'mid' ? 'active' : ''}`}
                        onClick={() => { setExperienceLevel('mid'); setPage(1); }}
                        title="Filter mid-level roles (2 to 5 years experience)"
                      >
                        <span className="exp-sig-dot dot-mid" />
                        <span>Mid (2–5y)</span>
                      </button>
                      <button
                        type="button"
                        className={`segmented-option exp-option-senior ${experienceLevel === 'senior' ? 'active' : ''}`}
                        onClick={() => { setExperienceLevel('senior'); setPage(1); }}
                        title="Filter senior, lead, and staff roles (5+ years experience)"
                      >
                        <span className="exp-sig-dot dot-senior" />
                        <span>Senior (5y+)</span>
                        <span className="exp-badge-pill badge-senior">Lead</span>
                      </button>
                    </div>

                    {/* Preserved accessible select for automated tests & form identification */}
                    <select
                      id="filter-experience-select"
                      className="native-checkbox-sr"
                      value={experienceLevel}
                      onChange={(e) => {
                        setExperienceLevel(e.target.value);
                        setPage(1);
                      }}
                      tabIndex={-1}
                      aria-hidden="true"
                    >
                      <option value="all">All Experience Levels</option>
                      <option value="freshers">Freshers &amp; Early Career (0–1y)</option>
                      <option value="mid">Mid-Level Roles (2–5y)</option>
                      <option value="senior">Senior &amp; Staff (5y+)</option>
                    </select>
                  </div>

                  {/* Status Filter */}
                  <div className="input-group">
                    <label htmlFor="filter-status-select" className="native-sr-only">Status</label>
                    <div className="filter-dropdown-wrapper">
                      <span className="filter-select-icon icon-status" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      </span>
                      <select
                        id="filter-status-select"
                        className="custom-select custom-select-with-icon"
                        value={statusFilter}
                        onChange={(e) => {
                          setStatusFilter(e.target.value);
                          setPage(1);
                        }}
                      >
                        <option value="open">Active and Open Postings Only</option>
                        <option value="all">All Postings (Active + Archived)</option>
                        <option value="closed">Closed Postings Only</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Active Filters Row (Clearly Displays Every Active Filter with Dismiss Buttons) */}
                {activeFilters.length > 0 && (
                  <div className="filter-active-chips-strip">
                    <span className="chips-strip-label">Applied Filters:</span>
                    <div className="chips-strip-tags">
                      {activeFilters.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          className={`active-filter-chip chip-${f.id}`}
                          onClick={f.onRemove}
                          title={`Click to remove ${f.label} filter`}
                        >
                          <span className="chip-key">{f.label}:</span>
                          <span className="chip-val">{f.value}</span>
                          <span className="chip-del-btn" aria-hidden="true">×</span>
                        </button>
                      ))}
                      {hasNonDefaultFilters && (
                        <button
                          type="button"
                          className="chips-clear-all-btn"
                          onClick={handleResetFilters}
                          title="Reset all filters to default"
                        >
                          Clear All
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Secondary Filter Row: Tech & Coding Roles Toggle + Only Eligible Toggle + CV Match Bar */}
                <div className="filter-row-secondary">
                  <div className="secondary-toggles-cluster">
                    <label className={`tech-toggle-pill ${techOnlyJobs ? 'active' : ''}`} htmlFor="tech-jobs-toggle">
                      <input
                        id="tech-jobs-toggle"
                        type="checkbox"
                        checked={techOnlyJobs}
                        onChange={(e) => {
                          setTechOnlyJobs(e.target.checked);
                          setPage(1);
                        }}
                        className="native-checkbox-sr"
                      />
                      <span className="toggle-pill-icon">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="16 18 22 12 16 6" />
                          <polyline points="8 6 2 12 8 18" />
                        </svg>
                      </span>
                      <span className="toggle-pill-text">Tech & Engineering Roles Only</span>
                      {techOnlyJobs && (
                        <span className="toggle-active-badge">Active</span>
                      )}
                    </label>

                    <label
                      className={`eligible-toggle-pill ${onlyEligibleJobs ? 'active' : ''}`}
                      htmlFor="eligible-jobs-toggle"
                      title={
                        !isAuthenticated
                          ? 'Sign in required to filter by eligibility'
                          : (candidateProfile ? `Filter roles based on your eligibility (${candidateProfile.country}, ${candidateProfile.experienceDisplay})` : 'Upload CV or Portfolio to check eligibility across jobs')
                      }
                    >
                      <input
                        id="eligible-jobs-toggle"
                        type="checkbox"
                        checked={isAuthenticated && onlyEligibleJobs}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          if (checked && !isAuthenticated) {
                            openAuthModal('Please sign in or create an account to filter jobs by your CV eligibility.', 'login');
                            return;
                          }
                          if (checked && !candidateProfile) {
                            setIsProfileModalOpen(true);
                            return;
                          }
                          setOnlyEligibleJobs(checked);
                          setPage(1);
                        }}
                        className="native-checkbox-sr"
                      />
                      <span className="toggle-pill-icon">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </svg>
                      </span>
                      <span className="toggle-pill-text">Show Eligible Roles Only</span>
                      {isAuthenticated && onlyEligibleJobs && (
                        <span className="toggle-active-badge eligible-badge">Active</span>
                      )}
                    </label>
                  </div>

                  {/* Candidate Profile / CV Match Bar Trigger */}
                  <button
                    type="button"
                    className={`btn-candidate-profile-trigger ${isAuthenticated && candidateProfile ? 'has-profile' : ''}`}
                    onClick={() => {
                      if (!isAuthenticated) {
                        openAuthModal('Please sign in or create an account to upload your CV and match your job eligibility.', 'login');
                        return;
                      }
                      setIsProfileModalOpen(true);
                    }}
                    title={
                      !isAuthenticated
                        ? 'Sign in required to upload CV or portfolio'
                        : (candidateProfile
                          ? `Active CV Profile: ${candidateProfile.country}, ${candidateProfile.experienceDisplay || `${candidateProfile.totalYearsExperience} Yrs Exp`}`
                          : 'Upload your CV in PDF or enter portfolio URL to check eligibility across jobs')
                    }
                    id="match-profile-trigger-btn"
                  >
                    <span className="profile-trigger-icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                      </svg>
                    </span>
                    <span className="profile-trigger-content">
                      {isAuthenticated && candidateProfile ? (
                        <>
                          <span className="cv-status-pulse" />
                          <span className="trigger-lead">CV Active:</span>
                          <span className="trigger-detail">
                            {candidateProfile.country} • {candidateProfile.experienceDisplay || (candidateProfile.totalExperienceMonths ? `${candidateProfile.totalExperienceMonths} Mos` : `${candidateProfile.totalYearsExperience || 0} Yrs`)} • {candidateProfile.skills?.length || 0} Skills
                          </span>
                          <span className="trigger-update-tag">Edit</span>
                        </>
                      ) : (
                        <>
                          <span className="trigger-lead">+ Match My CV / Portfolio</span>
                          <span className="trigger-hint">{!isAuthenticated ? '(Sign In Required)' : '(Check Eligibility)'}</span>
                        </>
                      )}
                    </span>
                  </button>
                </div>
              </section>

              {/* Results Container */}
              <div className="results-container" id="results-header-anchor">
                <div className="results-header">
                  <div className="results-count" id="results-count-text">
                    Showing <strong>{displayedJobs.length}</strong> of <strong>{meta.total}</strong> verified roles
                  </div>

                  <div className="results-controls-cluster">

                    {/* View Mode Switcher */}
                    <div className="view-mode-segmented" role="group" aria-label="View layout switch">
                      <button
                        type="button"
                        className={`segmented-option view-btn-grid ${viewMode === 'grid' ? 'active' : ''}`}
                        onClick={() => setViewMode('grid')}
                        title="Switch to Radar Grid View"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" style={{ marginRight: '5px', verticalAlign: '-1px' }}>
                          <rect x="3" y="3" width="7" height="7" rx="1.5" />
                          <rect x="14" y="3" width="7" height="7" rx="1.5" />
                          <rect x="14" y="14" width="7" height="7" rx="1.5" />
                          <rect x="3" y="14" width="7" height="7" rx="1.5" />
                        </svg>
                        <span className="view-mode-label-long">Radar Grid</span>
                        <span className="view-mode-label-short">Grid</span>
                      </button>
                      <button
                        type="button"
                        className={`segmented-option view-btn-table ${viewMode === 'table' ? 'active' : ''}`}
                        onClick={() => setViewMode('table')}
                        title="Switch to Structured Table View"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" style={{ marginRight: '5px', verticalAlign: '-1px' }}>
                          <line x1="3" y1="6" x2="21" y2="6" />
                          <line x1="3" y1="12" x2="21" y2="12" />
                          <line x1="3" y1="18" x2="21" y2="18" />
                        </svg>
                        <span>Table</span>
                      </button>
                      <button
                        type="button"
                        className={`segmented-option view-btn-map ${viewMode === 'map' ? 'active' : ''}`}
                        onClick={() => setViewMode('map')}
                        title="Interactive GIS Tech Corridor Map"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" style={{ marginRight: '5px', verticalAlign: '-1px' }}>
                          <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                          <line x1="8" y1="2" x2="8" y2="18" />
                          <line x1="16" y1="6" x2="16" y2="22" />
                        </svg>
                        <span className="view-mode-label-long">Corridor Map</span>
                        <span className="view-mode-label-short">Map</span>
                      </button>
                    </div>

                    {/* Per Page Select */}
                    <select
                      id="page-limit-select"
                      className="custom-select"
                      style={{ width: '84px', padding: '6px 8px', fontSize: '12.5px' }}
                      value={limit}
                      onChange={(e) => {
                        setLimit(Number(e.target.value));
                        setPage(1);
                      }}
                    >
                      <option value={12}>12 / pg</option>
                      <option value={24}>24 / pg</option>
                      <option value={48}>48 / pg</option>
                      <option value={96}>96 / pg</option>
                    </select>
                  </div>
                </div>

                {viewMode === 'map' ? (
                  <TechCorridorMapView
                    selectedCity={selectedCity}
                    selectedCorridor={selectedCorridor}
                    onSelectCity={(city) => {
                      setSelectedCity(city);
                      setPage(1);
                    }}
                    onSelectCorridor={(corridorKey) => {
                      setSelectedCorridor(corridorKey);
                      setPage(1);
                    }}
                    availableCorridors={availableCorridors}
                    jobs={displayedJobs}
                    loading={loading}
                    onOpenApply={(job) => window.open(job.applyUrl, '_blank')}
                    onOpenCvTailor={(job) => setEligibilityJob(job)}
                    onOpenEligibility={(job) => setEligibilityJob(job)}
                    onRefreshJobs={fetchJobs}
                  />
                ) : loading ? (
                  <div className="state-box">
                    <div className="spinner" id="loading-spinner" />
                    <p className="state-title">Loading live jobs...</p>
                  </div>
                ) : error ? (
                  <div className="state-box">
                    <p className="state-title" style={{ color: '#f87171' }}>Connection Error</p>
                    <p className="state-desc">{error}</p>
                    <button className="clear-btn" onClick={fetchJobs}>Retry</button>
                  </div>
                ) : jobs.length === 0 ? (
                  <div className="state-box">
                    <p className="state-title">No jobs found</p>
                    <p className="state-desc">Try loosening your search terms or selecting "All Cities".</p>
                    <button className="clear-btn" onClick={handleResetFilters}>Clear Filters</button>
                  </div>
                ) : (
                  <>
                    {viewMode === 'grid' ? (
                      <div className="radar-grid" id="jobs-grid">
                        {displayedJobs.map((job) => {
                          const rawLoc = job.locationRaw || job.location || 'Unspecified';
                          const countryTag = job.country && job.country !== 'India' ? ` (${job.country})` : '';
                          const displayCity = job.city
                            ? `${job.city}${job.state ? `, ${job.state}` : ''}${countryTag}`
                            : (job.workMode === 'remote'
                              ? (job.country ? `Remote (${job.country})` : 'Remote / Global')
                              : `${rawLoc}${countryTag && !rawLoc.toLowerCase().includes(job.country.toLowerCase()) ? countryTag : ''}`);

                          const quickMatch = (isAuthenticated && candidateProfile) ? getJobMatchQuick(job, candidateProfile) : null;
                          const monogram = (job.company || 'JR').slice(0, 2).toUpperCase();

                          return (
                            <div key={job._id || `${job.source}-${job.sourceJobId}`} className="radar-card">
                              <div>
                                <div className="radar-card-header">
                                  <div className="radar-card-company">
                                    <div className="radar-company-monogram">{monogram}</div>
                                    <div>
                                      <div className="radar-company-name">{job.company}</div>
                                      <span className={`radar-source-pill ${getSourceBadgeClass(job.source)}`}>
                                        {job.source}
                                      </span>
                                    </div>
                                  </div>
                                  <span className={`status-badge ${job.status}`}>
                                    <span className="status-dot" />
                                    {job.status}
                                  </span>
                                </div>

                                <div className="radar-card-title" title={job.title}>
                                  {job.title}
                                </div>

                                {/* Live Eligibility Match Indicator */}
                                {isAuthenticated && candidateProfile && quickMatch && (
                                  <div
                                    className={`job-row-match-pill ${quickMatch.overall.badgeTone}`}
                                    style={{ marginBottom: '10px', width: 'fit-content', cursor: 'pointer' }}
                                    onClick={() => setEligibilityJob(job)}
                                    title={`Click for breakdown: ${quickMatch.overall.summary}`}
                                  >
                                    <span className="match-pill-dot" />
                                    <span className="match-pill-text">
                                      {quickMatch.overall.isHardBlocker
                                        ? 'Work Authorization Required'
                                        : `${quickMatch.overall.score}% Match • ${quickMatch.overall.status === 'ELIGIBLE' ? 'Eligible' : 'Partial Fit'}`}
                                    </span>
                                  </div>
                                )}

                                <div className="radar-card-meta">
                                  <div className="radar-location-row">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                                      <circle cx="12" cy="10" r="3" />
                                    </svg>
                                    <span>{job.locality ? `${job.locality}, ${job.city || 'India'}` : displayCity}</span>
                                  </div>

                                  <div className="radar-tags-row">
                                    <span className={`mode-badge ${getWorkModeBadgeClass(job.workMode)}`}>
                                      {job.workMode || 'onsite'}
                                    </span>

                                    {job.techCorridor && (
                                      <span className="radar-tag corridor">
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                          <polygon points="12 2 2 7 12 12 22 7 12 2" />
                                          <polyline points="2 17 12 22 22 17" />
                                          <polyline points="2 12 12 17 22 12" />
                                        </svg>
                                        {job.locality || job.techCorridor.replace(/_/g, ' ')}
                                      </span>
                                    )}

                                    {job.fresherFriendly && (
                                      <span className="radar-tag fresher">Freshers (0–1y)</span>
                                    )}

                                    {job.seniority && !job.fresherFriendly && (
                                      <span className="radar-tag">{job.seniority}</span>
                                    )}

                                    {job.roleFamily && job.roleFamily !== 'other' && (
                                      <span className="radar-tag">{job.roleFamily.replace(/_/g, ' ')}</span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="radar-card-actions">
                                <button
                                  type="button"
                                  className={`radar-btn-secondary ${isAuthenticated && candidateProfile ? (quickMatch?.overall?.badgeTone || '') : ''}`}
                                  onClick={() => setEligibilityJob(job)}
                                  title="View eligibility, skills match and requirements"
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2L14.39 8.26L21 9.27L16.27 13.88L17.82 20.46L12 17.07L6.18 20.46L7.73 13.88L3 9.27L9.61 8.26L12 2Z" />
                                  </svg>
                                  <span>{isAuthenticated && candidateProfile && quickMatch ? (quickMatch.overall.isHardBlocker ? 'Auth Blocker' : `${quickMatch.overall.score}% Fit`) : 'Eligibility'}</span>
                                </button>

                                <a
                                  href={job.applyUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="radar-btn-apply"
                                  id={`grid-apply-link-${job.sourceJobId || job._id}`}
                                >
                                  <span>Apply Direct</span>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="7" y1="17" x2="17" y2="7" />
                                    <polyline points="7 7 17 7 17 17" />
                                  </svg>
                                </a>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="table-responsive">
                        <table className="jobs-table" id="jobs-table">
                          <thead>
                            <tr>
                              <th>Title & Role</th>
                              <th>Company & ATS</th>
                              <th>Location & Mode</th>
                              <th>Status</th>
                              <th>Last Seen</th>
                              <th style={{ textAlign: 'right' }}>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {displayedJobs.map((job) => {
                              const rawLoc = job.locationRaw || job.location || 'Unspecified';
                              const countryTag = job.country && job.country !== 'India' ? ` (${job.country})` : '';
                              const displayCity = job.city
                                ? `${job.city}${job.state ? `, ${job.state}` : ''}${countryTag}`
                                : (job.workMode === 'remote'
                                  ? (job.country ? `Remote (${job.country})` : 'Remote / Global')
                                  : `${rawLoc}${countryTag && !rawLoc.toLowerCase().includes(job.country.toLowerCase()) ? countryTag : ''}`);

                              const quickMatch = (isAuthenticated && candidateProfile) ? getJobMatchQuick(job, candidateProfile) : null;

                              return (
                                <tr key={job._id || `${job.source}-${job.sourceJobId}`}>
                                  <td className="job-title-cell">
                                    <div className="title-text">{job.title}</div>

                                    {/* Live Eligibility Match Indicator when candidate profile is active and user is authenticated */}
                                    {isAuthenticated && candidateProfile && quickMatch && (
                                      <div
                                        className={`job-row-match-pill ${quickMatch.overall.badgeTone}`}
                                        onClick={() => setEligibilityJob(job)}
                                        title={`Click to view breakdown: ${quickMatch.overall.summary}`}
                                      >
                                        <span className="match-pill-dot" />
                                        <span className="match-pill-text">
                                          {quickMatch.overall.isHardBlocker
                                            ? 'Work Authorization Required'
                                            : `${quickMatch.overall.score}% Match • ${quickMatch.overall.status === 'ELIGIBLE' ? 'Eligible' : 'Partial Fit'}`}
                                        </span>
                                      </div>
                                    )}

                                    {job.source === 'adzuna' && (
                                      <div className="adzuna-attribution">
                                        Provided by <a href="https://www.adzuna.in" target="_blank" rel="noopener noreferrer">Adzuna</a>
                                      </div>
                                    )}
                                  </td>
                                  <td>
                                    <div className="company-wrapper">
                                      <div className="table-company-avatar" aria-hidden="true">
                                        {(job.company || 'JR').slice(0, 2).toUpperCase()}
                                      </div>
                                      <div className="table-company-meta">
                                        <span className="job-company-pill">{job.company}</span>
                                        <span className={`ats-pill ${getSourceBadgeClass(job.source)}`}>
                                          {job.source}
                                        </span>
                                      </div>
                                    </div>
                                  </td>
                                  <td>
                                    <div className="location-wrapper">
                                      <span
                                        className="job-location-text"
                                        title={`Raw ATS Location: ${rawLoc}`}
                                      >
                                        {displayCity}
                                      </span>
                                      <span className={`mode-badge ${getWorkModeBadgeClass(job.workMode)}`}>
                                        {job.workMode}
                                      </span>
                                    </div>
                                  </td>
                                  <td>
                                    <span className={`status-badge ${job.status}`}>
                                      <span className="status-dot" />
                                      {job.status}
                                    </span>
                                  </td>
                                  <td className="job-date-text">
                                    {formatDate(job.lastSeenAt)}
                                  </td>
                                  <td className="job-action-cell" style={{ textAlign: 'right' }}>
                                    <div className="action-buttons-cluster">
                                      <button
                                        type="button"
                                        className={`btn-job-eligibility ${isAuthenticated && candidateProfile ? (quickMatch?.overall?.badgeTone || 'has-profile-match') : ''}`}
                                        onClick={() => setEligibilityJob(job)}
                                        title={isAuthenticated && candidateProfile ? `Check match for ${candidateProfile.name}: ${quickMatch?.overall?.headline || ''}` : "View eligibility and requirements for this role"}
                                        id={`eligibility-btn-${job.sourceJobId || job._id}`}
                                      >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                          <path d="M12 2L14.39 8.26L21 9.27L16.27 13.88L17.82 20.46L12 17.07L6.18 20.46L7.73 13.88L3 9.27L9.61 8.26L12 2Z" />
                                        </svg>
                                        <span>
                                          {isAuthenticated && candidateProfile
                                            ? (quickMatch ? (quickMatch.overall.isHardBlocker ? 'Blocker' : `${quickMatch.overall.score}% Fit`) : 'Eligibility')
                                            : 'Eligibility'}
                                        </span>
                                      </button>
                                      <a
                                        href={job.applyUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="apply-button"
                                        id={`apply-link-${job.sourceJobId}`}
                                      >
                                        <span>Apply</span>
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '2px' }}>
                                          <line x1="7" y1="17" x2="17" y2="7" />
                                          <polyline points="7 7 17 7 17 17" />
                                        </svg>
                                      </a>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Pagination footer - only show for grid/table */}
                    {viewMode !== 'map' && (
                      <div className="pagination-container">
                        <span className="page-indicator">
                          Page {meta.page} of {meta.totalPages}
                        </span>
                      <div className="page-controls">
                        <button
                          id="prev-page-btn"
                          className="page-btn"
                          disabled={page <= 1}
                          onClick={() => setPage((p) => Math.max(p - 1, 1))}
                        >
                          Previous
                        </button>
                        <button
                          id="next-page-btn"
                          className="page-btn"
                          disabled={page >= meta.totalPages}
                          onClick={() => setPage((p) => Math.min(p + 1, meta.totalPages))}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer with Mandatory ODbL Attribution */}
        <footer className="app-footer">
          <div className="odbl-attribution">
            Map, office and location data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a> under ODbL license.
          </div>
          <div className="footer-subtitle">
            JobRadar • Indian Tech Company Directory & Verified ATS Engine • All contact details stored with source URLs
          </div>
        </footer>
      </div>

      {/* Mobile Bottom Navigation Bar (Docked on Mobile Screens <= 768px) */}
      <nav className="mobile-bottom-nav" aria-label="Mobile Navigation">
        <button
          type="button"
          className={`mobile-nav-btn ${activeTab === 'jobs' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('jobs');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          id="mobile-tab-jobs"
          aria-label="Live jobs"
        >
          <div className="mobile-nav-icon-wrap">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
            {meta.totalInDb > 0 && (
              <span className="mobile-nav-badge">
                {meta.totalInDb > 999 ? `${(meta.totalInDb / 1000).toFixed(1)}k` : meta.totalInDb}
              </span>
            )}
          </div>
          <span className="mobile-nav-label">Live Jobs</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-btn ${activeTab === 'directory' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('directory');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          id="mobile-tab-directory"
          aria-label="Company directory"
        >
          <div className="mobile-nav-icon-wrap">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
              <line x1="9" y1="22" x2="9" y2="22.01" />
              <line x1="15" y1="22" x2="15" y2="22.01" />
              <line x1="9" y1="6" x2="9" y2="6.01" />
              <line x1="15" y1="6" x2="15" y2="6.01" />
              <line x1="9" y1="10" x2="9" y2="10.01" />
              <line x1="15" y1="10" x2="15" y2="10.01" />
              <line x1="9" y1="14" x2="9" y2="14.01" />
              <line x1="15" y1="14" x2="15" y2="14.01" />
              <line x1="9" y1="18" x2="9" y2="18.01" />
              <line x1="15" y1="18" x2="15" y2="18.01" />
            </svg>
            {companyCount > 0 && <span className="mobile-nav-badge">{companyCount}</span>}
          </div>
          <span className="mobile-nav-label">Directory</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-btn ${activeTab === 'reachout' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('reachout');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          id="mobile-tab-reachout"
          aria-label="Outreach pipeline"
        >
          <div className="mobile-nav-icon-wrap">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="6" />
              <circle cx="12" cy="12" r="2" />
            </svg>
            {reachOutCount > 0 && <span className="mobile-nav-badge">{reachOutCount}</span>}
          </div>
          <span className="mobile-nav-label">Outreach</span>
        </button>

        <button
          type="button"
          className="mobile-nav-btn"
          onClick={() => {
            if (!isAuthenticated) {
              openAuthModal('Please sign in or create an account to personalize CV and track pipeline.');
            } else {
              setIsProfileModalOpen(true);
            }
          }}
          id="mobile-tab-account"
          aria-label="Candidate profile or sign in"
        >
          <div className="mobile-nav-icon-wrap">
            {isAuthenticated ? (
              <span className="mobile-nav-avatar">
                {user?.name ? user.name.slice(0, 2).toUpperCase() : (user?.email ? user.email.slice(0, 2).toUpperCase() : 'UR')}
              </span>
            ) : (
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            )}
          </div>
          <span className="mobile-nav-label">{isAuthenticated ? 'Profile' : 'Sign In'}</span>
        </button>
      </nav>

      {/* Job Eligibility Modal */}
      {eligibilityJob && (
        <JobEligibilityModal
          job={eligibilityJob}
          onClose={() => setEligibilityJob(null)}
          onAddToPipeline={(j) => {
            setActiveTab('reachout');
            setEligibilityJob(null);
          }}
          onOpenProfileModal={() => {
            if (!isAuthenticated) {
              openAuthModal('Please sign in or create an account to upload your CV and match your job eligibility.', 'login');
              return;
            }
            setIsProfileModalOpen(true);
          }}
        />
      )}

      {/* Candidate Profile Upload / Edit Modal */}
      <CandidateProfileUploadModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
      />

      {/* Global Auth Modal */}
      <AuthModal />
    </div>
  );
}
