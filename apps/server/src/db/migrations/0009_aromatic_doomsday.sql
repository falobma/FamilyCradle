CREATE TABLE `growth_photo` (
	`measurement_id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	FOREIGN KEY (`measurement_id`) REFERENCES `growth_measurement`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `growth_measurement` ADD `has_photo` integer DEFAULT false NOT NULL;