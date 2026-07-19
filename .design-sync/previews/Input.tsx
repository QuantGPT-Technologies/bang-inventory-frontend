import { Input } from 'bang-inventory-ui';

export function Default() {
  return <Input label="Lot number" placeholder="e.g. LOT-2024-0091" />;
}

export function WithHint() {
  return <Input label="Quantity (kg)" defaultValue="240" hint="Measured after blending" />;
}

export function WithError() {
  return <Input label="SKU code" defaultValue="BW-" error="This SKU code is already in use" />;
}

export function Disabled() {
  return <Input label="Batch ID" defaultValue="BW-1042" disabled />;
}
