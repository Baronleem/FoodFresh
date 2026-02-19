import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { BehaviorSubject } from 'rxjs';

type StorageLocation = 'fridge' | 'freezer' | 'pantry';

interface FoodItem {
  id: string;
  name: string;
  expirationDate: string; // YYYY-MM-DD
  storageLocation: StorageLocation;
  createdAt: string;
  //adding food item price for waste calculator
  price: number;
}

type Status = 'expired' | 'use-soon' | 'fresh';

@Component({
  selector: 'app-food',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './food.component.html',
})
export class FoodComponent {
  private fb = inject(FormBuilder);

  private readonly STORAGE_KEY = 'foodfresh_items_v1';
  private readonly useSoonDays = 3;

  //Editing
  editingId: string | null = null;

  //Waste
  wastedItems: { name: string; price: number }[] = [];
  totalWasteCost: number = 0;

  private readonly itemsSubject = new BehaviorSubject<FoodItem[]>(this.readFromStorage());
  readonly items = toSignal(this.itemsSubject.asObservable(), { initialValue: [] as FoodItem[] });

  form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    expirationDate: ['', Validators.required],
    storageLocation: this.fb.control<StorageLocation>('fridge', {
      validators: Validators.required,
    }),
    price: [0, [Validators.required, Validators.min(0)]],
  });

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
    };

    const updated = this.sortItems([item, ...this.items()]);
    this.saveItems(updated);

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

    const updatedItem: FoodItem = {
      id: this.editingId,
      name: this.normalizeName(this.form.value.name!),
      expirationDate: this.form.value.expirationDate!,
      storageLocation: this.form.value.storageLocation!,
      price: Number(this.form.value.price!),
      createdAt: new Date().toISOString(),
    };

    const updatedList = this.items().map((i) => (i.id === this.editingId ? updatedItem : i));
    this.saveItems(updatedList);

    // Reset form and editing state
    this.form.reset({ name: '', expirationDate: '', storageLocation: 'fridge', price: 0 });
    this.editingId = null;
  }
  waste(item: FoodItem): void {
    this.wastedItems.push({
      name: item.name,
      price: item.price,
    });

    // Total cost of waste
    this.totalWasteCost += item.price;

    // Use delete to remove from main list
    this.delete(item.id);
  }

  delete(id: string): void {
    const updated = this.items().filter((i) => i.id !== id);
    this.saveItems(updated);
  }

  clear(): void {
    this.saveItems([]);
  }

  clearWaste(): void {
    this.wastedItems = [];
    this.totalWasteCost = 0;
  }

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

  // ---------- helpers ----------

  private readFromStorage(): FoodItem[] {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as FoodItem[];
      return this.sortItems(Array.isArray(parsed) ? parsed : []);
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
