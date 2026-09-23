import { Dialog } from '../ui/Dialog';
import { ImportPanel } from './ImportPanel';

export function ImportDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  return (
    <Dialog open={open} title="Import source" wide closeLabel="Close" onClose={onClose}>
      {/* Remount on each open so a previous preview is not shown again. */}
      {open && <ImportPanel onDone={onClose} />}
    </Dialog>
  );
}
