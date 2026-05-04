export const PASSWORDS = {
  driver: "driver123",
  admin: "admin123"
};

export const STATUS = {
  TO_COLLECT: "to_collect",
  NEARBY: "nearby",
  COLLECTED: "collected"
};

export const STATUS_META = {
  [STATUS.TO_COLLECT]: {
    label: "To Collect",
    color: "#4fc3f7",
    fill: "rgba(79, 195, 247, 0.12)"
  },
  [STATUS.NEARBY]: {
    label: "Nearby",
    color: "#ffd166",
    fill: "rgba(255, 209, 102, 0.18)"
  },
  [STATUS.COLLECTED]: {
    label: "Collected",
    color: "#00c47a",
    fill: "rgba(0, 196, 122, 0.16)"
  }
};

export const BARANGAY_ORDER = [
  "asinan",
  "banicain",
  "barreto",
  "east-bajac-bajac",
  "east-tapinac",
  "gordon-heights",
  "kalaklan",
  "mabayuan",
  "new-cabalan",
  "new-ilalim",
  "new-kababae",
  "new-kalalake",
  "old-cabalan",
  "pag-asa",
  "santa-rita",
  "west-bajac-bajac",
  "west-tapinac"
];

export const ROUTES = {
  truckA: [
    "east-bajac-bajac",
    "east-tapinac",
    "kalaklan",
    "gordon-heights",
    "pag-asa",
    "barreto",
    "west-tapinac",
    "new-kalalake",
    "west-bajac-bajac"
  ],
  truckB: [
    "asinan",
    "banicain",
    "santa-rita",
    "new-kababae",
    "new-ilalim",
    "new-cabalan",
    "old-cabalan",
    "mabayuan"
  ]
};

export const TRUCKS = {
  truckA: {
    id: "truckA",
    label: "Truck A",
    shortLabel: "A",
    color: "#ffd166",
    route: ROUTES.truckA
  },
  truckB: {
    id: "truckB",
    label: "Truck B",
    shortLabel: "B",
    color: "#4fc3f7",
    route: ROUTES.truckB
  }
};

const DISPLAY_NAME_OVERRIDES = {
  "East Bajac-bajac": "East Bajac-Bajac",
  "West Bajac-bajac": "West Bajac-Bajac",
  "Barretto": "Barreto"
};

export function toDisplayName(name) {
  return DISPLAY_NAME_OVERRIDES[name] || name;
}

export function slugify(value) {
  return String(value)
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createInitialStatuses(features) {
  return Object.fromEntries(
    features.map((feature) => [
      feature.properties.id,
      {
        status: STATUS.TO_COLLECT,
        updatedAt: null,
        updatedBy: "system"
      }
    ])
  );
}

export function nowStamp() {
  return new Date().toISOString();
}

export function formatTime(value = Date.now()) {
  return new Date(value).toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit"
  });
}
