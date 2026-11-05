/** Artificial network latency (200-400 ms) so loading states are visible. */
export const delay = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 200 + Math.random() * 200));

/** Never hand out references into the in-memory "database". */
export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
