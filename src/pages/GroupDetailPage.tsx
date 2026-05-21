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
  Payment,
} from '../lib/database.types'

type ExpenseWithSplits = Expense & { splits: ExpenseSplit[] }
type TabKey = 'expenses' | 'payments' | 'settle'
type SheetState =
  | { mode: 'new' }
  | { mode: 'edit'; expense: ExpenseWithSplits }
  | null

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
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sheetState, setSheetState] = useState<SheetState>(null)
  const [paymentSheetOpen, setPaymentSheetOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [membersRes, expensesRes, paymentsRes] = await Promise.all([
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
      supabase
        .from('payments')
        .select('*')
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
    if (paymentsRes.error) {
      setError(paymentsRes.error.message)
      setLoading(false)
      return
    }
    setMembers(membersRes.data ?? [])
    setExpenses((expensesRes.data ?? []) as ExpenseWithSplits[])
    setPayments(paymentsRes.data ?? [])
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

  function handleExpenseSaved(expense: ExpenseWithSplits) {
    const isEdit = sheetState?.mode === 'edit'
    setExpenses((prev) =>
      isEdit
        ? prev.map((e) => (e.id === expense.id ? expense : e))
        : [expense, ...prev],
    )
    setSheetState(null)
    showToast(isEdit ? 'Expense updated' : 'Expense added')
  }

  function handlePaymentSaved(payment: Payment) {
    setPayments((prev) => [payment, ...prev])
    setPaymentSheetOpen(false)
    showToast('Payment recorded')
  }

  async function handleDeletePayment(paymentId: string) {
    const { error: delError } = await supabase
      .from('payments')
      .delete()
      .eq('id', paymentId)
    if (delError) {
      setError(delError.message)
      return
    }
    setPayments((prev) => prev.filter((p) => p.id !== paymentId))
    showToast('Payment deleted')
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
            onEdit={(expense) => setSheetState({ mode: 'edit', expense })}
            onDelete={handleDelete}
          />
        ) : tab === 'payments' ? (
          <PaymentsTab
            payments={payments}
            nameById={nameById}
            currentUserId={user?.id}
            onDelete={handleDeletePayment}
          />
        ) : (
          <SettleUpTab
            expenses={expenses}
            payments={payments}
            members={members}
            nameById={nameById}
            onRecordPayment={() => setPaymentSheetOpen(true)}
          />
        )}
      </div>

      {tab === 'expenses' && !loading && (
        <button
          type="button"
          onClick={() => setSheetState({ mode: 'new' })}
          aria-label="Add expense"
          className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-brand text-white text-3xl shadow-lg hover:bg-brand-dark transition flex items-center justify-center"
        >
          +
        </button>
      )}

      {sheetState && (
        <ExpenseSheet
          group={group}
          members={members}
          currentUserId={user?.id ?? ''}
          existing={sheetState.mode === 'edit' ? sheetState.expense : null}
          onClose={() => setSheetState(null)}
          onSaved={handleExpenseSaved}
        />
      )}

      {paymentSheetOpen && (
        <PaymentSheet
          group={group}
          members={members}
          currentUserId={user?.id ?? ''}
          onClose={() => setPaymentSheetOpen(false)}
          onSaved={handlePaymentSaved}
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
    <header className="bg-card border-b border-gray-100">
      <div className="max-w-[480px] mx-auto px-4 py-2 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="w-11 h-11 -ml-2 flex items-center justify-center text-gray-700 hover:text-ink"
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
        <h1 className="flex-1 text-lg font-semibold text-ink truncate">
          {group.name}
        </h1>
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Group settings"
          className="w-11 h-11 -mr-2 flex items-center justify-center text-gray-700 hover:text-ink"
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
  const labels: Record<TabKey, string> = {
    expenses: 'Expenses',
    payments: 'Payments',
    settle: 'Settle Up',
  }
  return (
    <div className="bg-card border-b border-gray-100">
      <div className="max-w-[480px] mx-auto flex">
        {(['expenses', 'payments', 'settle'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 min-h-[44px] py-3 text-sm font-medium border-b-2 transition ${
              tab === t
                ? 'text-brand border-brand'
                : 'text-muted border-transparent hover:text-ink'
            }`}
          >
            {labels[t]}
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
  onEdit,
  onDelete,
}: {
  expenses: ExpenseWithSplits[]
  nameById: Record<string, string>
  currentUserId: string | undefined
  onEdit: (expense: ExpenseWithSplits) => void
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
          onEdit={onEdit}
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
      <p className="text-base text-ink mb-1">No expenses yet</p>
      <p className="text-sm">Tap the + button to add the first one.</p>
    </div>
  )
}

function ExpenseCard({
  expense,
  nameById,
  currentUserId,
  onEdit,
  onDelete,
}: {
  expense: ExpenseWithSplits
  nameById: Record<string, string>
  currentUserId: string | undefined
  onEdit: (expense: ExpenseWithSplits) => void
  onDelete: (id: string) => void
}) {
  const isMine = expense.created_by === currentUserId
  const splitLabels = expense.splits
    .map((s) => nameById[s.user_id] ?? 'Unknown')
    .join(', ')

  const body = (
    <div className="flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="font-medium text-ink truncate">
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
        <div className="font-mono tabular font-semibold text-ink">
          {formatUSD(Number(expense.amount))}
        </div>
        {isMine && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(expense.id)
            }}
            className="mt-1 text-xs text-red-600 hover:text-red-700 px-2 py-1"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  )

  const baseClass = 'bg-card rounded-xl border border-gray-100 shadow-sm p-4'

  if (!isMine) {
    return <li className={baseClass}>{body}</li>
  }

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onEdit(expense)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onEdit(expense)
          }
        }}
        className={`${baseClass} cursor-pointer hover:border-brand/40 transition focus:outline-none focus:ring-2 focus:ring-brand`}
      >
        {body}
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Payments tab
// ---------------------------------------------------------------------------

function PaymentsTab({
  payments,
  nameById,
  currentUserId,
  onDelete,
}: {
  payments: Payment[]
  nameById: Record<string, string>
  currentUserId: string | undefined
  onDelete: (id: string) => void
}) {
  if (payments.length === 0) {
    return <EmptyPayments />
  }

  return (
    <ul className="space-y-3">
      {payments.map((p) => (
        <PaymentCard
          key={p.id}
          payment={p}
          nameById={nameById}
          currentUserId={currentUserId}
          onDelete={onDelete}
        />
      ))}
    </ul>
  )
}

function EmptyPayments() {
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
          <path d="M3 7h18M3 12h18M3 17h18" />
        </svg>
      </div>
      <p className="text-base text-ink mb-1">No payments yet</p>
      <p className="text-sm">Record one from the Settle Up tab.</p>
    </div>
  )
}

function PaymentCard({
  payment,
  nameById,
  currentUserId,
  onDelete,
}: {
  payment: Payment
  nameById: Record<string, string>
  currentUserId: string | undefined
  onDelete: (id: string) => void
}) {
  const isMine = payment.created_by === currentUserId
  const fromName = nameById[payment.paid_by] ?? 'Unknown'
  const toName = nameById[payment.paid_to] ?? 'Unknown'
  const note = payment.note?.trim()

  return (
    <li className="bg-card rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-ink">
            <span className="font-medium">{fromName}</span>
            <span className="text-muted"> paid </span>
            <span className="font-medium">{toName}</span>
          </div>
          {note && (
            <div className="mt-1 text-xs text-muted truncate">{note}</div>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono tabular font-semibold text-ink">
            {formatUSD(Number(payment.amount))}
          </div>
          {isMine && (
            <button
              type="button"
              onClick={() => onDelete(payment.id)}
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
  payments,
  members,
  nameById,
  onRecordPayment,
}: {
  expenses: ExpenseWithSplits[]
  payments: Payment[]
  members: GroupMember[]
  nameById: Record<string, string>
  onRecordPayment: () => void
}) {
  const { balanceCents, transfers, totalSpent } = useMemo(() => {
    // Track balances only for current members. Expenses or payments involving
    // removed members may leave a residual that the settlement algorithm
    // absorbs.
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
    for (const p of payments) {
      const amt = Number(p.amount)
      if (memberIds.has(p.paid_by)) dollars[p.paid_by] += amt
      if (memberIds.has(p.paid_to)) dollars[p.paid_to] -= amt
    }
    const settlement = greedyPairing(dollars)
    return {
      balanceCents: settlement.balances,
      transfers: settlement.transfers,
      totalSpent: total,
    }
  }, [expenses, payments, members])

  const perPersonAvg = members.length > 0 ? totalSpent / members.length : 0

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onRecordPayment}
        className="w-full py-3 bg-brand text-white font-medium rounded-xl hover:bg-brand-dark transition min-h-[44px]"
      >
        Record Payment
      </button>

      <div className="grid grid-cols-3 gap-3 text-center">
        <Stat label="Total spent" value={formatUSD(totalSpent)} />
        <Stat label="Per-person avg" value={formatUSD(perPersonAvg)} />
        <Stat label="Transfers" value={String(transfers.length)} />
      </div>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2 px-1">
          Balances
        </h2>
        <ul className="bg-card rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-100">
          {members.map((m) => {
            const cents = balanceCents[m.user_id] ?? 0
            const dollars = Math.abs(cents) / 100
            const color =
              cents > 0
                ? 'text-brand'
                : cents < 0
                  ? 'text-accent'
                  : 'text-muted'
            const label =
              cents > 0 ? 'is owed' : cents < 0 ? 'owes' : 'is settled'
            return (
              <li
                key={m.user_id}
                className="px-4 py-3 flex items-center justify-between min-h-[48px]"
              >
                <span className="text-ink">{m.display_name}</span>
                <span className={`text-sm font-medium ${color}`}>
                  {label}{' '}
                  <span className="font-mono tabular">
                    {formatUSD(dollars)}
                  </span>
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
                className="bg-card rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3"
              >
                <span className="font-medium text-ink truncate">
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
                <span className="flex-1 font-medium text-ink truncate">
                  {nameById[t.to] ?? t.to}
                </span>
                <span className="font-mono tabular font-semibold text-ink shrink-0">
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
    <div className="bg-card rounded-xl border border-gray-100 shadow-sm p-8 text-center">
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
      <p className="text-base text-ink">Everyone is already settled!</p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card rounded-xl border border-gray-100 shadow-sm p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 font-mono tabular font-semibold text-ink">
        {value}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Expense sheet (new + edit)
// ---------------------------------------------------------------------------

// Splits `amountCents` into `n` per-person dollar amounts; the first
// `amountCents mod n` people get one extra cent so the parts sum exactly
// to amountCents.
function distributeCents(amountCents: number, n: number): number[] {
  const base = Math.floor(amountCents / n)
  const extras = amountCents - base * n
  return Array.from({ length: n }, (_, i) =>
    (i < extras ? base + 1 : base) / 100,
  )
}

function ExpenseSheet({
  group,
  members,
  currentUserId,
  existing,
  onClose,
  onSaved,
}: {
  group: Group
  members: GroupMember[]
  currentUserId: string
  existing: ExpenseWithSplits | null
  onClose: () => void
  onSaved: (expense: ExpenseWithSplits) => void
}) {
  const isEdit = existing !== null
  const initialPaidBy = existing
    ? existing.paid_by
    : (members.find((m) => m.user_id === currentUserId)?.user_id ??
      members[0]?.user_id ??
      '')

  const [description, setDescription] = useState(existing?.description ?? '')
  const [amount, setAmount] = useState(
    existing ? String(Number(existing.amount)) : '',
  )
  const [paidBy, setPaidBy] = useState(initialPaidBy)
  const [splitBetween, setSplitBetween] = useState<Set<string>>(
    () =>
      new Set(
        existing
          ? existing.splits.map((s) => s.user_id)
          : members.map((m) => m.user_id),
      ),
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

    const totalCents = Math.round(amtNum * 100)
    const shares = distributeCents(totalCents, ids.length)
    const trimmed = description.trim()

    if (existing) {
      // --- Edit flow ---------------------------------------------------------
      // Not atomic; the operations are sequential. If anything fails mid-way,
      // the user can re-submit: UPDATE is idempotent, DELETE-with-no-rows is
      // a no-op, and INSERT will refill what's missing.
      const { error: updateError } = await supabase
        .from('expenses')
        .update({ description: trimmed, amount: amtNum, paid_by: paidBy })
        .eq('id', existing.id)
      if (updateError) {
        setError(updateError.message)
        setSubmitting(false)
        return
      }

      const { error: deleteError } = await supabase
        .from('expense_splits')
        .delete()
        .eq('expense_id', existing.id)
      if (deleteError) {
        setError(deleteError.message)
        setSubmitting(false)
        return
      }

      const splitRows = ids.map((userId, i) => ({
        expense_id: existing.id,
        user_id: userId,
        share_amount: shares[i],
      }))
      const { data: newSplits, error: insertSplitsError } = await supabase
        .from('expense_splits')
        .insert(splitRows)
        .select()
      if (insertSplitsError || !newSplits) {
        setError(insertSplitsError?.message ?? 'Could not save splits')
        setSubmitting(false)
        return
      }

      setSubmitting(false)
      onSaved({
        ...existing,
        description: trimmed,
        amount: amtNum,
        paid_by: paidBy,
        splits: newSplits,
      })
      return
    }

    // --- New flow ------------------------------------------------------------
    const { data: inserted, error: insertExpenseError } = await supabase
      .from('expenses')
      .insert({
        group_id: group.id,
        description: trimmed,
        amount: amtNum,
        paid_by: paidBy,
        created_by: currentUserId,
      })
      .select()
      .single()

    if (insertExpenseError || !inserted) {
      setError(insertExpenseError?.message ?? 'Could not add expense')
      setSubmitting(false)
      return
    }

    const splitRows = ids.map((userId, i) => ({
      expense_id: inserted.id,
      user_id: userId,
      share_amount: shares[i],
    }))
    const { data: splits, error: splitsError } = await supabase
      .from('expense_splits')
      .insert(splitRows)
      .select()

    if (splitsError || !splits) {
      await supabase.from('expenses').delete().eq('id', inserted.id)
      setError(splitsError?.message ?? 'Could not save splits')
      setSubmitting(false)
      return
    }

    setSubmitting(false)
    onSaved({ ...inserted, splits })
  }

  return (
    <Sheet title={isEdit ? 'Edit Expense' : 'New Expense'} onClose={onClose}>
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
            className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent bg-card"
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
                      : 'bg-card text-gray-700 border-gray-300 hover:border-gray-400'
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
          {submitting
            ? isEdit
              ? 'Saving…'
              : 'Adding…'
            : isEdit
              ? 'Save Changes'
              : 'Add Expense'}
        </button>
      </form>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Payment sheet
// ---------------------------------------------------------------------------

function PaymentSheet({
  group,
  members,
  currentUserId,
  onClose,
  onSaved,
}: {
  group: Group
  members: GroupMember[]
  currentUserId: string
  onClose: () => void
  onSaved: (payment: Payment) => void
}) {
  const initialFrom =
    members.find((m) => m.user_id === currentUserId)?.user_id ??
    members[0]?.user_id ??
    ''
  const initialTo =
    members.find((m) => m.user_id !== initialFrom)?.user_id ?? ''

  const [paidBy, setPaidBy] = useState(initialFrom)
  const [paidTo, setPaidTo] = useState(initialTo)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const amtNum = parseFloat(amount)

    if (!paidBy || !paidTo) {
      setError('Pick both people')
      return
    }
    if (paidBy === paidTo) {
      setError('From and To must be different')
      return
    }
    if (!Number.isFinite(amtNum) || amtNum <= 0) {
      setError('Enter an amount greater than 0')
      return
    }

    setSubmitting(true)
    setError(null)

    const trimmedNote = note.trim()
    const { data: inserted, error: insertError } = await supabase
      .from('payments')
      .insert({
        group_id: group.id,
        paid_by: paidBy,
        paid_to: paidTo,
        amount: amtNum,
        note: trimmedNote ? trimmedNote : null,
        created_by: currentUserId,
      })
      .select()
      .single()

    if (insertError || !inserted) {
      setError(insertError?.message ?? 'Could not record payment')
      setSubmitting(false)
      return
    }

    setSubmitting(false)
    onSaved(inserted)
  }

  return (
    <Sheet title="Record Payment" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="pay-from"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            From
          </label>
          <select
            id="pay-from"
            value={paidBy}
            onChange={(e) => setPaidBy(e.target.value)}
            className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent bg-card"
          >
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.display_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="pay-to"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            To
          </label>
          <select
            id="pay-to"
            value={paidTo}
            onChange={(e) => setPaidTo(e.target.value)}
            className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent bg-card"
          >
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.display_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="pay-amount"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Amount
          </label>
          <input
            id="pay-amount"
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
            htmlFor="pay-note"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Note <span className="text-muted font-normal">(optional)</span>
          </label>
          <input
            id="pay-note"
            type="text"
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Venmo, cash, …"
            className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
          />
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
          {submitting ? 'Saving…' : 'Record Payment'}
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
