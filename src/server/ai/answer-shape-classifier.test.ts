import { describe, expect, it } from "vitest";
import {
  classifyTurnAnswerShapes,
  type AnswerShapeClient,
} from "@/server/ai/answer-shape-classifier";

function fakeClient(outputParsed: unknown, requests: unknown[] = []): AnswerShapeClient {
  return {
    responses: {
      parse: async (input) => {
        requests.push(input);
        return { output_parsed: outputParsed };
      },
    },
  };
}

function throwingClient(): AnswerShapeClient {
  return {
    responses: { parse: async () => { throw new Error("provider down"); } },
  };
}

const turns = [
  { prompt: "Which ice cream is the best: vanilla, strawberry, or chocolate?", targetExample: "I think vanilla ice cream is the best." },
  { prompt: "How do you say hello in English?", targetExample: "Hello." },
];

describe("classifyTurnAnswerShapes", () => {
  it("returns per-turn shapes from the model output", async () => {
    const result = await classifyTurnAnswerShapes(
      { turns },
      { apiKey: "test", client: fakeClient({ shapes: ["open", "fixed"] }) },
    );
    expect(result).toEqual(["open", "fixed"]);
  });

  it("defaults every turn to open when the provider throws", async () => {
    const result = await classifyTurnAnswerShapes(
      { turns },
      { apiKey: "test", client: throwingClient() },
    );
    expect(result).toEqual(["open", "open"]);
  });

  it("defaults to open when output is junk or wrong length", async () => {
    const result = await classifyTurnAnswerShapes(
      { turns },
      { apiKey: "test", client: fakeClient({ shapes: ["fixed"] }) },
    );
    expect(result).toEqual(["open", "open"]);
  });

  it("defaults to open when no api key is configured", async () => {
    const result = await classifyTurnAnswerShapes(
      { turns },
      { apiKey: "", client: fakeClient({ shapes: ["fixed", "fixed"] }) },
    );
    expect(result).toEqual(["open", "open"]);
  });

  it("returns [] for no turns without calling the provider", async () => {
    const requests: unknown[] = [];
    const result = await classifyTurnAnswerShapes(
      { turns: [] },
      { apiKey: "test", client: fakeClient({ shapes: [] }, requests) },
    );
    expect(result).toEqual([]);
    expect(requests).toHaveLength(0);
  });
});
