/**
 * compute.ts — Pure deterministic split calculation functions.
 * No Supabase imports. No side effects. All arithmetic in integer cents.
 *
 * Largest-remainder method:
 * 1. Floor each exact share to get base integer allocations.
 * 2. Compute remainder fractions for each participant.
 * 3. Rank by remainder descending, tie-break by participant_order ascending.
 * 4. Distribute undistributed cents (one per participant) to top-ranked.
 * 5. Verify: SUM of all allocations === total_cents exactly.
 */

export interface ParticipantInput {
  id: string;
  participantOrder: number;
}

export interface ComputeResultRow {
  participantId: string;
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  serviceChargeCents: number;
  totalOwedCents: number;
  remainderCents: number;
  remainderPolicy: string;
  remainderTrace: RemainderTrace;
}

export interface RemainderTrace {
  participantId: string;
  floorShare: number;
  receivedExtraCent: boolean;
  remainderNumerator: number;
  remainderDenominator: number;
  tieBreakPosition: number;
}

export interface BillTotals {
  totalCents: number;
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  serviceChargeCents: number;
}

// ── Largest-remainder core ───────────────────────────────────────

interface LRInput {
  id: string;
  order: number;
  numerator: number;   // exact share numerator (integer)
  denominator: number; // exact share denominator (integer, > 0)
}

interface LROutput {
  id: string;
  allocated: number;
  trace: RemainderTrace;
}

/**
 * Distribute `total` integer cents among participants using the
 * largest-remainder method. All inputs are integers.
 *
 * exact_share[i] = numerator[i] / denominator[i]
 * floor_share[i] = Math.trunc(numerator[i] / denominator[i])
 * remainder[i]   = numerator[i] % denominator[i]  (compared cross-multiply free)
 *
 * Tie-break: lower participant_order wins the extra cent.
 */
export function largestRemainder(
  total: number,
  shares: LRInput[],
): LROutput[] {
  if (shares.length === 0) return [];

  // Floor shares and compute remainder numerators
  const rows = shares.map((s) => ({
    id: s.id,
    order: s.order,
    denominator: s.denominator,
    floor: Math.trunc(s.numerator / s.denominator),
    remainderNum: s.numerator % s.denominator,
  }));

  const floorSum = rows.reduce((acc, r) => acc + r.floor, 0);
  const undistributed = total - floorSum;

  // Sort by remainder descending (cross-multiply to stay integer),
  // tie-break by participant_order ascending.
  const sorted = [...rows].sort((a, b) => {
    // Compare a.remainderNum/a.denominator vs b.remainderNum/b.denominator
    const crossA = a.remainderNum * b.denominator;
    const crossB = b.remainderNum * a.denominator;
    if (crossA !== crossB) return crossB - crossA; // descending
    return a.order - b.order; // ascending tie-break
  });

  // Assign extra cents
  const extraCentSet = new Set(sorted.slice(0, undistributed).map((r) => r.id));

  return rows.map((r, _i) => {
    const receivedExtra = extraCentSet.has(r.id);
    const allocated = r.floor + (receivedExtra ? 1 : 0);
    const tieBreakPosition = sorted.findIndex((s) => s.id === r.id);
    return {
      id: r.id,
      allocated,
      trace: {
        participantId: r.id,
        floorShare: r.floor,
        receivedExtraCent: receivedExtra,
        remainderNumerator: r.remainderNum,
        remainderDenominator: r.denominator,
        tieBreakPosition,
      },
    };
  });
}

function assertInvariant(result: ComputeResultRow[], totalCents: number): void {
  const sum = result.reduce((acc, r) => acc + r.totalOwedCents, 0);
  if (sum !== totalCents) {
    throw new Error(
      `COMPUTE_INVARIANT_VIOLATED: expected ${totalCents}, got ${sum}`,
    );
  }
}

// ── Proportional additive distribution (tax + tip + service) ────

/**
 * Distribute additive_cents (tax+tip+service) proportionally by subtotal share.
 * Uses integer division + largest-remainder for the residual.
 * Returns map of participantId → additive_cents allocated.
 */
function distributeAdditive(
  participants: Array<{ id: string; participantOrder: number; subtotalCents: number }>,
  additiveCents: number,
  totalSubtotalCents: number,
): Map<string, number> {
  if (additiveCents === 0 || totalSubtotalCents === 0) {
    return new Map(participants.map((p) => [p.id, 0]));
  }

  const shares: LRInput[] = participants.map((p) => ({
    id: p.id,
    order: p.participantOrder,
    numerator: p.subtotalCents * additiveCents,
    denominator: totalSubtotalCents,
  }));

  const result = largestRemainder(additiveCents, shares);
  return new Map(result.map((r) => [r.id, r.allocated]));
}

// ── Items mode ───────────────────────────────────────────────────

export interface ItemsAllocation {
  participantId: string;
  allocatedCents: number; // subtotal allocation only
}

export function computeItemsSplit(
  bill: BillTotals,
  participants: ParticipantInput[],
  allocations: ItemsAllocation[],
): ComputeResultRow[] {
  const additiveCents = bill.taxCents + bill.tipCents + bill.serviceChargeCents;

  // Sum allocations per participant (subtotal share)
  const subtotalMap = new Map<string, number>(participants.map((p) => [p.id, 0]));
  for (const a of allocations) {
    subtotalMap.set(a.participantId, (subtotalMap.get(a.participantId) ?? 0) + a.allocatedCents);
  }

  const participantsWithSubtotal = participants.map((p) => ({
    id: p.id,
    participantOrder: p.participantOrder,
    subtotalCents: subtotalMap.get(p.id) ?? 0,
  }));

  // Distribute additive (tax+tip+service) proportionally
  const additiveMap = distributeAdditive(
    participantsWithSubtotal,
    additiveCents,
    bill.subtotalCents,
  );

  // Build result — no rounding needed for subtotals (already integers from allocations)
  // But we still need remainder traces for the additive distribution
  const additiveShares: LRInput[] = participants.map((p) => ({
    id: p.id,
    order: p.participantOrder,
    numerator: (subtotalMap.get(p.id) ?? 0) * additiveCents,
    denominator: bill.subtotalCents || 1,
  }));
  const additiveResults = largestRemainder(additiveCents, additiveShares);
  const additiveTraceMap = new Map(additiveResults.map((r) => [r.id, r.trace]));

  const result: ComputeResultRow[] = participants.map((p) => {
    const subtotal = subtotalMap.get(p.id) ?? 0;
    const additive = additiveMap.get(p.id) ?? 0;
    const total = subtotal + additive;
    const trace = additiveTraceMap.get(p.id)!;
    return {
      participantId: p.id,
      subtotalCents: subtotal,
      taxCents: Math.trunc(additive * (bill.taxCents / (additiveCents || 1))),
      tipCents: Math.trunc(additive * (bill.tipCents / (additiveCents || 1))),
      serviceChargeCents: Math.trunc(additive * (bill.serviceChargeCents / (additiveCents || 1))),
      totalOwedCents: total,
      remainderCents: trace.receivedExtraCent ? 1 : 0,
      remainderPolicy: 'largest_remainder',
      remainderTrace: trace,
    };
  });

  assertInvariant(result, bill.totalCents);
  return result;
}

// ── Percentage mode ──────────────────────────────────────────────

export function computePercentageSplit(
  bill: BillTotals,
  participants: ParticipantInput[],
  percentages: Record<string, number>, // participantId → basis points (0-10000)
): ComputeResultRow[] {
  const shares: LRInput[] = participants.map((p) => ({
    id: p.id,
    order: p.participantOrder,
    numerator: (percentages[p.id] ?? 0) * bill.totalCents,
    denominator: 10000,
  }));

  const lrResult = largestRemainder(bill.totalCents, shares);
  const traceMap = new Map(lrResult.map((r) => [r.id, r.trace]));
  const allocMap = new Map(lrResult.map((r) => [r.id, r.allocated]));

  const result: ComputeResultRow[] = participants.map((p) => {
    const total = allocMap.get(p.id) ?? 0;
    const trace = traceMap.get(p.id)!;
    // Distribute tax/tip/service proportionally within participant's share
    const taxShare = bill.totalCents > 0 ? Math.trunc((total * bill.taxCents) / bill.totalCents) : 0;
    const tipShare = bill.totalCents > 0 ? Math.trunc((total * bill.tipCents) / bill.totalCents) : 0;
    const serviceShare = bill.totalCents > 0 ? Math.trunc((total * bill.serviceChargeCents) / bill.totalCents) : 0;
    const subtotal = total - taxShare - tipShare - serviceShare;
    return {
      participantId: p.id,
      subtotalCents: subtotal,
      taxCents: taxShare,
      tipCents: tipShare,
      serviceChargeCents: serviceShare,
      totalOwedCents: total,
      remainderCents: trace.receivedExtraCent ? 1 : 0,
      remainderPolicy: 'largest_remainder',
      remainderTrace: trace,
    };
  });

  assertInvariant(result, bill.totalCents);
  return result;
}

// ── Fixed amount mode ────────────────────────────────────────────

export function computeFixedSplit(
  bill: BillTotals,
  participants: ParticipantInput[],
  fixedAmounts: Record<string, number>, // participantId → cents
): ComputeResultRow[] {
  const fixedSum = participants.reduce((acc, p) => acc + (fixedAmounts[p.id] ?? 0), 0);
  const remainder = bill.totalCents - fixedSum;

  // Distribute remainder using largest-remainder among all participants
  // proportional to their fixed amount share
  const shares: LRInput[] = participants.map((p) => ({
    id: p.id,
    order: p.participantOrder,
    numerator: (fixedAmounts[p.id] ?? 0) * remainder,
    denominator: fixedSum || 1,
  }));

  const lrResult = largestRemainder(remainder, shares);
  const additionalMap = new Map(lrResult.map((r) => [r.id, r.allocated]));
  const traceMap = new Map(lrResult.map((r) => [r.id, r.trace]));

  const result: ComputeResultRow[] = participants.map((p) => {
    const fixed = fixedAmounts[p.id] ?? 0;
    const additional = additionalMap.get(p.id) ?? 0;
    const total = fixed + additional;
    const trace = traceMap.get(p.id)!;
    const taxShare = bill.totalCents > 0 ? Math.trunc((total * bill.taxCents) / bill.totalCents) : 0;
    const tipShare = bill.totalCents > 0 ? Math.trunc((total * bill.tipCents) / bill.totalCents) : 0;
    const serviceShare = bill.totalCents > 0 ? Math.trunc((total * bill.serviceChargeCents) / bill.totalCents) : 0;
    const subtotal = total - taxShare - tipShare - serviceShare;
    return {
      participantId: p.id,
      subtotalCents: subtotal,
      taxCents: taxShare,
      tipCents: tipShare,
      serviceChargeCents: serviceShare,
      totalOwedCents: total,
      remainderCents: trace.receivedExtraCent ? 1 : 0,
      remainderPolicy: 'largest_remainder',
      remainderTrace: trace,
    };
  });

  assertInvariant(result, bill.totalCents);
  return result;
}
