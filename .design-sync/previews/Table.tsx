import { Badge, Table } from 'bang-inventory-ui';

const columns = [
  { key: 'lot', header: 'Lot' },
  { key: 'sku', header: 'SKU' },
  { key: 'qty', header: 'Qty (kg)' },
  {
    key: 'status',
    header: 'Status',
    render: (row) => (
      <Badge variant={row.status === 'completed' ? 'success' : row.status === 'in_progress' ? 'info' : 'muted'}>
        {row.status}
      </Badge>
    ),
  },
];

const rows = [
  { id: 1, lot: 'LOT-0091', sku: 'BW-CHAI-500', qty: 82, status: 'completed' },
  { id: 2, lot: 'LOT-0092', sku: 'BW-EARL-250', qty: 46, status: 'in_progress' },
  { id: 3, lot: 'LOT-0093', sku: 'BW-CHAI-500', qty: 60, status: 'pending' },
];

export function Default() {
  return <Table columns={columns} data={rows} keyExtractor={(r) => r.id} />;
}

export function Empty() {
  return <Table columns={columns} data={[]} keyExtractor={(r) => r.id} emptyMessage="No lots for this batch yet." />;
}

export function Loading() {
  return <Table columns={columns} data={[]} keyExtractor={(r) => r.id} loading />;
}
