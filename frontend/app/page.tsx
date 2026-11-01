"use client";

import React, { useState, useMemo } from "react";
import {
  Search,
  Star,
  Truck,
  SlidersHorizontal,
  X,
  RotateCcw,
  Check,
  TrendingDown,
  ArrowUpRight,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  HelpCircle,
} from "lucide-react";

interface StoreOffer {
  store: string;
  price: number;
  original_price?: number;
  delivery_eta: string;
  product_url: string;
  in_stock: boolean;
}

interface UnifiedProduct {
  id: string;
  title: string;
  image_url?: string;
  category: string;
  rating: number;
  reviews_count?: string;
  offers: StoreOffer[];
  lowest_price: number;
  highest_price: number;
  savings: number;
}

interface PaginatedResponse {
  page: number;
  has_next: boolean;
  products: UnifiedProduct[];
}

const CATEGORY_IMAGES: Record<string, string> = {
  smartwatch: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&auto=format&fit=crop&q=80",
  audio: "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=400&auto=format&fit=crop&q=80",
  phone: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&auto=format&fit=crop&q=80",
  keyboard: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=400&auto=format&fit=crop&q=80",
  mouse: "https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=400&auto=format&fit=crop&q=80",
  general: "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=400&auto=format&fit=crop&q=80",
};

const AVAILABLE_STORES = ["Amazon", "Flipkart"];
type SortOption = "price-asc" | "price-desc" | "rating-desc" | "rating-asc";

export default function Home() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<UnifiedProduct[]>([]);
  const [searched, setSearched] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [hasNextPage, setHasNextPage] = useState<boolean>(false);

  // Filter & Sort states
  const [showFilter, setShowFilter] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("price-asc");
  const [minPriceFilter, setMinPriceFilter] = useState<number>(0);
  const [maxPriceFilter, setMaxPriceFilter] = useState<number>(50000);
  const [selectedStores, setSelectedStores] = useState<string[]>(AVAILABLE_STORES);
  const [priceBounds, setPriceBounds] = useState<{ min: number; max: number }>({ min: 0, max: 50000 });

  // "I Am Confused" Quick Decision State
  const [isConfusedMode, setIsConfusedMode] = useState<boolean>(false);

  const fetchPageData = async (searchQuery: string, pageNum: number) => {
    setLoading(true);
    setSearched(true);
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://omnicom.onrender.com";
      const res = await fetch(
        `${API_BASE}/api/compare?query=${encodeURIComponent(searchQuery)}&page=${pageNum}`
      );
      if (!res.ok) throw new Error("API failed");
      const data: PaginatedResponse = await res.json();
      setProducts(data.products);
      setCurrentPage(data.page);
      setHasNextPage(data.has_next);

      if (data.products.length > 0) {
        const prices = data.products.map((p) => p.lowest_price);
        const minVal = Math.floor(Math.min(...prices));
        const maxVal = Math.ceil(Math.max(...prices));
        setPriceBounds({ min: minVal, max: maxVal });
        setMinPriceFilter(minVal);
        setMaxPriceFilter(maxVal);
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      console.error("Fetch failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setCurrentPage(1);
    setIsConfusedMode(false);
    fetchPageData(query, 1);
  };

  const changePage = (newPage: number) => {
    if (newPage < 1 || loading) return;
    fetchPageData(query, newPage);
  };

  const toggleStore = (store: string) => {
    setSelectedStores((prev) =>
      prev.includes(store) ? prev.filter((s) => s !== store) : [...prev, store]
    );
  };

  const resetFilters = () => {
    setMinPriceFilter(priceBounds.min);
    setMaxPriceFilter(priceBounds.max);
    setSelectedStores(AVAILABLE_STORES);
    setSortBy("price-asc");
    setIsConfusedMode(false);
  };

  const isFilterActive =
    minPriceFilter > priceBounds.min ||
    maxPriceFilter < priceBounds.max ||
    selectedStores.length < AVAILABLE_STORES.length ||
    sortBy !== "price-asc" ||
    isConfusedMode;

  const processedProducts = useMemo(() => {
    let list = products
      .map((product) => {
        const activeOffers = product.offers.filter((offer) =>
          selectedStores.includes(offer.store)
        );

        if (activeOffers.length === 0) return null;

        const prices = activeOffers.map((o) => o.price);
        const low = Math.min(...prices);
        const high = Math.max(...prices);

        return {
          ...product,
          offers: activeOffers,
          lowest_price: low,
          highest_price: high,
          savings: Math.round((high - low) * 100) / 100,
        };
      })
      .filter((p): p is UnifiedProduct => {
        if (!p) return false;
        return p.lowest_price >= minPriceFilter && p.lowest_price <= maxPriceFilter;
      });

    // "I AM CONFUSED" Mode: Prioritize top-rated products and cap strictly to Top 10
    if (isConfusedMode) {
      return list
        .sort((a, b) => b.rating - a.rating || a.lowest_price - b.lowest_price)
        .slice(0, 10);
    }

    // Standard Sorting
    return list.sort((a, b) => {
      if (sortBy === "price-asc") return a.lowest_price - b.lowest_price;
      if (sortBy === "price-desc") return b.lowest_price - a.lowest_price;
      if (sortBy === "rating-desc") return b.rating - a.rating;
      if (sortBy === "rating-asc") return a.rating - b.rating;
      return 0;
    });
  }, [products, minPriceFilter, maxPriceFilter, selectedStores, sortBy, isConfusedMode]);

  const totalSavingsPossible = useMemo(() => {
    return processedProducts.reduce((acc, p) => acc + (p.savings > 0 ? p.savings : 0), 0);
  }, [processedProducts]);

  return (
    <main className="min-h-screen bg-[#FFFDF0] text-black font-mono selection:bg-[#FFE600] selection:text-black p-4 md:p-10 border-t-8 border-black">
      <div className="max-w-5xl mx-auto space-y-10">

        {/* Header */}
        <header className="flex flex-col items-center text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#FFE600] border-2 border-black font-black text-xs uppercase tracking-wider shadow-[3px_3px_0px_0px_#000]">
            <Sparkles className="w-3.5 h-3.5" /> Live Price Comparison Engine
          </div>

          <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tight text-black drop-shadow-[4px_4px_0px_#FFE600]">
            Omni<span className="bg-[#00F0FF] px-2 border-4 border-black inline-block shadow-[4px_4px_0px_0px_#000] rotate-[-1deg]">Compare</span>
          </h1>

          <p className="text-xs md:text-sm font-bold max-w-lg bg-white border-2 border-black p-2 shadow-[3px_3px_0px_0px_#000]">
            Compare live discounts across Amazon & Flipkart. No ads. Lowest price wins.
          </p>
        </header>

        {/* Search Bar + Controls */}
        <div className="max-w-3xl mx-auto space-y-4">
          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="relative flex-1 flex items-center bg-white border-4 border-black shadow-[6px_6px_0px_0px_#000] focus-within:shadow-[8px_8px_0px_0px_#000] transition-all">
              <Search className="w-6 h-6 text-black ml-4 flex-shrink-0 stroke-[2.5]" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="TYPE PRODUCT NAME (E.G. SMARTWATCH, BOAT EARBUDS)..."
                className="w-full bg-transparent px-4 py-4 text-xs md:text-sm font-black uppercase placeholder-zinc-400 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="px-6 md:px-8 py-4 bg-[#00F0FF] hover:bg-[#5cf5ff] active:translate-x-1 active:translate-y-1 active:shadow-none border-4 border-black font-black text-sm uppercase tracking-wider shadow-[6px_6px_0px_0px_#000] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            >
              {loading ? "FETCHING..." : "COMPARE"}
            </button>

            {products.length > 0 && (
              <button
                type="button"
                onClick={() => setShowFilter(!showFilter)}
                className={`p-4 border-4 border-black shadow-[6px_6px_0px_0px_#000] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all flex items-center justify-center ${showFilter || isFilterActive ? "bg-[#FF5C00] text-white" : "bg-[#FFE600] text-black"
                  }`}
                title="Filters & Sorting"
              >
                <SlidersHorizontal className="w-6 h-6 stroke-[2.5]" />
              </button>
            )}
          </form>

          {/* Filter & Sort Drawer */}
          {showFilter && products.length > 0 && (
            <div className="bg-[#FFF4E5] border-4 border-black p-5 shadow-[6px_6px_0px_0px_#000] space-y-6 animate-in fade-in duration-150">
              <div className="flex items-center justify-between pb-3 border-b-2 border-black">
                <span className="font-black text-sm uppercase flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4" /> Filter & Sort Controls
                </span>
                <div className="flex items-center gap-2">
                  {isFilterActive && (
                    <button
                      onClick={resetFilters}
                      className="text-xs font-bold bg-white border-2 border-black px-2 py-1 shadow-[2px_2px_0px_0px_#000] flex items-center gap-1 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                    >
                      <RotateCcw className="w-3 h-3" /> RESET
                    </button>
                  )}
                  <button
                    onClick={() => setShowFilter(false)}
                    className="p-1 border-2 border-black bg-white shadow-[2px_2px_0px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
                  >
                    <X className="w-4 h-4 stroke-[3]" />
                  </button>
                </div>
              </div>

              {/* 💡 "I AM CONFUSED" FEATURE TOGGLE BUTTON */}
              <div className="p-3.5 bg-[#FFE600] border-3 border-black shadow-[4px_4px_0px_0px_#000] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 font-black text-xs uppercase text-black">
                    <HelpCircle className="w-4 h-4 stroke-[3]" />
                    <span>Overwhelmed by choices?</span>
                  </div>
                  <p className="text-[10px] font-bold text-zinc-800">
                    Auto-picks the top 10 highest-rated options with the best feedback.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsConfusedMode(!isConfusedMode)}
                  className={`px-4 py-2 border-2 border-black font-black text-xs uppercase tracking-wider transition-all shadow-[2px_2px_0px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none ${isConfusedMode
                    ? "bg-[#FF5C00] text-white"
                    : "bg-white hover:bg-zinc-100 text-black"
                    }`}
                >
                  {isConfusedMode ? "✓ CONFUSED MODE (TOP 10)" : "I AM CONFUSED"}
                </button>
              </div>

              {/* Sorting Options Grid */}
              <div className={`space-y-2 ${isConfusedMode ? "opacity-50 pointer-events-none" : ""}`}>
                <label className="text-xs font-black uppercase flex items-center gap-1.5">
                  <ArrowUpDown className="w-3.5 h-3.5" /> Sort Order
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: "price-asc", label: "Price: Low → High" },
                    { id: "price-desc", label: "Price: High → Low" },
                    { id: "rating-desc", label: "Rating: High → Low" },
                    { id: "rating-asc", label: "Rating: Low → High" },
                  ].map((btn) => {
                    const isSelected = sortBy === btn.id;
                    return (
                      <button
                        key={btn.id}
                        type="button"
                        onClick={() => setSortBy(btn.id as SortOption)}
                        className={`px-3 py-2 border-2 border-black font-black text-[11px] uppercase shadow-[2px_2px_0px_0px_#000] transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none ${isSelected ? "bg-[#FFE600] text-black" : "bg-white text-zinc-500 hover:text-black"
                          }`}
                      >
                        {btn.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Store Checkboxes */}
              <div className="space-y-2 pt-2 border-t-2 border-black">
                <label className="text-xs font-black uppercase">Active Platforms</label>
                <div className="flex gap-3">
                  {AVAILABLE_STORES.map((store) => {
                    const isChecked = selectedStores.includes(store);
                    return (
                      <button
                        key={store}
                        type="button"
                        onClick={() => toggleStore(store)}
                        className={`flex items-center gap-2 px-4 py-2 border-2 border-black font-black text-xs uppercase shadow-[3px_3px_0px_0px_#000] transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${isChecked ? "bg-[#00FFA3]" : "bg-white text-zinc-400"
                          }`}
                      >
                        <div
                          className={`w-4 h-4 border-2 border-black flex items-center justify-center ${isChecked ? "bg-black" : "bg-white"
                            }`}
                        >
                          {isChecked && <Check className="w-3 h-3 text-white stroke-[3]" />}
                        </div>
                        {store}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Price Range Slider */}
              <div className="space-y-3 pt-2 border-t-2 border-black">
                <div className="flex justify-between text-xs font-black uppercase">
                  <span>Min: ₹{minPriceFilter}</span>
                  <span>Max: ₹{maxPriceFilter}</span>
                </div>

                <input
                  type="range"
                  min={priceBounds.min}
                  max={priceBounds.max}
                  step={50}
                  value={maxPriceFilter}
                  onChange={(e) => setMaxPriceFilter(Number(e.target.value))}
                  className="w-full accent-black cursor-pointer h-3 bg-white border-2 border-black appearance-none"
                />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black uppercase block mb-1">Min Price (₹)</label>
                    <input
                      type="number"
                      value={minPriceFilter}
                      onChange={(e) => setMinPriceFilter(Math.max(priceBounds.min, Number(e.target.value)))}
                      className="w-full bg-white border-2 border-black px-3 py-2 text-xs font-black shadow-[2px_2px_0px_0px_#000] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase block mb-1">Max Price (₹)</label>
                    <input
                      type="number"
                      value={maxPriceFilter}
                      onChange={(e) => setMaxPriceFilter(Math.min(priceBounds.max, Number(e.target.value)))}
                      className="w-full bg-white border-2 border-black px-3 py-2 text-xs font-black shadow-[2px_2px_0px_0px_#000] focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Search Metric Stickers */}
        {products.length > 0 && !loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
            <div className="bg-[#FFE600] border-4 border-black p-4 shadow-[4px_4px_0px_0px_#000] rotate-[-1deg]">
              <div className="text-3xl font-black">{processedProducts.length}</div>
              <div className="text-xs font-black uppercase tracking-wider mt-1">
                {isConfusedMode ? "Curated Top 10" : `Page ${currentPage} Results`}
              </div>
            </div>

            <div className="bg-[#00FFA3] border-4 border-black p-4 shadow-[4px_4px_0px_0px_#000] rotate-[1deg]">
              <div className="text-3xl font-black">₹{Math.round(totalSavingsPossible)}</div>
              <div className="text-xs font-black uppercase tracking-wider mt-1">Arbitrage Opportunity</div>
            </div>

            <div className="col-span-2 sm:col-span-1 bg-[#FF80DF] border-4 border-black p-4 shadow-[4px_4px_0px_0px_#000] rotate-[-0.5deg]">
              <div className="text-3xl font-black">{isConfusedMode ? "TOP 10" : `Page ${currentPage}`}</div>
              <div className="text-xs font-black uppercase tracking-wider mt-1">
                {isConfusedMode ? "High-Rating Filter" : "Active Batch"}
              </div>
            </div>
          </div>
        )}

        {/* Loading Skeleton */}
        {loading && (
          <div className="space-y-6 max-w-4xl mx-auto">
            {[1, 2].map((idx) => (
              <div
                key={idx}
                className="bg-white border-4 border-black p-6 shadow-[8px_8px_0px_0px_#000] animate-pulse flex flex-col md:flex-row gap-6"
              >
                <div className="w-40 h-40 bg-zinc-200 border-2 border-black" />
                <div className="flex-1 space-y-4">
                  <div className="h-6 w-3/4 bg-zinc-200 border-2 border-black" />
                  <div className="h-4 w-1/4 bg-zinc-200 border-2 border-black" />
                  <div className="h-24 bg-zinc-100 border-2 border-black" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Search Results */}
        {!loading && searched && (
          <div className="space-y-6 max-w-4xl mx-auto">
            {processedProducts.length === 0 ? (
              <div className="text-center py-12 bg-white border-4 border-black p-8 shadow-[8px_8px_0px_0px_#000] space-y-3">
                <p className="font-black text-sm uppercase">No matches found within the active filters.</p>
                <button
                  onClick={resetFilters}
                  className="px-4 py-2 bg-[#FFE600] border-2 border-black font-black text-xs uppercase shadow-[3px_3px_0px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                >
                  Clear Filters
                </button>
              </div>
            ) : (
              <>
                {processedProducts.map((product, pIdx) => {
                  const bestOffer = product.offers[0];
                  const categoryFallback = CATEGORY_IMAGES[product.category] || CATEGORY_IMAGES.general;

                  return (
                    <div
                      key={product.id}
                      className="bg-white border-4 border-black p-5 md:p-6 shadow-[8px_8px_0px_0px_#000] hover:shadow-[12px_12px_0px_0px_#000] hover:-translate-x-1 hover:-translate-y-1 transition-all flex flex-col md:flex-row gap-6 items-start relative"
                    >
                      {/* Optional Top 10 Rank Badge in Confused Mode */}
                      {isConfusedMode && (
                        <div className="absolute -top-3 -left-3 bg-[#FFE600] border-2 border-black px-2 py-0.5 font-black text-xs uppercase shadow-[2px_2px_0px_0px_#000]">
                          #{pIdx + 1} Best Choice
                        </div>
                      )}

                      {/* Media Box */}
                      <div className="w-full md:w-44 flex flex-col items-center gap-3 flex-shrink-0">
                        <div className="h-44 w-full bg-[#FFFDF0] border-3 border-black p-3 flex items-center justify-center overflow-hidden">
                          <img
                            src={product.image_url || categoryFallback}
                            alt={product.title}
                            referrerPolicy="no-referrer"
                            className="max-h-full max-w-full object-contain filter contrast-105"
                            onError={(e) => {
                              const img = e.target as HTMLImageElement;
                              if (img.src !== categoryFallback) {
                                img.src = categoryFallback;
                              }
                            }}
                          />
                        </div>
                        <div className="flex items-center gap-1.5 text-xs font-black bg-[#FFE600] px-2 py-1 border-2 border-black shadow-[2px_2px_0px_0px_#000]">
                          <Star className="w-3.5 h-3.5 fill-black stroke-black" />
                          <span>{product.rating}</span>
                          <span className="text-[10px] text-zinc-700">({product.reviews_count})</span>
                        </div>
                      </div>

                      {/* Info & Offers */}
                      <div className="flex-1 w-full space-y-4">
                        <div>
                          <h2 className="text-base md:text-xl font-black uppercase text-black leading-tight">
                            {product.title}
                          </h2>

                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <span className="text-xs font-bold uppercase bg-zinc-100 border border-black px-2 py-0.5">
                              From: ₹{product.lowest_price.toLocaleString("en-IN")}
                            </span>

                            {product.savings > 0 && product.offers.length > 1 && (
                              <span className="inline-flex items-center gap-1 text-xs font-black uppercase bg-[#00FFA3] text-black px-2.5 py-0.5 border-2 border-black shadow-[2px_2px_0px_0px_#000]">
                                <TrendingDown className="w-3.5 h-3.5 stroke-[3]" /> Save ₹{product.savings.toLocaleString("en-IN")}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Offers Table */}
                        <div className="border-3 border-black bg-[#FFFDF0] divide-y-2 divide-black">
                          {product.offers.map((offer, oIdx) => {
                            const isLowest = offer.price === bestOffer.price;

                            return (
                              <div
                                key={oIdx}
                                className={`p-3 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${isLowest ? "bg-[#00FFA3]/20" : "bg-white"
                                  }`}
                              >
                                <div className="flex items-center gap-2 min-w-[130px]">
                                  <span className="font-black text-sm uppercase">{offer.store}</span>
                                  {isLowest && (
                                    <span className="px-1.5 py-0.5 bg-[#FFE600] border border-black text-[9px] font-black uppercase tracking-wider">
                                      LOWEST
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-700">
                                  <Truck className="w-3.5 h-3.5 stroke-[2.5]" />
                                  <span>{offer.delivery_eta}</span>
                                </div>

                                <div className="flex items-center justify-between sm:justify-end gap-4">
                                  <div className="text-right">
                                    <div className="text-base font-black">
                                      ₹{offer.price.toLocaleString("en-IN")}
                                    </div>
                                    {offer.original_price && (
                                      <div className="text-[10px] font-bold text-zinc-400 line-through">
                                        ₹{offer.original_price.toLocaleString("en-IN")}
                                      </div>
                                    )}
                                  </div>

                                  <a
                                    href={offer.product_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`inline-flex items-center gap-1 px-4 py-2 border-2 border-black font-black text-xs uppercase tracking-wider transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${isLowest
                                      ? "bg-[#00F0FF] hover:bg-[#5cf5ff] shadow-[3px_3px_0px_0px_#000]"
                                      : "bg-white hover:bg-zinc-100 shadow-[3px_3px_0px_0px_#000]"
                                      }`}
                                  >
                                    GO TO STORE
                                    <ArrowUpRight className="w-3.5 h-3.5 stroke-[3]" />
                                  </a>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                      </div>
                    </div>
                  );
                })}

                {/* Pagination Controls (Hidden when Confused Mode is active) */}
                {!isConfusedMode && (
                  <div className="flex items-center justify-between pt-6 border-t-4 border-black">
                    <button
                      onClick={() => changePage(currentPage - 1)}
                      disabled={currentPage <= 1 || loading}
                      className="flex items-center gap-2 px-5 py-3 bg-white hover:bg-zinc-100 disabled:opacity-40 border-3 border-black font-black text-xs uppercase tracking-wider shadow-[4px_4px_0px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all disabled:pointer-events-none"
                    >
                      <ChevronLeft className="w-4 h-4 stroke-[3]" /> PREV PAGE
                    </button>

                    <div className="bg-[#FFE600] border-3 border-black px-4 py-2 font-black text-xs uppercase shadow-[3px_3px_0px_0px_#000]">
                      PAGE {currentPage}
                    </div>

                    <button
                      onClick={() => changePage(currentPage + 1)}
                      disabled={!hasNextPage || loading}
                      className="flex items-center gap-2 px-5 py-3 bg-[#00F0FF] hover:bg-[#5cf5ff] disabled:opacity-40 border-3 border-black font-black text-xs uppercase tracking-wider shadow-[4px_4px_0px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all disabled:pointer-events-none"
                    >
                      NEXT PAGE <ChevronRight className="w-4 h-4 stroke-[3]" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

      </div>
    </main>
  );
}