import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet's default icon path issues in bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

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
  kolkata: { lat: 22.5726, lng: 88.3639, zoom: 12 },
  ahmedabad: { lat: 23.0225, lng: 72.5714, zoom: 12 },
  kochi: { lat: 9.9312, lng: 76.2673, zoom: 12 },
  jaipur: { lat: 26.9124, lng: 75.7873, zoom: 12 },
  indore: { lat: 22.7196, lng: 75.8577, zoom: 12 },
  chandigarh: { lat: 30.7333, lng: 76.7794, zoom: 12 }
};

export default function DiscoveredPlacesMap({
  places = [],
  selectedPlace = null,
  onSelectPlace,
  cityName = '',
  citySlug = '',
  centerCoords = null,
  userLocation = null,
  onBackToList = null,
  viewMode = 'split'
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const activeMarkerRef = useRef(null);

  // Auto-invalidate map size when view mode changes (Split <-> Map <-> List)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.invalidateSize();
    const timers = [40, 120, 260, 480].map((delay) =>
      setTimeout(() => {
        if (mapInstanceRef.current) mapInstanceRef.current.invalidateSize();
      }, delay)
    );
    return () => timers.forEach(clearTimeout);
  }, [viewMode]);

  // Initial Leaflet Map Setup
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      if (mapContainerRef.current._leaflet_id) {
        delete mapContainerRef.current._leaflet_id;
      }

      const cityKey = (citySlug || cityName || 'all').toLowerCase();
      const defaultCenter = centerCoords?.lat && centerCoords?.lng
        ? { lat: centerCoords.lat, lng: centerCoords.lng, zoom: 12 }
        : CITY_CENTERS[cityKey] || CITY_CENTERS.kolkata;

      const map = L.map(mapContainerRef.current, {
        center: [defaultCenter.lat, defaultCenter.lng],
        zoom: defaultCenter.zoom || 12,
        zoomControl: false,
        attributionControl: false
      });

      // High performance tile layer
      const isDarkMode = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';
      const tileUrl = isDarkMode
        ? 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
        : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';

      L.tileLayer(tileUrl, {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.esri.com/">Esri</a>, OpenStreetMap contributors'
      }).addTo(map);

      // Custom zoom control bottom right
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      const markersLayer = L.layerGroup().addTo(map);
      markersLayerRef.current = markersLayer;
      mapInstanceRef.current = map;

      // Ensure proper rendering of map tiles across paint frames
      const invalidateTimers = [50, 150, 300, 600, 1000].map((delay) =>
        setTimeout(() => {
          if (mapInstanceRef.current) mapInstanceRef.current.invalidateSize();
        }, delay)
      );

      // Auto-invalidate size on container resize
      const resizeObserver = new ResizeObserver(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      });
      resizeObserver.observe(mapContainerRef.current);
      mapContainerRef.current._resizeObserver = resizeObserver;
      mapContainerRef.current._invalidateTimers = invalidateTimers;
    }

    return () => {
      if (mapContainerRef.current && mapContainerRef.current._invalidateTimers) {
        mapContainerRef.current._invalidateTimers.forEach(clearTimeout);
      }
      if (mapContainerRef.current && mapContainerRef.current._resizeObserver) {
        mapContainerRef.current._resizeObserver.disconnect();
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      if (mapContainerRef.current && mapContainerRef.current._leaflet_id) {
        delete mapContainerRef.current._leaflet_id;
      }
    };
  }, []);

  // Helper to calculate distance
  const calcDist = (lat1, lon1, lat2, lon2) => {
    if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
  };

  // Populate Markers for all discovered places
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    activeMarkerRef.current = null;

    const bounds = [];

    // Render User Location Pin if available
    if (userLocation && userLocation.lat != null && userLocation.lng != null) {
      const userMarkerHtml = `
        <div class="user-location-map-pin">
          <div class="user-pin-pulse"></div>
          <div class="user-pin-center"></div>
          <span class="user-pin-title">You Are Here</span>
        </div>
      `;
      const userIcon = L.divIcon({
        className: 'custom-user-marker',
        html: userMarkerHtml,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });
      L.marker([userLocation.lat, userLocation.lng], {
        icon: userIcon,
        zIndexOffset: 2000
      }).bindPopup(`
        <div class="user-loc-popup">
          <strong>📍 Your Location</strong>
          <span>${userLocation.label || 'Active reference point'}</span>
        </div>
      `).addTo(layer);
    }

    places.forEach((place) => {
      if (place.lat == null || place.lng == null) return;

      const isSelected = selectedPlace?.name === place.name;
      bounds.push([place.lat, place.lng]);

      const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${place.name}, ${place.address || ''}`)}`;

      const dist = userLocation?.lat != null && userLocation?.lng != null
        ? calcDist(userLocation.lat, userLocation.lng, place.lat, place.lng)
        : null;
      const distText = dist != null
        ? (dist < 1 ? `${Math.round(dist * 1000)} m away` : `${dist.toFixed(1)} km away`)
        : '';

      const markerHtml = `
        <div class="discovered-map-pin ${isSelected ? 'is-active' : ''}">
          <div class="pin-ring"></div>
          <div class="pin-core">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
          <span class="pin-title">${place.name.length > 20 ? place.name.slice(0, 18) + '...' : place.name}</span>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'custom-discovered-marker',
        html: markerHtml,
        iconSize: [36, 36],
        iconAnchor: [18, 32]
      });

      const marker = L.marker([place.lat, place.lng], {
        icon: customIcon,
        zIndexOffset: isSelected ? 1200 : 500
      }).addTo(layer);

      marker._placeData = place;

      const popupHtml = `
        <div class="discovered-popup">
          <div class="discovered-popup-header">
            <span class="discovered-popup-badge">${place.category || 'Tech Office'}</span>
            ${place.rating ? `<span class="discovered-popup-rating">★ ${place.rating}</span>` : ''}
            ${distText ? `<span class="discovered-popup-dist">📍 ${distText}</span>` : ''}
          </div>
          <h4 class="discovered-popup-name">${place.name}</h4>
          <p class="discovered-popup-address">
            <svg class="popup-addr-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span>${place.address || 'Address registered'}</span>
          </p>
          <div class="discovered-popup-actions">
            <a href="${directionsUrl}" target="_blank" rel="noopener noreferrer" class="discovered-popup-dir-btn">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="3 11 22 2 13 21 11 13 3 11" />
              </svg>
              <span>Get Directions (Google Maps)</span>
            </a>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml, {
        className: 'custom-leaflet-office-popup',
        offset: [0, -36],
        closeButton: true,
        autoPan: true,
        autoPanPaddingTopLeft: [20, 90],
        autoPanPaddingBottomRight: [20, 20]
      });

      marker.on('click', () => {
        if (onSelectPlace) onSelectPlace(place);
      });

      if (isSelected) {
        activeMarkerRef.current = marker;
      }
    });

    // If initial load and bounds exist, fit bounds gently
    if (bounds.length > 0 && !selectedPlace) {
      try {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      } catch (_) {}
    }
  }, [places, userLocation]);

  // Handle selected place changes (Fly to place on map & trigger popup)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Invalidate size immediately so tiles render without glitches
    map.invalidateSize();
    const timers = [40, 120, 250].map((delay) =>
      setTimeout(() => {
        if (mapInstanceRef.current) mapInstanceRef.current.invalidateSize();
      }, delay)
    );

    if (selectedPlace && selectedPlace.lat != null && selectedPlace.lng != null) {
      const lat = Number(selectedPlace.lat);
      const lng = Number(selectedPlace.lng);

      if (!isNaN(lat) && !isNaN(lng)) {
        map.flyTo([lat, lng], 16, {
          duration: 0.8,
          easeLinearity: 0.25
        });

        // Find marker in layer and open popup
        const layer = markersLayerRef.current;
        if (layer) {
          layer.eachLayer((marker) => {
            const mPlace = marker._placeData;
            const latLng = marker.getLatLng();
            const matchesId = mPlace && selectedPlace.place_id && mPlace.place_id === selectedPlace.place_id;
            const matchesName = mPlace && selectedPlace.name && mPlace.name.toLowerCase() === selectedPlace.name.toLowerCase();
            const matchesCoords = Math.abs(latLng.lat - lat) < 0.001 && Math.abs(latLng.lng - lng) < 0.001;

            if (matchesId || matchesName || matchesCoords) {
              setTimeout(() => {
                marker.openPopup();
              }, 300);
            }
          });
        }
      }
    }

    return () => timers.forEach(clearTimeout);
  }, [selectedPlace]);

  const handleResetCityView = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (onSelectPlace) onSelectPlace(null);
    const cityKey = (citySlug || cityName || 'all').toLowerCase();
    const defaultCenter = centerCoords?.lat && centerCoords?.lng
      ? { lat: centerCoords.lat, lng: centerCoords.lng, zoom: 12 }
      : CITY_CENTERS[cityKey] || CITY_CENTERS.kolkata;

    map.flyTo([defaultCenter.lat, defaultCenter.lng], defaultCenter.zoom || 12, {
      duration: 0.9
    });
  };

  const mapTitle = cityName ? `${cityName} Tech Map` : 'Tech Radar Map';

  return (
    <div className="discovered-map-wrapper">
      <div ref={mapContainerRef} className="discovered-leaflet-canvas" />

      {/* Floating Header */}
      <div className="discovered-map-floating-header">
        <div className="discovered-map-header-content">
          <span className="live-pulse-dot" />
          <span className="map-floating-title" title={mapTitle}>{mapTitle}</span>
          <span className="places-count-pill">{places.length}</span>
        </div>
        <div className="discovered-map-controls-group">
          {onBackToList && viewMode === 'map' && (
            <button
              type="button"
              className="map-back-list-btn"
              onClick={onBackToList}
              title="Return to place preview list"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              <span>List</span>
            </button>
          )}
          <button
            type="button"
            className="map-overview-reset-btn"
            onClick={handleResetCityView}
            title="Reset to City Overview"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            <span>Overview</span>
          </button>
        </div>
      </div>

      {/* Selected Place Floating Card */}
      {selectedPlace && (
        <div className="discovered-selected-place-card">
          <div className="selected-place-main">
            <div className="selected-place-title-row">
              <span className="selected-pin-dot">📍</span>
              <strong className="selected-place-name" title={selectedPlace.name}>
                {selectedPlace.name}
              </strong>
              {selectedPlace.rating && (
                <span className="selected-place-rating">★ {selectedPlace.rating}</span>
              )}
            </div>
            {selectedPlace.address && (
              <p className="selected-place-address" title={selectedPlace.address}>
                {selectedPlace.address}
              </p>
            )}
          </div>
          <div className="selected-place-actions">
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${selectedPlace.name}, ${selectedPlace.address || ''}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="selected-place-dir-btn"
              title="Navigate with Google Maps"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="3 11 22 2 13 21 11 13 3 11" />
              </svg>
              <span>Directions</span>
            </a>
            <button
              type="button"
              className="selected-place-dismiss-btn"
              onClick={() => onSelectPlace && onSelectPlace(null)}
              title="Dismiss place details"
              aria-label="Dismiss place details"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
