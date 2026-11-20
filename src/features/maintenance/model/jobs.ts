import type {
  FailureType,
  RepairJob,
  Shift,
  Vehicle,
} from "../../../shared/types";
import {
  MAINTENANCE,
  bayPoint,
  repairDuration,
  wearLevel,
} from "../../../shared/config";
import { copyShift, record } from "../../../shared/document";
import {
  grantLane,
  releaseLane,
  sendHome,
  startJourney,
} from "../../../shared/lane";

/**
 * 已经不能挪动的工位：车辆实际停入的工位，以及已开工任务的工位。
 * 机务车还在路上时作业尚未开始，工位仍属于预留，可随队列调整。
 */
function lockedBays(s: Shift): Set<string> {
  const locked = new Set<string>();
  for (const v of s.vehicles)
    if (v.status === "maintenance" && v.currentBayId)
      locked.add(v.currentBayId);
  for (const job of s.maintenance.jobs)
    if (job.state === "active" && job.bayId) locked.add(job.bayId);
  return locked;
}

/**
 * 按任务顺序重新规划尚未实际占用的工位预留。
 * 只有预留发生变化时才写事件，避免每个时间步重复刷屏。
 */
function refreshQueuedBays(s: Shift): void {
  const physical = lockedBays(s);
  const before = new Map(
    s.maintenance.jobs.map((j) => [j.id, j.bayId] as const),
  );
  // 已实际停入工位的车辆保留原工位；其余按队列顺序重新分配。
  const locked = new Set(physical);
  const order = s.maintenance.jobs.filter((j) => j.state === "queued");
  const assignment = new Map<string, string>();
  for (const job of order) {
    if (job.bayId && locked.has(job.bayId)) {
      assignment.set(job.id, job.bayId);
    }
  }
  const taken = new Set<string>(locked);
  for (const job of order) {
    if (assignment.has(job.id)) continue;
    const bay = s.maintenance.bays.find((b) => !taken.has(b.id));
    if (!bay) continue;
    assignment.set(job.id, bay.id);
    taken.add(bay.id);
  }
  // 清除已不归任何任务的工位；已在工位上的车辆保留占用标记。
  for (const bay of s.maintenance.bays) {
    if (locked.has(bay.id)) continue;
    const owner = [...assignment.entries()].find(([, id]) => id === bay.id);
    if (!owner) {
      bay.jobId = undefined;
      bay.vehicleId = undefined;
      bay.remaining = undefined;
    }
  }
  for (const job of order) {
    const next = assignment.get(job.id);
    const previous = before.get(job.id);
    job.bayId = next;
    if (next) {
      const bay = s.maintenance.bays.find((b) => b.id === next)!;
      bay.jobId = job.id;
      bay.vehicleId = job.vehicleId;
    }
    const v = s.vehicles.find((x) => x.id === job.vehicleId);
    if (!v) continue;
    if (previous === next) continue;
    if (!next) {
      if (v.status === "recovering" && v.journey === "selfToBay") {
        record(s, `${v.id} 工位调整，先返回车场等待`, "warning");
        sendHome(s, v);
      }
      continue;
    }
    record(
      s,
      `${job.vehicleId} ${previous ? "工位调整为" : "获得维修工位"} ${next}（${job.mode === "corrective" ? "故障抢修" : "预防检修"}）`,
      previous ? "warning" : "info",
    );
    if (v.status === "idle" && job.mode === "preventive")
      startJourney(s, v, "selfToBay", bayPoint(next));
    else if (v.status === "recovering" && v.journey === "selfToBay") {
      // 已在途中：改道去新的工位，不瞬移、不重算已走距离。
      v.target = bayPoint(next);
      v.origin = { ...v.position };
      v.progress = 0;
      v.tripDuration = 6;
    }
  }
}

/** 为排队任务预留工位。工位在任务排队时即被占用，先到先得。 */
export function assignBays(s: Shift): void {
  refreshQueuedBays(s);
  grantLane(s);
}

export function createJob(
  s: Shift,
  v: Vehicle,
  mode: RepairJob["mode"],
  failureType?: FailureType,
): RepairJob {
  const duration = repairDuration({ mode, failureType }, wearLevel(v.wear));
  const job: RepairJob = {
    id: `RJ-${String(s.nextJobId++).padStart(2, "0")}`,
    vehicleId: v.id,
    mode,
    failureType,
    queuedAt: s.time,
    state: "queued",
    spareReserved: false,
    duration,
    remaining: duration,
  };
  s.maintenance.jobs.push(job);
  v.jobId = job.id;
  assignBays(s);
  return job;
}

export function jobOfVehicle(s: Shift, vehicleId: string) {
  return s.maintenance.jobs.find((j) => j.vehicleId === vehicleId);
}

function idleRepairVehicle(s: Shift): Vehicle | undefined {
  return s.vehicles.find(
    (x) =>
      x.kind === "repair" &&
      x.status === "idle" &&
      !x.jobId &&
      !x.failure,
  );
}

/**
 * 工位开工检查：车辆已到位、备用件充足、机务车可用。
 * 备用件只在开工时扣一次，完成时不再结算，避免重复领取。
 */
export function tryActivateJobs(s: Shift): void {
  assignBays(s);
  for (const job of s.maintenance.jobs) {
    if (job.state !== "queued" || !job.bayId) continue;
    const v = s.vehicles.find((x) => x.id === job.vehicleId);
    if (!v) continue;
    // 停在维修区待置位的故障车，工位一空就进入自己的工位。
    if (v.status === "staged" && v.failure) {
      v.position = bayPoint(job.bayId);
      v.status = "maintenance";
      v.currentBayId = job.bayId;
      record(s, `${v.id} 由待置位进入 ${job.bayId}`, "info");
    }
    if (v.status !== "maintenance" || v.currentBayId !== job.bayId)
      continue;
    if (s.maintenance.spares <= 0) {
      const textLabel = `${job.bayId} 等待备用件：${v.id} 暂不能开工`;
      if (!s.events.some((e) => e.text === textLabel))
        record(s, textLabel, "warning");
      continue;
    }
    const mx = idleRepairVehicle(s);
    if (!mx) continue;
    s.maintenance.spares -= 1;
    s.maintenance.drawn += 1;
    job.spareReserved = true;
    job.state = "active";
    job.remaining = job.duration;
    job.repairVehicleId = mx.id;
    mx.jobId = job.id;
    startJourney(s, mx, "repairToBay", bayPoint(job.bayId));
    record(
      s,
      `${mx.id} 前往 ${job.bayId} 检修 ${v.id} · 占用备用件 1 件（余 ${s.maintenance.spares}）`,
      "info",
    );
  }
  grantLane(s);
}

function restoreVehicle(s: Shift, job: RepairJob): void {
  const v = s.vehicles.find((x) => x.id === job.vehicleId);
  if (!v) return;
  if (job.mode === "preventive") {
    v.wear = {
      travel: v.wear.travel * (1 - MAINTENANCE.preventiveWearCut),
      work: v.wear.work * (1 - MAINTENANCE.preventiveWearCut),
    };
  } else {
    // 大修后磨损回到低位，但不会归零。
    v.wear = {
      travel: Math.max(4, v.wear.travel * 0.3),
      work: Math.max(4, v.wear.work * 0.3),
    };
  }
  v.failure = undefined;
  v.jobId = undefined;
  v.currentBayId = undefined;
  v.serviceId = undefined;
  v.journey = undefined;
  v.progress = 0;
  v.origin = { ...v.position };
  record(
    s,
    `${v.id} ${job.mode === "preventive" ? "预防检修" : "故障修复"}完成 · 磨损已降低`,
    "success",
  );
  // 修完后回场待命；必须重新获得通道通行权。
  v.status = "idle";
  sendHome(s, v);}

export function advanceMaintenance(state: Shift, seconds: number): Shift {
  const s = copyShift(state);
  if (s.time >= s.maintenance.nextRestock) {
    const before = s.maintenance.spares;
    s.maintenance.spares = Math.min(
      MAINTENANCE.spareCapacity,
      s.maintenance.spares + 1,
    );
    while (s.maintenance.nextRestock <= s.time)
      s.maintenance.nextRestock += MAINTENANCE.restockEvery;
    if (s.maintenance.spares > before) {
      s.maintenance.restocked += 1;
      record(s, `备用件补货：库存 ${s.maintenance.spares} 件`, "success");
    }
  }
  for (const job of [...s.maintenance.jobs]) {
    if (job.state !== "active") continue;
    const mx = s.vehicles.find((x) => x.id === job.repairVehicleId);
    if (!mx || mx.status !== "working" || mx.currentBayId !== job.bayId)
      continue;
    job.remaining = Math.max(0, job.remaining - seconds);
    const bay = s.maintenance.bays.find((b) => b.id === job.bayId);
    if (bay) bay.remaining = job.remaining;
    if (job.remaining > 0) continue;
    restoreVehicle(s, job);
    s.maintenance.completedJobs += 1;
    s.maintenance.jobs = s.maintenance.jobs.filter((j) => j.id !== job.id);
    if (bay) {
      bay.jobId = undefined;
      bay.vehicleId = undefined;
      bay.remaining = undefined;
    }
    if (mx) {
      mx.jobId = undefined;
      mx.currentBayId = undefined;
      mx.status = "idle";
      releaseLane(s, mx.id);
      sendHome(s, mx);
    }
  }
  tryActivateJobs(s);
  return s;
}

/**
 * 紧急插队：把任务挪到队首，并向原本排队的车辆说明预计延期。
 * 只给估算，不承诺具体开工时刻。
 */
export function expediteRepair(state: Shift, jobId: string): Shift {
  const s = copyShift(state);
  const job = s.maintenance.jobs.find((j) => j.id === jobId);
  if (!job || job.state !== "queued")
    return record(s, "该维修任务不在排队中", "warning"), s;
  const before = s.maintenance.jobs
    .filter((j) => j.state === "queued" && j.id !== job.id)
    .map((j) => j.vehicleId);
  s.maintenance.jobs = [
    job,
    ...s.maintenance.jobs.filter((j) => j.id !== job.id),
  ];
  job.expedited = true;
  job.notifiedAt = s.time;
  job.notifiedDelay = Math.round(job.duration * 0.6) + 8;
  if (before.length)
    record(
      s,
      `${job.vehicleId} 紧急插队：${before.join("、")} 的维修预计延后约 ${job.notifiedDelay}s`,
      "warning",
    );
  tryActivateJobs(s);
  return s;
}
