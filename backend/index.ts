import express from "express";
import { tavily } from "@tavily/core";
import { SYSTEM_PROMPT, PROMPT_TEMPLATE } from "./prompt";
import { streamText } from "ai";
import { prisma } from "./db";

// #region agent log
const debugLog = (location: string, message: string, data: Record<string, unknown>, hypothesisId: string) => {
  fetch('http://127.0.0.1:7833/ingest/7f676e1c-b05f-4680-8c7d-f7380404a8f7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'22c8c9'},body:JSON.stringify({sessionId:'22c8c9',location,message,data,timestamp:Date.now(),hypothesisId})}).catch(()=>{});
};
// #endregion

// #region agent log
debugLog('index.ts:startup', 'Module loaded, env keys present', {
  hasTavilyKey: Boolean(process.env.TAVILY_API_KEY),
  hasGatewayKey: Boolean(process.env.AI_GATEWAY_API_KEY),
  promptTemplateLength: PROMPT_TEMPLATE.length,
}, 'H1');
// #endregion

const client = tavily({
    apiKey: process.env.TAVILY_API_KEY,
});
const app = express();

app.use(express.json());

const res=await prisma.user.create({
    data:{
        email: "krishna@14.com",
        provider:"Github",
        name: "krishna"
        
    }
})
console.log(res);



app.get("/conversations",async(req,res)=>{

})

app.post("/conversation/:conversationId",async(req,res)=>{

})


app.post("/ask",async (req, res) => {
  // #region agent log
  debugLog('index.ts:handler-entry', 'Request received', { hasQuery: Boolean(req.body?.query) }, 'H2');
  // #endregion

  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: "Query is required" });
    }

    const websearchresponse = await client.search(query, {
      searchDepth: "advanced",
    });

    const websearchresults = websearchresponse.results;

    // #region agent log
    debugLog('index.ts:tavily-done', 'Tavily search completed', {
      resultCount: websearchresults?.length ?? 0,
    }, 'H2');
    // #endregion

    const prompt = PROMPT_TEMPLATE
      .replace("{WEB_SEARCH_RESULT}", JSON.stringify(websearchresults))
      .replace("{USER_QUERY}", query);

    const result = streamText({
      model: 'openai/gpt-3.5-turbo',
      prompt,
      system: SYSTEM_PROMPT,
    });

    res.header('Cache-Control', 'no-cache');
    res.header('Content-Type', 'text/event-stream');

    let chunkCount = 0;
    for await (const textPart of result.textStream) {
      chunkCount++;
      res.write(textPart);
    }

    // #region agent log
    debugLog('index.ts:stream-done', 'LLM stream completed', { chunkCount }, 'H3');
    // #endregion
    res.write("\n<SOURCES>\n");

    websearchresults.forEach((source) => res.write(JSON.stringify(source)));


    res.write("\n</SOURCES>\n");
    res.end();
  } catch (error) {
    // #region agent log
    debugLog('index.ts:handler-error', 'Request failed', {
      errorName: error instanceof Error ? error.name : 'unknown',
      errorMessage: error instanceof Error ? error.message : String(error),
    }, 'H2');
    // #endregion

    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    } else {
      res.end();
    }
  }
});






app.post("/ask/follow_up",async(req,res)=>{

})


app.listen(3001, () => {
  console.log("Server is running on port 3000");
});