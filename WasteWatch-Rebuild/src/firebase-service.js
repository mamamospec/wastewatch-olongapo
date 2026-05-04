import { FIREBASE_CONFIG, hasFirebaseConfig } from "./firebase-config.js";

export class SyncService {
  constructor() {
    this.db = null;
    this.live = false;
    this.handlers = [];
  }

  async connect() {
    if (!hasFirebaseConfig() || !window.firebase) {
      return { live: false, reason: "missing-config" };
    }

    try {
      if (!window.firebase.apps.length) {
        window.firebase.initializeApp(FIREBASE_CONFIG);
      }
      this.db = window.firebase.database();
      await this.waitForConnection();
      this.live = true;
      return { live: true };
    } catch (error) {
      console.warn("Firebase unavailable, using demo mode.", error);
      this.live = false;
      return { live: false, reason: "connection-failed" };
    }
  }

  subscribe(callbacks) {
    if (!this.db) return () => {};

    const refs = [
      ["barangayStatuses", (snapshot) => callbacks.onStatuses?.(snapshot.val() || {})],
      ["trucks", (snapshot) => callbacks.onTrucks?.(snapshot.val() || {})],
      ["reports", (snapshot) => callbacks.onReports?.(listFromSnapshot(snapshot.val()))],
      ["activity", (snapshot) => callbacks.onActivity?.(listFromSnapshot(snapshot.val()))],
      ["alerts", (snapshot) => callbacks.onAlerts?.(listFromSnapshot(snapshot.val()))]
    ];

    refs.forEach(([path, handler]) => {
      const ref = this.db.ref(path);
      ref.on("value", handler);
      this.handlers.push([ref, handler]);
    });

    return () => this.detach();
  }

  detach() {
    this.handlers.forEach(([ref, handler]) => ref.off("value", handler));
    this.handlers = [];
  }

  setBarangayStatus(id, payload) {
    return this.write(`barangayStatuses/${id}`, payload);
  }

  updateTruck(id, payload) {
    return this.write(`trucks/${id}`, payload);
  }

  pushActivity(payload) {
    return this.push("activity", payload);
  }

  pushReport(payload) {
    return this.push("reports", payload);
  }

  resolveReport(id, payload) {
    return this.write(`reports/${id}`, payload);
  }

  pushAlert(payload) {
    return this.push("alerts", payload);
  }

  async write(path, payload) {
    if (!this.db) return { ok: false, reason: "offline" };

    try {
      await this.db.ref(path).update(payload);
      return { ok: true, payload };
    } catch (error) {
      console.error(`Firebase write failed at ${path}`, error);
      return { ok: false, reason: "write-failed", error };
    }
  }

  async push(path, payload) {
    if (!this.db) return { ok: false, reason: "offline" };

    try {
      const ref = await this.db.ref(path).push(payload);
      return { ok: true, key: ref.key };
    } catch (error) {
      console.error(`Firebase push failed at ${path}`, error);
      return { ok: false, reason: "push-failed", error };
    }
  }

  waitForConnection() {
    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => reject(new Error("Firebase connection timeout")), 4500);
      const ref = this.db.ref(".info/connected");
      ref.on("value", function handle(snapshot) {
        if (snapshot.val() === true) {
          window.clearTimeout(timeoutId);
          ref.off("value", handle);
          resolve();
        }
      });
    });
  }
}

function listFromSnapshot(value) {
  if (!value) return [];
  return Object.entries(value)
    .map(([id, item]) => ({ ...item, id }))
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}
