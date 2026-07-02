import type { Status } from '../types';

export function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function statusLabel(status: Status): string {
  if (status === 'good') return 'Good';
  if (status === 'needs-improvement') return 'Needs Improvement';
  return 'Poor';
}

export function renderBoldSentence(sentence: string): { text: string; bold: boolean }[] {
  return sentence.split('**').map((chunk, i) => ({ text: chunk, bold: i % 2 === 1 }));
}

export function markerPercent(value: number, good: number, poor: number): number {
  if (value <= good) return (value / good) * 40;
  if (value <= poor) return 40 + ((value - good) / (poor - good)) * 30;
  const overshoot = Math.min(1, (value - poor) / poor);
  return 70 + overshoot * 30;
}
