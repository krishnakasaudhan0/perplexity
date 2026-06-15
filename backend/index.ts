import express from "express";
import { tavily } from "@tavily/core";
import { SYSTEM_PROMPT, PROMPT_TEMPLATE } from "./prompt";
import { streamText } from "ai";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { prisma } from "./db";
import { requireAuth } from "./middleware";
import cors from "cors";


const client = tavily({
  apiKey: process.env.TAVILY_API_KEY,
});
const app = express();

app.use(express.json());
app.use(cors());

// Select an active model provider based on configured API keys
function getModel() {
  if (process.env.GEMINI_API_KEY) {
    return google("gemini-1.5-flash");
  }
  if (process.env.OPENAI_API_KEY) {
    return openai("gpt-4o-mini");
  }
  return null;
}

// Generate a high-quality fallback response containing answers and follow-ups in the required XML structure
function generateFallbackSummary(query: string, results: any[]): string {
  if (!results || results.length === 0) {
    return `<ANSWERS>\nI searched the web for "${query}" but couldn't find any relevant results. Please try a different query.\n</ANSWERS>\n\n<FOLLOWUP>\n    <QUESTION>Can you search with a different keyword?</QUESTION>\n    <QUESTION>What other sources can you check?</QUESTION>\n</FOLLOWUP>`;
  }

  let summary = `<ANSWERS>\nBased on my search for "${query}", here is what I found:\n\n`;
  results.slice(0, 3).forEach((result, idx) => {
    summary += `### ${result.title || `Source ${idx + 1}`}\n`;
    summary += `${result.content || "No description available."}\n\n`;
  });
  summary += `*(Note: This is a direct search summary fallback as the AI model or gateway is currently unavailable.)*\n</ANSWERS>\n\n<FOLLOWUP>\n`;
  
  summary += `    <QUESTION>Tell me more about ${results[0]?.title || "this topic"}</QUESTION>\n`;
  if (results[1]) {
    summary += `    <QUESTION>What details are available for ${results[1]?.title}</QUESTION>\n`;
  }
  summary += `</FOLLOWUP>`;
  return summary;
}

// GET all conversations for the logged in user
app.get("/conversations", requireAuth, async (req, res) => {
  try {
    const userRecord = req.userRecord;
    const conversations = await prisma.conversation.findMany({
      where: { userId: userRecord.id },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { id: "desc" },
    });
    res.json(conversations);
  } catch (error) {
    console.error("Error fetching conversations:", error);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

// GET single conversation details
app.get("/conversation/:conversationId", requireAuth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userRecord = req.userRecord;
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId as string,
        userId: userRecord.id,
      },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }
    res.json(conversation);
  } catch (error) {
    console.error("Error fetching conversation details:", error);
    res.status(500).json({ error: "Failed to fetch conversation details" });
  }
});

// DELETE a conversation
app.delete("/conversation/:conversationId", requireAuth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userRecord = req.userRecord;

    // First delete associated messages
    await prisma.message.deleteMany({
      where: { conversationId: conversationId as string },
    });

    // Then delete the conversation itself
    await prisma.conversation.deleteMany({
      where: {
        id: conversationId as string,
        userId: userRecord.id,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting conversation:", error);
    res.status(500).json({ error: "Failed to delete conversation" });
  }
});

// POST a new query (creates or appends to a conversation, performs web search, streams LLM/fallback response)
app.post("/ask", requireAuth, async (req, res) => {
  const { query, conversationId } = req.body;
  const userRecord = req.userRecord;

  if (!query) {
    return res.status(400).json({ error: "Query is required" });
  }

  try {
    // 1. Fetch or create a conversation record
    let conversation;
    if (conversationId) {
      conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, userId: userRecord.id },
      });
    }

    if (!conversation) {
      const title = query.slice(0, 100);
      const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50)}-${Date.now()}`;
      conversation = await prisma.conversation.create({
        data: {
          title,
          slug,
          userId: userRecord.id,
        },
      });
    }

    // 2. Save User's query as a Message
    await prisma.message.create({
      data: {
        content: query,
        role: "User",
        conversationId: conversation.id,
      },
    });

    // 3. Search using Tavily
    let websearchresults: any[] = [];
    try {
      const websearchresponse = await client.search(query, {
        searchDepth: "advanced",
      });
      websearchresults = websearchresponse.results || [];
    } catch (searchError) {
      console.error("Tavily search error:", searchError);
    }

    // 4. Configure Event Stream Headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // 5. Select Model and generate/stream answer
    const model = getModel();
    let fullResponseText = "";

    if (model) {
      try {
        const prompt = PROMPT_TEMPLATE
          .replace("{WEB_SEARCH_RESULT}", JSON.stringify(websearchresults))
          .replace("{USER_QUERY}", query);

        const result = streamText({
          model,
          prompt,
          system: SYSTEM_PROMPT,
        });

        for await (const textPart of result.textStream) {
          fullResponseText += textPart;
          res.write(textPart);
        }
      } catch (llmError) {
        console.error("LLM stream error, falling back to mock summary:", llmError);
        const fallbackText = generateFallbackSummary(query, websearchresults);
        const chunks = fallbackText.match(/.{1,10}/g) || [fallbackText];
        for (const chunk of chunks) {
          fullResponseText += chunk;
          res.write(chunk);
          await new Promise((resolve) => setTimeout(resolve, 30));
        }
      }
    } else {
      // Fallback directly if no model keys configured
      console.warn("No active LLM model key found. Using search summary generator.");
      const fallbackText = generateFallbackSummary(query, websearchresults);
      const chunks = fallbackText.match(/.{1,10}/g) || [fallbackText];
      for (const chunk of chunks) {
        fullResponseText += chunk;
        res.write(chunk);
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
    }

    // 6. Write search sources in the expected XML tag
    res.write("\n<SOURCES>\n");
    websearchresults.forEach((source) => res.write(JSON.stringify(source) + "\n"));
    res.write("\n</SOURCES>\n");

    // 7. Write the active/new conversation ID
    res.write(`\n<CONVERSATION_ID>${conversation.id}</CONVERSATION_ID>\n`);

    // 8. Save Assistant's answer as a Message
    await prisma.message.create({
      data: {
        content: fullResponseText,
        role: "Assistant",
        conversationId: conversation.id,
      },
    });

    res.end();
  } catch (error) {
    console.error("Error in /ask handler:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    } else {
      res.end();
    }
  }
});

// Alias route to point to ask endpoint
app.post("/ask/follow_up", requireAuth, async (req, res) => {
  res.redirect(307, "/ask");
});

app.listen(3001, () => {
  console.log("Server is running on port 3001");
});
