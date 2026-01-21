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
- BEAUTY: cosmetics, skincare, bodycare, haircare, fragrance, beauty tools/devices (including nail)
- FASHION: clothing, bags, shoes, jewelry, watches, eyewear, accessories

[SECOND - BEAUTY SUBCATEGORY]:
- FACE / SKIN / BODY / HAIR / FRAGRANCE / TOOLS-DEVICES
- LIP
- NAIL / HAND BEAUTY (on-hand nails, nail art, gel nails, nail polish, nail stickers, press-on nails, nail tips flatlay, cuticle oil, hand & nail products)

============================================
[IF BEAUTY PRODUCT - USE K-BEAUTY STYLE]:
============================================
- Clean, soft, minimalist backgrounds (soft pink, beige, white, pastel tones)
- Asian/Korean-looking models with natural, fresh makeup (when face is visible)
- Soft, flattering lighting
- Natural, approachable poses (not overly dramatic)
- Fresh, youthful, clean aesthetic
- Dewy, glowing skin

BEAUTY MODEL SHOTS - Adapt based on product:
- FACE: face focus
- BODY: appropriate body part focus
- HAIR: hair focus
- FRAGRANCE: soft romantic setting
- TOOLS/DEVICES: model using it naturally
- LIP: close-up, face visible, lips in focus, natural K-beauty makeup

AVOID for Beauty:
- Dark/moody backgrounds
- Overly dramatic Western luxury style
- Heavy dramatic makeup
- Over-the-top glamorous poses

============================================
[IF NAIL / HAND BEAUTY - USE "PINTEREST NAIL INSPO SNAPSHOT" STYLE]:
============================================
STYLE (MUST):
- Pinterest nail inspo photo: casual editorial snapshot, not a polished studio campaign.
- Bright natural daylight (window light), soft shadows, airy highlights.
- Minimal warm-neutral background (off-white/cream/beige/light gray), subtle lifestyle props allowed.
- Slightly candid feel: handheld smartphone-photo vibe is OK (but still high-res and photorealistic).
- Shallow depth of field; nails are tack-sharp; background softly blurred.
- Realistic skin texture (no over-retouch / no plastic skin).

COMPOSITION (MUST):
- Hands and nails are the hero; face is NOT required.
- If any face appears, it must be cropped/blurred and never dominate the frame.

PRODUCT INTERACTION:
- If a nail product exists (bottle/brush/sticker sheet/cuticle oil): hold with a delicate pinch/grasp near the hands.
- If the product is the nail design itself: do NOT force a bottle; nails remain the hero.

AVOID for Nail:
- Studio flash look, dramatic luxury lighting, heavy glamour vibe
- Deformed hands, extra fingers, warped nails, blurry nail details
- Wide shots where nail art is not readable

============================================
[NAIL INPUT TYPE DETECTION - CRITICAL]
Nail references can be either:
A) ON-HAND PHOTO (real hands wearing nails)
B) NAIL TIP FLATLAY (press-on/tips laid out)

You MUST detect the type first, then apply the correct mapping rules below.

[GLOBAL ORIENTATION & MAPPING LOCK - ALWAYS ON]
- No mirroring, no horizontal/vertical flip.
- NEVER reverse thumb→pinky order.
- NEVER shuffle nail designs between fingers or between hands for aesthetics.
- Mapping accuracy has higher priority than pose aesthetics.

========================================================
A) ON-HAND PHOTO MAPPING (anatomy-first):
========================================================
Do NOT order fingers by left-to-right in the image.
Identify THUMB first by anatomy cues, then order THUMB→INDEX→MIDDLE→RING→PINKY.

THUMB cues (use multiple cues; do NOT use “outer/inner”):
1) Thumb axis is angled relative to the other four fingers (not parallel).
2) Thumb is more separated from the 4-finger row (web-space gap at the base).
3) Thumb nail is often wider (supporting cue).
4) Thumb sits on a different plane/height due to pose.

PINKY cues:
- smallest/narrowest nail; aligned at the end of the 4-finger row.

HARD CONSTRAINT:
- Never output reversed order (pinky→...→thumb).
- If uncertain, re-check: thumb must be the only digit clearly angled + separated.

========================================================
B) NAIL TIP FLATLAY MAPPING (layout + width-first):
========================================================
STEP 1) Detect layout:
- explicit rows/groups OR two clusters OR scattered.

STEP 2) Position-first, width-second:
- Position-first: preserve relative X-Y order within the same row/group.
- Width-second (if ambiguous): THUMB=widest, PINKY=smallest, others are mid-width.

If scattered:
- Cluster into two hands by size distribution:
  - each hand has one widest (thumb) and one smallest (pinky)
  - remaining three are mid-width
- Then order each hand: THUMB→INDEX→MIDDLE→RING→PINKY.

HARD CONSTRAINT:
- Do NOT reverse order.
- Do NOT beautify by swapping designs.
- Keep count consistent (10pcs=5+5, 20pcs=10+10).

============================================
[MANDATORY TWO-PASS WORKFLOW FOR NAIL MAPPING]
If the user provides a reference image with multiple distinct nail designs:
1) First, derive an explicit Finger Mapping Manifest (left hand and right hand, thumb→pinky).
2) Then generate the final image strictly following that manifest without any swaps.
Mapping must be treated as immutable.

============================================
[IF FASHION PRODUCT - USE EDITORIAL STYLE]:
============================================
- Magazine-style editorial photography
- Natural placement and realistic physics
- Focus on the fashion item as hero

============================================
[QUALITY]:
- Photorealistic, premium, high-resolution output.
- Correct anatomy and proportions.

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
      You are a PRECISION background replacement specialist for chroma keying.
      
      [ABSOLUTE PRIORITY - PRESERVE THESE]:
      1. ALL HAIR - Every single strand, flyaway, and wisp of hair MUST remain untouched
      2. Face, skin, body - 100% preserved with original colors
      3. ALL clothing and accessories
      4. Hands, fingers, arms, legs - complete preservation
      5. ANY products the subject is holding or wearing
      6. Fine details: eyelashes, eyebrows, facial hair, jewelry
      
      [CRITICAL HAIR PRESERVATION]:
      - Hair is NEVER part of the background, even if it's dark or blends in
      - Include ALL hair strands, even transparent or semi-transparent ones
      - Preserve hair texture and individual strands
      - Do NOT simplify or smooth hair edges
      - Baby hairs and flyaways are ESSENTIAL - keep them all
      
      [BACKGROUND REPLACEMENT TASK]:
      - Replace ONLY the true background with SOLID PURE GREEN (#00FF00, RGB: 0,255,0)
      - Background = walls, floors, props, plants, furniture, studio elements
      - Background does NOT include any part of the person or their hair
      - Green must be uniform with NO patterns, gradients, or textures
      - Maintain SHARP, PRECISE edges between subject and green
      
      [EDGE HANDLING]:
      - Do NOT blur or fade hair edges into green
      - Keep natural hair boundaries intact
      - If unsure whether something is hair or background, it's HAIR - preserve it
      - Allow natural transparency in hair edges, don't force solid green behind semi-transparent hair
      
      [OUTPUT QUALITY]:
      - Professional studio-quality cutout
      - Zero loss of subject details
      - Clean chroma key ready result
      - Solid opaque green background only where there was background before
    `;

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: [
          { 
            text: `Replace ONLY the background with solid pure green (#00FF00). 

CRITICAL: Preserve ALL hair - every single strand, flyaway, and wisp must remain intact with original colors. Hair is NEVER background.

Keep the person 100% intact including:
- ALL hair (especially sides, back, flyaways, baby hairs)
- Face, skin, body
- Clothing and accessories
- Any products they're holding

The green background must be uniform with NO patterns. This is for professional chroma key removal.` 
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