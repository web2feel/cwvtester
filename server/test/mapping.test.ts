import { describe, expect, it } from 'vitest';
import {
  buildCwvVerdict,
  buildSummary,
  getLhrRuntimeError,
  getMetricStatus,
  getScoreStatus,
  mapAllMetrics,
  mapCulprits,
  mapDiagnostics,
  mapLhrToAuditResult,
  mapMetric,
  mapOpportunities,
  resourceDisplayName,
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

describe('resourceDisplayName', () => {
  it('returns the filename for same-origin resources', () => {
    expect(resourceDisplayName('https://example.com/js/app.js', 'https://example.com/')).toBe('app.js');
  });

  it('prefixes the hostname for cross-origin resources', () => {
    expect(resourceDisplayName('https://cdn.example.com/js/app.js', 'https://example.com/')).toBe(
      'cdn.example.com · app.js'
    );
  });

  it('falls back to the hostname when the path has no filename', () => {
    expect(resourceDisplayName('https://cdn.example.com/', 'https://example.com/')).toBe(
      'cdn.example.com · cdn.example.com'
    );
  });

  it('returns the raw string when the resource URL is unparseable', () => {
    expect(resourceDisplayName('not a url', 'https://example.com/')).toBe('not a url');
  });
});

describe('mapOpportunities affects + byte-only', () => {
  it('derives affects and per-metric impact from metricSavings', () => {
    const lhr = {
      audits: {
        'unused-javascript': {
          title: 'Reduce unused JavaScript',
          description: 'Remove dead code.',
          metricSavings: { LCP: 500, FCP: 100, CLS: 0 },
          details: { type: 'opportunity', overallSavingsMs: 600, items: [] },
        },
      },
    };
    const result = mapOpportunities(lhr as any);
    expect(result[0].affects).toEqual(['LCP', 'FCP']);
    expect(result[0].estimatedImpact).toBe('~0.50s faster LCP · ~0.10s faster FCP.');
  });

  it('formats CLS metricSavings in CLS units, not seconds', () => {
    const lhr = {
      audits: {
        'some-cls-fix': {
          title: 'Fix layout shifts',
          description: 'Reserve space.',
          metricSavings: { CLS: 0.12 },
          details: { type: 'opportunity', overallSavingsMs: 50, items: [] },
        },
      },
    };
    const result = mapOpportunities(lhr as any);
    expect(result[0].affects).toEqual(['CLS']);
    expect(result[0].estimatedImpact).toBe('−0.12 CLS.');
  });

  it('falls back to the audit lookup table when metricSavings is absent', () => {
    const lhr = {
      audits: {
        'render-blocking-resources': {
          title: 'Eliminate render-blocking resources',
          description: 'Blocking render.',
          details: { type: 'opportunity', overallSavingsMs: 500, items: [] },
        },
      },
    };
    const result = mapOpportunities(lhr as any);
    expect(result[0].affects).toEqual(['FCP', 'LCP']);
  });

  it('includes byte-only opportunities above the 10 KB floor with byte severity and display', () => {
    const lhr = {
      audits: {
        'big-bytes': {
          title: 'Serve smaller payloads',
          description: 'Big payloads.',
          details: { type: 'opportunity', overallSavingsMs: 0, overallSavingsBytes: 524288, items: [] },
        },
        'tiny-bytes': {
          title: 'Trivial savings',
          description: 'Too small to bother.',
          details: { type: 'opportunity', overallSavingsMs: 0, overallSavingsBytes: 5000, items: [] },
        },
      },
    };
    const result = mapOpportunities(lhr as any);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('big-bytes');
    expect(result[0].severity).toBe('high'); // >= 500 KB
    expect(result[0].savingsBytes).toBe(524288);
    expect(result[0].savingsDisplay).toBe('−512 KB');
    expect(result[0].estimatedImpact).toBe('512 KB less to download.');
  });

  it('sorts ms-savings opportunities ahead of byte-only ones', () => {
    const lhr = {
      audits: {
        'byte-only': {
          title: 'Byte only',
          description: 'Bytes.',
          details: { type: 'opportunity', overallSavingsMs: 0, overallSavingsBytes: 204800, items: [] },
        },
        'ms-savings': {
          title: 'Time savings',
          description: 'Time.',
          details: { type: 'opportunity', overallSavingsMs: 400, items: [] },
        },
      },
    };
    const result = mapOpportunities(lhr as any);
    expect(result.map(o => o.id)).toEqual(['ms-savings', 'byte-only']);
  });

  it('names cross-origin affected resources with their hostname', () => {
    const lhr = {
      audits: {
        'render-blocking-resources': {
          title: 'Eliminate render-blocking resources',
          description: 'Blocking render.',
          details: {
            type: 'opportunity',
            overallSavingsMs: 500,
            items: [{ url: 'https://cdn.example.com/lib/vendor.js', totalBytes: 102400 }],
          },
        },
      },
    };
    const result = mapOpportunities(lhr as any, 'https://example.com/');
    expect(result[0].affectedResources).toEqual([{ name: 'cdn.example.com · vendor.js', size: '100 KB' }]);
  });
});

describe('mapOpportunities severity tier boundaries', () => {
  function lhrWith(savingsMs: number, savingsBytes?: number) {
    return {
      audits: {
        'the-audit': {
          title: 'Audit',
          description: 'Desc.',
          details: {
            type: 'opportunity',
            overallSavingsMs: savingsMs,
            ...(savingsBytes !== undefined ? { overallSavingsBytes: savingsBytes } : {}),
            items: [],
          },
        },
      },
    };
  }

  it('applies ms severity boundaries at 800 and 300', () => {
    expect(mapOpportunities(lhrWith(800) as any)[0].severity).toBe('high');
    expect(mapOpportunities(lhrWith(799) as any)[0].severity).toBe('medium');
    expect(mapOpportunities(lhrWith(300) as any)[0].severity).toBe('medium');
    expect(mapOpportunities(lhrWith(299) as any)[0].severity).toBe('low');
  });

  it('applies byte severity boundaries at 512000 and 102400 when ms is zero', () => {
    expect(mapOpportunities(lhrWith(0, 512000) as any)[0].severity).toBe('high');
    expect(mapOpportunities(lhrWith(0, 511999) as any)[0].severity).toBe('medium');
    expect(mapOpportunities(lhrWith(0, 102400) as any)[0].severity).toBe('medium');
    expect(mapOpportunities(lhrWith(0, 102399) as any)[0].severity).toBe('low');
  });

  it('includes exactly at the 10 KB byte floor and excludes just below it', () => {
    expect(mapOpportunities(lhrWith(0, 10240) as any)).toHaveLength(1);
    expect(mapOpportunities(lhrWith(0, 10240) as any)[0].severity).toBe('low');
    expect(mapOpportunities(lhrWith(0, 10239) as any)).toHaveLength(0);
  });

  it('uses ms severity, not byte severity, when both ms and large bytes are present', () => {
    expect(mapOpportunities(lhrWith(100, 600000) as any)[0].severity).toBe('low');
  });
});

describe('mapCulprits', () => {
  const page = 'https://example.com/';

  it('extracts the LCP element and phase breakdown when LCP is failing', () => {
    const lhr = {
      audits: {
        'largest-contentful-paint-element': {
          details: {
            items: [
              { items: [{ node: { selector: 'div.hero > img', snippet: '<img src="hero.jpg">', nodeLabel: 'Hero image' } }] },
              {
                items: [
                  { phase: 'TTFB', timing: 600 },
                  { phase: 'Load Delay', timing: 1200 },
                  { phase: 'Load Time', timing: 800 },
                  { phase: 'Render Delay', timing: 400 },
                ],
              },
            ],
          },
        },
      },
    };
    const groups = mapCulprits(lhr as any, [metricStub('lcp', 'LCP', 'poor')], page);
    expect(groups).toHaveLength(1);
    expect(groups[0].metricId).toBe('lcp');
    expect(groups[0].metricLabel).toBe('LCP');
    expect(groups[0].items[0]).toEqual({ label: 'div.hero > img', detail: '<img src="hero.jpg">' });
    expect(groups[0].items[1]).toEqual({ label: 'TTFB', value: '600 ms' });
    expect(groups[0].items).toHaveLength(5); // element + 4 phases, capped at 5
  });

  it('extracts shifted elements from layout-shifts when CLS is failing', () => {
    const lhr = {
      audits: {
        'layout-shifts': {
          details: { items: [{ node: { selector: 'header.banner' }, score: 0.18 }] },
        },
      },
    };
    const groups = mapCulprits(lhr as any, [metricStub('cls', 'CLS', 'needs-improvement')], page);
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toEqual([{ label: 'header.banner', value: 'shift 0.18' }]);
  });

  it('falls back to layout-shift-elements for older Lighthouse output', () => {
    const lhr = {
      audits: {
        'layout-shift-elements': {
          details: { items: [{ node: { nodeLabel: 'Cookie banner' }, score: 0.3 }] },
        },
      },
    };
    const groups = mapCulprits(lhr as any, [metricStub('cls', 'CLS', 'poor')], page);
    expect(groups[0].items).toEqual([{ label: 'Cookie banner', value: 'shift 0.3' }]);
  });

  it('extracts long tasks and blocking third parties when TBT is failing', () => {
    const lhr = {
      audits: {
        'long-tasks': {
          details: { items: [{ url: 'https://cdn.example.com/vendor.js', duration: 310 }] },
        },
        'third-party-summary': {
          details: {
            items: [
              { entity: 'Google Tag Manager', blockingTime: 250 },
              { entity: 'Harmless', blockingTime: 0 },
            ],
          },
        },
      },
    };
    const groups = mapCulprits(lhr as any, [metricStub('tbt', 'TBT', 'poor')], page);
    expect(groups[0].items).toEqual([
      { label: 'cdn.example.com · vendor.js', value: '310 ms' },
      { label: 'Google Tag Manager', value: '250 ms' },
    ]);
  });

  it('omits groups for passing metrics and for metrics with no extractable culprits', () => {
    const lhr = {
      audits: {
        'layout-shifts': { details: { items: [{ node: { selector: 'div.a' }, score: 0.2 }] } },
      },
    };
    const groups = mapCulprits(
      lhr as any,
      [metricStub('cls', 'CLS', 'good'), metricStub('lcp', 'LCP', 'poor'), metricStub('tbt', 'TBT', 'poor')],
      page
    );
    expect(groups).toEqual([]); // CLS is good; LCP/TBT failing but their audits are absent
  });
});
