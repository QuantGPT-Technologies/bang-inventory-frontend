'use client';
import { Modal } from './Modal';
import { StockLedgerCard } from './StockLedgerCard';
import { StockLedgerItemType } from '@/lib/types';

/** Raw materials and consumables have no detail page (list + modals only) -- this gives them the
 *  same audit-trail view SKU detail embeds inline, as a "View Audit Trail" modal instead. */
export function StockLedgerModal({
  itemType,
  itemId,
  unit,
  name,
  onClose,
}: {
  itemType: StockLedgerItemType;
  itemId: number;
  unit?: string;
  name: string;
  onClose: () => void;
}) {
  return (
    <Modal open onClose={onClose} title="Audit Trail" subtitle={name} size="xl">
      <div className="flex flex-col h-[60vh] -m-6">
        <StockLedgerCard itemType={itemType} itemId={itemId} unit={unit} title="" />
      </div>
    </Modal>
  );
}
