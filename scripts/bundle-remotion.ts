import path from "node:path"
import { bundle } from "@remotion/bundler"
import { enableTailwindAndWorkspaceTypeScript } from "./remotion-webpack-override"

const outputDirectory = process.argv[2]
if (!outputDirectory) throw new Error("Usage: tsx scripts/bundle-remotion.ts <output-directory>")

async function main(): Promise<void> {
  await bundle({
    entryPoint: path.resolve("src/index.ts"),
    outDir: path.resolve(outputDirectory),
    webpackOverride: enableTailwindAndWorkspaceTypeScript,
  })
}

void main()
