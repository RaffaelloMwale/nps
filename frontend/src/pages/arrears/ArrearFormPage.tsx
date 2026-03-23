import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ArrowLeft, Check, Calculator } from 'lucide-react';
import api from '../../config/api';
import { Button, Input, Select, CurrencyInput, PageHeader, Spinner } from '../../components/ui';
import { formatMWK, formatDate } from '../../utils/formatters';
import toast from 'react-hot-toast';

export default function ArrearFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedId = searchParams.get('pensionerId') || '';

  const [form, setForm] = useState({
    pensionerId:    preselectedId,
    arrearType:     'pension_gap',
    description:    '',
    fromPeriod:     '',
    toPeriod:       '',
    numberOfMonths: 0,
    monthlyAmount:  0,
    computedAmount: 0,
    notes:          '',
  });
  const [gapChecked, setGapChecked] = useState(false);

  function set(field: string, value: any) { setForm(f => ({ ...f, [field]: value })); }

  const { data: pensioners } = useQuery({
    queryKey: ['pensioners-all'],
    queryFn: () => api.get('/pensioners', { params: { limit: 500 } }).then(r => r.data.data),
  });

  const { data: gapData, isLoading: gapLoading, refetch: checkGap } = useQuery({
    queryKey: ['gap-check', form.pensionerId],
    queryFn: () => api.get(`/arrears/pensioner/${form.pensionerId}/gap-check`).then(r => r.data.data),
    enabled: false,
  });

  async function handleGapCheck() {
    if (!form.pensionerId) return toast.error('Select a pensioner first');
    await checkGap();
    setGapChecked(true);
    if (gapData) {
      set('numberOfMonths', gapData.gap_months || 0);
      set('monthlyAmount',  parseFloat(gapData.monthly_pension) || 0);
      set('computedAmount', parseFloat(gapData.gap_amount) || 0);
      set('description', `Pension gap: ${gapData.gap_months} months unpaid from ${formatDate(gapData.date_of_retirement)} to ${formatDate(gapData.pension_start_date)}`);
    }
  }

  const mutation = useMutation({
    mutationFn: (data: typeof form) => api.post('/arrears', data),
    onSuccess: res => {
      toast.success('Arrear record created');
      navigate('/arrears');
    },
  });

  const ARREAR_TYPES = [
    { value: 'pension_gap',      label: 'Pension Gap — months with no payment between retirement and start date' },
    { value: 'underpayment',     label: 'Underpayment — was paid less than entitled for a period' },
    { value: 'gratuity_balance', label: 'Gratuity Balance — outstanding gratuity owed' },
    { value: 'salary_arrear',    label: 'Salary Arrear — salary owed before retirement' },
    { value: 'other',            label: 'Other' },
  ];

  function recalculate() {
    if (form.arrearType === 'pension_gap' || form.arrearType === 'underpayment') {
      if (form.numberOfMonths && form.monthlyAmount) {
        set('computedAmount', form.numberOfMonths * form.monthlyAmount);
      }
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/arrears"><Button variant="ghost" icon={<ArrowLeft size={14} />}>Back</Button></Link>
      </div>
      <PageHeader title="New Arrear Record" subtitle="Record an arrear owed to a pensioner" />

      <div className="card space-y-5">
        {/* Pensioner */}
        <Select
          label="Pensioner *"
          value={form.pensionerId}
          onChange={e => { set('pensionerId', e.target.value); setGapChecked(false); }}
          options={(pensioners || []).map((p: any) => ({
            value: p.id,
            label: `${p.pension_no} — ${p.first_name} ${p.last_name}`,
          }))}
          placeholder="Select pensioner…"
        />

        {/* Arrear type */}
        <Select
          label="Arrear Type *"
          value={form.arrearType}
          onChange={e => set('arrearType', e.target.value)}
          options={ARREAR_TYPES}
        />

        {/* Pension gap auto-check */}
        {(form.arrearType === 'pension_gap') && form.pensionerId && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-blue-800">Auto-Calculate Pension Gap</p>
              <Button variant="secondary" icon={<Calculator size={13} />}
                loading={gapLoading} onClick={handleGapCheck}>
                Check Gap
              </Button>
            </div>
            {gapData && (
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><span className="text-slate-500">Retirement Date:</span> <strong>{formatDate(gapData.date_of_retirement)}</strong></div>
                <div><span className="text-slate-500">Pension Start:</span> <strong>{formatDate(gapData.pension_start_date)}</strong></div>
                <div><span className="text-slate-500">Gap Months:</span> <strong className="text-amber-600">{gapData.gap_months || 0} months</strong></div>
                <div><span className="text-slate-500">Monthly Pension:</span> <strong>{formatMWK(gapData.monthly_pension)}</strong></div>
                <div className="col-span-2"><span className="text-slate-500">Calculated Gap Amount:</span> <strong className="text-navy text-sm">{formatMWK(gapData.gap_amount)}</strong></div>
              </div>
            )}
            <p className="text-xs text-blue-600">The gap is calculated as: months between retirement date and pension start date × monthly pension amount.</p>
          </div>
        )}

        {/* Period */}
        <div className="grid grid-cols-2 gap-4">
          <Input label="From Period (YYYY-MM)" value={form.fromPeriod}
            onChange={e => set('fromPeriod', e.target.value)} placeholder="2023-04" />
          <Input label="To Period (YYYY-MM)" value={form.toPeriod}
            onChange={e => set('toPeriod', e.target.value)} placeholder="2023-09" />
        </div>

        {/* For gap/underpayment: show months × rate calculator */}
        {(form.arrearType === 'pension_gap' || form.arrearType === 'underpayment') && (
          <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <p className="col-span-2 text-xs font-semibold text-slate-600 uppercase tracking-wide">Quick Calculator</p>
            <div>
              <label className="label">Number of Months</label>
              <input type="number" min="0" value={form.numberOfMonths}
                onChange={e => { set('numberOfMonths', parseInt(e.target.value)||0); }}
                onBlur={recalculate}
                className="input" />
            </div>
            <CurrencyInput label="Monthly Amount (MWK)" value={form.monthlyAmount}
              onChange={v => { set('monthlyAmount', v); }}
            />
            <div className="col-span-2 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                {form.numberOfMonths} months × {formatMWK(form.monthlyAmount)} =
                <strong className="text-navy ml-1">{formatMWK(form.numberOfMonths * form.monthlyAmount)}</strong>
              </p>
              <Button variant="secondary" icon={<Calculator size={12} />} onClick={() => {
                set('computedAmount', form.numberOfMonths * form.monthlyAmount);
              }}>
                Apply to Amount
              </Button>
            </div>
          </div>
        )}

        {/* Total amount */}
        <CurrencyInput
          label="Total Amount Owed (MWK) *"
          value={form.computedAmount}
          onChange={v => set('computedAmount', v)}
          required
          hint="The total arrear amount to be paid to this pensioner"
        />

        {/* Description */}
        <div>
          <label className="label">Description *</label>
          <textarea
            className="input min-h-20 resize-none"
            value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Explain the reason for this arrear…"
          />
        </div>

        <Input label="Notes" value={form.notes} onChange={e => set('notes', e.target.value)} />

        <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
          <Link to="/arrears"><Button variant="ghost">Cancel</Button></Link>
          <Button icon={<Check size={14} />} loading={mutation.isPending}
            disabled={!form.computedAmount || !form.description || !form.pensionerId}
            onClick={() => mutation.mutate(form)}>
            Create Arrear Record
          </Button>
        </div>
      </div>
    </div>
  );
}
