import { describe, expect, it } from 'vitest';
import {
  buildCwvVerdict,
  buildSummary,
  getLhrRuntimeError,
  getMetricStatus,
  getScoreStatus,
  mapAllMetrics,
  mapDiagnostics,
  mapLhrToAuditResult,
  mapMetric,
  mapOpportunities,
} from '../src/mapping';
import type { MetricValue } from '../src/types';

describe('getLhrRuntimeError', () => {
  it('returns the message when runtimeError has a real code', () => {
    const lhr = {
      runtimeError: { code: 'DNS_FAILURE', message: 'DNS servers could not resolve the provided domain.' },
    };
    expect(getLhrRuntimeError(lhr)).toBe('DNS servers could not resolve the provided domain.');
  });

  it('returns null when runtimeError is absent', () => {
    expect(getLhrRuntimeError({})).toBeNull();
  });

  it('returns null when runtimeError.code is NO_ERROR', () => {
    const lhr = { runtimeError: { code: 'NO_ERROR', message: '' } };
    expect(getLhrRuntimeError(lhr)).toBeNull();
  });

  it('falls back to a generated message when code is set but message is empty', () => {
    const lhr = { runtimeError: { code: 'NO_FCP', message: '' } };
    expect(getLhrRuntimeError(lhr)).toBe('Lighthouse could not analyze this page (NO_FCP).');
  });
});

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

  it('strips markdown links from whyItHurts, leaving plain readable text', () => {
    const lhr = {
      audits: {
        'render-blocking-resources': {
          title: 'Eliminate render-blocking resources',
          description:
            'Resources are blocking render. See [this guide](https://web.dev/render-blocking) for details.',
          details: {
            type: 'opportunity',
            overallSavingsMs: 500,
            items: [],
          },
        },
      },
    };

    const result = mapOpportunities(lhr as any);

    expect(result).toHaveLength(1);
    expect(result[0].whyItHurts).toBe('Resources are blocking render. See this guide for details.');
    expect(result[0].whyItHurts).not.toContain('[');
    expect(result[0].whyItHurts).not.toContain(']');
    expect(result[0].whyItHurts).not.toContain('(');
    expect(result[0].whyItHurts).not.toContain('https://');
  });
});

describe('parseDisplayValue via mapMetric/mapAllMetrics', () => {
  it('splits a unit-bearing displayValue into numeric display and unit for LCP', () => {
    const lhr = {
      audits: {
        'largest-contentful-paint': {
          displayValue: '2.4 s',
          numericValue: 2400,
        },
        'cumulative-layout-shift': {
          displayValue: '0.05',
          numericValue: 0.05,
        },
      },
    };

    const lcp = mapMetric(lhr as any, 'lcp');
    expect(lcp.displayValue).toBe('2.4');
    expect(lcp.unit).toBe('s');
    expect(lcp.value).toBe(2400);
  });

  it('splits a unitless displayValue for CLS', () => {
    const lhr = {
      audits: {
        'largest-contentful-paint': {
          displayValue: '2.4 s',
          numericValue: 2400,
        },
        'cumulative-layout-shift': {
          displayValue: '0.05',
          numericValue: 0.05,
        },
      },
    };

    const cls = mapMetric(lhr as any, 'cls');
    expect(cls.displayValue).toBe('0.05');
    expect(cls.unit).toBe('');
    expect(cls.value).toBe(0.05);
  });

  it('applies the same parsing across all metrics via mapAllMetrics', () => {
    const lhr = {
      audits: {
        'largest-contentful-paint': { displayValue: '2.4 s', numericValue: 2400 },
        'cumulative-layout-shift': { displayValue: '0.05', numericValue: 0.05 },
      },
    };

    const metrics = mapAllMetrics(lhr as any);
    const lcp = metrics.find(m => m.id === 'lcp')!;
    const cls = metrics.find(m => m.id === 'cls')!;

    expect(lcp.displayValue).toBe('2.4');
    expect(lcp.unit).toBe('s');
    expect(cls.displayValue).toBe('0.05');
    expect(cls.unit).toBe('');
  });
});

describe('mapDiagnostics', () => {
  it('converts ms/bytes fields into the display-ready units the UI expects', () => {
    const lhr = {
      audits: {
        'server-response-time': { numericValue: 600 },
        'total-byte-weight': { numericValue: 2621440 },
        'dom-size': { numericValue: 1842 },
        'network-requests': {
          details: {
            items: [{ url: 'https://example.com/a.js' }, { url: 'https://example.com/b.css' }, { url: 'https://example.com/c.png' }],
          },
        },
      },
    };

    const diagnostics = mapDiagnostics(lhr as any);

    expect(diagnostics.ttfbSeconds).toBe(0.6);
    expect(diagnostics.transferSizeMB).toBe(2.5);
    expect(diagnostics.domSizeNodes).toBe(1842);
    expect(diagnostics.networkRequests).toBe(3);
  });
});

describe('buildSummary', () => {
  it('bolds the score and total savings figure in the summary sentence', () => {
    const opportunities = [
      {
        id: 'render-blocking-resources',
        title: 'Eliminate render-blocking resources',
        subtitle: 'Blocking render.',
        severity: 'high' as const,
        savingsMs: 1200,
        savingsDisplay: '−1.20s',
        whyItHurts: 'Blocking render.',
        estimatedImpact: '~1.20s faster FCP and LCP.',
        affectedResources: [],
      },
      {
        id: 'unused-css-rules',
        title: 'Remove unused CSS',
        subtitle: 'Unused rules.',
        severity: 'low' as const,
        savingsMs: 300,
        savingsDisplay: '−0.30s',
        whyItHurts: 'Unused rules.',
        estimatedImpact: '~0.30s faster FCP.',
        affectedResources: [],
      },
    ];

    const { sentence, boldValues } = buildSummary(72, 'mobile', opportunities);

    expect(boldValues).toEqual(['72', '~1.5s']);
    expect(sentence).toContain('**72**');
    expect(sentence).toContain('**~1.5s**');
    expect(sentence).toMatch(/\*\*[^*]+\*\*/);
  });

  it('flows through mapLhrToAuditResult into summaryBoldValues', () => {
    const lhr = {
      categories: { performance: { score: 0.72 } },
      audits: {
        'largest-contentful-paint': { displayValue: '2.4 s', numericValue: 2400 },
        'interaction-to-next-paint': { displayValue: '150 ms', numericValue: 150 },
        'cumulative-layout-shift': { displayValue: '0.05', numericValue: 0.05 },
        'total-blocking-time': { displayValue: '100 ms', numericValue: 100 },
        'speed-index': { displayValue: '2 s', numericValue: 2000 },
        'first-contentful-paint': { displayValue: '1 s', numericValue: 1000 },
        'render-blocking-resources': {
          title: 'Eliminate render-blocking resources',
          description: 'Resources are blocking render.',
          details: { type: 'opportunity', overallSavingsMs: 1200, items: [] },
        },
        'unused-css-rules': {
          title: 'Remove unused CSS',
          description: 'Unused rules increase bytes.',
          details: { type: 'opportunity', overallSavingsMs: 300, items: [] },
        },
      },
    };

    const result = mapLhrToAuditResult(lhr as any, 'https://example.com', 'mobile');

    expect(result.summaryBoldValues).toEqual(['72', '~1.5s']);
    expect(result.summarySentence).toContain('**72**');
    expect(result.summarySentence).toContain('**~1.5s**');
  });
});

describe('mapMetric measurable flag', () => {
  it('marks a metric not measurable when its audit is missing (lab INP)', () => {
    const lhr = {
      audits: {
        'largest-contentful-paint': { displayValue: '2.4 s', numericValue: 2400 },
        // no interaction-to-next-paint — lab navigation runs never produce it
      },
    };

    const inp = mapMetric(lhr as any, 'inp');
    expect(inp.measurable).toBe(false);
    expect(inp.displayValue).toBe('—');
    expect(inp.unit).toBe('');
    expect(inp.value).toBe(0);

    const lcp = mapMetric(lhr as any, 'lcp');
    expect(lcp.measurable).toBe(true);
    expect(lcp.displayValue).toBe('2.4');
  });
});

function metricStub(id: MetricValue['id'], label: string, status: MetricValue['status'], measurable = true): MetricValue {
  return {
    id,
    label,
    fullName: label,
    value: 0,
    unit: '',
    displayValue: '0',
    status,
    measurable,
    goodThreshold: 1,
    poorThreshold: 2,
  };
}

describe('buildCwvVerdict', () => {
  it('passes when lab LCP and CLS are both good', () => {
    const verdict = buildCwvVerdict([
      metricStub('lcp', 'LCP', 'good'),
      metricStub('cls', 'CLS', 'good'),
      metricStub('inp', 'INP', 'good', false),
    ]);
    expect(verdict.passes).toBe(true);
    expect(verdict.failing).toEqual([]);
    expect(verdict.note).toBe('Lab verdict from LCP + CLS. INP requires field data.');
  });

  it('fails and names the failing metric', () => {
    const verdict = buildCwvVerdict([
      metricStub('lcp', 'LCP', 'needs-improvement'),
      metricStub('cls', 'CLS', 'good'),
    ]);
    expect(verdict.passes).toBe(false);
    expect(verdict.failing).toEqual(['LCP']);
  });

  it('lists both LCP and CLS when both fail', () => {
    const verdict = buildCwvVerdict([
      metricStub('lcp', 'LCP', 'poor'),
      metricStub('cls', 'CLS', 'poor'),
    ]);
    expect(verdict.failing).toEqual(['LCP', 'CLS']);
  });

  it('ignores non-measurable LCP/CLS rather than failing them', () => {
    const verdict = buildCwvVerdict([
      metricStub('lcp', 'LCP', 'good', false),
      metricStub('cls', 'CLS', 'good'),
    ]);
    expect(verdict.passes).toBe(true);
  });
});
