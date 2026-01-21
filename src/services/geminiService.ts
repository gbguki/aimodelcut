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
 * Gemini API를 사용한 배경 제거 함수
 */
export const removeBackground = async (
  imageUrl: string,
  options?: {
    preserveShadows?: boolean;
    aspectRatio?: string;
  }
): Promise<string> => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_API_KEY;
  
  if (!apiKey) {
    throw new Error("Gemini API key is not configured. Please set VITE_GEMINI_API_KEY or VITE_API_KEY in your .env file.");
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    // 이미지를 base64로 변환
    const { base64, mimeType } = await urlToBase64(imageUrl);

    const systemInstruction = `
      You are a professional image editing AI specializing in precise background removal for fashion and beauty product photography.
      
      [TASK]: Remove the background from the provided image while preserving the subject perfectly.
      
      [REQUIREMENTS]:
      1. Keep the main subject (model and product) completely intact with ALL details
      2. Remove ALL background elements completely - leave only the subject
      3. Create a clean, transparent background (PNG format)
      4. Maintain sharp, natural edges especially around:
         - Hair strands and flyaways
         - Clothing fabric edges
         - Product details
         - Fingers and hands
      5. ${options?.preserveShadows !== false ? 'Preserve natural shadows cast by the subject' : 'Remove all shadows'}
      6. Do NOT alter the subject's appearance, pose, composition, colors, or lighting
      7. Maintain the exact same resolution and aspect ratio
      
      [QUALITY]: Professional studio-quality cutout suitable for e-commerce and advertising.
      
      [OUTPUT]: Return ONLY the image with transparent background. No text response needed.
    `;

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: [
          { 
            text: "Remove the background from this image completely, keeping only the main subject with a transparent background. Preserve all fine details like hair and edges." 
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

    // 생성된 이미지 추출
    if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0];
      const contentParts = candidate?.content?.parts;
      
      if (contentParts) {
        for (const part of contentParts) {
          if (part.inlineData) {
            // PNG 형식으로 반환 (투명 배경 지원)
            return `data:image/png;base64,${part.inlineData.data}`;
          }
        }
      }
    }

    throw new Error("배경 제거에 실패했습니다.");
    
  } catch (error: any) {
    console.error("Background removal error:", error);
    
    // 에러 메시지 개선
    if (error.message?.includes('API key')) {
      throw new Error("API 키가 설정되지 않았습니다.");
    } else if (error.message?.includes('quota')) {
      throw new Error("API 호출 한도를 초과했습니다. 잠시 후 다시 시도해주세요.");
    } else if (error.message?.includes('image')) {
      throw new Error("이미지를 처리할 수 없습니다. 다른 이미지로 시도해주세요.");
    }
    
    throw new Error("배경 제거 중 오류가 발생했습니다: " + error.message);
  }
};