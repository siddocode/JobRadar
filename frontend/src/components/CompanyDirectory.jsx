import React, { useState, useEffect, useCallback, useMemo } from 'react';
import CompanyCard from './CompanyCard';
import PersonalizeModal from './PersonalizeModal';
import DiscoveredPlacesMap from './DiscoveredPlacesMap';
import { useAuth } from '../context/AuthContext';

const AVAILABLE_INDIAN_HUBS = [
  { slug: 'kolkata', name: 'Kolkata', state: 'West Bengal', tier: 1 },
  { slug: 'bengaluru', name: 'Bengaluru', state: 'Karnataka', tier: 1 },
  { slug: 'hyderabad', name: 'Hyderabad', state: 'Telangana', tier: 1 },
  { slug: 'pune', name: 'Pune', state: 'Maharashtra', tier: 1 },
  { slug: 'mumbai', name: 'Mumbai', state: 'Maharashtra', tier: 1 },
  { slug: 'gurgaon', name: 'Gurgaon / Gurugram', state: 'Haryana', tier: 1 },
  { slug: 'noida', name: 'Noida', state: 'Uttar Pradesh', tier: 1 },
  { slug: 'delhi-ncr', name: 'Delhi NCR', state: 'Delhi', tier: 1 },
  { slug: 'chennai', name: 'Chennai', state: 'Tamil Nadu', tier: 1 },
  { slug: 'ahmedabad', name: 'Ahmedabad', state: 'Gujarat', tier: 2 },
  { slug: 'kochi', name: 'Kochi', state: 'Kerala', tier: 2 },
  { slug: 'jaipur', name: 'Jaipur', state: 'Rajasthan', tier: 2 },
  { slug: 'indore', name: 'Indore', state: 'Madhya Pradesh', tier: 2 },
  { slug: 'chandigarh', name: 'Chandigarh', state: 'Punjab / Chandigarh', tier: 2 },
  { slug: 'coimbatore', name: 'Coimbatore', state: 'Tamil Nadu', tier: 2 },
  { slug: 'thiruvananthapuram', name: 'Thiruvananthapuram', state: 'Kerala', tier: 2 },
  { slug: 'bhubaneswar', name: 'Bhubaneswar', state: 'Odisha', tier: 2 },
  { slug: 'lucknow', name: 'Lucknow', state: 'Uttar Pradesh', tier: 2 },
  { slug: 'nagpur', name: 'Nagpur', state: 'Maharashtra', tier: 2 },
  { slug: 'visakhapatnam', name: 'Visakhapatnam', state: 'Andhra Pradesh', tier: 2 },
  { slug: 'surat', name: 'Surat', state: 'Gujarat', tier: 2 },
  { slug: 'vadodara', name: 'Vadodara', state: 'Gujarat', tier: 2 },
  { slug: 'bhopal', name: 'Bhopal', state: 'Madhya Pradesh', tier: 2 },
  { slug: 'mysuru', name: 'Mysuru', state: 'Karnataka', tier: 2 },
  { slug: 'mangaluru', name: 'Mangaluru', state: 'Karnataka', tier: 2 },
  { slug: 'dehradun', name: 'Dehradun', state: 'Uttarakhand', tier: 3 },
  { slug: 'patna', name: 'Patna', state: 'Bihar', tier: 3 },
  { slug: 'ranchi', name: 'Ranchi', state: 'Jharkhand', tier: 3 },
  { slug: 'guwahati', name: 'Guwahati', state: 'Assam', tier: 3 },
  { slug: 'goa', name: 'Goa', state: 'Goa', tier: 3 },
  { slug: 'vijayawada', name: 'Vijayawada', state: 'Andhra Pradesh', tier: 3 },
  { slug: 'nashik', name: 'Nashik', state: 'Maharashtra', tier: 3 },
  { slug: 'rajkot', name: 'Rajkot', state: 'Gujarat', tier: 3 },
  { slug: 'kanpur', name: 'Kanpur', state: 'Uttar Pradesh', tier: 3 },
  { slug: 'madurai', name: 'Madurai', state: 'Tamil Nadu', tier: 3 },
  { slug: 'varanasi', name: 'Varanasi', state: 'Uttar Pradesh', tier: 3 }
];

export default function CompanyDirectory({ cities = [], onRefreshMeta }) {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Auth & Personalize modal
  const { authFetch } = useAuth();
  const [personalizeCompany, setPersonalizeCompany] = useState(null);

  // Filters
  const [selectedCity, setSelectedCity] = useState('all');
  const [hiringFilter, setHiringFilter] = useState('all'); // 'all' | 'hiring' | 'no_vacancy'
  const [searchQuery, setSearchQuery] = useState('');
  const [techOnly, setTechOnly] = useState(true);

  // Dual-Engine Map-Wise Discovery Scanner Modal State
  const [showDiscoveryModal, setShowDiscoveryModal] = useState(false);
  const [scannerEngine, setScannerEngine] = useState('google_places'); // 'google_places' | 'osm'
  const [discoveryCitySlug, setDiscoveryCitySlug] = useState('kolkata');
  const [scanRadius, setScanRadius] = useState(25000); // meters (25 km)
  const [customApiKey, setCustomApiKey] = useState('');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState(null);
  const [copiedPreviewId, setCopiedPreviewId] = useState(null);
  const [selectedPreviewPlace, setSelectedPreviewPlace] = useState(null);
  const [placesViewMode, setPlacesViewMode] = useState('split'); // 'split' | 'list' | 'map'

  const handleCopyPreviewText = (text, id) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedPreviewId(id);
    setTimeout(() => setCopiedPreviewId(null), 1800);
  };

  const formatDomain = (rawUrl) => {
    if (!rawUrl) return 'Website';
    try {
      const withProto = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
      return new URL(withProto).hostname.replace(/^www\./, '');
    } catch {
      return String(rawUrl).replace(/^https?:\/\//i, '').replace(/^www\./, '').split('/')[0] || 'Website';
    }
  };

  const ensureHttp = (rawUrl) => {
    if (!rawUrl) return '#';
    return /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  };

  const cleanPhoneDisplay = (rawPhone) => {
    if (!rawPhone) return '';
    return rawPhone.replace(/^[:\s-]+/, '').trim();
  };

  const cleanPhoneForTel = (rawPhone) => {
    if (!rawPhone) return '';
    return rawPhone.replace(/^[:\s-]+/, '').split(/[\/,|]/)[0].replace(/Fax:.*/i, '').trim();
  };

  const groupedDirectoryCities = useMemo(() => {
    const tier1Slugs = ['bengaluru', 'hyderabad', 'pune', 'kolkata', 'mumbai', 'delhi-ncr', 'chennai', 'gurgaon', 'noida'];
    const tier1 = [];
    const others = [];
    let totalOffices = 0;

    (cities || []).forEach(c => {
      totalOffices += (c.officeCount || 0);
      if (tier1Slugs.includes(c.slug.toLowerCase())) {
        tier1.push(c);
      } else {
        others.push(c);
      }
    });

    tier1.sort((a, b) => (b.officeCount || 0) - (a.officeCount || 0) || a.name.localeCompare(b.name));
    others.sort((a, b) => (b.officeCount || 0) - (a.officeCount || 0) || a.name.localeCompare(b.name));

    return { tier1, others, totalOffices };
  }, [cities]);

  // Add Company Modal State (Kept intact for future Admin dashboard)
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '',
    website: '',
    city: 'kolkata',
    address: '',
    notes: '',
    contactEmail: '',
    contactPhone: ''
  });
  const [isAddingCompany, setIsAddingCompany] = useState(false);
  const [addError, setAddError] = useState(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Dynamic Aggregate Metrics (from real data)
  const [aggregateStats, setAggregateStats] = useState({
    total: 0,
    hiring: 0,
    offices: 0
  });

  // Fetch aggregate numbers from high-speed stats endpoint
  const fetchAggregateMetrics = async () => {
    try {
      const res = await fetch('/api/directory/stats');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.stats) {
          setAggregateStats({
            total: data.stats.total || 0,
            hiring: data.stats.hiring || 0,
            offices: data.stats.offices || 0
          });
        }
      }
    } catch (err) {
      console.error('Failed to load directory stats:', err);
    }
  };

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedCity !== 'all') params.append('city', selectedCity);
      if (hiringFilter !== 'all') params.append('hiring', hiringFilter);
      if (searchQuery.trim()) params.append('q', searchQuery.trim());
      if (techOnly) params.append('techOnly', 'true');
      params.append('page', String(page));
      params.append('limit', '30');

      const res = await authFetch(`/api/directory/companies?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

      const data = await res.json();
      if (data.success) {
        setCompanies(data.companies || []);
        setTotalCount(data.total || 0);
        setTotalPages(data.totalPages || 1);
      } else {
        throw new Error(data.error || 'Failed to fetch companies');
      }
    } catch (err) {
      setError(err.message);
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  }, [selectedCity, hiringFilter, searchQuery, techOnly, page]);

  useEffect(() => {
    fetchAggregateMetrics();
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  // Poll discovery status for either Google Places or OSM
  const pollDiscoveryStatus = useCallback((engine = scannerEngine) => {
    const endpoint = engine === 'google_places'
      ? '/api/directory/scan-google-places/status'
      : '/api/directory/discover-city/status';

    const interval = setInterval(async () => {
      try {
        const res = await fetch(endpoint);
        if (!res.ok) return;
        const data = await res.json();
        const activeState = engine === 'google_places' ? data.scanState : data.discoveryState;

        if (activeState) {
          setScanStatus(activeState);
          if (!activeState.isRunning) {
            clearInterval(interval);
            setIsScanning(false);
            fetchCompanies();
            fetchAggregateMetrics();
            if (onRefreshMeta) onRefreshMeta();
          }
        }
      } catch (_) {
        clearInterval(interval);
        setIsScanning(false);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [scannerEngine, fetchCompanies, onRefreshMeta]);

  // Check if any scan is already running on mount
  useEffect(() => {
    async function checkActiveScan() {
      try {
        // Check Google Places status first
        const gRes = await fetch('/api/directory/scan-google-places/status');
        if (gRes.ok) {
          const gData = await gRes.json();
          if (gData.scanState?.isRunning) {
            setScannerEngine('google_places');
            setIsScanning(true);
            setDiscoveryCitySlug(gData.scanState.citySlug || 'kolkata');
            setScanStatus(gData.scanState);
            pollDiscoveryStatus('google_places');
            return;
          }
        }

        // Check OSM status
        const oRes = await fetch('/api/directory/discover-city/status');
        if (oRes.ok) {
          const oData = await oRes.json();
          if (oData.discoveryState?.isRunning) {
            setScannerEngine('osm');
            setIsScanning(true);
            setDiscoveryCitySlug(oData.discoveryState.citySlug || 'kolkata');
            setScanStatus(oData.discoveryState);
            pollDiscoveryStatus('osm');
          }
        }
      } catch (_) {}
    }
    checkActiveScan();
  }, [pollDiscoveryStatus]);

  const handleStartScan = async () => {
    if (isScanning || !discoveryCitySlug) return;
    try {
      setIsScanning(true);
      setScanStatus({ isRunning: true, citySlug: discoveryCitySlug, error: null, lastSummary: null });

      if (scannerEngine === 'google_places') {
        const res = await fetch('/api/directory/scan-google-places', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            citySlug: discoveryCitySlug,
            customApiKey: customApiKey.trim() || undefined,
            radius: scanRadius
          })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          pollDiscoveryStatus('google_places');
        } else {
          setIsScanning(false);
          setScanStatus({ isRunning: false, error: data.error || data.message || 'Failed to start Google Places scan' });
        }
      } else {
        const res = await fetch('/api/directory/discover-city', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ citySlug: discoveryCitySlug, forceRefresh })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          pollDiscoveryStatus('osm');
        } else {
          setIsScanning(false);
          setScanStatus({ isRunning: false, error: data.error || data.message || 'Failed to start OSM scan' });
        }
      }
    } catch (err) {
      setIsScanning(false);
      setScanStatus({ isRunning: false, error: err.message });
    }
  };

  const handleOpenAddModal = (initialName = '') => {
    setAddForm({
      name: initialName,
      website: '',
      city: selectedCity !== 'all' ? selectedCity : 'kolkata',
      address: '',
      notes: '',
      contactEmail: '',
      contactPhone: ''
    });
    setAddError(null);
    setShowAddModal(true);
  };

  const handleSubmitAddCompany = async (e) => {
    e.preventDefault();
    if (!addForm.name.trim()) {
      setAddError('Company name is required');
      return;
    }

    try {
      setIsAddingCompany(true);
      setAddError(null);
      const res = await fetch('/api/directory/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: addForm.name.trim(),
          website: addForm.website.trim(),
          city: addForm.city,
          address: addForm.address.trim(),
          notes: addForm.notes.trim(),
          category: 'Software & IT Services',
          contact: {
            emails: addForm.contactEmail.trim() ? [addForm.contactEmail.trim()] : [],
            phones: addForm.contactPhone.trim() ? [addForm.contactPhone.trim()] : []
          }
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setShowAddModal(false);
        fetchCompanies();
        fetchAggregateMetrics();
        if (onRefreshMeta) onRefreshMeta();
      } else {
        setAddError(data.error || 'Failed to add company');
      }
    } catch (err) {
      setAddError(err.message);
    } finally {
      setIsAddingCompany(false);
    }
  };

  const handleCompanyUpdate = (id, updatedFields) => {
    setCompanies(prev =>
      prev.map(c => (c._id === id ? { ...c, ...updatedFields } : c))
    );
    // Refresh aggregate stats and app meta if follow-up changed
    if (updatedFields.followUpStatus) {
      fetchAggregateMetrics();
      if (onRefreshMeta) onRefreshMeta();
    }
  };

  const handleResetFilters = () => {
    setSelectedCity('all');
    setHiringFilter('all');
    setSearchQuery('');
    setTechOnly(true);
    setPage(1);
  };

  const hasActiveFilters = selectedCity !== 'all' || hiringFilter !== 'all' || searchQuery.trim() !== '' || !techOnly;

  return (
    <div className="directory-view-container">
      {/* Dynamic Metrics Cards Banner */}
      <section className="directory-metrics-grid" aria-label="Directory Overview">
        <div className="metric-card card-blue">
          <div className="metric-icon-wrapper icon-blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
              <path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01" />
            </svg>
          </div>
          <div className="metric-content">
            <span className="metric-number">{aggregateStats.total || totalCount}</span>
            <span className="metric-label">Companies</span>
          </div>
        </div>

        <div className="metric-card card-green">
          <div className="metric-icon-wrapper icon-green">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
            </svg>
          </div>
          <div className="metric-content">
            <span className="metric-number text-green">{aggregateStats.hiring}</span>
            <span className="metric-label text-green">Hiring now</span>
          </div>
        </div>

        <div className="metric-card card-purple">
          <div className="metric-icon-wrapper icon-purple">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
          <div className="metric-content">
            <span className="metric-number">{aggregateStats.offices || totalCount}</span>
            <span className="metric-label">Verified offices</span>
          </div>
        </div>
      </section>

      {/* Directory Filter Bar */}
      <div className="directory-filter-bar">
        <div className="filter-row-primary">
          {/* Search box */}
          <div className="search-field-wrapper">
            <svg className="search-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              id="directory-search-input"
              className="search-input"
              placeholder="Search companies by name, category, or locality..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
            />
            {searchQuery && (
              <button
                className="clear-search-btn"
                onClick={() => { setSearchQuery(''); setPage(1); }}
                title="Clear search"
                aria-label="Clear search"
              >
                Clear
              </button>
            )}
          </div>

          {/* City Filter */}
          <div className="filter-select-wrapper">
            <svg className="filter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <select
              id="directory-city-select"
              className="directory-select"
              value={selectedCity}
              onChange={(e) => {
                setSelectedCity(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All Indian Cities ({groupedDirectoryCities.totalOffices} offices)</option>
              {groupedDirectoryCities.tier1.length > 0 && (
                <optgroup label="Major Indian Tech Hubs">
                  {groupedDirectoryCities.tier1.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}{c.state ? `, ${c.state}` : ''} {c.officeCount > 0 ? `(${c.officeCount} saved)` : '(Ready to scan)'}
                    </option>
                  ))}
                </optgroup>
              )}
              {groupedDirectoryCities.others.length > 0 && (
                <optgroup label="Regional IT Clusters and Cities">
                  {groupedDirectoryCities.others.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}{c.state ? `, ${c.state}` : ''} {c.officeCount > 0 ? `(${c.officeCount} saved)` : '(Ready to scan)'}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Dual-Engine Map-Wise Discovery Trigger */}
          <button
            className="osm-scan-trigger-btn"
            onClick={() => {
              if (selectedCity !== 'all') {
                setDiscoveryCitySlug(selectedCity);
              }
              setShowDiscoveryModal(true);
            }}
            title="Scan Google Places or OpenStreetMap map-wise for local startups and consultancies"
            id="open-city-scanner-btn"
          >
            <span className="osm-scan-icon">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                <line x1="8" y1="2" x2="8" y2="18" />
                <line x1="16" y1="6" x2="16" y2="22" />
              </svg>
            </span>
            <span className="osm-scan-text">
              {selectedCity !== 'all' 
                ? `Scan ${cities.find(c => c.slug === selectedCity)?.name || selectedCity} (Google / Map)` 
                : 'Map-Wise Places Scanner'}
            </span>
          </button>

          {/* Quick Add Company Button - Preserved for upcoming Admin portal (hidden for general users to prevent spam) */}
          {/*
          <button
            className="quick-add-company-btn"
            onClick={() => handleOpenAddModal(searchQuery)}
            title="Add a company or startup directly"
            id="open-add-company-btn"
          >
            <span className="add-icon">+</span>
            <span className="add-text">Add Company</span>
          </button>
          */}
        </div>

        {/* Secondary Filter Row: Hiring Status Tabs & Tech Checkbox */}
        <div className="filter-row-secondary">
          <div className="hiring-toggle-group">
            <button
              className={`hiring-toggle-btn ${hiringFilter === 'all' ? 'active' : ''}`}
              onClick={() => { setHiringFilter('all'); setPage(1); }}
            >
              All Companies {aggregateStats.total > 0 && <span className="pill-badge">{aggregateStats.total}</span>}
            </button>
            <button
              className={`hiring-toggle-btn ${hiringFilter === 'hiring' ? 'active' : ''}`}
              onClick={() => { setHiringFilter('hiring'); setPage(1); }}
            >
              <span className="dot dot-green"></span>
              Hiring now {aggregateStats.hiring > 0 && <span className="pill-badge">{aggregateStats.hiring}</span>}
            </button>
            <button
              className={`hiring-toggle-btn ${hiringFilter === 'no_vacancy' ? 'active' : ''}`}
              onClick={() => { setHiringFilter('no_vacancy'); setPage(1); }}
            >
              <span className="dot dot-gray"></span>
              No known vacancies {aggregateStats.total > 0 && <span className="pill-badge">{Math.max(0, aggregateStats.total - aggregateStats.hiring)}</span>}
            </button>
          </div>

          <label className="tech-checkbox-label">
            <input
              type="checkbox"
              id="tech-only-checkbox"
              checked={techOnly}
              onChange={(e) => {
                setTechOnly(e.target.checked);
                setPage(1);
              }}
            />
            <span>Tech & product roles only</span>
          </label>
        </div>
      </div>

      {/* Results Header */}
      <div className="results-header-row">
        <span className="results-count">
          Showing <strong>{companies.length}</strong> of <strong>{totalCount}</strong> companies
          {selectedCity !== 'all' ? ` in ${selectedCity}` : ''}
        </span>

        {hasActiveFilters && (
          <button className="reset-filters-inline-btn" onClick={handleResetFilters}>
            Reset Filters
          </button>
        )}
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading company directory...</p>
        </div>
      ) : error ? (
        <div className="error-banner">
          <span>{error}</span>
          <button className="retry-btn" onClick={fetchCompanies}>Retry</button>
        </div>
      ) : companies.length === 0 ? (
        <div className="empty-state">
          <h3>{searchQuery ? `No companies matched "${searchQuery}"` : 'No companies matched your filters'}</h3>
          <p>
            Try resetting your search query, city, or hiring status filter.
          </p>
          <div className="empty-state-actions">
            <button className="reset-filters-btn" onClick={handleResetFilters}>
              Reset Filters
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="companies-grid">
            {companies.map((comp) => (
              <CompanyCard
                key={comp._id}
                company={comp}
                onUpdate={handleCompanyUpdate}
                onPersonalize={setPersonalizeCompany}
              />
            ))}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="pagination-container">
              <span className="page-indicator">
                Page {page} of {totalPages}
              </span>
              <div className="page-controls">
                <button
                  className="page-btn"
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <button
                  className="page-btn"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Dual-Engine Map-Wise Discovery Modal */}
      {showDiscoveryModal && (
        <div className="modal-backdrop" onClick={() => !isScanning && setShowDiscoveryModal(false)}>
          <div className="discovery-modal-card discovery-scanner-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="discovery-modal-header">
              <div className="discovery-header-top-row">
                <div className="discovery-modal-badge">
                  <span className="live-pulse-dot" />
                  <span>{scannerEngine === 'google_places' ? 'Google Places Radar' : 'OpenStreetMap Engine'}</span>
                </div>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={() => setShowDiscoveryModal(false)}
                  aria-label="Close modal"
                  title="Close scanner (scan continues in background)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="discovery-modal-title-group">
                <h3 className="discovery-modal-title">
                  {scannerEngine === 'google_places' ? 'Startup & Tech Office Scanner' : 'City Startup & Office Discovery'}
                </h3>
                <p className="discovery-modal-subtitle">
                  {scannerEngine === 'google_places'
                    ? 'Discovers verified software companies, IT consultancies, dev agencies, and local tech hubs via Google Places coordinates.'
                    : 'Extracts physical IT campuses, registered tech offices & co-working spaces directly from OpenStreetMap.'}
                </p>
              </div>
            </div>

            <div className="discovery-modal-body">
              {/* 2-Column Responsive Config Grid for Discovery Engine & Target City */}
              <div className="discovery-config-grid">
                {/* Engine Switcher Tabs */}
                <div className="discovery-form-group">
                  <label className="discovery-label">Discovery Engine</label>
                <div className="engine-tabs">
                  <button
                    type="button"
                    className={`engine-tab-btn ${scannerEngine === 'google_places' ? 'active' : ''}`}
                    onClick={() => {
                      if (!isScanning) {
                        setScannerEngine('google_places');
                        setScanStatus(null);
                      }
                    }}
                    disabled={isScanning}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                      <circle cx="12" cy="9" r="2.5"/>
                    </svg>
                    <span>Google Places</span>
                    <span className="tab-badge">Map-Wise</span>
                  </button>
                  <button
                    type="button"
                    className={`engine-tab-btn ${scannerEngine === 'osm' ? 'active' : ''}`}
                    onClick={() => {
                      if (!isScanning) {
                        setScannerEngine('osm');
                        setScanStatus(null);
                      }
                    }}
                    disabled={isScanning}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="2" y1="12" x2="22" y2="12"/>
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                    </svg>
                    <span>OpenStreetMap</span>
                    <span className="tab-badge free">Free OSM</span>
                  </button>
                </div>
              </div>

              {/* City Selector */}
              <div className="discovery-form-group">
                <label className="discovery-label" htmlFor="scanner-city-select">
                  Target City Hub
                </label>
                <div className="discovery-select-wrapper">
                  <div className="discovery-select-icon">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                      <circle cx="12" cy="9" r="2.5"/>
                    </svg>
                  </div>
                  <select
                    id="scanner-city-select"
                    className="discovery-city-select with-left-icon"
                    value={discoveryCitySlug}
                    onChange={(e) => {
                      setDiscoveryCitySlug(e.target.value);
                      setScanStatus(null);
                    }}
                    disabled={isScanning}
                  >
                    <optgroup label="Tier 1 Tech Capitals">
                      {AVAILABLE_INDIAN_HUBS.filter(h => h.tier === 1).map((h) => {
                        const matched = cities.find(c => c.slug === h.slug);
                        const count = matched?.officeCount || 0;
                        return (
                          <option key={h.slug} value={h.slug}>
                            {h.name}, {h.state} {count > 0 ? `(${count} saved in db)` : '(Ready to scan)'}
                          </option>
                        );
                      })}
                    </optgroup>
                    <optgroup label="Tier 2 Tech Hubs and IT Corridors">
                      {AVAILABLE_INDIAN_HUBS.filter(h => h.tier === 2).map((h) => {
                        const matched = cities.find(c => c.slug === h.slug);
                        const count = matched?.officeCount || 0;
                        return (
                          <option key={h.slug} value={h.slug}>
                            {h.name}, {h.state} {count > 0 ? `(${count} saved in db)` : '(Ready to scan)'}
                          </option>
                        );
                      })}
                    </optgroup>
                    <optgroup label="Tier 3 and Emerging Tech Centers">
                      {AVAILABLE_INDIAN_HUBS.filter(h => h.tier === 3).map((h) => {
                        const matched = cities.find(c => c.slug === h.slug);
                        const count = matched?.officeCount || 0;
                        return (
                          <option key={h.slug} value={h.slug}>
                            {h.name}, {h.state} {count > 0 ? `(${count} saved in db)` : '(Ready to scan)'}
                          </option>
                        );
                      })}
                    </optgroup>
                  </select>
                </div>
              </div>
            </div>

              {/* Engine Specific Options */}
              {scannerEngine === 'google_places' ? (
                <>
                  {/* Map Search Radius */}
                  <div className="discovery-form-group">
                    <label className="discovery-label">Search Radius (from city center)</label>
                    <div className="radius-selector-row">
                      <button
                        type="button"
                        className={`radius-btn ${scanRadius === 15000 ? 'active' : ''}`}
                        onClick={() => setScanRadius(15000)}
                        disabled={isScanning}
                      >
                        <span className="radius-val">15 km</span>
                        <span className="radius-lbl">Core City</span>
                      </button>
                      <button
                        type="button"
                        className={`radius-btn ${scanRadius === 25000 ? 'active' : ''}`}
                        onClick={() => setScanRadius(25000)}
                        disabled={isScanning}
                      >
                        <span className="radius-val">25 km</span>
                        <span className="radius-lbl">IT Corridors</span>
                      </button>
                      <button
                        type="button"
                        className={`radius-btn ${scanRadius === 50000 ? 'active' : ''}`}
                        onClick={() => setScanRadius(50000)}
                        disabled={isScanning}
                      >
                        <span className="radius-val">50 km</span>
                        <span className="radius-lbl">Greater Metro</span>
                      </button>
                    </div>
                  </div>

                  {/* Unified Scope Card */}
                  <div className="discovery-scope-card">
                    <div className="scope-row">
                      <div className="scope-icon-wrap info">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="16" x2="12" y2="12" />
                          <line x1="12" y1="8" x2="12.01" y2="8" />
                        </svg>
                      </div>
                      <div className="scope-text-wrap">
                        Scanning map radius in{' '}
                        <strong>{AVAILABLE_INDIAN_HUBS.find(h => h.slug === discoveryCitySlug)?.name || discoveryCitySlug}</strong>{' '}
                        for software agencies, IT consultancies, app developers & tech startups.
                      </div>
                    </div>
                  </div>

                  {/* Optional Custom Google API Key Accordion */}
                  <div className="api-key-accordion-section">
                    <button
                      type="button"
                      className={`api-key-accordion-toggle ${showApiKeyInput ? 'is-expanded' : ''}`}
                      onClick={() => setShowApiKeyInput(!showApiKeyInput)}
                    >
                      <div className="api-key-toggle-left">
                        <svg className="api-key-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 2l-2 2m-1.5 1.5L16 7l-1.5-1.5-4 4 1.5 1.5L9 14l-1.5-1.5-4 4A3 3 0 1 0 7.8 20.8l4-4 1.5 1.5 3-3-1.5-1.5 1.5-1.5 2-2z" />
                        </svg>
                        <span>Have a Google Places API Key?</span>
                        <span className="api-key-optional-tag">Optional</span>
                      </div>
                      <svg
                        className={`accordion-chevron ${showApiKeyInput ? 'is-open' : ''}`}
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    {showApiKeyInput && (
                      <div className="api-key-input-box">
                        <label className="discovery-label" htmlFor="custom-api-key-input">Custom API Key</label>
                        <input
                          id="custom-api-key-input"
                          type="password"
                          className="discovery-input"
                          placeholder="AIzaSy... (leave blank to use system key / free local engine)"
                          value={customApiKey}
                          onChange={(e) => setCustomApiKey(e.target.value)}
                          disabled={isScanning}
                        />
                        <span className="api-key-hint">
                          Optional. If blank, JobRadar uses system settings or intelligent high-density local business scanning without requiring Google billing.
                        </span>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {/* City Coverage Info Pill for OSM */}
                  <div className="discovery-scope-card">
                    <div className="scope-row">
                      <div className="scope-icon-wrap info">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="16" x2="12" y2="12" />
                          <line x1="12" y1="8" x2="12.01" y2="8" />
                        </svg>
                      </div>
                      <div className="scope-text-wrap">
                        Targeting registered IT offices & software tech corridors in{' '}
                        <strong>{AVAILABLE_INDIAN_HUBS.find(h => h.slug === discoveryCitySlug)?.name || discoveryCitySlug}</strong> via OpenStreetMap.
                      </div>
                    </div>
                  </div>

                  {/* Advanced Options for OSM */}
                  <div className="discovery-options-row" style={{ marginTop: '6px' }}>
                    <label className="discovery-checkbox-label">
                      <input
                        type="checkbox"
                        checked={forceRefresh}
                        onChange={(e) => setForceRefresh(e.target.checked)}
                        disabled={isScanning}
                      />
                      <span>Force fresh scan (bypass 24-hour cache)</span>
                    </label>
                  </div>
                </>
              )}

              {/* Initial Ready-to-Scan Radar Briefing Card */}
              {!isScanning && !scanStatus?.lastSummary && (
                <div className="discovery-prescan-card">
                  <div className="prescan-left">
                    <div className="prescan-hub-badge">
                      <span className="prescan-pulse-dot" />
                      <span>
                        {AVAILABLE_INDIAN_HUBS.find(h => h.slug === discoveryCitySlug)?.tier
                          ? `Tier ${AVAILABLE_INDIAN_HUBS.find(h => h.slug === discoveryCitySlug)?.tier} Hub`
                          : 'Tech Hub'}
                      </span>
                    </div>
                    <h4 className="prescan-title">
                      Ready to scan {AVAILABLE_INDIAN_HUBS.find(h => h.slug === discoveryCitySlug)?.name || discoveryCitySlug}
                    </h4>
                    <p className="prescan-desc">
                      {scannerEngine === 'google_places'
                        ? `Radar will query Google Places across a ${scanRadius / 1000} km radius from ${AVAILABLE_INDIAN_HUBS.find(h => h.slug === discoveryCitySlug)?.name || discoveryCitySlug}'s IT corridors. Discovered companies and physical office coordinates will appear side-by-side on an interactive map preview.`
                        : `Overpass API will extract physical IT campuses, registered tech offices & software co-working spaces directly from OpenStreetMap.`}
                    </p>
                  </div>
                  <div className="prescan-metrics-col">
                    <div className="prescan-metric-item">
                      <span className="prescan-metric-val">
                        {cities.find(c => c.slug === discoveryCitySlug)?.officeCount || 0}
                      </span>
                      <span className="prescan-metric-lbl">Offices in DB</span>
                    </div>
                    <div className="prescan-metric-item">
                      <span className="prescan-metric-val">
                        {scannerEngine === 'google_places' ? `${scanRadius / 1000} km` : 'Full Hub'}
                      </span>
                      <span className="prescan-metric-lbl">Radar Radius</span>
                    </div>
                    <div className="prescan-metric-item">
                      <span className="prescan-metric-val">Live Map</span>
                      <span className="prescan-metric-lbl">Interactive Pinpoint</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Progress State */}
              {isScanning && (
                <div className="discovery-scanning-box">
                  <div className="scanner-radar-visual">
                    <div className="radar-sweep-ring ring-1" />
                    <div className="radar-sweep-ring ring-2" />
                    <div className="radar-sweep-ring ring-3" />
                    <div className="radar-center-beacon">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                        <circle cx="12" cy="9" r="2.5"/>
                      </svg>
                    </div>
                  </div>
                  <div className="scanner-status-text">
                    {scanStatus?.progress || `Scanning ${AVAILABLE_INDIAN_HUBS.find(h => h.slug === discoveryCitySlug)?.name || discoveryCitySlug} for tech offices...`}
                  </div>
                  <div className="scanner-steps-list">
                    <div className="scanner-step active">
                      <span className="step-dot" />
                      <span>{scannerEngine === 'google_places' ? 'Querying Google Places map coordinates' : 'Querying physical IT offices & tech campuses'}</span>
                    </div>
                    <div className="scanner-step active">
                      <span className="step-dot" />
                      <span>Extracting verified addresses, phone numbers, and websites</span>
                    </div>
                    <div className="scanner-step active">
                      <span className="step-dot" />
                      <span>Deduplicating entries against MongoDB Atlas database</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Scan Results Summary */}
              {!isScanning && scanStatus?.lastSummary && (
                <div className="discovery-results-card">
                  <div className="results-header">
                    <h4>Scan Completed for {scanStatus.lastSummary.city}</h4>
                  </div>
                  <div className="results-grid">
                    <div className="result-metric">
                      <span className="metric-val text-green">+{scanStatus.lastSummary.createdCompanies}</span>
                      <span className="metric-lbl">New Companies</span>
                    </div>
                    <div className="result-metric">
                      <span className="metric-val text-blue">+{scanStatus.lastSummary.createdOffices}</span>
                      <span className="metric-lbl">Offices Added</span>
                    </div>
                    <div className="result-metric">
                      <span className="metric-val">{scanStatus.lastSummary.skippedDuplicates}</span>
                      <span className="metric-lbl">Duplicates Kept</span>
                    </div>
                    <div className="result-metric">
                      <span className="metric-val">
                        {scanStatus.lastSummary.totalDiscovered ?? scanStatus.lastSummary.elementsCount ?? 0}
                      </span>
                      <span className="metric-lbl">Places Found</span>
                    </div>
                  </div>

                  {/* Discovered Places Preview List & Interactive Map View */}
                  {Array.isArray(scanStatus?.discoveredPreview) && scanStatus.discoveredPreview.length > 0 && (
                    <div className={`places-preview-container mode-${placesViewMode}`}>
                      <div className="places-preview-header">
                        <div className="places-preview-title-wrap">
                          <span className="places-preview-title">Discovered Places Preview</span>
                          <span className="places-preview-badge">{scanStatus.discoveredPreview.length} places</span>
                        </div>

                        {/* Interactive View Switcher: Split vs List vs Map */}
                        <div className="scanner-view-toggle">
                          <button
                            type="button"
                            className={`scanner-toggle-btn ${placesViewMode === 'split' ? 'active' : ''}`}
                            onClick={() => setPlacesViewMode('split')}
                            title="Split View: Places list and interactive map side-by-side"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="3" y="3" width="8" height="18" rx="1" />
                              <rect x="13" y="3" width="8" height="18" rx="1" />
                            </svg>
                            <span>Split</span>
                          </button>
                          <button
                            type="button"
                            className={`scanner-toggle-btn ${placesViewMode === 'list' ? 'active' : ''}`}
                            onClick={() => setPlacesViewMode('list')}
                            title="Places list only"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="8" y1="6" x2="21" y2="6" />
                              <line x1="8" y1="12" x2="21" y2="12" />
                              <line x1="8" y1="18" x2="21" y2="18" />
                              <line x1="3" y1="6" x2="3.01" y2="6" />
                              <line x1="3" y1="12" x2="3.01" y2="12" />
                              <line x1="3" y1="18" x2="3.01" y2="18" />
                            </svg>
                            <span>List</span>
                          </button>
                          <button
                            type="button"
                            className={`scanner-toggle-btn ${placesViewMode === 'map' ? 'active' : ''}`}
                            onClick={() => setPlacesViewMode('map')}
                            title="Full Interactive Map view only"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                              <line x1="8" y1="2" x2="8" y2="18" />
                              <line x1="16" y1="6" x2="16" y2="22" />
                            </svg>
                            <span>Map</span>
                          </button>
                        </div>
                      </div>

                      <div className="places-preview-body-layout">
                        {/* Scrollable Places Cards Panel */}
                        {placesViewMode !== 'map' && (
                          <div className={`places-preview-scroll ${placesViewMode === 'split' ? 'is-split' : 'is-full'}`}>
                            {scanStatus.discoveredPreview.map((place, idx) => {
                              const cleanPhone = cleanPhoneDisplay(place.phone);
                              const telPhone = cleanPhoneForTel(place.phone);
                              const isPinpointed = selectedPreviewPlace?.name === place.name;

                              const placeDirectionsUrl = (place.lat != null && place.lng != null)
                                ? `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`
                                : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${place.name}, ${place.address || place.locality || ''}`)}`;

                              return (
                                <div key={idx} className={`place-preview-card ${isPinpointed ? 'is-pinpointed' : ''}`}>
                                  <div className="place-card-top-row">
                                    <h5
                                      className="place-card-name clickable-name"
                                      title="Click to pinpoint on interactive map"
                                      onClick={() => {
                                        setSelectedPreviewPlace(place);
                                        if (placesViewMode === 'list') setPlacesViewMode('split');
                                      }}
                                    >
                                      {place.name}
                                    </h5>
                                    {place.rating && (
                                      <div className="place-card-rating" title={`Google rating: ${place.rating} (${place.reviewsCount || 0} reviews)`}>
                                        <span className="rating-num">Rating: {place.rating}</span>
                                        {place.reviewsCount ? <span className="rating-count">({place.reviewsCount})</span> : null}
                                      </div>
                                    )}
                                  </div>

                                  <div style={{ display: 'flex', gap: '6px', margin: '4px 0 6px 0', flexWrap: 'wrap' }}>
                                    {place.category && (
                                      <span style={{ fontSize: '11px', padding: '1px 7px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary)', fontWeight: 600 }}>
                                        {place.category}
                                      </span>
                                    )}
                                    {place.isTech && (
                                      <span style={{ fontSize: '11px', padding: '1px 7px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.12)', color: '#059669', fontWeight: 600 }}>
                                        Verified Tech
                                      </span>
                                    )}
                                  </div>

                                  {place.address && (
                                    <div
                                      className="place-card-address clickable-address"
                                      title="Click to view and pinpoint on interactive map right here"
                                      onClick={() => {
                                        setSelectedPreviewPlace(place);
                                        if (placesViewMode === 'list') setPlacesViewMode('split');
                                      }}
                                    >
                                      <svg className="place-pin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                                        <circle cx="12" cy="10" r="3" />
                                      </svg>
                                      <span className="address-text">{place.address}</span>
                                    </div>
                                  )}

                                  <div className="place-card-actions">
                                    {cleanPhone && (
                                      <div className="place-action-pill phone-action-pill" title={cleanPhone}>
                                        <svg className="action-pill-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
                                        </svg>
                                        <a href={`tel:${telPhone}`} className="action-pill-link">
                                          {cleanPhone}
                                        </a>
                                        <button
                                          type="button"
                                          className={`pill-copy-icon-btn ${copiedPreviewId === `ph-${idx}` ? 'is-copied' : ''}`}
                                          onClick={() => handleCopyPreviewText(cleanPhone, `ph-${idx}`)}
                                          title={copiedPreviewId === `ph-${idx}` ? 'Copied phone!' : 'Copy phone'}
                                          aria-label="Copy phone"
                                        >
                                          {copiedPreviewId === `ph-${idx}` ? (
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                              <polyline points="20 6 9 17 4 12" />
                                            </svg>
                                          ) : (
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                            </svg>
                                          )}
                                        </button>
                                      </div>
                                    )}

                                    {place.website && (
                                      <div className="place-action-pill web-action-pill">
                                        <svg className="action-pill-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                          <circle cx="12" cy="12" r="10" />
                                          <line x1="2" y1="12" x2="22" y2="12" />
                                          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                                        </svg>
                                        <a
                                          href={ensureHttp(place.website)}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="action-pill-link"
                                          title={`Visit ${place.website}`}
                                        >
                                          {formatDomain(place.website)}
                                        </a>
                                        <button
                                          type="button"
                                          className={`pill-copy-icon-btn ${copiedPreviewId === `web-${idx}` ? 'is-copied' : ''}`}
                                          onClick={() => handleCopyPreviewText(ensureHttp(place.website), `web-${idx}`)}
                                          title={copiedPreviewId === `web-${idx}` ? 'Copied website!' : 'Copy website'}
                                          aria-label="Copy website"
                                        >
                                          {copiedPreviewId === `web-${idx}` ? (
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                              <polyline points="20 6 9 17 4 12" />
                                            </svg>
                                          ) : (
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                            </svg>
                                          )}
                                        </button>
                                      </div>
                                    )}

                                    {/* View Map: Opens interactive map right here in-place */}
                                    <button
                                      type="button"
                                      className={`place-action-pill map-action-pill ${isPinpointed ? 'is-selected' : ''}`}
                                      onClick={() => {
                                        setSelectedPreviewPlace(place);
                                        if (placesViewMode === 'list') setPlacesViewMode('split');
                                      }}
                                      title="Open map right here and pinpoint this office"
                                    >
                                      <svg className="action-pill-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                                        <circle cx="12" cy="10" r="3" />
                                      </svg>
                                      <span className="action-pill-link">View Map</span>
                                    </button>

                                    {/* Directions: Redirects to Google Maps navigation route */}
                                    <a
                                      href={placeDirectionsUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="place-action-pill directions-action-pill"
                                      title="Redirect to Google Maps for turn-by-turn route navigation"
                                    >
                                      <svg className="action-pill-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                        <polygon points="3 11 22 2 13 21 11 13 3 11" />
                                      </svg>
                                      <span className="action-pill-link">Directions</span>
                                    </a>

                                    <a
                                      href={place.searchUrl || `https://www.google.com/search?q=${encodeURIComponent(place.name + ' ' + (place.locality || selectedCity?.name || 'India') + ' contact phone website official')}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="place-action-pill search-action-pill"
                                      title="Search Google for verified office website and contact phone"
                                    >
                                      <svg className="action-pill-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                        <circle cx="11" cy="11" r="8" />
                                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                      </svg>
                                      <span className="action-pill-link">Search Info</span>
                                    </a>

                                    <a
                                      href={place.linkedinUrl || `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(place.name + ' hr recruiter talent acquisition')}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="place-action-pill linkedin-action-pill"
                                      title="Find talent acquisition and HR recruiters at this company on LinkedIn"
                                    >
                                      <svg className="action-pill-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                        <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
                                        <rect x="2" y="9" width="4" height="12" />
                                        <circle cx="4" cy="4" r="2" />
                                      </svg>
                                      <span className="action-pill-link">Find HR</span>
                                    </a>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Right Side: Interactive Leaflet Map right inside the modal */}
                        {placesViewMode !== 'list' && (
                          <div className={`places-map-pane ${placesViewMode === 'map' ? 'is-full' : 'is-split'}`}>
                            <DiscoveredPlacesMap
                              places={scanStatus.discoveredPreview}
                              selectedPlace={selectedPreviewPlace}
                              onSelectPlace={(place) => setSelectedPreviewPlace(place)}
                              cityName={scanStatus.lastSummary?.city || discoveryCitySlug}
                              citySlug={discoveryCitySlug}
                              centerCoords={scanStatus.lastSummary?.center}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Scan Error */}
              {!isScanning && scanStatus?.error && (
                <div className="discovery-error-box">
                  <span>{scanStatus.error}</span>
                </div>
              )}
            </div>

            <div className="discovery-modal-footer">
              <button
                type="button"
                className="btn-modal-secondary"
                onClick={() => setShowDiscoveryModal(false)}
              >
                {isScanning ? 'Run in Background' : 'Close'}
              </button>

              {!isScanning && scanStatus?.lastSummary ? (
                <button
                  type="button"
                  className="btn-modal-primary"
                  onClick={() => {
                    setSelectedCity(discoveryCitySlug);
                    setPage(1);
                    setShowDiscoveryModal(false);
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  <span>View {scanStatus.lastSummary.city} Companies</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-modal-primary"
                  onClick={handleStartScan}
                  disabled={isScanning}
                  id="start-places-scan-btn"
                >
                  {isScanning ? (
                    <>
                      <span className="btn-spinner" />
                      <span>Scanning in background...</span>
                    </>
                  ) : (
                    <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                      <span>{scannerEngine === 'google_places' ? 'Start Google Places Scan' : 'Start OSM Scan'}</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Company Modal */}
      {showAddModal && (
        <div className="modal-backdrop" onClick={() => !isAddingCompany && setShowAddModal(false)}>
          <div className="discovery-modal-card add-company-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="discovery-modal-header">
              <div className="discovery-modal-title-group">
                <div className="discovery-modal-badge">Manual & Google Import</div>
                <h3 className="discovery-modal-title">Add Company to Directory</h3>
                <p className="discovery-modal-subtitle">
                  Add local startups or companies found on Google directly to your directory and outreach pipeline.
                </p>
              </div>
              {!isAddingCompany && (
                <button
                  className="modal-close-btn"
                  onClick={() => setShowAddModal(false)}
                  aria-label="Close modal"
                >
                  ×
                </button>
              )}
            </div>

            <form onSubmit={handleSubmitAddCompany}>
              <div className="discovery-modal-body">
                {addError && (
                  <div className="discovery-error-box">
                    <span>{addError}</span>
                  </div>
                )}

                <div className="discovery-form-group">
                  <label className="discovery-label" htmlFor="add-company-name">Company Name *</label>
                  <input
                    id="add-company-name"
                    type="text"
                    className="discovery-input"
                    placeholder="e.g. Riz Software Consultancy"
                    value={addForm.name}
                    onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                    required
                  />
                </div>

                <div className="discovery-form-row">
                  <div className="discovery-form-group flex-1">
                    <label className="discovery-label" htmlFor="add-company-website">Website URL</label>
                    <input
                      id="add-company-website"
                      type="url"
                      className="discovery-input"
                      placeholder="https://rizsoftware.com"
                      value={addForm.website}
                      onChange={(e) => setAddForm({ ...addForm, website: e.target.value })}
                    />
                  </div>

                  <div className="discovery-form-group flex-1">
                    <label className="discovery-label" htmlFor="add-company-city">City *</label>
                    <select
                      id="add-company-city"
                      className="discovery-city-select"
                      value={addForm.city}
                      onChange={(e) => setAddForm({ ...addForm, city: e.target.value })}
                    >
                      {AVAILABLE_INDIAN_HUBS.map((h) => (
                        <option key={h.slug} value={h.slug}>{h.name}, {h.state}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="discovery-form-group">
                  <label className="discovery-label" htmlFor="add-company-address">Office Address / Locality</label>
                  <input
                    id="add-company-address"
                    type="text"
                    className="discovery-input"
                    placeholder="e.g. DN Block, College More, Sector V, Salt Lake, Kolkata - 700091"
                    value={addForm.address}
                    onChange={(e) => setAddForm({ ...addForm, address: e.target.value })}
                  />
                </div>

                <div className="discovery-form-row">
                  <div className="discovery-form-group flex-1">
                    <label className="discovery-label" htmlFor="add-company-email">Contact / HR Email</label>
                    <input
                      id="add-company-email"
                      type="email"
                      className="discovery-input"
                      placeholder="info@company.com"
                      value={addForm.contactEmail}
                      onChange={(e) => setAddForm({ ...addForm, contactEmail: e.target.value })}
                    />
                  </div>

                  <div className="discovery-form-group flex-1">
                    <label className="discovery-label" htmlFor="add-company-phone">Phone Number</label>
                    <input
                      id="add-company-phone"
                      type="tel"
                      className="discovery-input"
                      placeholder="+91 33 4001 0000"
                      value={addForm.contactPhone}
                      onChange={(e) => setAddForm({ ...addForm, contactPhone: e.target.value })}
                    />
                  </div>
                </div>

                <div className="discovery-form-group">
                  <label className="discovery-label" htmlFor="add-company-notes">Notes / Focus</label>
                  <input
                    id="add-company-notes"
                    type="text"
                    className="discovery-input"
                    placeholder="e.g. Custom software, web & mobile app development agency"
                    value={addForm.notes}
                    onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
                  />
                </div>
              </div>

              <div className="discovery-modal-footer">
                <button
                  type="button"
                  className="btn-modal-secondary"
                  onClick={() => setShowAddModal(false)}
                  disabled={isAddingCompany}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-modal-primary"
                  disabled={isAddingCompany}
                >
                  {isAddingCompany ? 'Saving...' : 'Save to Directory'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Personalize Pitch Modal */}
      {personalizeCompany && (
        <PersonalizeModal
          company={personalizeCompany}
          onClose={() => setPersonalizeCompany(null)}
          onSaveToNotes={(id, note, nextStatus) => {
            handleCompanyUpdate(id, { notes: note, followUpStatus: nextStatus || 'to_contact' });
          }}
        />
      )}
    </div>
  );
}
