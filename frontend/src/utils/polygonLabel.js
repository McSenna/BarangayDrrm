/**
 * Where to put a label inside a polygon ring of [lng, lat] positions.
 *
 * Uses the area centroid when it falls inside the ring. For a concave ring
 * whose centroid is outside, it scans a horizontal line through the centroid
 * and returns the middle of the widest stretch that is inside the ring, so a
 * label is never drawn outside its own Purok. Returns [lat, lng].
 */
function centroid(ring) {
  let a = 0, x = 0, y = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const f = x0 * y1 - x1 * y0;
    a += f;
    x += (x0 + x1) * f;
    y += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-14) {
    const n = ring.length - 1;
    return ring.slice(0, n).reduce(([sx, sy], [px, py]) => [sx + px / n, sy + py / n], [0, 0]);
  }
  return [x / (3 * a), y / (3 * a)];
}

function inside([px, py], ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

export function labelPoint(ring) {
  if (!ring || ring.length < 4) return null;
  const c = centroid(ring);
  if (inside(c, ring)) return [c[1], c[0]];
  const y = c[1];
  const xs = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    if (y0 > y !== y1 > y) xs.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
  }
  xs.sort((p, q) => p - q);
  let best = null;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    if (!best || xs[i + 1] - xs[i] > best[1] - best[0]) best = [xs[i], xs[i + 1]];
  }
  return best ? [y, (best[0] + best[1]) / 2] : [c[1], c[0]];
}
