import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { listAllHalls, sessionCounts } from '../../api/adminApi';
import { createHall, setHallActive, updateHall } from '../../api/hallsApi';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataTable, type Column } from '../../components/DataTable';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { ErrorNote, Loading, PageHeader } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { useT } from '../../i18n';
import { msg } from '../../i18n/messages';
import type { Hall } from '../../types';
import { kzt } from '../../utils/format';
import { ActiveChip } from './common';

/** Halls and studios: add, edit, activate / deactivate. Nothing is ever deleted. */
export default function AdminHalls() {
  const { t } = useT();
  const toast = useToast();
  const list = useAsync(listAllHalls, []);
  const counts = useAsync(sessionCounts, []);
  const [editing, setEditing] = useState<Hall | 'new' | null>(null);
  const [toggle, setToggle] = useState<Hall | null>(null);
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('');
  const [rate, setRate] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const open = (h: Hall | 'new') => {
    setEditing(h);
    setFormError(null);
    setName(h === 'new' ? '' : h.hall_name);
    setCapacity(h === 'new' ? '' : String(h.capacity));
    setRate(h === 'new' ? '' : String(h.hourly_rate_kzt));
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const input = { hall_name: name, capacity: Number(capacity), hourly_rate_kzt: Number(rate) };
    try {
      if (editing === 'new') await createHall(input);
      else if (editing) await updateHall(editing.hall_id, input);
      toast.success(t('adm.hl.saved'));
      setEditing(null);
      list.reload();
    } catch (err) {
      setFormError(msg(err instanceof Error ? err.message : t('common.saveFailed')));
    }
  };

  if (list.error) return <ErrorNote message={msg(list.error)} />;
  if (!list.data) return <Loading />;

  const columns: Column<Hall>[] = [
    { key: 'name', header: t('adm.hl.hall'), sort: (h) => h.hall_name, render: (h) => <b>{h.hall_name}</b> },
    { key: 'cap', header: t('adm.hl.capacity'), sort: (h) => h.capacity, render: (h) => t('adm.hl.people', { n: h.capacity }) },
    { key: 'rate', header: t('adm.hl.rate'), sort: (h) => h.hourly_rate_kzt, render: (h) => kzt(h.hourly_rate_kzt) },
    { key: 'held', header: t('adm.hl.rentals'), sort: (h) => counts.data?.halls[h.hall_id] ?? 0, render: (h) => counts.data?.halls[h.hall_id] ?? 0 },
    { key: 'active', header: t('adm.bk.status'), sort: (h) => (h.is_active ? 1 : 0), render: (h) => <ActiveChip active={h.is_active} /> },
    {
      key: 'act',
      header: '',
      render: (h) => (
        <div className="flex justify-end gap-2">
          <button className="btn-ghost btn-sm" onClick={() => open(h)}>
            {t('adm.edit')}
          </button>
          <button className={h.is_active ? 'btn-danger btn-sm' : 'btn-primary btn-sm'} onClick={() => setToggle(h)}>
            {h.is_active ? t('adm.deactivate') : t('adm.activate')}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('adm.nav.halls')}
        subtitle={t('adm.hl.sub')}
        actions={
          <button className="btn-primary" onClick={() => open('new')}>
            <Plus className="h-4 w-4" /> {t('adm.hl.add')}
          </button>
        }
      />
      <DataTable rows={list.data} columns={columns} rowKey={(h) => h.hall_id} />
      <p className="text-xs text-ink/60">{t('adm.noDelete')}</p>

      <Modal
        open={editing !== null}
        title={editing === 'new' ? t('adm.hl.add') : t('adm.hl.edit')}
        onClose={() => setEditing(null)}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setEditing(null)}>
              {t('adm.cancel')}
            </button>
            <button className="btn-primary" form="hall-form">
              {t('adm.save')}
            </button>
          </>
        }
      >
        <form id="hall-form" onSubmit={save} className="space-y-4">
          <div>
            <label className="label" htmlFor="h-name">
              {t('adm.hl.name')}
            </label>
            <input id="h-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="h-cap">
                {t('adm.hl.capacityLabel')}
              </label>
              <input id="h-cap" type="number" min={1} max={200} className="input" value={capacity} onChange={(e) => setCapacity(e.target.value)} required />
            </div>
            <div>
              <label className="label" htmlFor="h-rate">
                {t('adm.hl.rateLabel')}
              </label>
              <input id="h-rate" type="number" min={100} step={100} className="input" value={rate} onChange={(e) => setRate(e.target.value)} required />
            </div>
          </div>
          {formError && <ErrorNote message={formError} />}
        </form>
      </Modal>

      <ConfirmDialog
        open={!!toggle}
        danger={!!toggle?.is_active}
        title={toggle?.is_active ? t('adm.hl.deactivateQ') : t('adm.hl.activateQ')}
        message={toggle?.is_active ? t('adm.hl.deactivateText', { name: toggle?.hall_name ?? '' }) : t('adm.hl.activateText', { name: toggle?.hall_name ?? '' })}
        confirmLabel={toggle?.is_active ? t('adm.deactivate') : t('adm.activate')}
        onCancel={() => setToggle(null)}
        onConfirm={async () => {
          if (!toggle) return;
          await setHallActive(toggle.hall_id, !toggle.is_active);
          toast.success(t(toggle.is_active ? 'adm.hl.nowInactive' : 'adm.hl.nowActive', { name: toggle.hall_name }));
          setToggle(null);
          list.reload();
        }}
      />
    </div>
  );
}
