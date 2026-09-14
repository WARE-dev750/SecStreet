import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalStorage } from "@secstreet/storage";
import { MemoryStorage } from "@secstreet/storage";
import type { Storage } from "@secstreet/contracts";

function suite(name: string, make: () => Promise<{ storage: Storage; cleanup: () => Promise<void> }>) {
  describe(name, () => {
    let storage: Storage;
    let cleanup: () => Promise<void>;
    beforeEach(async () => { ({ storage, cleanup } = await make()); });
    afterEach(async () => { await cleanup(); });

    it("write then read returns the content", async () => {
      await storage.write("a.txt", "hello");
      expect(await storage.read("a.txt")).toBe("hello");
    });

    it("read of a missing file returns null", async () => {
      expect(await storage.read("nope.txt")).toBeNull();
    });

    it("exists reflects the state", async () => {
      expect(await storage.exists("a.txt")).toBe(false);
      await storage.write("a.txt", "x");
      expect(await storage.exists("a.txt")).toBe(true);
    });

    it("append accumulates", async () => {
      await storage.write("log.txt", "one\n");
      await storage.append("log.txt", "two\n");
      await storage.append("log.txt", "three\n");
      expect(await storage.read("log.txt")).toBe("one\ntwo\nthree\n");
    });

    it("append creates the file if missing", async () => {
      await storage.append("new.txt", "first\n");
      expect(await storage.read("new.txt")).toBe("first\n");
    });

    it("mkdir then write a nested path", async () => {
      await storage.mkdir("sub/dir");
      await storage.write("sub/dir/file.txt", "nested");
      expect(await storage.read("sub/dir/file.txt")).toBe("nested");
    });

    it("list returns files under a prefix", async () => {
      await storage.write("dir/a.txt", "aaa");
      await storage.write("dir/b.txt", "bb");
      await storage.write("other/c.txt", "c");
      const files = await storage.list("dir");
      expect(files.map((f) => f.path).sort()).toEqual(["dir/a.txt", "dir/b.txt"]);
      expect(files[0].size).toBeGreaterThan(0);
    });

    it("remove deletes a file", async () => {
      await storage.write("x.txt", "x");
      await storage.remove("x.txt");
      expect(await storage.read("x.txt")).toBeNull();
    });

    it("remove deletes a directory tree", async () => {
      await storage.write("d/a.txt", "a");
      await storage.write("d/b.txt", "b");
      await storage.remove("d");
      expect(await storage.list("d")).toEqual([]);
    });
  });
}

suite("LocalStorage", async () => {
  const dir = await mkdtemp(join(tmpdir(), "secstreet-storage-"));
  return { storage: new LocalStorage(dir), cleanup: () => rm(dir, { recursive: true, force: true }) };
});

suite("MemoryStorage", async () => {
  return { storage: new MemoryStorage(), cleanup: async () => {} };
});
