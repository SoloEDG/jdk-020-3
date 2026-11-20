import type { Shift } from "../../../shared/types";
import { copyShift } from "../../../shared/document";
import { initialFlights } from "../../flights";
import { initialStands } from "../../apron";
import { initialServices } from "../../services";
import { initialVehicles } from "../../fleet";
import { initialMaintenance } from "../../maintenance";
import { MAINTENANCE } from "../../../shared/config";

export function createShift(): Shift {
  const flights = initialFlights();
  return {
    version: 2,
    time: 0,
    paused: false,
    speed: 1,
    score: 0,
    conflicts: 0,
    rng: 0x9e3779b9,
    flights,
    stands: initialStands(),
    services: initialServices(flights),
    vehicles: initialVehicles(),
    events: [
      {
        id: 0,
        time: 0,
        text: "早班开始 · 3 架航班等待机位 · 维修工位 2 个可用",
        tone: "info",
      },
    ],
    lane: { permits: [], queue: [] },
    maintenance: initialMaintenance(),
    nextJobId: 1,
    selectedFlightId: "MU2451",
    nextEventId: 1,
  };
}

export { MAINTENANCE };
export { copyShift };
