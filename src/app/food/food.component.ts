import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { LocalFoodStoreService } from '../services/local-food-store.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { BehaviorSubject } from 'rxjs';

type StorageLocation = 'fridge' | 'freezer' | 'pantry';

interface FoodItem {
  id: string;
  name: string;
  expirationDate: string; // YYYY-MM-DD
  storageLocation: StorageLocation;
  createdAt: string;
  price: number;
  opened?: boolean;
  isFrozen?: boolean;
  daysRemainingWhenFrozen?: number;
}

//History
interface HistoryItem {
  id: string;
  name: string;
  price: number;
  purchaseDate: string;
}

type Status = 'expired' | 'use-soon' | 'fresh';
interface RecipeSuggestion {
  title: string;
  ingredients: string[];
  reason: string;
}

@Component({
  selector: 'app-food',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './food.component.html',
  styleUrls: ['./food.component.css'],
})
export class FoodComponent {
  private fb = inject(FormBuilder);
  private foodStore = inject(LocalFoodStoreService);

  private readonly STORAGE_KEY = 'foodfresh_items_v1';
  private readonly useSoonDays = 3;

  // Tabs
  activeTab = signal<'food' | 'calendar' | 'storage' | 'tips' | 'waste' | 'history'>('food');
  setTab(tab: 'food' | 'calendar' | 'storage' | 'tips' | 'waste' | 'history') {
    this.activeTab.set(tab);
  }

  // UI state
  calendarDate = '';
  editingId: string | null = null;

  // Search + storage filter
  searchTerm = '';
  storageFilter: StorageLocation | 'all' = 'all';

  // Waste
  wastedItems: { name: string; price: number }[] = JSON.parse(
    localStorage.getItem('foodfresh_waste') || '[]',
  );
  eatenItems: any[] = JSON.parse(localStorage.getItem('foodfresh_eaten') || '[]');

  //History
  historyItems: HistoryItem[] = JSON.parse(localStorage.getItem('foodfresh_history') || '[]');

  private readonly itemsSubject = new BehaviorSubject<FoodItem[]>(this.readFromStorage());
  readonly items = toSignal(this.itemsSubject.asObservable(), { initialValue: [] as FoodItem[] });

  form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    expirationDate: ['', Validators.required],
    storageLocation: this.fb.control<StorageLocation>('fridge', {
      validators: Validators.required,
    }),
    price: this.fb.control<number>(0, {
      validators: [Validators.required, Validators.min(0)],
    }),
  });

  /* ---------------- CRUD ---------------- */

  add(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const item: FoodItem = {
      id: crypto.randomUUID(),
      name: this.normalizeName(this.form.value.name!),
      expirationDate: this.form.value.expirationDate!,
      storageLocation: this.form.value.storageLocation!,
      price: Number(this.form.value.price!),
      createdAt: new Date().toISOString(),
      opened: false,
    };

    //History
    const historyEntry: HistoryItem = {
      id: item.id,
      name: item.name,
      price: item.price,
      purchaseDate: new Date().toISOString().split('T')[0],
    };

    this.historyItems = [historyEntry, ...this.historyItems];
    this.saveHistory();

    this.saveItems([item, ...this.items()]);
    this.form.reset({ name: '', expirationDate: '', storageLocation: 'fridge', price: 0 });
  }

  edit(item: FoodItem): void {
    this.editingId = item.id;
    this.form.setValue({
      name: item.name,
      expirationDate: item.expirationDate,
      storageLocation: item.storageLocation,
      price: item.price,
    });
  }

  update(): void {
    if (!this.editingId) return;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const updatedList = this.items().map((i) =>
      i.id === this.editingId
        ? {
            ...i,
            name: this.normalizeName(this.form.value.name!),
            expirationDate: this.form.value.expirationDate!,
            storageLocation: this.form.value.storageLocation!,
            price: Number(this.form.value.price!),
          }
        : i,
    );

    this.saveItems(updatedList);
    this.cancelEdit();
  }

  cancelEdit(): void {
    this.editingId = null;
    this.form.reset({ name: '', expirationDate: '', storageLocation: 'fridge', price: 0 });
  }

  delete(id: string): void {
    this.saveItems(this.items().filter((i) => i.id !== id));
  }

  clear(): void {
    this.saveItems([]);
  }

  toggleOpened(item: FoodItem): void {
    this.saveItems(this.items().map((i) => (i.id === item.id ? { ...i, opened: !i.opened } : i)));
  }

  /* ---------------- HISTORY ---------------- */
  private saveHistory(): void {
    localStorage.setItem('foodfresh_history', JSON.stringify(this.historyItems));
  }
  deleteHistoryItem(id: string): void {
    this.historyItems = this.historyItems.filter((item) => item.id !== id);
    this.saveHistory();
  }
  clearHistory(): void {
    this.historyItems = [];
    this.saveHistory();
  }

  /*---------------- STORAGE TIPS ---------------- */

  storageTips = {
    fridge: [
      'Milk and dairy products',
      'Cooked leftovers',
      'Fresh vegetables and fruits',
      'Eggs and butter',
      'Opened sauces and condiments',
    ],

    freezer: [
      'Frozen vegetables',
      'Frozen meat and fish',
      'Ice cream',
      'Bread for long storage',
      'Prepared meals for later use',
    ],

    pantry: [
      'Dry pasta and rice',
      'Canned foods',
      'Flour and baking ingredients',
      'Cooking oils',
      'Unopened sauces and spices',
    ],
  };
  /* ---------------- SMART STORAGE ADVICE ---------------- */

getStorageAdvice(item: FoodItem): string {
  const name = item.name.toLowerCase();

  if (name.includes('milk')) return 'Keep sealed in the fridge and use within a few days after opening.';
  if (name.includes('bread')) return 'Store in a cool dry place. Freeze it if you will not finish it soon.';
  if (name.includes('apple')) return 'Store in the fridge to keep it fresh longer.';
  if (name.includes('banana')) return 'Keep on the counter until ripe. Do not refrigerate unless already ripe.';
  if (name.includes('chicken') || name.includes('beef') || name.includes('meat'))
    return 'Keep in the fridge if using soon, otherwise freeze it right away.';
  if (name.includes('ice cream')) return 'Keep in the freezer and avoid leaving it out too long.';
  if (name.includes('egg')) return 'Store in the fridge in the original carton.';
  if (name.includes('rice') || name.includes('pasta'))
    return 'Store in a cool dry pantry in a sealed container.';
  if (name.includes('cheese')) return 'Keep in the fridge and reseal after opening.';
  if (name.includes('lettuce') || name.includes('spinach'))
    return 'Keep in the fridge and use a container or bag with some airflow.';

  if (item.storageLocation === 'fridge')
    return 'Best kept cold in the fridge and checked regularly.';
  if (item.storageLocation === 'freezer')
    return 'Keep frozen until needed to make it last longer.';

  return 'Store in a cool dry pantry away from sunlight and heat.';
}

bestStorageItems(): FoodItem[] {
  return this.items().slice(0, 10);
}
    /* ---------------- RECIPE SUGGESTIONS ---------------- */

  get recipeSuggestions(): RecipeSuggestion[] {
    const names = this.items().map((i) => i.name.toLowerCase());
    const has = (word: string) => names.some((n) => n.includes(word));

    const suggestions: RecipeSuggestion[] = [];

    if (has('bread') && has('cheese')) {
      suggestions.push({
        title: 'Grilled Cheese Sandwich',
        ingredients: ['Bread', 'Cheese'],
        reason: 'Good option because you already have bread and cheese.',
      });
    }

    if (has('egg') && (has('bread') || has('cheese'))) {
      suggestions.push({
        title: 'Quick Breakfast Sandwich',
        ingredients: ['Eggs', 'Bread', 'Cheese'],
        reason: 'Uses common breakfast items already in your inventory.',
      });
    }

    if (has('milk') && has('banana')) {
      suggestions.push({
        title: 'Banana Smoothie',
        ingredients: ['Milk', 'Banana'],
        reason: 'Easy way to use ripe fruit before it goes bad.',
      });
    }

    if ((has('chicken') || has('beef')) && has('rice')) {
      suggestions.push({
        title: 'Rice Bowl',
        ingredients: ['Chicken or Beef', 'Rice'],
        reason: 'Simple meal using protein and pantry ingredients.',
      });
    }

    if (has('pasta') && (has('cheese') || has('milk'))) {
      suggestions.push({
        title: 'Simple Creamy Pasta',
        ingredients: ['Pasta', 'Cheese or Milk'],
        reason: 'Good way to make a meal from basic ingredients.',
      });
    }

    if (has('lettuce') || has('spinach') || has('apple')) {
      suggestions.push({
        title: 'Fresh Salad Bowl',
        ingredients: ['Lettuce/Spinach/Fruit'],
        reason: 'Helpful for using produce before expiration.',
      });
    }

    if (suggestions.length === 0) {
      suggestions.push({
        title: 'No matching recipe yet',
        ingredients: [],
        reason: 'Add more food items to get recipe suggestions.',
      });
    }

    return suggestions.slice(0, 5);
  }

  useSoonRecipeItems(): FoodItem[] {
    return this.useSoonItems().slice(0, 5);
  }

  /* ---------------- WASTE ---------------- */
  private saveStats(): void {
    localStorage.setItem('foodfresh_waste', JSON.stringify(this.wastedItems));
    localStorage.setItem('foodfresh_eaten', JSON.stringify(this.eatenItems));
  }
  get foodScore() {
    const eatenCount = this.eatenItems.length;
    const wastedCount = this.wastedItems.length;
    const total = eatenCount + wastedCount;

    if (total === 0) return { usedPercent: 0, wastePercent: 0, total: 0 };

    return {
      usedPercent: Math.round((eatenCount / total) * 100),
      wastePercent: Math.round((wastedCount / total) * 100),
      total: total,
    };
  }
  get totalUsedCost(): number {
    return this.eatenItems.reduce((sum, item) => sum + item.price, 0);
  }
  get totalWasteCost(): number {
    return this.wastedItems.reduce((sum, item) => sum + item.price, 0);
  }

  waste(item: FoodItem): void {
    this.wastedItems.push({ name: item.name, price: item.price });
    this.saveStats();
    this.delete(item.id);
  }

  eaten(item: FoodItem): void {
    this.eatenItems.push(item);
    this.saveStats();
    this.delete(item.id);
  }

  clearWaste(): void {
    this.wastedItems = [];
    this.saveStats();
  }
  clearEaten(): void {
    this.eatenItems = [];
    this.saveStats();
  }
  /* -------------- FROZEN TOGGLE ---------------- */
  toggleFrozen(item: FoodItem): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let updatedItem: FoodItem;

    if (!item.isFrozen) {
      const [y, m, d] = item.expirationDate.split('-').map(Number);
      const expDate = new Date(y, m - 1, d);

      const diffTime = expDate.getTime() - today.getTime();
      const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      updatedItem = {
        ...item,
        isFrozen: true,
        daysRemainingWhenFrozen: daysLeft,
      };
    } else {
      const remaining = item.daysRemainingWhenFrozen || 0;
      const newExp = new Date(today);
      newExp.setDate(today.getDate() + remaining);

      updatedItem = {
        ...item,
        isFrozen: false,
        expirationDate: newExp.toISOString().split('T')[0],
        daysRemainingWhenFrozen: undefined,
      };
    }

    this.saveItems(this.items().map((i) => (i.id === item.id ? updatedItem : i)));
  }

  /* ---------------- SEARCH ---------------- */

  private matchesSearch(item: FoodItem): boolean {
    const q = this.searchTerm.trim().toLowerCase();
    if (!q) return true;
    return item.name.toLowerCase().includes(q);
  }

  /* ---------------- STORAGE FILTER ---------------- */

  filteredByStorage(): FoodItem[] {
    const base =
      this.storageFilter === 'all'
        ? this.items()
        : this.items().filter((i) => i.storageLocation === this.storageFilter);

    return base.filter((i) => this.matchesSearch(i));
  }

  storageCount(loc: StorageLocation): number {
    return this.items().filter((i) => i.storageLocation === loc).length;
  }

  /* ---------------- STATUS + DISPLAY ---------------- */

  status(item: FoodItem): Status {
    const [y, m, d] = item.expirationDate.split('-').map(Number);
    const exp = new Date(y, m - 1, d);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expDay = new Date(exp.getFullYear(), exp.getMonth(), exp.getDate());
    const diffDays = Math.floor((expDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'expired';
    if (diffDays <= this.useSoonDays) return 'use-soon';
    return 'fresh';
  }

  private filterByStatus(type: Status): FoodItem[] {
    return this.items()
      .filter((i) => this.status(i) === type)
      .filter((i) => this.matchesSearch(i));
  }

  expiredItems(): FoodItem[] {
    return this.filterByStatus('expired');
  }

  useSoonItems(): FoodItem[] {
    return this.filterByStatus('use-soon');
  }

  freshItems(): FoodItem[] {
    return this.filterByStatus('fresh');
  }

  daysLeft(item: FoodItem): number {
    const [y, m, d] = item.expirationDate.split('-').map(Number);
    const exp = new Date(y, m - 1, d);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expDay = new Date(exp.getFullYear(), exp.getMonth(), exp.getDate());
    const diff = expDay.getTime() - today.getTime();

    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  statusText(item: FoodItem): string {
    //if frozen
    if (item.isFrozen) {
      return `Frozen (Paused with ${item.daysRemainingWhenFrozen} days left)`;
    }
    const d = this.daysLeft(item);
    if (d < 0) return `Expired ${Math.abs(d)} day(s) ago`;
    if (d === 0) return 'Expires today';
    return `${d} day(s) left`;
  }

  /* ---------------- CALENDAR ---------------- */

  itemsForDate(dateStr: string): FoodItem[] {
    if (!dateStr) return [];
    return this.items().filter((i) => i.expirationDate === dateStr);
  }

  next7Days(): FoodItem[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.items().filter((i) => {
      const [y, m, d] = i.expirationDate.split('-').map(Number);
      const exp = new Date(y, m - 1, d);
      exp.setHours(0, 0, 0, 0);

      const diff = Math.floor((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return diff >= 0 && diff <= 7;
    });
  }

  /* ---------------- SHARE ---------------- */
  async shareData(type: 'report' | 'inventory' | 'history'): Promise<void> {
    let title = '';
    let shareText = '';

    if (type === 'report') {
      title = 'Waste Report';
      shareText = [
        'Waste Stats',
        '',
        `Efficiency: ${this.foodScore.usedPercent}% Used`,
        `Items Eaten: ${this.eatenItems.length}`,
        `Items Wasted: ${this.wastedItems.length}`,
        `Money Lost: $${this.totalWasteCost.toFixed(2)}`,
      ].join('\n');
    } else if (type === 'inventory') {
      title = 'Inventory List';
      const inventory = this.items()
        .map((i) => `• ${i.name} (Exp: ${i.expirationDate})`)
        .join('\n');

      shareText = ['Current Inventory', '', inventory || 'No items in stock.'].join('\n');
    } else if (type === 'history') {
      title = 'Purchase History';
      const history = this.historyItems
        .map((h) => `• ${h.name}: $${h.price.toFixed(2)} (${h.purchaseDate})`)
        .join('\n');

      shareText = ['Purchase History', '', history || 'No history recorded.'].join('\n');
    }

    try {
      await navigator.clipboard.writeText(shareText);
      alert(title + ' copied to clipboard');
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  }

  /* ---------------- HELPERS ---------------- */

  private readFromStorage(): FoodItem[] {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return [];

      const parsed = JSON.parse(raw) as Partial<FoodItem>[];
      const arr = Array.isArray(parsed) ? parsed : [];

      const fixed: FoodItem[] = arr.map((i) => ({
        id: String(i.id ?? crypto.randomUUID()),
        name: this.normalizeName(String(i.name ?? '')),
        expirationDate: String(i.expirationDate ?? ''),
        storageLocation: (i.storageLocation as StorageLocation) ?? 'fridge',
        price: typeof i.price === 'number' && !Number.isNaN(i.price) ? i.price : 0,
        createdAt: String(i.createdAt ?? new Date().toISOString()),
        opened: typeof i.opened === 'boolean' ? i.opened : false,
        isFrozen: !!i.isFrozen,
        daysRemainingWhenFrozen: i.daysRemainingWhenFrozen,
      }));

      const cleaned = fixed.filter(
        (x) => x.name.trim().length > 0 && x.expirationDate.length === 10,
      );
      return this.sortItems(cleaned);
    } catch {
      return [];
    }
  }

  private saveItems(items: FoodItem[]): void {
    const sorted = this.sortItems(items);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(sorted));
    this.itemsSubject.next(sorted);
  }

  private sortItems(items: FoodItem[]): FoodItem[] {
    return [...items].sort((a, b) => a.expirationDate.localeCompare(b.expirationDate));
  }

  private normalizeName(input: string): string {
    return input
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .split(' ')
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ''))
      .join(' ');
  }
}
