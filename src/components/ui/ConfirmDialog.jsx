import React, { useRef, useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { AlertTriangle } from 'lucide-react';

export const ConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirmar ação",
  message = "Tem certeza que deseja prosseguir com esta ação?",
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  variant = "danger",
  busyText = "Processando..."
}) => {
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef(null);
  const close = () => { if (!busy) onClose(); };
  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try { await onConfirm(); }
    finally { setBusy(false); }
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title={title} maxWidth="max-w-md" initialFocusRef={cancelRef}>
      <div className="space-y-6 text-center">
        <div className="w-16 h-16 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
          <AlertTriangle size={32} />
        </div>
        <p className="text-gray-600 font-medium text-sm leading-relaxed [overflow-wrap:anywhere]">
          {message}
        </p>
        <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
          <Button ref={cancelRef} variant="secondary" onClick={close} disabled={busy} className="w-full">
            {cancelText}
          </Button>
          <Button
            variant={variant}
            onClick={confirm}
            busy={busy}
            busyText={busyText}
            className="w-full"
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
