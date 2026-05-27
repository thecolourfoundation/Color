import { ToolRegistry } from "../src/tools/ToolRegistry";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("ToolRegistry", () => {
  let workspaceDir: string;
  let registry: ToolRegistry;

  beforeEach(() => {
    workspaceDir = join(tmpdir(), `colors-tools-test-${Date.now()}`);
    mkdirSync(workspaceDir, { recursive: true });
    registry = new ToolRegistry(workspaceDir);
  });

  afterEach(() => {
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  describe("file_read", () => {
    it("reads a file within the workspace", async () => {
      writeFileSync(join(workspaceDir, "hello.txt"), "hello world");
      const tool = registry.get("file_read")!;
      const result = await tool.executor({ path: "hello.txt" }) as any;
      expect(result.content).toBe("hello world");
    });

    it("throws for non-existent file", async () => {
      const tool = registry.get("file_read")!;
      await expect(tool.executor({ path: "missing.txt" })).rejects.toThrow("not found");
    });

    it("blocks path traversal", async () => {
      const tool = registry.get("file_read")!;
      await expect(tool.executor({ path: "../../etc/passwd" })).rejects.toThrow("traversal");
    });
  });

  describe("file_write", () => {
    it("writes a file to the workspace", async () => {
      const tool = registry.get("file_write")!;
      await tool.executor({ path: "output.txt", content: "written content" });

      const readTool = registry.get("file_read")!;
      const result = await readTool.executor({ path: "output.txt" }) as any;
      expect(result.content).toBe("written content");
    });

    it("appends to existing file", async () => {
      writeFileSync(join(workspaceDir, "log.txt"), "line1\n");
      const tool = registry.get("file_write")!;
      await tool.executor({ path: "log.txt", content: "line2\n", append: true });

      const readTool = registry.get("file_read")!;
      const result = await readTool.executor({ path: "log.txt" }) as any;
      expect(result.content).toBe("line1\nline2\n");
    });

    it("blocks path traversal on write", async () => {
      const tool = registry.get("file_write")!;
      await expect(tool.executor({ path: "../../../evil.sh", content: "rm -rf /" }))
        .rejects.toThrow("traversal");
    });
  });

  describe("file_list", () => {
    it("lists workspace contents", async () => {
      writeFileSync(join(workspaceDir, "a.txt"), "a");
      writeFileSync(join(workspaceDir, "b.txt"), "b");
      const tool = registry.get("file_list")!;
      const result = await tool.executor({}) as any;
      expect(result.entries.length).toBe(2);
    });
  });

  describe("math_eval", () => {
    it("evaluates basic arithmetic", async () => {
      const tool = registry.get("math_eval")!;
      const result = await tool.executor({ expression: "2 + 2" }) as any;
      expect(result.result).toBe(4);
    });

    it("evaluates more complex expressions", async () => {
      const tool = registry.get("math_eval")!;
      const result = await tool.executor({ expression: "Math.sqrt(16) * 3" }) as any;
      expect(result.result).toBe(12);
    });

    it("blocks code injection in expression", async () => {
      const tool = registry.get("math_eval")!;
      await expect(tool.executor({ expression: "process.exit(1)" }))
        .rejects.toThrow("non-mathematical");
    });
  });

  describe("web_fetch", () => {
    it("blocks private/loopback addresses", async () => {
      const tool = registry.get("web_fetch")!;
      await expect(tool.executor({ url: "http://localhost:8080/data" }))
        .rejects.toThrow("private");
      await expect(tool.executor({ url: "http://127.0.0.1/secret" }))
        .rejects.toThrow("private");
      await expect(tool.executor({ url: "http://192.168.1.1/admin" }))
        .rejects.toThrow("private");
    });

    it("blocks non-http protocols", async () => {
      const tool = registry.get("web_fetch")!;
      await expect(tool.executor({ url: "file:///etc/passwd" }))
        .rejects.toThrow("Only http/https");
    });
  });

  describe("toAnthropicTools()", () => {
    it("returns tool definitions in Anthropic SDK format", () => {
      const tools = registry.toAnthropicTools();
      expect(tools.length).toBeGreaterThan(0);
      for (const tool of tools) {
        expect(tool.name).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(tool.input_schema.type).toBe("object");
      }
    });

    it("includes risk level in description", () => {
      const tools = registry.toAnthropicTools();
      const shellTool = tools.find(t => t.name === "shell_exec");
      expect(shellTool?.description).toContain("HIGH");
    });
  });
});
