import type { Maintenance } from "../../../shared/types";
import { MAINTENANCE } from "../../../shared/config";

export function initialMaintenance(): Maintenance {
  return {
    spares: MAINTENANCE.initialSpares,
    drawn: 0,
    restocked: 0,
    completedJobs: 0,
    nextRestock: MAINTENANCE.restockEvery,
    bays: MAINTENANCE.bays.map((_, i) => ({ id: `MH-${i + 1}` })),
    jobs: [],
  };
}
