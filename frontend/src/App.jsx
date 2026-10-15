import React, { useState, useEffect, useCallback } from 'react';
import CompanyDirectory from './components/CompanyDirectory';
import ReachOutView from './components/ReachOutView';

export default function App() {
  const [activeTab, setActiveTab] = useState('directory'); // 'directory' | 'jobs' | 'reachout'
  const [theme, setTheme] = useState(() => localStorage.getItem('jobradar_theme') || 'light');

  const [directoryCities, setDirectoryCities] = useState([]);
  const [companyCount, setCompanyCount] = useState(0);
  const [reachOutCount, setReachOutCount] = useState(0);

  const [jobs, setJobs] = useState([]);
  const [cities, setCities] = useState([]);
  const [meta, setMeta] = useState({ total: 0, openTotal: 0, totalInDb: 0, page: 1, limit: 25, totalPages: 1 });
  const [stats, setStats] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState('all');
  const [workModeFilter, setWorkModeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('open');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [indiaOnly, setIndiaOnly] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);

  // Status
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Sync theme attribute on document root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('jobradar_theme', theme);
  }, [theme]);

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

  // Fetch cities list with job counts
  const fetchCities = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (indiaOnly) params.append('country', 'India');
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
  }, [indiaOnly, statusFilter]);

  // Fetch jobs with comprehensive filters
  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.append('q', searchQuery.trim());
      if (selectedCity !== 'all') params.append('city', selectedCity);
      if (workModeFilter !== 'all') params.append('workMode', workModeFilter);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (companyFilter !== 'all') params.append('company', companyFilter);
      if (indiaOnly) params.append('country', 'India');
      params.append('page', String(page));
      params.append('limit', String(limit));

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
  }, [searchQuery, selectedCity, workModeFilter, statusFilter, companyFilter, indiaOnly, page, limit]);

  const fetchDirectoryMeta = async () => {
    try {
      const [citiesRes, compRes, reachRes] = await Promise.all([
        fetch('/api/directory/cities'),
        fetch('/api/directory/companies?limit=1'),
        fetch('/api/directory/reach-out')
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
  };

  useEffect(() => {
    fetchStats();
    fetchDirectoryMeta();
  }, []);

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

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedCity('all');
    setWorkModeFilter('all');
    setStatusFilter('open');
    setCompanyFilter('all');
    setIndiaOnly(true);
    setPage(1);
  };

  const formatDate = (isoString) => {
    if (!isoString) return '—';
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

  return (
    <div className="app-shell" data-theme={theme}>
      {/* Sidebar Navigation */}
      <aside className="app-sidebar">
        <div className="sidebar-brand">
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
            className={`nav-item ${activeTab === 'directory' ? 'active' : ''}`}
            onClick={() => setActiveTab('directory')}
            id="tab-directory"
          >
            <span className="nav-item-icon">🏢</span>
            <span className="nav-item-text">Company directory</span>
            {companyCount > 0 && <span className="nav-item-badge">{companyCount}</span>}
          </button>

          <button
            className={`nav-item ${activeTab === 'jobs' ? 'active' : ''}`}
            onClick={() => setActiveTab('jobs')}
            id="tab-jobs"
          >
            <span className="nav-item-icon">💼</span>
            <span className="nav-item-text">Live jobs</span>
            {meta.totalInDb > 0 && <span className="nav-item-badge">{meta.totalInDb.toLocaleString()}</span>}
          </button>

          <button
            className={`nav-item ${activeTab === 'reachout' ? 'active' : ''}`}
            onClick={() => setActiveTab('reachout')}
            id="tab-reachout"
          >
            <span className="nav-item-icon">🎯</span>
            <span className="nav-item-text">Outreach pipeline</span>
            {reachOutCount > 0 && <span className="nav-item-badge">{reachOutCount}</span>}
          </button>
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="app-main-area">
        <header className="main-topbar">
          <div className="topbar-title-block">
            <h1 className="page-heading">
              {activeTab === 'directory' && 'Company directory'}
              {activeTab === 'jobs' && 'Live jobs'}
              {activeTab === 'reachout' && 'Outreach pipeline'}
            </h1>
            <p className="page-subheading">
              {activeTab === 'directory' && 'Discover verified employers and track your outreach.'}
              {activeTab === 'jobs' && 'Real-time verified job openings directly from ATS boards.'}
              {activeTab === 'reachout' && 'Proactive outreach to companies before jobs are posted publicly.'}
            </p>
          </div>

          <div className="topbar-actions">
            <label className="india-toggle-pill" htmlFor="india-only-toggle" title="Filter for jobs based in India or remote in India">
              <input
                id="india-only-toggle"
                type="checkbox"
                checked={indiaOnly}
                onChange={(e) => {
                  setIndiaOnly(e.target.checked);
                  setPage(1);
                }}
              />
              <span>🇮🇳 India Only</span>
            </label>

            <button
              className="theme-switch-btn"
              onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
              title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
            >
              {theme === 'light' ? (
                <>
                  <span className="theme-icon">🌙</span>
                  <span className="theme-text">Dark</span>
                </>
              ) : (
                <>
                  <span className="theme-icon">☀️</span>
                  <span className="theme-text">Light</span>
                </>
              )}
            </button>

            <div className="ats-live-pill" id="source-indicator">
              <span className="live-dot" />
              <span>Live ATS Verified</span>
            </div>
          </div>
        </header>

        <div className="main-content-body">
          {/* View 1: Company Directory */}
          {activeTab === 'directory' && (
            <CompanyDirectory cities={directoryCities} />
          )}

          {/* View 2: Reach Out View */}
          {activeTab === 'reachout' && (
            <ReachOutView cities={directoryCities} />
          )}

          {/* View 3: Live Jobs View */}
          {activeTab === 'jobs' && (
            <div className="live-jobs-container">
              {/* Aggregate Stats Ribbon */}
              <section className="stats-ribbon" aria-label="Job Statistics">
                <div className="stat-card">
                  <span className="stat-label">Total Tracked Jobs</span>
                  <span className="stat-value">{stats ? stats.total.toLocaleString() : meta.totalInDb.toLocaleString()}</span>
                  <span className="stat-subtext">Across {stats ? stats.companiesCount : '—'} companies</span>
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
                  <span className="stat-subtext">{indiaOnly ? 'Across India' : 'Worldwide'}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Matching Current View</span>
                  <span className="stat-value text-blue">{meta.total.toLocaleString()}</span>
                  <span className="stat-subtext">Filtered results</span>
                </div>
              </section>

              {/* Filter Card */}
              <section className="filter-card" aria-label="Filters">
                <div className="filter-grid">
                  {/* Search Box */}
                  <div className="input-group">
                    <label htmlFor="search-title-input" className="input-label">Job Title / Keyword</label>
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

                  {/* City Dropdown */}
                  <div className="input-group">
                    <label htmlFor="filter-city-select" className="input-label">City</label>
                    <select
                      id="filter-city-select"
                      className="custom-select"
                      value={selectedCity}
                      onChange={(e) => {
                        setSelectedCity(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="all">All Cities ({cities.reduce((sum, c) => sum + c.count, 0)})</option>
                      {cities.map((c) => (
                        <option key={c.city} value={c.city}>
                          {c.city} {c.state ? `(${c.state})` : ''} — {c.count} {c.count === 1 ? 'job' : 'jobs'}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Work Mode Filter */}
                  <div className="input-group">
                    <label htmlFor="filter-workmode-select" className="input-label">Work Mode</label>
                    <select
                      id="filter-workmode-select"
                      className="custom-select"
                      value={workModeFilter}
                      onChange={(e) => {
                        setWorkModeFilter(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="all">All Work Modes</option>
                      <option value="onsite">🏢 On-site Only</option>
                      <option value="hybrid">🔄 Hybrid Only</option>
                      <option value="remote">🌐 Remote Only</option>
                      <option value="unknown">❓ Unspecified</option>
                    </select>
                  </div>

                  {/* Company Filter */}
                  {stats && stats.companies && stats.companies.length > 0 && (
                    <div className="input-group">
                      <label htmlFor="filter-company-select" className="input-label">Company</label>
                      <select
                        id="filter-company-select"
                        className="custom-select"
                        value={companyFilter}
                        onChange={(e) => {
                          setCompanyFilter(e.target.value);
                          setPage(1);
                        }}
                      >
                        <option value="all">All Companies ({stats.companies.length})</option>
                        {stats.companies.map((comp) => (
                          <option key={comp} value={comp}>{comp}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Status Filter */}
                  <div className="input-group">
                    <label htmlFor="filter-status-select" className="input-label">Status</label>
                    <select
                      id="filter-status-select"
                      className="custom-select"
                      value={statusFilter}
                      onChange={(e) => {
                        setStatusFilter(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="all">All Postings</option>
                      <option value="open">Active / Open Only</option>
                      <option value="closed">Closed Only</option>
                    </select>
                  </div>

                  {/* Clear Filters Button */}
                  <div className="input-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button
                      id="clear-filters-btn"
                      type="button"
                      className="clear-btn"
                      onClick={handleResetFilters}
                    >
                      Reset Filters
                    </button>
                  </div>
                </div>
              </section>

              {/* Results Container */}
              <div className="results-container">
                <div className="results-header">
                  <div className="results-count" id="results-count-text">
                    Showing <strong>{jobs.length}</strong> of <strong>{meta.total}</strong> matching jobs
                    {indiaOnly && <span className="active-tag">🇮🇳 India Focus</span>}
                    {selectedCity !== 'all' && <span className="active-tag">📍 {selectedCity}</span>}
                    {workModeFilter !== 'all' && <span className="active-tag">💼 {workModeFilter}</span>}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label htmlFor="page-limit-select" style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Per page:</label>
                    <select
                      id="page-limit-select"
                      className="custom-select"
                      style={{ width: '80px', padding: '6px 10px', fontSize: '13px' }}
                      value={limit}
                      onChange={(e) => {
                        setLimit(Number(e.target.value));
                        setPage(1);
                      }}
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                </div>

                {loading ? (
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
                          {jobs.map((job) => {
                            const rawLoc = job.locationRaw || job.location || 'Unspecified';
                            const displayCity = job.city ? `${job.city}${job.state ? `, ${job.state}` : ''}` : (job.workMode === 'remote' ? 'Remote, India' : rawLoc);

                            return (
                              <tr key={job._id || `${job.source}-${job.sourceJobId}`}>
                                <td className="job-title-cell">
                                  <div className="title-text">{job.title}</div>
                                  {job.source === 'adzuna' && (
                                    <div className="adzuna-attribution">
                                      Provided by <a href="https://www.adzuna.in" target="_blank" rel="noopener noreferrer">Adzuna</a>
                                    </div>
                                  )}
                                </td>
                                <td>
                                  <div className="company-wrapper">
                                    <span className="job-company-pill">{job.company}</span>
                                    <span className={`ats-pill ${getSourceBadgeClass(job.source)}`}>
                                      {job.source}
                                    </span>
                                  </div>
                                </td>
                                <td>
                                  <div className="location-wrapper">
                                    <span
                                      className="job-location-text"
                                      title={`Raw ATS Location: ${rawLoc}`}
                                    >
                                      📍 {displayCity}
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
                                <td style={{ textAlign: 'right' }}>
                                  <a
                                    href={job.applyUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="apply-button"
                                    id={`apply-link-${job.sourceJobId}`}
                                  >
                                    Apply ↗
                                  </a>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination footer */}
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
                          ← Previous
                        </button>
                        <button
                          id="next-page-btn"
                          className="page-btn"
                          disabled={page >= meta.totalPages}
                          onClick={() => setPage((p) => Math.min(p + 1, meta.totalPages))}
                        >
                          Next →
                        </button>
                      </div>
                    </div>
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
    </div>
  );
}
