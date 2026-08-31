// Small, composable fixture-creation helpers — not a fixture "framework."
// Every suite still assembles its own scenario explicitly (which
// memberships, which roles, which Property Access grants); these just
// remove the boilerplate of the Sequelize.create() calls themselves.
// Fixture names are always obviously synthetic (QA-prefixed) — never
// anything resembling real customer data.
import { randomUUID } from "crypto";
import { User, Company, Membership, Property, WorkOrder } from "../../models/index.js";

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
