import type { ServiceKind, Shift } from "../shared/types";
import { clockLabel } from "../shared/document";
import { failureLabel, riskBand, riskText, wearLevel } from "../shared/config";
import { flightReady, departFlight, statusLabels } from "../features/flights";
import { StandPicker } from "../features/apron";
import { ServicePanel } from "../features/services";
import { EventLog } from "../features/session";
import { vehicleLabels } from "../features/fleet";

function VehicleDetail({
  state,
  onTow,
}: {
  state: Shift;
  onTow: (id: string) => void;
}) {
  const v = state.vehicles.find((x) => x.id === state.selectedVehicleId);
  if (!v) return null;
  const band = riskBand(v.wear);
  const job = state.maintenance.jobs.find((j) => j.vehicleId === v.id);
  return (
    <div className="vehicle-detail" data-testid="vehicle-detail">
      <div className="subheading">
        <h3>
          {v.id} · {vehicleLabels[v.kind]}
        </h3>
        <span>VEHICLE</span>
      </div>
      <div className="vehicle-facts">
        <span>
          行驶磨损 <b>{Math.round(v.wear.travel)}</b>
        </span>
        <span>
          作业磨损 <b>{Math.round(v.wear.work)}</b>
        </span>
        <span className={`risk-text ${band.level}`}>
          风险区间 {riskText(v.wear)} / 10s
        </span>
      </div>
      {v.failure ? (
        <div className="failure-box">
          <strong>
            {failureLabel(v.failure.type)} · {clockLabel(v.failure.at)}
          </strong>
          <p>
            真实位置 (
            {Math.round(v.failure.position.x)}, {Math.round(v.failure.position.y)})
          </p>
          <p>
            {v.failure.onLane ? "占用机坪通道，" : ""}
            {v.failure.stranded
              ? "已失去行驶能力，需要拖救车"
              : "可自行低速驶入工位"}
          </p>
          <p>
            {v.failure.taskId
              ? v.failure.handover
                ? "作业成果可由替代车接续，需重新派遣车辆完成"
                : "成果不可交接，替代车须重新作业"
              : "无进行中的保障任务"}
          </p>
          {v.failure.stranded && !v.failure.towRequested && (
            <button
              className="primary full"
              onClick={() => onTow(v.id)}
              data-testid="detail-tow"
            >
              呼叫拖救车 <span>↗</span>
            </button>
          )}
          {v.failure.towRequested && (
            <span className="badge warning">拖救车已在途</span>
          )}
        </div>
      ) : (
        <div className="vehicle-facts muted">
          <span>
            综合磨损 <b>{Math.round(wearLevel(v.wear))}/100</b>
          </span>
          {job && (
            <span>
              {job.state === "active"
                ? `检修剩余 ${Math.ceil(job.remaining)}s`
                : `排队第 ${state.maintenance.jobs.filter((j) => j.state === "queued").findIndex((j) => j.id === job.id) + 1} 位`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function Inspector({
  state,
  onChange,
  onStand,
  onAssign,
  onDispatch,
  onTow,
}: {
  state: Shift;
  onChange: (s: Shift) => void;
  onStand: (id: string) => void;
  onAssign: (id: string) => void;
  onDispatch: (k: ServiceKind, v: string) => void;
  onTow: (id: string) => void;
}) {
  const f = state.flights.find((x) => x.id === state.selectedFlightId)!;
  return (
    <aside className="inspector">
      <div className="inspector-heading">
        <span className="eyebrow">TURNAROUND CONTROL</span>
        <span className="dot-menu">•••</span>
      </div>
      <div className="selected-flight">
        <span className="airline-mark" style={{ background: f.color }}>
          ✈
        </span>
        <div>
          <h2>
            {f.id}
            {f.urgent && <small className="urgent-tag">紧急</small>}
          </h2>
          <p>
            {f.airline} · {f.aircraft}
          </p>
        </div>
        <span className="flight-chip">{f.standId ?? "待分配"}</span>
      </div>
      <div className="route-detail">
        <strong>{f.from.split(" · ")[1]}</strong>
        <span>──────── ✈ ────────</span>
        <strong>{f.destination.split(" · ")[1]}</strong>
      </div>
      <div className="departure-info">
        <span>
          计划离港 <b>{clockLabel(f.deadline)}</b>
        </span>
        <span className={state.time > f.deadline ? "warning-text" : ""}>
          {statusLabels[f.status]}
        </span>
      </div>
      <StandPicker state={state} onAssign={onAssign} onSelect={onStand} />
      {f.status !== "incoming" && f.status !== "scheduled" && (
        <div className="stand-occupancy">
          <span>机位 {f.standId} · 服务位</span>
          <b>
            {
              state.services.filter(
                (t) =>
                  t.flightId === f.id &&
                  (t.status === "travel" || t.status === "working"),
              ).length
            }{" "}
            / 2 占用
          </b>
        </div>
      )}
      <ServicePanel state={state} onDispatch={onDispatch} />
      <button
        className="primary depart-button"
        data-testid="depart"
        disabled={!flightReady(state, f.id) || f.status !== "parked"}
        onClick={() => onChange(departFlight(state, f.id))}
      >
        {f.status === "departed"
          ? "已完成离港"
          : f.status === "departing"
            ? "飞机正在推出…"
            : "批准推出离港"}{" "}
        <span>→</span>
      </button>
      <VehicleDetail state={state} onTow={onTow} />
      <EventLog state={state} />
    </aside>
  );
}
