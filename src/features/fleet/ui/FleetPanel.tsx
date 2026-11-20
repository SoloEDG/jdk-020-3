import type { Shift, Vehicle, VehicleStatus } from "../../../shared/types";
import { riskBand } from "../../../shared/config";
import { vehicleLabels, vehicleColors } from "../lib/routing";

const statusLabels: Record<VehicleStatus, string> = {
  idle: "待命",
  waiting: "排队等待通道",
  travel: "前往现场",
  working: "作业中",
  returning: "返回车场",
  recovering: "拖带中",
  failed: "故障停机",
  staged: "待置位",
  maintenance: "维修区",
};

function statusTone(v: Vehicle): string {
  if (v.failure) return "failed";
  if (v.status === "staged") return "waiting";
  if (v.status === "waiting") return "waiting";
  if (v.status === "idle") return "idle";
  return "";
}

export function FleetPanel({
  state,
  onSelect,
  onTow,
  onSelfRecover,
}: {
  state: Shift;
  onSelect: (id: string) => void;
  onTow: (id: string) => void;
  onSelfRecover: (id: string) => void;
}) {
  const idle = state.vehicles.filter((v) => v.status === "idle").length;
  return (
    <section className="fleet-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">GROUND SUPPORT EQUIPMENT</span>
          <h2>
            地勤车队 <small>{idle}/{state.vehicles.length} 待命</small>
          </h2>
        </div>
        <span className="fleet-hint">
          通道 {state.lane.permits.length}/2 占用
          {state.lane.queue.length > 0
            ? ` · ${state.lane.queue.length} 车排队`
            : ""}
          {state.lane.blockedBy ? ` · ${state.lane.blockedBy} 阻断通道` : ""}
        </span>
      </div>
      <div className="fleet-grid">
        {state.vehicles.map((v) => {
          const band = riskBand(v.wear);
          return (
            <div
              className={`fleet-card ${state.selectedVehicleId === v.id ? "chosen" : ""} ${v.failure ? "broken" : ""}`}
              key={v.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(v.id)}
              onKeyDown={(e) => e.key === "Enter" && onSelect(v.id)}
              data-testid={`vehicle-${v.id}`}
            >
              <span
                className="truck-icon"
                style={{ color: vehicleColors[v.kind] }}
              >
                ▰<i />
              </span>
              <div>
                <strong>{v.id}</strong>
                <span>{vehicleLabels[v.kind]}</span>
                <span className={`wear-mini ${band.level}`}>
                  磨损 {Math.round(Math.max(v.wear.travel, v.wear.work))}
                </span>
              </div>
              <em className={statusTone(v)}>
                <i />
                {statusLabels[v.status]}
              </em>
              {v.failure && (
                <div className="fleet-actions">
                  {v.failure.stranded ? (
                    <button
                      className="dispatch"
                      disabled={!!v.failure.towRequested}
                      data-testid={`tow-${v.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onTow(v.id);
                      }}
                    >
                      {v.failure.towRequested ? "拖救在途" : "呼叫拖救"}
                    </button>
                  ) : (
                    <button
                      className="dispatch"
                      data-testid={`self-recover-${v.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelfRecover(v.id);
                      }}
                    >
                      驶入工位
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
