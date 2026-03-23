import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Lock, User, Eye, EyeOff } from 'lucide-react';
import api from '../../config/api';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';

const schema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormData) {
    setLoading(true);
    try {
      const res = await api.post('/auth/login', data);
      const { accessToken, user } = res.data.data;
      setAuth(user, accessToken);
      toast.success(`Welcome, ${user.fullName.split(' ')[0]}!`);
      if (user.mustChangePwd) {
        navigate('/change-password');
      } else {
        navigate('/');
      }
    } catch (err: any) {
      // Error already shown by interceptor
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-navy flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-20 left-20 w-64 h-64 rounded-full border-4 border-white" />
          <div className="absolute bottom-20 right-10 w-96 h-96 rounded-full border-2 border-white" />
          <div className="absolute top-1/2 left-1/3 w-32 h-32 rounded-full border-2 border-white" />
        </div>
        <div>
          <h1 className="font-display text-white text-3xl font-bold leading-tight">
            National Pension<br />System
          </h1>
          <p className="text-white/60 mt-2 text-sm">Government of Malawi · Pension Administration Division</p>
        </div>
        <div className="space-y-4">
          {['Secure pension record management','Monthly automated payment runs','Full gratuity lifecycle tracking','Excel reports & live dashboard'].map((f, i) => (
            <div key={i} className="flex items-center gap-3 text-white/80 text-sm">
              <div className="w-1.5 h-1.5 rounded-full bg-gold" />
              {f}
            </div>
          ))}
        </div>
        <p className="text-white/30 text-xs">© {new Date().getFullYear()} Ministry of Finance, Government of Malawi</p>
      </div>

      {/* Right panel - login form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-50">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-14 h-14 bg-navy rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <Lock className="text-gold" size={24} />
            </div>
            <h2 className="font-display text-2xl text-navy">Sign In</h2>
            <p className="text-slate-500 text-sm mt-1">Enter your credentials to access NPS</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="card space-y-4">
            {/* Username */}
            <div>
              <label className="label">Username</label>
              <div className="relative">
                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  {...register('username')}
                  className="input pl-8"
                  placeholder="Enter your username"
                  autoComplete="username"
                />
              </div>
              {errors.username && <p className="text-xs text-red-500 mt-1">{errors.username.message}</p>}
            </div>

            {/* Password */}
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  {...register('password')}
                  type={showPwd ? 'text' : 'password'}
                  className="input pl-8 pr-10"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
                <button type="button" onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-2.5 mt-2"
            >
              {loading ? (
                <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Signing in...</span>
              ) : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-xs text-slate-400 mt-4">
            Authorised personnel only. All access is monitored and logged.
          </p>
        </div>
      </div>
    </div>
  );
}
