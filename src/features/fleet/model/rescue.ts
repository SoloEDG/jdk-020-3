import type { Shift, Vehicle } from "../../../shared/types";
import { bayPoint, riskText } from "../../../shared/config";
import { copyShift, record } from "../../../shared/document";
import {
  grantLane,
  requestPriorityLane,
  startJourney,
} from "../../../shared/lane";
import { createJob, jobOfVehicle, tryActivateJobs } from "../../maintenance/model/jobs";

function idleTow(s: Shift): Vehicle | undefined {
  return s.vehicles.find(
    (v) => v.kind === "tow" && v.status === "idle" && !v.towTargetId,
  );
}

/**
 * 拖救：行驶系故障必须由拖救车移走。目标位置是故障发生时保留的真实位置。
 * 工位可能还没空出来，但故障车不能因此永远堵在通道上：拖救车把它带到
 * 维修区外的待置位（拖救车的 home），工位一空再入位。
 */
export function callTow(state: Shift, vehicleId: string): Shift {
  const s = copyShift(state);
  const target = s.vehicles.find((v) => v.id === vehicleId);
  if (!target?.failure) return state;
  if (!target.failure.stranded)
    return record(s, `${target.id} 可自行低速驶入工位，无需拖救`, "info"), s;
  if (target.failure.towRequested)
    return record(s, `${target.id} 已有拖救任务在途`, "info"), s;
  const tow = idleTow(s);
  if (!tow) {
    s.conflicts++;
    s.score = Math.max(0, s.score - 5);
    record(s, "拖救车不可用：当前拖救任务尚未结束", "warning");
    return s;
  }
  const job = jobOfVehicle(s, target.id);
  target.failure.towRequested = true;
  tow.towTargetId = target.id;
  startJourney(s, tow, "tow", target.failure.position);
  // 通道被阻断时只有前往该车的拖救车能获得通行位。
  requestPriorityLane(s, tow, `${target.id} 途中故障，拖救优先`);
  grantLane(s);
  record(
    s,
    `${tow.id} 出动拖救 ${target.id} · 故障位置 (${Math.round(target.failure.position.x)}, ${Math.round(target.failure.position.y)})${job?.bayId ? ` → ${job.bayId}` : " · 工位已满，先拖离通道待置位"}`,
    "warning",
  );
  void job;
  return s;
}

/** 设备故障：可自行低速驶入已预留的维修工位。 */
export function selfRecover(state: Shift, vehicleId: string): Shift {
  const s = copyShift(state);
  const v = s.vehicles.find((x) => x.id === vehicleId);
  if (!v?.failure) return state;
  if (v.failure.stranded)
    return record(s, `${v.id} 行驶系损坏，必须由拖救车移动`, "warning"), s;
  if (v.status !== "failed")
    return record(s, `${v.id} 已在处置中`, "info"), s;
  const job = jobOfVehicle(s, v.id);
  if (!job?.bayId)
    return record(s, "暂无空闲维修工位，故障车继续在原地等待", "warning"), s;
  record(s, `${v.id} 设备故障，低速自行驶往 ${job.bayId}`, "info");
  // 设备故障车也会占着通道，驶离时由通行权与阻断状态一起恢复。
  if (s.lane.blockedBy === v.id) s.lane.blockedBy = undefined;
  startJourney(s, v, "selfToBay", bayPoint(job.bayId));
  grantLane(s);
  return s;
}

/** 预防检修：在风险变高之前主动占用工位与备用件。 */
export function requestPreventive(state: Shift, vehicleId: string): Shift {
  const s = copyShift(state);
  const v = s.vehicles.find((x) => x.id === vehicleId);
  if (!v) return state;
  if (v.kind === "tow" || v.kind === "repair")
    return record(s, "拖救车与机务车不进入预防检修队列", "warning"), s;
  if (v.status !== "idle" || v.jobId)
    return record(s, `${v.id} 当前不可安排预防检修`, "warning"), s;
  if (jobOfVehicle(s, v.id))
    return record(s, `${v.id} 已有维修任务`, "warning"), s;
  if (s.maintenance.spares <= 0)
    return record(s, "备用件不足，无法安排预防检修", "warning"), s;
  createJob(s, v, "preventive");
  const job = jobOfVehicle(s, v.id);
  record(
    s,
    `${v.id} 已排入预防检修${job?.bayId ? ` · 工位 ${job.bayId}` : " · 等待工位"} · 风险 ${riskText(v.wear)}`,
    "info",
  );
  tryActivateJobs(s);
  return s;
}
