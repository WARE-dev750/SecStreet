// Storage abstraction. Any backend that implements these operations can
// host the project config, trust store, and audit log. LocalStorage uses
// the filesystem; MemoryStorage is for tests. A future SupabaseStorage
// or WorkersKVStorage implements this same interface without touching
// the rest of the codebase.

export interface StorageFileInfo {
  path: string;
  name: string;
  size: number;
}

export interface Storage {
  read(path: string): Promise<string | null>;
  write(path: string, content: string): Promise<void>;
  append(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  remove(path: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  list(prefix: string): Promise<StorageFileInfo[]>;
}
