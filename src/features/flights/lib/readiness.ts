import type { Flight, Shift } from "../../../shared/types";
/**
 * 离港判定只认“真实完成凭证”。车辆换班、故障中断或进度条到达 100
 * 都不算完成；只有作业车辆在现场把任务做完才会写入 completion。
 */
export function flightReady(state: Shift, id: string): boolean {
  const tasks = state.services.filter((t) => t.flightId === id);
  return (
    tasks.length === 3 &&
    tasks.every((t) => t.status === "done" && t.completion !== undefined)
  );
}

export function turnaroundProgress(state: Shift, id: string): number {
  const tasks = state.services.filter((t) => t.flightId === id);
  return tasks.length
    ? Math.round(tasks.reduce((n, t) => n + t.progress, 0) / tasks.length)
    : 0;
}

export function delaySeconds(flight: Flight, time: number): number {
  return Math.max(
    0,
    Math.floor((flight.departureAt ?? time) - flight.deadline),
  );
}

export const statusLabels: Record<Flight["status"], string> = {
  scheduled: "计划到达",
  incoming: "等待机位",
  parked: "地勤保障",
  departing: "正在推出",
  departed: "已离港",
};
