import { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Upload, Download, CheckCircle, XCircle, AlertTriangle, FileSpreadsheet, ArrowRight, RotateCcw } from 'lucide-react';
import api from '../../config/api';
import { PageHeader, Button, Spinner } from '../../components/ui';
import { formatMWK } from '../../utils/formatters';
import toast from 'react-hot-toast';

type ImportType = 'pensioners' | 'gratuity' | 'arrears';

const IMPORT_TYPES = [
  {
    type: 'pensioners' as ImportType,
    label: 'Pensioners',
    icon: '👥',
    description: 'Import pensioner records — personal details, employment history, pension and gratuity amounts.',
    color: 'border-navy/30 hover:border-navy',
    activeColor: 'border-navy bg-navy/5',
    fields: ['pension_no','employee_no','first_name','last_name','gender','date_of_birth','department','designation_at_retirement','monthly_pension','total_gratuity_due','status','...'],
  },
  {
    type: 'gratuity' as ImportType,
    label: 'Gratuity Payments',
    icon: '💰',
    description: 'Import historical gratuity payments — amounts already paid to pensioners with IFMIS TRF references.',
    color: 'border-emerald-300 hover:border-emerald-500',
    activeColor: 'border-emerald-500 bg-emerald-50',
    fields: ['pension_no','gratuity_type','payment_date','amount_paid','ifmis_trf_number','is_partial'],
  },
  {
    type: 'arrears' as ImportType,
    label: 'Arrears',
    icon: '📋',
    description: 'Import outstanding or historical arrear records — pension gaps, underpayments, and other amounts owed.',
    color: 'border-purple-300 hover:border-purple-500',
    activeColor: 'border-purple-500 bg-purple-50',
    fields: ['pension_no','arrear_type','description','from_period','to_period','amount','status','paid_amount'],
  },
];

type Step = 'select' | 'upload' | 'preview' | 'importing' | 'done';

export default function ImportPage() {
  const [step,        setStep]      = useState<Step>('select');
  const [importType,  setImportType] = useState<ImportType | null>(null);
  const [file,        setFile]       = useState<File | null>(null);
  const [preview,     setPreview]    = useState<any>(null);
  const [result,      setResult]     = useState<any>(null);
  const [dragging,    setDragging]   = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Preview mutation ────────────────────────────────────────
  const previewMutation = useMutation({
    mutationFn: async (f: File) => {
      const fd = new FormData();
      fd.append('file', f);
      const res = await api.post(`/import/preview/${importType}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data.data;
    },
    onSuccess: (data) => { setPreview(data); setStep('preview'); },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Preview failed'),
  });

  // ── Import mutation ─────────────────────────────────────────
  const importMutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append('file', file!);
      setStep('importing');
      const res = await api.post(`/import/upload/${importType}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data.data;
    },
    onSuccess: (data) => { setResult(data); setStep('done'); },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || 'Import failed');
      setStep('preview');
    },
  });

  function handleFile(f: File) {
    setFile(f);
    previewMutation.mutate(f);
    setStep('upload');
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  function reset() {
    setStep('select');
    setImportType(null);
    setFile(null);
    setPreview(null);
    setResult(null);
  }

  const typeConfig = IMPORT_TYPES.find(t => t.type === importType);

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <PageHeader
        title="Data Import"
        subtitle="Import existing data into NPS from Excel spreadsheets"
      />

      {/* ── Step indicator ────────────────────────────────────── */}
      <div className="flex items-center gap-0">
        {[
          { key: 'select',   label: '1. Select Type' },
          { key: 'upload',   label: '2. Upload File'  },
          { key: 'preview',  label: '3. Preview'      },
          { key: 'done',     label: '4. Complete'     },
        ].map(({ key, label }, i, arr) => {
          const steps = ['select','upload','preview','done'];
          const current = steps.indexOf(step);
          const mine    = steps.indexOf(key);
          const done    = current > mine;
          const active  = current === mine;
          return (
            <div key={key} className="flex items-center flex-1">
              <div className={`flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl transition-all ${
                active ? 'bg-navy text-white' :
                done   ? 'bg-green-100 text-green-700' : 'text-slate-400'
              }`}>
                {done ? <CheckCircle size={13} /> : <span className="w-4 text-center">{mine+1}</span>}
                <span className="hidden sm:block">{label}</span>
              </div>
              {i < arr.length - 1 && (
                <div className={`flex-1 h-px mx-1 ${done ? 'bg-green-300' : 'bg-slate-200'}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════════════════
          STEP 1 — Select import type
      ══════════════════════════════════════════════════════ */}
      {step === 'select' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Select the type of data you want to import, then download the Excel template,
            fill it in with your existing data, and upload it.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {IMPORT_TYPES.map(t => (
              <button
                key={t.type}
                onClick={() => { setImportType(t.type); setStep('upload'); }}
                className={`card text-left border-2 transition-all hover:shadow-md ${
                  importType === t.type ? t.activeColor : t.color
                }`}
              >
                <div className="text-3xl mb-3">{t.icon}</div>
                <h3 className="font-display text-base text-navy mb-1">{t.label}</h3>
                <p className="text-xs text-slate-500 mb-3">{t.description}</p>
                <div className="flex flex-wrap gap-1">
                  {t.fields.slice(0, 5).map(f => (
                    <span key={f} className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono">{f}</span>
                  ))}
                  {t.fields.length > 5 && (
                    <span className="text-[10px] text-slate-400">+{t.fields.length - 5} more</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          STEP 2 — Upload file
      ══════════════════════════════════════════════════════ */}
      {step === 'upload' && importType && (
        <div className="space-y-4">
          {/* Template download */}
          <div className="card bg-blue-50 border-blue-200">
            <div className="flex items-start gap-3">
              <FileSpreadsheet size={20} className="text-blue-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-sm text-navy">
                  Step 1: Download the template for{' '}
                  <span className="text-blue-600">{typeConfig?.label}</span>
                </p>
                <p className="text-xs text-slate-500 mt-0.5 mb-3">
                  Fill in the template with your existing data. Do not change column headers.
                  Delete the instruction row and example row before uploading.
                  Dates must be in <strong>YYYY-MM-DD</strong> format.
                </p>
                <a
                  href={`${import.meta.env.VITE_API_URL || ''}/api/import/template/${importType}`}
                  download
                  onClick={() => {
                    // Use api with auth token
                    api.get(`/import/template/${importType}`, { responseType: 'blob' })
                      .then(res => {
                        const url = window.URL.createObjectURL(new Blob([res.data]));
                        const a   = document.createElement('a');
                        a.href    = url;
                        a.download = `NPS_Import_${importType}.xlsx`;
                        a.click(); a.remove();
                      });
                  }}
                  className="inline-flex items-center gap-2 bg-navy text-white px-4 py-2 rounded-xl text-xs font-semibold hover:bg-navy/90 transition-colors"
                >
                  <Download size={14} />
                  Download {typeConfig?.label} Template
                </a>
              </div>
            </div>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
              dragging
                ? 'border-navy bg-navy/5 scale-[1.01]'
                : 'border-slate-300 hover:border-navy/50 hover:bg-slate-50'
            }`}
          >
            <Upload size={32} className="mx-auto text-slate-400 mb-3" />
            <p className="font-semibold text-slate-700 text-sm">
              {dragging ? 'Drop your file here' : 'Drop Excel file here or click to browse'}
            </p>
            <p className="text-xs text-slate-400 mt-1">Accepts .xlsx and .xls files up to 10 MB</p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
            />
          </div>

          {previewMutation.isPending && (
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <Spinner /> Validating file...
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => setStep('select')} icon={<ArrowRight size={13} className="rotate-180"/>}>Back</Button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          STEP 3 — Preview & confirm
      ══════════════════════════════════════════════════════ */}
      {step === 'preview' && preview && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="stat-card">
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">Total Rows</p>
              <p className="text-2xl font-bold font-display text-navy">{preview.totalRows}</p>
              <p className="text-xs text-slate-400">in uploaded file</p>
            </div>
            <div className="stat-card">
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">Valid Rows</p>
              <p className="text-2xl font-bold font-display text-green-600">{preview.validRows}</p>
              <p className="text-xs text-slate-400">ready to import</p>
            </div>
            <div className={`stat-card ${preview.errorRows > 0 ? 'border-red-200' : ''}`}>
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">Errors</p>
              <p className={`text-2xl font-bold font-display ${preview.errorRows > 0 ? 'text-red-600' : 'text-slate-300'}`}>
                {preview.errorRows}
              </p>
              <p className="text-xs text-slate-400">rows with issues</p>
            </div>
          </div>

          {/* Error list */}
          {preview.allErrors?.length > 0 && (
            <div className="card border-red-200 bg-red-50">
              <div className="flex items-center gap-2 mb-3">
                <XCircle size={16} className="text-red-500" />
                <p className="font-semibold text-sm text-red-700">
                  {preview.errorRows} row{preview.errorRows !== 1 ? 's' : ''} have errors
                  {preview.validRows > 0 ? ' — valid rows will still be imported' : ''}
                </p>
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {preview.allErrors.slice(0, 15).map((e: any) => (
                  <div key={e.row} className="flex gap-2 text-xs text-red-600">
                    <span className="font-mono font-bold w-14 flex-shrink-0">Row {e.row}:</span>
                    <span>{e.errors.join(' · ')}</span>
                  </div>
                ))}
                {preview.allErrors.length > 15 && (
                  <p className="text-xs text-red-400 italic">...and {preview.allErrors.length - 15} more</p>
                )}
              </div>
            </div>
          )}

          {/* Data preview table */}
          <div className="card p-0">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <p className="font-display text-sm text-navy">
                Preview — first {preview.preview.length} rows
              </p>
              <span className="text-xs text-slate-400">{file?.name}</span>
            </div>
            <div className="overflow-auto max-h-64">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Row</th>
                    {importType === 'pensioners' && <>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Pension No</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Full Name</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Department</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">Monthly Pension</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Status</th>
                    </>}
                    {importType === 'gratuity' && <>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Pension No</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Type</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Date</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">Amount</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">IFMIS TRF</th>
                    </>}
                    {importType === 'arrears' && <>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Pension No</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Type</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Description</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">Amount</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Status</th>
                    </>}
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Valid?</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.map((r: any) => (
                    <tr key={r.row} className={`border-b border-slate-100 ${r.errors.length ? 'bg-red-50' : ''}`}>
                      <td className="px-3 py-1.5 font-mono text-slate-400">{r.row}</td>
                      {importType === 'pensioners' && <>
                        <td className="px-3 py-1.5 font-mono text-navy">{r.pension_no}</td>
                        <td className="px-3 py-1.5 font-medium">{r.full_name}</td>
                        <td className="px-3 py-1.5 text-slate-500 max-w-28 truncate">{r.department||'—'}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{formatMWK(r.monthly_pension)}</td>
                        <td className="px-3 py-1.5">
                          <span className={`badge text-[10px] capitalize ${r.status==='active'?'bg-green-100 text-green-700':'bg-slate-100 text-slate-600'}`}>{r.status}</span>
                        </td>
                      </>}
                      {importType === 'gratuity' && <>
                        <td className="px-3 py-1.5 font-mono text-navy">{r.pension_no}</td>
                        <td className="px-3 py-1.5 capitalize">{r.gratuity_type}</td>
                        <td className="px-3 py-1.5 text-slate-500">{r.payment_date}</td>
                        <td className="px-3 py-1.5 text-right font-mono font-bold text-emerald-600">{formatMWK(r.amount)}</td>
                        <td className="px-3 py-1.5 font-mono text-blue-600 text-[10px]">{r.ifmis_trf||'—'}</td>
                      </>}
                      {importType === 'arrears' && <>
                        <td className="px-3 py-1.5 font-mono text-navy">{r.pension_no}</td>
                        <td className="px-3 py-1.5 text-xs">{(r.arrear_type||'').replace(/_/g,' ')}</td>
                        <td className="px-3 py-1.5 max-w-36 truncate text-slate-500">{r.description}</td>
                        <td className="px-3 py-1.5 text-right font-mono font-bold text-purple-600">{formatMWK(r.amount)}</td>
                        <td className="px-3 py-1.5 capitalize">{r.status}</td>
                      </>}
                      <td className="px-3 py-1.5">
                        {r.errors.length === 0
                          ? <CheckCircle size={14} className="text-green-500" />
                          : <span title={r.errors.join(', ')}><XCircle size={14} className="text-red-500" /></span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => setStep('upload')} icon={<ArrowRight size={13} className="rotate-180"/>}>
              Change File
            </Button>
            <div className="flex items-center gap-3">
              {preview.validRows === 0 && (
                <p className="text-xs text-red-600">Fix all errors before importing</p>
              )}
              <Button
                icon={<Upload size={14} />}
                disabled={preview.validRows === 0}
                loading={importMutation.isPending}
                onClick={() => importMutation.mutate()}
              >
                Import {preview.validRows} Valid Row{preview.validRows !== 1 ? 's' : ''}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          STEP — Importing
      ══════════════════════════════════════════════════════ */}
      {step === 'importing' && (
        <div className="card text-center py-16">
          <Spinner />
          <p className="mt-4 font-semibold text-navy">Importing data...</p>
          <p className="text-xs text-slate-400 mt-1">Please wait — do not close this page</p>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          STEP 4 — Done
      ══════════════════════════════════════════════════════ */}
      {step === 'done' && result && (
        <div className="space-y-4">
          <div className={`card text-center py-10 ${result.failed > 0 ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'}`}>
            {result.failed > 0
              ? <AlertTriangle size={40} className="mx-auto text-amber-500 mb-3" />
              : <CheckCircle  size={40} className="mx-auto text-green-500 mb-3" />}
            <h2 className="font-display text-xl text-navy mb-1">Import Complete</h2>
            <p className="text-sm text-slate-600">{result.message}</p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="stat-card">
              <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Imported</p>
              <p className="text-3xl font-bold font-display text-green-600">{result.imported}</p>
              <p className="text-xs text-slate-400">rows added successfully</p>
            </div>
            <div className="stat-card">
              <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Skipped</p>
              <p className="text-3xl font-bold font-display text-slate-400">{result.skipped}</p>
              <p className="text-xs text-slate-400">duplicates or blank rows</p>
            </div>
            <div className={`stat-card ${result.failed > 0 ? 'border-red-200' : ''}`}>
              <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Failed</p>
              <p className={`text-3xl font-bold font-display ${result.failed > 0 ? 'text-red-600' : 'text-slate-300'}`}>
                {result.failed}
              </p>
              <p className="text-xs text-slate-400">rows with errors</p>
            </div>
          </div>

          {result.failures?.length > 0 && (
            <div className="card border-red-200">
              <p className="font-semibold text-sm text-red-700 mb-2">Failed rows:</p>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {result.failures.map((f: any) => (
                  <div key={f.row} className="flex gap-2 text-xs text-red-600">
                    <span className="font-mono font-bold w-14">Row {f.row}:</span>
                    <span>{f.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 justify-center pt-2">
            <Button variant="secondary" icon={<RotateCcw size={14}/>} onClick={reset}>
              Import Another File
            </Button>
            <Button onClick={() => window.location.href = importType === 'pensioners' ? '/pensioners' : `/${importType}`}>
              View {typeConfig?.label} →
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
