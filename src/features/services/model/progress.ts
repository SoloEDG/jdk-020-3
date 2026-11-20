import type { Shift } from "../../../shared/types";
import { copyShift, record } from "../../../shared/document";
import { serviceCatalog } from "./catalog";
import { sendHome } from "../../../shared/lane";

export function advanceServices(state: Shift, seconds: number): Shift {
  const s = copyShift(state);
  for (const task of s.services) {
    if (task.status !== "working") continue;
    const v = s.vehicles.find((x) => x.id === task.vehicleId);
    // 只有仍在现场作业的车辆可以推进进度；故障或换位不会伪造完成。
    if (!v || v.status !== "working" || v.serviceId !== task.id) continue;
    task.progress = Math.min(
      100,
      task.progress + (seconds / Math.max(0.2, task.duration)) * 100,
    );
    if (task.progress < 100) continue;
    task.status = "done";
    task.completion = { at: s.time, vehicleId: v.id };
    task.handover = undefined;
    v.status = "returning";
    v.serviceId = undefined;
    v.progress = 0;
    record(
      s,
      `${task.flightId} ${serviceCatalog[task.kind].label}完成 · ${v.id} 回收`,
      "success",
    );
    sendHome(s, v);
  }
  return s;
}
