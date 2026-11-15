// From the CopilotKit Angular docs, "Register a browser tool":
// https://docs.copilotkit.ai/angular/guides/frontend-tools-generative-ui
import type { WritableSignal } from "@angular/core";
import type { FrontendToolConfig } from "@copilotkit/angular";
import { z } from "zod";

// Not shown in the docs; added so the example compiles.
export type BackgroundToolArgs = { background?: string | undefined; color?: string | undefined };

// Not shown in the docs; added so the example compiles. Accepts a CSS gradient or a color.
function resolveGradient(value: string | undefined): string {
  if (!value) return "linear-gradient(135deg, #ffffff, #e8eefc)";
  return value.includes("gradient(") ? value : `linear-gradient(135deg, ${value}, #ffffff)`;
}

/** Create the frontend tool that applies a requested CSS gradient. */
export function createBackgroundTool(
  background: WritableSignal<string>,
): FrontendToolConfig<BackgroundToolArgs> {
  return {
    name: "change_background",
    description: "Change the application background to a CSS gradient.",
    parameters: z.object({
      background: z.string().optional(),
      color: z.string().optional(),
    }),
    handler: async (args) => {
      const next = resolveGradient(args.background ?? args.color);
      background.set(next);
      return { background: next };
    },
  };
}
