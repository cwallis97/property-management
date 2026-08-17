export const metrics = [
  {
    key: "properties",
    label: "Properties",
    value: "24",
    delta: "+2 this month",
    trend: "up",
  },
  {
    key: "assets",
    label: "Assets",
    value: "1,284",
    delta: "+38 this month",
    trend: "up",
  },
  {
    key: "workOrders",
    label: "Open Work Orders",
    value: "17",
    delta: "-4 this week",
    trend: "down",
  },
  {
    key: "criticalAssets",
    label: "Critical Assets",
    value: "5",
    delta: "Needs attention",
    trend: "alert",
  },
];

export const recentActivity = [
  {
    id: 1,
    title: "Work order #482 marked complete",
    subtitle: "HVAC service — Maple Ridge Apartments, Unit 204",
    time: "2 hours ago",
    type: "workOrder",
  },
  {
    id: 2,
    title: "New vendor added",
    subtitle: "Apex Plumbing Co.",
    time: "5 hours ago",
    type: "vendor",
  },
  {
    id: 3,
    title: "Lease document uploaded",
    subtitle: "Riverside Commons — Building B",
    time: "Yesterday",
    type: "document",
  },
  {
    id: 4,
    title: "Asset flagged critical",
    subtitle: "Rooftop Chiller Unit 3 — Harbor Point Plaza",
    time: "Yesterday",
    type: "asset",
  },
  {
    id: 5,
    title: "New work order created",
    subtitle: "Elevator inspection — Summit Tower",
    time: "2 days ago",
    type: "workOrder",
  },
];

export const criticalAssets = [
  { id: 1, name: "Rooftop Chiller Unit 3", property: "Harbor Point Plaza", severity: "high" },
  { id: 2, name: "Fire Panel A", property: "Riverside Commons", severity: "high" },
  { id: 3, name: "Boiler #2", property: "Maple Ridge Apartments", severity: "medium" },
  { id: 4, name: "Backup Generator", property: "Summit Tower", severity: "medium" },
  { id: 5, name: "Elevator Motor", property: "Cedar Grove Offices", severity: "medium" },
];
