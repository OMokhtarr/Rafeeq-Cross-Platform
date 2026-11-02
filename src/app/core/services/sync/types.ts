/** How a collection's items are reconciled between devices. */
export type SyncKind = "items" | "days" | "object" | "hifzPlan" | "freezePool";

/** One side's copy of a synced value, with the instant it was last edited. */
export interface Versioned {
  value: unknown;
  /** ISO-8601 instant. */
  editedAt: string;
  deleted: boolean;
}

/** A row of the Supabase `sync_items` table. */
export interface SyncRow {
  collection: string;
  item_key: string;
  value: unknown;
  edited_at: string;
  deleted: boolean;
  server_at?: string;
}
