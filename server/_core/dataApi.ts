export type DataApiCallOptions = {
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  pathParams?: Record<string, unknown>;
  formData?: Record<string, unknown>;
};

/**
 * TODO(rebuild): Call the specific 3rd-party API directly with own credentials.
 */
export async function callDataApi(
  _apiId: string,
  _options: DataApiCallOptions = {}
): Promise<unknown> {
  throw new Error(
    "[stub] DataApi not wired since Manus removal. See docs/plans/2026-09-23-remove-manus-design.md - inline specific 3rd-party API directly."
  );
}
