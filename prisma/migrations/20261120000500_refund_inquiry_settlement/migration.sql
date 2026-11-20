-- B06: Audited signed merchant refund inquiry and atomic terminal entitlement withdrawal.
-- Applying this schema migration does NOT execute or request a refund.
ALTER TABLE `ToolRefundDispatch`
 MODIFY `state` ENUM('READY','IN_DOUBT','SUCCEEDED') NOT NULL DEFAULT 'READY',
 ADD COLUMN `confirmedAt` DATETIME(3) NULL;

CREATE TABLE `ToolRefundInquiryEvent` (
 `id` VARCHAR(191) NOT NULL,
 `dispatchId` VARCHAR(191) NOT NULL,
 `operatorId` VARCHAR(191) NOT NULL,
 `observed` VARCHAR(16) NOT NULL,
 `outcome` VARCHAR(24) NOT NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX `ToolRefundInquiryEvent_dispatchId_createdAt_idx`(`dispatchId`,`createdAt`),
 INDEX `ToolRefundInquiryEvent_operatorId_createdAt_idx`(`operatorId`,`createdAt`),
 PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ToolRefundInquiryEvent`
 ADD CONSTRAINT `ToolRefundInquiryEvent_dispatchId_fkey`
 FOREIGN KEY (`dispatchId`) REFERENCES `ToolRefundDispatch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `ToolRefundInquiryEvent`
 ADD CONSTRAINT `ToolRefundInquiryEvent_operatorId_fkey`
 FOREIGN KEY (`operatorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
