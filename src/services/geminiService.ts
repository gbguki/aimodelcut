// src/services/geminiService.ts

import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { ImageFile, GenerationConfig, AspectRatio } from "../types";

export const generateFashionImage = async (
  baseImage: ImageFile,
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

  const systemInstruction = `
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

  const userPrompt = `
    INSTRUCTION: Integrate the provided products into the scene.
    BEHAVIOR: If small items are present, make the model hold them as if in a professional beauty commercial. 
    SPECIFIC REQUESTS: ${config.prompt || 'Apply products naturally and maintain the overall aesthetic.'}
  `;

  const parts: any[] = [{ text: userPrompt }];

  // Context: Base Image
  if (!baseImage.base64 || !baseImage.mimeType) {
    throw new Error("Base image must have base64 data and mimeType");
  }
  
  parts.push({
    inlineData: {
      data: baseImage.base64,
      mimeType: baseImage.mimeType
    }
  });

  // Assets: Product Images
  productImages.forEach(img => {
    if (!img.base64 || !img.mimeType) {
      console.warn("Product image missing base64 or mimeType, skipping");
      return;
    }
    parts.push({
      inlineData: {
        data: img.base64,
        mimeType: img.mimeType
      }
    });
  });

  if (config.previousImage) {
    const base64Data = config.previousImage.includes(',') 
      ? config.previousImage.split(',')[1] 
      : config.previousImage;
    parts.push({
      inlineData: {
        data: base64Data,
        mimeType: 'image/png'
      }
    });
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

    if (!imageUrl) throw new Error("Synthesis failed. Check if the images are clear.");

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
