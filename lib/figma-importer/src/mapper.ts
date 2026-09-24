import { FigmaComponentNode, ComponentMapping, ExtractedTokens } from "./types";
import { AxisCoords } from "@workspace/wireframe-librarian";

export class ComponentMapper {
  async mapComponents(
    figmaComponents: FigmaComponentNode[],
    tokens: ExtractedTokens
  ): Promise<ComponentMapping[]> {
    return figmaComponents.map((comp) => this.mapComponent(comp, tokens));
  }

  private mapComponent(
    comp: FigmaComponentNode,
    tokens: ExtractedTokens
  ): ComponentMapping {
    const name = comp.name.toLowerCase();
    const family = this.inferFamily(name);
    const tier = this.inferTier(name);
    const shape = this.inferShape(comp, name);

    return {
      figmaComponentId: comp.id,
      figmaComponentName: comp.name,
      manifestComponentId: this.generateComponentId(family, shape, name),
      family,
      tier,
      shape,
      axes: this.inferDefaultAxes(name, shape, tokens),
      maxAxes: this.inferMaxAxes(shape),
      variants: this.extractVariants(comp),
    };
  }

  private inferFamily(name: string): string {
    if (name.includes("button") || name.includes("input")) return "tier1";
    if (name.includes("card") || name.includes("modal")) return "tier1";
    if (name.includes("header") || name.includes("nav")) return "tier1";
    if (name.includes("entity")) return "knowledge-graph";
    if (name.includes("task") || name.includes("workflow")) return "workflow";
    return "tier1";
  }

  private inferTier(name: string): number {
    if (name.includes("primitive") || name.includes("atom")) return 1;
    if (name.includes("molecule") || name.includes("composite")) return 2;
    if (name.includes("organism") || name.includes("section")) return 3;
    if (name.includes("template") || name.includes("page")) return 4;
    return 2; // default to molecule
  }

  private inferShape(comp: FigmaComponentNode, name: string): string {
    const width = comp.width || 0;
    const height = comp.height || 0;
    const aspect = height > 0 ? width / height : 1;

    if (name.includes("circle") || aspect > 0.9 && aspect < 1.1) {
      return "ellipse";
    }
    if (name.includes("arrow") || name.includes("edge")) {
      return "arrow";
    }
    if (name.includes("container") || name.includes("group")) {
      return "container";
    }
    if (name.includes("rounded")) {
      return "rounded-rect";
    }
    if (aspect < 0.6 || aspect > 1.6) {
      return "rectangle";
    }

    return "rounded-rect";
  }

  private generateComponentId(family: string, shape: string, name: string): string {
    const prefix = family === "tier1" ? "prim" : family.substring(0, 2);
    const sanitized = name
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .substring(0, 20);

    return `${prefix}.${shape}.${sanitized}`;
  }

  private inferDefaultAxes(
    name: string,
    shape: string,
    tokens: ExtractedTokens
  ): Partial<AxisCoords> {
    return {
      a1: this.inferA1(shape), // shape semantics
      a2: 0, // neutral color by default
      a3: 2, // medium size
      a4: 0, // default stroke
      a5: 1, // minimal labels
    };
  }

  private inferMaxAxes(shape: string): Partial<AxisCoords> {
    return {
      a1: shape === "arrow" || shape === "line" ? 2 : 3,
      a2: 4,
      a3: 4,
      a4: shape === "arrow" || shape === "line" ? 4 : 3,
      a5: 4,
    };
  }

  private inferA1(shape: string): number {
    // a1 encodes shape semantics / semantic hierarchy
    const shapeMap: Record<string, number> = {
      ellipse: 1,
      rectangle: 0,
      "rounded-rect": 0,
      arrow: 2,
      "arrow-labeled": 2,
      container: 1,
    };
    return shapeMap[shape] || 0;
  }

  private extractVariants(comp: FigmaComponentNode) {
    // TODO: implement variant extraction from component sets
    return [];
  }
}
