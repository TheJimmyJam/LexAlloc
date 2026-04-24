import { useState } from 'react'
import { useAuth } from '../hooks/useAuth.jsx'
import { db } from '../lib/mockDb.js'
import { Shield, Users, Building2, Mail } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'

export default function AdminPanel() {
  const { profile } = useAuth()
  const [tab, setTab] = useState('users')
  const users = db.getAll('profiles', { org_id: profile?.org_id })
  const orgs  = db.getAll('organizations')

  const roleColors = { admin:'bg-brand-100 text-brand-700', client:'bg-blue-100 text-blue-700', user:'bg-slate-100 text-slate-600' }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 bg-brand-100 rounded-lg flex items-center justify-center"><Shield className="h-5 w-5 text-brand-600"/></div>
        <div><h1 className="text-2xl font-bold text-slate-900">Admin Panel</h1><p className="text-slate-500 text-sm">Manage users and organizations</p></div>
      </div>

      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {[{key:'users',label:'Users',icon:Users},{key:'orgs',label:'Organizations',icon:Building2}].map(({key,label,icon:Icon})=>(
          <button key={key} onClick={()=>setTab(key)} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab===key?'border-brand-600 text-brand-600':'border-transparent text-slate-500 hover:text-slate-700'}`}>
            <Icon className="h-4 w-4"/>{label}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-500">{users.length} users in your org</p>
            <button onClick={()=>toast('Invite emails require Resend — set up in production')} className="btn-primary"><Mail className="h-4 w-4"/> Invite User</button>
          </div>
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead><tr className="border-b border-slate-100 bg-slate-50">{['Name','Email','Role','Joined'].map(h=><th key={h} className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4 font-medium text-slate-800">{u.first_name} {u.last_name}{u.id===profile?.id&&<span className="ml-2 text-xs text-slate-400">(you)</span>}</td>
                    <td className="px-5 py-4 text-sm text-slate-500">{u.email}</td>
                    <td className="px-5 py-4"><span className={`badge ${roleColors[u.role]||'bg-slate-100 text-slate-600'}`}>{u.role}</span></td>
                    <td className="px-5 py-4 text-sm text-slate-400">{u.created_at ? format(parseISO(u.created_at),'MM/dd/yyyy') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'orgs' && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-slate-100 bg-slate-50">{['Organization','Created'].map(h=><th key={h} className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {orgs.map(o => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td className="px-5 py-4 font-medium text-slate-800">{o.name}{o.id===profile?.org_id&&<span className="ml-2 text-xs text-brand-600 font-semibold">(yours)</span>}</td>
                  <td className="px-5 py-4 text-sm text-slate-400">{o.created_at ? format(parseISO(o.created_at),'MM/dd/yyyy') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
