export const PAGE_SIZE = 10;

export function parsePage(page: string | undefined): number {
  const n = Number(page ?? "1");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

export function pageOffset(page: number, pageSize: number = PAGE_SIZE): number {
  return (page - 1) * pageSize;
}

export function totalPages(totalCount: number, pageSize: number = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(totalCount / pageSize));
}
