import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download, CheckCircle, XCircle, RotateCcw } from 'lucide-react';
import api, { downloadReport } from '../../config/api';
import {
  Button, StatusBadge, Spinner, Modal, PageHeader,
  WorkflowTimeline, EmptyState, Pagination
} from '../../components/ui';
import { formatMWK, formatDate, formatDateTime } from '../../utils/formatters';
import { useAuthStore, canCreate, canApprove1, canApprove2, isAdmin } from '../../store/authStore';
import toast from 'react-hot-toast';

export default function PaymentRunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [actionModal, setActionModal] = useState<null | 'submit' | 'approve1' | 'approve2' | 'reject' | 'reverse'>(null);
  const [remarks, setRemarks] = useState('');

  const { data: run, isLoading } = useQuery({
    queryKey: ['payment-run', id],
    queryFn: () => api.get(`/payment-runs/${id}`).then(r => r.data.data),
  });

  const { data: linesData, isLoading: linesLoading } = useQuery({
    queryKey: ['payment-run-lines', id, page],
    queryFn: () => api.get(`/payment-runs/${id}/lines`, { params: { page, limit: 30 } }).then(r => r.data),
  });

  const { data: trail } = useQuery({
    queryKey: ['workflow-trail', 'payment_run', id],
    queryFn: () => api.get(`/workflow/trail/payment_run/${id}`).then(r => r.data.data).catch(() => []),
  });

  const actionMutation = useMutation({
    mutationFn: ({ action, remarks }: { action: string; remarks: string }) =>
      api.post(`/payment-runs/${id}/${action}`, { remarks }),
    onSuccess: (_, vars) => {
      toast.success(`Payment run ${vars.action.replace('-', ' ')} successfully`);
      setActionModal(null);
      setRemarks('');
      qc.invalidateQueries({ queryKey: ['payment-run', id] });
      qc.invalidateQueries({ queryKey: ['payment-runs'] });
    },
  });

  if (isLoading) return <Spinner />;
  if (!run) return <div className="card text-center py-16 text-slate-400">Payment run not found</div>;

  const lines = linesData?.data || [];
  const pagination = linesData?.pagination;

  const ACTION_MAP: Record<string, { endpoint: string; label: string; variant: any; requiresRemarks?: boolean }> = {
    submit:   { endpoint: 'submit',    label: 'Submit for Approval', variant: 'primary' },
    approve1: { endpoint: 'approve-1', label: 'Approve (Level 1)',   variant: 'primary' },
    approve2: { endpoint: 'approve-2', label: 'Approve & Process',   variant: 'primary' },
    reject:   { endpoint: 'reject',    label: 'Reject',              variant: 'danger',  requiresRemarks: true },
    reverse:  { endpoint: 'reverse',   label: 'Reverse Run',         variant: 'danger',  requiresRemarks: true },
  };

  const currentAction = actionModal ? ACTION_MAP[actionModal] : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/payments"><Button variant="ghost" icon={<ArrowLeft size={14} />}>Back</Button></Link>
      </div>

      {/* Run header */}
      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="font-display text-2xl text-navy font-mono">{run.run_code}</h1>
              <StatusBadge status={run.status} />
              <span className={`badge text-xs ${run.is_auto_generated ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                {run.is_auto_generated ? '⚡ Auto-generated' : '✋ Manual'}
              </span>
            </div>
            <p className="text-slate-500 text-sm">Payment period: <strong>{run.payment_period}</strong> · Scheduled: {formatDate(run.scheduled_date)}</p>
            <p className="text-xs text-slate-400 mt-1">Created by {run.created_by_name || 'Scheduler'} · {formatDateTime(run.created_at)}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" icon={<Download size={14} />}
              onClick={() => downloadReport(`/reports/payment-run/${id}`, `Payment_Run_${run.run_code}.xlsx`)}>
              Export Excel
            </Button>
          </div>
        </div>

        {/* Totals */}
        <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Pensioners', value: run.total_pensioners?.toLocaleString() || '0', sub: 'active at time of run' },
            { label: 'Total Gross', value: formatMWK(run.total_gross_amount), sub: 'before deductions' },
            { label: 'Total Deductions', value: formatMWK(run.total_deductions), sub: 'tax + other' },
            { label: 'Total Net', value: formatMWK(run.total_net_amount), sub: 'amount to be paid', highlight: true },
          ].map(({ label, value, sub, highlight }) => (
            <div key={label}>
              <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">{label}</p>
              <p className={`text-lg font-bold font-mono mt-1 ${highlight ? 'text-navy' : 'text-slate-700'}`}>{value}</p>
              <p className="text-xs text-slate-400">{sub}</p>
            </div>
          ))}
        </div>

        {/* Workflow buttons */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap gap-2">
          {run.status === 'pending' && canCreate(user?.role) && (
            <Button icon={<CheckCircle size={14} />} onClick={() => setActionModal('submit')}>Submit for Approval</Button>
          )}
          {run.status === 'submitted' && canApprove1(user?.role) && (
            <>
              <Button icon={<CheckCircle size={14} />} onClick={() => setActionModal('approve1')}>Approve (Level 1)</Button>
              <Button variant="danger" icon={<XCircle size={14} />} onClick={() => setActionModal('reject')}>Reject</Button>
            </>
          )}
          {run.status === 'approved_1' && canApprove2(user?.role) && (
            <>
              <Button icon={<CheckCircle size={14} />} onClick={() => setActionModal('approve2')}>Final Approve & Process</Button>
              <Button variant="danger" icon={<XCircle size={14} />} onClick={() => setActionModal('reject')}>Reject</Button>
            </>
          )}
          {run.status === 'processed' && isAdmin(user?.role) && (
            <Button variant="danger" icon={<RotateCcw size={14} />} onClick={() => setActionModal('reverse')}>Reverse Run</Button>
          )}
        </div>
      </div>

      {/* Approver trail */}
      {(run.approved_by_1_name || run.approved_by_2_name) && (
        <div className="card">
          <h3 className="font-display text-base text-navy mb-3">Approval Trail</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            {run.approved_by_1_name && (
              <div className="flex gap-3 items-center">
                <span className="text-xl">✅</span>
                <div>
                  <p className="font-semibold text-slate-700">Level 1 Approved</p>
                  <p className="text-xs text-slate-400">{run.approved_by_1_name} · {formatDateTime(run.approved_at_1)}</p>
                </div>
              </div>
            )}
            {run.approved_by_2_name && (
              <div className="flex gap-3 items-center">
                <span className="text-xl">💚</span>
                <div>
                  <p className="font-semibold text-slate-700">Level 2 Approved & Processed</p>
                  <p className="text-xs text-slate-400">{run.approved_by_2_name} · {formatDateTime(run.approved_at_2)}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Payment lines */}
      <div className="card p-0">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="font-display text-base text-navy">Payment Lines</h3>
          <p className="text-xs text-slate-400">Individual payments per pensioner for this run</p>
        </div>
        {linesLoading ? <Spinner /> : lines.length === 0 ? <EmptyState message="No payment lines" /> : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Pension No</th>
                  <th>Pensioner</th>
                  <th>Bank</th>
                  <th>Account</th>
                  <th>Gross (MWK)</th>
                  <th>Deductions</th>
                  <th>Net (MWK)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line: any) => (
                  <tr key={line.id}>
                    <td className="font-mono text-xs text-navy">{line.pension_no}</td>
                    <td className="font-medium text-sm">{line.pensioner_name}</td>
                    <td className="text-xs text-slate-500">{line.bank_name || '—'}</td>
                    <td className="font-mono text-xs text-slate-400">
                      {line.account_number ? `****${line.account_number.slice(-4)}` : '—'}
                    </td>
                    <td className="font-mono text-xs">{formatMWK(line.gross_amount)}</td>
                    <td className="font-mono text-xs text-red-500">
                      {parseFloat(line.total_deductions) > 0 ? `(${formatMWK(line.total_deductions)})` : '—'}
                    </td>
                    <td className="font-mono text-xs font-bold text-navy">{formatMWK(line.net_amount)}</td>
                    <td><StatusBadge status={line.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pagination && (
          <div className="px-4 pb-3">
            <Pagination page={page} totalPages={pagination.totalPages} onPage={setPage} />
          </div>
        )}
      </div>

      {/* Action Modal */}
      {currentAction && (
        <Modal open={true} onClose={() => { setActionModal(null); setRemarks(''); }}
          title={currentAction.label} size="sm">
          <div className="space-y-4">
            {currentAction.requiresRemarks && (
              <div>
                <label className="label">Reason (required)</label>
                <textarea
                  className="input min-h-20 resize-none"
                  value={remarks}
                  onChange={e => setRemarks(e.target.value)}
                  placeholder="Enter reason…"
                />
              </div>
            )}
            {!currentAction.requiresRemarks && (
              <div>
                <label className="label">Remarks (optional)</label>
                <textarea
                  className="input min-h-16 resize-none"
                  value={remarks}
                  onChange={e => setRemarks(e.target.value)}
                  placeholder="Optional remarks…"
                />
              </div>
            )}
            <div className="flex gap-3 justify-end pt-1">
              <Button variant="ghost" onClick={() => { setActionModal(null); setRemarks(''); }}>Cancel</Button>
              <Button
                variant={currentAction.variant}
                loading={actionMutation.isPending}
                disabled={currentAction.requiresRemarks && !remarks.trim()}
                onClick={() => actionMutation.mutate({ action: currentAction.endpoint, remarks })}
              >
                {currentAction.label}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
