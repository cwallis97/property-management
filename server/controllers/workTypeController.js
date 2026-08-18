import { Op } from "sequelize";
import { WorkType } from "../models/index.js";

// Global (company_id null) Work Types are visible to every authenticated
// company; company-owned rows (none exist yet — reserved for a future
// taxonomy-management milestone) would only be visible to that same
// company. Archived Work Types are excluded from this selection list but
// remain fully readable via a Work Order's own workType association —
// archiving only stops a Work Type from being offered for new selections.
export async function listWorkTypes(req, res) {
  const workTypes = await WorkType.findAll({
    where: {
      archivedAt: null,
      [Op.or]: [{ companyId: null }, { companyId: { [Op.in]: req.companyIds } }],
    },
    order: [
      ["category", "ASC"],
      ["label", "ASC"],
    ],
  });
  res.json(workTypes);
}
