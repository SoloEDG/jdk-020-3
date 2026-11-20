import type { Shift } from "../../../shared/types";
import { MAINTENANCE } from "../../../shared/config";
import { occupiedFlight, compatibleStand } from "../lib/geometry";
import { Aircraft } from "./Aircraft";
interface Props {
  state: Shift;
  onStand: (id: string) => void;
  onFlight: (id: string) => void;
}
export function ApronMap({ state, onStand, onFlight }: Props) {
  const selected = state.flights.find((f) => f.id === state.selectedFlightId);
  return (
    <section className="map-shell">
      <div className="map-toolbar">
        <div>
          <span className="live-dot" />
          实时机坪 <span className="toolbar-en">APRON OVERVIEW</span>
        </div>
        <div className="weather">
          ↗ 240° / 06 KT <span>☀ 24°C</span>
        </div>
      </div>
      <svg
        viewBox="0 0 940 660"
        className="apron-svg"
        aria-label="交互机场机坪地图"
      >
        <defs>
          <pattern
            id="concrete"
            width="80"
            height="80"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M80 0H0V80"
              fill="none"
              stroke="#b7bcad"
              strokeWidth=".7"
            />
          </pattern>
          <pattern
            id="grass"
            width="13"
            height="13"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="3" cy="4" r=".8" fill="#a1aa8c" />
          </pattern>
          <filter id="shadow">
            <feDropShadow dx="0" dy="6" stdDeviation="6" floodOpacity=".13" />
          </filter>
        </defs>
        <rect width="940" height="660" fill="#c9cebd" />
        <rect width="940" height="660" fill="url(#grass)" />
        <path d="M0 140H940V565H0Z" fill="#d5d6c9" />
        <path d="M0 140H940V565H0Z" fill="url(#concrete)" />
        <path d="M0 355H940" stroke="#aab0a5" strokeWidth="64" />
        <path
          d="M0 355H940"
          stroke="#e7d48e"
          strokeWidth="2"
          strokeDasharray="14 10"
        />
        <path d="M0 606H940" stroke="#858f87" strokeWidth="65" />
        <path
          d="M0 606H940"
          stroke="#eeeade"
          strokeWidth="2"
          strokeDasharray="25 16"
        />
        <text x="45" y="612" className="runway-label">
          ← TAXIWAY A
        </text>
        <path
          d="M75 355V605M740 355V605"
          stroke="#e6cd79"
          strokeWidth="2"
          fill="none"
        />
        <path d="M150 118H730V144H150Z" fill="#949f99" />
        <rect
          x="120"
          y="35"
          width="640"
          height="86"
          rx="5"
          fill="#f0eee3"
          filter="url(#shadow)"
        />
        <path d="M130 105H750" stroke="#b0c0be" strokeWidth="20" />
        <path
          d="M130 105H750"
          stroke="#d9e4df"
          strokeWidth="12"
          strokeDasharray="25 4"
        />
        <text x="155" y="77" className="terminal-label">
          TERMINAL 01
        </text>
        <text x="634" y="77" className="terminal-sub">
          国内出发
        </text>
        {[220, 420, 650].map((x) => (
          <g key={x}>
            <path
              d={`M${x - 36} 119V155L${x - 9} 173`}
              stroke="#a8b3ab"
              strokeWidth="12"
              fill="none"
            />
            <path
              d={`M${x - 36} 119V155L${x - 9} 173`}
              stroke="#e9e8dc"
              strokeWidth="8"
              fill="none"
            />
          </g>
        ))}
        {state.stands.map((stand) => {
          const f = occupiedFlight(state, stand.id),
            active = state.selectedStandId === stand.id;
          const compatible = selected && compatibleStand(stand, selected);
          return (
            <g
              key={stand.id}
              className="stand-group"
              role="button"
              tabIndex={0}
              aria-label={`机位 ${stand.id}`}
              data-testid={`stand-${stand.id}`}
              onClick={() => {
                onStand(stand.id);
                if (f) onFlight(f.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") onStand(stand.id);
              }}
            >
              <rect
                x={stand.x - 82}
                y={stand.y - 80}
                width="164"
                height="155"
                rx="11"
                fill={active ? "#efc78c" : f ? "#c3ccbf" : "#cfd3c4"}
                fillOpacity={active ? 0.42 : 0.25}
                stroke={active ? "#cf7b3c" : f ? "#99ac9c" : "#b2b9a7"}
                strokeWidth={active ? 2 : 1}
                strokeDasharray={f ? undefined : "5 5"}
              />
              <path
                d={`M${stand.x} ${stand.y + 79}V${stand.y - 48}M${stand.x - 15} ${stand.y - 48}H${stand.x + 15}`}
                fill="none"
                stroke="#e9c76a"
                strokeWidth="2"
              />
              {f ? (
                <Aircraft
                  x={stand.x}
                  y={stand.y - 2}
                  color={f.color}
                  wide={f.size === "wide"}
                  departing={f.status === "departing"}
                />
              ) : (
                <text
                  x={stand.x}
                  y={stand.y}
                  textAnchor="middle"
                  className="stand-empty"
                >
                  ＋
                </text>
              )}
              <rect
                x={stand.x - 31}
                y={stand.y + 85}
                width="62"
                height="24"
                rx="4"
                fill={active ? "#293f46" : "#e9e7d9"}
              />
              <text
                x={stand.x}
                y={stand.y + 101}
                textAnchor="middle"
                fill={active ? "#fff" : "#546356"}
                className="stand-label"
              >
                {stand.id} {stand.size === "wide" ? "W" : ""}
              </text>
              {f && (
                <text
                  x={stand.x}
                  y={stand.y + 126}
                  textAnchor="middle"
                  className="plane-label"
                >
                  {f.id}
                </text>
              )}
              {!f && selected?.status === "incoming" && compatible && (
                <circle
                  cx={stand.x + 67}
                  cy={stand.y - 65}
                  r="4"
                  fill="#639b84"
                />
              )}
            </g>
          );
        })}
        <rect
          x="780"
          y="387"
          width="131"
          height="161"
          rx="5"
          fill="#bfC5b5"
          stroke="#a7af9d"
        />
        <text x="793" y="406" className="depot-label">
          GSE / MRO
        </text>
        {[0, 1, 2].map((n) => (
          <path
            key={n}
            d={`M788 ${496 + n * 26}H890`}
            stroke="#e8e4d2"
            strokeWidth="1"
          />
        ))}
        {state.maintenance.bays.map((bay) => {
          const job = state.maintenance.jobs.find((j) => j.bayId === bay.id);
          const point =
            MAINTENANCE.bays[
              state.maintenance.bays.findIndex((b) => b.id === bay.id)
            ];
          return (
            <g
              key={bay.id}
              className="bay-marker"
              transform={`translate(${point.x} ${point.y})`}
              data-testid={`bay-${bay.id}`}
            >
              <rect
                x="-22"
                y="-14"
                width="44"
                height="28"
                rx="3"
                fill={job ? "#e5d3b2" : "#d9ddcc"}
                stroke={job ? "#c29a62" : "#a9b19f"}
                strokeDasharray={job ? undefined : "3 3"}
              />
              <text y="3" textAnchor="middle" className="bay-label">
                {bay.id}
              </text>
              {job && (
                <circle
                  r="4"
                  cy="-19"
                  fill={job.state === "active" ? "#c8884d" : "#8ba199"}
                />
              )}
            </g>
          );
        })}
        {state.lane.blockedBy && (
          <g className="lane-block">
            <rect
              x="0"
              y="323"
              width="940"
              height="64"
              fill="#c26a4b"
              fillOpacity=".14"
            />
            <text x="14" y="318" className="lane-warning">
              APRON LANE BLOCKED · {state.lane.blockedBy} 故障车占道
            </text>
          </g>
        )}
        {state.vehicles.map((v) => (
          <g
            key={v.id}
            transform={`translate(${v.position.x} ${v.position.y})`}
            className={`vehicle-marker ${v.failure ? "failed" : ""} ${v.status === "waiting" ? "waiting" : ""}`}
          >
            <rect
              x="-10"
              y="-6"
              width="22"
              height="13"
              rx="3"
              fill={
                v.kind === "fuel"
                  ? "#dda24d"
                  : v.kind === "baggage"
                    ? "#4b9392"
                    : v.kind === "clean"
                      ? "#798cab"
                      : v.kind === "tow"
                        ? "#c66a4c"
                        : "#8b7cae"
              }
              stroke={v.failure ? "#a23e2c" : "#f3f0df"}
              strokeWidth="1.5"
            />
            <rect x="6" y="-4" width="4" height="8" rx="1" fill="#e5e9df" />
            <circle cx="-5" cy="7" r="2" fill="#3a4644" />
            <circle cx="7" cy="7" r="2" fill="#3a4644" />
            {v.status === "travel" && (
              <circle
                r="18"
                fill="none"
                stroke="#fff"
                strokeOpacity=".5"
                className="moving-ring"
              />
            )}
            {v.failure && (
              <g className="failure-badge">
                <circle r="19" fill="none" stroke="#c26a4b" strokeWidth="2" strokeDasharray="4 3" />
                <text y="-23" textAnchor="middle" className="failure-text">
                  {v.failure.type === "drive" ? "行驶故障" : "设备故障"}
                </text>
              </g>
            )}
            {v.status === "waiting" && (
              <text y="20" textAnchor="middle" className="waiting-text">
                排队
              </text>
            )}
          </g>
        ))}
        <g transform="translate(880 60)">
          <circle r="25" fill="#f3f1e8" fillOpacity=".8" />
          <path d="M0 -17L6 10L0 5L-6 10Z" fill="#334d50" />
          <text y="-32" textAnchor="middle" className="compass">
            N
          </text>
        </g>
        <text
          x="37"
          y="520"
          transform="rotate(-90 37 520)"
          className="map-side-label"
        >
          APRON 07 / EAST FIELD
        </text>
      </svg>
      <div className="map-legend">
        <span>
          <i className="legend-idle" />
          空闲机位
        </span>
        <span>
          <i className="legend-occupied" />
          保障中
        </span>
        <span>
          <i className="legend-selected" />
          当前选择
        </span>
        <span>
          <i className="legend-bay" />
          维修工位
        </span>
        <span>
          <i className="legend-failed" />
          故障车
        </span>
        <span className="map-scale">0 ━━━━━ 100 m</span>
      </div>
    </section>
  );
}
