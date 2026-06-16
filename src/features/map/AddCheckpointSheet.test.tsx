import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AddCheckpointSheet from "./AddCheckpointSheet";
import type { SelectedCoordinate } from "./AddCheckpointSheet";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

const COORD: SelectedCoordinate = { lat: 47.6097, lon: -122.3422, source: "tap_add_mode" };

function makeProps(overrides: Partial<Parameters<typeof AddCheckpointSheet>[0]> = {}) {
  return {
    selectedCoordinate: COORD,
    onSave: vi.fn().mockResolvedValue("checkpoint-id"),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe("AddCheckpointSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:story-image"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("does not render form content when selectedCoordinate is null", () => {
    render(<AddCheckpointSheet {...makeProps({ selectedCoordinate: null })} />);
    expect(screen.queryByRole("button", { name: "Save pin" })).not.toBeInTheDocument();
  });

  it("renders the form with all fields when open", () => {
    render(<AddCheckpointSheet {...makeProps()} />);
    expect(screen.getByRole("button", { name: "Save pin" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. Capitol Hill")).toBeInTheDocument();
    expect(screen.getByLabelText(/Add to Story/)).toBeInTheDocument();
    expect(screen.getByText(/47.609700/)).toBeInTheDocument();
    expect(screen.getByText(/-122.342200/)).toBeInTheDocument();
  });

  it("Add to Story checkbox is checked by default", () => {
    render(<AddCheckpointSheet {...makeProps()} />);
    expect(screen.getByLabelText(/Add to Story/)).toBeChecked();
  });

  it("calls onSave with correct args on submit", async () => {
    const onSave = vi.fn().mockResolvedValue("id");
    const user = userEvent.setup();
    render(<AddCheckpointSheet {...makeProps({ onSave })} />);

    await user.type(screen.getByRole("textbox", { name: /Title/i }), "Capitol Hill");
    await user.type(screen.getByPlaceholderText("e.g. Capitol Hill"), "Capitol Hill");
    await user.type(screen.getByRole("textbox", { name: /Story/i }), "Great view");

    await user.click(screen.getByRole("button", { name: "Save pin" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Capitol Hill",
          locationLabel: "Capitol Hill",
          note: "Great view",
          showInStory: true,
          lat: COORD.lat,
          lon: COORD.lon,
          source: COORD.source,
        }),
      );
    });
  });

  it("passes title as undefined when left blank", async () => {
    const onSave = vi.fn().mockResolvedValue("id");
    const user = userEvent.setup();
    render(<AddCheckpointSheet {...makeProps({ onSave })} />);

    await user.click(screen.getByRole("button", { name: "Save pin" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ title: undefined }));
    });
  });

  it("passes locationLabel and note as undefined when blank", async () => {
    const onSave = vi.fn().mockResolvedValue("id");
    const user = userEvent.setup();
    render(<AddCheckpointSheet {...makeProps({ onSave })} />);

    await user.click(screen.getByRole("button", { name: "Save pin" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ locationLabel: undefined, note: undefined }),
      );
    });
  });

  it("passes showInStory: false when unchecked", async () => {
    const onSave = vi.fn().mockResolvedValue("id");
    const user = userEvent.setup();
    render(<AddCheckpointSheet {...makeProps({ onSave })} />);

    await user.click(screen.getByLabelText(/Add to Story/));
    await user.click(screen.getByRole("button", { name: "Save pin" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ showInStory: false }));
    });
  });

  it("uploads a selected photo and passes imageId on submit", async () => {
    const onSave = vi.fn().mockResolvedValue("id");
    const onUploadImage = vi.fn().mockResolvedValue("image-1");
    const user = userEvent.setup();
    render(<AddCheckpointSheet {...makeProps({ onSave, onUploadImage })} />);

    const file = new File(["image-bytes"], "story.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("Add photo"), file);
    await user.click(screen.getByRole("button", { name: "Save pin" }));

    await waitFor(() => {
      expect(onUploadImage).toHaveBeenCalledWith(file);
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ imageId: "image-1" }));
    });
  });

  it("passes the selected photo display size on submit", async () => {
    const onSave = vi.fn().mockResolvedValue("id");
    const user = userEvent.setup();
    render(<AddCheckpointSheet {...makeProps({ onSave, onUploadImage: vi.fn() })} />);

    await user.click(screen.getByRole("button", { name: /large/i }));
    await user.click(screen.getByRole("button", { name: "Save pin" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ imageSize: "large" }));
    });
  });

  it("calls onClose after successful save", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<AddCheckpointSheet {...makeProps({ onClose })} />);

    await user.click(screen.getByRole("button", { name: "Save pin" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(<AddCheckpointSheet {...makeProps({ onClose })} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows saveUnavailableMessage as alert without calling onSave", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <AddCheckpointSheet
        {...makeProps({ onSave, saveUnavailableMessage: "Saving is disabled." })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save pin" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Saving is disabled.");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows a friendly error when onSave throws a rate limit error", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("Too many requests"));
    const user = userEvent.setup();
    render(<AddCheckpointSheet {...makeProps({ onSave })} />);

    await user.click(screen.getByRole("button", { name: "Save pin" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Too many checkpoints");
    });
  });

  it("shows the raw error message for non-rate-limit errors", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("Server exploded"));
    const user = userEvent.setup();
    render(<AddCheckpointSheet {...makeProps({ onSave })} />);

    await user.click(screen.getByRole("button", { name: "Save pin" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Server exploded");
    });
  });

  it("resets fields when a new coordinate is selected", async () => {
    const { rerender } = render(<AddCheckpointSheet {...makeProps()} />);
    const titleInput = screen.getByRole("textbox", { name: /Title/i });
    fireEvent.change(titleInput, { target: { value: "Old Title" } });
    expect(titleInput).toHaveValue("Old Title");

    rerender(
      <AddCheckpointSheet
        {...makeProps({ selectedCoordinate: { lat: 0, lon: 0, source: "right_click" } })}
      />,
    );
    expect(titleInput).toHaveValue("");
  });

  it("populates fields from prefill when coordinate is selected", () => {
    const prefill = { title: "Prefilled title", note: "Prefilled note", locationLabel: "Prefilled place" };
    render(<AddCheckpointSheet {...makeProps({ prefill })} />);
    expect(screen.getByRole("textbox", { name: /Title/i })).toHaveValue("Prefilled title");
    expect(screen.getByPlaceholderText("e.g. Capitol Hill")).toHaveValue("Prefilled place");
  });

  it("falls back to empty string for fields not included in prefill", () => {
    const prefill = { title: "Only title" };
    render(<AddCheckpointSheet {...makeProps({ prefill })} />);
    expect(screen.getByRole("textbox", { name: /Title/i })).toHaveValue("Only title");
    expect(screen.getByPlaceholderText("e.g. Capitol Hill")).toHaveValue("");
  });

  it("calls onCheckpointCreated with the saved id after a successful save", async () => {
    const onCheckpointCreated = vi.fn();
    const onSave = vi.fn().mockResolvedValue("cp-abc123");
    const user = userEvent.setup();
    render(<AddCheckpointSheet {...makeProps({ onSave, onCheckpointCreated })} />);

    await user.click(screen.getByRole("button", { name: "Save pin" }));

    await waitFor(() => {
      expect(onCheckpointCreated).toHaveBeenCalledWith("cp-abc123", undefined);
    });
  });

  it("initializes Happened at input from prefill and submits it as happenedAt", async () => {
    // Construct in local time so the datetime-local string is timezone-agnostic:
    // toLocalDatetimeInputValue reads getFullYear()/getMonth()/etc. (local-time
    // accessors), and the input round-trips through the same constructor.
    const happenedAt = new Date(2026, 4, 20, 10, 30).getTime();
    const prefill = { happenedAt };
    const onSave = vi.fn().mockResolvedValue("id");
    const user = userEvent.setup();

    render(<AddCheckpointSheet {...makeProps({ prefill, onSave })} />);

    const input = screen.getByLabelText(/Happened at/i) as HTMLInputElement;
    expect(input.value).toBe("2026-05-20T10:30");

    await user.click(screen.getByRole("button", { name: "Save pin" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          happenedAt,
        }),
      );
    });
  });

  it("does not call onCheckpointCreated when onSave throws", async () => {
    const onCheckpointCreated = vi.fn();
    const onSave = vi.fn().mockRejectedValue(new Error("Save failed"));
    const user = userEvent.setup();
    render(<AddCheckpointSheet {...makeProps({ onSave, onCheckpointCreated })} />);

    await user.click(screen.getByRole("button", { name: "Save pin" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(onCheckpointCreated).not.toHaveBeenCalled();
  });
});
