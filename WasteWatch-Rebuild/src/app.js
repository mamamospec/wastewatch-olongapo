import {
  PASSWORDS,
  STATUS,
  STATUS_META,
  TRUCKS,
  createInitialStatuses,
  formatTime,
  nowStamp
} from "./data.js";
import { findBarangayAt, getFeatureCenter, loadBoundaryData } from "./geofence.js";
import {
  centerForBarangay,
  createBoundaryController,
  createMap,
  fitToBoundaries,
  makeTruckMarker
} from "./map-view.js";
import { SyncService } from "./firebase-service.js";

const state = {
  boundaryCollection: null,
  features: [],
  featuresById: new Map(),
  statuses: {},
  trucks: {},
  maps: {},
  boundaryControllers: {},
  truckMarkers: {},
  reports: [],
  activity: [],
  alerts: [],
  seenAlerts: new Set(),
  loginRole: "driver",
  driverTruckId: "truckA",
  live: false,
  sync: new SyncService(),
  gpsWatchId: null,
  toastTimer: null,
  lastSyncWarningAt: 0,
  demoTimer: null,
  demoTick: 0
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindEvents();
  generateQrCode();
  renderIcons();

  try {
    state.boundaryCollection = await loadBoundaryData();
    state.features = state.boundaryCollection.features;
    state.featuresById = new Map(state.features.map((feature) => [feature.properties.id, feature]));
    state.statuses = createInitialStatuses(state.features);
    state.trucks = createInitialTrucks();
    populateReportSelect();
    renderAll();
    setMode("Demo ready", false);
  } catch (error) {
    console.error(error);
    setMode("Map unavailable", false);
    showToast("triangle-alert", "Boundary Load Failed", "The barangay GeoJSON could not be loaded.");
    return;
  }

  state.sync.connect().then((result) => {
    state.live = result.live;
    setMode(result.live ? "Live Sync" : "Demo Mode", result.live);

    if (result.live) {
      state.sync.subscribe({
        onStatuses: applyRemoteStatuses,
        onTrucks: applyRemoteTrucks,
        onReports: (reports) => {
          state.reports = reports;
          renderReports();
          renderAdminStats();
        },
        onActivity: (activity) => {
          state.activity = activity;
          renderActivity();
          renderHistory();
        },
        onAlerts: applyRemoteAlerts
      });
    }
  });
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const actionEl = event.target.closest("[data-action]");
    if (actionEl) handleAction(actionEl, event);

    const panelEl = event.target.closest("[data-panel]");
    if (panelEl) togglePanel(panelEl.dataset.panel);

    const tabEl = event.target.closest("[data-tab-target]");
    if (tabEl) switchTab(tabEl);

    const adminEl = event.target.closest("[data-admin-section]");
    if (adminEl) switchAdminSection(adminEl.dataset.adminSection, adminEl);

    const statusEl = event.target.closest("[data-focus-bgy]");
    if (statusEl) focusBarangay(statusEl.dataset.focusBgy);

    const reportEl = event.target.closest("[data-resolve-report]");
    if (reportEl) resolveReport(reportEl.dataset.resolveReport);
  });

  document.getElementById("login-form").addEventListener("submit", (event) => {
    event.preventDefault();
    doLogin();
  });

  document.getElementById("report-form").addEventListener("submit", (event) => {
    event.preventDefault();
    submitReport();
  });

  document.getElementById("broadcast-message").addEventListener("input", (event) => {
    document.getElementById("broadcast-count").textContent = `${event.target.value.length}/140`;
  });
}

function handleAction(element, event) {
  const action = element.dataset.action;

  if (action === "open-resident") openResident();
  if (action === "show-login") showLogin(element.dataset.role);
  if (action === "go-home") goHome();
  if (action === "leave-driver") leaveDriver();
  if (action === "mark-collected") markCollected();
  if (action === "next-stop") moveToNextStop();
  if (action === "select-driver-truck") selectDriverTruck(element.dataset.truckId);
  if (action === "open-report") openReportDialog();
  if (action === "close-report") closeReportDialog();
  if (action === "send-broadcast") sendBroadcast();
  if (action === "clear-reports") clearReports();
  if (action === "clear-alerts") clearAlerts();
  if (action === "clear-history") clearHistory();
  if (action === "reset-collections") resetCollections();

  event.preventDefault();
}

function createInitialTrucks() {
  return Object.fromEntries(
    Object.values(TRUCKS).map((truck) => {
      const firstStop = truck.route[0];
      const center = centerForBarangay(state.featuresById, firstStop);
      return [
        truck.id,
        {
          ...truck,
          active: false,
          routeIndex: 0,
          currentBarangayId: firstStop,
          currentBarangayName: getBarangayName(firstStop),
          lat: center.lat,
          lng: center.lng,
          accuracy: null,
          source: "route",
          updatedAt: nowStamp()
        }
      ];
    })
  );
}

function showScreen(name) {
  document.querySelectorAll(".screen").forEach((screen) => screen.classList.remove("active"));
  document.getElementById(`screen-${name}`).classList.add("active");
  renderIcons();
  window.setTimeout(() => invalidateVisibleMap(name), 120);
}

function openResident() {
  showScreen("resident");
  ensureMap("resident");
  startDemoIfNeeded();
  renderAll();
}

function showLogin(role) {
  state.loginRole = role;
  const config = {
    driver: {
      icon: "truck",
      title: "Driver Login",
      desc: "Enter your driver access code."
    },
    admin: {
      icon: "landmark",
      title: "LGU Admin Login",
      desc: "Enter your admin access code."
    }
  }[role];

  document.getElementById("login-icon").innerHTML = `<i data-lucide="${config.icon}"></i>`;
  document.getElementById("login-title").textContent = config.title;
  document.getElementById("login-desc").textContent = config.desc;
  document.getElementById("login-input").value = "";
  document.getElementById("login-error").textContent = "";
  showScreen("login");
  renderIcons();
  window.setTimeout(() => document.getElementById("login-input").focus(), 150);
}

function doLogin() {
  const value = document.getElementById("login-input").value.trim();
  const role = state.loginRole;

  if (value !== PASSWORDS[role]) {
    document.getElementById("login-error").textContent = "Incorrect code. Try again.";
    return;
  }

  if (role === "driver") {
    openDriver();
  } else {
    openAdmin();
  }
}

function goHome() {
  showScreen("landing");
}

function leaveDriver() {
  stopGps();
  setTruckActive(state.driverTruckId, false);
  goHome();
}

function openDriver() {
  showScreen("driver");
  ensureMap("driver");
  setTruckActive(state.driverTruckId, true);
  markNearby(state.driverTruckId, state.trucks[state.driverTruckId].currentBarangayId);
  startGps();
  renderAll();
}

function openAdmin() {
  showScreen("admin");
  startDemoIfNeeded();
  renderAll();
}

function ensureMap(view) {
  if (!state.boundaryCollection) return;
  if (state.maps[view]) {
    refreshMaps();
    invalidateVisibleMap(view);
    return;
  }

  const mapId = view === "admin" ? "map-admin" : `map-${view}`;
  const map = createMap(mapId);
  const controller = createBoundaryController(
    map,
    state.boundaryCollection,
    (id) => getStatus(id),
    {
      onSelect: (feature) => focusBarangay(feature.properties.id)
    }
  );

  state.maps[view] = map;
  state.boundaryControllers[view] = controller;
  fitToBoundaries(map, state.boundaryCollection);
  syncTruckMarkers(view);
  invalidateVisibleMap(view);
}

function invalidateVisibleMap(view) {
  const map = state.maps[view];
  if (map) {
    map.invalidateSize();
    syncTruckMarkers(view);
  }
}

function getStatus(id) {
  return state.statuses[id]?.status || STATUS.TO_COLLECT;
}

function setMode(label, isLive) {
  document.getElementById("mode-label").textContent = label;
  document.querySelectorAll("[data-mode-copy]").forEach((element) => {
    element.textContent = label;
    element.classList.toggle("live", isLive);
  });
}

function populateReportSelect() {
  document.getElementById("report-barangay").innerHTML = state.features
    .map((feature) => `<option value="${feature.properties.id}">${feature.properties.name}</option>`)
    .join("");
}

function renderAll() {
  renderResidentStatusList();
  renderDriverRoute();
  renderAdminStats();
  renderAdminTrucks();
  renderReports();
  renderActivity();
  renderHistory();
  renderSentAlerts();
  refreshMaps();
  renderIcons();
}

function renderResidentStatusList() {
  const html = state.features
    .map((feature) => {
      const id = feature.properties.id;
      const meta = STATUS_META[getStatus(id)] || STATUS_META[STATUS.TO_COLLECT];
      return `
        <button class="status-item" type="button" data-focus-bgy="${id}">
          <span class="status-name">${feature.properties.name}</span>
          <span class="status-badge" style="--status-color:${meta.color}">${meta.label}</span>
        </button>
      `;
    })
    .join("");
  document.getElementById("resident-status-list").innerHTML = html;
}

function renderDriverRoute() {
  const truckId = state.driverTruckId;
  const truckConfig = TRUCKS[truckId];
  const truck = state.trucks[truckId];
  const html = truckConfig.route
    .map((id, index) => {
      const status = getStatus(id);
      const isCurrent = index === truck.routeIndex;
      const stateClass = status === STATUS.COLLECTED ? "collected" : isCurrent ? "nearby" : "";
      const label = status === STATUS.COLLECTED ? "Collected" : isCurrent ? "Current stop" : "Queued";
      return `
        <div class="route-stop ${stateClass}">
          <span class="route-num">${index + 1}</span>
          <span>
            <strong>${getBarangayName(id)}</strong>
            <small>${label}</small>
          </span>
          <i data-lucide="${status === STATUS.COLLECTED ? "check" : isCurrent ? "map-pin" : "circle"}"></i>
        </div>
      `;
    })
    .join("");

  document.getElementById("driver-route-list").innerHTML = html;
  document.getElementById("driver-route-title").textContent = `${truckConfig.label} Route`;
  document.getElementById("driver-current-bgy").textContent = truck.currentBarangayName || "Outside mapped barangay";
  document.getElementById("driver-current-detail").textContent = truck.accuracy
    ? `${truckConfig.label} GPS live within ${Math.round(truck.accuracy)} m accuracy`
    : `${truckConfig.label} using official barangay boundary route center`;
  document.querySelectorAll("[data-action='select-driver-truck']").forEach((button) => {
    button.classList.toggle("active", button.dataset.truckId === truckId);
  });
}

function renderAdminStats() {
  const values = Object.values(state.statuses);
  const collected = values.filter((item) => item.status === STATUS.COLLECTED).length;
  const nearby = values.filter((item) => item.status === STATUS.NEARBY).length;
  const toCollect = state.features.length - collected - nearby;
  const openReports = state.reports.filter((report) => !report.resolved).length;
  const pct = state.features.length ? Math.round((collected / state.features.length) * 100) : 0;

  document.getElementById("stat-collected").textContent = collected;
  document.getElementById("stat-nearby").textContent = nearby;
  document.getElementById("stat-to-collect").textContent = Math.max(0, toCollect);
  document.getElementById("stat-reports").textContent = openReports;
  document.getElementById("progress-pct").textContent = `${pct}%`;
  document.getElementById("progress-bar").style.width = `${pct}%`;
  document.getElementById("progress-sub").textContent = `${collected} of ${state.features.length} barangays collected`;
}

function renderAdminTrucks() {
  const html = Object.values(state.trucks)
    .map((truck) => `
      <article class="truck-item">
        <span class="truck-chip" style="--truck-color:${truck.color}">${truck.shortLabel}</span>
        <span>
          <strong>${truck.label}</strong>
          <small>${truck.active ? truck.currentBarangayName : "Standing by"} - ${truck.source === "gps" ? "GPS live" : "Route estimate"}</small>
        </span>
        <span class="status-badge" style="--status-color:${truck.active ? truck.color : "#7a9bb5"}">${truck.active ? "Active" : "Idle"}</span>
      </article>
    `)
    .join("");
  document.getElementById("admin-truck-list").innerHTML = html;
}

function renderReports() {
  const list = document.getElementById("admin-reports-list");
  if (!state.reports.length) {
    list.innerHTML = `<p class="source-note">No community reports yet.</p>`;
    return;
  }

  list.innerHTML = state.reports
    .map((report) => `
      <article class="report-card ${report.resolved ? "resolved" : ""}">
        <span>
          <strong>${report.barangayName || getBarangayName(report.barangayId)}</strong>
          <small>${report.description || "No description provided."}</small>
        </span>
        <div class="report-actions">
          <span class="report-tag">${report.resolved ? "Resolved" : report.type}</span>
          ${report.resolved ? "" : `<button class="secondary-btn" type="button" data-resolve-report="${report.id}"><i data-lucide="check"></i>Resolve</button>`}
        </div>
      </article>
    `)
    .join("");
  renderIcons();
}

function renderActivity() {
  document.getElementById("activity-list").innerHTML = activityMarkup(state.activity, "No activity yet.");
}

function renderHistory() {
  const collected = state.activity.filter((item) => item.type === "collected");
  document.getElementById("history-list").innerHTML = activityMarkup(collected, "Collection history will appear here.");
}

function renderSentAlerts() {
  document.getElementById("sent-alerts-list").innerHTML = activityMarkup(
    state.alerts.map((alert) => ({ ...alert, icon: "megaphone", type: "alert", title: alert.title || "LGU Alert", message: alert.message })),
    "No alerts sent yet."
  );
}

function activityMarkup(items, emptyCopy) {
  if (!items.length) return `<p class="source-note">${emptyCopy}</p>`;

  return items
    .map((item) => {
      const color = activityColor(item.type);
      return `
        <article class="activity-item" style="--item-color:${color}">
          <i data-lucide="${item.icon || iconForType(item.type)}"></i>
          <span>
            <strong>${item.title}</strong>
            <small>${item.message || ""}<br>${item.time || formatTime(Date.parse(item.createdAt || new Date()))}</small>
          </span>
        </article>
      `;
    })
    .join("");
}

function refreshMaps() {
  Object.values(state.boundaryControllers).forEach((controller) => controller.refresh());
  Object.keys(state.maps).forEach((view) => syncTruckMarkers(view));
}

function syncTruckMarkers(view) {
  const map = state.maps[view];
  if (!map) return;

  Object.values(state.trucks).forEach((truck) => {
    const key = `${view}-${truck.id}`;
    const shouldShow = truck.active && (view !== "driver" || truck.id === state.driverTruckId);
    const existing = state.truckMarkers[key];

    if (!shouldShow) {
      if (existing) {
        map.removeLayer(existing);
        delete state.truckMarkers[key];
      }
      return;
    }

    const latLng = [truck.lat, truck.lng];
    if (!existing) {
      const marker = makeTruckMarker(truck.id, latLng).addTo(map);
      marker.bindPopup(`${truck.label}: ${truck.currentBarangayName}`);
      state.truckMarkers[key] = marker;
    } else {
      existing.setLatLng(latLng);
      existing.setPopupContent(`${truck.label}: ${truck.currentBarangayName}`);
    }
  });
}

function focusBarangay(id) {
  Object.values(state.boundaryControllers).forEach((controller) => controller.focus(id));
}

function selectDriverTruck(truckId) {
  if (!TRUCKS[truckId] || state.driverTruckId === truckId) return;

  state.driverTruckId = truckId;
  setTruckActive(truckId, true);
  markNearby(truckId, state.trucks[truckId].currentBarangayId);

  if (state.maps.driver) {
    const truck = state.trucks[truckId];
    state.maps.driver.panTo([truck.lat, truck.lng], { animate: true });
  }

  showToast("truck", `${TRUCKS[truckId].label} Selected`, `This device is now controlling ${TRUCKS[truckId].label}.`);
  renderAll();
}

function markCollected() {
  const truckId = state.driverTruckId;
  const truckConfig = TRUCKS[truckId];
  const truck = state.trucks[truckId];
  const id = truck.currentBarangayId || truckConfig.route[truck.routeIndex];
  setBarangayStatus(id, STATUS.COLLECTED, "driver", truckId);
  addActivity({
    type: "collected",
    icon: "check-circle",
    title: `${getBarangayName(id)} Collected`,
    message: `Marked complete by ${truckConfig.label}.`
  });
  showToast("check-circle", "Collection Marked", `${getBarangayName(id)} is now collected.`);
}

function moveToNextStop() {
  const truckId = state.driverTruckId;
  const truckConfig = TRUCKS[truckId];
  const truck = state.trucks[truckId];
  if (truck.routeIndex >= truckConfig.route.length - 1) {
    showToast("party-popper", "Route Complete", `All ${truckConfig.label} stops are done.`);
    return;
  }

  const nextIndex = truck.routeIndex + 1;
  const nextId = truckConfig.route[nextIndex];
  updateTruckRoute(truckId, nextIndex, nextId, truck.source !== "gps");
  markNearby(truckId, nextId);
  addActivity({
    type: "nearby",
    icon: "map-pin",
    title: `${truckConfig.label} heading to ${getBarangayName(nextId)}`,
    message: "Residents nearby can prepare waste for collection."
  });
  showToast("truck", "Next Stop", `${truckConfig.label} is heading to ${getBarangayName(nextId)}.`);
}

function updateTruckRoute(truckId, routeIndex, barangayId, moveToCenter) {
  const truck = state.trucks[truckId];
  const center = centerForBarangay(state.featuresById, barangayId);
  state.trucks[truckId] = {
    ...truck,
    routeIndex,
    currentBarangayId: barangayId,
    currentBarangayName: getBarangayName(barangayId),
    lat: moveToCenter ? center.lat : truck.lat,
    lng: moveToCenter ? center.lng : truck.lng,
    updatedAt: nowStamp()
  };
  syncTruck(truckId);
  renderAll();
}

function markNearby(truckId, id) {
  Object.entries(state.statuses).forEach(([barangayId, data]) => {
    if (data.status === STATUS.NEARBY && data.truckId === truckId && barangayId !== id) {
      setBarangayStatus(barangayId, STATUS.TO_COLLECT, "system", truckId);
    }
  });

  if (getStatus(id) !== STATUS.COLLECTED) {
    setBarangayStatus(id, STATUS.NEARBY, truckId, truckId);
  }
}

function setBarangayStatus(id, status, updatedBy, truckId, shouldSync = true) {
  state.statuses[id] = {
    status,
    updatedAt: nowStamp(),
    updatedBy,
    truckId
  };

  renderAll();

  if (shouldSync && state.live) {
    persistSync(state.sync.setBarangayStatus(id, state.statuses[id]), "Barangay status");
  }
}

function setTruckActive(truckId, active) {
  state.trucks[truckId] = {
    ...state.trucks[truckId],
    active,
    updatedAt: nowStamp()
  };
  syncTruck(truckId);
  renderAll();
}

function startGps() {
  if (!navigator.geolocation) {
    document.getElementById("driver-gps-copy").textContent = "GPS unavailable on this device";
    return;
  }

  if (state.gpsWatchId) return;
  document.getElementById("driver-gps-copy").textContent = "Requesting GPS permission";

  state.gpsWatchId = navigator.geolocation.watchPosition(handleGpsPosition, handleGpsError, {
    enableHighAccuracy: true,
    maximumAge: 2500,
    timeout: 10000
  });
}

function stopGps() {
  if (state.gpsWatchId) {
    navigator.geolocation.clearWatch(state.gpsWatchId);
    state.gpsWatchId = null;
  }
}

function handleGpsPosition(position) {
  const truckId = state.driverTruckId;
  const lat = position.coords.latitude;
  const lng = position.coords.longitude;
  const accuracy = position.coords.accuracy;
  const feature = findBarangayAt(lat, lng, state.features);
  const currentId = feature?.properties.id || state.trucks[truckId].currentBarangayId;
  const currentName = feature?.properties.name || "Outside mapped barangay";

  state.trucks[truckId] = {
    ...state.trucks[truckId],
    active: true,
    lat,
    lng,
    accuracy,
    source: "gps",
    currentBarangayId: currentId,
    currentBarangayName: currentName,
    updatedAt: nowStamp()
  };

  if (feature) {
    markNearby(truckId, currentId);
  }

  document.getElementById("driver-gps-copy").textContent = `GPS live within ${Math.round(accuracy)} m`;
  syncTruck(truckId);
  renderAll();
}

function handleGpsError(error) {
  document.getElementById("driver-gps-copy").textContent = "GPS permission blocked or unavailable";
  showToast("triangle-alert", "GPS Not Live", error.message || "Using route estimate for now.");
}

function syncTruck(truckId) {
  if (state.live) {
    persistSync(state.sync.updateTruck(truckId, state.trucks[truckId]), "Truck location");
  }
}

function submitReport() {
  const barangayId = document.getElementById("report-barangay").value;
  const type = document.getElementById("report-type").value;
  const description = document.getElementById("report-desc").value.trim() || "No description provided.";
  const report = {
    id: `local-${Date.now()}`,
    barangayId,
    barangayName: getBarangayName(barangayId),
    type,
    description,
    resolved: false,
    createdAt: nowStamp(),
    time: formatTime()
  };

  state.reports.unshift(report);
  if (state.live) {
    persistSync(state.sync.pushReport({ ...report, id: null }), "Community report");
  }

  addActivity({
    type: "report",
    icon: "triangle-alert",
    title: `Report: ${report.barangayName}`,
    message: `${type} submitted by a resident.`
  });

  closeReportDialog();
  document.getElementById("report-desc").value = "";
  showToast("send", "Report Sent", `LGU admin can now see ${report.barangayName}.`);
  renderAll();
}

function resolveReport(id) {
  const report = state.reports.find((item) => item.id === id);
  if (!report) return;
  report.resolved = true;
  report.resolvedAt = nowStamp();

  if (state.live && !id.startsWith("local-")) {
    persistSync(state.sync.resolveReport(id, { resolved: true, resolvedAt: report.resolvedAt }), "Report resolution");
  }

  showToast("check", "Report Resolved", `${report.barangayName} report was marked resolved.`);
  renderAll();
}

function sendBroadcast() {
  const input = document.getElementById("broadcast-message");
  const message = input.value.trim();
  if (!message) {
    showToast("triangle-alert", "Empty Alert", "Type a message before sending.");
    return;
  }

  const alert = {
    id: `local-alert-${Date.now()}`,
    title: "LGU Alert",
    message,
    createdAt: nowStamp(),
    time: formatTime()
  };

  state.alerts.unshift(alert);
  state.seenAlerts.add(alert.id);
  if (state.live) {
    persistSync(state.sync.pushAlert({ ...alert, id: null }), "Broadcast alert");
  }

  input.value = "";
  document.getElementById("broadcast-count").textContent = "0/140";
  showToast("megaphone", "Broadcast Sent", message);
  renderSentAlerts();
}

function clearReports() {
  if (!window.confirm("Clear all community reports from the admin panel and Firebase?")) return;

  state.reports = [];
  if (state.live) {
    persistSync(state.sync.clearReports(), "Community reports");
  }
  showToast("trash-2", "Reports Cleared", "Community reports are now clean.");
  renderAll();
}

function clearAlerts() {
  if (!window.confirm("Clear all sent community alerts from Firebase?")) return;

  state.alerts = [];
  state.seenAlerts.clear();
  if (state.live) {
    persistSync(state.sync.clearAlerts(), "Community alerts");
  }
  showToast("trash-2", "Alerts Cleared", "Sent alerts are now clean.");
  renderAll();
}

function clearHistory() {
  if (!window.confirm("Clear collection history entries from Firebase? Barangay statuses will not be reset.")) return;

  const collectedEntries = state.activity.filter((item) => item.type === "collected" && item.id);
  state.activity = state.activity.filter((item) => item.type !== "collected");

  if (state.live && collectedEntries.length) {
    persistSync(
      Promise.all(collectedEntries.map((item) => state.sync.deleteActivity(item.id))).then((results) =>
        results.every((result) => result?.ok) ? { ok: true } : { ok: false, reason: "partial-delete" }
      ),
      "Collection history"
    );
  }

  showToast("trash-2", "History Cleared", "Collection history is now clean.");
  renderAll();
}

function resetCollections() {
  if (!window.confirm("Reset all barangays back to To Collect and move trucks to route starts?")) return;

  stopGps();
  state.statuses = createInitialStatuses(state.features);
  state.trucks = createInitialTrucks();
  state.driverTruckId = "truckA";

  if (state.live) {
    persistSync(state.sync.resetStatuses(state.statuses), "Collection statuses");
    persistSync(state.sync.resetTrucks(state.trucks), "Truck routes");
  }

  showToast("rotate-ccw", "Collections Reset", "All barangays are back to To Collect.");
  renderAll();
}

function addActivity(entry) {
  const activity = {
    id: `local-activity-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: nowStamp(),
    time: formatTime(),
    ...entry
  };

  state.activity.unshift(activity);
  state.activity = state.activity.slice(0, 40);
  if (state.live) {
    persistSync(state.sync.pushActivity({ ...activity, id: null }), "Activity log");
  }
  renderActivity();
  renderHistory();
}

function persistSync(operation, label) {
  if (!operation || typeof operation.then !== "function") return;

  operation
    .then((result) => {
      if (result?.ok === false) {
        showPersistenceProblem(label, result.error || result.reason);
        return;
      }
      if (state.live) {
        setMode("Live Sync", true);
      }
    })
    .catch((error) => showPersistenceProblem(label, error));
}

function showPersistenceProblem(label, error) {
  console.error(`${label} was not saved to Firebase.`, error);
  setMode("Live Read Only", false);

  const now = Date.now();
  if (now - state.lastSyncWarningAt < 4500) return;
  state.lastSyncWarningAt = now;
  showToast("cloud-off", "Firebase Save Blocked", `${label} was not saved. Check Realtime Database rules.`);
}

function applyRemoteStatuses(remoteStatuses) {
  const next = createInitialStatuses(state.features);
  Object.entries(remoteStatuses).forEach(([id, value]) => {
    if (next[id]) next[id] = value;
  });
  state.statuses = next;
  renderAll();
}

function applyRemoteTrucks(remoteTrucks) {
  Object.entries(remoteTrucks).forEach(([id, truck]) => {
    if (state.trucks[id]) {
      state.trucks[id] = {
        ...state.trucks[id],
        ...truck,
        currentBarangayName: truck.currentBarangayName || getBarangayName(truck.currentBarangayId)
      };
    }
  });
  renderAll();
}

function applyRemoteAlerts(alerts) {
  const firstLoad = state.seenAlerts.size === 0 && state.alerts.length === 0;
  state.alerts = alerts;

  alerts.forEach((alert) => {
    if (firstLoad) {
      state.seenAlerts.add(alert.id);
      return;
    }
    if (!state.seenAlerts.has(alert.id)) {
      state.seenAlerts.add(alert.id);
      showToast("megaphone", alert.title || "LGU Alert", alert.message || "");
    }
  });

  renderSentAlerts();
}

function startDemoIfNeeded() {
  if (state.live || state.demoTimer) return;

  Object.keys(TRUCKS).forEach((truckId) => {
    setTruckActive(truckId, true);
    markNearby(truckId, state.trucks[truckId].currentBarangayId);
  });

  state.demoTimer = window.setInterval(() => {
    const truckId = state.demoTick % 2 === 0 ? "truckB" : "truckA";
    advanceDemoTruck(truckId);
    state.demoTick += 1;
  }, 12000);
}

function advanceDemoTruck(truckId) {
  const truckConfig = TRUCKS[truckId];
  const truck = state.trucks[truckId];
  const currentId = truckConfig.route[truck.routeIndex];

  if (getStatus(currentId) !== STATUS.COLLECTED) {
    setBarangayStatus(currentId, STATUS.COLLECTED, "demo", truckId);
    addActivity({
      type: "collected",
      icon: "check-circle",
      title: `${getBarangayName(currentId)} Collected`,
      message: `${truck.label} completed this stop.`
    });
  }

  const nextIndex = Math.min(truck.routeIndex + 1, truckConfig.route.length - 1);
  const nextId = truckConfig.route[nextIndex];
  updateTruckRoute(truckId, nextIndex, nextId, true);

  if (nextId !== currentId) {
    markNearby(truckId, nextId);
  }
}

function switchTab(tabButton) {
  const panel = tabButton.closest(".slide-panel");
  panel.querySelectorAll("[data-tab-target]").forEach((button) => button.classList.remove("active"));
  panel.querySelectorAll(".tab-pane").forEach((pane) => pane.classList.remove("active"));
  tabButton.classList.add("active");
  document.getElementById(tabButton.dataset.tabTarget).classList.add("active");
}

function switchAdminSection(section, button) {
  document.querySelectorAll("[data-admin-section]").forEach((navButton) => navButton.classList.remove("active"));
  document.querySelectorAll(".admin-section").forEach((panel) => panel.classList.remove("active"));
  button.classList.add("active");
  document.getElementById(`admin-${section}`).classList.add("active");
  if (section === "map") {
    ensureMap("admin");
    window.setTimeout(() => {
      state.maps.admin?.invalidateSize();
      if (state.maps.admin && state.boundaryCollection) {
        fitToBoundaries(state.maps.admin, state.boundaryCollection);
      }
      refreshMaps();
    }, 160);
  }
  renderAll();
}

function togglePanel(id) {
  document.getElementById(id).classList.toggle("open");
}

function openReportDialog() {
  const dialog = document.getElementById("report-dialog");
  if (dialog.showModal) dialog.showModal();
  else dialog.setAttribute("open", "");
  renderIcons();
}

function closeReportDialog() {
  const dialog = document.getElementById("report-dialog");
  if (dialog.close) dialog.close();
  else dialog.removeAttribute("open");
}

function getBarangayName(id) {
  return state.featuresById.get(id)?.properties.name || id;
}

function activityColor(type) {
  return {
    collected: "#00c47a",
    nearby: "#ffd166",
    report: "#ff6b6b",
    alert: "#4fc3f7"
  }[type] || "#4fc3f7";
}

function iconForType(type) {
  return {
    collected: "check-circle",
    nearby: "map-pin",
    report: "triangle-alert",
    alert: "megaphone"
  }[type] || "info";
}

function generateQrCode() {
  const url = window.location.href;
  document.getElementById("qr-url-text").textContent = url;
  const target = document.getElementById("qrcode");
  target.innerHTML = "";
  if (window.QRCode) {
    new window.QRCode(target, {
      text: url,
      width: 148,
      height: 148,
      colorDark: "#0b1f3a",
      colorLight: "#ffffff",
      correctLevel: window.QRCode.CorrectLevel.H
    });
  }
}

function showToast(icon, title, message) {
  const toast = document.getElementById("toast");
  document.getElementById("toast-icon").innerHTML = `<i data-lucide="${icon}"></i>`;
  document.getElementById("toast-title").textContent = title;
  document.getElementById("toast-msg").textContent = message;
  toast.classList.add("show");
  renderIcons();
  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => toast.classList.remove("show"), 3600);
}

function renderIcons() {
  if (window.lucide) {
    window.lucide.createIcons({
      attrs: {
        "stroke-width": 2.2
      }
    });
  }
}
