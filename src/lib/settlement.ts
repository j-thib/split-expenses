// Port of legacy/share_expenses.py — greedy pairing settlement algorithm.
//
// All arithmetic runs in integer cents to avoid floating-point drift.

export type Transfer = {
  from: string
  to: string
  amount: number // dollars
}

export type SettlementResult = {
  // Per-person balance, in dollars. Same data as `balances` divided by 100.
  // Kept as a separate field to mirror the original Python port's two-unit
  // return shape (dollar-denominated for display, cent-denominated for math).
  targets: Record<string, number>
  transfers: Transfer[]
  // Per-person balance, in integer cents. Sums to 0.
  balances: Record<string, number>
}

/**
 * Greedy settlement. Given each person's net balance in dollars (positive =
 * overpaid, negative = underpaid), return the integer-cent balances, the
 * dollar-denominated counterpart, and a list of transfers that settles
 * everyone.
 *
 * If the input doesn't sum to zero after rounding to cents (e.g. from float
 * noise upstream), the residual is absorbed one cent at a time into the
 * largest-magnitude balance on the surplus side.
 */
export function greedyPairing(input: Record<string, number>): SettlementResult {
  const names = Object.keys(input)
  const balances: Record<string, number> = {}
  for (const n of names) balances[n] = Math.round(input[n] * 100)

  rebalanceToZero(names, balances)

  const creditors = names
    .filter((n) => balances[n] > 0)
    .map((n) => ({ name: n, amount: balances[n] }))
    .sort((a, b) => a.amount - b.amount || a.name.localeCompare(b.name))

  const debtors = names
    .filter((n) => balances[n] < 0)
    .map((n) => ({ name: n, amount: -balances[n] }))
    .sort((a, b) => a.amount - b.amount || a.name.localeCompare(b.name))

  const transfers: Transfer[] = []
  let i = 0
  let j = 0
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i]
    const creditor = creditors[j]
    const x = Math.min(debtor.amount, creditor.amount)
    if (x > 0) {
      transfers.push({ from: debtor.name, to: creditor.name, amount: x / 100 })
    }
    debtor.amount -= x
    creditor.amount -= x
    if (debtor.amount === 0) i++
    if (creditor.amount === 0) j++
  }

  const targets: Record<string, number> = {}
  for (const n of names) targets[n] = balances[n] / 100

  return { targets, transfers, balances }
}

function rebalanceToZero(
  names: string[],
  balances: Record<string, number>,
): void {
  let residual = names.reduce((s, n) => s + balances[n], 0)
  while (residual !== 0 && names.length > 0) {
    const target = [...names].sort((a, b) => {
      const cmp =
        residual > 0 ? balances[b] - balances[a] : balances[a] - balances[b]
      return cmp !== 0 ? cmp : a.localeCompare(b)
    })[0]
    const adj = residual > 0 ? -1 : 1
    balances[target] += adj
    residual += adj
  }
}

function formatUSD(dollars: number): string {
  return (
    '$' +
    dollars.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  )
}

export function describeInitialBalances(
  balancesCents: Record<string, number>,
): string {
  const lines: string[] = []
  for (const [name, b] of Object.entries(balancesCents)) {
    if (b > 0) lines.push(`${name} is owed ${formatUSD(b / 100)}`)
    else if (b < 0) lines.push(`${name} owes ${formatUSD(-b / 100)}`)
    else lines.push(`${name} is settled $0.00`)
  }
  return lines.join('\n')
}

export function describeTransfers(transfers: Transfer[]): string {
  if (transfers.length === 0) return 'Everyone is already settled!'
  return transfers
    .map((t) => `${t.from} pays ${t.to} ${formatUSD(t.amount)}`)
    .join('\n')
}
