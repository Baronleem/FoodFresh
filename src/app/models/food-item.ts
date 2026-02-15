export type StorageLocation = 'fridge' | 'freezer' | 'pantry';

export interface FoodItem {
  id: string;
  name: string;
  expirationDate: string; // store as ISO date string: "2026-02-13"
  storageLocation?: StorageLocation;
  createdAt: string;      // ISO datetime
}
