import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import { MANIFEST } from "@/lib/library";
import { useManifest } from "@/lib/manifest-context";
import { ManifestGate } from "@/App";

vi.mock("@/lib/manifest-context", () => ({
  useManifest: vi.fn(),
}));

const mockedUseManifest = vi.mocked(useManifest);

function mockManifestState(isError: boolean) {
  const refetch = vi.fn();

  mockedUseManifest.mockReturnValue({
    manifest: MANIFEST,
    isLoading: false,
    isError,
    refetch,
  });

  return refetch;
}

describe("ManifestGate", () => {
  it("shows the stale manifest warning when the API is unreachable", () => {
    mockManifestState(true);

    render(
      <ManifestGate>
        <div>Library content</div>
      </ManifestGate>
    );

    expect(
      screen.getByText(
        "Could not reach the API — showing bundled manifest. Some data may be stale."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByText("Library content")).toBeInTheDocument();
  });

  it("does not show the stale manifest warning when the API is healthy", () => {
    mockManifestState(false);

    render(
      <ManifestGate>
        <div>Library content</div>
      </ManifestGate>
    );

    expect(
      screen.queryByText(
        "Could not reach the API — showing bundled manifest. Some data may be stale."
      )
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("refetches the manifest when Retry is clicked", () => {
    const refetch = mockManifestState(true);

    render(
      <ManifestGate>
        <div>Library content</div>
      </ManifestGate>
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("clears the stale manifest warning after a successful retry", () => {
    let isError = true;
    const refetch = vi.fn(() => {
      isError = false;
    });

    mockedUseManifest.mockImplementation(() => ({
      manifest: MANIFEST,
      isLoading: false,
      isError,
      refetch,
    }));

    const { rerender } = render(
      <ManifestGate>
        <div>Library content</div>
      </ManifestGate>
    );

    expect(
      screen.getByText(
        "Could not reach the API — showing bundled manifest. Some data may be stale."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    rerender(
      <ManifestGate>
        <div>Library content</div>
      </ManifestGate>
    );

    expect(
      screen.queryByText(
        "Could not reach the API — showing bundled manifest. Some data may be stale."
      )
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
