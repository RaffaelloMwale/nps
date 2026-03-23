import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Save, AlertTriangle, CheckCircle, Palette, Globe,
  Shield, Clock, RefreshCw, CalendarCheck
} from 'lucide-react';
import api from '../../config/api';
import { PageHeader, Button, Input, Spinner } from '../../components/ui';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const qc = useQueryClient();
  const [localSettings, setLocalSettings] = useState<Record<string, string>>({});
  const [changed, setChanged] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings').then(r => r.data.data),
  });

  const { data: schedulerStatus } = useQuery({
    queryKey: ['scheduler-status'],
    queryFn: () => api.get('/settings/scheduler/status').then(r => r.data.data),
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (settings) setLocalSettings({ ...settings });
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, string>) => api.put('/settings', data),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Settings saved');
      setChanged(false);
      qc.invalidateQueries({ queryKey: ['settings'] });
      qc.invalidateQueries({ queryKey: ['scheduler-status'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to save settings');
    },
  });

  const maintenanceMutation = useMutation({
    mutationFn: (enabled: boolean) => api.post('/settings/maintenance', { enabled }),
    onSuccess: (_, enabled) => {
      toast.success(`Maintenance mode ${enabled ? 'ENABLED' : 'DISABLED'}`);
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  function set(key: string, value: string) {
    setLocalSettings(s => ({ ...s, [key]: value }));
    setChanged(true);
  }

  function handleSave() {
    // Only send keys that have actually changed vs what is saved in DB
    // (exclude the scheduler.current_run_day virtual key)
    const toSave = Object.fromEntries(
      Object.entries(localSettings).filter(([k]) => k !== 'scheduler.current_run_day')
    );
    saveMutation.mutate(toSave);
  }

  const maintenanceMode = localSettings['system.maintenance_mode'] === 'true';
  const savedRunDay     = localSettings['payment.auto_run_day'] || '14';
  const liveRunDay      = schedulerStatus?.liveRunDay ?? localSettings['scheduler.current_run_day'] ?? savedRunDay;
  const runDayMismatch  = String(savedRunDay) !== String(liveRunDay);

  if (isLoading) return <Spinner />;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <PageHeader
        title="System Settings"
        subtitle="Configure system-wide options. Changes to the payment run day take effect immediately — no restart needed."
        actions={
          changed ? (
            <Button icon={<Save size={14} />} loading={saveMutation.isPending} onClick={handleSave}>
              Save Changes
            </Button>
          ) : undefined
        }
      />

      {/* ── Maintenance Mode ─────────────────────────────────── */}
      <div className={`card border-2 ${maintenanceMode ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {maintenanceMode
              ? <AlertTriangle className="text-red-500 flex-shrink-0" size={22} />
              : <CheckCircle   className="text-green-500 flex-shrink-0" size={22} />}
            <div>
              <p className="font-semibold text-sm">
                Maintenance Mode:{' '}
                <span className={maintenanceMode ? 'text-red-600' : 'text-green-600'}>
                  {maintenanceMode ? 'ON' : 'OFF'}
                </span>
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {maintenanceMode
                  ? 'System is in maintenance — only Administrators can log in'
                  : 'System is online — all users can access normally'}
              </p>
            </div>
          </div>
          <Button
            variant={maintenanceMode ? 'secondary' : 'danger'}
            loading={maintenanceMutation.isPending}
            onClick={() => maintenanceMutation.mutate(!maintenanceMode)}
          >
            {maintenanceMode ? 'Disable Maintenance' : 'Enable Maintenance'}
          </Button>
        </div>
      </div>

      {/* ── Scheduler Status ─────────────────────────────────── */}
      <div className="card border-2 border-blue-200 bg-blue-50/40">
        <div className="flex items-start gap-3">
          <Clock className="text-navy flex-shrink-0 mt-0.5" size={20} />
          <div className="flex-1">
            <p className="font-semibold text-sm text-navy">Auto Payment Run Scheduler</p>
            <p className="text-xs text-slate-600 mt-0.5">
              The scheduler automatically creates a pension payment run on the configured day each month.
              Changing the day below saves it and <strong>immediately restarts the scheduler</strong> —
              no server restart is needed.
            </p>

            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-white rounded-lg border border-blue-200 p-2.5">
                <p className="text-slate-500 font-semibold uppercase tracking-wide text-[10px]">Saved Run Day</p>
                <p className="text-navy font-bold text-lg font-display mt-0.5">{savedRunDay}</p>
                <p className="text-slate-400">in system_settings</p>
              </div>
              <div className="bg-white rounded-lg border border-blue-200 p-2.5">
                <p className="text-slate-500 font-semibold uppercase tracking-wide text-[10px]">Live Cron Day</p>
                <p className={`font-bold text-lg font-display mt-0.5 ${runDayMismatch ? 'text-amber-500' : 'text-green-600'}`}>
                  {liveRunDay}
                </p>
                <p className="text-slate-400">currently running</p>
              </div>
              <div className="bg-white rounded-lg border border-blue-200 p-2.5">
                <p className="text-slate-500 font-semibold uppercase tracking-wide text-[10px]">Cron Expression</p>
                <p className="font-mono text-[11px] text-slate-700 mt-1 break-all">
                  {schedulerStatus?.cronExpression || `0 6 ${liveRunDay} * *`}
                </p>
                <p className="text-slate-400">06:00 Blantyre time</p>
              </div>
            </div>

            {runDayMismatch && (
              <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-700">
                ⚠ The saved day ({savedRunDay}) does not match the live scheduler day ({liveRunDay}).
                Save settings to synchronise them.
              </div>
            )}

            {schedulerStatus?.recentSchedules?.length > 0 && (
              <div className="mt-3">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Recent Schedule Log</p>
                <div className="space-y-1">
                  {schedulerStatus.recentSchedules.slice(0, 4).map((s: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs bg-white rounded border border-blue-100 px-2.5 py-1.5">
                      <CalendarCheck size={11} className={
                        s.trigger_status === 'triggered' ? 'text-green-500' :
                        s.trigger_status === 'skipped'   ? 'text-slate-400' :
                        s.trigger_status === 'failed'    ? 'text-red-500'   : 'text-slate-400'
                      } />
                      <span className="font-semibold text-slate-700">
                        {String(s.schedule_month).padStart(2,'0')}/{s.schedule_year}
                      </span>
                      <span className={`badge text-[10px] ${
                        s.trigger_status === 'triggered' ? 'bg-green-100 text-green-700' :
                        s.trigger_status === 'skipped'   ? 'bg-slate-100 text-slate-500' :
                        s.trigger_status === 'failed'    ? 'bg-red-100 text-red-600'     :
                        'bg-slate-100 text-slate-500'
                      }`}>
                        {s.trigger_status}
                      </span>
                      {s.error_message && (
                        <span className="text-red-500 truncate">{s.error_message}</span>
                      )}
                      {s.triggered_at && (
                        <span className="ml-auto text-slate-400">
                          {new Date(s.triggered_at).toLocaleDateString('en-GB')}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Payment Auto Run Day — prominent field ────────────── */}
      <div className="card border-2 border-navy/20">
        <div className="flex items-start gap-3">
          <RefreshCw className="text-navy flex-shrink-0 mt-1" size={18} />
          <div className="flex-1">
            <p className="font-semibold text-sm text-navy mb-0.5">Monthly Payment Run Day</p>
            <p className="text-xs text-slate-500 mb-4">
              The day of the month on which pension payments are automatically generated.
              Must be between <strong>1 and 28</strong> (use 28 or earlier to safely cover all months).
              Saving this will restart the live scheduler instantly.
            </p>
            <div className="flex items-end gap-4">
              <div className="w-36">
                <Input
                  label="Run Day (1–28)"
                  type="number"
                  min="1"
                  max="28"
                  value={localSettings['payment.auto_run_day'] || '14'}
                  onChange={e => set('payment.auto_run_day', e.target.value)}
                />
              </div>
              <p className="text-xs text-slate-500 pb-2">
                Current setting: <strong>day {savedRunDay}</strong> of every month at 06:00<br />
                Live scheduler: <strong className={runDayMismatch ? 'text-amber-600' : 'text-green-600'}>
                  day {liveRunDay}
                </strong>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Organisation ─────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
          <Globe size={16} className="text-navy" />
          <h3 className="font-display text-base text-navy">Organisation</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { key: 'system.org_name',    label: 'Organisation Name' },
            { key: 'system.system_name', label: 'System Name' },
            { key: 'system.footer_text', label: 'Header / Footer Text' },
            { key: 'system.logo_text',   label: 'Sidebar Logo Text' },
          ].map(({ key, label }) => (
            <div key={key}>
              <Input
                label={label}
                value={localSettings[key] || ''}
                onChange={e => set(key, e.target.value)}
              />
              <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{key}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Appearance ───────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
          <Palette size={16} className="text-navy" />
          <h3 className="font-display text-base text-navy">Appearance</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { key: 'system.primary_color',   label: 'Primary Colour' },
            { key: 'system.secondary_color', label: 'Secondary / Accent Colour' },
          ].map(({ key, label }) => (
            <div key={key}>
              <label className="label">{label}</label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={localSettings[key] || '#1E3A5F'}
                  onChange={e => set(key, e.target.value)}
                  className="w-10 h-9 rounded border border-slate-300 cursor-pointer p-0.5"
                />
                <input
                  type="text"
                  value={localSettings[key] || ''}
                  onChange={e => set(key, e.target.value)}
                  className="input flex-1 font-mono text-sm"
                  placeholder="#1E3A5F"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{key}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Finance ──────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
          <Shield size={16} className="text-navy" />
          <h3 className="font-display text-base text-navy">Finance & Tax</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { key: 'payment.currency',        label: 'Currency Code (e.g. MWK)' },
            { key: 'payment.currency_symbol', label: 'Currency Symbol (e.g. K)' },
            { key: 'payment.tax_threshold',   label: 'PAYE Tax Threshold (MWK)', type: 'number' },
            { key: 'payment.tax_rate',        label: 'PAYE Tax Rate (e.g. 0.10 = 10%)', type: 'number' },
          ].map(({ key, label, type }) => (
            <div key={key}>
              <Input
                label={label}
                type={type || 'text'}
                value={localSettings[key] || ''}
                onChange={e => set(key, e.target.value)}
                step={type === 'number' ? 'any' : undefined}
              />
              <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{key}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Security ─────────────────────────────────────────── */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
          <Shield size={16} className="text-navy" />
          <h3 className="font-display text-base text-navy">Security</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { key: 'security.default_user_password', label: 'Default Password for New Users', type: 'text' },
            { key: 'account.max_failed_logins', label: 'Max Failed Logins Before Lock', type: 'number' },
            { key: 'account.session_hours',     label: 'Session Length (hours)',         type: 'number' },
          ].map(({ key, label, type }) => (
            <div key={key}>
              <Input
                label={label}
                type={type || 'text'}
                value={localSettings[key] || ''}
                onChange={e => set(key, e.target.value)}
                hint={key === 'security.default_user_password'
                  ? 'Assigned when creating or resetting user passwords. Users must change on first login.'
                  : undefined}
              />
              <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{key}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Floating save bar at bottom when changed */}
      {changed && (
        <div className="sticky bottom-4 flex justify-end">
          <div className="bg-navy text-white rounded-xl shadow-xl px-5 py-3 flex items-center gap-4 text-sm">
            <span className="text-white/80">You have unsaved changes</span>
            <Button
              variant="secondary"
              className="bg-white text-navy border-0 hover:bg-white/90"
              icon={<Save size={13} />}
              loading={saveMutation.isPending}
              onClick={handleSave}
            >
              Save Now
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
