-- Chat messages scoped to a season.
-- Writes go through the API (service role). Realtime reads use the anon key,
-- so SELECT is open — chat content is not sensitive for this private group app.

CREATE TABLE public.chat_messages (
  message_id   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id    uuid        NOT NULL REFERENCES public.seasons(season_id) ON DELETE CASCADE,
  entrant_id   uuid        NOT NULL,
  display_name text        NOT NULL,
  body         text        NOT NULL CHECK (char_length(body) >= 1 AND char_length(body) <= 500),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX chat_messages_season_created_idx
  ON public.chat_messages (season_id, created_at DESC);

-- Enable Realtime so clients can subscribe to INSERT events.
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
