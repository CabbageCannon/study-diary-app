import { useEffect, useRef } from "react";

interface ConfirmActionDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  isConfirming?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmActionDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "取消",
  danger = false,
  isConfirming = false,
  onCancel,
  onConfirm,
}: ConfirmActionDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    }
    if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog className="confirm-dialog" ref={dialogRef} onCancel={onCancel} aria-labelledby="confirm-action-title" aria-describedby="confirm-action-description">
      <form method="dialog" className="confirm-dialog-body">
        <h2 id="confirm-action-title">{title}</h2>
        <p id="confirm-action-description">{description}</p>
        <div className="confirm-dialog-actions">
          <button className="button button-secondary" disabled={isConfirming} onClick={onCancel} type="button">{cancelLabel}</button>
          <button className={danger ? "button button-danger" : "button button-primary"} disabled={isConfirming} onClick={onConfirm} type="button">
            {isConfirming ? "处理中..." : confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
