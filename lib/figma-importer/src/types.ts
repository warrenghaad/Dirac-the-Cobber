import { Manifest, ManifestComponent, ManifestTokens } from "@workspace/wireframe-librarian";

export interface FigmaImportConfig {
  figmaFileId: string;
  figmaAccessToken: string;
  organization: string;
  libraryName: string;
}

export interface FigmaComponentNode {
  id: string;
  name: string;
  type: string;
  description?: string;
  componentSet?: string;
  /** Map of variant key -> value */
  variantProperties?: Record<string, string>;
  /** Child components/frames */
  children?: FigmaComponentNode[];
  /** Design tokens: fills, strokes, etc */
  fills?: FigmaFill[];
  strokes?: FigmaStroke[];
  width?: number;
  height?: number;
}

export interface FigmaFill {
  type: "SOLID" | "GRADIENT" | "IMAGE" | "VIDEO";
  color?: { r: number; g: number; b: number; a: number };
  opacity?: number;
}

export interface FigmaStroke {
  type: "SOLID" | "GRADIENT" | "IMAGE" | "VIDEO";
  color?: { r: number; g: number; b: number; a: number };
  strokeWeight?: number;
  strokeAlign?: string;
}

export interface ComponentMapping {
  figmaComponentId: string;
  figmaComponentName: string;
  /** Inferred manifest component ID */
  manifestComponentId: string;
  /** Semantic classification */
  family: string;
  tier: number;
  shape: string;
  /** Extracted axis defaults */
  axes?: {
    a1?: number; // shape semantics
    a2?: number; // color
    a3?: number; // size
    a4?: number; // stroke
    a5?: number; // label density
  };
  maxAxes?: {
    a1?: number;
    a2?: number;
    a3?: number;
    a4?: number;
    a5?: number;
  };
  /** Variants found in Figma */
  variants?: VariantMapping[];
}

export interface VariantMapping {
  variantKey: string;
  axisOverrides?: Partial<Record<string, number>>;
  description?: string;
}

export interface ExtractedTokens {
  colors: Record<string, string>;
  sizes: Record<string, number>;
  strokes: Record<string, number>;
  typography?: Record<string, unknown>;
}

export interface ImportResult {
  organization: string;
  libraryName: string;
  figmaFileId: string;
  timestamp: string;
  manifest: Manifest;
  componentMappings: ComponentMapping[];
  tokens: ExtractedTokens;
  extractedMetadata: {
    totalComponents: number;
    totalVariants: number;
    unmappedComponents: string[];
  };
}

export interface LibrarianRegistry {
  id: string;
  organization: string;
  libraryName: string;
  manifest: Manifest;
  componentMappings: ComponentMapping[];
  createdAt: string;
  updatedAt: string;
  figmaFileId: string;
  /** Which axes this org has activated */
  enabledAxes: ("a1" | "a2" | "a3" | "a4" | "a5")[];
  /** Customization rules per organization */
  customRules?: Record<string, unknown>;
}
