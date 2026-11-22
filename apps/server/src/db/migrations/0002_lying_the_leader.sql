ALTER TABLE `user` ADD `terms_accepted` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `privacy_accepted` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `adult_confirmed` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `authorized_caregiver` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `tos_accepted_at` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `tos_version` text NOT NULL;