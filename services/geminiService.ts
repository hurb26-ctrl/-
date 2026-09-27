
import { GoogleGenAI, Type } from "@google/genai";
import { OCRResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });

export const analyzeTextInImage = async (base64Image: string): Promise<OCRResult> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: 'image/png',
            data: base64Image.split(',')[1],
          },
        },
        {
          text: `Identify the Korean text in this image snippet. 
          Estimate the following typography properties:
          1. The exact text content.
          2. Approximate font size in pixels.
          3. Font weight (e.g., normal, bold).
          4. Dominant text color in hex.
          5. Closest font family (sans-serif, serif, monospace).
          6. Dominant background color in hex behind the text.
          Return ONLY a JSON object with keys: text, fontSize, fontWeight, fontColor, fontFamily, backgroundColor.`
        }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
          fontSize: { type: Type.NUMBER },
          fontWeight: { type: Type.STRING },
          fontColor: { type: Type.STRING },
          fontFamily: { type: Type.STRING },
          backgroundColor: { type: Type.STRING },
        },
        required: ["text", "fontSize", "fontWeight", "fontColor", "fontFamily", "backgroundColor"]
      }
    }
  });

  try {
    const data = JSON.parse(response.text || "{}");
    return {
      text: data.text || "",
      fontSize: data.fontSize || 16,
      fontWeight: data.fontWeight || "normal",
      fontColor: data.fontColor || "#000000",
      fontFamily: data.fontFamily || "sans-serif",
      backgroundColor: data.backgroundColor || "#ffffff"
    };
  } catch (error) {
    console.error("Failed to parse Gemini response", error);
    return {
      text: "OCR Error",
      fontSize: 16,
      fontWeight: "normal",
      fontColor: "#000000",
      fontFamily: "sans-serif",
      backgroundColor: "#ffffff"
    };
  }
};
