import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import api from '../../config/api';
import { PageHeader, Button, StatusBadge, Spinner, EmptyState, Pagination } from '../../components/ui';
import { formatMWK, formatDate } from '../../utils/formatters';
import { useAuthStore, canCreate } from '../../store/authStore';

export default function ArrearListPage() {
  const { user } = useAuthStore();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['arrears', page],
    queryFn: () => api.get('/arrears', { params: { page, limit: 20 } }).then(r => r.data),
  });

  const arrears = data?.data || [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Arrears"
        subtitle={`${pagination?.total || 0} total records`}
        actions={
          canCreate(user?.role) ? (
            <Link to="/arrears/new">
              <Button icon={<Plus size={14} />}>New Arrear</Button>
            </Link>
          ) : undefined
        }
      />
      <div className="card p-0">
        {isLoading ? <Spinner /> : arrears.length === 0 ? <EmptyState message="No arrear records" /> : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Pensioner</th>
                  <th>Type</th>
                  <th>Period</th>
                  <th>Amount (MWK)</th>
                  <th>Balance (MWK)</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {arrears.map((a: any) => (
                  <tr key={a.id}>
                    <td className="font-mono text-xs text-navy">{a.arrear_ref}</td>
                    <td>
                      <div className="font-medium text-sm">{a.pensioner_name}</div>
                      <div className="text-xs text-slate-400 font-mono">{a.pension_no}</div>
                    </td>
                    <td className="text-xs">{a.arrear_type}</td>
                    <td className="text-xs text-slate-500">
                      {a.from_period && a.to_period ? `${a.from_period} → ${a.to_period}` : '—'}
                    </td>
                    <td className="font-mono text-xs">{formatMWK(a.computed_amount)}</td>
                    <td className={`font-mono text-xs font-semibold ${parseFloat(a.balance_amount) > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                      {formatMWK(a.balance_amount)}
                    </td>
                    <td><StatusBadge status={a.status} /></td>
                    <td className="text-xs text-slate-400">{formatDate(a.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pagination && <div className="px-4 pb-3"><Pagination page={page} totalPages={pagination.totalPages} onPage={setPage} /></div>}
      </div>
    </div>
  );
}
