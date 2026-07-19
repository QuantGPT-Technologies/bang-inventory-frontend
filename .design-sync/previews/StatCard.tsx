import { StatCard } from 'bang-inventory-ui';

export function Default() {
  return <StatCard label="Open Batches" value={12} sub="+3 this week" />;
}

export function Accent() {
  return <StatCard label="Total Output" value="4,820 kg" sub="Across all SKUs" accent />;
}
