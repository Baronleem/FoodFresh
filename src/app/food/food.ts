import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';

interface FoodItem {
  id: string;
  name: string;
  expirationDate: string; // YYYY-MM-DD
  storageLocation?: 'fridge' | 'freezer' | 'pantry';
  createdAt: string;
}

type Status = 'expired' | 'use-soon' | 'fresh';

@Component({
  selector: 'app-food',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './food.html',
})
export class FoodComponent {
  private fb = inject(FormBuilder);

  private readonly STORAGE_KEY = 'foodfresh_items_v1';
  private readonly useSoonDays = 3;

  form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    expirationDate: ['', Validators.required],
    storageLocation: ['fridge'],
  });

  private itemsSignal = toSignal(this.loadItems(), { initialValue: [] as FoodItem[] });
  items = this.itemsSignal;

  add(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const item: FoodItem = {
      id: crypto.randomUUID(),
      name: this.form.value.name!,
      expirationDate: this.form.value.expirationDate!,
      storageLocation: this.form.value.storageLocation || 'fridge',
      createdAt: new Date().toISOString(),
    };

    const updated = this.sortItems([item, ...this.items()]);
    this.saveItems(updated);

    this.form.reset({ name: '', expirationDate: '', storageLocation: 'fridge' });
  }

  delete(id: string): void {
    const updated = this.items().filter(i => i.id !== id);
    this.saveItems(updated);
  }

  clear(): void {
    localStorage.removeItem(this.STORAGE_KEY);
    this.saveItems([]);
  }

  status(item: FoodItem): Status {
    const [y, m, d] = item.expirationDate.split('-').map(Number);
    const exp = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffDays =
      (exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);

    if (diffDays < 0) return 'expired';
    if (diffDays <= this.useSoonDays) return 'use-soon';
    return 'fresh';
  }

  // ---------- helpers ----------

  private loadItems() {
    return {
      subscribe: (fn: (v: FoodItem[]) => void) => {
        fn(this.readFromStorage());
        return { unsubscribe() {} };
      },
    };
  }

  private readFromStorage(): FoodItem[] {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return [];
      return this.sortItems(JSON.parse(raw));
    } catch {
      return [];
    }
  }

  private saveItems(items: FoodItem[]): void {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(items));
    this.itemsSignal.set(items);
  }

  private sortItems(items: FoodItem[]): FoodItem[] {
    return [...items].sort((a, b) =>
      a.expirationDate.localeCompare(b.expirationDate)
    );
  }
}
