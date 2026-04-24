import { GoogleGenAI } from "@google/genai";

export interface ChatMessage {
  role: 'user' | 'bot';
  text: string;
}

// AI Studio injection fallback
const apiKey = process.env.GEMINI_API_KEY || "AIzaSyC5E3yfVw_mnY2U5yF8lf6Ma6WMLekdEP0";

const ai = new GoogleGenAI({ apiKey });

export async function askEcoBot(prompt: string, context: string, userName: string, history: ChatMessage[] = []) {
  try {
    const chatHistory = (history || []).map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        ...chatHistory,
        { role: 'user', parts: [{ text: prompt }] }
      ],
      config: {
        systemInstruction: `Tu es EcoBot, l'assistant expert de l'application EcoSignal pour Bukavu. 
        TON RÔLE : Aider les citoyens à comprendre l'état des réseaux d'eau (REGIDESO) et d'électricité (SNEL).
        
        CONTEXTE DES PANNES ACTUELLES (BUKAVU) :
        ${context || "Aucune panne signalée pour le moment."}
        
        DIRECTIVES :
        1. Identité : Tu t'adresses à ${userName}.
        2. Spécificité : Réponds UNIQUEMENT aux questions liées à l'eau et l'électricité à Bukavu. Ne parle d'aucun autre sujet.
        3. Concision : Sois bref et précis. Ne donne pas de détails techniques inutiles.
        4. Empathie : Sois poli, aidant et encourageant.`,
        temperature: 0.7,
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("Le modèle n'a pas renvoyé de contenu.");
    }

    return text;
  } catch (error: any) {
    console.error("EcoBot AI Error:", error);
    
    // User-friendly error mapping
    const errorMessage = error?.message || String(error);
    if (errorMessage.includes("404")) {
      return "Désolé, le modèle d'IA est actuellement indisponible dans cette région. Veuillez réessayer plus tard.";
    }
    if (errorMessage.includes("429")) {
      return "Trop de demandes en même temps ! Bukavu est très actif. Réessayez dans une minute.";
    }
    if (errorMessage.includes("API key not valid") || errorMessage.includes("API_KEY_INVALID")) {
      return "Erreur d'authentification : La clé API configurée est invalide. Veuillez vérifier les secrets de l'application.";
    }
    
    return `Désolé, je rencontre une difficulté technique (${errorMessage.substring(0, 50)}...). Réessayez dans un instant.`;
  }
}
