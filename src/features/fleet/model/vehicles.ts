import type { Shift, Vehicle, VehicleKind } from "../../../shared/types";

interface Blueprint {
  id: string;
  kind: VehicleKind;
  wear: { travel: number; work: number };
}

const blueprints: Blueprint[] = [
  { id: "FL-01", kind: "fuel", wear: { travel: 41, work: 58 } },
  { id: "FL-02", kind: "fuel", wear: { travel: 12, work: 24 } },
  { id: "BG-01", kind: "baggage", wear: { travel: 33, work: 31 } },
  { id: "BG-02", kind: "baggage", wear: { travel: 68, work: 49 } },
  { id: "CL-01", kind: "clean", wear: { travel: 19, work: 37 } },
  { id: "CL-02", kind: "clean", wear: { travel: 8, work: 14 } },
  { id: "TW-01", kind: "tow", wear: { travel: 16, work: 0 } },
  { id: "MX-01", kind: "repair", wear: { travel: 11, work: 0 } },
  { id: "MX-02", kind: "repair", wear: { travel: 9, work: 0 } },
];

export function initialVehicles(): Vehicle[] {
  return blueprints.map((bp, index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const position = {
      x: 797 + column * 36,
      y: 472 + row * 26,
    };
    return {
      id: bp.id,
      kind: bp.kind,
      status: "idle",
      position: { ...position },
      origin: { ...position },
      target: { ...position },
      home: { ...position },
      progress: 0,
      tripDuration: 10,
      wear: { ...bp.wear },
    };
  });
}

export function selectVehicle(state: Shift, id: string): Shift {
  return { ...state, selectedVehicleId: id };
}
