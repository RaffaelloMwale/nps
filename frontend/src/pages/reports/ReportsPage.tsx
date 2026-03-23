import { useState } from 'react';
import { FileSpreadsheet, Download } from 'lucide-react';
import { downloadReport } from '../../config/api';
import { PageHeader, Button, Input } from '../../components/ui';
import toast from 'react-hot-toast';
import { useQuery } from '@tanstack/react-query';
import api from '../../config/api';

interface ReportCardProps {
  title: string;
  description: string;
  onDownload: () => Promise<void>;
}

function ReportCard({ title, description, onDownload }: ReportCardProps) {
  const [loading, setLoading] = useState(false);
  async function handle() {
    setLoading(true);
    try { await onDownload(); toast.success(`${title} downloaded`); }
    catch { toast.error('Download failed'); }
    finally { setLoading(false); }
  }
  return (
    <div className="card flex items-center gap-4 py-4 hover:border-navy/30 transition-colors">
      <div className="w-10 h-10 bg-navy/5 rounded-lg flex items-center justify-center flex-shrink-0">
        <FileSpreadsheet size={20} className="text-navy" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-slate-800">{title}</p>
        <p className="text-xs text-slate-400 mt-0.5">{description}</p>
      </div>
      <Button variant="secondary" icon={<Download size={13} />} onClick={handle} loading={loading}>
        Download
      </Button>
    </div>
  );
}

export default function ReportsPage() {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const { data: runs } = useQuery({
    queryKey: ['payment-runs-list'],
    queryFn: () => api.get('/payment-runs', { params: { limit: 50 } }).then(r => r.data.data),
  });
  const [selectedRun, setSelectedRun] = useState('');

  const reports: ReportCardProps[] = [
    {
      title: 'Pensioner Register',
      description: 'Full list of all pensioners with pension amounts, gratuity entitlement and status',
      onDownload: () => downloadReport('/reports/pensioner-register', 'Pensioner_Register.xlsx'),
    },
    {
      title: 'Gratuity Schedule',
      description: 'All gratuity records — entitlement, amounts paid, balances and status',
      onDownload: () => downloadReport('/reports/gratuity-schedule', 'Gratuity_Schedule.xlsx'),
    },
    {
      title: 'Gratuity Due Report',
      description: 'Pensioners with outstanding gratuity balances, sorted by balance descending',
      onDownload: () => downloadReport('/reports/gratuity-due', 'Gratuity_Due.xlsx'),
    },
    {
      title: 'Partial Gratuity Report',
      description: 'Pensioners who have received partial gratuity — counts, amounts and dates',
      onDownload: () => downloadReport('/reports/partial-gratuity', 'Partial_Gratuity.xlsx'),
    },
    {
      title: 'Arrears Schedule',
      description: 'All arrear records with computed amounts, payments made and outstanding balances',
      onDownload: () => downloadReport('/reports/arrears-schedule', 'Arrears_Schedule.xlsx'),
    },
    {
      title: 'New Introductions',
      description: 'Pensioners registered within the selected date range',
      onDownload: () => downloadReport(`/reports/new-introductions?from=${fromDate}&to=${toDate}`, 'New_Introductions.xlsx'),
    },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="Reports"
        subtitle="Download Excel reports for all pension data"
      />

      {/* Date range filter (for applicable reports) */}
      <div className="card py-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Date Range Filter (applies to Introduction reports)</p>
        <div className="flex gap-3">
          <Input label="From" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          <Input label="To"   type="date" value={toDate}   onChange={e => setToDate(e.target.value)} />
        </div>
      </div>

      {/* Payment run report (special - needs run selector) */}
      <div className="card flex items-center gap-4 py-4">
        <div className="w-10 h-10 bg-navy/5 rounded-lg flex items-center justify-center flex-shrink-0">
          <FileSpreadsheet size={20} className="text-navy" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-sm text-slate-800">Monthly Payment Register</p>
          <p className="text-xs text-slate-400 mt-0.5">All payment lines for a specific monthly run</p>
          <select
            className="input mt-2 text-sm w-56"
            value={selectedRun}
            onChange={e => setSelectedRun(e.target.value)}
          >
            <option value="">Select payment run…</option>
            {(runs || []).map((r: any) => (
              <option key={r.id} value={r.id}>{r.run_code} — {r.payment_period}</option>
            ))}
          </select>
        </div>
        <Button
          variant="secondary"
          icon={<Download size={13} />}
          disabled={!selectedRun}
          onClick={async () => {
            if (!selectedRun) return;
            await downloadReport(`/reports/payment-run/${selectedRun}`, `Payment_Run.xlsx`);
            toast.success('Payment register downloaded');
          }}
        >
          Download
        </Button>
      </div>

      {/* Other reports */}
      <div className="space-y-3">
        {reports.map(r => <ReportCard key={r.title} {...r} />)}
      </div>
    </div>
  );
}
