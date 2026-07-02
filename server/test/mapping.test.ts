import { describe, expect, it } from 'vitest';
import { getMetricStatus, getScoreStatus, mapOpportunities } from '../src/mapping';

describe('getMetricStatus', () => {
  it('classifies LCP against the 2.5s/4s thresholds', () => {
    expect(getMetricStatus('lcp', 2000)).toBe('good');
    expect(getMetricStatus('lcp', 3000)).toBe('needs-improvement');
    expect(getMetricStatus('lcp', 5000)).toBe('poor');
  });

  it('classifies CLS against the 0.1/0.25 thresholds', () => {
    expect(getMetricStatus('cls', 0.05)).toBe('good');
    expect(getMetricStatus('cls', 0.2)).toBe('needs-improvement');
    expect(getMetricStatus('cls', 0.3)).toBe('poor');
  });
});

describe('getScoreStatus', () => {
  it('classifies score bands at 90/50', () => {
    expect(getScoreStatus(95)).toBe('good');
    expect(getScoreStatus(64)).toBe('needs-improvement');
    expect(getScoreStatus(30)).toBe('poor');
  });
});

describe('mapOpportunities', () => {
  it('extracts opportunity-type audits, sorted by savings, and ignores non-opportunities', () => {
    const lhr = {
      audits: {
        'render-blocking-resources': {
          title: 'Eliminate render-blocking resources',
          description: 'These resources are blocking the first paint of your page. Consider delivering critical JS/CSS inline.',
          details: {
            type: 'opportunity',
            overallSavingsMs: 1200,
            items: [{ url: 'https://example.com/main.css', totalBytes: 49152 }],
          },
        },
        'unused-css-rules': {
          title: 'Remove unused CSS',
          description: 'Reduce unused rules from stylesheets to decrease bytes consumed by network activity.',
          details: { type: 'opportunity', overallSavingsMs: 200, items: [] },
        },
        'not-an-opportunity': {
          title: 'Some diagnostic',
          description: 'Not an opportunity.',
          details: { type: 'table', overallSavingsMs: 999999, items: [] },
        },
        'zero-savings': {
          title: 'Zero savings opportunity',
          description: 'Should be excluded.',
          details: { type: 'opportunity', overallSavingsMs: 0, items: [] },
        },
      },
    };

    const result = mapOpportunities(lhr as any);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('render-blocking-resources');
    expect(result[0].severity).toBe('high');
    expect(result[0].savingsDisplay).toBe('−1.20s');
    expect(result[0].affectedResources).toEqual([{ name: 'main.css', size: '48 KB' }]);
    expect(result[1].id).toBe('unused-css-rules');
    expect(result[1].severity).toBe('low');
  });
});
