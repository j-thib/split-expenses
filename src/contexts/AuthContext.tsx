import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import type { AuthError, Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type AuthResult = { error: AuthError | null }
type SignUpResult = AuthResult & { emailAlreadyInUse: boolean }

type AuthContextValue = {
  user: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<AuthResult>
  signUp: (email: string, password: string) => Promise<SignUpResult>
  signOut: () => Promise<AuthResult>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setUser(data.session?.user ?? null)
      setLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession)
        setUser(nextSession?.user ?? null)
        setLoading(false)
      },
    )

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      loading,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        return { error }
      },
      signUp: async (email, password) => {
        const { data, error } = await supabase.auth.signUp({ email, password })
        console.log('[signUp debug]', {
          hasError: !!error,
          errorMessage: error?.message,
          hasUser: !!data.user,
          hasSession: !!data.session,
          identities: data.user?.identities,
          identitiesLength: data.user?.identities?.length,
          confirmedAt: data.user?.confirmed_at,
          emailConfirmedAt: data.user?.email_confirmed_at,
          createdAt: data.user?.created_at,
          userMetadata: data.user?.user_metadata,
        })
        const identities = data.user?.identities
        const emailAlreadyInUse =
          !error && data.user != null && (identities == null || identities.length === 0)
        return { error, emailAlreadyInUse }
      },
      signOut: async () => {
        const { error } = await supabase.auth.signOut()
        return { error }
      },
    }),
    [user, session, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
