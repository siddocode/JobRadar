import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  LayoutDashboard,
  Briefcase,
  Layers,
  Building2,
  User,
  Bot,
  Sparkles,
  MapPin,
  CheckCircle2,
  Bookmark,
  Check,
  Globe,
  Navigation,
  Search,
  SlidersHorizontal,
  RotateCcw,
  X,
  Laptop,
  FileText
} from 'lucide-react';
import OverviewView from './components/OverviewView';
import ApplicationsView from './components/ApplicationsView';
import CareerProfileView from './components/CareerProfileView';
import AutopilotView from './components/AutopilotView';
import CompanyDirectory from './components/CompanyDirectory';
import ReachOutView from './components/ReachOutView';
import AuthModal from './components/AuthModal';
import JobEligibilityModal from './components/JobEligibilityModal';
import CandidateProfileUploadModal from './components/CandidateProfileUploadModal';
import TechCorridorMapView from './components/TechCorridorMapView';
import UserLocationModal from './components/UserLocationModal';
import ClassyDropdown from './components/ClassyDropdown';
import { useAuth } from './context/AuthContext';
import { useLocation, formatDistance } from './context/LocationContext';
import { getJobMatchQuick } from './utils/candidateMatcher';
import { getCompanyBranding } from './utils/companyBranding';
import { getShortLocationLabel } from './utils/resolveLocationName';
import './components/DiscoverJobsSection.css';

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
  const {
    userLocation,
    openLocationModal,
    sortByDistance,
    setSortByDistance,
    maxDistanceKm,
    setMaxDistanceKm
  } = useLocation();
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'jobs' | 'applications' | 'companies' | 'profile' | 'autopilot'
  const [theme, setTheme] = useState(() => localStorage.getItem('jobradar_theme') || 'light');
  const [syncToast, setSyncToast] = useState(null);

  const [directoryCities, setDirectoryCities] = useState([]);
  const [companyCount, setCompanyCount] = useState(0);
  const [eligibilityJob, setEligibilityJob] = useState(null);
  const [focusApplicationId, setFocusApplicationId] = useState(null);
  const [trackedCompanyIds, setTrackedCompanyIds] = useState(() => new Set());
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [savedJobs, setSavedJobs] = useState(() => {
    try {
      const raw = localStorage.getItem('jobradar_saved_jobs');
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Persist an outreach record instead of just switching tabs.
  const handleAddToPipeline = useCallback(async (job) => {
    if (!isAuthenticated) {
      openAuthModal('Sign in to track companies in your outreach pipeline.', 'login');
      return;
    }
    const companyId = job?.companyId || job?.company?._id;
    if (!companyId) {
      setSyncToast({ type: 'error', message: 'This job is not linked to a company record yet.' });
      return;
    }
    try {
      const res = await authFetch(`/api/directory/companies/${companyId}/follow-up`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followUpStatus: 'to_contact' })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTrackedCompanyIds((prev) => new Set(prev).add(String(companyId)));
        setSyncToast({ type: 'success', message: `${job.company || 'Company'} added to your outreach pipeline.` });
        window.dispatchEvent(new Event('jobradar:applications-changed'));
        setEligibilityJob(null);
        setActiveTab('reachout');
      } else {
        setSyncToast({ type: 'error', message: data.error || 'Could not add this company to your pipeline.' });
      }
    } catch {
      setSyncToast({ type: 'error', message: 'Network error. Please try again.' });
    }
  }, [isAuthenticated, authFetch, openAuthModal]);

  const handleToggleSaveJob = (jobId) => {
    setSavedJobs(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      try {
        localStorage.setItem('jobradar_saved_jobs', JSON.stringify([...next]));
      } catch {}
      return next;
    });
  };

  const [jobs, setJobs] = useState([]);
  const [cities, setCities] = useState([]);
  const [meta, setMeta] = useState({ total: 0, openTotal: 0, totalInDb: 0, page: 1, limit: 24, totalPages: 1 });
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
  const [limit, setLimit] = useState(24);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Status
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);

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
  const fetchStats = useCallback(async () => {
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
  }, []);

  // Fetch countries list with job counts
  const fetchCountries = useCallback(async () => {
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
  }, []);

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
          citiesCountryRef.current = selectedCountry;
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
    // Cancel any in-flight request so a slow older filter response cannot
    // overwrite the results of a newer one.
    if (jobsAbortRef.current) jobsAbortRef.current.abort();
    const controller = new AbortController();
    jobsAbortRef.current = controller;
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
      if (userLocation && userLocation.lat != null && userLocation.lng != null) {
        params.append('userLat', String(userLocation.lat));
        params.append('userLng', String(userLocation.lng));
        if (sortByDistance) {
          params.append('sortBy', 'distance');
        }
        if (maxDistanceKm) {
          params.append('maxDistanceKm', String(maxDistanceKm));
        }
      }
      params.append('page', String(page));
      params.append('limit', String(viewMode === 'map' ? 100 : limit));

      const res = await fetch(`/api/jobs?${params.toString()}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!res.ok) {
        throw new Error(`API error: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      if (controller.signal.aborted) return;
      if (data.success) {
        setJobs(data.jobs || []);
        if (data.meta) {
          setMeta(data.meta);
        }
      } else {
        throw new Error(data.message || 'Failed to fetch jobs');
      }
    } catch (err) {
      if (err.name === 'AbortError' || controller.signal.aborted) return;
      setError(err.message);
      setJobs([]);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [searchQuery, selectedCountry, selectedCity, selectedCorridor, experienceLevel, workModeFilter, statusFilter, companyFilter, techOnlyJobs, page, limit, viewMode, userLocation, sortByDistance, maxDistanceKm]);

  const fetchDirectoryMeta = useCallback(async () => {
    try {
      const [citiesRes, compRes] = await Promise.all([
        fetch('/api/directory/cities'),
        fetch('/api/directory/companies?limit=1')
      ]);
      if (citiesRes.ok) {
        const data = await citiesRes.json();
        if (data.success) setDirectoryCities(data.cities || []);
      }
      if (compRes.ok) {
        const data = await compRes.json();
        if (data.success) setCompanyCount(data.total || 0);
      }
    } catch (err) {
      console.error('Failed to load directory metadata:', err);
    }
  }, []);

  const syncPollRef = useRef(null);
  const toastTimeoutRef = useRef(null);
  const pollSyncRef = useRef(null);
  const jobsAbortRef = useRef(null);
  const citiesCountryRef = useRef(null);

  const pollSyncStatus = useCallback(() => {
    // Never allow two pollers to run at once (StrictMode + filter changes).
    if (syncPollRef.current) clearInterval(syncPollRef.current);
    const stop = () => {
      if (syncPollRef.current) clearInterval(syncPollRef.current);
      syncPollRef.current = null;
    };
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/jobs/sync/status');
        if (!res.ok) return;
        const data = await res.json();
        if (!data.syncState?.isRunning) {
          stop();
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
          if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
          toastTimeoutRef.current = setTimeout(() => setSyncToast(null), 6000);
        }
      } catch {
        stop();
        setIsSyncing(false);
      }
    }, 2500);
    syncPollRef.current = interval;
  }, [fetchCities, fetchJobs, fetchStats, fetchCountries, fetchDirectoryMeta]);

  // Keep a stable reference so the mount-only status check always calls the
  // latest poller without re-running on every filter change.
  useEffect(() => {
    pollSyncRef.current = pollSyncStatus;
  }, [pollSyncStatus]);

  const handleTriggerSync = async () => {
    if (isSyncing) return;
    try {
      setIsSyncing(true);
      setSyncToast({ message: 'Starting job collection across ATS boards...', type: 'info' });
      const res = await authFetch('/api/jobs/sync', { method: 'POST' });
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

  // Check sync status once on initial load; clean up polling on unmount.
  useEffect(() => {
    async function checkInitialSyncStatus() {
      try {
        const res = await fetch('/api/jobs/sync/status');
        if (res.ok) {
          const data = await res.json();
          if (data.syncState?.isRunning) {
            setIsSyncing(true);
            setSyncToast({ message: 'A sync run is actively running in background...', type: 'info' });
            pollSyncRef.current?.();
          }
        }
      } catch { }
    }
    checkInitialSyncStatus();
    return () => {
      if (syncPollRef.current) clearInterval(syncPollRef.current);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      if (jobsAbortRef.current) jobsAbortRef.current.abort();
    };
  }, []);

  useEffect(() => {
    fetchStats();
    fetchCountries();
  }, [fetchStats, fetchCountries]);

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

  // Apply the candidate's country once per distinct value. Re-applying on
  // every profile object change used to silently undo manual filter edits.
  const profileCountryAppliedRef = useRef(null);
  useEffect(() => {
    const country = candidateProfile?.country;
    if (!country || profileCountryAppliedRef.current === country) return;
    profileCountryAppliedRef.current = country;
    setSelectedCountry(country);
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
    setMaxDistanceKm(null);
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

  // Auto-reset city & corridor only once the city list for the *current*
  // country has actually loaded, otherwise a hub pill click (which changes
  // country + city together) is immediately undone by the previous list.
  useEffect(() => {
    if (citiesCountryRef.current !== selectedCountry) return;
    if (selectedCity && selectedCity !== 'all' && filteredCities.length > 0) {
      const cityExists = filteredCities.some(
        c => c.city.toLowerCase() === selectedCity.toLowerCase()
      );
      if (!cityExists) {
        setSelectedCity('all');
        setSelectedCorridor('all');
      }
    }
  }, [filteredCities, selectedCity, selectedCountry]);

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

  // Memoized options for ClassyDropdown filter components
  const countryOptions = useMemo(() => {
    const list = [
      { value: 'all', label: 'All Countries (Global)' },
      { value: 'India', label: `India (${countries.find(c => c.country === 'India')?.count || 0} jobs)` }
    ];
    countries
      .filter(c => c.country && c.country !== 'India')
      .forEach(c => {
        list.push({
          value: c.country,
          label: `${c.country} (${c.count} ${c.count === 1 ? 'job' : 'jobs'})`,
          group: 'International Countries'
        });
      });
    return list;
  }, [countries]);

  const cityOptions = useMemo(() => {
    const defaultLabel = selectedCountry === 'India'
      ? `All Indian Cities (${totalCityJobs} jobs)`
      : selectedCountry !== 'all'
        ? `All Cities in ${selectedCountry} (${totalCityJobs} jobs)`
        : `All Cities Worldwide (${totalCityJobs} jobs)`;

    const list = [{ value: 'all', label: defaultLabel }];

    if (cityGroups.remote.length > 0) {
      cityGroups.remote.forEach(c => {
        list.push({
          value: c.city,
          label: `${c.city} (${c.count} ${c.count === 1 ? 'job' : 'jobs'})`,
          group: 'Remote and Distributed'
        });
      });
    }

    if (cityGroups.major.length > 0) {
      const majorGroupLabel = selectedCountry === 'India'
        ? 'Major Indian Tech Hubs'
        : (selectedCountry !== 'all' ? `Major Tech Hubs in ${selectedCountry}` : 'Major Hubs');
      cityGroups.major.forEach(c => {
        list.push({
          value: c.city,
          label: `${c.city} ${c.state ? `(${c.state})` : ''} (${c.count} ${c.count === 1 ? 'job' : 'jobs'})`,
          group: majorGroupLabel
        });
      });
    }

    if (cityGroups.other.length > 0) {
      const otherGroupLabel = selectedCountry === 'India'
        ? 'Other Cities and Tech Clusters'
        : 'Other Locations';
      cityGroups.other.slice(0, 100).forEach(c => {
        list.push({
          value: c.city,
          label: `${c.city} (${c.count} ${c.count === 1 ? 'job' : 'jobs'})`,
          group: otherGroupLabel
        });
      });
    }

    return list;
  }, [selectedCountry, totalCityJobs, cityGroups]);

  const workModeOptions = useMemo(() => [
    { value: 'all', label: 'All Work Modes' },
    { value: 'onsite', label: 'On-site Work' },
    { value: 'hybrid', label: 'Hybrid (Office + Remote)' },
    { value: 'remote', label: 'Remote' },
    { value: 'unknown', label: 'Unspecified Location' }
  ], []);

  const companyOptions = useMemo(() => {
    if (!stats || !stats.companies) return [];
    const list = [{ value: 'all', label: `All Companies (${stats.companies.length})` }];
    if (companyGroups.tier1.length > 0) {
      companyGroups.tier1.forEach(comp => {
        list.push({ value: comp, label: comp, group: 'Tier-1 Product Companies' });
      });
    }
    if (companyGroups.other.length > 0) {
      companyGroups.other.forEach(comp => {
        list.push({ value: comp, label: comp, group: 'Other Tech Companies' });
      });
    }
    return list;
  }, [stats, companyGroups]);

  const statusOptions = useMemo(() => [
    { value: 'open', label: 'Active and Open Postings Only' },
    { value: 'all', label: 'All Postings (Active + Archived)' },
    { value: 'closed', label: 'Closed Postings Only' }
  ], []);

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
      // The filter should remove confirmed blockers only. Low scores often mean
      // the posting/profile lacks enough detail and should not hide a usable role.
      return !qm.overall.isHardBlocker;
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
            className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => { setActiveTab('overview'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            id="tab-overview"
          >
            <span className="nav-item-icon">
              <LayoutDashboard size={16} />
            </span>
            <span className="nav-item-text">Overview</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'jobs' ? 'active' : ''}`}
            onClick={() => { setActiveTab('jobs'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            id="tab-jobs"
          >
            <span className="nav-item-icon">
              <Briefcase size={16} />
            </span>
            <span className="nav-item-text">Discover Jobs</span>
            {meta.totalInDb > 0 && <span className="nav-item-badge">{meta.totalInDb.toLocaleString()}</span>}
          </button>

          <button
            className={`nav-item ${activeTab === 'applications' ? 'active' : ''}`}
            onClick={() => { setActiveTab('applications'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            id="tab-applications"
          >
            <span className="nav-item-icon">
              <Layers size={16} />
            </span>
            <span className="nav-item-text">Applications</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'companies' || activeTab === 'directory' ? 'active' : ''}`}
            onClick={() => { setActiveTab('companies'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            id="tab-companies"
          >
            <span className="nav-item-icon">
              <Building2 size={16} />
            </span>
            <span className="nav-item-text">Companies</span>
            {companyCount > 0 && <span className="nav-item-badge">{companyCount}</span>}
          </button>

          <button
            className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => { setActiveTab('profile'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            id="tab-profile"
          >
            <span className="nav-item-icon">
              <User size={16} />
            </span>
            <span className="nav-item-text">My Profile</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'autopilot' ? 'active' : ''}`}
            onClick={() => { setActiveTab('autopilot'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            id="tab-autopilot"
          >
            <span className="nav-item-icon">
              <Bot size={16} />
            </span>
            <span className="nav-item-text">Autopilot</span>
            <span className="nav-item-badge tag-copper">Auto</span>
          </button>
        </nav>

        {/* Sidebar Status / Promo Card */}
        <div
          className={`sidebar-autopilot-widget ${activeTab === 'autopilot' ? 'is-current' : ''}`}
          onClick={() => { setActiveTab('autopilot'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActiveTab('autopilot');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }}
          role="button"
          tabIndex={0}
          title="Open Application Autopilot"
        >
          <div className="sidebar-ap-icon-wrap">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="6" />
              <circle cx="12" cy="12" r="2" />
            </svg>
          </div>
          <div className="sidebar-ap-text-wrap">
            <span className="sidebar-ap-title">Autopilot Engine</span>
            <p className="sidebar-ap-desc">
              Let JobRadar find, prepare and apply to the right jobs for you.
            </p>
          </div>
          <div className="sidebar-ap-terrain" aria-hidden="true">
            <svg viewBox="0 0 200 48" preserveAspectRatio="none">
              <path d="M0 32 C50 18 90 38 140 24 C175 14 190 26 200 18 L200 48 L0 48 Z" fill="rgba(23,61,53,0.06)" />
              <path d="M0 38 C60 26 110 40 160 30 C185 24 195 32 200 28 L200 48 L0 48 Z" fill="rgba(23,61,53,0.12)" />
            </svg>
          </div>
        </div>
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

          <div className={`topbar-title-block ${['applications', 'profile', 'autopilot'].includes(activeTab) ? 'is-duplicated' : ''}`}>
            <h1 className="page-heading">
              {activeTab === 'overview' && 'Mission Control & Overview'}
              {activeTab === 'jobs' && 'Discover Engineering Jobs'}
              {activeTab === 'applications' && 'Application Lifecycle'}
              {(activeTab === 'companies' || activeTab === 'directory') && 'Company Directory & Hubs'}
              {activeTab === 'reachout' && 'Outreach Pipeline'}
              {activeTab === 'profile' && 'Master Career Profile'}
              {activeTab === 'autopilot' && 'Application Autopilot'}
            </h1>
            <p className="page-subheading">
              {activeTab === 'overview' && 'Key application milestones, urgent actions, and recommended technology opportunities.'}
              {activeTab === 'jobs' && 'Verified direct public ATS postings across Indian tech capitals.'}
              {activeTab === 'applications' && 'Track and manage your applications across all recruitment stages.'}
              {(activeTab === 'companies' || activeTab === 'directory') && 'Verified employers, detected ATS portals, and physical office corridors.'}
              {activeTab === 'reachout' && 'Proactive outreach to companies before jobs are posted publicly.'}
              {activeTab === 'profile' && 'Maintain your master credentials and verified competencies for smart matching.'}
              {activeTab === 'autopilot' && 'Continuous job screening, tailored preparation, and automated applications.'}
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
                  <span className="scope-flag"><Globe size={13} /></span>
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

            <button
              type="button"
              className={`user-location-nav-btn ${userLocation ? 'has-location' : ''}`}
              onClick={openLocationModal}
              title={userLocation
                ? `${
                    {
                      gps: 'Live GPS',
                      search: 'Searched location',
                      map_click: 'Adjusted on map',
                      curated: 'Curated tech hub'
                    }[userLocation.source] || 'Selected location'
                  }: ${userLocation.label} (${Number(userLocation.lat).toFixed(3)}, ${Number(userLocation.lng).toFixed(3)}). Click to update or clear.`
                : 'Set your location to see nearest jobs and companies'}
              id="topbar-location-btn"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span className="location-nav-text">
                {getShortLocationLabel(userLocation)}
              </span>
              {userLocation && <span className="location-active-dot" />}
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
                onClick={() => openAuthModal('', 'login')}
                title="Sign in or create free account"
                id="header-signin-btn"
              >
                <svg className="auth-btn-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
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

          {/* View 1: Mission Control & Overview */}
          {activeTab === 'overview' && (
            <OverviewView
              jobs={jobs}
              stats={stats}
              onNavigateTab={(tab) => {
                setActiveTab(tab);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onSelectJob={(job) => setEligibilityJob(job)}
              onOpenProfile={() => {
                setActiveTab('profile');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onReviewApplication={(app) => {
                setFocusApplicationId(app?._id || null);
                setActiveTab('applications');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          )}

          {/* View 2: Applications Lifecycle */}
          {activeTab === 'applications' && (
            <ApplicationsView
              initialStage={focusApplicationId ? 'awaiting_approval' : 'all'}
              focusApplicationId={focusApplicationId}
              onFocusHandled={() => setFocusApplicationId(null)}
              onNavigateJobs={() => {
                setActiveTab('jobs');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          )}

          {/* View 3: Company Directory */}
          {(activeTab === 'companies' || activeTab === 'directory') && (
            <CompanyDirectory
              cities={directoryCities}
              onRefreshMeta={fetchDirectoryMeta}
            />
          )}

          {/* View 4: Master Career Profile */}
          {activeTab === 'profile' && (
            <CareerProfileView
              onOpenUploadModal={() => setIsProfileModalOpen(true)}
            />
          )}

          {/* View 5: Application Autopilot */}
          {activeTab === 'autopilot' && (
            <AutopilotView
              onNavigateApplications={() => {
                setActiveTab('applications');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onNavigateProfile={() => {
                setActiveTab('profile');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          )}

          {/* View 6: Reach Out View (Legacy Pipeline) */}
          {activeTab === 'reachout' && (
            <ReachOutView
              cities={directoryCities}
              onNavigateToDirectory={() => setActiveTab('companies')}
              onPipelineChange={fetchDirectoryMeta}
            />
          )}

          {/* View 7: Discover Jobs View */}
          {activeTab === 'jobs' && (
            <div className="live-jobs-container discover-page-wrap">
              {/* Aggregate Stats Ribbon matching visual reference (4 refined cards) */}
              <section className="discover-stats-ribbon" aria-label="Job Statistics">
                <div className="discover-stat-card">
                  <div className="discover-stat-icon-wrap">
                    <Briefcase size={18} />
                  </div>
                  <div className="discover-stat-info">
                    <span className="discover-stat-val">{stats ? stats.total.toLocaleString() : meta.totalInDb.toLocaleString()}</span>
                    <span className="discover-stat-lbl">Total Jobs</span>
                  </div>
                </div>

                <div className="discover-stat-card is-open">
                  <div className="discover-stat-icon-wrap">
                    <CheckCircle2 size={18} />
                  </div>
                  <div className="discover-stat-info">
                    <span className="discover-stat-val text-green">
                      {stats ? stats.open.toLocaleString() : meta.openTotal.toLocaleString()}
                    </span>
                    <span className="discover-stat-lbl">Currently Open</span>
                  </div>
                </div>

                <div className="discover-stat-card is-today">
                  <div className="discover-stat-icon-wrap">
                    <Sparkles size={18} />
                  </div>
                  <div className="discover-stat-info">
                    <span className="discover-stat-val text-copper">
                      {stats?.companiesCount ? `${stats.companiesCount} Co.` : `${cities.length} Cities`}
                    </span>
                    <span className="discover-stat-lbl">Active Companies</span>
                  </div>
                </div>

                <div className="discover-stat-card is-match">
                  <div className="discover-stat-icon-wrap">
                    <Bot size={18} />
                  </div>
                  <div className="discover-stat-info">
                    <span className="discover-stat-val">{meta.total.toLocaleString()}</span>
                    <span className="discover-stat-lbl">Matching Filters</span>
                  </div>
                </div>
              </section>

              {/* Pan-India Tech Hub & Corridors Selector with Clean Pills */}
              <div className="tech-hubs-container">
                <div className="discover-location-strip">
                  {PRIMARY_TECH_HUBS.map((hub) => {
                    const isSelected = (hub.key === 'all' && selectedCity === 'all') || selectedCity.toLowerCase() === hub.key.toLowerCase();
                    const count = hubCityCounts[hub.key] || 0;
                    return (
                      <button
                        key={hub.key}
                        type="button"
                        className={`discover-location-pill ${isSelected ? 'is-active' : ''}`}
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
                        <span>{hub.name}</span>
                        {count > 0 && (
                          <span className="discover-location-count">
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
                    className={`discover-location-pill ${viewMode === 'map' ? 'is-active' : ''}`}
                    onClick={() => {
                      setViewMode(viewMode === 'map' ? 'grid' : 'map');
                      const anchor = document.getElementById('results-header-anchor');
                      if (anchor) anchor.scrollIntoView({ behavior: 'smooth' });
                    }}
                    title="Toggle Interactive GIS Tech Corridor Map"
                  >
                    <span>{viewMode === 'map' ? 'Exit Map' : 'Corridor Map'}</span>
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

              {/* Modern 2-Column Discovery Layout: Filter Sidebar + Main Content */}
              <div className="jobs-discovery-layout">
                {/* Modern Filter Sidebar */}
                <aside className={`jobs-filter-sidebar ${mobileFiltersOpen ? 'is-mobile-open' : ''}`} aria-label="Job Filters">
                  {/* Sidebar Header */}
                  <div className="sidebar-filter-header">
                    <div className="sidebar-filter-title">
                      <SlidersHorizontal size={15} />
                      <span>Filters</span>
                      {activeFilters.length > 0 && (
                        <span className="sidebar-active-pill">{activeFilters.length}</span>
                      )}
                    </div>
                    <div className="sidebar-header-actions">
                      {hasNonDefaultFilters && (
                        <button
                          type="button"
                          id="clear-filters-btn"
                          className="sidebar-reset-btn"
                          onClick={handleResetFilters}
                          title="Reset all filters to default"
                        >
                          <RotateCcw size={11} />
                          <span>Reset</span>
                        </button>
                      )}
                      <button
                        type="button"
                        className="sidebar-mobile-close"
                        onClick={() => setMobileFiltersOpen(false)}
                        aria-label="Close filters drawer"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="sidebar-filter-body">
                    {/* Search Input */}
                    <div className="sidebar-filter-group">
                      <label className="sidebar-group-label" htmlFor="search-title-input">
                        <Search size={12} />
                        <span>Search Roles</span>
                      </label>
                      <div className="input-field-wrapper">
                        <Search size={14} />
                        <input
                          id="search-title-input"
                          type="text"
                          className="custom-input"
                          placeholder="Role, tech or skill (e.g. React)..."
                          value={searchQuery}
                          onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setPage(1);
                          }}
                        />
                        {searchQuery && (
                          <button
                            type="button"
                            className="input-clear-icon-btn"
                            onClick={() => { setSearchQuery(''); setPage(1); }}
                            aria-label="Clear search"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Location Filter */}
                    <div className="sidebar-filter-group">
                      <label className="sidebar-group-label">
                        <Globe size={12} />
                        <span>Location</span>
                      </label>
                      <div className="sidebar-subgroup-stack">
                        <ClassyDropdown
                          id="filter-country-select"
                          value={selectedCountry}
                          onChange={(nextCountry) => {
                            setSelectedCountry(nextCountry);
                            setSelectedCity('all');
                            setSelectedCorridor('all');
                            setPage(1);
                          }}
                          options={countryOptions}
                          placeholder="All Countries (Global)"
                          title="Select Country"
                          icon={<Globe size={13} />}
                        />
                        <ClassyDropdown
                          id="filter-city-select"
                          value={selectedCity}
                          onChange={(nextCity) => {
                            setSelectedCity(nextCity);
                            setPage(1);
                          }}
                          options={cityOptions}
                          placeholder="All Cities Worldwide"
                          title="Select City or Tech Hub"
                          searchable={true}
                          icon={<MapPin size={13} />}
                        />
                      </div>
                    </div>

                    {/* Work Mode Filter */}
                    <div className="sidebar-filter-group">
                      <label className="sidebar-group-label">
                        <Laptop size={12} />
                        <span>Work Mode</span>
                      </label>
                      <ClassyDropdown
                        id="filter-workmode-select"
                        value={workModeFilter}
                        onChange={(nextMode) => {
                          setWorkModeFilter(nextMode);
                          setPage(1);
                        }}
                        options={workModeOptions}
                        placeholder="All Work Modes"
                        title="Select Work Mode"
                        icon={<Briefcase size={13} />}
                      />
                    </div>

                    {/* Experience Level */}
                    <div className="sidebar-filter-group filter-group-experience">
                      <label className="sidebar-group-label">
                        <Sparkles size={12} />
                        <span>Experience Level</span>
                      </label>
                      <div className="experience-sidebar-stack" role="group" aria-label="Experience level filter">
                        <button
                          type="button"
                          className={`exp-sidebar-option ${experienceLevel === 'all' ? 'active' : ''}`}
                          onClick={() => { setExperienceLevel('all'); setPage(1); }}
                        >
                          <span className="exp-sig-dot dot-all" />
                          <span>All Experience</span>
                        </button>
                        <button
                          type="button"
                          className={`exp-sidebar-option ${experienceLevel === 'freshers' ? 'active' : ''}`}
                          onClick={() => { setExperienceLevel('freshers'); setPage(1); }}
                        >
                          <span className="exp-sig-dot dot-freshers" />
                          <span>Freshers (0–1y)</span>
                        </button>
                        <button
                          type="button"
                          className={`exp-sidebar-option ${experienceLevel === 'mid' ? 'active' : ''}`}
                          onClick={() => { setExperienceLevel('mid'); setPage(1); }}
                        >
                          <span className="exp-sig-dot dot-mid" />
                          <span>Mid (2–5y)</span>
                        </button>
                        <button
                          type="button"
                          className={`exp-sidebar-option ${experienceLevel === 'senior' ? 'active' : ''}`}
                          onClick={() => { setExperienceLevel('senior'); setPage(1); }}
                        >
                          <span className="exp-sig-dot dot-senior" />
                          <span>Senior (5y+)</span>
                        </button>
                      </div>

                      {/* Preserved accessible select for automated tests */}
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
                        <option value="freshers">Freshers & Early Career (0–1y)</option>
                        <option value="mid">Mid-Level Roles (2–5y)</option>
                        <option value="senior">Senior & Staff (5y+)</option>
                      </select>
                    </div>

                    {/* Company Filter (when available) */}
                    {stats && stats.companies && stats.companies.length > 0 && (
                      <div className="sidebar-filter-group">
                        <label className="sidebar-group-label">
                          <Building2 size={12} />
                          <span>Company</span>
                        </label>
                        <ClassyDropdown
                          id="filter-company-select"
                          value={companyFilter}
                          onChange={(nextComp) => {
                            setCompanyFilter(nextComp);
                            setPage(1);
                          }}
                          options={companyOptions}
                          placeholder={`All Companies (${stats.companies.length})`}
                          title="Filter by Company"
                          searchable={true}
                          icon={<Building2 size={13} />}
                        />
                      </div>
                    )}

                    {/* Posting Status Filter */}
                    <div className="sidebar-filter-group">
                      <label className="sidebar-group-label">
                        <CheckCircle2 size={12} />
                        <span>Status</span>
                      </label>
                      <ClassyDropdown
                        id="filter-status-select"
                        value={statusFilter}
                        onChange={(nextStatus) => {
                          setStatusFilter(nextStatus);
                          setPage(1);
                        }}
                        options={statusOptions}
                        placeholder="Active & Open Postings"
                        title="Filter Postings by Status"
                        icon={<CheckCircle2 size={13} />}
                      />
                    </div>

                    {/* Preferences / Toggles */}
                    <div className="sidebar-filter-group">
                      <label className="sidebar-group-label">
                        <SlidersHorizontal size={12} />
                        <span>Preferences</span>
                      </label>
                      <div className="sidebar-toggles-stack">
                        <label className={`sidebar-toggle-card ${techOnlyJobs ? 'active' : ''}`} htmlFor="tech-jobs-toggle">
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
                          <div className="toggle-card-content">
                            <span className="toggle-card-title">Tech Roles Only</span>
                            <span className="toggle-card-subtitle">Exclude non-tech roles</span>
                          </div>
                          <span className={`toggle-card-switch ${techOnlyJobs ? 'is-on' : ''}`}>
                            <span className="toggle-switch-thumb" />
                          </span>
                        </label>

                        <label
                          className={`sidebar-toggle-card ${onlyEligibleJobs ? 'active' : ''}`}
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
                          <div className="toggle-card-content">
                            <span className="toggle-card-title">Eligible Roles Only</span>
                            <span className="toggle-card-subtitle">Matches experience & residency</span>
                          </div>
                          <span className={`toggle-card-switch ${isAuthenticated && onlyEligibleJobs ? 'is-on' : ''}`}>
                            <span className="toggle-switch-thumb" />
                          </span>
                        </label>
                      </div>
                    </div>

                    {/* CV Profile Match Card */}
                    <div className="sidebar-filter-group sidebar-cv-group">
                      <button
                        type="button"
                        className={`sidebar-cv-card ${isAuthenticated && candidateProfile ? 'has-profile' : ''}`}
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
                        <div className="sidebar-cv-icon-wrap">
                          <FileText size={16} />
                        </div>
                        <div className="sidebar-cv-content">
                          {isAuthenticated && candidateProfile ? (
                            <>
                              <div className="sidebar-cv-head">
                                <span className="cv-status-pulse" />
                                <span className="sidebar-cv-title">Active CV Profile</span>
                                <span className="sidebar-cv-edit-tag">Edit</span>
                              </div>
                              <span className="sidebar-cv-meta">
                                {candidateProfile.country} • {candidateProfile.experienceDisplay || (candidateProfile.totalExperienceMonths ? `${candidateProfile.totalExperienceMonths} Mos` : `${candidateProfile.totalYearsExperience || 0} Yrs`)}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="sidebar-cv-title">+ Match My CV</span>
                              <span className="sidebar-cv-meta">
                                {!isAuthenticated ? 'Sign In Required' : 'Check Eligibility'}
                              </span>
                            </>
                          )}
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Mobile drawer bottom bar */}
                  <div className="sidebar-mobile-footer">
                    <button
                      type="button"
                      className="sidebar-mobile-apply-btn"
                      onClick={() => setMobileFiltersOpen(false)}
                    >
                      Show {displayedJobs.length} Roles
                    </button>
                  </div>
                </aside>

                {/* Mobile Backdrop */}
                {mobileFiltersOpen && (
                  <div
                    className="jobs-filter-backdrop"
                    onClick={() => setMobileFiltersOpen(false)}
                    aria-hidden="true"
                  />
                )}

                {/* Main Jobs Content Area */}
                <main className="jobs-main-content">
                  {/* Applied Filter Chips Strip */}
                  {activeFilters.length > 0 && (
                    <div className="filter-active-chips-strip">
                      <span className="chips-strip-label">Applied:</span>
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

                  {/* Results Container */}
                  <div className="results-container" id="results-header-anchor">
                    <div className="results-header">
                      <div className="results-header-left">
                        <button
                          type="button"
                          className="mobile-filter-trigger-btn"
                          onClick={() => setMobileFiltersOpen(true)}
                          aria-label="Open filter sidebar"
                        >
                          <SlidersHorizontal size={13} />
                          <span>Filters</span>
                          {activeFilters.length > 0 && (
                            <span className="mobile-filter-badge">{activeFilters.length}</span>
                          )}
                        </button>
                        <div className="results-count" id="results-count-text">
                          Showing <strong>{displayedJobs.length}</strong> of <strong>{meta.total}</strong> verified roles
                        </div>
                      </div>

                      <div className="results-controls-cluster">
                    {/* Nearest to Me Proximity Toggle */}
                    <div
                      id="sort-nearest-pill-btn"
                      className={`sort-nearest-pill-btn ${sortByDistance && userLocation ? 'is-active' : ''}`}
                    >
                      <button
                        type="button"
                        id="sort-nearest-toggle-btn"
                        className="sort-nearest-toggle"
                        onClick={() => {
                          if (!userLocation) {
                            openLocationModal();
                          } else {
                            setSortByDistance(!sortByDistance);
                          }
                        }}
                        title={userLocation
                          ? (sortByDistance ? `Currently sorting jobs nearest to ${userLocation.label}` : `Click to sort nearest to ${userLocation.label}`)
                          : 'Set your location to see nearest jobs first'}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        <span className="sort-nearest-label">
                          {userLocation
                            ? (sortByDistance ? `Nearest: ${getShortLocationLabel(userLocation)}` : 'Sort: Distance')
                            : 'Nearest to Me'}
                        </span>
                      </button>
                      {userLocation && (
                        <button
                          type="button"
                          className="sort-nearest-edit-tag"
                          onClick={openLocationModal}
                          title="Change your location"
                        >
                          Change
                        </button>
                      )}
                    </div>

                    <div className="results-sub-cluster">
                      {/* View Mode Switcher */}
                      <div className="view-mode-segmented" role="group" aria-label="View layout switch">
                        <button
                          type="button"
                          className={`segmented-option view-btn-grid ${viewMode === 'grid' ? 'active' : ''}`}
                          onClick={() => { setViewMode('grid'); setPage(1); }}
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
                          onClick={() => { setViewMode('table'); setPage(1); }}
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
                          onClick={() => { setViewMode('map'); setPage(1); }}
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
                </div>

                {!loading && !error && displayedJobs.length > 0 && viewMode === 'map' ? (
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
                ) : displayedJobs.length === 0 ? (
                  <div className="state-box">
                    <p className="state-title">No jobs found</p>
                    <p className="state-desc">
                      {jobs.length > 0
                        ? 'No roles match your current filters. Try clearing filters or turning off "Eligible Roles Only".'
                        : 'Try loosening your search terms or selecting "All Cities".'}
                    </p>
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
                          const branding = getCompanyBranding(job.company);
                          const jobId = job._id || `${job.source}-${job.sourceJobId}`;
                          const isSaved = savedJobs.has(jobId);

                          return (
                            <div key={jobId} className="discover-job-card radar-card">
                              <div>
                                <div className="discover-card-top">
                                  <div className="discover-card-company-group">
                                    <div
                                      className="discover-company-monogram"
                                      style={{ backgroundColor: branding.bg, color: branding.color }}
                                    >
                                      {branding.monogram}
                                    </div>
                                    <div className="discover-company-details">
                                      <span className="discover-company-name">{job.company}</span>
                                      <div className="discover-job-title" title={job.title}>{job.title}</div>
                                    </div>
                                  </div>

                                  {/* Match Score Badge matching reference: ✓ 92% Match */}
                                  {quickMatch && !quickMatch.overall.isHardBlocker ? (
                                    <button
                                      type="button"
                                      className="discover-match-badge"
                                      onClick={() => setEligibilityJob(job)}
                                      title={`Click for breakdown: ${quickMatch.overall.summary}`}
                                    >
                                      <Check size={12} strokeWidth={2.5} /> {quickMatch.overall.score}% Match
                                    </button>
                                  ) : quickMatch?.overall.isHardBlocker ? (
                                    <button
                                      type="button"
                                      className="discover-match-badge is-blocker"
                                      style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.25)' }}
                                      onClick={() => setEligibilityJob(job)}
                                      title={`Requirement gap: ${quickMatch.overall.blockerLabel || 'Seniority or location requirement not met'}. Click to view details.`}
                                    >
                                      {quickMatch.overall.blockerLabel || 'Not Eligible'}
                                    </button>
                                  ) : (
                                    <span className={`status-badge ${job.status}`}>
                                      <span className="status-dot" />
                                      {job.status}
                                    </span>
                                  )}
                                </div>

                                {/* Tags Row */}
                                <div className="discover-tags-row" style={{ marginTop: '10px' }}>
                                  {job.roleFamily && job.roleFamily !== 'other' && (
                                    <span className="discover-tag-chip">
                                      {job.roleFamily.replace(/_/g, ' ')}
                                    </span>
                                  )}
                                  <span className="discover-tag-chip">
                                    <MapPin size={11} /> {job.locality ? `${job.locality}, ${job.city || 'India'}` : displayCity}
                                  </span>
                                  {job.workMode
                                    && !['unknown', 'unspecified'].includes(job.workMode)
                                    && !(job.workMode === 'remote' && /remote/i.test(`${job.locality || ''} ${displayCity || ''}`)) && (
                                    <span className="discover-tag-chip">
                                      {job.workMode}
                                    </span>
                                  )}
                                  {job.distanceKm != null && (
                                    <span
                                      className="discover-tag-chip"
                                      title={job.distanceApproximate
                                        ? `Estimated from the city centre: this posting only lists ${job.city || 'a city'}, not a building (~${job.distanceKm} km).`
                                        : `Direct distance: ${job.distanceKm} km`}
                                    >
                                      <Navigation size={11} /> {job.distanceApproximate ? '~' : ''}{formatDistance(job.distanceKm)}
                                    </span>
                                  )}
                                  {job.fresherFriendly && !/\b(staff|principal|architect|tech lead|engineering manager|director|vp|senior|sr\.?)\b/i.test(job.title || '') && (
                                    <span className="discover-tag-chip" style={{ color: 'var(--success)' }}>Freshers (0–1y)</span>
                                  )}
                                </div>
                              </div>

                              {/* Card Footer: Save and Apply actions */}
                              <div className="discover-card-footer">
                                <span className="discover-posted-time">
                                  {job.lastSeenAt ? `Updated ${new Date(job.lastSeenAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}` : 'Live Posting'}
                                </span>

                                <div className="discover-card-actions">
                                  <button
                                    type="button"
                                    className={`discover-save-btn ${isSaved ? 'is-saved' : ''}`}
                                    onClick={() => handleToggleSaveJob(jobId)}
                                    title={isSaved ? 'Remove from saved' : 'Save job'}
                                  >
                                    <Bookmark size={13} fill={isSaved ? 'currentColor' : 'none'} />
                                    <span>{isSaved ? 'Saved' : 'Save'}</span>
                                  </button>

                                  <a
                                    href={job.applyUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="discover-apply-btn"
                                    id={`grid-apply-link-${job.sourceJobId || job._id}`}
                                  >
                                    Apply Direct
                                  </a>
                                </div>
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
                                            ? (quickMatch.overall.blockerLabel || 'Not Eligible')
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
                                      {job.distanceKm != null && (
                                        <span
                                          className={`table-distance-badge ${job.distanceApproximate ? 'is-approximate' : ''}`}
                                          title={job.distanceApproximate
                                            ? `Approximate — this job only lists ${job.city || 'a city'}, measured from the city centre (~${job.distanceKm} km).`
                                            : `${job.distanceKm} km from your set location`}
                                        >
                                          <Navigation size={11} /> {job.distanceApproximate ? '~' : ''}{formatDistance(job.distanceKm)}
                                        </span>
                                      )}
                                      {job.workMode && !['unknown', 'unspecified'].includes(job.workMode) && (
                                        <span className={`mode-badge ${getWorkModeBadgeClass(job.workMode)}`}>
                                          {job.workMode}
                                        </span>
                                      )}
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
                </main>
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
          className={`mobile-nav-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('overview');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          id="mobile-tab-overview"
          aria-label="Mission Control Overview"
        >
          <div className="mobile-nav-icon-wrap">
            <LayoutDashboard size={20} />
          </div>
          <span className="mobile-nav-label">Overview</span>
        </button>

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
            <Briefcase size={20} />
            {meta.totalInDb > 0 && (
              <span className="mobile-nav-badge">
                {meta.totalInDb > 999 ? `${(meta.totalInDb / 1000).toFixed(1)}k` : meta.totalInDb}
              </span>
            )}
          </div>
          <span className="mobile-nav-label">Jobs</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-btn ${activeTab === 'applications' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('applications');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          id="mobile-tab-applications"
          aria-label="Application Lifecycle"
        >
          <div className="mobile-nav-icon-wrap">
            <Layers size={20} />
          </div>
          <span className="mobile-nav-label">Apps</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-btn ${activeTab === 'companies' || activeTab === 'directory' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('companies');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          id="mobile-tab-companies"
          aria-label="Company directory"
        >
          <div className="mobile-nav-icon-wrap">
            <Building2 size={20} />
            {companyCount > 0 && <span className="mobile-nav-badge">{companyCount}</span>}
          </div>
          <span className="mobile-nav-label">Companies</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-btn ${activeTab === 'autopilot' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('autopilot');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          id="mobile-tab-autopilot"
          aria-label="Application Autopilot"
        >
          <div className="mobile-nav-icon-wrap">
            <Bot size={20} />
          </div>
          <span className="mobile-nav-label">Autopilot</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-btn ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => {
            if (!isAuthenticated) {
              openAuthModal('Please sign in or create an account to view and edit profile.');
            } else {
              setActiveTab('profile');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }}
          id="mobile-tab-profile"
          aria-label="Candidate master profile"
        >
          <div className="mobile-nav-icon-wrap">
            {isAuthenticated ? (
              <span className="mobile-nav-avatar">
                {user?.name ? user.name.slice(0, 2).toUpperCase() : (user?.email ? user.email.slice(0, 2).toUpperCase() : 'UR')}
              </span>
            ) : (
              <User size={20} />
            )}
          </div>
          <span className="mobile-nav-label">Profile</span>
        </button>
      </nav>

      {/* Job Eligibility Modal */}
      {eligibilityJob && (
        <JobEligibilityModal
          job={eligibilityJob}
          onClose={() => setEligibilityJob(null)}
          onAddToPipeline={handleAddToPipeline}
          isInPipeline={Boolean(eligibilityJob && (
            trackedCompanyIds.has(String(eligibilityJob.companyId || eligibilityJob.company?._id || ''))
          ))}
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

      {/* User Location Radar Modal */}
      <UserLocationModal />
    </div>
  );
}
