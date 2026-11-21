import { ToolCallStatus, useFrontendTool } from '@copilotkit/react-core/v2';
import * as z from 'zod';

/**
 * Registers the `planTrip` tool. `render` is called again for every arguments delta, with the
 * arguments so far, so the card grows while the model is still writing the call.
 */
export function TripPlan() {
  useFrontendTool(
    {
      name: 'planTrip',
      description: 'Show a trip plan for a city',
      parameters: z.object({ city: z.string(), stops: z.array(z.string()) }),
      handler: async ({ city, stops }) =>
        `Planned ${stops.length} stops in ${city}`,
      render: ({ args, status }) => (
        <div
          data-testid="trip"
          data-status={status}
          className="card card-border my-2 w-80 bg-base-100 shadow-sm"
        >
          <div className="card-body p-4">
            <h3 className="card-title text-base">
              Trip to {args.city ?? '…'}
              <span
                className={`badge badge-soft badge-sm ${status === ToolCallStatus.Complete ? 'badge-success' : 'badge-warning'}`}
              >
                {status}
              </span>
            </h3>
            <ol className="list-decimal pl-5 text-sm">
              {(args.stops ?? []).map((stop, index) => (
                <li key={index}>{stop}</li>
              ))}
            </ol>
          </div>
        </div>
      ),
    },
    [],
  );

  return null;
}
