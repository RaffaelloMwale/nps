import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, RotateCcw, Lock, Unlock, ShieldCheck } from 'lucide-react';
import api from '../../config/api';
import { PageHeader, Button, StatusBadge, Spinner, Modal, Input, Select } from '../../components/ui';
import { formatDateTime } from '../../utils/formatters';
import toast from 'react-hot-toast';

export default function AdminPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', email: '', fullName: '', role: 'creator', employeeNo: '' });

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings').then(r => r.data.data),
  });
  const defaultPassword = settingsData?.['security.default_user_password'] || 'Temp@12345';

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users', { params: { limit: 100 } }).then(r => r.data),
  });

  const users = usersData?.data || [];

  const createMutation = useMutation({
    mutationFn: (data: typeof newUser) => api.post('/users', data),
    onSuccess: (res) => {
      toast.success(`User created. Temp password: ${res.data.data.tempPassword}`);
      setShowCreate(false);
      setNewUser({ username: '', email: '', fullName: '', role: 'creator', employeeNo: '' });
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to create user');
    }
  });

  const resetMutation = useMutation({
    mutationFn: (userId: string) => api.post(`/users/${userId}/reset-password`),
    onSuccess: (res) => toast.success(`Password reset to: ${res.data.data.tempPassword}`),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, status, fullName, role }: any) =>
      api.put(`/users/${id}`, { fullName, role, status: status === 'active' ? 'inactive' : 'active' }),
    onSuccess: () => { toast.success('User status updated'); qc.invalidateQueries({ queryKey: ['users'] }); },
  });

  const unlockMutation = useMutation({
    mutationFn: (userId: string) => api.post(`/users/${userId}/unlock`),
    onSuccess: () => { toast.success('Account unlocked'); qc.invalidateQueries({ queryKey: ['users'] }); },
  });

  const ROLE_COLORS: Record<string, string> = {
    admin: 'bg-purple-100 text-purple-700',
    creator: 'bg-blue-100 text-blue-700',
    approver_1: 'bg-amber-100 text-amber-700',
    approver_2: 'bg-green-100 text-green-700',
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="User Management"
        subtitle="Manage system user accounts and access roles"
        actions={
          <Button icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>Add User</Button>
        }
      />

      {/* Role legend */}
      <div className="card py-3 flex flex-wrap gap-4 text-xs">
        <span className="text-slate-500 font-semibold">Roles:</span>
        {[
          { role: 'admin',      desc: 'Full access — all modules' },
          { role: 'creator',    desc: 'Create records, submit for approval' },
          { role: 'approver_1', desc: 'First-level approval' },
          { role: 'approver_2', desc: 'Final approval + processing' },
        ].map(({ role, desc }) => (
          <div key={role} className="flex items-center gap-2">
            <span className={`badge ${ROLE_COLORS[role]} capitalize`}>{role.replace('_',' ')}</span>
            <span className="text-slate-400">{desc}</span>
          </div>
        ))}
      </div>

      {/* Users table */}
      <div className="card p-0">
        <div className="px-5 py-3 border-b border-slate-100">
          <p className="text-sm text-slate-500">{users.length} user{users.length !== 1 ? 's' : ''}</p>
        </div>
        {isLoading ? <Spinner /> : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Full Name</th>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last Login</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u: any) => (
                  <tr key={u.id}>
                    <td className="font-medium">{u.full_name}</td>
                    <td className="font-mono text-xs text-navy font-semibold">{u.username}</td>
                    <td className="text-xs text-slate-500">{u.email}</td>
                    <td>
                      <span className={`badge capitalize text-xs ${ROLE_COLORS[u.role] || 'bg-slate-100 text-slate-600'}`}>
                        {u.role?.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      <div className="flex flex-col gap-0.5">
                        <StatusBadge status={u.status} />
                        {u.locked_at && <span className="text-xs text-red-500">🔒 Locked</span>}
                        {u.must_change_pwd && <span className="text-xs text-amber-500">⚠ Must change pwd</span>}
                      </div>
                    </td>
                    <td className="text-xs text-slate-400">{u.last_login_at ? formatDateTime(u.last_login_at) : 'Never'}</td>
                    <td>
                      <div className="flex gap-1 flex-wrap">
                        {/* Toggle active/inactive */}
                        <button
                          onClick={() => toggleMutation.mutate({ id: u.id, status: u.status, fullName: u.full_name, role: u.role })}
                          className={`text-xs px-2 py-1 rounded font-medium transition-colors ${
                            u.status === 'active'
                              ? 'bg-red-50 text-red-600 hover:bg-red-100'
                              : 'bg-green-50 text-green-700 hover:bg-green-100'
                          }`}
                        >
                          {u.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                        {/* Unlock */}
                        {u.locked_at && (
                          <button
                            onClick={() => unlockMutation.mutate(u.id)}
                            className="text-xs px-2 py-1 rounded bg-amber-50 text-amber-700 hover:bg-amber-100 flex items-center gap-1"
                          >
                            <Unlock size={11} /> Unlock
                          </button>
                        )}
                        {/* Reset password */}
                        <button
                          onClick={() => resetMutation.mutate(u.id)}
                          className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center gap-1"
                        >
                          <RotateCcw size={11} /> Reset Pwd
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create User Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add New System User" size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Full Name *" value={newUser.fullName}
              onChange={e => setNewUser(u => ({ ...u, fullName: e.target.value }))} />
            <Input label="Employee No" value={newUser.employeeNo}
              onChange={e => setNewUser(u => ({ ...u, employeeNo: e.target.value }))} />
            <Input label="Username *" value={newUser.username}
              onChange={e => setNewUser(u => ({ ...u, username: e.target.value }))} />
            <Input label="Email *" type="email" value={newUser.email}
              onChange={e => setNewUser(u => ({ ...u, email: e.target.value }))} />
          </div>
          <Select
            label="Role *"
            value={newUser.role}
            onChange={e => setNewUser(u => ({ ...u, role: e.target.value }))}
            options={[
              { value: 'creator',    label: 'Creator — creates records and submits for approval' },
              { value: 'approver_1', label: 'Approver 1 — first-level approval' },
              { value: 'approver_2', label: 'Approver 2 — final approval and processing' },
              { value: 'admin',      label: 'Administrator — full access' },
            ]}
          />
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
            Temporary password <strong className="font-mono">{defaultPassword}</strong> will be assigned.
            User must change it on first login.
            <span className="block mt-1 text-amber-600">
              Change the default password in <a href="/settings" className="underline">System Settings → Security</a>.
            </span>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button icon={<ShieldCheck size={14} />} loading={createMutation.isPending}
              onClick={() => createMutation.mutate(newUser)}>
              Create User
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
