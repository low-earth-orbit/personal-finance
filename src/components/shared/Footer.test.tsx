import { describe, it, expect } from "vitest";
import { renderWithMantine, screen } from "@/test-utils";
import Footer from "./Footer";

describe("Footer", () => {
  it("renders the disclaimer and a GitHub link", () => {
    renderWithMantine(<Footer />);

    expect(screen.getByText(/not financial advice/i)).toBeInTheDocument();

    const github = screen.getByRole("link", { name: "GitHub" });
    expect(github).toHaveAttribute("href", "https://github.com/low-earth-orbit/personal-finance");
  });
});
