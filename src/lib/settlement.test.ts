import { describe, it, expect } from 'vitest'
import { greedyPairing } from './settlement'

describe('greedyPairing', () => {
  it('3 people, unequal spending', () => {
    // Alice paid $30, Bob paid $60, Cara paid $0. Equal share = $30 each.
    // Balances: Alice 0, Bob +30, Cara -30. One transfer: Cara -> Bob $30.
    const result = greedyPairing({ Alice: 0, Bob: 30, Cara: -30 })
    expect(result.transfers).toEqual([
      { from: 'Cara', to: 'Bob', amount: 30 },
    ])
    expect(result.balances).toEqual({ Alice: 0, Bob: 3000, Cara: -3000 })
    expect(result.targets).toEqual({ Alice: 0, Bob: 30, Cara: -30 })
  })

  it('2 people, equal spending — no transfers needed', () => {
    const result = greedyPairing({ Alice: 0, Bob: 0 })
    expect(result.transfers).toEqual([])
    expect(result.balances).toEqual({ Alice: 0, Bob: 0 })
  })

  it('5 people, various amounts', () => {
    // A: +50, B: +20 (creditors); C: -30, D: -40 (debtors); E: 0.
    // Total credit = $70, total debit = $70.
    const result = greedyPairing({ A: 50, B: 20, C: -30, D: -40, E: 0 })

    const totalTransferred = result.transfers.reduce(
      (s, t) => s + t.amount,
      0,
    )
    expect(totalTransferred).toBeCloseTo(70, 10)

    for (const t of result.transfers) {
      expect(result.balances[t.from]).toBeLessThan(0)
      expect(result.balances[t.to]).toBeGreaterThan(0)
      expect(t.amount).toBeGreaterThan(0)
    }
  })

  it('single person — no transfers', () => {
    const result = greedyPairing({ Solo: 0 })
    expect(result.transfers).toEqual([])
    expect(result.balances).toEqual({ Solo: 0 })
  })

  it('transfers fully resolve all debts', () => {
    const cases: Array<Record<string, number>> = [
      { A: 100, B: -30, C: -70 },
      { A: 50, B: 20, C: -30, D: -40, E: 0 },
      { a: 100, b: 100, c: 100, d: -150, e: -150 },
      // float-noise example: 12.34 + (-5.67) + (-6.67) = 0 exactly in cents
      { Alice: 12.34, Bob: -5.67, Cara: -6.67 },
      { Solo: 0 },
      {},
    ]

    for (const input of cases) {
      const result = greedyPairing(input)
      const net: Record<string, number> = { ...result.balances }
      for (const t of result.transfers) {
        const cents = Math.round(t.amount * 100)
        net[t.from] += cents // debtor's balance moves toward 0 from below
        net[t.to] -= cents // creditor's balance moves toward 0 from above
      }
      for (const name of Object.keys(net)) {
        expect(
          net[name],
          `expected ${name} to net to 0, got ${net[name]}`,
        ).toBe(0)
      }
    }
  })

  it('uses at most k-1 transfers for k participants with nonzero balances', () => {
    const cases: Array<Record<string, number>> = [
      { A: 0, B: 0 }, // k=0 → 0 transfers
      { A: 30, B: -30 }, // k=2 → ≤1
      { A: 50, B: 20, C: -30, D: -40, E: 0 }, // k=4 → ≤3
      { a: 100, b: 100, c: 100, d: -150, e: -150 }, // k=5 → ≤4
      { a: 10, b: 20, c: 30, d: -15, e: -45 }, // k=5 → ≤4
      { a: 10, b: -10, c: 10, d: -10, e: 10, f: -10 }, // k=6 → ≤5
    ]

    for (const input of cases) {
      const result = greedyPairing(input)
      const k = Object.values(result.balances).filter((b) => b !== 0).length
      const bound = Math.max(0, k - 1)
      expect(
        result.transfers.length,
        `expected ≤${bound} transfers for k=${k}, got ${result.transfers.length}`,
      ).toBeLessThanOrEqual(bound)
    }
  })
})
