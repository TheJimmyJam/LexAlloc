import { useState, useEffect, createContext, useContext } from 'react'
import { db } from '../lib/mockDb.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading]  = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('lexalloc_demo_user')
    if (stored) setProfile(JSON.parse(stored))
    setLoading(false)
  }, [])

  const signIn = (email) => {
    const profiles = db.getAll('profiles')
    const found    = profiles.find(p => p.email.toLowerCase() === email.toLowerCase())
    const p        = found || profiles[0]
    localStorage.setItem('lexalloc_demo_user', JSON.stringify(p))
    setProfile(p)
    return p
  }

  const signOut = () => {
    localStorage.removeItem('lexalloc_demo_user')
    setProfile(null)
  }

  const updateProfile = (data) => {
    const updated = { ...profile, ...data }
    localStorage.setItem('lexalloc_demo_user', JSON.stringify(updated))
    setProfile(updated)
  }

  return (
    <AuthContext.Provider value={{ user: profile, profile, loading, signIn, signOut, updateProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
