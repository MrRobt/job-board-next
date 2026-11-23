-- U01: unverified by default. Existing accounts are NOT silently grandfathered.
-- Operator must authorize mail delivery and an existing-account verification rollout before deployment.
ALTER TABLE `User` ADD COLUMN `emailVerifiedAt` DATETIME(3) NULL;

CREATE TABLE `EmailVerificationToken` (
  `tokenHash` CHAR(64) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `EmailVerificationToken_userId_key`(`userId`),
  INDEX `EmailVerificationToken_expiresAt_idx`(`expiresAt`),
  PRIMARY KEY (`tokenHash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `EmailVerificationToken`
  ADD CONSTRAINT `EmailVerificationToken_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
