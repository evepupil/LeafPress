/** 固定种子的伪随机数：同一个种子每次生成同一串数，演示数据每次打开都一样 */
export function seededRandom(seed: string): () => number {
  let state = hash(seed)
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

function hash(text: string): number {
  let h = 2_166_136_261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16_777_619)
  }
  return h >>> 0
}

/**
 * 把一个整数总量按权重拆成整数，拆完加起来正好等于总量（最大余数法）。
 * 每天的阅读按这个拆，保证「每天加起来 = 累计数」。
 */
export function splitInteger(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (weights.length === 0 || sum <= 0) return weights.map(() => 0)
  const raw = weights.map((w) => (total * w) / sum)
  const out = raw.map(Math.floor)
  let rest = total - out.reduce((a, b) => a + b, 0)
  const order = raw.map((value, index) => ({ index, frac: value - Math.floor(value) })).sort((a, b) => b.frac - a.frac || a.index - b.index)
  for (const { index } of order) {
    if (rest <= 0) break
    out[index] += 1
    rest -= 1
  }
  return out
}
