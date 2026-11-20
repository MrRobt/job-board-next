-- Additive refund-request ledger. Does NOT initiate refunds or mark orders as refunded.
ALTER TABLE `ToolOrder` ADD COLUMN `refundHold` BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE `ToolRefundCase` (
 `id` VARCHAR(191) NOT NULL,
 `orderId` VARCHAR(32) NOT NULL,
 `userId` VARCHAR(191) NOT NULL,
 `reason` VARCHAR(500) NOT NULL,
 `status` ENUM('OPEN','REJECTED','PROCESSING','SUCCEEDED','FAILED') NOT NULL DEFAULT 'OPEN',
 `reviewerId` VARCHAR(191) NULL,
 `reviewReason` VARCHAR(500) NULL,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `reviewedAt` DATETIME(3) NULL,
 INDEX `ToolRefundCase_orderId_createdAt_idx`(`orderId`,`createdAt`),
 INDEX `ToolRefundCase_status_createdAt_idx`(`status`,`createdAt`),
 PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ToolRefundCase`
 ADD CONSTRAINT `ToolRefundCase_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `ToolOrder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `ToolRefundCase`
 ADD CONSTRAINT `ToolRefundCase_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
