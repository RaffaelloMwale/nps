import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, X, Users, Download } from 'lucide-react';
import api from '../../config/api';
import { PageHeader, Button, Spinner, EmptyState, Pagination, Modal, Input } from '../../components/ui';
import { formatMWK, formatDate } from '../../utils/formatters';
import { useAuthStore, canCreate } from '../../store/authStore';
import toast from 'react-hot-toast';

const MONTHS_FULL = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

// ── Pensioner drill-down modal ────────────────────────────────
function PensionerModal({ run, onClose }: { run: any; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const LIMIT = 25;

  const { data, isLoading } = useQuery({
    queryKey: ['run-lines', run.id, page],
    queryFn:  () => api.get(`/payment-runs/${run.id}/lines`, { params: { page, limit: LIMIT } })
                      .then(r => r.data),
  });

  const lines      = data?.data       || [];
  const pagination = data?.pagination;
  const pageTotal  = lines.reduce((s: number, l: any) => s + parseFloat(l.gross_amount || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="font-display text-lg text-navy">
              {MONTHS_FULL[(run.payment_month||1)-1]} {run.payment_year} — Active Pensioners
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {pagination?.total || run.pensioner_count || 0} pensioners active as at{' '}
              {formatDate(run.scheduled_date)} ·{' '}
              Total payout:{' '}
              <strong className="text-navy font-mono">{formatMWK(run.total_gross || run.total_gross_amount)}</strong>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" icon={<Download size={13} />}
              onClick={() => {
                api.get(`/reports/payment-run/${run.id}`, { responseType: 'blob' })
                  .then(res => {
                    const url  = window.URL.createObjectURL(new Blob([res.data]));
                    const a    = document.createElement('a');
                    a.href     = url;
                    a.download = `Pension_Payment_${MONTHS_FULL[(run.payment_month||1)-1]}_${run.payment_year}.xlsx`;
                    a.click();
                    a.remove();
                  })
                  .catch(() => toast.error('Export failed'));
              }}>
              Export Excel
            </Button>
            <button onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1">
          {isLoading ? <Spinner /> : lines.length === 0 ? (
            <EmptyState message="No pensioners in this run" />
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-navy text-white text-[10px] uppercase tracking-wide sticky top-0">
                  <th className="px-4 py-2.5 text-left w-10">#</th>
                  <th className="px-4 py-2.5 text-left">Pension No</th>
                  <th className="px-4 py-2.5 text-left">Full Name</th>
                  <th className="px-4 py-2.5 text-left">Designation at Retirement</th>
                  <th className="px-4 py-2.5 text-left">Department</th>
                  <th className="px-4 py-2.5 text-left">Bank</th>
                  <th className="px-4 py-2.5 text-left">Account</th>
                  <th className="px-4 py-2.5 text-right">Amount (MWK)</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l: any, i: number) => (
                  <tr key={l.id}
                    className={`border-b border-slate-100 hover:bg-blue-50/40 ${i%2===0?'bg-white':'bg-slate-50/30'}`}
                  >
                    <td className="px-4 py-2 text-slate-400 font-mono">
                      {(page-1)*LIMIT + i + 1}
                    </td>
                    <td className="px-4 py-2">
                      <Link to={`/pensioners/${l.pensioner_id}`}
                        className="font-mono font-bold text-navy hover:underline text-xs">
                        {l.pension_no}
                      </Link>
                    </td>
                    <td className="px-4 py-2 font-medium whitespace-nowrap">{l.pensioner_name}</td>
                    <td className="px-4 py-2 text-slate-500 max-w-40 truncate"
                        title={l.designation_at_retirement}>
                      {l.designation_at_retirement || '—'}
                    </td>
                    <td className="px-4 py-2 text-slate-500 max-w-32 truncate">
                      {l.department_name || '—'}
                    </td>
                    <td className="px-4 py-2 text-slate-500">{l.bank_name || '—'}</td>
                    <td className="px-4 py-2 font-mono text-slate-400">{l.account_masked || '—'}</td>
                    <td className="px-4 py-2 text-right font-mono font-bold text-navy">
                      {formatMWK(l.gross_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-navy/5 border-t-2 border-navy/20">
                  <td colSpan={7} className="px-4 py-2.5 text-xs font-semibold text-navy">
                    {page === 1 && pagination?.totalPages === 1
                      ? `All ${lines.length} pensioners`
                      : `Page ${page} — ${lines.length} pensioners`}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-navy text-xs">
                    {formatMWK(pageTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 text-xs text-slate-500 flex-shrink-0">
            <span>
              {(page-1)*LIMIT + 1}–{Math.min(page*LIMIT, pagination.total)} of {pagination.total} pensioners
            </span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page<=1}
                className="px-3 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40">
                ← Prev
              </button>
              <button onClick={() => setPage(p => Math.min(pagination.totalPages,p+1))} disabled={page>=pagination.totalPages}
                className="px-3 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40">
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function PaymentRunListPage() {
  const { user }  = useAuthStore();
  const qc        = useQueryClient();
  const [page, setPage]               = useState(1);
  const [showCreate, setShowCreate]   = useState(false);
  const [selectedRun, setSelectedRun] = useState<any>(null);
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [year,  setYear]  = useState(String(new Date().getFullYear()));

  const { data, isLoading } = useQuery({
    queryKey: ['payment-runs', page],
    queryFn:  () => api.get('/payment-runs', { params: { page, limit: 20 } }).then(r => r.data),
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn:  () => api.get('/settings').then(r => r.data.data),
  });
  const runDay = settings?.['payment.auto_run_day'] || '14';

  const createMutation = useMutation({
    mutationFn: () => api.post('/payment-runs', {
      month: parseInt(month), year: parseInt(year)
    }),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Payment run created');
      setShowCreate(false);
      qc.invalidateQueries({ queryKey: ['payment-runs'] });
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.message || 'Failed to create run'),
  });

  const runs       = data?.data       || [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Monthly Pension Payments"
        subtitle={`Auto-generated on day ${runDay} of each month · click the pensioner count to view the full payroll list`}
        actions={
          canCreate(user?.role) ? (
            <Button icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>
              Create Run
            </Button>
          ) : undefined
        }
      />

      <div className="card p-0">
        {isLoading ? <Spinner /> : runs.length === 0 ? (
          <EmptyState message="No payment runs yet" />
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-left">Month</th>
                  <th className="text-left">Run Date</th>
                  <th className="text-center">
                    <span>Active Pensioners</span>
                    <span className="block text-[9px] font-normal text-white/70 normal-case tracking-normal">
                      as at run date · click to view list
                    </span>
                  </th>
                  <th className="text-right">
                    <span>Total Monthly Payout (MWK)</span>
                    <span className="block text-[9px] font-normal text-white/70 normal-case tracking-normal">
                      sum of all pension amounts
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r: any, idx: number) => {
                  const count = parseInt(r.pensioner_count || r.total_pensioners || 0);
                  const gross = parseFloat(r.total_gross   || r.total_gross_amount || 0);

                  return (
                    <tr key={r.id}
                      className={`border-b border-slate-100 ${idx%2===0?'bg-white':'bg-slate-50/40'}`}
                    >
                      {/* Month — bold, human readable */}
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-800 text-sm">
                          {MONTHS_FULL[(r.payment_month||1)-1]} {r.payment_year}
                        </div>
                        <div className="text-xs text-slate-400 font-mono mt-0.5">{r.run_code}</div>
                      </td>

                      {/* Run date */}
                      <td className="px-5 py-3.5 text-sm text-slate-500">
                        {formatDate(r.scheduled_date)}
                      </td>

                      {/* Pensioner count — the key clickable number */}
                      <td className="px-5 py-3.5 text-center">
                        {count > 0 ? (
                          <button
                            onClick={() => setSelectedRun(r)}
                            className="inline-flex items-center gap-2 bg-navy text-white
                                       hover:bg-navy/90 px-4 py-2 rounded-xl font-bold text-base
                                       transition-all shadow-sm hover:shadow-md group"
                            title={`View all ${count} pensioners for ${MONTHS_FULL[(r.payment_month||1)-1]} ${r.payment_year}`}
                          >
                            <Users size={15} className="opacity-70 group-hover:opacity-100" />
                            {count.toLocaleString()}
                          </button>
                        ) : (
                          <span className="text-slate-300 text-sm">—</span>
                        )}
                      </td>

                      {/* Total payout */}
                      <td className="px-5 py-3.5 text-right">
                        <div className="font-mono font-bold text-navy text-base">
                          {formatMWK(gross)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {pagination && pagination.totalPages > 1 && (
              <div className="px-5 py-3 border-t border-slate-100">
                <Pagination page={page} totalPages={pagination.totalPages} onPage={setPage} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Run Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)}
        title="Create Monthly Pension Payment Run" size="sm">
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
            Snapshots all <strong>active pensioners</strong> at this moment.
            The run will be dated to day <strong>{runDay}</strong> of the selected month.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Month</label>
              <select className="input" value={month} onChange={e => setMonth(e.target.value)}>
                {MONTHS_FULL.map((m, i) => (
                  <option key={i} value={String(i+1)}>{m}</option>
                ))}
              </select>
            </div>
            <Input label="Year" type="number" min="2020"
              value={year} onChange={e => setYear(e.target.value)} />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} loading={createMutation.isPending}>
              Create Run
            </Button>
          </div>
        </div>
      </Modal>

      {/* Pensioner drill-down */}
      {selectedRun && (
        <PensionerModal run={selectedRun} onClose={() => setSelectedRun(null)} />
      )}
    </div>
  );
}
