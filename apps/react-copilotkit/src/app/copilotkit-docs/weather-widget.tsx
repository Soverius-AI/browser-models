// From the CopilotKit docs, useFrontendTool, "Tool with a custom render component":
// https://docs.copilotkit.ai/reference/hooks/useFrontendTool
import { z } from "zod";
import { ToolCallStatus, useFrontendTool } from "@copilotkit/react-core/v2";

export function WeatherWidget() {
  useFrontendTool(
    {
      name: "getWeather",
      description: "Fetch and display weather information for a city",
      parameters: z.object({
        city: z.string().describe("City name"),
        units: z.enum(["celsius", "fahrenheit"]).default("celsius"),
      }),
      // The docs fetch `/api/weather`. This example has no backend, so it answers locally.
      handler: async ({ city, units }) => {
        return JSON.stringify({ city, temperature: 21, units, conditions: "Sunny" });
      },
      render: ({ args, status, result }) => {
        if (status === ToolCallStatus.InProgress) {
          return (
            <div className="animate-pulse">
              Fetching weather for {args.city}...
            </div>
          );
        }
        if (status === ToolCallStatus.Complete && result) {
          const data = JSON.parse(result);
          return (
            <div className="p-4 border rounded">
              <h3>{data.city}</h3>
              <p>
                {data.temperature}&deg; {data.units}
              </p>
              <p>{data.conditions}</p>
            </div>
          );
        }
        return null;
      },
    },
    [],
  );

  return null;
}
