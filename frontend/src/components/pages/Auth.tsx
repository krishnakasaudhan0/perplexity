import { createClient } from "@/lib/supabase/client";
import { Compass } from "lucide-react";

const supabase = createClient();

export default function Auth() {
  async function login(provider: "github" | "google") {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: provider,
        options: {
          redirectTo: window.location.origin,
        }
      });
      if (error) throw error;
    } catch (error) {
      console.error("Authentication error:", error);
      alert("Failed to authenticate. Please try again.");
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-[#E8E8E8] px-4 select-none">
      <div className="w-full max-w-sm p-8 rounded-3xl bg-[#0A0A0A] border border-neutral-900 shadow-2xl flex flex-col items-center text-center space-y-6 relative overflow-hidden">
        {/* Neon blur accent */}
        <div className="absolute -left-12 -top-12 w-36 h-36 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        
        {/* Branding header */}
        <div className="flex flex-col items-center space-y-2.5 z-10">
          <div className="p-3.5 rounded-2xl bg-neutral-900 border border-neutral-800 text-neutral-300">
            <Compass className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white font-serif">Perplexity Console</h1>
          <p className="text-xs text-neutral-500 max-w-[240px]">
            Sign in to search the web and manage your threads.
          </p>
        </div>

        {/* OAuth Buttons */}
        <div className="w-full flex flex-col gap-2.5 z-10 pt-2">
          <button
            onClick={() => login("google")}
            className="flex items-center justify-center gap-2.5 w-full py-3 px-4 rounded-xl text-xs font-semibold bg-[#121212] hover:bg-[#181818] border border-neutral-800 hover:border-neutral-700 text-neutral-300 hover:text-white active:scale-[0.98] transition-all cursor-pointer"
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-6.887 4.114-4.694 0-8.503-3.809-8.503-8.503s3.809-8.503 8.503-8.503c2.202 0 4.217.829 5.751 2.363l3.079-3.079C17.906 1.83 15.224 1 12.24 1 5.922 1 1 5.922 1 12s4.922 11 11.24 11c5.878 0 11.24-4.238 11.24-11.24 0-.765-.082-1.53-.24-2.285l-11 1e-5z"/>
            </svg>
            Continue with Google
          </button>
          <button
            onClick={() => login("github")}
            className="flex items-center justify-center gap-2.5 w-full py-3 px-4 rounded-xl text-xs font-semibold bg-[#121212] hover:bg-[#181818] border border-neutral-800 hover:border-neutral-700 text-neutral-300 hover:text-white active:scale-[0.98] transition-all cursor-pointer"
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
            </svg>
            Continue with GitHub
          </button>
        </div>

        <div className="text-[10px] text-neutral-600 z-10 pt-4">
          By signing in, you agree to our Terms and Privacy Policy.
        </div>
      </div>
    </div>
  );
}
