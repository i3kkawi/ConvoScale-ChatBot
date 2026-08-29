import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../app";
import { prisma } from "../db";

// These are integration tests: they hit the real Postgres/Redis started by
// `docker compose up`. Run `npm run prisma:migrate` first so the schema
// exists. They intentionally do NOT mock the database — the whole point of
// this project is proving the real DB layer behaves correctly.

const app = createApp();

const testEmail = `test-${Date.now()}@example.com`;
const testPassword = "correct-horse-battery-staple";
let token: string;

describe("auth", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await prisma.$disconnect();
  });

  it("registers a new user", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ email: testEmail, password: testPassword });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(testEmail);
  });

  it("rejects duplicate registration", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ email: testEmail, password: testPassword });
    expect(res.status).toBe(409);
  });

  it("rejects login with wrong password", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: testEmail, password: "wrong-password" });
    expect(res.status).toBe(401);
  });

  it("logs in with correct credentials and returns a token", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: testEmail, password: testPassword });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTypeOf("string");
    token = res.body.data.token;
  });

  it("rejects protected routes without a token", async () => {
    const res = await request(app).get("/auth/me");
    expect(res.status).toBe(401);
  });

  it("allows protected routes with a valid token", async () => {
    const res = await request(app).get("/auth/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(testEmail);
  });
});

describe("conversations — authorization", () => {
  let otherToken: string;
  let conversationId: string;

  beforeAll(async () => {
    // Log in as the primary user again (token from the block above may have
    // been created in a separate process run — re-login to be safe).
    const login = await request(app)
      .post("/auth/login")
      .send({ email: testEmail, password: testPassword });
    token = login.body.data.token;

    // A second, unrelated user — used to prove ownership checks work.
    const otherEmail = `other-${Date.now()}@example.com`;
    await request(app).post("/auth/register").send({ email: otherEmail, password: testPassword });
    const otherLogin = await request(app)
      .post("/auth/login")
      .send({ email: otherEmail, password: testPassword });
    otherToken = otherLogin.body.data.token;
  });

  it("creates a conversation for the authenticated user", async () => {
    const res = await request(app)
      .post("/conversations")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Test conversation" });
    expect(res.status).toBe(201);
    conversationId = res.body.data.conversation.id;
  });

  it("blocks a different user from reading someone else's conversation", async () => {
    const res = await request(app)
      .get(`/conversations/${conversationId}`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
  });

  it("lets the owner read their own conversation", async () => {
    const res = await request(app)
      .get(`/conversations/${conversationId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.conversation.id).toBe(conversationId);
  });
});
