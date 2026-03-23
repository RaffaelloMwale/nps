import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Search, Download } from 'lucide-react';
import api, { downloadReport } from '../../config/api';
import { PageHeader, Button, StatusBadge, Spinner, EmptyState, Pagination } from '../../components/ui';
import { formatMWK, formatDate } from '../../utils/formatters';
import { useAuthStore, canCreate } from '../../store/authStore';

export default function PensionerListPage() {
  const { user } = useAuthStore();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['pensioners', page, search, status],
    queryFn: () => api.get('/pensioners', { params: { page, limit: 20, search, status } }).then(r => r.data),
  });

  const pensioners = data?.data || [];
  const pagination = data?.pagination;

  async function handleDownload() {
    await downloadReport(`/reports/pensioner-register?status=${status}`, 'Pensioner_Register.xlsx');
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pensioners"
        subtitle={`${pagination?.total || 0} total records`}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" icon={<Download size={14} />} onClick={handleDownload}>Export</Button>
            {canCreate(user?.role) && (
              <Link to="/pensioners/new">
                <Button icon={<Plus size={14} />}>Register Pensioner</Button>
              </Link>
            )}
          </div>
        }
      />

      {/* Filters */}
      <div className="card flex flex-wrap gap-3 py-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-8 text-sm"
            placeholder="Search name, pension no, employee no…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select className="input w-40 text-sm" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="terminated">Terminated</option>
          <option value="deceased">Deceased</option>
        </select>
      </div>

      {/* Table */}
      <div className="card p-0">
        {isLoading ? <Spinner /> : pensioners.length === 0 ? <EmptyState /> : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Pension No</th>
                  <th>Full Name</th>
                  <th>Department</th>
                  <th>Designation</th>
                  <th>Monthly Pension</th>
                  <th>Total Gratuity Due</th>
                  <th>Status</th>
                  <th>Introduced</th>
                </tr>
              </thead>
              <tbody>
                {pensioners.map((p: any) => (
                  <tr key={p.id}>
                    <td>
                      <Link to={`/pensioners/${p.id}`} className="text-navy font-semibold hover:underline font-mono text-xs">
                        {p.pension_no}
                      </Link>
                    </td>
                    <td className="font-medium">{p.first_name} {p.last_name}</td>
                    <td className="text-slate-500 text-xs">{p.department_name || '—'}</td>
                    <td className="text-slate-500 text-xs">{p.designation_name || '—'}</td>
                    <td className="font-mono font-semibold text-navy text-xs">{formatMWK(p.monthly_pension)}</td>
                    <td className="font-mono text-xs">{formatMWK(p.total_gratuity_due)}</td>
                    <td><StatusBadge status={p.status} /></td>
                    <td className="text-xs text-slate-400">{formatDate(p.created_at)}</td>
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
    </div>
  );
}
