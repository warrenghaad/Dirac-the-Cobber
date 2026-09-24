import { FigmaComponentNode, FigmaImportConfig, ExtractedTokens } from "./types";

export interface FigmaFileResponse {
  document: {
    id: string;
    name: string;
    type: string;
    children: FigmaNode[];
  };
  components: Record<string, FigmaComponentDefinition>;
  styles: Record<string, FigmaStyle>;
}

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  componentId?: string;
  children?: FigmaNode[];
  fills?: Array<{
    type: string;
    color?: { r: number; g: number; b: number; a: number };
    opacity?: number;
  }>;
  strokes?: Array<{
    type: string;
    strokeWeight?: number;
    color?: { r: number; g: number; b: number; a: number };
  }>;
  width?: number;
  height?: number;
}

export interface FigmaComponentDefinition {
  key: string;
  file_key: string;
  node_id: string;
  thumbnail_url: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  user: { id: string; handle: string };
  containing_frame: { nodeId: string; name: string };
  containing_page: { nodeId: string; name: string };
}

export interface FigmaStyle {
  key: string;
  file_key: string;
  node_id: string;
  style_type: string;
  thumbnail_url: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  user: { id: string; handle: string };
  sort_position: string;
}

export class FigmaExtractor {
  private config: FigmaImportConfig;
  private baseUrl = "https://api.figma.com/v1";

  constructor(config: FigmaImportConfig) {
    this.config = config;
  }

  async fetchFile(): Promise<FigmaFileResponse> {
    const response = await fetch(
      `${this.baseUrl}/files/${this.config.figmaFileId}`,
      {
        headers: {
          "X-Figma-Token": this.config.figmaAccessToken,
        },
      }
    );

    if (!response.ok) {
      throw new Error(
        `Figma API error: ${response.status} ${response.statusText}`
      );
    }

    return response.json();
  }

  async extractComponents(): Promise<FigmaComponentNode[]> {
    const file = await this.fetchFile();
    const components: FigmaComponentNode[] = [];

    const walk = (nodes: FigmaNode[]) => {
      for (const node of nodes) {
        if (node.type === "COMPONENT" || node.componentId) {
          components.push(this.nodeToComponentNode(node));
        }
        if (node.children) {
          walk(node.children);
        }
      }
    };

    walk(file.document.children);
    return components;
  }

  async extractTokens(): Promise<ExtractedTokens> {
    const file = await this.fetchFile();
    const colors: Record<string, string> = {};
    const sizes: Record<string, number> = {};
    const strokes: Record<string, number> = {};

    this.collectTokens(file.document.children, colors, sizes, strokes);

    return { colors, sizes, strokes };
  }

  private nodeToComponentNode(node: FigmaNode): FigmaComponentNode {
    return {
      id: node.id,
      name: node.name,
      type: node.type,
      children: node.children?.map((c) => this.nodeToComponentNode(c)),
      fills: node.fills?.map((f) => ({
        type: f.type as any,
        color: f.color,
        opacity: f.opacity,
      })),
      strokes: node.strokes?.map((s) => ({
        type: s.type as any,
        color: s.color,
        strokeWeight: s.strokeWeight,
      })),
      width: node.width,
      height: node.height,
    };
  }

  private collectTokens(
    nodes: FigmaNode[],
    colors: Record<string, string>,
    sizes: Record<string, number>,
    strokes: Record<string, number>
  ) {
    for (const node of nodes) {
      if (node.fills) {
        for (const fill of node.fills) {
          if (fill.type === "SOLID" && fill.color) {
            const hex = this.rgbToHex(fill.color);
            const key = `color-${node.name.toLowerCase().replace(/\s+/g, "-")}`;
            colors[key] = hex;
          }
        }
      }

      if (node.width && node.height) {
        const sizeKey = `size-${node.name.toLowerCase().replace(/\s+/g, "-")}`;
        sizes[sizeKey] = Math.round(node.width);
      }

      if (node.strokes) {
        for (const stroke of node.strokes) {
          if (stroke.strokeWeight) {
            const key = `stroke-${node.name.toLowerCase().replace(/\s+/g, "-")}`;
            strokes[key] = stroke.strokeWeight;
          }
        }
      }

      if (node.children) {
        this.collectTokens(node.children, colors, sizes, strokes);
      }
    }
  }

  private rgbToHex(color: { r: number; g: number; b: number }): string {
    return (
      "#" +
      [color.r, color.g, color.b]
        .map((x) => {
          const hex = Math.round(x * 255).toString(16);
          return hex.length === 1 ? "0" + hex : hex;
        })
        .join("")
    );
  }
}
