-- B06 internal refund dispatch reservation only; no merchant refund request is issued.
CREATE TABLE `ToolRefundDispatch` (
  `id` VARCHAR(191) NOT NULL,
  `intentId` VARCHAR(191) NOT NULL,
  `outRefundNo` VARCHAR(32) NOT NULL,
  `fingerprint` CHAR(64) NOT NULL,
  `state` ENUM('READY','IN_DOUBT') NOT NULL DEFAULT 'READY',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `claimedAt` DATETIME(3) NULL,
  `claimantId` VARCHAR(191) NULL,
  UNIQUE INDEX `ToolRefundDispatch_intentId_key`(`intentId`),
  UNIQUE INDEX `ToolRefundDispatch_outRefundNo_key`(`outRefundNo`),
  INDEX `ToolRefundDispatch_state_createdAt_idx`(`state`,`createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ToolRefundDispatch`
 ADD CONSTRAINT `ToolRefundDispatch_intentId_fkey`
 FOREIGN KEY (`intentId`) REFERENCES `ToolRefundIntent`(`id`)
 ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `ToolRefundDispatch`
 ADD CONSTRAINT `ToolRefundDispatch_claimantId_fkey`
 FOREIGN KEY (`claimantId`) REFERENCES `User`(`id`)
 ON DELETE RESTRICT ON UPDATE CASCADE;
