import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { createTrainer, listTrainers, setTrainerActive, updateTrainer } from '../../api/trainersApi';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataTable, type Column } from '../../components/DataTable';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { ErrorNote, Loading, PageHeader } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import type { Trainer } from '../../types';
import { kzt } from '../../utils/format';

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${active ? 'border-mint bg-mint-soft text-mint-dark' : 'border-slate-300 bg-slate-100 text-slate-600'}`}>
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

export default function AdminTrainers() {
  const toast = useToast();
  const { data, error, reload } = useAsync(() => listTrainers({ includeInactive: true }), []);
  const [editing, setEditing] = useState<Trainer | 'new' | null>(null);
  const [toggle, setToggle] = useState<Trainer | null>(null);
  const [name, setName] = useState('');
  const [spec, setSpec] = useState('');
  const [price, setPrice] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const open = (t: Trainer | 'new') => {
    setEditing(t);
    setFormError(null);
    setName(t === 'new' ? '' : t.full_name);
    setSpec(t === 'new' ? '' : t.specialization);
    setPrice(t === 'new' ? '' : String(t.session_price_kzt));
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const input = { full_name: name, specialization: spec, session_price_kzt: Number(price) };
    try {
      if (editing === 'new') await createTrainer(input);
      else if (editing) await updateTrainer(editing.trainer_id, input);
      toast.success('Trainer saved.');
      setEditing(null);
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save.');
    }
  };

  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading />;

  const columns: Column<Trainer>[] = [
    { key: 'name', header: 'Trainer', sort: (t) => t.full_name, render: (t) => <b>{t.full_name}</b> },
    { key: 'spec', header: 'Specialization', sort: (t) => t.specialization, render: (t) => t.specialization },
    { key: 'price', header: 'Session price', sort: (t) => t.session_price_kzt, render: (t) => kzt(t.session_price_kzt) },
    { key: 'active', header: 'Status', sort: (t) => (t.is_active ? 1 : 0), render: (t) => <ActiveBadge active={t.is_active} /> },
    {
      key: 'act',
      header: '',
      render: (t) => (
        <div className="flex justify-end gap-2">
          <button className="btn-ghost btn-sm" onClick={() => open(t)}>
            Edit
          </button>
          <button className={t.is_active ? 'btn-danger btn-sm' : 'btn-secondary btn-sm'} onClick={() => setToggle(t)}>
            {t.is_active ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Trainers"
        subtitle="Trainers are never deleted - only deactivated. Price changes affect new bookings only."
        actions={
          <button className="btn-primary" onClick={() => open('new')}>
            <Plus className="h-4 w-4" /> Add trainer
          </button>
        }
      />
      <DataTable rows={data} columns={columns} rowKey={(t) => t.trainer_id} />

      <Modal
        open={editing !== null}
        title={editing === 'new' ? 'Add trainer' : 'Edit trainer'}
        onClose={() => setEditing(null)}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="btn-primary" form="trainer-form">
              Save
            </button>
          </>
        }
      >
        <form id="trainer-form" onSubmit={save} className="space-y-4">
          <div>
            <label className="label" htmlFor="tr-name">
              Full name
            </label>
            <input id="tr-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="tr-spec">
              Specialization
            </label>
            <input id="tr-spec" className="input" value={spec} onChange={(e) => setSpec(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="tr-price">
              Session price (₸)
            </label>
            <input id="tr-price" type="number" min={1} step={500} className="input" value={price} onChange={(e) => setPrice(e.target.value)} required />
          </div>
          {formError && <ErrorNote message={formError} />}
        </form>
      </Modal>

      <ConfirmDialog
        open={!!toggle}
        danger={!!toggle?.is_active}
        title={toggle?.is_active ? 'Deactivate trainer?' : 'Activate trainer?'}
        message={
          toggle?.is_active
            ? `${toggle.full_name} will disappear from booking pages. Existing bookings stay as they are.`
            : `${toggle?.full_name} will become bookable again.`
        }
        confirmLabel={toggle?.is_active ? 'Deactivate' : 'Activate'}
        onCancel={() => setToggle(null)}
        onConfirm={async () => {
          if (!toggle) return;
          await setTrainerActive(toggle.trainer_id, !toggle.is_active);
          toast.success(`${toggle.full_name} is now ${toggle.is_active ? 'inactive' : 'active'}.`);
          setToggle(null);
          reload();
        }}
      />
    </div>
  );
}
