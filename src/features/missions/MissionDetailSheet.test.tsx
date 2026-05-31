import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as convexReact from "convex/react";

import type { Mission } from "../../convex/tripcastApi";
import { tripcastApi } from "../../convex/tripcastApi";
import { getActiveUiContext, resetActiveUiContextForTests } from "../../debug/activeUiContext";
import MissionDetailSheet from "./MissionDetailSheet";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("../travelfunds/LinkedTransactionsSection", () => ({
  default: () => <div data-testid="linked-transactions-mock" />,
}));

const Mission: Mission = {
  _id: "Mission-1",
  title: "Mission",
  status: "in_progress",
  source: "traveler",
  createdAt: 1,
  updatedAt: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  resetActiveUiContextForTests();
  vi.mocked(convexReact.useQuery).mockReturnValue(undefined as any);
  vi.mocked(convexReact.useMutation).mockReturnValue(vi.fn().mockResolvedValue(null) as any);
});

describe("MissionDetailSheet — Mark In Progress button", () => {
  it.each(["proposed", "visible", "planned"] as const)(
    'shows "Mark In Progress" for %s missions (traveler)',
    (status) => {
      const ch: Mission = { _id: "ch-1", title: "Mission", status, source: "follower", createdAt: 1, updatedAt: 1 };
      render(<MissionDetailSheet Mission={ch} token="t" role="traveler" onClose={vi.fn()} />);
      expect(screen.getByRole("button", { name: /Mark.*In Progress/i })).toBeInTheDocument();
    },
  );

  it("shows amber conflict prompt when another mission is already in progress", async () => {
    const user = userEvent.setup();
    const ch: Mission = { _id: "ch-1", title: "Mission", status: "proposed", source: "follower", createdAt: 1, updatedAt: 1 };
    const other: Mission = { _id: "ch-2", title: "Blocking Mission", status: "in_progress", source: "traveler", createdAt: 1, updatedAt: 1 };
    (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown, args: unknown) => {
      if (args === "skip") return undefined;
      if (ref === tripcastApi.missions.travelerListMissions) return [other];
      return undefined;
    });
    render(<MissionDetailSheet Mission={ch} token="t" role="traveler" onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Mark.*In Progress/i }));
    expect(screen.getByText(/Blocking Mission/)).toBeInTheDocument();
  });
});

describe("MissionDetailSheet — Set Current Activity button", () => {
  const ch: Mission = { _id: "ch-1", title: "Active Mission", status: "in_progress", source: "traveler", createdAt: 1, updatedAt: 1 };

  it("shows button when current activity is not linked to this mission", () => {
    (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown, args: unknown) => {
      if (args === "skip") return undefined;
      if (ref === tripcastApi.currentActivity.travelerGetCurrentActivity) return { linkedMissionId: "other-ch" };
      return undefined;
    });
    render(<MissionDetailSheet Mission={ch} token="t" role="traveler" onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Set Current Activity to This Mission" })).toBeInTheDocument();
  });

  it("hides button when current activity is already linked to this mission", () => {
    (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown, args: unknown) => {
      if (args === "skip") return undefined;
      if (ref === tripcastApi.currentActivity.travelerGetCurrentActivity) return { linkedMissionId: "ch-1" };
      return undefined;
    });
    render(<MissionDetailSheet Mission={ch} token="t" role="traveler" onClose={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Set Current Activity to This Mission" })).not.toBeInTheDocument();
  });
});

describe("MissionDetailSheet — attribution & Award Badge placement", () => {
  const completed: Mission = {
    _id: "ch-9",
    title: "Done Mission",
    status: "completed",
    source: "traveler",
    createdAt: 1,
    updatedAt: 1,
  };

  it("read-only view shows no Award Badge button and no Edit-credits control", () => {
    render(<MissionDetailSheet Mission={completed} token="t" role="traveler" onClose={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Award Badge/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit credits" })).not.toBeInTheDocument();
  });

  it("edit mode exposes the Award Badge action for a completed mission", async () => {
    const user = userEvent.setup();
    render(<MissionDetailSheet Mission={completed} token="t" role="traveler" onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("button", { name: /Award Badge/ })).toBeInTheDocument();
  });

  it("edit mode hides the Award Badge action for a non-completed mission", async () => {
    const user = userEvent.setup();
    const planned: Mission = { ...completed, _id: "ch-10", status: "planned" };
    render(<MissionDetailSheet Mission={planned} token="t" role="traveler" onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.queryByRole("button", { name: /Award Badge/ })).not.toBeInTheDocument();
  });
});

describe("MissionDetailSheet — active UI context", () => {
  const completed: Mission = {
    _id: "ch-ctx",
    title: "Context Mission",
    status: "completed",
    source: "traveler",
    createdAt: 1,
    updatedAt: 1,
  };

  it("registers a MissionDetailSheet context with view 'detail' when shown", () => {
    render(<MissionDetailSheet Mission={completed} token="t" role="traveler" onClose={vi.fn()} />);
    const ctx = getActiveUiContext();
    expect(ctx?.sheetName).toBe("MissionDetailSheet");
    expect(ctx?.view).toBe("detail");
  });

  it("flips the context view to 'edit' when entering edit mode", async () => {
    const user = userEvent.setup();
    render(<MissionDetailSheet Mission={completed} token="t" role="traveler" onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(getActiveUiContext()?.view).toBe("edit");
  });
});

describe("MissionDetailSheet", () => {
  it("invokes Complete as Story with the mission only (transactions are managed separately)", async () => {
    const onCompleteAsStory = vi.fn();

    render(
      <MissionDetailSheet
        Mission={Mission}
        token="token"
        role="traveler"
        onClose={vi.fn()}
        onCompleteAsStory={onCompleteAsStory}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Complete as story" }));

    expect(onCompleteAsStory).toHaveBeenCalledWith(Mission);
  });
});

describe("MissionDetailSheet — sectioned redesign", () => {
  it("organizes the detail into Next steps and About sections", () => {
    const ch: Mission = { _id: "ch-s", title: "M", status: "visible", source: "traveler", createdAt: 1, updatedAt: 1 };
    render(<MissionDetailSheet Mission={ch} token="t" role="traveler" onClose={vi.fn()} />);
    expect(screen.getByText("Next steps")).toBeInTheDocument();
    expect(screen.getByText("About")).toBeInTheDocument();
  });

  it("shows a Linked section only when a source vote is present", () => {
    const plain: Mission = { _id: "ch-a", title: "M", status: "visible", source: "traveler", createdAt: 1, updatedAt: 1 };
    const { rerender } = render(<MissionDetailSheet Mission={plain} token="t" role="traveler" onClose={vi.fn()} />);
    expect(screen.queryByText("Linked")).not.toBeInTheDocument();

    const fromVote: Mission = { ...plain, _id: "ch-b", sourceRouteVoteId: "vote-1" };
    rerender(<MissionDetailSheet Mission={fromVote} token="t" role="traveler" onClose={vi.fn()} />);
    expect(screen.getByText("Linked")).toBeInTheDocument();
  });

  it("keeps lifecycle status out of Edit mode (no status selector while editing)", async () => {
    const user = userEvent.setup();
    const ch: Mission = { _id: "ch-e", title: "M", status: "visible", source: "traveler", createdAt: 1, updatedAt: 1 };
    render(<MissionDetailSheet Mission={ch} token="t" role="traveler" onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("applies a manual status override through the lifecycle area", async () => {
    const user = userEvent.setup();
    const mutate = vi.fn().mockResolvedValue(null);
    vi.mocked(convexReact.useMutation).mockReturnValue(mutate as any);
    const ch: Mission = { _id: "ch-x", title: "M", status: "in_progress", source: "traveler", createdAt: 1, updatedAt: 1 };
    render(<MissionDetailSheet Mission={ch} token="t" role="traveler" onClose={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Change status manually" }));
    await user.selectOptions(screen.getByRole("combobox"), "completed");
    await user.click(screen.getByRole("button", { name: /Apply status/ }));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ missionId: "ch-x", newStatus: "completed" }),
    );
  });
});

describe("MissionDetailSheet — Delete on terminal statuses", () => {
  it.each(["completed", "dropped"] as const)(
    'exposes "Delete mission" for %s missions (traveler)',
    (status) => {
      const ch: Mission = { _id: `ch-${status}`, title: "M", status, source: "traveler", createdAt: 1, updatedAt: 1 };
      render(<MissionDetailSheet Mission={ch} token="t" role="traveler" onClose={vi.fn()} />);
      expect(screen.getByRole("button", { name: "Delete mission" })).toBeInTheDocument();
    },
  );

  it("does not expose 'Delete mission' to followers on terminal statuses", () => {
    const ch: Mission = { _id: "ch-fo", title: "M", status: "completed", source: "follower", createdAt: 1, updatedAt: 1 };
    render(<MissionDetailSheet Mission={ch} token="t" role="follower" onClose={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Delete mission" })).not.toBeInTheDocument();
  });

  it("opens the inline confirm panel when Delete mission is clicked on a completed mission", async () => {
    const user = userEvent.setup();
    const ch: Mission = { _id: "ch-del", title: "M", status: "completed", source: "traveler", createdAt: 1, updatedAt: 1 };
    render(<MissionDetailSheet Mission={ch} token="t" role="traveler" onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Delete mission" }));
    expect(screen.getByRole("button", { name: /Yes, delete/ })).toBeInTheDocument();
  });
});

describe("MissionDetailSheet — Mystery treatment", () => {
  const mysteryMissionRecord = {
    _id: "mm-1",
    mysteryMissionId: "kyoto-fushimi-001",
    state: "signal",
    mysteryText: "ReD PAth",
    region: "Kyoto",
  };

  function mockMystery(record: typeof mysteryMissionRecord | (typeof mysteryMissionRecord & { trueIntent: string; locationName: string; state: "revealed" })) {
    (vi.mocked(convexReact.useQuery) as any).mockImplementation((ref: unknown, args: unknown) => {
      if (args === "skip") return undefined;
      if (ref === tripcastApi.mysteryMissions.getMysteryMission) return record;
      return undefined;
    });
  }

  it("renders the RadioTower chip with 'Unknown Signal' for a visible mystery", () => {
    mockMystery(mysteryMissionRecord);
    const ch: Mission = { _id: "ch-m1", title: "ReD PAth", status: "visible", source: "mystery", sourceMysteryMissionId: "mm-1", createdAt: 1, updatedAt: 1 };
    const { container } = render(<MissionDetailSheet Mission={ch} token="t" role="traveler" onClose={vi.fn()} />);
    expect(screen.getByText("Unknown Signal")).toBeInTheDocument();
    expect(container.querySelector(".mystery-theme")).not.toBeNull();
  });

  it("labels the chip 'Active' while in progress and 'Revealed' once completed", () => {
    mockMystery(mysteryMissionRecord);
    const active: Mission = { _id: "ch-m2", title: "ReD PAth", status: "in_progress", source: "mystery", sourceMysteryMissionId: "mm-1", createdAt: 1, updatedAt: 1 };
    const { rerender } = render(<MissionDetailSheet Mission={active} token="t" role="traveler" onClose={vi.fn()} />);
    expect(screen.getByText("Active")).toBeInTheDocument();

    mockMystery({ ...mysteryMissionRecord, state: "revealed", trueIntent: "Fushimi Inari", locationName: "Fushimi Inari Taisha" });
    const done: Mission = { ...active, _id: "ch-m3", status: "completed" };
    rerender(<MissionDetailSheet Mission={done} token="t" role="traveler" onClose={vi.fn()} />);
    expect(screen.getByText("Revealed")).toBeInTheDocument();
    expect(screen.getByText("True Intent Revealed")).toBeInTheDocument();
    expect(screen.getByText("Fushimi Inari")).toBeInTheDocument();
  });

  it("labels the chip 'Dismissed' for a dropped mystery", () => {
    mockMystery(mysteryMissionRecord);
    const ch: Mission = { _id: "ch-m4", title: "ReD PAth", status: "dropped", source: "mystery", sourceMysteryMissionId: "mm-1", createdAt: 1, updatedAt: 1 };
    render(<MissionDetailSheet Mission={ch} token="t" role="traveler" onClose={vi.fn()} />);
    expect(screen.getByText("Dismissed")).toBeInTheDocument();
  });
});
