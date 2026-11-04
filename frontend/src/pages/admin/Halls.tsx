import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { createHall, listHalls, setHallActive, updateHall } from '../../api/hallsApi';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataTable, type Column } from '../../components/DataTable';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { ErrorNote, Loading, PageHeader } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import type { Hall } from '../../types';
import { kzt } from '../../utils/format';

export default function AdminHalls() {
  const toast = useToast();
  const { data, error, reload } = useAsync(() => listHalls({ includeInactive: true }), []);
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
      toast.success('Hall saved.');
      setEditing(null);
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save.');
    }
  };

  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading />;

  const columns: Column<Hall>[] = [
    { key: 'name', header: 'Hall', sort: (h) => h.hall_name, render: (h) => <b>{h.hall_name}</b> },
    { key: 'cap', header: 'Capacity', sort: (h) => h.capacity, render: (h) => `${h.capacity} people` },
    { key: 'rate', header: 'Hourly rate', sort: (h) => h.hourly_rate_kzt, render: (h) => kzt(h.hourly_rate_kzt) },
    {
      key: 'active',
      header: 'Status',
      sort: (h) => (h.is_active ? 1 : 0),
      render: (h) => (
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${h.is_active ? 'border-mint bg-mint-soft text-mint-dark' : 'border-slate-300 bg-slate-100 text-slate-600'}`}>
          {h.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: 'act',
      header: '',
      render: (h) => (
        <div className="flex justify-end gap-2">
          <button className="btn-ghost btn-sm" onClick={() => open(h)}>
            Edit
          </button>
          <button className={h.is_active ? 'btn-danger btn-sm' : 'btn-secondary btn-sm'} onClick={() => setToggle(h)}>
            {h.is_active ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Halls & studios"
        subtitle="Halls are never deleted - only deactivated."
        actions={
          <button className="btn-primary" onClick={() => open('new')}>
            <Plus className="h-4 w-4" /> Add hall
          </button>
        }
      />
      <DataTable rows={data} columns={columns} rowKey={(h) => h.hall_id} />

      <Modal
        open={editing !== null}
        title={editing === 'new' ? 'Add hall' : 'Edit hall'}
        onClose={() => setEditing(null)}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="btn-primary" form="hall-form">
              Save
            </button>
          </>
        }
      >
        <form id="hall-form" onSubmit={save} className="space-y-4">
          <div>
            <label className="label" htmlFor="h-name">
              Hall name
            </label>
            <input id="h-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="h-cap">
                Capacity (1–200)
              </label>
              <input id="h-cap" type="number" min={1} max={200} className="input" value={capacity} onChange={(e) => setCapacity(e.target.value)} required />
            </div>
            <div>
              <label className="label" htmlFor="h-rate">
                Hourly rate (₸)
              </label>
              <input id="h-rate" type="number" min={1} step={500} className="input" value={rate} onChange={(e) => setRate(e.target.value)} required />
            </div>
          </div>
          {formError && <ErrorNote message={formError} />}
        </form>
      </Modal>

      <ConfirmDialog
        open={!!toggle}
        danger={!!toggle?.is_active}
        title={toggle?.is_active ? 'Deactivate hall?' : 'Activate hall?'}
        message={toggle?.is_active ? `${toggle.hall_name} will disappear from booking pages. Existing bookings stay as they are.` : `${toggle?.hall_name} will become bookable again.`}
        confirmLabel={toggle?.is_active ? 'Deactivate' : 'Activate'}
        onCancel={() => setToggle(null)}
        onConfirm={async () => {
          if (!toggle) return;
          await setHallActive(toggle.hall_id, !toggle.is_active);
          toast.success(`${toggle.hall_name} is now ${toggle.is_active ? 'inactive' : 'active'}.`);
          setToggle(null);
          reload();
        }}
      />
    </div>
  );
}
