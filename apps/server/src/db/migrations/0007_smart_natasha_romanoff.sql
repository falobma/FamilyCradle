ALTER TABLE `mpasi_food` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `mpasi_food` ADD `rev` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `mpasi_food` ADD `deleted_at` text;