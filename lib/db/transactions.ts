import "server-only";

import type { TransactionSql } from "postgres";
import { getDb } from "@/lib/db/client";

export function withTransaction<T>(
  work: (transaction: TransactionSql) => Promise<T>,
): Promise<T> {
  return getDb().begin(work);
}
