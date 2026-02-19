import { Observable } from 'rxjs';
import { FoodItem } from '../models/food-item';

export interface FoodStore {
  list(): Observable<FoodItem[]>;
  wasteList(): Observable<{ name: string; price: number }[]>;
  add(input: {
    name: string;
    expirationDate: string;
    storageLocation?: string;
    price: number;
  }): void;
  edit(
    id: string,
    input: { name: string; expirationDate: string; storageLocation?: string; price: number },
  ): void;
  waste(item: FoodItem): void;
  remove(id: string): void;
  clear(): void;
}
