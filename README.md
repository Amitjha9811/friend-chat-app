# FriendChat
Next.js + Supabase realtime group chat starter.

1. `npm install`
2. Create a Supabase project.
3. Run `supabase/schema.sql` in Supabase SQL Editor.
4. Copy `.env.example` to `.env.local` and add your Supabase URL and anon key.
5. Run `npm run dev`.
6. Deploy to Vercel and add the same environment variables.

Do not expose a Supabase service-role key in frontend code.
