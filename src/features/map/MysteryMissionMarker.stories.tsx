import type { Meta, StoryObj } from "@storybook/react-vite";

function MarkerPreview({ revealed = false }: { revealed?: boolean }) {
  const color = revealed ? "#3f3f46" : "#18181b";

  return (
    <div className="grid min-h-40 place-items-center bg-[var(--bg-paper)]">
      <div
        className={revealed ? "mystery-pin mystery-pin--revealed" : "mystery-pin mystery-pin--signal"}
        aria-label={revealed ? "Revealed Mystery Mission" : "Mystery Mission signal"}
        role="button"
        tabIndex={0}
        style={{ position: "relative", width: 27, height: 41 }}
      >
        <svg width="27" height="41" viewBox="0 0 27 41" aria-hidden="true">
          <path
            fill={color}
            d="M13.5 0C6.04 0 0 6.04 0 13.5c0 10.13 13.5 27.5 13.5 27.5S27 23.63 27 13.5C27 6.04 20.96 0 13.5 0Z"
          />
          <circle cx="13.5" cy="13.5" r="5.8" fill="rgba(255,255,255,0.24)" />
        </svg>
        {!revealed ? (
          <>
            <span className="mystery-pin__fizzle mystery-pin__fizzle--1" />
            <span className="mystery-pin__fizzle mystery-pin__fizzle--2" />
            <span className="mystery-pin__fizzle mystery-pin__fizzle--3" />
            <span className="mystery-pin__fizzle mystery-pin__fizzle--4" />
            <span className="mystery-pin__fizzle mystery-pin__fizzle--5" />
          </>
        ) : null}
      </div>
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
