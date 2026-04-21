import {
  Supernova,
  PulsarContext,
  RemoteVersionIdentifier,
  AnyOutputFile,
  TokenGroup,
} from "@supernovaio/sdk-exporters"
import { FileHelper } from "@supernovaio/export-helpers"

// =============================================================================
// CONFIGURATION — edit these to match your design system
// =============================================================================

/**
 * Maps the token name (last Figma path segment) to its CSS property.
 * e.g. "padding-x" → "padding-inline"
 * Add new entries here as you introduce new component tokens.
 */
const CSS_PROPERTY_MAP: Record<string, string> = {
  // Spacing
  "padding-x":        "padding-inline",
  "padding-y":        "padding-block",
  "padding-text-y":   "padding-block",
  "gap":              "gap",
  // Shape
  "radius":           "border-radius",
  // Color (used in variant modifier classes)
  "bg":               "background-color",
  "border":           "border-color",
  "icon":             "color",
  "text":             "color",
  // Sizing
  "width":            "width",
  "height":           "height",
  "min-width":        "min-width",
  "min-height":       "min-height",
  // Border
  "border-width":     "border-width",
}

/**
 * Maps Supernova token type to the CSS variable prefix used by your
 * Tailwind / CSS exporter. Must match your exporter's `tokenPrefixes` config.
 *
 * Your current convention:  --spacing-alert-padding-x
 *                            ^^^^^^^^ this is the prefix
 */
const TYPE_PREFIX_MAP: Record<string, string> = {
  "Spacing":        "spacing",
  "BorderRadius":   "radius",
  "Color":          "color",
  "Dimension":      "sizing",
  "Size":           "sizing",
  "FontSize":       "font-size",
  "LineHeight":     "line-height",
}

/**
 * The Figma variable collection that holds your component tokens.
 * Set to null to process tokens from ALL collections (not recommended).
 */
const COMPONENT_COLLECTION_NAME: string | null = "Components"

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Builds a map of tokenId → group path segments.
 *
 * In Supernova, a token group for Figma variable "alert/padding-x" has:
 *   group.path = []       (parent path)
 *   group.name = "alert"  (own name)
 *
 * For "alert/success/bg":
 *   group.path = ["alert"]
 *   group.name = "success"
 *
 * So the full group path = [...group.path, group.name]
 * And the token full path = [...group.path, group.name, token.name]
 * We store just the group portion: [...group.path, group.name]
 */
function buildTokenPathMap(tokenGroups: TokenGroup[]): Map<string, string[]> {
  const pathMap = new Map<string, string[]>()

  for (const group of tokenGroups) {
    if (group.isRoot) continue

    const groupFullPath = [
      ...(group.path ?? []),
      group.name,
    ]

    for (const tokenId of group.tokenIds ?? []) {
      pathMap.set(tokenId, groupFullPath)
    }
  }

  return pathMap
}

/** Normalise to lowercase kebab-case */
function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, "-")
}

/**
 * If the collection name accidentally appears as the first path segment
 * (can happen depending on Supernova import settings), strip it.
 */
function stripCollectionPrefix(path: string[], collectionName: string | null): string[] {
  if (
    collectionName &&
    path.length > 0 &&
    normalize(path[0]) === normalize(collectionName)
  ) {
    return path.slice(1)
  }
  return path
}

// =============================================================================
// MAIN EXPORT
// =============================================================================

Pulsar.export(
  async (sdk: Supernova, context: PulsarContext): Promise<Array<AnyOutputFile>> => {
    const remoteVersionIdentifier: RemoteVersionIdentifier = {
      designSystemId: context.dsId,
      versionId: context.versionId,
    }

    const tokens = await sdk.tokens.getTokens(remoteVersionIdentifier)
    const tokenGroups = await sdk.tokens.getTokenGroups(remoteVersionIdentifier)

    // tokenId → group path (e.g. ["alert"] or ["alert", "success"])
    const tokenPathMap = buildTokenPathMap(tokenGroups)

    // componentName → { base: declaration lines, variants: { variantName: declaration lines } }
    type ComponentData = { base: string[]; variants: Record<string, string[]> }
    const components = new Map<string, ComponentData>()

    for (const token of tokens) {
      // ── 1. Collection filter ─────────────────────────────────────────────
      if (COMPONENT_COLLECTION_NAME) {
        // token.collectionName is available when the token comes from a
        // Figma variable collection. Fall back gracefully if the property
        // doesn't exist (older SDK versions).
        const collName =
          (token as any).collectionName ??
          (token as any).origin?.collectionName ??
          null

        if (collName && normalize(collName) !== normalize(COMPONENT_COLLECTION_NAME)) {
          continue
        }
      }

      // ── 2. Resolve group path ────────────────────────────────────────────
      const rawGroupPath = tokenPathMap.get(token.id)
      if (!rawGroupPath || rawGroupPath.length === 0) continue

      const groupPath = stripCollectionPrefix(rawGroupPath, COMPONENT_COLLECTION_NAME)
      if (groupPath.length === 0) continue

      // ── 3. Lookup CSS property and type prefix ───────────────────────────
      const tokenName = normalize(token.name)
      const cssProp = CSS_PROPERTY_MAP[tokenName]
      if (!cssProp) continue

      const typeStr = token.tokenType as string
      const typePrefix = TYPE_PREFIX_MAP[typeStr]
      if (!typePrefix) continue

      // ── 4. Classify: base token or variant token ─────────────────────────
      const componentName = normalize(groupPath[0])

      if (!components.has(componentName)) {
        components.set(componentName, { base: [], variants: {} })
      }
      const comp = components.get(componentName)!

      if (groupPath.length === 1) {
        // Base token: alert/padding-x
        // → .alert { padding-inline: var(--spacing-alert-padding-x); }
        const cssVar = `--${typePrefix}-${componentName}-${tokenName}`
        comp.base.push(`    ${cssProp}: var(${cssVar});`)
      } else if (groupPath.length === 2) {
        // Variant token: alert/success/bg
        // → .alert--success { background-color: var(--color-alert-success-bg); }
        const variantName = normalize(groupPath[1])
        if (!comp.variants[variantName]) comp.variants[variantName] = []
        const cssVar = `--${typePrefix}-${componentName}-${variantName}-${tokenName}`
        comp.variants[variantName].push(`    ${cssProp}: var(${cssVar});`)
      }
      // Paths deeper than 2 are intentionally ignored for now
    }

    // ── 5. Render CSS ──────────────────────────────────────────────────────
    const classBlocks: string[] = []

    // Sort components alphabetically for deterministic output
    const sortedComponents = Array.from(components.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    )

    for (const [componentName, data] of sortedComponents) {
      // Base class
      if (data.base.length > 0) {
        classBlocks.push(
          `  /* ${componentName} */\n  .${componentName} {\n${data.base.join("\n")}\n  }`
        )
      }

      // Variant modifier classes (sorted)
      const sortedVariants = Object.entries(data.variants).sort((a, b) =>
        a[0].localeCompare(b[0])
      )
      for (const [variantName, decls] of sortedVariants) {
        if (decls.length > 0) {
          classBlocks.push(
            `  .${componentName}--${variantName} {\n${decls.join("\n")}\n  }`
          )
        }
      }
    }

    const header = `/* ==========================================================================
   Component Classes
   Auto-generated by Supernova — Lula Component Classes Exporter
   DO NOT EDIT MANUALLY. Update tokens in Figma, then re-run the pipeline.
   ========================================================================== */\n\n`

    const content =
      classBlocks.length > 0
        ? `${header}@layer components {\n\n${classBlocks.join("\n\n")}\n\n}\n`
        : `${header}/* ⚠️  No component classes were generated.
   Checklist:
   1. Token scopes in Figma — each token needs ONE unique scope (not "all")
   2. CSS_PROPERTY_MAP in src/index.ts — does it cover all your token names?
   3. TYPE_PREFIX_MAP — do the prefixes match your CSS/Tailwind exporter?
   4. COMPONENT_COLLECTION_NAME — does it exactly match your Figma collection?
*/\n`

    return [
      FileHelper.createTextFile({
        relativePath: "./",
        fileName: "component-classes.css",
        content,
      }),
    ]
  }
)
