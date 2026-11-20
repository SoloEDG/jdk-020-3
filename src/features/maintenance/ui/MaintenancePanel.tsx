import type { Shift, Vehicle } from "../../../shared/types";
import { MAINTENANCE, riskBand, riskText } from "../../../shared/config";
import { vehicleLabels } from "../../fleet";

// 标签描述的是磨损档位；故障概率永远以区间给出，二者不混为一谈。
const riskLabels = {
  low: "磨损低",
  guarded: "需关注",
  high: "磨损偏高",
  critical: "磨损严重",
} as const;

function WearTrack({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "travel" | "work";
}) {
  return (
    <span className={`wear-track ${tone}`}>
      <span>{label}</span>
      <i>
        <b style={{ width: `${Math.min(100, value)}%` }} />
      </i>
      <em>{Math.round(value)}</em>
    </span>
  );
}

export function MaintenancePanel({
  state,
  onPreventive,
  onExpedite,
  onSelectVehicle,
  onTow,
  onSelfRecover,
}: {
  state: Shift;
  onPreventive: (vehicleId: string) => void;
  onExpedite: (jobId: string) => void;
  onSelectVehicle: (id: string) => void;
  onTow: (vehicleId: string) => void;
  onSelfRecover: (vehicleId: string) => void;
}) {
  const bays = state.maintenance.bays;
  const jobs = state.maintenance.jobs;
  const serviceVehicles = state.vehicles.filter(
    (v) => v.kind !== "tow" && v.kind !== "repair",
  );
  const repairVehicles = state.vehicles.filter((v) => v.kind === "repair");

  return (
    <section className="maintenance-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">MAINTENANCE CONTROL</span>
          <h2>
            维修区{" "}
            <small>
              备用件 {state.maintenance.spares}/{MAINTENANCE.spareCapacity} ·
              工位 {bays.filter((b) => !b.jobId).length}/2 空闲
            </small>
          </h2>
        </div>
        <span className="fleet-hint">磨损分行驶 / 作业 · 风险只给区间</span>
      </div>

      <div className="maintenance-body">
        <div className="wear-list">
          {serviceVehicles.map((v) => {
            const band = riskBand(v.wear);
            const job = jobs.find((j) => j.vehicleId === v.id);
            const canPreventive =
              v.status === "idle" &&
              !job &&
              !v.failure &&
              state.maintenance.spares > 0;
            return (
              <div
                className={`wear-row ${v.id === state.selectedVehicleId ? "chosen" : ""} ${v.failure ? "failed" : ""}`}
                key={v.id}
              >
                <button
                  className="wear-name"
                  onClick={() => onSelectVehicle(v.id)}
                  data-testid={`wear-${v.id}`}
                  title="选中车辆查看详情"
                >
                  <strong>{v.id}</strong>
                  <span>{vehicleLabels[v.kind]}</span>
                </button>
                <div className="wear-bars">
                  <WearTrack label="行驶" value={v.wear.travel} tone="travel" />
                  <WearTrack label="作业" value={v.wear.work} tone="work" />
                  <span className={`risk-pill ${band.level}`}>
                    {riskLabels[band.level]} · 10s 内 {riskText(v.wear)}
                  </span>
                </div>
                <div className="wear-actions">
                  {v.failure ? (
                    v.failure.stranded ? (
                      <button
                        className="dispatch"
                        disabled={!!v.failure.towRequested}
                        title="行驶系故障只能由拖救车移走"
                        onClick={() => onTow(v.id)}
                        data-testid={`mnt-tow-${v.id}`}
                      >
                        {v.failure.towRequested ? "拖救在途" : "呼叫拖救"}
                      </button>
                    ) : (
                      <button
                        className="dispatch"
                        disabled={v.status !== "failed"}
                        title="设备故障可低速驶入已预留的工位"
                        onClick={() => onSelfRecover(v.id)}
                        data-testid={`mnt-self-${v.id}`}
                      >
                        {v.status === "failed" ? "驶入工位" : "在处置中"}
                      </button>
                    )
                  ) : job ? (
                    <span className="badge info">
                      {job.state === "active" ? "检修中" : "排队中"}
                    </span>
                  ) : (
                    <button
                      className="dispatch"
                      disabled={!canPreventive}
                      title={
                        canPreventive
                          ? "占用工位与 1 个备用件，消除大部分磨损"
                          : "只有待命车辆可以安排预防检修；需备用件与空工位"
                      }
                      onClick={() => onPreventive(v.id)}
                      data-testid={`preventive-${v.id}`}
                    >
                      预防检修
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="bay-list">
          {bays.map((bay) => {
            const job = jobs.find((j) => j.bayId === bay.id);
            const v = state.vehicles.find((x) =>
              job ? x.id === job.vehicleId : false,
            );
            const mx = state.vehicles.find((x) =>
              job ? x.id === job.repairVehicleId : false,
            );
            const pct =
              job && job.state === "active"
                ? 100 - (job.remaining / job.duration) * 100
                : 0;
            return (
              <div className={`bay-card ${job ? "busy" : "free"}`} key={bay.id}>
                <div className="bay-head">
                  <strong>{bay.id}</strong>
                  <span>{job ? (job.state === "active" ? "作业中" : "等待就位") : "空闲"}</span>
                </div>
                {job ? (
                  <>
                    <p>
                      {v?.id ?? job.vehicleId} ·{" "}
                      {job.mode === "preventive" ? "预防检修" : "故障抢修"}
                      {mx ? ` · ${mx.id}` : " · 等待机务车"}
                    </p>
                    <div className="task-track">
                      <i style={{ width: `${pct}%` }} />
                    </div>
                    <div className="bay-foot">
                      <span>
                        {job.state === "active"
                          ? `剩余 ${Math.ceil(job.remaining)}s`
                          : "已预留工位"}
                      </span>
                      {job.expedited && <span className="badge warning">已插队</span>}
                    </div>
                  </>
                ) : (
                  <p className="bay-empty">可接收下一辆检修车辆</p>
                )}
              </div>
            );
          })}
          <div className="bay-note">
            <span>机务车</span>
            {repairVehicles.map((v: Vehicle) => (
              <em key={v.id} className={v.status === "idle" ? "ok" : ""}>
                {v.id} · {v.status === "idle" ? "待命" : "作业中"}
              </em>
            ))}
          </div>
        </div>
      </div>

      {jobs.length > 0 && (
        <div className="job-queue">
          <span className="queue-label">维修队列</span>
          {jobs.map((job, i) => (
            <button
              key={job.id}
              className={`queue-item ${job.state}`}
              disabled={job.state !== "queued"}
              title={
                job.state === "queued"
                  ? "紧急插队：向原排队车辆说明预计延期"
                  : "作业已开始"
              }
              onClick={() => onExpedite(job.id)}
            >
              <b>{i + 1}</b>
              {job.vehicleId}
              <span>{job.bayId ?? "待分配"}</span>
              <em>
                {job.state === "active"
                  ? `剩余 ${Math.ceil(job.remaining)}s`
                  : Math.round(job.duration) + "s"}
              </em>
            </button>
          ))}
        </div>
      )}
      <p className="dependency-note">
        ↳ 预防检修可主动降低风险，但占用工位与备用件；冒险赶航班可能把故障留给途中。
        故障风险只显示区间，不会预告发生时刻。
      </p>
    </section>
  );
}
