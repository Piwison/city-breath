import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "./SharePanel";

describe("copyText（複製連結）", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("有 Clipboard API 就用它", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    expect(await copyText("https://x.test/?hour=14")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("https://x.test/?hour=14");
  });

  it("Clipboard 被拒：改選取輸入框用 execCommand", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    const execCommand = vi.fn().mockReturnValue(true);
    vi.stubGlobal("document", { execCommand });
    const field = { focus: vi.fn(), select: vi.fn(), setSelectionRange: vi.fn() } as unknown as HTMLInputElement;
    expect(await copyText("abc", field)).toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("兩種都不行：回傳 false（面板提示長按網址複製）", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", { execCommand: () => false });
    expect(await copyText("abc", null)).toBe(false);
  });
});
