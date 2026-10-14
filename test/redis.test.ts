/*
    REDIS TESTS - verify startup helpers fail when the connection cannot be established.
*/

import assert from "node:assert/strict";
import test from "node:test";

import { connectRedis } from "../src/redis";

test("connectRedis rejects when the client cannot connect", async () => {
    const fakeClient = {
        isOpen: false,
        connect: async () => {
            throw new Error("redis unavailable");
        },
        ping: async () => "PONG",
        quit: async () => "OK",
    };

    await assert.rejects(connectRedis(fakeClient as never), /redis unavailable/);
});
