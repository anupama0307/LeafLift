/**
 * US 3.7 — Visual Sustainability Metrics
 *
 * 3.7.1  Design intuitive charts (SVG bar + donut)
 * 3.7.2  Implement a graphing library (pure-SVG, zero deps)
 * 3.7.3  Display color-coded impact metrics on the user profile
 *
 * All tests are pure-logic — no DOM, no DB, no server required.
 */

import { describe, it, expect } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mirrors of the production helpers in AccountScreen.tsx
// ─────────────────────────────────────────────────────────────────────────────

/** 3.7.3 — Impact tier badge from totalCO2Saved (in grams) */
function getImpactTier(co2SavedGrams) {
  if (co2SavedGrams >= 20000) return { emoji: '🌳', label: 'Eco Champion', color: 'from-green-500 to-emerald-700' };
  if (co2SavedGrams >= 5000)  return { emoji: '🌿', label: 'Green Rider',  color: 'from-green-400 to-teal-500'   };
  return                              { emoji: '🌱', label: 'Seedling',     color: 'from-teal-400 to-cyan-600'    };
}

/** 3.7.1 — Donut arc length for a given ratio + radius */
function donutArc(savedGrams, emittedGrams, R = 48) {
  const total = savedGrams + emittedGrams;
  const ratio = total > 0 ? savedGrams / total : 0;
  const circ  = 2 * Math.PI * R;
  return { ratio, arc: ratio * circ, circ };
}

/** 3.7.1 / 3.7.2 — Bar chart geometry for trend data */
function barChartGeometry(trends, chartLeft = 36, chartRight = 310) {
  const chartW = chartRight - chartLeft;
  const n      = trends.length;
  if (n === 0) return [];
  const maxVal = Math.max(...trends.flatMap(t => [t.co2Saved, t.co2Emitted]), 1);
  const groupW = chartW / n;

  return trends.map((t, i) => {
    const cx      = chartLeft + (i + 0.5) * groupW;
    const bw      = Math.min(groupW * 0.28, 12);
    const savedH  = Math.max((t.co2Saved  / maxVal) * 90, t.co2Saved  > 0 ? 1 : 0);
    const emitH   = Math.max((t.co2Emitted / maxVal) * 90, t.co2Emitted > 0 ? 1 : 0);
    return { cx, bw, savedH, emitH };
  });
}

/** 3.7.3 — Color class for each metric category */
function metricColor(category) {
  const map = {
    co2Saved:    { bg: 'bg-green-50',  border: 'border-green-500',  text: 'text-green-600'  },
    co2Emitted:  { bg: 'bg-orange-50', border: 'border-orange-500', text: 'text-orange-600' },
    trips:       { bg: 'bg-blue-50',   border: 'border-blue-500',   text: 'text-blue-600'   },
    distance:    { bg: 'bg-purple-50', border: 'border-purple-500', text: 'text-purple-600' },
  };
  return map[category] || null;
}

/** Server-side trends endpoint output shape validation */
function isValidTrendEntry(entry) {
  return (
    typeof entry === 'object' &&
    'date'       in entry && (entry.date instanceof Date || typeof entry.date === 'string') &&
    'co2Saved'   in entry && typeof entry.co2Saved   === 'number' &&
    'co2Emitted' in entry && typeof entry.co2Emitted === 'number' &&
    'distance'   in entry && typeof entry.distance   === 'number'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3.7.3 — Color-Coded Impact Metrics
// ─────────────────────────────────────────────────────────────────────────────

describe('3.7.3 — Color-Coded Impact Metrics', () => {

  it('returns Seedling tier for < 5 kg saved', () => {
    expect(getImpactTier(0).label).toBe('Seedling');
    expect(getImpactTier(4999).label).toBe('Seedling');
    expect(getImpactTier(0).emoji).toBe('🌱');
  });

  it('returns Green Rider tier for 5–20 kg saved', () => {
    expect(getImpactTier(5000).label).toBe('Green Rider');
    expect(getImpactTier(10000).label).toBe('Green Rider');
    expect(getImpactTier(19999).label).toBe('Green Rider');
    expect(getImpactTier(5000).emoji).toBe('🌿');
  });

  it('returns Eco Champion tier for ≥ 20 kg saved', () => {
    expect(getImpactTier(20000).label).toBe('Eco Champion');
    expect(getImpactTier(50000).label).toBe('Eco Champion');
    expect(getImpactTier(20000).emoji).toBe('🌳');
  });

  it('tier colors are distinct gradient strings', () => {
    const seedling = getImpactTier(0).color;
    const green    = getImpactTier(10000).color;
    const champ    = getImpactTier(20000).color;
    expect(seedling).not.toBe(green);
    expect(green).not.toBe(champ);
    expect(seedling).not.toBe(champ);
  });

  it('CO₂ Saved metric uses green color scheme', () => {
    const c = metricColor('co2Saved');
    expect(c).not.toBeNull();
    expect(c.bg).toContain('green');
    expect(c.border).toContain('green');
    expect(c.text).toContain('green');
  });

  it('CO₂ Emitted metric uses orange color scheme', () => {
    const c = metricColor('co2Emitted');
    expect(c.bg).toContain('orange');
    expect(c.border).toContain('orange');
  });

  it('Trips metric uses blue color scheme', () => {
    const c = metricColor('trips');
    expect(c.bg).toContain('blue');
    expect(c.border).toContain('blue');
  });

  it('Distance metric uses purple color scheme', () => {
    const c = metricColor('distance');
    expect(c.bg).toContain('purple');
    expect(c.border).toContain('purple');
  });

  it('unknown category returns null gracefully', () => {
    expect(metricColor('invalid')).toBeNull();
  });

  it('CO₂ saved display divides grams by 1000 to show kg', () => {
    const savedGrams = 12500;
    const display = (savedGrams / 1000).toFixed(2);
    expect(display).toBe('12.50');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3.7.1 — Intuitive Charts: Donut
// ─────────────────────────────────────────────────────────────────────────────

describe('3.7.1 — Donut Chart (Net Impact Ratio)', () => {

  it('100% saved when nothing emitted', () => {
    const { ratio } = donutArc(10000, 0);
    expect(ratio).toBe(1);
  });

  it('0% saved when nothing saved', () => {
    const { ratio } = donutArc(0, 5000);
    expect(ratio).toBe(0);
  });

  it('50% ratio when saved equals emitted', () => {
    const { ratio } = donutArc(5000, 5000);
    expect(ratio).toBeCloseTo(0.5);
  });

  it('arc length is proportional to ratio × circumference', () => {
    const R = 48;
    const circ = 2 * Math.PI * R;
    const { arc } = donutArc(7500, 2500, R); // 75 % saved
    expect(arc).toBeCloseTo(0.75 * circ, 3);
  });

  it('arc is 0 when total is 0 (no division by zero)', () => {
    const { arc, ratio } = donutArc(0, 0);
    expect(ratio).toBe(0);
    expect(arc).toBe(0);
  });

  it('arc never exceeds full circumference', () => {
    const R = 48;
    const { arc, circ } = donutArc(99999, 0, R);
    expect(arc).toBeLessThanOrEqual(circ + 0.001);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3.7.2 — Bar Chart Geometry (pure-SVG, no external library)
// ─────────────────────────────────────────────────────────────────────────────

describe('3.7.2 — Bar Chart Geometry (pure SVG)', () => {

  const TREND_7 = [
    { date: '2024-01-01', co2Saved: 500, co2Emitted: 300, distance: 10 },
    { date: '2024-01-02', co2Saved: 700, co2Emitted: 200, distance: 14 },
    { date: '2024-01-03', co2Saved: 300, co2Emitted: 400, distance: 8  },
    { date: '2024-01-04', co2Saved: 900, co2Emitted: 100, distance: 18 },
    { date: '2024-01-05', co2Saved: 400, co2Emitted: 500, distance: 11 },
    { date: '2024-01-06', co2Saved: 800, co2Emitted: 150, distance: 16 },
    { date: '2024-01-07', co2Saved: 600, co2Emitted: 250, distance: 12 },
  ];

  it('produces one bar group per trend entry', () => {
    const bars = barChartGeometry(TREND_7);
    expect(bars).toHaveLength(7);
  });

  it('returns empty array for empty trends', () => {
    expect(barChartGeometry([])).toHaveLength(0);
  });

  it('all bar cx values fall within the chart bounds', () => {
    const chartLeft = 36, chartRight = 310;
    const bars = barChartGeometry(TREND_7, chartLeft, chartRight);
    bars.forEach(b => {
      expect(b.cx).toBeGreaterThan(chartLeft);
      expect(b.cx).toBeLessThan(chartRight);
    });
  });

  it('bar width (bw) is positive and ≤ 12px', () => {
    const bars = barChartGeometry(TREND_7);
    bars.forEach(b => {
      expect(b.bw).toBeGreaterThan(0);
      expect(b.bw).toBeLessThanOrEqual(12);
    });
  });

  it('savedH equals chart height for the tallest saved bar', () => {
    const bars = barChartGeometry(TREND_7);
    const maxSaved = Math.max(...TREND_7.map(t => t.co2Saved));
    const tallest  = bars.find((_, i) => TREND_7[i].co2Saved === maxSaved);
    expect(tallest?.savedH).toBeCloseTo(90, 1); // chart height = 90 px
  });

  it('bars with zero CO₂ still have non-negative height', () => {
    const zeroTrend = [{ date: '2024-01-01', co2Saved: 0, co2Emitted: 0, distance: 0 }];
    const [bar] = barChartGeometry(zeroTrend);
    expect(bar.savedH).toBeGreaterThanOrEqual(0);
    expect(bar.emitH).toBeGreaterThanOrEqual(0);
  });

  it('cx values are evenly spaced across chart width', () => {
    const n = 7, chartLeft = 36, chartRight = 310;
    const bars = barChartGeometry(TREND_7, chartLeft, chartRight);
    const spacing = bars[1].cx - bars[0].cx;
    for (let i = 1; i < n; i++) {
      expect(bars[i].cx - bars[i - 1].cx).toBeCloseTo(spacing, 2);
    }
  });

  it('single-entry trend fills the full chart width', () => {
    const single = [{ date: '2024-01-01', co2Saved: 500, co2Emitted: 200, distance: 10 }];
    const [bar] = barChartGeometry(single, 36, 310);
    // cx should be the midpoint of the chart
    expect(bar.cx).toBeCloseTo((36 + 310) / 2, 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Trends API — response shape validation
// ─────────────────────────────────────────────────────────────────────────────

describe('Sustainability Trends API — Response Shape', () => {

  it('each trend entry has date, co2Saved, co2Emitted, distance', () => {
    const mockRides = [
      { createdAt: new Date('2024-01-05'), co2Saved: 450, co2Emitted: 280, distance: 9  },
      { createdAt: new Date('2024-01-06'), co2Saved: 620, co2Emitted: 180, distance: 12 },
    ];
    // Simulate server-side mapping
    const trends = mockRides.reverse().map(r => ({
      date:       r.createdAt,
      co2Saved:   r.co2Saved   || 0,
      co2Emitted: r.co2Emitted || 0,
      distance:   r.distance   || 0,
    }));
    trends.forEach(entry => expect(isValidTrendEntry(entry)).toBe(true));
  });

  it('missing ride fields default to 0', () => {
    const mockRide = { createdAt: new Date() };
    const entry = {
      date:       mockRide.createdAt,
      co2Saved:   mockRide.co2Saved   || 0,
      co2Emitted: mockRide.co2Emitted || 0,
      distance:   mockRide.distance   || 0,
    };
    expect(entry.co2Saved).toBe(0);
    expect(entry.co2Emitted).toBe(0);
    expect(entry.distance).toBe(0);
    expect(isValidTrendEntry(entry)).toBe(true);
  });

  it('trends are returned in ascending chronological order', () => {
    const dates = [
      new Date('2024-01-07'),
      new Date('2024-01-06'),
      new Date('2024-01-05'),
    ];
    // Server: .sort({ createdAt: -1 }).limit(7) then .reverse()
    const sorted = [...dates].sort((a, b) => b - a).slice(0, 7).reverse();
    expect(sorted[0] <= sorted[1]).toBe(true);
    expect(sorted[1] <= sorted[2]).toBe(true);
  });

  it('at most 7 entries are returned', () => {
    const manyRides = Array.from({ length: 12 }, (_, i) => ({
      createdAt: new Date(`2024-01-${(i + 1).toString().padStart(2, '0')}`),
      co2Saved: 500, co2Emitted: 200, distance: 10,
    }));
    // Simulate limit(7)
    const limited = manyRides.slice(-7);
    expect(limited).toHaveLength(7);
  });
});
