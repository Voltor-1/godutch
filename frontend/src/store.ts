// ── Session store ─────────────────────────────────────────────────
// In-memory session state. localStorage used only for participant_token persistence.

import type { SessionSnapshot, ParticipantTotalDTO } from './api';

// ── localStorage helpers ──────────────────────────────────────────
const LS_PREFIX = 'godutch_participant_';

export interface StoredParticipant {
  participantId: string;
  participantToken: string;
  displayName: string;
}

export function storeParticipant(shareToken: string, data: StoredParticipant): void {
  localStorage.setItem(LS_PREFIX + shareToken, JSON.stringify(data));
}

export function getStoredParticipant(shareToken: string): StoredParticipant | null {
  const raw = localStorage.getItem(LS_PREFIX + shareToken);
  if (!raw) return null;
  try { return JSON.parse(raw) as StoredParticipant; } catch { return null; }
}

export function clearStoredParticipant(shareToken: string): void {
  localStorage.removeItem(LS_PREFIX + shareToken);
}

// ── In-memory session state ───────────────────────────────────────
export interface SessionState {
  snapshot: SessionSnapshot | null;
  totals: ParticipantTotalDTO[] | null;
  lastFetchedAt: number | null;
  error: string | null;
}

export function createSessionState(): SessionState {
  return { snapshot: null, totals: null, lastFetchedAt: null, error: null };
}

// ── Currency display helpers ──────────────────────────────────────
// These are display-only. Never use for computation.
export function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function dollarsToCents(dollars: string): number {
  return Math.round(parseFloat(dollars) * 100);
}

export function formatCurrency(cents: number, currencyCode = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: currencyCode,
    }).format(cents / 100);
  } catch {
    return `${currencyCode} ${centsToDollars(cents)}`;
  }
}
