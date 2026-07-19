import { Textarea } from 'bang-inventory-ui';

export function Default() {
  return <Textarea label="Notes" placeholder="Add any observations from this blend…" />;
}

export function WithError() {
  return <Textarea label="Rejection reason" error="A reason is required to reject this lot" />;
}
