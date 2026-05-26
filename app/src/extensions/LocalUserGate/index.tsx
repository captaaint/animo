import { createComponentRenderer, createMetadata } from "xmlui";
import { LocalUserGate } from "./LocalUserGate";

const metadata = createMetadata({
  status: "experimental",
  description:
    "Headless local user bootstrap gate. Exposes `value.kind` as " +
    "`bootstrapping`, `needs-setup`, or `ready`, plus the current user when ready.",
  props: {
    apiBase: {
      description: "Base URL for the Animo API.",
      type: "string",
      defaultValue: "/api",
    },
  },
  events: {
    ready: {
      description: "Fired when a local user exists. Payload: { user }.",
    },
    needsSetup: {
      description: "Fired when no local user exists yet.",
    },
  },
  apis: {
    refresh: {
      signature: "refresh(): Promise<void>",
      description: "Re-check local user bootstrap status.",
    },
    createUser: {
      signature: "createUser(name: string, username: string): Promise<User>",
      description: "Create the first local user and transition to ready.",
    },
    updateUser: {
      signature: "updateUser(updates: object): Promise<User>",
      description: "Update the current local user profile and preferences.",
    },
    getValue: {
      signature: "getValue(): LocalUserState",
      description: "Return the current gate state.",
    },
  },
  nonVisual: true,
});

export const localUserGateRenderer = createComponentRenderer(
  "LocalUserGate",
  metadata,
  ({ node, extractValue, lookupEventHandler, updateState, registerComponentApi }) => {
    return (
      <LocalUserGate
        apiBase={extractValue.asOptionalString(node.props.apiBase)}
        onReady={lookupEventHandler("ready")}
        onNeedsSetup={lookupEventHandler("needsSetup")}
        updateState={updateState}
        registerComponentApi={registerComponentApi}
      />
    );
  },
);

export default {
  namespace: "XMLUIExtensions",
  components: [localUserGateRenderer],
};
