import { Badge } from 'bang-inventory-ui';

export function Default() {
  return <Badge>Default</Badge>;
}

export function StatusVariants() {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Badge variant="muted">Pending</Badge>
      <Badge variant="info">In Progress</Badge>
      <Badge variant="warning">Blended</Badge>
      <Badge variant="success">Completed</Badge>
      <Badge variant="danger">Skipped</Badge>
    </div>
  );
}
