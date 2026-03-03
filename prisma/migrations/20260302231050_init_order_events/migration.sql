/*
  Warnings:

  - You are about to drop the `order_status_history` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "order_event_type" AS ENUM ('STATUS_CHANGE', 'PAYMENT_ADDED', 'PAYMENT_DELETED');

-- DropForeignKey
ALTER TABLE "order_status_history" DROP CONSTRAINT "order_status_history_order_id_fkey";

-- DropTable
DROP TABLE "order_status_history";

-- CreateTable
CREATE TABLE "order_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "type" "order_event_type" NOT NULL,
    "description" TEXT NOT NULL,
    "from_status" "order_status",
    "to_status" "order_status",
    "metadata" JSONB,
    "changed_by_id" VARCHAR(100) NOT NULL,
    "changed_by_name" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_events_tenant_id_idx" ON "order_events"("tenant_id");

-- CreateIndex
CREATE INDEX "order_events_order_id_idx" ON "order_events"("order_id");

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
