import { Badge, Card } from 'bang-inventory-ui';

export function Default() {
  return (
    <Card
      title="Batch #BW-1042"
      subtitle="Started 2 days ago"
      action={<Badge variant="info">In Progress</Badge>}
    >
      <p style={{ fontSize: 13, color: 'var(--ink-light)' }}>
        4 lots blended, 210kg total output pending final QA sign-off.
      </p>
    </Card>
  );
}

export function Plain() {
  return (
    <Card>
      <p style={{ fontSize: 13, color: 'var(--ink-light)' }}>
        Cards without a title render as a plain padded container.
      </p>
    </Card>
  );
}
