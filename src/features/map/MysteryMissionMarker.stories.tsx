import type { Meta, StoryObj } from "@storybook/react-vite";

function MarkerPreview({ revealed = false }: { revealed?: boolean }) {
  return (
    <div className="grid min-h-40 place-items-center bg-[var(--bg-paper)]">
      <button
        type="button"
        className={revealed ? "mystery-pin mystery-pin--revealed" : "mystery-pin mystery-pin--signal"}
        aria-label={revealed ? "Revealed Mystery Mission" : "Mystery Mission signal"}
      >
        <span className="mystery-pin__drop" />
        {!revealed ? (
          <>
            <span className="mystery-pin__fizzle mystery-pin__fizzle--1" />
            <span className="mystery-pin__fizzle mystery-pin__fizzle--2" />
            <span className="mystery-pin__fizzle mystery-pin__fizzle--3" />
            <span className="mystery-pin__fizzle mystery-pin__fizzle--4" />
            <span className="mystery-pin__fizzle mystery-pin__fizzle--5" />
          </>
        ) : null}
      </button>
    </div>
  );
}

const meta = {
  title: "Map/MysteryMissionMarker",
  component: MarkerPreview,
  args: { revealed: false },
} satisfies Meta<typeof MarkerPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Signal: Story = {};

export const Revealed: Story = {
  args: { revealed: true },
};
