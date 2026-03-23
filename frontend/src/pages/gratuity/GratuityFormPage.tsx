import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, DollarSign, CheckCircle, AlertCircle } from 'lucide-react';
import api from '../../config/api';
import { Button, Input, CurrencyInput, Spinner, Select } from '../../components/ui';
import { formatMWK, formatDate } from '../../utils/formatters';
import toast from 'react-hot-toast';

export default function GratuityFormPage() {
  const navigate    = useNavigate();
  const qc          = useQueryClient();
  const [searchParams] = useSearchParams();
  const preId       = searchParams.get('pensionerId') || '';

  const [pensionerId, setPensionerId] = useState(preId);
  const [form, setForm] = useState({
    paymentType:         'full' as 'full' | 'partial' | 'death',
    paymentDate:         new Date().toISOString().slice(0, 10),
    amountPaid:          0,
    ifmisTrfNumber:      '',
    partialReason:       '',
    beneficiaryName:     '',
    beneficiaryRelation: '',
    beneficiaryIdNo:     '',
    beneficiaryPhone:    '',
    notes:               '',
  });

  function set(k: string, v: any) { setForm(f => ({ ...f, [k]: v })); }

  // Pensioner search
  const { data: pensioners } = useQuery({
    queryKey: ['pensioners-payable'],
    queryFn:  () => api.get('/pensioners', { params: { limit: 500 } }).then(r => r.data.data),
  });

  // Live gratuity balance for selected pensioner
  const { data: balance, isLoading: balLoading } = useQuery({
    queryKey: ['gratuity-balance', pensionerId],
    queryFn:  () => api.get(`/pensioners/${pensionerId}/gratuity-balance`).then(r => r.data.data),
    enabled:  !!pensionerId,
  });

  const bal     = balance ? parseFloat(balance.gratuity_balance_remaining) : 0;
  const balDue  = balance ? parseFloat(balance.total_gratuity_due)          : 0;
  const balPaid = balance ? parseFloat(balance.total_gratuity_paid)         : 0;
  const preRetirement = balance ? parseFloat(balance.pre_retirement_gratuity_paid || '0') : 0;
  const isOverBalance = form.amountPaid > bal && bal > 0;
  const noBalance     = bal <= 0 && !!pensionerId && !balLoading;

  // Single-step direct pay — calls /gratuity/direct-pay which
  // creates the record and marks it paid in one DB operation.
  const payMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await api.post('/gratuity/direct-pay', {
        pensionerId,
        paymentType:         data.paymentType,
        paymentDate:         data.paymentDate,
        amountPaid:          data.amountPaid,
        ifmisTrfNumber:      data.ifmisTrfNumber  || undefined,
        partialReason:       data.partialReason   || undefined,
        beneficiaryName:     data.beneficiaryName     || undefined,
        beneficiaryRelation: data.beneficiaryRelation || undefined,
        beneficiaryIdNo:     data.beneficiaryIdNo     || undefined,
        beneficiaryPhone:    data.beneficiaryPhone    || undefined,
        notes:               data.notes           || undefined,
      });
      return res.data.data.id;
    },
    onSuccess: (id) => {
      toast.success('Gratuity payment recorded successfully');
      qc.invalidateQueries({ queryKey: ['gratuity'] });
      qc.invalidateQueries({ queryKey: ['gratuity-balance'] });
      qc.invalidateQueries({ queryKey: ['dashboard-overview'] });
      navigate('/gratuity');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Payment failed');
    },
  });

  function handlePay() {
    if (!pensionerId)        return toast.error('Select a pensioner');
    if (!form.amountPaid)    return toast.error('Enter the amount paid');
    if (isOverBalance)       return toast.error('Amount exceeds available balance');
    if (noBalance)           return toast.error('This pensioner has no remaining gratuity balance');
    payMutation.mutate(form);
  }

  const selectedPensioner = (pensioners || []).find((p: any) => p.id === pensionerId);

  return (
    <div className="max-w-2xl mx-auto space-y-4">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/gratuity">
          <Button variant="ghost" icon={<ArrowLeft size={14} />}>Back</Button>
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 bg-navy rounded-xl flex items-center justify-center flex-shrink-0">
          <DollarSign size={20} className="text-gold" />
        </div>
        <div>
          <h1 className="font-display text-xl text-navy">Pay Gratuity</h1>
          <p className="text-xs text-slate-500">Record a gratuity payment to a pensioner or beneficiary</p>
        </div>
      </div>

      {/* Step 1: Select Pensioner */}
      <div className="card space-y-4">
        <h2 className="font-display text-base text-navy border-b border-slate-100 pb-2">
          1. Select Pensioner
        </h2>
        <Select
          label="Pensioner *"
          value={pensionerId}
          onChange={e => setPensionerId(e.target.value)}
          options={(pensioners || []).map((p: any) => ({
            value: p.id,
            label: `${p.pension_no} — ${p.first_name} ${p.last_name}`,
          }))}
          placeholder="Search and select pensioner…"
        />

        {/* Live balance panel */}
        {pensionerId && (
          <div className={`rounded-xl border p-4 ${
            noBalance
              ? 'bg-red-50 border-red-200'
              : 'bg-slate-50 border-slate-200'
          }`}>
            {balLoading ? (
              <p className="text-sm text-slate-400 text-center py-2">Loading balance…</p>
            ) : balance ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm text-navy">
                    {selectedPensioner?.first_name} {selectedPensioner?.last_name}
                  </p>
                  <span className="font-mono text-xs text-slate-500">{selectedPensioner?.pension_no}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="text-center">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Total Due</p>
                    <p className="font-mono font-bold text-slate-700 text-sm mt-0.5">{formatMWK(balDue)}</p>
                  </div>
                  {preRetirement > 0 && (
                    <div className="text-center">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Pre-Retirement</p>
                      <p className="font-mono font-bold text-amber-600 text-sm mt-0.5">({formatMWK(preRetirement)})</p>
                    </div>
                  )}
                  <div className="text-center">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Already Paid</p>
                    <p className="font-mono font-bold text-emerald-600 text-sm mt-0.5">{formatMWK(balPaid)}</p>
                  </div>
                  <div className={`text-center rounded-lg px-2 py-1 ${
                    noBalance ? 'bg-red-100' : 'bg-navy/5'
                  }`}>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Balance Available</p>
                    <p className={`font-mono font-bold text-base mt-0.5 ${
                      noBalance ? 'text-red-600' : 'text-navy'
                    }`}>
                      {formatMWK(bal)}
                    </p>
                  </div>
                </div>
                {noBalance && (
                  <div className="flex items-center gap-2 text-xs text-red-600 font-semibold">
                    <AlertCircle size={13} />
                    No remaining balance — gratuity has been fully paid
                  </div>
                )}
                {preRetirement > 0 && (
                  <p className="text-[10px] text-amber-600">
                    * Pre-retirement partial of {formatMWK(preRetirement)} has been deducted from the balance
                  </p>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Step 2: Payment Details */}
      <div className={`card space-y-4 ${!pensionerId || noBalance ? 'opacity-50 pointer-events-none' : ''}`}>
        <h2 className="font-display text-base text-navy border-b border-slate-100 pb-2">
          2. Payment Details
        </h2>

        {/* Payment type */}
        <Select
          label="Payment Type *"
          value={form.paymentType}
          onChange={e => set('paymentType', e.target.value)}
          options={[
            { value: 'full',    label: 'Full Payment — pay the entire remaining balance' },
            { value: 'partial', label: 'Partial Payment — pay a portion of the balance' },
            { value: 'death',   label: 'Death Gratuity — payment to beneficiary' },
          ]}
        />

        {/* Auto-fill full amount */}
        {form.paymentType === 'full' && bal > 0 && form.amountPaid === 0 && (
          <button
            type="button"
            onClick={() => set('amountPaid', bal)}
            className="w-full border border-dashed border-navy/30 rounded-lg py-2 text-xs text-navy hover:bg-navy/5 transition-colors font-semibold"
          >
            ↓ Auto-fill full balance: {formatMWK(bal)}
          </button>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CurrencyInput
            label="Amount Paid (MWK) *"
            value={form.amountPaid}
            onChange={v => set('amountPaid', v)}
            required
            error={isOverBalance ? `Exceeds available balance of ${formatMWK(bal)}` : undefined}
            hint={bal > 0 ? `Max: ${formatMWK(bal)}` : undefined}
          />
          <Input
            label="Payment Date *"
            type="date"
            value={form.paymentDate}
            onChange={e => set('paymentDate', e.target.value)}
          />
        </div>

        {/* IFMIS TRF — prominent field */}
        <div>
          <label className="label">IFMIS Transfer Reference Number (TRF)</label>
          <div className="relative">
            <input
              type="text"
              value={form.ifmisTrfNumber}
              onChange={e => set('ifmisTrfNumber', e.target.value)}
              className="input font-mono uppercase"
              placeholder="e.g. IFMIS-2026-00123456"
            />
            {form.ifmisTrfNumber && (
              <CheckCircle size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500" />
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Enter the IFMIS TRF number from the payment system. When provided, the payment will automatically be marked as received.
          </p>
        </div>

        {/* Partial reason */}
        {form.paymentType === 'partial' && (
          <Input
            label="Reason for Partial Payment *"
            value={form.partialReason}
            onChange={e => set('partialReason', e.target.value)}
            placeholder="e.g. Pensioner requested partial, remaining to be paid next quarter"
          />
        )}

        {/* Death gratuity — beneficiary details */}
        {form.paymentType === 'death' && (
          <div className="space-y-3 bg-slate-50 rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Beneficiary Details</p>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Beneficiary Full Name *"   value={form.beneficiaryName}     onChange={e => set('beneficiaryName', e.target.value)} />
              <Input label="Relationship *"            value={form.beneficiaryRelation}  onChange={e => set('beneficiaryRelation', e.target.value)} placeholder="e.g. Spouse, Child" />
              <Input label="National ID / Passport"    value={form.beneficiaryIdNo}      onChange={e => set('beneficiaryIdNo', e.target.value)} />
              <Input label="Phone"                     value={form.beneficiaryPhone}     onChange={e => set('beneficiaryPhone', e.target.value)} />
            </div>
          </div>
        )}

        <Input
          label="Notes"
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder="Any additional notes…"
        />
      </div>

      {/* Summary before paying */}
      {form.amountPaid > 0 && pensionerId && !noBalance && !isOverBalance && (
        <div className="card bg-navy/5 border-navy/20 space-y-2">
          <p className="font-semibold text-sm text-navy">Payment Summary</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <span className="text-slate-500">Pensioner</span>
            <span className="font-medium">
              {selectedPensioner ? `${selectedPensioner.first_name} ${selectedPensioner.last_name}` : '—'}
            </span>
            <span className="text-slate-500">Payment Type</span>
            <span className="font-medium capitalize">{form.paymentType}</span>
            <span className="text-slate-500">Amount</span>
            <span className="font-mono font-bold text-navy">{formatMWK(form.amountPaid)}</span>
            <span className="text-slate-500">IFMIS TRF</span>
            <span className="font-mono text-sm">
              {form.ifmisTrfNumber
                ? <span className="text-green-600 font-semibold">{form.ifmisTrfNumber}</span>
                : <span className="text-slate-400 italic">Not provided</span>}
            </span>
            <span className="text-slate-500">Payment Date</span>
            <span>{formatDate(form.paymentDate)}</span>
            <span className="text-slate-500">Remaining After</span>
            <span className="font-mono font-semibold text-amber-600">{formatMWK(bal - form.amountPaid)}</span>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex justify-end gap-3 pb-4">
        <Link to="/gratuity">
          <Button variant="ghost">Cancel</Button>
        </Link>
        <Button
          icon={<DollarSign size={14} />}
          loading={payMutation.isPending}
          disabled={!pensionerId || !form.amountPaid || isOverBalance || noBalance}
          onClick={handlePay}
          className="px-8"
        >
          {payMutation.isPending ? 'Processing…' : 'Record Gratuity Payment'}
        </Button>
      </div>

    </div>
  );
}
