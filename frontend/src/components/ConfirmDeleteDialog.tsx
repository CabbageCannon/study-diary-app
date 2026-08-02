import { useEffect, useRef } from "react";

import type { Diary } from "../types/diary";

interface ConfirmDeleteDialogProps {
  diary: Diary | null;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDeleteDialog({ diary, isDeleting, onCancel, onConfirm }: ConfirmDeleteDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (diary && !dialog.open) {
      dialog.showModal();
    }

    if (!diary && dialog.open) {
      dialog.close();
    }
  }, [diary]);

  return (
    <dialog
      className="confirm-dialog"
      ref={dialogRef}
      onCancel={onCancel}
      role="alertdialog"
      aria-labelledby="delete-title"
      aria-describedby="delete-description"
    >
      <form method="dialog" className="confirm-dialog-body">
        <h2 id="delete-title">删除这篇学习日记？</h2>
        <p id="delete-description">
          {diary ? `《${diary.title}》删除后无法在系统中查看。` : "删除后无法在系统中查看。"}
        </p>
        <div className="confirm-dialog-actions">
          <button className="button button-secondary" disabled={isDeleting} onClick={onCancel} type="button">
            取消
          </button>
          <button className="button button-danger" disabled={isDeleting} onClick={onConfirm} type="button">
            {isDeleting ? "删除中..." : "确认删除"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
