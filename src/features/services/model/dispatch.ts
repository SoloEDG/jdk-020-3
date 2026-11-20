import type { Shift, ServiceKind } from "../../../shared/types";
import { copyShift, record } from "../../../shared/document";
import { serviceBlockReason } from "../lib/eligibility";
import { serviceCatalog } from "./catalog";
import { grantLane, startJourney } from "../../../shared/lane";
import { riskBand, riskText } from "../../../shared/config";

export function dispatchService(
  state: Shift,
  flightId: string,
  kind: ServiceKind,
  vehicleId: string,
): Shift {
  const s = copyShift(state),
    reason = serviceBlockReason(s, flightId, kind),
    v = s.vehicles.find((x) => x.id === vehicleId),
    f = s.flights.find((x) => x.id === flightId),
    stand = s.stands.find((x) => x.id === f?.standId),
    task = s.services.find((x) => x.flightId === flightId && x.kind === kind);
  if (
    reason ||
    !v ||
    v.status !== "idle" ||
    v.kind !== kind ||
    v.jobId !== undefined ||
    !stand ||
    !task
  ) {
    s.conflicts++;
    s.score = Math.max(0, s.score - 10);
    record(s, reason ?? "车辆不可用或车辆类型不匹配", "warning");
    return s;
  }
  const handover =
    task.status === "interrupted" ? task.handover === true : true;
  if (task.status === "interrupted" && !handover) {
    // 行驶系故障：成果不可交接，必须回到起点重新作业。
    task.progress = 0;
    record(
      s,
      `${flightId} ${serviceCatalog[kind].label}：前车行驶系故障，成果不可交接，进度归零`,
      "warning",
    );
  } else if (task.status === "interrupted") {
    record(
      s,
      `${flightId} ${serviceCatalog[kind].label}：接续前车已完成的 ${Math.round(task.progress)}% 成果`,
      "info",
    );
  }
  task.status = "travel";
  task.vehicleId = v.id;
  task.handover = undefined;
  task.completion = undefined;
  v.serviceId = task.id;
  v.jobId = undefined;
  startJourney(s, v, "service", { x: stand.x + 42, y: stand.y + 22 });
  grantLane(s);
  const band = riskBand(v.wear);
  const risky = band.level === "high" || band.level === "critical";
  record(
    s,
    `${v.id} → ${flightId} · ${serviceCatalog[kind].label}${
      risky
        ? ` · 磨损风险 ${riskText(v.wear)}（仅区间）`
        : ""
    }`,
    risky ? "warning" : "info",
  );
  return s;
}
