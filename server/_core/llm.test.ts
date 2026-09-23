import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import {
  invokeLLM,
  translateMessagesToAnthropic,
  translateToolsToAnthropic,
  translateToolChoiceToAnthropic,
  translateAnthropicResponseToInvokeResult,
  type InvokeParams,
  type Message,
  type Tool,
} from "./llm";

describe("llm adapter", () => {
  it("translates OpenAI-shaped messages to Anthropic format", () => {
    const messages: Message[] = [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Hello world" },
      {
        role: "assistant",
        content: "Calling tool",
      },
      {
        role: "tool",
        tool_call_id: "call_123",
        content: JSON.stringify({ result: "ok" }),
      },
    ];

    const { systemPrompt, anthropicMessages } =
      translateMessagesToAnthropic(messages);

    expect(systemPrompt).toBe("You are a helpful assistant.");
    expect(anthropicMessages).toEqual([
      { role: "user", content: "Hello world" },
      { role: "assistant", content: "Calling tool" },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "call_123",
            content: '{"result":"ok"}',
          },
        ],
      },
    ]);
  });

  it("translates tools and toolChoice to Anthropic format", () => {
    const tools: Tool[] = [
      {
        type: "function",
        function: {
          name: "get_weather",
          description: "Get current weather",
          parameters: {
            type: "object",
            properties: {
              location: { type: "string" },
            },
            required: ["location"],
          },
        },
      },
    ];

    const anthropicTools = translateToolsToAnthropic(tools);
    expect(anthropicTools).toEqual([
      {
        name: "get_weather",
        description: "Get current weather",
        input_schema: {
          type: "object",
          properties: {
            location: { type: "string" },
          },
          required: ["location"],
        },
      },
    ]);

    expect(translateToolChoiceToAnthropic("auto")).toEqual({ type: "auto" });
    expect(translateToolChoiceToAnthropic("required")).toEqual({ type: "any" });
    expect(translateToolChoiceToAnthropic({ name: "get_weather" })).toEqual({
      type: "tool",
      name: "get_weather",
    });
  });

  it("translates Anthropic response to InvokeResult", () => {
    const fakeAnthropicMessage: Anthropic.Message = {
      id: "msg_123",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-5",
      content: [
        { type: "text", text: "I can check the weather for you." },
        {
          type: "tool_use",
          id: "toolu_456",
          name: "get_weather",
          input: { location: "San Francisco" },
        },
      ],
      stop_reason: "tool_use",
      stop_sequence: null,
      usage: {
        input_tokens: 25,
        output_tokens: 35,
      },
    };

    const result =
      translateAnthropicResponseToInvokeResult(fakeAnthropicMessage);

    expect(result.id).toBe("msg_123");
    expect(result.model).toBe("claude-sonnet-5");
    expect(result.choices).toHaveLength(1);
    expect(result.choices[0].finish_reason).toBe("tool_calls");
    expect(result.choices[0].message.content).toBe(
      "I can check the weather for you."
    );
    expect(result.choices[0].message.tool_calls).toEqual([
      {
        id: "toolu_456",
        type: "function",
        function: {
          name: "get_weather",
          arguments: JSON.stringify({ location: "San Francisco" }),
        },
      },
    ]);
    expect(result.usage).toEqual({
      prompt_tokens: 25,
      completion_tokens: 35,
      total_tokens: 60,
    });
  });

  it("invokes Anthropic messages.create with default model claude-sonnet-5", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      id: "msg_mock",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-5",
      content: [{ type: "text", text: "Hello there!" }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 15 },
    });

    const mockClient = {
      messages: {
        create: mockCreate,
      },
    } as unknown as Anthropic;

    const params: InvokeParams = {
      messages: [
        { role: "system", content: "System instruction" },
        { role: "user", content: "Hi" },
      ],
    };

    const result = await invokeLLM(params, mockClient);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      messages: [{ role: "user", content: "Hi" }],
      system: "System instruction",
    });

    expect(result.choices[0].message.content).toBe("Hello there!");
    expect(result.choices[0].finish_reason).toBe("stop");
    expect(result.usage?.total_tokens).toBe(25);
  });

  it("preserves explicit claude-* model name", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      id: "msg_explicit",
      type: "message",
      role: "assistant",
      model: "claude-3-7-sonnet-20250219",
      content: [{ type: "text", text: "Answer" }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 5, output_tokens: 5 },
    });

    const mockClient = {
      messages: {
        create: mockCreate,
      },
    } as unknown as Anthropic;

    const params: InvokeParams = {
      model: "claude-3-7-sonnet-20250219",
      messages: [{ role: "user", content: "Question" }],
    };

    const result = await invokeLLM(params, mockClient);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-3-7-sonnet-20250219",
      })
    );
    expect(result.model).toBe("claude-3-7-sonnet-20250219");
  });
});
