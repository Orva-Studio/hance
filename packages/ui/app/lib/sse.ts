export interface SSEHandlers {
  onProgress?: (ratio: number) => void;
  onDone?: (data: Record<string, unknown>) => void;
  onError?: (message: string) => void;
}

export async function consumeSSE(response: Response, handlers: SSEHandlers): Promise<void> {
  if (!response.ok || !response.body) {
    handlers.onError?.("Request failed");
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const match = line.match(/^data: (.+)$/);
      if (!match) continue;
      let data: { progress?: number; done?: boolean; error?: string; [k: string]: unknown };
      try {
        data = JSON.parse(match[1]);
      } catch {
        handlers.onError?.("Malformed event from server");
        continue;
      }
      if (data.progress !== undefined) handlers.onProgress?.(data.progress);
      if (data.done) handlers.onDone?.(data);
      if (data.error) handlers.onError?.(data.error);
    }
  }
}
