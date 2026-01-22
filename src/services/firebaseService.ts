// src/services/firebaseService.ts
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  updateDoc, 
  deleteDoc,
  query,
  orderBy,
  Timestamp 
} from "firebase/firestore";
import { Workspace, ImageFile, GenerationResult } from "../types";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ============================================
// 🔹 Cloudinary 이미지 업로드/삭제
// ============================================

const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || "";
const CLOUDINARY_API_KEY = import.meta.env.VITE_CLOUDINARY_API_KEY || "";
const CLOUDINARY_API_SECRET = import.meta.env.VITE_CLOUDINARY_API_SECRET || "";

/**
 * SHA-1 해시 생성 (Web Crypto API 사용)
 */
async function sha1(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-1', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Cloudinary 업로드 서명 생성
 */
async function generateUploadSignature(timestamp: number, folder: string): Promise<string> {
  const signatureString = `folder=${folder}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`;
  return await sha1(signatureString);
}

/**
 * Cloudinary 삭제 서명 생성
 */
async function generateDeleteSignature(publicId: string, timestamp: number): Promise<string> {
  const signatureString = `public_id=${publicId}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`;
  return await sha1(signatureString);
}

/**
 * Cloudinary URL에서 public_id 추출
 */
function extractPublicIdFromUrl(url: string): string | null {
  try {
    // https://res.cloudinary.com/{cloud}/image/upload/v{version}/{folder}/{filename}.{ext}
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[^.]+$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Base64 이미지를 Cloudinary에 업로드하고 URL 반환
 */
async function uploadImageToCloudinary(base64Data: string, folder: string = "modelcut"): Promise<string> {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error("Cloudinary credentials are not configured. Please set VITE_CLOUDINARY_* in your environment.");
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await generateUploadSignature(timestamp, folder);

  const formData = new FormData();
  formData.append('file', base64Data);
  formData.append('api_key', CLOUDINARY_API_KEY);
  formData.append('timestamp', timestamp.toString());
  formData.append('signature', signature);
  formData.append('folder', folder);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    {
      method: 'POST',
      body: formData,
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Cloudinary upload failed:', errorText);
    throw new Error(`Cloudinary upload failed: ${response.status}`);
  }

  const result = await response.json();
  return result.secure_url;
}

/**
 * Cloudinary에서 이미지 삭제
 */
async function deleteImageFromCloudinary(imageUrl: string): Promise<boolean> {
  const publicId = extractPublicIdFromUrl(imageUrl);
  if (!publicId) {
    console.warn('Could not extract public_id from URL:', imageUrl);
    return false;
  }

  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await generateDeleteSignature(publicId, timestamp);

    const formData = new FormData();
    formData.append('public_id', publicId);
    formData.append('api_key', CLOUDINARY_API_KEY);
    formData.append('timestamp', timestamp.toString());
    formData.append('signature', signature);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/destroy`,
      {
        method: 'POST',
        body: formData,
      }
    );

    if (!response.ok) {
      console.error('Cloudinary delete failed:', await response.text());
      return false;
    }

    const result = await response.json();
    return result.result === 'ok';
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
    return false;
  }
}

/**
 * ImageFile 객체를 Cloudinary에 업로드하고 URL로 변환된 객체 반환
 */
async function uploadImageFile(
  imageFile: ImageFile,
  folder: string
): Promise<ImageFile> {
  // 이미 Cloudinary URL인 경우 그대로 반환
  if (!imageFile.base64 && imageFile.url && imageFile.url.includes('cloudinary.com')) {
    const { file, ...rest } = imageFile as any;
    return rest;
  }

  // 이미 외부 URL인 경우 (ImgBB 등 레거시) 그대로 반환
  if (!imageFile.base64 && imageFile.url && !imageFile.url.startsWith('data:')) {
    const { file, ...rest } = imageFile as any;
    return rest;
  }

  // base64 데이터가 있으면 업로드
  const dataToUpload = imageFile.base64 || imageFile.url;
  if (!dataToUpload) {
    const { file, ...rest } = imageFile as any;
    return rest;
  }

  const downloadUrl = await uploadImageToCloudinary(dataToUpload, folder);

  return {
    id: imageFile.id,
    url: downloadUrl,
    name: imageFile.name,
    mimeType: imageFile.mimeType,
  };
}

/**
 * GenerationResult의 이미지를 Cloudinary에 업로드
 */
async function uploadGenerationResult(
  result: GenerationResult,
  index: number
): Promise<GenerationResult> {
  // 이미 Cloudinary URL인 경우 그대로 반환
  if (result.imageUrl.includes('cloudinary.com')) {
    return result;
  }

  // 이미 외부 URL인 경우 (레거시) 그대로 반환
  if (!result.imageUrl.startsWith('data:')) {
    return result;
  }

  const downloadUrl = await uploadImageToCloudinary(result.imageUrl, "modelcut/results");

  return {
    ...result,
    imageUrl: downloadUrl,
  };
}

/**
 * 프로젝트의 모든 Cloudinary 이미지 삭제
 */
async function deleteProjectImages(project: Workspace): Promise<void> {
  const deletePromises: Promise<boolean>[] = [];

  // 베이스 이미지 삭제
  if (project.baseImage?.url?.includes('cloudinary.com')) {
    deletePromises.push(deleteImageFromCloudinary(project.baseImage.url));
  }

  // 제품 이미지들 삭제
  for (const img of project.productImages) {
    if (img.url?.includes('cloudinary.com')) {
      deletePromises.push(deleteImageFromCloudinary(img.url));
    }
  }

  // 히스토리 이미지들 삭제
  for (const result of project.history) {
    if (result.imageUrl?.includes('cloudinary.com')) {
      deletePromises.push(deleteImageFromCloudinary(result.imageUrl));
    }
  }

  await Promise.allSettled(deletePromises);
}

// ============================================
// 🔹 프로젝트 저장/불러오기
// ============================================

/**
 * JSON 직렬화로 File 객체 등 저장 불가능한 데이터 완전 제거
 */
function sanitizeForFirestore<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

/**
 * 프로젝트 저장 (이미지는 Cloudinary, 메타데이터는 Firestore)
 */
export async function saveProject(
  project: Workspace,
  onProgress?: (status: string) => void
): Promise<string> {
  try {
    const projectId = project.id || Math.random().toString(36).substr(2, 9);
    
    // 1. 베이스 이미지 업로드
    onProgress?.('베이스 이미지 업로드 중...');
    let uploadedBaseImage = null;
    if (project.baseImage) {
      const uploaded = await uploadImageFile(project.baseImage, 'modelcut/base');
      uploadedBaseImage = sanitizeForFirestore(uploaded);
    }
    
    // 2. 제품 이미지들 업로드
    onProgress?.('제품 이미지 업로드 중...');
    const uploadedProductImages = [];
    for (let i = 0; i < project.productImages.length; i++) {
      const uploaded = await uploadImageFile(project.productImages[i], 'modelcut/products');
      uploadedProductImages.push(sanitizeForFirestore(uploaded));
    }
    
    // 3. 히스토리 이미지들 업로드
    const uploadedHistory = [];
    for (let i = 0; i < project.history.length; i++) {
      onProgress?.(`생성 결과 업로드 중... (${i + 1}/${project.history.length})`);
      const uploaded = await uploadGenerationResult(project.history[i], i);
      uploadedHistory.push(sanitizeForFirestore(uploaded));
    }
    
    // 4. Firestore에 메타데이터 저장
    onProgress?.('프로젝트 저장 중...');
    const projectData = {
      id: projectId,
      name: project.name,
      owner: project.owner,
      baseImage: uploadedBaseImage,
      productImages: uploadedProductImages,
      history: uploadedHistory,
      activeVersionIndex: project.activeVersionIndex,
      lastUpdated: Timestamp.now(),
      createdAt: Timestamp.now(),
    };
    
    const docRef = await addDoc(collection(db, "projects"), projectData);
    
    console.log("✅ Project saved successfully:", docRef.id);
    return docRef.id;
    
  } catch (error) {
    console.error("❌ Error saving project:", error);
    throw error;
  }
}

/**
 * 모든 프로젝트 불러오기
 */
export async function fetchProjects(): Promise<Workspace[]> {
  try {
    const q = query(collection(db, "projects"), orderBy("lastUpdated", "desc"));
    const snapshot = await getDocs(q);
    
    const projects = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        // Timestamp를 number로 변환
        lastUpdated: data.lastUpdated?.toMillis?.() || data.lastUpdated || Date.now(),
        createdAt: data.createdAt?.toMillis?.() || data.createdAt || Date.now(),
      } as Workspace;
    });
    
    console.log(`✅ Fetched ${projects.length} projects`);
    return projects;
    
  } catch (error) {
    console.error("❌ Error fetching projects:", error);
    throw error;
  }
}

/**
 * 프로젝트 업데이트
 */
export async function updateProject(
  docId: string, 
  project: Workspace,
  onProgress?: (status: string) => void
): Promise<void> {
  try {
    // 1. 베이스 이미지 업로드
    onProgress?.('베이스 이미지 업로드 중...');
    let uploadedBaseImage = null;
    if (project.baseImage) {
      const uploaded = await uploadImageFile(project.baseImage, 'modelcut/base');
      uploadedBaseImage = JSON.parse(JSON.stringify(uploaded));
    }
    
    // 2. 제품 이미지들 업로드
    onProgress?.('제품 이미지 업로드 중...');
    const uploadedProductImages = [];
    for (let i = 0; i < project.productImages.length; i++) {
      const uploaded = await uploadImageFile(project.productImages[i], 'modelcut/products');
      uploadedProductImages.push(JSON.parse(JSON.stringify(uploaded)));
    }
    
    // 3. 히스토리 이미지들 업로드
    const uploadedHistory = [];
    for (let i = 0; i < project.history.length; i++) {
      onProgress?.(`생성 결과 업로드 중... (${i + 1}/${project.history.length})`);
      const uploaded = await uploadGenerationResult(project.history[i], i);
      uploadedHistory.push(JSON.parse(JSON.stringify(uploaded)));
    }
    
    // 4. Firestore 문서 업데이트
    onProgress?.('프로젝트 업데이트 중...');
    const docRef = doc(db, "projects", docId);
    await updateDoc(docRef, {
      name: project.name,
      owner: project.owner,
      baseImage: uploadedBaseImage,
      productImages: uploadedProductImages,
      history: uploadedHistory,
      activeVersionIndex: project.activeVersionIndex,
      lastUpdated: Timestamp.now(),
    });
    
    console.log("✅ Project updated:", docId);
  } catch (error) {
    console.error("❌ Error updating project:", error);
    throw error;
  }
}

/**
 * 프로젝트 삭제 (Firestore 문서 + Cloudinary 이미지 모두 삭제)
 */
export async function deleteProject(docId: string, project?: Workspace): Promise<void> {
  try {
    // Cloudinary 이미지 삭제 (project 데이터가 있는 경우)
    if (project) {
      console.log("🗑️ Deleting Cloudinary images...");
      await deleteProjectImages(project);
    }

    // Firestore 문서 삭제
    await deleteDoc(doc(db, "projects", docId));
    console.log("✅ Project deleted:", docId);
    
  } catch (error) {
    console.error("❌ Error deleting project:", error);
    throw error;
  }
}

// 호환성을 위해 기존 함수명도 유지
export const saveProjectToCloud = saveProject;
export const fetchProjectsFromCloud = fetchProjects;