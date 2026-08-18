// MapPin served its purpose as a technical proof that normalized
// coordinates persist correctly against an uploaded SitePlan. Milestone 7B
// gives WorkOrder its own mapX/mapY, making MapPin a second, disconnected
// way to represent "something happened here" — exactly the duplicate
// spatial record the product principle rules out. Removed so there is only
// one spatial representation for maintenance events: the WorkOrder itself.
export async function up({ context: queryInterface }) {
  await queryInterface.dropTable("map_pins");
}

export async function down({ context: queryInterface }) {
  throw new Error("map_pins was intentionally removed in Milestone 7B and is not meant to be recreated.");
}
