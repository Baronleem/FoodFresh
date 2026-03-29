import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { FoodItem, StorageLocation } from '../models/food-item';
import { FoodStore } from './food-store.service';

const KEY = 'foodfresh_items_v1';

function uuid(): string {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function readFromStorage(): FoodItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FoodItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Failed to read from localStorage:', e);
    return [];
  }
}

function writeToStorage(items: FoodItem[]): void {
  localStorage.setItem(KEY, JSON.stringify(items));
}

@Injectable({ providedIn: 'root' })
export class LocalFoodStoreService implements FoodStore {
  private readonly subject = new BehaviorSubject<FoodItem[]>(this.sort(readFromStorage()));

  private readonly wasteSubject = new BehaviorSubject<{ name: string; price: number }[]>([]);
  readonly wastedItems$ = this.wasteSubject.asObservable();

  private readonly usedSubject = new BehaviorSubject<{ name: string; price: number }[]>([]);
  readonly usedItems$ = this.usedSubject.asObservable();

  list(): Observable<FoodItem[]> {
    return this.subject.asObservable();
  }

  wasteList(): Observable<{ name: string; price: number }[]> {
    return this.wasteSubject.asObservable();
  }

  readonly foodScore = () => {
    const used = this.usedSubject.value.length;
    const wasted = this.wasteSubject.value.length;
    const total = used + wasted;

    if (total === 0) return { usedPercent: 0, wastePercent: 0, total: 0 };

    return {
      usedPercent: Math.round((used / total) * 100),
      wastePercent: Math.round((wasted / total) * 100),
      total,
    };
  };

  add(input: {
    name: string;
    expirationDate: string;
    storageLocation?: string;
    price: number;
    type?: 'grocery' | 'meal';
  }): void {
    const item: FoodItem = {
      id: uuid(),
      name: input.name.trim(),
      expirationDate: input.expirationDate, // "YYYY-MM-DD"
      storageLocation: (input.storageLocation as StorageLocation) || undefined,
      price: input.price,
      type: input.type || 'grocery',
      createdAt: new Date().toISOString(),
    };

    const next = this.sort([item, ...this.subject.value]);
    this.subject.next(next);
    writeToStorage(next);
  }

  remove(id: string): void {
    const next = this.subject.value.filter((x) => x.id !== id);
    this.subject.next(next);
    writeToStorage(next);
  }

  use(item: FoodItem): void {
    const current = this.usedSubject.value;
    current.push({ name: item.name, price: item.price });
    this.usedSubject.next([...current]);
    this.remove(item.id);
  }

  waste(item: FoodItem): void {
    const currentList = this.wasteSubject.value;

    currentList.push({
      name: item.name,
      price: item.price,
    });

    this.wasteSubject.next(currentList);

    this.remove(item.id);
  }

  clear(): void {
    this.subject.next([]);
    localStorage.removeItem(KEY);
  }

  clearWaste(): void {
    this.wasteSubject.next([]);
    this.usedSubject.next([]);
  }

  edit(
    id: string,
    input: { name: string; expirationDate: string; storageLocation?: string },
  ): void {
    const next = this.sort(
      this.subject.value.map((item) =>
        item.id === id
          ? {
              ...item,
              name: input.name.trim(),
              expirationDate: input.expirationDate,
              storageLocation: (input.storageLocation as StorageLocation) || item.storageLocation,
            }
          : item,
      ),
    );

    this.subject.next(next);
    writeToStorage(next);
  }

  private sort(items: FoodItem[]): FoodItem[] {
    return [...items].sort((a, b) => {
      const d = a.expirationDate.localeCompare(b.expirationDate);
      return d !== 0 ? d : a.createdAt.localeCompare(b.createdAt);
    });
  }
}
