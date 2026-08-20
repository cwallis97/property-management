import { Company } from "../models/index.js";
import { CAPABILITIES, requireCapability } from "../authorization/capabilities.js";

export function listMyCompanies(req, res) {
  const companies = req.memberships.map((m) => ({
    id: m.company.id,
    name: m.company.name,
    role: m.role,
  }));
  res.json(companies);
}

// The only editable Company field today is `name` — see the Organization
// Settings audit for why nothing else (logo, timezone, etc.) belongs here
// yet. Reuses `settings.access` rather than introducing a dedicated
// capability: that's the exact Admin/Owner-only boundary this already is,
// and a single-field endpoint doesn't justify a new one.
export async function updateCompany(req, res) {
  const { id } = req.params;

  // Ownership is verified before authorization, same order every other
  // controller in this app uses — a company id belonging to someone else
  // entirely 404s rather than 403ing, so its existence is never confirmed
  // to a caller who isn't even a member. req.companyIds is always
  // server-derived from the caller's own Memberships, never the client.
  if (!req.companyIds.includes(id)) {
    return res.status(404).json({ error: "Company not found." });
  }

  if (!requireCapability(req, res, id, CAPABILITIES.SETTINGS_ACCESS)) return;

  const { name } = req.body;
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) {
    return res.status(400).json({ error: "name is required." });
  }

  const company = await Company.findByPk(id);
  if (!company) return res.status(404).json({ error: "Company not found." });

  company.name = trimmed;
  await company.save();

  res.json({ id: company.id, name: company.name });
}
