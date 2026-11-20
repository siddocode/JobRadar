import React, { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MapPin,
  Navigation,
  Search,
  Sparkles,
  SlidersHorizontal,
  Info,
  AlertCircle,
  AlertTriangle,
  Building2,
  Crosshair,
  ShieldAlert,
  ShieldCheck,
  Utensils,
  Compass,
  Globe,
  X
} from 'lucide-react';
import { useLocation, POPULAR_TECH_HUBS, calculateDistanceKm } from '../context/LocationContext';
import { useModalScrollLock } from '../utils/useModalScrollLock';
import {
  searchPlacesDetailed,
  searchCuratedPlaces,
  formatPlaceSubtitle,
  zoomForPlace
} from '../utils/placeSearchService';
import { resolveLocationName } from '../utils/resolveLocationName';
import { evaluateLocationFix, formatAccuracy } from '../utils/locationFixQuality';
import './UserLocationModal.css';

// Fix Leaflet marker icons in Vite / Webpack
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
});

/**
 * Build a display label from the structured suggestion fields.
 * Keeps the provider's exact name first and de-duplicates overlapping parts so
 * "Technopolis, CP Block, Sector V, Kolkata" never becomes just "Kolkata".
 */
function composePlaceLabel(place = {}) {
  const parts = [place.name || place.label, place.locality, place.city, place.state]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  const out = [];
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (out.some((existing) => {
      const existingLower = existing.toLowerCase();
      return existingLower === lower || existingLower.includes(lower);
    })) continue;
    out.push(part);
  }
  return out.join(', ');
}

/**
 * True when two staged locations describe the same spot, so the
 * "reset to searched result" affordance is only offered when it matters.
 */
function isSameStagedSpot(a, b) {
  if (!a || !b) return false;
  const dLat = Math.abs(Number(a.lat) - Number(b.lat));
  const dLng = Math.abs(Number(a.lng) - Number(b.lng));
  return dLat < 0.00012 && dLng < 0.00012;
}

/**
 * Geocoder names are remote data; never inject them into a Leaflet popup raw.
 */
function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default function UserLocationModal() {
  const {
    userLocation,
    setUserLocation,
    clearUserLocation,
    detectCurrentLocation,
    isDetecting,
    detectError,
    setSortByDistance,
    maxDistanceKm,
    setMaxDistanceKm,
    liveGpsPosition,
    isLocationModalOpen,
    closeLocationModal
  } = useLocation();

  useModalScrollLock(isLocationModalOpen);

  // Close on Escape so the modal behaves like the rest of the app's dialogs.
  useEffect(() => {
    if (!isLocationModalOpen) return undefined;
    const handleKey = (event) => {
      if (event.key === 'Escape') closeLocationModal();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isLocationModalOpen, closeLocationModal]);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  // idle | loading | done | empty | error
  const [searchStatus, setSearchStatus] = useState('idle');
  const [searchNotice, setSearchNotice] = useState('');
  // The last suggestion the user picked from search; used by "reset" and by
  // the map so a map drag never silently replaces it with a coarse centroid.
  const [searchSelection, setSearchSelection] = useState(null);
  const [activeResultIndex, setActiveResultIndex] = useState(-1);
  const [draftLocation, setDraftLocation] = useState(userLocation);
  // Radius is part of the draft: changing it must not affect results until Apply.
  const [draftRadius, setDraftRadius] = useState(maxDistanceKm);
  // "Pin mode" makes the map-click affordance explicit instead of hidden.
  const [pinMode, setPinMode] = useState(false);
  const [permissionState, setPermissionState] = useState('unknown');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Surface the browser's actual geolocation permission state so a blocked or
  // not-yet-granted permission is visible instead of looking like a GPS failure.
  useEffect(() => {
    if (!isLocationModalOpen) return undefined;
    let cancelled = false;
    let status = null;

    const readPermission = async () => {
      if (!navigator.permissions?.query) {
        if (!cancelled) setPermissionState('unknown');
        return;
      }
      try {
        status = await navigator.permissions.query({ name: 'geolocation' });
        if (cancelled) return;
        setPermissionState(status.state);
        status.onchange = () => setPermissionState(status.state);
      } catch {
        if (!cancelled) setPermissionState('unknown');
      }
    };

    readPermission();
    return () => {
      cancelled = true;
      if (status) status.onchange = null;
    };
  }, [isLocationModalOpen]);

  const searchDebounceRef = useRef(null);
  const searchAbortRef = useRef(null);
  // Monotonic request id: only the newest search is allowed to write results.
  const searchSeqRef = useRef(0);
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const liveGpsMarkerRef = useRef(null);
  const searchInputRef = useRef(null);
  const searchWrapperRef = useRef(null);

  // Close suggestions dropdown when clicking outside the search wrapper
  useEffect(() => {
    if (!isLocationModalOpen) return undefined;
    const handlePointerDown = (e) => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isLocationModalOpen]);

  // Reset the whole draft each time the modal opens so Cancel never leaves a
  // half-applied location or radius behind.
  useEffect(() => {
    if (!isLocationModalOpen) return;
    setDraftLocation(userLocation);
    setDraftRadius(maxDistanceKm);
    setSearchQuery('');
    setSearchResults([]);
    setSearchStatus('idle');
    setSearchNotice('');
    setSearchSelection(null);
    setActiveResultIndex(-1);
    setPinMode(false);
    setIsSearchFocused(false);
  }, [isLocationModalOpen, userLocation, maxDistanceKm]);

  // Debounced, abortable, sequence-guarded place search.
  // Shows instant location-biased recommendations the moment the user focuses or
  // types even 1 character, and queries remote + DB providers for >= 2 characters.
  // A stale response can never overwrite a newer one: the sequence check runs
  // after every await, and each keystroke aborts the previous request.
  useEffect(() => {
    const trimmed = searchQuery.trim();

    // Bias the search to the committed / known position, never to the draft
    // pin, so dragging the marker does not restart the search.
    let anchorLat = userLocation?.lat ?? liveGpsPosition?.lat ?? draftLocation?.lat ?? null;
    let anchorLng = userLocation?.lng ?? liveGpsPosition?.lng ?? draftLocation?.lng ?? null;
    if (anchorLat == null && mapInstanceRef.current) {
      try {
        const center = mapInstanceRef.current.getCenter();
        anchorLat = center.lat;
        anchorLng = center.lng;
      } catch {}
    }
    // Last resort: bias to India instead of leaving the providers unbounded,
    // so a generic query cannot return a matching street in another country.
    if (anchorLat == null || anchorLng == null) {
      anchorLat = 20.5937;
      anchorLng = 78.9629;
    }

    // Instant 0ms local recommendations for 0 or 1 character while focused or typing
    const instantMatches = searchCuratedPlaces(trimmed, anchorLat, anchorLng);

    if (trimmed.length < 2) {
      searchSeqRef.current += 1;
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      if (searchAbortRef.current) searchAbortRef.current.abort();
      searchAbortRef.current = null;
      setSearchResults(instantMatches);
      setSearchStatus(trimmed.length === 1 ? 'done' : 'idle');
      setSearchNotice('');
      setActiveResultIndex(-1);
      return undefined;
    }

    const seq = searchSeqRef.current + 1;
    searchSeqRef.current = seq;

    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (searchAbortRef.current) searchAbortRef.current.abort();

    const controller = new AbortController();
    searchAbortRef.current = controller;
    // Show instant local recommendations immediately while live providers load
    if (instantMatches.length > 0) {
      setSearchResults(instantMatches);
    }
    setSearchStatus('loading');
    setSearchNotice('');
    setActiveResultIndex(-1);

    searchDebounceRef.current = setTimeout(async () => {
      try {
        const { results, degraded, failures } = await searchPlacesDetailed(
          trimmed,
          anchorLat,
          anchorLng,
          controller.signal
        );

        if (searchSeqRef.current !== seq || controller.signal.aborted) return;

        setSearchResults(results);
        setSearchStatus(results.length ? 'done' : 'empty');

        if (degraded && results.length) {
          const reasons = new Set(failures.map((f) => f.reason));
          const detail = reasons.has('rate_limited')
            ? 'one is rate-limiting us'
            : reasons.has('blocked')
              ? 'one refused the request'
              : 'one did not respond in time';
          setSearchNotice(
            `Showing results from the providers that answered — ${detail}. You can also fine-tune with the map pin.`
          );
        } else if (degraded && !results.length) {
          setSearchNotice('Search providers are unreachable right now. Drop the pin on the map or pick a tech hub below.');
        }
      } catch (err) {
        if (searchSeqRef.current !== seq) return;
        if (err?.name === 'AbortError') return;
        setSearchResults([]);
        setSearchStatus('error');
        setSearchNotice('Location search failed. Click your building on the map or pick a tech hub below.');
      }
    }, 180);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery, userLocation, liveGpsPosition]);

  // Abort in-flight search work when the modal unmounts.
  useEffect(() => () => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (searchAbortRef.current) searchAbortRef.current.abort();
  }, []);

  // Reverse geocode when user clicks on the map or drags pin
  const reverseGeocodeCoords = useCallback(async (lat, lng) => {
    let rawLabel = '';
    let rawCity = '';
    let reverseApproximate = false;

    // 1. Try backend high-precision reverse geocode
    try {
      const res = await fetch(`/api/directory/places/reverse?lat=${lat}&lng=${lng}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.label) {
          rawLabel = data.label;
          rawCity = data.city || '';
          if (data.approximate === true) reverseApproximate = true;
        }
      }
    } catch {}

    // 2. Client-side OSM fallback
    if (!rawCity) {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
          { headers: { 'Accept': 'application/json' } }
        );
        if (res.ok) {
          const data = await res.json();
          const addr = data.address || {};
          const poi = addr.amenity || addr.shop || addr.building || addr.office || addr.tourism || '';
          const road = addr.road || addr.suburb || addr.neighbourhood || '';
          const city = addr.city || addr.town || addr.municipality || addr.state || '';
          rawCity = city;

          if (poi && (road || city)) {
            rawLabel = `${poi}, ${road || city}`;
          } else if (road && city) {
            rawLabel = `${road}, ${city}`;
          } else if (data.display_name) {
            rawLabel = data.display_name.split(',').slice(0, 3).join(', ').trim();
          }
        }
      } catch {}
    }

    // 3. Guarantee human-readable Indian city & locality (NEVER raw coordinates)
    const resolved = resolveLocationName(lat, lng, rawLabel, rawCity);

    return {
      label: resolved.label,
      city: resolved.city,
      lat,
      lng,
      source: 'map_click',
      approximate: resolved.approximate === true || reverseApproximate
    };
  }, []);

  // Update target map pin position, optionally flying/zooming to it.
  const updateMapMarker = useCallback((loc, { fly = true, zoom } = {}) => {
    if (!mapInstanceRef.current || loc?.lat == null || loc?.lng == null) return;
    const map = mapInstanceRef.current;

    const displayLabel = loc.label || composePlaceLabel(loc) || 'Selected location';

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

      // Listen for marker drag: reverse geocode and relabel, never re-center.
      markerRef.current.on('dragend', async (e) => {
        const newPos = e.target.getLatLng();
        const res = await reverseGeocodeCoords(newPos.lat, newPos.lng);
        setDraftLocation(res);
        e.target.bindPopup(`<strong>${escapeHtml(res.label)}</strong>`).openPopup();
      });
    } else {
      markerRef.current.setLatLng([loc.lat, loc.lng]);
    }

    markerRef.current.bindPopup(`<strong>${escapeHtml(displayLabel)}</strong>`);
    if (fly) {
      const targetZoom = zoom != null ? zoom : Math.max(map.getZoom(), 15);
      map.flyTo([loc.lat, loc.lng], targetZoom, { duration: 0.8 });
    }
    markerRef.current.openPopup();
  }, [reverseGeocodeCoords]);

  // Render live GPS Beacon (blue pulsing dot)
  const renderLiveGpsBeacon = useCallback((gpsLoc) => {
    if (!mapInstanceRef.current || !gpsLoc?.lat || !gpsLoc?.lng) return;
    const map = mapInstanceRef.current;

    if (!liveGpsMarkerRef.current) {
      const beaconIcon = L.divIcon({
        className: 'modal-live-gps-beacon',
        html: `
          <div class="live-gps-beacon-wrapper" title="Your Live Device Location">
            <div class="live-gps-beacon-pulse"></div>
            <div class="live-gps-beacon-core"></div>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      liveGpsMarkerRef.current = L.marker([gpsLoc.lat, gpsLoc.lng], {
        icon: beaconIcon,
        interactive: true
      }).addTo(map);

      liveGpsMarkerRef.current.bindPopup(`<strong>Your Live Device Location</strong><br/><span style="font-size:11px;color:#64748b;">${gpsLoc.label || 'Detected via GPS'}</span>`);
    } else {
      liveGpsMarkerRef.current.setLatLng([gpsLoc.lat, gpsLoc.lng]);
    }
  }, []);

  // Initialize Leaflet Map inside Modal
  useEffect(() => {
    if (!isLocationModalOpen || !mapContainerRef.current) return;

    const timer = setTimeout(() => {
      if (!mapInstanceRef.current && mapContainerRef.current) {
        if (mapContainerRef.current._leaflet_id) {
          delete mapContainerRef.current._leaflet_id;
        }

        const hasAnchor = Boolean(draftLocation || userLocation || liveGpsPosition);
        // With no saved anchor, frame the whole country instead of implying an
        // arbitrary city is selected.
        const initialLat = draftLocation?.lat || userLocation?.lat || liveGpsPosition?.lat || 20.5937;
        const initialLng = draftLocation?.lng || userLocation?.lng || liveGpsPosition?.lng || 78.9629;
        const initialZoom = hasAnchor ? 14 : 4;

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

        // Click map to drop pin and reverse-geocode.
        // If the user is zoomed far out, zoom in so the pin can actually be
        // placed on a building instead of a whole district.
        map.on('click', async (e) => {
          const lat = e.latlng.lat;
          const lng = e.latlng.lng;
          const shouldZoomIn = map.getZoom() < 15;
          const resolved = await reverseGeocodeCoords(lat, lng);
          setDraftLocation(resolved);
          updateMapMarker(resolved, shouldZoomIn ? { fly: true, zoom: 16 } : { fly: false });
          setPinMode(false);
        });

        mapInstanceRef.current = map;

        // If a location already exists, show it immediately
        if (draftLocation || userLocation) {
          updateMapMarker(draftLocation || userLocation);
        }

        // If live GPS exists, render beacon
        if (liveGpsPosition) {
          renderLiveGpsBeacon(liveGpsPosition);
        }
      } else if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
        // Never re-center just because the draft changed; interactions and the
        // explicit "reset to search result" action own the viewport.
        if (draftLocation && !markerRef.current) {
          updateMapMarker(draftLocation);
        }
        if (liveGpsPosition) {
          renderLiveGpsBeacon(liveGpsPosition);
        }
      }
    }, 150);

    return () => {
      clearTimeout(timer);
    };
  }, [isLocationModalOpen, draftLocation, userLocation, liveGpsPosition, reverseGeocodeCoords, updateMapMarker, renderLiveGpsBeacon]);

  // Clean up map instance on modal close
  useEffect(() => {
    if (!isLocationModalOpen && mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
      liveGpsMarkerRef.current = null;
    }
  }, [isLocationModalOpen]);

  // Stage a searched or curated place in the draft. Never commits global state.
  const stagePlace = (place, source) => {
    const lat = Number(place.lat);
    const lng = Number(place.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const name = String(place.name || place.label || '').trim();
    // Preserve the provider's precise coordinates and structured fields; only
    // build a display label from them. No centroid substitution happens here.
    const label = composePlaceLabel(place) || name || 'Pinned location';
    const specificity = Number(place.specificity);

    const clean = {
      ...place,
      lat,
      lng,
      name: name || label,
      label,
      city: place.city || '',
      state: place.state || '',
      locality: place.locality || '',
      source,
      specificity: Number.isFinite(specificity) ? specificity : 55,
      approximate: place.approximate === true
    };

    setDraftLocation(clean);
    setPinMode(false);
    updateMapMarker(clean, { fly: true, zoom: zoomForPlace(clean) });
    return clean;
  };

  const clearSearchPanel = () => {
    setSearchQuery('');
    setSearchResults([]);
    setSearchStatus('idle');
    setSearchNotice('');
    setActiveResultIndex(-1);
  };

  // Selecting a suggestion only stages it; Apply is still required.
  const handleSelectSearchResult = (place) => {
    const clean = stagePlace(place, 'search');
    if (!clean) return;
    setSearchSelection(clean);
    clearSearchPanel();
    setIsSearchFocused(false);
  };

  // Curated tech-hub chips stage a city/hub centroid, so they are labelled as
  // such rather than masquerading as a searched building.
  const handleSelectHub = (hub) => {
    stagePlace(
      { ...hub, name: hub.label, source: 'curated', specificity: 45 },
      'curated'
    );
    clearSearchPanel();
    setIsSearchFocused(false);
  };

  // Put the pin back on the exact suggestion the user picked.
  const handleResetToSearchResult = () => {
    if (!searchSelection) return;
    const clean = { ...searchSelection, source: 'search' };
    setDraftLocation(clean);
    setPinMode(false);
    updateMapMarker(clean, { fly: true, zoom: zoomForPlace(clean) });
  };

  const focusSearchInput = () => {
    if (searchInputRef.current) {
      setIsSearchFocused(true);
      searchInputRef.current.focus();
      searchInputRef.current.select();
    }
  };

  // Keyboard combobox: arrows move, Enter selects, Escape only closes search.
  const handleSearchKeyDown = (event) => {
    if (event.key === 'Escape') {
      if (searchQuery || isSearchFocused) {
        event.stopPropagation();
        clearSearchPanel();
        setIsSearchFocused(false);
      }
      return;
    }
    if (!searchResults.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveResultIndex((idx) => (idx + 1) % searchResults.length);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveResultIndex((idx) => (idx <= 0 ? searchResults.length - 1 : idx - 1));
      return;
    }
    if (event.key === 'Enter') {
      const target = activeResultIndex >= 0 ? searchResults[activeResultIndex] : searchResults[0];
      if (target) {
        event.preventDefault();
        handleSelectSearchResult(target);
      }
    }
  };

  // 1-Click GPS button
  const handleGpsDetect = async () => {
    const loc = await detectCurrentLocation();
    if (loc) {
      const resolved = resolveLocationName(loc.lat, loc.lng, loc.label, loc.city);
      const clean = {
        ...loc,
        label: resolved.label,
        city: resolved.city,
        approximate: resolved.approximate === true || loc.approximate === true
      };
      setDraftLocation(clean);
      updateMapMarker(clean);
      renderLiveGpsBeacon(clean);
      setPinMode(false);
    }
  };

  // Recenter map back to user's live device location
  const handleRecenterToLiveLocation = async () => {
    if (liveGpsPosition?.lat != null && liveGpsPosition?.lng != null) {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.flyTo([liveGpsPosition.lat, liveGpsPosition.lng], 15, {
          animate: true,
          duration: 1.1
        });
      }
      setDraftLocation(liveGpsPosition);
      updateMapMarker(liveGpsPosition);
      renderLiveGpsBeacon(liveGpsPosition);
    } else {
      // Trigger live GPS detection and snap map back
      const loc = await detectCurrentLocation();
      if (loc) {
        const resolved = resolveLocationName(loc.lat, loc.lng, loc.label, loc.city);
        const clean = {
          ...loc,
          label: resolved.label,
          city: resolved.city,
          approximate: resolved.approximate === true || loc.approximate === true
        };
        setDraftLocation(clean);
        updateMapMarker(clean);
        renderLiveGpsBeacon(clean);
      }
    }
  };

  // Apply location + radius together and only when explicitly confirmed
  const handleApply = () => {
    if (draftLocation) {
      const resolved = resolveLocationName(draftLocation.lat, draftLocation.lng, draftLocation.label, draftLocation.city);
      const clean = {
        ...draftLocation,
        label: resolved.label,
        city: resolved.city,
        approximate: resolved.approximate === true || draftLocation.approximate === true
      };
      setUserLocation(clean);
      setSortByDistance(true);
    } else {
      clearUserLocation();
    }
    setMaxDistanceKm(draftRadius);
    closeLocationModal();
  };

  // Clear is a draft action; global state only changes on Apply
  const handleClear = () => {
    setDraftLocation(null);
    setDraftRadius(null);
    if (markerRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(markerRef.current);
      markerRef.current = null;
    }
  };

  if (!isLocationModalOpen) return null;

  const currentDisplayLabel = draftLocation
    ? resolveLocationName(draftLocation.lat, draftLocation.lng, draftLocation.label, draftLocation.city).label
    : '';

  const shortCityLabel = draftLocation
    ? (draftLocation.city || currentDisplayLabel.split(',')[0].trim())
    : 'Location';

  const fixAssessment = evaluateLocationFix(draftLocation);
  const permissionCopy = {
    granted: 'Browser location permission: allowed.',
    prompt: 'Browser location permission: not granted yet — you will be asked when you tap GPS.',
    denied: 'Browser location permission: blocked. Allow location for this site in your browser site settings (and enable "Precise location" on phones), then retry.'
  }[permissionState] || '';
  const permissionIsWarning = permissionState === 'denied';

  const distanceReferenceLabel = liveGpsPosition?.source === 'gps'
    ? 'your live GPS fix'
    : userLocation
      ? 'your saved location'
      : draftLocation
        ? 'your current pin'
        : 'the map centre';
  const hasTypedQuery = searchQuery.trim().length > 0;
  const searchDropdownOpen =
    (hasTypedQuery || isSearchFocused) &&
    (searchStatus === 'loading' || searchStatus === 'error' || searchResults.length > 0 || Boolean(searchNotice));

  // What the pin is currently based on, stated explicitly.
  const draftSource = draftLocation?.source || '';
  const sourceBadge = (() => {
    if (draftSource === 'gps') {
      return {
        className: 'is-gps',
        icon: <Navigation size={11} />,
        text: `Live GPS${draftLocation.accuracy ? ` · ${formatAccuracy(draftLocation.accuracy)}` : ''}`
      };
    }
    if (draftSource === 'search') {
      return { className: 'is-search', icon: <Search size={11} />, text: 'Searched location' };
    }
    if (draftSource === 'map_click') {
      return { className: 'is-adjusted', icon: <Crosshair size={11} />, text: 'Adjusted on map' };
    }
    if (draftSource === 'curated') {
      return { className: 'is-curated', icon: <Sparkles size={11} />, text: 'Curated tech hub' };
    }
    return { className: 'is-manual', icon: <MapPin size={11} />, text: 'Manually selected' };
  })();

  const draftSubtitle = draftLocation
    ? (formatPlaceSubtitle(draftLocation) ||
       (draftLocation.fullAddress && draftLocation.fullAddress !== draftLocation.label
         ? draftLocation.fullAddress
         : ''))
    : '';

  const canResetToSearch =
    Boolean(searchSelection) &&
    Boolean(draftLocation) &&
    !isSameStagedSpot(draftLocation, searchSelection);

  // A search hit that is only a locality/city centroid is still honest — the
  // coordinates match what the provider returned — but the user should know
  // they are not yet building-level.
  const coarseSearchHit =
    Boolean(draftLocation) &&
    draftSource !== 'gps' &&
    Number.isFinite(Number(draftLocation.specificity)) &&
    Number(draftLocation.specificity) < 45;

  // Old localStorage entries (and city-only GPS labels) have no source or
  // building detail. Tell the user instead of quietly showing a 7 km error.
  const legacyCoarseDraft = Boolean(draftLocation) && !draftSource && !draftLocation.accuracy;

  // The strongest available truth check: the user searched for a named building,
  // so a browser fix kilometres away is almost certainly a city/IP fallback.
  const gpsVsSearchKm = draftSource === 'gps' && searchSelection
    ? calculateDistanceKm(draftLocation.lat, draftLocation.lng, searchSelection.lat, searchSelection.lng)
    : null;
  const gpsDisagreesWithSearch = gpsVsSearchKm != null && gpsVsSearchKm >= 0.2;

  // Nearby hubs within 45 km of the current draft location (especially helpful when
  // desktop browser GPS drops the user in a coarse city center like Central Kolkata
  // while their actual office is in Salt Lake Sector V or New Town).
  const nearbyCityHubs = draftLocation
    ? POPULAR_TECH_HUBS.filter((hub) => {
        const d = calculateDistanceKm(draftLocation.lat, draftLocation.lng, hub.lat, hub.lng);
        return d != null && d > 0.25 && d <= 45;
      })
    : [];

  return (
    <div className="location-modal-overlay" onClick={closeLocationModal}>
      <div
        className="location-modal-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="location-modal-topbar">
          <div className="location-modal-title-wrap">
            <div className="location-icon-badge">
              <Globe size={20} />
            </div>
            <div>
              <h3 className="location-modal-heading" id="location-modal-title">Set Your Location</h3>
              <p className="location-modal-subheading">
                Find live jobs and offices nearest to where you work
              </p>
            </div>
          </div>
          <button
            type="button"
            className="location-modal-close"
            onClick={closeLocationModal}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </header>

        {/* Main Grid: Left Controls / Right Map */}
        <div className="location-modal-grid">
          {/* Left Panel: Search & Controls */}
          <div className="location-controls-pane">
            <div className="location-search-wrapper" ref={searchWrapperRef}>
              <div className="location-search-field">
                <Search className="location-search-field-icon" size={16} />
                <input
                  type="text"
                  ref={searchInputRef}
                  className="location-search-field-input"
                  placeholder="Search building, tech park, locality or city…"
                  value={searchQuery}
                  onFocus={() => setIsSearchFocused(true)}
                  onChange={(e) => {
                    setIsSearchFocused(true);
                    setSearchQuery(e.target.value);
                  }}
                  onKeyDown={handleSearchKeyDown}
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={searchDropdownOpen}
                  aria-controls="location-search-suggestions"
                  aria-autocomplete="list"
                  aria-activedescendant={
                    activeResultIndex >= 0 ? `location-search-option-${activeResultIndex}` : undefined
                  }
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="location-search-field-clear"
                    onClick={clearSearchPanel}
                    aria-label="Clear search query"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {searchDropdownOpen && (
                <div
                  className="location-dropdown-list"
                  id="location-search-suggestions"
                  role="listbox"
                  aria-label="Location suggestions"
                >
                  {!hasTypedQuery && searchResults.length > 0 && (
                    <div className="location-dropdown-section-header">
                      <Sparkles size={12} />
                      <span>Recommended near {distanceReferenceLabel}</span>
                    </div>
                  )}

                  {searchStatus === 'loading' && (
                    <div className="location-dropdown-loading">
                      <Search size={14} />
                      <span>Searching buildings, offices and localities…</span>
                    </div>
                  )}

                  {searchStatus !== 'loading' && searchResults.length === 0 && (
                    <div className="location-dropdown-empty">
                      {searchStatus === 'error'
                        ? (searchNotice || 'Location search failed.')
                        : `No matches for “${searchQuery.trim()}”. Try the tower name or select on the map.`}
                    </div>
                  )}

                  {searchResults.map((result, idx) => {
                    const subtitle = formatPlaceSubtitle(result) || result.fullAddress || '';
                    return (
                      <button
                        key={`${result.source || 'place'}-${Number(result.lat).toFixed(5)}-${Number(result.lng).toFixed(5)}`}
                        id={`location-search-option-${idx}`}
                        type="button"
                        role="option"
                        aria-selected={activeResultIndex === idx}
                        className={`location-dropdown-item ${activeResultIndex === idx ? 'is-active' : ''}`}
                        onMouseEnter={() => setActiveResultIndex(idx)}
                        onClick={() => handleSelectSearchResult(result)}
                      >
                        <span className="dropdown-item-icon">
                          {result.category === 'food' ? (
                            <Utensils size={14} />
                          ) : result.category === 'office' ? (
                            <Building2 size={14} />
                          ) : (
                            <MapPin size={14} />
                          )}
                        </span>
                        <div className="dropdown-item-content">
                          <div className="dropdown-item-header">
                            <span className="dropdown-item-title">{result.name || result.label}</span>
                            {result.distanceFormatted && (
                              <span
                                className={`dropdown-item-dist-pill ${result.distanceKm != null && result.distanceKm < 30 ? 'is-nearby' : ''}`}
                                title={`${result.distanceFormatted} from ${distanceReferenceLabel}`}
                              >
                                {result.distanceFormatted}
                              </span>
                            )}
                          </div>
                          {subtitle && <span className="dropdown-item-sub">{subtitle}</span>}
                        </div>
                      </button>
                    );
                  })}

                  {searchNotice && searchResults.length > 0 && (
                    <div className="location-dropdown-notice">{searchNotice}</div>
                  )}
                </div>
              )}
            </div>

            {/* 1-Click GPS Button */}
            <button
              type="button"
              className="gps-hero-btn is-secondary"
              onClick={handleGpsDetect}
              disabled={isDetecting}
              title="Automatically detect your location via browser GPS"
            >
              <div className="gps-hero-left">
                <div className="gps-hero-icon">
                  <Navigation size={18} />
                </div>
                <div className="gps-hero-text">
                  <span className="gps-hero-title">
                    {isDetecting ? 'Detecting Location...' : 'Use My Current Location'}
                  </span>
                  <span className="gps-hero-desc">
                    {isDetecting ? 'Sampling accurate fix...' : 'Auto-detect via GPS'}
                  </span>
                </div>
              </div>
              <span className="gps-hero-badge">1-Click GPS</span>
            </button>

            {detectError && (
              <div className="location-error-alert" role="alert">
                <AlertCircle size={14} />
                <span>{detectError}</span>
              </div>
            )}

            {/* Staged selection card */}
            {draftLocation ? (
              <div className="active-pinpoint-card">
                <div className="active-pinpoint-header">
                  <span className="active-pinpoint-tag">
                    <span className="active-pulse-dot" />
                    Selected Location
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
                <h4 className="active-pinpoint-name">
                  {draftLocation.name || currentDisplayLabel}
                </h4>
                {draftSubtitle && (
                  <p className="active-pinpoint-subtitle">{draftSubtitle}</p>
                )}
                <div className="location-source-row">
                  <span className={`location-source-badge ${sourceBadge.className}`}>
                    {sourceBadge.icon} {sourceBadge.text}
                  </span>
                  {canResetToSearch && (
                    <button
                      type="button"
                      className="location-reset-link"
                      onClick={handleResetToSearchResult}
                      title="Move the pin back to the location you searched for"
                    >
                      Reset to searched result
                    </button>
                  )}
                </div>
                <div className="active-pinpoint-coords">
                  <MapPin size={12} className="text-forest" />
                  <span>
                    {draftLocation.city || 'Pinned location'} •{' '}
                    {Number(draftLocation.lat).toFixed(5)}, {Number(draftLocation.lng).toFixed(5)}
                  </span>
                </div>
                {fixAssessment.isCoarse && (
                  <div className="location-fix-simple-hint" role="status">
                    <AlertTriangle size={13} />
                    <span>Approximate area. Drag the pin on the map to place on your exact building.</span>
                  </div>
                )}
                {gpsDisagreesWithSearch && (
                  <div className="location-mismatch-simple-hint" role="alert">
                    <AlertTriangle size={13} />
                    <span>GPS differs by {formatDistance(gpsVsSearchKm)} from searched spot.</span>
                    <button
                      type="button"
                      className="location-reset-link"
                      onClick={handleResetToSearchResult}
                    >
                      Keep searched pin
                    </button>
                  </div>
                )}
              </div>
            ) : null}

            <div className="location-pin-row">
              <button
                type="button"
                className={`location-pin-btn ${pinMode ? 'is-active' : ''}`}
                onClick={() => setPinMode((value) => !value)}
                aria-pressed={pinMode}
                title="Click the map to drop a pin on your exact building"
              >
                <Crosshair size={14} />
                <span>{pinMode ? 'Click your building on the map' : 'Pin my building on the map'}</span>
              </button>
            </div>

            {/* Curated Indian Tech Corridors */}
            <div className="corridors-section">
              <span className="corridors-heading">
                <Sparkles size={14} className="text-copper" />
                <span>Popular Tech Hubs</span>
              </span>
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
                      onClick={() => handleSelectHub(hub)}
                    >
                      <MapPin size={11} className="corridor-chip-icon" />
                      <span>{hub.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Proximity Radius Filter */}
            {draftLocation && (
              <div className="radius-section">
                <span className="corridors-heading">
                  <SlidersHorizontal size={14} />
                  <span>Maximum Distance Filter</span>
                </span>
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
                      className={`radius-pill-btn ${draftRadius === r.val ? 'is-active' : ''}`}
                      onClick={() => setDraftRadius(r.val)}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Panel: Interactive Leaflet Map */}
          <div className={`location-map-pane ${pinMode ? 'is-pin-mode' : ''}`}>
            <div className="map-floating-overlay-bar">
              <span className="map-overlay-title">
                <Compass size={14} />
                {pinMode ? 'Click your exact building' : 'Preview & fine-tune pin'}
              </span>
              <span className="map-overlay-hint">
                <Info size={12} />
                <span>
                  {draftSource === 'search'
                    ? 'Searched'
                    : draftSource === 'gps'
                      ? 'GPS fix'
                      : draftSource === 'map_click'
                        ? 'Map pin'
                        : draftSource === 'curated'
                          ? 'Tech hub'
                          : 'Drop a pin'}
                </span>
              </span>
            </div>

            {/* Map actions */}
            <div className="map-action-stack">
              {canResetToSearch && (
                <button
                  type="button"
                  className="map-recenter-floating-btn"
                  onClick={handleResetToSearchResult}
                  title="Move the pin back to the location you searched for"
                >
                  <Search size={13} className="recenter-nav-icon" />
                  <span>Reset to search</span>
                </button>
              )}
              <button
                type="button"
                className="map-recenter-floating-btn"
                onClick={handleRecenterToLiveLocation}
                title="Recenter map to your current live location"
              >
                <Navigation size={13} className="recenter-nav-icon" />
                <span>{isDetecting ? 'Locating…' : 'Recenter to GPS'}</span>
              </button>
            </div>

            <div ref={mapContainerRef} className="modal-map-viewport" />
          </div>
        </div>

        {/* Footer */}
        <footer className="location-modal-bottom-bar">
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
              title={draftLocation ? `Apply location: ${currentDisplayLabel}` : 'Done'}
            >
              <span className="btn-loc-apply-desktop">
                {draftLocation ? `Apply Location (${shortCityLabel})` : 'Done'}
              </span>
              <span className="btn-loc-apply-mobile">
                {draftLocation ? `Apply: ${shortCityLabel}` : 'Done'}
              </span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
