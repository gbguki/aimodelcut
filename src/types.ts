// src/types.ts

export enum AspectRatio {
  SQUARE = 'SQUARE',
  PORTRAIT_4_5 = 'PORTRAIT_4_5',
  MOBILE_9_16 = 'MOBILE_9_16',
}

export interface ImageFile {
  id?: string;
  url: string;
  name?: string;
  base64?: string;        // 업로드 전 임시 저장, ImgBB 업로드 후 제거됨
  mimeType?: string;
  file?: File;            // 원본 File 객체
}

export interface GenerationConfig {
  aspectRatio: AspectRatio;
  prompt?: string;
  previousImage?: string;
  imageSize?: string;
  referenceImage?: ImageFile;  // 포즈/구도 참고 이미지
}

export interface GenerationResult {
  id: string;
  imageUrl: string;
  summary?: string;
  prompt?: string;
  timestamp: number;
  aspectRatio?: AspectRatio;
  grounding?: any;
}

export interface Workspace {
  id?: string;
  name: string;
  owner?: string;
  userName?: string;      // 레거시 호환성
  baseImage?: ImageFile | null;  // Firestore에서 undefined일 수 있음
  productImages: ImageFile[];
  history: GenerationResult[];
  activeVersionIndex: number;
  lastUpdated: number;
  createdAt?: number;
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
}