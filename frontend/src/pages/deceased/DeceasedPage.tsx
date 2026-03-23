import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Download, ArrowRight, AlertCircle, FileText, Info } from 'lucide-react';
import api, { downloadReport } from '../../config/api';
import { Button, Spinner, EmptyState, Pagination } from '../../components/ui';
import { formatDate, formatMWK } from '../../utils/formatters';

type Category = 'all' | 'payroll' | 'entry';

export default function DeceasedPage() {
  const navigate   = useNavigate();
  const [page, setPage]         = useState(1);
  const [category, setCategory] = useState<Category>('all');

  const { data: allData } = useQuery({
    queryKey: ['deceased-all-counts'],
    queryFn:  () => api.get('/pensioners/reports/deceased', { params: { limit: 999 } }).then(r => r.data),
  });
  const { data, isLoading } = useQuery({
    queryKey: ['deceased', page, category],
    queryFn:  () => api.get('/pensioners/reports/deceased', {
      params: { page, limit: 15, deceasedOnEntry: category === 'entry' ? 'true' : undefined },
    }).then(r => r.data),
  });

  const allRecords: any[]  = allData?.data || [];
  const records: any[]     = data?.data    || [];
  const pagination         = data?.pagination;
  const countAll           = allData?.pagination?.total || 0;
  const countPayroll       = allRecords.filter(r => !r.deceased_on_entry).length;
  const countEntry         = allRecords.filter(r =>  r.deceased_on_entry).length;
  const totalBalance       = allRecords.reduce((s, r) => s + parseFloat(r.gratuity_balance || '0'), 0);

  const displayRecords = category === 'all' ? records
    : records.filter(r => category === 'payroll' ? !r.deceased_on_entry : r.deceased_on_entry);

  function selectCategory(cat: Category) { setCategory(cat); setPage(1); }

  // ── Compact category tabs with embedded counts ────────────
  const CATS: { key: Category; label: string; count: number; color: string }[] = [
    { key: 'all',     label: 'All',              count: countAll,     color: 'text-navy'       },
    { key: 'payroll', label: 'Died on Payroll',  count: countPayroll, color: 'text-red-600'    },
    { key: 'entry',   label: 'Deceased on Entry',count: countEntry,   color: 'text-slate-600'  },
  ];

  return (
    <div className="flex flex-col h-full space-y-3">

      {/* ── Compact header row ───────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-xl text-navy leading-tight">
            BTU — Beneficiary Transfer Unit
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Deceased pensioners register · Outstanding gratuity:{' '}
            <span className="font-semibold text-amber-600">{formatMWK(totalBalance)}</span>
          </p>
        </div>
        <Button
          variant="secondary"
          icon={<Download size={13} />}
          onClick={() => downloadReport('/reports/death-benefits', 'BTU_Death_Benefits.xlsx')}
        >
          Export Excel
        </Button>
      </div>

      {/* ── Single-row: stat tabs + inline alert ─────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Category tabs with counts */}
        <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1">
          {CATS.map(({ key, label, count, color }) => (
            <button
              key={key}
              onClick={() => selectCategory(key)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                category === key
                  ? 'bg-navy text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className={category === key ? 'text-white' : color}>
                {count}
              </span>
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Inline alert — only when a specific category is selected */}
        {category === 'payroll' && countPayroll > 0 && (
          <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 text-xs text-red-700">
            <AlertCircle size={12} className="flex-shrink-0" />
            <span>Check each record for outstanding gratuity — beneficiaries may be entitled</span>
          </div>
        )}
        {category === 'entry' && countEntry > 0 && (
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-600">
            <FileText size={12} className="flex-shrink-0" />
            <span>Registered as already deceased — check if gratuity should be paid to a beneficiary</span>
          </div>
        )}

        {/* Record count badge */}
        <span className="ml-auto text-xs text-slate-400">
          {pagination?.total || 0} record{pagination?.total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Compact table — fills remaining space ────────────── */}
      <div className="card p-0 flex-1 flex flex-col min-h-0">
        {isLoading ? (
          <Spinner />
        ) : displayRecords.length === 0 ? (
          <EmptyState message="No records in this category" />
        ) : (
          <div className="overflow-auto flex-1">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-left bg-navy text-white font-semibold uppercase tracking-wide text-[10px] whitespace-nowrap">Pension No</th>
                  <th className="px-3 py-2 text-left bg-navy text-white font-semibold uppercase tracking-wide text-[10px]">Full Name</th>
                  <th className="px-3 py-2 text-left bg-navy text-white font-semibold uppercase tracking-wide text-[10px] whitespace-nowrap">Type</th>
                  <th className="px-3 py-2 text-left bg-navy text-white font-semibold uppercase tracking-wide text-[10px]">Department</th>
                  <th className="px-3 py-2 text-left bg-navy text-white font-semibold uppercase tracking-wide text-[10px] whitespace-nowrap">Date of Death</th>
                  <th className="px-3 py-2 text-right bg-navy text-white font-semibold uppercase tracking-wide text-[10px] whitespace-nowrap">Monthly Pension</th>
                  <th className="px-3 py-2 text-right bg-navy text-white font-semibold uppercase tracking-wide text-[10px] whitespace-nowrap">Gratuity Balance</th>
                  <th className="px-3 py-2 text-center bg-navy text-white font-semibold uppercase tracking-wide text-[10px] whitespace-nowrap">Cert</th>
                  <th className="px-3 py-2 text-center bg-navy text-white font-semibold uppercase tracking-wide text-[10px] whitespace-nowrap">Runs</th>
                  <th className="w-6 bg-navy"></th>
                </tr>
              </thead>
              <tbody>
                {displayRecords.map((r: any, idx: number) => {
                  const hasBalance = parseFloat(r.gratuity_balance || '0') > 0;
                  return (
                    <tr
                      key={r.id || r.pension_no}
                      onClick={() => r.id && navigate(`/pensioners/${r.id}`)}
                      className={`border-b border-slate-100 cursor-pointer hover:bg-blue-50/60 transition-colors ${
                        idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                      }`}
                    >
                      {/* Pension No */}
                      <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                        {r.id ? (
                          <Link
                            to={`/pensioners/${r.id}`}
                            className="font-mono font-bold text-navy hover:underline"
                          >
                            {r.pension_no}
                          </Link>
                        ) : (
                          <span className="font-mono font-bold text-navy">{r.pension_no}</span>
                        )}
                      </td>

                      {/* Name */}
                      <td className="px-3 py-2 font-medium text-slate-800 whitespace-nowrap">
                        {r.full_name}
                      </td>

                      {/* Category badge */}
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          r.deceased_on_entry
                            ? 'bg-slate-100 text-slate-600'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {r.deceased_on_entry ? '📋' : '⚠'}{' '}
                          {r.deceased_on_entry ? 'Entry' : 'Payroll'}
                        </span>
                      </td>

                      {/* Department */}
                      <td className="px-3 py-2 text-slate-500 max-w-32 truncate" title={r.department_name}>
                        {r.department_name || '—'}
                      </td>

                      {/* Date of death */}
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                        {r.date_of_death ? formatDate(r.date_of_death) : '—'}
                      </td>

                      {/* Monthly pension */}
                      <td className="px-3 py-2 text-right font-mono text-slate-700">
                        {formatMWK(r.monthly_pension)}
                      </td>

                      {/* Gratuity balance */}
                      <td className="px-3 py-2 text-right">
                        <span className={`font-mono font-semibold ${hasBalance ? 'text-amber-600' : 'text-slate-300'}`}>
                          {formatMWK(r.gratuity_balance)}
                        </span>
                        {hasBalance && <span className="ml-1 text-amber-500">⚠</span>}
                      </td>

                      {/* Death cert */}
                      <td className="px-3 py-2 text-center">
                        {r.death_cert_no ? (
                          <span
                            className="inline-block bg-green-100 text-green-700 px-1.5 py-0.5 rounded text-[10px] font-semibold max-w-20 truncate"
                            title={r.death_cert_no}
                          >
                            ✓
                          </span>
                        ) : (
                          <span className="text-slate-300 text-[10px]">—</span>
                        )}
                      </td>

                      {/* Payment runs count */}
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
                          parseInt(r.payment_runs_count) > 0
                            ? 'bg-navy/10 text-navy'
                            : 'bg-slate-100 text-slate-400'
                        }`}>
                          {r.payment_runs_count || 0}
                        </span>
                      </td>

                      {/* Drill-down arrow */}
                      <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                        {r.id && (
                          <Link
                            to={`/pensioners/${r.id}`}
                            className="text-slate-300 hover:text-navy transition-colors"
                          >
                            <ArrowRight size={13} />
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination — compact, stays at bottom of card */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100 text-xs text-slate-500 flex-shrink-0">
            <span>Page {page} of {pagination.totalPages} · {pagination.total} records</span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-2.5 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
              >
                ← Prev
              </button>
              <button
                onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                disabled={page >= pagination.totalPages}
                className="px-2.5 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Legend — single compact line ─────────────────────── */}
      <div className="flex items-center gap-4 text-[10px] text-slate-400 pb-1">
        <Info size={11} className="flex-shrink-0" />
        <span><span className="font-semibold text-red-500">⚠ Payroll</span> = died while receiving pension</span>
        <span><span className="font-semibold text-slate-500">📋 Entry</span> = registered as already deceased</span>
        <span><span className="font-semibold text-amber-500">⚠ Balance</span> = outstanding gratuity owed to beneficiary</span>
        <span>Click any row to open full profile</span>
      </div>

    </div>
  );
}
