export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export const paginateItems = (items, page = 1, pageSize = 10) => {
  const safeSize = PAGE_SIZE_OPTIONS.includes(Number(pageSize)) ? Number(pageSize) : 10;
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / safeSize));
  const currentPage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const startIndex = (currentPage - 1) * safeSize;
  return { items: items.slice(startIndex, startIndex + safeSize), total, totalPages, currentPage, start: total ? startIndex + 1 : 0, end: Math.min(startIndex + safeSize, total) };
};
