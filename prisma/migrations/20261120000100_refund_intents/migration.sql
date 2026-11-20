-- B06: durable, idempotent refund intent PREPARATION only.
-- No payment gateway request, fund movement, or credit revocation occurs.
ALTER TABLE `ToolRefundCase` MODIFY `status`
 ENUM('OPEN','PREPARED','REJECTED','PROCESSING','SUCCEEDED','FAILED') NOT NULL DEFAULT 'OPEN';

CREATE TABLE `ToolRefundIntent` (
 `id` VARCHAR(191) NOT NULL,
 `caseId` VARCHAR(191) NOT NULL,
 `orderId` VARCHAR(32) NOT NULL,
 `operatorId` VARCHAR(191) NOT NULL,
 `outRefundNo` VARCHAR(32) NOT NULL,
 `fingerprint` CHAR(64) NOT NULL,
 `amountFen` INTEGER NOT NULL,
 `reason` VARCHAR(80) NOT NULL,
 `state` ENUM('PREPARED') NOT NULL DEFAULT 'PREPARED',
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE INDEX `ToolRefundIntent_caseId_key`(`caseId`),
 UNIQUE INDEX `ToolRefundIntent_orderId_key`(`orderId`),
 UNIQUE INDEX `ToolRefundIntent_outRefundNo_key`(`outRefundNo`),
 INDEX `ToolRefundIntent_operatorId_createdAt_idx`(`operatorId`,`createdAt`),
 PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ToolRefundIntent`
 ADD CONSTRAINT `ToolRefundIntent_caseId_fkey` FOREIGN KEY (`caseId`) REFERENCES `ToolRefundCase`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `ToolRefundIntent`
 ADD CONSTRAINT `ToolRefundIntent_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `ToolOrder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `ToolRefundIntent`
 ADD CONSTRAINT `ToolRefundIntent_operatorId_fkey` FOREIGN KEY (`operatorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
