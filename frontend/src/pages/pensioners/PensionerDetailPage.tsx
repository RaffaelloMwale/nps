import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Edit, AlertTriangle, Download } from 'lucide-react';
import api, { downloadReport } from '../../config/api';
import {
  Button, StatusBadge, Spinner, Modal, Input, PageHeader,
  WorkflowTimeline, CurrencyInput
} from '../../components/ui';
import { formatMWK, formatDate } from '../../utils/formatters';
import { useAuthStore, canCreate } from '../../store/authStore';
import toast from 'react-hot-toast';

export default function PensionerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'overview' | 'payments' | 'gratuity' | 'arrears' | 'adjustments'>('overview');
  const [deathModal, setDeathModal] = useState(false);
  const [deathForm, setDeathForm] = useState({ dateOfDeath: '', notifiedBy: '', deathCertNo: '', notes: '' });

  const { data: pensioner, isLoading } = useQuery({
    queryKey: ['pensioner', id],
    queryFn: () => api.get(`/pensioners/${id}`).then(r => r.data.data),
  });

  const { data: gratuityBalance } = useQuery({
    queryKey: ['gratuity-balance', id],
    queryFn: () => api.get(`/pensioners/${id}/gratuity-balance`).then(r => r.data.data),
  });

  const { data: payments } = useQuery({
    queryKey: ['pensioner-payments', id],
    queryFn: () => api.get(`/payment-runs`, { params: { limit: 10 } }).then(r => r.data.data),
    enabled: tab === 'payments',
  });

  const { data: gratuityHistory } = useQuery({
    queryKey: ['pensioner-gratuity', id],
    queryFn: () => api.get(`/gratuity`, { params: { pensionerId: id, limit: 20 } }).then(r => r.data.data),
    enabled: tab === 'gratuity',
  });

  const deathMutation = useMutation({
    mutationFn: (data: typeof deathForm) => api.post(`/pensioners/${id}/death`, data),
    onSuccess: () => {
      toast.success('Death notification recorded');
      setDeathModal(false);
      qc.invalidateQueries({ queryKey: ['pensioner', id] });
    },
  });

  if (isLoading) return <Spinner />;
  if (!pensioner) return <div className="card text-center py-16 text-slate-400">Pensioner not found</div>;

  const p = pensioner;
  const gb = gratuityBalance;

  const TABS = [
    { key: 'overview',     label: 'Overview' },
    { key: 'payments',     label: 'Payment History' },
    { key: 'gratuity',     label: 'Gratuity' },
    { key: 'arrears',      label: 'Arrears' },
    { key: 'adjustments',  label: 'Adjustments' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <Link to="/pensioners">
          <Button variant="ghost" icon={<ArrowLeft size={14} />}>Back</Button>
        </Link>
      </div>

      {/* Header card */}
      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="font-display text-2xl text-navy">
                {p.title && `${p.title} `}{p.first_name} {p.middle_name ? `${p.middle_name} ` : ''}{p.last_name}
              </h1>
              <StatusBadge status={p.status} />
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-slate-500">
              <span className="font-mono font-semibold text-navy">{p.pension_no}</span>
              <span>Employee: {p.employee_no}</span>
              {(p.department_text || p.department_name) && <span>{p.department_text || p.department_name}</span>}
              {p.designation_name && <span>{p.designation_name}{p.grade ? ` (${p.grade})` : ''}</span>}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {canCreate(user?.role) && p.status === 'active' && (
              <>
                <Link to={`/pensioners/${id}/edit`}>
                  <Button variant="secondary" icon={<Edit size={14} />}>Edit</Button>
                </Link>
                <Button variant="danger" icon={<AlertTriangle size={14} />} onClick={() => setDeathModal(true)}>
                  Record Death
                </Button>
              </>
            )}
            <Button variant="secondary" icon={<Download size={14} />}
              onClick={() => downloadReport(`/reports/pensioner-register`, `Pensioner_${p.pension_no}.xlsx`)}>
              Export
            </Button>
          </div>
        </div>

        {/* Financial summary strip */}
        <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Monthly Pension</p>
            <p className="text-lg font-bold font-mono text-navy mt-1">{formatMWK(p.monthly_pension)}</p>
            <p className="text-xs text-slate-400">per month</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Total Gratuity Due</p>
            <p className="text-lg font-bold font-mono text-slate-700 mt-1">{formatMWK(p.total_gratuity_due)}</p>
            <p className="text-xs text-slate-400">from award letter</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Gratuity Paid</p>
            <p className="text-lg font-bold font-mono text-emerald-600 mt-1">{formatMWK(gb?.total_gratuity_paid)}</p>
            <p className="text-xs text-slate-400">{gb?.partial_payments_count || 0} partial payment(s)</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Gratuity Balance</p>
            <p className={`text-lg font-bold font-mono mt-1 ${parseFloat(gb?.gratuity_balance_remaining || '0') > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
              {formatMWK(gb?.gratuity_balance_remaining)}
            </p>
            <p className="text-xs text-slate-400">outstanding</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              tab === t.key ? 'bg-navy text-white shadow-sm' : 'text-slate-500 hover:text-navy'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="card">
        {tab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="font-display text-base text-navy mb-3 pb-2 border-b">Personal Details</h3>
              <dl className="space-y-2 text-sm">
                {[
                  ['Gender', p.gender],
                  ['Date of Birth', formatDate(p.date_of_birth)],
                  ['Age', p.age ? `${p.age} years` : '—'],
                  ['National ID', p.national_id || '—'],
                  ['Marital Status', p.marital_status || '—'],
                  ['Phone', p.phone_primary || '—'],
                  ['Email', p.email || '—'],
                  ['Physical Address', p.physical_address || '—'],
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-4">
                    <dt className="w-36 text-slate-400 flex-shrink-0">{k}</dt>
                    <dd className="text-slate-700 font-medium capitalize">{v}</dd>
                  </div>
                ))}
              </dl>
              <h3 className="font-display text-base text-navy mb-3 pb-2 border-b mt-6">Next of Kin</h3>
              <dl className="space-y-2 text-sm">
                {[
                  ['Name', p.next_of_kin_name || '—'],
                  ['Relationship', p.next_of_kin_relation || '—'],
                  ['Phone', p.next_of_kin_phone || '—'],
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-4">
                    <dt className="w-36 text-slate-400 flex-shrink-0">{k}</dt>
                    <dd className="text-slate-700 font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div>
              <h3 className="font-display text-base text-navy mb-3 pb-2 border-b">Employment Record</h3>
              <dl className="space-y-2 text-sm">
                {[
                  ['Department', p.department_text || p.department_name || '—'],
                  ['Designation at Retirement', p.designation_at_retirement || p.designation_name || '—'],
                  ['Grade at Retirement', p.grade_at_retirement || p.grade || '—'],
                  ['Grade at First Appointment', p.grade_at_first_appointment || '—'],
                  ['Employment Type', p.employment_type || '—'],
                  ['First Appointment', formatDate(p.date_of_first_appointment)],
                  ['Retirement Date', formatDate(p.date_of_retirement)],
                  ['Years of Service', p.years_of_service ? `${p.years_of_service} years` : '—'],
                  ['Pension Start', formatDate(p.pension_start_date)],
                  ['Reason for Exit', p.reason_for_exit || '—'],
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-4">
                    <dt className="w-40 text-slate-400 flex-shrink-0">{k}</dt>
                    <dd className="text-slate-700 font-medium capitalize">{v}</dd>
                  </div>
                ))}
              </dl>
              <h3 className="font-display text-base text-navy mb-3 pb-2 border-b mt-6">System Record</h3>
              <dl className="space-y-2 text-sm">
                {[
                  ['Introduced By', p.introduced_by_name || '—'],
                  ['Introduced Date', formatDate(p.created_at)],
                  ['Status', p.status],
                  p.date_of_death ? ['Date of Death', formatDate(p.date_of_death)] : null,
                ].filter(Boolean).map(([k, v]: any) => (
                  <div key={k} className="flex gap-4">
                    <dt className="w-40 text-slate-400 flex-shrink-0">{k}</dt>
                    <dd className="text-slate-700 font-medium capitalize">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        )}

        {tab === 'payments' && (
          <div>
            <h3 className="font-display text-base text-navy mb-4">Recent Payment Runs</h3>
            <div className="table-wrapper">
              <table>
                <thead><tr><th>Run Code</th><th>Period</th><th>Net Amount</th><th>Status</th><th>Processed</th></tr></thead>
                <tbody>
                  {(payments || []).slice(0, 12).map((r: any) => (
                    <tr key={r.id}>
                      <td><Link to={`/payments/${r.id}`} className="font-mono text-xs text-navy hover:underline">{r.run_code}</Link></td>
                      <td>{r.payment_period}</td>
                      <td className="font-mono text-xs">{formatMWK(r.total_net_amount)}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td className="text-xs text-slate-400">{formatDate(r.processed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'gratuity' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-base text-navy">Gratuity History</h3>
              {canCreate(user?.role) && p.status === 'active' && (
                <Link to={`/gratuity/new?pensionerId=${id}`}>
                  <Button variant="secondary" size="sm">+ New Claim</Button>
                </Link>
              )}
            </div>
            <div className="table-wrapper">
              <table>
                <thead><tr><th>Ref</th><th>Type</th><th>Amount</th><th>Is Partial</th><th>Status</th><th>Paid Date</th></tr></thead>
                <tbody>
                  {(gratuityHistory || []).map((g: any) => (
                    <tr key={g.id}>
                      <td><Link to={`/gratuity/${g.id}`} className="font-mono text-xs text-navy hover:underline">{g.gratuity_ref}</Link></td>
                      <td className="capitalize">{g.gratuity_type}</td>
                      <td className="font-mono text-xs">{formatMWK(g.amount_requested)}</td>
                      <td>{g.is_partial ? <span className="badge bg-amber-100 text-amber-700">Partial</span> : '—'}</td>
                      <td><StatusBadge status={g.status} /></td>
                      <td className="text-xs">{formatDate(g.payment_date)}</td>
                    </tr>
                  ))}
                  {(!gratuityHistory || gratuityHistory.length === 0) && (
                    <tr><td colSpan={6} className="text-center py-8 text-slate-400">No gratuity records</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'arrears' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-base text-navy">Arrears</h3>
              {canCreate(user?.role) && (
                <Link to={`/arrears/new?pensionerId=${id}`}>
                  <Button variant="secondary">+ New Arrear</Button>
                </Link>
              )}
            </div>
            <p className="text-sm text-slate-400 py-8 text-center">Arrear records will appear here</p>
          </div>
        )}

        {tab === 'adjustments' && (
          <div>
            <h3 className="font-display text-base text-navy mb-4">Adjustment History</h3>
            <p className="text-sm text-slate-500">All changes to Monthly Pension and Total Gratuity Due are automatically logged when the pensioner record is edited.</p>
            <p className="text-sm text-slate-400 py-8 text-center">Adjustment records will appear here when pension or gratuity amounts change</p>
          </div>
        )}
      </div>

      {/* Death Notification Modal */}
      <Modal open={deathModal} onClose={() => setDeathModal(false)} title="Record Death Notification" size="md">
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            This will permanently change the pensioner's status to <strong>Deceased</strong> and stop future pension payments.
          </div>
          <Input label="Date of Death *" type="date" value={deathForm.dateOfDeath}
            onChange={e => setDeathForm(f => ({ ...f, dateOfDeath: e.target.value }))} />
          <Input label="Notified By" value={deathForm.notifiedBy}
            onChange={e => setDeathForm(f => ({ ...f, notifiedBy: e.target.value }))}
            placeholder="Name of person who notified" />
          <Input label="Death Certificate Number" value={deathForm.deathCertNo}
            onChange={e => setDeathForm(f => ({ ...f, deathCertNo: e.target.value }))} />
          <Input label="Notes" value={deathForm.notes}
            onChange={e => setDeathForm(f => ({ ...f, notes: e.target.value }))} />
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="ghost" onClick={() => setDeathModal(false)}>Cancel</Button>
            <Button variant="danger" loading={deathMutation.isPending}
              onClick={() => deathMutation.mutate(deathForm)}>
              Record Death
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
