CREATE TABLE "picks" (
	"id" serial PRIMARY KEY NOT NULL,
	"month" varchar(7) NOT NULL,
	"vote_month" varchar(7) NOT NULL,
	"project_id" integer NOT NULL,
	"vote_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "picks_month_unique" UNIQUE("month"),
	CONSTRAINT "picks_vote_month_unique" UNIQUE("vote_month"),
	CONSTRAINT "picks_month_format" CHECK ("picks"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "picks_vote_month_format" CHECK ("picks"."vote_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "picks_vote_count_positive" CHECK ("picks"."vote_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"github_repo_id" text NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"stars" integer DEFAULT 0 NOT NULL,
	"language" text,
	"last_push_at" timestamp with time zone,
	"funding_links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"nominated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_github_repo_id_unique" UNIQUE("github_repo_id"),
	CONSTRAINT "projects_status_check" CHECK ("projects"."status" in ('pending', 'approved', 'removed'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"github_id" text NOT NULL,
	"login" text NOT NULL,
	"avatar_url" text,
	"github_created_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_github_id_unique" UNIQUE("github_id")
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"month" varchar(7) NOT NULL,
	"reason" varchar(140),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "votes_month_format" CHECK ("votes"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
ALTER TABLE "picks" ADD CONSTRAINT "picks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_nominated_by_users_id_fk" FOREIGN KEY ("nominated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_slug_idx" ON "projects" USING btree (lower("owner"),lower("name"));--> statement-breakpoint
CREATE INDEX "projects_nominated_by_idx" ON "projects" USING btree ("nominated_by","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "votes_one_per_user_per_month" ON "votes" USING btree ("user_id","month");--> statement-breakpoint
CREATE INDEX "votes_month_project_idx" ON "votes" USING btree ("month","project_id");