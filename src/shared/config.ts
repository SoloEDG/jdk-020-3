import type { FailureType, Point, RepairJob } from "./types";

/**
 * 机坪运营参数。数值集中在此，存档校验与界面提示共用同一套规则。
 */
export const MAINTENANCE = {
  bayCount: 2,
  bays: [
    { x: 812, y: 432 },
    { x: 866, y: 432 },
  ] as Point[],
  depot: { x: 850, y: 510 },
  initialSpares: 3,
  spareCapacity: 4,
  restockEvery: 150,
  preventiveDuration: 26,
  correctiveDriveDuration: 44,
  correctiveEquipmentDuration: 32,
  wearMax: 100,
  /** 每行驶 1 秒积累的行驶磨损。 */
  travelWearPerSecond: 0.65,
  /** 每作业 1 秒积累的作业磨损。 */
  workWearPerSecond: 0.9,
  /**
   * 低于此磨损不会因随机因素故障；超过后概率随磨损陡增。
   * 界面只展示概率区间，绝不预告具体故障时刻。
   */
  wearFailureFloor: 30,
  /** 预防检修可以消除的磨损比例。 */
  preventiveWearCut: 0.85,
} as const;

export const LANE = {
  /** 机坪通道通行能力：同一时刻最多两辆车占用通道。 */
  capacity: 2,
  /** 排队中的车辆每 4 秒重试一次通行权。 */
  retrySeconds: 4,
} as const;

export function repairDuration(
  job: Pick<RepairJob, "mode" | "failureType">,
  wear: number,
): number {
  if (job.mode === "preventive")
    return Math.round(MAINTENANCE.preventiveDuration + wear * 0.12);
  return job.failureType === "drive"
    ? MAINTENANCE.correctiveDriveDuration
    : MAINTENANCE.correctiveEquipmentDuration;
}

export function wearLevel(wear: {
  travel: number;
  work: number;
}): number {
  return Math.min(
    MAINTENANCE.wearMax,
    Math.max(wear.travel, wear.work),
  );
}

/**
 * 每 10 秒的故障概率。低于磨损阈值时不会随机故障（新车不可能凭运气坏掉），
 * 高磨损时概率陡增，让“现在保养还是冒险飞”成为真正的取舍。
 * 阈值附近仍会给出区间，但区间下界为 0——这是一个范围，不是承诺。
 */
export function failureChancePerTenSeconds(wear: {
  travel: number;
  work: number;
}): number {
  const level = wearLevel(wear);
  if (level < MAINTENANCE.wearFailureFloor) return 0;
  const ratio =
    (level - MAINTENANCE.wearFailureFloor) /
    (MAINTENANCE.wearMax - MAINTENANCE.wearFailureFloor);
  return 0.003 + 0.075 * ratio * ratio * ratio;
}

/**
 * 只返回概率区间，从不返回具体故障时刻。
 */
export function riskBand(wear: {
  travel: number;
  work: number;
}): {
  low: number;
  high: number;
  level: "low" | "guarded" | "high" | "critical";
} {
  const level = wearLevel(wear);
  const mid = failureChancePerTenSeconds(wear) * 100;
  const ratio = level / MAINTENANCE.wearMax;
  const spread = 0.4 + ratio * 2.2;
  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    low: round(Math.max(0, mid - spread / 2)),
    high: round(Math.min(95, mid + spread / 2)),
    level:
      level >= 78
        ? "critical"
        : level >= 52
          ? "high"
          : level >= 26
            ? "guarded"
            : "low",
  };
}

/**
 * 区间文案。低于磨损阈值时明确写“未达阈值”，而不是给一个可能被误读成
 * “绝不故障”的 0%；超过阈值时只给区间，不给时刻。
 */
export function riskText(wear: { travel: number; work: number }): string {
  if (failureChancePerTenSeconds(wear) === 0) return "未达阈值";
  const { low, high } = riskBand(wear);
  const fmt = (n: number) =>
    n === 0 ? "0" : n < 0.05 ? "<0.1" : n.toFixed(1);
  return `${fmt(low)}%–${fmt(high)}%`;
}

export function failureLabel(type: FailureType): string {
  return type === "drive" ? "行驶系故障" : "作业设备故障";
}

export function bayPoint(id: string | undefined): Point {
  const index = Math.max(
    0,
    MAINTENANCE.bays.findIndex((_, i) => `MH-${i + 1}` === id),
  );
  return MAINTENANCE.bays[index] ?? MAINTENANCE.bays[0];
}
