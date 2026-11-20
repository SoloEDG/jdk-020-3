import type { VehicleKind } from "../../../shared/types";

export const vehicleLabels: Record<VehicleKind, string> = {
  fuel: "加油车",
  baggage: "行李车",
  clean: "清洁车",
  tow: "拖救车",
  repair: "机务维修车",
};

export const vehicleColors: Record<VehicleKind, string> = {
  fuel: "#e5a84e",
  baggage: "#529e9b",
  clean: "#7e8eb1",
  tow: "#c66a4c",
  repair: "#8b7cae",
};


