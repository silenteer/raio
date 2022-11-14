import type { NatsService } from "@silenteer/natsu-type";

export type HelloService = NatsService<"hello", { msg: string }, { msg: string}>
export type ErrorService = NatsService<"error", void, void>