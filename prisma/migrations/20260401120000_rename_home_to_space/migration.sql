-- Rename enum used by HomeMember.role
ALTER TYPE "HomeRole" RENAME TO "SpaceRole";

-- Drop FKs that reference Home.homeId columns (will recreate after renames)
ALTER TABLE "HomeMember" DROP CONSTRAINT "HomeMember_homeId_fkey";
ALTER TABLE "Invitation" DROP CONSTRAINT "Invitation_homeId_fkey";
ALTER TABLE "Task" DROP CONSTRAINT "Task_homeId_fkey";

-- Rename core tables
ALTER TABLE "Home" RENAME TO "Space";
ALTER TABLE "HomeMember" RENAME TO "SpaceMember";

-- Rename PK and user FK constraints on Space
ALTER TABLE "Space" RENAME CONSTRAINT "Home_pkey" TO "Space_pkey";
ALTER TABLE "Space" RENAME CONSTRAINT "Home_createdByUserId_fkey" TO "Space_createdByUserId_fkey";
ALTER TABLE "Space" RENAME CONSTRAINT "Home_deletedByUserId_fkey" TO "Space_deletedByUserId_fkey";

-- Rename SpaceMember PK and user FK
ALTER TABLE "SpaceMember" RENAME CONSTRAINT "HomeMember_pkey" TO "SpaceMember_pkey";
ALTER TABLE "SpaceMember" RENAME CONSTRAINT "HomeMember_userId_fkey" TO "SpaceMember_userId_fkey";

-- Rename FK columns
ALTER TABLE "SpaceMember" RENAME COLUMN "homeId" TO "spaceId";
ALTER TABLE "Invitation" RENAME COLUMN "homeId" TO "spaceId";
ALTER TABLE "Task" RENAME COLUMN "homeId" TO "spaceId";

-- Rename indexes (PostgreSQL keeps index definitions; names updated for clarity)
ALTER INDEX "Home_createdByUserId_idx" RENAME TO "Space_createdByUserId_idx";
ALTER INDEX "Home_deletedByUserId_idx" RENAME TO "Space_deletedByUserId_idx";
ALTER INDEX "HomeMember_userId_idx" RENAME TO "SpaceMember_userId_idx";
ALTER INDEX "HomeMember_homeId_idx" RENAME TO "SpaceMember_spaceId_idx";
ALTER INDEX "HomeMember_homeId_userId_key" RENAME TO "SpaceMember_spaceId_userId_key";
ALTER INDEX "Invitation_homeId_status_idx" RENAME TO "Invitation_spaceId_status_idx";
ALTER INDEX "Task_homeId_idx" RENAME TO "Task_spaceId_idx";
ALTER INDEX "Task_homeId_status_idx" RENAME TO "Task_spaceId_status_idx";

-- Recreate FKs to Space
ALTER TABLE "SpaceMember"
ADD CONSTRAINT "SpaceMember_spaceId_fkey"
FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Invitation"
ADD CONSTRAINT "Invitation_spaceId_fkey"
FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Task"
ADD CONSTRAINT "Task_spaceId_fkey"
FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
