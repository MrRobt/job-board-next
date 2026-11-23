-- U01: record an authenticated manual deletion review request only.
-- Preserve User and all payment, refund, entitlement and audit records.
CREATE TABLE `AccountDeletionRequest` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'PENDING_MANUAL_REVIEW',
  `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `AccountDeletionRequest_userId_key`(`userId`),
  INDEX `AccountDeletionRequest_status_requestedAt_idx`(`status`,`requestedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `AccountDeletionRequest` ADD CONSTRAINT `AccountDeletionRequest_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
