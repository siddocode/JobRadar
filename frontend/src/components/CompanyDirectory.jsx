import React, { useState, useEffect, useCallback } from 'react';
import CompanyCard from './CompanyCard';

export default function CompanyDirectory({ cities = [] }) {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [selectedCity, setSelectedCity] = useState('all');
  const [hiringFilter, setHiringFilter] = useState('all'); // 'all' | 'hiring' | 'no_vacancy'
  const [searchQuery, setSearchQuery] = useState('');
  const [techOnly, setTechOnly] = useState(false);
  const [followUpFilter, setFollowUpFilter] = useState('all');

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Dynamic Aggregate Metrics (from real data)
  const [aggregateStats, setAggregateStats] = useState({
    total: 0,
    hiring: 0,
    contacted: 0
  });

  // Fetch aggregate numbers from backend for top metrics
  const fetchAggregateMetrics = async () => {
    try {
      const [allRes, hiringRes, contactedRes] = await Promise.all([
        fetch('/api/directory/companies?limit=1'),
        fetch('/api/directory/companies?hiring=hiring&limit=1'),
        fetch('/api/directory/companies?followUp=contacted&limit=1')
      ]);
      const [allData, hiringData, contactedData] = await Promise.all([
        allRes.json(),
        hiringRes.json(),
        contactedRes.json()
      ]);
      setAggregateStats({
        total: allData.total || 0,
        hiring: hiringData.total || 0,
        contacted: contactedData.total || 0
      });
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
      if (followUpFilter !== 'all') params.append('followUp', followUpFilter);
      params.append('page', String(page));
      params.append('limit', '30');

      const res = await fetch(`/api/directory/companies?${params.toString()}`);
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
  }, [selectedCity, hiringFilter, searchQuery, techOnly, followUpFilter, page]);

  useEffect(() => {
    fetchAggregateMetrics();
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const handleCompanyUpdate = (id, updatedFields) => {
    setCompanies(prev =>
      prev.map(c => (c._id === id ? { ...c, ...updatedFields } : c))
    );
    // Refresh aggregate stats if follow-up changed
    if (updatedFields.followUpStatus) {
      fetchAggregateMetrics();
    }
  };

  const handleResetFilters = () => {
    setSelectedCity('all');
    setHiringFilter('all');
    setSearchQuery('');
    setTechOnly(false);
    setFollowUpFilter('all');
    setPage(1);
  };

  const hasActiveFilters = selectedCity !== 'all' || hiringFilter !== 'all' || searchQuery.trim() !== '' || techOnly || followUpFilter !== 'all';

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
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </div>
          <div className="metric-content">
            <span className="metric-number">{aggregateStats.contacted}</span>
            <span className="metric-label">Contacted</span>
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
              >
                ✕
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
              <option value="all">All Indian Cities</option>
              {cities.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name} {c.officeCount > 0 ? `(${c.officeCount} offices)` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Follow-up filter */}
          <div className="filter-select-wrapper">
            <svg className="filter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 14 14" />
            </svg>
            <select
              id="directory-followup-select"
              className="directory-select"
              value={followUpFilter}
              onChange={(e) => {
                setFollowUpFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All Outreach Status</option>
              <option value="to_contact">To Contact</option>
              <option value="contacted">Contacted</option>
              <option value="replied">Replied</option>
              <option value="not_interested">Not Interested</option>
            </select>
          </div>
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
            Reset Filters ✕
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
          <span>⚠️ {error}</span>
          <button className="retry-btn" onClick={fetchCompanies}>Retry</button>
        </div>
      ) : companies.length === 0 ? (
        <div className="empty-state">
          <h3>No companies matched your filters</h3>
          <p>Try resetting your search query, city, or status filter.</p>
          <button className="reset-filters-btn" onClick={handleResetFilters}>
            Reset Filters
          </button>
        </div>
      ) : (
        <>
          <div className="companies-grid">
            {companies.map((comp) => (
              <CompanyCard
                key={comp._id}
                company={comp}
                onUpdate={handleCompanyUpdate}
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
                  ← Previous
                </button>
                <button
                  className="page-btn"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
