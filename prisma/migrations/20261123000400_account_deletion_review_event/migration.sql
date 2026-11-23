-- U01: immutable manual review event for privacy/legal routing.
-- No changes to user status, payment, entitlements, refunds or personal data.
CREATE TABLE `AccountDeletionReviewEvent` (
  `id` VARCHAR(191) NOT NULL,
  `requestId` VARCHAR(191) NOT NULL,
  `operatorId` VARCHAR(191) NOT NULL,
  `reasonCode` VARCHAR(40) NOT NULL,
  `recordedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `AccountDeletionReviewEvent_requestId_reasonCode_key`(`requestId`,`reasonCode`),
  INDEX `AccountDeletionReviewEvent_operatorId_recordedAt_idx`(`operatorId`,`recordedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `AccountDeletionReviewEvent`
  ADD CONSTRAINT `AccountDeletionReviewEvent_requestId_fkey`
  FOREIGN KEY (`requestId`) REFERENCES `AccountDeletionRequest`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AccountDeletionReviewEvent`
  ADD CONSTRAINT `AccountDeletionReviewEvent_operatorId_fkey`
  FOREIGN KEY (`operatorId`) REFERENCES `User`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
