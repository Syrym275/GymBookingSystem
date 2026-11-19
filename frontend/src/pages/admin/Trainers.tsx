import { useState, type FormEvent } from 'react';
import { BadgeCheck, Plus, Trash2, UserCheck, UserX } from 'lucide-react';
import { approveApplication, deleteTrainer, listAllTrainers, listApplications, rejectApplication, sessionCounts } from '../../api/adminApi';
import { createTrainer, setTrainerActive, updateTrainer } from '../../api/trainersApi';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataTable, type Column } from '../../components/DataTable';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { ErrorNote, Loading, PageHeader } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { useT } from '../../i18n';
import { msg } from '../../i18n/messages';
import type { Trainer, TrainerApplication } from '../../types';
import { fmtDateTime, kzt } from '../../utils/format';
import { ActiveChip } from './common';

/** Trainers: approve sign-ups, add, edit, activate / deactivate. Only never-booked trainers can be deleted. */
export default function AdminTrainers() {
  const { t } = useT();
  const toast = useToast();
  const list = useAsync(listAllTrainers, []);
  const counts = useAsync(sessionCounts, []);
  const apps = useAsync(listApplications, []);
  const [deciding, setDeciding] = useState<{ app: TrainerApplication; action: 'approve' | 'reject' } | null>(null);
  const [editing, setEditing] = useState<Trainer | 'new' | null>(null);
  const [toggle, setToggle] = useState<Trainer | null>(null);
  const [remove, setRemove] = useState<Trainer | null>(null);
  const [name, setName] = useState('');
  const [spec, setSpec] = useState('');
  const [price, setPrice] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const open = (x: Trainer | 'new') => {
    setEditing(x);
    setFormError(null);
    setName(x === 'new' ? '' : x.full_name);
    setSpec(x === 'new' ? '' : x.specialization);
    setPrice(x === 'new' ? '' : String(x.session_price_kzt));
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const input = { full_name: name, specialization: spec, session_price_kzt: Number(price) };
    try {
      if (editing === 'new') await createTrainer(input);
      else if (editing) await updateTrainer(editing.trainer_id, input);
      toast.success(t('adm.tr.saved'));
      setEditing(null);
      list.reload();
    } catch (err) {
      setFormError(msg(err instanceof Error ? err.message : t('common.saveFailed')));
    }
  };

  if (list.error) return <ErrorNote message={msg(list.error)} />;
  if (!list.data) return <Loading />;

  const columns: Column<Trainer>[] = [
    { key: 'name', header: t('adm.tr.trainer'), sort: (x) => x.full_name, render: (x) => <b>{x.full_name}</b> },
    { key: 'spec', header: t('adm.tr.spec'), sort: (x) => x.specialization, render: (x) => x.specialization },
    { key: 'price', header: t('adm.tr.price'), sort: (x) => x.session_price_kzt, render: (x) => kzt(x.session_price_kzt) },
    { key: 'held', header: t('adm.tr.held'), sort: (x) => counts.data?.trainers[x.trainer_id] ?? 0, render: (x) => counts.data?.trainers[x.trainer_id] ?? 0 },
    { key: 'active', header: t('adm.bk.status'), sort: (x) => (x.is_active ? 1 : 0), render: (x) => <ActiveChip active={x.is_active} /> },
    {
      key: 'act',
      header: '',
      render: (x) => (
        <div className="flex justify-end gap-2">
          <button className="btn-ghost btn-sm" onClick={() => open(x)}>
            {t('adm.edit')}
          </button>
          {x.is_active ? (
            <button className="btn-ghost btn-sm" onClick={() => setToggle(x)}>
              {t('adm.deactivate')}
            </button>
          ) : (
            <button className="btn-primary btn-sm" onClick={() => setToggle(x)}>
              <BadgeCheck className="h-3 w-3" /> {t('adm.activate')}
            </button>
          )}
          {counts.data && (counts.data.booked.trainers[x.trainer_id] ?? 0) === 0 ? (
            <button className="btn-danger btn-sm" onClick={() => setRemove(x)}>
              <Trash2 className="h-3 w-3" /> {t('adm.delete')}
            </button>
          ) : (
            <button className="btn-ghost btn-sm" disabled title={counts.data ? t('adm.tr.deleteBlocked') : undefined}>
              <Trash2 className="h-3 w-3" /> {t('adm.delete')}
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('adm.nav.trainers')}
        subtitle={t('adm.tr.sub')}
        actions={
          <button className="btn-primary" onClick={() => open('new')}>
            <Plus className="h-4 w-4" /> {t('adm.tr.add')}
          </button>
        }
      />
      <section className="card min-w-0" aria-labelledby="applications-title">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="applications-title" className="text-lg font-bold">
              {t('adm.app.title')}
              {apps.data && apps.data.length > 0 && (
                <span className="ml-2 inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-brand px-2 text-sm text-onaccent">{apps.data.length}</span>
              )}
            </h2>
            <p className="text-sm text-ink/60">{t('adm.app.sub')}</p>
          </div>
        </div>
        {apps.error && <ErrorNote message={msg(apps.error)} />}
        {apps.data && apps.data.length === 0 && <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-ink/60">{t('adm.app.none')}</p>}
        {apps.data && apps.data.length > 0 && (
          <ul className="divide-y divide-line">
            {apps.data.map((a) => (
              <li key={a.application_id} className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
                <div className="min-w-[12rem] flex-1">
                  <p className="font-bold">{a.full_name}</p>
                  <p className="break-all text-xs text-ink/60">{a.email}</p>
                  {a.email_verified === false && <p className="text-xs font-semibold text-berry">{t('adm.app.unverified')}</p>}
                </div>
                <div className="min-w-[8rem] text-sm">
                  <p className="text-xs text-ink/50">{t('adm.tr.spec')}</p>
                  {a.specialization}
                </div>
                <div className="min-w-[6rem] text-sm">
                  <p className="text-xs text-ink/50">{t('adm.app.requestedPrice')}</p>
                  {kzt(a.session_price_kzt)}
                </div>
                <div className="min-w-[8rem] text-sm">
                  <p className="text-xs text-ink/50">{t('adm.app.applied')}</p>
                  {fmtDateTime(a.created_at)}
                </div>
                <div className="flex gap-2">
                  <button className="btn-primary btn-sm" onClick={() => setDeciding({ app: a, action: 'approve' })}>
                    <UserCheck className="h-3 w-3" /> {t('adm.approve')}
                  </button>
                  <button className="btn-danger btn-sm" onClick={() => setDeciding({ app: a, action: 'reject' })}>
                    <UserX className="h-3 w-3" /> {t('adm.app.reject')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <DataTable rows={list.data} columns={columns} rowKey={(x) => x.trainer_id} />
      <p className="text-xs text-ink/60">{t('adm.noDeleteUsed')}</p>

      <Modal
        open={editing !== null}
        title={editing === 'new' ? t('adm.tr.add') : t('adm.tr.edit')}
        onClose={() => setEditing(null)}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setEditing(null)}>
              {t('adm.cancel')}
            </button>
            <button className="btn-primary" form="trainer-form">
              {t('adm.save')}
            </button>
          </>
        }
      >
        <form id="trainer-form" onSubmit={save} className="space-y-4">
          <div>
            <label className="label" htmlFor="tr-name">
              {t('adm.tr.name')}
            </label>
            <input id="tr-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="tr-spec">
              {t('adm.tr.spec')}
            </label>
            <input id="tr-spec" className="input" value={spec} onChange={(e) => setSpec(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="tr-price">
              {t('adm.tr.priceLabel')}
            </label>
            <input id="tr-price" type="number" min={100} step={100} className="input" value={price} onChange={(e) => setPrice(e.target.value)} required />
            <p className="mt-1 text-xs text-ink/60">{t('adm.tr.priceNote')}</p>
          </div>
          {formError && <ErrorNote message={formError} />}
        </form>
      </Modal>

      <ConfirmDialog
        open={!!toggle}
        danger={!!toggle?.is_active}
        title={toggle?.is_active ? t('adm.tr.deactivateQ') : t('adm.tr.activateQ')}
        message={toggle?.is_active ? t('adm.tr.deactivateText', { name: toggle?.full_name ?? '' }) : t('adm.tr.activateText', { name: toggle?.full_name ?? '' })}
        confirmLabel={toggle?.is_active ? t('adm.deactivate') : t('adm.activate')}
        onCancel={() => setToggle(null)}
        onConfirm={async () => {
          if (!toggle) return;
          await setTrainerActive(toggle.trainer_id, !toggle.is_active);
          toast.success(t(toggle.is_active ? 'adm.tr.nowInactive' : 'adm.tr.nowActive', { name: toggle.full_name }));
          setToggle(null);
          list.reload();
        }}
      />

      <ConfirmDialog
        open={!!deciding}
        danger={deciding?.action === 'reject'}
        title={deciding?.action === 'reject' ? t('adm.app.rejectQ') : t('adm.app.approveQ')}
        message={
          deciding?.action === 'reject'
            ? t('adm.app.rejectText', { name: deciding?.app.full_name ?? '' })
            : t('adm.app.approveText', { name: deciding?.app.full_name ?? '' })
        }
        confirmLabel={deciding?.action === 'reject' ? t('adm.app.reject') : t('adm.approve')}
        onCancel={() => setDeciding(null)}
        onConfirm={async () => {
          if (!deciding) return;
          const { app, action } = deciding;
          try {
            if (action === 'approve') {
              await approveApplication(app.application_id);
              toast.success(t('adm.app.approved', { name: app.full_name }));
            } else {
              await rejectApplication(app.application_id);
              toast.success(t('adm.app.rejected', { name: app.full_name }));
            }
          } catch (err) {
            toast.error(msg(err instanceof Error ? err.message : t('common.saveFailed')));
          }
          setDeciding(null);
          apps.reload();
          list.reload();
          counts.reload();
        }}
      />

      <ConfirmDialog
        open={!!remove}
        danger
        title={t('adm.tr.deleteQ')}
        message={t('adm.tr.deleteText', { name: remove?.full_name ?? '' })}
        confirmLabel={t('adm.delete')}
        onCancel={() => setRemove(null)}
        onConfirm={async () => {
          if (!remove) return;
          try {
            await deleteTrainer(remove.trainer_id);
            toast.success(t('adm.tr.deleted', { name: remove.full_name }));
          } catch (err) {
            toast.error(msg(err instanceof Error ? err.message : t('common.saveFailed')));
          }
          setRemove(null);
          list.reload();
          counts.reload();
        }}
      />
    </div>
  );
}
