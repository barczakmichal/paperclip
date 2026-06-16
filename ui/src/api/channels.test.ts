import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./client", () => ({
  api: {
    get: vi.fn((path: string) => Promise.resolve({ _path: path })),
    post: vi.fn((path: string, body: unknown) => Promise.resolve({ _path: path, _body: body })),
  },
}));

import { api } from "./client";
import { channelsApi } from "./channels";

const mockGet = api.get as ReturnType<typeof vi.fn>;
const mockPost = api.post as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("channelsApi URL paths", () => {
  it("list calls /companies/:companyId/channels", () => {
    channelsApi.list("comp-1");
    expect(mockGet).toHaveBeenCalledWith("/companies/comp-1/channels");
  });

  it("members calls /channels/:channelId/members", () => {
    channelsApi.members("ch-1");
    expect(mockGet).toHaveBeenCalledWith("/channels/ch-1/members");
  });

  it("messages calls /channels/:channelId/messages without cursor", () => {
    channelsApi.messages("ch-1");
    expect(mockGet).toHaveBeenCalledWith("/channels/ch-1/messages");
  });

  it("messages appends ?before= when cursor provided", () => {
    channelsApi.messages("ch-1", "cursor-abc");
    expect(mockGet).toHaveBeenCalledWith("/channels/ch-1/messages?before=cursor-abc");
  });

  it("post calls /channels/:channelId/messages with body", () => {
    channelsApi.post("ch-1", "Hello");
    expect(mockPost).toHaveBeenCalledWith("/channels/ch-1/messages", { body: "Hello" });
  });
});
