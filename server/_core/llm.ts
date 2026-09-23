import Anthropic from "@anthropic-ai/sdk";
import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?:
      | "audio/mpeg"
      | "audio/wav"
      | "application/pdf"
      | "audio/mp4"
      | "video/mp4";
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  model?: string;
  thinking?: Record<string, unknown>;
  reasoning?: Record<string, unknown>;
};

export type ModelInfo = {
  id: string;
  object: string;
  created: number;
  owned_by: string;
};

export type ModelsResponse = {
  object: string;
  data: ModelInfo[];
};

export function getAnthropicClient(): Anthropic {
  if (!ENV.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  return new Anthropic({ apiKey: ENV.anthropicApiKey });
}

export function formatContentString(
  content: MessageContent | MessageContent[]
): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === "string") return part;
        if (part.type === "text") return part.text;
        return "";
      })
      .join("\n");
  }
  if (content.type === "text") return content.text;
  return "";
}

export function translateMessagesToAnthropic(messages: Message[]): {
  systemPrompt?: string;
  anthropicMessages: Anthropic.MessageParam[];
} {
  const systemParts: string[] = [];
  const anthropicMessages: Anthropic.MessageParam[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      const text = formatContentString(msg.content);
      if (text) systemParts.push(text);
      continue;
    }

    if (msg.role === "tool" || msg.role === "function") {
      const text = formatContentString(msg.content);
      anthropicMessages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: msg.tool_call_id || "call_unknown",
            content: text,
          },
        ],
      });
      continue;
    }

    if (msg.role === "assistant") {
      const text = formatContentString(msg.content);
      anthropicMessages.push({
        role: "assistant",
        content: text || "",
      });
      continue;
    }

    // User message
    if (typeof msg.content === "string") {
      anthropicMessages.push({
        role: "user",
        content: msg.content,
      });
    } else if (Array.isArray(msg.content)) {
      const blocks: Anthropic.ContentBlockParam[] = [];
      for (const part of msg.content) {
        if (typeof part === "string") {
          blocks.push({ type: "text", text: part });
        } else if (part.type === "text") {
          blocks.push({ type: "text", text: part.text });
        }
      }
      anthropicMessages.push({
        role: "user",
        content: blocks.length > 0 ? blocks : "",
      });
    } else if (msg.content.type === "text") {
      anthropicMessages.push({
        role: "user",
        content: msg.content.text,
      });
    }
  }

  return {
    systemPrompt: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
    anthropicMessages,
  };
}

export function translateToolsToAnthropic(
  tools?: Tool[]
): Anthropic.Tool[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools.map(t => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: (t.function.parameters as Anthropic.Tool.InputSchema) || {
      type: "object",
      properties: {},
    },
  }));
}

export function translateToolChoiceToAnthropic(
  toolChoice?: ToolChoice,
  tools?: Tool[]
): Anthropic.MessageCreateParams["tool_choice"] | undefined {
  if (!toolChoice) return undefined;

  if (toolChoice === "auto") {
    return { type: "auto" };
  }
  if (toolChoice === "none") {
    return undefined;
  }
  if (toolChoice === "required") {
    return { type: "any" };
  }
  if ("name" in toolChoice) {
    return { type: "tool", name: toolChoice.name };
  }
  if ("type" in toolChoice && toolChoice.type === "function") {
    return { type: "tool", name: toolChoice.function.name };
  }
  return undefined;
}

export function translateAnthropicResponseToInvokeResult(
  response: Anthropic.Message
): InvokeResult {
  const toolCalls: ToolCall[] = [];
  const textParts: string[] = [];

  for (const block of response.content) {
    if (block.type === "text") {
      textParts.push(block.text);
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        type: "function",
        function: {
          name: block.name,
          arguments:
            typeof block.input === "string"
              ? block.input
              : JSON.stringify(block.input),
        },
      });
    }
  }

  let finishReason: string | null = null;
  if (response.stop_reason === "tool_use") {
    finishReason = "tool_calls";
  } else if (response.stop_reason === "end_turn") {
    finishReason = "stop";
  } else if (response.stop_reason === "max_tokens") {
    finishReason = "length";
  } else {
    finishReason = response.stop_reason ?? null;
  }

  const promptTokens = response.usage?.input_tokens ?? 0;
  const completionTokens = response.usage?.output_tokens ?? 0;

  return {
    id: response.id,
    created: Math.floor(Date.now() / 1000),
    model: response.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: textParts.join("\n"),
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: finishReason,
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  };
}

export async function invokeLLM(
  params: InvokeParams,
  clientOverride?: Anthropic
): Promise<InvokeResult> {
  const client = clientOverride ?? getAnthropicClient();

  const model =
    params.model && params.model.startsWith("claude-")
      ? params.model
      : "claude-sonnet-5";

  const { systemPrompt, anthropicMessages } = translateMessagesToAnthropic(
    params.messages
  );

  const tools = translateToolsToAnthropic(params.tools);
  const toolChoice = translateToolChoiceToAnthropic(
    params.toolChoice || params.tool_choice,
    params.tools
  );

  const maxTokens = params.max_tokens ?? params.maxTokens ?? 4096;

  const requestPayload: Anthropic.MessageCreateParams = {
    model,
    max_tokens: maxTokens,
    messages: anthropicMessages,
    ...(systemPrompt ? { system: systemPrompt } : {}),
    ...(tools && tools.length > 0 ? { tools } : {}),
    ...(toolChoice ? { tool_choice: toolChoice } : {}),
  };

  const response = await client.messages.create(requestPayload);

  return translateAnthropicResponseToInvokeResult(response);
}

export async function listLLMModels(): Promise<ModelsResponse> {
  const client = getAnthropicClient();
  try {
    const list = await client.models.list();
    return {
      object: "list",
      data: list.data.map(m => ({
        id: m.id,
        object: "model",
        created: Math.floor(Date.parse(m.created_at) / 1000) || Date.now(),
        owned_by: "anthropic",
      })),
    };
  } catch {
    return {
      object: "list",
      data: [
        {
          id: "claude-sonnet-5",
          object: "model",
          created: Date.now(),
          owned_by: "anthropic",
        },
        {
          id: "claude-3-7-sonnet-20250219",
          object: "model",
          created: Date.now(),
          owned_by: "anthropic",
        },
        {
          id: "claude-3-5-sonnet-20241022",
          object: "model",
          created: Date.now(),
          owned_by: "anthropic",
        },
        {
          id: "claude-3-5-haiku-20241022",
          object: "model",
          created: Date.now(),
          owned_by: "anthropic",
        },
      ],
    };
  }
}
