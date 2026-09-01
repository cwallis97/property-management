// Small, composable fixture-creation helpers — not a fixture "framework."
// Every suite still assembles its own scenario explicitly (which
// memberships, which roles, which Property Access grants); these just
// remove the boilerplate of the Sequelize.create() calls themselves.
// Fixture names are always obviously synthetic (QA-prefixed) — never
// anything resembling real customer data.
import { randomUUID } from "crypto";
import { User, Company, Membership, Property, WorkOrder, Location, Asset, WorkOrderCostEntry, WorkType } from "../../models/index.js";

export async function createCompany(name = "QA Company") {
  return Company.create({ name: `${name} ${randomUUID().slice(0, 8)}` });
}

export async function createUser(displayName = "QA User") {
  const suffix = randomUUID();
  return User.create({
    firebaseUid: `qa_${suffix}`,
    email: `qa-${suffix}@example.test`,
    displayName,
  });
}

// Attaches `.company` onto the returned row — requireAuth normally
// eager-loads this onto every real req.memberships row (see
// authMiddleware.js), and several controllers/helpers (getRoleForCompany,
// resolveActor, etc.) read membership.company directly. Hand-built
// fixtures need to match that shape or they'd pass in production but fail
// in these tests for an unrelated reason.
export async function createMembership({ user, company, role = "owner", accessMode = "all" }) {
  const membership = await Membership.create({ userId: user.id, companyId: company.id, role, accessMode });
  membership.company = company;
  return membership;
}

export async function createProperty({ company, name = "QA Property" }) {
  return Property.create({ companyId: company.id, name: `${name} ${randomUUID().slice(0, 8)}` });
}

export async function createWorkOrder({ property, title = "QA Work Order", ...overrides }) {
  return WorkOrder.create({
    propertyId: property.id,
    title: `${title} ${randomUUID().slice(0, 8)}`,
    status: "open",
    priority: "medium",
    ...overrides,
  });
}

// Deliberately no cleanup.js changes needed for these: locations.property_id
// and assets.property_id are both real DB-level ON DELETE CASCADE (see
// their migrations) — cleanupCompanies already destroys every Work Order
// before the Property itself, so Property.destroy() alone removes any
// Location/Asset fixtures created through these helpers.
export async function createLocation({ property, name = "QA Location", type = "unit", ...overrides }) {
  return Location.create({ propertyId: property.id, name: `${name} ${randomUUID().slice(0, 8)}`, type, ...overrides });
}

export async function createAsset({ property, name = "QA Asset", ...overrides }) {
  return Asset.create({ propertyId: property.id, name: `${name} ${randomUUID().slice(0, 8)}`, ...overrides });
}

export async function createCostEntry({ workOrder, amount, type = "labor", costDate = "2026-01-01", ...overrides }) {
  return WorkOrderCostEntry.create({ workOrderId: workOrder.id, type, amount, costDate, ...overrides });
}

// System/global Work Types (companyId: null) are visible to every company —
// matches how WorkType actually works today (see WorkType.js), so a fixture
// Work Type never needs to be scoped to a particular QA Company.
export async function createWorkType({ category = "water", key = "line_repair", label = "QA Line Repair", ...overrides } = {}) {
  const suffix = randomUUID().slice(0, 8);
  return WorkType.create({ category, key: `${key}_${suffix}`, label: `${label} ${suffix}`, ...overrides });
}
