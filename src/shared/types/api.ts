export interface ApiResponse<T = unknown> {
  data: T;
  meta?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface CursorPageMeta {
  nextCursor: string | null;
  previousCursor: string | null;
  hasMore: boolean;
  pageSize: number;
}

export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail?: string;
  code: string;
  requestId?: string;
  errors?: unknown;
}