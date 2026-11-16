// ============================================================================
// JOBRADAR — LOCATION FIX QUALITY ASSESSOR
// The browser Geolocation API happily reports a city-level network fix with a
// tiny accuracy radius. This helper decides when we should tell the user that
// the position is approximate instead of silently implying building-level
// precision. It never changes coordinates; it only produces UI copy.
// ============================================================================

import { findNearestMetro, metroDisplayLabel } from './resolveLocationName';

const CITY_LEVEL_ACCURACY_M = 1000;
const NEIGHBOURHOOD_ACCURACY_M = 150;
const IMPLAUSIBLE_PRECISION_M = 5;

/**
 * Human readable accuracy radius, e.g. "±12 m", "±2.4 km", "under 1 m".
 */
export function formatAccuracy(accuracy) {
  const value = Number(accuracy);
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value < 1) return 'under 1 m';
  if (value < 1000) return `±${Math.round(value)} m`;
  return `±${(value / 1000).toFixed(1)} km`;
}

/**
 * Evaluate how trustworthy a staged location is.
 *
 * @param {{lat:number,lng:number,label?:string,city?:string,accuracy?:number,source?:string,approximate?:boolean}} loc
 * @returns {{isCoarse:boolean, reason:string, message:string}}
 */
export function evaluateLocationFix(loc) {
  const neutral = { isCoarse: false, reason: '', message: '' };
  if (!loc || loc.lat == null || loc.lng == null) return neutral;
  // Manual picks and curated hub chips are explicit user choices, not browser fixes.
  if (loc.source !== 'gps') return neutral;

  const accuracy = Number(loc.accuracy);
  const hasAccuracy = Number.isFinite(accuracy) && accuracy > 0;

  const nearest = findNearestMetro(loc.lat, loc.lng);
  const metroLabel = nearest ? metroDisplayLabel(nearest.metro) : '';
  const labelText = String(loc.label || '').trim().toLowerCase();
  // A GPS label that is identical to a curated centroid label means no real
  // reverse-geocoder detail was available — the name is table-derived.
  const labelIsHub = Boolean(metroLabel) && labelText === metroLabel.toLowerCase();
  const tableDerived = loc.approximate === true || labelIsHub;

  if (hasAccuracy && accuracy >= CITY_LEVEL_ACCURACY_M) {
    return {
      isCoarse: true,
      reason: 'city',
      message:
        `Approximate fix: the browser reported accuracy of ${formatAccuracy(accuracy)}, which is city-level. ` +
        'Drag the pin, click the map on your building, or search your tower for exact distances.'
    };
  }

  if (hasAccuracy && accuracy >= NEIGHBOURHOOD_ACCURACY_M) {
    return {
      isCoarse: true,
      reason: 'neighbourhood',
      message:
        `Approximate fix: the browser reported accuracy of ${formatAccuracy(accuracy)}, roughly neighbourhood-level. ` +
        'Fine-tune with the map pin if you need building-level distances.'
    };
  }

  if (tableDerived && (!hasAccuracy || accuracy < IMPLAUSIBLE_PRECISION_M)) {
    return {
      isCoarse: true,
      reason: 'implausible',
      message:
        `Approximate fix: the browser reported ${hasAccuracy ? formatAccuracy(accuracy) : 'no accuracy radius'}, ` +
        'yet the position only resolves to a hub name. That usually means a cached, VPN-routed, or simulated ' +
        'location. Drag the pin to your building for exact distances.'
    };
  }

  // Consumer GNSS and network geolocation practically never deliver a true
  // sub-2 m radius. A value this small usually comes from a cached fix, a VPN,
  // or a simulated position (browser devtools / emulator).
  if (hasAccuracy && accuracy < 2) {
    return {
      isCoarse: true,
      reason: 'implausible-precision',
      message:
        `Approximate fix: the browser reports ${formatAccuracy(accuracy)}, which is unusually precise for web ` +
        'geolocation and often indicates a cached, VPN-routed, or simulated position. If the pin is not on your ' +
        'building, drag it or pick the exact spot on the map.'
    };
  }

  // A GPS fix that lands exactly on one of our curated hub centroids is the
  // classic signature of a city-level network fallback.
  if (nearest && nearest.distanceKm < 0.15 && (!hasAccuracy || accuracy < 10)) {
    return {
      isCoarse: true,
      reason: 'hub-centroid',
      message:
        'Approximate fix: this position sits exactly on a curated tech-hub centroid, which is usually a ' +
        'city-level network fallback rather than your building. Drag the pin or click your exact tower on the map.'
    };
  }

  return neutral;
}
