// ─── Button ──────────────────────────────────────────────────
import React from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  icon?: React.ReactNode;
}

export function Button({ variant = 'primary', loading, icon, children, className = '', ...props }: ButtonProps) {
  const base = {
    primary:   'btn-primary',
    secondary: 'btn-secondary',
    danger:    'btn-danger',
    ghost:     'btn-ghost',
  }[variant];

  return (
    <button className={`${base} ${className}`} disabled={loading || props.disabled} {...props}>
      {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

// ─── Input ────────────────────────────────────────────────────
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Input({ label, error, hint, className = '', ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="label">{label}</label>}
      <input className={`input ${error ? 'border-red-400 focus:ring-red-200' : ''} ${className}`} {...props} />
      {error && <p className="text-xs text-red-500">{error}</p>}
      {hint && !error && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

// ─── Select ───────────────────────────────────────────────────
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export function Select({ label, error, options, placeholder, className = '', ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="label">{label}</label>}
      <select className={`input ${error ? 'border-red-400' : ''} ${className}`} {...props}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ─── Badge ────────────────────────────────────────────────────
import { statusColor, capitalize } from '../../utils/formatters';

export function StatusBadge({ status }: { status: string }) {
  return <span className={statusColor(status)}>{capitalize(status)}</span>;
}

// ─── StatCard ─────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ReactNode;
  color?: string;
}

export function StatCard({ label, value, sub, icon, color = 'text-navy' }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
        {icon && <span className={`${color} opacity-70`}>{icon}</span>}
      </div>
      <p className={`text-2xl font-bold font-display ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  if (!open) return null;
  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-white rounded-2xl shadow-2xl w-full ${widths[size]} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="font-display text-lg text-navy">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl font-bold leading-none">×</button>
        </div>
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  );
}

// ─── ConfirmDialog ────────────────────────────────────────────
interface ConfirmProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'danger' | 'primary';
  loading?: boolean;
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', variant = 'primary', loading }: ConfirmProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p className="text-sm text-slate-600 mb-5">{message}</p>
      <div className="flex gap-3 justify-end">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant={variant} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}

// ─── PageHeader ───────────────────────────────────────────────
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="font-display text-2xl text-navy">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────
export function EmptyState({ message = 'No records found' }: { message?: string }) {
  return (
    <div className="text-center py-16 text-slate-400">
      <div className="text-5xl mb-3">📭</div>
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}

// ─── Spinner ──────────────────────────────────────────────────
export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'w-4 h-4', md: 'w-7 h-7', lg: 'w-10 h-10' }[size];
  return (
    <div className="flex justify-center items-center py-10">
      <div className={`${s} border-2 border-navy/20 border-t-navy rounded-full animate-spin`} />
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────
interface PaginationProps {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}

export function Pagination({ page, totalPages, onPage }: PaginationProps) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center gap-2 justify-end pt-4">
      <Button variant="ghost" onClick={() => onPage(page - 1)} disabled={page <= 1}>← Prev</Button>
      <span className="text-xs text-slate-500 px-2">Page {page} of {totalPages}</span>
      <Button variant="ghost" onClick={() => onPage(page + 1)} disabled={page >= totalPages}>Next →</Button>
    </div>
  );
}

// ─── WorkflowBadge ────────────────────────────────────────────
export function WorkflowTimeline({ trail }: { trail: { action: string; action_by_name?: string; action_at: string; remarks?: string }[] }) {
  const icons: Record<string, string> = {
    created: '🟡', submitted: '🔵', approved_1: '🟢', approved_2: '✅',
    processed: '💚', rejected: '🔴', reversed: '⚠️', paid: '💰',
  };
  return (
    <div className="space-y-3">
      {trail.map((t, i) => (
        <div key={i} className="flex gap-3 text-sm">
          <span className="text-base">{icons[t.action] || '⚪'}</span>
          <div>
            <p className="font-medium text-slate-700 capitalize">{t.action.replace(/_/g, ' ')}</p>
            <p className="text-xs text-slate-400">{t.action_by_name || 'System'} · {new Date(t.action_at).toLocaleString()}</p>
            {t.remarks && <p className="text-xs text-slate-500 italic mt-0.5">"{t.remarks}"</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── CurrencyInput ────────────────────────────────────────────
interface CurrencyInputProps {
  label: string;
  value: number | string;
  onChange: (val: number) => void;
  error?: string;
  hint?: string;
  required?: boolean;
}

export function CurrencyInput({ label, value, onChange, error, hint, required }: CurrencyInputProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="label">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-sm font-semibold">K</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          className={`input pl-8 font-mono ${error ? 'border-red-400' : ''}`}
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      {hint && !error && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
