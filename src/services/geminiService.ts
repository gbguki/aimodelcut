// src/services/geminiService.ts

import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { ImageFile, GenerationConfig, AspectRatio } from "../types";

/**
 * URL에서 base64 데이터를 가져오는 함수
 */
async function urlToBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  // 이미 base64 데이터 URL인 경우
  if (url.startsWith('data:')) {
    const matches = url.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
      return { mimeType: matches[1], base64: matches[2] };
    }
  }

  // 외부 URL인 경우 fetch해서 base64로 변환
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const mimeType = blob.type || 'image/jpeg';
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(',')[1];
        resolve({ base64, mimeType });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Failed to fetch image from URL:', error);
    throw new Error('이미지를 불러오는데 실패했습니다.');
  }
}

/**
 * ImageFile에서 base64 데이터를 확보하는 함수
 */
async function ensureBase64(imageFile: ImageFile): Promise<{ base64: string; mimeType: string }> {
  // 이미 base64가 있으면 그대로 사용
  if (imageFile.base64 && imageFile.mimeType) {
    return { base64: imageFile.base64, mimeType: imageFile.mimeType };
  }

  // URL에서 base64 가져오기
  if (imageFile.url) {
    return await urlToBase64(imageFile.url);
  }

  throw new Error('이미지 데이터가 없습니다.');
}

export const generateFashionImage = async (
  baseImage: ImageFile | null,
  productImages: ImageFile[],
  config: GenerationConfig
): Promise<{ imageUrl: string; summary: string; groundingChunks?: any[] }> => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_API_KEY;
  
  if (!apiKey) {
    throw new Error("Gemini API key is not configured. Please set VITE_GEMINI_API_KEY or VITE_API_KEY in your .env file.");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const getApiAspectRatio = (ratio: AspectRatio): string => {
    switch (ratio) {
      case AspectRatio.SQUARE: return '1:1';
      case AspectRatio.PORTRAIT_4_5: return '3:4';
      case AspectRatio.MOBILE_9_16: return '9:16';
      default: return '1:1';
    }
  };

  // 베이스 이미지 유무에 따라 다른 시스템 프롬프트 사용
  const systemInstructionWithBase = `
    You are a professional AI Creative Director for a high-end fashion and beauty studio.
    
    [STRICT OPERATING PROCEDURES]
    1. FRAMING CONSISTENCY: Do not change the camera distance or zoom of the 'Base Image'. If the model's head or feet are cropped in the base, they MUST remain cropped.
    
    2. PRODUCT INTERACTION (CRITICAL):
       - IF THE PRODUCT IS A COSMETIC (lipstick, palette, bottle): The model MUST hold the item gracefully. Use "pinch" or "delicate grasp" gestures. Position the item near the face or hands to suggest usage.
       - IF THE PRODUCT IS ACCESSORY (bag, eyewear): Ensure natural placement (shoulder, hand, face).
       - IF THE PRODUCT IS CLOTHING: Fit it perfectly to the model's anatomy with realistic physics.

    3. MODEL CHARACTERISTICS: Maintain the base model's pose exactly. Only modify appearance (gender/hair/makeup) if specifically requested in the prompt.
    
    4. QUALITY: The output must be indistinguishable from a real 8k professional photograph.
  `;

  const systemInstructionNoBase = `
    You are a professional AI Creative Director for "ModelCut AI" - a service that creates MODEL SHOTS for product advertisements.
    
    [CORE CONCEPT]: Every image MUST include a human model. This is a "Model Cut" service.
    
    [FIRST]: Identify the product category:
    - BEAUTY: All cosmetics, skincare, bodycare, haircare, fragrance, and beauty tools/devices
      (Examples: makeup, lip, nail, skincare, serum, cream, lotion, body oil, body scrub, sunscreen, 
       hand cream, foot cream, hair styling, shampoo, fragrance, perfume, 
       beauty tools like gua sha, rollers, brushes, LED masks, beauty devices, etc.)
    - FASHION: Clothing, bags, shoes, jewelry, watches, eyewear, accessories
    
    ============================================
    [IF BEAUTY PRODUCT - USE K-BEAUTY STYLE]:
    ============================================
    - Clean, soft, minimalist backgrounds (soft pink, beige, white, pastel tones)
    - Asian/Korean-looking models with natural, fresh makeup
    - Soft, flattering lighting
    - Natural, approachable poses (not overly dramatic)
    - Fresh, youthful, clean aesthetic
    - Dewy, glowing skin
    
    BEAUTY MODEL SHOTS - Adapt based on product:
    - FACE PRODUCTS: Model's face as focus
    - BODY PRODUCTS: Show appropriate body part (back, legs, arms, etc.) with model
    - LIP/NAIL: Close-up with face visible
    - HAIR: Model with beautiful hair
    - FRAGRANCE: Soft, romantic setting
    - TOOLS/DEVICES: Model using it on the appropriate area (face tool = face, body tool = body)
    
    AVOID for Beauty:
    - Dark, moody backgrounds
    - Overly dramatic Western luxury style
    - Heavy, dramatic makeup
    - Over-the-top glamorous poses
    
    ============================================
    [IF FASHION PRODUCT - USE EDITORIAL STYLE]:
    ============================================
    - Can use various backgrounds (studio, urban, lifestyle)
    - Diverse model looks welcome
    - Editorial, magazine-style photography
    - Dynamic or elegant poses depending on the item
    - Focus on the fashion item as hero
    
    FASHION MODEL SHOTS:
    - CLOTHING: Full/half body wearing the item
    - BAGS: Model holding/wearing naturally
    - SHOES: Full body or lower body focus
    - JEWELRY/WATCHES: Close-up or portrait with item visible
    - EYEWEAR: Face focus with glasses/sunglasses
    
    ============================================
    [QUALITY]: Professional 8K photography, campaign quality
  `;

  const hasBaseImage = baseImage !== null;
  const hasPreviousImage = !!config.previousImage;
  const systemInstruction = hasBaseImage ? systemInstructionWithBase : systemInstructionNoBase;

  // 이전 이미지가 있으면 수정 모드
  const editInstruction = hasPreviousImage ? `
    [EDIT MODE]: A previous generated image is provided. You MUST use it as the base and apply ONLY the requested changes.
    - KEEP the same model, pose, composition, lighting, and overall style
    - ONLY modify what is specifically requested in the prompt
    - Do NOT regenerate from scratch - this is an EDIT, not a new creation
  ` : '';

  const userPromptWithBase = `
    ${editInstruction}
    INSTRUCTION: Integrate the provided products into the scene.
    BEHAVIOR: If small items are present, make the model hold them as if in a professional beauty commercial. 
    SPECIFIC REQUESTS: ${config.prompt || 'Apply products naturally and maintain the overall aesthetic.'}
  `;

  const userPromptNoBase = `
    ${editInstruction}
    INSTRUCTION: ${hasPreviousImage ? 'Edit the previous image based on the request.' : 'Create a MODEL SHOT featuring a MODEL showcasing the provided product(s).'}
    
    BEHAVIOR: ${hasPreviousImage ? 'Maintain the model and composition from the previous image, only apply the requested changes.' : 'First identify if this is a BEAUTY or FASHION product. For BEAUTY products, use K-beauty style (Asian model, soft/pastel backgrounds, fresh aesthetic). For FASHION products, use editorial style.'}
    
    SPECIFIC REQUESTS: ${config.prompt || 'Create a professional model shot appropriate for this product category.'}
  `;

  const userPrompt = hasBaseImage ? userPromptWithBase : userPromptNoBase;

  const parts: any[] = [{ text: userPrompt }];

  // Base Image (있는 경우에만)
  if (baseImage) {
    try {
      const baseData = await ensureBase64(baseImage);
      parts.push({
        inlineData: {
          data: baseData.base64,
          mimeType: baseData.mimeType
        }
      });
    } catch (error) {
      console.error('Failed to process base image:', error);
      throw new Error('베이스 이미지를 처리하는데 실패했습니다.');
    }
  }

  // Product Images
  for (const img of productImages) {
    try {
      const productData = await ensureBase64(img);
      parts.push({
        inlineData: {
          data: productData.base64,
          mimeType: productData.mimeType
        }
      });
    } catch (error) {
      console.warn('Failed to process product image, skipping:', error);
    }
  }

  // Previous Image (이전 생성 결과 기반 수정 시)
  if (config.previousImage) {
    try {
      const prevData = await urlToBase64(config.previousImage);
      parts.push({
        inlineData: {
          data: prevData.base64,
          mimeType: prevData.mimeType
        }
      });
    } catch (error) {
      console.warn('Failed to process previous image:', error);
    }
  }

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: { parts },
      config: {
        systemInstruction: systemInstruction,
        imageConfig: {
          aspectRatio: getApiAspectRatio(config.aspectRatio) as any,
          imageSize: config.imageSize || '1024'
        }
      },
    });

    let imageUrl = '';
    let summary = '';

    if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0];
      const contentParts = candidate?.content?.parts;
      if (contentParts) {
        for (const part of contentParts) {
          if (part.inlineData) {
            imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          } else if (part.text) {
            summary = part.text.trim().split('\n')[0];
          }
        }
      }
    }

    if (!imageUrl) throw new Error("이미지 생성에 실패했습니다. 다시 시도해주세요.");

    return { 
      imageUrl, 
      summary, 
      groundingChunks: response.candidates?.[0]?.groundingMetadata?.groundingChunks 
    };
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

/**
 * 1단계: Gemini API로 배경을 녹색(Chroma Key)으로 변경
 */
export const replaceBackgroundWithGreen = async (
  imageUrl: string,
  options?: {
    aspectRatio?: string;
  }
): Promise<string> => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_API_KEY;
  
  if (!apiKey) {
    throw new Error("Gemini API key is not configured.");
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const { base64, mimeType } = await urlToBase64(imageUrl);

    const systemInstruction = `
      You are a professional image editor specializing in background replacement for chroma keying.
      
      [CRITICAL TASK]: Replace the background with a SOLID PURE GREEN screen (#00FF00, RGB: 0, 255, 0).
      
      [WHAT TO KEEP - DO NOT MODIFY]:
      - ALL people, models, faces, bodies (100% intact)
      - ALL products, accessories, clothing
      - Hair, skin, makeup, nails, hands - EVERYTHING on the person
      - Natural lighting and shadows ON the subject
      - Edge details, especially hair strands
      
      [WHAT TO REPLACE]:
      - Replace ALL background areas with SOLID PURE GREEN (#00FF00)
      - The green MUST be uniform and consistent
      - Green should NOT touch or blend with the subject
      - Maintain clean, sharp edges between subject and green background
      
      [CRITICAL REQUIREMENTS]:
      1. Use ONLY pure green color: RGB(0, 255, 0) or HEX #00FF00
      2. NO gradients, NO patterns, NO textures in the green area
      3. NO transparency - solid opaque green background
      4. Preserve ALL subject details perfectly
      5. Maintain sharp edges without green spill on the subject
      
      [OUTPUT]: Image with subject intact on a solid pure green background, ready for chroma key removal.
    `;

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: [
          { 
            text: "Replace the background with a SOLID PURE GREEN color (#00FF00). Keep the person/model 100% intact. The green background must be uniform with NO patterns or gradients. This is for chroma key background removal." 
          },
          {
            inlineData: {
              data: base64,
              mimeType: mimeType
            }
          }
        ]
      },
      config: {
        systemInstruction: systemInstruction,
        imageConfig: {
          aspectRatio: options?.aspectRatio || '1:1',
          imageSize: '1024'
        }
      }
    });

    if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0];
      const contentParts = candidate?.content?.parts;
      
      if (contentParts) {
        for (const part of contentParts) {
          if (part.inlineData) {
            return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          }
        }
      }
    }

    throw new Error("녹색 배경 생성에 실패했습니다.");
    
  } catch (error: any) {
    console.error("Green background replacement error:", error);
    throw new Error("배경을 녹색으로 변경하는데 실패했습니다: " + error.message);
  }
};

/**
 * 2단계: Canvas를 사용하여 녹색 배경을 투명하게 변환 (강력한 Green Spill 제거)
 */
export const removeGreenScreen = async (
  imageUrl: string,
  tolerance: number = 40
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      
      if (!ctx) {
        reject(new Error('Canvas context를 생성할 수 없습니다.'));
        return;
      }

      canvas.width = img.width;
      canvas.height = img.height;
      
      // 이미지 그리기
      ctx.drawImage(img, 0, 0);
      
      // 픽셀 데이터 가져오기
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      // 1차: 녹색 배경 완전 제거
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        
        if (a === 0) continue;
        
        // 녹색 강도 계산
        const greenStrength = g - Math.max(r, b);
        const avgRB = (r + b) / 2;
        const greenRatio = g / (avgRB + 1);
        
        // 순수 녹색 배경 (완전 투명)
        if (greenStrength > 80 || (g > 180 && greenRatio > 1.8)) {
          data[i + 3] = 0;
        }
        // 중간 녹색 (부분 투명 + Despill)
        else if (greenStrength > 40 || (g > 120 && greenRatio > 1.4)) {
          const alpha = Math.max(0, 255 - greenStrength * 3);
          data[i + 3] = alpha;
          
          // Green 채널을 R/B 평균으로 완전 대체
          data[i + 1] = avgRB;
        }
        // 약한 녹색 tint (Despill만)
        else if (greenStrength > 15 || greenRatio > 1.2) {
          data[i + 1] = avgRB;
        }
      }
      
      // 2차: 경계선 3x3 커널 처리 (강력한 Despill)
      const tempData = new Uint8ClampedArray(data);
      
      for (let y = 1; y < canvas.height - 1; y++) {
        for (let x = 1; x < canvas.width - 1; x++) {
          const idx = (y * canvas.width + x) * 4;
          const alpha = data[idx + 3];
          
          // 불투명하거나 반투명 픽셀만 처리
          if (alpha > 0) {
            const r = tempData[idx];
            const g = tempData[idx + 1];
            const b = tempData[idx + 2];
            
            // 주변 8개 픽셀 검사
            let hasTransparentNeighbor = false;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nIdx = ((y + dy) * canvas.width + (x + dx)) * 4;
                if (tempData[nIdx + 3] < 128) {
                  hasTransparentNeighbor = true;
                  break;
                }
              }
              if (hasTransparentNeighbor) break;
            }
            
            // 경계 픽셀의 녹색 완전 제거
            if (hasTransparentNeighbor) {
              const avgRB = (r + b) / 2;
              const greenStrength = g - Math.max(r, b);
              
              // 녹색이 조금이라도 강하면 제거
              if (greenStrength > 5) {
                data[idx + 1] = Math.min(avgRB, g);
              }
            }
          }
        }
      }
      
      // 3차: 미세한 녹색 tint 최종 제거 (전체 이미지)
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 0) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          
          // 여전히 G가 평균보다 높으면 보정
          const avgRB = (r + b) / 2;
          if (g > avgRB + 10) {
            // 녹색을 줄이되 자연스러운 색상 유지
            const excess = g - avgRB;
            data[i + 1] = avgRB + Math.min(excess * 0.3, 10);
          }
        }
      }
      
      // 수정된 데이터 적용
      ctx.putImageData(imageData, 0, 0);
      
      // PNG로 변환 (투명도 지원)
      const resultUrl = canvas.toDataURL('image/png');
      resolve(resultUrl);
    };
    
    img.onerror = () => {
      reject(new Error('이미지를 로드할 수 없습니다.'));
    };
    
    img.src = imageUrl;
  });
};

/**
 * 통합 배경 제거 함수 (2단계 프로세스)
 */
export const removeBackground = async (
  imageUrl: string,
  options?: {
    preserveShadows?: boolean;
    aspectRatio?: string;
  }
): Promise<string> => {
  try {
    // 1단계: Gemini로 배경을 녹색으로 변경
    const greenBgImage = await replaceBackgroundWithGreen(imageUrl, {
      aspectRatio: options?.aspectRatio
    });
    
    // 2단계: Canvas로 녹색 제거하여 투명하게
    const transparentImage = await removeGreenScreen(greenBgImage, 50);
    
    return transparentImage;
    
  } catch (error: any) {
    console.error("Background removal error:", error);
    throw new Error("배경 제거 중 오류가 발생했습니다: " + error.message);
  }
};