import { useState, useEffect, createContext, useContext } from 'react'
import { supabase } from '../lib/supabase.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]         = useState(null)
  const [profile, setProfile]   = useState(null)
  const [loading, setLoading]   = useState(true)
  // MFA assurance level: { currentLevel: 'aal1'|'aal2', nextLevel: 'aal1'|'aal2' }
  const [mfaLevel, setMfaLevel] = useState({ currentLevel: 'aal1', nextLevel: 'aal1' })

  async function fetchProfile(userId) {
    const { data } = await supabase
      .from('la_profiles')
      .select('*, la_organizations(*)')
      .eq('id', userId)
      .single()
    setProfile(data)
    return data
  }

  async function refreshMfaLevel() {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (!error && data) {
      setMfaLevel({ currentLevel: data.currentLevel, nextLevel: data.nextLevel })
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        await Promise.all([fetchProfile(session.user.id), refreshMfaLevel()])
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
        refreshMfaLevel()
        // Increment login counter on each new sign-in (not on token refresh)
        if (event === 'SIGNED_IN') {
          supabase.rpc('increment_login_count', { user_id: session.user.id })
            .catch(() => {}) // non-fatal
        }
      } else {
        setProfile(null)
        setMfaLevel({ currentLevel: 'aal1', nextLevel: 'aal1' })
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = () => supabase.auth.signOut()

  // True when an invited user has logged in but hasn't filled in their name yet
  const isProfileIncomplete = !!profile && !profile.first_name && !profile.last_name

  // True when the user has a TOTP factor enrolled (regardless of current session level)
  const hasTOTP = mfaLevel.nextLevel === 'aal2'

  // True when the session is fully MFA-verified (aal2) OR user has no 2FA enrolled
  const mfaVerified = !hasTOTP || mfaLevel.currentLevel === 'aal2'

  return (
    <AuthContext.Provider value={{
      user, profile, loading, signOut,
      refetchProfile: () => fetchProfile(user?.id),
      isProfileIncomplete,
      mfaLevel,
      hasTOTP,
      mfaVerified,
      refreshMfaLevel,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
