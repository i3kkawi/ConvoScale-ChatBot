import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { prisma } from "../db";

// Integration tests against the real Postgres started by docker-compose.
// Run `npm run prisma:seed` first so the "hello" keyword resolves to a
// known bot reply.

const app = createApp();

const email = `msg-test-${Date.now()}@example.com`;
const password = "correct-horse-battery-staple";
let token: string;
let conversationId: string;

beforeAll(async () => {
  await request(app).post("/auth/register").send({ email, password });
  const login = await request(app).post("/auth/login").send({ email, password });
  token = login.body.data.token;

  const conv = await request(app)
    .post("/conversations")
    .set("Authorization", `Bearer ${token}`)
    .send({ title: "Messaging test" });
  conversationId = conv.body.data.conversation.id;
});

afterAll(async () => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) await prisma.user.delete({ where: { id: user.id } }); // cascades conversations/messages
  await prisma.$disconnect();
});

describe("sending a message", () => {
  it("creates both a user message and a bot reply atomically", async () => {
    const res = await request(app)
      .post(`/conversations/${conversationId}/messages`)
      .set("Authorization", `Bearer ${token}`)
      .send({ body: "hello there" });

    expect(res.status).toBe(201);
    expect(res.body.data.userMessage.body).toBe("hello there");
    expect(res.body.data.botMessage.sender).toBe("BOT");
  });

  it("bumps the conversation's lastMessageAt", async () => {
    const res = await request(app)
      .get(`/conversations/${conversationId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.body.data.conversation.lastMessageAt).not.toBeNull();
  });

  it("rejects sending into a conversation you don't own", async () => {
    const otherEmail = `msg-other-${Date.now()}@example.com`;
    await request(app).post("/auth/register").send({ email: otherEmail, password });
    const otherLogin = await request(app).post("/auth/login").send({ email: otherEmail, password });

    const res = await request(app)
      .post(`/conversations/${conversationId}/messages`)
      .set("Authorization", `Bearer ${otherLogin.body.data.token}`)
      .send({ body: "should not work" });

    expect(res.status).toBe(404);
    await prisma.user.delete({ where: { email: otherEmail } });
  });
});

describe("idempotency under real concurrency", () => {
  const requestId = `dup-${Date.now()}`;

  it("returns the same message pair when the same requestId is sent twice sequentially", async () => {
    const first = await request(app)
      .post(`/conversations/${conversationId}/messages`)
      .set("Authorization", `Bearer ${token}`)
      .send({ body: "duplicate test", requestId });

    const second = await request(app)
      .post(`/conversations/${conversationId}/messages`)
      .set("Authorization", `Bearer ${token}`)
      .send({ body: "duplicate test", requestId });

    expect(first.body.data.userMessage.id).toBe(second.body.data.userMessage.id);
    expect(second.body.data.deduplicated).toBe(true);

    const count = await prisma.message.count({ where: { requestId } });
    expect(count).toBe(1); // exactly one user message, never two
  });

  it("still creates exactly one message when two truly simultaneous requests share a requestId", async () => {
    const raceRequestId = `race-${Date.now()}`;

    const [a, b] = await Promise.all([
      request(app)
        .post(`/conversations/${conversationId}/messages`)
        .set("Authorization", `Bearer ${token}`)
        .send({ body: "race condition test", requestId: raceRequestId }),
      request(app)
        .post(`/conversations/${conversationId}/messages`)
        .set("Authorization", `Bearer ${token}`)
        .send({ body: "race condition test", requestId: raceRequestId }),
    ]);

    expect([a.status, b.status]).toEqual(expect.arrayContaining([201]));
    expect(a.body.data.userMessage.id).toBe(b.body.data.userMessage.id);

    const count = await prisma.message.count({ where: { requestId: raceRequestId } });
    expect(count).toBe(1); // the DB unique constraint is what actually guarantees this
  });
});

describe("message ordering and pagination", () => {
  it("returns messages newest-first with a working cursor", async () => {
    // Five more sends on top of the ones above, so there's enough history to page through.
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post(`/conversations/${conversationId}/messages`)
        .set("Authorization", `Bearer ${token}`)
        .send({ body: `message ${i}` });
    }

    const firstPage = await request(app)
      .get(`/conversations/${conversationId}/messages?limit=3`)
      .set("Authorization", `Bearer ${token}`);

    expect(firstPage.body.data.length).toBe(3);
    expect(firstPage.body.pagination.nextCursor).toBeTypeOf("string");

    const timestamps = firstPage.body.data.map((m: any) => new Date(m.createdAt).getTime());
    expect(timestamps[0]).toBeGreaterThanOrEqual(timestamps[1]);
    expect(timestamps[1]).toBeGreaterThanOrEqual(timestamps[2]);

    const secondPage = await request(app)
      .get(`/conversations/${conversationId}/messages?limit=3&cursor=${firstPage.body.pagination.nextCursor}`)
      .set("Authorization", `Bearer ${token}`);

    const firstIds = new Set(firstPage.body.data.map((m: any) => m.id));
    const overlap = secondPage.body.data.filter((m: any) => firstIds.has(m.id));
    expect(overlap.length).toBe(0); // no page overlap
  });
});
