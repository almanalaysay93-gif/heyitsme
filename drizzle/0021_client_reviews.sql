-- Client reviews: visitors to a Business or Services card can leave a star rating and a review.
-- They are stored beside the owner's own references, unapproved until the owner approves them.
-- Additive: existing rows keep "rating" empty and "fromVisitor" false, so nothing changes for them.
alter table "references" add column if not exists "rating" integer;
alter table "references" add column if not exists "fromVisitor" boolean default false not null;
