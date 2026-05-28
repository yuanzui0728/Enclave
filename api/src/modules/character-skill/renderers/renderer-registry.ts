import { docxRenderer } from './docx.renderer';
import { pptxRenderer } from './pptx.renderer';
import type { DocumentRenderer, SkillArtifactType } from './renderer.types';
import { xlsxRenderer } from './xlsx.renderer';

// artifactType → 对应原生渲染器。技能层/渲染 job 按 SkillDefinition.rendererKey 取用。
export const RENDERER_REGISTRY: Record<
  SkillArtifactType,
  DocumentRenderer
> = {
  pptx: pptxRenderer as DocumentRenderer,
  docx: docxRenderer as DocumentRenderer,
  xlsx: xlsxRenderer as DocumentRenderer,
};

export function getRenderer(type: SkillArtifactType): DocumentRenderer {
  return RENDERER_REGISTRY[type];
}
