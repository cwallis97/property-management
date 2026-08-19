import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import EmptyState from "../components/EmptyState";
import SectionSpinner from "../components/SectionSpinner";
import SearchableSelect from "../components/SearchableSelect";
import EntityDocuments from "../components/EntityDocuments";
import { IconAlertTriangle, IconArrowLeft, IconWrench } from "../components/icons";
import { priorityBadge, statusBadge, statusLabel } from "../components/WorkOrderTable";
import {
  formatAge,
  isOverdue,
  needsAttention as computeNeedsAttention,
  resolveWorkOrderContext,
  ACTIVE_WORK_ORDER_STATUSES,
  categoryLabel,
} from "../utils/workOrders";
import {
  getWorkOrder,
  getLocations,
  getAssets,
  getVendors,
  updateWorkOrder,
  getWorkOrderNotes,
  createWorkOrderNote,
  getWorkOrderCosts,
  createWorkOrderCost,
} from "../utils/api";

const COST_TYPES = [
  { value: "labor", label: "Labor" },
  { value: "material", label: "Material" },
  { value: "vendor", label: "Vendor" },
  { value: "equipment", label: "Equipment" },
  { value: "other", label: "Other" },
];
const costTypeLabel = Object.fromEntries(COST_TYPES.map((t) => [t.value, t.label]));

function formatMoney(amount) {
  return `$${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDueDate(dueDateStr) {
  const [y, m, d] = dueDateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Same local-midnight parsing as isOverdue(), so "overdue by X" always
// agrees with whether the item is flagged overdue at all.
function formatOverdueBy(dueDateStr) {
  const [y, m, d] = dueDateStr.split("-").map(Number);
  const due = new Date(y, m - 1, d);
  return formatAge(new Date() - due);
}

// "Aug 17 · 9:42 AM" — includes the date (not just time-of-day) since a
// work order's Updates can naturally span multiple days; time-only would
// be ambiguous for anything older than today.
function formatNoteTimestamp(createdAt) {
  const date = new Date(createdAt);
  const datePart = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const timePart = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${datePart} · ${timePart}`;
}

function BackLink({ to, state, label }) {
  return (
    <Link to={to} state={state} className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition hover:text-gray-900">
      <IconArrowLeft className="h-4 w-4" />
      Back to {label}
    </Link>
  );
}

function SidebarSection({ title, children }) {
  return (
    <div>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</h2>
      {children}
    </div>
  );
}

// Direct URL / refresh / any origin that didn't pass explicit state falls
// back here — the property's own Work Orders tab, since propertyId is
// always known from the route regardless of how this page was reached.
function fallbackBackTarget(propertyId) {
  return { backLabel: "Work Orders", backTo: `/portfolio/${propertyId}`, backTabState: { tab: "work-orders" } };
}

// Tracks idle -> saving -> saved (auto-settling back to idle) -> error for
// exactly one editable control, independently of every other one on the
// page — so Status and Vendor (and Complete/Reopen, tracked as their own
// separate instance even though it hits the same status field) can never
// clobber each other's confirmation. Deliberately a small local hook, not
// a generic form/field framework — WorkOrderDetail only has a couple of
// autosaving controls, not a form's worth.
function useFieldSave() {
  const [phase, setPhase] = useState("idle"); // idle | saving | saved | error
  const [error, setError] = useState(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  async function run(mutate) {
    if (phase === "saving") return null;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setPhase("saving");
    setError(null);
    try {
      const result = await mutate();
      setPhase("saved");
      timeoutRef.current = setTimeout(() => setPhase("idle"), 2000);
      return result;
    } catch (err) {
      setPhase("error");
      setError(err.message || "Something went wrong. Please try again.");
      return null;
    }
  }

  // For controls with their own explicit Cancel (Description's edit mode,
  // unlike Status/Vendor which have no "close" step) — clears a stale error
  // so reopening the editor never immediately re-shows a past failure.
  function reset() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setPhase("idle");
    setError(null);
  }

  return { phase, error, run, reset };
}

export default function WorkOrderDetail() {
  const { propertyId, workOrderId } = useParams();
  const location = useLocation();

  // Return-to-origin navigation: whoever linked here (Dashboard, a
  // property's Map/Overview/Work Orders tab, etc.) passes where "back"
  // should actually go via router state — deliberately not browser history,
  // since history could just as easily send the user outside PropertyOS.
  const { backLabel, backTo, backTabState } = location.state?.backTo
    ? location.state
    : fallbackBackTarget(propertyId);

  const [workOrder, setWorkOrder] = useState(null);
  const [workOrderStatus, setWorkOrderStatus] = useState("loading"); // loading | error | not-found | ready
  const [workOrderError, setWorkOrderError] = useState(null);

  const [locations, setLocations] = useState([]);
  const [locationsStatus, setLocationsStatus] = useState("loading");
  const [assets, setAssets] = useState([]);
  const [assetsStatus, setAssetsStatus] = useState("loading");
  const [vendors, setVendors] = useState([]);
  const [vendorsStatus, setVendorsStatus] = useState("loading");

  // One independent save-state per editable control. `actionSave` is
  // deliberately separate from `statusSave` even though Complete/Reopen
  // write the same `status` field — those are explicit lifecycle actions
  // that already communicate their own in-progress state on the button
  // itself, and must never show a contextual "Saved" the inline Status
  // picker didn't actually produce.
  const statusSave = useFieldSave();
  const vendorSave = useFieldSave();
  const actionSave = useFieldSave();
  const descriptionSave = useFieldSave();

  // Description is the current best summary of the issue/work — editable,
  // unlike Notes below (append-only chronological history). Renders as
  // plain read content by default; edit mode is local-only until Save,
  // exactly like the Cost Entry form's open/closed pattern.
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");

  const [notes, setNotes] = useState([]);
  const [notesStatus, setNotesStatus] = useState("loading"); // loading | error | ready
  const [composerValue, setComposerValue] = useState("");
  const [submittingNote, setSubmittingNote] = useState(false);
  const [noteError, setNoteError] = useState(null);

  const [costs, setCosts] = useState([]);
  const [costsStatus, setCostsStatus] = useState("loading"); // loading | error | ready
  const [costFormOpen, setCostFormOpen] = useState(false);
  const [costType, setCostType] = useState("labor");
  const [costVendorId, setCostVendorId] = useState(null);
  const [costAmount, setCostAmount] = useState("");
  const [costNote, setCostNote] = useState("");
  const [costDate, setCostDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [submittingCost, setSubmittingCost] = useState(false);
  const [costError, setCostError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    // propertyId is already known from the route, so Locations/Assets can
    // load in parallel with the work order itself rather than waiting on it.
    setWorkOrderStatus("loading");
    getWorkOrder(workOrderId)
      .then((data) => {
        if (cancelled) return;
        setWorkOrder(data);
        setWorkOrderStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.status === 404) setWorkOrderStatus("not-found");
        else {
          setWorkOrderError(err.message);
          setWorkOrderStatus("error");
        }
      });

    setLocationsStatus("loading");
    getLocations(propertyId)
      .then((data) => {
        if (cancelled) return;
        setLocations(data);
        setLocationsStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setLocationsStatus("error");
      });

    setAssetsStatus("loading");
    getAssets(propertyId)
      .then((data) => {
        if (cancelled) return;
        setAssets(data);
        setAssetsStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setAssetsStatus("error");
      });

    setVendorsStatus("loading");
    getVendors()
      .then((data) => {
        if (cancelled) return;
        setVendors(data);
        setVendorsStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setVendorsStatus("error");
      });

    setNotesStatus("loading");
    getWorkOrderNotes(workOrderId)
      .then((data) => {
        if (cancelled) return;
        setNotes(data);
        setNotesStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setNotesStatus("error");
      });

    setCostsStatus("loading");
    getWorkOrderCosts(workOrderId)
      .then((data) => {
        if (cancelled) return;
        setCosts(data);
        setCostsStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setCostsStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [propertyId, workOrderId]);

  async function applyStatus(nextStatus) {
    const updated = await statusSave.run(() => updateWorkOrder(workOrderId, { status: nextStatus }));
    if (updated) setWorkOrder(updated);
  }

  // Same immediate-commit pattern as applyStatus: fires only on an actual
  // selection change, never on mount/render, so an already-inactive
  // assigned Vendor is never silently re-submitted and rejected.
  async function applyVendor(nextVendorId) {
    const updated = await vendorSave.run(() => updateWorkOrder(workOrderId, { vendorId: nextVendorId }));
    if (updated) setWorkOrder(updated);
  }

  // Complete/Reopen also change `status`, but are tracked through their own
  // save-state (actionSave), never statusSave — they're explicit lifecycle
  // actions with their own "Saving…" button label, not the inline Status
  // picker, and must never trigger that picker's contextual "Saved".
  async function applyAction(nextStatus) {
    const updated = await actionSave.run(() => updateWorkOrder(workOrderId, { status: nextStatus }));
    if (updated) setWorkOrder(updated);
  }

  function startEditingDescription() {
    descriptionSave.reset();
    setDescriptionDraft(workOrder.description ?? "");
    setEditingDescription(true);
  }

  function cancelEditingDescription() {
    descriptionSave.reset();
    setEditingDescription(false);
  }

  async function saveDescription() {
    const updated = await descriptionSave.run(() =>
      updateWorkOrder(workOrderId, { description: descriptionDraft.trim() || null })
    );
    if (updated) {
      setWorkOrder(updated);
      setEditingDescription(false);
    }
  }

  async function handleAddCost(e) {
    e.preventDefault();
    if (submittingCost) return;

    const amount = Number(costAmount);
    if (!costAmount || !Number.isFinite(amount) || amount < 0) {
      setCostError("Enter a valid, non-negative amount.");
      return;
    }
    if (!costDate) {
      setCostError("Cost date is required.");
      return;
    }

    setSubmittingCost(true);
    setCostError(null);
    try {
      const created = await createWorkOrderCost(workOrderId, {
        type: costType,
        amount,
        note: costNote.trim() || undefined,
        costDate,
        vendorId: costType === "vendor" ? costVendorId ?? undefined : undefined,
      });
      setCosts((prev) => [...prev, created]);
      setWorkOrder((prev) => (prev ? { ...prev, totalCost: prev.totalCost + created.amount } : prev));
      setCostAmount("");
      setCostNote("");
      setCostVendorId(null);
      setCostDate(new Date().toISOString().slice(0, 10));
      setCostFormOpen(false);
    } catch (err) {
      setCostError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmittingCost(false);
    }
  }

  async function handleAddNote(e) {
    e.preventDefault();
    if (submittingNote || !composerValue.trim()) return;
    setSubmittingNote(true);
    setNoteError(null);
    try {
      const created = await createWorkOrderNote(workOrderId, composerValue.trim());
      setNotes((prev) => [...prev, created]);
      setComposerValue("");
    } catch (err) {
      setNoteError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmittingNote(false);
    }
  }

  // Active Vendors are always offered; an already-assigned Vendor that has
  // since gone inactive stays visible too (so its current assignment is
  // never hidden), it just isn't offered as a NEW choice for anyone else —
  // mirrors resolveVendorId's server-side "reject inactive for new
  // assignment, never touch existing references" rule.
  const assignedVendor = workOrder?.vendors?.[0] ?? null;
  const vendorOptions = useMemo(() => {
    const options = [{ value: null, label: "No vendor", sublabel: null }];
    const seen = new Set();
    for (const v of vendors) {
      if (v.status !== "active") continue;
      options.push({ value: v.id, label: v.name, sublabel: v.category || null });
      seen.add(v.id);
    }
    if (assignedVendor && !seen.has(assignedVendor.id)) {
      options.push({ value: assignedVendor.id, label: `${assignedVendor.name} (inactive)`, sublabel: null });
    }
    return options;
  }, [vendors, assignedVendor]);

  if (workOrderStatus === "loading") return <SectionSpinner />;

  if (workOrderStatus === "not-found") {
    return (
      <div className="mx-auto max-w-5xl">
        <BackLink to={backTo} state={backTabState} label={backLabel} />
        <EmptyState
          icon={IconWrench}
          title="Work order not found"
          description="This work order may have been removed, or the link is out of date."
        />
      </div>
    );
  }

  if (workOrderStatus === "error") {
    return (
      <div className="mx-auto max-w-5xl">
        <BackLink to={backTo} state={backTabState} label={backLabel} />
        <EmptyState
          icon={IconAlertTriangle}
          title="Couldn't load this work order"
          description={workOrderError || "Something went wrong. Please try again."}
        />
      </div>
    );
  }

  const locationsReady = locationsStatus === "ready";
  const assetsReady = assetsStatus === "ready";
  const { locationLabel, assetLabel } =
    locationsReady && assetsReady ? resolveWorkOrderContext(workOrder, locations, assets) : { locationLabel: "…", assetLabel: "…" };
  const leafLocationName = locationLabel && locationLabel !== "…" ? locationLabel.split(" › ").pop() : locationLabel;

  const overdue = isOverdue(workOrder);
  const createdAt = new Date(workOrder.createdAt);
  const isCompleted = workOrder.status === "completed";

  // REPORTED is a stable historical fact (time-since-created, always
  // relative to now) — distinct from the resolution-time calculation used
  // for completed work orders below.
  const reportedAgo = formatAge(new Date() - createdAt);
  const resolutionEndTime = isCompleted && workOrder.completedAt ? new Date(workOrder.completedAt) : new Date();
  const resolutionAge = formatAge(resolutionEndTime - createdAt);

  const needsAttentionNow = computeNeedsAttention(workOrder);
  const attentionParts = [];
  if (workOrder.priority === "urgent" && !isCompleted) attentionParts.push("Urgent");
  if (overdue) attentionParts.push(`Overdue by ${formatOverdueBy(workOrder.dueDate)}`);

  return (
    <div className="mx-auto max-w-5xl">
      <BackLink to={backTo} state={backTabState} label={backLabel} />

      {/* SITUATION HEADER — what is wrong, where, how serious, what state */}
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">{workOrder.title}</h1>
        <p className="mt-1.5 text-base text-gray-500">{locationLabel ?? "Property-level"}</p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
              priorityBadge[workOrder.priority] || "bg-gray-50 text-gray-500"
            }`}
          >
            {workOrder.priority}
          </span>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
              statusBadge[workOrder.status] || "bg-gray-50 text-gray-500"
            }`}
          >
            {statusLabel[workOrder.status] || workOrder.status}
          </span>
          {overdue && (
            <span className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-red-600 ring-1 ring-inset ring-red-100">
              Overdue
            </span>
          )}
        </div>
      </div>

      {/* ATTENTION — only for work orders that actually need it, derived
          entirely from real data (priority + dueDate), never decorative. */}
      {needsAttentionNow && (
        <div className="mb-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Attention</p>
          <p className="mt-1 text-sm font-medium text-red-900">{attentionParts.join(" · ")}</p>
          <p className="text-xs text-red-700/80">
            Reported {reportedAgo} ago{workOrder.dueDate ? ` · Due ${formatDueDate(workOrder.dueDate)}` : ""}
          </p>
        </div>
      )}

      {/* OPERATIONAL WORKSPACE — main content wider than the context/action sidebar */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Description</h2>
              {!editingDescription && (
                <button
                  type="button"
                  onClick={startEditingDescription}
                  className="text-xs font-medium text-gray-500 transition hover:text-gray-900"
                >
                  Edit
                </button>
              )}
            </div>

            {!editingDescription ? (
              <p className="mt-2 whitespace-pre-wrap text-base leading-relaxed text-gray-700">
                {workOrder.description || <span className="text-gray-400">No description provided</span>}
              </p>
            ) : (
              <div className="mt-2">
                <textarea
                  autoFocus
                  value={descriptionDraft}
                  onChange={(e) => setDescriptionDraft(e.target.value)}
                  placeholder="Describe the issue or work..."
                  rows={4}
                  className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {descriptionSave.phase === "saving" && <span className="text-xs text-gray-400">Saving…</span>}
                    {descriptionSave.phase === "saved" && (
                      <span className="text-xs font-medium text-emerald-600">Saved</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={descriptionSave.phase === "saving"}
                      onClick={cancelEditingDescription}
                      className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-500 transition hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={descriptionSave.phase === "saving"}
                      onClick={saveDescription}
                      className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {descriptionSave.phase === "saving" ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
                {descriptionSave.phase === "error" && (
                  <p className="mt-1.5 text-xs text-red-600">{descriptionSave.error}</p>
                )}
              </div>
            )}
          </div>

          {/* UPDATES — append-only chronological findings, communication, and
              work performed, distinct from Description (the editable
              current best summary of the issue/work) above. Deliberately
              not called "Activity", since Notes are the only entry type
              this supports today; calling it Activity would imply status
              changes/photos/etc. are already tracked here. Kept as a plain
              flowing list (no outer card) rather than boxing it like
              Description — visually reinforces that Updates is a running
              history you add to, never edit, while Description is a single
              current snapshot you keep up to date. */}
          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Updates</h2>

            {notesStatus === "loading" && <p className="text-sm text-gray-400">Loading updates…</p>}

            {notesStatus === "error" && (
              <p className="mb-3 text-sm text-red-600">Couldn't load updates. Please try again.</p>
            )}

            {notesStatus === "ready" && notes.length > 0 && (
              <div className="space-y-4">
                {notes.map((note) => (
                  <div key={note.id} className="border-t border-gray-100 pt-3 first:border-t-0 first:pt-0">
                    <p className="text-xs text-gray-500">
                      <span className="font-medium text-gray-700">{note.author?.name ?? "Unknown"}</span>
                      {" · "}
                      {formatNoteTimestamp(note.createdAt)}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{note.body}</p>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleAddNote} className="mt-4">
              <textarea
                value={composerValue}
                onChange={(e) => setComposerValue(e.target.value)}
                placeholder="Add update..."
                rows={2}
                className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
              />
              {noteError && <p className="mt-1.5 text-sm text-red-600">{noteError}</p>}
              <div className="mt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={submittingNote || !composerValue.trim()}
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submittingNote ? "Saving…" : "Add Update"}
                </button>
              </div>
            </form>
          </div>

          {/* COSTS — available regardless of status, including completed:
              completion and financial reconciliation are related but
              separate concerns (invoices/internal labor legitimately land
              after the work itself is done). Total is always the sum of
              real entries, never a separately-entered number. */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Costs</h2>
              <span className="text-sm font-semibold text-gray-900">{formatMoney(workOrder.totalCost ?? 0)}</span>
            </div>

            {costsStatus === "loading" && <p className="text-sm text-gray-400">Loading costs…</p>}
            {costsStatus === "error" && <p className="mb-3 text-sm text-red-600">Couldn't load costs. Please try again.</p>}

            {costsStatus === "ready" && costs.length > 0 && (
              <div className="mb-3 divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
                {costs.map((entry) => (
                  <div key={entry.id} className="flex items-start justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{costTypeLabel[entry.type] || entry.type}</p>
                      {entry.note && <p className="text-xs text-gray-500">{entry.note}</p>}
                      <p className="text-xs text-gray-400">
                        {formatDueDate(entry.costDate)} · {entry.createdBy?.name ?? "Unknown"}
                        {entry.vendor && ` · ${entry.vendor.name}`}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-medium text-gray-900">{formatMoney(entry.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {costsStatus === "ready" && costs.length === 0 && !costFormOpen && (
              <p className="mb-3 text-sm text-gray-400">No costs recorded yet.</p>
            )}

            {!costFormOpen ? (
              <button
                type="button"
                onClick={() => setCostFormOpen(true)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Add Cost
              </button>
            ) : (
              <form onSubmit={handleAddCost} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-wrap gap-1.5">
                  {COST_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => {
                        setCostType(t.value);
                        // A nice default, not a rule: picking "Vendor" the
                        // first time offers the Work Order's already-
                        // assigned Vendor, since that's who most likely
                        // received this money — freely overridable below.
                        if (t.value === "vendor" && !costVendorId && assignedVendor) {
                          setCostVendorId(assignedVendor.id);
                        }
                      }}
                      className={`rounded-lg px-2.5 py-1.5 text-sm font-medium transition ${
                        costType === t.value ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {costType === "vendor" && (
                  <div className="mt-3">
                    <SearchableSelect
                      value={costVendorId}
                      onChange={setCostVendorId}
                      options={vendorOptions}
                      placeholder="Which vendor received this? (optional)"
                    />
                  </div>
                )}
                <div className="mt-3 flex gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={costAmount}
                    onChange={(e) => setCostAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-28 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
                  />
                  <input
                    type="date"
                    value={costDate}
                    onChange={(e) => setCostDate(e.target.value)}
                    className="w-40 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
                  />
                </div>
                <div className="mt-2">
                  <input
                    type="text"
                    value={costNote}
                    onChange={(e) => setCostNote(e.target.value)}
                    placeholder="Note (optional)"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
                  />
                </div>
                {costError && <p className="mt-1.5 text-sm text-red-600">{costError}</p>}
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCostFormOpen(false);
                      setCostError(null);
                    }}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-500 transition hover:text-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingCost}
                    className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submittingCost ? "Saving…" : "Save Cost"}
                  </button>
                </div>
              </form>
            )}
          </div>

          <EntityDocuments attachment={{ workOrderId }} />
        </div>

        <div className="space-y-6">
          <SidebarSection title="Status">
            {!isCompleted ? (
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex flex-wrap rounded-lg border border-gray-200 bg-gray-50 p-1">
                  {ACTIVE_WORK_ORDER_STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={statusSave.phase === "saving" || actionSave.phase === "saving"}
                      onClick={() => applyStatus(s)}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        workOrder.status === s ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {statusLabel[s]}
                    </button>
                  ))}
                </div>
                {statusSave.phase === "saving" && <span className="text-xs text-gray-400">Saving…</span>}
                {statusSave.phase === "saved" && <span className="text-xs font-medium text-emerald-600">Saved</span>}
              </div>
            ) : (
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-inset ring-emerald-100">
                Completed
              </span>
            )}
            {statusSave.phase === "error" && <p className="mt-1.5 text-xs text-red-600">{statusSave.error}</p>}
          </SidebarSection>

          <SidebarSection title="Location">
            <p className="text-sm text-gray-900">{leafLocationName ?? "Property-level"}</p>
          </SidebarSection>

          <SidebarSection title="Asset">
            {workOrder.assetId ? (
              <Link
                to={`/portfolio/${propertyId}/assets/${workOrder.assetId}`}
                // This Work Order's OWN return-to-origin triple travels
                // along as the payload, opaque to Asset Detail — so when
                // its Back link returns here, this page remounts with its
                // real original origin intact instead of losing it to a
                // fallback.
                state={{
                  backLabel: "Work Order",
                  backTo: `/portfolio/${propertyId}/work-orders/${workOrderId}`,
                  backTabState: { backLabel, backTo, backTabState },
                }}
                className="text-sm font-medium text-blue-600 hover:underline"
              >
                {assetLabel}
              </Link>
            ) : (
              <p className="text-sm text-gray-400">No asset linked</p>
            )}
          </SidebarSection>

          <SidebarSection title="Vendor">
            <SearchableSelect
              value={assignedVendor?.id ?? null}
              onChange={applyVendor}
              options={vendorOptions}
              placeholder="No vendor assigned"
              disabled={vendorSave.phase === "saving"}
            />
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {vendorSave.phase === "saving" && <span className="text-xs text-gray-400">Saving…</span>}
              {vendorSave.phase === "saved" && <span className="text-xs font-medium text-emerald-600">Saved</span>}
              {assignedVendor && (
                <Link
                  to={`/vendors/${assignedVendor.id}`}
                  // Same nested-return-to-origin trick as the Asset link
                  // above — Vendor Detail's own Back returns here with this
                  // page's real original origin intact.
                  state={{
                    backLabel: "Work Order",
                    backTo: `/portfolio/${propertyId}/work-orders/${workOrderId}`,
                    backTabState: { backLabel, backTo, backTabState },
                  }}
                  className="text-xs font-medium text-blue-600 hover:underline"
                >
                  View Vendor →
                </Link>
              )}
            </div>
            {vendorSave.phase === "error" && <p className="mt-1.5 text-xs text-red-600">{vendorSave.error}</p>}
          </SidebarSection>

          {(workOrder.category || workOrder.workType) && (
            <SidebarSection title="Category">
              <p className="text-sm text-gray-900">{categoryLabel[workOrder.category] || workOrder.category}</p>
              {workOrder.workType && <p className="text-xs text-gray-500">{workOrder.workType.label}</p>}
            </SidebarSection>
          )}

          <SidebarSection title="Timing">
            <p className="text-sm text-gray-700">Reported {reportedAgo} ago</p>
            <p className={`text-sm ${overdue ? "font-medium text-red-600" : "text-gray-700"}`}>
              {workOrder.dueDate ? `Due ${formatDueDate(workOrder.dueDate)}` : "No due date"}
            </p>
            {overdue && <p className="text-xs font-medium text-red-600">Overdue</p>}
          </SidebarSection>

          <SidebarSection title="Action">
            {!isCompleted ? (
              <button
                type="button"
                disabled={actionSave.phase === "saving" || statusSave.phase === "saving"}
                onClick={() => applyAction("completed")}
                className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {actionSave.phase === "saving" ? "Saving…" : "Complete Work Order"}
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-gray-500">Resolved in {resolutionAge}</p>
                <button
                  type="button"
                  disabled={actionSave.phase === "saving" || statusSave.phase === "saving"}
                  onClick={() => applyAction("open")}
                  className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {actionSave.phase === "saving" ? "Saving…" : "Reopen"}
                </button>
              </div>
            )}
            {actionSave.phase === "error" && <p className="mt-1.5 text-xs text-red-600">{actionSave.error}</p>}
          </SidebarSection>
        </div>
      </div>
    </div>
  );
}
