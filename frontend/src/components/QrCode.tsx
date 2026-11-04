// Visual placeholder QR: a deterministic pattern derived from the token (finder squares + noise).
// Swap for a real QR library when the backend issues real tokens.
const N = 25;

function cells(token: string): boolean[][] {
  let seed = 2166136261;
  for (let i = 0; i < token.length; i++) seed = Math.imul(seed ^ token.charCodeAt(i), 16777619) >>> 0;
  const rnd = () => {
    seed ^= seed << 13;
    seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    seed >>>= 0;
    return seed / 4294967296;
  };
  const grid = Array.from({ length: N }, () => Array.from({ length: N }, () => rnd() > 0.52));
  const finder = (r0: number, c0: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = r0 + r;
        const cc = c0 + c;
        if (rr < 0 || cc < 0 || rr >= N || cc >= N) continue;
        const ring = r === 0 || r === 6 || c === 0 || c === 6;
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        grid[rr][cc] = r >= 0 && r <= 6 && c >= 0 && c <= 6 && (ring || core);
      }
    }
  };
  finder(0, 0);
  finder(0, N - 7);
  finder(N - 7, 0);
  return grid;
}

export function QrCode({ token, size = 200 }: { token: string; size?: number }) {
  const grid = cells(token);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${N + 2} ${N + 2}`} role="img" aria-label={`QR code ${token}`} shapeRendering="crispEdges">
      <rect width={N + 2} height={N + 2} fill="#fff" />
      {grid.map((row, r) =>
        row.map((on, c) => (on ? <rect key={`${r}-${c}`} x={c + 1} y={r + 1} width="1" height="1" fill="#1E2235" /> : null)),
      )}
    </svg>
  );
}
