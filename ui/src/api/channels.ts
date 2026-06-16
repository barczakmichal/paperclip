import type { Channel, ChannelMessage, ChannelMemberStatus } from "@paperclipai/shared";
import { api } from "./client";

export const channelsApi = {
  list: (companyId: string) => api.get<Channel[]>(`/companies/${companyId}/channels`),
  members: (channelId: string) => api.get<ChannelMemberStatus[]>(`/channels/${channelId}/members`),
  messages: (channelId: string, before?: string) =>
    api.get<ChannelMessage[]>(`/channels/${channelId}/messages${before ? `?before=${before}` : ""}`),
  post: (channelId: string, body: string) =>
    api.post<ChannelMessage>(`/channels/${channelId}/messages`, { body }),
};
