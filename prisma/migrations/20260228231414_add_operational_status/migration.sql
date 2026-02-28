-- CreateEnum
CREATE TYPE "operational_status" AS ENUM ('PENDING', 'APPROVED', 'IN_PRODUCTION', 'PRODUCED', 'DELIVERED');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "operational_status" "operational_status" NOT NULL DEFAULT 'PENDING';
