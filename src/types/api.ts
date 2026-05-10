// Monetary amounts are always integer cents. Never use plain number for money fields.
export type CentsAmount = number;

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
  };
}

export interface SuccessEnvelope<T> {
  data: T;
}

export interface BillDTO {
  id: string;
  shareToken: string;
  title: string | null;
  currencyCode: string;
  subtotalCents: CentsAmount;
  taxCents: CentsAmount;
  tipCents: CentsAmount;
  serviceChargeCents: CentsAmount;
  totalCents: CentsAmount;
  status: 'draft' | 'finalized' | 'expired';
  revision: number;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ParticipantDTO {
  id: string;
  billId: string;
  displayName: string;
  participantOrder: number;
  participantToken: string;
  createdAt: string;
}

export interface BillItemDTO {
  id: string;
  billId: string;
  name: string;
  quantity: number;
  unitPriceCents: CentsAmount;
  lineTotalCents: CentsAmount;
  createdAt: string;
}

export interface ItemAllocationDTO {
  id: string;
  billId: string;
  itemId: string;
  participantId: string;
  allocatedCents: CentsAmount;
  createdAt: string;
}

export interface ParticipantTotalDTO {
  participantId: string;
  billId: string;
  subtotalCents: CentsAmount;
  taxCents: CentsAmount;
  tipCents: CentsAmount;
  serviceChargeCents: CentsAmount;
  totalOwedCents: CentsAmount;
  remainderCents: CentsAmount;
  remainderPolicy: string;
  remainderTrace: unknown;
  computedAt: string;
}
