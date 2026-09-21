/* eslint-disable react-refresh/only-export-components */
import React, { useEffect, useMemo, useState } from 'react';
import { Button } from './Button';
import { PAGE_SIZE_OPTIONS, paginateItems } from '../../utils/pagination';

export const usePagination = (items, resetKeys = []) => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const resetKey = JSON.stringify(resetKeys);
  const pagination = useMemo(() => paginateItems(items, page, pageSize), [items, page, pageSize]);

  useEffect(() => setPage(1), [pageSize, resetKey]);
  useEffect(() => { if (page !== pagination.currentPage) setPage(pagination.currentPage); }, [page, pagination.currentPage]);

  return { ...pagination, pageSize, setPageSize, setPage };
};

export function Pagination({ pagination, label = 'registro(s)' }) {
  if (!pagination.total) return null;
  return <div className="flex flex-col gap-3 rounded-2xl bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
    <p className="text-xs text-gray-500">Mostrando <strong className="text-gray-900">{pagination.start}–{pagination.end}</strong> de <strong className="text-gray-900">{pagination.total}</strong> {label}</p>
    <div className="flex flex-wrap items-center justify-center gap-2">
      <label className="text-xs font-bold text-gray-600">Por página <select value={pagination.pageSize} onChange={event => pagination.setPageSize(Number(event.target.value))} className="ml-1 rounded-lg bg-gray-50 px-2 py-2">{PAGE_SIZE_OPTIONS.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <Button type="button" variant="secondary" disabled={pagination.currentPage === 1} onClick={() => pagination.setPage(value => value - 1)}>Anterior</Button>
      <span className="text-xs font-black text-gray-600">{pagination.currentPage}/{pagination.totalPages}</span>
      <Button type="button" variant="secondary" disabled={pagination.currentPage === pagination.totalPages} onClick={() => pagination.setPage(value => value + 1)}>Próxima</Button>
    </div>
  </div>;
}
