import { Observable } from 'rxjs';
import { FoodItem } from '../models/food-item';

export interface FoodStore {
  list(): Observable<FoodItem[]>;
  add(input: { name: string; expirationDate: string; storageLocation?: string }): void;
  edit(id: string, input: { name: string; expirationDate: string; storageLocation?: string }): void;
  remove(id: string): void;
  clear(): void;
}
