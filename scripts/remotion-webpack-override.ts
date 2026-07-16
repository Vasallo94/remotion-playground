import { enableTailwind } from "@remotion/tailwind-v4"

/** Resolve NodeNext-style `.js` specifiers back to workspace TypeScript sources during Remotion bundling. */
export function enableTailwindAndWorkspaceTypeScript(config: Parameters<typeof enableTailwind>[0]) {
  const next = enableTailwind(config)
  return {
    ...next,
    resolve: {
      ...next.resolve,
      extensionAlias: {
        ...next.resolve?.extensionAlias,
        ".js": [".ts", ".tsx", ".js"],
      },
    },
  }
}
