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

// No Authorization header at all — for the one legitimate no-auth case in
// this app: previewing an invitation before the visitor has necessarily
// signed in yet. Never used for anything that returns real Company data;
// the backend endpoint behind this is itself deliberately minimal.
export async function apiFetchPublic(path) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
  });
  await throwIfNotOk(res);
  return res.json();
}

// Defaults to active-only Properties server-side — every caller that omits
// `params` (the Property Scope selector, every portfolio-wide filter
// picker, the global Add Document target picker) automatically stops
// offering archived Properties for free. Portfolio's own Active/Archived/
// All toggle is the one caller that passes { status }.
// The caller's own identity plus their Membership role(s) — used only to
// resolve "what can I do," never trusted as a substitute for backend
// authorization, which independently re-derives the caller's role from
// their session on every request regardless of what this returns.
export function getCurrentUser() {
  return apiFetch("/api/users/me");
}

// Self-scoped server-side — there is no id to pass, and none would be
// honored; this can only ever change the caller's own displayName.
export function updateCurrentUser(payload) {
  return apiFetch("/api/users/me", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

// Admin/Owner-only server-side. name is the only field the backend accepts
// — see the Organization Settings audit for why nothing else belongs here.
export function updateCompany(id, name) {
  return apiFetch(`/api/companies/${id}`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  });
}

// Both Admin/Owner-only server-side — the caller's own Company is always
// implicit (never a client-supplied company id), matching the same
// single-company assumption Vendor creation and Property Scope already make.
export function getMembers() {
  return apiFetch("/api/members");
}

export function updateMemberRole(membershipId, role) {
  return apiFetch(`/api/members/${membershipId}`, {
    method: "PUT",
    body: JSON.stringify({ role }),
  });
}

// Invitations — Admin/Owner-only management (create/list/revoke, all
// implicit to the caller's own Company) plus the two invitee-facing
// redemption calls, which key off the invitation's token rather than any
// id the frontend would otherwise need to know.
export function getPendingInvites() {
  return apiFetch("/api/invites");
}

export function createInvite(payload) {
  return apiFetch("/api/invites", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function revokeInvite(id) {
  return apiFetch(`/api/invites/${id}`, { method: "DELETE" });
}

// Public — the visitor may not be signed in yet when they first open an
// invitation link.
export function getInvitePreview(token) {
  return apiFetchPublic(`/api/invites/token/${token}`);
}

// Requires an authenticated Firebase session (the visitor signs in/up on
// the Join page first) but not Company membership — accepting IS what
// creates that membership.
export function acceptInvite(token) {
  return apiFetch(`/api/invites/token/${token}/accept`, { method: "POST" });
}

export function getProperties(params = {}) {
  return apiFetch(`/api/properties${toQueryString(params)}`);
}

export function getProperty(id) {
  return apiFetch(`/api/properties/${id}`);
}

export function createProperty(payload) {
  return apiFetch("/api/properties", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateProperty(id, payload) {
  return apiFetch(`/api/properties/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function getLocations(propertyId) {
  return apiFetch(`/api/properties/${propertyId}/locations`);
}

export function createLocation(propertyId, payload) {
  return apiFetch(`/api/properties/${propertyId}/locations`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
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

// Property is deliberately not a field this ever sends — the backend
// endpoint doesn't accept it either; an Asset's Property is immutable after
// creation. Returns the bare Asset row, not the enriched Asset Detail
// shape (property/location/workOrders/lifetimeSpend), so callers refetch
// getAsset() afterward rather than using this response directly.
export function updateAsset(id, payload) {
  return apiFetch(`/api/assets/${id}`, {
    method: "PUT",
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
