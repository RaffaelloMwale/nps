import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, User, Building, CreditCard, CheckCircle,
  Circle, DollarSign, FileText, Calendar
} from 'lucide-react';
import api from '../../config/api';
import { Button, Spinner, StatusBadge, Modal, Input } from '../../components/ui';
import { formatMWK, formatDate, formatDateTime } from '../../utils/formatters';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';

function InfoRow({ label, value, mono = false }: { label: string; value?: any; mono?: boolean }) {
  if (!value && value !== 0) return (
    <div className="flex justify-between py-2 border-b border-slate-100">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-xs text-slate-300">—</span>
    </div>
  );
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-slate-100">
      <span className="text-xs text-slate-500 flex-shrink-0">{label}</span>
      <span className={`text-xs font-medium text-right ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

export default function GratuityDetailPage() {
  const { id }  = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const qc       = useQueryClient();
  const isAdmin  = user?.role === 'admin';
  const isApprover2 = user?.role === 'approver_2' || isAdmin;

  const [markModal, setMarkModal] = useState(false);
  const [ifmisTrf,  setIfmisTrf]  = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['gratuity', id],
    queryFn:  () => api.get(`/gratuity/${id}`).then(r => r.data.data),
  });

  const markMutation = useMutation({
    mutationFn: () => api.post(`/gratuity/${id}/mark-received`, {
      ifmisTrfNumber: ifmisTrf || undefined,
      received: true,
    }),
    onSuccess: () => {
      toast.success('Marked as received');
      setMarkModal(false);
      setIfmisTrf('');
      qc.invalidateQueries({ queryKey: ['gratuity', id] });
      qc.invalidateQueries({ queryKey: ['gratuity'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed'),
  });

  const unmarkMutation = useMutation({
    mutationFn: () => api.post(`/gratuity/${id}/mark-received`, { received: false }),
    onSuccess: () => {
      toast.success('Unmarked');
      qc.invalidateQueries({ queryKey: ['gratuity', id] });
    },
  });

  if (isLoading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (!data) return <div className="card text-center py-16 text-slate-400">Record not found</div>;

  const g = data;
  const balanceAfter = parseFloat(g.gb_balance || 0);

  return (
    <div className="max-w-4xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/gratuity">
          <Button variant="ghost" icon={<ArrowLeft size={14} />}>Back</Button>
        </Link>
      </div>

      {/* Title bar */}
      <div className="card">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-navy rounded-xl flex items-center justify-center flex-shrink-0">
              <DollarSign size={22} className="text-gold" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-display text-xl text-navy">{g.gratuity_ref}</h1>
                <StatusBadge status={g.status} />
                {g.is_partial && (
                  <span className="badge bg-amber-100 text-amber-700 text-xs">Partial</span>
                )}
              </div>
              <p className="text-sm text-slate-500 mt-0.5">
                {g.gratuity_type?.charAt(0).toUpperCase() + g.gratuity_type?.slice(1)} Gratuity
                {g.claim_date && ` · Claimed ${formatDate(g.claim_date)}`}
              </p>
            </div>
          </div>

          {/* Received toggle — only for paid records */}
          {g.status === 'paid' && (
            <div className="flex items-center gap-2">
              {g.gratuity_received ? (
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 text-green-600 text-sm font-semibold">
                    <CheckCircle size={16} /> Received by pensioner
                  </span>
                  {isApprover2 && (
                    <button
                      onClick={() => unmarkMutation.mutate()}
                      className="text-xs text-slate-400 hover:text-red-500 underline"
                    >
                      Unmark
                    </button>
                  )}
                </div>
              ) : (
                <Button
                  icon={<Circle size={14} />}
                  variant="secondary"
                  onClick={() => setMarkModal(true)}
                >
                  Mark as Received
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Key amounts bar */}
        <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Amount Paid</p>
            <p className="text-xl font-bold font-display text-navy mt-0.5">{formatMWK(g.amount_requested)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Total Due</p>
            <p className="text-lg font-bold font-display text-slate-600 mt-0.5">{formatMWK(g.total_gratuity_due_snapshot)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Balance Remaining</p>
            <p className={`text-lg font-bold font-display mt-0.5 ${balanceAfter > 0 ? 'text-amber-600' : 'text-green-600'}`}>
              {formatMWK(balanceAfter)}
              {balanceAfter <= 0 && <span className="text-xs ml-1 font-normal">✓ Fully paid</span>}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">IFMIS TRF</p>
            {g.ifmis_trf_number ? (
              <p className="text-sm font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded mt-0.5 inline-block">
                {g.ifmis_trf_number}
              </p>
            ) : (
              <p className="text-sm text-slate-300 mt-0.5">Not provided</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

        {/* ── Pensioner Details ────────────────────────────────── */}
        <div className="card space-y-0">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
            <User size={15} className="text-navy" />
            <h2 className="font-display text-sm text-navy">Pensioner</h2>
            <Link to={`/pensioners/${g.pensioner_uuid}`}
              className="ml-auto text-xs text-navy/60 hover:text-navy underline">
              View Profile →
            </Link>
          </div>
          <InfoRow label="Full Name"       value={g.pensioner_name} />
          <InfoRow label="Pension No"      value={g.pension_no} mono />
          <InfoRow label="Employee No"     value={g.employee_no} mono />
          <InfoRow label="National ID"     value={g.national_id} />
          <InfoRow label="Phone"           value={g.phone_primary} />
          <InfoRow label="Email"           value={g.email} />
          <InfoRow label="Gender"          value={g.gender ? g.gender.charAt(0).toUpperCase() + g.gender.slice(1) : undefined} />
          <InfoRow label="Date of Birth"   value={formatDate(g.date_of_birth)} />
        </div>

        {/* ── Employment & Pension ─────────────────────────────── */}
        <div className="card space-y-0">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
            <Building size={15} className="text-navy" />
            <h2 className="font-display text-sm text-navy">Employment & Pension</h2>
          </div>
          <InfoRow label="Department"         value={g.department_name} />
          <InfoRow label="Designation"        value={g.designation_at_retirement} />
          <InfoRow label="Grade"              value={g.grade_at_retirement} />
          <InfoRow label="Retirement Date"    value={formatDate(g.date_of_retirement)} />
          <InfoRow label="Pension Start"      value={formatDate(g.pension_start_date)} />
          <InfoRow label="Monthly Pension"    value={formatMWK(g.monthly_pension)} mono />
          <InfoRow label="Status"             value={g.pensioner_status} />
          {parseFloat(g.pre_retirement_gratuity_paid || 0) > 0 && (
            <InfoRow label="Pre-Retirement Paid"
              value={`(${formatMWK(g.pre_retirement_gratuity_paid)}) deducted`} />
          )}
        </div>

        {/* ── Bank Account ─────────────────────────────────────── */}
        <div className="card space-y-0">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
            <CreditCard size={15} className="text-navy" />
            <h2 className="font-display text-sm text-navy">Bank Account</h2>
          </div>
          {g.bank_name ? (
            <>
              <InfoRow label="Bank"           value={g.bank_name} />
              <InfoRow label="Branch"         value={g.branch_name} />
              <InfoRow label="Account Name"   value={g.account_name} />
              <InfoRow label="Account Number" value={g.account_number} mono />
              <InfoRow label="Account Type"   value={g.account_type} />
            </>
          ) : (
            <p className="text-xs text-slate-400 py-3 text-center">No bank account on file</p>
          )}
        </div>

        {/* ── Payment Details ───────────────────────────────────── */}
        <div className="card space-y-0">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
            <FileText size={15} className="text-navy" />
            <h2 className="font-display text-sm text-navy">Payment Details</h2>
          </div>
          <InfoRow label="Gratuity Ref"     value={g.gratuity_ref} mono />
          <InfoRow label="Type"             value={g.gratuity_type} />
          <InfoRow label="Claim Date"       value={formatDate(g.claim_date)} />
          <InfoRow label="Payment Date"     value={formatDate(g.payment_date)} />
          <InfoRow label="IFMIS TRF No."    value={g.ifmis_trf_number} mono />
          <InfoRow label="Payment Ref"      value={g.payment_ref} mono />
          <InfoRow label="Transaction Ref"  value={g.transaction_ref} mono />
          <InfoRow label="Received?"
            value={g.gratuity_received ? '✓ Yes — confirmed received' : '⏳ Not yet confirmed'} />
          {g.is_partial && (
            <InfoRow label="Partial Reason" value={g.partial_reason} />
          )}
          {g.notes && <InfoRow label="Notes" value={g.notes} />}
        </div>
      </div>

      {/* ── Workflow Timeline ─────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
          <Calendar size={15} className="text-navy" />
          <h2 className="font-display text-sm text-navy">Approval Timeline</h2>
        </div>
        <div className="space-y-0">
          {[
            { label: 'Created',     name: g.created_by_name,    at: g.created_at,    done: true },
            { label: 'Submitted',   name: g.submitted_by_name,  at: g.submitted_at,  done: !!g.submitted_at },
            { label: 'Approved L1', name: g.approved_by_1_name, at: g.approved_at_1, done: !!g.approved_at_1 },
            { label: 'Approved L2', name: g.approved_by_2_name, at: g.approved_at_2, done: !!g.approved_at_2 },
            { label: 'Paid',        name: g.paid_by_name,       at: g.paid_at,       done: g.status === 'paid' },
          ].map(({ label, name, at, done }) => (
            <div key={label} className="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-0">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                done ? 'bg-green-100' : 'bg-slate-100'
              }`}>
                {done
                  ? <CheckCircle size={13} className="text-green-600" />
                  : <Circle      size={13} className="text-slate-300" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-semibold ${done ? 'text-slate-700' : 'text-slate-400'}`}>{label}</p>
                {done && name && <p className="text-xs text-slate-400">{name}</p>}
              </div>
              {done && at && (
                <p className="text-xs text-slate-400 whitespace-nowrap">{formatDate(at)}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Beneficiary (for death gratuity) ────────────────────── */}
      {g.gratuity_type === 'death' && g.beneficiary_name && (
        <div className="card">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
            <User size={15} className="text-navy" />
            <h2 className="font-display text-sm text-navy">Beneficiary</h2>
          </div>
          <div className="grid grid-cols-2 gap-x-8">
            <InfoRow label="Name"         value={g.beneficiary_name} />
            <InfoRow label="Relationship" value={g.beneficiary_relation} />
            <InfoRow label="ID / Passport" value={g.beneficiary_id_no} />
            <InfoRow label="Phone"        value={g.beneficiary_phone} />
          </div>
        </div>
      )}

      {/* Mark as Received modal */}
      <Modal open={markModal} onClose={() => setMarkModal(false)}
        title="Confirm Gratuity Receipt" size="sm">
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
            <p className="font-semibold">Confirm receipt for {g.gratuity_ref}</p>
            <p className="text-xs mt-0.5">Amount: <strong>{formatMWK(g.amount_requested)}</strong> · Pensioner: {g.pensioner_name}</p>
          </div>
          <Input
            label="IFMIS Transfer Reference Number"
            value={ifmisTrf}
            onChange={e => setIfmisTrf(e.target.value.toUpperCase())}
            placeholder="e.g. IFMIS-2026-00123456"
            hint="Enter the IFMIS TRF number — leave blank if not yet assigned"
          />
          <div className="flex gap-3 justify-end pt-1">
            <Button variant="ghost" onClick={() => setMarkModal(false)}>Cancel</Button>
            <Button icon={<CheckCircle size={14} />} loading={markMutation.isPending}
              onClick={() => markMutation.mutate()}>
              Confirm Received
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
