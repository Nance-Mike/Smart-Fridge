export interface Recipe {
  id: string;
  name: string;
  description: string;
  difficulty: "Easy" | "Medium" | "Hard" | string;
  difficultyRating: number; // 1 to 5 stars
  prepTime: number; // in minutes
  calories: number;
  essentialIngredients: string[];
  missingIngredients: string[];
  steps: string[];
  dietaryTags: string[];
}

export interface ShoppingItem {
  id: string;
  name: string;
  checked: boolean;
  addedAt: string;
  recipeSource?: string; // name of recipe it was added from
}

export interface FridgeAnalysisResult {
  ingredients: string[];
  confidence: string;
  additionalThoughts: string;
}

export type PresetFridgeKey = "standard" | "green" | "meat";

export interface PresetFridgeConfig {
  key: PresetFridgeKey;
  name: string;
  description: string;
  emoji: string;
  sampleIngredients: string[];
  imageUrl: string;
}
