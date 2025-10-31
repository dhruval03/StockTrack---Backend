-- AlterTable
ALTER TABLE "public"."Inventory" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN     "purchasePrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "sellingPrice" DECIMAL(10,2) NOT NULL DEFAULT 0;
