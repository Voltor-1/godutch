// ── API client ────────────────────────────────────────────────────
// All monetary values in API requests/responses are integer cents.
// Currency display conversion happens only at the UI layer.

const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? '';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new ApiError(json.error?.code ?? 'UNKNOWN', json.error?.message ?? 'Request failed', res.status);
  }
  return json.data as T;
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ── Types ─────────────────────────────────────────────────────────
export type CentsAmount = number;

export interface BillDTO {
  id: string; shareToken: string; title: string | null; currencyCode: string;
  subtotalCents: CentsAmount; taxCents: CentsAmount; tipCents: CentsAmount;
  serviceChargeCents: CentsAmount; totalCents: CentsAmount;
  status: 'draft' | 'finalized' | 'expired'; revision: number;
  expiresAt: string; createdAt: string; updatedAt: string;
}

export interface ParticipantDTO {
  id: string; billId: string; displayName: string;
  participantOrder: number; participantToken?: string; createdAt: string;
}

export interface BillItemDTO {
  id: string; billId: string; name: string; quantity: number;
  unitPriceCents: CentsAmount; lineTotalCents: CentsAmount; createdAt: string;
}

export interface SessionSnapshot {
  bill: BillDTO;
  participants: ParticipantDTO[];
  items: BillItemDTO[];
  splitRules: SplitRuleDTO[];
}

export interface SplitRuleDTO {
  id: string; billId: string; splitMode: 'items' | 'percentage' | 'fixed';
  isActive: boolean; configJson: unknown; createdAt: string;
}

export interface ParticipantTotalDTO {
  participantId: string; subtotalCents: CentsAmount; taxCents: CentsAmount;
  tipCents: CentsAmount; serviceChargeCents: CentsAmount;
  totalOwedCents: CentsAmount; remainderCents: CentsAmount;
  remainderPolicy: string; remainderTrace: unknown; computedAt: string;
}

// ── API functions ─────────────────────────────────────────────────
export function createSession(body: {
  title?: string; currencyCode?: string;
  subtotalCents: number; taxCents: number; tipCents: number; serviceChargeCents: number;
}): Promise<BillDTO> {
  return apiFetch('/sessions', { method: 'POST', body: JSON.stringify(body) });
}

export function getSession(token: string): Promise<SessionSnapshot> {
  return apiFetch(`/sessions/${token}`);
}

export function addParticipant(token: string, displayName: string): Promise<ParticipantDTO> {
  return apiFetch(`/sessions/${token}/participants`, {
    method: 'POST', body: JSON.stringify({ displayName }),
  });
}

export function addItem(token: string, body: { name: string; quantity: number; unitPriceCents: number }): Promise<BillItemDTO> {
  return apiFetch(`/sessions/${token}/items`, { method: 'POST', body: JSON.stringify(body) });
}

export function upsertAllocation(token: string, body: {
  participantToken: string; itemId: string; allocatedCents: number;
}): Promise<unknown> {
  return apiFetch(`/sessions/${token}/allocations`, { method: 'POST', body: JSON.stringify(body) });
}

export function setSplitMode(token: string, mode: 'items' | 'percentage' | 'fixed', configJson?: unknown): Promise<unknown> {
  return apiFetch(`/sessions/${token}/split-mode`, { method: 'POST', body: JSON.stringify({ mode, configJson }) });
}

export function computeSplit(token: string): Promise<ParticipantTotalDTO[]> {
  return apiFetch(`/sessions/${token}/compute`, { method: 'POST' });
}

export function finalizeSession(token: string): Promise<unknown> {
  return apiFetch(`/sessions/${token}/finalize`, { method: 'POST' });
}

export function getAuditLog(token: string): Promise<unknown> {
  return apiFetch(`/sessions/${token}/audit`);
}


export function deleteSession(token: string, participantToken: string): Promise<{ deleted: true }> {
  return apiFetch(`/sessions/${token}`, {
    method: 'DELETE',
    body: JSON.stringify({ participantToken }),
  });
}
