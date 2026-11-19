import { useState, type FormEvent } from 'react';
import { UserPlus } from 'lucide-react';
import { listAllTrainers } from '../../api/adminApi';
import { addStaff, listStaff, setStaffActive } from '../../api/staffApi';
import { useAuth } from '../../auth/AuthContext';
import { ROLE_LABEL } from '../../auth/RequireRole';
import { DataTable, type Column } from '../../components/DataTable';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { ErrorNote, Loading, PageHeader } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { useT } from '../../i18n';
import { msg } from '../../i18n/messages';
import type { StaffAccount } from '../../types';
import { ActiveChip } from './common';

type StaffRole = 'receptionist' | 'trainer'; // the one admin account is never created here

/** Staff logins: the single admin, receptionists and trainers. Accounts are deactivated, never deleted. */
export default function AdminStaff() {
  const { t } = useT();
  const toast = useToast();
  const { user } = useAuth();
  const { data, error, reload } = useAsync(listStaff, []);
  const trainers = useAsync(listAllTrainers, []);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('receptionist');
  const [trainerId, setTrainerId] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await addStaff({ full_name: name, email, role, password, trainer_id: role === 'trainer' ? Number(trainerId) || undefined : undefined });
      toast.success(t('adm.st.created'));
      setOpen(false);
      setName('');
      setEmail('');
      setTrainerId('');
      setPassword('');
      reload();
    } catch (err) {
      setFormError(msg(err instanceof Error ? err.message : t('common.saveFailed')));
    }
  };

  const toggle = async (u: StaffAccount) => {
    try {
      await setStaffActive(u.user_id, !u.is_active);
      toast.success(t(u.is_active ? 'adm.st.nowInactive' : 'adm.st.nowActive', { name: u.full_name }));
      reload();
    } catch (err) {
      toast.error(msg(err instanceof Error ? err.message : t('common.saveFailed')));
    }
  };

  if (error) return <ErrorNote message={msg(error)} />;
  if (!data) return <Loading />;

  const columns: Column<StaffAccount>[] = [
    {
      key: 'name',
      header: t('adm.st.name'),
      sort: (u) => u.full_name,
      render: (u) => (
        <b>
          {u.full_name}
          {u.user_id === user?.user_id && <span className="ml-2 text-xs font-normal text-ink/50">({t('adm.st.you')})</span>}
        </b>
      ),
    },
    { key: 'email', header: t('adm.st.login'), sort: (u) => u.email, render: (u) => u.email },
    { key: 'role', header: t('adm.st.role'), sort: (u) => u.role, render: (u) => ROLE_LABEL[u.role] },
    { key: 'active', header: t('adm.bk.status'), sort: (u) => (u.is_active ? 1 : 0), render: (u) => <ActiveChip active={u.is_active} /> },
    {
      key: 'act',
      header: '',
      render: (u) => (
        <div className="flex justify-end">
          <button className={u.is_active ? 'btn-danger btn-sm' : 'btn-primary btn-sm'} onClick={() => void toggle(u)} disabled={u.user_id === user?.user_id || u.role === 'admin'}>
            {u.is_active ? t('adm.deactivate') : t('adm.activate')}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('adm.nav.staff')}
        subtitle={t('adm.st.sub')}
        actions={
          <button
            className="btn-primary"
            onClick={() => {
              setFormError(null);
              setOpen(true);
            }}
          >
            <UserPlus className="h-4 w-4" /> {t('adm.st.add')}
          </button>
        }
      />
      <DataTable rows={data} columns={columns} rowKey={(u) => u.user_id} />
      <p className="text-xs text-ink/60">{t('adm.noDelete')}</p>

      <Modal
        open={open}
        title={t('adm.st.addTitle')}
        onClose={() => setOpen(false)}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setOpen(false)}>
              {t('adm.cancel')}
            </button>
            <button className="btn-primary" form="staff-form">
              {t('adm.st.create')}
            </button>
          </>
        }
      >
        <form id="staff-form" onSubmit={submit} className="space-y-4">
          <div>
            <label className="label" htmlFor="st-name">
              {t('adm.st.name')}
            </label>
            <input id="st-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="st-email">
              {t('adm.st.login')}
            </label>
            <input id="st-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="st-role">
              {t('adm.st.role')}
            </label>
            <select id="st-role" className="input" value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
              <option value="receptionist">{ROLE_LABEL.receptionist}</option>
              <option value="trainer">{ROLE_LABEL.trainer}</option>
            </select>
          </div>
          {role === 'trainer' && (
            <div>
              <label className="label" htmlFor="st-trainer">
                {t('adm.st.profile')}
              </label>
              <select id="st-trainer" className="input" value={trainerId} onChange={(e) => setTrainerId(e.target.value)} required>
                <option value="">{t('adm.st.choose')}</option>
                {trainers.data?.map((x) => (
                  <option key={x.trainer_id} value={x.trainer_id}>
                    {x.full_name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="label" htmlFor="st-password">
              {t('adm.st.password')}
            </label>
            <input
              id="st-password"
              type="password"
              autoComplete="new-password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              maxLength={72}
              required
            />
            <p className="mt-1 text-xs text-ink/60">{t('adm.st.passwordNote')}</p>
          </div>
          {formError && <ErrorNote message={formError} />}
        </form>
      </Modal>
    </div>
  );
}
