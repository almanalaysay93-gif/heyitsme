CREATE TABLE `references` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cardId` int NOT NULL,
	`ownerUserId` int NOT NULL,
	`clientName` varchar(160) NOT NULL,
	`clientRole` varchar(160),
	`company` varchar(160),
	`quote` text NOT NULL,
	`avatarUrl` text,
	`approved` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `references_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `cards` ADD `portfolio` text;--> statement-breakpoint
ALTER TABLE `cards` ADD `channels` text;