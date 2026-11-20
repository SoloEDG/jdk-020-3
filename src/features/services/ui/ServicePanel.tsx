import type { ServiceKind, Shift } from "../../../shared/types";
import { serviceCatalog } from "../model/catalog";
import { handoverNote, serviceBlockReason } from "../lib/eligibility";
import { riskBand, riskText } from "../../../shared/config";

export function ServicePanel({
  state,
  onDispatch,
}: {
  state: Shift;
  onDispatch: (kind: ServiceKind, vehicleId: string) => void;
}) {
  const tasks = state.services.filter(
    (t) => t.flightId === state.selectedFlightId,
  );
  return (
    <div className="service-panel">
      <div className="subheading">
        <h3>地勤保障</h3>
        <span>GROUND SERVICES</span>
      </div>
      {tasks.map((t, i) => {
        const info = serviceCatalog[t.kind],
          reason = serviceBlockReason(state, t.flightId, t.kind),
          note = handoverNote(state, t.flightId, t.kind),
          available = state.vehicles.filter(
            (v) => v.kind === t.kind && v.status === "idle",
          );
        const selected =
          state.vehicles.find(
            (v) =>
              v.id === state.selectedVehicleId &&
              v.kind === t.kind &&
              v.status === "idle",
          ) ?? available[0];
        const band = selected ? riskBand(selected.wear) : undefined;
        const risky =
          band?.level === "high" || band?.level === "critical";
        return (
          <div className={`service-task ${t.status}`} key={t.id}>
            <div className="service-icon">
              {t.kind === "fuel" ? "◈" : t.kind === "baggage" ? "▤" : "✧"}
            </div>
            <div className="service-content">
              <div className="service-title">
                <strong>{info.label}</strong>
                <span>
                  {t.status === "done"
                    ? "已完成 ✓"
                    : t.status === "interrupted"
                      ? "作业中断"
                      : t.status === "working"
                        ? `${Math.floor(t.progress)}%`
                        : t.status === "travel"
                          ? "车辆前往中"
                          : `0${i + 1}`}
                </span>
              </div>
              <div className="service-detail">
                {t.status === "pending" || t.status === "interrupted"
                  ? (reason && t.status === "pending"
                      ? reason
                      : note ??
                        `${selected?.id ?? "暂无空闲车辆"} · ${Math.round(t.duration)}s`) +
                    (t.status === "interrupted" && t.progress > 0
                      ? t.handover
                        ? ` · 可接续 ${Math.round(t.progress)}%`
                        : ` · 需重做（原 ${Math.round(t.progress)}% 作废）`
                      : "")
                  : t.vehicleId + " · " + info.english}
              </div>
              {(t.status === "working" ||
                t.status === "done" ||
                t.status === "interrupted") && (
                <div className="task-track">
                  <i style={{ width: `${t.progress}%` }} />
                </div>
              )}
              {risky && selected && (
                <div className="service-risk">
                  派出 {selected.id} · 10s 故障风险 {riskText(selected.wear)}（仅区间）
                </div>
              )}
            </div>
            {(t.status === "pending" || t.status === "interrupted") && (
              <button
                className={`dispatch ${risky ? "risk" : ""}`}
                data-testid={`start-service-${t.kind}`}
                disabled={!!reason || !selected}
                title={
                  reason ??
                  (risky
                    ? "该车磨损较高，可以在紧急航班上冒险，但故障可能发生在途中"
                    : info.description)
                }
                onClick={() => selected && onDispatch(t.kind, selected.id)}
              >
                {t.status === "interrupted" ? "重新派遣" : "派遣"} ↗
              </button>
            )}
          </div>
        );
      })}
      <p className="dependency-note">
        ↳ 先完成行李装卸，再进行客舱清洁。燃油可同步保障。
        车辆故障后需重新派遣；只有替代车真实完成，离港才放行。
      </p>
    </div>
  );
}
