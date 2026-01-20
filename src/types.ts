// src/types.ts
export interface ImageFile {
  name?: string;
  url: string;
  file?: File;
  id?: string;
  base64?: string;
  mimeType?: string;
}

export interface GenerationResult {
  id?: string;
  imageUrl: string;
  url?: string; // 호환성을 위해 유지
  summary?: string;
  prompt?: string;
  timestamp?: number;
  aspectRatio?: AspectRatio;
  grounding?: string[] | null;
}

export enum AspectRatio {
  SQUARE = 'SQUARE',
  PORTRAIT_4_5 = 'PORTRAIT_4_5',
  MOBILE_9_16 = 'MOBILE_9_16',
}

export enum ImageSize {
  K1 = 'K1',
  K2 = 'K2',
  K4 = 'K4',
}

export interface GenerationConfig {
  aspectRatio: AspectRatio;
  prompt?: string;
  previousImage?: string;
  imageSize?: string;
}

export interface AppState {
  baseImage: ImageFile | null;
  productImages: ImageFile[];
  history: GenerationResult[];
  activeVersionIndex: number;
  isGenerating: boolean;
  error: string | null;
  workspaces: Workspace[];
  currentWorkspaceId: string | null;
  result?: GenerationResult | null; // 호환성을 위해 유지
}

export interface Workspace {
  id: string;
  name?: string;
  userName?: string;
  owner?: string;
  createdAt?: number;
  lastUpdated?: number;
  baseImage: ImageFile | null;
  productImages: ImageFile[];
  history: GenerationResult[];
  activeVersionIndex: number;
  result?: GenerationResult | null; // 호환성을 위해 유지
}
