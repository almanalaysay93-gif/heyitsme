CREATE TABLE `analyticsEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cardId` int NOT NULL,
	`type` enum('view','save') NOT NULL,
	`meta` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analyticsEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerUserId` int NOT NULL,
	`displayName` varchar(160) NOT NULL,
	`title` varchar(160) NOT NULL,
	`company` varchar(160),
	`email` varchar(320),
	`phone` varchar(64),
	`location` varchar(160),
	`bio` text,
	`links` text,
	`theme` text,
	`logoUrl` text,
	`slug` varchar(120) NOT NULL,
	`published` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cards_id` PRIMARY KEY(`id`),
	CONSTRAINT `cards_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerUserId` int NOT NULL,
	`cardId` int,
	`name` varchar(160) NOT NULL,
	`email` varchar(320),
	`phone` varchar(64),
	`company` varchar(160),
	`title` varchar(160),
	`tags` text,
	`notes` text,
	`source` enum('share','exchange_form','manual','scan') NOT NULL DEFAULT 'exchange_form',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contacts_id` PRIMARY KEY(`id`)
);
