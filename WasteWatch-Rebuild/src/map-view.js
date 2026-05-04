import { STATUS, STATUS_META, TRUCKS } from "./data.js";
import { getFeatureCenter } from "./geofence.js";

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors';
const OLONGAPO_CENTER = [14.835, 120.283];

export function createMap(containerId, options = {}) {
  const map = L.map(containerId, {
    zoomControl: false,
    preferCanvas: true
  }).setView(options.center || OLONGAPO_CENTER, options.zoom || 13);

  L.tileLayer(TILE_URL, {
    maxZoom: 19,
    attribution: TILE_ATTRIBUTION,
    referrerPolicy: "no-referrer"
  }).addTo(map);

  L.control.zoom({ position: "bottomright" }).addTo(map);
  return map;
}

export function fitToBoundaries(map, featureCollection) {
  const layer = L.geoJSON(featureCollection);
  const bounds = layer.getBounds();
  if (bounds.isValid()) {
    map.fitBounds(bounds.pad(0.06), { animate: false });
  }
}

export function createBoundaryController(map, featureCollection, getStatus, options = {}) {
  const featureLayers = new Map();

  const layer = L.geoJSON(featureCollection, {
    style: (feature) => boundaryStyle(getStatus(feature.properties.id)),
    onEachFeature: (feature, leafletLayer) => {
      const id = feature.properties.id;
      featureLayers.set(id, leafletLayer);
      leafletLayer.bindTooltip(feature.properties.name, {
        permanent: true,
        direction: "center",
        offset: labelOffset(id),
        className: "barangay-label",
        opacity: 0.96
      });
      leafletLayer.bindPopup(() => popupMarkup(feature, getStatus(id)));
      leafletLayer.on("click", () => options.onSelect?.(feature));
    }
  }).addTo(map);

  return {
    layer,
    refresh() {
      featureLayers.forEach((leafletLayer, id) => {
        leafletLayer.setStyle(boundaryStyle(getStatus(id)));
        if (leafletLayer.getPopup()) {
          leafletLayer.setPopupContent(popupMarkup(leafletLayer.feature, getStatus(id)));
        }
      });
    },
    focus(id) {
      const leafletLayer = featureLayers.get(id);
      if (!leafletLayer) return;
      map.fitBounds(leafletLayer.getBounds().pad(0.18), { animate: true, duration: 0.4 });
      leafletLayer.openPopup();
    },
    getLayer(id) {
      return featureLayers.get(id);
    }
  };
}

function labelOffset(id) {
  const offsets = {
    asinan: [-44, 18],
    banicain: [-36, 34],
    "east-bajac-bajac": [56, -26],
    "west-bajac-bajac": [-54, -20],
    "east-tapinac": [64, -12],
    "west-tapinac": [-58, 12],
    "new-ilalim": [54, 34],
    "new-kababae": [58, 52],
    "new-kalalake": [66, 18],
    "pag-asa": [50, 36],
    mabayuan: [-36, -12],
    barreto: [-34, -8]
  };

  return offsets[id] || [0, 0];
}

export function makeTruckMarker(truckId, latLng) {
  const truck = TRUCKS[truckId];
  return L.marker(latLng, {
    icon: L.divIcon({
      className: "",
      html: `<div class="truck-marker" style="--truck-color:${truck.color}"><span>${truck.shortLabel}</span></div>`,
      iconSize: [38, 38],
      iconAnchor: [19, 19]
    }),
    zIndexOffset: 1000
  });
}

export function centerForBarangay(featuresById, id) {
  const feature = featuresById.get(id);
  return feature ? getFeatureCenter(feature) : { lat: 14.835, lng: 120.283 };
}

function boundaryStyle(status = STATUS.TO_COLLECT) {
  const meta = STATUS_META[status] || STATUS_META[STATUS.TO_COLLECT];
  return {
    color: meta.color,
    weight: status === STATUS.NEARBY ? 4 : 2.4,
    opacity: 0.95,
    fillColor: meta.color,
    fillOpacity: status === STATUS.COLLECTED ? 0.14 : status === STATUS.NEARBY ? 0.18 : 0.08,
    dashArray: status === STATUS.TO_COLLECT ? "5 7" : null
  };
}

function popupMarkup(feature, status) {
  const meta = STATUS_META[status] || STATUS_META[STATUS.TO_COLLECT];
  return `
    <div class="map-popup">
      <strong>${feature.properties.name}</strong>
      <span style="color:${meta.color}">${meta.label}</span>
    </div>
  `;
}
