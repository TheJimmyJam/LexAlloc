import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronDown, ChevronUp, Sparkles, X, ArrowRight } from 'lucide-react'

/**
 * OnboardingChecklist
 *
 * Props:
 *   steps  — array of { id, label, done, actionLabel, actionTo, actionOnClick }
 *   onDismiss — called when user dismisses the card
 *   onLaunchWizard — called when user clicks "Relaunch wizard"
 */
export default function OnboardingChecklist({ steps = [], onDismiss, onLaunchWizard }) {
  const [collapsed, setCollapsed] = useState(false)

  const doneCount  = steps.filter(s => s.done).length
  const totalCount = steps.length
  const allDone    = doneCount === totalCount
  const pct        = totalCount ? Math.round((doneCount / totalCount) * 100) : 0

  return (
    <div className="card overflow-hidden mb-6">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${allDone ? 'bg-green-100' : 'bg-brand-100'}`}>
            {allDone
              ? <Check className="h-4 w-4 text-green-600" />
              : <Sparkles className="h-4 w-4 text-brand-600" />
            }
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">
              {allDone ? 'Setup complete!' : 'Complete your setup'}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {allDone
                ? 'LexAlloc is fully configured and ready to use.'
                : `${doneCount} of ${totalCount} steps done`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          {/* Progress pill */}
          {!allDone && (
            <span className="text-xs font-semibold text-brand-700 bg-brand-100 px-2 py-0.5 rounded-full">
              {pct}%
            </span>
          )}
          <button
            onClick={() => setCollapsed(v => !v)}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
          <button
            onClick={onDismiss}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
            title="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {!collapsed && (
        <div className="px-5 pt-3.5 pb-0.5">
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${allDone ? 'bg-green-500' : 'bg-brand-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Steps */}
      {!collapsed && (
        <div className="divide-y divide-slate-50 px-5 py-2">
          {steps.map((s, i) => (
            <div key={s.id} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3 min-w-0">
                {/* Step number / check */}
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                  s.done
                    ? 'bg-green-100'
                    : 'bg-slate-100'
                }`}>
                  {s.done
                    ? <Check className="h-3.5 w-3.5 text-green-600" />
                    : <span className="text-xs font-bold text-slate-400">{i + 1}</span>
                  }
                </div>
                <span className={`text-sm ${s.done ? 'text-slate-400 line-through' : 'text-slate-700 font-medium'}`}>
                  {s.label}
                </span>
              </div>

              {/* Action */}
              {!s.done && s.actionLabel && (
                s.actionOnClick ? (
                  <button
                    onClick={s.actionOnClick}
                    className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-800 transition-colors flex-shrink-0 ml-2"
                  >
                    {s.actionLabel}
                    <ArrowRight className="h-3 w-3" />
                  </button>
                ) : (
                  <Link
                    to={s.actionTo || '/matters'}
                    className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-800 transition-colors flex-shrink-0 ml-2"
                  >
                    {s.actionLabel}
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                )
              )}
            </div>
          ))}
        </div>
      )}

      {/* Footer actions */}
      {!collapsed && (
        <div className="px-5 pb-4 flex items-center justify-between">
          {allDone ? (
            <button
              onClick={onDismiss}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              Dismiss
            </button>
          ) : (
            <button
              onClick={onLaunchWizard}
              className="text-xs text-brand-600 hover:text-brand-800 font-medium transition-colors"
            >
              Relaunch setup wizard →
            </button>
          )}
        </div>
      )}
    </div>
  )
}
