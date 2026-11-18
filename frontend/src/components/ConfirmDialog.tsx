import { useState } from 'react';
import { Modal } from './Modal';
import { useT } from '../i18n';

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, message, confirmLabel, danger, onConfirm, onCancel }: Props) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button className="btn-ghost" onClick={onCancel} disabled={busy}>
            {t('dialog.keep')}
          </button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={run} disabled={busy}>
            {busy ? t('dialog.working') : confirmLabel ?? t('dialog.confirm')}
          </button>
        </>
      }
    >
      <p className="text-sm text-ink/80">{message}</p>
    </Modal>
  );
}
