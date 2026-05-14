import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";
import SetActivitySheet from "./SetActivitySheet";
import type { CurrentActivity } from "../../convex/tripcastApi";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

const BASE_ACTIVITY: CurrentActivity = {
  _id: "act1",
  _creationTime: Date.now(),
  title: "Existing walk",
  emoji: "🚶",
  startedAt: Date.now() - 300_000,
  status: "active",
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

function makeProps(overrides?: Partial<Parameters<typeof SetActivitySheet>[0]>) {
  return {
    open: true,
    token: "test-token",
    onOpenChange: vi.fn(),
    ...overrides,
  };
}

// SetActivitySheet calls hooks in order:
//   1st useQuery  → travelerGetCurrentActivity (existing activity or null)
//   1st useMutation → travelerSetCurrentActivity

function setupMocks(existingActivity: CurrentActivity | null = null) {
  const setActivityMock = vi.fn().mockResolvedValue("new-id");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (vi.mocked(convexReact.useQuery) as any).mockReturnValue(existingActivity);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(convexReact.useMutation).mockReturnValue(setActivityMock as any);
  return { setActivityMock };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SetActivitySheet", () => {
  it("renders the sheet title when open", () => {
    setupMocks();
    render(<SetActivitySheet {...makeProps()} />);
    expect(screen.getByText("Set Current Activity")).toBeInTheDocument();
  });

  it("renders all quick-activity pill buttons", () => {
    setupMocks();
    render(<SetActivitySheet {...makeProps()} />);
    expect(screen.getByRole("button", { name: /Walking/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Eating/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Taking train/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Resting/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Exploring/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Shopping/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Errands/ })).toBeInTheDocument();
  });

  it("clicking a quick-activity pill sets the title input", async () => {
    setupMocks();
    const user = userEvent.setup();
    render(<SetActivitySheet {...makeProps()} />);
    await user.click(screen.getByRole("button", { name: /Walking/ }));
    expect(screen.getByPlaceholderText("What are you doing? *")).toHaveValue("Walking");
  });

  it("submit button is disabled when title is empty", () => {
    setupMocks();
    render(<SetActivitySheet {...makeProps()} />);
    expect(screen.getByRole("button", { name: "Set Activity" })).toBeDisabled();
  });

  it("submit button is enabled after typing a title", async () => {
    setupMocks();
    const user = userEvent.setup();
    render(<SetActivitySheet {...makeProps()} />);
    await user.type(screen.getByPlaceholderText("What are you doing? *"), "Hiking");
    expect(screen.getByRole("button", { name: "Set Activity" })).toBeEnabled();
  });

  it("calls the mutation with correct args on submit", async () => {
    const { setActivityMock } = setupMocks();
    const user = userEvent.setup();
    render(<SetActivitySheet {...makeProps()} />);

    await user.type(screen.getByPlaceholderText("What are you doing? *"), "Hiking");
    await user.type(screen.getByPlaceholderText("Note (optional)"), "Up the ridge");
    await user.type(screen.getByPlaceholderText("Place name (optional)"), "Tiger Mountain");
    await user.click(screen.getByRole("button", { name: "Set Activity" }));

    await waitFor(() => {
      expect(setActivityMock).toHaveBeenCalledWith({
        token: "test-token",
        title: "Hiking",
        emoji: undefined,
        note: "Up the ridge",
        locationLabel: "Tiger Mountain",
      });
    });
  });

  it("omits empty optional fields from the mutation args", async () => {
    const { setActivityMock } = setupMocks();
    const user = userEvent.setup();
    render(<SetActivitySheet {...makeProps()} />);

    await user.type(screen.getByPlaceholderText("What are you doing? *"), "Running");
    await user.click(screen.getByRole("button", { name: "Set Activity" }));

    await waitFor(() => {
      expect(setActivityMock).toHaveBeenCalledWith(
        expect.objectContaining({ note: undefined, locationLabel: undefined, emoji: undefined }),
      );
    });
  });

  it("calls onOpenChange(false) after successful submit", async () => {
    const { setActivityMock } = setupMocks();
    setActivityMock.mockResolvedValue("new-id");
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<SetActivitySheet {...makeProps({ onOpenChange })} />);

    await user.type(screen.getByPlaceholderText("What are you doing? *"), "Running");
    await user.click(screen.getByRole("button", { name: "Set Activity" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("shows a rate-limit-friendly error when the mutation throws", async () => {
    const { setActivityMock } = setupMocks();
    setActivityMock.mockRejectedValue(new Error("Too many updates"));
    const user = userEvent.setup();
    render(<SetActivitySheet {...makeProps()} />);

    await user.type(screen.getByPlaceholderText("What are you doing? *"), "Running");
    await user.click(screen.getByRole("button", { name: "Set Activity" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Too many updates. Try again in a minute.");
    });
  });

  it("shows the raw error for non-rate-limit failures", async () => {
    const { setActivityMock } = setupMocks();
    setActivityMock.mockRejectedValue(new Error("Backend exploded"));
    const user = userEvent.setup();
    render(<SetActivitySheet {...makeProps()} />);

    await user.type(screen.getByPlaceholderText("What are you doing? *"), "Running");
    await user.click(screen.getByRole("button", { name: "Set Activity" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Backend exploded");
    });
  });

  it("shows existing activity warning when an active activity is present", () => {
    setupMocks(BASE_ACTIVITY);
    render(<SetActivitySheet {...makeProps()} />);
    expect(screen.getByText(/Replaces current/)).toBeInTheDocument();
    expect(screen.getByText("Existing walk")).toBeInTheDocument();
  });

  it("shows 'Replace Activity' on submit button when an existing activity is present", () => {
    setupMocks(BASE_ACTIVITY);
    render(<SetActivitySheet {...makeProps()} />);
    // Button starts disabled (no title typed) but label should already be "Replace Activity"
    // Type a title to make the button label visible in non-disabled state
    expect(screen.getByRole("button", { name: "Replace Activity" })).toBeInTheDocument();
  });

  it("shows 'Set Activity' on submit button when no existing activity", () => {
    setupMocks(null);
    render(<SetActivitySheet {...makeProps()} />);
    expect(screen.getByRole("button", { name: "Set Activity" })).toBeInTheDocument();
  });
});
