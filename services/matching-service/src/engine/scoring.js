const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees) => (Number(degrees) * Math.PI) / 180;

// Great-circle distance between two {lat, lng} points.
function haversineKm(a, b) {
  const dLat = toRadians(b.lat) - toRadians(a.lat);
  const dLng = toRadians(b.lng) - toRadians(a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

// Exact-group units first (keeps universal O- for those who need it), then nearest,
// then soonest expiry. Returns new objects with distanceKm; input is never mutated.
function scoreCandidates(candidates, hospital, recipientGroup) {
  return candidates
    .map((unit) => ({
      ...unit,
      exactMatch: unit.blood_group === recipientGroup,
      distanceKm: Math.round(haversineKm(hospital, unit) * 100) / 100,
    }))
    .sort(
      (a, b) =>
        Number(b.exactMatch) - Number(a.exactMatch) ||
        a.distanceKm - b.distanceKm ||
        new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime()
    );
}

module.exports = { haversineKm, scoreCandidates };
