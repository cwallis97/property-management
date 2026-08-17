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

export async function apiFetch(path, options = {}) {
  const user = await waitForFirebaseUser();
  if (!user) {
    throw new Error("You must be signed in to do that.");
  }

  const token = await user.getIdToken();

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const error = new Error(body?.error || `Request failed with status ${res.status}`);
    error.status = res.status;
    throw error;
  }

  if (res.status === 204) return null;
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
