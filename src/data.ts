import { PresetFridgeConfig } from "./types";

export const PRESET_FRIDGES: PresetFridgeConfig[] = [
  {
    key: "standard",
    name: "Classic Fridge Staples",
    description: "Standard daily essentials including farm eggs, whole milk, onions, bell peppers, fresh spinach, and bread.",
    emoji: "🥚",
    sampleIngredients: ["Eggs", "Milk", "Butter", "Bell Pepper", "Onion", "Spinach", "Bread", "Cheddar Cheese"],
    imageUrl: "https://images.unsplash.com/photo-1571175432267-ef152cb52382?auto=format&fit=crop&w=500&q=80"
  },
  {
    key: "green",
    name: "Green Garden Bounty",
    description: "Plant-based fresh crisp produce like ripe avocados, crunchy cucumbers, green spinach, broccoli, block tofu, and lime.",
    emoji: "🥑",
    sampleIngredients: ["Avocado", "Cucumber", "Spinach", "Lime", "Broccoli", "Tofu", "Garlic", "Olive Oil"],
    imageUrl: "https://images.unsplash.com/photo-1595855759920-86582396756a?auto=format&fit=crop&w=500&q=80"
  },
  {
    key: "meat",
    name: "High-Protein Master",
    description: "Rich selection with chicken breasts, hickory bacon, fresh cream, white garlic, and fresh button mushrooms.",
    emoji: "🍗",
    sampleIngredients: ["Chicken Breast", "Bacon", "Cheese", "Heavy Cream", "Garlic", "Mushrooms", "Parsley", "Butter"],
    imageUrl: "https://images.unsplash.com/photo-1606787366850-de6330128bfc?auto=format&fit=crop&w=500&q=80"
  }
];

export const DIETARY_FILTERS = [
  { id: "Vegetarian", label: "Vegetarian 🥦", description: "Meat-free recipes" },
  { id: "Keto", label: "Keto Diet 🥓", description: "Low carb, high healthy fats" },
  { id: "Gluten-Free", label: "Gluten-Free 🌾", description: "Contains no gluten protein" },
  { id: "Low-Carb", label: "Low-Carb 🍳", description: "Strictly reduced carbohydrates" },
  { id: "Vegan", label: "Vegan 🌱", description: "Completely plant-based ingredients" },
  { id: "Dairy-Free", label: "Dairy-Free 🥛", description: "No milk or butter derivatives" }
];
