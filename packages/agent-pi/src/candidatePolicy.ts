import { createHash } from "node:crypto"
import ts from "typescript"

export const CANDIDATE_MANIFEST_VERSION = 1 as const

const HARD_LIMITS = { maxFiles: 1, maxFileBytes: 32_000, maxTotalBytes: 32_000, maxAstNodes: 4_000 } as const
const REQUIRED_TEST_KINDS = ["unit", "typecheck", "lint", "bundle", "still"] as const
const ALLOWED_DEPENDENCIES = new Set(["react", "remotion", "@remotion/media", "@claqueta/scene-contracts"])
const ALLOWED_LOCAL_IMPORTS = new Set([
  "../../../../shared/themes",
  "../../../../shared/hooks/useBeatReveal",
  "../../../../shared/hooks/usePhase1Entry",
  "../../../../shared/hooks/useSlideIn",
  "../../../../utils/direction",
])
const ALLOWED_REMOTION_EXPORTS = new Set([
  "AbsoluteFill",
  "Easing",
  "Img",
  "interpolate",
  "interpolateColors",
  "Sequence",
  "spring",
  "staticFile",
  "useCurrentFrame",
  "useVideoConfig",
])
const ALLOWED_MEDIA_EXPORTS = new Set(["Audio", "Video"])
const ALLOWED_JSX_TAGS = new Set([
  "div",
  "span",
  "p",
  "h1",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "svg",
  "g",
  "path",
  "circle",
  "rect",
  "line",
  "polyline",
  "polygon",
  "text",
])
const ALLOWED_STYLE_KEYS = new Set([
  "alignItems",
  "alignSelf",
  "background",
  "backgroundColor",
  "border",
  "borderBottom",
  "borderColor",
  "borderLeft",
  "borderRadius",
  "borderRight",
  "borderTop",
  "borderWidth",
  "bottom",
  "boxSizing",
  "color",
  "columnGap",
  "display",
  "fill",
  "flex",
  "flexBasis",
  "flexDirection",
  "flexGrow",
  "flexShrink",
  "flexWrap",
  "fontFamily",
  "fontSize",
  "fontStyle",
  "fontWeight",
  "gap",
  "gridColumn",
  "gridTemplateColumns",
  "height",
  "justifyContent",
  "left",
  "letterSpacing",
  "lineHeight",
  "margin",
  "marginBottom",
  "marginLeft",
  "marginRight",
  "marginTop",
  "maxHeight",
  "maxWidth",
  "minHeight",
  "minWidth",
  "opacity",
  "overflow",
  "padding",
  "paddingBottom",
  "paddingLeft",
  "paddingRight",
  "paddingTop",
  "position",
  "right",
  "rowGap",
  "stroke",
  "strokeWidth",
  "textAlign",
  "textOverflow",
  "textTransform",
  "top",
  "transform",
  "transformOrigin",
  "whiteSpace",
  "width",
  "wordBreak",
  "zIndex",
])
const URL_PATTERN = /(?:https?:|data:|blob:|file:|javascript:|\/\/|\burl\s*\()/i
const ASSET_ROOTS = ["audio/", "branding/", "fonts/", "images/", "logos/"]

export function executableCandidatePolicySummary(): Record<string, unknown> {
  return {
    limits: { ...HARD_LIMITS },
    allowedDependencies: [...ALLOWED_DEPENDENCIES].sort(),
    allowedLocalImports: [...ALLOWED_LOCAL_IMPORTS].sort(),
    allowedRemotionExports: [...ALLOWED_REMOTION_EXPORTS].sort(),
    allowedMediaExports: [...ALLOWED_MEDIA_EXPORTS].sort(),
    allowedJsxTags: [...ALLOWED_JSX_TAGS].sort(),
    allowedStyleProperties: [...ALLOWED_STYLE_KEYS].sort(),
    allowedAssetRoots: [...ASSET_ROOTS],
  }
}

export type PolicySeverity = "error" | "warning"
export interface SourcePosition {
  line: number
  column: number
  offset: number
}
export interface SourceSpan {
  start: SourcePosition
  end: SourcePosition
}
export interface PolicyFinding {
  code: string
  severity: PolicySeverity
  message: string
  path?: string
  span?: SourceSpan
}

export interface CandidateManifest {
  schemaVersion: typeof CANDIDATE_MANIFEST_VERSION
  candidateId: string
  capability: { proposalId: string; checkpointId: string; checkpointVersion: number; approvalDigest: string }
  component: { id: string; exportName: string }
  sourceFiles: Array<{ path: string; sha256: string; bytes: number }>
  registryChanges: Array<{
    target: "custom-scene-registry" | "scene-timing-registry" | "scene-catalog"
    path: string
    operation: "add"
    key: string
  }>
  dependencies: string[]
  limits: { maxFiles: number; maxFileBytes: number; maxTotalBytes: number; maxAstNodes: number }
  acceptanceTests: Array<{ id: string; kind: (typeof REQUIRED_TEST_KINDS)[number]; description: string }>
}

export interface CandidatePolicyReport {
  valid: boolean
  manifest?: CandidateManifest
  findings: PolicyFinding[]
  metrics: { files: number; bytes: number; astNodes: number }
}

type RecordValue = Record<string, unknown>
function record(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
function ownKeys(value: RecordValue, allowed: readonly string[], path: string, findings: PolicyFinding[]): void {
  for (const key of Object.keys(value))
    if (!allowed.includes(key))
      findings.push({ code: "manifest.unknown-field", severity: "error", message: `${path}.${key} is not allowed` })
}
function text(value: unknown, path: string, findings: PolicyFinding[], pattern?: RegExp): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 200 || (pattern && !pattern.test(value))) {
    findings.push({ code: "manifest.invalid-field", severity: "error", message: `${path} is invalid` })
    return false
  }
  return true
}

const REGISTRY_PATHS = {
  "custom-scene-registry": "src/compositions/ClaudeCodeTutorial/customSceneRegistry.ts",
  "scene-timing-registry": "src/shared/sceneTimingRegistry.ts",
  "scene-catalog": "src/shared/scene-catalog.json",
} as const

/** Strictly validates data only. It does not read, write, import, or execute candidate source. */
export function validateCandidateManifest(input: unknown): { manifest?: CandidateManifest; findings: PolicyFinding[] } {
  const findings: PolicyFinding[] = []
  if (!record(input))
    return {
      findings: [{ code: "manifest.not-object", severity: "error", message: "Candidate manifest must be an object" }],
    }
  ownKeys(
    input,
    [
      "schemaVersion",
      "candidateId",
      "capability",
      "component",
      "sourceFiles",
      "registryChanges",
      "dependencies",
      "limits",
      "acceptanceTests",
    ],
    "manifest",
    findings,
  )
  if (input.schemaVersion !== CANDIDATE_MANIFEST_VERSION)
    findings.push({
      code: "manifest.version",
      severity: "error",
      message: `schemaVersion must be ${CANDIDATE_MANIFEST_VERSION}`,
    })
  text(input.candidateId, "manifest.candidateId", findings, /^[a-z0-9][a-z0-9.-]{2,63}$/)

  if (!record(input.capability))
    findings.push({
      code: "manifest.capability",
      severity: "error",
      message: "capability must identify one approved proposal and checkpoint",
    })
  else {
    ownKeys(
      input.capability,
      ["proposalId", "checkpointId", "checkpointVersion", "approvalDigest"],
      "manifest.capability",
      findings,
    )
    text(input.capability.proposalId, "manifest.capability.proposalId", findings, /^[a-zA-Z0-9._-]{3,100}$/)
    text(input.capability.checkpointId, "manifest.capability.checkpointId", findings, /^cp4[-a-zA-Z0-9._]{1,96}$/i)
    if (!Number.isInteger(input.capability.checkpointVersion) || (input.capability.checkpointVersion as number) < 1)
      findings.push({
        code: "manifest.checkpoint-version",
        severity: "error",
        message: "checkpointVersion must be a positive integer",
      })
    text(input.capability.approvalDigest, "manifest.capability.approvalDigest", findings, /^[a-f0-9]{64}$/)
  }

  if (!record(input.component))
    findings.push({ code: "manifest.component", severity: "error", message: "component must be an object" })
  else {
    ownKeys(input.component, ["id", "exportName"], "manifest.component", findings)
    text(input.component.id, "manifest.component.id", findings, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)
    text(input.component.exportName, "manifest.component.exportName", findings, /^[A-Z][A-Za-z0-9]*Scene$/)
  }
  const component = record(input.component) ? input.component : {}
  const expectedPath =
    typeof component.exportName === "string"
      ? `src/compositions/ClaudeCodeTutorial/scenes/custom/${component.exportName}.tsx`
      : ""

  if (
    !Array.isArray(input.sourceFiles) ||
    input.sourceFiles.length < 1 ||
    input.sourceFiles.length > HARD_LIMITS.maxFiles
  ) {
    findings.push({
      code: "manifest.source-files",
      severity: "error",
      message: `sourceFiles must contain 1-${HARD_LIMITS.maxFiles} files`,
    })
  } else
    for (const [index, value] of input.sourceFiles.entries()) {
      const path = `manifest.sourceFiles[${index}]`
      if (!record(value)) {
        findings.push({ code: "manifest.source-file", severity: "error", message: `${path} must be an object` })
        continue
      }
      ownKeys(value, ["path", "sha256", "bytes"], path, findings)
      if (
        !text(value.path, `${path}.path`, findings) ||
        value.path !== expectedPath ||
        value.path.includes("..") ||
        value.path.startsWith("/")
      ) {
        findings.push({
          code: "manifest.destination",
          severity: "error",
          message: `${path}.path is not the exact allowed component destination`,
        })
      }
      text(value.sha256, `${path}.sha256`, findings, /^[a-f0-9]{64}$/)
      if (
        !Number.isInteger(value.bytes) ||
        (value.bytes as number) < 1 ||
        (value.bytes as number) > HARD_LIMITS.maxFileBytes
      )
        findings.push({ code: "manifest.file-size", severity: "error", message: `${path}.bytes exceeds policy` })
    }

  if (!Array.isArray(input.registryChanges) || input.registryChanges.length !== 3)
    findings.push({
      code: "manifest.registry",
      severity: "error",
      message: "registryChanges must declare exactly the registry, timing, and catalog additions",
    })
  else {
    const seen = new Set<string>()
    for (const [index, value] of input.registryChanges.entries()) {
      const path = `manifest.registryChanges[${index}]`
      if (!record(value)) {
        findings.push({ code: "manifest.registry-change", severity: "error", message: `${path} must be an object` })
        continue
      }
      ownKeys(value, ["target", "path", "operation", "key"], path, findings)
      const target = value.target
      if (
        typeof target !== "string" ||
        !Object.prototype.hasOwnProperty.call(REGISTRY_PATHS, target) ||
        seen.has(target)
      )
        findings.push({
          code: "manifest.registry-target",
          severity: "error",
          message: `${path}.target is invalid or duplicated`,
        })
      else {
        seen.add(target)
        if (value.path !== REGISTRY_PATHS[target as keyof typeof REGISTRY_PATHS])
          findings.push({
            code: "manifest.destination",
            severity: "error",
            message: `${path}.path is not the exact registry destination`,
          })
      }
      if (value.operation !== "add")
        findings.push({
          code: "manifest.registry-operation",
          severity: "error",
          message: `${path}.operation must be add`,
        })
      if (value.key !== component.id)
        findings.push({
          code: "manifest.registry-key",
          severity: "error",
          message: `${path}.key must equal component.id`,
        })
    }
  }

  if (!Array.isArray(input.dependencies) || input.dependencies.some((item) => typeof item !== "string"))
    findings.push({ code: "manifest.dependencies", severity: "error", message: "dependencies must be a string array" })
  else {
    if (new Set(input.dependencies).size !== input.dependencies.length)
      findings.push({
        code: "manifest.dependencies",
        severity: "error",
        message: "dependencies must not contain duplicates",
      })
    for (const dependency of input.dependencies)
      if (!ALLOWED_DEPENDENCIES.has(dependency))
        findings.push({
          code: "manifest.dependency-denied",
          severity: "error",
          message: `Dependency '${dependency}' is not allowlisted`,
        })
  }

  if (!record(input.limits))
    findings.push({ code: "manifest.limits", severity: "error", message: "limits must be an object" })
  else {
    ownKeys(input.limits, Object.keys(HARD_LIMITS), "manifest.limits", findings)
    for (const [key, ceiling] of Object.entries(HARD_LIMITS)) {
      const value = input.limits[key]
      if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > ceiling)
        findings.push({
          code: "manifest.limit",
          severity: "error",
          message: `manifest.limits.${key} must be within 1-${ceiling}`,
        })
    }
  }

  if (!Array.isArray(input.acceptanceTests))
    findings.push({ code: "manifest.acceptance-tests", severity: "error", message: "acceptanceTests must be an array" })
  else {
    const kinds = new Set<string>()
    const ids = new Set<string>()
    for (const [index, value] of input.acceptanceTests.entries()) {
      const path = `manifest.acceptanceTests[${index}]`
      if (!record(value)) {
        findings.push({ code: "manifest.acceptance-test", severity: "error", message: `${path} must be an object` })
        continue
      }
      ownKeys(value, ["id", "kind", "description"], path, findings)
      if (text(value.id, `${path}.id`, findings, /^[a-z0-9][a-z0-9.-]{1,63}$/)) {
        if (ids.has(value.id))
          findings.push({ code: "manifest.acceptance-test", severity: "error", message: `${path}.id is duplicated` })
        ids.add(value.id)
      }
      if (
        typeof value.kind !== "string" ||
        !REQUIRED_TEST_KINDS.includes(value.kind as (typeof REQUIRED_TEST_KINDS)[number])
      )
        findings.push({ code: "manifest.acceptance-kind", severity: "error", message: `${path}.kind is invalid` })
      else kinds.add(value.kind)
      text(value.description, `${path}.description`, findings)
    }
    for (const kind of REQUIRED_TEST_KINDS)
      if (!kinds.has(kind))
        findings.push({
          code: "manifest.acceptance-missing",
          severity: "error",
          message: `acceptanceTests must include '${kind}'`,
        })
  }
  return findings.length === 0 ? { manifest: input as unknown as CandidateManifest, findings } : { findings }
}

function sourceSpan(source: ts.SourceFile, node: ts.Node): SourceSpan {
  const startOffset = node.getStart(source)
  const endOffset = node.getEnd()
  const start = source.getLineAndCharacterOfPosition(startOffset)
  const end = source.getLineAndCharacterOfPosition(endOffset)
  return {
    start: { line: start.line + 1, column: start.character + 1, offset: startOffset },
    end: { line: end.line + 1, column: end.character + 1, offset: endOffset },
  }
}

function propertyName(name: ts.PropertyName | undefined): string | undefined {
  if (!name) return undefined
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  if (
    ts.isComputedPropertyName(name) &&
    (ts.isStringLiteral(name.expression) || ts.isNoSubstitutionTemplateLiteral(name.expression))
  )
    return name.expression.text
  return undefined
}

/** Parses and inspects source with the TypeScript compiler API. Candidate code is never evaluated. */
export function inspectCandidateSource(
  path: string,
  sourceText: string,
  maxAstNodes: number = HARD_LIMITS.maxAstNodes,
): { findings: PolicyFinding[]; astNodes: number } {
  const source = ts.createSourceFile(path, sourceText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX)
  const findings: PolicyFinding[] = []
  const aliases = new Map<string, string>()
  const topLevelBindings = new Set<string>()
  let astNodes = 0
  let usesFrameAnimation = false
  let callsFrameHook = false
  const add = (code: string, message: string, node: ts.Node, severity: PolicySeverity = "error") =>
    findings.push({ code, severity, message, path, span: sourceSpan(source, node) })

  const parseDiagnostics =
    (source as ts.SourceFile & { parseDiagnostics?: readonly ts.DiagnosticWithLocation[] }).parseDiagnostics ?? []
  for (const diagnostic of parseDiagnostics) {
    const startOffset = diagnostic.start ?? 0
    const endOffset = startOffset + (diagnostic.length ?? 0)
    const start = source.getLineAndCharacterOfPosition(startOffset)
    const end = source.getLineAndCharacterOfPosition(endOffset)
    findings.push({
      code: "source.syntax",
      severity: "error",
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
      path,
      span: {
        start: { line: start.line + 1, column: start.character + 1, offset: startOffset },
        end: { line: end.line + 1, column: end.character + 1, offset: endOffset },
      },
    })
  }

  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
    noLib: true,
    noResolve: true,
  }
  const compilerHost = ts.createCompilerHost(compilerOptions)
  compilerHost.getSourceFile = (fileName) => (fileName === path ? source : undefined)
  compilerHost.readFile = (fileName) => (fileName === path ? sourceText : undefined)
  compilerHost.fileExists = (fileName) => fileName === path
  const checker = ts.createProgram([path], compilerOptions, compilerHost).getTypeChecker()

  const declarationFor = (expression: ts.Identifier): ts.Declaration | undefined =>
    checker.getSymbolAtLocation(expression)?.valueDeclaration
  const canonical = (expression: ts.Expression, resolving = new Set<ts.Declaration>()): string | undefined => {
    if (ts.isParenthesizedExpression(expression)) return canonical(expression.expression, resolving)
    if (ts.isAsExpression(expression) || ts.isTypeAssertionExpression(expression) || ts.isNonNullExpression(expression))
      return canonical(expression.expression, resolving)
    if (ts.isIdentifier(expression)) {
      const declaration = declarationFor(expression)
      if (declaration && ts.isImportSpecifier(declaration))
        return declaration.propertyName?.text ?? declaration.name.text
      const imported = aliases.get(expression.text)
      if (imported && !declaration) return imported
      if (!declaration || resolving.has(declaration)) return expression.text
      resolving.add(declaration)
      if (ts.isVariableDeclaration(declaration) && declaration.initializer)
        return canonical(declaration.initializer, resolving)
      if (ts.isBindingElement(declaration)) {
        const variable = declaration.parent.parent
        if (ts.isVariableDeclaration(variable) && variable.initializer) {
          const keyNode = declaration.propertyName ?? (ts.isIdentifier(declaration.name) ? declaration.name : undefined)
          const key = propertyName(keyNode)
          const base = canonical(variable.initializer, resolving)
          if (base && key) return `${base}.${key}`
        }
      }
      return expression.text
    }
    if (ts.isPropertyAccessExpression(expression)) {
      const base = canonical(expression.expression, resolving)
      return base ? `${base}.${expression.name.text}` : undefined
    }
    if (ts.isElementAccessExpression(expression)) {
      const base = canonical(expression.expression, resolving)
      const argument = expression.argumentExpression
      if (!base || !argument || (!ts.isStringLiteral(argument) && !ts.isNoSubstitutionTemplateLiteral(argument)))
        return undefined
      return `${base}.${argument.text}`
    }
    return undefined
  }
  const rootIdentifier = (expression: ts.Expression): string | undefined => {
    if (ts.isIdentifier(expression)) return expression.text
    if (ts.isParenthesizedExpression(expression)) return rootIdentifier(expression.expression)
    if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression))
      return rootIdentifier(expression.expression)
    return undefined
  }
  const allowedAssetPath = (expression: ts.Expression | undefined): boolean =>
    Boolean(
      expression &&
      (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) &&
      !expression.text.includes("..") &&
      !expression.text.includes("\\") &&
      !/%2e/i.test(expression.text) &&
      !/\0/.test(expression.text) &&
      ASSET_ROOTS.some((root) => expression.text.startsWith(root)),
    )
  const safeAssetExpression = (expression: ts.Expression, resolving = new Set<ts.Declaration>()): boolean => {
    if (
      ts.isParenthesizedExpression(expression) ||
      ts.isAsExpression(expression) ||
      ts.isTypeAssertionExpression(expression)
    )
      return safeAssetExpression(expression.expression, resolving)
    if (ts.isCallExpression(expression))
      return canonical(expression.expression) === "staticFile" && allowedAssetPath(expression.arguments[0])
    if (ts.isConditionalExpression(expression))
      return safeAssetExpression(expression.whenTrue, resolving) && safeAssetExpression(expression.whenFalse, resolving)
    if (!ts.isIdentifier(expression)) return false
    const declaration = declarationFor(expression)
    if (!declaration || resolving.has(declaration)) return false
    resolving.add(declaration)
    if (ts.isVariableDeclaration(declaration) && declaration.initializer)
      return safeAssetExpression(declaration.initializer, resolving)
    return false
  }
  const containsMotionClass = (node: ts.Node, resolving = new Set<ts.Declaration>()): boolean => {
    if (ts.isStringLiteralLike(node) && /(?:^|\s)(?:animate-|transition)/.test(node.text)) return true
    if (ts.isIdentifier(node)) {
      const declaration = declarationFor(node)
      if (declaration && !resolving.has(declaration)) {
        resolving.add(declaration)
        if (ts.isVariableDeclaration(declaration) && declaration.initializer)
          return containsMotionClass(declaration.initializer, resolving)
      }
    }
    let found = false
    ts.forEachChild(node, (child) => {
      if (!found && containsMotionClass(child, resolving)) found = true
    })
    return found
  }
  const forbidden = (name: string): string | undefined => {
    if (
      /^(process|global|globalThis|window|document|navigator|self|top|parent|frames|localStorage|sessionStorage|indexedDB|Deno|Bun)(\.|$)/.test(
        name,
      )
    )
      return "source.forbidden-global"
    if (
      /^(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)(\.|$)/.test(name) ||
      /^(globalThis|window)\.(fetch|XMLHttpRequest|WebSocket|EventSource)/.test(name)
    )
      return "source.network"
    if (
      /^(Date|Intl|performance\.now|Math\.random)(\.|$)/.test(name) ||
      /^(crypto|globalThis\.crypto|window\.crypto)(\.|$)/.test(name)
    )
      return "source.nondeterminism"
    if (
      /^(eval|Function|AsyncFunction|GeneratorFunction|setTimeout|setInterval|requestAnimationFrame|Reflect\.(?:get|construct|apply)|Proxy)(\.|$)/.test(
        name,
      )
    )
      return "source.dynamic-execution"
    if (/^(require|module|exports)(\.|$)/.test(name)) return "source.module-runtime"
    return undefined
  }

  const visit = (node: ts.Node): void => {
    astNodes += 1
    if (astNodes === maxAstNodes + 1) add("source.ast-size", `AST exceeds ${maxAstNodes} nodes`, node)

    if (ts.isImportDeclaration(node)) {
      if (!ts.isStringLiteral(node.moduleSpecifier))
        add("source.import-dynamic", "Import specifier must be a string literal", node)
      else {
        const moduleName = node.moduleSpecifier.text
        if (!ALLOWED_DEPENDENCIES.has(moduleName) && !ALLOWED_LOCAL_IMPORTS.has(moduleName))
          add("source.import-denied", `Import '${moduleName}' is not allowlisted`, node.moduleSpecifier)
        if (moduleName === "remotion" || moduleName === "@remotion/media") {
          const allowed = moduleName === "remotion" ? ALLOWED_REMOTION_EXPORTS : ALLOWED_MEDIA_EXPORTS
          const bindings = node.importClause?.namedBindings
          if (!bindings || ts.isNamespaceImport(bindings))
            add("source.import-binding", `${moduleName} requires explicit named imports`, node)
          else
            for (const element of bindings.elements) {
              const imported = element.propertyName?.text ?? element.name.text
              if (!allowed.has(imported))
                add("source.import-binding", `'${imported}' is not an allowed ${moduleName} export`, element)
              aliases.set(element.name.text, imported)
            }
        }
      }
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
      add("source.dynamic-import", "Dynamic import is forbidden", node)
    if (ts.isExportDeclaration(node) && node.moduleSpecifier)
      add("source.export-denied", "Re-exporting another module is forbidden", node.moduleSpecifier)
    if (
      ts.isExportAssignment(node) ||
      (ts.canHaveModifiers(node) &&
        ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword))
    ) {
      add("source.default-export", "Default exports are forbidden", node)
    }

    if (ts.isVariableStatement(node) && node.parent === source) {
      const addBindingNames = (name: ts.BindingName): void => {
        if (ts.isIdentifier(name)) topLevelBindings.add(name.text)
        else for (const element of name.elements) if (!ts.isOmittedExpression(element)) addBindingNames(element.name)
      }
      for (const declaration of node.declarationList.declarations) addBindingNames(declaration.name)
      if ((node.declarationList.flags & ts.NodeFlags.Const) === 0)
        add("source.mutable-global", "Top-level let/var declarations are forbidden", node)
    }
    if (ts.isImportDeclaration(node) && node.parent === source && node.importClause) {
      const bindings = node.importClause.namedBindings
      if (node.importClause.name) topLevelBindings.add(node.importClause.name.text)
      if (bindings && ts.isNamespaceImport(bindings)) topLevelBindings.add(bindings.name.text)
      if (bindings && ts.isNamedImports(bindings))
        for (const element of bindings.elements) topLevelBindings.add(element.name.text)
    }
    if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.parent === source && node.name)
      topLevelBindings.add(node.name.text)

    if (ts.isIdentifier(node)) {
      const parent = node.parent
      const isName =
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        ((ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent)) &&
          parent.name === node) ||
        (ts.isVariableDeclaration(parent) && parent.name === node) ||
        ts.isImportSpecifier(parent) ||
        ts.isImportClause(parent) ||
        ts.isNamespaceImport(parent) ||
        (ts.isBindingElement(parent) && parent.name === node)
      if (!isName) {
        const name = canonical(node)
        const code = name ? forbidden(name) : undefined
        if (code) add(code, `Reference to '${name}' is forbidden`, node)
      }
    }
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const name = canonical(node.expression)
      if (name) {
        const code = forbidden(name)
        if (code) add(code, `Call to '${name}' is forbidden`, node)
        if (name === "interpolate" || name === "interpolateColors" || name === "spring") usesFrameAnimation = true
        if (name === "useCurrentFrame") callsFrameHook = true
        const root = name.split(".")[0]
        const writtenRoot = rootIdentifier(node.expression)
        const method = name.split(".").at(-1)
        if (
          ((topLevelBindings.has(root) || (writtenRoot && topLevelBindings.has(writtenRoot))) &&
            method &&
            [
              "push",
              "pop",
              "shift",
              "unshift",
              "splice",
              "sort",
              "reverse",
              "copyWithin",
              "fill",
              "set",
              "add",
              "delete",
              "clear",
            ].includes(method)) ||
          [
            "Object.assign",
            "Object.defineProperty",
            "Object.setPrototypeOf",
            "Reflect.set",
            "Reflect.defineProperty",
            "Reflect.deleteProperty",
          ].includes(name)
        ) {
          add("source.mutable-global", `Mutation through '${name}' is forbidden`, node)
        }
        if (name === "staticFile" && !allowedAssetPath(node.arguments?.[0]))
          add("source.asset-access", "staticFile requires a literal path under an allowlisted asset root", node)
      }
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const name = canonical(node)
      const accessedProperty = ts.isPropertyAccessExpression(node)
        ? node.name.text
        : node.argumentExpression &&
            (ts.isStringLiteral(node.argumentExpression) || ts.isNoSubstitutionTemplateLiteral(node.argumentExpression))
          ? node.argumentExpression.text
          : undefined
      if (accessedProperty === "constructor")
        add("source.dynamic-execution", "Constructor property access is forbidden", node)
      if (!name && ts.isElementAccessExpression(node))
        add("source.computed-access", "Non-literal computed property access is forbidden", node)
      else if (name) {
        const code = forbidden(name)
        if (code) add(code, `Access to '${name}' is forbidden`, node)
      }
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    ) {
      const left = node.left as ts.Expression
      const target = canonical(left)
      const root = target?.split(".")[0]
      const writtenRoot = rootIdentifier(left)
      if (
        target &&
        (/^(global|globalThis|window|document|self|top|parent|frames)(\.|$)/.test(target) ||
          (root && topLevelBindings.has(root)) ||
          (writtenRoot && topLevelBindings.has(writtenRoot)))
      )
        add("source.mutable-global", `Mutation of '${target}' is forbidden`, node)
    }
    if (
      (ts.isPostfixUnaryExpression(node) || ts.isPrefixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)
    ) {
      const target = canonical(node.operand)
      const root = target?.split(".")[0]
      const writtenRoot = rootIdentifier(node.operand)
      if (
        target &&
        (/^(global|globalThis|window|document|self|top|parent|frames)(\.|$)/.test(target) ||
          (root && topLevelBindings.has(root)) ||
          (writtenRoot && topLevelBindings.has(writtenRoot)))
      )
        add("source.mutable-global", `Mutation of '${target}' is forbidden`, node)
    }

    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source)
      if (/^[a-z]/.test(tag) && !ALLOWED_JSX_TAGS.has(tag))
        add("source.html-tag", `HTML/SVG tag '${tag}' is not allowlisted`, node.tagName)
      for (const attribute of node.attributes.properties) {
        if (ts.isJsxSpreadAttribute(attribute)) {
          add("source.html-spread", "JSX spread attributes are forbidden", attribute)
          continue
        }
        const name = attribute.name.getText(source)
        const attributeExpression =
          attribute.initializer && ts.isJsxExpression(attribute.initializer)
            ? attribute.initializer.expression
            : undefined
        if (
          /^on/i.test(name) ||
          ["dangerouslySetInnerHTML", "href", "srcDoc"].includes(name) ||
          (name === "src" &&
            (!/^Img$|^Audio$|^Video$/.test(tag) || !attributeExpression || !safeAssetExpression(attributeExpression)))
        )
          add("source.html-attribute", `JSX attribute '${name}' is forbidden`, attribute)
        if (name === "className" && attribute.initializer && containsMotionClass(attribute.initializer))
          add("source.css-animation", "CSS animation/transition classes are forbidden", attribute)
        if (name === "style") {
          if (
            !attribute.initializer ||
            !ts.isJsxExpression(attribute.initializer) ||
            !attribute.initializer.expression ||
            !ts.isObjectLiteralExpression(attribute.initializer.expression)
          )
            add("source.style-shape", "style must be an inline object literal", attribute)
          else
            for (const property of attribute.initializer.expression.properties) {
              if (ts.isSpreadAssignment(property)) {
                add("source.style-spread", "Style spreads are forbidden", property)
                continue
              }
              const key = propertyName(property.name)
              if (!key || !ALLOWED_STYLE_KEYS.has(key))
                add(
                  key && /^(animation|transition)/i.test(key) ? "source.css-animation" : "source.style-property",
                  `Style property '${key ?? "computed"}' is forbidden`,
                  property,
                )
              if (
                ts.isPropertyAssignment(property) &&
                ts.isStringLiteralLike(property.initializer) &&
                URL_PATTERN.test(property.initializer.text)
              )
                add("source.url", "URLs are forbidden in styles", property.initializer)
            }
        }
      }
    }
    if (ts.isStringLiteralLike(node) && URL_PATTERN.test(node.text)) {
      const parent = node.parent
      const isModule = ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)
      if (!isModule) add("source.url", "URL-like string literals are forbidden", node)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  if (usesFrameAnimation && !callsFrameHook)
    findings.push({
      code: "source.frame-hook-required",
      severity: "error",
      message: "spring/interpolate animation requires useCurrentFrame()",
      path,
    })
  return { findings, astNodes }
}

/** Complete pure policy entry point. Sources are supplied as inert strings and are never executed or written. */
export function evaluateCandidatePolicy(
  input: unknown,
  sources: Readonly<Record<string, string>>,
): CandidatePolicyReport {
  const validated = validateCandidateManifest(input)
  const findings = [...validated.findings]
  let bytes = 0
  let astNodes = 0
  const manifest = validated.manifest
  if (!record(sources))
    findings.push({ code: "source.container", severity: "error", message: "Sources must be an object" })
  if (manifest && record(sources)) {
    const declaredPaths = new Set(manifest.sourceFiles.map((file) => file.path))
    for (const supplied of Object.keys(sources))
      if (!declaredPaths.has(supplied))
        findings.push({
          code: "source.undeclared",
          severity: "error",
          message: `Source '${supplied}' is not declared`,
          path: supplied,
        })
    for (const file of manifest.sourceFiles) {
      const source = Object.prototype.hasOwnProperty.call(sources, file.path) ? sources[file.path] : undefined
      if (typeof source !== "string") {
        findings.push({
          code: "source.missing",
          severity: "error",
          message: `Declared source '${file.path}' is missing`,
          path: file.path,
        })
        continue
      }
      const actualBytes = Buffer.byteLength(source, "utf8")
      bytes += actualBytes
      if (actualBytes !== file.bytes || actualBytes > manifest.limits.maxFileBytes)
        findings.push({
          code: "source.size",
          severity: "error",
          message: `Source byte size does not match its bounded declaration`,
          path: file.path,
        })
      if (createHash("sha256").update(source).digest("hex") !== file.sha256)
        findings.push({
          code: "source.digest",
          severity: "error",
          message: "Source SHA-256 does not match manifest",
          path: file.path,
        })
      const inspected = inspectCandidateSource(file.path, source, manifest.limits.maxAstNodes)
      astNodes += inspected.astNodes
      findings.push(...inspected.findings)
      const parsed = ts.createSourceFile(file.path, source, ts.ScriptTarget.ES2022, false, ts.ScriptKind.TSX)
      const hasExpectedExport = parsed.statements.some((statement) => {
        const exported =
          ts.canHaveModifiers(statement) &&
          ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
        if (!exported) return false
        if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement))
          return statement.name?.text === manifest.component.exportName
        if (ts.isVariableStatement(statement))
          return statement.declarationList.declarations.some(
            (declaration) =>
              ts.isIdentifier(declaration.name) && declaration.name.text === manifest.component.exportName,
          )
        return false
      })
      if (!hasExpectedExport)
        findings.push({
          code: "source.component-export",
          severity: "error",
          message: `Source must declare named export '${manifest.component.exportName}'`,
          path: file.path,
        })
    }
    if (bytes > manifest.limits.maxTotalBytes)
      findings.push({ code: "source.total-size", severity: "error", message: "Candidate exceeds total byte limit" })
    const importedPackages = new Set<string>()
    for (const source of Object.values(sources)) {
      const parsed = ts.createSourceFile("candidate.tsx", source, ts.ScriptTarget.ES2022, false, ts.ScriptKind.TSX)
      parsed.forEachChild((node) => {
        if (
          ts.isImportDeclaration(node) &&
          ts.isStringLiteral(node.moduleSpecifier) &&
          !node.moduleSpecifier.text.startsWith(".")
        )
          importedPackages.add(node.moduleSpecifier.text)
      })
    }
    for (const dependency of importedPackages)
      if (!manifest.dependencies.includes(dependency))
        findings.push({
          code: "source.undeclared-dependency",
          severity: "error",
          message: `Imported dependency '${dependency}' is absent from manifest`,
        })
    for (const dependency of manifest.dependencies)
      if (!importedPackages.has(dependency))
        findings.push({
          code: "manifest.unused-dependency",
          severity: "error",
          message: `Declared dependency '${dependency}' is not imported`,
        })
  }
  return {
    valid: findings.every((finding) => finding.severity !== "error"),
    manifest,
    findings,
    metrics: { files: Object.keys(sources).length, bytes, astNodes },
  }
}
