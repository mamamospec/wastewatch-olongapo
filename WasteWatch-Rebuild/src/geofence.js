import { BARANGAY_ORDER, slugify, toDisplayName } from "./data.js";

const boundaryOrder = new Map(BARANGAY_ORDER.map((id, index) => [id, index]));

export async function loadBoundaryData(url = "./data/olongapo-barangays.geojson") {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to load barangay boundaries: ${response.status}`);
  }

  const collection = await response.json();
  return normalizeFeatureCollection(collection);
}

export function normalizeFeatureCollection(collection) {
  const features = collection.features.map((feature) => {
    const rawName = feature.properties.brgy_name || feature.properties.name;
    const name = toDisplayName(rawName);
    const id = slugify(name);

    return {
      ...feature,
      properties: {
        ...feature.properties,
        id,
        name,
        rawName
      }
    };
  });

  features.sort((a, b) => {
    const aOrder = boundaryOrder.get(a.properties.id) ?? 999;
    const bOrder = boundaryOrder.get(b.properties.id) ?? 999;
    return aOrder - bOrder || a.properties.name.localeCompare(b.properties.name);
  });

  return {
    type: "FeatureCollection",
    features
  };
}

export function getFeatureBounds(feature) {
  const bounds = {
    minLat: Number.POSITIVE_INFINITY,
    minLng: Number.POSITIVE_INFINITY,
    maxLat: Number.NEGATIVE_INFINITY,
    maxLng: Number.NEGATIVE_INFINITY
  };

  walkCoordinates(feature.geometry.coordinates, (lng, lat) => {
    bounds.minLat = Math.min(bounds.minLat, lat);
    bounds.minLng = Math.min(bounds.minLng, lng);
    bounds.maxLat = Math.max(bounds.maxLat, lat);
    bounds.maxLng = Math.max(bounds.maxLng, lng);
  });

  return bounds;
}

export function getFeatureCenter(feature) {
  const bounds = getFeatureBounds(feature);
  const midLat = (bounds.minLat + bounds.maxLat) / 2;
  const midLng = (bounds.minLng + bounds.maxLng) / 2;

  if (pointInGeometry([midLng, midLat], feature.geometry)) {
    return { lat: midLat, lng: midLng };
  }

  const candidate = findInternalPoint(feature, bounds, midLat, midLng);
  if (candidate) return candidate;

  return {
    lat: midLat,
    lng: midLng
  };
}

export function findBarangayAt(lat, lng, features) {
  const point = [lng, lat];
  const matches = features.filter((feature) => pointInGeometry(point, feature.geometry));

  if (matches.length <= 1) {
    return matches[0] || null;
  }

  return matches
    .map((feature) => ({ feature, area: bboxArea(getFeatureBounds(feature)) }))
    .sort((a, b) => a.area - b.area)[0].feature;
}

function bboxArea(bounds) {
  return Math.abs(bounds.maxLat - bounds.minLat) * Math.abs(bounds.maxLng - bounds.minLng);
}

function findInternalPoint(feature, bounds, midLat, midLng) {
  let best = null;
  const steps = 28;

  for (let y = 1; y < steps; y += 1) {
    for (let x = 1; x < steps; x += 1) {
      const lat = bounds.minLat + ((bounds.maxLat - bounds.minLat) * y) / steps;
      const lng = bounds.minLng + ((bounds.maxLng - bounds.minLng) * x) / steps;
      if (!pointInGeometry([lng, lat], feature.geometry)) continue;

      const distance = (lat - midLat) ** 2 + (lng - midLng) ** 2;
      if (!best || distance < best.distance) {
        best = { lat, lng, distance };
      }
    }
  }

  return best ? { lat: best.lat, lng: best.lng } : null;
}

function pointInGeometry(point, geometry) {
  if (!geometry) return false;

  if (geometry.type === "Polygon") {
    return pointInPolygon(point, geometry.coordinates);
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => pointInPolygon(point, polygon));
  }

  return false;
}

function pointInPolygon(point, polygon) {
  const [outerRing, ...holes] = polygon;
  if (!pointInRing(point, outerRing)) return false;
  return !holes.some((hole) => pointInRing(point, hole));
}

function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }

  return inside;
}

function walkCoordinates(coordinates, visitor) {
  if (typeof coordinates[0] === "number") {
    visitor(coordinates[0], coordinates[1]);
    return;
  }

  coordinates.forEach((child) => walkCoordinates(child, visitor));
}
