import { useEffect, useState } from "react";
import type { Shift } from "../shared/types";
import { advanceClock, createShift } from "../features/session";
import { advanceFleet } from "../features/fleet";
import { advanceServices } from "../features/services";
import { advanceMaintenance } from "../features/maintenance";

/**
 * 一个时间步内的推进顺序：
 * 时钟 → 车队（含故障判定、拖救、通道）→ 维修工位 → 保障作业。
 * 保障放在最后，确保换车与故障不会在中途被误判完成。
 */
export function stepShift(state: Shift, dt: number): Shift {
  if (state.paused) return state;
  const clocked = advanceClock(state, dt);
  const fleet = advanceFleet(clocked, dt);
  const maintained = advanceMaintenance(fleet, dt);
  return advanceServices(maintained, dt);
}

export function useSimulation() {
  const [state, setState] = useState<Shift>(createShift);
  useEffect(() => {
    let previous = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now(),
        elapsed = Math.min((now - previous) / 1000, 1);
      previous = now;
      setState((s) => (s.paused ? s : stepShift(s, elapsed * s.speed)));
    }, 100);
    return () => window.clearInterval(id);
  }, []);
  return [state, setState] as const;
}
