CREATE TABLE `coupon_types` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `deals` ADD `coupon_type_id` text REFERENCES `coupon_types`(`id`) ON UPDATE no action ON DELETE set null;