import type { Shift } from "../../../shared/types";
import { validateShift, salvageShift } from "./validation";

const key = "apron07-shift-v2";
const legacyKeys = ["apron07-shift-v1"];

export function saveShift(state: Shift): void {
  localStorage.setItem(key, JSON.stringify(state));
}

/**
 * 恢复存档：只接受完整一致的快照。不为了“能读”而修正故障车状态——
 * 若快照里故障车被改成空闲，校验会拒绝，而不是默默修好车辆。
 */
export function loadShift(): Shift | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const value: unknown = JSON.parse(raw);
      return validateShift(value);
    }
    for (const legacy of legacyKeys) {
      const old = localStorage.getItem(legacy);
      if (!old) continue;
      const migrated = salvageShift(JSON.parse(old));
      if (migrated) return migrated;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function clearShift(): void {
  localStorage.removeItem(key);
  for (const k of legacyKeys) localStorage.removeItem(k);
}
