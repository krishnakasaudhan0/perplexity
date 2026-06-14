import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    "https://owhtgsweeriugzrtzzws.supabase.co",
  "sb_publishable_gZydvbZwsSjxX8EgskdcFw_CYgULpYD",
);

export default function Auth() {
  async function login(provider: "github" | "google") {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: provider,
    });
    if (error) {
      alert("error ");
    } else {
      alert("sign in succesfullly");
    }
  }

  return (
    <div>
      <button onClick={() => login("google")}>login with google</button>
      <button onClick={() => login("github")}>login with github</button>
    </div>
  );
}
