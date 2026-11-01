import React, { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useLocation, POPULAR_TECH_HUBS } from '../context/LocationContext';
import { useModalScrollLock } from '../utils/useModalScrollLock';
import { searchPlacesLikeGoogleMaps } from '../utils/placeSearchService';
import './UserLocationModal.css';

// Fix Leaflet marker icons in Vite / Webpack
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
});

export default function UserLocationModal() {
  const {
    userLocation,
    setUserLocation,
    clearUserLocation,
    detectCurrentLocation,
    isDetecting,
    detectError,
    sortByDistance,
    setSortByDistance,
    maxDistanceKm,
    setMaxDistanceKm,
    isLocationModalOpen,
    closeLocationModal
  } = useLocation();

  useModalScrollLock(isLocationModalOpen);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [draftLocation, setDraftLocation] = useState(userLocation);

  const searchTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);

  // Sync draftLocation when userLocation changes
  useEffect(() => {
    if (userLocation) {
      setDraftLocation(userLocation);
    }
  }, [userLocation]);

  // Google Maps-like place search with real-time location bias and distance ranking
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (abortControllerRef.current) abortControllerRef.current.abort();

    // Determine reference anchor coordinates (draft/pinned point > GPS user location > map center > default Kolkata)
    let anchorLat = draftLocation?.lat || userLocation?.lat;
    let anchorLng = draftLocation?.lng || userLocation?.lng;

    if ((anchorLat == null || anchorLng == null) && mapInstanceRef.current) {
      try {
        const center = mapInstanceRef.current.getCenter();
        anchorLat = center.lat;
        anchorLng = center.lng;
      } catch (_) {}
    }

    if (anchorLat == null || anchorLng == null) {
      anchorLat = 22.5726;
      anchorLng = 88.3639;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const results = await searchPlacesLikeGoogleMaps(
          searchQuery,
          anchorLat,
          anchorLng,
          controller.signal
        );
        setSearchResults(results);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setSearchResults([]);
        }
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [searchQuery, draftLocation, userLocation]);

  // Reverse geocode when user clicks on the map
  // Reverse geocode when user clicks on the map or drags pin
  const reverseGeocodeCoords = useCallback(async (lat, lng) => {
    // 1. Try our high-precision backend reverse geocode
    try {
      const res = await fetch(`/api/directory/places/reverse?lat=${lat}&lng=${lng}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.label) {
          return {
            label: data.label,
            city: data.city || '',
            lat,
            lng,
            source: 'map_click'
          };
        }
      }
    } catch (_) {}

    // 2. Fallback to OpenStreetMap
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        { headers: { 'Accept': 'application/json' } }
      );
      if (res.ok) {
        const data = await res.json();
        const addr = data.address || {};
        const poi = addr.amenity || addr.shop || addr.building || addr.tourism || '';
        const road = addr.road || addr.suburb || addr.neighbourhood || '';
        const city = addr.city || addr.town || addr.municipality || addr.state || '';

        let label = '';
        if (poi && (road || city)) {
          label = `${poi}, ${road || city}`;
        } else if (road && city) {
          label = `${road}, ${city}`;
        } else if (data.display_name) {
          label = data.display_name.split(',').slice(0, 3).join(', ').trim();
        } else {
          label = `Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
        }

        return {
          label,
          city,
          lat,
          lng,
          source: 'map_click'
        };
      }
    } catch (_) {}

    return {
      label: `Pinned Point (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
      city: '',
      lat,
      lng,
      source: 'map_click'
    };
  }, []);

  // Update map pin position and fly map
  const updateMapMarker = useCallback((loc) => {
    if (!mapInstanceRef.current || !loc?.lat || !loc?.lng) return;
    const map = mapInstanceRef.current;

    if (!markerRef.current) {
      const customPinIcon = L.divIcon({
        className: 'modal-location-marker',
        html: `
          <div class="modal-pin-wrapper">
            <div class="modal-pin-pulse"></div>
            <div class="modal-pin-core"></div>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      markerRef.current = L.marker([loc.lat, loc.lng], {
        icon: customPinIcon,
        draggable: true
      }).addTo(map);

      // Listen for marker drag
      markerRef.current.on('dragend', async (e) => {
        const newPos = e.target.getLatLng();
        const resolved = await reverseGeocodeCoords(newPos.lat, newPos.lng);
        setDraftLocation(resolved);
        markerRef.current.bindPopup(`<strong>📍 ${resolved.label}</strong>`).openPopup();
      });
    } else {
      markerRef.current.setLatLng([loc.lat, loc.lng]);
    }

    markerRef.current.bindPopup(`<strong>📍 ${loc.label || 'Selected Location'}</strong>`).openPopup();
    map.flyTo([loc.lat, loc.lng], Math.max(map.getZoom(), 14), { duration: 0.8 });
  }, [reverseGeocodeCoords]);

  // Initialize Leaflet Map inside Modal
  useEffect(() => {
    if (!isLocationModalOpen || !mapContainerRef.current) return;

    // Small delay to allow modal CSS transition to complete
    const timer = setTimeout(() => {
      if (!mapInstanceRef.current && mapContainerRef.current) {
        if (mapContainerRef.current._leaflet_id) {
          delete mapContainerRef.current._leaflet_id;
        }

        const initialLat = draftLocation?.lat || userLocation?.lat || 22.5726;
        const initialLng = draftLocation?.lng || userLocation?.lng || 88.3639;
        const initialZoom = (draftLocation || userLocation) ? 14 : 11;

        const map = L.map(mapContainerRef.current, {
          center: [initialLat, initialLng],
          zoom: initialZoom,
          zoomControl: false
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap'
        }).addTo(map);

        L.control.zoom({ position: 'bottomright' }).addTo(map);

        // Click map to drop pin and reverse-geocode
        map.on('click', async (e) => {
          const lat = e.latlng.lat;
          const lng = e.latlng.lng;
          const resolved = await reverseGeocodeCoords(lat, lng);
          setDraftLocation(resolved);
          updateMapMarker(resolved);
        });

        mapInstanceRef.current = map;

        // If a location already exists, show it immediately
        if (draftLocation || userLocation) {
          updateMapMarker(draftLocation || userLocation);
        }
      } else if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
        if (draftLocation) {
          updateMapMarker(draftLocation);
        }
      }
    }, 150);

    return () => {
      clearTimeout(timer);
    };
  }, [isLocationModalOpen, draftLocation, userLocation, reverseGeocodeCoords, updateMapMarker]);

  // Clean up map instance on modal close
  useEffect(() => {
    if (!isLocationModalOpen && mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    }
  }, [isLocationModalOpen]);

  if (!isLocationModalOpen) return null;

  // Handle selecting an autocomplete result or tech hub
  const handleSelectLocation = (loc) => {
    setDraftLocation(loc);
    setSearchQuery('');
    setSearchResults([]);
    updateMapMarker(loc);
  };

  // 1-Click GPS button
  const handleGpsDetect = async () => {
    const loc = await detectCurrentLocation();
    if (loc) {
      setDraftLocation(loc);
      updateMapMarker(loc);
    }
  };

  // Apply location and save
  const handleApply = () => {
    if (draftLocation) {
      setUserLocation(draftLocation);
      setSortByDistance(true);
    }
    closeLocationModal();
  };

  const handleClear = () => {
    clearUserLocation();
    setDraftLocation(null);
    if (markerRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(markerRef.current);
      markerRef.current = null;
    }
  };

  return (
    <div className="location-modal-overlay" onClick={closeLocationModal}>
      <div className="location-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <header className="location-modal-topbar">
          <div className="location-modal-title-wrap">
            <div className="location-icon-badge">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                <path d="M2 12h20" />
              </svg>
            </div>
            <div>
              <h3 className="location-modal-heading">Set Your Job Radar Location</h3>
              <p className="location-modal-subheading">
                Companies and live jobs will be sorted and measured nearest to this spot
              </p>
            </div>
          </div>
          <button
            type="button"
            className="location-modal-close"
            onClick={closeLocationModal}
            aria-label="Close modal"
          >
            ×
          </button>
        </header>

        {/* Main Grid: Left Controls / Right Map */}
        <div className="location-modal-grid">
          {/* Left Panel: Search & Controls */}
          <div className="location-controls-pane">
            {/* 1-Click GPS Button */}
            <button
              type="button"
              className="gps-hero-btn"
              onClick={handleGpsDetect}
              disabled={isDetecting}
              title="Automatically detect your location via browser GPS"
            >
              <div className="gps-hero-left">
                <div className="gps-hero-icon">
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="3 11 22 2 13 21 11 13 3 11" />
                  </svg>
                </div>
                <div className="gps-hero-text">
                  <span className="gps-hero-title">
                    {isDetecting ? 'Pinpointing GPS Location...' : 'Use My Current Location'}
                  </span>
                  <span className="gps-hero-desc">
                    {isDetecting ? 'Fetching exact coordinates & address' : 'Auto-pinpoint via browser GPS'}
                  </span>
                </div>
              </div>
              <span className="gps-hero-badge">1-Click GPS</span>
            </button>

            {detectError && (
              <div className="location-error-alert">
                ⚠️ {detectError}
              </div>
            )}

            {/* Live Autocomplete Search Input */}
            <div className="location-search-wrapper">
              <div className="location-search-field">
                <svg className="location-search-field-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  className="location-search-field-input"
                  placeholder="Search any dhaba, landmark, office, tech park, or street..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoComplete="off"
                  autoFocus
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="location-search-field-clear"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search query"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Autocomplete Dropdown */}
              {isSearching && (
                <div className="location-dropdown-list">
                  <div className="location-dropdown-loading">
                    🔍 Searching nearest places & landmarks...
                  </div>
                </div>
              )}

              {!isSearching && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
                <div className="location-dropdown-list">
                  <div className="location-dropdown-empty">
                    No places found near your location for "{searchQuery}". Try searching by area, road, or tech park.
                  </div>
                </div>
              )}

              {!isSearching && searchResults.length > 0 && (
                <div className="location-dropdown-list">
                  {searchResults.map((result, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="location-dropdown-item"
                      onClick={() => handleSelectLocation(result)}
                    >
                      <span className="dropdown-item-icon">
                        {result.category === 'food' ? '🍴' : (result.category === 'office' ? '🏢' : '📍')}
                      </span>
                      <div className="dropdown-item-content">
                        <div className="dropdown-item-header">
                          <span className="dropdown-item-title">{result.label}</span>
                          {result.distanceFormatted && (
                            <span className={`dropdown-item-dist-pill ${result.distanceKm != null && result.distanceKm < 30 ? 'is-nearby' : ''}`}>
                              {result.distanceFormatted}
                            </span>
                          )}
                        </div>
                        <span className="dropdown-item-sub">{result.fullAddress}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Active Selected Location Card */}
            {draftLocation ? (
              <div className="active-pinpoint-card">
                <div className="active-pinpoint-header">
                  <span className="active-pinpoint-tag">
                    <span className="active-pulse-dot" />
                    Active Proximity Reference
                  </span>
                  <button
                    type="button"
                    className="active-clear-btn"
                    onClick={handleClear}
                    title="Remove location filter"
                  >
                    Clear
                  </button>
                </div>
                <h4 className="active-pinpoint-name">{draftLocation.label}</h4>
                <div className="active-pinpoint-coords">
                  <span>📍 GPS: {draftLocation.lat.toFixed(4)}° N, {draftLocation.lng.toFixed(4)}° E</span>
                  {draftLocation.city && <span>• {draftLocation.city}</span>}
                </div>
              </div>
            ) : null}

            {/* Quick-Pick Indian Tech Corridors */}
            <div className="corridors-section">
              <span className="corridors-heading">⚡ Quick-Pick Tech Hubs</span>
              <div className="corridors-chips-grid">
                {POPULAR_TECH_HUBS.map((hub, idx) => {
                  const isSelected =
                    draftLocation &&
                    Math.abs(draftLocation.lat - hub.lat) < 0.005 &&
                    Math.abs(draftLocation.lng - hub.lng) < 0.005;

                  return (
                    <button
                      key={idx}
                      type="button"
                      className={`corridor-chip-btn ${isSelected ? 'is-active' : ''}`}
                      onClick={() => handleSelectLocation(hub)}
                    >
                      <span>📍</span>
                      <span>{hub.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Proximity Radius Filter */}
            {draftLocation && (
              <div className="radius-section">
                <span className="corridors-heading">📏 Maximum Proximity Radius</span>
                <div className="radius-pills-row">
                  {[
                    { label: 'All Distances', val: null },
                    { label: 'Within 5 km', val: 5 },
                    { label: 'Within 15 km', val: 15 },
                    { label: 'Within 25 km', val: 25 },
                    { label: 'Within 50 km', val: 50 }
                  ].map((r, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`radius-pill-btn ${maxDistanceKm === r.val ? 'is-active' : ''}`}
                      onClick={() => setMaxDistanceKm(r.val)}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Panel: Interactive Leaflet Map */}
          <div className="location-map-pane">
            <div className="map-floating-overlay-bar">
              <span className="map-overlay-title">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
                  <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                </svg>
                Interactive Location Radar Map
              </span>
              <span className="map-overlay-hint">
                💡 Click anywhere on map to reposition pin
              </span>
            </div>

            <div ref={mapContainerRef} className="modal-map-viewport" />
          </div>
        </div>

        {/* Footer */}
        <footer className="location-modal-bottom-bar">
          <span className="bottom-bar-hint">
            📍 Distance to all companies and live ATS jobs will be calculated in real-time
          </span>
          <div className="bottom-bar-actions">
            <button
              type="button"
              className="btn-loc-cancel"
              onClick={closeLocationModal}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-loc-apply"
              onClick={handleApply}
              title={draftLocation ? `Apply location: ${draftLocation.label}` : 'Done'}
            >
              <span className="btn-loc-apply-desktop">
                {draftLocation ? `Apply & Sort: ${draftLocation.label?.split(',')[0] || 'Location'}` : 'Done'}
              </span>
              <span className="btn-loc-apply-mobile">
                {draftLocation ? '✓ Apply Location' : 'Done'}
              </span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
