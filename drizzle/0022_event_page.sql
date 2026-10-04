-- Event landing page: the look, section layout and section content (schedule, speakers, gallery, sponsors,
-- questions, links) of an event page, as one JSON value. See shared/eventPage.ts.
-- Empty for every existing event, which means the default page with that event's old button color and font.
-- The old "design" column is left as it is: nothing is deleted.
alter table "workspaceEvents" add column if not exists "page" jsonb;
