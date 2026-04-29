import { useState, useRef, useEffect } from 'react'

/**
 * DateInput — auto-advancing MM / DD / YYYY segments.
 *
 * Interface:
 *   value     – YYYY-MM-DD string or ''
 *   onChange  – called with YYYY-MM-DD string (or '' when cleared)
 *   onBlur    – forwarded from react-hook-form Controller
 *   hasError  – turns border red
 *   disabled
 *   className – applied to the outer container (e.g. "w-full")
 *
 * Auto-advance rules:
 *   Month → Day  : after 2 digits, or after 1 digit that can't be a valid
 *                  10-12 prefix (i.e. first digit > 1)
 *   Day   → Year : after 2 digits, or after 1 digit > 3 (day can't be 4X+)
 *   Backspace    : when a field is empty, focus moves to the previous field
 */
export default function DateInput({
  value    = '',
  onChange,
  onBlur,
  hasError = false,
  disabled = false,
  className = '',
}) {
  const mRef = useRef()
  const dRef = useRef()
  const yRef = useRef()

  const [month, setMonth] = useState('')
  const [day,   setDay]   = useState('')
  const [year,  setYear]  = useState('')

  // ── Sync from external value ──────────────────────────────────────────────
  useEffect(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-')
      // Only update state if it actually differs to avoid cursor-jump issues
      setMonth(p => p !== m ? m : p)
      setDay  (p => p !== d ? d : p)
      setYear (p => p !== y ? y : p)
    } else if (!value) {
      setMonth(p => p !== '' ? '' : p)
      setDay  (p => p !== '' ? '' : p)
      setYear (p => p !== '' ? '' : p)
    }
  }, [value])

  // ── Emit complete date ────────────────────────────────────────────────────
  const emit = (mo, da, ye) => {
    if (mo && da && ye && ye.length === 4) {
      onChange?.(`${ye}-${mo.padStart(2, '0')}-${da.padStart(2, '0')}`)
    } else if (!mo && !da && !ye) {
      onChange?.('')
    }
  }

  // ── Month input ───────────────────────────────────────────────────────────
  const handleMonth = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 2)
    setMonth(raw)
    emit(raw, day, year)
    // Advance: first digit > 1 (can only be a month 2-9), or 2 digits entered
    if (raw.length === 2 || (raw.length === 1 && parseInt(raw, 10) > 1)) {
      dRef.current?.focus()
      dRef.current?.select()
    }
  }

  // ── Day input ─────────────────────────────────────────────────────────────
  const handleDay = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 2)
    setDay(raw)
    emit(month, raw, year)
    // Advance: first digit > 3 (day can't be 4X+), or 2 digits entered
    if (raw.length === 2 || (raw.length === 1 && parseInt(raw, 10) > 3)) {
      yRef.current?.focus()
      yRef.current?.select()
    }
  }

  const handleDayKey = (e) => {
    if (e.key === 'Backspace' && !day) {
      mRef.current?.focus()
      mRef.current?.select()
    }
  }

  // ── Year input ────────────────────────────────────────────────────────────
  const handleYear = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 4)
    setYear(raw)
    emit(month, day, raw)
  }

  const handleYearKey = (e) => {
    if (e.key === 'Backspace' && !year) {
      dRef.current?.focus()
      dRef.current?.select()
    }
  }

  // ── Shared inner-input class ──────────────────────────────────────────────
  const inner = [
    'bg-transparent outline-none text-center',
    'placeholder-slate-300',
    'disabled:cursor-not-allowed',
  ].join(' ')

  return (
    <div className={[
      'flex items-center rounded-lg border bg-white text-sm text-slate-900 transition-colors',
      'focus-within:ring-2',
      hasError
        ? 'border-red-400 focus-within:ring-red-100 focus-within:border-red-400'
        : 'border-slate-200 focus-within:ring-brand-200 focus-within:border-brand-400',
      disabled ? 'opacity-60 cursor-not-allowed bg-slate-50' : '',
      className,
    ].join(' ')}>

      {/* Month */}
      <input
        ref={mRef}
        type="text"
        inputMode="numeric"
        placeholder="MM"
        maxLength={2}
        value={month}
        onChange={handleMonth}
        onBlur={onBlur}
        disabled={disabled}
        className={`${inner} w-10 pl-3 pr-1 py-2`}
      />

      <span className="text-slate-300 select-none text-xs leading-none">/</span>

      {/* Day */}
      <input
        ref={dRef}
        type="text"
        inputMode="numeric"
        placeholder="DD"
        maxLength={2}
        value={day}
        onChange={handleDay}
        onKeyDown={handleDayKey}
        onBlur={onBlur}
        disabled={disabled}
        className={`${inner} w-10 px-1 py-2`}
      />

      <span className="text-slate-300 select-none text-xs leading-none">/</span>

      {/* Year */}
      <input
        ref={yRef}
        type="text"
        inputMode="numeric"
        placeholder="YYYY"
        maxLength={4}
        value={year}
        onChange={handleYear}
        onKeyDown={handleYearKey}
        onBlur={onBlur}
        disabled={disabled}
        className={`${inner} w-16 pl-1 pr-3 py-2`}
      />
    </div>
  )
}
