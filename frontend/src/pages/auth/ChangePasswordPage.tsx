import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, ShieldCheck, AlertTriangle } from 'lucide-react';
import api from '../../config/api';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';

export default function ChangePasswordPage() {
  const navigate      = useNavigate();
  const { user, setAuth, token } = useAuthStore();
  const isMandatory   = user?.mustChangePwd;

  const [form, setForm] = useState({
    currentPassword: '',
    newPassword:     '',
    confirmPassword: '',
  });
  const [show, setShow]     = useState({ current: false, newPwd: false, confirm: false });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors]   = useState<Record<string, string>>({});

  function validate() {
    const e: Record<string, string> = {};
    if (!form.currentPassword) e.currentPassword = 'Current password is required';
    if (!form.newPassword)     e.newPassword = 'New password is required';
    else if (form.newPassword.length < 8) e.newPassword = 'Password must be at least 8 characters';
    else if (!/[A-Z]/.test(form.newPassword)) e.newPassword = 'Must contain at least one uppercase letter';
    else if (!/[0-9]/.test(form.newPassword)) e.newPassword = 'Must contain at least one number';
    else if (!/[^A-Za-z0-9]/.test(form.newPassword)) e.newPassword = 'Must contain at least one special character (@#$%&*)';
    if (form.newPassword !== form.confirmPassword) e.confirmPassword = 'Passwords do not match';
    if (form.newPassword === form.currentPassword) e.newPassword = 'New password must be different from current password';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: form.currentPassword,
        newPassword:     form.newPassword,
      });
      toast.success('Password changed successfully');
      // Update the stored user to clear mustChangePwd
      if (user && token) {
        setAuth({ ...user, mustChangePwd: false }, token);
      }
      navigate('/');
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to change password';
      setErrors({ currentPassword: msg });
    } finally {
      setLoading(false);
    }
  }

  const strength = (() => {
    const p = form.newPassword;
    if (!p) return 0;
    let s = 0;
    if (p.length >= 8)                s++;
    if (p.length >= 12)               s++;
    if (/[A-Z]/.test(p))             s++;
    if (/[0-9]/.test(p))             s++;
    if (/[^A-Za-z0-9]/.test(p))     s++;
    return s;
  })();

  const strengthLabel = ['', 'Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'][strength];
  const strengthColor = ['', 'bg-red-500', 'bg-orange-400', 'bg-yellow-400', 'bg-blue-500', 'bg-green-500'][strength];

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-navy rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <ShieldCheck className="text-gold" size={24} />
          </div>
          <h1 className="font-display text-2xl text-navy">
            {isMandatory ? 'Set Your Password' : 'Change Password'}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {isMandatory
              ? `Welcome, ${user?.fullName?.split(' ')[0]}. You must set a new password before continuing.`
              : 'Update your account password'}
          </p>
        </div>

        {/* Mandatory notice */}
        {isMandatory && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 text-sm text-amber-700">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Password change required</p>
              <p className="text-xs mt-0.5">
                Your account was created with a temporary password. You must set a personal password to continue.
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="card space-y-4">

          {/* Current password */}
          <div>
            <label className="label">
              {isMandatory ? 'Temporary Password (given by admin)' : 'Current Password'}
            </label>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type={show.current ? 'text' : 'password'}
                value={form.currentPassword}
                onChange={e => setForm(f => ({ ...f, currentPassword: e.target.value }))}
                className="input pl-8 pr-10"
                placeholder={isMandatory ? 'Enter the temporary password' : 'Enter current password'}
                autoComplete="current-password"
              />
              <button type="button" onClick={() => setShow(s => ({ ...s, current: !s.current }))}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {show.current ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {errors.currentPassword && (
              <p className="text-xs text-red-500 mt-1">{errors.currentPassword}</p>
            )}
          </div>

          {/* New password */}
          <div>
            <label className="label">New Password</label>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type={show.newPwd ? 'text' : 'password'}
                value={form.newPassword}
                onChange={e => setForm(f => ({ ...f, newPassword: e.target.value }))}
                className="input pl-8 pr-10"
                placeholder="Enter new password"
                autoComplete="new-password"
              />
              <button type="button" onClick={() => setShow(s => ({ ...s, newPwd: !s.newPwd }))}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {show.newPwd ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {/* Strength bar */}
            {form.newPassword && (
              <div className="mt-2">
                <div className="flex gap-1 h-1.5">
                  {[1,2,3,4,5].map(i => (
                    <div key={i} className={`flex-1 rounded-full transition-colors ${
                      i <= strength ? strengthColor : 'bg-slate-200'
                    }`} />
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-1">{strengthLabel}</p>
              </div>
            )}
            {errors.newPassword && (
              <p className="text-xs text-red-500 mt-1">{errors.newPassword}</p>
            )}
            <div className="mt-1.5 text-[10px] text-slate-400 space-y-0.5">
              <p>Password must be at least 8 characters with:</p>
              <p className={form.newPassword && /[A-Z]/.test(form.newPassword) ? 'text-green-500' : ''}>
                {form.newPassword && /[A-Z]/.test(form.newPassword) ? '✓' : '·'} One uppercase letter
              </p>
              <p className={form.newPassword && /[0-9]/.test(form.newPassword) ? 'text-green-500' : ''}>
                {form.newPassword && /[0-9]/.test(form.newPassword) ? '✓' : '·'} One number
              </p>
              <p className={form.newPassword && /[^A-Za-z0-9]/.test(form.newPassword) ? 'text-green-500' : ''}>
                {form.newPassword && /[^A-Za-z0-9]/.test(form.newPassword) ? '✓' : '·'} One special character
              </p>
            </div>
          </div>

          {/* Confirm password */}
          <div>
            <label className="label">Confirm New Password</label>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type={show.confirm ? 'text' : 'password'}
                value={form.confirmPassword}
                onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
                className="input pl-8 pr-10"
                placeholder="Repeat new password"
                autoComplete="new-password"
              />
              <button type="button" onClick={() => setShow(s => ({ ...s, confirm: !s.confirm }))}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {show.confirm ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {form.confirmPassword && form.newPassword === form.confirmPassword && (
              <p className="text-xs text-green-500 mt-1">✓ Passwords match</p>
            )}
            {errors.confirmPassword && (
              <p className="text-xs text-red-500 mt-1">{errors.confirmPassword}</p>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            {!isMandatory && (
              <button type="button" onClick={() => navigate(-1)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
                Cancel
              </button>
            )}
            <button type="submit" disabled={loading}
              className={`btn-primary py-2.5 justify-center ${isMandatory ? 'w-full' : 'flex-1'}`}>
              {loading
                ? <span className="flex items-center gap-2 justify-center">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Saving...
                  </span>
                : 'Set New Password'}
            </button>
          </div>
        </form>

        <p className="text-center text-xs text-slate-400 mt-4">
          Your new password is encrypted and stored securely.
        </p>
      </div>
    </div>
  );
}
