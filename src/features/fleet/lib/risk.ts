import type { Vehicle } from "../../../shared/types";
import { riskText } from "../../../shared/config";

/** 风险提示只给区间，绝不返回具体故障时刻。 */
export function riskHint(v: Vehicle): string {
  return `10 秒内故障风险 ${riskText(v.wear)}`;
}
