import { useState, type FormEvent } from 'react';
import { UserPlus } from 'lucide-react';
import { addStaff, listStaff, setStaffActive } from '../../api/staffApi';
import { listTrainers } from '../../api/trainersApi';
import { useAuth } from '../../auth/AuthContext';
import { ROLE_LABEL } from '../../auth/RequireRole';
import { DataTable, type Column } from '../../components/DataTable';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { ErrorNote, Loading, PageHeader } from '../../components/ui';
import { DEMO_PASSWORD } from '../../config';
import { useAsync } from '../../hooks/useAsync';
import type { Role, StaffAccount } from '../../types';

type StaffRole = Exclude<Role, 'member'>;

export default function AdminStaff() {
  const toast = useToast();
  const { user } = useAuth();
  const { data, error, reload } = useAsync(listStaff, []);
  const trainers = useAsync(() => listTrainers({ includeInactive: true }), []);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('receptionist');
  const [trainerId, setTrainerId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await addStaff({ full_name: name, email, role, trainer_id: role === 'trainer' ? Number(trainerId) || undefined : undefined });
      toast.success('Account created.');
      setOpen(false);
      setName('');
      setEmail('');
      setTrainerId('');
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not create the account.');
    }
  };

  const toggle = async (u: StaffAccount) => {
    try {
      await setStaffActive(u.user_id, !u.is_active);
      toast.success(`${u.full_name} is now ${u.is_active ? 'inactive' : 'active'}.`);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update the account.');
    }
  };

  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading />;

  const columns: Column<StaffAccount>[] = [
    { key: 'name', header: 'Name', sort: (u) => u.full_name, render: (u) => <b>{u.full_name}{u.user_id === user?.user_id && <span className="ml-2 text-xs font-normal text-ink/50">(you)</span>}</b> },
    { key: 'email', header: 'Login email', sort: (u) => u.email, render: (u) => u.email },
    { key: 'role', header: 'Role', sort: (u) => u.role, render: (u) => ROLE_LABEL[u.role] },
    {
      key: 'active',
      header: 'Status',
      sort: (u) => (u.is_active ? 1 : 0),
      render: (u) => (
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${u.is_active ? 'border-mint bg-mint-soft text-mint-dark' : 'border-slate-300 bg-slate-100 text-slate-600'}`}>
          {u.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: 'act',
      header: '',
      render: (u) => (
        <div className="flex justify-end">
          <button className={u.is_active ? 'btn-danger btn-sm' : 'btn-secondary btn-sm'} onClick={() => toggle(u)} disabled={u.user_id === user?.user_id}>
            {u.is_active ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Staff accounts"
        subtitle="Receptionist, trainer and admin logins. Accounts are deactivated, never deleted."
        actions={
          <button
            className="btn-primary"
            onClick={() => {
              setFormError(null);
              setOpen(true);
            }}
          >
            <UserPlus className="h-4 w-4" /> Add account
          </button>
        }
      />
      <DataTable rows={data} columns={columns} rowKey={(u) => u.user_id} />

      <Modal
        open={open}
        title="Add staff account"
        onClose={() => setOpen(false)}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" form="staff-form">
              Create account
            </button>
          </>
        }
      >
        <form id="staff-form" onSubmit={submit} className="space-y-4">
          <div>
            <label className="label" htmlFor="st-name">
              Full name
            </label>
            <input id="st-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="st-email">
              Login email
            </label>
            <input id="st-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="st-role">
              Role
            </label>
            <select id="st-role" className="input" value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
              <option value="receptionist">Receptionist</option>
              <option value="trainer">Trainer</option>
              <option value="admin">Admin / Manager</option>
            </select>
          </div>
          {role === 'trainer' && (
            <div>
              <label className="label" htmlFor="st-trainer">
                Trainer profile
              </label>
              <select id="st-trainer" className="input" value={trainerId} onChange={(e) => setTrainerId(e.target.value)} required>
                <option value="">Choose…</option>
                {trainers.data?.map((t) => (
                  <option key={t.trainer_id} value={t.trainer_id}>
                    {t.full_name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <p className="text-xs text-ink/60">Demo only: new accounts get the password “{DEMO_PASSWORD}”.</p>
          {formError && <ErrorNote message={formError} />}
        </form>
      </Modal>
    </div>
  );
}
