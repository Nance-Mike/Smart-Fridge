import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Standard Gemini Client Initialization with telemetry header as required by guidelines
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;

if (apiKey) {
  ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
} else {
  console.warn("Warning: GEMINI_API_KEY environment variable is not defined. The app will run in offline mode using preset fallback culinary templates.");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Setup parsers with larger payload capability for base64 snapped images
  app.use(express.json({ limit: "15mb" }));
  app.use(express.urlencoded({ extended: true, limit: "15mb" }));

  // Helper mock templates for offline development or missing client API key
  const fallbackIngredientsListByPreset = {
    standard: ["eggs", "milk", "butter", "bell pepper", "onion", "shredded cheddar", "spinach", "bread"],
    green: ["avocado", "cucumber", "spinach", "lime", "broccoli", "tofu", "garlic", "olive oil"],
    meat: ["chicken breast", "bacon", "cheese", "cream", "garlic", "mushrooms", "parsley"],
  };

  const getFallbackRecipesList = (ingredients: string[], dietaryRestrictions: string[] = []) => {
    // Elegant preset recipes in case the API key is not present or rate limits hit
    const allPresets = [
      {
        id: "recipe-1",
        name: "Chef's Garden Veggie Omelet",
        description: "A fluffy three-egg omelet loaded with colorful chopped bell peppers, onions, fresh spinach leaves, and melted sharp cheddar cheese.",
        difficulty: "Easy",
        difficultyRating: 4,
        prepTime: 12,
        calories: 340,
        essentialIngredients: ["3 Eggs", "1/4 cup Bell Pepper (diced)", "1/4 cup Onion (diced)", "1/2 cup Spinach", "3 tbsp Cheddar Cheese"],
        missingIngredients: [],
        steps: [
          "Crack eggs into a clean mixing bowl and whisk thoroughly until frothy.",
          "Heat a non-stick skillet over medium-low heat and melt a small pat of butter.",
          "Add diced onions and bell peppers to the skillet and sauté for 3 minutes until softened.",
          "Toss in the fresh spinach and cook just until it begins to wilt.",
          "Pour the whisked eggs over the sautéed vegetables in the skillet.",
          "Gently lift the edges with a spatula to let raw egg flow underneath.",
          "Once the base is set but moist, sprinkle cheddar cheese on one half and fold the omelet over.",
          "Slide onto a warm plate and serve immediately with fresh herbs if desired."
        ],
        dietaryTags: ["Vegetarian", "Gluten-Free", "Low-Carb"]
      },
      {
        id: "recipe-2",
        name: "Crispy Garlic Butter Tofu Bowl",
        description: "Golden cubed tofu tossed in aromatic garlic-infused butter, served over a refreshing bed of crispy fresh cucumber ribbons and wilted leafy green spinach.",
        difficulty: "Medium",
        difficultyRating: 3,
        prepTime: 20,
        calories: 420,
        essentialIngredients: ["1 block Tofu (pressed & cubed)", "2 cloves Garlic (minced)", "2 tbsp Butter", "1 cup Spinach", "1 Cucumber (ribboned)", "1 tbsp Olive Oil"],
        missingIngredients: [],
        steps: [
          "Heat olive oil in a skillet over medium-high heat.",
          "Add pressed, cubed tofu to the pan, cooking until golden-brown and crispy on all sides.",
          "Melt the butter directly into the pan alongside minced garlic, tossing to coat the tofu thoroughly.",
          "Stir in the fresh spinach leaves until wilted slightly, about 1 minute.",
          "Assemble the bowl by arranging crispy tofu, sautéed spinach, and fresh cucumber ribbons side-by-side.",
          "Drizzle any excess fragrant butter from the pan over the bowl before serving.",
        ],
        dietaryTags: ["Vegetarian", "Gluten-Free"]
      },
      {
        id: "recipe-3",
        name: "Tender Culinary Creamy Chicken Breast",
        description: "Succulent pan-seared chicken breast smothered in a decadent white wine cream sauce infused with sauteed mushrooms, crispy bacon bits, and chopped fresh parsley.",
        difficulty: "Medium",
        difficultyRating: 5,
        prepTime: 25,
        calories: 580,
        essentialIngredients: ["2 Chicken Breasts", "4 slices Bacon", "1 cup Mushrooms (sliced)", "1/2 cup Heavy Cream", "2 cloves Garlic (minced)", "Fresh Parsley"],
        missingIngredients: [],
        steps: [
          "Cook bacon slices in a chilled skillet, raising heat gradually until perfectly crispy. Remove bacon, leaving the rich drippings.",
          "Season chicken breasts generously with salt and pepper, then sear in the hot bacon drippings for 6 minutes per side until fully cooked.",
          "Remove chicken breasts and set aside on a warm plate to rest.",
          "Add sliced mushrooms and chopped garlic to the same pan, sautéing until beautiful and golden beige.",
          "Lower the heat and pour in the heavy cream, stirring up any browned tasty bits from the pan bottom.",
          "Simmer the cream sauce gently for 3-4 minutes until it thickens elegantly.",
          "Return the chicken breasts to the cream sauce, crumble the cooked bacon on top, and garnish with chopped fresh parsley.",
        ],
        dietaryTags: ["Keto", "Gluten-Free", "Low-Carb"]
      }
    ];

    // Filter based on dietary restrictions
    let filtered = allPresets;
    if (dietaryRestrictions && dietaryRestrictions.length > 0) {
      filtered = allPresets.filter(recipe => {
        return dietaryRestrictions.every(reqTag => 
          recipe.dietaryTags.some(recTag => recTag.toLowerCase() === reqTag.toLowerCase())
        );
      });
    }

    // Adapt missing ingredients list dynamically based on what the user provided
    const userLower = ingredients.map(i => i.toLowerCase());
    return filtered.map(recipe => {
      const missing: string[] = [];
      recipe.essentialIngredients.forEach(item => {
        const isFound = userLower.some(userItem => {
          const itemWords = item.toLowerCase().split(" ");
          return itemWords.some(w => w.length > 3 && userItem.includes(w)) || userItem.includes(item.toLowerCase());
        });
        if (!isFound) {
          missing.push(item);
        }
      });
      return {
        ...recipe,
        missingIngredients: missing
      };
    });
  };

  // 1. Analyze Fridge Photo Endpoint (Using gemini-3.1-pro-preview strictly for image understanding)
  app.post("/api/analyze-fridge", async (req, res) => {
    try {
      const { image, preset } = req.body;

      // Handle preset fallbacks if provided
      if (preset && preset in fallbackIngredientsListByPreset) {
        const ingredients = fallbackIngredientsListByPreset[preset as keyof typeof fallbackIngredientsListByPreset];
        return res.json({
          ingredients,
          confidence: "High (Preset Selected)",
          additionalThoughts: `Successfully loaded delicious ingredients for the Chef's ${preset.toUpperCase()} kitchen configuration!`
        });
      }

      if (!image) {
        return res.status(400).json({ error: "No image payload or preset option specified." });
      }

      // If Gemini client setup failed (no API key), return warning with high quality preset details
      if (!ai) {
        console.warn("Client requested Gemini photo analysis but API key is missing. Returning delicious mock ingredients.");
        return res.json({
          ingredients: fallbackIngredientsListByPreset.standard,
          confidence: "Simulation Mode (API Key Missing)",
          additionalThoughts: "Running in culinary preview mode. This simulates ingredient detection from your photo with standard kitchen elements!"
        });
      }

      // Prepare image parts for Gemini 3.1 Pro Preview
      // Base64 string looks like "data:image/jpeg;base64,..." - grab the raw chunk
      const parts = image.split(",");
      const mimeType = parts[0]?.match(/:(.*?);/)?.[1] || "image/jpeg";
      const base64Data = parts[1] || image;

      const imagePart = {
        inlineData: {
          mimeType,
          data: base64Data,
        },
      };

      const textPart = {
        text: "Analyze this photo of an open refrigerator, freezer, or pantry cupboard. Identify any edible ingredients, fresh produce, vegetables, meat, herbs, condiments, or dairy items visible. Keep the response factual, concise, and return ONLY general ingredient names.",
      };

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: { parts: [imagePart, textPart] },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              ingredients: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "List of general culinary ingredients identified from the photo. E.g. ['egg', 'milk', 'cheese', 'spinach', 'bell pepper']."
              },
              confidence: { type: Type.STRING, description: "Confidence level of ingredient identification, e.g. High, Medium, or Low" },
              additionalThoughts: { type: Type.STRING, description: "A friendly, sleek chef statement about the contents, e.g. 'You have some great staples here!'" }
            },
            required: ["ingredients", "confidence", "additionalThoughts"]
          }
        }
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error("Received empty text response from Gemini API.");
      }

      const parsedResult = JSON.parse(responseText);
      return res.json(parsedResult);

    } catch (error: any) {
      console.error("Error analyzing fridge photo:", error);
      // Fail gracefully: fallback to a warm set of items rather than crashing
      return res.json({
        ingredients: fallbackIngredientsListByPreset.standard,
        confidence: "Fallback Mode (API Error)",
        additionalThoughts: `Culinary analysis encountered a temporary glitch (${error?.message || "Service Busy"}). Showing our recommended gourmet ingredients!`
      });
    }
  });

  // 2. Suggest Recipes Endpoint (Using gemini-3.5-flash for rapid reasoning & JSON suggestions)
  app.post("/api/suggest-recipes", async (req, res) => {
    try {
      const { ingredients, dietaryRestrictions } = req.body;

      if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
        return res.status(400).json({ error: "Ingredients array is required." });
      }

      const dietsStr = (dietaryRestrictions && dietaryRestrictions.length > 0)
        ? `Adhering STRICTLY to the following dietary restrictions: ${dietaryRestrictions.join(", ")}.`
        : "No active dietary restriction filters.";

      // If Gemini client setup failed (no API key), return fallback recipes
      if (!ai) {
        console.warn("Client requested recipes but API token is missing. Serving high-quality offline culinary guide.");
        const fallbackList = getFallbackRecipesList(ingredients, dietaryRestrictions);
        return res.json({ recipes: fallbackList });
      }

      const promptMsg = `You are an elite, Michelin-star Culinary Chef. I have the following list of ingredients available in my fridge:
[${ingredients.join(", ")}].
${dietsStr}

Create up to 4 gorgeous, sleek, and highly practical recipe cards that can be made using these ingredients. 
Your recipes may use standard, common kitchen staples like salt, cooking oil, water, and basic black pepper, but any other major ingredient required must be analyzed.
If a major ingredient necessary for the recipe is not found in the provided list, flag it as a missing ingredient so the user can easily add it to their shopping list!

Generate steps with high clarity, suited perfectly for voice narration/read-aloud commands during step-by-step navigation.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: promptMsg,
        config: {
          systemInstruction: "You are a professional chef. Always respond with beautiful recipes in JSON format matching the schema requested. Keep step descriptions concise, clear, and easy to pronounce for text-to-speech engines.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              recipes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING, description: "A unique slug, e.g. 'spinach-gourmet-omelet'" },
                    name: { type: Type.STRING, description: "Name of the dish" },
                    description: { type: Type.STRING, description: "A stylish, brief pitch explaining why this meal is wonderful" },
                    difficulty: { type: Type.STRING, description: "One of 'Easy', 'Medium', 'Hard'" },
                    difficultyRating: { type: Type.INTEGER, description: "1 to 5 stars" },
                    prepTime: { type: Type.INTEGER, description: "Combined prep and cook time in minutes" },
                    calories: { type: Type.INTEGER, description: "Estimated calorie count" },
                    essentialIngredients: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: "List of absolute ingredient amounts with measurements, e.g., '1/2 cup heavy cream', '3 large eggs'"
                    },
                    missingIngredients: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: "The ingredients which are REQUIRED but are NOT in the available ingredients list [${ingredients.join(', ')}]."
                    },
                    steps: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: "List of easy-to-read, hands-free optimized recipe instructions."
                    },
                    dietaryTags: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: "All diets that apply, e.g., ['Keto', 'Vegetarian', 'Gluten-Free']"
                    }
                  },
                  required: ["id", "name", "description", "difficulty", "difficultyRating", "prepTime", "calories", "essentialIngredients", "missingIngredients", "steps", "dietaryTags"]
                }
              }
            },
            required: ["recipes"]
          }
        }
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error("Received empty recipe list from Gemini API.");
      }

      const parsedResult = JSON.parse(responseText);
      return res.json(parsedResult);

    } catch (error: any) {
      console.error("Error suggesting recipes from Gemini:", error);
      // Gracefully fall back to pre-populated offline presets matching the dietary filters!
      const fallbackList = getFallbackRecipesList(req.body.ingredients, req.body.dietaryRestrictions);
      return res.json({ recipes: fallbackList });
    }
  });

  // Serve static assets or compile front-end with Vite middleware depending on mode
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Smart Fridge server successfully running on http://localhost:${PORT}`);
  });
}

startServer();
