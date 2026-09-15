import { z } from "zod";

const REPORT_MAX_DAYS = 90;

const timezoneSchema = z.string().min(1).max(63);

const baseDateRange = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
}

export const dashboardQuerySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be in YYYY-MM-DD format").optional(),
    timezone: timezoneSchema.optional(),
  })
  .optional()
  .transform((v) => v ?? {});

export const deliveryReportQuerySchema = baseDateRange
  .extend({
    timezone: timezoneSchema.optional(),
    zoneId: z.string().optional(),
    status: z.string().optional(),
    customerId: z.string().optional(),
  })
  .refine((d) => d.to >= d.from, {
    message: "to must be greater than or equal to from",
    path: ["to"],
  })
  .refine((d) => daysBetween(d.from, d.to) <= REPORT_MAX_DAYS, {
    message: `date range must not exceed ${REPORT_MAX_DAYS} days`,
    path: ["to"],
  });

export const driverReportQuerySchema = baseDateRange
  .extend({
    timezone: timezoneSchema.optional(),
    driverId: z.string().optional(),
  })
  .refine((d) => d.to >= d.from, {
    message: "to must be greater than or equal to from",
    path: ["to"],
  })
  .refine((d) => daysBetween(d.from, d.to) <= REPORT_MAX_DAYS, {
    message: `date range must not exceed ${REPORT_MAX_DAYS} days`,
    path: ["to"],
  });

export const zoneReportQuerySchema = baseDateRange
  .extend({
    timezone: timezoneSchema.optional(),
    zoneId: z.string().optional(),
  })
  .refine((d) => d.to >= d.from, {
    message: "to must be greater than or equal to from",
    path: ["to"],
  })
  .refine((d) => daysBetween(d.from, d.to) <= REPORT_MAX_DAYS, {
    message: `date range must not exceed ${REPORT_MAX_DAYS} days`,
    path: ["to"],
  });

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
export type DeliveryReportQuery = z.infer<typeof deliveryReportQuerySchema>;
export type DriverReportQuery = z.infer<typeof driverReportQuerySchema>;
export type ZoneReportQuery = z.infer<typeof zoneReportQuerySchema>;

export const METRIC_VERSION = "1.0";