import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

const RESPONSES: { keyword: string; response: string }[] = [
  { keyword: "hello", response: "Hi there! How can I help you today?" },
  { keyword: "hi", response: "Hello! What can I do for you?" },
  { keyword: "help", response: "You can ask about pricing, hours, or just say hi." },
  { keyword: "pricing", response: "Pricing details are on our pricing page — anything specific I can look up?" },
  { keyword: "hours", response: "We're available 9am to 6pm, Monday through Friday." },
  { keyword: "bye", response: "Goodbye! Have a great day." },
  { keyword: "thanks", response: "You're welcome!" },
];

async function main() {
  for (const r of RESPONSES) {
    await prisma.chatbotResponse.upsert({
      where: { keyword: r.keyword },
      update: { response: r.response },
      create: r,
    });
  }
  await redis.del("chatbot:responses");
  // eslint-disable-next-line no-console
  console.log(`Seeded ${RESPONSES.length} chatbot responses.`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    redis.disconnect();
  });
