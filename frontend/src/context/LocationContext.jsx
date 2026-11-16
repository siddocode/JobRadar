import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { resolveLocationName } from '../utils/resolveLocationName';

const LocationContext = createContext(null);

const STORAGE_KEY = 'jobradar_user_location';
const SORT_KEY = 'jobradar_sort_by_distance';

// Curated popular Indian tech hubs with exact GPS coordinates for 1-click convenience
export const POPULAR_TECH_HUBS = [
  { label: 'Koramangala, Bengaluru', city: 'Bengaluru', lat: 12.9352, lng: 77.6245 },
  { label: 'HSR Layout, Bengaluru', city: 'Bengaluru', lat: 12.9121, lng: 77.6446 },
  { label: 'Whitefield / ITPL, Bengaluru', city: 'Bengaluru', lat: 12.9856, lng: 77.7489 },
  { label: 'Outer Ring Road, Bengaluru', city: 'Bengaluru', lat: 12.9304, lng: 77.6850 },
  { label: 'Electronic City, Bengaluru', city: 'Bengaluru', lat: 12.8457, lng: 77.6679 },
  { label: 'HITEC City, Hyderabad', city: 'Hyderabad', lat: 17.4483, lng: 78.3915 },
  { label: 'Gachibowli, Hyderabad', city: 'Hyderabad', lat: 17.4401, lng: 78.3489 },
  { label: 'Cyber City, Gurugram', city: 'Gurugram', lat: 28.4950, lng: 77.0890 },
  { label: 'Golf Course Road, Gurugram', city: 'Gurugram', lat: 28.4595, lng: 77.0988 },
  { label: 'Sector 62, Noida', city: 'Noida', lat: 28.6279, lng: 77.3649 },
  { label: 'BKC, Mumbai', city: 'Mumbai', lat: 19.0660, lng: 72.8680 },
  { label: 'Powai / Hiranandani, Mumbai', city: 'Mumbai', lat: 19.1197, lng: 72.9051 },
  { label: 'Hinjawadi IT Park, Pune', city: 'Pune', lat: 18.5913, lng: 73.7389 },
  { label: 'Viman Nagar / Magarpatta, Pune', city: 'Pune', lat: 18.5204, lng: 73.9288 },
  { label: 'OMR Tech Corridor, Chennai', city: 'Chennai', lat: 12.9150, lng: 80.2280 },
  { label: 'Guindy / Ekkattuthangal, Chennai', city: 'Chennai', lat: 13.0067, lng: 80.2025 },
  { label: 'Salt Lake Sector V, Kolkata', city: 'Kolkata', lat: 22.5804, lng: 88.4378 },
  { label: 'New Town Action Area, Kolkata', city: 'Kolkata', lat: 22.5867, lng: 88.4734 }
];

export function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const numLat1 = parseFloat(lat1);
  const numLon1 = parseFloat(lon1);
  const numLat2 = parseFloat(lat2);
  const numLon2 = parseFloat(lon2);
  if (isNaN(numLat1) || isNaN(numLon1) || isNaN(numLat2) || isNaN(numLon2)) return null;
  if (Math.abs(numLat1) > 90 || Math.abs(numLat2) > 90 || Math.abs(numLon1) > 180 || Math.abs(numLon2) > 180) return null;

  const R = 6371; // km
  const dLat = (numLat2 - numLat1) * (Math.PI / 180);
  const dLon = (numLon2 - numLon1) * (Math.PI / 180);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(numLat1 * (Math.PI / 180)) * Math.cos(numLat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const dist = R * c;
  // Keep sub-100m precision instead of collapsing everything below 50 m to 0.
  return dist < 1 ? Math.round(dist * 1000) / 1000 : Math.round(dist * 10) / 10;
}

export function formatDistance(km) {
  if (km == null || isNaN(km)) return null;
  if (km < 1) {
    return `${Math.round(km * 1000)} m away`;
  }
  return `${km.toFixed(1)} km away`;
}

// --- GPS sampling strategy -------------------------------------------------
// Browsers emit several fixes with very different quality: a coarse IP/Wi-Fi
// fix first, sometimes a cached fix with a suspiciously tiny radius, then a
// real GNSS fix. Taking the single smallest "accuracy" value is not enough —
// a cached fix can be 7 km away while claiming ±3 m. We collect samples,
// discard outliers that disagree with the consensus, and then use the tightest
// *observed* sample. Coordinates are never averaged or invented.
const GPS_COLLECT_MS = 8000;
const GPS_GOOD_ENOUGH_M = 15;
const GPS_ACCEPTABLE_M = 60;
const GPS_ACCEPTABLE_AFTER_MS = 3000;
const GPS_OUTLIER_KM = 1.5;
const GPS_MIN_CONSISTENT_SAMPLES = 2;

/**
 * Choose the best observed sample: first filter out fixes far from the median
 * position, then prefer the smallest finite accuracy radius. A sample with a
 * missing/invalid accuracy can never displace a measured one.
 */
function selectBestGpsSample(samples) {
  if (!samples.length) return null;

  // Find the largest group of mutually consistent fixes. A single cached fix
  // with a tiny accuracy radius must not outvote several real GNSS samples.
  let bestCluster = [];
  for (const anchor of samples) {
    const cluster = samples.filter((s) => {
      const d = calculateDistanceKm(anchor.lat, anchor.lng, s.lat, s.lng);
      return d == null || d <= GPS_OUTLIER_KM;
    });
    if (cluster.length > bestCluster.length) bestCluster = cluster;
  }
  const pool = bestCluster.length ? bestCluster : samples;
  const withAccuracy = pool.filter((s) => s.accuracy != null && s.accuracy > 0);
  const chosen = withAccuracy.length
    ? [...withAccuracy].sort((a, b) =>
        a.accuracy - b.accuracy || b.position.timestamp - a.position.timestamp
      )[0]
    : pool[pool.length - 1];

  return { ...chosen, sampleCount: samples.length, clusterCount: pool.length };
}

/**
 * Collect GPS samples for a short window and resolve with the most accurate
 * consistent one. Resolves { position, error, aborted }. Never rejects.
 */
function sampleBestPosition({ signal } = {}) {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ position: null, error: { code: -1 } });
      return;
    }

    const samples = [];
    let chosen = null;
    let lastError = null;
    let done = false;
    let watchId = null;
    let collectTimer = null;
    let earlyTimer = null;

    const cleanup = () => {
      if (collectTimer) clearTimeout(collectTimer);
      if (earlyTimer) clearTimeout(earlyTimer);
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      if (signal) signal.removeEventListener('abort', onAbort);
    };

    const finish = (error = null) => {
      if (done) return;
      done = true;
      cleanup();
      resolve({ position: chosen?.position || null, error: chosen ? null : (error || lastError) });
    };

    const onAbort = () => {
      if (done) return;
      done = true;
      cleanup();
      resolve({ position: null, error: null, aborted: true });
    };

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort);
    }

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (done) return;
        const lat = Number(position?.coords?.latitude);
        const lng = Number(position?.coords?.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return;

        const rawAccuracy = Number(position.coords?.accuracy);
        samples.push({
          position,
          lat,
          lng,
          accuracy: Number.isFinite(rawAccuracy) && rawAccuracy > 0 ? rawAccuracy : null
        });
        chosen = selectBestGpsSample(samples);

        // Only end early when several independent samples agree, so a single
        // cached fix cannot win the race.
        const consistent = chosen.clusterCount >= GPS_MIN_CONSISTENT_SAMPLES;
        if (consistent && chosen.accuracy != null && chosen.accuracy <= GPS_GOOD_ENOUGH_M) finish();
      },
      (error) => {
        lastError = error;
        // Permission denial will never be followed by a fix; fail fast.
        if (error?.code === 1 || chosen) finish(error);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );

    collectTimer = setTimeout(() => finish(), GPS_COLLECT_MS);
    earlyTimer = setTimeout(() => {
      if (!chosen) return;
      if (chosen.clusterCount >= GPS_MIN_CONSISTENT_SAMPLES &&
          chosen.accuracy != null && chosen.accuracy <= GPS_ACCEPTABLE_M) finish();
    }, GPS_ACCEPTABLE_AFTER_MS);
  });
}

export function LocationProvider({ children }) {
  const [userLocation, setUserLocationState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      if (parsed?.lat != null && parsed?.lng != null) {
        const resolved = resolveLocationName(parsed.lat, parsed.lng, parsed.label, parsed.city);
        return {
          ...parsed,
          label: resolved.label,
          city: resolved.city,
          approximate: resolved.approximate === true || parsed.approximate === true
        };
      }
      return parsed;
    } catch {
      return null;
    }
  });

  const [liveGpsPosition, setLiveGpsPosition] = useState(null);

  const [sortByDistance, setSortByDistanceState] = useState(() => {
    try {
      const saved = localStorage.getItem(SORT_KEY);
      return saved === 'true';
    } catch {
      return false;
    }
  });

  const [maxDistanceKm, setMaxDistanceKm] = useState(null); // null = any distance
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectError, setDetectError] = useState(null);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);

  const openLocationModal = useCallback(() => setIsLocationModalOpen(true), []);
  const closeLocationModal = useCallback(() => {
    setIsLocationModalOpen(false);
    setDetectError(null);
  }, []);

  const setUserLocation = useCallback((loc) => {
    if (loc && loc.lat != null && loc.lng != null) {
      const resolved = resolveLocationName(loc.lat, loc.lng, loc.label, loc.city);
      const cleanLoc = {
        ...loc,
        label: resolved.label,
        city: resolved.city,
        approximate: resolved.approximate === true || loc.approximate === true
      };
      setUserLocationState(cleanLoc);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanLoc));
        setSortByDistanceState(true);
        localStorage.setItem(SORT_KEY, 'true');
      } catch {}
    } else {
      setUserLocationState(null);
      try {
        localStorage.removeItem(STORAGE_KEY);
        setSortByDistanceState(false);
        localStorage.setItem(SORT_KEY, 'false');
      } catch {}
    }
  }, []);

  const setSortByDistance = useCallback((val) => {
    setSortByDistanceState(val);
    try {
      localStorage.setItem(SORT_KEY, String(val));
    } catch {}
  }, []);

  const clearUserLocation = useCallback(() => {
    setUserLocation(null);
  }, [setUserLocation]);

  // Tracks the in-flight GPS sampling window so a newer press can cancel it.
  const gpsScopeRef = useRef(null);
  useEffect(() => () => {
    if (gpsScopeRef.current) gpsScopeRef.current.abort();
  }, []);

  // GPS Browser Geolocation detection.
  // IMPORTANT: this only *detects* and stages a GPS position. It never changes
  // the active userLocation: the user must confirm with "Apply" in the modal.
  const detectCurrentLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setDetectError(
        typeof window !== 'undefined' && !window.isSecureContext
          ? 'Live location requires a secure (HTTPS) connection. Search or pick a tech hub instead.'
          : 'Geolocation is not supported by your browser. Search or pick a tech hub instead.'
      );
      return null;
    }

    if (gpsScopeRef.current) gpsScopeRef.current.abort();
    const scope = new AbortController();
    gpsScopeRef.current = scope;

    setIsDetecting(true);
    setDetectError(null);

    const outcome = await sampleBestPosition({ signal: scope.signal });
    if (gpsScopeRef.current === scope) gpsScopeRef.current = null;
    // A newer detection (or unmount) superseded this one — leave its state alone.
    if (outcome.aborted || scope.signal.aborted) return null;

    const position = outcome.position;
    if (!position) {
      setIsDetecting(false);
      const code = outcome.error?.code;
      let msg = 'Could not retrieve your location.';
      if (code === 1) msg = 'Location access was denied. Please allow location permissions in your browser or select your tech hub.';
      else if (code === 2) msg = 'GPS location is currently unavailable.';
      else if (code === 3) msg = 'Location request timed out. Please try again or search your area.';
      setDetectError(msg);
      return null;
    }

    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    // Reject malformed/out-of-range coordinates before they can pollute
    // any distance calculation.
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setIsDetecting(false);
      setDetectError('Your device returned invalid coordinates. Please pick a location manually.');
      return null;
    }
    const accuracy = Math.round(position.coords.accuracy || 0);

    let label = '';
    let city = '';
    let reverseApproximate = false;

    // 1. Try our high-precision backend reverse geocode
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`/api/directory/places/reverse?lat=${lat}&lng=${lng}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.label) {
          label = data.label;
          city = data.city || '';
          if (data.approximate === true) reverseApproximate = true;
        }
      }
    } catch {}

    // 2. Client-side OSM Nominatim fallback if backend was unavailable.
    // Keep building/POI level detail instead of collapsing to a city name.
    if (!city) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
          {
            headers: { 'Accept': 'application/json' },
            signal: controller.signal
          }
        );
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          const addr = data.address || {};
          const poi = addr.building || addr.amenity || addr.office || addr.shop || addr.tourism || '';
          const neighborhood = addr.neighbourhood || addr.suburb || addr.quarter || addr.residential || '';
          const road = addr.road || '';
          const c = addr.city || addr.town || addr.municipality || addr.state_district || addr.state || '';
          city = c;

          const parts = [];
          if (poi) parts.push(poi);
          if (neighborhood) parts.push(neighborhood);
          else if (road) parts.push(road);
          if (c) parts.push(c);
          label = parts.join(', ');

          if (!label && data.display_name) {
            label = data.display_name.split(',').slice(0, 3).join(',').trim();
          }
        }
      } catch {}
    }

    // 3. Guarantee human-readable Indian city/neighborhood name (NEVER raw coordinates)
    const finalResolved = resolveLocationName(lat, lng, label, city);

    const locObj = {
      lat,
      lng,
      label: finalResolved.label,
      city: finalResolved.city,
      accuracy,
      source: 'gps',
      approximate: finalResolved.approximate === true || reverseApproximate
    };

    // Stage only. Do NOT call setUserLocation here: GPS detection must
    // remain a draft until the user explicitly applies it.
    setLiveGpsPosition(locObj);
    setIsDetecting(false);
    return locObj;
  }, []);

  // Compute distance from user location to a target coordinate
  const getDistanceTo = useCallback(
    (targetLat, targetLng) => {
      if (!userLocation || targetLat == null || targetLng == null) return null;
      return calculateDistanceKm(userLocation.lat, userLocation.lng, targetLat, targetLng);
    },
    [userLocation]
  );

  return (
    <LocationContext.Provider
      value={{
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
        getDistanceTo,
        liveGpsPosition,
        setLiveGpsPosition,
        isLocationModalOpen,
        openLocationModal,
        closeLocationModal
      }}
    >
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return ctx;
}
