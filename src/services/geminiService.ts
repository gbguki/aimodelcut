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
    You are a professional AI Creative Director for a high-end fashion and beauty studio.
    
    [TASK]: Generate a professional advertisement/campaign image featuring the provided product(s).
    
    [YOUR ROLE]:
    1. ANALYZE the product type (cosmetics, fashion, accessories, etc.)
    2. RESEARCH mentally what kinds of model shots are commonly used for this product category in real advertisements
    3. CREATE a visually compelling, commercially viable image that would fit in a real brand campaign
    
    [CREATIVE FREEDOM]:
    - You decide the best composition, angle, and style
    - Consider various advertising approaches for this product category:
      * Product packaging prominently displayed with model
      * Product being used/applied by model
      * Artistic close-up focusing on the result
      * Lifestyle shot showing the product in context
      * Editorial/fashion style interpretation
    
    [QUALITY STANDARDS]:
    - Professional 8K photography quality
    - Appropriate lighting for the product category
    - Composition that highlights the product's appeal
    - Model (if included) should complement, not overshadow the product
    - The image should look like it belongs in a real brand campaign or magazine
    
    [IMPORTANT]: Choose the advertising style that best showcases THIS specific product. Different products within the same category may need different approaches.
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
    INSTRUCTION: ${hasPreviousImage ? 'Edit the previous image based on the request.' : 'Create a professional advertisement image for the provided product(s).'}
    
    BEHAVIOR: ${hasPreviousImage ? 'Maintain the model and composition from the previous image, only apply the requested changes.' : 'Analyze what kind of product this is and create an appropriate advertisement-style image. Use your knowledge of how this product category is typically advertised.'}
    
    SPECIFIC REQUESTS: ${config.prompt || 'Create a compelling advertisement image that best showcases this product.'}
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