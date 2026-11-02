import React, { useState } from 'react';
import { 
  Plus, Trash2, ShoppingCart, Check, RefreshCw, 
  ChevronDown, ChevronUp, Sparkles, Store, Circle, Package
} from 'lucide-react';

// --- TYPES ---
type PrimaryStore = 'HEB' | 'Kroger' | 'Cheapest';

interface PantryItem {
  id: string;
  name: string;
  category: string;
  inStock: boolean;
  store: 'HEB' | 'Kroger';
  estimatedPrice: number;
}

interface GroceryItem {
  id: string;
  name: string;
  category: string;
  aisle: string;
  quantity: string;
  estimatedPrice: number;
  store: 'HEB' | 'Kroger';
  checked: boolean;
  fromPantry?: boolean;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'recipes' | 'planner' | 'grocery' | 'pantry'>('grocery');
  
  // --- PANTRY STATE ---
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([
    { id: 'p1', name: 'Sandwich Zip Bags', category: 'Paper & Plastic', inStock: false, store: 'HEB', estimatedPrice: 3.48 },
    { id: 'p2', name: 'Gallon Zip Bags', category: 'Paper & Plastic', inStock: true, store: 'HEB', estimatedPrice: 4.28 },
    { id: 'p3', name: 'Paper Towels (12 PK)', category: 'Paper & Plastic', inStock: true, store: 'HEB', estimatedPrice: 18.98 },
    { id: 'p4', name: 'Trash Bags (13 Gal)', category: 'Paper & Plastic', inStock: false, store: 'Kroger', estimatedPrice: 9.99 },
    { id: 'p5', name: 'Dishwasher Pods', category: 'Cleaning', inStock: true, store: 'HEB', estimatedPrice: 14.49 },
    { id: 'p6', name: 'All-Purpose Spray', category: 'Cleaning', inStock: false, store: 'HEB', estimatedPrice: 3.78 },
  ]);

  // --- GROCERY STORE FILTER STATE ---
  const [selectedStoreMode, setSelectedStoreMode] = useState<PrimaryStore>('Cheapest');

  // Multi-store database mock for grocery price comparison
  const rawGroceryItems: GroceryItem[] = [
    { id: 'g1', name: 'Boneless Skinless Chicken Breasts', category: 'Meat', aisle: 'Aisle 2 - Poultry', quantity: '2 lbs', estimatedPrice: 7.96, store: 'HEB', checked: false },
    { id: 'g2', name: 'Poblano Peppers', category: 'Produce', aisle: 'Aisle 1 - Produce', quantity: '4 count', estimatedPrice: 1.48, store: 'HEB', checked: false },
    { id: 'g3', name: 'Oaxaca Cheese (8oz)', category: 'Dairy', aisle: 'Aisle 4 - Cheese', quantity: '1 block', estimatedPrice: 3.89, store: 'HEB', checked: false },
    { id: 'g4', name: 'Heavy Whipping Cream (16oz)', category: 'Dairy', aisle: 'Aisle 4 - Dairy', quantity: '1 carton', estimatedPrice: 2.99, store: 'Kroger', checked: false },
    { id: 'g5', name: 'Lasagna Noodles (16oz)', category: 'Pantry', aisle: 'Aisle 6 - Pasta', quantity: '1 box', estimatedPrice: 1.78, store: 'HEB', checked: false },
  ];

  // Sync Out-of-Stock Pantry Items into Grocery List
  const pantryGroceryItems: GroceryItem[] = pantryItems
    .filter(item => !item.inStock)
    .map(item => ({
      id: `pantry-sync-${item.id}`,
      name: item.name,
      category: item.category,
      aisle: item.store === 'HEB' ? 'Aisle 11 - Household' : 'Aisle 8 - Cleaning',
      quantity: '1 pk',
      estimatedPrice: item.estimatedPrice,
      store: item.store,
      checked: false,
      fromPantry: true
    }));

  const allGroceryItems = [...rawGroceryItems, ...pantryGroceryItems];

  // Filter grocery items according to selected Store Dropdown mode
  const filteredGroceryItems = allGroceryItems.filter(item => {
    if (selectedStoreMode === 'HEB') return item.store === 'HEB';
    if (selectedStoreMode === 'Kroger') return item.store === 'Kroger';
    return true; // 'Cheapest' / Best Mix keeps all items assigned to their optimal store
  });

  const togglePantryStock = (id: string) => {
    setPantryItems(prev => prev.map(item => 
      item.id === id ? { ...item, inStock: !item.inStock } : item
    ));
  };

  const calculatedTotal = filteredGroceryItems.reduce((sum, item) => sum + item.estimatedPrice, 0);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans">
      {/* HEADER */}
      <header className="bg-stone-900 text-white p-4 shadow-md">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Package className="w-6 h-6 text-amber-500" />
            <h1 className="text-xl font-bold tracking-tight">Recipeak</h1>
          </div>
          <nav className="flex gap-2">
            <button 
              onClick={() => setActiveTab('pantry')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${activeTab === 'pantry' ? 'bg-amber-700 text-white' : 'text-stone-300 hover:text-white'}`}
            >
              Pantry & Staples
            </button>
            <button 
              onClick={() => setActiveTab('grocery')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${activeTab === 'grocery' ? 'bg-amber-700 text-white' : 'text-stone-300 hover:text-white'}`}
            >
              Grocery List
            </button>
          </nav>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="max-w-4xl mx-auto p-4 md:p-6">
        
        {/* PANTRY TAB */}
        {activeTab === 'pantry' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-stone-800">Pantry & Non-Food Staples</h2>
                <p className="text-stone-600 text-sm">Track household items. Toggling an item out-of-stock sends it to your grocery list.</p>
              </div>
            </div>

            <div className="grid gap-3">
              {pantryItems.map((item) => (
                <div 
                  key={item.id} 
                  className="flex items-center justify-between p-4 bg-white border border-stone-200 rounded-xl shadow-sm hover:border-stone-300 transition"
                >
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => togglePantryStock(item.id)}
                      className="text-stone-400 hover:text-stone-600 focus:outline-none"
                    >
                      {item.inStock ? (
                        <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-white">
                          <Check className="w-4 h-4" />
                        </div>
                      ) : (
                        <Circle className="w-6 h-6 text-amber-800 stroke-[2.2]" />
                      )}
                    </button>
                    <div>
                      <h3 className="font-semibold text-stone-800">{item.name}</h3>
                      <span className="text-xs text-stone-500">{item.category} • Preferred Store: {item.store}</span>
                    </div>
                  </div>

                  {/* Neutral Warm Brown Badge for Reorder/Grocery Status */}
                  <div>
                    {item.inStock ? (
                      <span className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        In Stock
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-stone-100 text-amber-950 border border-amber-300/60 shadow-sm">
                        <Circle className="w-3 h-3 text-amber-800 fill-amber-800/20" />
                        Added to Grocery List
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* GROCERY TAB */}
        {activeTab === 'grocery' && (
          <div className="space-y-6">
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm flex flex-col md:flex-row justify-between md:items-center gap-4">
              <div>
                <h2 className="text-2xl font-bold text-stone-800">Smart Grocery List</h2>
                <p className="text-stone-500 text-sm">Automated Community Pricing & Aisle Sorting</p>
              </div>

              {/* STORE SELECTION DROPDOWN */}
              <div className="flex items-center gap-3 bg-stone-100 p-2 rounded-xl border border-stone-200">
                <Store className="w-5 h-5 text-stone-600 ml-1" />
                <label htmlFor="store-select" className="text-sm font-semibold text-stone-700">Store Filter:</label>
                <select
                  id="store-select"
                  value={selectedStoreMode}
                  onChange={(e) => setSelectedStoreMode(e.target.value as PrimaryStore)}
                  className="bg-white border border-stone-300 rounded-lg px-3 py-1.5 text-sm font-semibold text-stone-800 focus:ring-2 focus:ring-amber-700 focus:outline-none cursor-pointer"
                >
                  <option value="Cheapest">Best Mix (Cheapest Options)</option>
                  <option value="HEB">H-E-B Only (All Items)</option>
                  <option value="Kroger">Kroger Only (All Items)</option>
                </select>
              </div>
            </div>

            {/* GROCERY ITEMS BY STORE */}
            <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
              <div className="p-4 bg-stone-100 border-b border-stone-200 flex justify-between items-center">
                <span className="font-bold text-stone-700">
                  Showing Items for: <span className="text-amber-800">{selectedStoreMode === 'Cheapest' ? 'Optimal Multi-Store Mix' : selectedStoreMode}</span>
                </span>
                <span className="text-sm font-semibold text-stone-600">
                  Estimated Total: <span className="text-emerald-700 text-base font-bold">${calculatedTotal.toFixed(2)}</span>
                </span>
              </div>

              <div className="divide-y divide-stone-100">
                {filteredGroceryItems.length === 0 ? (
                  <div className="p-8 text-center text-stone-500">No items available for this store selection.</div>
                ) : (
                  filteredGroceryItems.map((item) => (
                    <div key={item.id} className="p-4 flex items-center justify-between hover:bg-stone-50/80 transition">
                      <div className="flex items-center gap-3">
                        <input 
                          type="checkbox" 
                          checked={item.checked} 
                          readOnly
                          className="w-5 h-5 text-amber-700 rounded border-stone-300 focus:ring-amber-700" 
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-stone-800">{item.name}</span>
                            {item.fromPantry && (
                              <span className="text-[10px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full font-bold">Pantry Staple</span>
                            )}
                          </div>
                          <p className="text-xs text-stone-500">{item.aisle} • Qty: {item.quantity}</p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="font-bold text-stone-800">${item.estimatedPrice.toFixed(2)}</span>
                        <span className="block text-[11px] text-stone-400 uppercase font-bold">{item.store}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
