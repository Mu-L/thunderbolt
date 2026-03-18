CREATE TABLE "encryption_setup" (
	"user_id" text PRIMARY KEY NOT NULL,
	"canary_version" text NOT NULL,
	"canary_iv" text NOT NULL,
	"canary_ciphertext" text NOT NULL,
	"salt" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "encryption_setup" ADD CONSTRAINT "encryption_setup_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;