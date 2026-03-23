import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, CheckCircle, Circle, Download, DollarSign } from 'lucide-react';
import api, { downloadReport } from '../../config/api';
import {
  PageHeader, Button, StatusBadge, Spinner, EmptyState, Pagination, Modal, Input
} from '../../components/ui';
import { formatMWK, formatDate } from '../../utils/formatters';
import { useAuthStore, canCreate } from '../../store/authStore';
import toast from 'react-hot-toast';

export default function GratuityListPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [page, setPage]       = useState(1);
  const [status, setStatus]   = useState('');
  const [type, setType]       = useState('');
  const [received, setReceived] = useState('');

  // Mark-received modal state
  const [markModal, setMarkModal] = useState<{ id: string; ref: string; currentTrf: string } | null>(null);
  const [ifmisTrf, setIfmisTrf]   = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['gratuity', page, status, type, received],
    queryFn: () => api.get('/gratuity', {
      params: { page, limit: 20, status, gratuityType: type || undefined, received: received || undefined }
    }).then(r => r.data),
  });

  const markReceivedMutation = useMutation({
    mutationFn: ({ id, ifmis, isReceived }: { id: string; ifmis: string; isReceived: boolean }) =>
      api.post(`/gratuity/${id}/mark-received`, {
        ifmisTrfNumber: ifmis || undefined,
        received: isReceived,
      }),
    onSuccess: (_, vars) => {
      toast.success(vars.isReceived
        ? `Gratuity marked as received${vars.ifmis ? ` — IFMIS TRF: ${vars.ifmis}` : ''}`
        : 'Gratuity marked as not received'
      );
      setMarkModal(null);
      setIfmisTrf('');
      qc.invalidateQueries({ queryKey: ['gratuity'] });
      qc.invalidateQueries({ queryKey: ['dashboard-overview'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Update failed'),
  });

  const records    = data?.data || [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Gratuity"
        subtitle={`${pagination?.total || 0} total records`}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" icon={<Download size={13} />}
              onClick={() => downloadReport('/reports/gratuity-schedule', 'Gratuity_Schedule.xlsx')}>
              Export
            </Button>
            {canCreate(user?.role) && (
              <Link to="/gratuity/new">
                <Button icon={<DollarSign size={14} />}>Pay Gratuity</Button>
              </Link>
            )}
          </div>
        }
      />

      {/* Filters */}
      <div className="card flex flex-wrap gap-3 py-3">
        <select className="input w-40 text-sm" value={status}
          onChange={e => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All Statuses</option>
          {['pending','submitted','approved_1','approved_2','paid','rejected'].map(s => (
            <option key={s} value={s}>{s.replace(/_/g,' ')}</option>
          ))}
        </select>
        <select className="input w-36 text-sm" value={type}
          onChange={e => { setType(e.target.value); setPage(1); }}>
          <option value="">All Types</option>
          <option value="full">Full</option>
          <option value="partial">Partial</option>
          <option value="death">Death</option>
        </select>
        <select className="input w-44 text-sm" value={received}
          onChange={e => { setReceived(e.target.value); setPage(1); }}>
          <option value="">All (Received/Not)</option>
          <option value="true">✅ Received by Pensioner</option>
          <option value="false">⏳ Not Yet Received</option>
        </select>
      </div>

      {/* Table */}
      <div className="card p-0">
        {isLoading ? <Spinner /> : records.length === 0 ? (
          <EmptyState message="No gratuity records found" />
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Pensioner</th>
                  <th>Type</th>
                  <th>Amount (MWK)</th>
                  <th>Partial?</th>
                  <th>Status</th>
                  <th>IFMIS TRF</th>
                  <th>Received</th>
                  <th>Claim Date</th>
                  <th>Paid Date</th>
                </tr>
              </thead>
              <tbody>
                {records.map((g: any) => (
                  <tr key={g.id}>
                    {/* Ref */}
                    <td>
                      <Link to={`/gratuity/${g.id}`}
                        className="font-mono text-xs text-navy font-semibold hover:underline">
                        {g.gratuity_ref}
                      </Link>
                    </td>

                    {/* Pensioner */}
                    <td>
                      <div className="font-medium text-sm">{g.pensioner_name}</div>
                      <div className="text-xs text-slate-400 font-mono">{g.pension_no}</div>
                    </td>

                    {/* Type */}
                    <td>
                      <span className="badge bg-slate-100 text-slate-600 capitalize text-xs">
                        {g.gratuity_type}
                      </span>
                    </td>

                    {/* Amount */}
                    <td className="font-mono font-semibold text-navy text-xs">
                      {formatMWK(g.amount_requested)}
                    </td>

                    {/* Partial */}
                    <td>
                      {g.is_partial
                        ? <span className="badge bg-amber-100 text-amber-700 text-xs">Partial</span>
                        : <span className="text-slate-300 text-xs">—</span>}
                    </td>

                    {/* Status */}
                    <td><StatusBadge status={g.status} /></td>

                    {/* IFMIS TRF number */}
                    <td>
                      {g.ifmis_trf_number ? (
                        <span className="font-mono text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-semibold">
                          {g.ifmis_trf_number}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>

                    {/* Received toggle — only shows for PAID records */}
                    <td>
                      {g.status === 'paid' ? (
                        <button
                          onClick={() => {
                            if (g.gratuity_received) {
                              // Toggle off
                              markReceivedMutation.mutate({
                                id: g.id, ifmis: g.ifmis_trf_number || '', isReceived: false
                              });
                            } else {
                              // Open modal to capture IFMIS TRF
                              setMarkModal({ id: g.id, ref: g.gratuity_ref, currentTrf: g.ifmis_trf_number || '' });
                              setIfmisTrf(g.ifmis_trf_number || '');
                            }
                          }}
                          className={`flex items-center gap-1.5 text-xs font-semibold transition-colors ${
                            g.gratuity_received
                              ? 'text-green-600 hover:text-green-700'
                              : 'text-slate-400 hover:text-navy'
                          }`}
                          title={g.gratuity_received ? 'Click to unmark' : 'Click to mark as received'}
                        >
                          {g.gratuity_received
                            ? <><CheckCircle size={15} className="text-green-500" /> Received</>
                            : <><Circle size={15} /> Not yet</>
                          }
                        </button>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>

                    {/* Claim date */}
                    <td className="text-xs">{formatDate(g.claim_date)}</td>

                    {/* Paid date */}
                    <td className="text-xs">
                      {g.payment_date ? formatDate(g.payment_date) : '—'}
                    </td>
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

      {/* Mark as Received modal */}
      <Modal
        open={!!markModal}
        onClose={() => { setMarkModal(null); setIfmisTrf(''); }}
        title="Mark Gratuity as Received"
        size="sm"
      >
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
            <p className="font-semibold">Confirm receipt for {markModal?.ref}</p>
            <p className="text-xs mt-0.5">
              Ticking this confirms the pensioner or beneficiary has received this gratuity payment.
            </p>
          </div>

          <Input
            label="IFMIS Transfer Reference Number"
            value={ifmisTrf}
            onChange={e => setIfmisTrf(e.target.value)}
            placeholder="e.g. IFMIS-2026-00123456"
            hint="Enter the IFMIS TRF number if available — leave blank if not yet assigned"
          />

          <div className="flex gap-3 justify-end pt-1">
            <Button variant="ghost" onClick={() => { setMarkModal(null); setIfmisTrf(''); }}>
              Cancel
            </Button>
            <Button
              icon={<CheckCircle size={14} />}
              loading={markReceivedMutation.isPending}
              onClick={() => markModal && markReceivedMutation.mutate({
                id: markModal.id,
                ifmis: ifmisTrf,
                isReceived: true,
              })}
            >
              Confirm Received
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
