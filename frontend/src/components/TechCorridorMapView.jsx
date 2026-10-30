import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getCompanyOfficeDetails } from '../utils/companyOfficeRegistry';

// Fix Leaflet's default icon path issues in bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// City centers for camera navigation
const CITY_CENTERS = {
  all: { lat: 21.5000, lng: 78.9629, zoom: 5 },
  bengaluru: { lat: 12.9550, lng: 77.6500, zoom: 12 },
  bangalore: { lat: 12.9550, lng: 77.6500, zoom: 12 },
  hyderabad: { lat: 17.4350, lng: 78.3800, zoom: 12 },
  gurugram: { lat: 28.4750, lng: 77.0650, zoom: 12 },
  gurgaon: { lat: 28.4750, lng: 77.0650, zoom: 12 },
  pune: { lat: 18.5500, lng: 73.8300, zoom: 12 },
  noida: { lat: 28.5400, lng: 77.3600, zoom: 12 },
  'delhi ncr': { lat: 28.6139, lng: 77.2090, zoom: 11 },
  delhi: { lat: 28.6139, lng: 77.2090, zoom: 11 },
  mumbai: { lat: 19.0760, lng: 72.8777, zoom: 11 },
  chennai: { lat: 12.9800, lng: 80.2200, zoom: 12 },
  kolkata: { lat: 22.5726, lng: 88.3639, zoom: 11 }
};

export default function TechCorridorMapView({
  selectedCity = 'all',
  selectedCorridor = 'all',
  onSelectCity,
  onSelectCorridor,
  availableCorridors = [],
  jobs = [],
  loading = false,
  onOpenApply,
  onOpenCvTailor,
  onOpenEligibility,
  onRefreshJobs
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const officeMarkerRef = useRef(null);

  const [activeCorridorKey, setActiveCorridorKey] = useState(selectedCorridor);
  const [allIndiaCorridors, setAllIndiaCorridors] = useState([]);
  const [loadingCorridors, setLoadingCorridors] = useState(false);
  const [drawerTab, setDrawerTab] = useState('companies'); // 'companies' | 'jobs'
  const [selectedOffice, setSelectedOffice] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);

  // Synchronize internal state with parent prop
  useEffect(() => {
    setActiveCorridorKey(selectedCorridor);
  }, [selectedCorridor]);

  // Fetch all corridors if "all" city is active
  useEffect(() => {
    if (selectedCity === 'all' || !selectedCity) {
      setLoadingCorridors(true);
      fetch('/api/corridors?allCorridors=true')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && data.success && Array.isArray(data.corridors)) {
            setAllIndiaCorridors(data.corridors);
          }
          setLoadingCorridors(false);
        })
        .catch(() => setLoadingCorridors(false));
    }
  }, [selectedCity]);

  // Determine current active corridors to render on the map
  const displayCorridors = useMemo(() => {
    if (selectedCity && selectedCity !== 'all' && availableCorridors.length > 0) {
      return availableCorridors;
    }
    return allIndiaCorridors;
  }, [selectedCity, availableCorridors, allIndiaCorridors]);

  // Filter jobs for the selected corridor in the side drawer
  const corridorJobs = useMemo(() => {
    if (!jobs || jobs.length === 0) return [];
    if (!activeCorridorKey || activeCorridorKey === 'all') {
      return jobs.slice(0, 100);
    }
    const filtered = jobs.filter((j) => j.techCorridor === activeCorridorKey);
    return filtered.length > 0 ? filtered : jobs;
  }, [jobs, activeCorridorKey]);

  // Active corridor metadata
  const activeCorridorMeta = useMemo(() => {
    if (!activeCorridorKey || activeCorridorKey === 'all') return null;
    return displayCorridors.find((c) => c.key === activeCorridorKey) || null;
  }, [activeCorridorKey, displayCorridors]);

  // Group companies in current corridor with office address and coordinates
  const corridorCompanies = useMemo(() => {
    if (!corridorJobs || corridorJobs.length === 0) return [];
    const map = new Map();
    for (const job of corridorJobs) {
      const name = job.company;
      if (!name) continue;

      if (!map.has(name)) {
        const details = getCompanyOfficeDetails(
          name,
          job.city || selectedCity || 'Bengaluru',
          job.coordinates || activeCorridorMeta?.center
        );

        const hasValidDistinctCoords = job.coordinates?.lat && 
          job.coordinates?.lng && 
          !(Math.abs(job.coordinates.lat - 12.9716) < 0.0001 && Math.abs(job.coordinates.lng - 77.5946) < 0.0001);

        map.set(name, {
          company: name,
          officeName: job.officeName || details.officeName,
          officeAddress: job.officeAddress || details.officeAddress,
          locality: job.locality || details.locality,
          coordinates: hasValidDistinctCoords ? job.coordinates : details.coordinates,
          techCorridor: job.techCorridor || details.techCorridor || activeCorridorKey,
          jobsCount: 1,
          sampleJob: job
        });
      } else {
        const item = map.get(name);
        item.jobsCount += 1;
        if (job.coordinates?.lat && job.coordinates?.lng) {
          const isGeneric = Math.abs(job.coordinates.lat - 12.9716) < 0.0001 && Math.abs(job.coordinates.lng - 77.5946) < 0.0001;
          if (!isGeneric) {
            item.coordinates = job.coordinates;
          }
        }
        if (!item.officeAddress && job.officeAddress) item.officeAddress = job.officeAddress;
        if (!item.officeName && job.officeName) item.officeName = job.officeName;
      }
    }
    return Array.from(map.values()).sort((a, b) => b.jobsCount - a.jobsCount);
  }, [corridorJobs, activeCorridorMeta, selectedCity, activeCorridorKey]);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const initialTarget = CITY_CENTERS[selectedCity?.toLowerCase()] || CITY_CENTERS.all;
      const map = L.map(mapContainerRef.current, {
        center: [initialTarget.lat, initialTarget.lng],
        zoom: initialTarget.zoom,
        zoomControl: false,
        attributionControl: false
      });

      // Free OpenStreetMap tiles with zero watermark / API key requirement
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      // Custom zoom control in bottom-right
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      const markersLayer = L.layerGroup().addTo(map);
      markersLayerRef.current = markersLayer;
      mapInstanceRef.current = map;

      // Invalidate size on mount to ensure tiles render immediately
      setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 100);
      setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 400);

      // Observe container resize to auto-adjust Leaflet canvas
      const resizeObserver = new ResizeObserver(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      });
      resizeObserver.observe(mapContainerRef.current);
      mapContainerRef.current._resizeObserver = resizeObserver;
    }

    return () => {
      // Cleanup on full unmount
      if (mapContainerRef.current && mapContainerRef.current._resizeObserver) {
        mapContainerRef.current._resizeObserver.disconnect();
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update camera view when selectedCity changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const cityKey = (selectedCity || 'all').toLowerCase();
    const target = CITY_CENTERS[cityKey] || CITY_CENTERS.all;

    map.flyTo([target.lat, target.lng], target.zoom, {
      duration: 1.2,
      easeLinearity: 0.25
    });
  }, [selectedCity]);

  // Render Corridor Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) return;

    markersLayer.clearLayers();

    if (!displayCorridors || displayCorridors.length === 0) return;

    displayCorridors.forEach((corridor) => {
      if (!corridor.center || !corridor.center.lat || !corridor.center.lng) return;

      const isSelected = corridor.key === activeCorridorKey;
      const countFormatted = corridor.count > 999 
        ? `${(corridor.count / 1000).toFixed(1)}k` 
        : corridor.count;

      // Classy custom HTML Marker icon
      const customIcon = L.divIcon({
        className: 'custom-corridor-leaflet-pin',
        html: `
          <div class="map-corridor-pill ${isSelected ? 'is-selected' : ''}">
            <span class="map-corridor-radar-dot"></span>
            <span class="map-corridor-name">${corridor.shortName || corridor.name}</span>
            <span class="map-corridor-badge">${countFormatted}</span>
          </div>
        `,
        iconSize: [140, 36],
        iconAnchor: [70, 18]
      });

      const marker = L.marker([corridor.center.lat, corridor.center.lng], {
        icon: customIcon,
        riseOnHover: true
      });

      marker.on('click', () => {
        setActiveCorridorKey(corridor.key);
        if (onSelectCorridor) {
          onSelectCorridor(corridor.key);
        }
        map.flyTo([corridor.center.lat, corridor.center.lng], 14, {
          duration: 0.8
        });
      });

      markersLayer.addLayer(marker);
    });
  }, [displayCorridors, activeCorridorKey, onSelectCorridor]);

  // Fly to active corridor if explicitly selected
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !activeCorridorKey || activeCorridorKey === 'all') return;

    const matched = displayCorridors.find((c) => c.key === activeCorridorKey);
    if (matched && matched.center && matched.center.lat && matched.center.lng) {
      map.flyTo([matched.center.lat, matched.center.lng], 14, {
        duration: 0.9
      });
    }
  }, [activeCorridorKey, displayCorridors]);

  // Pinpoint Company Office on Map and open directions popup
  const handleLocateCompany = (companyObj, sampleJob = null) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const job = sampleJob || companyObj.sampleJob || {};
    const companyName = companyObj.company || job.company;

    const details = getCompanyOfficeDetails(
      companyName,
      job.city || selectedCity || 'Bengaluru',
      companyObj.coordinates || job.coordinates || activeCorridorMeta?.center
    );

    let targetCoords = companyObj.coordinates;
    const isGenericCenter = !targetCoords || !targetCoords.lat || !targetCoords.lng ||
      (Math.abs(targetCoords.lat - 12.9716) < 0.0001 && Math.abs(targetCoords.lng - 77.5946) < 0.0001);

    if (isGenericCenter) {
      if (job.coordinates?.lat && !(Math.abs(job.coordinates.lat - 12.9716) < 0.0001 && Math.abs(job.coordinates.lng - 77.5946) < 0.0001)) {
        targetCoords = job.coordinates;
      } else {
        targetCoords = details.coordinates;
      }
    }

    if (!targetCoords || !targetCoords.lat || !targetCoords.lng) return;

    const officeName = companyObj.officeName || job.officeName || details.officeName;
    const address = companyObj.officeAddress || job.officeAddress || details.officeAddress;

    setSelectedOffice({
      company: companyName,
      officeName,
      address,
      coordinates: targetCoords
    });

    // Remove previous office marker if any
    if (officeMarkerRef.current) {
      map.removeLayer(officeMarkerRef.current);
      officeMarkerRef.current = null;
    }

    // Google Maps Direction and Search URLs
    const destQuery = encodeURIComponent(`${companyName}, ${officeName}, ${address}`);
    const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${destQuery}`;
    const mapsSearchUrl = targetCoords?.lat && targetCoords?.lng
      ? `https://www.google.com/maps/search/?api=1&query=${targetCoords.lat},${targetCoords.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${destQuery}`;

    // Custom Glowing Office Beacon Icon
    const officeIcon = L.divIcon({
      className: 'custom-company-office-pin',
      html: `
        <div class="company-pulse-marker">
          <div class="pulse-ring"></div>
          <div class="office-pin-core">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
        </div>
      `,
      iconSize: [44, 44],
      iconAnchor: [22, 38]
    });

    const marker = L.marker([targetCoords.lat, targetCoords.lng], {
      icon: officeIcon,
      zIndexOffset: 1200
    }).addTo(map);

    const popupHtml = `
      <div class="office-map-popup">
        <div class="popup-eyebrow">Verified Tech Office</div>
        <h4 class="popup-company-name">${companyName}</h4>
        <div class="popup-office-landmark">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
            <line x1="9" y1="22" x2="9" y2="22.01" />
            <line x1="15" y1="22" x2="15" y2="22.01" />
            <line x1="9" y1="6" x2="9" y2="6.01" />
            <line x1="15" y1="6" x2="15" y2="6.01" />
          </svg>
          ${officeName}
        </div>
        <p class="popup-address">${address}</p>
        <div class="popup-actions">
          <a href="${mapsSearchUrl}" target="_blank" rel="noopener noreferrer" class="popup-map-btn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            View on Map
          </a>
          <a href="${directionsUrl}" target="_blank" rel="noopener noreferrer" class="popup-directions-btn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polygon points="3 11 22 2 13 21 11 13 3 11" />
            </svg>
            Get Directions
          </a>
        </div>
      </div>
    `;

    marker.bindPopup(popupHtml, {
      className: 'custom-leaflet-office-popup',
      offset: [0, -32],
      closeButton: true,
      autoClose: false
    }).openPopup();

    officeMarkerRef.current = marker;

    // Fly camera directly to company office building with smooth easing
    map.flyTo([targetCoords.lat, targetCoords.lng], 16, {
      duration: 1.1
    });
  };

  const handleSyncLiveOpenings = async () => {
    const targetCity = (!selectedCity || selectedCity === 'all') ? 'Gurugram' : selectedCity;
    setIsSyncing(true);
    setSyncMessage(`Probing free public ATS boards for ${targetCity}...`);
    try {
      const res = await fetch(`/api/jobs/harvest?city=${encodeURIComponent(targetCity)}`, { method: 'POST' });
      if (res.ok) {
        setSyncMessage(`Scanning live openings in ${targetCity}...`);
        setTimeout(() => {
          if (onRefreshJobs) onRefreshJobs();
          setIsSyncing(false);
          setSyncMessage(null);
        }, 4500);
      } else {
        setIsSyncing(false);
        setSyncMessage(null);
      }
    } catch (_) {
      setIsSyncing(false);
      setSyncMessage(null);
    }
  };

  return (
    <div className="map-view-layout">
      {/* Corridor Companies & Jobs Left Side Drawer (like Google Maps) */}
      <div className="map-side-drawer">
        <div className="map-side-header">
          <div>
            <div className="map-side-eyebrow">
              {activeCorridorMeta ? `${activeCorridorMeta.city || selectedCity} Corridor` : 'Live Tech Hub Feed'}
            </div>
            <h3 className="map-side-title">
              {activeCorridorMeta ? activeCorridorMeta.name : (selectedCity === 'all' ? 'All Verified Openings' : `${selectedCity} Openings`)}
            </h3>
            {syncMessage && (
              <div className="map-sync-toast">
                <span className="spinner-mini" /> {syncMessage}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
            <span className="map-side-badge">
              {drawerTab === 'companies' 
                ? `${corridorCompanies.length} ${corridorCompanies.length === 1 ? 'Company' : 'Companies'}` 
                : `${corridorJobs.length} ${corridorJobs.length === 1 ? 'Role' : 'Roles'}`}
            </span>
            <button
              type="button"
              className="btn-sync-openings"
              onClick={handleSyncLiveOpenings}
              disabled={isSyncing}
              title="Automatically scan free public ATS boards for this city"
            >
              <svg className={isSyncing ? "spin-icon" : ""} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
              </svg>
              {isSyncing ? 'Scanning...' : 'Sync Live'}
            </button>
          </div>
        </div>

        {/* Drawer Mode Tabs: Companies vs Roles */}
        <div className="map-drawer-tabs">
          <button
            type="button"
            className={`map-drawer-tab ${drawerTab === 'companies' ? 'is-active' : ''}`}
            onClick={() => setDrawerTab('companies')}
          >
            Companies & Offices ({corridorCompanies.length})
          </button>
          <button
            type="button"
            className={`map-drawer-tab ${drawerTab === 'jobs' ? 'is-active' : ''}`}
            onClick={() => setDrawerTab('jobs')}
          >
            Open Roles ({corridorJobs.length})
          </button>
        </div>

        {activeCorridorMeta && (
          <div className="map-corridor-spotlight">
            <div className="spotlight-badge">Corridor Spotlight</div>
            <p className="spotlight-desc">
              Office tech parks & verified postings in <strong>{activeCorridorMeta.name}</strong>. Click any company on the left to pinpoint office on the map & get direct navigation directions.
            </p>
          </div>
        )}

        {/* Drawer Scrollable Content */}
        <div className="map-jobs-scroll">
          {loading ? (
            <div className="map-drawer-loading">
              <div className="spinner" style={{ width: '24px', height: '24px', borderWidth: '2px' }} />
              <p>Loading corridor openings...</p>
            </div>
          ) : drawerTab === 'companies' ? (
            /* Companies & Offices List */
            corridorCompanies.length === 0 ? (
              <div className="map-no-jobs">
                <h4>No companies cataloged yet</h4>
                <p>Select another corridor or city to explore office locations.</p>
              </div>
            ) : (
              corridorCompanies.map((c) => {
                const destQuery = encodeURIComponent(`${c.company}, ${c.officeName}, ${c.officeAddress}`);
                const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${destQuery}`;
                const mapsSearchUrl = c.coordinates?.lat && c.coordinates?.lng
                  ? `https://www.google.com/maps/search/?api=1&query=${c.coordinates.lat},${c.coordinates.lng}`
                  : `https://www.google.com/maps/search/?api=1&query=${destQuery}`;
                const isPinpointed = selectedOffice?.company === c.company;

                return (
                  <div key={c.company} className={`map-company-card ${isPinpointed ? 'is-pinpointed' : ''}`}>
                    <div className="map-company-header">
                      <span className="map-company-name" onClick={() => handleLocateCompany(c)}>
                        {c.company}
                      </span>
                      <span className="map-company-count">{c.jobsCount} {c.jobsCount === 1 ? 'Job' : 'Jobs'}</span>
                    </div>

                    <div className="map-company-office">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      <strong>{c.officeName}</strong>
                    </div>

                    <p className="map-company-address">{c.officeAddress}</p>

                    <div className="map-company-actions">
                      <button
                        type="button"
                        className="map-locate-btn"
                        onClick={() => handleLocateCompany(c)}
                        title="Locate exact office on map"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <circle cx="12" cy="12" r="10" />
                          <polygon points="12 8 8 12 12 16 16 12 12 8" />
                        </svg>
                        Locate
                      </button>

                      <a
                        href={mapsSearchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="map-open-maps-btn"
                        title="Open exact office in Google Maps"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        Open Map
                      </a>

                      <a
                        href={directionsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="map-directions-btn"
                        title="Open Google Maps Route (see where to go)"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polygon points="3 11 22 2 13 21 11 13 3 11" />
                        </svg>
                        Directions
                      </a>
                    </div>
                  </div>
                );
              })
            )
          ) : (
            /* Roles List */
            corridorJobs.length === 0 ? (
              <div className="map-no-jobs">
                <div className="no-jobs-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="8" y1="12" x2="16" y2="12" />
                  </svg>
                </div>
                <h4>No roles listed for this corridor</h4>
                <p>Try switching to another corridor or viewing all jobs in {selectedCity}.</p>
              </div>
            ) : (
              corridorJobs.map((job) => {
                const applyHref = job.applyUrl || (job.sourceJobId ? `https://boards.greenhouse.io/${job.company}/jobs/${job.sourceJobId}` : '#');
                const destQuery = encodeURIComponent(`${job.company}, ${job.officeName || job.locality || ''}, ${job.officeAddress || job.city || ''}`);
                const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${destQuery}`;
                const isPinpointed = selectedOffice?.company === job.company;

                return (
                  <div key={job._id || `${job.company}-${job.sourceJobId}`} className={`map-job-card ${isPinpointed ? 'is-pinpointed' : ''}`}>
                    <div className="map-job-top">
                      <span
                        className="map-job-company clickable"
                        onClick={() => handleLocateCompany({ company: job.company }, job)}
                        title="Click to pinpoint office on map"
                      >
                        {job.company}
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: '4px' }}>
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                      </span>
                      <span className="map-job-mode">{job.workMode || 'onsite'}</span>
                    </div>

                    <h4 className="map-job-title" title={job.title}>{job.title}</h4>

                    <div className="map-job-meta">
                      <span
                        className="meta-item clickable-meta"
                        onClick={() => handleLocateCompany({ company: job.company }, job)}
                        title="Locate office landmark"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        {job.officeName || job.locality || job.city || 'India'}
                      </span>
                      {job.seniority && (
                        <span className="meta-badge-seniority">{job.seniority}</span>
                      )}
                    </div>

                    {job.eligibility && (
                      <div className="map-job-eligibility">
                        <span className={`elig-indicator ${job.eligibility.matchStatus}`}>
                          {job.eligibility.score}% Match • {job.eligibility.matchStatus?.toUpperCase()}
                        </span>
                      </div>
                    )}

                    <div className="map-job-actions">
                      <a
                        href={applyHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="map-apply-btn"
                      >
                        Apply Official
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </a>
                      <a
                        href={directionsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="map-tailor-btn"
                        title="Get directions to office on Google Maps"
                      >
                        Directions
                      </a>
                      {onOpenCvTailor && (
                        <button
                          type="button"
                          className="map-tailor-btn"
                          onClick={() => onOpenCvTailor(job)}
                          title="Tailor CV to this role"
                        >
                          Tailor CV
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )
          )}
        </div>
      </div>

      {/* Interactive Map Canvas (Right Panel) */}
      <div className="map-canvas-container">
        <div ref={mapContainerRef} className="leaflet-map-canvas" />

        {/* Map Header Floating Overlay */}
        <div className="map-floating-header">
          <div className="map-floating-title">
            <span className="radar-live-icon"></span>
            <strong>
              {selectedCity === 'all'
                ? 'Pan-India Tech Corridor Network'
                : `${selectedCity} Tech Corridors`}
            </strong>
          </div>
          <div className="map-floating-meta">
            <span>{displayCorridors.length} Micro-Corridors</span>
            <span>•</span>
            <span>
              {displayCorridors.reduce((sum, c) => sum + (c.count || 0), 0).toLocaleString()} Verified Jobs
            </span>
          </div>
        </div>

        {/* Floating Quick Action: Reset to Overview */}
        {(activeCorridorKey !== 'all' || selectedCity !== 'all' || selectedOffice) && (
          <button
            type="button"
            className="map-floating-reset-btn"
            onClick={() => {
              setActiveCorridorKey('all');
              setSelectedOffice(null);
              if (officeMarkerRef.current && mapInstanceRef.current) {
                mapInstanceRef.current.removeLayer(officeMarkerRef.current);
                officeMarkerRef.current = null;
              }
              if (onSelectCorridor) onSelectCorridor('all');
              const map = mapInstanceRef.current;
              if (map) {
                const target = CITY_CENTERS[selectedCity?.toLowerCase()] || CITY_CENTERS.all;
                map.flyTo([target.lat, target.lng], target.zoom, { duration: 0.8 });
              }
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            Reset City View
          </button>
        )}
      </div>
    </div>
  );
}
