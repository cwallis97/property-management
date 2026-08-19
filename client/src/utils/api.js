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
export async function apiUpload(path, formData, method = "POST") {
  const token = await getAuthToken();

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
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

export function getAsset(id) {
  return apiFetch(`/api/assets/${id}`);
}

export function createAsset(propertyId, payload) {
  return apiFetch(`/api/properties/${propertyId}/assets`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// Portfolio-wide — every Asset across every Property the caller's company
// owns. All | Needs Attention | Critical and Property filtering both
// happen client-side over this one fetch, same convention as Portfolio
// Work Orders.
export function getPortfolioAssets() {
  return apiFetch("/api/assets");
}

export function getWorkOrders(propertyId) {
  return apiFetch(`/api/properties/${propertyId}/work-orders`);
}

export function getWorkOrder(id) {
  return apiFetch(`/api/work-orders/${id}`);
}

// Portfolio-wide operational queue — every Work Order across every Property
// the caller's company owns. Active/Completed/All and Property filtering
// both happen client-side over this one fetch, same convention as a single
// property's Work Orders tab.
export function getPortfolioWorkOrders() {
  return apiFetch("/api/work-orders");
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

// Company-scoped — every Vendor (active and inactive) the caller's company
// owns. Active/Inactive filtering happens client-side over this one fetch,
// same convention as Assets/Work Orders.
export function getVendors() {
  return apiFetch("/api/vendors");
}

export function getVendor(id) {
  return apiFetch(`/api/vendors/${id}`);
}

export function createVendor(payload) {
  return apiFetch("/api/vendors", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateVendor(id, payload) {
  return apiFetch(`/api/vendors/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
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
// can pass a filter object with optional keys directly. Defaults to {} so
// calling with no params at all (an intentionally unfiltered list, e.g.
// the global Documents page) is safe rather than throwing on
// Object.entries(undefined).
function toQueryString(params = {}) {
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

// params accepts one optional attachment filter (propertyId | assetId |
// workOrderId | vendorId) — the same endpoint serves both the global
// Documents page (no filter) and every EntityDocuments section (one
// filter). Archived Documents are included; hiding them by default is a
// frontend concern, same convention as Active/Completed/All elsewhere.
export function getDocuments(params = {}) {
  return apiFetch(`/api/documents${toQueryString(params)}`);
}

export function createDocument(formData) {
  return apiUpload("/api/documents", formData);
}

export function updateDocument(id, payload) {
  return apiFetch(`/api/documents/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function replaceDocumentFile(id, file) {
  const formData = new FormData();
  formData.append("file", file);
  return apiUpload(`/api/documents/${id}/file`, formData, "PUT");
}

export function archiveDocument(id) {
  return apiFetch(`/api/documents/${id}`, { method: "DELETE" });
}

export function getDocumentFileBlob(id) {
  return apiFetchBlob(`/api/documents/${id}/file`);
}

// Auth-gated files can't be opened via a plain <a href> (the browser
// wouldn't send the Authorization header on a plain navigation) — fetch
// the bytes as a blob, then hand the browser an object URL to open
// instead. Revoked after a short delay rather than immediately, so the
// new tab has time to actually load it.
export async function openDocumentFile(id) {
  const blob = await getDocumentFileBlob(id);
  const objectUrl = URL.createObjectURL(blob);
  window.open(objectUrl, "_blank");
  setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
}
