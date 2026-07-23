'use client';
import { useState } from 'react';
import { Table, Pagination } from '@/components/ui/Table';
import { resolvePaginationTotal } from '@/lib/utils';

const ALL_ROWS = Array.from({ length: 47 }, (_, i) => ({ id: i + 1, name: `Item ${i + 1}` }));
const PER_PAGE = 20;

export default function PaginationTestPage() {
  const [page, setPage] = useState(1);
  // Simulate a backend response missing `total` entirely -- the exact bug scenario.
  const rawTotal = undefined;
  const pageItems = ALL_ROWS.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const total = resolvePaginationTotal(rawTotal, pageItems, page, PER_PAGE);

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2">Pagination test (backend total missing)</h1>
      <p className="mb-4 text-sm">47 total rows, page size 20, backend omits `total`. Computed total: {total}</p>
      <div className="bg-[var(--paper-raised)] border border-[var(--border)] rounded-2xl overflow-hidden">
        <Table
          columns={[{ key: 'name', header: 'Name', primary: true }]}
          data={pageItems}
          keyExtractor={(r) => r.id}
        />
        <Pagination page={page} total={total} perPage={PER_PAGE} onChange={setPage} />
      </div>
    </div>
  );
}
