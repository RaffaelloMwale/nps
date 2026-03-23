import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Users, CreditCard, Gift, AlertTriangle, TrendingUp,
  ChevronRight, X, ExternalLink, Download, CheckCircle, Clock
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import api from '../../config/api';
import { Spinner } from '../../components/ui';
import { formatMWK, formatDate } from '../../utils/formatters';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

// ── Colours ───────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  active: '#1E3A5F', suspended: '#F59E0B', terminated: '#6B7280', deceased: '#EF4444',
};
const BAR_COLORS: Record<string, string> = {
  processed: '#1E3A5F', approved_2: '#2E6DA4', approved_1: '#60A5FA',
  submitted: '#93C5FD', pending: '#BFDBFE', projected: '#E2E8F0',
};

function PayoutTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      <p className="text-navy font-bold">{formatMWK(d.net_amount)}</p>
      <p className="text-slate-400">{d.pensioner_count} pensioners</p>
      <p className={`mt-1 font-medium ${d.source === 'processed' ? 'text-green-600' : d.source === 'projected' ? 'text-slate-400' : 'text-amber-500'}`}>
        {d.source === 'projected' ? '📊 Projected' : d.source === 'processed' ? '✅ Processed' : `⏳ ${d.source}`}
      </p>
    </div>
  );
}

// ── Excel export helper ───────────────────────────────────────
function exportToExcel(rows: any[], columns: { key: string; header: string }[], filename: string) {
  const data = rows.map(r => {
    const row: Record<string, any> = {};
    columns.forEach(c => { row[c.header] = r[c.key] ?? ''; });
    return row;
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0,10)}.xlsx`);
}

// ── Pending approval action button ───────────────────────────
function ApproveButton({ item, onDone }: { item: any; onDone: () => void }) {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const isAdmin = user?.role === 'admin';
  const isApprover1 = user?.role === 'approver_1' || isAdmin;
  const isApprover2 = user?.role === 'approver_2' || isAdmin;

  const mutation = useMutation({
    mutationFn: async ({ id, type, action }: { id: string; type: string; action: string }) => {
      const base = type === 'payment_run' ? '/payment-runs' :
                   type === 'gratuity'    ? '/gratuity'     : '/arrears';
      await api.post(`${base}/${id}/${action}`, { remarks: 'Approved via dashboard' });
    },
    onSuccess: () => {
      toast.success('Approved successfully');
      qc.invalidateQueries({ queryKey: ['dashboard-overview'] });
      qc.invalidateQueries({ queryKey: ['drilldown'] });
      onDone();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Approval failed'),
  });

  // Arrears use a single 'approve' step, not L1/L2
  const isArrear = item.item_type === 'arrear';

  const canSubmit   = item.status === 'pending'    && (user?.role === 'creator' || isAdmin);
  const canApprove1 = item.status === 'submitted'  && isApprover1 && !isArrear;
  const canApprove2 = item.status === 'approved_1' && isApprover2 && !isArrear;
  const canArrearApprove = isArrear && item.status === 'pending' && isApprover1;

  const action = canSubmit       ? 'submit'    :
                 canArrearApprove? 'approve'   :
                 canApprove1     ? 'approve-1' :
                 canApprove2     ? 'approve-2' : null;

  const label  = canSubmit       ? 'Submit'     :
                 canArrearApprove? 'Approve'    :
                 canApprove1     ? 'Approve L1' :
                 canApprove2     ? 'Approve L2' : null;

  if (!action) return <span className="text-slate-300 text-xs">—</span>;

  return (
    <button
      disabled={mutation.isPending}
      onClick={() => mutation.mutate({ id: item.id, type: item.item_type, action })}
      className="flex items-center gap-1 bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50"
    >
      {mutation.isPending ? <Clock size={11} className="animate-spin" /> : <CheckCircle size={11} />}
      {label}
    </button>
  );
}

// ── Drilldown modal ───────────────────────────────────────────
function DrilldownModal({ type, title, onClose }: { type: string; title: string; onClose: () => void }) {
  const navigate   = useNavigate();
  const qc         = useQueryClient();
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['drilldown', type, page],
    queryFn:  () => api.get(`/dashboard/drilldown/${type}`, { params: { page, limit: 15 } }).then(r => r.data.data),
    enabled:  !!type,
  });

  const rows       = data?.rows       || [];
  const total      = data?.total      || 0;
  const totalPages = data?.totalPages || 1;

  // Column definitions per drilldown type
  const COLS: Record<string, { key: string; header: string }[]> = {
    registered: [
      { key: 'pension_no',                header: 'Pension No'             },
      { key: 'full_name',                 header: 'Full Name'              },
      { key: 'designation_at_retirement', header: 'Designation at Retirement' },
      { key: 'department_name',           header: 'Department'             },
      { key: 'status',                    header: 'Status'                 },
      { key: 'monthly_pension',           header: 'Monthly Pension (MWK)'  },
      { key: 'date_of_retirement',        header: 'Retirement Date'        },
    ],
    active: [
      { key: 'pension_no',                header: 'Pension No'             },
      { key: 'full_name',                 header: 'Full Name'              },
      { key: 'designation_at_retirement', header: 'Designation at Retirement' },
      { key: 'department_name',           header: 'Department'             },
      { key: 'monthly_pension',           header: 'Monthly Pension (MWK)'  },
      { key: 'date_of_retirement',        header: 'Retirement Date'        },
    ],
    deceased: [
      { key: 'pension_no',                header: 'Pension No'             },
      { key: 'full_name',                 header: 'Full Name'              },
      { key: 'designation_at_retirement', header: 'Designation at Retirement' },
      { key: 'department_name',           header: 'Department'             },
      { key: 'monthly_pension',           header: 'Monthly Pension (MWK)'  },
      { key: 'date_of_death',             header: 'Date of Death'          },
    ],
    introduced: [
      { key: 'pension_no',                header: 'Pension No'             },
      { key: 'full_name',                 header: 'Full Name'              },
      { key: 'designation_at_retirement', header: 'Designation at Retirement' },
      { key: 'department_name',           header: 'Department'             },
      { key: 'status',                    header: 'Status'                 },
      { key: 'monthly_pension',           header: 'Monthly Pension (MWK)'  },
      { key: 'registered_date',           header: 'Registered Date'        },
    ],
    'gratuity-balance': [
      { key: 'pension_no',                header: 'Pension No'             },
      { key: 'full_name',                 header: 'Full Name'              },
      { key: 'department_name',           header: 'Department'             },
      { key: 'date_of_entry',             header: 'Date of Entry'          },
      { key: 'total_gratuity_due',        header: 'Total Due (MWK)'        },
      { key: 'total_gratuity_paid',       header: 'Paid (MWK)'             },
      { key: 'gratuity_balance_remaining',header: 'Balance (MWK)'          },
    ],
    'gratuity-paid': [
      { key: 'pension_no',                header: 'Pension No'             },
      { key: 'full_name',                 header: 'Full Name'              },
      { key: 'designation_at_retirement', header: 'Designation at Retirement' },
      { key: 'department_name',           header: 'Department'             },
      { key: 'payment_label',             header: 'Payment Type'           },
      { key: 'amount',                    header: 'Total Paid (MWK)'       },
      { key: 'ifmis_trf_number',          header: 'IFMIS TRF'              },
      { key: 'gratuity_received',         header: 'Received'               },
      { key: 'date_of_entry',             header: 'Date of Entry'          },
    ],
    'arrears-paid': [
      { key: 'pension_no',                header: 'Pension No'             },
      { key: 'full_name',                 header: 'Full Name'              },
      { key: 'designation_at_retirement', header: 'Designation at Retirement' },
      { key: 'department_name',           header: 'Department'             },
      { key: 'arrear_ref',                header: 'Arrear Ref'             },
      { key: 'arrear_type',               header: 'Type'                   },
      { key: 'description',               header: 'Description'            },
      { key: 'from_period',               header: 'From Period'            },
      { key: 'to_period',                 header: 'To Period'              },
      { key: 'paid_amount',               header: 'Amount Paid (MWK)'      },
      { key: 'paid_at',                   header: 'Paid Date'              },
      { key: 'payment_ref',               header: 'Payment Ref'            },
    ],
    'pending-approvals': [
      { key: 'item_type',    header: 'Type'        },
      { key: 'ref',          header: 'Reference'   },
      { key: 'description',  header: 'Description' },
      { key: 'amount',       header: 'Amount (MWK)'},
      { key: 'status',       header: 'Status'      },
      { key: 'created_by_name', header: 'Created By' },
      { key: 'created_at',  header: 'Created At'  },
    ],
  };

  const cols = COLS[type] || [];
  const isPendingApprovals = type === 'pending-approvals';
  const isGratuityBalance  = type === 'gratuity-balance';
  const isGratuityPaid     = type === 'gratuity-paid';
  const isArrearsPaid      = type === 'arrears-paid';

  function handleExport() {
    if (!rows.length) return toast.error('No data to export');
    exportToExcel(rows, cols, title.replace(/\s+/g,'_'));
    toast.success('Excel file downloaded');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="font-display text-lg text-navy">{title}</h2>
            <p className="text-xs text-slate-400">{total.toLocaleString()} records</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 bg-navy text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-navy/90 transition-colors"
            >
              <Download size={13} /> Export Excel
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1">
          {isLoading ? (
            <div className="py-12 flex justify-center"><Spinner /></div>
          ) : rows.length === 0 ? (
            <p className="text-center text-slate-400 py-12 text-sm">No records found</p>
          ) : isPendingApprovals ? (
            /* ── Pending Approvals table with approve actions ── */
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-navy text-white text-[10px] uppercase tracking-wide sticky top-0">
                  <th className="px-4 py-2.5 text-left">Type</th>
                  <th className="px-4 py-2.5 text-left">Reference</th>
                  <th className="px-4 py-2.5 text-left">Description</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                  <th className="px-4 py-2.5 text-left">Status</th>
                  <th className="px-4 py-2.5 text-left">Created By</th>
                  <th className="px-4 py-2.5 text-left">Date</th>
                  <th className="px-4 py-2.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any, i: number) => (
                  <tr key={`${r.item_type}-${r.id}`}
                    className={`border-b border-slate-100 ${i%2===0?'bg-white':'bg-slate-50/40'}`}
                  >
                    <td className="px-4 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold capitalize ${
                        r.item_type === 'payment_run' ? 'bg-navy/10 text-navy' :
                        r.item_type === 'gratuity'    ? 'bg-emerald-100 text-emerald-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {r.item_type.replace('_',' ')}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono font-bold text-navy">{r.ref}</td>
                    <td className="px-4 py-2.5 text-slate-600 max-w-52 truncate">{r.description}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{r.amount ? formatMWK(r.amount) : '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                        r.status === 'pending'    ? 'bg-slate-100 text-slate-600' :
                        r.status === 'submitted'  ? 'bg-blue-100 text-blue-700'  :
                        'bg-amber-100 text-amber-700'
                      }`}>{r.status}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{r.created_by_name}</td>
                    <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">{formatDate(r.created_at)}</td>
                    <td className="px-4 py-2.5 text-center">
                      <ApproveButton item={r} onDone={() => refetch()} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : isGratuityBalance ? (
            /* ── Gratuity Balance table ── */
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-navy text-white text-[10px] uppercase tracking-wide sticky top-0">
                  <th className="px-4 py-2.5 text-left">Pension No</th>
                  <th className="px-4 py-2.5 text-left">Full Name</th>
                  <th className="px-4 py-2.5 text-left">Department</th>
                  <th className="px-4 py-2.5 text-left whitespace-nowrap">Date of Entry</th>
                  <th className="px-4 py-2.5 text-right">Total Due</th>
                  <th className="px-4 py-2.5 text-right">Paid</th>
                  <th className="px-4 py-2.5 text-right font-bold">Balance</th>
                  <th className="px-4 py-2.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any, i: number) => (
                  <tr key={r.id || i}
                    className={`border-b border-slate-100 ${i%2===0?'bg-white':'bg-slate-50/40'}`}
                  >
                    <td className="px-4 py-2.5 font-mono font-bold text-navy">{r.pension_no}</td>
                    <td className="px-4 py-2.5 font-medium whitespace-nowrap">{r.full_name}</td>
                    <td className="px-4 py-2.5 text-slate-500 max-w-36 truncate">{r.department_name||'—'}</td>
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{formatDate(r.date_of_entry)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatMWK(r.total_gratuity_due)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-emerald-600">{formatMWK(r.total_gratuity_paid)}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-amber-600">{formatMWK(r.gratuity_balance_remaining)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* View pensioner profile */}
                        <button
                          onClick={() => { navigate(`/pensioners/${r.id}`); onClose(); }}
                          className="flex items-center gap-1 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-lg px-2 py-1 text-[10px] font-semibold transition-colors"
                          title="View pensioner profile"
                        >
                          <ExternalLink size={11} /> Profile
                        </button>
                        {/* Pay gratuity shortcut */}
                        <button
                          onClick={() => { navigate(`/gratuity/new?pensionerId=${r.id}`); onClose(); }}
                          className="flex items-center gap-1 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-700 rounded-lg px-2 py-1 text-[10px] font-semibold transition-colors"
                          title="Pay gratuity for this pensioner"
                        >
                          Pay
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : isGratuityPaid ? (
            /* ── Gratuity Paid table — 1 row per pensioner ── */
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-navy text-white text-[10px] uppercase tracking-wide sticky top-0">
                  <th className="px-4 py-2.5 text-left">Pension No</th>
                  <th className="px-4 py-2.5 text-left">Full Name</th>
                  <th className="px-4 py-2.5 text-left">Designation at Retirement</th>
                  <th className="px-4 py-2.5 text-left">Department</th>
                  <th className="px-4 py-2.5 text-left">Payment</th>
                  <th className="px-4 py-2.5 text-right">Total Paid</th>
                  <th className="px-4 py-2.5 text-left">IFMIS TRF</th>
                  <th className="px-4 py-2.5 text-center">Received</th>
                  <th className="px-4 py-2.5 text-left whitespace-nowrap">Date of Entry</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any, i: number) => (
                  <tr key={r.id || i}
                    onClick={() => { navigate(`/pensioners/${r.id}`); onClose(); }}
                    className={`border-b border-slate-100 cursor-pointer hover:bg-blue-50/40 ${i%2===0?'bg-white':'bg-slate-50/40'}`}
                  >
                    <td className="px-4 py-2.5 font-mono font-bold text-navy">{r.pension_no}</td>
                    <td className="px-4 py-2.5 font-medium whitespace-nowrap">{r.full_name}</td>
                    <td className="px-4 py-2.5 text-slate-500 max-w-36 truncate" title={r.designation_at_retirement}>{r.designation_at_retirement||'—'}</td>
                    <td className="px-4 py-2.5 text-slate-500 max-w-32 truncate">{r.department_name||'—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                        r.payment_label === 'Full' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {r.payment_label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-600">{formatMWK(r.amount)}</td>
                    <td className="px-4 py-2.5">
                      {r.ifmis_trf_number
                        ? <span className="font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded text-[10px]">{r.ifmis_trf_number}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {r.gratuity_received
                        ? <span className="text-green-600 font-bold">✓</span>
                        : <span className="text-amber-500 text-[10px]">⏳</span>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">{formatDate(r.date_of_entry)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : isArrearsPaid ? (
            /* ── Arrears Paid table ── */
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-navy text-white text-[10px] uppercase tracking-wide sticky top-0">
                  <th className="px-4 py-2.5 text-left">Pension No</th>
                  <th className="px-4 py-2.5 text-left">Full Name</th>
                  <th className="px-4 py-2.5 text-left">Designation at Retirement</th>
                  <th className="px-4 py-2.5 text-left">Type</th>
                  <th className="px-4 py-2.5 text-left">Description</th>
                  <th className="px-4 py-2.5 text-left whitespace-nowrap">Period</th>
                  <th className="px-4 py-2.5 text-right">Amount Paid</th>
                  <th className="px-4 py-2.5 text-left whitespace-nowrap">Paid Date</th>
                  <th className="px-4 py-2.5 text-left">Payment Ref</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any, i: number) => (
                  <tr key={r.id || i}
                    onClick={() => { navigate(`/pensioners/${r.pensioner_id || r.id}`); onClose(); }}
                    className={`border-b border-slate-100 cursor-pointer hover:bg-purple-50/40 ${i%2===0?'bg-white':'bg-slate-50/40'}`}
                  >
                    <td className="px-4 py-2.5 font-mono font-bold text-navy">{r.pension_no}</td>
                    <td className="px-4 py-2.5 font-medium whitespace-nowrap">{r.full_name}</td>
                    <td className="px-4 py-2.5 text-slate-500 max-w-36 truncate" title={r.designation_at_retirement}>{r.designation_at_retirement||'—'}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-700 capitalize">
                        {(r.arrear_type||'').replace(/_/g,' ')}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 max-w-48 truncate" title={r.description}>{r.description||'—'}</td>
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                      {r.from_period && r.to_period ? `${r.from_period} → ${r.to_period}` : r.from_period || r.to_period || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-purple-600">{formatMWK(r.paid_amount)}</td>
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{formatDate(r.paid_at)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{r.payment_ref||'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            /* ── Generic pensioner list table ── */
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-navy text-white text-[10px] uppercase tracking-wide sticky top-0">
                  <th className="px-4 py-2.5 text-left">Pension No</th>
                  <th className="px-4 py-2.5 text-left">Full Name</th>
                  <th className="px-4 py-2.5 text-left">Designation at Retirement</th>
                  <th className="px-4 py-2.5 text-left">Department</th>
                  <th className="px-4 py-2.5 text-left">Status</th>
                  <th className="px-4 py-2.5 text-right">Monthly Pension</th>
                  <th className="px-4 py-2.5 text-left whitespace-nowrap">
                    {type === 'introduced' ? 'Registered' : type === 'deceased' ? 'Date of Death' : 'Retirement Date'}
                  </th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any, i: number) => (
                  <tr key={r.id || i}
                    className={`border-b border-slate-100 hover:bg-blue-50/50 cursor-pointer ${i%2===0?'bg-white':'bg-slate-50/40'}`}
                    onClick={() => { navigate(`/pensioners/${r.id}`); onClose(); }}
                  >
                    <td className="px-4 py-2.5 font-mono font-bold text-navy">{r.pension_no}</td>
                    <td className="px-4 py-2.5 font-medium whitespace-nowrap">{r.full_name}</td>
                    <td className="px-4 py-2.5 text-slate-600 max-w-36 truncate" title={r.designation_at_retirement}>{r.designation_at_retirement||'—'}</td>
                    <td className="px-4 py-2.5 text-slate-500 max-w-32 truncate">{r.department_name||'—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold capitalize ${
                        r.status === 'active'   ? 'bg-green-100 text-green-700' :
                        r.status === 'deceased' ? 'bg-red-100 text-red-700'    : 'bg-slate-100 text-slate-600'
                      }`}>{r.status}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatMWK(r.monthly_pension)}</td>
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                      {formatDate(type === 'introduced' ? r.registered_date : type === 'deceased' ? r.date_of_death : r.date_of_retirement)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-300 hover:text-navy"><ExternalLink size={13}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 text-xs text-slate-500 flex-shrink-0">
            <span>Page {page} of {totalPages} · {total} records</span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page<=1}
                className="px-3 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40">← Prev</button>
              <button onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page>=totalPages}
                className="px-3 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40">Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Clickable KPI card ────────────────────────────────────────
function KpiCard({ label, value, sub, color = 'text-navy', icon, drillType, onDrill }: {
  label: string; value: string | number; sub?: string;
  color?: string; icon?: React.ReactNode;
  drillType?: string; onDrill?: (type: string, title: string) => void;
}) {
  const clickable = !!drillType && !!onDrill;
  return (
    <div onClick={() => clickable && onDrill!(drillType, label)}
      className={`stat-card transition-all ${clickable ? 'cursor-pointer hover:shadow-md hover:border-navy/40 group' : ''}`}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide leading-tight">{label}</p>
        <div className="flex items-center gap-1 text-slate-400">
          {icon}
          {clickable && <ChevronRight size={13} className="opacity-0 group-hover:opacity-100 transition-opacity" />}
        </div>
      </div>
      <p className={`text-2xl font-bold font-display mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5 truncate" title={typeof sub === 'string' ? sub : ''}>{sub}</p>}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────
export default function DashboardPage() {
  const [drilldown, setDrilldown] = useState<{ type: string; title: string } | null>(null);

  const { data: ov = {}, isLoading } = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn:  () => api.get('/dashboard/overview').then(r => r.data.data),
    refetchInterval: 60000,
  });
  const { data: monthly } = useQuery({
    queryKey: ['dashboard-monthly'],
    queryFn:  () => api.get('/dashboard/charts/monthly-payments').then(r => r.data.data),
    refetchInterval: 60000,
  });
  const { data: statusData } = useQuery({
    queryKey: ['dashboard-status'],
    queryFn:  () => api.get('/dashboard/charts/pensioner-status').then(r => r.data.data),
  });
  const { data: deptData } = useQuery({
    queryKey: ['dashboard-dept'],
    queryFn:  () => api.get('/dashboard/charts/department-breakdown').then(r => r.data.data),
  });

  if (isLoading) return <Spinner />;

  function drill(type: string, title: string) { setDrilldown({ type, title }); }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl text-navy">Dashboard</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {new Date().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
          </p>
        </div>

      </div>

      {/* 6 KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

        <KpiCard
          label="Total Registered Pensioners"
          value={((ov as any).totalRegistered || 0).toLocaleString()}
          sub={`${(ov as any).totalDeceased || 0} deceased · ${(ov as any).totalActivePensioners || 0} active`}
          icon={<Users size={16} />}
          drillType="registered"
          onDrill={drill}
        />

        <KpiCard
          label="Active Pensioners"
          value={((ov as any).totalActivePensioners || 0).toLocaleString()}
          sub="Receiving pension today"
          color="text-green-600"
          icon={<Users size={16} />}
          drillType="active"
          onDrill={drill}
        />

        <KpiCard
          label="Introduced This Month"
          value={((ov as any).introducedThisMonth || 0).toLocaleString()}
          sub="Registered this month"
          color="text-blue-600"
          drillType="introduced"
          onDrill={drill}
        />

        {/* Current Month Payout — no drilldown */}
        <div className="stat-card">
          <div className="flex items-start justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Current Month Payout</p>
            <CreditCard size={16} className="text-slate-400" />
          </div>
          <p className="text-2xl font-bold font-display text-navy mt-1">
            {formatMWK((ov as any).currentMonthPayout)}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5 truncate">
            {(ov as any).payoutFromRun
              ? <span className="text-green-600">✓ {(ov as any).payoutSource}</span>
              : <span>📊 {(ov as any).payoutSource}</span>}
          </p>
        </div>

        {/* Gratuity Paid — clickable to show paid list */}
        <div
          className="stat-card cursor-pointer hover:shadow-md hover:border-navy/40 group transition-all"
          onClick={() => drill('gratuity-paid', 'Gratuity Paid')}
        >
          <div className="flex items-start justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Gratuity Paid</p>
            <div className="flex items-center gap-1 text-slate-400">
              <Gift size={16} />
              <ChevronRight size={13} className="opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
          <p className="text-2xl font-bold font-display text-emerald-600 mt-1">
            {formatMWK((ov as any).gratuityPaid)}
          </p>
          <div className="flex items-center gap-2 mt-0.5 text-[10px]">
            <span className="text-slate-500">{(ov as any).gratuityPaidCount || 0} pensioners</span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-500">{(ov as any).gratuityPaymentCount || 0} payments</span>
            {(ov as any).gratuityPendingReceipt > 0 && (
              <span className="text-amber-500 ml-1">⏳ {(ov as any).gratuityPendingReceipt} pending receipt</span>
            )}
          </div>
        </div>

        {/* Gratuity Balance — clickable */}
        <KpiCard
          label="Gratuity Balance"
          value={formatMWK((ov as any).outstandingGratuityTotal)}
          sub={`${(ov as any).outstandingGratuityCount || 0} pensioners with unpaid balance`}
          color="text-amber-600"
          icon={<TrendingUp size={16} />}
          drillType="gratuity-balance"
          onDrill={drill}
        />

        {/* Arrears Paid — clickable */}
        <KpiCard
          label="Total Arrears Paid"
          value={formatMWK((ov as any).totalArrearsPaid)}
          sub={`${(ov as any).totalArrearsPaidCount || 0} arrear payment${(ov as any).totalArrearsPaidCount !== 1 ? 's' : ''} settled`}
          color="text-purple-600"
          icon={<TrendingUp size={16} />}
          drillType="arrears-paid"
          onDrill={drill}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="card lg:col-span-2">
          <h3 className="font-display text-base text-navy mb-1">Monthly Pension Payout — Last 12 Months</h3>
          <div className="flex flex-wrap gap-3 text-[10px] text-slate-400 mb-3">
            {[['Processed','#1E3A5F'],['In Approval','#BFDBFE'],['Projected','#E2E8F0']].map(([l,c]) => (
              <div key={l} className="flex items-center gap-1">
                <div className="w-3 h-2.5 rounded-sm" style={{ backgroundColor: c }} />
                <span>{l}</span>
              </div>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthly||[]} margin={{ top:4, right:8, left:8, bottom:4 }}>
              <XAxis dataKey="month_name" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => `K${(v/1_000_000).toFixed(1)}M`} tick={{ fontSize: 11 }} />
              <Tooltip content={<PayoutTooltip />} />
              <Bar dataKey="net_amount" radius={[4,4,0,0]}>
                {(monthly||[]).map((e: any, i: number) => (
                  <Cell key={i} fill={BAR_COLORS[e.source]||'#1E3A5F'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="font-display text-base text-navy mb-3">Pensioner Status</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={statusData||[]} dataKey="count" nameKey="status"
                cx="50%" cy="45%" innerRadius={44} outerRadius={72} paddingAngle={2}
                label={({ percent }) => `${(percent*100).toFixed(0)}%`} labelLine={false}>
                {(statusData||[]).map((e: any, i: number) => (
                  <Cell key={i} fill={STATUS_COLORS[e.status]||'#94A3B8'} />
                ))}
              </Pie>
              <Legend formatter={v => <span style={{ fontSize:11 }} className="capitalize">{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {deptData && deptData.length > 0 && (
        <div className="card">
          <h3 className="font-display text-base text-navy mb-3">Active Pensioners by Department (Top 10)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={deptData} layout="vertical" margin={{ left:160, right:24, top:4, bottom:4 }}>
              <XAxis type="number" tick={{ fontSize:11 }} allowDecimals={false} />
              <YAxis type="category" dataKey="department" tick={{ fontSize:11 }} width={160} />
              <Tooltip formatter={(v: number) => [`${v} pensioners`,'']} contentStyle={{ fontSize:12, borderRadius:8 }} />
              <Bar dataKey="count" fill="#2E6DA4" radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {drilldown && (
        <DrilldownModal type={drilldown.type} title={drilldown.title} onClose={() => setDrilldown(null)} />
      )}
    </div>
  );
}
