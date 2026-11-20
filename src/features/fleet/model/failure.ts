import type { FailureType, Shift, Vehicle } from "../../../shared/types";
import { MAINTENANCE, failureLabel } from "../../../shared/config";
import { record } from "../../../shared/document";
import { releaseLane } from "../../../shared/lane";
import { nextRandom } from "../../../shared/rng";
import { failureChancePerTenSeconds } from "../../../shared/config";
import { createJob } from "../../maintenance/model/jobs";

/** 行驶与作业分开累计磨损。 */
export function accumulateWear(v: Vehicle, seconds: number): void {
  if (v.status === "travel" || v.status === "returning") {
    v.wear.travel = Math.min(
      MAINTENANCE.wearMax,
      v.wear.travel + MAINTENANCE.travelWearPerSecond * seconds,
    );
  } else if (v.status === "working") {
    v.wear.work = Math.min(
      MAINTENANCE.wearMax,
      v.wear.work + MAINTENANCE.workWearPerSecond * seconds,
    );
  }
}

/**
 * 故障判定只使用磨损风险与可复现随机数。
 * 界面只能看到风险区间，永远拿不到具体触发时刻。
 */
export function rollFailure(
  s: Shift,
  v: Vehicle,
  seconds: number,
): boolean {
  const perTen = failureChancePerTenSeconds(v.wear);
  const perSecond = perTen / 10;
  const chance = 1 - Math.pow(1 - perSecond, seconds);
  const [value, seed] = nextRandom(s.rng);
  s.rng = seed;
  return value < chance;
}

function failurePosition(v: Vehicle) {
  return { x: Math.round(v.position.x), y: Math.round(v.position.y) };
}

/**
 * 通道被故障车阻断时收回所有通行位，让车辆原地排队。
 * 否则拖救车可能因为通行位被占满而永远进不去，形成死锁。
 */
function severLane(s: Shift, failedId: string): void {
  const holders = [...s.lane.permits];
  s.lane.permits = [];
  for (const id of holders) {
    if (id === failedId) continue;
    const v = s.vehicles.find((x) => x.id === id);
    if (!v) continue;
    v.status = "waiting";
    v.origin = { ...v.position };
    v.progress = 0;
    if (!s.lane.queue.includes(id)) s.lane.queue.unshift(id);
  }
}

export function triggerFailure(
  s: Shift,
  v: Vehicle,
  seconds: number,
  forcedType?: FailureType,
): void {
  const [typeRoll, seed] = nextRandom(s.rng);
  s.rng = seed;
  const driving = v.status === "travel" || v.status === "returning";
  // 行驶中偏行驶系故障；作业中偏设备故障。forcedType 仅供确定性测试使用。
  const type: FailureType =
    forcedType ??
    (driving
      ? typeRoll < 0.8
        ? "drive"
        : "equipment"
      : typeRoll < 0.35
        ? "drive"
        : "equipment");
  const handover = !driving && type === "equipment";
  const failure = {
    type,
    at: s.time,
    position: { ...v.position },
    handover,
    stranded: type === "drive",
    onLane: driving,
    taskId: v.serviceId,
    towRequested: false,
    atBay: false,
  } as const;
  v.failure = { ...failure };
  v.status = "failed";
  v.journey = undefined;
  if (driving) {
    s.lane.blockedBy = v.id;
    severLane(s, v.id);
  }
  releaseLane(s, v.id);
  const task = s.services.find((t) => t.id === failure.taskId);
  if (task && task.vehicleId === v.id) {
    task.status = "interrupted";
    task.handover = handover;
  }
  v.serviceId = undefined;
  s.score = Math.max(0, s.score - 8);
  s.conflicts++;
  record(
    s,
    `${v.id} ${failureLabel(type)}停机 · 真实位置 (${failurePosition(v).x}, ${failurePosition(v).y})${handover ? " · 作业成果可交替代车" : type === "drive" ? " · 需拖救车" : ""}`,
    "warning",
  );
  // 先登记维修任务，玩家可以决定是否插队或等待工位。
  if (!v.jobId) createJob(s, v, "corrective", type);
  // 等待中的秒数未参与行驶磨损，不重复累计。
  void seconds;
}
