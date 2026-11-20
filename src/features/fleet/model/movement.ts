import type { Shift, Vehicle } from "../../../shared/types";
import { bayPoint } from "../../../shared/config";
import { copyShift, record } from "../../../shared/document";
import {
  grantLane,
  holdsPermit,
  releaseLane,
  requestLane,
  sendHome,
} from "../../../shared/lane";
import { accumulateWear, rollFailure, triggerFailure } from "./failure";
import { tryActivateJobs } from "../../maintenance/model/jobs";

/** 车辆是否靠自身动力移动（被拖带不算）。 */
export function isSelfMoving(v: Vehicle): boolean {
  return (
    v.status === "travel" ||
    v.status === "returning" ||
    (v.status === "recovering" && v.journey === "selfToBay")
  );
}

function hop(v: Vehicle, seconds: number): void {
  v.progress = Math.min(
    100,
    v.progress + (seconds / Math.max(0.2, v.tripDuration)) * 100,
  );
  const t = v.progress / 100;
  v.position = {
    x: v.origin.x + (v.target.x - v.origin.x) * t,
    y: v.origin.y + (v.target.y - v.origin.y) * t,
  };
}

function arrive(s: Shift, v: Vehicle): void {
  releaseLane(s, v.id);
  const job =
    s.maintenance.jobs.find((j) => j.id === v.jobId) ??
    s.maintenance.jobs.find((j) => j.vehicleId === v.id);
  switch (v.journey) {
    case "service": {
      v.status = "working";
      v.progress = 0;
      const task = s.services.find((t) => t.id === v.serviceId);
      if (task && task.vehicleId === v.id && task.status === "travel")
        task.status = "working";
      break;
    }
    case "return": {
      v.status = "idle";
      v.serviceId = undefined;
      v.jobId = undefined;
      v.journey = undefined;
      v.progress = 0;
      break;
    }
    case "tow": {
      const target = s.vehicles.find((x) => x.id === v.towTargetId);
      const targetJob = s.maintenance.jobs.find(
        (j) => j.vehicleId === target?.id,
      );
      if (target?.failure && target.status === "failed") {
        target.status = "recovering";
        target.journey = "towToBay";
        target.origin = { ...target.position };
        // 工位未空时先拖到维修区待置位；工位归属仍由维修调度负责。
        target.target = targetJob?.bayId
          ? bayPoint(targetJob.bayId)
          : { ...target.home };
        target.progress = 0;
        target.tripDuration = 10;
        if (s.lane.blockedBy === target.id) s.lane.blockedBy = undefined;
        v.journey = "towToBay";
        v.origin = { ...v.position };
        v.target = { ...target.target };
        v.progress = 0;
        v.tripDuration = 10;
        requestLane(s, v);
        record(
          s,
          `${v.id} 已在真实故障点挂钩 ${target.id}，机坪通道恢复通行`,
          "success",
        );
      } else {
        v.towTargetId = undefined;
        sendHome(s, v);
      }
      break;
    }
    case "towToBay": {
      const target = s.vehicles.find((x) => x.id === v.towTargetId);
      const targetJob = s.maintenance.jobs.find(
        (j) => j.vehicleId === target?.id,
      );
      if (target?.failure) {
        if (targetJob?.bayId) {
          target.position = bayPoint(targetJob.bayId);
          target.status = "maintenance";
          target.currentBayId = targetJob.bayId;
          target.failure.atBay = true;
          record(
            s,
            `${target.id} 已拖抵 ${targetJob.bayId}，等待检修`,
            "info",
          );
        } else {
          // 工位还没空出：先停在维修区待置位，等待入位通知。
          target.position = { ...target.home };
          target.status = "staged";
          target.currentBayId = undefined;
          target.failure.atBay = true;
          record(
            s,
            `${target.id} 已拖离通道，停在维修区待置位（无空闲工位）`,
            "warning",
          );
        }
        target.progress = 0;
        target.journey = undefined;
      }
      v.towTargetId = undefined;
      v.journey = undefined;
      sendHome(s, v);
      tryActivateJobs(s);
      break;
    }
    case "selfToBay": {
      v.status = "maintenance";
      v.currentBayId = job?.bayId;
      v.progress = 0;
      v.journey = undefined;
      record(s, `${v.id} 已驶入 ${job?.bayId ?? "维修工位"}`, "info");
      tryActivateJobs(s);
      break;
    }
    case "repairToBay": {
      v.status = "working";
      v.currentBayId = job?.bayId;
      v.progress = 0;
      tryActivateJobs(s);
      break;
    }
    default: {
      v.status = "idle";
      v.progress = 0;
    }
  }
}

/** 作业中与行驶中一样会积累磨损，并独立判定故障。 */
function workStep(s: Shift, seconds: number): void {
  for (const v of s.vehicles) {
    if (v.status !== "working" || v.failure) continue;
    if (v.kind === "tow" || v.kind === "repair") continue;
    accumulateWear(v, seconds);
    if (!v.jobId && rollFailure(s, v, seconds))
      triggerFailure(s, v, seconds);
  }
}

export function advanceFleet(state: Shift, seconds: number): Shift {
  const s = copyShift(state);
  grantLane(s);
  for (const v of s.vehicles) {
    if (!isSelfMoving(v)) continue;
    // 被拖带车辆的位移在第二遍处理。
    if (v.failure && v.journey === "towToBay") continue;
    if (!holdsPermit(s, v.id)) {
      requestLane(s, v);
      continue;
    }
    // 通道被故障车阻断时，除前往该车的拖救车外一律停驶。
    if (s.lane.blockedBy) {
      const clearing = v.kind === "tow" && v.towTargetId === s.lane.blockedBy;
      if (!clearing) continue;
    }
    accumulateWear(v, seconds);
    if (
      v.kind !== "tow" &&
      v.kind !== "repair" &&
      !v.jobId &&
      rollFailure(s, v, seconds)
    ) {
      triggerFailure(s, v, seconds);
      continue;
    }
    hop(v, seconds);
    if (v.progress >= 100) arrive(s, v);
  }
  workStep(s, seconds);
  // 被拖带车辆跟随拖救车，位置由拖救车决定。
  for (const v of s.vehicles) {
    if (v.failure && v.journey === "towToBay") {
      const tow = s.vehicles.find((x) => x.towTargetId === v.id);
      // 只有拖救车真正在移动时被拖车辆才跟随，排队时保持原位。
      if (tow && tow.journey === "towToBay" && tow.status === "travel") {
        hop(v, seconds);
        v.position = { x: tow.position.x - 22, y: tow.position.y + 14 };
      }
    }
  }
  grantLane(s);
  return s;
}

