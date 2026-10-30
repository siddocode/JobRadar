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
  centerCoords = null
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const activeMarkerRef = useRef(null);

  // Initial Leaflet Map Setup
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
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

      // Free OpenStreetMap Tile Layer
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
      }).addTo(map);

      // Custom zoom control bottom right
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      const markersLayer = L.layerGroup().addTo(map);
      markersLayerRef.current = markersLayer;
      mapInstanceRef.current = map;

      // Ensure proper rendering of map tiles
      setTimeout(() => {
        if (mapInstanceRef.current) mapInstanceRef.current.invalidateSize();
      }, 150);
      setTimeout(() => {
        if (mapInstanceRef.current) mapInstanceRef.current.invalidateSize();
      }, 400);

      // Auto-invalidate size on container resize
      const resizeObserver = new ResizeObserver(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      });
      resizeObserver.observe(mapContainerRef.current);
      mapContainerRef.current._resizeObserver = resizeObserver;
    }

    return () => {
      if (mapContainerRef.current && mapContainerRef.current._resizeObserver) {
        mapContainerRef.current._resizeObserver.disconnect();
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Populate Markers for all discovered places
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    activeMarkerRef.current = null;

    const bounds = [];

    places.forEach((place) => {
      if (place.lat == null || place.lng == null) return;

      const isSelected = selectedPlace?.name === place.name;
      bounds.push([place.lat, place.lng]);

      const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${place.name}, ${place.address || ''}`)}`;

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

      const popupHtml = `
        <div class="discovered-popup">
          <div class="discovered-popup-header">
            <span class="discovered-popup-badge">${place.category || 'Tech Office'}</span>
            ${place.rating ? `<span class="discovered-popup-rating">★ ${place.rating}</span>` : ''}
          </div>
          <h4 class="discovered-popup-name">${place.name}</h4>
          <p class="discovered-popup-address">${place.address || 'Address registered'}</p>
          <div class="discovered-popup-actions">
            <a href="${directionsUrl}" target="_blank" rel="noopener noreferrer" class="discovered-popup-dir-btn">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="3 11 22 2 13 21 11 13 3 11" />
              </svg>
              Get Directions (Google Maps)
            </a>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml, {
        className: 'custom-leaflet-office-popup',
        offset: [0, -28],
        closeButton: true
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
  }, [places]);

  // Handle selected place changes (Fly to place on map & trigger popup)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !selectedPlace) return;

    if (selectedPlace.lat != null && selectedPlace.lng != null) {
      map.flyTo([selectedPlace.lat, selectedPlace.lng], 16, {
        duration: 1.1,
        easeLinearity: 0.25
      });

      // Find marker in layer and open popup
      const layer = markersLayerRef.current;
      if (layer) {
        layer.eachLayer((marker) => {
          const latLng = marker.getLatLng();
          if (
            Math.abs(latLng.lat - selectedPlace.lat) < 0.0001 &&
            Math.abs(latLng.lng - selectedPlace.lng) < 0.0001
          ) {
            marker.openPopup();
          }
        });
      }
    }
  }, [selectedPlace]);

  const handleResetCityView = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const cityKey = (citySlug || cityName || 'all').toLowerCase();
    const defaultCenter = centerCoords?.lat && centerCoords?.lng
      ? { lat: centerCoords.lat, lng: centerCoords.lng, zoom: 12 }
      : CITY_CENTERS[cityKey] || CITY_CENTERS.kolkata;

    map.flyTo([defaultCenter.lat, defaultCenter.lng], defaultCenter.zoom || 12, {
      duration: 0.9
    });
  };

  return (
    <div className="discovered-map-wrapper">
      <div ref={mapContainerRef} className="discovered-leaflet-canvas" />

      {/* Floating Header */}
      <div className="discovered-map-floating-header">
        <div className="discovered-map-header-content">
          <span className="live-pulse-dot" />
          <strong>{cityName || 'Discovered'} Tech Radar Map</strong>
          <span className="places-count-pill">{places.length} Places Pinpointed</span>
        </div>
        <button
          type="button"
          className="map-overview-reset-btn"
          onClick={handleResetCityView}
          title="Reset to City Overview"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
          City Overview
        </button>
      </div>
    </div>
  );
}
