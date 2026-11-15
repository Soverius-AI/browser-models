// From the CopilotKit docs, useFrontendTool, "Basic tool that updates UI state":
// https://docs.copilotkit.ai/reference/hooks/useFrontendTool
import { useState } from "react";
import { z } from "zod";
import { useFrontendTool } from "@copilotkit/react-core/v2";

export function TodoManager() {
  const [todos, setTodos] = useState<string[]>([]);

  useFrontendTool(
    {
      name: "addTodo",
      description: "Add a new item to the user's todo list",
      parameters: z.object({
        text: z.string().describe("The todo item text"),
        priority: z.enum(["low", "medium", "high"]).describe("Priority level"),
      }),
      handler: async ({ text, priority }) => {
        setTodos((prev) => [...prev, text]);
        return `Added "${text}" with ${priority} priority`;
      },
    },
    [],
  );

  return (
    <ul>
      {todos.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}
