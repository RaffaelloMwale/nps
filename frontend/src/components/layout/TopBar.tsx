import { Bell, Calendar } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { formatDate } from '../../utils/formatters';

export default function TopBar() {
  const { user } = useAuthStore();

  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 sticky top-0 z-20">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Calendar size={13} />
        <span>{formatDate(new Date())}</span>
      </div>
      <div className="flex items-center gap-3">
        <button className="relative p-2 text-slate-500 hover:text-navy hover:bg-slate-100 rounded-lg transition-colors">
          <Bell size={16} />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        </button>
        <div className="text-xs text-slate-600">
          Welcome, <span className="font-semibold text-navy">{user?.fullName?.split(' ')[0]}</span>
        </div>
      </div>
    </header>
  );
}
