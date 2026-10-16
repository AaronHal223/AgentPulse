/** A tool the model can call that our own code handles (save a profile, report listings). */
export type ToolSpec = {
  name: string;
  description: string;
  /** JSON schema of the tool's input object. */
  schema: Record<string, unknown>;
};

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type ClientToolHandler = (
  name: string,
  input: unknown,
) => Promise<{ result: string; stop?: boolean }>;

export type AgentRequest = {
  system: string;
  messages: ChatTurn[];
  tools: ToolSpec[];
  /** Web access for this request. Leave out for none. */
  web?: { searches: number; pageReads: number };
  onClientTool?: ClientToolHandler;
  maxTokens?: number;
  maxSteps?: number;
  /**
   * The tool that carries the final structured answer (e.g. report_listings). The model is made
   * to call it exactly once before the request ends.
   */
  finalTool?: string;
};

export type AgentResult = {
  text: string;
  stopped: boolean;
  /**
   * Web pages the model actually looked at, when the provider reports them. Used to throw away
   * listing links the model may have made up.
   */
  sources?: string[];
};

/** A problem talking to the AI service, with a message that is safe to show the agent. */
export class AiServiceError extends Error {
  constructor(
    message: string,
    readonly busy: boolean,
  ) {
    super(message);
    this.name = "AiServiceError";
  }
}
