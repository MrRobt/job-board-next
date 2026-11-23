-- U01: separate one-use password recovery from account email verification.
-- No existing account is changed or implicitly verified by this migration.
CREATE TABLE `PasswordResetToken` (
  `tokenHash` CHAR(64) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `PasswordResetToken_userId_key`(`userId`),
  INDEX `PasswordResetToken_expiresAt_idx`(`expiresAt`),
  PRIMARY KEY (`tokenHash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `PasswordResetToken`
  ADD CONSTRAINT `PasswordResetToken_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
