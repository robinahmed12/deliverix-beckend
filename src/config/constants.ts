export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  MIN_PAGE_SIZE: 1,
} as const;

export const ORDER_NUMBER = {
  PREFIX: "ORD",
  DATE_FORMAT: "yyyyMMdd",
  RANDOM_LENGTH: 6,
} as const;

export const TOKEN = {
  INVITATION_EXPIRY_HOURS: 72,
  PASSWORD_RESET_EXPIRY_HOURS: 1,
  REFRESH_TOKEN_BYTES: 48,
} as const;

export const ROLE_NAMES = {
  ADMIN: "admin",
  DISPATCHER: "dispatcher",
  DRIVER: "driver",
  CUSTOMER: "customer",
  SUPPORT: "support",
} as const;