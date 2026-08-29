'use client';

export const LCP_BUDGET = 2500;
export const FID_BUDGET = 100;
export const CLS_BUDGET = 0.1;

const BUDGETS: Record<string, number> = {
  LCP: LCP_BUDGET,
  FID: FID_BUDGET,
  INP: FID_BUDGET,
  CLS: CLS_BUDGET,
};

interface Metric {
  name: string;
  value: number;
  id: string;
  delta: number;
}

function sendToAnalytics(metric: Metric) {
  const isDev = process.env.NODE_ENV === 'development';

  const budget = BUDGETS[metric.name];
  if (budget !== undefined && metric.value > budget) {
    console.warn(
      `[webVitals] ${metric.name} exceeded budget: ${metric.value.toFixed(2)} (budget: ${budget})`
    );
  }

  if (isDev) {
    console.log(`[webVitals] ${metric.name}: ${metric.value.toFixed(2)}`);
    return;
  }

  const body = JSON.stringify({
    name: metric.name,
    value: metric.value,
    id: metric.id,
    delta: metric.delta,
  });

  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    const blob = new Blob([body], { type: 'application/json' });
    navigator.sendBeacon('/api/v1/metrics', blob);
  }
}

export function reportWebVitals() {
  import('web-vitals')
    .then(({ onCLS, onFCP, onLCP, onTTFB, onINP }) => {
      onCLS(sendToAnalytics);
      onFCP(sendToAnalytics);
      onLCP(sendToAnalytics);
      onTTFB(sendToAnalytics);
      onINP(sendToAnalytics);
    })
    .catch(() => {
      // web-vitals not installed; silently skip
    });
}
