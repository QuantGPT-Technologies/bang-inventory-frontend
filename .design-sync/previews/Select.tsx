import { Select } from 'bang-inventory-ui';

const statusOptions = [
  { value: 'created', label: 'Created' },
  { value: 'blending', label: 'Blending' },
  { value: 'blended', label: 'Blended' },
  { value: 'completed', label: 'Completed' },
];

export function Default() {
  return <Select label="Status" options={statusOptions} placeholder="Select a status" />;
}

export function WithError() {
  return <Select label="Warehouse" options={statusOptions} error="Please choose a warehouse" />;
}
