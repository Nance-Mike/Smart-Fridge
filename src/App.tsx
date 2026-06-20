import React, { useState, useEffect, useRef } from "react";
import {
  Camera,
  Upload,
  Sparkles,
  Volume2,
  VolumeX,
  Play,
  RotateCcw,
  Check,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  ChefHat,
  Filter,
  ShoppingCart,
  Loader2,
  X,
  AlertCircle
} from "lucide-react";
import { PRESET_FRIDGES, DIETARY_FILTERS } from "./data";
import { Recipe, ShoppingItem, FridgeAnalysisResult, PresetFridgeKey } from "./types";

export default function App() {
  // Available ingredients list
  const [ingredients, setIngredients] = useState<string[]>([
    "eggs", "milk", "butter", "bell pepper", "onion", "shredded cheddar", "spinach", "bread"
  ]);
  
  // Status states
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingRecipes, setLoadingRecipes] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<string>("High");
  const [thoughts, setThoughts] = useState<string>("You have some great staples here! Ready to cook delicious dishes.");

  // Chosen photo input or base64 preview
  const [picPreview, setPicPreview] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<PresetFridgeKey | "custom">("standard");

  // Camera state
  const [showCamera, setShowCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  // Suggested Recipes state
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [selectedDietaryTags, setSelectedDietaryTags] = useState<string[]>([]);

  // Step-by-Step Cooking state
  const [cookingMode, setCookingMode] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(300); // 5 mins default
  const [timerActive, setTimerActive] = useState(false);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Shopping List state
  const [shoppingList, setShoppingList] = useState<ShoppingItem[]>([
    { id: "shop-1", name: "Fresh Basil", checked: false, addedAt: new Date().toLocaleTimeString(), recipeSource: "Mediterranean Omelet" },
    { id: "shop-2", name: "Greek Yogurt", checked: true, addedAt: new Date().toLocaleTimeString(), recipeSource: "Yogurt Parfait" }
  ]);
  const [newShoppingItem, setNewShoppingItem] = useState("");

  // Speech synthesiser reference
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Add custom manual ingredient state
  const [manualIngredientInput, setManualIngredientInput] = useState("");

  // Start with preset recipes on first load
  useEffect(() => {
    fetchSuggestedRecipes(ingredients);
  }, []);

  // Sync Timer countdown
  useEffect(() => {
    if (timerActive && timerSeconds > 0) {
      timerIntervalRef.current = setInterval(() => {
        setTimerSeconds((prev) => prev - 1);
      }, 1000);
    } else if (timerSeconds === 0) {
      setTimerActive(false);
    }

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [timerActive, timerSeconds]);

  // Clean speaking on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  // Dynamic fetch recipes helper
  const fetchSuggestedRecipes = async (itemsList: string[], diets: string[] = selectedDietaryTags) => {
    setLoadingRecipes(true);
    setApiError(null);
    try {
      const response = await fetch("/api/suggest-recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingredients: itemsList,
          dietaryRestrictions: diets,
        }),
      });
      const data = await response.json();
      if (data.recipes) {
        setRecipes(data.recipes);
        // Automatically default selected recipe to first if none or not in returned list
        if (data.recipes.length > 0) {
          const matched = data.recipes.find((r: Recipe) => selectedRecipe && r.id === selectedRecipe.id);
          setSelectedRecipe(matched || data.recipes[0]);
        } else {
          setSelectedRecipe(null);
        }
      }
    } catch (err: any) {
      console.error(err);
      setApiError("Failed to communicate with culinary database. Showing fallback recipes.");
    } finally {
      setLoadingRecipes(false);
    }
  };

  // Switch Dietary Tag filters
  const toggleDietaryTag = (tagId: string) => {
    const updated = selectedDietaryTags.includes(tagId)
      ? selectedDietaryTags.filter((t) => t !== tagId)
      : [...selectedDietaryTags, tagId];
    setSelectedDietaryTags(updated);
    fetchSuggestedRecipes(ingredients, updated);
  };

  // Choose preset fridge staples
  const handleSelectPreset = async (presetKey: PresetFridgeKey) => {
    setActivePreset(presetKey);
    setAnalyzing(true);
    setApiError(null);
    setPicPreview(null); // Clear image view since preset is chosen

    const preset = PRESET_FRIDGES.find((p) => p.key === presetKey);
    try {
      const response = await fetch("/api/analyze-fridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset: presetKey }),
      });
      const data: FridgeAnalysisResult = await response.json();
      if (data.ingredients) {
        setIngredients(data.ingredients);
        setConfidence(data.confidence || "High");
        setThoughts(data.additionalThoughts || "Loaded delicious preset ingredients.");
        fetchSuggestedRecipes(data.ingredients);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAnalyzing(false);
    }
  };

  // Upload Photo File
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setPicPreview(base64String);
      setActivePreset("custom");
      analyzeCustomImage(base64String);
    };
    reader.readAsDataURL(file);
  };

  // Real Camera capture & snapshot
  const startCameraWebcam = async () => {
    setShowCamera(true);
    setApiError(null);
    try {
      let stream: MediaStream;
      try {
        // Try back-facing first for close-up fridge capture
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
      } catch (firstErr) {
        console.warn("Environmental camera failed or missing, trying fallback default camera constraints", firstErr);
        // Fallback to any user-facing or default active camera device
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }
      
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err: any) {
      console.error("Camera access failed completely", err);
      setApiError("Camera device block: No camera was detected, or permissions are disabled in this environment. You can use our high-fidelity fridge staple presets or upload pictures instead!");
      setShowCamera(false);
    }
  };

  const captureCameraSnapshot = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const base64Data = canvas.toDataURL("image/jpeg");
      setPicPreview(base64Data);
      setActivePreset("custom");
      stopCameraWebcam();
      analyzeCustomImage(base64Data);
    }
  };

  const stopCameraWebcam = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    setShowCamera(false);
  };

  // Handle call to analyze custom image
  const analyzeCustomImage = async (base64Image: string) => {
    setAnalyzing(true);
    setApiError(null);
    try {
      const response = await fetch("/api/analyze-fridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64Image }),
      });
      const data: FridgeAnalysisResult = await response.json();
      if (data.ingredients) {
        setIngredients(data.ingredients);
        setConfidence(data.confidence || "Medium");
        setThoughts(data.additionalThoughts || "Successfully parsed custom fridge snapshot.");
        fetchSuggestedRecipes(data.ingredients);
      }
    } catch (err: any) {
      console.error(err);
      setApiError("Error analyzing image. Falling back to default list.");
    } finally {
      setAnalyzing(false);
    }
  };

  // Add / Remove ingredients manually for fine tuning
  const handleAddIngredientManually = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualIngredientInput.trim()) return;
    const newItem = manualIngredientInput.trim().toLowerCase();
    if (!ingredients.includes(newItem)) {
      const updated = [...ingredients, newItem];
      setIngredients(updated);
      fetchSuggestedRecipes(updated);
    }
    setManualIngredientInput("");
  };

  const handleRemoveIngredient = (itemToRemove: string) => {
    const updated = ingredients.filter((item) => item !== itemToRemove);
    setIngredients(updated);
    fetchSuggestedRecipes(updated);
  };

  const handleClearAllIngredients = () => {
    setIngredients([]);
    setRecipes([]);
    setSelectedRecipe(null);
  };

  // Shopping list management code
  const handleAddShoppingItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newShoppingItem.trim()) return;
    const item: ShoppingItem = {
      id: "shop-" + Date.now(),
      name: newShoppingItem.trim(),
      checked: false,
      addedAt: new Date().toLocaleTimeString(),
    };
    setShoppingList([item, ...shoppingList]);
    setNewShoppingItem("");
  };

  // Adds a single ingredient from recipe card to shopping list
  const addSingleMissingIngredient = (itemName: string, recipeName: string) => {
    // Check if food already in shopping list
    const exists = shoppingList.find((i) => i.name.toLowerCase() === itemName.toLowerCase() && !i.checked);
    if (exists) return;

    const item: ShoppingItem = {
      id: "shop-" + Date.now() + Math.random(),
      name: itemName,
      checked: false,
      addedAt: new Date().toLocaleTimeString(),
      recipeSource: recipeName,
    };
    setShoppingList([item, ...shoppingList]);
  };

  // Add all missing ingredients to shopping list
  const addAllMissingIngredients = (missing: string[], recipeName: string) => {
    const newItems: ShoppingItem[] = [];
    missing.forEach((item) => {
      const exists = shoppingList.some((i) => i.name.toLowerCase() === item.toLowerCase() && !i.checked);
      if (!exists) {
        newItems.push({
          id: "shop-" + Date.now() + Math.random(),
          name: item,
          checked: false,
          addedAt: new Date().toLocaleTimeString(),
          recipeSource: recipeName,
        });
      }
    });
    setShoppingList([...newItems, ...shoppingList]);
  };

  const toggleShoppingChecked = (id: string) => {
    setShoppingList(
      shoppingList.map((item) =>
        item.id === id ? { ...item, checked: !item.checked } : item
      )
    );
  };

  const deleteShoppingItem = (id: string) => {
    setShoppingList(shoppingList.filter((item) => item.id !== id));
  };

  const clearCheckedShoppingItems = () => {
    setShoppingList(shoppingList.filter((item) => !item.checked));
  };

  // Text-To-Speech features for Hands-Free cooking mode
  const speakCurrentStep = () => {
    if (!selectedRecipe) return;
    const textToSpeak = selectedRecipe.steps[currentStepIndex];
    if (!textToSpeak) return;

    window.speechSynthesis?.cancel(); // Cancel any ongoing speak

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.rate = 1.0;
    utterance.pitch = 1.05;
    
    // Choose nice female or warm vocal profile if available
    const voices = window.speechSynthesis?.getVoices();
    const desiredVoice = voices?.find(
      (v) => v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Zira")
    );
    if (desiredVoice) utterance.voice = desiredVoice;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    speechUtteranceRef.current = utterance;
    window.speechSynthesis?.speak(utterance);
  };

  const stopSpeaking = () => {
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  };

  // Step navigations
  const handleNextStep = () => {
    if (!selectedRecipe) return;
    if (currentStepIndex < selectedRecipe.steps.length - 1) {
      const nextIndex = currentStepIndex + 1;
      setCurrentStepIndex(nextIndex);
      stopSpeaking();
    }
  };

  const handlePrevStep = () => {
    if (currentStepIndex > 0) {
      const prevIndex = currentStepIndex - 1;
      setCurrentStepIndex(prevIndex);
      stopSpeaking();
    }
  };

  useEffect(() => {
    // Autoplay voice when user advances steps in cooking mode if desired, or let them click
    if (cookingMode) {
      speakCurrentStep();
    }
    return () => {
      stopSpeaking();
    };
  }, [currentStepIndex, cookingMode]);

  // Set-up preset Timer sizes based on action description
  const setTimerMinutes = (min: number) => {
    setTimerSeconds(min * 60);
    setTimerActive(false);
  };

  // Format digital timers
  const formatTimerValue = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Get active step estimation
  const getStepHeatRecommendation = (stepText: string) => {
    const lower = stepText.toLowerCase();
    if (lower.includes("high heat") || lower.includes("boil") || lower.includes("sear")) return "High Heat 🔥";
    if (lower.includes("medium heat") || lower.includes("sauté") || lower.includes("fry") || lower.includes("skillet")) return "Medium Heat 🍳";
    if (lower.includes("simmer") || lower.includes("low heat") || lower.includes("melt")) return "Low Heat 🌡️";
    return "Prep / Assembly 🥣";
  };

  return (
    <div className="w-full min-h-screen bg-[#FAF9F6] text-[#423F3A] flex flex-col font-sans overflow-x-hidden selection:bg-[#7A8C7A]/20 selection:text-[#3B4D3B]">
      
      {/* Top Banner & Title Status */}
      <div className="w-full bg-[#1E293B] text-[#FAF9F6] py-2 px-6 flex justify-between items-center text-xs border-b border-[#2C3E50]">
        <div className="flex items-center space-x-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="font-mono text-slate-300">SYSTEM: ACTIVE CHEF ASSISTANT</span>
        </div>
        <div className="flex items-center space-x-4">
          <span className="font-mono text-slate-400">GEMINI PRO 3.1 & FLASH 3.5 POWERED</span>
          <span className="text-[#FAF9F6]">🍳 Cooking Mode Connected</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        
        {/* Left Sidebar: Filters & Shopping List */}
        <aside className="w-full md:w-80 bg-[#F2F0E9] border-r border-[#E5E2D9] flex flex-col shrink-0 p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-serif font-bold text-[#5C574F] tracking-tight flex items-center gap-2">
              <ChefHat className="text-[#7A8C7A]" /> Culinary Assistant
            </h1>
            <p className="text-xs uppercase tracking-widest text-[#8C867A] mt-1 font-semibold">
              SMART FRIDGE COMPANION
            </p>
          </div>

          {/* Quick Stats Block */}
          <div className="mb-6 p-4 rounded-2xl bg-white/60 border border-[#E5E2D9] text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-[#8C867A]">Available Items:</span>
              <span className="font-bold text-[#423F3A]">{ingredients.length} items</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8C867A]">AI Accuracy Mode:</span>
              <span className="font-bold text-emerald-700">{confidence}</span>
            </div>
            <div className="text-[11px] italic text-[#6C665A] pt-1 border-t border-[#E5E2D9]/60 leading-tight">
              "{thoughts}"
            </div>
          </div>

          {/* Dietary Restrictions Filter Sidebar section */}
          <div className="mb-8" id="dietary-sidebar-container">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#A69F92] mb-3 flex items-center justify-between">
              <span>Dietary Filter</span>
              <Filter size={12} className="text-[#8C867A]" />
            </h2>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {DIETARY_FILTERS.map((diet) => {
                const isActive = selectedDietaryTags.includes(diet.id);
                return (
                  <button
                    key={diet.id}
                    id={`filter-${diet.id}`}
                    onClick={() => toggleDietaryTag(diet.id)}
                    className={`w-full text-left p-2.5 rounded-xl text-xs transition-all flex items-center justify-between border ${
                      isActive
                        ? "bg-[#7A8C7A] text-white border-[#7A8C7A] font-medium shadow-sm"
                        : "bg-white/50 text-[#5C574F] border-[#E5E2D9] hover:bg-[#EAE7DF]"
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="font-semibold">{diet.label}</span>
                      <span className={`text-[10px] ${isActive ? "text-slate-100" : "text-[#8C867A]"}`}>
                        {diet.description}
                      </span>
                    </div>
                    {isActive ? (
                      <Check size={14} className="stroke-[3]" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-[#C5C1B5]" />
                    )}
                  </button>
                );
              })}
            </div>
            {selectedDietaryTags.length > 0 && (
              <button
                id="clear-filters-btn"
                onClick={() => {
                  setSelectedDietaryTags([]);
                  fetchSuggestedRecipes(ingredients, []);
                }}
                className="text-[11px] text-[#7A8C7A] hover:underline mt-2 inline-flex items-center gap-1 font-medium"
              >
                Clear all filters ({selectedDietaryTags.length})
              </button>
            )}
          </div>

          {/* Fridge Ingredient Manual Editor Section */}
          <div className="mb-8" id="ingredients-editor-section">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#A69F92] mb-3">
              Manage Fridge Ingredients
            </h2>
            <form onSubmit={handleAddIngredientManually} className="flex gap-2">
              <input
                id="add-ingredient-input"
                type="text"
                placeholder="E.g., tomato, basil, ham..."
                value={manualIngredientInput}
                onChange={(e) => setManualIngredientInput(e.target.value)}
                className="flex-grow p-2 text-xs rounded-xl border border-[#C5C1B5] bg-white text-[#423F3A] focus:outline-none focus:ring-1 focus:ring-[#7A8C7A] focus:border-[#7A8C7A]"
              />
              <button
                id="add-ingredient-btn"
                type="submit"
                className="bg-[#7A8C7A] hover:bg-[#687868] text-white p-2 rounded-xl text-xs flex items-center justify-center transition-all px-3"
                title="Add ingredient"
              >
                <Plus size={16} />
              </button>
            </form>

            <div className="mt-3 flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-1 bg-white/30 rounded-xl border border-[#E5E2D9]">
              {ingredients.length === 0 ? (
                <div className="text-[11px] text-[#8C867A] p-2 italic w-full text-center">
                  Fridge is empty. Snap a photo or choose preset below!
                </div>
              ) : (
                ingredients.map((item) => (
                  <span
                    key={item}
                    id={`badge-${item}`}
                    className="inline-flex items-center gap-1 bg-[#FAF9F6] text-xs text-[#5C574F] px-2.5 py-1 rounded-full border border-[#E5E2D9] group"
                  >
                    <span>{item}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveIngredient(item)}
                      className="text-[#A69F92] hover:text-[#D48F4D] transition-colors font-bold text-[10px] ml-0.5"
                    >
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>
            {ingredients.length > 0 && (
              <button
                id="clear-all-ingredients-btn"
                onClick={handleClearAllIngredients}
                className="text-[10px] text-red-600 font-semibold hover:underline mt-2 block text-right w-full"
              >
                Clear Fridge Pantry
              </button>
            )}
          </div>

          {/* Interactive Shopping List Tab Component */}
          <div className="mt-auto flex-col pb-2 flex" id="shopping-list-tab">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#A69F92] mb-3 flex items-center gap-1.5">
              <ShoppingCart size={13} className="text-[#D48F4D]" /> Shopping List
            </h2>
            <form onSubmit={handleAddShoppingItem} className="flex gap-2 mb-3">
              <input
                id="shopping-item-input"
                type="text"
                placeholder="Add shopping item..."
                value={newShoppingItem}
                onChange={(e) => setNewShoppingItem(e.target.value)}
                className="flex-grow p-2 text-xs rounded-xl border border-[#C5C1B5] bg-white text-[#423F3A] focus:outline-none focus:ring-1 focus:ring-[#7A8C7A]"
              />
              <button
                id="shopping-item-add-btn"
                type="submit"
                className="bg-[#D48F4D] hover:bg-[#C27E3D] text-white p-2 rounded-xl text-xs transition-all"
              >
                Add
              </button>
            </form>

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {shoppingList.length === 0 ? (
                <div className="text-center py-4 bg-white/40 rounded-xl border border-dashed border-[#C5C1B5] text-[11px] text-[#8C867A] italic">
                  Shopping list is clean! Add missing ingredients with one-click.
                </div>
              ) : (
                shoppingList.map((item) => (
                  <div
                    key={item.id}
                    className={`p-2.5 rounded-lg border flex justify-between items-center transition-all ${
                      item.checked
                        ? "bg-[#FAF9F6]/50 text-[#8C867A] line-through border-[#E5E2D9]"
                        : "bg-white text-[#423F3A] border-[#E5E2D9] shadow-sm hover:border-[#C5C1B5]"
                    }`}
                  >
                    <label className="flex items-center gap-2 cursor-pointer flex-grow text-xs pr-2 select-none">
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={() => toggleShoppingChecked(item.id)}
                        className="rounded border-[#C5C1B5] text-[#7A8C7A] focus:ring-[#7A8C7A] w-3.5 h-3.5 cursor-pointer"
                      />
                      <div className="flex flex-col">
                        <span>{item.name}</span>
                        {item.recipeSource && (
                          <span className="text-[9px] text-[#A69F92]">
                            For: {item.recipeSource}
                          </span>
                        )}
                      </div>
                    </label>
                    <button
                      onClick={() => deleteShoppingItem(item.id)}
                      className="text-[#C5C1B5] hover:text-red-500 transition-colors p-0.5"
                      title="Delete item"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {shoppingList.length > 0 && (
              <div className="flex justify-between items-center mt-2.5 pt-2 border-t border-[#E5E2D9]/70 text-[10px]">
                <button
                  id="clear-checked-shopping-btn"
                  onClick={clearCheckedShoppingItems}
                  className="text-[#8C867A] hover:text-[#423F3A] hover:underline"
                >
                  Clear checked items
                </button>
                <span className="font-semibold text-[#5C574F]">
                  Total: {shoppingList.length} items
                </span>
              </div>
            )}
          </div>
        </aside>

        {/* Mid-Section: Photo Capture & Suggested Recipes list */}
        <main className="flex-1 flex flex-col min-w-0" id="main-content-flow">
          
          {/* Top Scanner & Controller Bar */}
          <header className="border-b border-[#E5E2D9] flex flex-col lg:flex-row lg:items-center justify-between p-6 bg-white/40 gap-4" id="header-dashboard-controls">
            
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${analyzing ? "bg-amber-400 animate-spin" : "bg-emerald-500"}`}></span>
                <h2 className="font-serif font-bold text-lg text-[#423F3A]">
                  {analyzing ? "AI Analyzing Refrigerator Photo..." : `Chef Kitchen Sync (${ingredients.length} ingredients)`}
                </h2>
              </div>
              <p className="text-xs text-[#8C867A]">
                Snap a detailed fridge image or test cooking presets instantly.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Camera Activation */}
              <button
                id="camera-activation-btn"
                onClick={startCameraWebcam}
                className="px-4 py-2 bg-[#7A8C7A] hover:bg-[#687868] text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
              >
                <Camera size={14} />
                <span>Camera Stream</span>
              </button>

              {/* Upload input */}
              <label className="px-4 py-2 border border-[#7A8C7A] text-[#7A8C7A] hover:bg-[#7A8C7A] hover:text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm">
                <Upload size={14} />
                <span>Upload Fridge Pic</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>

              {/* Preset selection bar */}
              <div className="flex items-center gap-1 bg-[#F2F0E9] p-1 rounded-xl border border-[#E5E2D9]">
                <span className="text-[10px] uppercase font-bold text-[#8C867A] px-2">Presets:</span>
                {PRESET_FRIDGES.map((preset) => (
                  <button
                    key={preset.key}
                    id={`preset-selector-${preset.key}`}
                    onClick={() => handleSelectPreset(preset.key)}
                    className={`px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                      activePreset === preset.key
                        ? "bg-white text-[#7A8C7A] shadow-sm font-semibold"
                        : "text-[#8C867A] hover:text-[#423F3A]"
                    }`}
                    title={preset.description}
                  >
                    {preset.emoji} {preset.name.split(" ")[0]}
                  </button>
                ))}
              </div>
            </div>
          </header>

          {/* Quick Camera Sandbox Modal or Panel */}
          {showCamera && (
            <div className="p-6 bg-[#FAF9F6] border-b border-[#E5E2D9] animate-fade-in" id="camera-streaming-modal">
              <div className="max-w-md mx-auto bg-slate-900 rounded-3xl overflow-hidden shadow-xl border-4 border-[#F2F0E9] relative">
                <video
                  ref={videoRef}
                  className="w-full h-64 object-cover"
                  playsInline
                  muted
                />
                
                {/* Visual Camera Guidelines overlay */}
                <div className="absolute inset-0 border-2 border-dashed border-emerald-500/50 m-6 pointer-events-none rounded-2xl flex items-center justify-center">
                  <span className="text-[10px] font-mono text-emerald-400 bg-black/70 px-2 py-0.5 rounded leading-none uppercase">
                    Align produce / open door contents
                  </span>
                </div>

                <div className="p-4 bg-slate-950 flex justify-between items-center">
                  <button
                    id="camera-cancel-btn"
                    onClick={stopCameraWebcam}
                    className="px-3 py-1.5 bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    id="camera-snap-btn"
                    onClick={captureCameraSnapshot}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center gap-2 pulse-active"
                  >
                    <Camera size={14} /> Snap culinary picture
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Render status boxes */}
          {apiError && (
            <div className="m-6 p-4 bg-[#D48F4D]/10 border border-[#D48F4D] text-[#A66E32] rounded-2xl flex items-start gap-2 text-xs" id="api-error-alert">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">System Reminder:</span> {apiError}
              </div>
            </div>
          )}

          <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
            
            {/* Scrollable Gallery Section */}
            <section className="flex-1 p-6 md:p-8 overflow-y-auto" id="recipes-gallery-section">
              
              {/* Photo Preview Indicator if any */}
              {picPreview && (
                <div className="mb-6 bg-white p-4 rounded-2xl border border-[#E5E2D9] flex items-center gap-4 shadow-sm">
                  <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-[#E5E2D9] shadow-inner shrink-0">
                    <img src={picPreview} className="object-cover w-full h-full" alt="Active fridge layout" />
                    <button
                      onClick={() => setPicPreview(null)}
                      className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 rounded-full p-0.5 text-white"
                      title="Remove picture"
                    >
                      <X size={10} />
                    </button>
                  </div>
                  <div className="text-xs">
                    <span className="font-bold text-[#7A8C7A] uppercase tracking-wider block text-[10px]">Active Upload Scan Completed</span>
                    <span className="text-[#8C867A]">{ingredients.length} items detected. The recipe suggestions updated successfully below.</span>
                  </div>
                </div>
              )}

              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-2xl font-serif text-[#423F3A] font-bold tracking-tight">
                    Recommended Recipes
                  </h3>
                  <p className="text-xs text-[#8C867A]">
                    Crafted matching your fridge staples.
                  </p>
                </div>
                {loadingRecipes && (
                  <div className="flex items-center gap-1.5 text-xs text-[#7A8C7A] font-semibold">
                    <Loader2 size={14} className="animate-spin" /> Suggesting customized cards...
                  </div>
                )}
              </div>

              {recipes.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-3xl border border-[#E5E2D9] text-[#8C867A] p-8 flex flex-col items-center max-w-lg mx-auto mt-6" id="no-recipes-panel">
                  <ChefHat size={48} className="text-[#A69F92] mb-3" />
                  <p className="font-serif text-lg font-bold text-[#5C574F] mb-1">
                    No Culinary Combinations Discovered
                  </p>
                  <p className="text-xs text-center leading-relaxed">
                    Try selecting a different preset (like "Classic Fridge Staples"), toggling off some dietary filters, or adding more ingredients manually above.
                  </p>
                  <button
                    onClick={() => handleSelectPreset("standard")}
                    className="mt-4 px-4 py-2 bg-[#7A8C7A] text-white rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    Load Standard Staples Preset
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6" id="recipe-cards-grid">
                  {recipes.map((recipe) => {
                    const isSelected = selectedRecipe?.id === recipe.id;
                    const hasMissing = recipe.missingIngredients && recipe.missingIngredients.length > 0;
                    
                    return (
                      <div
                        key={recipe.id}
                        id={`recipe-card-${recipe.id}`}
                        onClick={() => {
                          setSelectedRecipe(recipe);
                          setCurrentStepIndex(0);
                        }}
                        className={`bg-white rounded-3xl p-5 border transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                          isSelected
                            ? "ring-2 ring-[#7A8C7A] shadow-lg border-transparent"
                            : "shadow-sm border-[#E5E2D9] hover:shadow-md hover:border-[#C5C1B5]"
                        }`}
                      >
                        {/* Selected Indicator Pill */}
                        {isSelected && (
                          <div className="absolute top-0 right-0 bg-[#7A8C7A] text-white px-3 py-1 rounded-bl-xl text-[10px] uppercase font-black tracking-widest">
                            Selected
                          </div>
                        )}

                        <div>
                          {/* Banner placeholders with beautiful custom gradient combinations to match Natural Tones */}
                          <div className="w-full h-32 rounded-2xl mb-4 overflow-hidden relative">
                            <div className="w-full h-full bg-gradient-to-br from-[#8C867A] to-[#E5E2D9] opacity-75 flex items-center justify-center font-serif text-slate-100 font-bold tracking-wider relative">
                              <span className="text-sm bg-black/40 px-3 py-1.5 rounded-xl uppercase font-bold tracking-widest text-center text-[11px] block w-11/12 truncate">
                                {recipe.name}
                              </span>
                            </div>
                            
                            {/* Tags display */}
                            <div className="absolute bottom-2 left-2 flex flex-wrap gap-1">
                              {recipe.dietaryTags.slice(0, 3).map((tag) => (
                                <span
                                  key={tag}
                                  className="text-[9px] font-bold bg-white/90 text-[#423F3A] px-2 py-0.5 rounded"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="flex justify-between items-start mb-2 gap-2">
                            <h4 className="font-serif font-bold text-lg text-[#423F3A]" id={`recipe-name-${recipe.id}`}>
                              {recipe.name}
                            </h4>
                            <span className="text-xs bg-[#7A8C7A]/10 text-[#5C6E5C] px-2 py-1 rounded-md font-bold shrink-0">
                              {recipe.difficulty}
                            </span>
                          </div>

                          <p className="text-xs text-[#6C665A] mb-4 line-clamp-2">
                            {recipe.description}
                          </p>

                          {/* Difficulty stars */}
                          <div className="flex gap-1 mb-3 text-amber-500">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <span key={i} className="text-xs">
                                {i < (recipe.difficultyRating || 3) ? "★" : "☆"}
                              </span>
                            ))}
                          </div>

                          {/* Quick Stats Grid */}
                          <div className="flex gap-4 text-xs text-[#8C867A] mb-4 border-t border-[#E5E2D9]/40 pt-3">
                            <span className="flex items-center gap-1">
                              <Clock size={12} className="text-[#7A8C7A]" /> 🕒 {recipe.prepTime} mins
                            </span>
                            <span className="flex items-center gap-1">
                              <Flame size={12} className="text-[#D48F4D]" /> 🔥 {recipe.calories} kcal
                            </span>
                            <span className="text-[11px]">
                              📋 {recipe.steps.length} steps
                            </span>
                          </div>
                        </div>

                        {/* Missing & Essential elements interaction */}
                        <div className="pt-2 border-t border-dashed border-[#E5E2D9] mt-3">
                          {hasMissing ? (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-[#A66E32] font-semibold flex items-center gap-1">
                                  ⚠️ Missing: {recipe.missingIngredients.length} item{recipe.missingIngredients.length > 1 ? "s" : ""}
                                </span>
                                <button
                                  id={`add-all-missing-btn-${recipe.id}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    addAllMissingIngredients(recipe.missingIngredients, recipe.name);
                                  }}
                                  className="text-[10px] px-2 py-1 bg-[#D48F4D]/10 hover:bg-[#D48F4D]/25 text-[#A66E32] rounded font-bold transition-all"
                                >
                                  Add all to shopping
                                </button>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {recipe.missingIngredients.slice(0, 3).map((item) => (
                                  <button
                                    key={item}
                                    id={`add-missing-item-${recipe.id}-${item.replace(/\s+/g, '-')}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      addSingleMissingIngredient(item, recipe.name);
                                    }}
                                    className="text-[10px] bg-red-50 hover:bg-red-100 text-red-700 px-2.5 py-1 rounded border border-red-200 inline-flex items-center gap-1 font-medium transition-colors"
                                    title={`Click to add "${item}" to shopping list`}
                                  >
                                    <span>+ Add {item}</span>
                                  </button>
                                ))}
                                {recipe.missingIngredients.length > 3 && (
                                  <span className="text-[10px] text-[#8C867A] self-center pl-1">
                                    +{recipe.missingIngredients.length - 3} more
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-[11px] text-green-700 font-semibold flex items-center gap-1">
                              ✅ Perfect Match! All {recipe.essentialIngredients.length} ingredients ready in your fridge!
                            </span>
                          )}

                          <div className="mt-4 flex gap-2">
                            <button
                              id={`select-recipe-btn-${recipe.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedRecipe(recipe);
                                setCookingMode(true);
                                setCurrentStepIndex(0);
                              }}
                              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
                                isSelected
                                  ? "bg-[#7A8C7A] text-white"
                                  : "bg-white border border-[#7A8C7A] text-[#7A8C7A] hover:bg-[#7A8C7A] hover:text-white"
                              }`}
                            >
                              {isSelected ? "Start Cooking Now 🍳" : "Choose Recipe"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Step-by-Step Cooking Mode Panel (Hands-Free with read aloud) */}
            <section
              id="step-cooking-panel"
              className="w-full lg:w-[410px] bg-white border-t lg:border-t-0 lg:border-l border-[#E5E2D9] p-6 md:p-8 flex flex-col shrink-0 overflow-y-auto"
            >
              {selectedRecipe ? (
                <div className="flex flex-col h-full justify-between" id="active-recipe-assistant">
                  
                  {/* Top Mode Header */}
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-[10px] uppercase font-black tracking-widest bg-[#7A8C7A] text-white px-2.5 py-1 rounded-lg">
                        {cookingMode ? `Step ${currentStepIndex + 1} of ${selectedRecipe.steps.length}` : "Cooking Assistant Mode"}
                      </span>
                      
                      <div className="flex items-center gap-2">
                        {/* Read-Aloud Volume Toggle */}
                        <button
                          id="btn-voice-read-aloud"
                          onClick={() => {
                            if (isSpeaking) {
                              stopSpeaking();
                            } else {
                              speakCurrentStep();
                            }
                          }}
                          className={`text-xs px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition-all ${
                            isSpeaking
                              ? "bg-emerald-600 text-white pulse-active"
                              : "bg-[#F2F0E9] text-[#7A8C7A] hover:bg-[#EAE7DF]"
                          }`}
                          title="Click to speak instruction aloud using native voice synthesis"
                        >
                          {isSpeaking ? <Volume2 size={13} className="animate-bounce" /> : <VolumeX size={13} />}
                          <span>{isSpeaking ? "Speaking" : "Read Aloud"}</span>
                        </button>
                      </div>
                    </div>

                    <h3 className="font-serif font-black text-xl text-[#423F3A] mb-1">
                      {selectedRecipe.name}
                    </h3>
                    <p className="text-xs text-[#8C867A] mb-6">
                      {selectedRecipe.description}
                    </p>

                    {/* Mode selector switch */}
                    <div className="bg-[#FAF9F6] p-1 rounded-xl border border-[#E5E2D9] flex mb-6 text-xs">
                      <button
                        id="tab-view-ingredients"
                        onClick={() => setCookingMode(false)}
                        className={`flex-1 py-1.5 rounded-lg text-center font-bold transition-all ${
                          !cookingMode ? "bg-white text-[#7A8C7A] shadow-sm" : "text-[#8C867A]"
                        }`}
                      >
                        Essential Ingredients
                      </button>
                      <button
                        id="tab-view-steps"
                        onClick={() => {
                          setCookingMode(true);
                          setCurrentStepIndex(0);
                        }}
                        className={`flex-1 py-1.5 rounded-lg text-center font-bold transition-all ${
                          cookingMode ? "bg-white text-[#7A8C7A] shadow-sm" : "text-[#8C867A]"
                        }`}
                      >
                        Step By Step (Large Mode)
                      </button>
                    </div>
                  </div>

                  {/* Mode Body Content */}
                  <div className="flex-grow flex flex-col justify-between">
                    
                    {!cookingMode ? (
                      // 1. Ingredients Check mode with toggle support
                      <div className="space-y-4 py-2" id="selected-recipe-ingredients-check">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-[#A69F92]">
                            Prerequisites & Amounts
                          </h4>
                          {selectedRecipe.missingIngredients.length > 0 && (
                            <button
                              id="add-missing-to-shop-instant-btn"
                              onClick={() => addAllMissingIngredients(selectedRecipe.missingIngredients, selectedRecipe.name)}
                              className="text-[10px] text-[#A66E32] hover:underline font-semibold"
                            >
                              Add all ({selectedRecipe.missingIngredients.length}) missing items to shop
                            </button>
                          )}
                        </div>

                        <div className="space-y-2 max-h-96 overflow-y-auto">
                          {selectedRecipe.essentialIngredients.map((item, index) => {
                            // Figure out if ingredient matches user current fridge inventory
                            const isAvailable = ingredients.some(avail => {
                              const itemWords = item.toLowerCase().split(" ");
                              return itemWords.some(w => w.length > 3 && avail.includes(w)) || avail.includes(item.toLowerCase());
                            });
                            
                            return (
                              <div
                                key={index}
                                className={`p-3 rounded-2xl border text-xs flex justify-between items-center transition-all ${
                                  isAvailable
                                    ? "bg-emerald-50/50 border-emerald-200 text-[#423F3A]"
                                    : "bg-red-50/50 border-red-200 text-[#423F3A] relative"
                                }`}
                              >
                                <span className="font-semibold">{item}</span>
                                {isAvailable ? (
                                  <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                                    In Fridge
                                  </span>
                                ) : (
                                  <button
                                    id={`add-missing-single-pre-${index}`}
                                    onClick={() => addSingleMissingIngredient(item, selectedRecipe.name)}
                                    className="text-[9px] font-bold bg-[#D48F4D] text-white px-2 py-1 rounded hover:bg-[#C27E3D] transition-colors"
                                  >
                                    + Shopping
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <button
                          id="proceed-to-step-one-btn"
                          onClick={() => setCookingMode(true)}
                          className="w-full py-3 bg-[#423F3A] text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-2 hover:bg-[#534F49]"
                        >
                          <Play size={14} /> Link hands-free Step-by-Step Mode
                        </button>
                      </div>
                    ) : (
                      // 2. Large step-by-step reading mode with Web Speech & Timer interaction
                      <div className="space-y-6 flex flex-col justify-between flex-grow" id="selected-recipe-steps-execution">
                        
                        <div>
                          <h4 className="text-xs font-bold uppercase text-[#A69F92] mb-2 tracking-widest pl-1">
                            Chef Instructions
                          </h4>
                          
                          {/* Main instruction container with HUGE typographic readability */}
                          <div className="p-5 rounded-3xl bg-[#FAF9F6] border border-[#E5E2D9] mb-4">
                            <p className="text-2xl font-serif font-semibold leading-relaxed text-[#423F3A] transition-all" id="active-step-narration">
                              {selectedRecipe.steps[currentStepIndex]}
                            </p>
                          </div>

                          {/* Dynamic heat estimation pill */}
                          <div className="flex gap-2 mb-4">
                            <span className="px-3 py-1 bg-[#F2F0E9] border border-[#E5E2D9] rounded-full text-xs font-semibold text-[#5C574F]">
                              Heat: {getStepHeatRecommendation(selectedRecipe.steps[currentStepIndex])}
                            </span>
                            <span className="px-3 py-1 bg-[#F2F0E9] border border-[#E5E2D9] rounded-full text-xs font-mono text-[#8C867A]">
                              Audio: {isSpeaking ? "🔊 speaking..." : "💤 idle"}
                            </span>
                          </div>

                          {/* Up Next Preview box */}
                          {currentStepIndex < selectedRecipe.steps.length - 1 && (
                            <div className="p-4 rounded-2xl bg-slate-50 border border-[#E5E2D9] opacity-75">
                              <span className="block text-[10px] uppercase font-bold text-[#8C867A] tracking-wider mb-0.5">
                                Up Next:
                              </span>
                              <p className="text-xs text-[#5C574F] line-clamp-1 italic">
                                "{selectedRecipe.steps[currentStepIndex + 1]}"
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Culinary Live Cooking Widgets: Timers & Controls */}
                        <div className="space-y-3">
                          <div className="flex gap-3">
                            {/* Live Timer Widget */}
                            <div className="flex-1 p-3.5 rounded-2xl bg-[#F2F0E9] border border-[#E5E2D9] text-center flex flex-col justify-between">
                              <span className="text-[10px] uppercase font-bold tracking-widest text-[#A69F92] block">
                                Action Timer
                              </span>
                              <span className="text-2xl font-mono font-bold text-[#423F3A] block my-1">
                                {formatTimerValue(timerSeconds)}
                              </span>
                              <div className="flex gap-1 justify-center">
                                <button
                                  id="btn-timer-trigger"
                                  onClick={() => setTimerActive(!timerActive)}
                                  className={`px-2.5 py-1 text-[10px] uppercase font-bold rounded-lg transition-all ${
                                    timerActive ? "bg-amber-600 text-white" : "bg-white border border-[#E5E2D9] text-[#423F3A]"
                                  }`}
                                >
                                  {timerActive ? "Pause" : "Start"}
                                </button>
                                <button
                                  id="btn-timer-reset"
                                  onClick={() => {
                                    setTimerActive(false);
                                    setTimerSeconds(300);
                                  }}
                                  className="px-1.5 py-1 text-[10px] bg-white border border-[#E5E2D9] rounded-lg text-[#8C867A] hover:text-[#423F3A]"
                                  title="Reset Timer"
                                >
                                  <RotateCcw size={11} className="mx-auto" />
                                </button>
                              </div>
                            </div>

                            {/* Preset Timers selectors */}
                            <div className="flex-1 p-3.5 rounded-2xl bg-[#F2F0E9] border border-[#E5E2D9] flex flex-col justify-between">
                              <span className="text-[10px] uppercase font-bold tracking-widest text-[#A69F92] text-center block">
                                Set Duration
                              </span>
                              <div className="grid grid-cols-2 gap-1.5 my-1">
                                <button
                                  id="timer-set-2m"
                                  onClick={() => setTimerMinutes(2)}
                                  className="p-1 text-[10px] bg-white rounded border border-[#E5E2D9] hover:bg-[#FAF9F6]"
                                >
                                  2 Mins
                                </button>
                                <button
                                  id="timer-set-5m"
                                  onClick={() => setTimerMinutes(5)}
                                  className="p-1 text-[10px] bg-white rounded border border-[#E5E2D9] hover:bg-[#FAF9F6]"
                                >
                                  5 Mins
                                </button>
                                <button
                                  id="timer-set-10m"
                                  onClick={() => setTimerMinutes(10)}
                                  className="p-1 text-[10px] bg-white rounded border border-[#E5E2D9] hover:bg-[#FAF9F6]"
                                >
                                  10 Mins
                                </button>
                                <button
                                  id="timer-set-15m"
                                  onClick={() => setTimerMinutes(15)}
                                  className="p-1 text-[10px] bg-white rounded border border-[#E5E2D9] hover:bg-[#FAF9F6]"
                                >
                                  15 Mins
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Direct Navigation controls with huge responsive buttons */}
                          <div className="grid grid-cols-2 gap-4 mt-4">
                            <button
                              id="btn-step-prev"
                              disabled={currentStepIndex === 0}
                              onClick={handlePrevStep}
                              className="py-4 rounded-2xl border-2 border-[#E5E2D9] font-bold text-xs text-[#8C867A] flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none hover:bg-slate-50 cursor-pointer"
                            >
                              <ChevronLeft size={16} />
                              <span>Back</span>
                            </button>
                            
                            {currentStepIndex < selectedRecipe.steps.length - 1 ? (
                              <button
                                id="btn-step-next"
                                onClick={handleNextStep}
                                className="py-4 rounded-2xl bg-[#423F3A] hover:bg-[#534F49] text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                              >
                                <span>Next Step</span>
                                <ChevronRight size={16} />
                              </button>
                            ) : (
                              <button
                                id="btn-cooking-finish"
                                onClick={() => {
                                  alert("Congratulations on completing this beautiful dish! Bon Appétit! 🎉");
                                  setCookingMode(false);
                                  setCurrentStepIndex(0);
                                }}
                                className="py-4 rounded-2xl bg-[#7A8C7A] hover:bg-[#6C7D6C] text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                              >
                                <span>Finish Meal 🎉</span>
                              </button>
                            )}
                          </div>
                        </div>

                      </div>
                    )}
                  </div>

                </div>
              ) : (
                <div className="h-full flex flex-col justify-center items-center text-center p-6 text-[#8C867A] bg-[#FAF9F6]/40 rounded-3xl border border-[#E5E2D9]" id="empty-assistant-panel">
                  <ChefHat size={40} className="text-[#A69F92] mb-3" />
                  <p className="font-serif font-bold text-[#5C574F] mb-1">
                    No Recipe Selected
                  </p>
                  <p className="text-xs leading-relaxed">
                    Select any recipe card from the gallery grid to unleash step-by-step cooking directions, ingredients checkers, and hands-free read-aloud voice support.
                  </p>
                </div>
              )}
            </section>

          </div>
        </main>

      </div>
    </div>
  );
}
