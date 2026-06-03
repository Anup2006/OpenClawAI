# Ask Mode

## Question

what is inside the /modes/agent explain me properly in step by step with examples

## Answer

Below is a walk‑through of the entire *`/modes/agent`* directory.  
The mode is a small “micro‑framework” that turns a language‑model powered
experience into a **task‑oriented “agent”**: it can decide what to do,
issue calls to external tools (e.g. web‑search, summariser, formatter),
or match a sequence of actions with a final “go‑to‑end” token.

| File | Summary |
|------|---------|
| **action‑tracker.ts** | Keeps track of actions the agent has requested, enabling the orchestrator to resume or re‑plan from a checkpoint. |
| **agent‑tools.ts** | Exposes a list of built‑in helper utilities the agent may call, e.g. `search`, `summarise`, `git` commands. |
| **approval.ts** | Implements a “human‑in‑the‑loop” approval workflow. The agent can ask for permission before executing potentially dangerous actions. |
| **diff‑view.ts** | Renders the difference between two pieces of text, useful for code‑review or editing tasks. |
| **orchestrator.ts** | Glue logic: parses the LLM response, extracts the *action* from the structured edge, calls the appropriate tool, and returns the tool’s result back to the LLM for the next turn. |
| **tool‑executor.ts** | Low‑level wrapper around each tool: validates arguments, runs the function, and serialises outputs back to the LLM. |
| **types.ts** | Shared TypeScript types (e.g. `Action`, `Tool`, `TaskState`, etc.) that all other files import for type safety. |

## 1. How the *agent* works – step by step

Below is a high‑level, turn‑by‑turn flow, backed up with concrete code snippets you’ll find in the files.

| Turn | Description | Key file | Code fragment* |
|------|-------------|---------|----------------|
| **Start** | The LLM is given a `task` and starts with a minimal system prompt (from `orchestrationPrompt.md` in the root). | – | – |
| **Turn 1: Plan** | LLM outputs a descriptive *plan* in the same format as the prompt; usually a single JSON‑style snippet that lists high‑level steps. | `orchestrator.ts` | ```ts<br>const plan = JSON.parse(response.plan);<br>```
| **Turn 2: Execute step** | The orchestrator parses the plan, grabs the first step, and checks if it is a *tool call*. If so, it forwards the request to `toolExecutor`. | `orchestrator.ts` + `tool-executor.ts` | ```ts<br>const tool = actionMap[step.action];<br>result = await toolExecutor(tool, step.args);<br>``` |
| **Turn 3: Feedback to LLM** | The tool’s raw output is embedded back into the conversation as a `<tool_output>` token, then we ask the LLM “what next?”. | `orchestrator.ts` | ```ts<br>messages.push({ role: "assistant", content: `<tool_output>${result}</tool_output>` });<br>``` |
| **Turn 4: Continue** | LLM now chooses either the next step, or a *final* output. If `go_to_end` the agent stops. | `orchestrator.ts` | ```ts<br>if (step.action === 'go_to_end') return step.message;<br>``` |
| **Edge Cases** |  * **Plan Rollover** – If the tool fails or produces unexpected data, the orchestrator feeds a *fallback* plan back to the LLM. <br> * **Human approval** – If the step is flagged `requires_approval`, `approval.ts` pauses and awaits `HumanApprove()` before proceeding. | `approval.ts` | ```ts<br>if (step.requires_approval) { await approval.wait(step); }<br>```

### Example Interaction

1. **User**  
   ```
   I need a concise summary of the following text:
   "Artificial Intelligence (AI) is a field that...")
   ```

2. **Agent** (Turn 1) – *Plan*  
   ```json
   [
     {"action":"summarise", "args":{"text":"AI is a field that..."}},
     {"action":"go_to_end", "message":"Here is your summary"}
   ]
   ```

3. **Agent** (Turn 2) – *Execute*  
   *orchestrator* recognizes `summarise` => calls `toolExecutor` which bundles a call to the `SummariserTool` (implemented in `agent-tools.ts`).  
   *toolExecutor* returns:  
   ```
   "AI is a discipline that..."
   ```

4. **Agent** (Turn 3) – *feedback*  
   The result is wrapped as `<tool_output>` and supplied back to the LLM:  
   ```
   <tool_output>AI is a discipline that...</tool_output>
   ```

5. **Agent** (Turn 4) – *final*  
   The LLM sees the output and replies:  
   ```
   <final>Here is your summary: AI is a discipline that...</final>
   ```

The **action‑tracker** records each `action` in case the conversation needs to be resumed (e.g. after a crash or user interruption). The **diff‑view** helper is useful when the first tool returns a code snippet that must then be refined; the diff shows exactly what changed.

### Type definitions (`types.ts`)

```ts
export interface AgentAction {
  action: string;          // name of the tool or special keyword
  args?: any;              // JSON‑serialisable arguments
  requires_approval?: boolean;
}

export interface AgentState {
  current_step: number;
  history: AgentAction[];
}
```

These definitions make it trivial to **extend** the agent:

- Add a new tool in `agent-tools.ts`.
- Register it in `orchestrator.ts`’s `actionMap`.
- Optionally wrap it in an `approval` check if it’s privileged.

---

### Quick test

```bash
# in repo root
node -e "const {Agent} = require('./modes/agent/orchestrator'); const agent = new Agent(); agent.run('Generate a diff of two code snippets');"
```

You’ll see the orchestrator call the `diff` tool, then send back a final response.

---

#### TL;DR

* `/modes/agent` is a tiny, well‑typed runtime that lets an LLM “think” of itself as an **action‑driven agent**.*  
* It parses structured JSON from the model, runs local or remote **tools**, and feeds results for the next LLM turn.  
* Example: summarise – the LLM plans to call `summarise`, the `toolExecutor` runs the summariser, and the LLM outputs the final summary.
