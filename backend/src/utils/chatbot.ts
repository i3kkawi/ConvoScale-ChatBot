import { prisma } from "../db";
import { cacheGet, cacheSet } from "./cache";

const DEFAULT_RESPONSE = "I'm not sure how to respond to that yet. Try saying \"hello\" or \"help\".";
const CACHE_KEY = "chatbot:responses";
const CACHE_TTL_SECONDS = 300; // 5 minutes — responses change rarely, so a short-ish TTL is
                                // simpler than wiring up cache invalidation on every write path.

interface CachedResponse {
  keyword: string;
  response: string;
}

async function loadResponses(): Promise<CachedResponse[]> {
  const cached = await cacheGet<CachedResponse[]>(CACHE_KEY);
  if (cached) return cached;

  const rows = await prisma.chatbotResponse.findMany({
    select: { keyword: true, response: true },
  });
  await cacheSet(CACHE_KEY, rows, CACHE_TTL_SECONDS);
  return rows;
}

// Deliberately simple and explainable: lowercase the message, look for any
// stored keyword contained in it. This exists to generate realistic backend
// traffic, not to demonstrate NLP.
export async function getChatbotResponse(userText: string): Promise<string> {
  const normalized = userText.toLowerCase();
  const candidates = await loadResponses();
  const match = candidates.find((c) => normalized.includes(c.keyword.toLowerCase()));
  return match?.response ?? DEFAULT_RESPONSE;
}
