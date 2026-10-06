import { createClient } from "@/lib/supabase/server";
import Chat from "../components/Chat";
import Auth from "../components/Auth";

export default async function Home() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ? <Chat user={user} /> : <Auth />;
}
