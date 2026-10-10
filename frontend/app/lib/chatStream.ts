/**
 * Talks to the coach and hands the answer back piece by piece.
 *
 * The backend's /api/chat/stream sends one JSON event per line (NDJSON):
 *   start -> (tool_start | tool_end)* -> delta* -> done      (or: error)
 * `reset` means "throw away the text shown so far" (the coach is correcting itself).
 * If the backend is an older version without the stream route, this quietly falls back to /api/chat,
 * so the app keeps working either way.
 */
export type ToolEvent = { tool: string; args: Record<string, unknown>; result: Record<string, unknown> };

export type ChatResult = {
  reply: string;
  tool_events: ToolEvent[];
  overview?: unknown;
  recent_meals?: unknown;
};

export type ToolPhase = { name: string; args: Record<string, unknown>; phase: "start" | "end"; status?: string };

export type StreamHandlers = {
  onDelta?: (text: string) => void;
  onReset?: () => void;
  onTool?: (t: ToolPhase) => void;
};

type WireEvent =
  | { type: "start" }
  | { type: "delta"; text: string }
  | { type: "reset" }
  | { type: "tool_start"; name: string; args: Record<string, unknown> }
  | { type: "tool_end"; name: string; status?: string }
  | ({ type: "done" } & ChatResult)
  | { type: "error"; detail: string };

async function errorDetail(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({}));
  const d = (data as { detail?: unknown }).detail;
  return typeof d === "string" && d ? d : fallback;
}

async function plainChat(api: string, body: unknown, h: StreamHandlers, signal?: AbortSignal): Promise<ChatResult> {
  const res = await fetch(`${api}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(await errorDetail(res, "The coach could not reply."));
  const data = (await res.json()) as ChatResult;
  h.onDelta?.(data.reply);
  return { ...data, tool_events: data.tool_events || [] };
}

export async function streamChat(api: string, body: unknown, h: StreamHandlers = {}, signal?: AbortSignal): Promise<ChatResult> {
  const res = await fetch(`${api}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (res.status === 404 || res.status === 405) return plainChat(api, body, h, signal); // older backend
  if (!res.ok) throw new Error(await errorDetail(res, "The coach could not reply."));
  if (!res.body) return plainChat(api, body, h, signal); // browser can't stream

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: ChatResult | null = null;

  const handle = (line: string) => {
    if (!line.trim()) return;
    let ev: WireEvent;
    try {
      ev = JSON.parse(line) as WireEvent;
    } catch {
      return; // ignore a garbled line rather than failing the whole reply
    }
    switch (ev.type) {
      case "delta":
        h.onDelta?.(ev.text);
        break;
      case "reset":
        h.onReset?.();
        break;
      case "tool_start":
        h.onTool?.({ name: ev.name, args: ev.args || {}, phase: "start" });
        break;
      case "tool_end":
        h.onTool?.({ name: ev.name, args: {}, phase: "end", status: ev.status });
        break;
      case "done":
        result = { ...ev, tool_events: ev.tool_events || [] };
        break;
      case "error":
        throw new Error(ev.detail || "The coach could not reply.");
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      handle(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
    }
  }
  handle(buffer + decoder.decode());
  if (!result) throw new Error("The connection dropped before the coach finished. Please try again.");
  return result;
}

/** Friendly one-liner shown while a tool runs ("Looking up idli..."). */
export function toolStatusText(name: string, args: Record<string, unknown> = {}): string {
  const food = typeof args.item_name === "string" && args.item_name ? args.item_name : "";
  switch (name) {
    case "lookup_food":
      return food ? `Looking up ${food} in the food database…` : "Looking up your food…";
    case "log_food":
      return "Saving it to your food log…";
    case "get_today_summary":
      return "Checking today's totals…";
    case "suggest_meal":
      return "Planning a meal that fits your day…";
    case "log_water":
      return "Logging your water…";
    case "find_restaurants":
      return "Searching places near you…";
    case "set_reminder":
      return "Setting your reminder…";
    case "add_grocery_items":
    case "remove_grocery_items":
    case "get_grocery_list":
      return "Updating your grocery list…";
    case "analyze_grocery_meal":
    case "analyze_recipe":
      return "Working out the nutrition…";
    case "get_fitness_summary":
      return "Reading your activity…";
    default:
      return "Working on it…";
  }
}
