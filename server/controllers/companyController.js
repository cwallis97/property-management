export function listMyCompanies(req, res) {
  const companies = req.memberships.map((m) => ({
    id: m.company.id,
    name: m.company.name,
    role: m.role,
  }));
  res.json(companies);
}
