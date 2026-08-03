export function getCurrentUser(req, res) {
  res.json({
    ...req.user.toJSON(),
    companies: req.memberships.map((m) => ({
      id: m.company.id,
      name: m.company.name,
      role: m.role,
    })),
  });
}
