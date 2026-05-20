import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { supabase } from '../lib/supabase'
import Sheet from '../components/Sheet'
import { CenteredSpinner } from '../components/Spinner'
import { NicklWordmark } from '../components/Wordmark'
import type { Group } from '../lib/database.types'

type SheetMode = null | 'new' | 'join'

// Omits ambiguous chars (0/O, 1/I/L) so codes are easier to share verbally.
const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function generateInviteCode(): string {
  const out = new Array(6)
  for (let i = 0; i < 6; i++) {
    out[i] = INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)]
  }
  return out.join('')
}

type GroupListPageProps = {
  onSelectGroup: (group: Group) => void
}

export default function GroupListPage({ onSelectGroup }: GroupListPageProps) {
  const { user, signOut } = useAuth()
  const { show: showToast } = useToast()
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sheet, setSheet] = useState<SheetMode>(null)

  const loadGroups = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('group_members')
      .select('group:groups(*)')
      .eq('user_id', user.id)

    if (fetchError) {
      setError(fetchError.message)
      setGroups([])
      setLoading(false)
      return
    }

    const rows = (data ?? [])
      .map((row) => row.group)
      .filter((g): g is Group => g !== null)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))

    setGroups(rows)
    setLoading(false)
  }, [user])

  useEffect(() => {
    void loadGroups()
  }, [loadGroups])

  function handleCreated(group: Group) {
    setSheet(null)
    setGroups((prev) =>
      prev.some((g) => g.id === group.id) ? prev : [group, ...prev],
    )
    showToast('Group created')
    onSelectGroup(group)
  }

  function handleJoined(group: Group) {
    setSheet(null)
    setGroups((prev) =>
      prev.some((g) => g.id === group.id) ? prev : [group, ...prev],
    )
    showToast('Joined group')
    onSelectGroup(group)
  }

  return (
    <main className="min-h-screen bg-app">
      <header className="px-4 pt-6 pb-4 max-w-[480px] mx-auto flex items-center justify-between">
        <NicklWordmark size={28} />
        <button
          type="button"
          onClick={() => signOut()}
          className="text-sm text-muted hover:text-ink px-2 py-2 min-h-[44px]"
        >
          Sign out
        </button>
      </header>

      <div className="px-4 max-w-[480px] mx-auto">
        <div className="flex gap-2 mb-6">
          <button
            type="button"
            onClick={() => setSheet('new')}
            className="flex-1 py-3 bg-brand text-white font-medium rounded-xl hover:bg-brand-dark transition min-h-[44px]"
          >
            New Group
          </button>
          <button
            type="button"
            onClick={() => setSheet('join')}
            className="flex-1 py-3 bg-card border border-gray-200 text-brand font-medium rounded-xl hover:bg-gray-50 transition min-h-[44px]"
          >
            Join Group
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4"
          >
            {error}
          </div>
        )}

        {loading ? (
          <CenteredSpinner label="Loading groups" />
        ) : groups.length === 0 ? (
          <EmptyGroups />
        ) : (
          <ul className="space-y-3">
            {groups.map((group) => (
              <li key={group.id}>
                <button
                  type="button"
                  onClick={() => onSelectGroup(group)}
                  className="w-full text-left bg-card rounded-xl border border-gray-100 shadow-sm p-4 hover:border-brand/40 transition min-h-[64px]"
                >
                  <div className="font-medium text-ink">{group.name}</div>
                  <div className="mt-1 text-xs text-muted">
                    Invite code:{' '}
                    <span className="font-mono tabular tracking-wider text-ink">
                      {group.invite_code}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {sheet === 'new' && (
        <NewGroupSheet
          onClose={() => setSheet(null)}
          onCreated={handleCreated}
        />
      )}

      {sheet === 'join' && (
        <JoinGroupSheet
          onClose={() => setSheet(null)}
          onJoined={handleJoined}
        />
      )}
    </main>
  )
}

function EmptyGroups() {
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
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </div>
      <p className="text-base text-ink mb-1">No groups yet</p>
      <p className="text-sm">
        Start one, or join an existing group with an invite code.
      </p>
    </div>
  )
}

function NewGroupSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (group: Group) => void
}) {
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!user) return
    const trimmed = name.trim()
    if (!trimmed) return

    setSubmitting(true)
    setError(null)

    const inviteCode = generateInviteCode()

    const { data: group, error: insertGroupError } = await supabase
      .from('groups')
      .insert({
        name: trimmed,
        invite_code: inviteCode,
        created_by: user.id,
      })
      .select()
      .single()

    if (insertGroupError || !group) {
      setError(insertGroupError?.message ?? 'Could not create group')
      setSubmitting(false)
      return
    }

    const { error: memberError } = await supabase
      .from('group_members')
      .insert({
        group_id: group.id,
        user_id: user.id,
        display_name: user.email ?? 'Member',
      })

    if (memberError) {
      await supabase.from('groups').delete().eq('id', group.id)
      setError(memberError.message)
      setSubmitting(false)
      return
    }

    setSubmitting(false)
    onCreated(group)
  }

  return (
    <Sheet title="New Group" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="group-name"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Group name
          </label>
          <input
            id="group-name"
            type="text"
            autoFocus
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Roomies, Tahoe trip, …"
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
          disabled={submitting || !name.trim()}
          className="w-full py-3 bg-brand text-white font-medium rounded-lg hover:bg-brand-dark disabled:opacity-60 disabled:cursor-not-allowed transition min-h-[44px]"
        >
          {submitting ? 'Creating…' : 'Create group'}
        </button>
      </form>
    </Sheet>
  )
}

function JoinGroupSheet({
  onClose,
  onJoined,
}: {
  onClose: () => void
  onJoined: (group: Group) => void
}) {
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) return

    setSubmitting(true)
    setError(null)

    const { data, error: rpcError } = await supabase.rpc(
      'join_group_by_invite',
      { invite: trimmed },
    )

    if (rpcError || !data) {
      setError(rpcError?.message ?? 'Could not join group')
      setSubmitting(false)
      return
    }

    setSubmitting(false)
    onJoined(data as Group)
  }

  return (
    <Sheet title="Join Group" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="invite-code"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Invite code
          </label>
          <input
            id="invite-code"
            type="text"
            autoFocus
            required
            maxLength={12}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCD23"
            className="w-full px-3 py-3 border border-gray-300 rounded-lg font-mono tracking-widest text-center uppercase focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
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
          disabled={submitting || !code.trim()}
          className="w-full py-3 bg-brand text-white font-medium rounded-lg hover:bg-brand-dark disabled:opacity-60 disabled:cursor-not-allowed transition min-h-[44px]"
        >
          {submitting ? 'Joining…' : 'Join group'}
        </button>
      </form>
    </Sheet>
  )
}
