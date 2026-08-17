// Shared by PropertyDetail's Work Orders table and the Work Order detail
// page, so age/overdue logic lives in exactly one place.

export function formatAge(ms) {
  const minutes = Math.floor(Math.max(ms, 0) / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

// Only ever true when dueDate actually exists and has actually passed while
// the work order is still incomplete — never inferred or assumed.
export function isOverdue(workOrder) {
  if (!workOrder.dueDate || workOrder.status === "completed") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${workOrder.dueDate}T00:00:00`);
  return due < today;
}
