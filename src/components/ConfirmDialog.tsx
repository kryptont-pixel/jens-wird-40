import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";

export function ConfirmDialog({ open, count, label, onCancel, onConfirm }: { open: boolean; count: number; label: string; onCancel: () => void; onConfirm: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (open && node && !node.open) node.showModal();
    if (!open && node?.open) node.close();
  }, [open]);
  return (
    <dialog className="confirm-dialog" ref={ref} onCancel={(event) => { event.preventDefault(); onCancel(); }} onClose={onCancel}>
      <AlertTriangle aria-hidden="true" />
      <h2>Wirklich löschen?</h2>
      <p>{count === 1 ? `Der ausgewählte ${label} wird` : `${count} ausgewählte ${label} werden`} endgültig aus Speicher und Metadaten entfernt.</p>
      <div><button className="button button-secondary" type="button" onClick={onCancel}>Abbrechen</button><button className="button button-danger" type="button" onClick={onConfirm}>Endgültig löschen</button></div>
    </dialog>
  );
}
