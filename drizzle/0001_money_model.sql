CREATE TABLE "rounds" (
	"id" serial PRIMARY KEY NOT NULL,
	"vote_month" varchar(7) NOT NULL,
	"month" varchar(7) NOT NULL,
	"funded" boolean NOT NULL,
	"balance_cents" integer DEFAULT 0 NOT NULL,
	"outstanding_cents" integer DEFAULT 0 NOT NULL,
	"operator_share_cents" integer DEFAULT 0 NOT NULL,
	"pot_cents" integer DEFAULT 0 NOT NULL,
	"winners" integer DEFAULT 0 NOT NULL,
	"operator_paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rounds_vote_month_unique" UNIQUE("vote_month"),
	CONSTRAINT "rounds_month_unique" UNIQUE("month"),
	CONSTRAINT "rounds_month_format" CHECK ("rounds"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "rounds_vote_month_format" CHECK ("rounds"."vote_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "rounds_money_nonnegative" CHECK ("rounds"."balance_cents" >= 0 and "rounds"."outstanding_cents" >= 0 and "rounds"."operator_share_cents" >= 0 and "rounds"."pot_cents" >= 0 and "rounds"."winners" >= 0)
);
--> statement-breakpoint
ALTER TABLE "picks" DROP CONSTRAINT "picks_month_unique";--> statement-breakpoint
ALTER TABLE "picks" DROP CONSTRAINT "picks_vote_month_unique";--> statement-breakpoint
ALTER TABLE "picks" ADD COLUMN "rank" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "picks" ADD COLUMN "amount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "picks" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "oc_slug" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "oc_linked_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "picks_one_project_per_round" ON "picks" USING btree ("vote_month","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "picks_one_rank_per_round" ON "picks" USING btree ("vote_month","rank");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_oc_slug_unique" UNIQUE("oc_slug");--> statement-breakpoint
ALTER TABLE "picks" ADD CONSTRAINT "picks_amount_nonnegative" CHECK ("picks"."amount_cents" >= 0);