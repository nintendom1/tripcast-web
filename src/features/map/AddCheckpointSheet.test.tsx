import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AddCheckpointSheet from "./AddCheckpointSheet";
import type { SelectedCoordinate } from "./AddCheckpointSheet";
import ExifReader from "exifreader";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("exifreader", () => ({
  default: {
    load: vi.fn(),
  },
}));

const COORD: SelectedCoordinate = { lat: 47.6097, lon: -122.3422, source: "tap_add_mode" };

function makeProps(overrides: Partial<Parameters<typeof AddCheckpointSheet>[0]> = {}) {
  return {
    selectedCoordinate: COORD,
    onSave: vi.fn(),
    onClose: vi.fn(),
    onUploadImage: vi.fn(), // Keep photo section visible
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
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<AddCheckpointSheet {...makeProps({ onSave })} />);

    await user.type(screen.getByRole("textbox", { name: /Title/i }), "Capitol Hill");
    await user.type(screen.getByPlaceholderText("e.g. Capitol Hill"), "Capitol Hill");
    await user.type(screen.getByRole("textbox", { name: /Story/i }), "Great view");

    await user.click(screen.getByRole("button", { name: "Save pin" }));

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
      undefined
    );
  });

  it("passes title as undefined when left blank", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<AddCheckpointSheet {...makeProps({ onSave })} />);

    await user.click(screen.getByRole("button", { name: "Save pin" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ title: undefined }), undefined);
  });

  it("passes locationLabel and note as undefined when blank", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<AddCheckpointSheet {...makeProps({ onSave })} />);

    await user.click(screen.getByRole("button", { name: "Save pin" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ locationLabel: undefined, note: undefined }),
      undefined
    );
  });

  it("passes showInStory: false when unchecked", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<AddCheckpointSheet {...makeProps({ onSave })} />);

    await user.click(screen.getByLabelText(/Add to Story/));
    await user.click(screen.getByRole("button", { name: "Save pin" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ showInStory: false }), undefined);
  });

  it("passes the raw photo file to onSave on submit", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<AddCheckpointSheet {...makeProps({ onSave })} />);

    const file = new File(["image-bytes"], "story.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("Add photo"), file);
    await user.click(screen.getByRole("button", { name: "Save pin" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.any(Object),
      file
    );
  });

  it("passes the selected photo display size on submit", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<AddCheckpointSheet {...makeProps({ onSave })} />);

    await user.click(screen.getByRole("button", { name: /large/i }));
    await user.click(screen.getByRole("button", { name: "Save pin" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ imageSize: "large" }), undefined);
  });

  it("calls onClose after save button clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<AddCheckpointSheet {...makeProps({ onClose })} />);

    await user.click(screen.getByRole("button", { name: "Save pin" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(<AddCheckpointSheet {...makeProps({ onClose })} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
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

  it("initializes Happened at input from prefill and submits it as happenedAt", async () => {
    // Construct in local time so the datetime-local string is timezone-agnostic:
    // toLocalDatetimeInputValue reads getFullYear()/getMonth()/etc. (local-time
    // accessors), and the input round-trips through the same constructor.
    const happenedAt = new Date(2026, 4, 20, 10, 30).getTime();
    const prefill = { happenedAt };
    const onSave = vi.fn();
    const user = userEvent.setup();

    render(<AddCheckpointSheet {...makeProps({ prefill, onSave })} />);

    const input = screen.getByLabelText(/Happened at/i) as HTMLInputElement;
    expect(input.value).toBe("2026-05-20T10:30");

    await user.click(screen.getByRole("button", { name: "Save pin" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ happenedAt }),
        undefined,
      );
    });
  });

  it("shows 'Use date/time' and 'Use GPS' buttons when photo is uploaded", async () => {
    const user = userEvent.setup();
    render(<AddCheckpointSheet {...makeProps()} />);

    const file = new File(["image-bytes"], "story.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("Add photo"), file);

    expect(screen.getByRole("button", { name: /Use date\/time/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Use GPS/i })).toBeInTheDocument();
  });

  it("applies date metadata after confirmation", async () => {
    const user = userEvent.setup();
    vi.mocked(ExifReader.load).mockResolvedValue({
      exif: { DateTimeOriginal: { description: "2026:01:01 12:00:00" } },
    } as any);

    render(<AddCheckpointSheet {...makeProps()} />);

    const file = new File(["image-bytes"], "story.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("Add photo"), file);

    const useDateBtn = await screen.findByRole("button", { name: /Use date\/time/i });
    await user.click(useDateBtn);

    // Confirmation modal should appear
    expect(screen.getByText(/Update date\/time\?/i)).toBeInTheDocument();
    expect(screen.getByText("2026-01-01T12:00")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Update" }));

    const input = screen.getByLabelText(/Happened at/i) as HTMLInputElement;
    expect(input.value).toBe("2026-01-01T12:00");
  });

  it("calls onCoordinateChange and updates UI when GPS metadata is applied", async () => {
    const user = userEvent.setup();
    const onCoordinateChange = vi.fn();
    vi.mocked(ExifReader.load).mockResolvedValue({
      gps: { Latitude: 10.5, Longitude: 20.5 },
    } as any);

    render(<AddCheckpointSheet {...makeProps({ onCoordinateChange })} />);

    const file = new File(["image-bytes"], "story.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("Add photo"), file);

    const useGpsBtn = await screen.findByRole("button", { name: /Use GPS/i });
    await user.click(useGpsBtn);

    expect(screen.getByText(/Update location\?/i)).toBeInTheDocument();
    expect(screen.getByText(/10.500000/)).toBeInTheDocument();
    expect(screen.getByText(/20.500000/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Update" }));

    expect(onCoordinateChange).toHaveBeenCalledWith(10.5, 20.5);
  });

  it("preserves the hemisphere for southern/western GPS metadata", async () => {
    const user = userEvent.setup();
    const onCoordinateChange = vi.fn();
    // Expanded mode supplies signed values, so a Sydney photo must stay negative
    // for latitude (south) — the previous .description parsing dropped the sign.
    vi.mocked(ExifReader.load).mockResolvedValue({
      gps: { Latitude: -33.8688, Longitude: 151.2093 },
    } as any);

    render(<AddCheckpointSheet {...makeProps({ onCoordinateChange })} />);

    const file = new File(["image-bytes"], "story.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("Add photo"), file);

    await user.click(await screen.findByRole("button", { name: /Use GPS/i }));
    await user.click(screen.getByRole("button", { name: "Update" }));

    expect(onCoordinateChange).toHaveBeenCalledWith(-33.8688, 151.2093);
  });

  it("applies GPS metadata that sits exactly on the equator", async () => {
    const user = userEvent.setup();
    const onCoordinateChange = vi.fn();
    // Zero is a valid coordinate; truthiness guards used to reject it.
    vi.mocked(ExifReader.load).mockResolvedValue({
      gps: { Latitude: 0, Longitude: 0 },
    } as any);

    render(<AddCheckpointSheet {...makeProps({ onCoordinateChange })} />);

    const file = new File(["image-bytes"], "story.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("Add photo"), file);

    const useGpsBtn = await screen.findByRole("button", { name: /Use GPS/i });
    expect(useGpsBtn).toBeEnabled();
    await user.click(useGpsBtn);
    await user.click(screen.getByRole("button", { name: "Update" }));

    expect(onCoordinateChange).toHaveBeenCalledWith(0, 0);
  });
});
