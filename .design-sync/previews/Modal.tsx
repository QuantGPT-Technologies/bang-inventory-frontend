import { Button, Modal } from 'bang-inventory-ui';

export function Default() {
  return (
    <Modal
      open
      onClose={() => {}}
      title="Reject lot LOT-0093"
      subtitle="This action cannot be undone"
      footer={
        <>
          <Button variant="ghost" size="sm">Cancel</Button>
          <Button variant="danger" size="sm">Reject lot</Button>
        </>
      }
    >
      <p style={{ fontSize: 13, color: 'var(--ink-light)' }}>
        Rejecting this lot will remove it from the active batch and notify the QA team.
      </p>
    </Modal>
  );
}
