import type { Journey, Point, Shift, Vehicle } from "./types";
import { LANE } from "./config";
import { record } from "./document";

export function isMoving(v: Vehicle): boolean {
  return (
    v.status === "travel" ||
    v.status === "returning" ||
    (v.status === "recovering" && v.journey === "selfToBay")
  );
}

export function holdsPermit(s: Shift, id: string): boolean {
  return s.lane.permits.includes(id);
}

export function needsLane(v: Vehicle): boolean {
  return isMoving(v) || v.status === "waiting";
}

export function tripDuration(a: Point, b: Point): number {
  return 5 + Math.hypot(a.x - b.x, a.y - b.y) / 50;
}

/**
 * 拖救车、维修车辆与普通保障共用同一条机坪通道。
 * 没有通行位时车辆保留真实位置原地等待，不会瞬移。
 */
export function requestLane(s: Shift, v: Vehicle): void {
  if (holdsPermit(s, v.id)) return;
  if (!s.lane.queue.includes(v.id)) s.lane.queue.push(v.id);
  v.status = "waiting";
  v.origin = { ...v.position };
  v.progress = 0;
  v.tripDuration = tripDuration(v.origin, v.target);
}

/**
 * 紧急插队进入通道。向原排队车辆说明预计延期；只给估算，不承诺具体时刻。
 */
export function requestPriorityLane(
  s: Shift,
  v: Vehicle,
  reason: string,
): void {
  if (holdsPermit(s, v.id)) return;
  const estimate =
    Math.round(
      s.lane.queue
        .filter((id) => id !== v.id)
        .reduce((sum, id) => {
          const other = s.vehicles.find((x) => x.id === id);
          return sum + (other ? Math.max(4, other.tripDuration) : 4);
        }, 0) / Math.max(1, LANE.capacity),
    ) + 6;
  const displaced = s.lane.queue.filter((id) => id !== v.id);
  s.lane.queue = s.lane.queue.filter((id) => id !== v.id);
  s.lane.queue.unshift(v.id);
  v.status = "waiting";
  v.origin = { ...v.position };
  v.progress = 0;
  v.tripDuration = tripDuration(v.origin, v.target);
  record(
    s,
    `${reason}：${v.id} 优先进入机坪通道，${
      displaced.length
        ? `排队车辆 ${displaced.join("、")} 预计延后约 ${estimate}s`
        : "通道当前无其他排队车辆"
    }`,
    "warning",
  );
}

export function releaseLane(s: Shift, id: string): void {
  s.lane.permits = s.lane.permits.filter((x) => x !== id);
  s.lane.queue = s.lane.queue.filter((x) => x !== id);
}

function resume(v: Vehicle): void {
  if (v.status !== "waiting") return;
  v.status =
    v.journey === "return"
      ? "returning"
      : v.journey === "selfToBay"
        ? "recovering"
        : "travel";
  v.origin = { ...v.position };
  v.progress = 0;
  v.tripDuration = tripDuration(v.origin, v.target);
}

/**
 * 放行等待车辆。故障车阻断通道时，只有前往该车的拖救车可以插到队首。
 * 阻断的解除由现场操作负责：拖救挂钩或故障车自行驶离时立即恢复通行。
 */
export function grantLane(s: Shift): void {
  if (s.lane.blockedBy) {
    const index = s.lane.queue.findIndex((id) => {
      const v = s.vehicles.find((x) => x.id === id);
      return v?.kind === "tow" && v.towTargetId === s.lane.blockedBy;
    });
    if (index > 0) {
      const [towId] = s.lane.queue.splice(index, 1);
      s.lane.queue.unshift(towId);
    }
  }
  while (s.lane.permits.length < LANE.capacity && s.lane.queue.length > 0) {
    const id = s.lane.queue[0];
    const v = s.vehicles.find((x) => x.id === id);
    if (!v || !needsLane(v) || v.status === "failed") {
      s.lane.queue.shift();
      continue;
    }
    if (s.lane.blockedBy) {
      const clearing =
        v.id === s.lane.blockedBy ||
        (v.kind === "tow" && v.towTargetId === s.lane.blockedBy);
      if (!clearing) break;
    }
    s.lane.queue.shift();
    s.lane.permits.push(id);
    resume(v);
  }
}

/** 开始一段行程；进入通道前先申请通行权。 */
export function startJourney(
  s: Shift,
  v: Vehicle,
  journey: Journey,
  target: Point,
): void {
  v.journey = journey;
  v.target = { ...target };
  v.origin = { ...v.position };
  v.progress = 0;
  v.tripDuration = tripDuration(v.origin, v.target);
  v.status =
    journey === "return"
      ? "returning"
      : journey === "selfToBay"
        ? "recovering"
        : "travel";
  requestLane(s, v);
  grantLane(s);
}

export function sendHome(s: Shift, v: Vehicle): void {
  startJourney(s, v, "return", v.home);
}
