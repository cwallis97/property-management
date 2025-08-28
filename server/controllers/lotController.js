export function getLots(req, res) {
  res.json([
    { id: 1, name: "Lot 1", status: "Needs Repair", cost: 0 },
    { id: 2, name: "Lot 2", status: "Completed", cost: 1200 }
  ]);
}
