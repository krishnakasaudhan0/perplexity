import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router";
import type { User } from "@supabase/supabase-js";
import { 
  LogOut, 
  Plus, 
  MessageSquare, 
  Trash2, 
  ArrowRight, 
  Search, 
  Compass, 
  BookOpen, 
  HelpCircle,
  ExternalLink,
  RefreshCw,
  User as UserIcon,
  Globe
} from "lucide-react";
import axios from "axios";

const supabase = createClient();

interface Message {
  id?: number;
  content: string;
  role: "User" | "Assistant";
  createdAt?: string;
  sources?: any[];
  followUps?: string[];
  isStreaming?: boolean;
}

interface Conversation {
  id: string;
  title: string | null;
  slug: string;
  messages: Message[];
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [query, setQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Streaming state
  const [streamingText, setStreamingText] = useState("");
  const [streamingSources, setStreamingSources] = useState<any[]>([]);
  const [streamingFollowUps, setStreamingFollowUps] = useState<string[]>([]);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Suggested search prompts
  const suggestions = [
    { text: "What is new in React 19?", icon: Compass },
    { text: "Explain quantum computing simply", icon: BookOpen },
    { text: "Write a python script to scrape web pages", icon: HelpCircle },
    { text: "Compare Next.js and Remix frameworks", icon: Search },
  ];

  // Auth check
  useEffect(() => {
    async function checkAuth() {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        navigate("/auth");
        return;
      }
      setUser(data.user);
      setLoading(false);
    }
    checkAuth();
  }, [navigate]);

  // Load conversations once user is set
  useEffect(() => {
    if (user) {
      fetchConversations();
    }
  }, [user]);

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConversation, streamingText]);

  async function fetchConversations() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await axios.get("http://localhost:3001/conversations", {
        headers: { Authorization: `Bearer ${session?.access_token}` }
      });
      setConversations(response.data || []);
    } catch (err) {
      console.error("Error fetching conversations:", err);
    }
  }

  async function selectConversation(id: string) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await axios.get(`http://localhost:3001/conversation/${id}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` }
      });
      
      // Parse database messages if they contain XML formats
      const conversationData: Conversation = response.data;
      if (conversationData && conversationData.messages) {
        conversationData.messages = conversationData.messages.map(msg => {
          if (msg.role === "Assistant") {
            const parsed = parseResponseContent(msg.content);
            return {
              ...msg,
              content: parsed.answers,
              followUps: parsed.followUps,
            };
          }
          return msg;
        });
      }
      setActiveConversation(conversationData);
      setStreamingText("");
      setStreamingSources([]);
      setStreamingFollowUps([]);
    } catch (err) {
      console.error("Error loading conversation:", err);
    }
  }

  async function deleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await axios.delete(`http://localhost:3001/conversation/${id}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` }
      });
      if (activeConversation?.id === id) {
        setActiveConversation(null);
      }
      fetchConversations();
    } catch (err) {
      console.error("Error deleting conversation:", err);
    }
  }

  function parseResponseContent(buffer: string) {
    let answers = "";
    let followUps: string[] = [];

    const answersMatch = buffer.match(/<ANSWERS>([\s\S]*?)(?:<\/ANSWERS>|$)/);
    if (answersMatch) {
      answers = answersMatch[1]?.trim() || "";
    } else {
      answers = buffer.split(/<[A-Z_]+>/)[0]?.trim() || "";
    }

    const questionMatches = buffer.matchAll(/<QUESTION>([\s\S]*?)<\/QUESTION>/g);
    for (const match of questionMatches) {
      if (match[1]) followUps.push(match[1].trim());
    }

    return { answers, followUps };
  }

  function parseSourcesAndConvId(buffer: string) {
    let sources: any[] = [];
    let conversationId = "";

    const sourcesMatch = buffer.match(/<SOURCES>([\s\S]*?)<\/SOURCES>/);
    if (sourcesMatch && sourcesMatch[1]) {
      const rawSources = sourcesMatch[1].trim().split("\n");
      for (const raw of rawSources) {
        try {
          if (raw.trim()) {
            sources.push(JSON.parse(raw.trim()));
          }
        } catch (e) {
          // Ignore
        }
      }
    }

    const convIdMatch = buffer.match(/<CONVERSATION_ID>([\s\S]*?)<\/CONVERSATION_ID>/);
    if (convIdMatch) {
      conversationId = convIdMatch[1]?.trim() || "";
    }

    return { sources, conversationId };
  }

  async function handleSubmit(textToSubmit: string) {
    if (!textToSubmit.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setQuery("");
    setStreamingText("");
    setStreamingSources([]);
    setStreamingFollowUps([]);

    // 1. Add temporary user message
    const userMsg: Message = { content: textToSubmit, role: "User" };
    const initialMessages = activeConversation 
      ? [...activeConversation.messages, userMsg]
      : [userMsg];
    
    // Set active conversation with user message temporarily
    setActiveConversation(prev => ({
      id: prev?.id || "temp",
      title: prev?.title || textToSubmit.slice(0, 50),
      slug: prev?.slug || "temp",
      messages: initialMessages
    }));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      // 2. Fetch the stream from the backend
      const response = await fetch("http://localhost:3001/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          query: textToSubmit,
          conversationId: activeConversation?.id === "temp" ? undefined : activeConversation?.id
        })
      });

      if (!response.ok) {
        throw new Error("Failed to send query");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let buffer = "";

      while (!done) {
        const { value, done: doneReading } = await reader!.read();
        done = doneReading;
        const chunk = decoder.decode(value, { stream: !done });
        buffer += chunk;

        // Extract answers and followups real-time
        const parsedContent = parseResponseContent(buffer);
        setStreamingText(parsedContent.answers);
        setStreamingFollowUps(parsedContent.followUps);

        // Extract sources and final conversation ID
        const parsedMeta = parseSourcesAndConvId(buffer);
        if (parsedMeta.sources.length > 0) {
          setStreamingSources(parsedMeta.sources);
        }
      }

      // Finish streaming, sync state with database
      const finalMeta = parseSourcesAndConvId(buffer);
      const newConvId = finalMeta.conversationId;

      await fetchConversations();
      if (newConvId) {
        await selectConversation(newConvId);
      } else if (activeConversation?.id) {
        await selectConversation(activeConversation.id);
      }
    } catch (err) {
      console.error("Error during streaming:", err);
      // Clean up on error
      if (activeConversation?.id === "temp") {
        setActiveConversation(null);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSignOut() {
    try {
      await supabase.auth.signOut();
      navigate("/auth");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  }

  function startNewChat() {
    setActiveConversation(null);
    setQuery("");
    setStreamingText("");
    setStreamingSources([]);
    setStreamingFollowUps([]);
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-[#E8E8E8]">
        <RefreshCw className="h-6 w-6 animate-spin text-neutral-400" />
        <p className="mt-4 text-xs text-neutral-500 font-medium">Loading console...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#050505] text-[#E8E8E8] font-sans antialiased overflow-hidden w-screen">
      {/* Sidebar Panel */}
      <aside className="hidden md:flex flex-col w-64 bg-[#0A0A0A] border-r border-neutral-900 select-none">
        {/* New Thread Trigger */}
        <div className="p-4">
          <button
            onClick={startNewChat}
            className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-[#121212] hover:bg-[#181818] border border-neutral-800 hover:border-neutral-700 text-neutral-300 hover:text-white active:scale-[0.98] transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            New Thread
          </button>
        </div>

        {/* History / Threads list */}
        <div className="flex-1 overflow-y-auto px-2 space-y-1 scrollbar-thin">
          <div className="px-3 py-2 text-[10px] font-bold text-neutral-600 uppercase tracking-wider">
            History
          </div>
          {conversations.length === 0 ? (
            <div className="px-3 py-4 text-xs text-neutral-600 text-center">
              No threads found
            </div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => selectConversation(conv.id)}
                className={`group flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                  activeConversation?.id === conv.id
                    ? "bg-[#121212] text-white border border-neutral-800"
                    : "text-neutral-500 hover:text-neutral-300 hover:bg-[#121212]/30"
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{conv.title || "Untitled Thread"}</span>
                </div>
                <button
                  onClick={(e) => deleteConversation(conv.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-destructive transition-all rounded"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* User Session Footer */}
        <div className="p-4 border-t border-neutral-900 space-y-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-neutral-900 text-neutral-400">
              <UserIcon className="h-4 w-4" />
            </div>
            <div className="truncate">
              <div className="text-xs font-semibold text-neutral-300 truncate">Account</div>
              <div className="text-[10px] text-neutral-500 font-mono truncate">{user?.email}</div>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 w-full py-2 px-3 rounded-lg text-xs font-semibold text-neutral-500 hover:text-destructive hover:bg-destructive/5 active:scale-[0.98] transition-all cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col min-h-screen relative overflow-hidden">
        {/* Mobile Header */}
        <header className="flex md:hidden items-center justify-between p-4 bg-[#0A0A0A] border-b border-neutral-900">
          <button
            onClick={startNewChat}
            className="flex items-center gap-1 text-xs font-semibold text-neutral-400"
          >
            <Plus className="h-4 w-4" /> New
          </button>
          <div className="text-xs font-bold text-white uppercase tracking-widest">
            Perplexity
          </div>
          <button
            onClick={handleSignOut}
            className="text-xs font-semibold text-neutral-500 hover:text-destructive"
          >
            Sign Out
          </button>
        </header>

        {/* Workspace Canvas */}
        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-8 w-full max-w-3xl mx-auto scrollbar-thin">
          {!activeConversation ? (
            /* Home / Search Start State */
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-8">
              <div className="space-y-3">
                <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white font-serif">
                  Where knowledge begins
                </h1>
                <p className="text-sm text-neutral-500 font-medium">
                  Ask anything and search the web in real-time.
                </p>
              </div>

              {/* Main Search Input Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSubmit(query);
                }}
                className="w-full max-w-2xl"
              >
                <div className="relative flex items-center p-3 rounded-2xl bg-[#0C0C0C] border border-neutral-800 focus-within:border-neutral-700 shadow-2xl transition-all duration-300">
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Ask anything..."
                    className="flex-1 bg-transparent border-0 outline-none text-sm text-neutral-100 placeholder-neutral-500 px-3 py-1 w-full"
                    disabled={isSubmitting}
                  />
                  <button
                    type="submit"
                    disabled={isSubmitting || !query.trim()}
                    className="p-2.5 rounded-xl bg-neutral-950 text-neutral-400 hover:text-white border border-neutral-800 hover:border-neutral-700 active:scale-95 disabled:scale-100 disabled:opacity-40 transition-all cursor-pointer"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </form>

              {/* Suggestions grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full max-w-2xl">
                {suggestions.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={index}
                      onClick={() => handleSubmit(item.text)}
                      className="flex items-center gap-3 p-4 rounded-xl border border-neutral-900/60 bg-[#0A0A0A]/45 hover:bg-[#0D0D0D] hover:border-neutral-800 text-left text-xs text-neutral-500 hover:text-neutral-200 transition-all duration-200 cursor-pointer"
                    >
                      <Icon className="h-4 w-4 text-neutral-600 shrink-0" />
                      <span className="line-clamp-1">{item.text}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Active Conversation State */
            <div className="flex flex-col space-y-8 pb-32">
              <div className="border-b border-neutral-900/80 pb-4">
                <h2 className="text-xl font-bold tracking-tight text-white">
                  {activeConversation.title || "Active Discussion"}
                </h2>
              </div>

              {/* Message List */}
              <div className="space-y-8">
                {activeConversation.messages.map((msg, index) => (
                  <div
                    key={index}
                    className={`flex flex-col gap-3 ${
                      msg.role === "User" ? "items-end" : "items-start"
                    }`}
                  >
                    {/* Role Header */}
                    <div className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest">
                      {msg.role === "User" ? "Question" : "Sources & Answer"}
                    </div>

                    {msg.role === "User" ? (
                      /* User Message Card */
                      <div className="max-w-[85%] px-4 py-3 rounded-2xl bg-[#0F0F0F] border border-neutral-900 text-sm font-medium text-neutral-200">
                        {msg.content}
                      </div>
                    ) : (
                      /* Assistant Message Block */
                      <div className="w-full space-y-4">
                        {/* Sources Citation cards */}
                        {msg.sources && msg.sources.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {msg.sources.map((src, sIdx) => (
                              <a
                                key={sIdx}
                                href={src.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0A0A0A] border border-neutral-900 hover:border-neutral-800 text-[10px] text-neutral-400 hover:text-white transition-all"
                              >
                                <Globe className="h-3 w-3 text-neutral-500 shrink-0" />
                                <span className="max-w-[120px] truncate font-medium">{src.title}</span>
                                <ExternalLink className="h-2.5 w-2.5 text-neutral-600" />
                              </a>
                            ))}
                          </div>
                        )}

                        {/* Answer Text Content */}
                        <div className="text-sm leading-relaxed text-neutral-300 whitespace-pre-wrap font-sans font-normal selection:bg-neutral-800">
                          {msg.content}
                        </div>

                        {/* Follow-up suggestion pills */}
                        {msg.followUps && msg.followUps.length > 0 && (
                          <div className="pt-4 space-y-2">
                            <div className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest">
                              Related Threads
                            </div>
                            <div className="flex flex-col gap-2">
                              {msg.followUps.map((question, qIdx) => (
                                <button
                                  key={qIdx}
                                  onClick={() => handleSubmit(question)}
                                  className="flex items-center justify-between w-full p-3 rounded-xl border border-neutral-900 bg-transparent hover:bg-[#0A0A0A] text-left text-xs text-neutral-400 hover:text-white transition-all duration-200 cursor-pointer"
                                >
                                  <span>{question}</span>
                                  <ArrowRight className="h-3.5 w-3.5 text-neutral-600 shrink-0 ml-2" />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {/* Real-time Streaming message */}
                {isSubmitting && streamingText && (
                  <div className="flex flex-col gap-3 items-start">
                    <div className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest">
                      Sources & Answer
                    </div>
                    <div className="w-full space-y-4">
                      {/* Streaming Sources */}
                      {streamingSources.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {streamingSources.map((src, sIdx) => (
                            <a
                              key={sIdx}
                              href={src.url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0A0A0A] border border-neutral-900 hover:border-neutral-800 text-[10px] text-neutral-400 hover:text-white transition-all"
                            >
                              <Globe className="h-3 w-3 text-neutral-500 shrink-0" />
                              <span className="max-w-[120px] truncate font-medium">{src.title}</span>
                              <ExternalLink className="h-2.5 w-2.5 text-neutral-600" />
                            </a>
                          ))}
                        </div>
                      )}

                      {/* Streaming Answer Text */}
                      <div className="text-sm leading-relaxed text-neutral-300 whitespace-pre-wrap font-sans font-normal selection:bg-neutral-800">
                        {streamingText}
                        <span className="inline-block w-1.5 h-4 ml-1 bg-neutral-400 animate-pulse align-middle" />
                      </div>

                      {/* Streaming Follow-up Suggestions (when fully rendered) */}
                      {streamingFollowUps.length > 0 && (
                        <div className="pt-4 space-y-2">
                          <div className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest">
                            Related Threads
                          </div>
                          <div className="flex flex-col gap-2">
                            {streamingFollowUps.map((question, qIdx) => (
                              <button
                                key={qIdx}
                                onClick={() => handleSubmit(question)}
                                className="flex items-center justify-between w-full p-3 rounded-xl border border-neutral-900 bg-transparent hover:bg-[#0A0A0A] text-left text-xs text-neutral-400 hover:text-white transition-all duration-200 cursor-pointer"
                              >
                                <span>{question}</span>
                                <ArrowRight className="h-3.5 w-3.5 text-neutral-600 shrink-0 ml-2" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* Footer input form inside active conversation */}
        {activeConversation && (
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#050505] via-[#050505]/95 to-transparent border-t border-transparent">
            <div className="max-w-2xl mx-auto w-full">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSubmit(query);
                }}
              >
                <div className="relative flex items-center p-3 rounded-2xl bg-[#0C0C0C] border border-neutral-800 focus-within:border-neutral-700 shadow-2xl transition-all duration-300">
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Ask a follow-up..."
                    className="flex-1 bg-transparent border-0 outline-none text-xs text-neutral-200 placeholder-neutral-500 px-3 py-1 w-full"
                    disabled={isSubmitting}
                  />
                  <button
                    type="submit"
                    disabled={isSubmitting || !query.trim()}
                    className="p-2.5 rounded-xl bg-neutral-950 text-neutral-400 hover:text-white border border-neutral-800 hover:border-neutral-700 active:scale-95 disabled:scale-100 disabled:opacity-40 transition-all cursor-pointer"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </form>
              <div className="text-[10px] text-center text-neutral-600 mt-2">
                Perplexity Clone • Local and Supabase Synced Database
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}