/** mulberry32：把随机数状态放进存档，恢复后沿用同一序列。 */
export function nextRandom(seed: number): [value: number, seed: number] {
  const next = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(next ^ (next >>> 15), 1 | next);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

/** 一次时间步内至少发生一次的概率。 */
export function chanceOver(perSecond: number, seconds: number): number {
  return 1 - Math.pow(1 - Math.min(1, Math.max(0, perSecond)), seconds);
}
