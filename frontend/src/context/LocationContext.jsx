import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

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

  const R = 6371; // km
  const dLat = (numLat2 - numLat1) * (Math.PI / 180);
  const dLon = (numLon2 - numLon1) * (Math.PI / 180);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(numLat1 * (Math.PI / 180)) * Math.cos(numLat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const dist = R * c;
  return Math.round(dist * 10) / 10;
}

export function formatDistance(km) {
  if (km == null || isNaN(km)) return null;
  if (km < 1) {
    return `${Math.round(km * 1000)} m away`;
  }
  return `${km.toFixed(1)} km away`;
}

export function LocationProvider({ children }) {
  const [userLocation, setUserLocationState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch (_) {
      return null;
    }
  });

  const [sortByDistance, setSortByDistanceState] = useState(() => {
    try {
      const saved = localStorage.getItem(SORT_KEY);
      return saved === 'true';
    } catch (_) {
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
    setUserLocationState(loc);
    try {
      if (loc) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
        // Automatically turn on nearest-first sorting when user sets location
        setSortByDistanceState(true);
        localStorage.setItem(SORT_KEY, 'true');
      } else {
        localStorage.removeItem(STORAGE_KEY);
        setSortByDistanceState(false);
        localStorage.setItem(SORT_KEY, 'false');
      }
    } catch (_) {}
  }, []);

  const setSortByDistance = useCallback((val) => {
    setSortByDistanceState(val);
    try {
      localStorage.setItem(SORT_KEY, String(val));
    } catch (_) {}
  }, []);

  const clearUserLocation = useCallback(() => {
    setUserLocation(null);
  }, [setUserLocation]);

  // GPS Browser Geolocation detection
  const detectCurrentLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setDetectError('Geolocation is not supported by your browser.');
      return null;
    }

    setIsDetecting(true);
    setDetectError(null);

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const accuracy = Math.round(position.coords.accuracy || 0);

          let label = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          let city = '';

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
              }
            }
          } catch (_) {}

          // 2. Client-side OSM Nominatim fallback if backend was unavailable
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
                const neighborhood = addr.neighbourhood || addr.suburb || addr.quarter || addr.residential || addr.road || '';
                const c = addr.city || addr.town || addr.municipality || addr.state_district || addr.state || '';
                city = c;
                if (neighborhood && c) {
                  label = `${neighborhood}, ${c}`;
                } else if (c) {
                  label = c;
                } else if (data.display_name) {
                  label = data.display_name.split(',').slice(0, 2).join(',').trim();
                }
              }
            } catch (_) {
              label = `Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
            }
          }

          const locObj = { lat, lng, label, city, accuracy, source: 'gps' };
          setUserLocation(locObj);
          setIsDetecting(false);
          resolve(locObj);
        },
        (err) => {
          setIsDetecting(false);
          let msg = 'Could not retrieve your location.';
          if (err.code === 1) msg = 'Location access was denied. Please allow location permissions in your browser or select your tech hub.';
          else if (err.code === 2) msg = 'GPS location is currently unavailable.';
          else if (err.code === 3) msg = 'Location request timed out. Please try again or search your area.';
          setDetectError(msg);
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }, [setUserLocation]);

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
