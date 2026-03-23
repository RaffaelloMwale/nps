import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, CreditCard, Gift, AlertCircle,
  FileBarChart, Settings, LogOut, Skull, ShieldCheck,
  KeyRound, ChevronUp, User
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import api from '../../config/api';
import toast from 'react-hot-toast';
import { useNavigate as useNav } from 'react-router-dom';

export default function Sidebar() {
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();
  const isAdmin  = user?.role === 'admin';
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  async function handleLogout() {
    try { await api.post('/auth/logout'); } catch {}
    clearAuth();
    navigate('/login');
    toast.success('Logged out');
  }

  function handleChangePassword() {
    setMenuOpen(false);
    navigate('/change-password');
  }

  const navLinks = [
    { to: '/',          icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/pensioners',icon: Users,           label: 'Pensioners' },
    { to: '/payments',  icon: CreditCard,      label: 'Monthly Payments' },
    { to: '/gratuity',  icon: Gift,            label: 'Gratuity' },
    { to: '/arrears',   icon: AlertCircle,     label: 'Arrears' },
    { to: '/deceased',  icon: Skull,           label: 'BTU' },
    { to: '/reports',   icon: FileBarChart,    label: 'Reports' },
  ];

  const adminLinks = [
    { to: '/admin',    icon: ShieldCheck, label: 'User Management' },
    { to: '/settings', icon: Settings,    label: 'System Settings' },
  ];

  const initials = user?.fullName
    ?.split(' ')
    .map((n: string) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'U';

  return (
    <aside className="w-64 bg-navy min-h-screen flex flex-col fixed left-0 top-0 bottom-0 z-30">

      {/* Logo */}
      <div className="px-6 py-5 border-b border-white/10">
        <h1 className="font-display text-white text-lg leading-tight">
          National<br />Pension System
        </h1>
        <p className="text-white/50 text-xs mt-1">Government of Malawi</p>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navLinks.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          >
            <Icon size={15} />
            <span>{label}</span>
          </NavLink>
        ))}

        {isAdmin && (
          <>
            <div className="pt-4 pb-1 px-4">
              <p className="text-white/30 text-xs font-semibold uppercase tracking-widest">Administration</p>
            </div>
            {adminLinks.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              >
                <Icon size={15} />
                <span>{label}</span>
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/* User section — clickable to open menu */}
      <div className="px-3 py-3 border-t border-white/10" ref={menuRef}>

        {/* Pop-up menu — appears above the user button */}
        {menuOpen && (
          <div className="mb-2 bg-white rounded-xl shadow-xl overflow-hidden">
            {/* User info header */}
            <div className="px-4 py-3 bg-navy/5 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-navy flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="text-slate-800 text-xs font-semibold truncate">{user?.fullName}</p>
                  <p className="text-slate-400 text-[10px] capitalize">{user?.role?.replace(/_/g, ' ')}</p>
                </div>
              </div>
            </div>

            {/* Menu items */}
            <button
              onClick={handleChangePassword}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-slate-700
                         hover:bg-blue-50 hover:text-navy transition-colors text-left"
            >
              <KeyRound size={14} className="text-slate-400" />
              <div>
                <p className="font-semibold">Change Password</p>
                <p className="text-[10px] text-slate-400">Update your account password</p>
              </div>
            </button>

            <div className="border-t border-slate-100" />

            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-red-600
                         hover:bg-red-50 transition-colors text-left"
            >
              <LogOut size={14} />
              <div>
                <p className="font-semibold">Sign Out</p>
                <p className="text-[10px] text-red-400">End your session</p>
              </div>
            </button>
          </div>
        )}

        {/* Clickable user button */}
        <button
          onClick={() => setMenuOpen(v => !v)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all
                      ${menuOpen
                        ? 'bg-white/15 ring-1 ring-white/30'
                        : 'hover:bg-white/10'
                      }`}
        >
          {/* Avatar */}
          <div className="w-8 h-8 rounded-full bg-gold flex items-center justify-center
                          text-navy font-bold text-xs flex-shrink-0">
            {initials}
          </div>

          {/* Name + role */}
          <div className="flex-1 min-w-0 text-left">
            <p className="text-white text-xs font-semibold truncate">{user?.fullName}</p>
            <p className="text-white/50 text-[10px] capitalize">{user?.role?.replace(/_/g, ' ')}</p>
          </div>

          {/* Chevron indicator */}
          <ChevronUp
            size={14}
            className={`text-white/40 flex-shrink-0 transition-transform duration-200 ${
              menuOpen ? 'rotate-0' : 'rotate-180'
            }`}
          />
        </button>
      </div>
    </aside>
  );
}
