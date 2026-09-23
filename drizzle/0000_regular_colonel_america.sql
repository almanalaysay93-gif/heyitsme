CREATE TABLE "analyticsEvents" (
	"id" serial PRIMARY KEY NOT NULL,
	"cardId" integer NOT NULL,
	"type" varchar(32) NOT NULL,
	"meta" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerUserId" integer NOT NULL,
	"displayName" varchar(160) NOT NULL,
	"title" varchar(160) NOT NULL,
	"company" varchar(160),
	"email" varchar(320),
	"phone" varchar(64),
	"location" varchar(160),
	"bio" text,
	"links" text,
	"portfolio" text,
	"channels" text,
	"theme" text,
	"logoUrl" text,
	"slug" varchar(120) NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"deletedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cards_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerUserId" integer NOT NULL,
	"cardId" integer,
	"name" varchar(160) NOT NULL,
	"email" varchar(320),
	"phone" varchar(64),
	"company" varchar(160),
	"title" varchar(160),
	"tags" text,
	"notes" text,
	"source" varchar(32) DEFAULT 'exchange_form' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "references" (
	"id" serial PRIMARY KEY NOT NULL,
	"cardId" integer NOT NULL,
	"ownerUserId" integer NOT NULL,
	"clientName" varchar(160) NOT NULL,
	"clientRole" varchar(160),
	"company" varchar(160),
	"quote" text NOT NULL,
	"avatarUrl" text,
	"approved" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" varchar(16) DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
