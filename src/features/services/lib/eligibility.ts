import type { Shift, ServiceKind } from "../../../shared/types";
import { serviceCatalog } from "../model/catalog";

export function serviceBlockReason(
  s: Shift,
  flightId: string,
  kind: ServiceKind,
): string | undefined {
  const f = s.flights.find((x) => x.id === flightId),
    task = s.services.find((x) => x.flightId === flightId && x.kind === kind);
  if (!f || f.status !== "parked") return "请先分配机位";
  if (!task) return "任务不存在";
  if (task.status === "done") return "任务已完成";
  if (task.status === "travel" || task.status === "working")
    return "任务已派遣";
  // interrupted 任务允许重新派遣替代车；接续规则在 dispatch 中按故障类型处理。
  if (
    serviceCatalog[kind].requires.some(
      (k) =>
        !s.services.some(
          (t) =>
            t.flightId === flightId &&
            t.kind === k &&
            t.status === "done" &&
            t.completion !== undefined,
        ),
    )
  )
    return "等待行李装卸完成";
  const active = s.services.filter(
    (t) =>
      t.flightId === flightId &&
      (t.status === "travel" || t.status === "working"),
  ).length;
  if (active >= 2) return "机位的两个服务位均已占用";
  return undefined;
}

/** 中断任务是否可以交给替代车接续（仅设备故障勾选的成果）。 */
export function handoverNote(
  s: Shift,
  flightId: string,
  kind: ServiceKind,
): string | undefined {
  const task = s.services.find(
    (t) => t.flightId === flightId && t.kind === kind,
  );
  if (task?.status !== "interrupted") return undefined;
  return task.handover
    ? "前车设备故障，已完成的作业成果可交替代车接续；离港仍需替代车实际完成"
    : "前车故障，作业成果不可交接，需重新作业";
}
