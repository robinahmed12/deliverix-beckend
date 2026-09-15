import { PAGINATION } from "../../config/constants.js";

export interface OffsetPagination {
  page: number;
  pageSize: number;
}

export function parseOffsetPagination(query: {
  page?: string;
  pageSize?: string;
}): OffsetPagination {
  const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
  const pageSize = Math.min(
    PAGINATION.MAX_PAGE_SIZE,
    Math.max(PAGINATION.MIN_PAGE_SIZE, parseInt(query.pageSize ?? String(PAGINATION.DEFAULT_PAGE_SIZE), 10) || PAGINATION.DEFAULT_PAGE_SIZE),
  );
  return { page, pageSize };
}

export function offsetMeta(total: number, pagination: OffsetPagination) {
  return {
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
    totalPages: Math.ceil(total / pagination.pageSize),
  };
}