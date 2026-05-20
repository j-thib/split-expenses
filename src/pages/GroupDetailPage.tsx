import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { supabase } from '../lib/supabase'
import Sheet from '../components/Sheet'
import { CenteredSpinner } from '../components/Spinner'
import { greedyPairing } from '../lib/settlement'
import type {
  Expense,
  ExpenseSplit,
  Group,
  GroupMember,
} from '../lib/database.types'

type ExpenseWithSplits = Expense & { splits: ExpenseSplit[] }
type TabKey = 'expenses' | 'settle'

type Props = {
  group: Group
  onBack: () => void
  onOpenSettings: () => void
}

export default function GroupDetailPage({
  group,
  onBack,
  onOpenSettings,
}: Props) {
  const { user } = useAuth()
  const { show: showToast } = useToast()
  const [tab, setTab] = useState<TabKey>('expenses')
  const [members, setMembers] = useState<GroupMember[]>([])
  const [expenses, setExpenses] = useState<ExpenseWithSplits[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [membersRes, expensesRes] = await Promise.all([
      supabase
        .from('group_members')
        .select('*')
        .eq('group_id', group.id)
        .order('joined_at'),
      supabase
        .from('expenses')
        .select('*, splits:expense_splits(*)')
        .eq('group_id', group.id)
        .order('created_at', { ascending: false }),
    ])
    if (membersRes.error) {
      setError(membersRes.error.message)
      setLoading(false)
      return
    }
    if (expensesRes.error) {
      setError(expensesRes.error.message)
      setLoading(false)
      return
    }
    setMembers(membersRes.data ?? [])
    setExpenses((expensesRes.data ?? []) as ExpenseWithSplits[])
    setLoading(false)
  }, [group.id])

  useEffect(() => {
    void load()
  }, [load])

  const nameById = useMemo(() => {
    const m: Record<string, string> = {}
    for (const member of members) m[member.user_id] = member.display_name
    return m
  }, [members])

  async function handleDelete(expenseId: string) {
    const { error: delError } = await supabase
      .from('expenses')
      .delete()
      .eq('id', expenseId)
    if (delError) {
      setError(delError.message)
      return
    }
    setExpenses((prev) => prev.filter((e) => e.id !== expenseId))
    showToast('Expense deleted')
  }

  function handleExpenseAdded(expense: ExpenseWithSplits) {
    setExpenses((prev) => [expense, ...prev])
    setSheetOpen(false)
    showToast('Expense added')
  }

  return (
    <main className="min-h-screen bg-app pb-24">
      <div className="sticky top-0 z-10">
        <Header group={group} onBack={onBack} onOpenSettings={onOpenSettings} />
        <Tabs tab={tab} setTab={setTab} />
      </div>

      <div className="max-w-[480px] mx-auto px-4 pt-4">
        {error && (
          <div
            role="alert"
            className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4"
          >
            {error}
          </div>
        )}

        {loading ? (
          <CenteredSpinner label="Loading expenses" />
        ) : tab === 'expenses' ? (
          <ExpensesTab
            expenses={expenses}
            nameById={nameById}
            currentUserId={user?.id}
            onDelete={handleDelete}
          />
        ) : (
          <SettleUpTab
            expenses={expenses}
            members={members}
            nameById={nameById}
          />
        )}
      </div>

      {tab === 'expenses' && !loading && (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label="Add expense"
          className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-brand text-white text-3xl shadow-lg hover:bg-brand-dark transition flex items-center justify-center"
        >
          +
        </button>
      )}

      {sheetOpen && (
        <NewExpenseSheet
          group={group}
          members={members}
          currentUserId={user?.id ?? ''}
          onClose={() => setSheetOpen(false)}
          onAdded={handleExpenseAdded}
        />
      )}
    </main>
  )
}

// ---------------------------------------------------------------------------
// Header + Tabs
// ---------------------------------------------------------------------------

function Header({
  group,
  onBack,
  onOpenSettings,
}: {
  group: Group
  onBack: () => void
  onOpenSettings: () => void
}) {
  return (
    <header className="bg-white border-b border-gray-100">
      <div className="max-w-[480px] mx-auto px-4 py-2 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="w-11 h-11 -ml-2 flex items-center justify-center text-gray-700 hover:text-gray-900"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="flex-1 text-lg font-semibold text-gray-900 truncate">
          {group.name}
        </h1>
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Group settings"
          className="w-11 h-11 -mr-2 flex items-center justify-center text-gray-700 hover:text-gray-900"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </header>
  )
}

function Tabs({
  tab,
  setTab,
}: {
  tab: TabKey
  setTab: (t: TabKey) => void
}) {
  return (
    <div className="bg-white border-b border-gray-100">
      <div className="max-w-[480px] mx-auto flex">
        {(['expenses', 'settle'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 min-h-[44px] py-3 text-sm font-medium border-b-2 transition ${
              tab === t
                ? 'text-brand border-brand'
                : 'text-muted border-transparent hover:text-gray-900'
            }`}
          >
            {t === 'expenses' ? 'Expenses' : 'Settle Up'}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Expenses tab
// ---------------------------------------------------------------------------

function ExpensesTab({
  expenses,
  nameById,
  currentUserId,
  onDelete,
}: {
  expenses: ExpenseWithSplits[]
  nameById: Record<string, string>
  currentUserId: string | undefined
  onDelete: (id: string) => void
}) {
  if (expenses.length === 0) {
    return <EmptyExpenses />
  }

  return (
    <ul className="space-y-3">
      {expenses.map((e) => (
        <ExpenseCard
          key={e.id}
          expense={e}
          nameById={nameById}
          currentUserId={currentUserId}
          onDelete={onDelete}
        />
      ))}
    </ul>
  )
}

function EmptyExpenses() {
  return (
    <div className="text-center text-muted py-12 px-4">
      <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-brand/10 flex items-center justify-center text-brand">
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 2h12l4 4v16H4z" />
          <path d="M16 2v4h4" />
          <path d="M8 11h8M8 15h6" />
        </svg>
      </div>
      <p className="text-base text-gray-900 mb-1">No expenses yet</p>
      <p className="text-sm">Tap the + button to add the first one.</p>
    </div>
  )
}

function ExpenseCard({
  expense,
  nameById,
  currentUserId,
  onDelete,
}: {
  expense: ExpenseWithSplits
  nameById: Record<string, string>
  currentUserId: string | undefined
  onDelete: (id: string) => void
}) {
  const isMine = expense.created_by === currentUserId
  const splitLabels = expense.splits
    .map((s) => nameById[s.user_id] ?? 'Unknown')
    .join(', ')

  return (
    <li className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 truncate">
            {expense.description}
          </div>
          <div className="mt-1 text-xs text-muted">
            Paid by{' '}
            <span className="font-medium text-gray-700">
              {nameById[expense.paid_by] ?? 'Unknown'}
            </span>
          </div>
          {expense.splits.length > 0 && (
            <div className="mt-1 text-xs text-muted">
              Split between {splitLabels}
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="font-semibold text-gray-900">
            {formatUSD(Number(expense.amount))}
          </div>
          {isMine && (
            <button
              type="button"
              onClick={() => onDelete(expense.id)}
              className="mt-1 text-xs text-red-600 hover:text-red-700 px-2 py-1"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Settle Up tab
// ---------------------------------------------------------------------------

function SettleUpTab({
  expenses,
  members,
  nameById,
}: {
  expenses: ExpenseWithSplits[]
  members: GroupMember[]
  nameById: Record<string, string>
}) {
  const { balanceCents, transfers, totalSpent } = useMemo(() => {
    // Track balances only for current members. Expenses involving removed
    // members may leave a residual that the settlement algorithm absorbs.
    const memberIds = new Set(members.map((m) => m.user_id))
    const dollars: Record<string, number> = {}
    for (const m of members) dollars[m.user_id] = 0
    let total = 0
    for (const e of expenses) {
      const amt = Number(e.amount)
      total += amt
      if (memberIds.has(e.paid_by)) dollars[e.paid_by] += amt
      for (const s of e.splits) {
        if (memberIds.has(s.user_id))
          dollars[s.user_id] -= Number(s.share_amount)
      }
    }
    const settlement = greedyPairing(dollars)
    return {
      balanceCents: settlement.balances,
      transfers: settlement.transfers,
      totalSpent: total,
    }
  }, [expenses, members])

  const perPersonAvg = members.length > 0 ? totalSpent / members.length : 0

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3 text-center">
        <Stat label="Total spent" value={formatUSD(totalSpent)} />
        <Stat label="Per-person avg" value={formatUSD(perPersonAvg)} />
        <Stat label="Transfers" value={String(transfers.length)} />
      </div>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2 px-1">
          Balances
        </h2>
        <ul className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-100">
          {members.map((m) => {
            const cents = balanceCents[m.user_id] ?? 0
            const dollars = Math.abs(cents) / 100
            const color =
              cents > 0
                ? 'text-green-700'
                : cents < 0
                  ? 'text-red-600'
                  : 'text-muted'
            const label =
              cents > 0 ? 'is owed' : cents < 0 ? 'owes' : 'is settled'
            return (
              <li
                key={m.user_id}
                className="px-4 py-3 flex items-center justify-between min-h-[48px]"
              >
                <span className="text-gray-900">{m.display_name}</span>
                <span className={`text-sm font-medium ${color}`}>
                  {label} {formatUSD(dollars)}
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2 px-1">
          Transfers
        </h2>
        {transfers.length === 0 ? (
          <EmptyTransfers />
        ) : (
          <ul className="space-y-2">
            {transfers.map((t, i) => (
              <li
                key={i}
                className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3"
              >
                <span className="font-medium text-gray-900 truncate">
                  {nameById[t.from] ?? t.from}
                </span>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-brand shrink-0"
                  aria-hidden="true"
                >
                  <path d="M5 12h14" />
                  <path d="M12 5l7 7-7 7" />
                </svg>
                <span className="flex-1 font-medium text-gray-900 truncate">
                  {nameById[t.to] ?? t.to}
                </span>
                <span className="font-semibold text-gray-900 shrink-0">
                  {formatUSD(t.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function EmptyTransfers() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
      <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-brand/10 flex items-center justify-center text-brand">
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <p className="text-base text-gray-900">Everyone is already settled!</p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 font-semibold text-gray-900">{value}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// New expense sheet
// ---------------------------------------------------------------------------

function NewExpenseSheet({
  group,
  members,
  currentUserId,
  onClose,
  onAdded,
}: {
  group: Group
  members: GroupMember[]
  currentUserId: string
  onClose: () => void
  onAdded: (expense: ExpenseWithSplits) => void
}) {
  const initialPaidBy =
    members.find((m) => m.user_id === currentUserId)?.user_id ??
    members[0]?.user_id ??
    ''
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [paidBy, setPaidBy] = useState(initialPaidBy)
  const [splitBetween, setSplitBetween] = useState<Set<string>>(
    () => new Set(members.map((m) => m.user_id)),
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleSplit(userId: string) {
    setSplitBetween((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const amtNum = parseFloat(amount)
    const ids = [...splitBetween]

    if (!description.trim()) {
      setError('Add a description')
      return
    }
    if (!Number.isFinite(amtNum) || amtNum <= 0) {
      setError('Enter an amount greater than 0')
      return
    }
    if (!paidBy) {
      setError('Pick who paid')
      return
    }
    if (ids.length === 0) {
      setError('Pick at least one person to split with')
      return
    }

    setSubmitting(true)
    setError(null)

    const { data: expense, error: insertExpenseError } = await supabase
      .from('expenses')
      .insert({
        group_id: group.id,
        description: description.trim(),
        amount: amtNum,
        paid_by: paidBy,
        created_by: currentUserId,
      })
      .select()
      .single()

    if (insertExpenseError || !expense) {
      setError(insertExpenseError?.message ?? 'Could not add expense')
      setSubmitting(false)
      return
    }

    // Integer-cent split so shares sum exactly to the expense amount.
    const totalCents = Math.round(amtNum * 100)
    const base = Math.floor(totalCents / ids.length)
    const extras = totalCents - base * ids.length
    const splitRows = ids.map((userId, i) => ({
      expense_id: expense.id,
      user_id: userId,
      share_amount: (i < extras ? base + 1 : base) / 100,
    }))

    const { data: splits, error: splitsError } = await supabase
      .from('expense_splits')
      .insert(splitRows)
      .select()

    if (splitsError || !splits) {
      await supabase.from('expenses').delete().eq('id', expense.id)
      setError(splitsError?.message ?? 'Could not save splits')
      setSubmitting(false)
      return
    }

    setSubmitting(false)
    onAdded({ ...expense, splits })
  }

  return (
    <Sheet title="New Expense" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="exp-description"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Description
          </label>
          <input
            id="exp-description"
            type="text"
            autoFocus
            required
            maxLength={120}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Dinner, groceries, …"
            className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
          />
        </div>

        <div>
          <label
            htmlFor="exp-amount"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Amount
          </label>
          <input
            id="exp-amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
          />
        </div>

        <div>
          <label
            htmlFor="exp-paid-by"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Paid by
          </label>
          <select
            id="exp-paid-by"
            value={paidBy}
            onChange={(e) => setPaidBy(e.target.value)}
            className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent bg-white"
          >
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.display_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="block text-sm font-medium text-gray-700 mb-2">
            Split between
          </span>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => {
              const active = splitBetween.has(m.user_id)
              return (
                <button
                  key={m.user_id}
                  type="button"
                  onClick={() => toggleSplit(m.user_id)}
                  className={`px-3 py-2 rounded-full text-sm border transition min-h-[36px] ${
                    active
                      ? 'bg-brand text-white border-brand'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                  }`}
                >
                  {m.display_name}
                </button>
              )
            })}
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 bg-brand text-white font-medium rounded-lg hover:bg-brand-dark disabled:opacity-60 disabled:cursor-not-allowed transition min-h-[44px]"
        >
          {submitting ? 'Adding…' : 'Add Expense'}
        </button>
      </form>
    </Sheet>
  )
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
