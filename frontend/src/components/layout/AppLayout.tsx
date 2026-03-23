import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

export default function AppLayout() {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <div className="flex-1 ml-64 flex flex-col min-h-screen">
        <TopBar />
        <main className="flex-1 p-6 page-enter">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
