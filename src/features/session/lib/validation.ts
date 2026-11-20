import type { Shift } from "../../../shared/types";
import { LANE, MAINTENANCE, bayPoint } from "../../../shared/config";

const kinds = ["fuel", "baggage", "clean", "tow", "repair"];
const flightStates = [
  "scheduled",
  "incoming",
  "parked",
  "departing",
  "departed",
];
const serviceStates = [
  "pending",
  "travel",
  "working",
  "done",
  "interrupted",
];
const vehicleStates = [
  "idle",
  "waiting",
  "travel",
  "working",
  "returning",
  "recovering",
  "failed",
  "staged",
  "maintenance",
];
const journeys = [
  "service",
  "return",
  "tow",
  "towToBay",
  "selfToBay",
  "repairToBay",
];
const failureTypes = ["drive", "equipment"];
const jobModes = ["preventive", "corrective"];
const jobStates = ["queued", "active"];

type Row = Record<string, unknown>;
function row(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
function member(set: ReadonlySet<unknown>, value: unknown): boolean {
  return typeof value === "string" && set.has(value);
}
function point(value: unknown): value is Row & { x: number; y: number } {
  return row(value) && finite(value.x) && finite(value.y);
}
function unique(values: Row[]): boolean {
  return (
    values.every((x) => text(x.id)) &&
    new Set(values.map((x) => x.id)).size === values.length
  );
}
function collection(value: unknown, length?: number): value is Row[] {
  return (
    Array.isArray(value) &&
    (length === undefined || value.length === length) &&
    value.every(row) &&
    unique(value)
  );
}

function wear(value: unknown): boolean {
  return (
    row(value) &&
    finite(value.travel) &&
    finite(value.work) &&
    value.travel >= 0 &&
    value.travel <= MAINTENANCE.wearMax &&
    value.work >= 0 &&
    value.work <= MAINTENANCE.wearMax
  );
}

/**
 * 校验维修区：工位、任务、备用件必须互相对得上。
 * 特别重要：备用件只在 active 任务上扣减，queued 任务不得已标记占用。
 */
function validMaintenance(
  value: unknown,
  vehicles: Row[],
  vehicleIds: ReadonlySet<unknown>,
): boolean {
  if (!row(value)) return false;
  if (
    !finite(value.spares) ||
    value.spares < 0 ||
    value.spares > MAINTENANCE.spareCapacity ||
    !finite(value.drawn) ||
    value.drawn < 0 ||
    !finite(value.restocked) ||
    value.restocked < 0 ||
    !finite(value.completedJobs) ||
    value.completedJobs < 0 ||
    !finite(value.nextRestock) ||
    !collection(value.bays) ||
    !Array.isArray(value.jobs) ||
    !(value.jobs as unknown[]).every(row)
  )
    return false;
  const bays = value.bays as Row[],
    jobs = value.jobs as Row[];
  if (!unique(jobs)) return false;
  if (bays.length !== MAINTENANCE.bayCount) return false;
  if (
    !bays.every(
      (b) =>
        text(b.id) &&
        (b.jobId === undefined || text(b.jobId)) &&
        (b.vehicleId === undefined || member(vehicleIds, b.vehicleId)) &&
        (b.remaining === undefined || (finite(b.remaining) && b.remaining >= 0)),
    )
  )
    return false;
  if (!unique(bays)) return false;
  const jobIds = new Set(jobs.map((j) => j.id));
  if (
    !jobs.every(
      (j) =>
        text(j.id) &&
        member(vehicleIds, j.vehicleId) &&
        jobModes.includes(j.mode as string) &&
        jobStates.includes(j.state as string) &&
        finite(j.queuedAt) &&
        j.queuedAt >= 0 &&
        typeof j.spareReserved === "boolean" &&
        finite(j.duration) &&
        j.duration > 0 &&
        finite(j.remaining) &&
        j.remaining >= 0 &&
        j.remaining <= j.duration &&
        (!jobModes.includes(j.mode as string) ||
          j.mode !== "corrective" ||
          failureTypes.includes(j.failureType as string)) &&
        (j.bayId === undefined || bays.some((b) => b.id === j.bayId)) &&
        (j.repairVehicleId === undefined ||
          member(vehicleIds, j.repairVehicleId)) &&
        (j.notifiedDelay === undefined || finite(j.notifiedDelay)) &&
        (j.notifiedAt === undefined || finite(j.notifiedAt)),
    )
  )
    return false;
  if (
    !bays.every((b) => {
      if (b.jobId === undefined) return b.vehicleId === undefined;
      const job = jobs.find((j) => j.id === b.jobId);
      return !!job && job.bayId === b.id && job.vehicleId === b.vehicleId;
    })
  )
    return false;
  const queued = jobs.filter((j) => j.state === "queued");
  const active = jobs.filter((j) => j.state === "active");
  // 排队任务不能已经扣过备用件；备用件只在开工时扣除。
  if (queued.some((j) => j.spareReserved)) return false;
  if (active.some((j) => !j.spareReserved)) return false;
  // 备用件总账必须闭合：库存 = 初始 + 补货 - 领取，且领取数 = 已完成 + 在修。
  // 改动其中任何一项都会让三个等式同时失效，避免存档恢复后重复领取。
  if (value.spares !== MAINTENANCE.initialSpares + (value.restocked as number) - (value.drawn as number))
    return false;
  if (value.drawn !== (value.completedJobs as number) + active.length)
    return false;
  if ((value.drawn as number) > (value.restocked as number) + MAINTENANCE.initialSpares)
    return false;
  // 每个车辆最多一条任务；active 任务必须有工位与机务车。
  if (new Set(jobs.map((j) => j.vehicleId)).size !== jobs.length) return false;
  if (
    active.some(
      (j) =>
        j.bayId === undefined ||
        j.repairVehicleId === undefined ||
        !vehicles.some(
          (v) => v.id === j.repairVehicleId && v.kind === "repair",
        ),
    )
  )
    return false;
  for (const j of active) {
    const mx = vehicles.find((v) => v.id === j.repairVehicleId);
    if (!mx) return false;
    // 机务车的 jobId 必须指回这条任务，避免一车多单或重复结算。
    if (mx.jobId !== j.id) return false;
  }
  // 计数字段不能为负或超过可解释的界。
  return (value.completedJobs as number) >= 0;
}

export function validateShift(value: unknown): Shift | undefined {
  if (
    !row(value) ||
    value.version !== 2 ||
    !finite(value.time) ||
    value.time < 0 ||
    !finite(value.score) ||
    !finite(value.conflicts) ||
    value.conflicts < 0 ||
    !finite(value.rng) ||
    typeof value.paused !== "boolean" ||
    ![1, 2, 4].includes(value.speed as number) ||
    !finite(value.nextEventId) ||
    !finite(value.nextJobId)
  )
    return undefined;
  if (
    !collection(value.flights, 6) ||
    !collection(value.stands, 6) ||
    !collection(value.vehicles) ||
    !collection(value.services, 18) ||
    !Array.isArray(value.events) ||
    value.events.length > 30 ||
    !row(value.lane)
  )
    return undefined;
  const flights = value.flights,
    stands = value.stands,
    vehicles = value.vehicles,
    services = value.services;
  // 车队规模固定：删掉车辆等于把故障和排队一笔勾销。
  const fleetCounts: Record<string, number> = {
    fuel: 2,
    baggage: 2,
    clean: 2,
    tow: 1,
    repair: 2,
  };
  for (const [kind, count] of Object.entries(fleetCounts)) {
    if (vehicles.filter((v) => v.kind === kind).length !== count)
      return undefined;
  }
  const flightIds = new Set(flights.map((x) => x.id)),
    standIds = new Set(stands.map((x) => x.id)),
    vehicleIds = new Set(vehicles.map((x) => x.id)),
    serviceIds = new Set(services.map((x) => x.id));
  if (
    !flights.every(
      (f) =>
        text(f.airline) &&
        text(f.from) &&
        text(f.destination) &&
        text(f.aircraft) &&
        ["narrow", "wide"].includes(f.size as string) &&
        flightStates.includes(f.status as string) &&
        finite(f.arrival) &&
        finite(f.deadline) &&
        finite(f.passengers) &&
        f.passengers > 0 &&
        text(f.color) &&
        (f.urgent === undefined || typeof f.urgent === "boolean") &&
        (f.departureAt === undefined || finite(f.departureAt)) &&
        (f.standId === undefined || standIds.has(f.standId)),
    )
  )
    return undefined;
  if (
    !stands.every(
      (s) =>
        point(s) &&
        ["narrow", "wide"].includes(s.size as string) &&
        text(s.terminal),
    )
  )
    return undefined;
  if (
    !vehicles.every(
      (v) =>
        kinds.includes(v.kind as string) &&
        vehicleStates.includes(v.status as string) &&
        point(v.position) &&
        point(v.origin) &&
        point(v.target) &&
        point(v.home) &&
        finite(v.progress) &&
        v.progress >= 0 &&
        v.progress <= 100 &&
        finite(v.tripDuration) &&
        v.tripDuration > 0 &&
        wear(v.wear) &&
        (v.serviceId === undefined || serviceIds.has(v.serviceId)) &&
        (v.jobId === undefined || text(v.jobId)) &&
        (v.journey === undefined || journeys.includes(v.journey as string)) &&
        (v.towTargetId === undefined || member(vehicleIds, v.towTargetId)) &&
        (v.currentBayId === undefined || text(v.currentBayId)) &&
        (v.failure === undefined || validFailure(v.failure, serviceIds)),
    )
  )
    return undefined;
  if (
    !services.every(
      (s) =>
        flightIds.has(s.flightId) &&
        ["baggage", "fuel", "clean"].includes(s.kind as string) &&
        serviceStates.includes(s.status as string) &&
        finite(s.progress) &&
        s.progress >= 0 &&
        s.progress <= 100 &&
        finite(s.duration) &&
        s.duration > 0 &&
        (s.vehicleId === undefined || member(vehicleIds, s.vehicleId)) &&
        (s.handover === undefined || typeof s.handover === "boolean") &&
        (s.completion === undefined ||
          (row(s.completion) &&
            finite(s.completion.at) &&
            member(vehicleIds, s.completion.vehicleId))) &&
        (s.status !== "done" || s.completion !== undefined) &&
        (s.status !== "done" || s.progress === 100),
    )
  )
    return undefined;
  if (
    !flights.every((f) =>
      ["baggage", "fuel", "clean"].every(
        (k) =>
          services.filter((t) => t.flightId === f.id && t.kind === k).length ===
          1,
      ),
    )
  )
    return undefined;
  const occupied = flights
    .filter((f) => f.status !== "departed" && f.standId !== undefined)
    .map((f) => f.standId);
  if (new Set(occupied).size !== occupied.length) return undefined;
  if (
    !flights.every(
      (f) =>
        !["parked", "departing", "departed"].includes(f.status as string) ||
        (standIds.has(f.standId) &&
          (f.size === "narrow" ||
            stands.find((s) => s.id === f.standId)?.size === "wide")),
    )
  )
    return undefined;
  // 服务任务与车辆互相指认，且 parked 才允许进行中。
  if (
    !services.every((s) => {
      if (s.status === "pending")
        return s.progress === 0 && s.vehicleId === undefined && !s.completion;
      if (s.completion !== undefined && s.status !== "done") return false;
      const v = vehicles.find((x) => x.id === s.vehicleId);
      if (!v) return false;
      if (s.status === "done")
        return s.progress === 100 && s.completion !== undefined;
      if (s.status === "interrupted")
        return s.vehicleId !== undefined && v.serviceId !== s.id;
      // 排队等通道的车辆任务仍是 travel；等位不改变任务本身的状态。
      const aligned =
        v.status === s.status ||
        (v.status === "waiting" && s.status === "travel");
      return (
        v.serviceId === s.id &&
        aligned &&
        !v.failure &&
        flights.find((f) => f.id === s.flightId)?.status === "parked"
      );
    })
  )
    return undefined;
  // 故障车辆不得在存档中变成空闲：failure 存在时状态必须是失败/被拖/维修。
  // 反过来，failed 必须真的带着 failure——避免“坏车被恢复成空闲”。
  if (
    !vehicles.every(
      (v) =>
        (v.failure === undefined ||
          ((v.status === "failed" ||
            v.status === "recovering" ||
            v.status === "maintenance" ||
            v.status === "staged" ||
            v.status === "waiting") &&
            (v.journey === undefined ||
              ["towToBay", "selfToBay"].includes(v.journey as string)) &&
            v.jobId !== undefined &&
            v.serviceId === undefined)) &&
        (v.failure !== undefined ||
          (v.status !== "failed" && v.status !== "staged")) &&
        (v.status !== "maintenance" ||
          (v.currentBayId !== undefined && v.jobId !== undefined)) &&
        (v.jobId === undefined ||
          (typeof v.jobId === "string" && v.jobId.length > 0)),
    )
  )
    return undefined;
  // 维修区车位互认：停入工位的车辆必须占着自己的工位；
  // 机务车在工位作业时同样登记 currentBayId，但不必是工位主人。
  // 机务车还在路上时没有 currentBayId，允许。
  if (
    !vehicles.every((v) => {
      if (v.kind === "repair") {
        if (v.currentBayId === undefined) return v.jobId === undefined || v.journey === "repairToBay";
        const bay = (value.maintenance as Row).bays as Row[] | undefined;
        const slot = bay?.find((b) => b.id === v.currentBayId);
        return !!slot && slot.jobId === v.jobId;
      }
      if (v.jobId === undefined) return v.currentBayId === undefined;
      const bay = (value.maintenance as Row).bays as Row[] | undefined;
      const slot = bay?.find((b) => b.id === v.currentBayId);
      return !slot || (slot.vehicleId === v.id && slot.jobId === v.jobId);
    })
  )
    return undefined;
  // 排队等通道的车辆必须真的在通道队列（或刚获得通行位）里。
  if (
    !vehicles.every(
      (v) =>
        v.status !== "waiting" ||
        member(
          new Set((value.lane as { queue: string[] }).queue),
          v.id,
        ) ||
        member(
          new Set((value.lane as { permits: string[] }).permits),
          v.id,
        ),
    )
  )
    return undefined;
  if (
    !vehicles.every(
      (v) =>
        !["travel", "working", "returning"].includes(v.status as string) ||
        (v.journey === "return" && v.status === "returning") ||
        v.status === "working" ||
        v.journey !== undefined,
    )
  )
    return undefined;
  if (
    !vehicles.every(
      (v) =>
        !["travel", "working", "returning", "recovering"].includes(
          v.status as string,
        ) ||
        (v.failure !== undefined &&
          ["recovering", "waiting"].includes(v.status as string)) ||
        v.journey === "tow" ||
        v.journey === "towToBay" ||
        v.journey === "selfToBay" ||
        v.journey === "repairToBay" ||
        v.journey === "service" ||
        v.journey === "return",
    )
  )
    return undefined;
  if (
    !vehicles.every(
      (v) =>
        !["travel", "working", "returning"].includes(v.status as string) ||
        services.some(
          (s) =>
            s.id === v.serviceId &&
            s.vehicleId === v.id &&
            (s.status === v.status ||
              (s.status === "interrupted" && v.status === "failed")),
        ) ||
        v.journey !== "service",
    )
  )
    return undefined;
  if (
    !flights.every(
      (f) =>
        services.filter(
          (t) =>
            t.flightId === f.id &&
            ["travel", "working"].includes(t.status as string),
        ).length <= 2,
    )
  )
    return undefined;
  if (
    !flights.every(
      (f) =>
        !["departing", "departed"].includes(f.status as string) ||
        services
          .filter((t) => t.flightId === f.id)
          .every((t) => t.status === "done" && t.completion),
    )
  )
    return undefined;
  if (!validMaintenance(value.maintenance, vehicles, vehicleIds))
    return undefined;
  if (!validLane(value.lane, vehicleIds)) return undefined;
  if (
    !value.events.every(
      (e) =>
        row(e) &&
        finite(e.id) &&
        finite(e.time) &&
        text(e.text) &&
        ["info", "success", "warning"].includes(e.tone as string),
    )
  )
    return undefined;
  const events = value.events as Row[];
  if (
    new Set(events.map((e) => e.id)).size !== events.length ||
    events.some((e) => (e.id as number) >= (value.nextEventId as number)) ||
    events.some((e) => (e.time as number) > (value.time as number))
  )
    return undefined;
  if (
    !flightIds.has(value.selectedFlightId) ||
    (value.selectedStandId !== undefined &&
      !standIds.has(value.selectedStandId)) ||
    (value.selectedVehicleId !== undefined &&
      !member(vehicleIds, value.selectedVehicleId))
  )
    return undefined;
  const jobIds = new Set(
    (value.maintenance as Row).jobs
      ? ((value.maintenance as { jobs: Row[] }).jobs).map((j) => j.id)
      : [],
  );
  if (
    !vehicles.every(
      (v) =>
        v.jobId === undefined ||
        jobIds.has(v.jobId) ||
        v.status === "maintenance" ||
        v.status === "failed",
    )
  )
    return undefined;
  return value as unknown as Shift;
}

function validFailure(value: unknown, serviceIds: ReadonlySet<unknown>): boolean {
  if (!row(value)) return false;
  if (
    !failureTypes.includes(value.type as string) ||
    !finite(value.at) ||
    value.at < 0 ||
    !point(value.position) ||
    typeof value.handover !== "boolean" ||
    typeof value.stranded !== "boolean" ||
    typeof value.onLane !== "boolean" ||
    typeof value.towRequested !== "boolean" ||
    typeof value.atBay !== "boolean" ||
    (value.taskId !== undefined && !member(serviceIds, value.taskId)) ||
    (value.bayId !== undefined && !text(value.bayId))
  )
    return false;
  // 行驶系故障必然失去行驶能力；设备故障必然可以交接。
  if (value.type === "drive" && (!value.stranded || value.handover))
    return false;
  if (value.type === "equipment" && value.stranded) return false;
  const expectedHandover = value.type === "equipment" && !value.onLane;
  return value.handover === expectedHandover;
}

function validLane(value: unknown, vehicleIds: ReadonlySet<unknown>): boolean {
  if (!row(value)) return false;
  const permits = value.permits,
    queue = value.queue;
  if (!Array.isArray(permits) || !Array.isArray(queue)) return false;
  if (!permits.every((id) => member(vehicleIds, id))) return false;
  if (!queue.every((id) => member(vehicleIds, id))) return false;
  if (permits.length > LANE.capacity) return false;
  if (new Set(permits).size !== permits.length) return false;
  if (new Set(queue).size !== queue.length) return false;
  if (permits.some((id) => queue.includes(id))) return false;
  if (value.blockedBy !== undefined && !member(vehicleIds, value.blockedBy))
    return false;
  return true;
}
/**
 * 旧版存档（v1）没有故障、磨损、通道与维修区，无法在不凭空编造
 * 这些状态的前提下迁移。诚实地拒绝，而不是把车辆一律当作空闲。
 */
export function salvageShift(value: unknown): Shift | undefined {
  if (!row(value) || value.version !== 1) return undefined;
  return undefined;
}
