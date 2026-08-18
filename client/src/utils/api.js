// Small reusable client for the Express API. Attaches the current Firebase
// user's ID token as a Bearer token on every request — there is no other
// auth path, so callers never need to think about tokens themselves.
import { auth } from "../firebase";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

// auth.currentUser is synchronously null until Firebase finishes restoring
// the session, which can happen after this module's first call (e.g. a
// fresh page load). Wait for the first auth-state resolution before giving
// up, rather than racing it.
function waitForFirebaseUser() {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return new Promise((resolve) => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

async function getAuthToken() {
  const user = await waitForFirebaseUser();
  if (!user) {
    throw new Error("You must be signed in to do that.");
  }
  return user.getIdToken();
}

async function throwIfNotOk(res) {
  if (res.ok) return;
  const body = await res.json().catch(() => null);
  const error = new Error(body?.error || `Request failed with status ${res.status}`);
  error.status = res.status;
  throw error;
}

export async function apiFetch(path, options = {}) {
  const token = await getAuthToken();

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  await throwIfNotOk(res);

  if (res.status === 204) return null;
  return res.json();
}

// For endpoints that return a raw file (not JSON) — same auth handling as
// apiFetch, but resolves to a Blob so the caller can build an object URL.
export async function apiFetchBlob(path) {
  const token = await getAuthToken();

  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  await throwIfNotOk(res);
  return res.blob();
}

// For multipart file uploads — deliberately does NOT set Content-Type
// itself, so the browser can attach the correct multipart boundary.
export async function apiUpload(path, formData) {
  const token = await getAuthToken();

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  await throwIfNotOk(res);
  return res.json();
}

export function getProperties() {
  return apiFetch("/api/properties");
}

export function getProperty(id) {
  return apiFetch(`/api/properties/${id}`);
}

export function getLocations(propertyId) {
  return apiFetch(`/api/properties/${propertyId}/locations`);
}

export function getAssets(propertyId) {
  return apiFetch(`/api/properties/${propertyId}/assets`);
}

export function getWorkOrders(propertyId) {
  return apiFetch(`/api/properties/${propertyId}/work-orders`);
}

export function getWorkOrder(id) {
  return apiFetch(`/api/work-orders/${id}`);
}

export function createWorkOrder(propertyId, payload) {
  return apiFetch(`/api/properties/${propertyId}/work-orders`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateWorkOrder(id, payload) {
  return apiFetch(`/api/work-orders/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function getWorkOrderNotes(workOrderId) {
  return apiFetch(`/api/work-orders/${workOrderId}/notes`);
}

export function createWorkOrderNote(workOrderId, body) {
  return apiFetch(`/api/work-orders/${workOrderId}/notes`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function getDashboardSummary() {
  return apiFetch("/api/dashboard/summary");
}

export function getSitePlan(propertyId) {
  return apiFetch(`/api/properties/${propertyId}/site-plan`);
}

export function getSitePlanFileBlob(propertyId) {
  return apiFetchBlob(`/api/properties/${propertyId}/site-plan/file`);
}

export function uploadSitePlan(propertyId, file) {
  const formData = new FormData();
  formData.append("file", file);
  return apiUpload(`/api/properties/${propertyId}/site-plan`, formData);
}

export function getWorkTypes() {
  return apiFetch("/api/work-types");
}

export function getWorkOrderCosts(workOrderId) {
  return apiFetch(`/api/work-orders/${workOrderId}/costs`);
}

export function createWorkOrderCost(workOrderId, payload) {
  return apiFetch(`/api/work-orders/${workOrderId}/costs`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// Drops undefined/null values before building a query string, so callers
// can pass a filter object with optional keys directly.
function toQueryString(params) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") query.set(key, value);
  }
  const str = query.toString();
  return str ? `?${str}` : "";
}

export function getMaintenanceSpendSummary(params) {
  return apiFetch(`/api/reports/maintenance-spend${toQueryString(params)}`);
}

export function getMaintenanceSpendWorkOrders(params) {
  return apiFetch(`/api/reports/maintenance-spend/work-orders${toQueryString(params)}`);
}
