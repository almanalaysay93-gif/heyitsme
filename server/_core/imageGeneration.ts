export type GenerateImageOptions = {
  prompt: string;
  originalImages?: Array<{
    url?: string;
    b64Json?: string;
    mimeType?: string;
  }>;
  model?: string;
  quality?: string;
};

export type GenerateImageResponse = {
  url?: string;
};

export type ImageModelInfo = {
  model?: string;
  id?: string;
};

export type ListImageModelsResponse = {
  models: ImageModelInfo[];
};

/**
 * TODO(rebuild): Implement with OpenAI Images or fal.ai and set OPENAI_API_KEY or FAL_KEY.
 */
export async function generateImage(
  _options: GenerateImageOptions
): Promise<GenerateImageResponse> {
  throw new Error(
    "[stub] Image generation not wired since Manus removal. See docs/plans/2026-09-23-remove-manus-design.md - implement with OpenAI Images or fal.ai and set OPENAI_API_KEY or FAL_KEY."
  );
}

export async function listImageModels(): Promise<ListImageModelsResponse> {
  throw new Error(
    "[stub] List image models not wired since Manus removal. See docs/plans/2026-09-23-remove-manus-design.md - implement with OpenAI Images or fal.ai and set OPENAI_API_KEY or FAL_KEY."
  );
}
